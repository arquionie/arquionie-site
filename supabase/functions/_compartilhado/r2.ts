// Arquionie™ — os pedidos ao R2 da Cloudflare, para as funções do servidor (a assinatura AWS Signature V4 que o R2 entende, feita
// aqui, sem biblioteca; a mesma da função tours, conferida pelos exemplos da documentação da AWS no teste dela). Segredos: R2_CONTA,
// R2_CHAVE e R2_SEGREDO (um token do R2 com leitura e escrita só no bucket arquionie-tours) e, opcional, R2_BUCKET.

export const BUCKET = Deno.env.get("R2_BUCKET") ?? "arquionie-tours";
export const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 sinais, sem 0/O nem 1/I
export const MINUSCULAS = "abcdefghijklmnopqrstuvwxyz0123456789";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

export function sorteio(alfabeto: string, n: number): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => alfabeto[x % alfabeto.length]).join("");
}

const texto = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
export const resumo = async (s: string) => hex(await crypto.subtle.digest("SHA-256", texto.encode(s)));
async function hmac(chave: ArrayBuffer | Uint8Array, s: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, texto.encode(s));
}
// RFC 3986: o encodeURIComponent deixa ! ' ( ) * sem codificar, e a assinatura pede codificados.
const codificar = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const caminhoDoObjeto = (chave: string) => `/${BUCKET}/` + chave.split("/").map(codificar).join("/");

function conta() {
  const c = Deno.env.get("R2_CONTA"), id = Deno.env.get("R2_CHAVE"), segredo = Deno.env.get("R2_SEGREDO");
  if (!c || !id || !segredo) throw new Error("faltam R2_CONTA, R2_CHAVE e R2_SEGREDO");
  return { servidor: `${c}.r2.cloudflarestorage.com`, id, segredo };
}

const carimbo = (quando: Date) => quando.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""); // 20261010T031500Z
const consultaCanonica = (consulta: Record<string, string>) =>
  Object.keys(consulta).sort().map((k) => `${codificar(k)}=${codificar(consulta[k])}`).join("&");

/** A assinatura de um pedido: os cabeçalhos dados (em minúsculas) são os assinados. A região é a do R2 ("auto"). */
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
export async function urlDeEnvio(chave: string, quando = new Date()): Promise<string> {
  const { servidor, id } = conta();
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

/** Um pedido assinado ao R2 (listar, conferir, apagar), sem corpo. */
async function pedir(metodo: string, chave: string | null, consulta: Record<string, string> = {}): Promise<Response> {
  const { servidor, id } = conta();
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
export async function listar(prefixo: string): Promise<{ chave: string; tamanho: number }[]> {
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

/** Se o objeto está no R2 (e o tamanho). */
export async function existe(chave: string): Promise<number | null> {
  const r = await pedir("HEAD", chave);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`R2 conferir ${r.status}`);
  return Number(r.headers.get("content-length") ?? 0);
}

/** Apaga os objetos, 16 de cada vez. */
export async function apagar(chaves: string[]): Promise<void> {
  const fila = [...chaves];
  const um = async () => {
    for (let chave = fila.shift(); chave !== undefined; chave = fila.shift()) {
      const r = await pedir("DELETE", chave);
      if (!r.ok && r.status !== 404) throw new Error(`R2 apagar ${r.status}: ${await r.text()}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(16, fila.length) }, um));
}
