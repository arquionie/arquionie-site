// Teste de em que conta está a página do cliente (migração 20261105000000_onde_esta_a_pagina.sql) num Postgres local (PGlite). Não toca
// no Supabase de verdade. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/onde-esta-a-pagina.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, novaConta, db } = banco;
const AQUI = dirname(fileURLToPath(import.meta.url));
const FERRAMENTA = readFileSync(join(AQUI, "..", "ferramentas", "passar-paginas-ao-escritorio.sql"), "utf8");
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };

console.log("\n== em que conta está a página ==");
const escritorio = await novaConta("escritorio@palhetaarquitetura.com");
const kemily = await novaConta("kemilyarq@gmail.com");
const fora = await novaConta("fora@exemplo.com.br");
await db.query(`insert into public.escritorios (usuario_id, nome) values ($1, 'PALHETA ARQUITETURA')`, [escritorio]);
await db.query(`insert into public.equipe (responsavel_id, email, situacao, entrou_em) values ($1, 'kemilyarq@gmail.com', 'ativo', now())`,
  [escritorio]);

let pasta = 0;
const enviar = (quem, chave, nome, codigo) => chamar("service_role", null, "apresentacao_enviar", {
  p_usuario: quem, p_chave: chave, p_nome: nome, p_fase: "aprovacao", p_para_quem: "IGREJA", p_mudancas: "", p_dias: 365,
  p_codigo: codigo, p_pasta: String(++pasta).padStart(16, "a"), p_enviado_por: quem,
});
const onde = (quem, codigo = "YHJH28", chave = "chave-236", esc = null) =>
  chamar("authenticated", quem, "apresentacao_onde", { p_codigo: codigo, p_chave: chave, p_escritorio: esc });

// o 236 enviado pela área da Kemily, sem o "em nome do escritório"
const r236 = await enviar(kemily, "chave-236", "236 - ASSEMBLEIA DE DEUS EDIFICANDO VIDAS", "YHJH28");
confere(r236.ok && r236.codigo === "YHJH28", "o 236 na área da Kemily");

let r = await onde(escritorio);
confere(r.ok && r.achada && r.email === "kemilyarq@gmail.com" && r.escritorio === null, "o escritório vê que a página é da Kemily: " + JSON.stringify(r));
confere(r.minha === false && r.naMinhaConta === false, "e que não está na área dele");
confere(r.mesmoLink === false && r.semEquipe === false, "e que o envio dele criaria outro link");
r = await onde(kemily);
confere(r.minha === true && r.naMinhaConta === true && r.mesmoLink === true, "a Kemily vê a página na área dela: " + JSON.stringify(r));
r = await onde(escritorio, "yhjh28 ");
confere(r.achada === true, "o código em minúsculas e com espaço também acha");

// sem a chave do projeto, nada se diz da página
r = await onde(escritorio, "YHJH28", "outra-chave");
confere(r.ok && r.achada === false && r.email === undefined, "com a chave errada, a página não aparece: " + JSON.stringify(r));
r = await onde(fora, "XXXXXX", "chave-236");
confere(r.ok && r.achada === false, "com o código errado, também não");
let recusou = false;
try { await chamar("anon", null, "apresentacao_onde", { p_codigo: "YHJH28", p_chave: "chave-236", p_escritorio: null }); }
catch { recusou = true; }
confere(recusou, "sem conta, a função recusa");

// a página passada ao escritório pela ferramenta
await db.query(FERRAMENTA);
r = await onde(escritorio);
confere(r.minha === true && r.mesmoLink === true && r.email === "escritorio@palhetaarquitetura.com" && r.escritorio === "PALHETA ARQUITETURA",
  "depois da ferramenta, a página é do escritório: " + JSON.stringify(r));
r = await onde(kemily);
confere(r.minha === false && r.naMinhaConta === true && r.mesmoLink === true,
  "a Kemily a vê na área do escritório e o envio dela vai ao mesmo link: " + JSON.stringify(r));
r = await onde(kemily, "YHJH28", "chave-236", escritorio);
confere(r.mesmoLink === true, "em nome do escritório, também o mesmo link");
r = await onde(fora);
confere(r.minha === false && r.naMinhaConta === false && r.mesmoLink === false, "quem está fora da equipe vê que criaria outro link");
r = await onde(fora, "YHJH28", "chave-236", escritorio);
confere(r.semEquipe === true && r.mesmoLink === false, "e, em nome do escritório, que não está na equipe");

console.log(`\n${certos} de ${certos + ruins.length} conferências de onde está a página passaram.`);
if (ruins.length) process.exitCode = 1;
