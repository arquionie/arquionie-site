// Arquionie™ — gera o par de chaves que assina a ficha da licença (ECDSA P-256), uma vez só.
//
//   node supabase/ferramentas/gerar-chave-da-licenca.mjs
//
// - A chave PRIVADA vai direto para a área de transferência do Windows: nada dela é mostrado nem gravado em arquivo.
//   Cole em Supabase (projeto arquionie) › Edge Functions › Secrets, com o nome LICENCA_CHAVE_PRIVADA. Depois copie
//   qualquer outra coisa, para ela sair da área de transferência.
// - A chave PÚBLICA fica em supabase/functions/licenca-chave-publica.txt e vai dentro do programa e do plugin, que
//   conferem a assinatura de toda ficha. Ela pode ser mostrada e ir para o repositório.
// - Trocar de chave depois exige versão nova do programa e do plugin com a pública nova: por isso a ferramenta recusa
//   se a pública já existir, a não ser com --substituir.

import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const destino = join(dirname(fileURLToPath(import.meta.url)), "..", "functions", "licenca-chave-publica.txt");

if (existsSync(destino) && !process.argv.includes("--substituir")) {
  console.error("Já existe uma chave pública em " + destino + ".");
  console.error("Trocar de chave derruba as fichas de todos os programas instalados. Se é isso mesmo, rode de novo com --substituir.");
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const privada = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const publica = publicKey.export({ type: "spki", format: "der" }).toString("base64");

execFileSync("clip", { input: privada }); // área de transferência do Windows
writeFileSync(destino, publica + "\n");

console.log("Pronto.");
console.log("1. A chave PRIVADA está na área de transferência. Cole agora em Supabase (projeto arquionie) > Edge Functions > Secrets,");
console.log("   com o nome LICENCA_CHAVE_PRIVADA, e salve.");
console.log("2. Depois copie qualquer outra coisa, para a chave sair da área de transferência.");
console.log("3. A chave PÚBLICA foi gravada em supabase/functions/licenca-chave-publica.txt (pode ir para o repositório).");
