// Teste da CÓPIA DE SEGURANÇA DAS CHAVES (src/lib/copiaDasChaves.js; doc 73 do programa): volta igual com a senha, não abre com outra,
// e o nome do arquivo. O programa lê o mesmo formato (CopiaDasChavesTests, no repositório do programa, com um arquivo feito aqui).
// Rodar da raiz do site: node supabase/testes/copia-das-chaves.test.mjs   (com "--vetor" imprime um arquivo para o teste do programa)
import { cifrarCopia, decifrarCopia, nomeDaCopia, ITERACOES } from "../../src/lib/copiaDasChaves.js";
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };

const projetos = [
  { projeto: "6f1c2a52-3a4b-4c55-9d1e-0a2b3c4d5e6f", nome: "225 · Templo", chave: Buffer.alloc(32, 7).toString("base64") },
  { projeto: "0b6d4c2e-1f3a-4b5c-8d7e-9f0a1b2c3d4e", nome: "226 · Casa \"do lago\"", chave: Buffer.alloc(32, 9).toString("base64") },
];
const copia = { escritorio: "PALHETA ARQUITETURA", em: "2026-10-20T21:00:00Z", projetos };
const texto = await cifrarCopia(copia, "senha do escritório 2026", 1000);
const arquivo = JSON.parse(texto);
confere(arquivo.formato === "arquionie-chaves" && arquivo.versao === 1 && arquivo.projetos === 2 && arquivo.kdf.iteracoes === 1000,
  "o arquivo diz o formato, a versão e quantos projetos");
confere(!texto.includes("Templo") && !texto.includes(projetos[0].chave), "nem o nome nem a chave dos projetos aparecem no arquivo");
const volta = await decifrarCopia(texto, "senha do escritório 2026");
confere(JSON.stringify(volta) === JSON.stringify(projetos), "volta igual com a senha: " + JSON.stringify(volta));
let recusou = false;
try { await decifrarCopia(texto, "outra senha"); } catch { recusou = true; }
confere(recusou, "outra senha não abre");
confere(ITERACOES === 600000, "de fábrica, 600 mil voltas do PBKDF2");
confere(nomeDaCopia("PALHETA ARQUITETURA", "2026-10-20T21:00:00Z") === "chaves-palheta-arquitetura-2026-10-20.arquionie-chaves", "o nome do arquivo");
confere(nomeDaCopia("Ação & Cia.", "2026-10-20") === "chaves-acao-cia-2026-10-20.arquionie-chaves", "o nome sem acento nem símbolo");
if (process.argv.includes("--vetor")) console.log(texto);
console.log(`\nCópia das chaves: ${certos} certos, ${ruins.length} falharam.`);
if (ruins.length) process.exit(1);
