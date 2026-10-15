// Teste da licença única e da gestão que vem do Palheta Flow (migração 20261015000000_licenca_unica_e_gestao_do_flow.sql)
// num Postgres local (PGlite). Não toca no Supabase de verdade. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/gestao-flow.test.mjs
const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, tentar, novaConta, db } = banco;
import { readFileSync } from "node:fs";
// A migração tem que poder rodar duas vezes sem estragar nada: roda de novo antes dos testes.
await db.exec(readFileSync(new URL("../migrations/20261015000000_licenca_unica_e_gestao_do_flow.sql", import.meta.url), "utf8"));
console.log("migração da gestão do Flow aplicada pela segunda vez: ok");
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };
const umAno = () => new Date(Date.now() + 365 * 864e5).toISOString();
const linha = async (sql, p = []) => (await db.query(sql, p)).rows[0];

const gestor = await novaConta("gestora.flow@exemplo.com.br");
await db.query(`insert into public.administradores (usuario_id) values ($1)`, [gestor]);
const comum = await novaConta("comum.flow@exemplo.com.br");

console.log("\n1. Licença única: a licença vale no programa e no plugin");
let r = await chamar("authenticated", gestor, "gestao_liberar",
  { p_dono_email: "cliente.flow@exemplo.com.br", p_produto: "arquionie-revit", p_quantidade: 1, p_expira_em: umAno() });
const cliente = await novaConta("cliente.flow@exemplo.com.br");
let lic = await linha(`select * from public.licencas where id = $1`, [r.ids[0]]);
confere(lic.produto === "arquionie" && lic.usuario_id === cliente, "LIBERAR do plugin grava como licença única e liga na conta: " + lic.produto);
confere((await linha(`select count(*)::int as n from public.licencas where produto <> 'arquionie'`)).n === 0,
  "nenhuma licença ficou com produto separado");
confere((await linha(`select (public.licenca_em_uso($1, 'arquionie')).id as id`, [cliente])).id === lic.id &&
        (await linha(`select (public.licenca_em_uso($1, 'arquionie-revit')).id as id`, [cliente])).id === lic.id,
  "a mesma licença está em uso no programa e no plugin");
await db.query(`insert into public.computadores (usuario_id, produto, maquina, nome, credencial_hash)
                values ($1, 'arquionie-revit', 'MAQ-1', 'ESCRITORIO-01', 'hash-plugin-1')`, [cliente]);
r = await chamar("service_role", null, "licenca_estado", { p_credencial_hash: "hash-plugin-1", p_maquina: "MAQ-1", p_versao: "4.48.0" });
confere(r.situacao === "ok" && r.plano === "pro", "o plugin recebe o PRO da licença única: " + JSON.stringify(r.plano));
let g = await chamar("authenticated", gestor, "gestao_licencas");
let item = g.licencas.find((l) => l.id === lic.id);
confere(item.computadoresPlugin === 1 && item.computadoresPrograma === 0 && item.computadores === 1,
  "LICENÇAS conta os computadores do programa e do plugin separados: " + JSON.stringify(item));

console.log("\n2. Preços");
r = await chamar("anon", null, "precos_vigentes");
confere(Number(r.parcela) === 59 && r.parcelas === 12 && Number(r.avista) === 599, "preço de fábrica igual ao do Flow: " + JSON.stringify(r));
r = await tentar("authenticated", comum, "gestao_precos_salvar", { p_parcela: 1, p_parcelas: 1, p_avista: 1 });
confere(r.codigo === "42501", "quem não é gestor não muda o preço");
r = await chamar("authenticated", gestor, "gestao_precos_salvar", { p_parcela: 43, p_parcelas: 12, p_avista: 419 });
confere(r.ok && Number(r.totalParcelado) === 516, "SALVAR PREÇOS: " + JSON.stringify(r));
r = await chamar("authenticated", gestor, "gestao_precos_salvar", { p_parcela: 43, p_parcelas: 30, p_avista: 419 });
confere(!r.ok, "parcelas fora de 1 a 24 são recusadas");

