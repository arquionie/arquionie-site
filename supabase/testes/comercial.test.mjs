// Teste do COMERCIAL, o CRM grátis (migração 20261017000000_comercial.sql): o primeiro acesso, o formulário público, o pedido que
// chega, o quadro e as regras, o orçamento, a proposta pelos três jeitos, o aceite, os ajustes, a equipe, os limites do grátis, o
// /gestao e a tarefa diária, num Postgres local (PGlite). Não toca no Supabase de verdade. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/comercial.test.mjs
const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, tentar, novaConta, db } = banco;
import { readFileSync } from "node:fs";
await db.exec(readFileSync(new URL("../migrations/20261017000000_comercial.sql", import.meta.url), "utf8"));
console.log("migração do Comercial aplicada pela segunda vez: ok");
await db.exec("set time zone 'UTC'"); // como o Supabase: depois das 21h de Brasília, o dia em UTC já é amanhã
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };
const linha = async (sql, p = []) => (await db.query(sql, p)).rows[0];
// As datas no Brasil, como o banco (comercial_hoje): depois das 21h de Brasília, o dia em UTC já é amanhã.
const noBrasil = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const hoje = () => noBrasil(Date.now());
const emDias = (n) => noBrasil(Date.now() + n * 864e5);

const juliana = await novaConta("juliana@limaarquitetura.com.br");
await db.query(`insert into public.escritorios (usuario_id, nome) values ($1, 'Lima Arquitetura')`, [juliana]);
await db.query(`update auth.users set raw_user_meta_data = '{"nome": "Juliana Lima"}' where id = $1`, [juliana]);
const outra = await novaConta("outra@exemplo.com.br");
const gestor = await novaConta("gestor.comercial@exemplo.com.br");
await db.query(`insert into public.administradores (usuario_id) values ($1)`, [gestor]);

console.log("\n1. O primeiro acesso");
let r = await tentar("anon", null, "comercial_estado", {});
confere(r.erro, "sem conta não vê o Comercial");
r = await chamar("authenticated", juliana, "comercial_estado", {});
confere(r.novo === true && r.escritorio === "Lima Arquitetura", "antes de começar, o estado diz novo (o site mostra o primeiro acesso)");
r = await chamar("authenticated", juliana, "comercial_iniciar", { p_modelo: "arquitetura" });
const form = r.formularios[0];
confere(r.novo === false && r.ajustes.etapas.length === 6 && r.ajustes.etapas.map((e) => e.id).join() === "solicitacao,contato,reuniao,retorno,aprovado,recusado",
  "as seis etapas de fábrica: " + r.ajustes.etapas.map((e) => e.nome).join(", "));
confere(r.formularios.length === 1 && form.codigo === "LIMA-CASA" && form.nome === "Casa e reforma", "o formulário CASA E REFORMA no endereço LIMA-CASA: " + form.codigo);
confere(form.perguntas.length === 11 && form.perguntas.at(-1).tipo === "privacidade", "onze perguntas, com a privacidade no fim: " + form.perguntas.length);
confere(r.selo === true && r.pro === false, "sem o PRO, o selo Feito com Arquionie");
confere(Number(r.indicadores.pedidos) === 0 && Number(r.indicadores.conversao) === 0, "os números começam em zero");
r = await chamar("authenticated", juliana, "comercial_iniciar", { p_modelo: "interiores" });
confere(r.formularios.length === 1 && r.ajustes.modelo === "arquitetura", "começar de novo não duplica nem troca o modelo");
const ana = await novaConta("ana@estudioana.com.br");
r = await chamar("authenticated", ana, "comercial_iniciar", { p_modelo: "interiores" });
confere(r.formularios[0].nome === "Interiores" && /^[A-Z0-9-]{3,}$/.test(r.formularios[0].codigo), "o modelo INTERIORES, num endereço sem o e-mail: " + r.formularios[0].codigo);

console.log("\n2. O formulário público");
r = await chamar("anon", null, "comercial_formulario_abrir", { p_codigo: "lima-casa" });
confere(r.situacao === "aberto" && r.perguntas.length === 11 && r.escritorio.nome === "Lima Arquitetura" && r.selo === true && !("termo" in r.escritorio),
  "o cliente abre pelo código, sem conta, com a identidade do escritório e o selo");
