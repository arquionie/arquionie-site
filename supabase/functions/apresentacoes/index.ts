// Arquionie™ — o ENVIAR PARA O CLIENTE (mockup docs/mockups/enviar-para-o-cliente.html do repositório do programa, aprovado por
// ÊDI em 11/10/2026; contrato no doc 65 de lá; migração 20261011000000_apresentacoes.sql). Quem chama tem conta: o programa.
//
// Os arquivos de um envio vão pela impressão digital (SHA-256) do conteúdo, em apresentacoes/CODIGO-PASTA/arquivos/IMPRESSAO.ext:
// o que já está no R2 (do envio publicado) não sobe de novo, e a página só troca quando o envio.json do envio novo é publicado.
//
//   POST { acao: "enviar", chave, nome, fase: "aprovacao" | "final", paraQuem, mudancas, dias, arquivos: [{ arquivo, tamanho }],
//          escritorio? }
//     -> { ok: true, id, envio, numero, codigo, link, expiraEm, envios: [{ arquivo, url }], jaNoServidor }
//        (arquivo = IMPRESSAO.ext; as URLs valem 1 hora, para PUT, com o Content-Type e o Cache-Control que o programa mandar)
//     -> { ok: false, motivo: "plano" | "limite" | "fase" | "equipe", texto }
//        (escritorio: a conta do responsável, quando quem envia está na equipe dele e o envio vai em nome do escritório; a
//        apresentação é do escritório, e quem enviou fica no envio — migração 20261011010000_equipe_e_plano.sql)
//   POST { acao: "concluir", envio, manifesto, arquivos: [IMPRESSAO.ext], tamanho }
//     -> { ok: true, codigo, numero, link }   (confere no R2 que tudo subiu, publica e apaga o que mais nenhum envio usa)
//   POST { acao: "excluir", id }                     -> { ok: true }   (apaga a apresentação e os arquivos dela)
//   POST { acao: "logo", tipo: "png" | "svg" | "jpg", tamanho } -> { ok: true, logo, url }
//   POST { acao: "logoConcluir", logo }              -> { ok: true, logo }   (confere que subiu, grava e apaga o de antes)
//   (A limpeza diária dos vencidos fica na função cliente, que não pede conta: a tarefa do Supabase a chama com o segredo.)
//
// Publicar com a verificação de JWT ligada. Segredos: os do R2 (ver ../_compartilhado/r2.ts) e, opcional, SITE_URL.

import { createClient } from "npm:@supabase/supabase-js@2";
import { ALFABETO, MINUSCULAS, CORS, apagar, existe, listar, responder, sorteio, urlDeEnvio } from "../_compartilhado/r2.ts";

const SITE = Deno.env.get("SITE_URL") ?? "https://www.arquionie.com.br";
const ARQUIVO = /^[0-9a-f]{64}\.(json|bin|jpg|png|svg|webp|m3u8|m4s|mp4|txt)$/;
const LIMITE_ARQUIVOS = 8000, LIMITE_ARQUIVO = 300 * 1024 * 1024, LIMITE_TAMANHO = 6 * 1024 * 1024 * 1024;
const LIMITE_LOGO = 2 * 1024 * 1024;

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

