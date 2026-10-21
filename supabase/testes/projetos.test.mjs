// Teste dos PROJETOS DO ESCRITÓRIO (migração 20261020120000_projetos_do_escritorio.sql; doc 73 do programa, etapa 1): o dono, a chave
// entregue só a quem tem acesso (o dono, a equipe ativa e os convidados), o pedido de acesso, a cópia aberta e a cópia de segurança das
// chaves, num Postgres local (PGlite). Não toca no Supabase de verdade. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/projetos.test.mjs
const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, tentar, novaConta, db } = banco;
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
await db.exec(readFileSync(new URL("../migrations/20261020120000_projetos_do_escritorio.sql", import.meta.url), "utf8"));
console.log("migração dos projetos aplicada pela segunda vez: ok");
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };
const novaChave = () => randomBytes(32).toString("base64");

const edi = await novaConta("edi.projetos@exemplo.com.br");
await chamar("authenticated", edi, "gravar_escritorio", { p: { nome: "PALHETA ARQUITETURA" } });
const osmar = await novaConta("osmar.projetos@exemplo.com.br");
await chamar("authenticated", edi, "equipe_cadastrar", { p_email: "osmar.projetos@exemplo.com.br" });
await chamar("authenticated", osmar, "equipe_responder", { p_responsavel: edi, p_entrar: true });
const engenheiro = await novaConta("calculista@exemplo.com.br");

console.log("\n1. O projeto do escritório: o Osmar registra, a equipe abre");
const p225 = randomUUID(), chave225 = novaChave();
let r = await chamar("authenticated", osmar, "projeto_registrar", { p_projeto: p225, p_dono: edi, p_nome: "225 · Templo", p_chave: chave225 });
confere(r.ok && r.chave === chave225 && r.dono === edi && r.papel === "equipe" && r.nomeDoDono === "PALHETA ARQUITETURA",
  "o Osmar registra o 225 em nome do escritório: " + JSON.stringify(r));
r = await chamar("authenticated", edi, "projeto_chave", { p_projeto: p225 });
confere(r.ok && r.chave === chave225 && r.papel === "dono" && r.nome === "225 · Templo", "ÊDI, o dono, recebe a mesma chave");
r = await chamar("authenticated", osmar, "projeto_registrar", { p_projeto: p225, p_dono: osmar, p_nome: "225 · Templo (novo nome)", p_chave: novaChave() });
confere(r.ok && r.chave === chave225 && r.dono === edi && r.nome === "225 · Templo (novo nome)",
  "registrar de novo não troca o dono nem a chave; o nome se atualiza: " + JSON.stringify(r));

console.log("\n2. O engenheiro com uma cópia, sem convite");
r = await chamar("authenticated", engenheiro, "projeto_chave", { p_projeto: p225 });
confere(!r.ok && r.motivo === "sem_acesso" && r.nomeDoDono === "PALHETA ARQUITETURA" && r.pedido === null && r.chave === undefined,
  "não recebe a chave; vê de quem é o projeto: " + JSON.stringify(r));
r = await chamar("authenticated", engenheiro, "projeto_registrar", { p_projeto: p225, p_dono: engenheiro, p_nome: "meu", p_chave: novaChave() });
confere(!r.ok && r.motivo === "sem_acesso" && r.chave === undefined, "registrar o mesmo projeto na conta dele não dá a chave");
r = await chamar("authenticated", engenheiro, "projeto_registrar", { p_projeto: randomUUID(), p_dono: edi, p_nome: "x", p_chave: novaChave() });
confere(!r.ok && /equipe/.test(r.motivo), "quem não é da equipe não cria projeto do escritório: " + r.motivo);
r = await chamar("authenticated", engenheiro, "projeto_chave", { p_projeto: randomUUID() });
confere(!r.ok && r.motivo === "desconhecido", "projeto que o servidor não conhece");

