// Arquionie™ — os avisos no celular (o app do Arquionie; migração 20261116000000_avisos_no_celular.sql; o envio em
// ../_compartilhado/avisos.ts).
//
//   POST { acao: "processar" } com o cabeçalho x-avisos: o segredo da tarefa (a tarefa do pg_cron, a cada 5 minutos: a reserva)
//     -> { ok: true, avisos, enviados, esquecidos, erros }
//   POST { acao: "retornos" }  com o cabeçalho x-avisos: o segredo da tarefa (a tarefa das 7h: os retornos do dia, e já manda)
//     -> { ok: true, retornos, avisos, enviados, esquecidos, erros }
//   POST { acao: "testar" }    com a conta (Mais › Avisos, no app)          -> { ok: true, aparelhos } | { ok: false, motivo }
//
// Publicar com a verificação de JWT DESLIGADA (--no-verify-jwt): quem chama é o pg_cron; o "testar" confere a conta aqui.
// O segredo da tarefa fica no cofre do banco (supabase/ferramentas/ligar-os-avisos.sql o sorteia; ninguém copia) e a função o lê pela
// segredo_dos_avisos(); AVISOS_SEGREDO, se existir, vale no lugar dele (nos testes). Segredos da função: os do envio (FIREBASE_CONTA e os
// APNS_*; ver ../_compartilhado/avisos.ts).
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, responder } from "../_compartilhado/r2.ts";
import { processarAvisos } from "../_compartilhado/avisos.ts";

const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

let segredoGuardado = "";
async function segredo(): Promise<string> {
  if (segredoGuardado) return segredoGuardado;
  const env = Deno.env.get("AVISOS_SEGREDO");
  if (env) return (segredoGuardado = env);
  const { data } = await db.rpc("segredo_dos_avisos");
  return (segredoGuardado = typeof data === "string" ? data : "");
}

async function quem(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  return error || !data?.user ? null : data.user.id;
}

export async function tratar(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ erro: "use POST" }, 405);
  try {
    const corpo = await req.json().catch(() => ({}));

    if (corpo.acao === "processar" || corpo.acao === "retornos") {
      const s = await segredo();
      if (!s || req.headers.get("x-avisos") !== s) return responder({ erro: "só a tarefa do servidor" }, 401);
      let retornos = 0;
      if (corpo.acao === "retornos") {
        const { data, error } = await db.rpc("avisos_retornos_do_dia");
        if (error) throw new Error(error.message);
        retornos = data?.retornos ?? 0;
      }
      return responder({ ok: true, retornos, ...(await processarAvisos(db)) });
    }

    if (corpo.acao === "testar") {
      const usuario = await quem(req);
      if (!usuario) return responder({ erro: "entre com a conta" }, 401);
      const { data, error } = await db.rpc("avisos_testar", { p_usuario: usuario });
      if (error) throw new Error(error.message);
      if (!data.ok) return responder(data);
      await processarAvisos(db);
      return responder(data);
    }

    return responder({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    console.error("avisos:", e);
    return new Response("erro no servidor", { status: 500, headers: CORS });
  }
}

Deno.serve(tratar);
