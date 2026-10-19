// O MODO DE AULA (?amostra=aula, só no servidor de desenvolvimento): a história inteira do vídeo dos primeiros passos do Comercial
// (roteiro em aulas-arquionie/produtos/arquionie/roteiros/comercial-primeiros-passos.json, aprovado por ÊDI em 19/10/2026), sem
// banco e sem dado de ninguém. A conta começa zerada; o que se faz numa tela (o escritório, o pedido do formulário, o WhatsApp, a
// proposta, o aceite) fica guardado neste navegador e aparece nas outras telas, com as regras de fábrica do Comercial.
import { AMOSTRA_ESTADO, AMOSTRA_FORMULARIO_PUBLICO } from '@/lib/comercial';

export const AULA = import.meta.env.DEV && new URLSearchParams(window.location.search).get('amostra') === 'aula';

const CHAVE = 'arquionie-aula';
const CODIGO_DA_PROPOSTA = 'QX7M2KAB';
const WHATSAPP_DO_ESCRITORIO = '551532228800';

function ler() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) ?? {};
  } catch {
    return {};
  }
}
function gravar(d) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(d));
  } catch {
    // sem o armazenamento do navegador, a aula não passa de uma tela para a outra
  }
}
const agora = () => new Date().toISOString();
const emDias = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

function mudarPedido(id, f) {
  const d = ler();
  d.pedidos = (d.pedidos ?? []).map((p) => (p.id === id ? f(p) : p));
  gravar(d);
  return d.pedidos.find((p) => p.id === id);
}
const comEvento = (p, tipo, dados) => ({ ...p, linhaDoTempo: [{ tipo, dados, em: agora(), por: 'Você' }, ...(p.linhaDoTempo ?? [])] });
function irPara(p, etapa, porque, motivo = '') {
  if (p.etapa === etapa) return p;
  return comEvento({ ...p, etapa, etapaDesde: agora(), motivo }, 'etapa', { de: p.etapa, para: etapa, porque, motivo: motivo || undefined });
}

const tipoDaEtapa = (id) => AMOSTRA_ESTADO.ajustes.etapas.find((e) => e.id === id)?.tipo;
function indicadores(pedidos) {
  const ganhos = pedidos.filter((p) => tipoDaEtapa(p.etapa) === 'ganho');
  const andamento = pedidos.filter((p) => tipoDaEtapa(p.etapa) === 'andamento');
  const valorGanho = ganhos.reduce((s, p) => s + Number(p.valor ?? 0), 0);
  return {
    pedidos: pedidos.length, emAndamento: andamento.length, ganhos: ganhos.length,
    conversao: pedidos.length ? Math.round((ganhos.length / pedidos.length) * 100) : 0,
    ticketMedio: ganhos.length ? Math.round(valorGanho / ganhos.length) : 0, valorGanho,
    emNegociacao: andamento.reduce((s, p) => s + Number(p.valor ?? 0), 0),
  };
}

// ------------------------------------------------------------------------------------------------ o painel
export function estadoDaAula() {
  const d = ler();
  const escritorio = d.escritorio?.nome ?? '';
  const pedidos = d.iniciado ? d.pedidos ?? [] : [];
  return {
    ...AMOSTRA_ESTADO, novo: !d.iniciado, escritorio, pedidos, hoje: [], indicadores: indicadores(pedidos),
    ajustes: { ...AMOSTRA_ESTADO.ajustes, precos: d.precos ?? AMOSTRA_ESTADO.ajustes.precos },
    formularios: AMOSTRA_ESTADO.formularios.map((f) => ({ ...f, respostasNoMes: pedidos.length })),
  };
}
export function gravarEscritorioDaAula(nome, cor, logo) {
  const d = ler();
  gravar({ ...d, escritorio: { ...d.escritorio, nome, cor, ...(logo !== undefined ? { logo } : {}) } });
}
export const marcaDaAula = () => escritorioDaAula(ler());
export function gravarPrecosDaAula(precos) {
  gravar({ ...ler(), precos });
  return estadoDaAula();
}
export function iniciarAula(modelo) {
  gravar({ ...ler(), iniciado: true, modelo, pedidos: [] });
  return estadoDaAula();
}

export const pedidoDaAula = (id) => (ler().pedidos ?? []).find((p) => p.id === id) ?? null;
export const moverNaAula = (id, etapa, motivo) => mudarPedido(id, (p) => irPara(p, etapa, null, motivo ?? ''));
export const salvarNaAula = (id, corpo) => mudarPedido(id, (p) => ({ ...p, ...corpo, valor: corpo.valor === null ? null : Number(corpo.valor) }));
export const anotarNaAula = (id, texto) => mudarPedido(id, (p) => comEvento(p, 'anotacao', { texto }));

// a regra de fábrica: chamar no WhatsApp leva de Solicitação para Em contato
export function whatsappNaAula(id) {
  return mudarPedido(id, (p) => {
    const q = comEvento(p, 'whatsapp', {});
    return q.etapa === 'solicitacao' ? irPara(q, 'contato', 'whatsapp') : q;
  });
}

