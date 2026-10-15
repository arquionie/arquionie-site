// Arquionie™ — as campanhas de e-mail do /gestao (plano 18 do repositório do plugin; migração 20261015000000). A fila mora
// no banco; esta função manda os e-mails pelo Resend e registra cada resultado.
//
//   POST { acao: "processar" } com o cabeçalho x-campanhas: CAMPANHAS_SEGREDO (a tarefa do pg_cron, a cada 5 minutos)
//     -> pede o próximo lote ao banco (campanha_proximo_lote: intervalo, limite do dia) e manda um e-mail de cada vez.
//   POST { acao: "teste", assunto, mensagem, cupom, desconto, oferta } com o token de um ADMINISTRADOR
//     -> o TESTE PARA MIM: o mesmo e-mail, só para o e-mail de quem pediu.
//   GET ?descadastrar=EMAIL&s=ASSINATURA (o link no rodapé de cada e-mail) -> grava o descadastro e mostra uma página.
//
// Publicar com a verificação de JWT DESLIGADA (--no-verify-jwt): quem chama é o pg_cron e o link do e-mail; o TESTE confere
// o token aqui dentro. Segredo: RESEND_CAMPANHAS (a chave do Resend SÓ das campanhas: a RESEND_API_KEY continua sem
// existir, por decisão do ÊDI de 11/10/2026, para a função cliente não mandar e-mail). O segredo da tarefa e do link de
// descadastro é sorteado pelo próprio banco e fica no cofre (Vault): supabase/ferramentas/ligar-envio-das-campanhas.sql cria
// e a função lê pela segredo_das_campanhas() (ninguém precisa copiar). CAMPANHAS_SEGREDO, se existir, vale no lugar dele.
// Opcionais: CAMPANHAS_DE, SITE_URL e WHATSAPP_NUMERO.

import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, responder } from "../_compartilhado/r2.ts";
import { assinarEmail, linkDescadastro, montarEmail, trocar } from "../_compartilhado/email-campanha.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const FUNCOES = `${URL_SUPABASE}/functions/v1`;
const DE = Deno.env.get("CAMPANHAS_DE") ?? "Arquionie <suporte@arquionie.com.br>";
const PAUSA_MS = 600;   // o Resend aceita 2 pedidos por segundo

const db = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function rpc(nome: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(nome, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

let segredoGuardado = "";
/** O segredo da tarefa e do descadastro: o do cofre do banco (ou CAMPANHAS_SEGREDO, nos testes). Vazio = não configurado. */
async function segredo(): Promise<string> {
  if (segredoGuardado) return segredoGuardado;
  const env = Deno.env.get("CAMPANHAS_SEGREDO");
  if (env) return (segredoGuardado = env);
  const { data } = await db.rpc("segredo_das_campanhas");
  return (segredoGuardado = typeof data === "string" ? data : "");
}

/** Manda um e-mail pelo Resend. "ok", "esperar" (429: o lote para e volta para a fila) ou o motivo do erro. */
async function mandar(para: string, assunto: string, html: string): Promise<"ok" | "esperar" | string> {
  const chave = Deno.env.get("RESEND_CAMPANHAS");
  if (!chave) return "esperar";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: DE, to: [para], subject: assunto, html, reply_to: "suporte@arquionie.com.br" }),
    });
    if (r.ok) return "ok";
    if (r.status === 429) return "esperar";
    return `Resend ${r.status}: ${(await r.text()).slice(0, 300)}`;
  } catch (e) {
    return `rede: ${String(e).slice(0, 200)}`;
  }
}

async function emailDe(c: Record<string, unknown>, para: string, nome: string, segredo: string) {
  const descadastro = linkDescadastro(FUNCOES, para, await assinarEmail(para, segredo));
  const cupom = (c.cupom as string) ?? null, desconto = (c.desconto as number) ?? null;
  return {
    assunto: trocar(String(c.assunto ?? ""), nome, cupom, desconto),
    html: montarEmail({ nome, mensagem: String(c.mensagem ?? ""), cupom, desconto, oferta: c.oferta, descadastro }),
  };
}

