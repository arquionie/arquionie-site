// Os avisos no celular (migração 20261116000000_avisos_no_celular.sql): esvazia a fila e manda cada aviso aos aparelhos dele, pelo
// Firebase (Android, a API HTTP v1) e pela Apple (iPhone, o APNs com a chave .p8). Usado pela função avisos e, logo depois do pedido
// ou do comentário, pelas funções comercial e cliente (assim o aviso não espera a tarefa de 5 minutos).
//
// Segredos: FIREBASE_CONTA (o JSON da conta de serviço do projeto do Firebase do Arquionie, inteiro) e, para o iPhone, APNS_CHAVE (o
// texto do .p8), APNS_ID_CHAVE, APNS_TIME (o Team ID), APNS_TOPICO (com.palhetaarquitetura.arquionie) e APNS_AMBIENTE ("producao",
// de fábrica, ou "teste" para o app instalado pelo Xcode). Sem os de uma plataforma, os aparelhos dela ficam sem o aviso.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type Aparelho = { token: string; plataforma: "android" | "ios" };
type Aviso = { id: number; tipo: string; titulo: string; texto: string; dados: Record<string, unknown>; aparelhos: Aparelho[] };

const texto = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === "string" ? texto.encode(b) : b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const pem = (chave: string) => Uint8Array.from(atob(chave.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));

async function jwt(cabecalho: Record<string, unknown>, corpo: Record<string, unknown>, chave: CryptoKey, alg: AlgorithmIdentifier | EcdsaParams) {
  const base = `${b64url(JSON.stringify(cabecalho))}.${b64url(JSON.stringify(corpo))}`;
  return `${base}.${b64url(await crypto.subtle.sign(alg, chave, texto.encode(base)))}`;
}

// ------------------------------------------------------------------------------------------------ o Firebase (Android)
let firebase: { projeto: string; token: string; ate: number } | null = null;
async function acessoDoFirebase(): Promise<{ projeto: string; token: string } | null> {
  const bruto = Deno.env.get("FIREBASE_CONTA");
  if (!bruto) return null;
  if (firebase && firebase.ate > Date.now() + 60_000) return firebase;
  const conta = JSON.parse(bruto);
  const chave = await crypto.subtle.importKey("pkcs8", pem(conta.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const agora = Math.floor(Date.now() / 1000);
  const assinado = await jwt({ alg: "RS256", typ: "JWT" }, {
    iss: conta.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token",
    iat: agora, exp: agora + 3600,
  }, chave, { name: "RSASSA-PKCS1-v1_5" });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: assinado }),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error("Firebase: " + JSON.stringify(d).slice(0, 300));
  firebase = { projeto: conta.project_id, token: d.access_token, ate: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  return firebase;
}

/** Manda pelo Firebase; devolve "ok", "esquecer" (o aparelho não existe mais) ou "erro". */
async function porFirebase(token: string, a: Aviso): Promise<"ok" | "esquecer" | "erro"> {
  const acesso = await acessoDoFirebase();
  if (!acesso) return "erro";
  const dados: Record<string, string> = {};
  for (const [k, v] of Object.entries(a.dados ?? {})) dados[k] = String(v);
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${acesso.projeto}/messages:send`, {
    method: "POST", headers: { Authorization: `Bearer ${acesso.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token, notification: { title: a.titulo, body: a.texto }, data: dados,
      android: { priority: "HIGH", notification: { channel_id: "avisos", tag: a.tipo === "teste" ? "teste" : undefined } } } }),
  });
  if (r.ok) return "ok";
  const erro = await r.text();
  if (r.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(erro)) return "esquecer";
  console.error("avisos: Firebase", r.status, erro.slice(0, 300));
  return "erro";
}

// ------------------------------------------------------------------------------------------------ a Apple (iPhone)
let apple: { token: string; ate: number } | null = null;
async function tokenDaApple(): Promise<string | null> {
  const chavePem = Deno.env.get("APNS_CHAVE"), idChave = Deno.env.get("APNS_ID_CHAVE"), time = Deno.env.get("APNS_TIME");
  if (!chavePem || !idChave || !time) return null;
  // a Apple aceita o mesmo token por até 1 hora e recusa quem troca mais de uma vez a cada 20 minutos
  if (apple && apple.ate > Date.now()) return apple.token;
  const chave = await crypto.subtle.importKey("pkcs8", pem(chavePem), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const token = await jwt({ alg: "ES256", kid: idChave }, { iss: time, iat: Math.floor(Date.now() / 1000) }, chave, { name: "ECDSA", hash: "SHA-256" });
  apple = { token, ate: Date.now() + 40 * 60_000 };
  return token;
}

async function pelaApple(token: string, a: Aviso): Promise<"ok" | "esquecer" | "erro"> {
  const jwtApple = await tokenDaApple();
  const topico = Deno.env.get("APNS_TOPICO") ?? "com.palhetaarquitetura.arquionie";
  if (!jwtApple) return "erro";
  const servidor = Deno.env.get("APNS_AMBIENTE") === "teste" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const r = await fetch(`https://${servidor}/3/device/${token}`, {
    method: "POST",
    headers: { authorization: `bearer ${jwtApple}`, "apns-topic": topico, "apns-push-type": "alert", "apns-priority": "10" },
    body: JSON.stringify({ aps: { alert: { title: a.titulo, body: a.texto }, sound: "default" }, ...a.dados }),
  });
  if (r.ok) return "ok";
  const erro = await r.text();
  if (r.status === 410 || /BadDeviceToken|Unregistered/.test(erro)) return "esquecer";
  console.error("avisos: Apple", r.status, erro.slice(0, 300));
  return "erro";
}

// ------------------------------------------------------------------------------------------------ a fila
/** Esvazia a fila: pega os pendentes (o banco já os marca como enviados) e manda a cada aparelho. */
export async function processarAvisos(db: SupabaseClient): Promise<{ avisos: number; enviados: number; esquecidos: number; erros: number }> {
  const { data, error } = await db.rpc("avisos_pegar");
  if (error) throw new Error(error.message);
  const avisos = (data ?? []) as Aviso[];
  let enviados = 0, erros = 0;
  const esquecer: string[] = [];
  await Promise.all(avisos.flatMap((a) => a.aparelhos.map(async (d) => {
    try {
      const r = d.plataforma === "ios" ? await pelaApple(d.token, a) : await porFirebase(d.token, a);
      if (r === "ok") enviados++;
      else if (r === "esquecer") esquecer.push(d.token);
      else erros++;
    } catch (e) {
      erros++;
      console.error("avisos:", e);
    }
  })));
  if (esquecer.length) await db.rpc("aparelho_esquecer", { p_tokens: esquecer });
  return { avisos: avisos.length, enviados, esquecidos: esquecer.length, erros };
}

/** Logo depois do pedido ou do comentário, sem segurar a resposta a quem mandou (o EdgeRuntime espera o fim). */
export function avisarLogo(db: SupabaseClient) {
  const tarefa = processarAvisos(db).catch((e) => console.error("avisos:", e));
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(tarefa);
}
