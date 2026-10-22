// Teste das funções campanhas e feedback (plano 18) rodando no Node contra o banco local (PGlite), com o Resend e o cliente
// do Supabase de mentira. Não toca no Supabase nem manda e-mail de verdade. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/envio.test.mjs
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const AQUI = dirname(fileURLToPath(import.meta.url));
const COPIA = join(tmpdir(), "arquionie-testes-envio");

const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, novaConta, db } = banco;
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };
const linha = async (sql, p = []) => (await db.query(sql, p)).rows[0];

// O Resend de mentira: guarda cada e-mail; a próxima resposta pode ser trocada (429, 422).
const enviados = [];
let respostas = [];
globalThis.fetch = async (url, init = {}) => {
  if (String(url) !== "https://api.resend.com/emails") throw new Error("fetch inesperado: " + url);
  const corpo = JSON.parse(init.body);
  const status = respostas.shift() ?? 200;
  if (status === 200) enviados.push({ ...corpo, chave: init.headers.Authorization });
  return new Response(status === 200 ? '{"id":"x"}' : '{"message":"erro de teste"}', { status });
};

const env = {
  SUPABASE_URL: "https://local.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x", SUPABASE_ANON_KEY: "y",
  RESEND_CAMPANHAS: "re_teste", CAMPANHAS_SEGREDO: "segredo-de-teste", WHATSAPP_NUMERO: "5511999998888",
};
globalThis.Deno = { env: { get: (k) => env[k] }, serve: () => {} };

// O cliente do Supabase de mentira: rpc como service_role, ou como a conta do token "conta:<id>" quando a função cria o
// cliente com o token de quem chamou; getUser e getUserById leem o auth.users local; from("computadores") só para o feedback.
mkdirSync(COPIA, { recursive: true });
writeFileSync(join(COPIA, "supabase-falso.mjs"), `
const conta = async (id) => id ? (await globalThis.__db.query("select id, email, raw_user_meta_data as user_metadata from auth.users where id = $1", [id])).rows[0] : null;
export function createClient(_url, _chave, opcoes) {
  const token = opcoes?.global?.headers?.Authorization?.replace("Bearer ", "");
  const uid = token?.startsWith("conta:") ? token.slice(6) : null;
  return {
    rpc: async (nome, args = {}) => {
      try { return { data: await globalThis.__chamar(uid ? "authenticated" : "service_role", uid, nome, args), error: null }; }
      catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
    },
    auth: {
      getUser: async (jwt) => ({ data: { user: jwt?.startsWith("conta:") ? await conta(jwt.slice(6)) : null } }),
      admin: { getUserById: async (id) => ({ data: { user: await conta(id) } }) },
    },
    from: (tabela) => ({ select: () => ({ eq: (col, val) => ({ maybeSingle: async () => ({
      data: (await globalThis.__db.query("select usuario_id from public." + tabela + " where " + col + " = $1", [val])).rows[0] ?? null }) }) }) }),
  };
}`);
globalThis.__chamar = chamar;
globalThis.__db = db;
const FUNCOES = join(AQUI, "..", "functions");
cpSync(join(FUNCOES, "_compartilhado"), join(COPIA, "_compartilhado"), { recursive: true });
for (const f of ["campanhas", "feedback"]) {
  mkdirSync(join(COPIA, f), { recursive: true });
  writeFileSync(join(COPIA, f, "index.mts"),
    readFileSync(join(FUNCOES, f, "index.ts"), "utf8").replace('"npm:@supabase/supabase-js@2"', '"../supabase-falso.mjs"'));
}
const campanhas = (await import(pathToFileURL(join(COPIA, "campanhas", "index.mts")).href)).tratar;
const feedback = (await import(pathToFileURL(join(COPIA, "feedback", "index.mts")).href)).tratar;
const { assinarEmail, montarEmail } = await import(pathToFileURL(join(COPIA, "_compartilhado", "email-campanha.ts")).href);
const pedir = async (tratar, corpo, cabecalhos = {}) => {
  const r = await tratar(new Request("https://local.supabase.co/functions/v1/x", { method: "POST", body: JSON.stringify(corpo), headers: cabecalhos }));
  const texto = await r.text();
  try { return { status: r.status, ...JSON.parse(texto) }; } catch { return { status: r.status, texto }; }
};
const processar = () => pedir(campanhas, { acao: "processar" }, { "x-campanhas": "segredo-de-teste" });