r = await chamar("anon", null, "comercial_formulario_abrir", { p_codigo: "NAOEXISTE" });
confere(r.situacao === "inexistente", "código que não existe");
const respostas = (extra = {}) => ([
  { id: "objetivo", valor: "Construir do zero" }, { id: "terreno", valor: "Sim" }, { id: "area", valor: "180" },
  { id: "cidade", valor: "Sorocaba/SP" }, { id: "investimento", valor: "R$ 500 mil a R$ 800 mil" }, { id: "inicio", valor: "2027-03" },
  { id: "decide", valor: "Eu e outra pessoa" }, { id: "origem", valor: "Instagram" },
  { id: "dados", valor: { nome: "Mariana Costa", whatsapp: "(15) 99876-5432", email: " Mariana.Costa@Gmail.com " } },
  { id: "privacidade", valor: true },
].map((x) => (x.id in extra ? { id: x.id, valor: extra[x.id] } : x)));
r = await tentar("anon", null, "comercial_pedido_criar", { p_codigo: "LIMA-CASA", p_respostas: respostas() });
confere(r.erro, "o anon não grava pedido direto (só a função do servidor, depois do Turnstile)");
r = await chamar("service_role", null, "comercial_pedido_criar", { p_codigo: "LIMA-CASA", p_respostas: respostas(), p_origem: "instagram", p_ip_hash: "aa11aa11aa11aa11" });
confere(r.ok && r.numero === 1 && r.aviso.email === "juliana@limaarquitetura.com.br", "o pedido chega: número 1, com o aviso para o escritório: " + JSON.stringify(r));
const mari = await linha(`select * from public.comercial_pedidos where usuario_id = $1 and numero = 1`, [juliana]);
confere(mari.etapa === "solicitacao" && mari.nome === "Mariana Costa" && mari.whatsapp === "5515998765432" && mari.email === "mariana.costa@gmail.com",
  "na primeira etapa, com o WhatsApp com 55 e o e-mail em minúsculas");
confere(mari.tipo === "Construir do zero" && mari.cidade === "Sorocaba/SP" && Number(mari.area) === 180 && mari.obra === "R$ 500 mil a R$ 800 mil" &&
  mari.inicio === "2027-03" && mari.origem === "instagram", "os campos-chave saem das respostas; a origem do link vale mais que a pergunta");
confere(mari.respostas.length === 9 && mari.respostas.find((x) => x.id === "area").valor === 180, "as respostas guardadas como estavam (sem a privacidade)");
confere((await linha(`select count(*)::int n from public.comercial_atividades where pedido_id = $1 and tipo = 'chegou'`, [mari.id])).n === 1, "a linha do tempo começa: chegou");
r = await chamar("service_role", null, "comercial_pedido_criar", { p_codigo: "LIMA-CASA", p_respostas: respostas({ cidade: "" }) });
confere(!r.ok && r.pergunta === "cidade", "a pergunta obrigatória sem resposta é recusada com a frase: " + r.motivo);
r = await chamar("service_role", null, "comercial_pedido_criar", { p_codigo: "LIMA-CASA", p_respostas: respostas({ objetivo: "Uma piscina" }) });
confere(!r.ok && r.pergunta === "objetivo", "a resposta que não é uma das opções é recusada");
r = await chamar("service_role", null, "comercial_pedido_criar", { p_codigo: "LIMA-CASA", p_respostas: respostas({ privacidade: false }) });
confere(!r.ok && r.pergunta === "privacidade", "sem o aceite da privacidade, não envia");
r = await chamar("service_role", null, "comercial_pedido_criar", { p_codigo: "LIMA-CASA", p_respostas: respostas({ dados: { nome: "Sem contato" } }) });
confere(!r.ok && /WhatsApp ou o seu e-mail/.test(r.motivo), "sem WhatsApp e sem e-mail, não envia");
r = await chamar("service_role", null, "comercial_pedido_criar", { p_codigo: "LIMA-CASA",
  p_respostas: respostas({ objetivo: "Interiores", investimento: "" }), p_ip_hash: "bb22bb22bb22bb22" });
