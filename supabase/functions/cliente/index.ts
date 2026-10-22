// Arquionie™ — a resposta do cliente na página /t/CODIGO (mockup docs/mockups/enviar-para-o-cliente.html do repositório do
// programa, aprovado por ÊDI em 11/10/2026: comentar é pedir ajuste, aprovar é pelo termo do escritório). Quem chama não tem conta:
// a página, só com o link e o nome. O banco confere tudo (migração 20261011000000_apresentacoes.sql); aqui só se chama o banco com
// a chave secreta e se avisa o escritório por e-mail.
//
//   POST { acao: "comentar", codigo, envio, nome, comentarios: [{ texto, lugar }] } -> { ok: true, situacao: "ajustes" } | { ok: false, motivo }
//   POST { acao: "aprovar", codigo, envio, nome, itens: [true, …] }                  -> { ok: true, situacao: "aprovado", em } | { ok: false, motivo }
//   POST { acao: "limpar" } com o cabeçalho x-limpeza: LIMPEZA_SEGREDO (a tarefa diária do Supabase) -> { ok: true, prefixos }
//
// Publicar com a verificação de JWT DESLIGADA (--no-verify-jwt). Segredos: os do R2 (para a limpeza), LIMPEZA_SEGREDO e, para o
// e-mail, RESEND_API_KEY (sem ela, o aviso fica só no programa) e, opcional, AVISO_DE e SITE_URL.
// O comentar e o aprovar vão até 30 vezes por hora de cada endereço (ajustes_limites.cliente): é também o que segura quem tenta adivinhar
// códigos por aqui.

import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, apagar, listar, responder } from "../_compartilhado/r2.ts";
import { cabe } from "../_compartilhado/limite.ts";

const SITE = Deno.env.get("SITE_URL") ?? "https://www.arquionie.com.br";
const DE = Deno.env.get("AVISO_DE") ?? "Arquionie <suporte@arquionie.com.br>";

const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function rpc(nome: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(nome, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

const escapar = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** O e-mail ao escritório (pelo Resend), com o resumo e o link. Falhar aqui não desfaz a resposta: o programa também avisa. */
export function textoDoAviso(acao: string, aviso: Record<string, unknown>): { assunto: string; html: string } {
  const link = `${SITE}/t/${aviso.codigo}`;
  if (acao === "comentar") {
    const lista = aviso.comentarios as { texto: string; lugar?: { ambiente?: string; pavimento?: string } }[];
    const n = lista.length;
    const itens = lista.map((c, i) => {
      const onde = [c.lugar?.ambiente, c.lugar?.pavimento].filter(Boolean).join(" · ");
      return `<li style="margin:0 0 8px">${onde ? `<b>${escapar(onde)}</b> — ` : ""}${escapar(c.texto)}</li>`;
    }).join("");
    return {
      assunto: `${aviso.projeto} · ${aviso.nome} pediu ajustes (${n} ${n === 1 ? "comentário" : "comentários"})`,
      html: `<p>${escapar(aviso.nome)} pediu ajustes no envio ${aviso.envio} de <b>${escapar(aviso.projeto)}</b>:</p><ol>${itens}</ol>`
        + `<p>Os comentários estão no Arquionie, no envio, cada um no lugar dele no tour. A página: <a href="${link}">${link}</a></p>`,
    };
  }
  const termo = aviso.termo as { titulo: string; itens: string[]; pergunta: string };
  return {
    assunto: `${aviso.projeto} · ${aviso.nome} aprovou o projeto`,
    html: `<p><b>${escapar(aviso.nome)}</b> aprovou o envio ${aviso.envio} de <b>${escapar(aviso.projeto)}</b>, pelo termo:</p>`
      + `<p><b>${escapar(termo.titulo)}</b></p><ul>${termo.itens.map((i) => `<li>✓ ${escapar(i)}</li>`).join("")}</ul>`
      + `<p>${escapar(termo.pergunta)} — <b>Sim.</b></p><p>A página: <a href="${link}">${link}</a>. No Arquionie, o envio ganhou a etiqueta APROVADO.</p>`,
  };
}

async function avisar(acao: string, aviso: Record<string, unknown>) {
  const chave = Deno.env.get("RESEND_API_KEY");
  if (!chave || !aviso?.email) return;
  const { assunto, html } = textoDoAviso(acao, aviso);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: DE, to: [aviso.email], subject: assunto, html }),
    });
    if (!r.ok) console.error("cliente: e-mail", r.status, await r.text());
  } catch (e) {
    console.error("cliente: e-mail", e);
  }
}

export async function tratar(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...CORS, "Access-Control-Allow-Headers": CORS["Access-Control-Allow-Headers"] + ", x-limpeza" } });
  if (req.method !== "POST") return responder({ erro: "use POST" }, 405);
  try {
    const corpo = await req.json().catch(() => ({}));
    const codigo = String(corpo.codigo ?? "").slice(0, 12), envio = Number(corpo.envio) || 0, nome = String(corpo.nome ?? "").slice(0, 200);
    if ((corpo.acao === "comentar" || corpo.acao === "aprovar") && !(await cabe(db, "cliente", req))) {
      return responder({ ok: false, motivo: "Muitas respostas daqui agora. Tente de novo daqui a uma hora." });
    }

    if (corpo.acao === "comentar") {
      const comentarios = Array.isArray(corpo.comentarios) ? corpo.comentarios.slice(0, 60) : [];
      const d = await rpc("apresentacao_comentar", { p_codigo: codigo, p_numero: envio, p_nome: nome, p_comentarios: comentarios });
      if (!d.ok) return responder(d);
      await avisar("comentar", d.aviso);
      return responder({ ok: true, situacao: d.situacao });
    }

    if (corpo.acao === "aprovar") {
      const itens = Array.isArray(corpo.itens) ? corpo.itens.slice(0, 20) : [];
      const d = await rpc("apresentacao_aprovar", { p_codigo: codigo, p_numero: envio, p_nome: nome, p_itens: itens });
      if (!d.ok) return responder(d);
      await avisar("aprovar", d.aviso);
      return responder({ ok: true, situacao: d.situacao, em: d.em });
    }

    // A limpeza diária: os envios vencidos saem do R2. Só com o segredo da tarefa.
    if (corpo.acao === "limpar") {
      const segredo = Deno.env.get("LIMPEZA_SEGREDO");
      if (!segredo || req.headers.get("x-limpeza") !== segredo) return responder({ erro: "só a tarefa do servidor" }, 401);
      const d = await rpc("apresentacao_vencidas", {});
      for (const prefixo of d.prefixos as string[]) await apagar((await listar(prefixo)).map((o) => o.chave));
      return responder({ ok: true, prefixos: d.prefixos });
    }

    return responder({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    console.error("cliente:", e);
    return new Response("erro no servidor", { status: 500, headers: CORS });
  }
}

Deno.serve(tratar);
