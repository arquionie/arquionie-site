// Teste do ENTRAR PELO NAVEGADOR (migração 20261023000000_entrar_no_programa.sql e função programa) rodando no Node contra o banco local
// (PGlite), com o cliente do Supabase de mentira (o link mágico e a sessão também). Não toca no Supabase. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/programa.test.mjs
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const AQUI = dirname(fileURLToPath(import.meta.url));
const COPIA = join(tmpdir(), "arquionie-testes-programa");

const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, tentar, novaConta, db } = banco;
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };

const env = { SUPABASE_URL: "https://local.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secreta", SUPABASE_ANON_KEY: "publica" };
globalThis.Deno = { env: { get: (k) => env[k] }, serve: () => {} };

// O cliente de mentira: rpc como service_role; getUser lê o token "conta:<id>"; o generateLink guarda o link da conta e o verifyOtp
// (só pelo cliente da chave pública, como o de verdade) o troca, uma vez, por uma sessão com o usuário de auth.users.
mkdirSync(join(COPIA, "_compartilhado"), { recursive: true });
mkdirSync(join(COPIA, "programa"), { recursive: true });
writeFileSync(join(COPIA, "supabase-falso.mjs"), `
const conta = async (id) => (await globalThis.__db.query("select id::text, email, raw_user_meta_data as user_metadata from auth.users where id = $1", [id])).rows[0] ?? null;
const links = new Map();
export function createClient(_url, chave) {
  return {
    rpc: async (nome, args = {}) => {
      try { return { data: await globalThis.__chamar("service_role", null, nome, args), error: null }; }
      catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
    },
    auth: {
      getUser: async (jwt) => jwt?.startsWith("conta:") ? { data: { user: await conta(jwt.slice(6)) }, error: null } : { data: { user: null }, error: { message: "bad jwt" } },
      admin: {
        getUserById: async (id) => ({ data: { user: await conta(id) }, error: null }),
        generateLink: async ({ type, email }) => {
          if (chave !== "secreta" || type !== "magiclink") return { data: null, error: { message: "só com a chave secreta" } };
          const hash = "hash-" + Math.random().toString(36).slice(2);
          links.set(hash, email);
          return { data: { properties: { hashed_token: hash } }, error: null };
        },
      },
      verifyOtp: async ({ token_hash, type }) => {
        const email = links.get(token_hash);
        links.delete(token_hash);
        if (chave !== "publica" || type !== "magiclink" || !email) return { data: { session: null }, error: { message: "Token has expired or is invalid" } };
        const user = (await globalThis.__db.query("select id::text, email, raw_user_meta_data as user_metadata from auth.users where email = $1", [email])).rows[0];
        globalThis.__sessoes = (globalThis.__sessoes ?? 0) + 1;
        return { data: { session: { access_token: "acesso-" + user.id, refresh_token: "renova-" + globalThis.__sessoes, expires_in: 3600,
          expires_at: 1900000000, token_type: "bearer", user } }, error: null };
      },
    },
  };
}`);
globalThis.__chamar = chamar;
globalThis.__db = db;
const FUNCOES = join(AQUI, "..", "functions");
writeFileSync(join(COPIA, "_compartilhado", "r2.ts"), readFileSync(join(FUNCOES, "_compartilhado", "r2.ts"), "utf8"));
writeFileSync(join(COPIA, "programa", "index.mts"),
  readFileSync(join(FUNCOES, "programa", "index.ts"), "utf8").replace('"npm:@supabase/supabase-js@2"', '"../supabase-falso.mjs"'));
const { tratar, desafioDe } = await import(pathToFileURL(join(COPIA, "programa", "index.mts")).href);
const pedir = async (corpo, conta) => {
  const r = await tratar(new Request("https://local.supabase.co/functions/v1/programa", { method: "POST", body: JSON.stringify(corpo),
    headers: conta ? { Authorization: `Bearer conta:${conta}` } : {} }));
  const texto = await r.text();
  try { return { status: r.status, ...JSON.parse(texto) }; } catch { return { status: r.status, texto }; }
};
const base64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const novoVerificador = () => base64url(randomBytes(32));
const desafioNode = (v) => base64url(createHash("sha256").update(v).digest());

const ana = await novaConta("ana.programa@exemplo.com.br");

console.log("\n1. O desafio é o do PKCE (S256)");
const v0 = novoVerificador();
confere((await desafioDe(v0)) === desafioNode(v0), "o desafio da função é o SHA-256 do verificador em base64url, como o do programa");

