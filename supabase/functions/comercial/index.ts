// Arquionie™ — o COMERCIAL, o CRM grátis (doc 68 e o contrato no doc 72 do repositório do programa; migração
// 20261017000000_comercial.sql). O banco confere tudo; aqui ficam só as três coisas que pedem o servidor:
//
//   POST { acao: "pedido", codigo, respostas: [{ id, valor }], origem?, turnstile }   (sem conta: o formulário público /f/CODIGO)
//     -> { ok: true, numero } | { ok: false, motivo, pergunta? } | { ok: false, desvio: true, motivo }
//        Confere o Cloudflare Turnstile e grava com a impressão do endereço de quem mandou (SHA-256 com o sal; nunca o endereço).
//   POST { acao: "pdf", codigo, tamanho }   (com a conta: o responsável ou a equipe)
//     -> { ok: true, arquivo, url }   (a URL vale 1 hora, para PUT do PDF no R2) | { ok: false, motivo, limite? }
//   POST { acao: "tarefa" } com o cabeçalho x-tarefa: COMERCIAL_TAREFA_SEGREDO   (a tarefa diária do Supabase)
//     -> { ok: true, movidos, apagados }   (a regra PARADO e os PDFs dos pedidos excluídos saindo do R2)
//
// Publicar com a verificação de JWT DESLIGADA (--no-verify-jwt): o formulário não tem conta; o "pdf" confere a conta aqui.
// Segredos: os do R2 (ver ../_compartilhado/r2.ts), TURNSTILE_SEGREDO (sem ele, o pedido passa sem a conferência: só para testar),
// COMERCIAL_SAL e COMERCIAL_TAREFA_SEGREDO.

import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, apagar, responder, resumo, urlDeEnvio } from "../_compartilhado/r2.ts";
import { endereco } from "../_compartilhado/limite.ts";

const LIMITE_PDF = 10 * 1024 * 1024;

const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

/** O Turnstile confere que quem mandou é uma pessoa. Sem o segredo, não confere (só no teste e no desenvolvimento). */
export async function pessoaDeVerdade(token: string, ip: string): Promise<boolean> {
  const segredo = Deno.env.get("TURNSTILE_SEGREDO");
  if (!segredo) return true;
  if (!token) return false;
  const corpo = new FormData();
  corpo.append("secret", segredo);
  corpo.append("response", token);
  if (ip) corpo.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: corpo });
    const d = await r.json();
    return d?.success === true;
  } catch (e) {
    console.error("comercial: turnstile", e);
    return false;
  }
}

export async function tratar(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...CORS, "Access-Control-Allow-Headers": CORS["Access-Control-Allow-Headers"] + ", x-tarefa" } });
  if (req.method !== "POST") return responder({ erro: "use POST" }, 405);
  try {
    const corpo = await req.json().catch(() => ({}));

    if (corpo.acao === "pedido") {
      const codigo = String(corpo.codigo ?? "").slice(0, 40);
      const respostas = Array.isArray(corpo.respostas) ? corpo.respostas.slice(0, 60) : [];
      const ip = endereco(req);
      if (!(await pessoaDeVerdade(String(corpo.turnstile ?? ""), ip))) {
        return responder({ ok: false, motivo: "Não deu para confirmar que você é uma pessoa. Recarregue a página e tente de novo." });
      }
      const sal = Deno.env.get("COMERCIAL_SAL") ?? "";
      const impressao = ip ? (await resumo(sal + "|" + ip)).slice(0, 32) : null;
      const d = await rpc("comercial_pedido_criar", {
        p_codigo: codigo, p_respostas: respostas, p_origem: String(corpo.origem ?? "").slice(0, 60) || null, p_ip_hash: impressao,
      });
      // o aviso (o e-mail do escritório) fica no banco: o Arquionie não manda e-mail entre o escritório e o cliente (11/10/2026)
      if (!d.ok) return responder(d);
      return responder({ ok: true, numero: d.numero });
    }

    if (corpo.acao === "pdf") {
      const usuario = await quem(req);
      if (!usuario) return responder({ erro: "entre com a conta" }, 401);
      const tamanho = Number(corpo.tamanho) || 0;
      if (tamanho < 1 || tamanho > LIMITE_PDF) return responder({ ok: false, motivo: "O PDF vai até 10 MB." });
      const d = await rpc("comercial_proposta_pdf", { p_usuario: usuario, p_codigo: String(corpo.codigo ?? "").slice(0, 12), p_tamanho: tamanho });
      if (!d.ok) return responder(d);
      return responder({ ok: true, arquivo: d.arquivo, url: await urlDeEnvio(d.arquivo) });
    }

    // A tarefa diária: a regra PARADO e o lixo do R2. Só com o segredo da tarefa.
    if (corpo.acao === "tarefa") {
      const segredo = Deno.env.get("COMERCIAL_TAREFA_SEGREDO");
      if (!segredo || req.headers.get("x-tarefa") !== segredo) return responder({ erro: "só a tarefa do servidor" }, 401);
      const parados = await rpc("comercial_mover_parados", {});
      const lixo = (await rpc("comercial_lixo_pegar", {})) as string[];
      if (lixo.length) await apagar(lixo);
      return responder({ ok: true, movidos: parados.movidos, apagados: lixo.length });
    }

    return responder({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    console.error("comercial:", e);
    return new Response("erro no servidor", { status: 500, headers: CORS });
  }
}

Deno.serve(tratar);
