// Teste da PROTEÇÃO COMO OPÇÃO e da TROCA DO DONO (migração 20261027000000_protecao_como_opcao_e_troca_do_dono.sql; doc 73, §8, do
// programa; mockup trocar-o-dono, versão 2, aprovado por ÊDI em 27/10/2026): o padrão do escritório, a proteção ligada e tirada no
// registro, o PEDIR AO ESCRITÓRIO, o PASSAR AO ESCRITÓRIO com a mesma chave e a página do cliente junto, e o convite da equipe que entra
// junto. Num Postgres local (PGlite); não toca no Supabase de verdade. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/troca-do-dono.test.mjs
const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, tentar, novaConta, db } = banco;
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
await db.exec(readFileSync(new URL("../migrations/20261027000000_protecao_como_opcao_e_troca_do_dono.sql", import.meta.url), "utf8"));
console.log("migração da troca do dono aplicada pela segunda vez: ok");
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };
const novaChave = () => randomBytes(32).toString("base64");
const registrar = (quem, projeto, dono, nome, chave = novaChave()) =>
  chamar("authenticated", quem, "projeto_registrar", { p_projeto: projeto, p_dono: dono, p_nome: nome, p_chave: chave });

const edi = await novaConta("edi.troca@exemplo.com.br");
await chamar("authenticated", edi, "gravar_escritorio", { p: { nome: "PALHETA ARQUITETURA" } });
const kemily = await novaConta("kemily.troca@exemplo.com.br");
const osmar = await novaConta("osmar.troca@exemplo.com.br");
for (const [conta, email] of [[kemily, "kemily.troca@exemplo.com.br"], [osmar, "osmar.troca@exemplo.com.br"]]) {
  await chamar("authenticated", edi, "equipe_cadastrar", { p_email: email });
  await chamar("authenticated", conta, "equipe_responder", { p_responsavel: edi, p_entrar: true });
}
const rafael = await novaConta("rafael.troca@exemplo.com.br");
await chamar("authenticated", rafael, "gravar_escritorio", { p: { nome: "RAFAEL ARQUITETURA" } });
const engenheiro = await novaConta("calculista.troca@exemplo.com.br");

console.log("\n1. O padrão do escritório, desligado de fábrica");
let r = await chamar("authenticated", osmar, "protecao_padrao");
confere(r.proprio === false && r.escritorios.length === 1 && r.escritorios[0].responsavel === edi && r.escritorios[0].protegerNovos === false
  && r.escritorios[0].escritorio === "PALHETA ARQUITETURA", "o Osmar vê a Palheta, com o padrão desligado: " + JSON.stringify(r));
r = await chamar("authenticated", edi, "protecao_padrao_gravar", { p_ligar: true });
confere(r.ok && r.protegerNovos === true, "ÊDI liga o padrão");
r = await chamar("authenticated", osmar, "protecao_padrao");
confere(r.escritorios[0].protegerNovos === true && r.proprio === false, "a equipe vê o padrão ligado; a conta dela continua desligada");
r = await chamar("authenticated", edi, "protecao_padrao");
confere(r.proprio === true && r.escritorios.length === 0, "o responsável vê o padrão da própria conta: " + JSON.stringify(r));
r = await chamar("authenticated", engenheiro, "protecao_padrao");
confere(r.proprio === false && r.escritorios.length === 0, "quem não é de equipe nenhuma não vê escritório nenhum");
await chamar("authenticated", edi, "protecao_padrao_gravar", { p_ligar: false });
r = await chamar("authenticated", osmar, "protecao_padrao");
confere(r.escritorios[0].protegerNovos === false, "desligado de novo");

console.log("\n2. A proteção ligada fica no registro");
const p212 = randomUUID(), chave212 = novaChave();
r = await registrar(kemily, p212, kemily, "212-2", chave212);
confere(r.ok && r.dono === kemily && r.papel === "dono", "o 212-2 protegido na MINHA ÁREA da Kemily");
await registrar(kemily, p212, kemily, "212-2 (de novo)", novaChave());
let linhas = (await db.query(`select acao, usuario_id, para_dono from public.projeto_registro where projeto_id = $1 order by id`, [p212])).rows;
confere(linhas.length === 1 && linhas[0].acao === "protecao_ligada" && linhas[0].usuario_id === kemily && linhas[0].para_dono === kemily,
  "uma linha só, de quem ligou e para quem: " + JSON.stringify(linhas));

