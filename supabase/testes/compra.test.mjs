// Teste da compra do PRO (migração 20261016000000_compra_do_pro.sql): o plano `plugin` da licença, os preços dos planos e os
// PEDIDOS (formulário sem conta, liberar, renovar, cancelar, encerrar), num Postgres local (PGlite). Não toca no Supabase de
// verdade. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/compra.test.mjs
const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, tentar, novaConta, db } = banco;
import { readFileSync } from "node:fs";
// A migração tem que poder rodar duas vezes sem estragar nada: roda de novo antes dos testes.
await db.exec(readFileSync(new URL("../migrations/20261016000000_compra_do_pro.sql", import.meta.url), "utf8"));
console.log("migração da compra do PRO aplicada pela segunda vez: ok");
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };
const linha = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const umAno = () => new Date(Date.now() + 365 * 864e5).toISOString();
const dias = (iso) => (new Date(iso) - Date.now()) / 864e5;

const gestor = await novaConta("gestora.compra@exemplo.com.br");
await db.query(`insert into public.administradores (usuario_id) values ($1)`, [gestor]);
const comum = await novaConta("comum.compra@exemplo.com.br");

console.log("\n1. Preços dos planos");
let r = await chamar("anon", null, "precos_vigentes");
const pl = r.planos;
confere(Number(pl.plugin.mensal) === 69 && Number(pl.plugin.anual) === 39 && Number(pl.plugin.anualTotal) === 468 && Number(pl.plugin.desconto) === 43,
  "plugin de fábrica 69 / 39 por mês no anual (468, 43% OFF): " + JSON.stringify(pl.plugin));
confere(Number(pl.arquionie.mensal) === 119 && Number(pl.arquionie.anual) === 79 && Number(pl.arquionie.anualTotal) === 948 &&
        Number(pl.arquionie.desconto) === 33, "Arquionie de fábrica 119 / 79 (948, 33% OFF): " + JSON.stringify(pl.arquionie));
confere(r.parcela !== undefined && r.avista !== undefined, "os campos de antes continuam para a aba de hoje");
r = await tentar("authenticated", comum, "gestao_precos_planos_salvar", { p_plugin_mensal: 1, p_plugin_anual: 0.5, p_arquionie_mensal: 1, p_arquionie_anual: 0.5 });
confere(r.codigo === "42501", "quem não é gestor não muda os preços");
r = await chamar("authenticated", gestor, "gestao_precos_planos_salvar", { p_plugin_mensal: 69, p_plugin_anual: 70, p_arquionie_mensal: 119, p_arquionie_anual: 79 });
confere(!r.ok, "o anual por mês mais caro que o mensal é recusado");
r = await chamar("authenticated", gestor, "gestao_precos_planos_salvar", { p_plugin_mensal: 79, p_plugin_anual: 39, p_arquionie_mensal: 139, p_arquionie_anual: 69 });
confere(r.ok && Number(r.planos.plugin.mensal) === 79 && Number(r.planos.arquionie.anual) === 69, "SALVAR muda os quatro valores");
await chamar("authenticated", gestor, "gestao_precos_planos_salvar", { p_plugin_mensal: 69, p_plugin_anual: 39, p_arquionie_mensal: 119, p_arquionie_anual: 79 });

console.log("\n2. A licença só do plugin");
r = await chamar("authenticated", gestor, "gestao_liberar",
  { p_dono_email: "so.plugin@exemplo.com.br", p_produto: "arquionie", p_quantidade: 1, p_expira_em: umAno(), p_plano: "plugin" });
const soPlugin = await novaConta("so.plugin@exemplo.com.br");
const licPlugin = r.ids[0];
confere((await linha(`select (public.licenca_em_uso($1, 'arquionie-revit')).id as id`, [soPlugin])).id === licPlugin,
  "a licença `plugin` vale no plugin");
confere((await linha(`select (public.licenca_em_uso($1, 'arquionie')).id as id`, [soPlugin])).id === null,
  "a licença `plugin` não vale no programa");
await db.query(`insert into public.computadores (usuario_id, produto, maquina, nome, credencial_hash) values
  ($1, 'arquionie-revit', 'MAQ-P', 'REVIT-01', 'hash-so-plugin'), ($1, 'arquionie', 'MAQ-A', 'PROG-01', 'hash-so-programa')`, [soPlugin]);
