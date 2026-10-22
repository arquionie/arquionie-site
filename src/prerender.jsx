import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import App from '@/App';
import { ProvedorSessao } from '@/lib/Sessao';
import { IMAGEM_PADRAO, PAGINAS, ROBOTS_PUBLICA, enderecoDe } from '@/lib/seo';
import { DESTAQUES, PASSOS, PERGUNTAS, PUBLICO, RECURSOS } from '@/conteudo/inicio';
import { ETAPAS, PERGUNTAS_REVIT, PRECOS_PADRAO, REQUISITOS } from '@/conteudo/paraRevit';
import { PASSOS_COMERCIAL, PERGUNTAS_COMERCIAL, PLANOS_COMERCIAL, RECURSOS_COMERCIAL } from '@/conteudo/comercial';
import { EMAIL_CONTATO, INSTAGRAM_URL, MANIFESTO_URL, SITE_URL, YOUTUBE_URL } from '@/config';

// As páginas públicas prontas no build, para quem não roda JavaScript: os robôs das IAs (GPTBot, ClaudeBot, PerplexityBot) leem só o
// HTML que chega, e o Google indexa mais rápido o que já vem escrito. O texto é o mesmo das telas, desenhado pelos mesmos componentes;
// no navegador, o main.jsx só liga os botões nele. Quem chama é ferramentas/gerar-paginas.mjs, depois do vite build.

export { MANIFESTO_URL, PAGINAS, SITE_URL };

export const ROTAS_PRONTAS = Object.keys(PAGINAS).filter((rota) => PAGINAS[rota].publica);

export function renderizar(rota, { manifesto } = {}) {
  globalThis.__ARQUIONIE_MANIFESTO__ = rota === '/versoes' ? manifesto ?? undefined : undefined;
  try {
    return renderToString(
      <StaticRouter location={rota}>
        <ProvedorSessao>
          <App />
        </ProvedorSessao>
      </StaticRouter>,
    );
  } finally {
    delete globalThis.__ARQUIONIE_MANIFESTO__;
  }
}

const escapar = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// JSON dentro de <script>: o "<" escapado, para um texto com </script> não fechar a tag antes da hora.
const jsonNoScript = (dados) => JSON.stringify(dados).replace(/</g, '\\u003c');

