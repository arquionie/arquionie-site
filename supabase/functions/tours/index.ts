// Arquionie™ — os tours no link (mockup docs/mockups/tour-no-link.html do repositório do programa, aprovado por ÊDI em
// 10/10/2026; migração 20261010000000_tours.sql). Quem chama tem conta: o programa, com a sessão da conta, e o site.
//
//   POST { acao: "enviar", chave, nome, passeio, arquivos: [{ caminho, tamanho }] }
//     -> { ok: true, id, codigo, versao, link, envios: [{ caminho, url }] }      (as URLs valem 1 hora, para PUT)
//     -> { ok: false, motivo: "plano" | "limite", texto }
//        O programa sobe cada arquivo pela URL dele e depois conclui. O mesmo passeio (a chave) troca o conteúdo no
//        mesmo link.
//   POST { acao: "concluir", id, versao, paradas }
//     -> { ok: true, codigo, link, situacao }   (confere no R2 que o tour.json subiu e apaga as versões anteriores)
//   POST { acao: "excluir", id }
//     -> { ok: true }                            (apaga os arquivos do tour no R2 e o tour da conta)
//
// Publicar com a verificação de JWT ligada. Segredos: R2_CONTA, R2_CHAVE e R2_SEGREDO (um token do R2 com leitura e
// escrita só no bucket arquionie-tours, o dos tours, separado do dos downloads do programa) e, opcional, R2_BUCKET e SITE_URL. A assinatura dos pedidos ao R2 (a AWS
// Signature V4 que o R2 entende) é feita aqui, sem biblioteca.

import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = Deno.env.get("SITE_URL") ?? "https://www.arquionie.com.br";
const BUCKET = Deno.env.get("R2_BUCKET") ?? "arquionie-tours";
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 sinais, sem 0/O nem 1/I
const MINUSCULAS = "abcdefghijklmnopqrstuvwxyz0123456789";
const LIMITE_ARQUIVOS = 200, LIMITE_TAMANHO = 400 * 1024 * 1024;

const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

function sorteio(alfabeto: string, n: number): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => alfabeto[x % alfabeto.length]).join("");
}

// ── A assinatura dos pedidos ao R2 (AWS Signature V4, região "auto", serviço "s3") ──
const texto = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const resumo = async (s: string) => hex(await crypto.subtle.digest("SHA-256", texto.encode(s)));
async function hmac(chave: ArrayBuffer | Uint8Array, s: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, texto.encode(s));
}
// RFC 3986: o encodeURIComponent deixa ! ' ( ) * sem codificar, e a assinatura pede codificados.
const codificar = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const caminhoDoObjeto = (chave: string) => `/${BUCKET}/` + chave.split("/").map(codificar).join("/");

function r2() {
  const conta = Deno.env.get("R2_CONTA"), id = Deno.env.get("R2_CHAVE"), segredo = Deno.env.get("R2_SEGREDO");
  if (!conta || !id || !segredo) throw new Error("faltam R2_CONTA, R2_CHAVE e R2_SEGREDO");
  return { servidor: `${conta}.r2.cloudflarestorage.com`, id, segredo };
}

const carimbo = (quando: Date) => quando.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""); // 20261010T031500Z
const consultaCanonica = (consulta: Record<string, string>) =>
  Object.keys(consulta).sort().map((k) => `${codificar(k)}=${codificar(consulta[k])}`).join("&");

/**
 * A assinatura de um pedido: os cabeçalhos dados (em minúsculas) são os assinados. A região é a do R2 ("auto"); o teste usa
 * os exemplos da documentação da AWS, de us-east-1.
 */
