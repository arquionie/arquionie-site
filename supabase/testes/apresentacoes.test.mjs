// Teste do ENVIAR PARA O CLIENTE (migração 20261011000000_apresentacoes.sql e funções apresentacoes e cliente) num Postgres local
// (PGlite), com o R2 e o Resend de mentira na memória. Não toca no Supabase, no R2 nem no e-mail de verdade. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/apresentacoes.test.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const AQUI = dirname(fileURLToPath(import.meta.url));
const COPIA = join(tmpdir(), "arquionie-testes-apresentacoes");

const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, tentar, novaConta, db } = banco;
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };

// O R2 e o Resend de mentira.
const objetos = new Map();
const emails = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), metodo = init.method ?? "GET";
  if (u.hostname === "api.resend.com") { emails.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
  const chave = decodeURIComponent(u.pathname.replace(/^\/arquionie-tours\/?/, ""));
  if (metodo === "PUT") { objetos.set(chave, init.body?.length ?? 0); return new Response("", { status: 200 }); }
  if (metodo === "DELETE") { objetos.delete(chave); return new Response(null, { status: 204 }); }
  if (metodo === "HEAD") return objetos.has(chave) ? new Response(null, { status: 200, headers: { "content-length": String(objetos.get(chave)) } }) : new Response(null, { status: 404 });
  const prefixo = u.searchParams.get("prefix") ?? "";
  const xml = [...objetos].filter(([k]) => k.startsWith(prefixo)).map(([k, t]) => `<Contents><Key>${k}</Key><Size>${t}</Size></Contents>`).join("");
  return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>${xml}</ListBucketResult>`, { status: 200 });
};
const subir = (url, bytes) => fetch(url, { method: "PUT", body: new Uint8Array(bytes) });

const env = {
  SUPABASE_URL: "http://local", SUPABASE_SERVICE_ROLE_KEY: "x", SITE_URL: "https://www.arquionie.com.br",
  R2_CONTA: "conta123", R2_CHAVE: "AKIAIOSFODNN7EXAMPLE", R2_SEGREDO: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  RESEND_API_KEY: "re_teste", LIMPEZA_SEGREDO: "segredo-da-limpeza",
};
globalThis.Deno = { env: { get: (k) => env[k] }, serve: () => {} };

// O cliente do Supabase de mentira (o mesmo do teste dos tours) e as funções copiadas com os caminhos dele.
mkdirSync(join(COPIA, "_compartilhado"), { recursive: true });
mkdirSync(join(COPIA, "apresentacoes"), { recursive: true });
mkdirSync(join(COPIA, "cliente"), { recursive: true });
writeFileSync(join(COPIA, "supabase-falso.mjs"), `
export function createClient() {
  return {
    rpc: async (nome, args) => {
      try { return { data: await globalThis.__chamar("service_role", null, nome, args), error: null }; }
      catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
    },
    auth: { getUser: async (jwt) => jwt.startsWith("conta:") ? { data: { user: { id: jwt.slice(6) } }, error: null }
      : { data: { user: null }, error: { message: "token inválido" } } },
  };
}`);
globalThis.__chamar = chamar;
const FUNCOES = join(AQUI, "..", "functions");
writeFileSync(join(COPIA, "_compartilhado", "r2.ts"), readFileSync(join(FUNCOES, "_compartilhado", "r2.ts"), "utf8"));
for (const f of ["apresentacoes", "cliente"])
  writeFileSync(join(COPIA, f, "index.mts"), readFileSync(join(FUNCOES, f, "index.ts"), "utf8").replace('"npm:@supabase/supabase-js@2"', '"../supabase-falso.mjs"'));
const apresentacoes = await import(pathToFileURL(join(COPIA, "apresentacoes", "index.mts")).href);
const cliente = await import(pathToFileURL(join(COPIA, "cliente", "index.mts")).href);
const post = async (funcao, conta, corpo, cabecalhos = {}) => {
  const r = await funcao.tratar(new Request("http://local", { method: "POST", body: JSON.stringify(corpo),
    headers: { ...(conta ? { Authorization: `Bearer conta:${conta}` } : {}), ...cabecalhos } }));
  const texto = await r.text();
  try { return { status: r.status, ...JSON.parse(texto) }; } catch { return { status: r.status, texto }; }
};
const impressao = (n) => n.toString(16).padStart(64, "0");
const arq = (n, ext, tamanho) => ({ arquivo: `${impressao(n)}.${ext}`, tamanho });

console.log("\n11. ENVIAR: o link, os arquivos pela impressão e a página que troca de uma vez");
const bia = await novaConta("bia@exemplo.com.br");
let r = await post(apresentacoes, null, { acao: "enviar" });
confere(r.status === 401, "sem conta: 401");
const envio1 = [arq(1, "json", 300), arq(2, "bin", 5000), arq(3, "jpg", 2000), arq(4, "m3u8", 100)];
r = await post(apresentacoes, bia, { acao: "enviar", chave: "225", nome: "225 · IGREJA ALIANÇA", fase: "aprovacao", paraQuem: "O PASTOR", mudancas: "", arquivos: envio1 });
confere(r.ok && /^[A-HJ-NP-Z2-9]{6}$/.test(r.codigo) && r.link === `https://www.arquionie.com.br/t/${r.codigo}` && r.numero === 1 && r.envios.length === 4 && r.jaNoServidor === 0,
  "ENVIAR dá o código, o link, o envio 1 e as 4 URLs: " + JSON.stringify({ codigo: r.codigo, numero: r.numero, n: r.envios.length }));