// a regra de fábrica: enviar a proposta leva para Retorno, com o dia combinado
export function propostaNaAula(id, { conteudo, valor, orcamento, retorno }) {
  const validaAte = emDias(30);
  const pedido = mudarPedido(id, (p) => {
    const q = comEvento({
      ...p, orcamento, valor: valor || p.valor, retorno: retorno || null,
      proposta: { aberturas: 0, ultimaAbertura: null, aceitaEm: null, enviadaEm: agora() },
      propostas: [{ id: 'p1', codigo: CODIGO_DA_PROPOSTA, jeito: 'modelo', enviadaEm: agora(), enviadaPor: 'Você', aberturas: 0, ultimaAbertura: null,
        valor, validaAte, aceite: null }],
    }, 'proposta', { jeito: 'modelo' });
    return irPara(q, 'retorno', 'proposta');
  });
  gravar({ ...ler(), proposta: { codigo: CODIGO_DA_PROPOSTA, pedido: id, conteudo, valor, validaAte } });
  return { codigo: CODIGO_DA_PROPOSTA, pedido };
}

// ------------------------------------------------------------------------------------------------ as páginas do cliente
function escritorioDaAula(d) {
  return { nome: d.escritorio?.nome || 'Lima Arquitetura', cor: d.escritorio?.cor || '#A9513F', logo: d.escritorio?.logo ?? null };
}

export function formularioDaAula() {
  return { ...AMOSTRA_FORMULARIO_PUBLICO, escritorio: escritorioDaAula(ler()), whatsappEscritorio: WHATSAPP_DO_ESCRITORIO };
}

// o pedido que o cliente manda pelo formulário cai na primeira etapa
export function pedidoNovoNaAula(lista, origem) {
  const d = ler();
  const r = Object.fromEntries(lista.map((x) => [x.id, x.valor]));
  const contato = r.dados ?? {};
  const digitos = String(contato.whatsapp ?? '').replace(/\D/g, '');
  const perguntas = AMOSTRA_FORMULARIO_PUBLICO.perguntas;
  const numero = (d.pedidos ?? []).length + 1;
  const pedido = {
    id: `a${String(numero).padStart(7, '0')}-0000-4000-8000-0000000000a1`, numero, nome: contato.nome ?? 'Cliente', etapa: 'solicitacao',
    whatsapp: digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos, email: contato.email ?? '',
    etapaDesde: agora(), criadoEm: agora(), tipo: r.objetivo ?? '', cidade: r.cidade ?? '', area: r.area ?? null, obra: r.investimento ?? '',
    inicio: r.inicio ?? '', origem: r.origem || origem || '', valor: null, nota: null, retorno: null, reuniao: null, motivo: '', proposta: null,
    formulario: AMOSTRA_FORMULARIO_PUBLICO.nome, observacoes: '', responsavel: 'Você', orcamento: {}, propostas: [],
    respostas: lista.filter((x) => x.id !== 'privacidade' && x.valor !== null && x.valor !== '').map((x) => {
      const q = perguntas.find((y) => y.id === x.id);
      return { id: x.id, texto: q?.texto ?? x.id, tipo: q?.tipo, valor: x.valor };
    }),
    linhaDoTempo: [{ tipo: 'chegou', dados: { formulario: AMOSTRA_FORMULARIO_PUBLICO.nome, origem: r.origem || origem || '' }, em: agora() }],
  };
  gravar({ ...d, pedidos: [pedido, ...(d.pedidos ?? [])] });
}

export function propostaPublicaDaAula() {
  const d = ler();
  const pedido = d.proposta && (d.pedidos ?? []).find((p) => p.id === d.proposta.pedido);
  if (!pedido) return { situacao: 'inexistente' };
  mudarPedido(pedido.id, (p) => comEvento({ ...p, proposta: { ...p.proposta, aberturas: (p.proposta?.aberturas ?? 0) + 1, ultimaAbertura: agora() } },
    'abriu', { vez: (p.proposta?.aberturas ?? 0) + 1 }));
  return {
    situacao: 'aberta', codigo: d.proposta.codigo, jeito: 'modelo', cliente: pedido.nome, validaAte: d.proposta.validaAte, valor: d.proposta.valor,
    conteudo: d.proposta.conteudo, escritorio: escritorioDaAula(d), whatsappEscritorio: WHATSAPP_DO_ESCRITORIO, selo: true, aceite: null,
  };
}

// a regra de fábrica: o aceite leva para Aprovado, com o valor do pacote escolhido
export function aceiteNaAula(nome, pacote) {
  const d = ler();
  if (!d.proposta) return;
  const valor = d.proposta.conteudo?.pacotes?.find((k) => k.nome === pacote)?.valor ?? d.proposta.valor;
  mudarPedido(d.proposta.pedido, (p) => {
    const aceite = { nome, pacote, valor, em: agora() };
    const q = comEvento({ ...p, valor, proposta: { ...p.proposta, aceitaEm: agora() }, propostas: (p.propostas ?? []).map((x) => ({ ...x, aceite })) },
      'aceite', { nome, pacote });
    return irPara(q, 'aprovado', 'aceite');
  });
}

