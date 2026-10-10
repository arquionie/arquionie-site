// Teste dos tours no link (migração 20261010000000_tours.sql e função tours) num Postgres local (PGlite), com o R2 de
// mentira na memória. Não toca no Supabase nem no R2 de verdade. A assinatura dos pedidos ao R2 é conferida pelos exemplos
// da documentação da AWS (Signature V4). Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/tours.test.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const AQUI = dirname(fileURLToPath(import.meta.url));
const COPIA = join(tmpdir(), "arquionie-testes-tours");

const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, tentar, novaConta, db } = banco;
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };

// O R2 de mentira: os objetos na memória; o PUT pela URL assinada, o GET de listar e o DELETE.
const objetos = new Map();
const pedidos = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), metodo = init.method ?? "GET";
  pedidos.push({ metodo, url: u, cabecalhos: init.headers ?? {} });
  const chave = decodeURIComponent(u.pathname.replace(/^\/arquionie-tours\/?/, ""));
  if (metodo === "PUT") { objetos.set(chave, init.body?.length ?? 0); return new Response("", { status: 200 }); }
  if (metodo === "DELETE") { objetos.delete(chave); return new Response(null, { status: 204 }); }
  const prefixo = u.searchParams.get("prefix") ?? "";
  const xml = [...objetos].filter(([k]) => k.startsWith(prefixo)).map(([k, t]) => `<Contents><Key>${k}</Key><Size>${t}</Size></Contents>`).join("");
  return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>${xml}</ListBucketResult>`, { status: 200 });
};
// O PUT do programa, pela URL que a função deu.
const subir = (url, bytes) => fetch(url, { method: "PUT", body: new Uint8Array(bytes) });

const env = {
  SUPABASE_URL: "http://local", SUPABASE_SERVICE_ROLE_KEY: "x", SITE_URL: "https://www.arquionie.com.br",
  R2_CONTA: "conta123", R2_CHAVE: "AKIAIOSFODNN7EXAMPLE", R2_SEGREDO: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};
globalThis.Deno = { env: { get: (k) => env[k] }, serve: () => {} };

// O cliente do Supabase de mentira: rpc vira "select public.nome(...)" como service_role; a conta sai do token "conta:<id>".
mkdirSync(COPIA, { recursive: true });
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
const fonte = readFileSync(join(AQUI, "..", "functions", "tours", "index.ts"), "utf8").replace('"npm:@supabase/supabase-js@2"', '"./supabase-falso.mjs"');
writeFileSync(join(COPIA, "tours.mts"), fonte);
const { tratar, assinar } = await import(pathToFileURL(join(COPIA, "tours.mts")).href);
const post = async (conta, corpo) => {
  const r = await tratar(new Request("http://local", { method: "POST", body: JSON.stringify(corpo),
    headers: conta ? { Authorization: `Bearer conta:${conta}` } : {} }));
  const texto = await r.text();
  try { return { status: r.status, ...JSON.parse(texto) }; } catch { return { status: r.status, texto }; }
};

console.log("\n9. A assinatura do R2 pelos exemplos da documentação da AWS (Signature V4)");
const vazio = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
let a = await assinar("GET", "/test.txt", {}, { host: "examplebucket.s3.amazonaws.com", range: "bytes=0-9",
  "x-amz-content-sha256": vazio, "x-amz-date": "20130524T000000Z" }, vazio, "20130524T000000Z", "us-east-1");
confere(a.assinatura === "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41", "GET Object com cabeçalhos: " + a.assinatura);
a = await assinar("GET", "/test.txt", { "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
  "X-Amz-Credential": "AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request", "X-Amz-Date": "20130524T000000Z",
  "X-Amz-Expires": "86400", "X-Amz-SignedHeaders": "host" }, { host: "examplebucket.s3.amazonaws.com" }, "UNSIGNED-PAYLOAD",
  "20130524T000000Z", "us-east-1");
confere(a.assinatura === "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404", "URL assinada (presigned): " + a.assinatura);

console.log("\n10. Publicar, abrir, atualizar no mesmo link, pausar e excluir");
const bia = await novaConta("bia@exemplo.com.br");
let r = await post(null, { acao: "enviar" });
confere(r.status === 401, "sem conta: 401");
const arquivos = [{ caminho: "tour.json", tamanho: 900 }, { caminho: "modelo.bin", tamanho: 5000 }, { caminho: "luz-0.jpg", tamanho: 3000 }];
r = await post(bia, { acao: "enviar", chave: "225/PASSEIO 01", nome: "225 - IGREJA", passeio: "PASSEIO 01", arquivos });
confere(r.ok && /^[A-HJ-NP-Z2-9]{6}$/.test(r.codigo) && r.link === `https://www.arquionie.com.br/t/${r.codigo}` && r.versao === 1 && r.envios.length === 3,
  "ENVIAR dá o código, o link e as URLs: " + JSON.stringify({ codigo: r.codigo, link: r.link, versao: r.versao }));