const { codigo, id } = r; let envioId = r.envio;
confere(r.envios[0].url.includes(`/arquionie-tours/apresentacoes/${codigo}-`) && r.envios[0].url.includes("/arquivos/" + impressao(1) + ".json?"), "a URL vai à pasta dos arquivos, pela impressão");
const prazo = (new Date(r.expiraEm) - Date.now()) / 864e5;
confere(prazo > 364 && prazo < 366, "um ano no ar por padrão (ÊDI): " + prazo.toFixed(1));
let abrir = await chamar("anon", null, "apresentacao_abrir", { p_codigo: codigo });
confere(abrir.situacao === "inexistente", "antes de concluir, o link não abre");
r = await post(apresentacoes, bia, { acao: "concluir", envio: envioId, manifesto: impressao(1) + ".json", arquivos: envio1.map((a) => a.arquivo) });
confere(!r.ok && /4 arquivo/.test(r.motivo), "concluir sem os arquivos no R2 é recusado: " + JSON.stringify(r));
// Reenviar antes de concluir (o programa caiu no meio) retoma o mesmo envio.
r = await post(apresentacoes, bia, { acao: "enviar", chave: "225", nome: "225 · IGREJA ALIANÇA", fase: "aprovacao", paraQuem: "O PASTOR", arquivos: envio1 });
confere(r.ok && r.numero === 1 && r.envio === envioId, "reenviar antes de concluir: o mesmo envio 1");
for (const e of r.envios) await subir(e.url, new Array(envio1.find((a) => a.arquivo === e.arquivo).tamanho).fill(1));
r = await post(apresentacoes, bia, { acao: "concluir", envio: envioId, manifesto: impressao(1) + ".json", arquivos: envio1.map((a) => a.arquivo) });
confere(r.ok && r.numero === 1 && r.link.endsWith(codigo), "CONCLUIR publica: " + JSON.stringify(r));
abrir = await chamar("anon", null, "apresentacao_abrir", { p_codigo: codigo.toLowerCase() });
confere(abrir.situacao === "publicado" && abrir.envio.numero === 1 && abrir.envio.fase === "aprovacao" && abrir.envio.situacao === "aguardando"
  && abrir.envio.manifesto === impressao(1) + ".json" && abrir.arquivos.startsWith(`apresentacoes/${codigo}-`) && abrir.arquivos.endsWith("/arquivos/"),
  "o link abre sem conta, com o envio.json e a pasta: " + JSON.stringify({ s: abrir.situacao, e: abrir.envio?.numero, m: abrir.envio?.manifesto }));
confere(abrir.escritorio.termo.itens.length === 3 && abrir.escritorio.termo.titulo === "APROVAÇÃO DA PROPOSTA" && abrir.escritorio.cor === "#E76353",
  "sem a identidade gravada, o termo de fábrica (o da Palheta) e o coral");
let situacao = await chamar("anon", null, "apresentacao_situacao", { p_codigo: codigo });
confere(situacao.situacao === "aguardando" && situacao.envio === 1 && situacao.comentarios === 0 && situacao.fase === "aprovacao",
  "a situação para o sistema Palheta: AGUARDANDO: " + JSON.stringify(situacao));

