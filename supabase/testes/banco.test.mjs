// Teste das migrações do banco do Arquionie num Postgres local (PGlite), com um "auth" de mentira no formato do Supabase.
// Não toca no Supabase de verdade. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/banco.test.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PASTA = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
export const db = new PGlite();
const falhas = [];
let passos = 0;
export function confere(cond, msg) {
  passos++;
  if (!cond) { falhas.push(msg); console.log("  FALHOU: " + msg); }
}

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz,
    raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now(), last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`);

for (const f of readdirSync(PASTA).filter((f) => f.endsWith(".sql")).sort()) {
  try {
    await db.exec(readFileSync(join(PASTA, f), "utf8"));
    console.log("migração aplicada: " + f);
  } catch (e) {
    console.log("ERRO NA MIGRAÇÃO " + f + ": " + e.message);
    process.exit(1);
  }
}

// Chama uma função como um papel do Supabase (anon, authenticated, service_role), com ou sem conta.
export async function chamar(papel, uid, nome, args = {}) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${papel}`);
    if (uid) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const k = Object.keys(args);
    const r = await tx.query(`select public.${nome}(${k.map((x, i) => `${x} => $${i + 1}`).join(", ")}) as r`,
      k.map((x) => (args[x] !== null && typeof args[x] === "object" ? JSON.stringify(args[x]) : args[x])));
    return r.rows[0].r;
  });
}
export async function tentar(...a) {
  try { return { ok: await chamar(...a) }; } catch (e) { return { erro: e.message, codigo: e.code }; }
}
async function sqlComo(papel, uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${papel}`);
    if (uid) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    return (await tx.query(sql, params)).rows;
  });
}
export async function novaConta(email, confirmada = true) {
  return (await db.query(`insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id`,
    [email, confirmada ? new Date().toISOString() : null])).rows[0].id;
}
const umAno = () => new Date(Date.now() + 365 * 864e5).toISOString();

// ── contas ──
const admin = await novaConta("gestor@exemplo.com.br");
await db.query(`insert into public.administradores (usuario_id) values ($1)`, [admin]);
const ana = await novaConta("ana@exemplo.com.br");

console.log("\n1. /gestao libera 3 licenças para a Ana (sem titular)");
let r = await chamar("authenticated", admin, "gestao_liberar",
  { p_dono_email: "Ana@Exemplo.com.br ", p_produto: "arquionie-revit", p_quantidade: 3, p_expira_em: umAno() });
confere(r.ok && r.quantidade === 3 && r.contaExiste, "liberar 3 licenças: " + JSON.stringify(r));
let g = await chamar("authenticated", admin, "gestao_licencas");
confere(g.resumo.semTitular === 3, "resumo: 3 sem titular, veio " + g.resumo.semTitular);
r = await tentar("authenticated", ana, "gestao_licencas");
confere(r.erro && r.codigo === "42501", "quem não é gestor não vê o /gestao: " + JSON.stringify(r));
r = await tentar("anon", null, "gestao_licencas");
confere(r.erro, "anônimo não chama o /gestao");

console.log("\n2. A Ana fica com uma e passa outra para o Bruno (sem conta ainda)");
let m = await chamar("authenticated", ana, "minhas_licencas");
confere(m.comprou.length === 3 && m.comprou.every((x) => x.situacao === "sem titular"), "Ana vê as 3 sem titular");
const [l1, l2, l3] = m.comprou.map((x) => x.id);
r = await chamar("authenticated", ana, "licenca_ficar", { p_id: l1 });
confere(r.ok, "FICAR COM ESTA: " + JSON.stringify(r));
r = await chamar("authenticated", ana, "licenca_ficar", { p_id: l2 });
confere(!r.ok && /já usa/.test(r.motivo), "não fica com duas: " + JSON.stringify(r));
r = await chamar("authenticated", ana, "licenca_passar", { p_id: l2, p_email: "brunno@exemplo.com.br" });
confere(r.ok && r.esperandoConta, "passa para e-mail errado (sem conta): " + JSON.stringify(r));
r = await chamar("authenticated", ana, "licenca_passar", { p_id: l2, p_email: "bruno@exemplo.com.br" });
confere(r.ok, "corrige o e-mail enquanto ele não tem conta: " + JSON.stringify(r));
r = await chamar("authenticated", ana, "licenca_passar", { p_id: l3, p_email: "bruno@exemplo.com.br" });
confere(!r.ok && /já tem uma licença/.test(r.motivo), "o Bruno não recebe duas: " + JSON.stringify(r));
r = await chamar("authenticated", ana, "licenca_passar", { p_id: l3, p_email: "sem-arroba" });
confere(!r.ok, "e-mail inválido recusado");

console.log("\n3. O Bruno cria a conta e confirma: a licença se liga sozinha");
const bruno = await novaConta("bruno@exemplo.com.br", false);
let lic = (await db.query(`select usuario_id from public.licencas where id = $1`, [l2])).rows[0];
confere(lic.usuario_id === null, "antes de confirmar, não liga");
await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [bruno]);
lic = (await db.query(`select usuario_id from public.licencas where id = $1`, [l2])).rows[0];
confere(lic.usuario_id === bruno, "ao confirmar, liga");
r = await chamar("authenticated", ana, "licenca_passar", { p_id: l2, p_email: "carla@exemplo.com.br" });
confere(!r.ok && r.proximaTroca, "com o Bruno usando, só troca daqui a 30 dias: " + JSON.stringify(r));
m = await chamar("authenticated", ana, "minhas_licencas");
confere(m.comprou.find((x) => x.id === l2).proximaTroca, "MINHA CONTA mostra a próxima troca");

console.log("\n4. Quem lê o quê");
let linhas = await sqlComo("authenticated", bruno, `select id from public.licencas`);
confere(linhas.length === 1 && linhas[0].id === l2, "o Bruno lê só a licença que usa");
linhas = await sqlComo("authenticated", ana, `select id from public.licencas`);
confere(linhas.length === 3, "a Ana lê as 3 que comprou");
r = await sqlComo("authenticated", bruno, `select credencial_hash from public.computadores`).then(() => "leu", (e) => e.message);
confere(/permission denied/.test(r), "o navegador não lê o resumo da credencial: " + r);
r = await tentar("anon", null, "minhas_licencas");
confere(r.erro, "anônimo não chama minhas_licencas");
r = await tentar("authenticated", bruno, "conexao_iniciar",
  { p_codigo: "X", p_segredo_hash: "x", p_produto: "arquionie-revit", p_maquina: "M", p_nome: "N", p_versao: "1" });
confere(r.erro, "o navegador não chama as funções do servidor");

console.log("\n5. Conexão pelo navegador e o limite de 3 computadores por produto");
async function conectar(uid, codigo, maquina, desconectar = null) {
  const hs = "segredo-" + codigo, hc = "credencial-" + codigo;
  await chamar("service_role", null, "conexao_iniciar",
    { p_codigo: codigo, p_segredo_hash: hs, p_produto: "arquionie-revit", p_maquina: maquina, p_nome: maquina, p_versao: "5.0.0" });
  const a = await chamar("authenticated", uid, "conexao_autorizar", { p_codigo: codigo.toLowerCase().replace("-", " "), p_desconectar: desconectar });
  if (a.situacao !== "autorizada") return { autorizar: a };
  const c = await chamar("service_role", null, "conexao_concluir", { p_segredo_hash: hs, p_credencial_hash: hc });
  return { autorizar: a, concluir: c, credencial: hc };
}
await chamar("service_role", null, "conexao_iniciar",
  { p_codigo: "ABCD-EFGH", p_segredo_hash: "s0", p_produto: "arquionie-revit", p_maquina: "MAQ1", p_nome: "ESCRITORIO-03", p_versao: "5.0.0" });
r = await chamar("service_role", null, "conexao_concluir", { p_segredo_hash: "s0", p_credencial_hash: "c0" });
confere(r.situacao === "aguardando", "antes de AUTORIZAR, o programa fica aguardando");
let v = await chamar("authenticated", bruno, "conexao_ver", { p_codigo: "abcd efgh" });
confere(v.situacao === "aguardando" && v.computador === "ESCRITORIO-03" && v.plano === "pro" && v.emUso === 0, "/conectar mostra o pedido: " + JSON.stringify(v));
await chamar("authenticated", bruno, "conexao_autorizar", { p_codigo: "ABCD-EFGH" });
r = await chamar("service_role", null, "conexao_concluir", { p_segredo_hash: "s0", p_credencial_hash: "c1" });
confere(r.situacao === "autorizada" && r.maquina === "MAQ1", "AUTORIZAR conecta: " + JSON.stringify(r));
const maq1 = r.computador;
r = await chamar("service_role", null, "conexao_concluir", { p_segredo_hash: "s0", p_credencial_hash: "c9" });
confere(r.situacao === "inexistente", "o segredo vale uma vez só");
let e = await chamar("service_role", null, "licenca_estado", { p_credencial_hash: "c1", p_maquina: "MAQ1", p_versao: "5.0.1" });
confere(e.situacao === "ok" && e.plano === "pro" && e.canal === "revit-estavel" && e.email === "bruno@exemplo.com.br", "a ficha: " + JSON.stringify(e));
confere(new Date(e.valeAte) <= new Date(Date.now() + 31 * 864e5), "vale até 30 dias sem internet");
e = await chamar("service_role", null, "licenca_estado", { p_credencial_hash: "c1", p_maquina: "OUTRA", p_versao: "5.0.1" });
confere(e.situacao === "desconectado", "credencial em outra máquina não vale");
await conectar(bruno, "BBBB-0002", "MAQ2");
await conectar(bruno, "BBBB-0003", "MAQ3");
r = await conectar(bruno, "BBBB-0004", "MAQ4");
confere(r.autorizar.situacao === "limite" && r.autorizar.computadores.length === 3, "o 4º pede para desconectar um: " + JSON.stringify(r.autorizar.situacao));
r = await conectar(bruno, "BBBB-0005", "MAQ5", maq1);
confere(r.concluir && r.concluir.situacao === "autorizada", "DESCONECTAR E AUTORIZAR: " + JSON.stringify(r.concluir));
e = await chamar("service_role", null, "licenca_estado", { p_credencial_hash: "c1", p_maquina: "MAQ1", p_versao: "5.0.1" });
confere(e.situacao === "desconectado", "o computador desconectado perde a ficha");
r = await chamar("authenticated", bruno, "registrar_computador", { p_id: "MAQ1", p_nome: "ESCRITORIO-03", p_versao: "0.2.0" });
confere(r.situacao === "ok", "o programa tem o seu próprio limite (o plugin já usa 3): " + JSON.stringify(r));
r = await chamar("authenticated", bruno, "registrar_computador", { p_id: "MAQ1", p_nome: "ESCRITORIO-03", p_versao: "0.2.1" });
confere(r.situacao === "ok", "o programa renova o mesmo computador");
await chamar("service_role", null, "conexao_iniciar",
  { p_codigo: "VVVV-0001", p_segredo_hash: "sv", p_produto: "arquionie-revit", p_maquina: "MAQV", p_nome: "V", p_versao: "5" });
await db.query(`update public.conexoes set expira_em = now() - interval '1 minute' where codigo = 'VVVV-0001'`);
v = await chamar("authenticated", bruno, "conexao_ver", { p_codigo: "VVVV-0001" });
confere(v.situacao === "vencida", "código vencido: " + JSON.stringify(v));
await chamar("service_role", null, "conexao_iniciar",
  { p_codigo: "CCCC-0001", p_segredo_hash: "sc", p_produto: "arquionie-revit", p_maquina: "MAQC", p_nome: "C", p_versao: "5" });
await chamar("authenticated", bruno, "conexao_cancelar", { p_codigo: "CCCC-0001" });
r = await chamar("service_role", null, "conexao_concluir", { p_segredo_hash: "sc", p_credencial_hash: "cc" });
confere(r.situacao === "cancelada", "CANCELAR no site avisa o programa");

console.log("\n6. Grátis com conta: testes de 3 usos por conta");
const diana = await novaConta("diana@exemplo.com.br");
const cd = await conectar(diana, "DDDD-0001", "MAQD");
e = await chamar("service_role", null, "licenca_estado", { p_credencial_hash: cd.credencial, p_maquina: "MAQD", p_versao: "5" });
confere(e.plano === "gratis" && e.expiraEm === null, "sem licença, o plano é o grátis: " + e.plano);
const usos = [];
for (let i = 0; i < 4; i++) usos.push((await chamar("service_role", null, "licenca_usar_teste", { p_credencial_hash: cd.credencial, p_ferramenta: "CmdTelhado" })).permitido);
confere(JSON.stringify(usos) === "[true,true,true,false]", "3 usos e o 4º recusado: " + JSON.stringify(usos));
r = await chamar("service_role", null, "licenca_testes", { p_credencial_hash: cd.credencial });
confere(r.usados.CmdTelhado === 3, "contagem sem gastar: " + JSON.stringify(r));
r = await chamar("service_role", null, "licenca_usar_teste", { p_credencial_hash: "credencial-BBBB-0005", p_ferramenta: "CmdTelhado" });
confere(r.ilimitado === true, "com PRO, teste não conta: " + JSON.stringify(r));
r = await chamar("service_role", null, "licenca_sair", { p_credencial_hash: cd.credencial });
e = await chamar("service_role", null, "licenca_estado", { p_credencial_hash: cd.credencial, p_maquina: "MAQD", p_versao: "5" });
confere(e.situacao === "desconectado", "SAIR tira o computador da conta");

console.log("\n7. Importação do Flow, bônus da convivência e ações do gestor");
r = await chamar("authenticated", admin, "gestao_importar_flow", { p_linhas: [
  { email: "Erika@Exemplo.com.br", expira_em: "2027-08-12T00:00:00Z", quantidade: 1 },
  { email: "firma@exemplo.com.br", expira_em: "2027-08-12T00:00:00Z", quantidade: 2 },
  { email: "sem-arroba", expira_em: "2027-08-12", quantidade: 1 },
  { email: "x@exemplo.com.br", expira_em: "2027-08-12", quantidade: "dois" } ] });
confere(r.importados === 2 && r.licencas === 3 && r.problemas.length === 2, "importa 2 clientes, 3 licenças, 2 problemas: " + JSON.stringify(r));
r = await chamar("authenticated", admin, "gestao_importar_flow", { p_linhas: [{ email: "erika@exemplo.com.br", expira_em: "2027-08-12T00:00:00Z", quantidade: 1 }] });
confere(r.pulados === 1 && r.licencas === 0, "rodar de novo não duplica");
const erikaAntes = (await db.query(`select expira_em from public.licencas where email = 'erika@exemplo.com.br'`)).rows[0].expira_em;
const erika1 = await novaConta("erika1@exemplo.com.br");
r = await chamar("authenticated", admin, "gestao_ajustes_licenca", { p_fim_convivencia: new Date(Date.now() + 90 * 864e5).toISOString() });
confere(r.fim_convivencia, "o gestor marca o fim da convivência");
await novaConta("erika@exemplo.com.br");
lic = (await db.query(`select expira_em, bonus_em, usuario_id from public.licencas where email = 'erika@exemplo.com.br'`)).rows[0];
const dias = Math.round((new Date(lic.expira_em) - new Date(erikaAntes)) / 864e5);
confere(lic.usuario_id && lic.bonus_em && dias === 30, "entrou no prazo: +30 dias (veio +" + dias + ")");
const firma = (await db.query(`select count(*)::int as n from public.licencas where dono_email = 'firma@exemplo.com.br' and email is null`)).rows[0].n;
confere(firma === 2, "várias licenças importadas ficam sem titular para o dono distribuir");
g = await chamar("authenticated", admin, "gestao_licencas");
const id4 = g.licencas.find((x) => x.titular === "erika@exemplo.com.br").id;
r = await chamar("authenticated", admin, "gestao_renovar", { p_id: id4, p_meses: 12 });
confere(r.ok && new Date(r.expiraEm) > new Date(lic.expira_em), "RENOVAR soma 12 meses");
r = await chamar("authenticated", admin, "gestao_revogar", { p_id: id4 });
confere(r.ok, "REVOGAR");
g = await chamar("authenticated", admin, "gestao_licencas");
confere(g.licencas.find((x) => x.id === id4).situacao === "revogada", "aparece como revogada");
r = await chamar("authenticated", admin, "gestao_reativar", { p_id: id4 });
confere(r.ok, "REATIVAR");
r = await chamar("authenticated", admin, "gestao_trocar_email", { p_id: id4, p_qual: "titular", p_email: "erika1@exemplo.com.br" });
lic = (await db.query(`select usuario_id from public.licencas where id = $1`, [id4])).rows[0];
confere(r.ok && lic.usuario_id === erika1, "TROCAR E-MAIL liga na conta que já existe");
r = await chamar("authenticated", admin, "gestao_copia_licencas");
const hist = r.historico.filter((h) => h.licenca_id === id4).map((h) => h.acao);
confere(r.licencas.length === 6 && hist.includes("renovada") && hist.includes("revogada") && hist.includes("e-mail trocado pelo gestor"),
  "a cópia traz licenças e histórico: " + JSON.stringify(hist));

console.log(`\n${passos - falhas.length} de ${passos} conferências passaram.`);
process.exitCode = falhas.length ? 1 : 0;