confere(r.ok, "a pergunta escondida pela regra (o investimento, só para construir ou reformar) não é cobrada");
for (let i = 0; i < 9; i++)
  await chamar("service_role", null, "comercial_pedido_criar", { p_codigo: "LIMA-CASA", p_respostas: respostas({ dados: { nome: "Lixo " + i, whatsapp: "11999990000" } }), p_ip_hash: "aa11aa11aa11aa11" });
r = await chamar("service_role", null, "comercial_pedido_criar", { p_codigo: "LIMA-CASA", p_respostas: respostas(), p_ip_hash: "aa11aa11aa11aa11" });
confere(!r.ok && /Muitos pedidos/.test(r.motivo), "o 11º pedido do mesmo endereço na mesma hora é barrado");
await db.query(`delete from public.comercial_pedidos where nome like 'Lixo %'`);

console.log("\n3. O quadro, o WhatsApp e as regras");
r = await chamar("authenticated", juliana, "comercial_estado", {});
confere(Number(r.indicadores.pedidos) === 2 && Number(r.indicadores.emAndamento) === 2 && r.pedidos.length === 2, "2 pedidos no quadro e nos números");
r = await chamar("authenticated", juliana, "comercial_whatsapp", { p_area: null, p_id: mari.id });
confere(r.ok && r.whatsapp === "5515998765432" && r.texto === "Olá, Mariana! Aqui é Juliana, da Lima Arquitetura. Recebi o seu pedido de projeto. Podemos conversar?" &&
  r.moveu === true && r.pedido.etapa === "contato", "o WhatsApp abre com a mensagem pronta e leva de SOLICITAÇÃO para EM CONTATO: " + r.texto);
r = await chamar("authenticated", juliana, "comercial_whatsapp", { p_area: null, p_id: mari.id });
confere(r.moveu === false && r.pedido.etapa === "contato", "o segundo WhatsApp não move mais");
r = await chamar("authenticated", juliana, "comercial_pedido_salvar", { p_area: null, p_id: mari.id,
  p: { reuniao: new Date(Date.now() + 864e5).toISOString(), nota: 4, observacoes: "Terreno de esquina, 12 × 30 m." } });
confere(r.ok && r.pedido.etapa === "reuniao" && r.pedido.nota === 4 && r.pedido.observacoes.startsWith("Terreno"), "marcar a reunião leva para REUNIÃO");
const orcamento = { projetos: [{ nome: "Casa térrea", tipo: "Construção do zero", area: 180, pavimentos: 1 }], m2: 3500, honorarios: 5,
  pacotes: [{ nome: "Completo", valor: 31500 }, { nome: "Intermediário", valor: 22050 }, { nome: "Básico", valor: 15750 }], escolhido: "Completo" };
r = await chamar("authenticated", juliana, "comercial_pedido_salvar", { p_area: null, p_id: mari.id, p: { orcamento, valor: "31500", retorno: hoje() } });
confere(r.ok && Number(r.pedido.valor) === 31500 && r.pedido.orcamento.pacotes.length === 3 && r.pedido.retorno === hoje(), "o orçamento, o valor e o retorno salvam");
r = await chamar("authenticated", juliana, "comercial_estado", {});
confere(r.hoje.length === 1 && r.hoje[0].motivo === "retorno" && r.hoje[0].pedido.nome === "Mariana Costa", "o retorno de hoje aparece em HOJE");
confere((await linha("select public.comercial_hoje()::text as dia")).dia === hoje(), "o dia de hoje é o de Brasília, com o banco em UTC como o Supabase");
r = await chamar("authenticated", juliana, "comercial_pedido_mover", { p_area: null, p_id: mari.id, p_etapa: "recusado" });
confere(!r.ok && r.pedeMotivo, "mover para RECUSADO pede o motivo");
r = await chamar("authenticated", juliana, "comercial_pedido_mover", { p_area: null, p_id: mari.id, p_etapa: "recusado", p_motivo: "Preço" });
confere(r.ok && r.pedido.etapa === "recusado" && r.pedido.motivo === "Preço", "com o motivo, vai");
r = await chamar("authenticated", juliana, "comercial_pedido_mover", { p_area: null, p_id: mari.id, p_etapa: "inventada" });
confere(!r.ok, "etapa que não existe é recusada");
r = await chamar("authenticated", juliana, "comercial_pedido_mover", { p_area: null, p_id: mari.id, p_etapa: "reuniao" });
confere(r.ok && r.pedido.motivo === "", "volta para REUNIÃO, sem o motivo");