console.log("\n3. Cupons");
r = await chamar("authenticated", gestor, "gestao_cupom_criar", { p_codigo: " pfpro15 ", p_desconto: 15, p_observacao: "teste" });
const cupom = r.id;
confere(r.ok && r.codigo === "PFPRO15", "CRIAR CUPOM em maiúsculas: " + JSON.stringify(r));
r = await chamar("anon", null, "cupom_conferir", { p_codigo: "pfpro15" });
confere(r.valido && r.desconto === 15, "a página de venda confere o cupom sem conta: " + JSON.stringify(r));
r = await chamar("authenticated", gestor, "gestao_cupom_criar", { p_codigo: "PFPRO15", p_desconto: 20 });
confere(!r.ok, "código repetido é recusado");
r = await chamar("authenticated", gestor, "gestao_cupom_criar", { p_codigo: "VELHO", p_desconto: 20, p_expira_em: "2020-01-01T00:00:00Z" });
confere(!r.ok, "validade no passado é recusada");
await chamar("authenticated", gestor, "gestao_cupom_revogar", { p_id: cupom });
confere(!(await chamar("anon", null, "cupom_conferir", { p_codigo: "PFPRO15" })).valido, "cupom revogado não vale");
await chamar("authenticated", gestor, "gestao_cupom_reativar", { p_id: cupom });
r = await chamar("authenticated", gestor, "gestao_cupom_prorrogar", { p_id: cupom, p_dias: 7 });
confere(r.ok && r.expiraEm === null, "+7 DIAS num cupom sem validade continua sem validade");
await db.query(`update public.cupons set expira_em = now() - interval '1 day' where id = $1`, [cupom]);
g = await chamar("authenticated", gestor, "gestao_cupons");
confere(g.find((c) => c.id === cupom).situacao === "vencido" && !(await chamar("anon", null, "cupom_conferir", { p_codigo: "PFPRO15" })).valido,
  "cupom vencido aparece como vencido e não vale");
r = await tentar("authenticated", comum, "gestao_cupons");
confere(r.codigo === "42501", "quem não é gestor não vê os cupons");
r = await db.transaction(async (tx) => { await tx.exec("set local role authenticated"); try { await tx.query("select * from public.cupons"); return "leu"; } catch { return "barrado"; } });
confere(r === "barrado", "ninguém lê a tabela de cupons direto do navegador");

console.log("\n4. Importar do Flow (prévia, depois de verdade)");
const dados = {
  precos: { parcela: 59, parcelas: 12, avista: 599 },
  cupons: [{ codigo: "PFPRO10", desconto: 10, expira_em: null, observacao: "grupo de suporte", ativo: true, criado_em: "2026-07-20T10:00:00Z" }],
  cadastros: [
    { email: "lucas@exemplo.com.br", name: "Lucas", created_at: "2026-10-01T10:00:00Z", downloaded_at: "2026-10-01T10:00:00Z" },
    { email: "LUCAS@exemplo.com.br ", name: "Lucas E.", created_at: "2026-09-01T10:00:00Z", downloaded_at: "2026-10-10T10:00:00Z" },
    { email: "sergio@exemplo.com.br", name: "Sérgio", created_at: "2026-10-07T10:00:00Z" },
    { email: "saiu@exemplo.com.br", name: "Saiu", created_at: "2026-08-01T10:00:00Z" },
    { email: "cliente.flow@exemplo.com.br", name: "Cliente PRO", created_at: "2026-06-01T10:00:00Z" },
    { email: "sem-arroba", name: "lixo" },
  ],
  descadastros: [{ email: "saiu@exemplo.com.br", created_at: "2026-09-01T10:00:00Z" }],
  campanhas: [{
    id: "6f1f6b1e-2a6c-4d7e-9a51-6d0d9e2b0c11", assunto: "BLACK FRIDAY ANTECIPADA", mensagem: "Olá, {nome}!", cupom: "PFPRO10",
    desconto: 10, oferta: { chamada: "BLACK FRIDAY", de: 599, por: 179 }, criada_em: "2026-10-12T10:00:00Z",
    envios: [{ email: "sergio@exemplo.com.br", nome: "Sérgio", status: "enviado", enviado_em: "2026-10-12T10:05:00Z" },
             { email: "lucas@exemplo.com.br", nome: "Lucas", status: "pendente" }],
  }],
  aulas: [{ title: "CRIAR PISO", youtube_id: "abc123XYZ_-", duration: "4:10", description: "O piso pelo ambiente", position: 2, command: "CmdPiso", thumbnail_url: null }],
  feedbacks: [{ email: "lucas@exemplo.com.br", edicao: "externo", versao: "4.44.0", categoria: "sugestao", nota: 5, mensagem: "Muito bom", status: "novo", created_at: "2026-10-11T10:00:00Z" }],
};
r = await chamar("authenticated", gestor, "gestao_importar_dados_flow", { p_dados: dados });
confere(r.previa && r.cadastros === 6 && r.campanhas === 1 && (await linha(`select count(*)::int as n from public.cadastros_flow`)).n === 0,
  "a PRÉVIA conta o arquivo e não grava nada: " + JSON.stringify(r));
