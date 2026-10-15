// Teste do roteiro supabase/ferramentas/importar-licencas-e-contas-do-flow.sql num Postgres local (PGlite), com as
// colunas de auth.users e auth.identities que o roteiro preenche. Não toca no Supabase de verdade. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/contas-flow.test.mjs
import { readFileSync } from "node:fs";
const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { db, novaConta } = banco;
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };
const linha = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const umAno = () => new Date(Date.now() + 365 * 864e5).toISOString();

// As colunas do Supabase que o teste do banco não tem (o roteiro grava todas).
await db.exec(`
  alter table auth.users add column if not exists instance_id uuid, add column if not exists aud text,
    add column if not exists role text, add column if not exists encrypted_password text,
    add column if not exists updated_at timestamptz, add column if not exists confirmation_token text,
    add column if not exists recovery_token text, add column if not exists email_change_token_new text,
    add column if not exists email_change text, add column if not exists email_change_token_current text,
    add column if not exists reauthentication_token text, add column if not exists phone_change text,
    add column if not exists phone_change_token text;
  create table if not exists auth.identities (id uuid primary key, user_id uuid not null references auth.users (id),
    provider_id text not null, provider text not null, identity_data jsonb not null, created_at timestamptz, updated_at timestamptz,
    unique (provider_id, provider));
`);