const envio = r.envios.find((e) => e.caminho === "tour.json").url;
confere(envio.startsWith("https://conta123.r2.cloudflarestorage.com/arquionie-tours/tours/") && envio.includes("X-Amz-Signature=")
  && envio.includes("X-Amz-Expires=3600") && envio.includes("/v1/tour.json?"), "a URL de envio vai ao bucket, à pasta da versão 1: " + envio.slice(0, 120));
const { id, codigo } = r;
let abrir = await chamar("anon", null, "tour_abrir", { p_codigo: codigo });
confere(abrir.situacao === "inexistente", "antes de concluir, o link não abre: " + JSON.stringify(abrir));
r = await post(bia, { acao: "concluir", id, versao: 1, paradas: 8 });
confere(!r.ok && /tour\.json/.test(r.motivo), "concluir sem os arquivos no R2 é recusado: " + JSON.stringify(r));
// Enviar de novo antes de concluir (o programa caiu no meio) usa a mesma versão.
r = await post(bia, { acao: "enviar", chave: "225/PASSEIO 01", nome: "225 - IGREJA", passeio: "PASSEIO 01", arquivos });
confere(r.ok && r.codigo === codigo && r.versao === 1, "reenviar antes de concluir: a mesma versão 1");
for (const e of r.envios) await subir(e.url, new Array(arquivos.find((x) => x.caminho === e.caminho).tamanho).fill(1));
r = await post(bia, { acao: "concluir", id, versao: 1, paradas: 8 });
confere(r.ok && r.situacao === "publicado" && r.link.endsWith(codigo), "CONCLUIR publica no mesmo código: " + JSON.stringify(r));
abrir = await chamar("anon", null, "tour_abrir", { p_codigo: codigo.toLowerCase() });
confere(abrir.situacao === "publicado" && abrir.pasta?.startsWith(`tours/${codigo}-`) && abrir.pasta.endsWith("/v1/"),
  "o link abre sem conta, com a pasta da versão 1: " + JSON.stringify(abrir));
let meus = await chamar("authenticated", bia, "meus_tours");
confere(meus.tours.length === 1 && meus.tours[0].chave === "225/PASSEIO 01" && meus.tours[0].visitas === 1 && meus.tours[0].tamanho === 8900 && meus.tours[0].paradas === 8 && meus.limite === 20,
  "MINHA CONTA › TOURS: 1 tour, 1 visita, 8.900 bytes, 8 paradas: " + JSON.stringify(meus.tours[0]));

