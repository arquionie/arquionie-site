// Teste das funções conectar e licenca rodando no Node contra o banco local do banco.test.mjs, com uma chave de TESTE.
// Confere também a assinatura da ficha (ECDSA P-256, r||s), a mesma que o programa e o plugin conferem no .NET.
//   npm i --no-save @electric-sql/pglite && node supabase/testes/funcoes.test.mjs
import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const AQUI = dirname(fileURLToPath(import.meta.url));
const COPIA = join(tmpdir(), "arquionie-testes-funcoes");

const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, novaConta } = banco;
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };

// Chave de teste (não é a do Supabase de verdade).
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const env = {
  SUPABASE_URL: "http://local", SUPABASE_SERVICE_ROLE_KEY: "x", SITE_URL: "https://www.arquionie.com.br",
  LICENCA_CHAVE_PRIVADA: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
};
const publicaB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
globalThis.Deno = { env: { get: (k) => env[k] }, serve: () => {} };

// O cliente do Supabase de mentira: db.rpc(nome, args) vira "select public.nome(...)" como service_role no banco local.
mkdirSync(COPIA, { recursive: true });
writeFileSync(join(COPIA, "supabase-falso.mjs"), `
export function createClient() {
  return { rpc: async (nome, args) => {
    try { return { data: await globalThis.__chamar("service_role", null, nome, args), error: null }; }
    catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
  } };
}`);
globalThis.__chamar = chamar;
async function carregar(nome) {
  const fonte = readFileSync(join(AQUI, "..", "functions", nome, "index.ts"), "utf8")
    .replace('"npm:@supabase/supabase-js@2"', '"./supabase-falso.mjs"');
  writeFileSync(join(COPIA, `${nome}.mts`), fonte);
  return (await import(pathToFileURL(join(COPIA, `${nome}.mts`)).href)).tratar;
}
const conectar = await carregar("conectar");
const licenca = await carregar("licenca");
const post = async (f, corpo) => {
  const r = await f(new Request("http://local", { method: "POST", body: JSON.stringify(corpo) }));
  const texto = await r.text();
  try { return { status: r.status, ...JSON.parse(texto) }; } catch { return { status: r.status, texto }; }
};
const confereFicha = (ficha, assinatura) => verify("sha256", Buffer.from(ficha, "utf8"),
  { key: createPublicKey({ key: Buffer.from(publicaB64, "base64"), format: "der", type: "spki" }), dsaEncoding: "ieee-p1363" },
  Buffer.from(assinatura, "base64"));

console.log("\n8. As funções do servidor, de ponta a ponta");
const gil = await novaConta("gil@exemplo.com.br");
const admin = (await banco.db.query(`select usuario_id from public.administradores limit 1`)).rows[0].usuario_id;
await chamar("authenticated", admin, "gestao_liberar",
  { p_dono_email: "gil@exemplo.com.br", p_produto: "arquionie-revit", p_quantidade: 1, p_expira_em: new Date(Date.now() + 200 * 864e5).toISOString() });

let r = await post(conectar, { acao: "iniciar", produto: "arquionie-revit", maquina: "MAQ-GIL", nome: "ESCRITORIO-GIL", versao: "5.0.0" });
confere(r.situacao === "ok" && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(r.codigo) && r.link.endsWith(r.codigo) && r.segredo.length >= 40,
  "iniciar devolve código, link e segredo: " + JSON.stringify({ codigo: r.codigo, link: r.link }));
const { codigo, segredo } = r;
r = await post(conectar, { acao: "consultar", segredo });
confere(r.situacao === "aguardando", "antes do AUTORIZAR: aguardando");
await chamar("authenticated", gil, "conexao_autorizar", { p_codigo: codigo });
r = await post(conectar, { acao: "consultar", segredo });
confere(r.situacao === "autorizada" && r.credencial && r.ficha && r.assinatura, "autorizada, com credencial e ficha");
const { credencial } = r;
const ficha = JSON.parse(r.ficha);
confere(ficha.plano === "pro" && ficha.produto === "arquionie-revit" && ficha.maquina === "MAQ-GIL" && ficha.versao === 1,
  "a ficha diz o plano, o produto e a máquina: " + r.ficha);
confere(confereFicha(r.ficha, r.assinatura), "a assinatura confere com a chave pública (Node)");
confere(!confereFicha(r.ficha.replace('"pro"', '"equipe"'), r.assinatura), "ficha alterada não confere");
writeFileSync(join(COPIA, "ficha.json"), JSON.stringify({ publica: publicaB64, ficha: r.ficha, assinatura: r.assinatura }));

r = await post(licenca, { acao: "renovar", credencial, maquina: "MAQ-GIL", versao: "5.0.1" });
confere(r.situacao === "ok" && confereFicha(r.ficha, r.assinatura), "renovar devolve ficha nova assinada");
r = await post(licenca, { acao: "renovar", credencial, maquina: "OUTRA", versao: "5.0.1" });
confere(r.situacao === "desconectado", "credencial copiada para outra máquina: desconectado");
r = await post(licenca, { acao: "usar_teste", credencial, ferramenta: "CmdTelhado" });
confere(r.ilimitado === true, "PRO não gasta teste");
r = await post(licenca, { acao: "testes", credencial });
confere(r.situacao === "ok" && r.limite === 3, "testes: " + JSON.stringify(r));
r = await post(licenca, { acao: "sair", credencial });
r = await post(licenca, { acao: "renovar", credencial, maquina: "MAQ-GIL", versao: "5.0.1" });
confere(r.situacao === "desconectado", "depois de SAIR: desconectado");
r = await post(licenca, { acao: "renovar", credencial: "curta" });
confere(r.status === 400, "credencial curta: 400");
console.log(`
${certos} de ${certos + ruins.length} conferências das funções passaram.`);
process.exitCode = ruins.length || process.exitCode ? 1 : 0;