// Os dados estruturados (schema.org) que o Google e as IAs usam para saber o que é o Arquionie™, quem faz, quanto custa e onde roda.
// Só o que é verdade hoje: sem nota de avaliação nem número de usuários.
function dadosEstruturados(rota, manifesto) {
  const organizacao = {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#palheta`,
    name: 'Palheta Arquitetura',
    url: 'https://www.palhetaarquitetura.com.br/',
    logo: `${SITE_URL}/marca-256.png`,
    email: EMAIL_CONTATO,
    address: { '@type': 'PostalAddress', addressCountry: 'BR' },
    sameAs: ['https://www.instagram.com/edipalhetaarquitetura', 'https://www.youtube.com/@edipalhetaarquiteto'],
  };
  const site = {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#site`,
    url: `${SITE_URL}/`,
    name: 'Arquionie™',
    inLanguage: 'pt-BR',
    publisher: { '@id': organizacao['@id'] },
  };
  const programa = {
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#programa`,
    name: 'Arquionie™',
    alternateName: ['Palheta Arquionie', 'Arquionie'],
    sameAs: [INSTAGRAM_URL, YOUTUBE_URL, 'https://github.com/arquionie'],
    description: PAGINAS['/'].descricao,
    url: `${SITE_URL}/`,
    applicationCategory: 'DesignApplication',
    applicationSubCategory: 'BIM',
    operatingSystem: 'Windows 10, Windows 11 (64 bits)',
    inLanguage: 'pt-BR',
    image: `${SITE_URL}${IMAGEM_PADRAO.caminho}`,
    screenshot: `${SITE_URL}${IMAGEM_PADRAO.caminho}`,
    downloadUrl: enderecoDe('/baixar'),
    releaseNotes: enderecoDe('/versoes'),
    featureList: [...PASSOS, ...DESTAQUES.map((d) => [d.titulo, d.texto]), ...RECURSOS].map(([titulo, texto]) => `${titulo}: ${texto}`),
    audience: PUBLICO.map(([titulo]) => ({ '@type': 'Audience', audienceType: titulo })),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL', description: 'Versão grátis; a versão PRO é paga.' },
    publisher: { '@id': organizacao['@id'] },
    author: { '@id': organizacao['@id'] },
  };
  if (manifesto?.versao) {
    programa.softwareVersion = manifesto.versao;
    if (manifesto.data) programa.dateModified = manifesto.data;
  }
  if (manifesto?.pacotes?.instalador?.tamanho) programa.fileSize = `${Math.round(manifesto.pacotes.instalador.tamanho / 1048576)} MB`;

  const grafo = [organizacao, site, programa];
  if (rota === '/para-revit') {
    // O plugin, com o nome antigo para quem ainda procura o Palheta Flow.
    grafo.push({
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/para-revit#plugin`,
      name: 'Arquionie™ para Revit',
      alternateName: ['Arquionie para Revit', 'Palheta Flow'],
      description: PAGINAS[rota].descricao,
      url: enderecoDe(rota),
      applicationCategory: 'DesignApplication',
      applicationSubCategory: 'Plugin para Autodesk Revit',
      operatingSystem: 'Windows 10, Windows 11 (64 bits)',
      softwareRequirements: 'Autodesk Revit 2025, 2026, 2027 ou 2028',
      inLanguage: 'pt-BR',
      image: `${SITE_URL}/imagens/painel-revit-claro.jpg`,
      featureList: ETAPAS.flatMap(([etapa, grupos]) => grupos.map(([grupo, ferramentas]) => `${etapa} › ${grupo}: ${ferramentas.map(([f]) => f).join(', ')}`)),
      offers: [
        { '@type': 'Offer', price: '0', priceCurrency: 'BRL', description: 'Versão grátis.' },
        { '@type': 'Offer', price: String(PRECOS_PADRAO.mensal), priceCurrency: 'BRL', description: 'PRO mensal, por mês.' },
        { '@type': 'Offer', price: String(PRECOS_PADRAO.anual * 12), priceCurrency: 'BRL', description: 'PRO anual, por ano.' },
      ],
      isRelatedTo: { '@id': programa['@id'] },
      publisher: { '@id': organizacao['@id'] },
      author: { '@id': organizacao['@id'] },
    });
    grafo.push({
      '@type': 'FAQPage',
      '@id': `${SITE_URL}/para-revit#perguntas`,
      inLanguage: 'pt-BR',
      mainEntity: PERGUNTAS_REVIT.map(([pergunta, resposta]) => ({
        '@type': 'Question',
        name: pergunta,
        acceptedAnswer: { '@type': 'Answer', text: resposta },
      })),
    });
  }
  if (rota === '/comercial') {
    // O Comercial, o CRM grátis, como aplicativo da web. Só a oferta que existe hoje, a grátis: os planos pagos estão EM BREVE.
    grafo.push({
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/comercial#comercial`,
      name: 'Arquionie™ Comercial',
      alternateName: ['Arquionie Comercial', 'CRM do Arquionie'],
      description: PAGINAS[rota].descricao,
      url: enderecoDe(rota),
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'CRM para escritórios de arquitetura, interiores e engenharia',
      operatingSystem: 'Qualquer um, pelo navegador',
      browserRequirements: 'Um navegador atual, no computador ou no celular',
      inLanguage: 'pt-BR',
      image: `${SITE_URL}${PAGINAS[rota].imagem.caminho}`,
      featureList: [...PASSOS_COMERCIAL, ...RECURSOS_COMERCIAL].map(([titulo, texto]) => `${titulo}: ${texto}`),
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL', description: PLANOS_COMERCIAL[0].itens.join('; ') },
      isRelatedTo: { '@id': programa['@id'] },
      publisher: { '@id': organizacao['@id'] },
      author: { '@id': organizacao['@id'] },
    });
    grafo.push({
      '@type': 'FAQPage',
      '@id': `${SITE_URL}/comercial#perguntas`,
      inLanguage: 'pt-BR',
      mainEntity: PERGUNTAS_COMERCIAL.map(([pergunta, resposta]) => ({
        '@type': 'Question',
        name: pergunta,
        acceptedAnswer: { '@type': 'Answer', text: resposta },
      })),
    });
  }
  if (rota === '/') {
    grafo.push({
      '@type': 'FAQPage',
      '@id': `${SITE_URL}/#perguntas`,
      inLanguage: 'pt-BR',
      mainEntity: PERGUNTAS.map(([pergunta, resposta]) => ({
        '@type': 'Question',
        name: pergunta,
        acceptedAnswer: { '@type': 'Answer', text: resposta },
      })),
    });
  } else {
    grafo.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Arquionie™', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: PAGINAS[rota].titulo.split(' · ')[0], item: enderecoDe(rota) },
      ],
    });
  }
  return { '@context': 'https://schema.org', '@graph': grafo };
}