// ATUALIZAR: o mesmo passeio sobe a versão 2 no mesmo link, e a 1 sai do R2; enquanto sobe, o link abre a 1.
r = await post(bia, { acao: "enviar", chave: "225/PASSEIO 01", nome: "225 - IGREJA (revisão)", passeio: "PASSEIO 01", arquivos });
confere(r.ok && r.codigo === codigo && r.versao === 2, "ATUALIZAR mantém o código e passa à versão 2");
for (const e of r.envios) await subir(e.url, [1, 2, 3]);
abrir = await chamar("anon", null, "tour_abrir", { p_codigo: codigo });
confere(abrir.pasta?.endsWith("/v1/"), "enquanto a nova sobe, o link abre a de antes");
r = await post(bia, { acao: "concluir", id, versao: 2, paradas: 9 });
const chaves = [...objetos.keys()];
confere(r.ok && chaves.length === 3 && chaves.every((k) => k.includes("/v2/")), "a versão velha sai do R2: " + JSON.stringify(chaves));
abrir = await chamar("anon", null, "tour_abrir", { p_codigo: codigo });
confere(abrir.pasta?.endsWith("/v2/") && abrir.nome === "225 - IGREJA (revisão)", "o link abre a versão nova");

// PAUSAR: o link mostra pausado, sem a pasta; REATIVAR volta.
let p = await chamar("authenticated", bia, "tour_pausar", { p_id: id, p_pausar: true });
abrir = await chamar("anon", null, "tour_abrir", { p_codigo: codigo });
confere(p.ok && abrir.situacao === "pausado" && !abrir.pasta, "PAUSAR: o link diz pausado e não dá a pasta: " + JSON.stringify(abrir));
const outra = await novaConta("caio@exemplo.com.br");
p = await chamar("authenticated", outra, "tour_pausar", { p_id: id, p_pausar: false });
confere(!p.ok, "outra conta não reativa");
p = await chamar("authenticated", bia, "tour_pausar", { p_id: id, p_pausar: false });
abrir = await chamar("anon", null, "tour_abrir", { p_codigo: codigo });
confere(abrir.situacao === "publicado", "REATIVAR volta com o mesmo link");
r = await tentar("anon", null, "tour_enviar", { p_usuario: bia, p_chave: "x", p_nome: "x", p_passeio: "", p_codigo: "ABCDEF", p_pasta: "abcdefghijklmnop" });
confere(r.erro, "o navegador não chama o tour_enviar direto");
r = await tentar("authenticated", bia, "tour_excluir", { p_usuario: bia, p_id: id });
confere(r.erro, "nem o tour_excluir");
const linhas = await tentar("anon", null, "tour_abrir", { p_codigo: "ZZZZZZ" });
confere(linhas.ok?.situacao === "inexistente", "código que não existe: inexistente");

// O limite de 20 (os pausados contam) e o plano depois do lançamento.
await db.query(`update public.ajustes_tours set limite = 1`);
r = await post(bia, { acao: "enviar", chave: "225/PASSEIO 02", nome: "outro", passeio: "PASSEIO 02", arquivos });
confere(!r.ok && r.motivo === "limite", "passou do limite: " + JSON.stringify(r));
await db.query(`update public.ajustes_tours set limite = 20, livres_no_lancamento = false`);
r = await post(bia, { acao: "enviar", chave: "225/PASSEIO 02", nome: "outro", passeio: "PASSEIO 02", arquivos });
confere(!r.ok && r.motivo === "plano", "sem o PRO, depois do lançamento: " + JSON.stringify(r));
await db.query(`update public.ajustes_tours set livres_no_lancamento = true`);

// EXCLUIR: os arquivos saem do R2 e o link deixa de existir.
r = await post(outra, { acao: "excluir", id });
confere(!r.ok && objetos.size === 3, "outra conta não exclui");
r = await post(bia, { acao: "excluir", id });
abrir = await chamar("anon", null, "tour_abrir", { p_codigo: codigo });
confere(r.ok && objetos.size === 0 && abrir.situacao === "inexistente", "EXCLUIR apaga os arquivos e o link");
r = await post(bia, { acao: "enviar", chave: "x", nome: "x", arquivos: [{ caminho: "../fora", tamanho: 1 }, { caminho: "tour.json", tamanho: 1 }] });
confere(r.status === 400, "nome de arquivo com caminho é recusado");

console.log(`\n${certos} de ${certos + ruins.length} conferências dos tours passaram.`);
process.exitCode = ruins.length || process.exitCode ? 1 : 0;