r = await chamar("service_role", null, "licenca_estado", { p_credencial_hash: "hash-so-plugin", p_maquina: "MAQ-P", p_versao: "4.48.0" });
confere(r.situacao === "ok" && r.plano === "pro" && r.canal === "revit-estavel", "a ficha do plugin diz `pro` (o plugin 4.x só conhece pro e equipe): " + r.plano);
r = await chamar("service_role", null, "licenca_estado", { p_credencial_hash: "hash-so-programa", p_maquina: "MAQ-A", p_versao: "1.0.0" });
confere(r.situacao === "ok" && r.plano === "gratis", "a ficha do programa diz `gratis` para quem só tem o plugin: " + r.plano);
r = await chamar("authenticated", gestor, "gestao_liberar",
  { p_dono_email: "completo@exemplo.com.br", p_produto: "arquionie", p_quantidade: 1, p_expira_em: umAno() });
const completo = await novaConta("completo@exemplo.com.br");
confere((await linha(`select (public.licenca_em_uso($1, 'arquionie')).id as id`, [completo])).id === r.ids[0] &&
        (await linha(`select (public.licenca_em_uso($1, 'arquionie-revit')).id as id`, [completo])).id === r.ids[0],
  "a licença `pro` (Arquionie PRO) vale no programa e no plugin");
r = await tentar("authenticated", gestor, "gestao_liberar",
  { p_dono_email: "x@exemplo.com.br", p_produto: "arquionie", p_quantidade: 1, p_expira_em: umAno(), p_plano: "ouro" });
confere(r.erro, "plano desconhecido é recusado pela tabela");

console.log("\n3. O formulário COMPRAR PELO WHATSAPP (sem conta)");
await chamar("authenticated", gestor, "gestao_cupom_criar", { p_codigo: "BLACK70", p_desconto: 70 });
const base = { p_nome: "Mariana Souza", p_email: " Mariana@EstudioMS.com.br ", p_whatsapp: "(11) 98765-4321" };
r = await chamar("anon", null, "pedido_criar", { ...base, p_produto: "plugin", p_periodo: "anual", p_origem: "revit" });
const p1 = r;
confere(r.ok && /^P-\d{4}$/.test(r.pedido) && Number(r.valorMes) === 39 && Number(r.valorCobranca) === 468 && !r.cupomRecusado,
  "PLUGIN PRO anual sem cupom: 39/mês, 468 pelo ano: " + JSON.stringify(r));
const linhaP1 = await linha(`select * from public.pedidos where numero = $1`, [Number(p1.pedido.slice(2))]);
confere(linhaP1.email === "mariana@estudioms.com.br" && linhaP1.whatsapp === "5511987654321" && linhaP1.origem === "revit",
  "o e-mail fica em minúsculas, o WhatsApp com 55 e a origem gravada");
r = await chamar("anon", null, "pedido_criar", { ...base, p_email: "ana@exemplo.com.br", p_produto: "arquionie", p_periodo: "anual", p_cupom: "black70", p_origem: "campanha" });
confere(r.ok && r.cupom === "BLACK70" && Number(r.valorMes) === 23.7 && Number(r.valorCobranca) === 284.4,
  "ARQUIONIE PRO anual com 70%: 23,70/mês, 284,40 pelo ano: " + JSON.stringify(r));
r = await chamar("anon", null, "pedido_criar", { ...base, p_email: "beto@exemplo.com.br", p_produto: "arquionie", p_periodo: "mensal", p_cupom: "BLACK70" });
confere(r.ok && r.cupom === null && r.cupomRecusado && Number(r.valorMes) === 119 && Number(r.valorCobranca) === 119,
  "o cupom não vale no mensal (o pedido entra sem desconto): " + JSON.stringify(r));
