// Teste da migração 20261109000000_passar_pagina_para_outra_conta.sql num Postgres local (PGlite). Não toca no Supabase de verdade.
// Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/passar-pagina.test.mjs
const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, tentar, novaConta, db } = banco;
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };

console.log("\n== passar a página para outra conta ==");
const palheta = await novaConta("escritorio@palhetaarquitetura.com");
const edi = await novaConta("edi@exemplo.com.br");
const natanael = await novaConta("natanael@exemplo.com.br");
const outro = await novaConta("outro@exemplo.com.br");
await db.query(`update auth.users set raw_user_meta_data = '{"nome":"Natanael"}' where id = $1`, [natanael]);
await db.query(`insert into public.equipe (responsavel_id, email, situacao, entrou_em) values ($1, 'edi@exemplo.com.br', 'ativo', now())`, [palheta]);

let pasta = 0;
async function enviar(dono, chave, nome, codigo, { publicar = true, enviadoPor = dono } = {}) {
  const r = await chamar("service_role", null, "apresentacao_enviar", {
    p_usuario: dono, p_chave: chave, p_nome: nome, p_fase: "aprovacao", p_para_quem: "BANCA", p_mudancas: "", p_dias: 365,
    p_codigo: codigo, p_pasta: String(++pasta).padStart(16, "a"), p_enviado_por: enviadoPor,
  });
  if (publicar && r.ok) {
    await db.query(`update public.envios_apresentacao set situacao = 'aguardando', publicado_em = now() where id = $1`, [r.envio]);
    await db.query(`update public.apresentacoes set envio = $2 where id = $1`, [r.id, r.numero]);
  }
  return r;
}
const donoDe = async (id) => (await db.query(`select usuario_id from public.apresentacoes where id = $1`, [id])).rows[0]?.usuario_id;
const lista = async (quem, area = null) =>
  (await chamar("authenticated", quem, "minhas_apresentacoes", { p_area: area })).apresentacoes.map((a) => a.codigo).sort();
const como = (quem, nome, args = {}) => chamar("authenticated", quem, nome, args);

// a página do TCC, enviada pela Palheta; e uma vazia do Natanael, do envio dele que parou no meio
const tcc = await enviar(palheta, "chave-tcc", "/10 · CENTRO DE CONVENÇÕES BEZALEL", "SWUDEV");
const vazia = await enviar(natanael, "chave-tcc", "/10 · CENTRO DE CONVENÇÕES BEZALEL", "VZZA22", { publicar: false });
confere(tcc.ok && vazia.ok, "os envios");

// quem pode passar
let r = await como(edi, "apresentacao_passar", { p_id: tcc.id, p_email: "natanael@exemplo.com.br" });
confere(!r.ok && r.motivo.startsWith("Só o dono"), "quem é da equipe, sem ser o responsável, não passa: " + JSON.stringify(r));
r = await como(palheta, "apresentacao_passar", { p_id: tcc.id, p_email: "nao-e-email" });
confere(!r.ok && r.motivo.includes("e-mail"), "o e-mail inválido");
r = await como(palheta, "apresentacao_passar", { p_id: tcc.id, p_email: "Escritorio@PalhetaArquitetura.com" });
confere(!r.ok && r.motivo === "Esse é o e-mail desta conta.", "o próprio e-mail");

// passar ao Natanael
r = await como(palheta, "apresentacao_passar", { p_id: tcc.id, p_email: " Natanael@Exemplo.com.br " });
confere(r.ok && r.passada === false && r.conta === true && r.para === "Natanael", "o pedido ao Natanael: " + JSON.stringify(r));
confere((await donoDe(tcc.id)) === palheta, "até o aceite, a página fica com a Palheta");
r = await como(palheta, "apresentacao_passar", { p_id: tcc.id, p_email: "outro@exemplo.com.br" });
confere(!r.ok && r.motivo.includes("esperando"), "um pedido de cada vez");
let cartoes = await como(palheta, "passagens_das_minhas_apresentacoes", {});
confere(cartoes.length === 1 && cartoes[0].situacao === "esperando" && cartoes[0].para === "Natanael" && cartoes[0].apresentacao === tcc.id,
  "o cartão da Palheta esperando: " + JSON.stringify(cartoes));