r = await tentar("authenticated", comum, "gestao_importar_dados_flow", { p_dados: dados, p_conferir: false });
confere(r.codigo === "42501", "quem não é gestor não importa");
r = await chamar("authenticated", gestor, "gestao_importar_dados_flow", { p_dados: dados, p_conferir: false });
confere(r.ok && r.importado.cupons === 1 && r.importado.descadastros === 1 && r.importado.campanhas === 1 &&
        r.importado.envios === 2 && r.importado.aulas === 1 && r.importado.feedbacks === 1, "IMPORTAR grava tudo: " + JSON.stringify(r.importado));
const lucas = await linha(`select * from public.cadastros_flow where email = 'lucas@exemplo.com.br'`);
confere((await linha(`select count(*)::int as n from public.cadastros_flow`)).n === 4 && lucas.nome === "Lucas" &&
        new Date(lucas.cadastrado_em).toISOString().startsWith("2026-09-01") && new Date(lucas.baixou_em).toISOString().startsWith("2026-10-10"),
  "o mesmo e-mail vira um cadastro só, com o primeiro cadastro e o último download");
confere((await linha(`select status from public.campanha_envios where email = 'lucas@exemplo.com.br'`)).status === "pulado" &&
        (await linha(`select status from public.campanhas where id = '6f1f6b1e-2a6c-4d7e-9a51-6d0d9e2b0c11'`)).status === "concluida",
  "a campanha do Flow vem só como histórico: o que não saiu fica pulado e ela concluída");
r = await chamar("authenticated", gestor, "gestao_importar_dados_flow", { p_dados: dados, p_conferir: false });
confere(r.importado.cupons === 0 && r.importado.descadastros === 0 && r.importado.campanhas === 0 &&
        r.importado.aulas === 0 && r.importado.feedbacks === 0 && (await linha(`select count(*)::int as n from public.cadastros_flow`)).n === 4,
  "importar de novo não duplica nada: " + JSON.stringify(r.importado));
confere((await chamar("anon", null, "cupom_conferir", { p_codigo: "PFPRO10" })).valido, "o cupom do Flow vale no Arquionie");

console.log("\n5. Destinatários");
await db.query(`insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values
  ('quer.novidades@exemplo.com.br', now(), '{"nome":"Quer","novidades":true}'),
  ('nao.quer@exemplo.com.br', now(), '{"nome":"Não quer","novidades":false}')`);
let dest = await chamar("authenticated", gestor, "gestao_destinatarios");
const emails = dest.map((d) => d.email).sort();
confere(JSON.stringify(emails) === JSON.stringify(["lucas@exemplo.com.br", "quer.novidades@exemplo.com.br", "sergio@exemplo.com.br"]),
  "cadastros do Flow + contas que querem novidades, sem quem saiu e sem quem tem licença: " + JSON.stringify(emails));