console.log("\n3. PEDIR ACESSO e a resposta do dono");
r = await chamar("authenticated", engenheiro, "projeto_pedir_acesso", { p_projeto: p225 });
confere(r.ok && r.nomeDoDono === "PALHETA ARQUITETURA", "o pedido entra: " + JSON.stringify(r));
r = await chamar("authenticated", engenheiro, "projeto_pedir_acesso", { p_projeto: p225 });
confere(r.ok, "pedir de novo não duplica");
r = await chamar("authenticated", engenheiro, "projeto_chave", { p_projeto: p225 });
confere(!r.ok && r.pedido === "esperando", "a tela de quem pediu diz que espera o escritório");
let pedidos = await chamar("authenticated", osmar, "projeto_pedidos");
confere(pedidos.length === 0, "o pedido chega ao responsável, não à equipe");
pedidos = await chamar("authenticated", edi, "projeto_pedidos");
confere(pedidos.length === 1 && pedidos[0].email === "calculista@exemplo.com.br" && pedidos[0].projeto === p225 && pedidos[0].nomeDoProjeto === "225 · Templo (novo nome)",
  "ÊDI vê o pedido: " + JSON.stringify(pedidos));
r = await chamar("authenticated", osmar, "projeto_responder_pedido", { p_pedido: pedidos[0].id, p_aceitar: true });
confere(!r.ok, "a equipe não aceita pedido");
r = await chamar("authenticated", edi, "projeto_responder_pedido", { p_pedido: pedidos[0].id, p_aceitar: true });
confere(r.ok, "ÊDI aceita como convidado");
r = await chamar("authenticated", engenheiro, "projeto_chave", { p_projeto: p225 });
confere(r.ok && r.chave === chave225 && r.papel === "convidado" && r.convidado.papel === "ver" && r.convidado.pranchas && !r.convidado.baixar && !r.convidado.ajustes,
  "o convidado recebe a chave, só para ver as pranchas: " + JSON.stringify(r));
r = await chamar("authenticated", engenheiro, "projeto_pedir_acesso", { p_projeto: p225 });
confere(r.ok && r.jaTem, "quem já tem acesso não pede de novo");
const outroEng = await novaConta("eletrica@exemplo.com.br");
await chamar("authenticated", outroEng, "projeto_pedir_acesso", { p_projeto: p225 });
pedidos = await chamar("authenticated", edi, "projeto_pedidos");
r = await chamar("authenticated", edi, "projeto_responder_pedido", { p_pedido: pedidos[0].id, p_aceitar: false });
r = await chamar("authenticated", outroEng, "projeto_chave", { p_projeto: p225 });
confere(!r.ok && r.pedido === "recusado", "RECUSAR: sem a chave, e a tela diz que foi recusado");
await chamar("authenticated", outroEng, "projeto_pedir_acesso", { p_projeto: p225 });
r = await chamar("authenticated", outroEng, "projeto_chave", { p_projeto: p225 });
confere(r.pedido === "esperando", "pedir de novo depois de recusado vale como pedido novo");

console.log("\n4. A MINHA ÁREA do Osmar");
const paralelo = randomUUID(), chaveParalelo = novaChave();
r = await chamar("authenticated", osmar, "projeto_registrar", { p_projeto: paralelo, p_dono: osmar, p_nome: "Casa do Osmar", p_chave: chaveParalelo });
confere(r.ok && r.papel === "dono" && r.dono === osmar, "o projeto paralelo é do Osmar");
r = await chamar("authenticated", edi, "projeto_chave", { p_projeto: paralelo });
confere(!r.ok && r.motivo === "sem_acesso", "o escritório não abre o projeto da MINHA ÁREA do Osmar");

console.log("\n5. Para nunca ficar refém do servidor");
r = await chamar("authenticated", osmar, "projeto_copia_aberta", { p_projeto: p225 });
confere(!r.ok, "a equipe não salva cópia aberta do projeto do escritório");
r = await chamar("authenticated", edi, "projeto_copia_aberta", { p_projeto: p225 });
confere(r.ok, "o responsável salva");
r = await chamar("authenticated", osmar, "projeto_copia_aberta", { p_projeto: paralelo });
confere(r.ok, "na MINHA ÁREA, o Osmar é o dono");
let sit = await chamar("authenticated", edi, "copia_de_seguranca_situacao");
confere(sit.projetos === 1 && sit.faltam === 1 && sit.baixadaEm === null, "antes da cópia de segurança, falta 1: " + JSON.stringify(sit));
r = await chamar("authenticated", edi, "chaves_do_escritorio");
confere(r.ok && r.escritorio === "PALHETA ARQUITETURA" && r.projetos.length === 1 && r.projetos[0].chave === chave225,
  "a cópia de segurança traz as chaves do escritório, e só as dele: " + JSON.stringify(r.projetos.map((p) => p.nome)));