// O <head> de uma página pronta. Sem "rota", o da casca: a página vazia que atende as rotas da conta, que não entram no Google.
export function cabecalho(rota, { manifesto } = {}) {
  if (!rota) {
    return [
      '<title>Arquionie™</title>',
      '<meta name="robots" content="noindex" />',
    ].join('\n    ');
  }
  const pagina = PAGINAS[rota];
  const endereco = enderecoDe(rota);
  const foto = pagina.imagem ?? IMAGEM_PADRAO;
  const imagem = `${SITE_URL}${foto.caminho}`;
  const linhas = [
    `<title>${escapar(pagina.titulo)}</title>`,
    `<meta name="description" content="${escapar(pagina.descricao)}" />`,
    `<meta name="robots" content="${ROBOTS_PUBLICA}" />`,
    `<link rel="canonical" href="${endereco}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:locale" content="pt_BR" />',
    '<meta property="og:site_name" content="Arquionie™" />',
    `<meta property="og:title" content="${escapar(pagina.titulo)}" />`,
    `<meta property="og:description" content="${escapar(pagina.descricao)}" />`,
    `<meta property="og:url" content="${endereco}" />`,
    `<meta property="og:image" content="${imagem}" />`,
    `<meta property="og:image:width" content="${foto.largura}" />`,
    `<meta property="og:image:height" content="${foto.altura}" />`,
    `<meta property="og:image:alt" content="${escapar(foto.descricao)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    '<link rel="alternate" type="text/plain" title="Resumo para IAs" href="/llms.txt" />',
    `<script type="application/ld+json">${jsonNoScript(dadosEstruturados(rota, manifesto))}</script>`,
  ];
  if (rota === '/versoes' && manifesto) linhas.push(`<script>window.__ARQUIONIE_MANIFESTO__=${jsonNoScript(manifesto)}</script>`);
  return linhas.join('\n    ');
}

