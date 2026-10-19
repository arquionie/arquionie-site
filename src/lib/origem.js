// De onde a pessoa veio (passo 4 da configuração do Comercial, 19/10/2026): as marcas do anúncio (utm_*), o fbclid da Meta, o ?de=
// dos links próprios (bio, selo, youtube) e o site que mandou para cá. Fica neste navegador por 30 dias e vai junto no cadastro
// (CriarConta e, pelo Google, Completar). O banco limpa o que chega e guarda a primeira origem da conta, sem trocar depois
// (supabase/migrations/20261019010000_origem_da_conta.sql).

const CHAVE = 'arquionie-origem';
const VALIDADE = 30 * 864e5;
const MARCAS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'de'];
// As páginas do cliente de um escritório levam o ?de= do escritório (a origem do pedido dele), não a de uma conta do Arquionie.
const DO_CLIENTE = ['/f/', '/p/', '/t/'];

const semWww = (host) => host.replace(/^www\./, '');

function lerGuardada() {
  try {
    const o = JSON.parse(localStorage.getItem(CHAVE));
    return o && Date.now() - Date.parse(o.em) < VALIDADE ? o : null;
  } catch {
    return null;
  }
}

/** Chamada ao abrir o site. A primeira visita com marca vale; sem marca, fica a primeira visita até chegar uma com marca. */
export function registrarOrigem(local = window.location, referencia = document.referrer) {
  if (DO_CLIENTE.some((p) => local.pathname.startsWith(p))) return;
  const busca = new URLSearchParams(local.search);
  const nova = {};
  for (const m of MARCAS) {
    const v = busca.get(m)?.trim();
    if (v) nova[m] = v.slice(0, 200);
  }
  const marcada = Object.keys(nova).length > 0;
  const guardada = lerGuardada();
  if (guardada && (guardada.marcada || !marcada)) return;
  try {
    const host = referencia ? semWww(new URL(referencia).hostname) : '';
    if (host && host !== semWww(local.hostname)) nova.referencia = host; // só o site, nunca o endereço inteiro
  } catch {
    // referência que não é endereço: fica sem
  }
  nova.entrada = local.pathname.slice(0, 200);
  nova.em = new Date().toISOString();
  nova.marcada = marcada;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(nova));
  } catch {
    // sem o armazenamento do navegador, a conta nasce sem a origem
  }
}

/** A origem para mandar no cadastro, ou null. */
export function origemGuardada() {
  const o = lerGuardada();
  if (!o) return null;
  const { marcada, ...origem } = o;
  return origem;
}
