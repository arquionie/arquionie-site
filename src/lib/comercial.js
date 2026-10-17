// O COMERCIAL, o CRM grátis (migração 20261017000000_comercial.sql; mockup docs/mockups/crm-gratis e contrato no doc 72 do repositório
// do programa, aprovados por ÊDI em 16/10/2026): as chamadas ao banco e à função comercial, a conta do orçamento, as cores do
// escritório nas páginas do cliente e os dados de amostra para conferir as telas com ?amostra no servidor de desenvolvimento.
import { supabase } from '@/lib/supabase';
import { SUPABASE_URL, SUPABASE_CHAVE_PUBLICAVEL } from '@/config';

export const AMOSTRA = import.meta.env.DEV && new URLSearchParams(window.location.search).has('amostra');

/** Chama uma função do banco; o erro vira exceção com a mensagem do banco. */
export async function rpc(nome, args = {}) {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw error;
  return data;
}

/** Chama a função comercial do servidor (o pedido do formulário público e a subida do PDF). */
export async function funcao(corpo) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const r = await fetch(`${SUPABASE_URL}/functions/v1/comercial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_CHAVE_PUBLICAVEL, Authorization: `Bearer ${token ?? SUPABASE_CHAVE_PUBLICAVEL}` },
    body: JSON.stringify(corpo),
  });
  if (!r.ok && r.status >= 500) throw new Error('O servidor não respondeu. Tente de novo em instantes.');
  return r.json();
}

// ------------------------------------------------------------------------------------------------ textos e números
export const reais = (v, centavos = false) =>
  v === null || v === undefined || v === ''
    ? '—'
    : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: centavos ? 2 : 0, maximumFractionDigits: centavos ? 2 : 0 });

/** "R$ 168 mil" para as somas das colunas. */
export function reaisCurtos(v) {
  const n = Number(v ?? 0);
  if (n >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (n >= 1e3) return `R$ ${Math.round(n / 1e3).toLocaleString('pt-BR')} mil`;
  return reais(n);
}

export const diasDesde = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 864e5));
export const dataCurta = (iso) => (iso ? new Date(iso + (String(iso).length === 10 ? 'T12:00' : '')).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');
export const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
// "2027-03" vira "março de 2027"; o que não for mês e ano volta como veio.
export const mesAno = (v) => (/^\d{4}-\d{2}$/.test(v ?? '')
  ? new Date(`${v}-15T12:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : v ?? '');
// O dia de hoje no relógio de quem usa (o toISOString é UTC: depois das 21h de Brasília, já seria amanhã).
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const hojeISO = () => isoLocal(new Date());