console.log("\n2. AUTORIZAR: só com a conta aberta no site, e com um desafio de verdade");
let r = await pedir({ acao: "autorizar", desafio: desafioNode(v0) });
confere(r.status === 401 && r.ok === false, "sem a sessão do site, não autoriza: " + JSON.stringify(r));
r = await pedir({ acao: "autorizar", desafio: "curto" }, ana);
confere(r.ok === false && /não veio do Arquionie/.test(r.motivo), "um desafio que não é o do programa é recusado: " + JSON.stringify(r));
const v1 = novoVerificador();
r = await pedir({ acao: "autorizar", desafio: desafioNode(v1) }, ana);
confere(r.ok === true && /^[A-Za-z0-9_-]{43}$/.test(r.codigo), "com a conta, sai o código de uso único: " + JSON.stringify(r));
const c1 = r.codigo;
const linha = (await db.query(`select * from public.programa_entradas order by criado_em desc limit 1`)).rows[0];
confere(linha.codigo_hash === createHash("sha256").update(c1).digest("hex") && !JSON.stringify(linha).includes(c1),
  "o banco guarda só o resumo do código, nunca ele");

console.log("\n3. TROCAR: o verificador errado gasta o código");
r = await pedir({ acao: "trocar", codigo: c1, verificador: novoVerificador() });
confere(r.status === 400 && r.error === "codigo_invalido", "com o verificador de outro computador, não troca: " + JSON.stringify(r));
r = await pedir({ acao: "trocar", codigo: c1, verificador: v1 });
confere(r.status === 400 && r.error === "codigo_invalido", "e depois nem o certo troca (o código já foi gasto): " + JSON.stringify(r));

console.log("\n4. TROCAR certo: a sessão do programa, uma vez só");
const v2 = novoVerificador();
const c2 = (await pedir({ acao: "autorizar", desafio: desafioNode(v2) }, ana)).codigo;
r = await pedir({ acao: "trocar", codigo: c2, verificador: v2 });
confere(r.status === 200 && r.access_token === "acesso-" + ana && r.refresh_token && r.expires_at && r.user?.email === "ana.programa@exemplo.com.br",
  "o programa recebe a sessão no formato do /auth/v1/token: " + JSON.stringify(r).slice(0, 160));
r = await pedir({ acao: "trocar", codigo: c2, verificador: v2 });
confere(r.status === 400, "o mesmo código não vale duas vezes: " + JSON.stringify(r));

console.log("\n5. O código vale 2 minutos");
const v3 = novoVerificador();
const c3 = (await pedir({ acao: "autorizar", desafio: desafioNode(v3) }, ana)).codigo;
await db.query(`update public.programa_entradas set criado_em = now() - interval '3 minutes' where codigo_hash = $1`,
  [createHash("sha256").update(c3).digest("hex")]);
r = await pedir({ acao: "trocar", codigo: c3, verificador: v3 });
confere(r.status === 400 && r.error === "codigo_invalido", "depois de 2 minutos, não troca: " + JSON.stringify(r));
r = await pedir({ acao: "trocar", codigo: "x", verificador: v3 });
confere(r.status === 400, "um código curto nem chega ao banco");

console.log("\n6. Quem lê o quê");
for (const [papel, uid] of [["anon", null], ["authenticated", ana]]) {
  r = await tentar(papel, uid, "programa_entrada_criar", { p_usuario: ana, p_codigo_hash: "0".repeat(64), p_desafio: desafioNode(v0) });
  confere(r.erro && /permission denied/.test(r.erro), `${papel} não cria código: ` + JSON.stringify(r));
  r = await tentar(papel, uid, "programa_entrada_usar", { p_codigo_hash: "0".repeat(64), p_desafio: desafioNode(v0) });
  confere(r.erro && /permission denied/.test(r.erro), `${papel} não troca código: ` + JSON.stringify(r));
}
const lido = await db.transaction(async (tx) => { await tx.exec("set local role authenticated"); return tx.query("select * from public.programa_entradas"); })
  .then((x) => "leu " + x.rows.length, (e) => e.message);
confere(/permission denied/.test(lido), "ninguém lê a tabela pelo navegador: " + lido);

console.log(`\nENTRAR PELO NAVEGADOR: ${certos} certos, ${ruins.length} falhas`);
if (ruins.length) process.exit(1);