export async function assinar(metodo: string, caminho: string, consulta: Record<string, string>, cabecalhos: Record<string, string>,
  corpoResumo: string, dataHora: string, regiao = "auto"): Promise<{ assinatura: string; escopo: string; assinados: string }> {
  const segredo = Deno.env.get("R2_SEGREDO") ?? "";
  const dia = dataHora.slice(0, 8), escopo = `${dia}/${regiao}/s3/aws4_request`;
  const nomes = Object.keys(cabecalhos).sort();
  const canonico = [metodo, caminho, consultaCanonica(consulta), nomes.map((h) => `${h}:${cabecalhos[h].trim()}\n`).join(""),
    nomes.join(";"), corpoResumo].join("\n");
  const paraAssinar = ["AWS4-HMAC-SHA256", dataHora, escopo, await resumo(canonico)].join("\n");
  let k = await hmac(texto.encode("AWS4" + segredo), dia);
  for (const parte of [regiao, "s3", "aws4_request"]) k = await hmac(k, parte);
  return { assinatura: hex(await hmac(k, paraAssinar)), escopo, assinados: nomes.join(";") };
}

/** A URL para o programa subir um objeto com PUT, valendo uma hora. */
async function urlDeEnvio(chave: string, quando = new Date()): Promise<string> {
  const { servidor, id } = r2();
  const caminho = caminhoDoObjeto(chave), dataHora = carimbo(quando);
  const consulta: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${id}/${dataHora.slice(0, 8)}/auto/s3/aws4_request`,
    "X-Amz-Date": dataHora,
    "X-Amz-Expires": "3600",
    "X-Amz-SignedHeaders": "host",
  };
  const { assinatura } = await assinar("PUT", caminho, consulta, { host: servidor }, "UNSIGNED-PAYLOAD", dataHora);
  return `https://${servidor}${caminho}?${consultaCanonica(consulta)}&X-Amz-Signature=${assinatura}`;
}

/** Um pedido assinado ao R2 (listar, apagar), sem corpo. */
async function pedir(metodo: string, chave: string | null, consulta: Record<string, string> = {}): Promise<Response> {
  const { servidor, id } = r2();
  const caminho = chave === null ? `/${BUCKET}` : caminhoDoObjeto(chave);
  const corpoResumo = await resumo(""), dataHora = carimbo(new Date());
  const cabecalhos = { host: servidor, "x-amz-content-sha256": corpoResumo, "x-amz-date": dataHora };
  const { assinatura, escopo, assinados } = await assinar(metodo, caminho, consulta, cabecalhos, corpoResumo, dataHora);
  const q = consultaCanonica(consulta);
  return fetch(`https://${servidor}${caminho}${q ? "?" + q : ""}`, {
    method: metodo,
    headers: {
      "x-amz-content-sha256": corpoResumo,
      "x-amz-date": dataHora,
      Authorization: `AWS4-HMAC-SHA256 Credential=${id}/${escopo}, SignedHeaders=${assinados}, Signature=${assinatura}`,
    },
  });
}

/** Os objetos do R2 debaixo do prefixo, com o tamanho. */
async function listar(prefixo: string): Promise<{ chave: string; tamanho: number }[]> {
  const todos: { chave: string; tamanho: number }[] = [];
  let continuar: string | null = null;
  do {
    const consulta: Record<string, string> = { "list-type": "2", prefix: prefixo };
    if (continuar) consulta["continuation-token"] = continuar;
    const r = await pedir("GET", null, consulta);
    if (!r.ok) throw new Error(`R2 listar ${r.status}: ${await r.text()}`);
    const xml = await r.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const chave = /<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1] ?? "";
      const tamanho = Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? 0);
      todos.push({ chave: chave.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"), tamanho });
    }
    continuar = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] ?? null : null;
  } while (continuar);
  return todos;
}

async function apagar(chaves: string[]): Promise<void> {
  for (const chave of chaves) {
    const r = await pedir("DELETE", chave);
    if (!r.ok && r.status !== 404) throw new Error(`R2 apagar ${r.status}: ${await r.text()}`);
  }
}

// ── Quem chama ──
async function quem(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  return error || !data?.user ? null : data.user.id;
}

const CAMINHO_VALIDO = /^[a-z0-9][a-z0-9._-]{0,80}$/;