export async function tratar(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ erro: "use POST" }, 405);
  try {
    const corpo = await req.json().catch(() => ({}));

    const usuario = await quem(req);
    if (!usuario) return responder({ erro: "entre com a conta" }, 401);

    if (corpo.acao === "enviar") {
      const chave = String(corpo.chave ?? "").slice(0, 200), nome = String(corpo.nome ?? "").trim().slice(0, 200);
      const arquivos = Array.isArray(corpo.arquivos) ? corpo.arquivos : [];
      if (!chave || !nome) return responder({ erro: "faltam a chave e o nome" }, 400);
      if (arquivos.length === 0 || arquivos.length > LIMITE_ARQUIVOS) return responder({ erro: "arquivos demais ou nenhum" }, 400);
      let total = 0;
      const vistos = new Set<string>();
      for (const a of arquivos) {
        const arquivo = String(a.arquivo ?? ""), tamanho = Number(a.tamanho);
        if (!ARQUIVO.test(arquivo)) return responder({ erro: `nome de arquivo inválido: ${arquivo}` }, 400);
        if (!(tamanho >= 0) || tamanho > LIMITE_ARQUIVO) return responder({ erro: `arquivo grande demais: ${arquivo}` }, 400);
        if (vistos.has(arquivo)) continue;
        vistos.add(arquivo); total += tamanho;
      }
      if (total > LIMITE_TAMANHO) return responder({ erro: "o envio passa de 6 GB" }, 400);
      // em nome de quem: a própria conta, ou o escritório em cuja equipe quem envia está
      const escritorio = corpo.escritorio ? String(corpo.escritorio) : null;
      if (escritorio && !/^[0-9a-f-]{36}$/i.test(escritorio)) return responder({ erro: "escritório inválido" }, 400);
      const dono = await rpc("escritorio_para_enviar", { p_quem: usuario, p_escritorio: escritorio });
      if (!dono) return responder({ ok: false, motivo: "equipe", texto: "Você não está na equipe deste escritório. Envie pela sua área ou fale com o responsável." });
      for (let tentativa = 0; tentativa < 8; tentativa++) {
        let d;
        try {
          d = await rpc("apresentacao_enviar", {
            p_usuario: dono, p_chave: chave, p_nome: nome, p_fase: String(corpo.fase ?? "aprovacao"),
            p_para_quem: String(corpo.paraQuem ?? ""), p_mudancas: String(corpo.mudancas ?? ""),
            p_dias: Number(corpo.dias) || null, p_codigo: sorteio(ALFABETO, 6), p_pasta: sorteio(MINUSCULAS, 16),
            p_enviado_por: usuario,
          });
        } catch (e) {
          if ((e as { code?: string }).code === "23505") continue; // código repetido: sorteia outro
          throw e;
        }
        if (!d.ok) return responder(d);
        const jaEstao = new Set<string>(d.existentes ?? []);
        const envios = [];
        for (const arquivo of vistos) if (!jaEstao.has(arquivo)) envios.push({ arquivo, url: await urlDeEnvio(d.prefixo + arquivo) });
        return responder({ ok: true, id: d.id, envio: d.envio, numero: d.numero, codigo: d.codigo, link: `${SITE}/t/${d.codigo}`,
          expiraEm: d.expiraEm, envios, jaNoServidor: vistos.size - envios.length });
      }
      throw new Error("não deu para sortear um código livre");
    }

    if (corpo.acao === "concluir") {
      const lugar = await rpc("apresentacao_do_envio", { p_usuario: usuario, p_envio: String(corpo.envio ?? "") });
      if (!lugar.ok) return responder(lugar);
      const arquivos = [...new Set((Array.isArray(corpo.arquivos) ? corpo.arquivos : []).map(String))] as string[];
      const manifesto = String(corpo.manifesto ?? "");
      if (arquivos.some((a) => !ARQUIVO.test(a)) || !arquivos.includes(manifesto)) return responder({ ok: false, motivo: "A lista dos arquivos veio errada: envie de novo." });
      const noServidor = new Map((await listar(lugar.prefixo)).map((o) => [o.chave.slice(lugar.prefixo.length), o.tamanho]));
      const faltam = arquivos.filter((a) => !noServidor.has(a));
      if (faltam.length) return responder({ ok: false, motivo: `${faltam.length} arquivo(s) não chegaram ao servidor: envie de novo.`, faltam: faltam.slice(0, 20) });
      const d = await rpc("apresentacao_concluir", {
        p_usuario: usuario, p_envio: String(corpo.envio), p_manifesto: manifesto, p_lista: arquivos,
        p_tamanho: arquivos.reduce((s, a) => s + (noServidor.get(a) ?? 0), 0),
      });
      if (!d.ok) return responder(d);
      await apagar((d.apagar as string[]).map((a) => lugar.prefixo + a));
      return responder({ ok: true, codigo: d.codigo, numero: d.numero, pausada: d.pausada, link: `${SITE}/t/${d.codigo}` });
    }

    if (corpo.acao === "excluir") {
      const d = await rpc("apresentacao_excluir", { p_usuario: usuario, p_id: String(corpo.id ?? "") });
      if (!d.ok) return responder(d);
      await apagar((await listar(d.prefixo)).map((o) => o.chave));
      return responder({ ok: true });
    }

    if (corpo.acao === "logo") {
      const tipo = String(corpo.tipo ?? ""), tamanho = Number(corpo.tamanho);
      if (!["png", "svg", "jpg"].includes(tipo)) return responder({ ok: false, motivo: "O logo vai em PNG, SVG ou JPG." });
      if (!(tamanho > 0) || tamanho > LIMITE_LOGO) return responder({ ok: false, motivo: "O logo passa de 2 MB." });
      const d = await rpc("escritorio_pasta", { p_usuario: usuario, p_pasta: sorteio(MINUSCULAS, 16) });
      const logo = `escritorios/${d.pasta}/logo-${d.proximo}.${tipo}`;
      return responder({ ok: true, logo, url: await urlDeEnvio(logo) });
    }

    if (corpo.acao === "logoConcluir") {
      const logo = String(corpo.logo ?? "");
      if (!/^escritorios\/[a-z0-9]{16}\/logo-[0-9]+\.(png|svg|jpg)$/.test(logo)) return responder({ ok: false, motivo: "Logo inválido." });
      if ((await existe(logo)) === null) return responder({ ok: false, motivo: "O logo não chegou ao servidor: envie de novo." });
      const d = await rpc("escritorio_logo", { p_usuario: usuario, p_logo: logo });
      if (!d.ok) return responder(d);
      if (d.apagar && d.apagar !== logo) await apagar([d.apagar]);
      return responder({ ok: true, logo });
    }

    return responder({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    console.error("apresentacoes:", e);
    return new Response("erro no servidor", { status: 500, headers: CORS });
  }
}

Deno.serve(tratar);
