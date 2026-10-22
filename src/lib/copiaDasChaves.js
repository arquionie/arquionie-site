// A CÓPIA DE SEGURANÇA DAS CHAVES dos projetos do escritório (doc 73 do programa, etapa 1; migração 20261020120000): as chaves que o
// servidor guarda, num arquivo protegido por uma senha do responsável, para os projetos abrirem mesmo que o Arquionie saia do ar. A
// senha nunca sai do navegador: a chave da cópia sai dela pelo PBKDF2 (SHA-256) e cifra a lista com AES-256-GCM, tudo pela criptografia
// do próprio navegador. O programa lê o mesmo arquivo (CopiaDasChaves, no núcleo do programa).

export const FORMATO = 'arquionie-chaves';
export const ITERACOES = 600000;

function emBase64(bytes) {
  let texto = '';
  for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(texto);
}

function deBase64(texto) {
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
}

async function chaveDaSenha(senha, sal, iteracoes, uso) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, base,
    { name: 'AES-GCM', length: 256 }, false, [uso]);
}

// O texto do arquivo: o escritório, quando, quantos projetos e o conteúdo cifrado (os projetos com o nome e a chave).
export async function cifrarCopia({ escritorio, em, projetos }, senha, iteracoes = ITERACOES) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const chave = await chaveDaSenha(senha, sal, iteracoes, 'encrypt');
  const lista = projetos.map((p) => ({ projeto: p.projeto, nome: p.nome, chave: p.chave }));
  const texto = new TextEncoder().encode(JSON.stringify({ projetos: lista }));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, chave, texto));
  return JSON.stringify({
    formato: FORMATO, versao: 1, escritorio, em, projetos: lista.length,
    kdf: { nome: 'PBKDF2-SHA256', iteracoes, sal: emBase64(sal) },
    cifra: { nome: 'AES-256-GCM', nonce: emBase64(nonce) },
    conteudo: emBase64(cifrado),
  }, null, 2);
}

// A volta, para conferir a cópia logo depois de gravar (e no teste): os projetos, ou erro com a senha errada.
export async function decifrarCopia(texto, senha) {
  const copia = JSON.parse(texto);
  if (copia.formato !== FORMATO) throw new Error('Este arquivo não é a cópia de segurança das chaves do Arquionie.');
  const chave = await chaveDaSenha(senha, deBase64(copia.kdf.sal), copia.kdf.iteracoes, 'decrypt');
  const aberto = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deBase64(copia.cifra.nonce) }, chave, deBase64(copia.conteudo));
  return JSON.parse(new TextDecoder().decode(aberto)).projetos;
}

// "chaves-palheta-arquitetura-2026-10-20.arquionie-chaves"
export function nomeDaCopia(escritorio, em) {
  const nome = (escritorio || 'escritorio').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `chaves-${nome || 'escritorio'}-${String(em).slice(0, 10)}.arquionie-chaves`;
}