const gestora = await novaConta("gestora.envio@exemplo.com.br");
await db.query(`insert into public.administradores (usuario_id) values ($1)`, [gestora]);
const comum = await novaConta("comum.envio@exemplo.com.br");

console.log("\n1. A tarefa do pg_cron manda o lote, um e-mail de cada vez");
let r = await pedir(campanhas, { acao: "processar" });
confere(r.status === 401, "sem o segredo, ninguém dispara a fila");
const camp = (await chamar("authenticated", gestora, "gestao_campanha_criar", {
  p_assunto: "Novidade para {nome}", p_mensagem: "Olá, {nome}!\n\nO cupom {cupom} dá **{desconto}%**.", p_cupom: "PFPRO10", p_desconto: 10,
  p_lote: 2, p_intervalo_min: 5, p_limite_dia: 80,
  p_destinatarios: [{ email: "lucas@exemplo.com.br", nome: "lucas eduardo" }, { email: "sergio@exemplo.com.br", nome: "Sérgio" },
    { email: "marina@exemplo.com.br", nome: "Marina" }, { email: "paulo@exemplo.com.br", nome: "Paulo" }],
})).id;
r = await processar();
confere(r.ok && r.enviados === 2 && enviados.length === 2, "o 1º lote manda 2: " + JSON.stringify(r));
const e1 = enviados[0];
confere(e1.to[0] === "lucas@exemplo.com.br" && e1.subject === "Novidade para Lucas" && e1.from === "Arquionie <suporte@arquionie.com.br>" &&
        e1.chave === "Bearer re_teste" && e1.html.includes("PFPRO10") && e1.html.includes("<strong") && e1.html.includes("10%"),
  "o e-mail sai do suporte@ com as variáveis trocadas e o cupom: " + e1.subject);
const sig = await assinarEmail("lucas@exemplo.com.br", "segredo-de-teste");
confere(e1.html.includes(`/functions/v1/campanhas?descadastrar=lucas%40exemplo.com.br&amp;s=${sig}`) || e1.html.includes(`campanhas?descadastrar=lucas%40exemplo.com.br&s=${sig}`),
  "o rodapé traz o link de descadastro assinado");
confere(e1.html.includes("wa.me/5511999998888") && e1.html.includes("QUERO O PRO COM 10% OFF"), "com cupom, o botão abre o WhatsApp");
r = await processar();
confere(r.situacao === "nada" && enviados.length === 2, "antes do intervalo não sai outro lote");

console.log("\n2. O Resend pede para esperar ou recusa");
await db.query(`update public.campanhas set ultimo_lote_em = now() - interval '6 minutes' where id = $1`, [camp]);
respostas = [422];
r = await processar();
confere(r.erros === 1 && r.enviados === 1, "um recusado fica como erro e o outro sai: " + JSON.stringify(r));
confere((await linha(`select erro from public.campanha_envios where campanha_id = $1 and status = 'erro'`, [camp])).erro.startsWith("Resend 422"),
  "o motivo do erro fica gravado");
await chamar("authenticated", gestora, "gestao_campanha_criar", {
  p_assunto: "Outra", p_mensagem: "Oi", p_lote: 3, p_intervalo_min: 5, p_limite_dia: 80,
  p_destinatarios: ["a@exemplo.com.br", "b@exemplo.com.br", "c@exemplo.com.br"] });
respostas = [429];
const antes = enviados.length;
r = await processar();
const fila = await linha(`select count(*) filter (where e.status = 'pendente')::int as p from public.campanha_envios e join public.campanhas c on c.id = e.campanha_id where c.assunto = 'Outra'`);
confere(r.devolvidos === 3 && enviados.length === antes && fila.p === 3, "429: o lote inteiro volta para a fila, sem perder ninguém: " + JSON.stringify(r));

console.log("\n3. O link de descadastro");
let pg = await campanhas(new Request(`https://local.supabase.co/functions/v1/campanhas?descadastrar=lucas%40exemplo.com.br&s=${sig}`));
confere(pg.status === 200 && (await pg.text()).includes("você saiu da lista") &&
        (await linha(`select count(*)::int as n from public.descadastros where email = 'lucas@exemplo.com.br'`)).n === 1,
  "o link assinado descadastra e mostra a página");
pg = await campanhas(new Request(`https://local.supabase.co/functions/v1/campanhas?descadastrar=marina%40exemplo.com.br&s=${sig}`));
confere(pg.status === 400 && (await linha(`select count(*)::int as n from public.descadastros where email = 'marina@exemplo.com.br'`)).n === 0,
  "a assinatura de outro e-mail não vale (ninguém descadastra os outros)");

