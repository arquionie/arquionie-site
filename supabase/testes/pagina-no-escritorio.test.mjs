// Teste da página do cliente passada ao escritório (migração 20261104000000_pagina_passada_ao_escritorio.sql e o
// supabase/ferramentas/passar-paginas-ao-escritorio.sql) num Postgres local (PGlite). Não toca no Supabase de verdade. Rodar da raiz do
// site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/pagina-no-escritorio.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, novaConta, db } = banco;
const AQUI = dirname(fileURLToPath(import.meta.url));
const FERRAMENTA = readFileSync(join(AQUI, "..", "ferramentas", "passar-paginas-ao-escritorio.sql"), "utf8");
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };

console.log("\n== a página passada ao escritório ==");
const escritorio = await novaConta("escritorio@palhetaarquitetura.com");
const kemily = await novaConta("kemilyarq@gmail.com");
const fora = await novaConta("fora@exemplo.com.br");
await db.query(`insert into public.equipe (responsavel_id, email, situacao, entrou_em) values ($1, 'kemilyarq@gmail.com', 'ativo', now())`,
  [escritorio]);

let pasta = 0;
async function enviar(quem, chave, nome, codigo, dono = quem) {
  return chamar("service_role", null, "apresentacao_enviar", {
    p_usuario: dono, p_chave: chave, p_nome: nome, p_fase: "aprovacao", p_para_quem: "IGREJA", p_mudancas: "", p_dias: 365,
    p_codigo: codigo, p_pasta: String(++pasta).padStart(16, "a"), p_enviado_por: quem,
  });
}
// publica o envio (o concluir, sem o R2)
async function publicar(r) {
  await db.query(`update public.envios_apresentacao set situacao = 'aguardando', publicado_em = now() where id = $1`, [r.envio]);
  await db.query(`update public.apresentacoes set envio = $2 where id = $1`, [r.id, r.numero]);
}
const daArea = async (quem, area = null) =>
  (await chamar("authenticated", quem, "minhas_apresentacoes", { p_area: area })).apresentacoes.map((a) => a.codigo).sort();

// o 236 e o Start Kids pela área da Kemily, e um outro projeto dela que fica
const r236 = await enviar(kemily, "chave-236", "236 - ASSEMBLEIA DE DEUS EDIFICANDO VIDAS", "YHJH28");
await publicar(r236);
const rKids = await enviar(kemily, "chave-212-2", "212-2 - IGREJA BATISTA BETEL — START KIDS - A03", "SKDS23");
await publicar(rKids);
const rOutro = await enviar(kemily, "chave-outro", "999 - OUTRO PROJETO", "PTRQ45");
await publicar(rOutro);
confere(r236.codigo === "YHJH28" && rKids.codigo === "SKDS23", "os envios da Kemily na área dela");
confere((await daArea(escritorio)).length === 0, "antes, a área do escritório vazia");

// a ferramenta
let linhas = (await db.query(FERRAMENTA)).rows;
const linha = (p) => linhas.find((l) => l.projeto.startsWith(p));
confere(linhas.length === 3, "três linhas: o 236, o Start Kids e o 225 — " + linhas.length);
confere(linha("236")?.resultado.startsWith("PASSOU AO ESCRITÓRIO") && linha("236")?.estava_na_conta === "kemilyarq@gmail.com",
  "o 236 passa ao escritório: " + JSON.stringify(linha("236")));
confere(linha("212-2")?.resultado.startsWith("PASSOU AO ESCRITÓRIO"), "o Start Kids passa ao escritório");
confere(linha("236")?.quem_enviou_esta_na_equipe === "sim", "a Kemily está na equipe");
confere(linha("236")?.link === "https://www.arquionie.com.br/t/YHJH28", "o link fica o mesmo");
confere(linha("225")?.resultado.includes("nenhuma página do 225"), "o 225 sem página: " + JSON.stringify(linha("225")));
confere(JSON.stringify(await daArea(escritorio)) === JSON.stringify(["SKDS23", "YHJH28"]), "depois, os dois na área do escritório");
confere(JSON.stringify(await daArea(kemily, escritorio)) === JSON.stringify(["SKDS23", "YHJH28"]), "a Kemily os vê na área do escritório");
confere(JSON.stringify(await daArea(kemily)) === JSON.stringify(["PTRQ45"]), "na área dela fica só o outro projeto");

// o envio seguinte do programa, pela área da Kemily (o projeto aberto sem o "em nome de"): o mesmo link, no escritório
const r236b = await enviar(kemily, "chave-236", "236 - ASSEMBLEIA DE DEUS EDIFICANDO VIDAS", "NVQX22");
const dono236 = (await db.query(`select usuario_id from public.apresentacoes where id = $1`, [r236b.id])).rows[0].usuario_id;
const enviado = (await db.query(`select enviado_por from public.envios_apresentacao where id = $1`, [r236b.envio])).rows[0].enviado_por;
confere(r236b.ok && r236b.codigo === "YHJH28" && r236b.numero === 2, "o envio seguinte vai ao mesmo link: " + JSON.stringify(r236b));
confere(dono236 === escritorio && enviado === kemily, "a página fica do escritório e o envio diz que foi a Kemily");
confere((await db.query(`select count(*)::int as n from public.apresentacoes where chave = 'chave-236'`)).rows[0].n === 1,
  "nenhuma página nova do 236");

// quem não está na equipe não pega a página do escritório pela chave
const rFora = await enviar(fora, "chave-236", "236 - CÓPIA", "FRAA33");
const donoFora = (await db.query(`select usuario_id from public.apresentacoes where id = $1`, [rFora.id])).rows[0].usuario_id;
confere(rFora.ok && rFora.codigo === "FRAA33" && donoFora === fora, "quem está fora da equipe cria a sua página");

// o envio de um projeto novo da Kemily continua na área dela
const rNovo = await enviar(kemily, "chave-nova", "998 - PROJETO NOVO", "NWPR56");
const donoNovo = (await db.query(`select usuario_id from public.apresentacoes where id = $1`, [rNovo.id])).rows[0].usuario_id;
confere(donoNovo === kemily, "o projeto novo dela fica na área dela");

// rodar de novo não muda nada
linhas = (await db.query(FERRAMENTA)).rows;
confere(linha("236")?.resultado === "já estava no escritório" && linha("212-2")?.resultado === "já estava no escritório",
  "a segunda vez: já estava no escritório");

console.log(`\n${certos} de ${certos + ruins.length} conferências da página no escritório passaram.`);
if (ruins.length) process.exitCode = 1;
