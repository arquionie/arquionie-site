// Arquionie™ — a ficha da licença de um computador conectado pelo navegador (plano 17 do repositório do plugin;
// migração 20261005010000_licencas_e_conexao_pelo_navegador.sql).
//
//   POST { acao: "renovar", credencial, maquina, versao }   -> { situacao: "ok", ficha, assinatura } | { situacao: "desconectado" }
//   POST { acao: "testes", credencial }                     -> { situacao: "ok", limite, usados: { ferramenta: n } }
//   POST { acao: "usar_teste", credencial, ferramenta }     -> { situacao: "ok", permitido, usados, limite } (ou ilimitado)
//   POST { acao: "sair", credencial }                       -> { situacao: "ok" }
//
// "desconectado" quer dizer que a credencial não vale mais (o computador saiu em MINHA CONTA, no /gestao ou no SAIR):
// o programa apaga a credencial e volta a pedir ENTRAR. A ficha vale até "valeAte" sem internet (30 dias, decisão 3).
// Publicar com --no-verify-jwt. Segredos: LICENCA_CHAVE_PRIVADA e, opcional, LICENCA_CHAVE_ID.
// Erro do servidor volta em TEXTO com 500: o programa mantém a ficha que já tem (nunca trata como "desconectado").

import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

function base64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

async function resumo(texto: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  return Array.from(h, (x) => x.toString(16).padStart(2, "0")).join("");
}

// ── A ficha assinada (o mesmo código da função conectar) ──
let chave: CryptoKey | null = null;

async function chavePrivada(): Promise<CryptoKey> {
  if (chave) return chave;
  const b64 = Deno.env.get("LICENCA_CHAVE_PRIVADA");
  if (!b64) throw new Error("LICENCA_CHAVE_PRIVADA não configurada");
  const der = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  chave = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return chave;
}

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

  const credencial = String(corpo.credencial ?? "");
  if (credencial.length < 20) return responder({ erro: "credencial inválida" }, 400);

  try {
    const credencialHash = await resumo(credencial);

    if (corpo.acao === "renovar") {
      const { data, error } = await db.rpc("licenca_estado", {
        p_credencial_hash: credencialHash,
        p_maquina: String(corpo.maquina ?? "").trim(),
        p_versao: String(corpo.versao ?? "").slice(0, 40),
      });
      if (error) throw error;
      if (data?.situacao !== "ok") return responder({ situacao: "desconectado" });
      return responder({ situacao: "ok", ...(await fichaAssinada(data)) });
    }

    if (corpo.acao === "testes") {
      const { data, error } = await db.rpc("licenca_testes", { p_credencial_hash: credencialHash });
      if (error) throw error;
      return responder(data);
    }

    if (corpo.acao === "usar_teste") {
      const ferramenta = String(corpo.ferramenta ?? "").trim();
      if (ferramenta === "") return responder({ erro: "sem ferramenta" }, 400);
      const { data, error } = await db.rpc("licenca_usar_teste", {
        p_credencial_hash: credencialHash,
        p_ferramenta: ferramenta,
      });
      if (error) throw error;
      return responder(data);
    }

    if (corpo.acao === "sair") {
      const { data, error } = await db.rpc("licenca_sair", { p_credencial_hash: credencialHash });
      if (error) throw error;
      return responder(data);
    }

    return responder({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    console.error("licenca:", e);
    return new Response("erro no servidor", { status: 500 });
  }
}

Deno.serve(tratar);