// O envio 2: só sobe o que mudou; enquanto sobe, o link mostra o 1; publicado, o que só o 1 usava sai do R2.
const envio2 = [arq(11, "json", 310), arq(2, "bin", 5000), arq(3, "jpg", 2000), arq(14, "m3u8", 120)];
r = await post(apresentacoes, bia, { acao: "enviar", chave: "225", nome: "225 · IGREJA ALIANÇA", fase: "aprovacao", paraQuem: "O PASTOR", mudancas: "O palco 1 m para a frente", arquivos: envio2 });
confere(r.ok && r.numero === 2 && r.codigo === codigo && r.envios.length === 2 && r.jaNoServidor === 2, "o envio 2 no mesmo link, só os 2 que mudaram sobem: " + JSON.stringify({ n: r.numero, novos: r.envios.length }));
envioId = r.envio;
for (const e of r.envios) await subir(e.url, [1, 2, 3]);
abrir = await chamar("anon", null, "apresentacao_abrir", { p_codigo: codigo });
confere(abrir.envio.numero === 1, "enquanto o 2 sobe, o link abre o 1 inteiro");
r = await post(apresentacoes, bia, { acao: "concluir", envio: envioId, manifesto: impressao(11) + ".json", arquivos: envio2.map((a) => a.arquivo) });
const chaves = [...objetos.keys()].map((k) => k.split("/").pop()).sort();
confere(r.ok && r.numero === 2 && chaves.length === 4 && !chaves.includes(impressao(1) + ".json") && !chaves.includes(impressao(4) + ".m3u8"),
  "publicado o 2, o que só o 1 usava sai do R2: " + JSON.stringify(chaves.map((c) => c.slice(-8))));
abrir = await chamar("anon", null, "apresentacao_abrir", { p_codigo: codigo });
confere(abrir.envio.numero === 2 && abrir.envio.manifesto === impressao(11) + ".json", "o link abre o envio 2");

console.log("\n12. SOLICITAR AJUSTES e APROVAR: dois caminhos, o aviso ao escritório e a etiqueta");
r = await post(cliente, null, { acao: "comentar", codigo, envio: 2, nome: "", comentarios: [{ texto: "x" }] });
confere(!r.ok && /nome/.test(r.motivo), "sem o nome, recusado");
r = await post(cliente, null, { acao: "comentar", codigo, envio: 1, nome: "O PASTOR", comentarios: [{ texto: "x" }] });
confere(!r.ok, "o envio de antes não recebe mais comentário");
const comentarios = [
  { texto: "Dá para o palco vir mais 1 m para a frente?", lugar: { pavimento: "TÉRREO", ambiente: "AUDITÓRIO", ponto: [12.3, -4.1, 0.6], vista: { modo: "planta" } } },
  { texto: "O balcão do café pode ser mais comprido?", lugar: { pavimento: "TÉRREO", ambiente: "HALL", ponto: [1, 2, 0.9] } },
  { texto: "O letreiro um pouco maior." },
];
r = await post(cliente, null, { acao: "comentar", codigo, envio: 2, nome: "O PASTOR", comentarios });
confere(r.ok && r.situacao === "ajustes", "SOLICITAR AJUSTES: os 3 comentários juntos: " + JSON.stringify(r));
confere(emails.length === 1 && emails[0].to[0] === "bia@exemplo.com.br" && /O PASTOR pediu ajustes \(3 comentários\)/.test(emails[0].subject)
  && /AUDITÓRIO/.test(emails[0].html), "o e-mail ao escritório: " + (emails[0]?.subject ?? "nenhum"));
situacao = await chamar("anon", null, "apresentacao_situacao", { p_codigo: codigo });
confere(situacao.situacao === "ajustes" && situacao.comentarios === 3, "a etiqueta AJUSTES (3): " + JSON.stringify(situacao));
abrir = await chamar("anon", null, "apresentacao_abrir", { p_codigo: codigo });
confere(abrir.envio.pedidos.length === 1 && abrir.envio.pedidos[0].comentarios.length === 3 && abrir.envio.pedidos[0].comentarios[0].lugar.ambiente === "AUDITÓRIO",
  "os alfinetes ficam na página para quem abre");
let respostas = await chamar("authenticated", bia, "apresentacao_respostas", { p_desde: null });
confere(respostas.pedidos.length === 1 && respostas.pedidos[0].codigo === codigo && respostas.pedidos[0].envio === 2 && !respostas.pedidos[0].lido,
  "o programa lê o pedido de ajustes (não lido)");
const outra = await novaConta("caio@exemplo.com.br");
r = await chamar("authenticated", outra, "apresentacao_respostas", { p_desde: null });
confere(r.pedidos.length === 0, "outra conta não vê");
await chamar("authenticated", bia, "apresentacao_marcar_lidas", { p_lista: [respostas.pedidos[0].id] });
respostas = await chamar("authenticated", bia, "apresentacao_respostas", { p_desde: null });
confere(respostas.pedidos[0].lido, "marcado como lido");
const depois = respostas.agora;

