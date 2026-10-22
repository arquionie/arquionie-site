// Os tours no link (migração 20261010000000_tours.sql; mockup docs/mockups/tour-no-link.html do repositório do programa,
// aprovado por ÊDI em 10/10/2026): o link do cliente, os textos e os dados de amostra para conferir a seção TOURS.
import { ARQUIVOS_URL, SITE_URL } from '@/config';

export const linkDoTour = (codigo) => `${SITE_URL}/t/${codigo}`;
export const linkCurto = (codigo) => `arquionie.com.br/t/${codigo}`;
export const capaDoTour = (capa) => (capa ? (capa.startsWith('/') ? capa : `${ARQUIVOS_URL}/${capa}`) : null);

export function tamanhoLegivel(bytes) {
  if (!bytes) return '—';
  const mb = bytes / 1048576;
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1).replace('.', ',')} MB`;
}

export function quandoLegivel(iso) {
  if (!iso) return null;
  const d = new Date(iso), agora = new Date();
  const horas = (agora - d) / 36e5;
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === agora.toDateString()) return horas < 1 ? 'há pouco' : `hoje, ${hora}`;
  const ontem = new Date(agora); ontem.setDate(agora.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `ontem, ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`;
}

const daqui = (horas) => new Date(Date.now() + horas * 36e5).toISOString();

export const AMOSTRA_MEUS_TOURS = {
  limite: 20,
  tours: [
    { id: 't1', codigo: 'K7PX2M', nome: '225 - IGREJA PRESBITERIANA ALIANÇA', passeio: 'PASSEIO 01', situacao: 'publicado', paradas: 8,
      tamanho: 28 * 1048576, visitas: 37, ultimaVisita: daqui(-1), publicadoEm: daqui(-30), atualizadoEm: daqui(-2), capa: '/imagens/225-fachada.jpg' },
    { id: 't2', codigo: 'Q4HN8T', nome: '225 - IGREJA PRESBITERIANA ALIANÇA', passeio: 'PASSEIO 02 · ESPAÇO GOURMET', situacao: 'publicado', paradas: 4,
      tamanho: 19 * 1048576, visitas: 5, ultimaVisita: daqui(-26), publicadoEm: daqui(-40), atualizadoEm: daqui(-40), capa: '/imagens/225-gourmet.jpg' },
    { id: 't3', codigo: 'B2WC7R', nome: '225 - IGREJA PRESBITERIANA ALIANÇA', passeio: 'PASSEIO 03 · CIRCULAÇÃO', situacao: 'pausado', paradas: 6,
      tamanho: 27 * 1048576, visitas: 112, ultimaVisita: daqui(-70), publicadoEm: daqui(-120), atualizadoEm: daqui(-120), capa: '/imagens/225-hall.jpg' },
  ],
};