const jaTem = await novaConta("ja.tem@exemplo.com.br");
await db.query(`update auth.users set encrypted_password = 'SENHA-DO-ARQUIONIE' where id = $1`, [jaTem]);
const idDoFlow = "11111111-2222-3333-4444-555555555555";
const exportacao = [{ dados: {
  geradoEm: new Date().toISOString(),
  licencas: [
    { email: "cliente.um@exemplo.com.br", expira_em: umAno(), quantidade: 1 },
    { email: "escritorio.tres@exemplo.com.br", expira_em: umAno(), quantidade: 3 },
    { email: "Ja.Tem@exemplo.com.br", expira_em: umAno(), quantidade: 1 },
    { email: "vencido@exemplo.com.br", expira_em: "2020-01-01T00:00:00Z", quantidade: 1 },
  ],
  contas: [
    { id: idDoFlow, email: "cliente.um@exemplo.com.br", senha: "$2a$10$abcdefghijklmnopqrstuvCLIENTEUMxxxxxxxxxxxxxxxxxxxxx", senha_definida: true, nome: "Cliente Um", confirmada_em: "2026-07-01T10:00:00Z", criada_em: "2026-07-01T10:00:00Z" },
    { id: "66666666-7777-8888-9999-000000000000", email: "escritorio.tres@exemplo.com.br", senha: "$2a$10$abcdefghijklmnopqrstuvESCRITORIOxxxxxxxxxxxxxxxxxxx", senha_definida: false, nome: "Escritório Três", confirmada_em: null, criada_em: "2026-08-01T10:00:00Z" },
    { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", email: "ja.tem@exemplo.com.br", senha: "$2a$10$abcdefghijklmnopqrstuvJATEMxxxxxxxxxxxxxxxxxxxxxxxx", senha_definida: true, nome: "Já Tem" },
  ],
} }];

const roteiro = readFileSync(new URL("../ferramentas/importar-licencas-e-contas-do-flow.sql", import.meta.url), "utf8");
const rodar = async (dados) => {
  await db.exec(roteiro.replace("COLE_AQUI_O_JSON", () => JSON.stringify(dados)));
  return Object.fromEntries((await db.query(`select item, quantidade, detalhe from resultado_importacao`)).rows.map((x) => [x.item, x]));
};

console.log("\n1. Primeira importação");
let r = await rodar(exportacao);
confere(r["licenças criadas"].quantidade === 5, "5 licenças (1 + 3 + 1; a vencida fica de fora): " + JSON.stringify(r["licenças criadas"]));
confere(r["contas criadas com a senha do Flow"].quantidade === 2 && /1 ainda não/.test(r["contas criadas com a senha do Flow"].detalhe),
  "2 contas novas, uma sem senha definida no Flow: " + JSON.stringify(r["contas criadas com a senha do Flow"]));
confere(r["contas que já existiam no Arquionie"].quantidade === 1 && r["contas que já existiam no Arquionie"].detalhe === "ja.tem@exemplo.com.br",
  "a conta que já existia é avisada pelo e-mail");
const um = await linha(`select * from auth.users where email = 'cliente.um@exemplo.com.br'`);
confere(um.id === idDoFlow && um.encrypted_password.includes("CLIENTEUM") && um.email_confirmed_at && um.aud === "authenticated" &&
        um.confirmation_token === "" && um.raw_user_meta_data.nome === "Cliente Um", "a conta nasce com o mesmo id, a mesma senha cifrada e o e-mail confirmado");
const ident = await linha(`select * from auth.identities where user_id = $1`, [idDoFlow]);
confere(ident && ident.provider === "email" && ident.provider_id === idDoFlow && ident.identity_data.email_verified === true,
  "a identidade de e-mail é criada (sem ela o login por senha não acha a conta)");
confere((await linha(`select nome from public.perfis where id = $1`, [idDoFlow])).nome === "Cliente Um", "o perfil do site nasce pelo gatilho de sempre");
let lic = await linha(`select * from public.licencas where dono_email = 'cliente.um@exemplo.com.br'`);
confere(lic.usuario_id === idDoFlow && lic.produto === "arquionie" && lic.origem === "importada-flow", "a licença de uma conta nova liga sozinha (licença única)");
const validadeFlow = new Date(exportacao[0].dados.licencas[0].expira_em).getTime();
confere(Math.round((new Date(lic.expira_em).getTime() - validadeFlow) / 864e5) === 30 && lic.bonus_em, "a licença entra com a validade do Flow mais 30 dias, marcada como bônus somado");
const tres = (await db.query(`select * from public.licencas where dono_email = 'escritorio.tres@exemplo.com.br'`)).rows;
confere(tres.length === 3 && tres.every((l) => l.email === null && l.dono_id), "três licenças no mesmo e-mail ficam SEM TITULAR, do dono, para ele distribuir");
const jt = await linha(`select encrypted_password from auth.users where id = $1`, [jaTem]);
lic = await linha(`select usuario_id from public.licencas where dono_email = 'ja.tem@exemplo.com.br'`);
confere(jt.encrypted_password === "SENHA-DO-ARQUIONIE" && lic.usuario_id === jaTem, "quem já tinha conta fica com a senha dele, e a licença liga nela");
confere(r["licenças deste arquivo já ligadas a uma conta"].quantidade === 2, "2 licenças já ligadas (as outras 3 esperam o dono distribuir)");

console.log("\n2. Rodar de novo não duplica");
r = await rodar(exportacao);
confere(r["licenças criadas"].quantidade === 0 && r["donos pulados"].quantidade === 3 && r["contas criadas com a senha do Flow"].quantidade === 0 &&
        r["contas que já existiam no Arquionie"].quantidade === 3, "segunda vez: nada novo " + JSON.stringify(r));
confere((await linha(`select count(*)::int as n from public.licencas where origem = 'importada-flow' and dono_email in ('cliente.um@exemplo.com.br', 'escritorio.tres@exemplo.com.br', 'ja.tem@exemplo.com.br')`)).n === 5, "continuam 5 licenças");
await db.query(`update public.ajustes_licenca set fim_convivencia = now() + interval '90 days'`);
await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [idDoFlow]);
lic = await linha(`select expira_em from public.licencas where dono_email = 'cliente.um@exemplo.com.br'`);
confere(Math.round((new Date(lic.expira_em).getTime() - validadeFlow) / 864e5) === 30, "o bônus não soma de novo quando a convivência começa");

console.log("\n3. Colar outra coisa não grava nada");
let erro = "";
try { await db.exec(roteiro.replace("COLE_AQUI_O_JSON", () => JSON.stringify([{ dados: { aulas: [] } }]))); } catch (e) { erro = e.message; }
confere(/Isto não é o resultado/.test(erro), "o roteiro recusa o arquivo errado: " + erro);
erro = "";
try { await db.exec(roteiro); } catch (e) { erro = e.message; }
confere(erro !== "", "rodar sem colar o JSON dá erro e não grava nada");

console.log(`\n${certos} de ${certos + ruins.length} conferências da importação das contas passaram.`);
process.exitCode = ruins.length || process.exitCode ? 1 : 0;
