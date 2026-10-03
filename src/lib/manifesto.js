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

export function tamanhoLegivel(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : `${Math.round(mb)} MB`;
}

export function dataLegivel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}