console.log("\n4. A proposta e o aceite");
r = await chamar("authenticated", juliana, "comercial_proposta_criar", { p_area: null, p_pedido: mari.id, p: { jeito: "link", link: "canva.com/x" } });
confere(!r.ok && /https/.test(r.motivo), "link sem https é recusado");
r = await chamar("authenticated", juliana, "comercial_proposta_criar", { p_area: null, p_pedido: mari.id,
  p: { jeito: "modelo", conteudo: { projeto: "Casa térrea · 180 m²", pacotes: orcamento.pacotes, pagamento: { entrada: 30, parcelas: 7 } }, valor: "31500", retorno: emDias(3) } });
const prop = r;
confere(r.ok && /^[A-HJ-NP-Z2-9]{8}$/.test(r.codigo) && r.url === "arquionie.com.br/p/" + r.codigo, "a proposta no modelo ganha o código de 8 sinais: " + r.codigo);
confere(r.texto.includes(r.url) && r.texto.startsWith("Olá, Mariana! Segue a sua proposta da Lima Arquitetura:") && /retorno no dia \d\d\/\d\d/.test(r.texto),
  "a mensagem leva o link e a frase do retorno: " + r.texto);
confere(r.pedido.etapa === "retorno", "ENVIAR PROPOSTA leva para RETORNO");
r = await chamar("anon", null, "comercial_proposta_abrir", { p_codigo: prop.codigo.toLowerCase() });
confere(r.situacao === "aberta" && r.cliente === "Mariana Costa" && r.conteudo.pacotes.length === 3 && r.selo === true && r.escritorio.nome === "Lima Arquitetura",
  "o cliente abre a proposta sem conta, com os pacotes e a identidade");
await chamar("anon", null, "comercial_proposta_abrir", { p_codigo: prop.codigo });
let x = await linha(`select aberturas from public.comercial_propostas where codigo = $1`, [prop.codigo]);
confere(x.aberturas === 2, "conta as duas aberturas");
confere((await linha(`select count(*)::int n from public.comercial_atividades where pedido_id = $1 and tipo = 'abriu'`, [mari.id])).n === 1,
  "a linha do tempo anota só a primeira abertura do dia");
r = await chamar("authenticated", juliana, "comercial_estado", {});
const abriu = r.hoje.find((h) => h.motivo === "abriu");
confere(abriu && abriu.aberturas === 2 && r.pedidos.find((p) => p.id === mari.id).proposta.aberturas === 2, "ABRIU 2 VEZES no card e em HOJE");
r = await chamar("anon", null, "comercial_proposta_aceitar", { p_codigo: prop.codigo, p_nome: "Mariana Costa", p_concordo: true, p_pacote: "Ouro" });
confere(!r.ok && /pacotes/.test(r.motivo), "pacote que não existe é recusado");
r = await chamar("anon", null, "comercial_proposta_aceitar", { p_codigo: prop.codigo, p_nome: "Mariana Costa", p_concordo: false, p_pacote: "Intermediário" });
confere(!r.ok && /concorda/.test(r.motivo), "sem o li e concordo, não aceita");
r = await chamar("anon", null, "comercial_proposta_aceitar", { p_codigo: prop.codigo, p_nome: "Mariana Costa", p_concordo: true, p_pacote: "Intermediário" });
confere(r.ok && r.aviso.pacote === "Intermediário" && Number(r.aviso.valor) === 22050 && r.aviso.email === "juliana@limaarquitetura.com.br", "ACEITAR A PROPOSTA com o pacote Intermediário");
const mari2 = await linha(`select * from public.comercial_pedidos where id = $1`, [mari.id]);
confere(mari2.etapa === "aprovado" && Number(mari2.valor) === 22050, "o aceite leva para APROVADO com o valor do pacote");
r = await chamar("anon", null, "comercial_proposta_aceitar", { p_codigo: prop.codigo, p_nome: "Mariana Costa", p_concordo: true, p_pacote: "Completo" });
confere(!r.ok && /já foi aceita/.test(r.motivo), "a proposta aceita não aceita de novo");
r = await chamar("authenticated", juliana, "comercial_estado", {});
confere(Number(r.indicadores.ganhos) === 1 && Number(r.indicadores.conversao) === 50 && Number(r.indicadores.ticketMedio) === 22050 && Number(r.indicadores.valorGanho) === 22050,
  "os números: 1 ganho, 50% de conversão, ticket de R$ 22.050: " + JSON.stringify(r.indicadores));
