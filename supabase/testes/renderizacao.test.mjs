// Teste da migração 20261110000000_computadores_de_renderizacao.sql num Postgres local (PGlite). Não toca no Supabase de verdade.
// Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/renderizacao.test.mjs
const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, tentar, novaConta, db } = banco;
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };
const como = (quem, nome, args = {}) => chamar("authenticated", quem, nome, args);

console.log("\n== o computador de renderização ==");
const palheta = await novaConta("escritorio@palhetaarquitetura.com");
const edi = await novaConta("edi@exemplo.com.br");
const joao = await novaConta("joao@exemplo.com.br");
const outro = await novaConta("outro@exemplo.com.br");
await db.query(`update auth.users set raw_user_meta_data = '{"nome":"João"}' where id = $1`, [joao]);
for (const email of ["edi@exemplo.com.br", "joao@exemplo.com.br"])
  await db.query(`insert into public.equipe (responsavel_id, email, situacao, entrou_em) values ($1, $2, 'ativo', now())`, [palheta, email]);
// a máquina já era um computador de trabalho da conta do ÊDI
await db.query(`insert into public.computadores (usuario_id, produto, maquina, nome, versao) values ($1, 'arquionie', 'PREDATOR-ID', 'PREDATOR', '1.31.0')`, [edi]);

const info = { memoriaGb: 32, placa: "NVIDIA GeForce RTX 5070 Ti Laptop GPU", placaGb: 12, ritmo: { Imagem: 0.8, Panorama: 0.9, Video: 1 }, versao: "1.32.0" };

// o sinal liga a máquina no escritório da equipe
let r = await como(edi, "renderizador_sinal", { p_computador: "PREDATOR-ID", p_nome: "  ", p_info: info, p_estado: "livre" });
confere(!r.ok && r.motivo.includes("nome"), "sem nome: " + JSON.stringify(r));
r = await como(edi, "renderizador_sinal", { p_computador: "PREDATOR-ID", p_nome: " RENDER 1 ", p_info: info, p_estado: "livre" });
confere(r.ok && r.id && r.escritorio === "escritorio@palhetaarquitetura.com", "a máquina entra no escritório da equipe: " + JSON.stringify(r));
const render1 = r.id;
const donoDaMaquina = (await db.query(`select escritorio_id, nome from public.renderizadores where id = $1`, [render1])).rows[0];
confere(donoDaMaquina.escritorio_id === palheta && donoDaMaquina.nome === "RENDER 1", "o escritório e o nome sem os espaços");
const computadores = (await db.query(`select count(*)::int as n from public.computadores where usuario_id = $1`, [edi])).rows[0].n;
confere(computadores === 0, "a máquina de renderização não conta nos três computadores da conta");
r = await como(edi, "renderizador_sinal", { p_computador: "PREDATOR-ID", p_nome: "RENDER 1", p_info: info, p_estado: "livre" });
confere(r.ok && r.id === render1, "o segundo sinal é a mesma máquina");
r = await como(edi, "renderizador_sinal", { p_computador: "PREDATOR-ID", p_nome: "RENDER 1", p_info: info, p_estado: "dormindo" });
confere(!r.ok, "estado desconhecido");

// quem vê as máquinas
let lista = await como(joao, "renderizadores_do_escritorio");
confere(lista.length === 1 && lista[0].nome === "RENDER 1" && lista[0].estado === "livre" && lista[0].info.placaGb === 12 && lista[0].naFila === 0,
  "o João vê o RENDER 1 livre: " + JSON.stringify(lista));
confere((await como(outro, "renderizadores_do_escritorio")).length === 0, "quem é de fora não vê");
confere((await como(palheta, "renderizadores_do_escritorio")).length === 1, "o responsável vê");

// o pedido
const pedido = { itens: [{ chave: "C1", nome: "CENA 01 · FACHADA", tipo: "Imagem", segundos: 40 }, { chave: "P1", nome: "PANORAMA 01", tipo: "Panorama", segundos: 200 }],
  prontos: {}, jaProntos: [] };
