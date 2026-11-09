// Teste do supabase/ferramentas/passar-pagina-do-tcc-ao-natanael.sql num Postgres local (PGlite). Não toca no Supabase de verdade. Rodar da
// raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/pagina-do-tcc.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, novaConta, db } = banco;
const AQUI = dirname(fileURLToPath(import.meta.url));
const FERRAMENTA = readFileSync(join(AQUI, "..", "ferramentas", "passar-pagina-do-tcc-ao-natanael.sql"), "utf8");
const comEmail = (email) => FERRAMENTA.replace("EMAIL-DO-NATANAEL", email);
const rodar = async (email) => { const r = await db.exec(comEmail(email)); return r[r.length - 1].rows[0]; };
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };

console.log("\n== a página do TCC passada ao Natanael ==");
const escritorio = await novaConta("escritorio@palhetaarquitetura.com");
const natanael = await novaConta("natanael.tcc@exemplo.com.br");
await db.query(`update public.perfis set nome = 'Natanael Souza' where id = $1`, [natanael]);

let pasta = 0;
async function enviar(dono, chave, nome, codigo, publicar = true) {
  const r = await chamar("service_role", null, "apresentacao_enviar", {
    p_usuario: dono, p_chave: chave, p_nome: nome, p_fase: "aprovacao", p_para_quem: "BANCA", p_mudancas: "", p_dias: 365,
    p_codigo: codigo, p_pasta: String(++pasta).padStart(16, "a"), p_enviado_por: dono,
  });
  if (publicar) {
    await db.query(`update public.envios_apresentacao set situacao = 'aguardando', publicado_em = now() where id = $1`, [r.envio]);
    await db.query(`update public.apresentacoes set envio = $2 where id = $1`, [r.id, r.numero]);
  }
  return r;
}
const daConta = async (quem) =>
  (await chamar("authenticated", quem, "minhas_apresentacoes", { p_area: null })).apresentacoes.map((a) => a.codigo).sort();
const donoDe = async (id) => (await db.query(`select usuario_id from public.apresentacoes where id = $1`, [id])).rows[0]?.usuario_id;

// o envio do Natanael que parou no meio (a página criada, nunca publicada) e o da Palheta, publicado
const vazia = await enviar(natanael, "chave-tcc", "/10 · CENTRO DE CONVENÇÕES BEZALEL", "VZZA22", false);
const tcc = await enviar(escritorio, "chave-tcc", "/10 · CENTRO DE CONVENÇÕES BEZALEL", "BZLL34");
const outro = await enviar(escritorio, "chave-203", "203 - MINISTERIO APOSTOLICO VIDA PLENA", "VDPL56");
confere(vazia.ok && tcc.ok && tcc.codigo === "BZLL34", "os envios: " + JSON.stringify([vazia, tcc]));

// o e-mail errado: nada muda, e a linha mostra a conta dele
let l = await rodar("natanael@errado.com");
confere(l.resultado.startsWith("NÃO PASSOU: nenhuma conta") && l.resultado.includes("<natanael.tcc@exemplo.com.br>"),
  "o e-mail errado lista as contas com Natanael: " + l.resultado);
confere((await donoDe(tcc.id)) === escritorio && (await donoDe(vazia.id)) === natanael, "o e-mail errado não muda nada");

// o e-mail certo (com maiúsculas e espaço)
l = await rodar("  Natanael.TCC@exemplo.com.br ");
confere(l.resultado === "PASSOU PARA A CONTA DELE (natanael.tcc@exemplo.com.br)", "passa: " + JSON.stringify(l));
confere(l.link === "https://www.arquionie.com.br/t/BZLL34" && l.estava_na_conta === "escritorio@palhetaarquitetura.com",
  "o link e a conta de antes: " + JSON.stringify(l));
confere((await donoDe(tcc.id)) === natanael, "a página é dele");
confere((await donoDe(vazia.id)) === undefined, "a página vazia dele saiu");
confere(JSON.stringify(await daConta(natanael)) === JSON.stringify(["BZLL34"]), "na conta dele: " + JSON.stringify(await daConta(natanael)));
confere(JSON.stringify(await daConta(escritorio)) === JSON.stringify(["VDPL56"]), "na Palheta fica só o 203");
const envios = (await db.query(`select count(*)::int as n from public.envios_apresentacao where apresentacao_id = $1`, [tcc.id])).rows[0].n;
confere(envios === 1, "o envio vai junto: " + envios);

// o envio seguinte dele, pelo mesmo projeto, cai na mesma página
const deNovo = await enviar(natanael, "chave-tcc", "/10 · CENTRO DE CONVENÇÕES BEZALEL", "NVVA78", false);
confere(deNovo.ok && deNovo.codigo === "BZLL34" && deNovo.id === tcc.id, "o envio seguinte dele no mesmo link: " + JSON.stringify(deNovo));

// rodar de novo não muda nada
l = await rodar("natanael.tcc@exemplo.com.br");
confere(l.resultado === "já estava na conta dele (natanael.tcc@exemplo.com.br)", "a segunda vez: " + l.resultado);

// a página publicada dele não sai: outra página do mesmo projeto em outra conta não passa
const fora = await novaConta("fora@exemplo.com.br");
const deFora = await enviar(fora, "chave-tcc", "/10 · CENTRO DE CONVENÇÕES BEZALEL (cópia)", "FRAA92");
l = await rodar("natanael.tcc@exemplo.com.br");
confere(l.resultado.startsWith("NÃO PASSOU: a conta dele já tem uma página publicada") && l.resultado.includes("BZLL34"),
  "com a página dele publicada, não passa: " + l.resultado);
confere((await donoDe(deFora.id)) === fora && (await donoDe(tcc.id)) === natanael, "e nada muda");

console.log(`\n${certos} de ${certos + ruins.length} conferências da página do TCC passaram.`);
if (ruins.length) process.exitCode = 1;