console.log("\n3. Quem é do escritório e abre sem acesso pode pedir o projeto ao escritório");
r = await chamar("authenticated", edi, "projeto_chave", { p_projeto: p212 });
confere(!r.ok && r.motivo === "sem_acesso" && r.escritorioQuePede?.responsavel === edi && r.escritorioQuePede?.nome === "PALHETA ARQUITETURA"
  && r.pedidoAoEscritorio === null && r.chave === undefined, "ÊDI vê o pedido ao escritório possível: " + JSON.stringify(r));
r = await chamar("authenticated", osmar, "projeto_chave", { p_projeto: p212 });
confere(!r.ok && r.escritorioQuePede?.responsavel === edi, "um colega da equipe também pode pedir");
r = await chamar("authenticated", engenheiro, "projeto_chave", { p_projeto: p212 });
confere(!r.ok && r.escritorioQuePede === null, "quem não é do escritório só vê o PEDIR ACESSO");
r = await chamar("authenticated", engenheiro, "projeto_pedir_ao_escritorio", { p_projeto: p212 });
confere(!r.ok && /equipe/.test(r.motivo), "e não pede ao escritório: " + r.motivo);

console.log("\n4. PEDIR AO ESCRITÓRIO");
r = await chamar("authenticated", edi, "projeto_pedir_ao_escritorio", { p_projeto: p212 });
confere(r.ok && r.escritorio === "PALHETA ARQUITETURA", "o pedido entra: " + JSON.stringify(r));
await chamar("authenticated", osmar, "projeto_pedir_ao_escritorio", { p_projeto: p212 });
let pedidos = await chamar("authenticated", kemily, "projeto_pedidos_ao_escritorio");
confere(pedidos.length === 1 && pedidos[0].projeto === p212 && pedidos[0].nomeDoEscritorio === "PALHETA ARQUITETURA"
  && pedidos[0].pedidoPor === "edi.troca@exemplo.com.br" && pedidos[0].convite === false,
  "a Kemily vê um pedido só, de quem pediu primeiro: " + JSON.stringify(pedidos));
r = await chamar("authenticated", edi, "projeto_chave", { p_projeto: p212 });
confere(r.pedidoAoEscritorio === "esperando", "a tela de ÊDI diz que o pedido espera");
pedidos = await chamar("authenticated", edi, "projeto_pedidos_ao_escritorio");
confere(pedidos.length === 0, "o pedido chega ao dono, não a quem pediu");

console.log("\n5. Só o dono passa, e só para o escritório em que está");
r = await chamar("authenticated", osmar, "projeto_passar", { p_projeto: p212, p_escritorio: edi });
confere(!r.ok && /dono/.test(r.motivo), "a equipe não passa o projeto de outra pessoa");
r = await chamar("authenticated", kemily, "projeto_passar", { p_projeto: p212, p_escritorio: rafael });
confere(!r.ok && /equipe/.test(r.motivo), "a Kemily não passa a um escritório em que não está: " + r.motivo);
r = await chamar("authenticated", kemily, "projeto_passar", { p_projeto: p212, p_escritorio: kemily });
confere(!r.ok, "nem para ela mesma");
r = await chamar("authenticated", kemily, "projeto_passar", { p_projeto: randomUUID(), p_escritorio: edi });
confere(!r.ok && /registrado/.test(r.motivo), "nem um projeto que o servidor não conhece");
r = await chamar("authenticated", edi, "projeto_responder_pedido_ao_escritorio", { p_pedido: pedidos[0]?.id ?? randomUUID(), p_aceitar: true });
confere(!r.ok, "quem pediu não responde o próprio pedido");