r = await post(cliente, null, { acao: "aprovar", codigo, envio: 2, nome: "O PASTOR", itens: [true, true, false] });
confere(!r.ok && /Marque todos/.test(r.motivo), "aprovar sem todos os itens marcados é recusado");
r = await post(cliente, null, { acao: "aprovar", codigo, envio: 2, nome: "O PASTOR", itens: [true, true, true] });
confere(r.ok && r.situacao === "aprovado", "APROVAR pelo termo: " + JSON.stringify(r));
confere(emails.length === 2 && /O PASTOR aprovou o projeto/.test(emails[1].subject) && /As expectativas plásticas/.test(emails[1].html), "o e-mail da aprovação, com o termo");
situacao = await chamar("anon", null, "apresentacao_situacao", { p_codigo: codigo });
confere(situacao.situacao === "aprovado" && situacao.aprovadoPor === "O PASTOR", "a etiqueta APROVADO: " + JSON.stringify(situacao));
r = await post(cliente, null, { acao: "comentar", codigo, envio: 2, nome: "OUTRO", comentarios: [{ texto: "e agora?" }] });
confere(!r.ok, "aprovado, não recebe mais comentário");
respostas = await chamar("authenticated", bia, "apresentacao_respostas", { p_desde: depois });
confere(respostas.aprovacoes.length === 1 && respostas.pedidos.length === 0 && respostas.aprovacoes[0].termo.itens.length === 3, "o programa lê a aprovação nova, com o termo");
r = await chamar("authenticated", outra, "apresentacao_desfazer_aprovacao", { p_id: respostas.aprovacoes[0].id });
confere(!r.ok, "outra conta não desfaz");
r = await chamar("authenticated", bia, "apresentacao_desfazer_aprovacao", { p_id: respostas.aprovacoes[0].id });
situacao = await chamar("anon", null, "apresentacao_situacao", { p_codigo: codigo });
confere(r.ok && situacao.situacao === "ajustes" && !situacao.aprovadoPor, "DESFAZER a aprovação volta a AJUSTES: " + JSON.stringify(situacao));

console.log("\n13. A identidade do escritório e o termo próprio");
r = await chamar("authenticated", bia, "gravar_escritorio", { p: { nome: "PALHETA ARQUITETURA", frase: "ESPECIALISTA EM PROJETOS DE IGREJAS",
  site: "palhetaarquitetura.com.br", cor: "#E76353", redes: [{ rede: "instagram", endereco: "https://instagram.com/palhetaarquitetura" }],
  termo: { titulo: "ACEITE", abertura: "", itens: ["Li e concordo."], pergunta: "Aprova?" } } });
confere(r.ok, "GRAVAR a identidade e o termo próprio");
let meu = await chamar("authenticated", bia, "meu_escritorio");
confere(meu.nome === "PALHETA ARQUITETURA" && meu.termo.itens.length === 1 && meu.termoDeFabrica === false && meu.redes[0].rede === "instagram", "o escritório lido: " + JSON.stringify({ n: meu.nome, t: meu.termo.titulo }));
r = await chamar("authenticated", bia, "gravar_escritorio", { p: { cor: "vermelho" } });
confere(!r.ok, "a cor fora do formato é recusada");
abrir = await chamar("anon", null, "apresentacao_abrir", { p_codigo: codigo });
confere(abrir.escritorio.nome === "PALHETA ARQUITETURA" && abrir.escritorio.termo.titulo === "ACEITE", "a página já mostra a identidade nova (vale nas já enviadas)");
r = await post(apresentacoes, bia, { acao: "logo", tipo: "png", tamanho: 1000 });
confere(r.ok && /^escritorios\/[a-z0-9]{16}\/logo-1\.png$/.test(r.logo), "LOGO: o lugar e a URL: " + r.logo);
await subir(r.url, [1, 2]);
r = await post(apresentacoes, bia, { acao: "logoConcluir", logo: r.logo });
abrir = await chamar("anon", null, "apresentacao_abrir", { p_codigo: codigo });
confere(r.ok && abrir.escritorio.logo === r.logo, "o logo gravado aparece na página");
r = await post(apresentacoes, bia, { acao: "logo", tipo: "svg", tamanho: 900 });
await subir(r.url, [1]);
const logo2 = r.logo;
r = await post(apresentacoes, bia, { acao: "logoConcluir", logo: logo2 });
confere(r.ok && logo2.endsWith("logo-2.svg") && ![...objetos.keys()].some((k) => k.endsWith("logo-1.png")), "o logo novo troca o de antes, que sai do R2");

