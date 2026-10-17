// Teste da função comercial (supabase/functions/comercial) rodando no Node contra o banco local do banco.test.mjs: o pedido do
// formulário público com o Turnstile e a impressão do endereço, o PDF da proposta (a URL de subida do R2) e a tarefa diária. O Turnstile
// e o R2 são de mentira; nada toca no Supabase nem na Cloudflare de verdade.
//   npm i --no-save @electric-sql/pglite && node supabase/testes/comercial-funcao.test.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const AQUI = dirname(fileURLToPath(import.meta.url));
const COPIA = join(tmpdir(), "arquionie-testes-comercial");

const banco = await import("./banco.test.mjs");
const { chamar, novaConta, db } = banco;
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };

const env = { SUPABASE_URL: "http://local", SUPABASE_SERVICE_ROLE_KEY: "x", R2_CONTA: "conta", R2_CHAVE: "chave", R2_SEGREDO: "segredo",
  TURNSTILE_SEGREDO: "segredo-turnstile", COMERCIAL_SAL: "sal", COMERCIAL_TAREFA_SEGREDO: "tarefa" };
globalThis.Deno = { env: { get: (k) => env[k] }, serve: () => {} };

// A Cloudflare de mentira: o Turnstile aceita o token "pessoa"; o R2 apaga e responde 204.
const apagados = [];
const fetchDeVerdade = globalThis.fetch;
globalThis.fetch = async (url, opcoes = {}) => {
  const u = String(url);
  if (u.includes("turnstile")) return new Response(JSON.stringify({ success: opcoes.body.get("response") === "pessoa" }));
  if (u.includes("r2.cloudflarestorage.com") && opcoes.method === "DELETE") { apagados.push(new URL(u).pathname); return new Response(null, { status: 204 }); }
  return fetchDeVerdade(url, opcoes);
};

mkdirSync(join(COPIA, "_compartilhado"), { recursive: true });
mkdirSync(join(COPIA, "comercial"), { recursive: true });
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
writeFileSync(join(COPIA, "comercial", "index.mts"), readFileSync(join(FUNCOES, "comercial", "index.ts"), "utf8").replace('"npm:@supabase/supabase-js@2"', '"../supabase-falso.mjs"'));
const comercial = await import(pathToFileURL(join(COPIA, "comercial", "index.mts")).href);
const post = async (conta, corpo, cabecalhos = {}) => {
  const r = await comercial.tratar(new Request("http://local", { method: "POST", body: JSON.stringify(corpo),
    headers: { ...(conta ? { Authorization: `Bearer conta:${conta}` } : {}), ...cabecalhos } }));
  const texto = await r.text();
  try { return { status: r.status, ...JSON.parse(texto) }; } catch { return { status: r.status, texto }; }
};

console.log("\n11. A função comercial");
const dona = await novaConta("dona@estudio.com.br");
await db.query(`insert into public.escritorios (usuario_id, nome) values ($1, 'Estúdio Norte')`, [dona]);
const estado = await chamar("authenticated", dona, "comercial_iniciar", { p_modelo: "engenharia" });
const codigo = estado.formularios[0].codigo;
const respostas = [{ id: "disciplina", valor: ["Estrutural"] }, { id: "arquitetura", valor: "Sim" }, { id: "area", valor: "220" },
  { id: "cidade", valor: "Belém/PA" }, { id: "dados", valor: { nome: "Paulo Lima", whatsapp: "91 98888-7777" } }, { id: "privacidade", valor: true }];
let r = await post(null, { acao: "pedido", codigo, respostas, turnstile: "robo" }, { "cf-connecting-ip": "200.1.2.3" });
confere(!r.ok && /pessoa/.test(r.motivo), "sem o Turnstile certo, o pedido não entra");
r = await post(null, { acao: "pedido", codigo, respostas, turnstile: "pessoa", origem: "instagram" }, { "cf-connecting-ip": "200.1.2.3" });
confere(r.ok && r.numero === 1, "com o Turnstile, o pedido entra: " + JSON.stringify(r));
const p = (await db.query(`select * from public.comercial_pedidos where usuario_id = $1`, [dona])).rows[0];
confere(p.tipo === "Estrutural" && p.origem === "instagram" && /^[0-9a-f]{32}$/.test(p.ip_hash) && !p.ip_hash.includes("200"),
  "grava a impressão do endereço (32 sinais), nunca o endereço: " + p.ip_hash);
r = await post(null, { acao: "pedido", codigo, respostas: respostas.slice(0, 2), turnstile: "pessoa" }, { "cf-connecting-ip": "200.1.2.3" });
confere(!r.ok && r.motivo, "a resposta que falta volta com a frase do banco: " + r.motivo);

const pedido = (await chamar("authenticated", dona, "comercial_estado", {})).pedidos[0];
const prop = await chamar("authenticated", dona, "comercial_proposta_criar", { p_area: null, p_pedido: pedido.id, p: { jeito: "pdf" } });
r = await post(null, { acao: "pdf", codigo: prop.codigo, tamanho: 1000 });
confere(r.status === 401, "o PDF pede a conta");
r = await post(dona, { acao: "pdf", codigo: prop.codigo, tamanho: 20 * 1048576 });
confere(!r.ok && /10 MB/.test(r.motivo), "PDF acima de 10 MB é recusado antes do banco");
r = await post(dona, { acao: "pdf", codigo: prop.codigo, tamanho: 3 * 1048576 });
confere(r.ok && r.arquivo === `comercial/${pedido.id}/${prop.codigo}.pdf` && r.url.includes(`/arquionie-tours/comercial/${pedido.id}/${prop.codigo}.pdf?`) &&
  r.url.includes("X-Amz-Signature="), "a URL assinada para subir o PDF ao R2: " + r.arquivo);
const estranha = await novaConta("estranha@exemplo.com.br");
r = await post(estranha, { acao: "pdf", codigo: prop.codigo, tamanho: 1000 });
confere(!r.ok, "quem não é do escritório não sobe PDF");

await chamar("authenticated", dona, "comercial_pedido_excluir", { p_area: null, p_id: pedido.id });
r = await post(null, { acao: "tarefa" });
confere(r.status === 401, "a tarefa pede o segredo");
r = await post(null, { acao: "tarefa" }, { "x-tarefa": "tarefa" });
confere(r.ok && r.apagados === 1 && apagados.length === 1 && apagados[0].endsWith(`${prop.codigo}.pdf`), "a tarefa diária apaga do R2 o PDF do pedido excluído");
r = await post(null, { acao: "outra" });
confere(r.status === 400, "ação desconhecida: 400");

console.log(`\nFunção comercial: ${certos} certos, ${ruins.length} falharam.`);
if (ruins.length) { console.log(ruins.map((m) => " - " + m).join("\n")); process.exit(1); }