// O mapa do site para o Google e o Bing: só as páginas públicas, com a data do build (a de /versoes, a da versão mais nova).
export function mapaDoSite({ hoje, manifesto }) {
  const urls = ROTAS_PRONTAS.map((rota) => {
    const data = rota === '/versoes' && manifesto?.data ? manifesto.data : hoje;
    return `  <url>\n    <loc>${enderecoDe(rota)}</loc>\n    <lastmod>${data}</lastmod>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// O llms.txt (llmstxt.org): o resumo do Arquionie™ em Markdown, para as IAs responderem certo quando alguém pergunta por um programa
// BIM. Os mesmos textos da página inicial.
export function textoParaIAs({ manifesto }) {
  const lista = (itens) => itens.map(([titulo, texto]) => `- **${titulo}**: ${texto}`).join('\n');
  const versao = manifesto?.versao ? `\n- Versão mais recente: ${manifesto.versao}${manifesto.data ? `, de ${manifesto.data}` : ''}` : '';
  return `# Arquionie™

> O Arquionie™ (Palheta Arquionie) é um programa BIM e uma plataforma para escritórios de arquitetura, feito no Brasil pela Palheta
> Arquitetura, um escritório de verdade. Acompanha o escritório do primeiro contato com o cliente ao projeto aprovado: capta os pedidos
> com formulário e CRM, modela e documenta em BIM pelas normas brasileiras (ABNT e NBR 9050), renderiza com motor próprio e envia o
> projeto ao cliente por um link, com vídeo, imagens e tour 3D, para ele pedir ajustes ou aprovar. Tem a versão grátis e a versão PRO.

## Fatos

- Nome: Arquionie™ (também Palheta Arquionie)
- Quem faz: Palheta Arquitetura, Brasil
- O que é: programa BIM (Building Information Modeling) e plataforma para escritórios de arquitetura e engenharia: CRM (o Comercial),
  modelagem, documentação, renderização e apresentação ao cliente com aprovação pelo link
- Sistema: o programa roda no Windows 10 e 11, 64 bits (no Mac e no Linux, ainda não); o Comercial e a página do cliente abrem no
  navegador e no celular
- Idioma: português do Brasil
- Preço: a versão grátis traz tudo o que se usa no dia a dia, inclusive criar e editar projetos; a versão PRO, paga, entrega o resultado
  final no nível máximo (o render em qualidade máxima, até 200 projetos enviados ao cliente e a conexão com a IA). Abrir, ver, imprimir
  e exportar os projetos é sempre grátis
- Os projetos ficam no computador de quem usa, em arquivos .aqi; para o servidor vai só o que a pessoa escolhe enviar ao cliente
- Revit: abre o pacote exportado pelo Arquionie™ para Revit (o plugin, antigo Palheta Flow) e a planta em PDF exportada pelo Revit; o arquivo
  .rvt direto, não
- IA: conecta ao Claude, ao Claude Code, ao Codex e ao ChatGPT pelo botão CONECTAR IA, na versão PRO${versao}
- Contato: ${EMAIL_CONTATO}

## Páginas

- [Início](${enderecoDe('/')}): o que o programa faz, para quem é e as perguntas frequentes
- [Arquionie™ Comercial](${enderecoDe('/comercial')}): o CRM grátis para arquitetos, interiores e engenharia, no navegador
- [Baixar](${enderecoDe('/baixar')}): o instalador para Windows, com a conta grátis, e como instalar
- [Versões](${enderecoDe('/versoes')}): o que mudou em cada versão
- [Arquionie™ para Revit](${enderecoDe('/para-revit')}): o plugin para o Revit 2025 a 2028, antigo Palheta Flow

## Como funciona

${lista(PASSOS)}

## O que ele faz

${lista(DESTAQUES.map((d) => [d.titulo, d.texto]))}
${lista(RECURSOS)}

## Para quem é

${lista(PUBLICO)}

## Arquionie™ Comercial (o CRM grátis)

O CRM do Arquionie, no navegador e no celular, sem instalar. Nasceu do CRM que a Palheta Arquitetura usa todo dia.

${lista(PASSOS_COMERCIAL)}
${lista(RECURSOS_COMERCIAL)}

Planos: ${PLANOS_COMERCIAL.map((p) => `${p.nome} (${p.preco}${p.porMes ? ' por mês' : ''}${p.emBreve ? ', em breve' : ''}): ${p.itens.join('; ')}`).join('. ')}.

## Arquionie™ para Revit (o antigo Palheta Flow)

O plugin para o Autodesk Revit que automatiza o trabalho repetido, nas mesmas etapas do painel. Grátis, com versão PRO.

${REQUISITOS.map(([titulo, texto]) => `- ${titulo}: ${texto}`).join('\n')}

${ETAPAS.map(([etapa, grupos]) => `- **${etapa}**: ${grupos.map(([grupo, ferramentas]) => `${grupo} (${ferramentas.map(([f, pro]) => (pro ? `${f}, PRO` : f)).join('; ')})`).join('; ')}`).join('\n')}

## Perguntas frequentes

${[...PERGUNTAS, ...PERGUNTAS_COMERCIAL, ...PERGUNTAS_REVIT].map(([pergunta, resposta]) => `### ${pergunta}\n\n${resposta}`).join('\n\n')}
`;
}