r = await chamar("authenticated", juliana, "comercial_pedido", { p_area: null, p_id: mari.id });
const tipos = r.pedido.linhaDoTempo.map((t) => t.tipo);
confere(r.ok && ["chegou", "whatsapp", "reuniao", "etapa", "proposta", "abriu", "aceite"].every((t) => tipos.includes(t)) && r.pedido.propostas[0].aceite.nome === "Mariana Costa",
  "a linha do tempo tem tudo, do chegou ao aceite: " + [...new Set(tipos)].join(", "));

console.log("\n5. A proposta em PDF");
const bruno = (await chamar("authenticated", juliana, "comercial_pedido_novo", { p_area: null, p: { nome: "Bruno Teixeira", whatsapp: "15 98123-4400", tipo: "Reforma" } })).pedido;
confere(bruno.numero === 3 && bruno.etapa === "solicitacao" && bruno.whatsapp === "5515981234400", "NOVO PEDIDO à mão, número 3");
r = await chamar("authenticated", juliana, "comercial_proposta_criar", { p_area: null, p_pedido: bruno.id, p: { jeito: "pdf", valor: "18000" } });
const pdf = r;
confere(r.ok && r.subirPdf === true, "a proposta em PDF pede a subida do arquivo");
r = await chamar("anon", null, "comercial_proposta_abrir", { p_codigo: pdf.codigo });
confere(r.situacao === "preparando" && !r.arquivo, "antes do PDF subir, a página diz que está preparando");
r = await chamar("service_role", null, "comercial_proposta_pdf", { p_usuario: juliana, p_codigo: pdf.codigo, p_tamanho: 20 * 1048576 });
confere(!r.ok && /10 MB/.test(r.motivo), "PDF acima de 10 MB é recusado");
r = await chamar("service_role", null, "comercial_proposta_pdf", { p_usuario: juliana, p_codigo: pdf.codigo, p_tamanho: 2 * 1048576 });
confere(r.ok && r.arquivo === `comercial/${bruno.id}/${pdf.codigo}.pdf`, "o PDF registrado no caminho do R2: " + r.arquivo);
r = await chamar("anon", null, "comercial_proposta_abrir", { p_codigo: pdf.codigo });
confere(r.situacao === "aberta" && r.arquivo, "com o PDF, a página abre");
await db.query(`update public.ajustes_comercial set espaco_gratis_mb = 10`);
const pdf2 = await chamar("authenticated", juliana, "comercial_proposta_criar", { p_area: null, p_pedido: bruno.id, p: { jeito: "pdf" } });
r = await chamar("service_role", null, "comercial_proposta_pdf", { p_usuario: juliana, p_codigo: pdf2.codigo, p_tamanho: 9 * 1048576 });
confere(!r.ok && r.limite, "no grátis, o espaço dos PDFs tem limite: " + r.motivo);
await db.query(`update public.ajustes_comercial set espaco_gratis_mb = 300`);

