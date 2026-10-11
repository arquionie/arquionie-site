// A equipe do escritório e as apresentações da conta (migração 20261011010000_equipe_e_plano.sql; mockups
// docs/mockups/equipe-e-apresentacoes e docs/mockups/comentarios-do-cliente do repositório do programa, aprovados por ÊDI em
// 11/10/2026): os textos, as etiquetas e os dados de amostra para conferir as telas com ?amostra no servidor de desenvolvimento.
import { ARQUIVOS_URL } from '@/config';

// O convite que o responsável copia e manda pelo WhatsApp (o Arquionie não manda e-mail).
export function textoConviteDaEquipe({ escritorio, email }) {
  return (
    `${escritorio || 'O escritório'} colocou você na equipe dele no Arquionie™.\n` +
    `Para entrar, crie a sua conta com este e-mail (${email}) em arquionie.com.br/criar-conta, ou entre com o Google.\n` +
    'A equipe aparece na sua conta: é só confirmar.'
  );
}

// "(91) 98888-7777" a partir dos números.
export function whatsappLegivel(numeros) {
  const n = String(numeros ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return n;
}
export const linkDoWhatsApp = (numeros) => {
  const n = String(numeros ?? '').replace(/\D/g, '');
  return `https://wa.me/${n.length <= 11 ? '55' + n : n}`;
};

// A etiqueta do projeto: AJUSTES (os que faltam), AJUSTES FEITOS, AGUARDANDO, APROVADO, PAUSADO ou EXPIRADO.
export function etiquetaDaApresentacao(apresentacao) {
  const envio = apresentacao.envios?.[0];
  if (apresentacao.pausada) return { texto: 'PAUSADO', tipo: 'espera' };
  if (!envio) return { texto: 'AGUARDANDO', tipo: 'espera' };
  if (envio.situacao === 'expirado') return { texto: 'EXPIRADO', tipo: 'espera' };
  if (envio.situacao === 'aprovado') return { texto: 'APROVADO', tipo: 'aprovado' };
  if (envio.situacao === 'ajustes') {
    const faltam = ajustesAFazer(envio);
    return faltam > 0 ? { texto: `AJUSTES (${faltam})`, tipo: 'ajustes' } : { texto: 'AJUSTES FEITOS', tipo: 'espera' };
  }
  return { texto: 'AGUARDANDO', tipo: 'espera' };
}

export const ajustesAFazer = (envio) =>
  (envio?.pedidos ?? []).reduce((s, p) => s + p.comentarios.filter((c) => !c.feito).length, 0);

// A aba de cada projeto.
export function abaDaApresentacao(apresentacao) {
  const e = etiquetaDaApresentacao(apresentacao);
  return e.tipo === 'ajustes' ? 'ajustes' : e.tipo === 'aprovado' ? 'aprovadas' : 'aguardando';
}

// "TÉRREO · AUDITÓRIO · NO 3D"; sem nada, o projeto todo.
export function lugarDoComentario(c) {
  const l = c.lugar ?? {};
  const partes = [l.pavimento, l.ambiente].filter(Boolean).map((x) => String(x).toUpperCase());
  if (Array.isArray(l.ponto)) partes.push(l.vista && l.vista.modo && l.vista.modo !== 'planta' ? 'NO 3D' : 'NA PLANTA');
  return partes.length ? partes.join(' · ') : 'O PROJETO TODO';
}

// A capa do cartão: a do vídeo, a do tour ou a primeira imagem, lida do envio.json publicado.
export async function capaDaApresentacao(apresentacao) {
  if (apresentacao.capa) return apresentacao.capa;
  if (!apresentacao.arquivos || !apresentacao.manifesto) return null;
  try {
    const r = await fetch(`${ARQUIVOS_URL}/${apresentacao.arquivos}${apresentacao.manifesto}`);
    if (!r.ok) return null;
    const m = await r.json();
    const capa = m?.video?.capa || m?.tour?.capa || m?.imagens?.[0]?.arquivo;
    return capa ? `${ARQUIVOS_URL}/${apresentacao.arquivos}${capa}` : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------ amostra
const daqui = (horas) => new Date(Date.now() + horas * 36e5).toISOString();

export const AMOSTRA_ID_DO_ESCRITORIO = 'e0000000-0000-4000-8000-000000000001';

export const AMOSTRA_MINHA_EQUIPE = {
  escritorio: 'PALHETA ARQUITETURA', email: 'escritorio@palhetaarquitetura.com', computadores: 2, limiteComputadores: 3,
  pessoas: [
    { id: 'q1', email: 'maria@exemplo.com.br', nome: 'Maria Souza', situacao: 'ativo', cadastradoEm: daqui(-30), entrouEm: daqui(-29), ultimoAcesso: daqui(-1) },
    { id: 'q2', email: 'joao@exemplo.com.br', nome: 'João Lima', situacao: 'ativo', cadastradoEm: daqui(-30), entrouEm: daqui(-28), ultimoAcesso: daqui(-17) },
    { id: 'q3', email: 'bruno@exemplo.com.br', nome: '', situacao: 'esperando', cadastradoEm: daqui(-2), entrouEm: null, ultimoAcesso: null },
  ],
  pedidoDePlano: null,
};

export const AMOSTRA_MINHAS_EQUIPES = [
  { responsavel: AMOSTRA_ID_DO_ESCRITORIO, escritorio: 'PALHETA ARQUITETURA', emailDoResponsavel: 'escritorio@palhetaarquitetura.com',
    nomeDoResponsavel: 'Palheta Arquitetura', situacao: 'ativo', entrouEm: daqui(-29),
    pessoas: [
      { email: 'maria@exemplo.com.br', nome: 'Maria Souza', voce: true },
      { email: 'joao@exemplo.com.br', nome: 'João Lima', voce: false },
    ] },
];

// ?amostra=convite: a primeira vez, com o convite para confirmar.
export const AMOSTRA_CONVITE = [{ ...AMOSTRA_MINHAS_EQUIPES[0], situacao: 'convidado', pessoas: [] }];

const comentario = (texto, lugar, feito) => ({ texto, lugar, feito: feito ?? null });
export const AMOSTRA_APRESENTACOES = {
  limite: 500, escritorio: 'PALHETA ARQUITETURA', responsavel: true,
  apresentacoes: [
    { id: 'a1', codigo: 'AB12CD', chave: '225', nome: '225 — IGREJA PRESBITERIANA ALIANÇA', pausada: false, envio: 2, visitas: 312,
      ultimaVisita: daqui(-0.3), capa: '/imagens/programa.jpg',
      envios: [
        { id: 'e2', numero: 2, fase: 'aprovacao', paraQuem: 'O PASTOR', em: daqui(-30), expiraEm: daqui(24 * 335), situacao: 'ajustes', visitas: 128,
          tamanho: 236 * 1048576, enviadoPor: 'Maria Souza', comentarios: 3,
          pedidos: [{ id: 'p2', nome: 'O PASTOR', em: daqui(-20), comentarios: [
            comentario('Dá para o palco vir mais 1 m para a frente? Quero mais espaço para o coral.',
              { pavimento: 'Térreo', ambiente: 'AUDITÓRIO', ponto: [12, 4, 0.7], vista: { modo: 'andar' } }),
            comentario('Trocar as mesas do café por bancos junto da parede.', { pavimento: 'Térreo', ambiente: 'HALL', ponto: [3, 2, 0.2] },
              { por: 'João Lima', em: daqui(-10) }),
            comentario('Precisamos de um fraldário perto dos banheiros.', { pavimento: 'Térreo', ambiente: 'SANITÁRIOS', ponto: [1, 6, 0.2] }),
          ] }],
          aprovacao: null },
        { id: 'e1', numero: 1, fase: 'aprovacao', paraQuem: 'O PASTOR', em: daqui(-24 * 13), expiraEm: daqui(24 * 352), situacao: 'ajustes', visitas: 184,
          tamanho: 0, enviadoPor: 'Palheta Arquitetura', comentarios: 2,
          pedidos: [{ id: 'p1', nome: 'O PASTOR', em: daqui(-24 * 12), comentarios: [
            comentario('O piso do hall em porcelanato claro.', { ambiente: 'HALL' }, { por: 'Maria Souza', em: daqui(-24 * 11) }),
            comentario('O letreiro um pouco maior.', null, { por: 'Maria Souza', em: daqui(-24 * 11) }),
          ] }],
          aprovacao: null },
      ] },
    { id: 'a2', codigo: 'KM7QPX', chave: '192', nome: '192 — FAZEDORES DO REINO', pausada: false, envio: 1, visitas: 41, ultimaVisita: daqui(-26), capa: null,
      envios: [{ id: 'e3', numero: 1, fase: 'aprovacao', paraQuem: 'A DIRETORIA', em: daqui(-40), expiraEm: daqui(24 * 360), situacao: 'aguardando', visitas: 41,
        tamanho: 180 * 1048576, enviadoPor: 'João Lima', comentarios: 0, pedidos: [], aprovacao: null }] },
    { id: 'a3', codigo: 'R4TNW2', chave: '902', nome: '902 — CASA APROVADA', pausada: false, envio: 3, visitas: 88, ultimaVisita: daqui(-72), capa: null,
      envios: [{ id: 'e4', numero: 3, fase: 'final', paraQuem: 'FAMÍLIA CONFERÊNCIA', em: daqui(-96), expiraEm: daqui(24 * 361), situacao: 'aprovado', visitas: 88,
        tamanho: 120 * 1048576, enviadoPor: 'Palheta Arquitetura', comentarios: 0, pedidos: [],
        aprovacao: { id: 'v1', nome: 'FAMÍLIA CONFERÊNCIA', em: daqui(-90), termo: { titulo: 'APROVAÇÃO DA PROPOSTA', itens: ['A', 'B', 'C'] } } }] },
  ],
};

export const AMOSTRA_PEDIDOS_DE_PLANO = [
  { id: 'pp1', email: 'escritorio@palhetaarquitetura.com', nome: 'Palheta Arquitetura', escritorio: 'PALHETA ARQUITETURA', pessoas: 5,
    whatsapp: '91988887777', mensagem: 'Somos cinco: três no escritório e dois em casa.', em: daqui(-2), respondidoEm: null, equipe: 3, licencas: 0 },
  { id: 'pp2', email: 'carlos@exemplo.com.br', nome: 'Carlos Dias', escritorio: 'DIAS ARQUITETURA', pessoas: 8, whatsapp: '11977776666', mensagem: '',
    em: daqui(-24 * 6), respondidoEm: daqui(-24 * 5), equipe: 6, licencas: 6 },
];