console.log("\n14. A fase final, pausar, vencer e excluir");
r = await post(apresentacoes, bia, { acao: "enviar", chave: "225", nome: "225 · IGREJA ALIANÇA", fase: "final", arquivos: [arq(21, "json", 50)] });
await subir(r.envios[0].url, [1]);
r = await post(apresentacoes, bia, { acao: "concluir", envio: r.envio, manifesto: impressao(21) + ".json", arquivos: [impressao(21) + ".json"] });
abrir = await chamar("anon", null, "apresentacao_abrir", { p_codigo: codigo });
confere(r.ok && abrir.envio.fase === "final" && abrir.envio.numero === 3, "a APRESENTAÇÃO FINAL no mesmo link");
r = await post(cliente, null, { acao: "comentar", codigo, envio: 3, nome: "O PASTOR", comentarios: [{ texto: "x" }] });
confere(!r.ok, "a apresentação final não recebe comentário");
let meus = await chamar("authenticated", bia, "minhas_apresentacoes");
confere(meus.apresentacoes.length === 1 && meus.apresentacoes[0].envios.length === 3 && meus.apresentacoes[0].envios[1].comentarios === 3 && meus.apresentacoes[0].envios[1].situacao === "ajustes",
  "o histórico de envios da conta: 3 envios, o 2 com 3 comentários: " + JSON.stringify(meus.apresentacoes[0].envios.map((e) => [e.numero, e.situacao, e.comentarios])));
r = await chamar("authenticated", bia, "apresentacao_pausar", { p_id: id, p_pausar: true });
abrir = await chamar("anon", null, "apresentacao_abrir", { p_codigo: codigo });
situacao = await chamar("anon", null, "apresentacao_situacao", { p_codigo: codigo });
confere(r.ok && abrir.situacao === "pausado" && !abrir.arquivos && abrir.escritorio.nome && situacao.situacao === "pausado", "PAUSAR: a página diz pausado, sem os arquivos");
await chamar("authenticated", bia, "apresentacao_pausar", { p_id: id, p_pausar: false });
await db.query(`update public.envios_apresentacao set expira_em = now() - interval '1 day' where numero = 3`);
abrir = await chamar("anon", null, "apresentacao_abrir", { p_codigo: codigo });
confere(abrir.situacao === "expirado" && !abrir.arquivos, "VENCIDO: a página diz que o material expirou");
r = await post(cliente, null, { acao: "limpar" });
confere(r.status === 401, "a limpeza sem o segredo é recusada");
const antes = objetos.size;
r = await post(cliente, null, { acao: "limpar" }, { "x-limpeza": "segredo-da-limpeza" });
confere(r.ok && r.prefixos.length === 1 && [...objetos.keys()].every((k) => !k.startsWith("apresentacoes/")) && antes > objetos.size,
  "a limpeza diária tira do R2 os arquivos do vencido: " + JSON.stringify(r.prefixos));
situacao = await chamar("anon", null, "apresentacao_situacao", { p_codigo: codigo });
confere(situacao.situacao === "expirado", "a etiqueta EXPIRADO");
r = await tentar("anon", null, "apresentacao_comentar", { p_codigo: codigo, p_numero: 3, p_nome: "x", p_comentarios: [{ texto: "x" }] });
confere(r.erro, "o navegador não chama o apresentacao_comentar direto (só pela função)");
r = await tentar("authenticated", bia, "apresentacao_enviar", { p_usuario: bia, p_chave: "x", p_nome: "x", p_fase: "aprovacao", p_para_quem: "", p_mudancas: "", p_dias: 365, p_codigo: "ABCDEF", p_pasta: "abcdefghijklmnop" });
confere(r.erro, "nem o apresentacao_enviar");
r = await post(apresentacoes, outra, { acao: "excluir", id });
confere(!r.ok, "outra conta não exclui");
r = await post(apresentacoes, bia, { acao: "excluir", id });
abrir = await chamar("anon", null, "apresentacao_abrir", { p_codigo: codigo });
confere(r.ok && abrir.situacao === "inexistente", "EXCLUIR: o link deixa de existir");
r = await post(apresentacoes, bia, { acao: "enviar", chave: "x", nome: "x", arquivos: [{ arquivo: "../fora.json", tamanho: 1 }] });
confere(r.status === 400, "nome de arquivo fora da impressão é recusado");

console.log(`\n${certos} de ${certos + ruins.length} conferências do ENVIAR PARA O CLIENTE passaram.`);
process.exitCode = ruins.length || process.exitCode ? 1 : 0;