console.log("\n6. A equipe");
const maria = await novaConta("maria@limaarquitetura.com.br");
await db.query(`insert into public.equipe (responsavel_id, email, situacao) values ($1, 'maria@limaarquitetura.com.br', 'ativo')`, [juliana]);
r = await chamar("authenticated", maria, "comercial_estado", { p_area: juliana });
confere(r.escritorio === "Lima Arquitetura" && r.responsavel === false && r.pedidos.length === 3, "quem é da equipe vê o Comercial do escritório");
r = await chamar("service_role", null, "comercial_proposta_pdf", { p_usuario: outra, p_codigo: pdf.codigo, p_tamanho: 1048576 });
confere(!r.ok, "quem não é da equipe não sobe PDF na proposta do escritório");
r = await chamar("service_role", null, "comercial_proposta_pdf", { p_usuario: maria, p_codigo: pdf.codigo, p_tamanho: 2 * 1048576 });
confere(r.ok, "quem é da equipe sobe o PDF");
r = await chamar("authenticated", maria, "comercial_whatsapp", { p_area: juliana, p_id: bruno.id });
confere(r.ok && r.texto.includes("Aqui é a equipe, da Lima Arquitetura"), "quem não pôs o nome na conta aparece como a equipe: " + r.texto);
r = await tentar("authenticated", outra, "comercial_estado", { p_area: juliana });
confere(r.codigo === "42501", "quem não é da equipe não vê");
r = await tentar("authenticated", maria, "comercial_ajustes_salvar", { p_area: juliana, p: { motivos: ["Preço"] } });
confere(r.codigo === "42501", "a equipe não muda os ajustes (só o responsável)");
r = await tentar("authenticated", maria, "comercial_pedido_excluir", { p_area: juliana, p_id: bruno.id });
confere(r.codigo === "42501", "a equipe não exclui pedido");
r = await chamar("authenticated", outra, "comercial_pedido", { p_area: null, p_id: mari.id });
confere(!r.ok, "o pedido de outro escritório não aparece pela própria área");

console.log("\n7. Os ajustes");
const etapas = (await chamar("authenticated", juliana, "comercial_estado", {})).ajustes.etapas;
r = await chamar("authenticated", juliana, "comercial_ajustes_salvar", { p_area: null, p: { etapas: etapas.filter((e) => e.tipo !== "perdido") } });
confere(!r.ok && /perdido/.test(r.motivo), "o fluxo precisa de uma etapa de cada tipo");
const reuniao = await chamar("authenticated", juliana, "comercial_pedido_novo", { p_area: null, p: { nome: "Carlos Ferraz", etapa: "reuniao" } });
const semReuniao = etapas.filter((e) => e.id !== "reuniao").map((e) => (e.id === "contato" ? { ...e, nome: "Conversando" } : e));
semReuniao.splice(4, 0, { id: "espera", nome: "Em espera", cor: "#5D6B80", tipo: "andamento", aviso: 30 });
r = await chamar("authenticated", juliana, "comercial_ajustes_salvar", { p_area: null, p: { etapas: semReuniao, whatsapp: "(15) 3222-8800", motivos: ["Preço", "Prazo", "Outro"] } });
confere(r.ok && r.movidos === 1, "apagar REUNIÃO leva o pedido dela para a primeira etapa: " + JSON.stringify({ ok: r.ok, movidos: r.movidos, motivo: r.motivo }));
const est = r.estado;
confere(est.ajustes.etapas.map((e) => e.nome).join() === "Solicitação,Conversando,Retorno,Aprovado,Em espera,Recusado" && est.ajustes.regras.reuniao.liga === false,
  "a etapa nova entra, a renomeada fica, e a regra da reunião, sem destino, se desliga");
confere(est.ajustes.whatsapp === "551532228800" && est.ajustes.motivos.length === 3, "o WhatsApp do escritório e os motivos salvam");
confere((await linha(`select etapa from public.comercial_pedidos where id = $1`, [reuniao.pedido.id])).etapa === "solicitacao", "o Carlos foi para SOLICITAÇÃO");
r = await chamar("anon", null, "comercial_formulario_abrir", { p_codigo: "LIMA-CASA" });
confere(r.whatsappEscritorio === "551532228800", "o formulário do cliente leva o WhatsApp do escritório");
r = await chamar("authenticated", juliana, "comercial_ajustes_salvar", { p_area: null, p: { whatsapp: "123" } });
confere(!r.ok, "WhatsApp do escritório sem DDD é recusado");
r = await chamar("authenticated", juliana, "comercial_ajustes_de_fabrica", { p_area: null });
confere(r.ok && r.estado.ajustes.etapas.length === 6 && r.movidos >= 0 && r.estado.ajustes.regras.reuniao.liga === true, "VOLTAR AO MODELO DE FÁBRICA");