cartoes = await como(edi, "passagens_das_minhas_apresentacoes", { p_area: palheta });
confere(cartoes.length === 1, "quem é da equipe vê a espera na área do escritório");

// o que chega ao Natanael (e a mais ninguém)
let chegou = await como(natanael, "passagens_para_mim", {});
confere(chegou.passagens.length === 1 && chegou.passagens[0].nome.includes("BEZALEL") && chegou.passagens[0].de === "escritorio@palhetaarquitetura.com"
  && chegou.passagens[0].codigo === "SWUDEV" && chegou.temIdentidade === false, "chegou ao Natanael: " + JSON.stringify(chegou));
confere((await como(outro, "passagens_para_mim", {})).passagens.length === 0, "a outro, não chega nada");
r = await como(outro, "apresentacao_responder_passagem", { p_passagem: chegou.passagens[0].id, p_aceitar: true });
confere(!r.ok && (await donoDe(tcc.id)) === palheta, "outra conta não aceita o pedido do Natanael");

// cancelar e pedir de novo
r = await como(palheta, "apresentacao_cancelar_passagem", { p_id: tcc.id });
confere(r.ok && (await como(natanael, "passagens_para_mim", {})).passagens.length === 0, "cancelado, some do Natanael");
r = await como(palheta, "apresentacao_passar", { p_id: tcc.id, p_email: "natanael@exemplo.com.br" });
confere(r.ok, "o pedido de novo");

// recusar
chegou = await como(natanael, "passagens_para_mim", {});
r = await como(natanael, "apresentacao_responder_passagem", { p_passagem: chegou.passagens[0].id, p_aceitar: false });
confere(r.ok && r.aceita === false && (await donoDe(tcc.id)) === palheta, "recusado, a página fica");
cartoes = await como(palheta, "passagens_das_minhas_apresentacoes", {});
confere(cartoes.length === 1 && cartoes[0].situacao === "recusada" && cartoes[0].para === "Natanael", "o cartão diz que ele recusou");

// o pedido vencido
r = await como(palheta, "apresentacao_passar", { p_id: tcc.id, p_email: "natanael@exemplo.com.br" });
await db.query(`update public.passagens_de_apresentacao set vence_em = now() - interval '1 day' where situacao = 'esperando'`);
confere((await como(natanael, "passagens_para_mim", {})).passagens.length === 0, "o vencido não aparece");
r = await como(palheta, "apresentacao_passar", { p_id: tcc.id, p_email: "natanael@exemplo.com.br" });
confere(r.ok, "depois de vencer, pede de novo: " + JSON.stringify(r));

// aceitar: a página vazia dele sai, a do TCC é dele, com o mesmo link
chegou = await como(natanael, "passagens_para_mim", {});
r = await como(natanael, "apresentacao_responder_passagem", { p_passagem: chegou.passagens[0].id, p_aceitar: true });
confere(r.ok && r.aceita && r.codigo === "SWUDEV", "aceito: " + JSON.stringify(r));
confere((await donoDe(tcc.id)) === natanael && (await donoDe(vazia.id)) === undefined, "a página é dele e a vazia saiu");
confere(JSON.stringify(await lista(natanael)) === JSON.stringify(["SWUDEV"]) && (await lista(palheta)).length === 0, "nas listas");
const envios = (await db.query(`select count(*)::int n from public.envios_apresentacao where apresentacao_id = $1`, [tcc.id])).rows[0].n;
confere(envios === 1, "o envio foi junto");
r = await como(natanael, "apresentacao_responder_passagem", { p_passagem: chegou.passagens[0].id, p_aceitar: true });
confere(!r.ok, "aceitar duas vezes não vale");