/** "hoje", "ontem", "há 3 dias". */
export function quandoChegou(iso) {
  const d = diasDesde(iso);
  return d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

export const linkWhatsApp = (numero, texto) => `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;

/** A etiqueta mais urgente do card (só uma, ÊDI 16/10/2026): retorno, parado, abriu, aceita, reunião ou o motivo da recusa. */
export function etiquetaDoPedido(p, etapa) {
  const hoje = hojeISO();
  if (etapa?.tipo === 'ganho') return p.proposta?.aceitaEm ? { texto: 'Aceita', tipo: 'sucesso' } : { texto: 'Aprovado', tipo: 'sucesso' };
  if (etapa?.tipo === 'perdido') return p.motivo ? { texto: p.motivo, tipo: 'neutra' } : null;
  if (p.retorno && p.retorno <= hoje) return { texto: p.retorno === hoje ? 'Retorno hoje' : 'Retorno vencido', tipo: 'urgente' };
  if (etapa?.aviso && diasDesde(p.etapaDesde) > etapa.aviso) return { texto: `Parado ${diasDesde(p.etapaDesde)} dias`, tipo: 'neutra' };
  if (p.proposta?.aberturas > 0 && !p.proposta.aceitaEm) return { texto: `Abriu ${p.proposta.aberturas} ${p.proposta.aberturas === 1 ? 'vez' : 'vezes'}`, tipo: 'informacao' };
  if (p.reuniao && new Date(p.reuniao) > new Date()) return { texto: new Date(p.reuniao).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }), tipo: 'neutra' };
  if (p.retorno) return { texto: dataCurta(p.retorno), tipo: 'neutra' };
  return null;
}

// ------------------------------------------------------------------------------------------------ o orçamento (a ficha do sistema Palheta)
const PACOTES = [['completo', 'Completo', 1], ['intermediario', 'Intermediário', null], ['basico', 'Básico', null]];

/** A conta do orçamento: obra = área × R$/m²; o COMPLETO = obra × honorários; os outros pacotes pela porcentagem do completo. */
export function calcularOrcamento(o, precos) {
  const area = Number(o.area ?? 0), m2 = Number(o.m2 ?? 0), honorarios = Number(o.honorarios ?? precos?.honorarios ?? 5);
  const obra = area * m2;
  const completo = Math.round((obra * honorarios) / 100);
  const fatores = { completo: 1, intermediario: Number(precos?.intermediario ?? 70) / 100, basico: Number(precos?.basico ?? 50) / 100 };
  const pacotes = PACOTES.map(([id, nome]) => ({ id, nome, valor: Math.round(completo * fatores[id]) }));
  const escolhido = pacotes.find((p) => p.id === (o.escolhido ?? 'completo')) ?? pacotes[0];
  const entradaPct = Number(o.entrada ?? precos?.entrada ?? 30), parcelas = Number(o.parcelas ?? precos?.parcelas ?? 7);
  const desconto = Number(o.desconto ?? precos?.desconto ?? 10);
  const entrada = Math.round((escolhido.valor * entradaPct) / 100);
  return {
    obra, pacotes, escolhido, entrada, entradaPct, parcelas, desconto,
    parcela: parcelas > 0 ? Math.round((escolhido.valor - entrada) / parcelas) : 0,
    avista: Math.round(escolhido.valor * (1 - desconto / 100)),
  };
}

/** O que cada pacote inclui, pelo escopo dos preços ("desde" o pacote mais simples que já inclui). */
export function escopoDoPacote(escopo, pacote) {
  const ordem = { basico: 0, intermediario: 1, completo: 2 };
  return (escopo ?? []).filter((e) => ordem[e.desde] <= ordem[pacote]).map((e) => e.item);
}

/** O conteúdo da proposta no modelo do Arquionie, tirado do orçamento. */
export function conteudoDaProposta(pedido, orcamento, precos) {
  const c = calcularOrcamento(orcamento, precos);
  const projeto = [orcamento.nome || pedido.tipo, orcamento.area ? `${Number(orcamento.area).toLocaleString('pt-BR')} m²` : '', pedido.cidade]
    .filter(Boolean).join(' · ');
  const pacotes = (orcamento.pacotesNaProposta ?? 'todos') === 'um' ? [c.escolhido] : c.pacotes;
  return {
    projeto,
    pacotes: pacotes.map((p) => ({ nome: p.nome, valor: p.valor, inclui: escopoDoPacote(precos?.escopo, p.id) })),
    pagamento: { entrada: c.entradaPct, parcelas: c.parcelas, desconto: c.desconto },
  };
}

// ------------------------------------------------------------------------------------------------ as cores do escritório (páginas do cliente)
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luz = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const misturar = (hex, com, quanto) => '#' + rgb(hex).map((c, i) => Math.round(c + (rgb(com)[i] - c) * quanto).toString(16).padStart(2, '0')).join('');

/** As variáveis que trocam a terracota pela cor do escritório nas páginas do cliente: o botão nível 1, o destaque e o tom suave.
 * O texto do botão fica branco ou escuro, o que tiver mais contraste com a cor. */
export function coresDoEscritorio(cor) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(cor ?? '')) return {};
  const escuraDemais = luz(cor) > 0.35;
  const destaque = escuraDemais ? misturar(cor, '#000000', 0.35) : cor;
  return {
    '--botao-1': cor,
    '--botao-1-texto': escuraDemais ? 'var(--amg-texto)' : 'var(--amg-botao-1-texto)',
    '--destaque': destaque,
    '--amg-destaque': destaque,
    '--amg-destaque-suave': misturar(cor, '#FFFFFF', 0.86),
    '--destaque-texto': misturar(destaque, '#000000', 0.25),
    '--amg-destaque-texto': misturar(destaque, '#000000', 0.25),
  };
}

// ------------------------------------------------------------------------------------------------ os tipos de pergunta (o criador)
export const TIPOS_DE_PERGUNTA = [
  ['texto-curto', 'Texto curto'], ['texto-longo', 'Texto longo'], ['escolha', 'Escolha única'], ['multipla', 'Múltipla escolha'],
  ['lista', 'Lista'], ['data', 'Data'], ['mes-ano', 'Mês e ano'], ['numero', 'Número'], ['area', 'Área em m²'], ['valor', 'Valor'],
  ['faixa', 'Faixa de valor'], ['contato', 'Contato'], ['cidade', 'Cidade e UF'], ['link', 'Link'], ['nota', 'Nota de 1 a 5'],
  ['secao', 'Título de seção'],
];
export const COM_OPCOES = ['escolha', 'multipla', 'lista', 'faixa'];
export const CHAVES = [['', 'Nenhum'], ['tipo', 'Tipo do projeto'], ['cidade', 'Cidade'], ['area', 'Área'], ['obra', 'Investimento'],
  ['inicio', 'Início'], ['origem', 'Origem'], ['nome', 'Nome'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail']];
export const nomeDoTipo = (t) => (TIPOS_DE_PERGUNTA.find(([id]) => id === t) ?? [t, t === 'privacidade' ? 'Aceite · sempre no fim' : t])[1];

// ------------------------------------------------------------------------------------------------ a amostra (?amostra)
const dias = (n) => new Date(Date.now() - n * 864e5).toISOString();
const emDias = (n) => isoLocal(new Date(Date.now() + n * 864e5));

export const AMOSTRA_ETAPAS = [
  { id: 'solicitacao', nome: 'Solicitação', cor: '#8E8A86', tipo: 'andamento', aviso: 2 },
  { id: 'contato', nome: 'Em contato', cor: '#4F7BD8', tipo: 'andamento', aviso: 14 },
  { id: 'reuniao', nome: 'Reunião', cor: '#8E6CCB', tipo: 'andamento', aviso: 7 },
  { id: 'retorno', nome: 'Retorno', cor: '#D2952A', tipo: 'andamento', aviso: null, pelaData: true },
  { id: 'aprovado', nome: 'Aprovado', cor: '#3E9A63', tipo: 'ganho', aviso: null },
  { id: 'recusado', nome: 'Recusado', cor: '#C25B5B', tipo: 'perdido', aviso: null },
];

export const AMOSTRA_PRECOS = {
  m2: { 'Construção do zero': 3500, Reforma: 2200, Interiores: 1800, Regularização: 1200, Comercial: 3000 },
  honorarios: 5, intermediario: 70, basico: 50, entrada: 30, parcelas: 7, desconto: 10, validadeDias: 30,
  escopo: [
    { item: 'Levantamento e programa', desde: 'basico' }, { item: 'Estudo preliminar com 3D', desde: 'basico' },
    { item: 'Projeto legal para a prefeitura', desde: 'intermediario' }, { item: 'Projeto executivo', desde: 'completo' },
    { item: '4 visitas à obra', desde: 'completo' },
  ],
};

const pedidoDeAmostra = (numero, nome, etapa, extra = {}) => ({
  id: `a${String(numero).padStart(7, '0')}-0000-4000-8000-000000000000`, numero, nome, etapa, whatsapp: '5515998765432',
  etapaDesde: dias(extra.parado ?? 1), criadoEm: dias(extra.chegou ?? 3), tipo: 'Construir do zero', cidade: 'Sorocaba/SP', area: null,
  obra: '', origem: 'Instagram', valor: null, nota: null, retorno: null, reuniao: null, motivo: '', proposta: null, ...extra,
});

export const AMOSTRA_PEDIDOS = [
  pedidoDeAmostra(12, 'Ana Beatriz Rocha', 'solicitacao', { cidade: 'Itu/SP', chegou: 0, parado: 0 }),
  pedidoDeAmostra(11, 'Pedro Henrique Alves', 'solicitacao', { tipo: 'Interiores', chegou: 1, parado: 1, origem: 'Indicação' }),
  pedidoDeAmostra(10, 'Condomínio Vila Verde', 'solicitacao', { tipo: 'Regularizar na prefeitura', cidade: 'Votorantim/SP', chegou: 2, parado: 2, origem: 'Google' }),
  pedidoDeAmostra(9, 'Rafael Nunes', 'contato', { tipo: 'Reformar', valor: 18000, parado: 16, chegou: 18, origem: 'Indicação' }),
  pedidoDeAmostra(8, 'Luana Martins', 'contato', { tipo: 'Construir do zero', cidade: 'Ibiúna/SP', valor: 52000, parado: 3 }),
  pedidoDeAmostra(7, 'Carlos e Júlia Ferraz', 'reuniao', { valor: 30000, reuniao: new Date(Date.now() + 2 * 864e5).toISOString() }),
  pedidoDeAmostra(6, 'Mariana Costa', 'retorno', { area: 180, obra: 'R$ 500 mil a R$ 800 mil', valor: 31500, retorno: emDias(0), chegou: 15, parado: 8,
    proposta: { aberturas: 2, ultimaAbertura: dias(0.5), aceitaEm: null, enviadaEm: dias(8) }, nota: 4 }),
  pedidoDeAmostra(5, 'Clínica Bem Estar', 'retorno', { tipo: 'Comercial', valor: 28000, retorno: emDias(4), origem: 'Google',
    proposta: { aberturas: 3, ultimaAbertura: dias(0.2), aceitaEm: null, enviadaEm: dias(5) } }),
  pedidoDeAmostra(4, 'Thiago Prado', 'retorno', { tipo: 'Construir do zero', cidade: 'Salto/SP', valor: 34000, retorno: emDias(8) }),
  pedidoDeAmostra(3, 'Gustavo Lemos', 'aprovado', { cidade: 'Itu/SP', valor: 31000, proposta: { aberturas: 4, aceitaEm: dias(6) } }),
  pedidoDeAmostra(2, 'Moura Advogados', 'aprovado', { tipo: 'Interiores', valor: 19000, proposta: { aberturas: 2, aceitaEm: dias(14) } }),
  pedidoDeAmostra(1, 'Marcos Vieira', 'recusado', { cidade: 'Salto/SP', valor: 26000, motivo: 'Preço' }),
];

export const AMOSTRA_PERGUNTAS = [
  { id: 'objetivo', tipo: 'escolha', texto: 'O que você quer fazer?', obrigatoria: true, chave: 'tipo', noCard: true,
    opcoes: [{ texto: 'Construir do zero' }, { texto: 'Reformar' }, { texto: 'Interiores' }, { texto: 'Regularizar na prefeitura' }, { texto: 'Outro' }] },
  { id: 'terreno', tipo: 'escolha', texto: 'Você já tem o terreno ou o imóvel?', obrigatoria: true, opcoes: [{ texto: 'Sim' }, { texto: 'Ainda não' }] },
  { id: 'area', tipo: 'area', texto: 'Qual a área aproximada?', obrigatoria: false, chave: 'area', noCard: true },
  { id: 'cidade', tipo: 'cidade', texto: 'Onde fica?', obrigatoria: true, chave: 'cidade', noCard: true },
  { id: 'investimento', tipo: 'faixa', texto: 'Quanto pretende investir na obra?', ajuda: 'Um valor aproximado já ajuda.', obrigatoria: true, chave: 'obra',
    noCard: true, mostrarSe: { pergunta: 'objetivo', respostas: ['Construir do zero', 'Reformar'] },
    opcoes: [{ texto: 'Até R$ 300 mil' }, { texto: 'R$ 300 mil a R$ 500 mil' }, { texto: 'R$ 500 mil a R$ 800 mil' }, { texto: 'Acima de R$ 800 mil' }, { texto: 'Ainda não sei' }] },
  { id: 'inicio', tipo: 'mes-ano', texto: 'Quando quer começar?', obrigatoria: false, chave: 'inicio' },
  { id: 'decide', tipo: 'escolha', texto: 'Quem decide sobre o projeto?', obrigatoria: false, opcoes: [{ texto: 'Eu' }, { texto: 'Eu e outra pessoa' }, { texto: 'Outra pessoa' }] },
  { id: 'referencias', tipo: 'link', texto: 'Tem referências?', ajuda: 'Um link do Pinterest ou do Instagram.', obrigatoria: false },
  { id: 'origem', tipo: 'escolha', texto: 'Como nos conheceu?', obrigatoria: false, chave: 'origem', opcoes: [{ texto: 'Instagram' }, { texto: 'Indicação' }, { texto: 'Google' }, { texto: 'Outro' }] },
  { id: 'dados', tipo: 'contato', texto: 'Para falarmos com você', obrigatoria: true },
  { id: 'privacidade', tipo: 'privacidade', texto: 'Privacidade', obrigatoria: true },
];

export const AMOSTRA_ESTADO = {
  novo: false, escritorio: 'Lima Arquitetura', responsavel: true, pro: false, selo: true,
  periodo: { de: `${new Date().getFullYear()}-01-01`, ate: `${new Date().getFullYear()}-12-31` },
  ajustes: {
    modelo: 'arquitetura', whatsapp: '551532228800', etapas: AMOSTRA_ETAPAS, precos: AMOSTRA_PRECOS,
    regras: { whatsapp: { liga: true, de: 'solicitacao', para: 'contato' }, proposta: { liga: true, para: 'retorno' }, reuniao: { liga: true, para: 'reuniao' },
      aceite: { liga: true, para: 'aprovado' }, parado: { liga: false, para: 'recusado', motivo: 'Sem resposta' } },
    mensagens: { primeiroContato: 'Olá, {nome}! Aqui é {pessoa}, da {escritorio}. Recebi o seu pedido de projeto. Podemos conversar?',
      proposta: 'Olá, {nome}! Segue a sua proposta da {escritorio}: {link} {retorno}', retorno: 'Ficou combinado de você me dar um retorno no dia {data}. Vou te ligar.' },
    motivos: ['Sem resposta', 'Fora do perfil', 'Preço', 'Prazo', 'Escolheu outro', 'Desistiu da obra', 'Outro'],
  },
  formularios: [{ id: 'f0000000-0000-4000-8000-000000000001', codigo: 'LIMA-CASA', nome: 'Casa e reforma', ativo: true, pausadoPeloGestor: false, versao: 2,
    perguntas: AMOSTRA_PERGUNTAS, respostasNoMes: 31,
    desvio: { titulo: 'Obrigada pelo interesse!', texto: 'Começamos os projetos quando o terreno ou o imóvel já está definido. Quando tiver o seu, preencha de novo: vamos adorar conversar.' } }],
  indicadores: { pedidos: 12, emAndamento: 9, ganhos: 2, conversao: 17, ticketMedio: 25000, valorGanho: 50000, emNegociacao: 193500 },
  pedidos: AMOSTRA_PEDIDOS,
};
AMOSTRA_ESTADO.hoje = [
  { motivo: 'retorno', em: emDias(0), pedido: AMOSTRA_PEDIDOS[6] },
  { motivo: 'parado', dias: 16, pedido: AMOSTRA_PEDIDOS[3] },
  { motivo: 'abriu', aberturas: 3, pedido: AMOSTRA_PEDIDOS[7] },
];

export const AMOSTRA_ORCAMENTO = { nome: 'Casa térrea', tipo: 'Construção do zero', area: 180, pavimentos: 1, m2: 3500, honorarios: 5, escolhido: 'completo' };

export function amostraDoPedido(p) {
  const mariana = p.numero === 6;
  return {
    ...p, email: mariana ? 'mariana.costa@gmail.com' : '', inicio: mariana ? '2027-03' : '', formulario: 'Casa e reforma',
    observacoes: mariana ? 'Terreno de esquina, 12 × 30 m. Quer a suíte voltada para o fundo.' : '', responsavel: 'Juliana Lima',
    orcamento: mariana ? AMOSTRA_ORCAMENTO : {},
    respostas: mariana ? [
      { id: 'objetivo', texto: 'O que você quer fazer?', tipo: 'escolha', valor: 'Construir do zero' },
      { id: 'terreno', texto: 'Você já tem o terreno ou o imóvel?', tipo: 'escolha', valor: 'Sim' },
      { id: 'area', texto: 'Qual a área aproximada?', tipo: 'area', valor: 180 },
      { id: 'cidade', texto: 'Onde fica?', tipo: 'cidade', valor: 'Sorocaba/SP' },
      { id: 'investimento', texto: 'Quanto pretende investir na obra?', tipo: 'faixa', valor: 'R$ 500 mil a R$ 800 mil' },
      { id: 'inicio', texto: 'Quando quer começar?', tipo: 'mes-ano', valor: '2027-03' },
      { id: 'dados', texto: 'Para falarmos com você', tipo: 'contato', valor: { nome: 'Mariana Costa', whatsapp: '5515998765432', email: 'mariana.costa@gmail.com' } },
    ] : [],
    propostas: mariana ? [{ id: 'p1', codigo: 'QX7M2KAB', jeito: 'modelo', enviadaEm: dias(8), enviadaPor: 'Juliana Lima', aberturas: 2, ultimaAbertura: dias(0.5),
      valor: 31500, validaAte: emDias(22), aceite: null }] : [],
    linhaDoTempo: [
      ...(mariana ? [
        { tipo: 'abriu', dados: { vez: 2 }, em: dias(0.5) },
        { tipo: 'proposta', dados: { jeito: 'modelo' }, em: dias(8), por: 'Juliana Lima' },
        { tipo: 'etapa', dados: { de: 'reuniao', para: 'retorno', porque: 'proposta' }, em: dias(8), por: 'Juliana Lima' },
        { tipo: 'reuniao', dados: { em: dias(10) }, em: dias(11), por: 'Juliana Lima' },
        { tipo: 'whatsapp', dados: {}, em: dias(13), por: 'Juliana Lima' },
      ] : []),
      { tipo: 'chegou', dados: { formulario: 'Casa e reforma', origem: p.origem }, em: p.criadoEm },
    ],
  };
}

export const AMOSTRA_FORMULARIO_PUBLICO = {
  situacao: 'aberto', codigo: 'LIMA-CASA', nome: 'Casa e reforma', versao: 2, perguntas: AMOSTRA_PERGUNTAS, desvio: AMOSTRA_ESTADO.formularios[0].desvio,
  escritorio: { nome: 'Lima Arquitetura', cor: '#2F7D6D', logo: null }, whatsappEscritorio: '551532228800', selo: true,
};

export const AMOSTRA_PROPOSTA_PUBLICA = {
  situacao: 'aberta', codigo: 'QX7M2KAB', jeito: 'modelo', cliente: 'Mariana Costa', validaAte: emDias(22), valor: 31500,
  conteudo: conteudoDaProposta(AMOSTRA_PEDIDOS[6], AMOSTRA_ORCAMENTO, AMOSTRA_PRECOS),
  escritorio: { nome: 'Lima Arquitetura', cor: '#2F7D6D', logo: null }, whatsappEscritorio: '551532228800', selo: true, aceite: null,
};

// ------------------------------------------------------------------------------------------------ o /gestao (a aba Comercial)
// Os números do CRM em todos os escritórios e os formulários denunciados, com PAUSAR e RETOMAR. Só os administradores; o banco confere.
export const AMOSTRA_GESTAO = {
  escritorios: 214, pedidos: 3870, pedidosNoMes: 412, propostas: 1265, aceitas: 318,
  denunciados: [
    { id: 'd1', codigo: 'GANHE-PIX', nome: 'Cadastro premiado', escritorio: 'Studio Prêmio', denuncias: 4, pausado: false,
      motivos: ['Pede o número do cartão e a senha do banco.', 'Não é um escritório: promete prêmio em dinheiro.', 'Golpe.', 'Golpe do Pix.'] },
    { id: 'd2', codigo: 'LIMA-CASA', nome: 'Casa e reforma', escritorio: 'Lima Arquitetura', denuncias: 1, pausado: false,
      motivos: ['Recebi mensagem deles sem ter pedido nada.'] },
    { id: 'd3', codigo: 'OBRA-JA', nome: 'Orçamento de obra', escritorio: 'Obra Já Engenharia', denuncias: 2, pausado: true,
      motivos: ['Usa a logo de outra empresa.', 'Copiou o formulário de um concorrente.'] },
  ],
};

export async function lerGestaoComercial() {
  if (AMOSTRA) return structuredClone(AMOSTRA_GESTAO);
  return rpc('gestao_comercial');
}

/** PAUSAR (pausar = true) ou RETOMAR um formulário denunciado; pausado, o /f/CÓDIGO não abre nem recebe pedidos. */
export async function pausarFormulario(id, pausar) {
  if (AMOSTRA) return { ok: true };
  return rpc('gestao_comercial_pausar', { p_formulario: id, p_pausar: pausar });
}
