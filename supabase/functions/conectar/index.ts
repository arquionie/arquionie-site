// Arquionie™ — conectar um computador à conta pelo navegador, como o "gh auth login" (plano 17 do repositório do
// plugin, docs/migracao-arkiton/17; migração 20261005010000_licencas_e_conexao_pelo_navegador.sql).
//
//   POST { acao: "iniciar", produto, maquina, nome, versao }
//     -> { situacao: "ok", codigo, segredo, link, intervalo, expiraEm }
//        O programa mostra o código e abre o link; o segredo fica só com ele (aqui guardamos o resumo SHA-256).
//   POST { acao: "consultar", segredo }
//     -> { situacao: "aguardando" | "vencida" | "cancelada" | "inexistente" | "limite" }
//     -> { situacao: "autorizada", credencial, ficha, assinatura }
//        A credencial é deste computador (o programa a guarda cifrada pelo Windows); a ficha é a licença assinada.
//
// Publicar com --no-verify-jwt: quem chama é o programa, ainda sem conta. Segredos: LICENCA_CHAVE_PRIVADA (PKCS#8 em
// base64, gerada por supabase/ferramentas/gerar-chave-da-licenca.mjs) e, opcional, LICENCA_CHAVE_ID e SITE_URL.
// Erro do servidor volta em TEXTO com 500: o programa trata como falha de rede e tenta de novo (nunca como "recusado").

import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = Deno.env.get("SITE_URL") ?? "https://www.arquionie.com.br";
const PRODUTOS = new Set(["arquionie", "arquionie-revit"]);
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 sinais, sem 0/O nem 1/I

const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

function aleatorio(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function base64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

function base64url(b: Uint8Array): string {
  return base64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function resumo(texto: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  return Array.from(h, (x) => x.toString(16).padStart(2, "0")).join("");
}

function codigoCurto(): string {
  let s = "";
  for (const x of aleatorio(8)) s += ALFABETO[x % 32];
  return s.slice(0, 4) + "-" + s.slice(4);
}

// ── A ficha assinada (o mesmo código da função licenca) ──
let chave: CryptoKey | null = null;

async function chavePrivada(): Promise<CryptoKey> {
  if (chave) return chave;
  const b64 = Deno.env.get("LICENCA_CHAVE_PRIVADA");
  if (!b64) throw new Error("LICENCA_CHAVE_PRIVADA não configurada");
  const der = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  chave = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return chave;
}

// A assinatura é ECDSA P-256 com SHA-256 sobre os bytes UTF-8 da ficha, no formato r||s (64 bytes), em base64 —
// o padrão do ECDsa.VerifyData do .NET.
async function fichaAssinada(estado: Record<string, unknown>): Promise<{ ficha: string; assinatura: string }> {
  const { situacao: _situacao, ...resto } = estado;
  const ficha = JSON.stringify({ versao: 1, chave: Deno.env.get("LICENCA_CHAVE_ID") ?? "1", ...resto });
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await chavePrivada(),
    new TextEncoder().encode(ficha));
  return { ficha, assinatura: base64(new Uint8Array(sig)) };
}

export async function tratar(req: Request): Promise<Response> {
  if (req.method !== "POST") return responder({ erro: "use POST" }, 405);
  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return responder({ erro: "JSON inválido" }, 400);
  }

  try {
    if (corpo.acao === "iniciar") {
      const produto = String(corpo.produto ?? "");
      const maquina = String(corpo.maquina ?? "").trim();
      if (!PRODUTOS.has(produto) || maquina === "" || maquina.length > 200) {
        return responder({ erro: "produto ou máquina inválidos" }, 400);
      }
      const segredo = base64url(aleatorio(32));
      const segredoHash = await resumo(segredo);
      for (let tentativa = 0; tentativa < 5; tentativa++) {
        const codigo = codigoCurto();
        const { data, error } = await db.rpc("conexao_iniciar", {
          p_codigo: codigo,
          p_segredo_hash: segredoHash,
          p_produto: produto,
          p_maquina: maquina,
          p_nome: String(corpo.nome ?? "").slice(0, 120),
          p_versao: String(corpo.versao ?? "").slice(0, 40),
        });
        if (!error) {
          return responder({
            situacao: "ok",
            codigo,
            segredo,
            link: `${SITE}/conectar?codigo=${codigo}`,
            intervalo: 3,
            expiraEm: data?.expiraEm,
          });
        }
        if (error.code !== "23505") throw error; // código repetido: sorteia outro
      }
      throw new Error("não deu para sortear um código livre");
    }

    if (corpo.acao === "consultar") {
      const segredo = String(corpo.segredo ?? "");
      if (segredo.length < 20) return responder({ erro: "segredo inválido" }, 400);
      const credencial = base64url(aleatorio(32));
      const credencialHash = await resumo(credencial);
      const { data, error } = await db.rpc("conexao_concluir", {
        p_segredo_hash: await resumo(segredo),
        p_credencial_hash: credencialHash,
      });
      if (error) throw error;
      if (data?.situacao !== "autorizada") return responder(data);
      const { data: estado, error: erroEstado } = await db.rpc("licenca_estado", {
        p_credencial_hash: credencialHash,
        p_maquina: data.maquina,
        p_versao: data.versao ?? "",
      });
      if (erroEstado) throw erroEstado;
      return responder({ situacao: "autorizada", credencial, ...(await fichaAssinada(estado)) });
    }

    return responder({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    console.error("conectar:", e);
    return new Response("erro no servidor", { status: 500 });
  }
}

Deno.serve(tratar);
