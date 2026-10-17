import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SITE_URL } from '@/config';

// O título, a descrição e o "pode indexar" de cada página, para o Google, o Bing e as IAs que buscam na web (ChatGPT, Claude,
// Perplexity, Gemini). As páginas abertas ao público saem prontas do build (src/prerender.jsx e ferramentas/gerar-paginas.mjs), com
// estes mesmos textos no <head>; no site, a MetaDaPagina troca o <head> quando a pessoa muda de página sem recarregar.
// O título fica em até uns 60 caracteres e a descrição em até uns 155, o que o Google mostra sem cortar.

export const IMAGEM_PADRAO = {
  caminho: '/imagens/programa.jpg',
  largura: 1600,
  altura: 972,
  descricao: 'A janela do Arquionie com um estacionamento em 3D, carros e vagas numeradas, num projeto de amostra',
};

export const PAGINAS = {
  '/': {
    titulo: 'Arquionie™ · Programa BIM e CRM para escritórios de arquitetura',
    descricao:
      'Programa BIM brasileiro com renderizador próprio, apresentação ao cliente por link e CRM: do primeiro contato ao projeto aprovado. Grátis, com versão PRO.',
    publica: true,
  },
  '/baixar': {
    titulo: 'Baixar o Arquionie™ para Windows 10 e 11',
    descricao:
      'Baixe o Arquionie™, programa BIM para Windows 10 e 11 de 64 bits. Grátis, com versão PRO: crie a conta, instale e as versões novas chegam sozinhas.',
    publica: true,
  },
  '/versoes': {
    titulo: 'Versões do Arquionie™ · O que mudou em cada uma',
    descricao: 'As notas de cada versão do Arquionie™, o programa BIM da Palheta Arquitetura: o que entrou, o que mudou e quando.',
    publica: true,
  },
  // Os termos e a privacidade ainda são rascunho, com o CNPJ e o foro por preencher: entram no Google depois da revisão do advogado.
  '/termos': { titulo: 'Termos de uso · Arquionie™' },
  '/privacidade': { titulo: 'Política de privacidade · Arquionie™' },
  '/entrar': { titulo: 'Entrar · Arquionie™' },
  '/criar-conta': { titulo: 'Criar conta · Arquionie™' },
  '/confirmar': { titulo: 'Confirmar o e-mail · Arquionie™' },
  '/recuperar': { titulo: 'Trocar a senha · Arquionie™' },
  '/completar': { titulo: 'Completar o cadastro · Arquionie™' },
  '/conectar': { titulo: 'Conectar o computador · Arquionie™' },
  '/gestao': { titulo: 'Gestão · Arquionie™' },
};

const NAO_ENCONTRADA = { titulo: 'Página não encontrada · Arquionie™' };

// As páginas que trocam o próprio título (Minha conta, o Comercial e as do cliente) ficam de fora: a MetaDaPagina só marca o noindex.
const COM_TITULO_PROPRIO = ['/conta', '/painel', '/programa', '/f/', '/p/'];

// Pode indexar, e o Google pode mostrar a imagem grande no resultado.
export const ROBOTS_PUBLICA = 'index, follow, max-image-preview:large';

export const enderecoDe = (rota) => (rota === '/' ? `${SITE_URL}/` : `${SITE_URL}${rota}`);

function meta(atributo, nome, valor) {
  let el = document.head.querySelector(`meta[${atributo}="${nome}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(atributo, nome);
    document.head.appendChild(el);
  }
  el.setAttribute('content', valor);
}

function canonico(endereco) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!endereco) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = endereco;
}

export function MetaDaPagina() {
  const { pathname } = useLocation();
  useEffect(() => {
    const rota = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const proprio = COM_TITULO_PROPRIO.some((p) => rota === p || rota.startsWith(p.endsWith('/') ? p : `${p}/`));
    const pagina = PAGINAS[rota] ?? (proprio ? null : NAO_ENCONTRADA);
    meta('name', 'robots', pagina?.publica ? ROBOTS_PUBLICA : 'noindex');
    canonico(pagina?.publica ? enderecoDe(rota) : null);
    if (!pagina) return;
    document.title = pagina.titulo;
    if (pagina.descricao) {
      meta('name', 'description', pagina.descricao);
      meta('property', 'og:title', pagina.titulo);
      meta('property', 'og:description', pagina.descricao);
      meta('property', 'og:url', enderecoDe(rota));
    }
  }, [pathname]);
  return null;
}