r = await chamar("anon", null, "pedido_criar", { ...base, p_email: "caio@exemplo.com.br", p_produto: "plugin", p_periodo: "anual", p_cupom: "NAOEXISTE" });
confere(r.ok && r.cupomRecusado && Number(r.valorMes) === 39, "cupom que não existe não impede o pedido");
r = await chamar("anon", null, "pedido_criar", { ...base, p_email: "valor@exemplo.com.br", p_produto: "plugin", p_periodo: "anual", p_valor: 1 }).catch((e) => ({ erro: e.message }));
confere(r.erro, "o navegador não manda o valor (a função não aceita)");
r = await chamar("anon", null, "pedido_criar", { ...base, p_email: "sem-arroba", p_produto: "plugin", p_periodo: "anual" });
confere(!r.ok && /e-mail/.test(r.motivo), "e-mail inválido é recusado: " + r.motivo);
r = await chamar("anon", null, "pedido_criar", { ...base, p_email: "zap@exemplo.com.br", p_whatsapp: "9876", p_produto: "plugin", p_periodo: "anual" });
confere(!r.ok && /WhatsApp/.test(r.motivo), "WhatsApp sem DDD é recusado");
r = await chamar("anon", null, "pedido_criar", { ...base, p_email: "plano@exemplo.com.br", p_produto: "ouro", p_periodo: "anual" });
confere(!r.ok, "plano desconhecido é recusado");
r = await chamar("anon", null, "pedido_criar", { ...base, p_nome: " ", p_email: "nome@exemplo.com.br", p_produto: "plugin", p_periodo: "anual" });
confere(!r.ok && /nome/.test(r.motivo), "sem nome é recusado");
await chamar("anon", null, "pedido_criar", { ...base, p_produto: "plugin", p_periodo: "mensal" });
await chamar("anon", null, "pedido_criar", { ...base, p_produto: "plugin", p_periodo: "mensal" });
r = await chamar("anon", null, "pedido_criar", { ...base, p_produto: "plugin", p_periodo: "mensal" });
confere(!r.ok && /WhatsApp/.test(r.motivo), "o 4º pedido do mesmo e-mail na mesma hora é barrado: " + r.motivo);
r = await db.transaction(async (tx) => { await tx.exec("set local role anon"); try { await tx.query("select * from public.pedidos"); return "leu"; } catch { return "barrado"; } });
confere(r === "barrado", "ninguém lê a tabela de pedidos direto do navegador");
r = await tentar("anon", null, "gestao_pedidos");
confere(r.erro, "sem conta não se vê os pedidos");
r = await tentar("authenticated", comum, "gestao_pedidos");
confere(r.codigo === "42501", "conta comum não vê os pedidos");

console.log("\n4. /gestao › PEDIDOS: liberar o anual");
let g = await chamar("authenticated", gestor, "gestao_pedidos");
confere(g.resumo.aguardando === 6 && g.pedidos.every((p) => p.situacao === "aguardando"), "6 aguardando pagamento (o 4º da Mariana foi barrado): " + JSON.stringify(g.resumo));
const idP1 = linhaP1.id;
r = await chamar("authenticated", gestor, "gestao_pedido_liberar", { p_id: idP1, p_chave_plugin: " pfpro-abcd-1234 " });
confere(r.ok && !r.contaExiste && Math.round(dias(r.expiraEm)) === 365, "CONFIRMAR PAGAMENTO E LIBERAR: 1 ano, sem conta ainda: " + JSON.stringify(r));
let lic = await linha(`select * from public.licencas where id = $1`, [r.licenca]);
confere(lic.plano === "plugin" && lic.dono_email === "mariana@estudioms.com.br" && lic.email === "mariana@estudioms.com.br" &&
        /P-\d{4} · PLUGIN PRO ANUAL/.test(lic.observacao), "a licença é `plugin`, no e-mail do pedido, com o número na observação: " + lic.observacao);
g = await chamar("authenticated", gestor, "gestao_pedidos");
let item = g.pedidos.find((p) => p.id === idP1);
confere(item.situacao === "esperando a conta" && item.chavePlugin === "PFPRO-ABCD-1234" && item.licenca.ligada === false,
  "o pedido fica ESPERANDO A CONTA, com a chave do plugin: " + JSON.stringify({ s: item.situacao, c: item.chavePlugin }));
const mariana = await novaConta("mariana@estudioms.com.br");
g = await chamar("authenticated", gestor, "gestao_pedidos");
item = g.pedidos.find((p) => p.id === idP1);
confere(item.situacao === "em uso" && item.licenca.ligada, "a conta criada com o e-mail liga a licença: EM USO");
confere((await linha(`select (public.licenca_em_uso($1, 'arquionie-revit')).id as id`, [mariana])).id === lic.id,
  "a Mariana tem o PRO no plugin");