function pagina(titulo: string, texto: string, status = 200) {
  return new Response(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title></head><body style="margin:0;background:#14181E;font-family:Inter,'Segoe UI',Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="background:#1A1F25;padding:40px 32px;max-width:440px;text-align:center"><p style="margin:0 0 14px;color:#D47263;font-size:12px;font-weight:700;letter-spacing:3px">ARQUIONIE&trade;</p>
<h1 style="color:#fff;font-size:20px;margin:0 0 10px">${titulo}</h1><p style="color:#9AA6B8;font-size:14px;line-height:1.6;margin:0">${texto}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function descadastrar(url: URL): Promise<Response> {
  const email = (url.searchParams.get("descadastrar") ?? "").trim().toLowerCase();
  const sig = url.searchParams.get("s") ?? "";
  const chave = await segredo();
  if (!email || !sig || !chave || (await assinarEmail(email, chave)) !== sig) {
    return pagina("Link inválido", "Este link de descadastro não é válido. Para sair da lista, responda qualquer e-mail nosso pedindo o descadastro.", 400);
  }
  await rpc("descadastrar", { p_email: email });
  const seguro = email.replace(/[&<>"']/g, "");
  return pagina("Pronto, você saiu da lista.", `O e-mail <b style="color:#D4DAE6">${seguro}</b> não recebe mais as campanhas do Arquionie. Os avisos da sua conta continuam chegando.`);
}

async function processar(): Promise<Response> {
  const chave = await segredo();
  if (!Deno.env.get("RESEND_CAMPANHAS")) return responder({ ok: false, motivo: "RESEND_CAMPANHAS não configurada" }, 500);
  const lote = await rpc("campanha_proximo_lote", {});
  if (lote.situacao !== "lote") return responder({ ok: true, situacao: lote.situacao });
  let enviados = 0, erros = 0, devolvidos = 0, parar = false;
  for (const e of lote.envios as { id: number; email: string; nome: string | null }[]) {
    if (parar) {   // o Resend pediu para esperar: o resto volta para a fila
      await rpc("campanha_registrar_envio", { p_envio: e.id, p_situacao: "pendente" });
      devolvidos++;
      continue;
    }
    const { assunto, html } = await emailDe(lote.campanha, e.email, e.nome ?? "", chave);
    const r = await mandar(e.email, assunto, html);
    if (r === "ok") { await rpc("campanha_registrar_envio", { p_envio: e.id, p_situacao: "enviado" }); enviados++; }
    else if (r === "esperar") { await rpc("campanha_registrar_envio", { p_envio: e.id, p_situacao: "pendente" }); devolvidos++; parar = true; }
    else { await rpc("campanha_registrar_envio", { p_envio: e.id, p_situacao: "erro", p_erro: r }); erros++; }
    await espera(PAUSA_MS);
  }
  return responder({ ok: true, situacao: "lote", campanha: lote.campanha.id, enviados, erros, devolvidos });
}

async function teste(req: Request, corpo: Record<string, unknown>): Promise<Response> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await db.auth.getUser(token);
  const email = quem?.user?.email;
  if (!email) return responder({ ok: false, motivo: "Entre com a sua conta." }, 401);
  const comoEle = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: admin } = await comoEle.rpc("eh_administrador");
  if (admin !== true) return responder({ ok: false, motivo: "Só para os administradores." }, 403);
  if (!String(corpo.assunto ?? "").trim() || !String(corpo.mensagem ?? "").trim()) {
    return responder({ ok: false, motivo: "Escreva o assunto e a mensagem." });
  }
  const nome = String(quem.user.user_metadata?.nome ?? "");
  const { assunto, html } = await emailDe(corpo, email, nome, await segredo());
  const r = await mandar(email, `[TESTE] ${assunto}`, html);
  if (r === "ok") return responder({ ok: true, para: email });
  return responder({ ok: false, motivo: r === "esperar" ? "O Resend não aceitou agora (chave ausente ou limite). Tente de novo em instantes." : r });
}

export async function tratar(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...CORS, "Access-Control-Allow-Headers": CORS["Access-Control-Allow-Headers"] + ", x-campanhas", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.has("descadastrar")) return await descadastrar(url);
    if (req.method !== "POST") return responder({ erro: "use POST" }, 405);
    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === "processar") {
      const chave = await segredo();
      if (!chave || req.headers.get("x-campanhas") !== chave) return responder({ erro: "só a tarefa do servidor" }, 401);
      return await processar();
    }
    if (corpo.acao === "teste") return await teste(req, corpo);
    return responder({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    console.error("campanhas:", e);
    return new Response("erro no servidor", { status: 500, headers: CORS });
  }
}

Deno.serve(tratar);
