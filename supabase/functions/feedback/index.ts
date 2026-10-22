// Arquionie™ — o botão de feedback do plugin do Revit (e, depois, do programa) grava aqui (plano 18 do repositório do plugin;
// no Flow era a função enviar-feedback do Supabase do escritório). O /gestao lê na aba FEEDBACKS.
//
//   POST { mensagem, categoria?, nota?, versao?, edicao?, email?, credencial?, maquina? } -> { ok: true } | { ok: false, motivo }
//
// Com a credencial do computador (o login pelo navegador), o feedback sai com a conta de quem mandou; sem ela, com o e-mail que
// vier (ou sem e-mail). Publicar com a verificação de JWT DESLIGADA (--no-verify-jwt): quem chama é o plugin, sem sessão do site.
// Até 10 feedbacks por hora de cada endereço (ajustes_limites.feedback); passou, { ok: false, motivo } com 429.

import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, responder } from "../_compartilhado/r2.ts";
import { cabe } from "../_compartilhado/limite.ts";

const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function resumo(texto: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  return Array.from(h, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function tratar(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ erro: "use POST" }, 405);
  try {
    const c = await req.json().catch(() => ({}));
    const mensagem = String(c.mensagem ?? "").trim();
    if (!mensagem) return responder({ ok: false, motivo: "Escreva a mensagem." }, 400);
    if (!(await cabe(db, "feedback", req))) return responder({ ok: false, motivo: "Muitas mensagens daqui agora. Tente de novo daqui a uma hora." }, 429);

    let usuario: string | null = null, email: string | null = String(c.email ?? "").trim().toLowerCase() || null;
    const credencial = String(c.credencial ?? "");
    if (credencial.length >= 20) {
      const { data } = await db.from("computadores").select("usuario_id").eq("credencial_hash", await resumo(credencial)).maybeSingle();
      if (data?.usuario_id) {
        usuario = data.usuario_id;
        const { data: conta } = await db.auth.admin.getUserById(usuario);
        email = conta?.user?.email?.toLowerCase() ?? email;
      }
    }
    const nota = Number.isInteger(Number(c.nota)) ? Number(c.nota) : null;
    const { data, error } = await db.rpc("feedback_registrar", {
      p_mensagem: mensagem.slice(0, 10000), p_email: email, p_usuario: usuario,
      p_edicao: c.edicao ? String(c.edicao).slice(0, 40) : null, p_versao: c.versao ? String(c.versao).slice(0, 40) : null,
      p_categoria: c.categoria ? String(c.categoria).slice(0, 60) : null, p_nota: nota,
    });
    if (error) throw error;
    return responder({ ok: data?.situacao === "ok" });
  } catch (e) {
    console.error("feedback:", e);
    return new Response("erro no servidor", { status: 500, headers: CORS });
  }
}

Deno.serve(tratar);