console.log("\n8. O criador de formulários e os limites");
const perguntas = form.perguntas.filter((q) => q.tipo !== "privacidade");
r = await chamar("authenticated", juliana, "comercial_formulario_salvar", { p_area: null, p_id: form.id, p: { nome: "Casa e reforma", perguntas: [...perguntas, { id: "x", tipo: "foto", texto: "Mande foto" }] } });
confere(!r.ok && /desconhecido/.test(r.motivo), "tipo de pergunta desconhecido é recusado: " + r.motivo);
r = await chamar("authenticated", juliana, "comercial_formulario_salvar", { p_area: null, p_id: form.id, p: { nome: "Casa e reforma", perguntas: perguntas.filter((q) => q.tipo !== "contato") } });
confere(!r.ok && /WhatsApp ou o e-mail/.test(r.motivo), "o formulário precisa pedir como responder");
r = await chamar("authenticated", juliana, "comercial_formulario_salvar", { p_area: null, p_id: form.id, p: { nome: "Casa e reforma (novo)", perguntas: form.perguntas } });
confere(r.ok && r.formulario.versao === 1 && r.formulario.nome === "Casa e reforma (novo)", "mudar só o nome não sobe a versão");
const comDesvio = perguntas.map((q) => (q.id === "terreno" ? { ...q, opcoes: [{ texto: "Sim" }, { texto: "Ainda não", desvio: true }] } : q));
r = await chamar("authenticated", juliana, "comercial_formulario_salvar", { p_area: null, p_id: form.id, p: { nome: "Casa e reforma", perguntas: comDesvio } });
confere(r.ok && r.formulario.versao === 2 && r.formulario.perguntas.at(-1).tipo === "privacidade", "mudar as perguntas sobe a versão, e a privacidade fica no fim");
r = await chamar("service_role", null, "comercial_pedido_criar", { p_codigo: "LIMA-CASA", p_respostas: respostas({ terreno: "Ainda não" }) });
confere(!r.ok && r.desvio === true && /terreno/.test(r.motivo), "o desvio encerra com a mensagem do escritório, sem gravar pedido");
await db.query(`update public.ajustes_comercial set livres_no_lancamento = false`);
const curto = [{ id: "nome", tipo: "texto-curto", texto: "Nome", obrigatoria: true, chave: "nome" }, { id: "zap", tipo: "texto-curto", texto: "WhatsApp", obrigatoria: true, chave: "whatsapp" }];
for (const n of ["Comercial", "Regularização"]) await chamar("authenticated", juliana, "comercial_formulario_salvar", { p_area: null, p_id: null, p: { nome: n, perguntas: curto } });
r = await chamar("authenticated", juliana, "comercial_formulario_salvar", { p_area: null, p_id: null, p: { nome: "Quarto", perguntas: curto } });
confere(!r.ok && r.limite, "no grátis, fora do lançamento, até 3 formulários no ar: " + r.motivo);
r = await chamar("authenticated", juliana, "comercial_formulario_salvar", { p_area: null, p_id: null, p: { nome: "Quarto", perguntas: curto, ativo: false } });
confere(r.ok && r.formulario.codigo === "LIMA-QUARTO", "pausado, o quarto entra (e o endereço se faz pelo nome)");
await chamar("authenticated", gestor, "gestao_liberar", { p_dono_email: "juliana@limaarquitetura.com.br", p_produto: "arquionie", p_quantidade: 1,
  p_expira_em: new Date(Date.now() + 365 * 864e5).toISOString() });
r = await chamar("authenticated", juliana, "comercial_formulario_salvar", { p_area: null, p_id: r.formulario.id, p: { nome: "Quarto", perguntas: curto, ativo: true } });
confere(r.ok, "com o PRO do Arquionie, o limite some");
r = await chamar("authenticated", juliana, "comercial_estado", {});
confere(r.pro === true && r.selo === false, "com o PRO, sem o selo");
await db.query(`update public.ajustes_comercial set livres_no_lancamento = true`);

