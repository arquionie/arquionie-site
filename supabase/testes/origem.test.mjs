// Teste da origem da conta e do designer de interiores na atuação (migração 20261019010000_origem_da_conta.sql): o perfil guarda a
// primeira origem, limpa, e nunca troca; o Google ganha a origem no primeiro acesso; o /gestao conta as contas por origem e as ativadas.
// Num Postgres local (PGlite); não toca no Supabase de verdade. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/origem.test.mjs
const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { tentar, chamar, novaConta, db } = banco;
import { readFileSync } from "node:fs";
await db.exec(readFileSync(new URL("../migrations/20261019010000_origem_da_conta.sql", import.meta.url), "utf8"));
console.log("migração da origem aplicada pela segunda vez: ok");
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };
const perfil = async (id) => (await db.query(`select atuacao, origem from public.perfis where id = $1`, [id])).rows[0];
const criar = async (email, meta, { confirmada = true, ha = 0 } = {}) => (await db.query(
  `insert into auth.users (email, email_confirmed_at, raw_user_meta_data, created_at)
   values ($1, $2, $3, now() - make_interval(days => $4)) returning id`,
  [email, confirmada ? new Date().toISOString() : null, JSON.stringify(meta), ha])).rows[0].id;
const mudarMeta = (id, meta) => db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || $2 where id = $1`, [id, JSON.stringify(meta)]);
let formularios = 0;
async function pedidoPeloFormulario(usuario, ha = 0) {
  const f = (await db.query(`insert into public.comercial_formularios (usuario_id, codigo, nome, perguntas) values ($1, $2, 'Casa', '[]') returning id`,
    [usuario, `TESTE-${++formularios}`])).rows[0].id;
  await db.query(`insert into public.comercial_pedidos (usuario_id, numero, formulario_id, etapa, nome, criado_em)
                  values ($1, 1, $2, 'solicitacao', 'Cliente', now() - make_interval(days => $3))`, [usuario, f, ha]);
}

console.log("\n1. O cadastro por e-mail com a origem do anúncio");
const ana = await criar("ana@exemplo.com.br", {
  nome: "Ana", atuacao: "designer",
  origem: { utm_source: "instagram", utm_medium: "paid", utm_campaign: "cadastros-frio", entrada: "/comercial", em: "2026-10-19T12:00:00Z",
            marcada: true, lixo: "x", fbclid: 123 },
});
let p = await perfil(ana);
confere(p.atuacao === "designer", "o designer de interiores entra na atuação: " + p.atuacao);
confere(p.origem?.utm_source === "instagram" && p.origem.utm_campaign === "cadastros-frio" && p.origem.entrada === "/comercial",
  "a origem vai para o perfil: " + JSON.stringify(p.origem));
confere(!("lixo" in p.origem) && !("marcada" in p.origem) && !("fbclid" in p.origem), "só as marcas conhecidas, e só em texto: " + JSON.stringify(p.origem));

console.log("\n2. A primeira origem não muda");
await mudarMeta(ana, { nome: "Ana Souza", origem: { utm_source: "outra" } });
p = await perfil(ana);
confere(p.origem.utm_source === "instagram", "mudar os metadados depois não troca a origem: " + p.origem.utm_source);

console.log("\n3. Pelo Google, a origem chega no primeiro acesso");
const bia = await criar("bia@exemplo.com.br", { full_name: "Bia Lima" });
confere((await perfil(bia)).origem === null, "a conta do Google nasce sem a origem");
await mudarMeta(bia, { atuacao: "arquiteto", origem: { de: "bio", referencia: "instagram.com" } });
p = await perfil(bia);
confere(p.origem?.de === "bio" && p.origem.referencia === "instagram.com", "o Completar grava a origem: " + JSON.stringify(p.origem));

console.log("\n4. O que vem estranho do navegador");
const caio = await criar("caio@exemplo.com.br", { origem: { utm_source: "x".repeat(500) } });
confere((await perfil(caio)).origem.utm_source.length === 200, "texto comprido corta em 200 letras");
const duda = await criar("duda@exemplo.com.br", { origem: "instagram" });
confere((await perfil(duda)).origem === null, "origem que não é objeto não entra");
const eva = await criar("eva@exemplo.com.br", { origem: { utm_source: "   ", outra: "y" } });
confere((await perfil(eva)).origem === null, "origem sem nada útil fica vazia");
const ruim = await criar("ruim@exemplo.com.br", { atuacao: "pedreiro" }).then(() => null, (e) => e.message);
confere(ruim, "atuação fora da lista não entra");

console.log("\n5. O /gestao conta as contas por origem");
const fabi = await criar("fabi@exemplo.com.br", { origem: { de: "selo" } }, { ha: 10 });
const gui = await criar("gui@exemplo.com.br", { origem: { fbclid: "IwAR0abc" } }, { confirmada: false });
const hel = await criar("hel@exemplo.com.br", { origem: { referencia: "google.com" } });
await pedidoPeloFormulario(ana); // ativada: pedido no mesmo dia
await pedidoPeloFormulario(fabi, 0); // conta de 10 dias, pedido hoje: fora dos 7 dias
const admin = await novaConta("gestor.origem@exemplo.com.br");
await db.query(`insert into public.administradores (usuario_id) values ($1)`, [admin]);
let linhas = await chamar("authenticated", admin, "gestao_contas_por_origem", {});
const linha = (fonte, meio = "", campanha = "") => linhas.find((l) => l.fonte === fonte && l.meio === meio && l.campanha === campanha);
let l = linha("instagram", "paid", "cadastros-frio");
confere(l && l.contas === 1 && l.confirmadas === 1 && l.ativadas === 1, "o anúncio: 1 conta, confirmada e ativada: " + JSON.stringify(l));
confere(linha("bio")?.contas === 1 && linha("bio").ativadas === 0, "a bio, pelo ?de=: " + JSON.stringify(linha("bio")));
l = linha("selo");
confere(l?.contas === 1 && l.ativadas === 0, "pedido depois de 7 dias não ativa: " + JSON.stringify(l));
l = linha("meta, sem campanha");
confere(l?.contas === 1 && l.confirmadas === 0, "o fbclid sem marca vira 'meta, sem campanha', e sem confirmar: " + JSON.stringify(l));
confere(linha("google.com")?.contas === 1, "sem marca, o site que mandou");
confere(linha("sem registro")?.contas >= 1, "as contas sem a origem ficam em 'sem registro'");
confere(linhas[0].contas >= linhas.at(-1).contas, "as linhas vêm da que tem mais contas para a que tem menos");
linhas = await chamar("authenticated", admin, "gestao_contas_por_origem", { p_dias: 5 });
confere(!linha("selo") && linha("bio"), "o período deixa de fora a conta de 10 dias");
let r = await tentar("authenticated", ana, "gestao_contas_por_origem", {});
confere(r.erro && r.codigo === "42501", "quem não é gestor não vê: " + JSON.stringify(r));
r = await tentar("anon", null, "gestao_contas_por_origem", {});
confere(r.erro, "sem conta não vê");
r = await tentar("authenticated", ana, "origem_limpa", { o: { de: "x" } });
confere(r.erro, "a limpeza é só por dentro");
void hel; void gui; void caio; void eva; void duda;

console.log(`\nOrigem da conta: ${certos} certos, ${ruins.length} falharam.`);
if (ruins.length) { console.log(ruins.map((m) => " - " + m).join("\n")); process.exit(1); }