confere(dest.find((d) => d.email === "sergio@exemplo.com.br").jaRecebeu && !dest.find((d) => d.email === "lucas@exemplo.com.br").jaRecebeu,
  "JÁ RECEBEU vem do histórico das campanhas, inclusive as do Flow");

console.log("\n6. Campanha: fila, lotes, intervalo, limite do dia, pausa e cancelamento");
r = await chamar("authenticated", gestor, "gestao_campanha_criar", {
  p_assunto: "Novidade", p_mensagem: "Olá, {nome}!", p_lote: 2, p_intervalo_min: 5, p_limite_dia: 80,
  p_destinatarios: [...dest.map((d) => ({ email: d.email, nome: d.nome })), { email: "saiu@exemplo.com.br" }, { email: "cliente.flow@exemplo.com.br" }],
});
const camp = r.id;
confere(r.ok && r.naFila === 3 && r.pulados === 2, "INICIAR CAMPANHA: o servidor tira de novo quem saiu e quem tem licença: " + JSON.stringify(r));
r = await tentar("authenticated", gestor, "campanha_proximo_lote");
confere(r.erro, "o navegador (nem o gestor) não puxa lote: só o servidor");
let lote = await chamar("service_role", null, "campanha_proximo_lote");
confere(lote.situacao === "lote" && lote.envios.length === 2 && lote.campanha.assunto === "Novidade", "o 1º lote sai com 2: " + JSON.stringify(lote.situacao));
r = await chamar("service_role", null, "campanha_proximo_lote");
confere(r.situacao === "nada", "antes do intervalo não sai outro lote");
await chamar("service_role", null, "campanha_registrar_envio", { p_envio: lote.envios[0].id, p_situacao: "enviado" });
await chamar("service_role", null, "campanha_registrar_envio", { p_envio: lote.envios[1].id, p_situacao: "pendente" });
await db.query(`update public.campanhas set ultimo_lote_em = now() - interval '6 minutes' where id = $1`, [camp]);
lote = await chamar("service_role", null, "campanha_proximo_lote");
confere(lote.situacao === "lote" && lote.envios.length === 2, "passado o intervalo, sai o lote seguinte (com o que voltou para a fila)");
await db.query(`update public.campanhas set limite_dia = 2, ultimo_lote_em = now() - interval '6 minutes' where id = $1`, [camp]);
for (const e of lote.envios) await chamar("service_role", null, "campanha_registrar_envio", { p_envio: e.id, p_situacao: "enviado" });
g = (await chamar("authenticated", gestor, "gestao_campanhas")).find((c) => c.id === camp);
confere(g.status === "concluida" && g.enviados === 3 && g.pendentes === 0, "quando a fila acaba, a campanha conclui: " + JSON.stringify(g));
r = await chamar("authenticated", gestor, "gestao_campanha_criar", {
  p_assunto: "Outra", p_mensagem: "Oi", p_lote: 1, p_intervalo_min: 1, p_limite_dia: 3, p_destinatarios: ["lucas@exemplo.com.br", "quer.novidades@exemplo.com.br"] });
const camp2 = r.id;
lote = await chamar("service_role", null, "campanha_proximo_lote");
confere(lote.situacao === "limite do dia", "o limite do dia conta todos os envios de hoje (3 já saíram): " + lote.situacao);
await db.query(`update public.campanhas set limite_dia = 100 where id = $1`, [camp2]);
await chamar("authenticated", gestor, "gestao_campanha_pausar", { p_id: camp2 });
confere((await chamar("service_role", null, "campanha_proximo_lote")).situacao === "nada", "campanha PAUSADA não manda nada");
await chamar("authenticated", gestor, "gestao_campanha_retomar", { p_id: camp2 });
lote = await chamar("service_role", null, "campanha_proximo_lote");
confere(lote.situacao === "lote" && lote.envios.length === 1, "RETOMAR volta a mandar");
await chamar("authenticated", gestor, "gestao_campanha_cancelar", { p_id: camp2 });
g = (await chamar("authenticated", gestor, "gestao_campanhas")).find((c) => c.id === camp2);
r = await chamar("service_role", null, "campanha_registrar_envio", { p_envio: lote.envios[0].id, p_situacao: "enviado" });
confere(g.status === "cancelada" && g.pendentes === 0 && r.situacao === "ignorado", "CANCELAR pula o que não saiu e ignora resposta atrasada");
r = await chamar("authenticated", gestor, "gestao_campanha_criar", { p_assunto: "x", p_mensagem: "y", p_destinatarios: [] });
confere(!r.ok, "campanha sem destinatário é recusada");