const caminho = "Drives compartilhados\\02 OPERACIONAL\\203 - MINISTERIO\\203.aqi";
r = await como(outro, "renderizacao_pedir", { p_renderizador: render1, p_projeto: "203", p_caminho: caminho, p_identidade: "x", p_pedido: pedido, p_quantos: 2, p_segundos: 212 });
confere(!r.ok && r.motivo.includes("não é do seu escritório"), "quem é de fora não pede: " + JSON.stringify(r));
r = await como(joao, "renderizacao_pedir", { p_renderizador: render1, p_projeto: "203 - MINISTERIO", p_caminho: caminho, p_identidade: "id-203", p_pedido: [], p_quantos: 2, p_segundos: 212 });
confere(!r.ok && r.motivo.includes("itens"), "sem os itens: " + JSON.stringify(r));
r = await como(joao, "renderizacao_pedir", { p_renderizador: render1, p_projeto: "203 - MINISTERIO", p_caminho: caminho, p_identidade: "id-203", p_pedido: pedido, p_quantos: 2, p_segundos: 212 });
confere(r.ok && r.id && r.posicao === 1 && r.maquina === "RENDER 1", "o João pede ao RENDER 1: " + JSON.stringify(r));
const p1 = r.id;
lista = await como(joao, "renderizadores_do_escritorio");
confere(lista[0].naFila === 1 && Number(lista[0].filaSegundos) === 212, "a fila do RENDER 1 com o tempo dela: " + JSON.stringify(lista[0]));

// a máquina pega
r = await como(outro, "renderizacao_pegar", { p_computador: "PREDATOR-ID" });
confere(!r.ok, "quem é de fora não pega pela identidade da máquina");
r = await como(edi, "renderizacao_pegar", { p_computador: "PREDATOR-ID" });
confere(r.ok && r.pedido?.id === p1 && r.pedido.quem === "João" && r.pedido.estado === "renderizando" && r.retomar === false
  && r.pedido.conteudo?.itens?.length === 2, "o RENDER 1 pega o pedido, com os itens: " + JSON.stringify(r));
const itens = (await db.query(`select pedido from public.pedidos_de_renderizacao where id = $1`, [p1])).rows[0].pedido;
confere(itens.itens.length === 2, "os itens ficam guardados");
r = await como(edi, "renderizacao_pegar", { p_computador: "PREDATOR-ID" });
confere(r.ok && r.pedido?.id === p1 && r.retomar === true, "a máquina que caiu retoma o mesmo pedido");

// o andamento
r = await como(edi, "renderizacao_andamento", { p_pedido: p1, p_estado: "renderizando", p_andamento: { feitos: 1, quantos: 2, agora: "PANORAMA 01", fracao: 0.4 } });
confere(r.ok && r.cancelado === false, "o andamento: " + JSON.stringify(r));
let meus = await como(joao, "renderizacao_meus_pedidos");
confere(meus.length === 1 && meus[0].estado === "renderizando" && meus[0].andamento.feitos === 1 && meus[0].maquina === "RENDER 1",
  "o João vê o andamento: " + JSON.stringify(meus));
r = await como(outro, "renderizacao_andamento", { p_pedido: p1, p_estado: "pronto", p_andamento: {} });
confere(!r.ok, "quem é de fora não mexe no andamento");

// cancelar
r = await como(outro, "renderizacao_cancelar", { p_pedido: p1 });
confere(!r.ok, "quem é de fora não cancela");
r = await como(edi, "renderizacao_cancelar", { p_pedido: p1 });
confere(!r.ok && r.motivo.includes("Só quem pediu"), "outra pessoa da equipe não cancela o pedido do João");
r = await como(joao, "renderizacao_cancelar", { p_pedido: p1 });
confere(r.ok, "o João cancela o dele");
r = await como(edi, "renderizacao_andamento", { p_pedido: p1, p_estado: "renderizando", p_andamento: { feitos: 1 } });
confere(r.ok && r.cancelado === true, "a máquina fica sabendo do cancelamento: " + JSON.stringify(r));
confere((await db.query(`select estado from public.pedidos_de_renderizacao where id = $1`, [p1])).rows[0].estado === "cancelado", "o cancelado não volta");
r = await como(edi, "renderizacao_pegar", { p_computador: "PREDATOR-ID" });
confere(r.ok && r.pedido === null, "sem pedido na fila");