console.log("\n6. A Kemily aceita: o projeto passa ao escritório com a mesma chave e a página do cliente");
await db.query(`insert into public.apresentacoes (codigo, usuario_id, chave, nome, pasta) values ('KMLY23', $1, 'pagina-212', '212-2', 'kemilypagina2122')`, [kemily]);
r = await chamar("authenticated", edi, "chaves_do_escritorio");
let sit = await chamar("authenticated", edi, "copia_de_seguranca_situacao");
confere(sit.faltam === 0, "antes da troca, a cópia de segurança do escritório está em dia");
await new Promise((ok) => setTimeout(ok, 5));
pedidos = await chamar("authenticated", kemily, "projeto_pedidos_ao_escritorio");
r = await chamar("authenticated", kemily, "projeto_responder_pedido_ao_escritorio", { p_pedido: pedidos[0].id, p_aceitar: true, p_pagina: "pagina-212" });
confere(r.ok && r.dono === edi && r.nomeDoDono === "PALHETA ARQUITETURA" && r.papel === "equipe" && r.chave === chave212 && r.paginas === 1,
  "passado: a mesma chave, a Kemily na equipe, a página junto: " + JSON.stringify(r));
const pagina = (await db.query(`select usuario_id, codigo from public.apresentacoes where chave = 'pagina-212'`)).rows;
confere(pagina.length === 1 && pagina[0].usuario_id === edi && pagina[0].codigo === "KMLY23", "a página do cliente é do escritório, com o mesmo link");
r = await chamar("authenticated", edi, "projeto_chave", { p_projeto: p212 });
confere(r.ok && r.papel === "dono" && r.chave === chave212, "ÊDI é o dono, com a mesma chave");
r = await chamar("authenticated", osmar, "projeto_chave", { p_projeto: p212 });
confere(r.ok && r.papel === "equipe", "o Osmar abre");
r = await chamar("authenticated", engenheiro, "projeto_chave", { p_projeto: p212 });
confere(!r.ok && r.nomeDoDono === "PALHETA ARQUITETURA", "o engenheiro continua sem acesso, e vê o escritório como dono");
const situacoes = (await db.query(`select situacao from public.projeto_pedidos_ao_escritorio where projeto_id = $1`, [p212])).rows.map((x) => x.situacao);
confere(situacoes.join() === "aceito", "o pedido fica como aceito");
sit = await chamar("authenticated", edi, "copia_de_seguranca_situacao");
confere(sit.faltam === 1, "a cópia de segurança avisa que falta o projeto que chegou: " + JSON.stringify(sit));
r = await chamar("authenticated", kemily, "projeto_copia_aberta", { p_projeto: p212 });
confere(!r.ok, "a Kemily não salva mais a cópia aberta: agora é do responsável");

console.log("\n7. O registro e as listas");
linhas = (await db.query(`select acao, usuario_id, de_dono, para_dono, pedido_por from public.projeto_registro where projeto_id = $1 order by id`, [p212])).rows;
const troca = linhas.find((x) => x.acao === "troca_de_dono");
confere(troca && troca.usuario_id === kemily && troca.de_dono === kemily && troca.para_dono === edi && troca.pedido_por === edi,
  "a troca: quem passou, de quem, para quem, a pedido de quem: " + JSON.stringify(linhas));
r = await chamar("authenticated", edi, "meus_projetos_protegidos");
confere(r.chegaram.length === 1 && r.chegaram[0].nome === "212-2 (de novo)" && r.chegaram[0].de === "kemily.troca@exemplo.com.br" && r.chegaram[0].aPedidoSeu === true,
  "ÊDI vê o que chegou ao escritório: " + JSON.stringify(r.chegaram));
confere(r.projetos.some((p) => p.projeto === p212) && r.escritorios.length === 0, "o projeto está entre os do escritório; ÊDI não passa para ninguém");
r = await chamar("authenticated", kemily, "meus_projetos_protegidos");
confere(r.passados.length === 1 && r.passados[0].para === "PALHETA ARQUITETURA" && !r.projetos.some((p) => p.projeto === p212)
  && r.escritorios.length === 1 && r.escritorios[0].responsavel === edi, "a Kemily vê o que passou e para onde pode passar: " + JSON.stringify(r));