console.log("\n7. Descadastro");
r = await tentar("anon", null, "descadastrar", { p_email: "quer.novidades@exemplo.com.br" });
confere(r.erro, "o descadastro só passa pelo servidor (link assinado)");
await chamar("service_role", null, "descadastrar", { p_email: " Quer.Novidades@exemplo.com.br" });
dest = await chamar("authenticated", gestor, "gestao_destinatarios");
confere(!dest.some((d) => d.email === "quer.novidades@exemplo.com.br") &&
        (await linha(`select novidades from public.perfis where email = 'quer.novidades@exemplo.com.br'`)).novidades === false,
  "quem sai some da lista e a conta deixa de querer novidades");

console.log("\n8. Aulas");
r = await chamar("authenticated", gestor, "gestao_aula_salvar", { p_id: null, p_titulo: "COLOCAR PORTA", p_youtube_id: "xyz 1" });
confere(!r.ok, "código do YouTube inválido é recusado");
const a2 = (await chamar("authenticated", gestor, "gestao_aula_salvar", { p_id: null, p_titulo: "COLOCAR PORTA", p_youtube_id: "porta12345", p_comando: "CmdPorta" })).id;
r = await chamar("authenticated", gestor, "gestao_aula_salvar", { p_id: null, p_titulo: "OUTRA", p_youtube_id: "porta12345" });
confere(!r.ok, "o mesmo vídeo em duas aulas é recusado");
let aulas = await chamar("anon", null, "aulas_lista");
confere(aulas.length === 2 && aulas[1].id === a2 && aulas[0].comando === "CmdPiso", "o plugin lê as aulas sem conta, na ordem: " + JSON.stringify(aulas.map((a) => a.titulo)));
await chamar("authenticated", gestor, "gestao_aulas_ordenar", { p_ids: `{${a2}}` });
aulas = await chamar("anon", null, "aulas_lista");
confere(aulas[0].id === a2 && aulas[1].titulo === "CRIAR PISO", "ORDENAR põe a aula escolhida primeiro");
r = await tentar("authenticated", comum, "gestao_aula_apagar", { p_id: a2 });
confere(r.codigo === "42501", "conta comum não mexe nas aulas (no Flow, qualquer conta logada mexia)");
await chamar("authenticated", gestor, "gestao_aula_apagar", { p_id: a2 });
confere((await chamar("anon", null, "aulas_lista")).length === 1, "APAGAR tira a aula");

console.log("\n9. Feedbacks");
r = await tentar("authenticated", comum, "feedback_registrar", { p_mensagem: "oi" });
confere(r.erro, "o feedback só entra pelo servidor");
r = await chamar("service_role", null, "feedback_registrar", { p_mensagem: "A tela de entrada ficou ótima", p_email: "Ana@Exemplo.com.br", p_edicao: "interno", p_versao: "4.47.0", p_nota: 10 });
g = await chamar("authenticated", gestor, "gestao_feedbacks");
confere(r.situacao === "ok" && g.novos === 2 && g.feedbacks[0].email === "ana@exemplo.com.br", "o feedback novo chega no /gestao: " + g.novos);
await chamar("authenticated", gestor, "gestao_feedback_marcar", { p_id: r.id, p_status: "lido" });
confere((await chamar("authenticated", gestor, "gestao_feedbacks")).novos === 1, "MARCAR COMO LIDO");

console.log(`\n${certos} de ${certos + ruins.length} conferências da gestão do Flow passaram.`);
process.exitCode = ruins.length || process.exitCode ? 1 : 0;
