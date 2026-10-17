import { MANIFESTO_URL } from '@/config';

// Lê o manifesto de versões (doc 57, §4.4). Sem ele — o R2 ainda não existe, ou está fora do ar —, devolve null
// e a página diz que a versão está sendo preparada, em vez de mostrar um link quebrado.
export async function lerManifesto() {
  const controle = new AbortController();
  const tempo = setTimeout(() => controle.abort(), 8000);
  try {
    const resposta = await fetch(MANIFESTO_URL, { signal: controle.signal, cache: 'no-cache' });
    if (!resposta.ok) return null;
    const manifesto = await resposta.json();
    return manifesto?.versao ? manifesto : null;
  } catch {
    return null;
  } finally {
    clearTimeout(tempo);
  }
}

// O manifesto que veio dentro da página pronta de /versoes (ferramentas/gerar-paginas.mjs), para a primeira tela já mostrar as notas.
// Sem ele, undefined: a página procura o manifesto como sempre.
export function manifestoDaPagina() {
  return globalThis.__ARQUIONIE_MANIFESTO__ ?? undefined;
}

export function tamanhoLegivel(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : `${Math.round(mb)} MB`;
}

export function dataLegivel(iso) {
  if (!iso) return '';
  // Só a data (2026-10-16), como no manifesto: sem passar pelo fuso, que no Brasil a mostraria um dia antes.
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dia) return `${dia[3]}/${dia[2]}/${dia[1]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}