console.log("\n9. Denúncia, /gestao e a tarefa diária");
r = await chamar("anon", null, "comercial_denunciar", { p_codigo: "LIMA-CASA", p_motivo: "Pede a senha do banco" });
confere(r.ok, "DENUNCIAR sem conta");
r = await tentar("authenticated", juliana, "gestao_comercial", {});
confere(r.codigo === "42501", "só o gestor vê o /gestao do Comercial");
r = await chamar("authenticated", gestor, "gestao_comercial", {});
confere(Number(r.escritorios) === 2 && r.denunciados.length === 1 && r.denunciados[0].motivos[0] === "Pede a senha do banco", "o /gestao vê os escritórios e a denúncia");
await chamar("authenticated", gestor, "gestao_comercial_pausar", { p_formulario: form.id, p_pausar: true });
r = await chamar("anon", null, "comercial_formulario_abrir", { p_codigo: "LIMA-CASA" });
confere(r.situacao === "pausado", "o formulário pausado pelo gestor fica fora do ar");
r = await chamar("service_role", null, "comercial_pedido_criar", { p_codigo: "LIMA-CASA", p_respostas: respostas() });
confere(!r.ok, "e não recebe pedido");
await chamar("authenticated", gestor, "gestao_comercial_pausar", { p_formulario: form.id, p_pausar: false });
await db.query(`update public.comercial_pedidos set etapa_desde = now() - interval '20 days', retorno = null where id = $1`, [bruno.id]);
await db.query(`update public.comercial_pedidos set etapa = 'contato' where id = $1`, [bruno.id]);
r = await chamar("service_role", null, "comercial_mover_parados", {});
confere(r.movidos === 0, "com a regra PARADO desligada (de fábrica), nada se move");
await chamar("authenticated", juliana, "comercial_ajustes_salvar", { p_area: null, p: { regras: { parado: { liga: true } } } });
r = await chamar("service_role", null, "comercial_mover_parados", {});
const b2 = await linha(`select etapa, motivo from public.comercial_pedidos where id = $1`, [bruno.id]);
confere(r.movidos === 1 && b2.etapa === "recusado" && b2.motivo === "Sem resposta", "ligada, o parado há 20 dias em EM CONTATO vai para RECUSADO, sem resposta");

console.log("\n10. Exportar, excluir e as portas fechadas");
r = await chamar("authenticated", juliana, "comercial_exportar", { p_area: null });
confere(r.ok && r.pedidos.length === 4 && r.pedidos[0].numero === 1 && r.pedidos[0].etapa === "Aprovado", "EXPORTAR PLANILHA com todos os pedidos e o nome da etapa");
r = await chamar("authenticated", juliana, "comercial_pedido_excluir", { p_area: null, p_id: bruno.id });
confere(r.ok && r.arquivos.length === 1 && r.arquivos[0].endsWith(".pdf"), "EXCLUIR apaga o pedido e devolve o PDF para sair do R2");
confere((await linha(`select count(*)::int n from public.comercial_atividades where pedido_id = $1`, [bruno.id])).n === 0, "a linha do tempo vai junto");
r = await chamar("service_role", null, "comercial_lixo_pegar", {});
confere(r.length === 1 && r[0].endsWith(".pdf"), "o PDF do pedido excluído espera na fila do lixo");
r = await chamar("service_role", null, "comercial_lixo_pegar", {});
confere(r.length === 0, "a tarefa diária esvazia a fila");
for (const [papel, nome, args] of [["authenticated", "comercial_trocar_etapa", { p_pedido: mari.id, p_para: "recusado", p_motivo: "x", p_por: juliana, p_porque: "x" }],
                                   ["authenticated", "comercial_pedido_criar", { p_codigo: "LIMA-CASA", p_respostas: respostas() }],
                                   ["anon", "comercial_whatsapp", { p_area: juliana, p_id: mari.id }],
                                   ["authenticated", "comercial_mover_parados", {}]]) {
  r = await tentar(papel, papel === "authenticated" ? juliana : null, nome, args);
  confere(r.erro, `${papel} não chama ${nome}`);
}
r = await tentar("authenticated", juliana, "comercial_estado", {}).then(() => db.query(`set role authenticated`)).then(() => db.query(`select * from public.comercial_pedidos`))
  .then((q) => ({ linhas: q.rows.length })).catch((e) => ({ erro: e.message }));
await db.query(`reset role`);
confere(r.erro || r.linhas === 0, "ninguém lê a tabela direto (só pelas funções)");

console.log(`\nComercial: ${certos} certos, ${ruins.length} falharam.`);
if (ruins.length) { console.log(ruins.map((m) => " - " + m).join("\n")); process.exit(1); }