sit = await chamar("authenticated", edi, "copia_de_seguranca_situacao");
confere(sit.faltam === 0 && sit.baixadaEm, "depois da cópia, não falta nenhum");
await new Promise((ok) => setTimeout(ok, 5));
await chamar("authenticated", edi, "projeto_registrar", { p_projeto: randomUUID(), p_dono: edi, p_nome: "226", p_chave: novaChave() });
sit = await chamar("authenticated", edi, "copia_de_seguranca_situacao");
confere(sit.projetos === 2 && sit.faltam === 1, "o projeto novo fica de fora até a próxima cópia: " + JSON.stringify(sit));
const registro = (await db.query(`select acao, usuario_id from public.projeto_registro where usuario_id = $1 order by id`, [edi])).rows.map((x) => x.acao);
confere(registro.join() === "copia_aberta,copia_de_seguranca", "fica registrado quem salvou a cópia aberta e baixou a cópia de segurança: " + registro);

console.log("\n6. Quem sai da equipe perde os projetos do escritório");
const pessoas = (await chamar("authenticated", edi, "minha_equipe")).pessoas;
await chamar("authenticated", edi, "equipe_tirar", { p_id: pessoas.find((p) => p.email === "osmar.projetos@exemplo.com.br").id });
r = await chamar("authenticated", osmar, "projeto_chave", { p_projeto: p225 });
confere(!r.ok && r.motivo === "sem_acesso" && r.chave === undefined, "o Osmar fora da equipe não recebe mais a chave do 225");
r = await chamar("authenticated", osmar, "projeto_chave", { p_projeto: paralelo });
confere(r.ok && r.chave === chaveParalelo, "o projeto da MINHA ÁREA fica com ele");

console.log("\n7. A chave e as portas");
r = await chamar("authenticated", edi, "projeto_registrar", { p_projeto: randomUUID(), p_dono: edi, p_nome: "x", p_chave: randomBytes(16).toString("base64") });
confere(!r.ok && /32 bytes/.test(r.motivo), "a chave de outro tamanho é recusada");
r = await chamar("authenticated", edi, "projeto_registrar", { p_projeto: randomUUID(), p_dono: edi, p_nome: "x", p_chave: "isto não é base64!" });
confere(!r.ok, "a chave que não é base64 é recusada");
for (const [nome, args] of [["projeto_chave", { p_projeto: p225 }], ["projeto_registrar", { p_projeto: p225, p_dono: edi, p_nome: "x", p_chave: chave225 }],
                            ["chaves_do_escritorio", {}], ["projeto_pedidos", {}]]) {
  r = await tentar("anon", null, nome, args);
  confere(r.erro, `sem conta não chama ${nome}`);
}
for (const nome of ["papel_no_projeto", "chave_do_projeto"]) {
  r = await tentar("authenticated", edi, nome, { p_quem: edi, p_projeto: p225 });
  confere(r.erro, `a conta não chama ${nome} direto`);
}
r = await db.query(`set role authenticated`).then(() => db.query(`select chave from public.projetos`))
  .then((q) => ({ linhas: q.rows.length })).catch((e) => ({ erro: e.message }));
await db.query(`reset role`);
confere(r.erro || r.linhas === 0, "ninguém lê a tabela das chaves direto (só pelas funções)");

console.log(`\nProjetos do escritório: ${certos} certos, ${ruins.length} falharam.`);
if (ruins.length) { console.log(ruins.map((m) => " - " + m).join("\n")); process.exit(1); }
