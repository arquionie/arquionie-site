import { useEffect, useState } from 'react';

// Conta › Aparência (mockup site-amigavel, aprovado por ÊDI em 16/10/2026): o site abre no claro de fábrica; a pessoa escolhe Escuro ou
// Automático (segue o aparelho). A escolha fica neste navegador e, com a conta aberta, na conta (user_metadata.aparencia), para abrir
// igual no computador e no celular. O index.html aplica a do navegador antes do primeiro desenho, sem piscar o claro.
// O /gestao fica sempre no técnico escuro, sem mexer na escolha.

const CHAVE = 'arquionie-aparencia';
const EVENTO = 'arquionie-aparencia';

export const TEMAS = [
  ['claro', 'Claro'],
  ['escuro', 'Escuro'],
  ['auto', 'Automático'],
];

const valido = (t) => TEMAS.some(([id]) => id === t);

export function temaGuardado() {
  try {
    const t = localStorage.getItem(CHAVE);
    return valido(t) ? t : 'claro';
  } catch {
    return 'claro';
  }
}

// A cor da barra do navegador no celular acompanha a barra do alto (a superfície do tema que está na tela).
export function atualizarCorDoNavegador() {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = getComputedStyle(document.body ?? document.documentElement).getPropertyValue('--superficie').trim();
}

// O modo e o tema do <html>: o amigável com o tema escolhido, ou o técnico escuro do /gestao. No Automático, a barra do navegador
// acompanha quando o aparelho troca de claro para escuro.
let ouvindoOAparelho = false;
export function aplicarAparencia({ tecnico = false } = {}) {
  if (!ouvindoOAparelho) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', atualizarCorDoNavegador);
    ouvindoOAparelho = true;
  }
  const raiz = document.documentElement;
  raiz.dataset.modo = tecnico ? 'tecnico' : 'amigavel';
  raiz.dataset.tema = tecnico ? 'escuro' : temaGuardado();
  atualizarCorDoNavegador();
}

export function guardarTema(tema) {
  if (!valido(tema)) return;
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // sem o armazenamento do navegador (janela anônima), a escolha vale só até fechar a página
  }
  if (document.documentElement.dataset.modo !== 'tecnico') document.documentElement.dataset.tema = tema;
  atualizarCorDoNavegador();
  window.dispatchEvent(new Event(EVENTO));
}

// O tema escolhido, que muda junto quando outra parte da página (ou a conta) troca.
export function useTema() {
  const [tema, setTema] = useState(temaGuardado);
  useEffect(() => {
    const ler = () => setTema(temaGuardado());
    window.addEventListener(EVENTO, ler);
    return () => window.removeEventListener(EVENTO, ler);
  }, []);
  return tema;
}
