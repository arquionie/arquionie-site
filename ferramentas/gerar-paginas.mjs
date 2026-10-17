// Depois do vite build (npm run build): as páginas públicas prontas, o mapa do site e o llms.txt, todos dentro do dist.
// - dist/index.html, dist/baixar/index.html e dist/versoes/index.html: o texto já desenhado e o <head> de cada uma (src/prerender.jsx);
// - dist/app.html: a casca vazia com noindex, que atende as outras rotas (o vercel.json manda para ela);
// - dist/sitemap.xml e dist/llms.txt.
// O manifesto de versões é lido na hora do build: a página de versões e os dados estruturados saem com a versão mais nova daquele
// momento, e o navegador confere de novo ao abrir. Sem o manifesto, as páginas saem sem a versão.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(raiz, 'dist');
const { MANIFESTO_URL, ROTAS_PRONTAS, cabecalho, mapaDoSite, renderizar, textoParaIAs } = await import(
  pathToFileURL(path.join(raiz, 'dist-ssr', 'prerender.js')).href
);

async function lerManifesto() {
  try {
    const resposta = await fetch(MANIFESTO_URL, { signal: AbortSignal.timeout(10000) });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const manifesto = await resposta.json();
    return manifesto?.versao ? manifesto : null;
  } catch (erro) {
    console.warn(`  sem o manifesto de versões (${erro.message}): as páginas saem sem a versão`);
    return null;
  }
}

// Cada página pronta fora da raiz precisa da sua linha no vercel.json antes do "/(.*)", senão a Vercel entrega a casca.
const vercel = JSON.parse(await readFile(path.join(raiz, 'vercel.json'), 'utf8'));
const semLinha = ROTAS_PRONTAS.filter((rota) => rota !== '/' && !vercel.rewrites?.some((r) => r.source === rota));
if (semLinha.length) throw new Error(`Falta no vercel.json o rewrite de ${semLinha.join(', ')} para a pasta da página pronta.`);

const molde = await readFile(path.join(dist, 'index.html'), 'utf8');
const TRECHO_SEO = /<!-- seo:inicio[\s\S]*?<!-- seo:fim -->/;
if (!TRECHO_SEO.test(molde) || !molde.includes('<!--app-->')) throw new Error('O dist/index.html não tem as marcas seo:inicio, seo:fim e app.');

const manifesto = await lerManifesto();
const montar = (rota) =>
  molde.replace(TRECHO_SEO, () => cabecalho(rota, { manifesto })).replace('<!--app-->', () => (rota ? renderizar(rota, { manifesto }) : ''));

await writeFile(path.join(dist, 'app.html'), montar(null));
for (const rota of ROTAS_PRONTAS) {
  const pasta = path.join(dist, rota);
  await mkdir(pasta, { recursive: true });
  await writeFile(path.join(pasta, 'index.html'), montar(rota));
  console.log(`  página pronta: ${rota}`);
}

const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD, no horário de Brasília
await writeFile(path.join(dist, 'sitemap.xml'), mapaDoSite({ hoje, manifesto }));
await writeFile(path.join(dist, 'llms.txt'), textoParaIAs({ manifesto }));
console.log('  sitemap.xml e llms.txt');