console.log("\n8. Pelo site, sem o arquivo: a página que o servidor já conhece vai junto");
const pCasa = randomUUID();
await registrar(osmar, pCasa, osmar, "Casa do Osmar");
await db.query(`insert into public.apresentacoes (codigo, usuario_id, chave, nome, pasta) values ('CASA22', $1, 'pagina-casa', 'Casa', 'osmarpaginacasa2')`, [osmar]);
r = await chamar("authenticated", engenheiro, "projeto_pagina", { p_projeto: pCasa, p_pagina: "pagina-casa" });
confere(!r.ok, "quem não tem acesso não marca a página");
r = await chamar("authenticated", osmar, "projeto_pagina", { p_projeto: pCasa, p_pagina: "pagina-casa" });
confere(r.ok, "o programa do Osmar manda a página ao abrir");
r = await chamar("authenticated", osmar, "meus_projetos_protegidos");
confere(r.projetos.find((p) => p.projeto === pCasa)?.comPagina === true, "a lista do site sabe que a página vai junto");
r = await chamar("authenticated", osmar, "projeto_passar", { p_projeto: pCasa, p_escritorio: edi });
confere(r.ok && r.paginas === 1, "passado pelo site, sem mandar a página: " + JSON.stringify(r));
confere((await db.query(`select usuario_id from public.apresentacoes where chave = 'pagina-casa'`)).rows[0].usuario_id === edi, "a página é do escritório");

console.log("\n9. A página que o escritório já tem com a mesma chave fica onde está");
const pDupla = randomUUID();
await registrar(osmar, pDupla, osmar, "Dupla");
await db.query(`insert into public.apresentacoes (codigo, usuario_id, chave, nome, pasta) values ('DUPA22', $1, 'pagina-dupla', 'Dupla', 'osmarpaginadupla')`, [osmar]);
await db.query(`insert into public.apresentacoes (codigo, usuario_id, chave, nome, pasta) values ('DUPB22', $1, 'pagina-dupla', 'Dupla', 'edipaginadupla22')`, [edi]);
r = await chamar("authenticated", osmar, "projeto_passar", { p_projeto: pDupla, p_escritorio: edi, p_pagina: "pagina-dupla" });
confere(r.ok && r.paginas === 0, "o projeto passa, a página do Osmar fica com ele");

console.log("\n10. O convite da equipe esperando: ENTRAR NA EQUIPE E PASSAR");
const bia = await novaConta("bia.troca@exemplo.com.br");
await chamar("authenticated", edi, "equipe_cadastrar", { p_email: "bia.troca@exemplo.com.br" });
const pBia = randomUUID();
r = await registrar(bia, pBia, bia, "Projeto da Bia");
confere(r.ok && r.dono === bia, "a Bia, ainda sem entrar na equipe, protege na conta dela");
r = await chamar("authenticated", edi, "projeto_chave", { p_projeto: pBia });
confere(!r.ok && r.escritorioQuePede?.responsavel === edi, "com o convite esperando, ÊDI pode pedir o projeto");
await chamar("authenticated", edi, "projeto_pedir_ao_escritorio", { p_projeto: pBia });
r = await chamar("authenticated", bia, "projeto_passar", { p_projeto: pBia, p_escritorio: edi });
confere(!r.ok && /convite/.test(r.motivo), "sem entrar na equipe, a Bia não passa direto: " + r.motivo);
pedidos = await chamar("authenticated", bia, "projeto_pedidos_ao_escritorio");
confere(pedidos.length === 1 && pedidos[0].convite === true, "o pedido da Bia vem com o convite: " + JSON.stringify(pedidos));
r = await chamar("authenticated", bia, "projeto_responder_pedido_ao_escritorio", { p_pedido: pedidos[0].id, p_aceitar: true });
confere(r.ok && r.dono === edi && r.papel === "equipe", "ENTRAR NA EQUIPE E PASSAR: " + JSON.stringify(r));
const equipe = (await chamar("authenticated", edi, "minha_equipe")).pessoas.find((p) => p.email === "bia.troca@exemplo.com.br");
confere(equipe?.situacao === "ativo", "a Bia entrou na equipe: " + JSON.stringify(equipe));

