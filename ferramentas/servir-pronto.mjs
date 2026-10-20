// npm run preview: serve o dist como a Vercel serve, pelos rewrites do vercel.json. O vite preview não serve: entrega o index.html
// (a página inicial pronta) em toda rota, e o React reclama ao ligar os botões em /baixar com o texto do início.
// Uso: node ferramentas/servir-pronto.mjs [porta]   (de fábrica, 5173)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(raiz, 'dist');
const porta = Number(process.argv[2]) || 5173;
const { redirects = [], rewrites = [] } = JSON.parse(await readFile(path.join(raiz, 'vercel.json'), 'utf8'));

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
};

// "/t/:codigo" e "/(.*)", os dois jeitos que o vercel.json usa.
const padrao = (fonte) => new RegExp(`^${fonte.replace(/:[A-Za-z_]+/g, '[^/]+')}$`);

async function arquivo(caminho) {
  const completo = path.join(dist, decodeURIComponent(caminho));
  if (!completo.startsWith(dist)) return null;
  try {
    return (await stat(completo)).isFile() ? completo : null;
  } catch {
    return null;
  }
}

createServer(async (pedido, resposta) => {
  const { pathname } = new URL(pedido.url, 'http://local');
  // Como na Vercel: primeiro os redirects (o /bio do Instagram), com 307 quando não são permanentes e 308 quando são.
  const desvio = redirects.find((r) => padrao(r.source).test(pathname));
  if (desvio) {
    resposta.writeHead(desvio.permanent ? 308 : 307, { Location: desvio.destination }).end();
    return;
  }
  // Depois o arquivo que existe, e então os rewrites na ordem.
  let achado = pathname !== '/' && (await arquivo(pathname));
  if (!achado && pathname === '/') achado = await arquivo('/index.html');
  if (!achado) {
    const regra = rewrites.find((r) => padrao(r.source).test(pathname));
    if (regra) achado = await arquivo(regra.destination === '/' ? '/index.html' : regra.destination);
  }
  if (!achado) {
    resposta.writeHead(404).end('não encontrado');
    return;
  }
  resposta.writeHead(200, { 'Content-Type': TIPOS[path.extname(achado)] ?? 'application/octet-stream' });
  resposta.end(await readFile(achado));
}).listen(porta, () => console.log(`  o site pronto em http://localhost:${porta}`));