r = await chamar("authenticated", gestor, "gestao_pedido_liberar", { p_id: idP1 });
confere(!r.ok, "liberar duas vezes é recusado");
r = await tentar("authenticated", comum, "gestao_pedido_liberar", { p_id: idP1 });
confere(r.codigo === "42501", "conta comum não libera");

console.log("\n5. O mensal: liberar, renovar, vencer e encerrar");
const idBeto = (await linha(`select id from public.pedidos where email = 'beto@exemplo.com.br'`)).id;
r = await chamar("authenticated", gestor, "gestao_pedido_liberar", { p_id: idBeto });
confere(r.ok && dias(r.expiraEm) > 27 && dias(r.expiraEm) < 32, "o mensal libera 1 mês: " + dias(r.expiraEm).toFixed(1));
const licBeto = r.licenca;
confere((await linha(`select plano from public.licencas where id = $1`, [licBeto])).plano === "pro", "ARQUIONIE PRO libera a licença completa (`pro`)");
await db.query(`update public.licencas set expira_em = now() + interval '2 days' where id = $1`, [licBeto]);
g = await chamar("authenticated", gestor, "gestao_pedidos");
item = g.pedidos.find((p) => p.id === idBeto);
confere(item.situacao === "renovar" && g.resumo.renovar === 1, "a 2 dias de vencer: RENOVAR ESTA SEMANA");
r = await chamar("authenticated", gestor, "gestao_pedido_renovar", { p_id: idBeto });
confere(r.ok && r.renovacoes === 1 && dias(r.expiraEm) > 29 && dias(r.expiraEm) < 34, "CONFIRMAR RENOVAÇÃO soma 1 mês a partir da validade: " + dias(r.expiraEm).toFixed(1));
await db.query(`update public.licencas set expira_em = now() - interval '1 day' where id = $1`, [licBeto]);
g = await chamar("authenticated", gestor, "gestao_pedidos");
item = g.pedidos.find((p) => p.id === idBeto);
confere(item.situacao === "vencido" && g.resumo.renovar === 1 && g.pedidos[0].situacao !== "em uso",
  "o mensal vencido continua em RENOVAR e sobe na lista");
r = await chamar("authenticated", gestor, "gestao_pedido_renovar", { p_id: idBeto });
confere(r.ok && dias(r.expiraEm) > 27 && dias(r.expiraEm) < 32, "renovar depois de vencido conta a partir de hoje");
r = await chamar("authenticated", gestor, "gestao_pedido_encerrar", { p_id: idBeto });
confere(r.ok, "ENCERRAR");
confere((await linha(`select status from public.licencas where id = $1`, [licBeto])).status === "ativa",
  "encerrar não corta a licença: ela vale até o fim do que foi pago");
r = await chamar("authenticated", gestor, "gestao_pedido_renovar", { p_id: idBeto });
confere(!r.ok, "pedido encerrado não renova");

console.log("\n6. Cancelar e a chave depois");
const idCaio = (await linha(`select id from public.pedidos where email = 'caio@exemplo.com.br'`)).id;
r = await chamar("authenticated", gestor, "gestao_pedido_cancelar", { p_id: idCaio });
confere(r.ok, "CANCELAR o que não foi pago");
r = await chamar("authenticated", gestor, "gestao_pedido_cancelar", { p_id: idCaio });
confere(!r.ok, "cancelar duas vezes é recusado");
r = await chamar("authenticated", gestor, "gestao_pedido_liberar", { p_id: idCaio });
confere(!r.ok, "pedido cancelado não libera");
r = await chamar("authenticated", gestor, "gestao_pedido_chave", { p_id: idBeto, p_chave: "pfpro-zzzz-9999" });
confere(r.ok && (await linha(`select chave_plugin from public.pedidos where id = $1`, [idBeto])).chave_plugin === "PFPRO-ZZZZ-9999",
  "a chave do plugin colada depois");
g = await chamar("authenticated", gestor, "gestao_pedidos");
confere(g.pedidos.find((p) => p.id === idCaio).situacao === "cancelado" && g.resumo.total === 6 && g.resumo.liberados === 1 && g.resumo.aguardando === 3, "o resumo conta tudo: " + JSON.stringify(g.resumo));

console.log(`\n${certos} de ${certos + ruins.length} conferências da compra do PRO passaram.`);
process.exitCode = ruins.length || process.exitCode ? 1 : 0;
