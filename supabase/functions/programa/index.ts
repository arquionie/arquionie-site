// Arquionie™ — ENTRAR PELO NAVEGADOR (mockup docs/mockups/entrar-pelo-navegador do repositório do programa, aprovado por ÊDI em
// 22/10/2026; migração 20261023000000_entrar_no_programa.sql). O programa nunca vê a senha: a pessoa entra no site, que tem a
// verificação de pessoa, e o site pede aqui um código de uso único para o programa daquele computador.
//
//   POST { acao: "autorizar", desafio }   com a sessão do site (Authorization)
//     -> { ok: true, codigo } | { ok: false, motivo }   (o código vale 2 minutos; o site o leva ao programa por /programa/PORTA?code=CODIGO)
//   POST { acao: "trocar", codigo, verificador }   (o programa, sem conta)
//     -> a sessão no formato do /auth/v1/token: { access_token, refresh_token, expires_in, expires_at, token_type, user }
//     -> 400 { error: "codigo_invalido" }   (vencido, já usado ou com o verificador errado: o programa pede de novo)
//
// A sessão do programa é dele, separada da do navegador: a função gera um link de entrada com a chave secreta (generateLink, que não
// manda e-mail) e o confere na mesma hora (verifyOtp), como um link mágico que ninguém recebe. Publicar com a verificação de JWT
// DESLIGADA (--no-verify-jwt): o "trocar" vem do programa sem sessão; o "autorizar" confere a sessão aqui dentro.

import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, responder, resumo } from "../_compartilhado/r2.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const sem = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", sem);
const DESAFIO = /^[A-Za-z0-9_-]{43}$/;

function base64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** O desafio do verificador, como no PKCE (S256): o SHA-256 em base64url. */
export async function desafioDe(verificador: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador))));
}

async function quem(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  return error || !data?.user ? null : data.user.id;
}

async function rpc(nome: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(nome, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

/** Uma sessão nova para a conta, sem senha e sem e-mail: o link mágico gerado aqui e conferido na hora. */
async function sessaoNova(usuario: string) {
  const { data: conta, error: e1 } = await db.auth.admin.getUserById(usuario);
  if (e1 || !conta?.user?.email) throw new Error("conta sem e-mail: " + (e1?.message ?? usuario));
  const { data: link, error: e2 } = await db.auth.admin.generateLink({ type: "magiclink", email: conta.user.email });
  if (e2 || !link?.properties?.hashed_token) throw new Error("generateLink: " + (e2?.message ?? "sem token"));
  const publico = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_ANON_KEY") ?? "", sem);
  const { data, error: e3 } = await publico.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (e3 || !data?.session) throw new Error("verifyOtp: " + (e3?.message ?? "sem sessão"));
  const s = data.session;
  return { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: s.expires_at,
    token_type: s.token_type, user: s.user };
}

export async function tratar(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ erro: "use POST" }, 405);
  try {
    const corpo = await req.json().catch(() => ({}));

    if (corpo.acao === "autorizar") {
      const usuario = await quem(req);
      if (!usuario) return responder({ ok: false, motivo: "Entre na sua conta para continuar." }, 401);
      const desafio = String(corpo.desafio ?? "");
      if (!DESAFIO.test(desafio)) return responder({ ok: false, motivo: "Este link não veio do Arquionie. Clique em ENTRAR PELO NAVEGADOR no programa." });
      const codigo = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const d = await rpc("programa_entrada_criar", { p_usuario: usuario, p_codigo_hash: await resumo(codigo), p_desafio: desafio });
      if (!d.ok) return responder(d);
      return responder({ ok: true, codigo });
    }

    if (corpo.acao === "trocar") {
      const codigo = String(corpo.codigo ?? ""), verificador = String(corpo.verificador ?? "");
      if (codigo.length < 20 || verificador.length < 43) return responder({ error: "codigo_invalido" }, 400);
      const usuario = await rpc("programa_entrada_usar", { p_codigo_hash: await resumo(codigo), p_desafio: await desafioDe(verificador) });
      if (!usuario) return responder({ error: "codigo_invalido" }, 400);
      return responder(await sessaoNova(usuario));
    }

    return responder({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    console.error("programa:", e);
    return new Response("erro no servidor", { status: 500, headers: CORS });
  }
}

Deno.serve(tratar);