console.log("\n4. TESTE PARA MIM");
r = await pedir(campanhas, { acao: "teste", assunto: "x", mensagem: "y" });
confere(r.status === 401, "sem conta, não");
r = await pedir(campanhas, { acao: "teste", assunto: "x", mensagem: "y" }, { Authorization: `Bearer conta:${comum}` });
confere(r.status === 403, "conta que não é administradora, não");
const n0 = enviados.length;
r = await pedir(campanhas, { acao: "teste", assunto: "Promo {nome}", mensagem: "Corre!",
  oferta: { chamada: "black friday", de: 599, por: 179, parcelas: 12, parcela: 17.9, validoAte: "2026-10-31", whatsapp: "Quero a promo" } },
  { Authorization: `Bearer conta:${gestora}` });
const t = enviados[n0];
confere(r.ok && t?.to[0] === "gestora.envio@exemplo.com.br" && t.subject.startsWith("[TESTE] Promo") && t.html.includes("70% OFF") &&
        t.html.includes("SÓ ATÉ 31/10") && t.html.includes("wa.me/5511999998888?text=Quero%20a%20promo") && t.html.includes("BLACK FRIDAY"),
  "o teste vai só para a administradora, no layout de PROMOÇÃO: " + JSON.stringify(r));

console.log("\n5. O e-mail sem oferta nem cupom");
const html = montarEmail({ nome: "", mensagem: "Olá, {nome}!", descadastro: "https://x" });
confere(html.includes("Olá, arquiteto(a)!") && html.includes("ABRIR O SITE DO ARQUIONIE") && !html.includes("wa.me"), "sem nome e sem cupom: o texto de sempre e o botão do site");
confere(montarEmail({ nome: "<b>", mensagem: "<script>", descadastro: "x" }).includes("&lt;script&gt;"), "o texto escrito na gestão não vira HTML");

console.log("\n6. O feedback do plugin");
const bia = await novaConta("bia.feedback@exemplo.com.br");
const credencial = "credencial-de-teste-com-mais-de-vinte-sinais";
await db.query(`insert into public.computadores (usuario_id, produto, maquina, nome, credencial_hash) values ($1, 'arquionie-revit', 'M-FB', 'PC', $2)`,
  [bia, createHash("sha256").update(credencial).digest("hex")]);
r = await pedir(feedback, { mensagem: "A tela de entrada ficou ótima", categoria: "elogio", nota: 10, versao: "4.47.0", edicao: "interno", credencial });
let fb = await linha(`select * from public.feedbacks order by criado_em desc limit 1`);
confere(r.ok && fb.email === "bia.feedback@exemplo.com.br" && fb.usuario_id === bia && fb.nota === 10, "com a credencial, o feedback sai com a conta de quem mandou");
r = await pedir(feedback, { mensagem: "Sem conta", email: "Alguem@Exemplo.com.br", credencial: "credencial-que-nao-existe-em-lugar-nenhum" });
fb = await linha(`select * from public.feedbacks order by criado_em desc limit 1`);
confere(r.ok && fb.email === "alguem@exemplo.com.br" && fb.usuario_id === null, "sem credencial que valha, fica o e-mail que veio");
r = await pedir(feedback, { mensagem: "   " });
confere(r.status === 400, "feedback vazio é recusado");

console.log("\n7. O limite por endereço do feedback (migração 20261022000000)");
for (let i = 0; i < 10; i++) r = await pedir(feedback, { mensagem: "Robô " + i }, { "cf-connecting-ip": "200.9.9.9" });
confere(r.ok, "10 feedbacks do mesmo endereço na hora passam");
r = await pedir(feedback, { mensagem: "Robô 11" }, { "cf-connecting-ip": "200.9.9.9" });
confere(r.status === 429 && r.ok === false && /Muitas mensagens/.test(r.motivo), "o 11º volta 429 com o motivo, que o plugin mostra: " + JSON.stringify(r));
r = await pedir(feedback, { mensagem: "De outro lugar" }, { "cf-connecting-ip": "200.9.9.10" });
confere(r.ok, "de outro endereço, passa");

console.log(`\n${certos} de ${certos + ruins.length} conferências do envio passaram.`);
process.exitCode = ruins.length || process.exitCode ? 1 : 0;
