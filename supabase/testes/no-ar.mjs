// Teste NO AR da conexão pelo navegador, no Supabase de verdade (plano 17 do repositório do plugin). Faz o papel do
// plugin do Revit: pede um código, mostra o link, espera alguém AUTORIZAR em /conectar, confere a ficha com a chave
// pública deste repositório, renova e, no fim, SAI: o computador de teste some da conta. O segredo e a credencial
// ficam só na memória deste processo, nunca na tela nem em arquivo.
//   node supabase/testes/no-ar.mjs     -> abrir o link mostrado, entrar com a conta e clicar AUTORIZAR (vale 10 minutos)
// Rodado pela primeira vez em 07/10/2026, com a conta do ÊDI: tudo certo.
import { createPublicKey, randomBytes, verify } from "node:crypto";
import { readFileSync } from "node:fs";

const FUNCOES = "https://sowazotriildoeaxbhkl.supabase.co/functions/v1";
const PUBLICA = createPublicKey({
  key: Buffer.from(readFileSync(new URL("../functions/licenca-chave-publica.txt", import.meta.url), "utf8").trim(), "base64"),
  format: "der", type: "spki",
});
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) { certos++; console.log("  ok: " + m); } else { ruins.push(m); console.log("  FALHOU: " + m); } };
const assinada = (ficha, assinatura) => typeof ficha === "string" && typeof assinatura === "string" &&
  verify("sha256", Buffer.from(ficha, "utf8"), { key: PUBLICA, dsaEncoding: "ieee-p1363" }, Buffer.from(assinatura, "base64"));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function chamar(funcao, corpo) {
  const r = await fetch(`${FUNCOES}/${funcao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const texto = await r.text();
  try { return { status: r.status, ...JSON.parse(texto) }; } catch { return { status: r.status, texto }; }
}

const maquina = "TESTE-" + randomBytes(4).toString("hex").toUpperCase();
const inicio = await chamar("conectar", { acao: "iniciar", produto: "arquionie-revit", maquina, nome: "TESTE-DA-INSTALACAO", versao: "0.0.0" });
if (inicio.situacao !== "ok") { console.log("FALHOU ao pedir o código: " + JSON.stringify(inicio)); process.exit(1); }
console.log(`Abrir ${inicio.link}\nCódigo ${inicio.codigo}, vale até ${new Date(inicio.expiraEm).toLocaleTimeString("pt-BR")}. Esperando AUTORIZAR…`);

const ate = new Date(inicio.expiraEm).getTime() + 15000;
let r;
do {
  await espera((inicio.intervalo ?? 3) * 1000);
  r = await chamar("conectar", { acao: "consultar", segredo: inicio.segredo });
} while (r.situacao === "aguardando" && Date.now() < ate);
if (r.situacao !== "autorizada") { console.log("FALHOU: a conexão terminou como " + (r.situacao ?? `status ${r.status}`)); process.exit(1); }

let saiu = false;
try {
  const ficha = JSON.parse(r.ficha);
  console.log(`\nAutorizada: plano ${ficha.plano}, canal ${ficha.canal}, vale sem internet até ${new Date(ficha.valeAte).toLocaleDateString("pt-BR")}`);
  confere(assinada(r.ficha, r.assinatura), "a ficha confere com a chave pública do repositório");
  confere(ficha.produto === "arquionie-revit" && ficha.maquina === maquina, "a ficha é deste produto e deste computador");
  const alterada = r.ficha.replace(`"plano":"${ficha.plano}"`, '"plano":"equipe-falsa"');
  confere(alterada !== r.ficha && !assinada(alterada, r.assinatura), "a mesma ficha alterada à mão é recusada");

  const renovada = await chamar("licenca", { acao: "renovar", credencial: r.credencial, maquina, versao: "0.0.1" });
  confere(renovada.situacao === "ok" && assinada(renovada.ficha, renovada.assinatura), "RENOVAR devolve outra ficha assinada");
  const outro = await chamar("licenca", { acao: "renovar", credencial: r.credencial, maquina: maquina + "-COPIA", versao: "0.0.1" });
  confere(outro.situacao === "desconectado", "a credencial copiada para outro computador não vale");
  const testes = await chamar("licenca", { acao: "testes", credencial: r.credencial });
  confere(testes.situacao === "ok" && Number.isInteger(testes.limite), `TESTES responde o limite (${testes.limite})`);

  const saida = await chamar("licenca", { acao: "sair", credencial: r.credencial });
  saiu = saida.situacao === "ok";
  const depois = await chamar("licenca", { acao: "renovar", credencial: r.credencial, maquina, versao: "0.0.1" });
  confere(saiu && depois.situacao === "desconectado", "SAIR tira o computador da conta e a credencial passa a responder \"desconectado\"");
} finally {
  if (!saiu) await chamar("licenca", { acao: "sair", credencial: r.credencial }).catch(() => {}); // nunca deixar o computador de teste na conta
}

console.log(`\n${certos} conferências certas${ruins.length ? `, ${ruins.length} com problema` : ", nenhuma com problema"}.`);
process.exitCode = ruins.length ? 1 : 0;