console.log("\n11. RECUSAR e pedir de novo");
const pOutro = randomUUID();
await registrar(osmar, pOutro, osmar, "Outro do Osmar");
await chamar("authenticated", edi, "projeto_pedir_ao_escritorio", { p_projeto: pOutro });
pedidos = await chamar("authenticated", osmar, "projeto_pedidos_ao_escritorio");
r = await chamar("authenticated", osmar, "projeto_responder_pedido_ao_escritorio", { p_pedido: pedidos[0].id, p_aceitar: false });
confere(r.ok, "o Osmar recusa");
r = await chamar("authenticated", edi, "projeto_chave", { p_projeto: pOutro });
confere(!r.ok && r.pedidoAoEscritorio === "recusado", "a tela de ÊDI diz que foi recusado");
await chamar("authenticated", edi, "projeto_pedir_ao_escritorio", { p_projeto: pOutro });
r = await chamar("authenticated", edi, "projeto_chave", { p_projeto: pOutro });
confere(r.pedidoAoEscritorio === "esperando", "pedir de novo vale como um pedido novo");
r = await chamar("authenticated", osmar, "projeto_responder_pedido_ao_escritorio", { p_pedido: pedidos[0].id, p_aceitar: true });
confere(r.ok && r.dono === edi, "a resposta ao pedido novo, pelo mesmo pedido");

console.log("\n12. TIRAR A PROTEÇÃO: só o dono, e fica registrado");
r = await chamar("authenticated", osmar, "projeto_tirar_protecao", { p_projeto: p212 });
confere(!r.ok && /dono/.test(r.motivo), "a equipe não tira a proteção do projeto do escritório");
r = await chamar("authenticated", edi, "projeto_tirar_protecao", { p_projeto: p212 });
confere(r.ok, "o responsável tira");
linhas = (await db.query(`select acao, usuario_id from public.projeto_registro where projeto_id = $1 and acao = 'protecao_tirada'`, [p212])).rows;
confere(linhas.length === 1 && linhas[0].usuario_id === edi, "fica registrado quem tirou");
r = await chamar("authenticated", osmar, "projeto_chave", { p_projeto: p212 });
confere(r.ok && r.chave === chave212, "as cópias protegidas de antes continuam abrindo para quem tinha acesso");

console.log("\n13. As portas");
for (const [nome, args] of [["protecao_padrao", {}], ["protecao_padrao_gravar", { p_ligar: true }], ["projeto_pedir_ao_escritorio", { p_projeto: p212 }],
                            ["projeto_pedidos_ao_escritorio", {}], ["projeto_passar", { p_projeto: p212, p_escritorio: edi }],
                            ["projeto_responder_pedido_ao_escritorio", { p_pedido: randomUUID(), p_aceitar: true }],
                            ["projeto_pagina", { p_projeto: p212, p_pagina: "x" }], ["meus_projetos_protegidos", {}],
                            ["projeto_tirar_protecao", { p_projeto: p212 }]]) {
  r = await tentar("anon", null, nome, args);
  confere(r.erro, `sem conta não chama ${nome}`);
}
r = await tentar("authenticated", edi, "escritorio_do_pedido", { p_quem: edi, p_projeto: p212 });
confere(r.erro, "a conta não chama escritorio_do_pedido direto");
for (const tabela of ["projeto_pedidos_ao_escritorio", "protecao_padrao"]) {
  r = await db.query(`set role authenticated`).then(() => db.query(`select * from public.${tabela}`))
    .then((q) => ({ linhas: q.rows.length })).catch((e) => ({ erro: e.message }));
  await db.query(`reset role`);
  confere(r.erro || r.linhas === 0, `ninguém lê ${tabela} direto (só pelas funções)`);
}

console.log(`\nA proteção como opção e a troca do dono: ${certos} certos, ${ruins.length} falharam.`);
if (ruins.length) { console.log(ruins.map((m) => " - " + m).join("\n")); process.exit(1); }