// o envio seguinte dele, com o arquivo que guardou o "em nome do escritório" da Palheta: o mesmo link
const dono = await chamar("service_role", null, "dono_do_envio", { p_quem: natanael, p_escritorio: palheta, p_chave: "chave-tcc" });
confere(dono === natanael, "dono_do_envio: a página dele");
const deNovo = await enviar(natanael, "chave-tcc", "/10 · CENTRO DE CONVENÇÕES BEZALEL", "NVVZ77", { publicar: false });
confere(deNovo.ok && deNovo.codigo === "SWUDEV", "o envio seguinte no mesmo link: " + JSON.stringify(deNovo));
const onde = await como(natanael, "apresentacao_onde", { p_codigo: "SWUDEV", p_chave: "chave-tcc", p_escritorio: palheta });
confere(onde.minha === true && onde.mesmoLink === true && onde.semEquipe === false, "o programa dele vê a página como sua: " + JSON.stringify(onde));
confere((await chamar("service_role", null, "dono_do_envio", { p_quem: outro, p_escritorio: palheta, p_chave: "chave-tcc" })) === null,
  "quem não tem a página e não é da equipe continua sem dono");
confere((await chamar("service_role", null, "dono_do_envio", { p_quem: edi, p_escritorio: palheta, p_chave: "x" })) === palheta,
  "quem é da equipe envia ao escritório, como antes");

// quem já tem uma página publicada do mesmo projeto não aceita
const deOutro = await enviar(outro, "chave-tcc", "/10 · CÓPIA", "XTRA88");
r = await como(natanael, "apresentacao_passar", { p_id: tcc.id, p_email: "outro@exemplo.com.br" });
chegou = await como(outro, "passagens_para_mim", {});
r = await como(outro, "apresentacao_responder_passagem", { p_passagem: chegou.passagens[0].id, p_aceitar: true });
confere(!r.ok && r.motivo.includes("XTRA88") && (await donoDe(tcc.id)) === natanael && (await donoDe(deOutro.id)) === outro,
  "com a página publicada dele, não aceita: " + JSON.stringify(r));
await como(natanael, "apresentacao_cancelar_passagem", { p_id: tcc.id });

// para o escritório da equipe: na hora
const doEdi = await enviar(edi, "chave-236", "236 - ASSEMBLEIA DE DEUS EDIFICANDO VIDAS", "YHJH28");
r = await como(outro, "apresentacao_passar", { p_id: deOutro.id, p_escritorio: palheta });
confere(!r.ok && r.motivo.includes("equipe"), "fora da equipe, não passa ao escritório");
r = await como(edi, "apresentacao_passar", { p_id: doEdi.id, p_escritorio: palheta });
confere(r.ok && r.passada === true && (await donoDe(doEdi.id)) === palheta, "o 236 passa ao escritório na hora: " + JSON.stringify(r));
confere(JSON.stringify(await lista(edi, palheta)) === JSON.stringify(["YHJH28"]), "na área do escritório");

// sem conta: o pedido espera pelo e-mail e aparece quando a conta é criada
r = await como(natanael, "apresentacao_passar", { p_id: tcc.id, p_email: "nova@exemplo.com.br" });
confere(r.ok && r.conta === false && r.para === "nova@exemplo.com.br", "para quem ainda não tem conta: " + JSON.stringify(r));
const nova = await novaConta("nova@exemplo.com.br");
confere((await como(nova, "passagens_para_mim", {})).passagens.length === 1, "criada a conta, o pedido aparece");
const naoConfirmada = await novaConta("nao-confirmada@exemplo.com.br", false);
await como(natanael, "apresentacao_cancelar_passagem", { p_id: tcc.id });
await como(natanael, "apresentacao_passar", { p_id: tcc.id, p_email: "nao-confirmada@exemplo.com.br" });
confere((await como(naoConfirmada, "passagens_para_mim", {})).passagens.length === 0, "sem o e-mail confirmado, não aparece");

// ninguém de fora lê a tabela
const linhas = await tentar("authenticated", outro, "passagens_das_minhas_apresentacoes", { p_area: palheta });
confere(linhas.erro, "a área de outro escritório: sem permissão");

console.log(`\n${certos} de ${certos + ruins.length} conferências da passagem da página passaram.`);
if (ruins.length) process.exitCode = 1;
