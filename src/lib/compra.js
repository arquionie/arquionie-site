import { supabase } from '@/lib/supabase';

// A compra do PRO pelo formulário /comprar (plano 19 do repositório do plugin, formulário v4 aprovado por ÊDI em 15/10/2026): o plano e
// o período vêm do cartão que a pessoa clicou (?produto=plugin|arquionie&periodo=mensal|anual&origem=…&cupom=…). O pedido grava com
// pedido_criar, que confere o cupom e calcula o valor no servidor; depois a venda segue no WhatsApp de vendas, com a mensagem pronta.

export const WHATSAPP_VENDAS = '5511991961580';

// Dados de exemplo, só no servidor de desenvolvimento com ?amostra (?amostra=falha finge que a gravação falhou).
const busca = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
export const AMOSTRA = import.meta.env.DEV && busca.has('amostra');
const AMOSTRA_FALHA = AMOSTRA && busca.get('amostra') === 'falha';

export const PRODUTOS = {
  plugin: { nome: 'Plugin PRO', descricao: 'Todas as ferramentas do plugin para Revit.' },
  arquionie: { nome: 'Arquionie™ PRO', descricao: 'O programa e o plugin PRO para Revit.' },
};
export const PERIODOS = ['mensal', 'anual'];
const ORIGENS = ['arquionie', 'revit', 'campanha', 'whatsapp'];

// Os preços de quando o build rodou; a página confere de novo em precos_vigentes() ao abrir.
export const PRECOS_PADRAO = {
  plugin: { mensal: 69, anual: 39, desconto: 43 },
  arquionie: { mensal: 119, anual: 79, desconto: 33 },
};

// O que veio no link. Sem produto, quem chega da página do plugin (o /pro/cadastro antigo do Flow) fica no plugin; o resto, no Arquionie.
export function lerEscolha(params) {
  const origem = ORIGENS.includes(params.get('origem')) ? params.get('origem') : null;
  const produto = PRODUTOS[params.get('produto')] ? params.get('produto') : origem === 'revit' ? 'plugin' : 'arquionie';
  const periodo = PERIODOS.includes(params.get('periodo')) ? params.get('periodo') : null;
  const cupom = (params.get('cupom') ?? '').trim().toUpperCase();
  return { produto, periodo, origem, cupom };
}

// "R$ 39" quando é inteiro, "R$ 11,70" quando tem centavos; o total sempre com os centavos ("R$ 468,00").
export const porMes = (v) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2, maximumFractionDigits: 2 })}`;
export const total = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// O que a pessoa paga, com o cupom valendo só no anual (a mesma conta do pedido_criar).
export function valores(precos, produto, periodo, desconto = 0) {
  const base = precos[produto][periodo];
  const d = periodo === 'anual' ? desconto : 0;
  const mes = Math.round(base * (100 - d)) / 100;
  return { base, mes, cobranca: periodo === 'anual' ? Math.round(mes * 1200) / 100 : mes, desconto: d };
}

export async function lerPrecos() {
  if (AMOSTRA) return PRECOS_PADRAO;
  const { data } = await supabase.rpc('precos_vigentes');
  const p = data?.planos;
  if (!p?.plugin?.mensal || !p?.arquionie?.mensal) return PRECOS_PADRAO;
  return {
    plugin: { mensal: p.plugin.mensal, anual: p.plugin.anual, desconto: p.plugin.desconto },
    arquionie: { mensal: p.arquionie.mensal, anual: p.arquionie.anual, desconto: p.arquionie.desconto },
  };
}

// { valido, codigo, desconto }. Na amostra, só o BLACK70 vale.
export async function conferirCupom(codigo) {
  if (AMOSTRA) return codigo === 'BLACK70' ? { valido: true, codigo, desconto: 70 } : { valido: false };
  const { data, error } = await supabase.rpc('cupom_conferir', { p_codigo: codigo });
  if (error || !data) return null;
  return data;
}

// Grava o pedido. Devolve a resposta do banco ({ ok, pedido, valorMes, valorCobranca, cupom, … }) ou null se não deu para gravar.
export async function criarPedido({ produto, periodo, nome, email, whatsapp, cupom, origem }) {
  if (AMOSTRA_FALHA) return null;
  if (AMOSTRA) {
    const desconto = periodo === 'anual' && cupom === 'BLACK70' ? 70 : 0;
    const v = valores(PRECOS_PADRAO, produto, periodo, desconto);
    return { ok: true, pedido: 'P-0008', valorMes: v.mes, valorCobranca: v.cobranca, cupom: desconto ? cupom : null, desconto };
  }
  try {
    const { data, error } = await supabase.rpc('pedido_criar', {
      p_produto: produto,
      p_periodo: periodo,
      p_nome: nome,
      p_email: email,
      p_whatsapp: whatsapp,
      p_cupom: cupom || null,
      p_origem: origem,
    });
    return !error && data?.ok ? data : null;
  } catch {
    return null;
  }
}

// A mensagem pronta do WhatsApp: "Olá! Quero assinar o Plugin PRO anual (R$ 39/mês, R$ 468,00 por 1 ano). Pedido P-0008 · nome · e-mail".
// Sem o número do pedido quando a gravação falhou: a venda nunca se perde por erro do banco.
export function mensagemDoWhatsapp({ produto, periodo, mes, cobranca, cupom, pedido, nome, email }) {
  const plano = `${PRODUTOS[produto].nome.replace('™', '')} ${periodo}${cupom ? ` com o cupom ${cupom}` : ''}`;
  const preco = periodo === 'anual' ? `${porMes(mes)}/mês, ${total(cobranca)} por 1 ano` : `${porMes(mes)}/mês`;
  const dados = [pedido && `Pedido ${pedido}`, nome.trim(), email.trim().toLowerCase()].filter(Boolean).join(' · ');
  return `Olá! Quero assinar o ${plano} (${preco}). ${dados}`;
}

export const linkDoWhatsapp = (texto) => `https://wa.me/${WHATSAPP_VENDAS}?text=${encodeURIComponent(texto)}`;

// O link de cada cartão do quadro de preço.
export const linkDeCompra = (produto, periodo, origem) => `/comprar?produto=${produto}&periodo=${periodo}&origem=${origem}`;