export async function tratar(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ erro: "use POST" }, 405);
  try {
    const usuario = await quem(req);
    if (!usuario) return responder({ erro: "entre com a conta" }, 401);
    const corpo = await req.json().catch(() => ({}));

    if (corpo.acao === "enviar") {
      const chave = String(corpo.chave ?? "").slice(0, 200), nome = String(corpo.nome ?? "").trim().slice(0, 200);
      const arquivos = Array.isArray(corpo.arquivos) ? corpo.arquivos : [];
      if (!chave || !nome) return responder({ erro: "faltam a chave e o nome" }, 400);
      if (arquivos.length === 0 || arquivos.length > LIMITE_ARQUIVOS) return responder({ erro: "arquivos demais ou nenhum" }, 400);
      if (!arquivos.some((a: { caminho: string }) => a.caminho === "tour.json")) return responder({ erro: "falta o tour.json" }, 400);
      let total = 0;
      for (const a of arquivos) {
        if (!CAMINHO_VALIDO.test(String(a.caminho))) return responder({ erro: `nome de arquivo inválido: ${a.caminho}` }, 400);
        total += Math.max(0, Number(a.tamanho) || 0);
      }
      if (total > LIMITE_TAMANHO) return responder({ erro: "o tour passa de 400 MB" }, 400);
      for (let tentativa = 0; tentativa < 8; tentativa++) {
        const { data, error } = await db.rpc("tour_enviar", {
          p_usuario: usuario, p_chave: chave, p_nome: nome, p_passeio: String(corpo.passeio ?? "").slice(0, 200),
          p_codigo: sorteio(ALFABETO, 6), p_pasta: sorteio(MINUSCULAS, 16),
        });
        if (error) {
          if (error.code === "23505") continue; // código repetido: sorteia outro
          throw error;
        }
        if (!data.ok) return responder(data);
        const prefixo = `${data.prefixo}v${data.versao}/`;
        const envios = [];
        for (const a of arquivos) envios.push({ caminho: a.caminho, url: await urlDeEnvio(prefixo + a.caminho) });
        return responder({ ok: true, id: data.id, codigo: data.codigo, versao: data.versao, link: `${SITE}/t/${data.codigo}`, envios });
      }
      throw new Error("não deu para sortear um código livre");
    }

    if (corpo.acao === "concluir") {
      const { data: tour, error: erroTour } = await db.rpc("tour_prefixo", { p_usuario: usuario, p_id: String(corpo.id ?? "") });
      if (erroTour) throw erroTour;
      if (!tour?.ok) return responder(tour ?? { ok: false, motivo: "Tour não encontrado." });
      const versao = Number(corpo.versao);
      const objetos = await listar(tour.prefixo);
      const desta = objetos.filter((o) => o.chave.startsWith(`${tour.prefixo}v${versao}/`));
      if (!desta.some((o) => o.chave.endsWith("/tour.json"))) return responder({ ok: false, motivo: "O tour.json não chegou ao servidor: gere o tour de novo." });
      const { data, error } = await db.rpc("tour_concluir", {
        p_usuario: usuario, p_id: tour.id, p_versao: versao, p_paradas: Number(corpo.paradas) || 0,
        p_tamanho: desta.reduce((s, o) => s + o.tamanho, 0),
      });
      if (error) throw error;
      if (!data.ok) return responder(data);
      await apagar(objetos.filter((o) => !o.chave.startsWith(`${tour.prefixo}v${versao}/`)).map((o) => o.chave));
      return responder({ ...data, link: `${SITE}/t/${data.codigo}` });
    }

    if (corpo.acao === "excluir") {
      const { data, error } = await db.rpc("tour_excluir", { p_usuario: usuario, p_id: String(corpo.id ?? "") });
      if (error) throw error;
      if (!data.ok) return responder(data);
      await apagar((await listar(data.prefixo)).map((o) => o.chave));
      return responder({ ok: true });
    }

    return responder({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    console.error("tours:", e);
    return new Response("erro no servidor", { status: 500, headers: CORS });
  }
}

Deno.serve(tratar);