// um pedido até o fim, e a pausa que volta à fila
r = await como(joao, "renderizacao_pedir", { p_renderizador: render1, p_projeto: "203 - MINISTERIO", p_caminho: caminho, p_identidade: "id-203", p_pedido: pedido, p_quantos: 2, p_segundos: 212 });
const p2 = r.id;
await como(edi, "renderizacao_pegar", { p_computador: "PREDATOR-ID" });
r = await como(edi, "renderizacao_andamento", { p_pedido: p2, p_estado: "esperando", p_andamento: { feitos: 1, prontos: [{ chave: "C1" }] }, p_texto: "Pausado no RENDER 1." });
confere(r.ok, "pausada, volta à fila");
r = await como(edi, "renderizacao_pegar", { p_computador: "PREDATOR-ID" });
confere(r.ok && r.pedido?.id === p2 && r.pedido.andamento.feitos === 1, "a máquina pega de volta, com o que já saiu");
r = await como(edi, "renderizacao_andamento", { p_pedido: p2, p_estado: "pronto", p_andamento: { feitos: 2, quantos: 2 } });
meus = await como(joao, "renderizacao_meus_pedidos");
const pronto = meus.find((m) => m.id === p2);
confere(pronto?.estado === "pronto" && pronto.terminouEm, "o João vê o pronto: " + JSON.stringify(pronto));
let fila = await como(edi, "renderizador_fila", { p_computador: "PREDATOR-ID" });
confere(fila.fila.length === 0 && fila.hoje.length === 1 && fila.hoje[0].id === p2, "a tela de espera: nada na fila e um pronto hoje");
r = await como(edi, "renderizacao_andamento", { p_pedido: p2, p_estado: "renderizando", p_andamento: {} });
confere(r.ok && r.estado === "pronto", "o pronto não volta");

// o responsável cancela qualquer um
r = await como(joao, "renderizacao_pedir", { p_renderizador: render1, p_projeto: "203", p_caminho: caminho, p_identidade: null, p_pedido: pedido, p_quantos: 2, p_segundos: 212 });
const p3 = r.id;
r = await como(palheta, "renderizacao_cancelar", { p_pedido: p3 });
confere(r.ok, "o responsável cancela o pedido do João");

// sem sinal
await db.query(`update public.renderizadores set visto_em = now() - interval '5 minutes' where id = $1`, [render1]);
lista = await como(joao, "renderizadores_do_escritorio");
confere(lista[0].estado === "sem sinal", "sem sinal há 5 minutos: " + lista[0].estado);
await como(edi, "renderizador_sinal", { p_computador: "PREDATOR-ID", p_nome: "RENDER 1", p_info: info, p_estado: "exportando", p_agora: { projeto: "203", quem: "João" } });
lista = await como(joao, "renderizadores_do_escritorio");
confere(lista[0].estado === "exportando" && lista[0].agora.quem === "João", "com sinal de novo, exportando");

// sair do modo
r = await como(joao, "renderizacao_pedir", { p_renderizador: render1, p_projeto: "203", p_caminho: caminho, p_identidade: null, p_pedido: pedido, p_quantos: 2, p_segundos: 212 });
const p4 = r.id;
r = await como(edi, "renderizador_desligar", { p_computador: "PREDATOR-ID" });
confere(r.ok && r.cancelados === 1, "sair do modo cancela o que esperava: " + JSON.stringify(r));
confere((await db.query(`select texto from public.pedidos_de_renderizacao where id = $1`, [p4])).rows[0].texto.includes("saiu do modo"), "com o motivo");
confere((await como(joao, "renderizadores_do_escritorio")).length === 0, "a máquina desligada sai da lista");
r = await como(joao, "renderizacao_pedir", { p_renderizador: render1, p_projeto: "203", p_caminho: caminho, p_identidade: null, p_pedido: pedido, p_quantos: 2, p_segundos: 212 });
confere(!r.ok && r.motivo.includes("saiu do modo"), "não se pede à máquina desligada");
r = await como(edi, "renderizador_sinal", { p_computador: "PREDATOR-ID", p_nome: "RENDER 1", p_info: info, p_estado: "livre" });
confere(r.ok && r.id === render1, "ligada de novo, a mesma máquina");

// a máquina de quem não tem equipe fica na própria conta
r = await como(outro, "renderizador_sinal", { p_computador: "OUTRO-ID", p_nome: "MEU PC", p_info: {}, p_estado: "livre" });
confere(r.ok && r.escritorio === "outro@exemplo.com.br", "sem equipe, na própria conta: " + JSON.stringify(r));
confere((await como(joao, "renderizadores_do_escritorio")).every((m) => m.nome !== "MEU PC"), "e a Palheta não vê");

// ninguém lê as tabelas direto
const direto = await tentar("authenticated", joao, "renderizacao_meus_pedidos");
confere(!direto.erro, "pela função, sim");
try {
  await db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    const linhas = await tx.query("select * from public.pedidos_de_renderizacao");
    confere(linhas.rows.length === 0, "a tabela direto, nenhuma linha");
  });
} catch { confere(true, "a tabela direto, sem permissão"); }
const semConta = await tentar("anon", null, "renderizadores_do_escritorio");
confere(semConta.erro, "sem conta, nada");

console.log(`\n${certos} de ${certos + ruins.length} conferências do computador de renderização passaram.`);
if (ruins.length) process.exitCode = 1;
