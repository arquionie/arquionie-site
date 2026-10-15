// A gestão que veio do Palheta Flow (plano 18 do repositório do plugin; migração 20261015000000): preços, cupons,
// campanhas, versões, aulas e feedbacks. Cada função chama o banco, que confere de novo se é administrador; com ?amostra
// no servidor de desenvolvimento, tudo vem dos dados de exemplo abaixo, sem conta e sem banco.
import { supabase } from '@/lib/supabase';
import { AMOSTRA } from '@/lib/gestao';

export { AMOSTRA };

const agora = Date.now();
const dias = (n) => new Date(agora + n * 864e5).toISOString();
const minutos = (n) => new Date(agora + n * 6e4).toISOString();

// O banco responde { ok: false, motivo } nas recusas esperadas; erro de rede ou de permissão vira o mesmo formato.
async function rpc(nome, args) {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) return { ok: false, motivo: error.code === '42501' ? 'Só para os administradores.' : error.message, erro: true };
  return data;
}

export const reais = (v) => Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
// "2026-10-14" (só o dia, como nos manifestos) é lido como dia, não como meia-noite em Londres (que no Brasil vira o dia 13).
export const dia = (iso) => {
  if (!iso) return '—';
  const so = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return so ? `${so[3]}/${so[2]}/${so[1]}` : new Date(iso).toLocaleDateString('pt-BR');
};

// ------------------------------------------------------------------------------------------------ preços e cupons
const amostra = {
  precos: { parcela: 59, parcelas: 12, avista: 599, totalParcelado: 708, atualizadoEm: dias(-3) },
  cupons: [
    { id: 'c1', codigo: 'BLACK70', desconto: 70, expiraEm: dias(16), observacao: 'campanha de outubro', ativo: true, origem: 'arquionie', situacao: 'ativo', criadoEm: dias(-2) },
    { id: 'c2', codigo: 'PFPRO10', desconto: 10, expiraEm: null, observacao: 'cupom do grupo de suporte', ativo: true, origem: 'flow', situacao: 'ativo', criadoEm: dias(-80) },
    { id: 'c3', codigo: 'JOAO15', desconto: 15, expiraEm: dias(-5), observacao: 'só pro João (WhatsApp)', ativo: true, origem: 'flow', situacao: 'vencido', criadoEm: dias(-40) },
  ],
};

export async function lerPrecos() {
  if (AMOSTRA) return amostra.precos;
  const r = await rpc('gestao_precos');
  return r?.ok === false ? null : r;
}

export async function salvarPrecos(parcela, parcelas, avista) {
  if (AMOSTRA) return { ok: true, parcela, parcelas, avista, totalParcelado: parcela * parcelas };
  return rpc('gestao_precos_salvar', { p_parcela: parcela, p_parcelas: parcelas, p_avista: avista });
}

export async function lerCupons() {
  if (AMOSTRA) return amostra.cupons;
  const r = await rpc('gestao_cupons');
  return Array.isArray(r) ? r : [];
}

export async function criarCupom(codigo, desconto, expiraEm, observacao) {
  if (AMOSTRA) return { ok: true, codigo: codigo.toUpperCase() };
  return rpc('gestao_cupom_criar', { p_codigo: codigo, p_desconto: desconto, p_expira_em: expiraEm, p_observacao: observacao });
}

export const revogarCupom = (id) => (AMOSTRA ? { ok: true } : rpc('gestao_cupom_revogar', { p_id: id }));
export const reativarCupom = (id) => (AMOSTRA ? { ok: true } : rpc('gestao_cupom_reativar', { p_id: id }));
export const prorrogarCupom = (id, dias7 = 7) => (AMOSTRA ? { ok: true } : rpc('gestao_cupom_prorrogar', { p_id: id, p_dias: dias7 }));

// "PF" + 5 sinais sem 0/O nem 1/I, como o gerador do Flow.
export function gerarCodigo() {
  const sinais = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'PF';
  for (let i = 0; i < 5; i++) s += sinais[Math.floor(Math.random() * sinais.length)];
  return s;
}

// ------------------------------------------------------------------------------------------------ importar do Flow
export async function importarDadosFlow(dados, conferir) {
  if (AMOSTRA) {
    return conferir
      ? { previa: true, precos: !!dados.precos, cupons: dados.cupons?.length ?? 0, cadastros: dados.cadastros?.length ?? 0,
          descadastros: dados.descadastros?.length ?? 0, campanhas: dados.campanhas?.length ?? 0, aulas: dados.aulas?.length ?? 0,
          feedbacks: dados.feedbacks?.length ?? 0 }
      : { ok: true, importado: { precos: true, cupons: 1, cadastros: 397, descadastros: 12, campanhas: 2, envios: 790, aulas: 18, feedbacks: 38 } };
  }
  return rpc('gestao_importar_dados_flow', { p_dados: dados, p_conferir: conferir });
}

// ------------------------------------------------------------------------------------------------ campanhas
const nomes = ['Lucas Eduardo Marques Viana', 'Edison Helio Lopes dos Santos', 'José Adner Tavares', 'Sérgio Correia', 'William Ribeiro',
  'Lívia Fernandes', 'Elzineide Araujo', 'Alberto Belavista', 'Bruno Keller', 'Laine Macedo', 'Marina Reis', 'Paulo Henrique'];
const amostraDestinatarios = Array.from({ length: 403 }, (_, i) => {
  const nome = nomes[i % nomes.length] + (i >= nomes.length ? ` ${Math.floor(i / nomes.length) + 1}` : '');
  return {
    email: `${nome.split(' ')[0].toLowerCase()}${i}@exemplo.com.br`, nome,
    origem: i % 67 === 10 ? 'conta' : 'flow', desde: dias(-i / 3), jaRecebeu: i % 3 !== 0,
  };
});

const amostraCampanhas = [
  { id: 'k1', assunto: 'BLACK FRIDAY ANTECIPADA: Arquionie PRO com 70% OFF (só até 31/10)', mensagem: 'Olá, {nome}!', cupom: 'BLACK70', desconto: 70,
    oferta: { chamada: 'BLACK FRIDAY ANTECIPADA', de: 599, por: 179, parcelas: 12, parcela: 17.9, validoAte: '2026-10-31' },
    lote: 10, intervaloMin: 5, limiteDia: 80, status: 'enviando', origem: 'arquionie', criadaEm: dias(-1), proximoLoteEm: minutos(4),
    total: 396, enviados: 160, pendentes: 234, erros: 2 },
  { id: 'k2', assunto: 'Cupom PFPRO10: 10% off no Palheta Flow PRO', mensagem: 'Olá, {nome}!', cupom: 'PFPRO10', desconto: 10, oferta: null,
    lote: 10, intervaloMin: 5, limiteDia: 80, status: 'concluida', origem: 'flow', criadaEm: dias(-20), concluidaEm: dias(-17),
    total: 396, enviados: 396, pendentes: 0, erros: 0 },
];

export async function lerCampanhas() {
  if (AMOSTRA) return amostraCampanhas;
  const r = await rpc('gestao_campanhas');
  return Array.isArray(r) ? r : [];
}

export async function lerDestinatarios() {
  if (AMOSTRA) return amostraDestinatarios;
  const r = await rpc('gestao_destinatarios');
  return Array.isArray(r) ? r : [];
}

export async function criarCampanha(c) {
  if (AMOSTRA) return { ok: true, id: 'k3', naFila: c.destinatarios.length, pulados: 0 };
  return rpc('gestao_campanha_criar', {
    p_assunto: c.assunto, p_mensagem: c.mensagem, p_destinatarios: c.destinatarios, p_cupom: c.cupom || null,
    p_desconto: c.desconto || null, p_oferta: c.oferta, p_lote: c.lote, p_intervalo_min: c.intervaloMin, p_limite_dia: c.limiteDia,
  });
}

// TESTE PARA MIM: a função campanhas manda o mesmo e-mail só para quem está entrando (e confere que é administrador).
export async function testarCampanha(c) {
  if (AMOSTRA) return { ok: true, para: 'gestor@exemplo.com.br' };
  const { data, error } = await supabase.functions.invoke('campanhas', {
    body: { acao: 'teste', assunto: c.assunto, mensagem: c.mensagem, cupom: c.cupom || null, desconto: c.desconto || null, oferta: c.oferta },
  });
  if (error) return { ok: false, motivo: 'Não deu para mandar o teste agora. Tente de novo em instantes.' };
  return data;
}

export const pausarCampanha = (id) => (AMOSTRA ? { ok: true } : rpc('gestao_campanha_pausar', { p_id: id }));
export const retomarCampanha = (id) => (AMOSTRA ? { ok: true } : rpc('gestao_campanha_retomar', { p_id: id }));
export const cancelarCampanha = (id) => (AMOSTRA ? { ok: true } : rpc('gestao_campanha_cancelar', { p_id: id }));

// Os dois modelos prontos do Flow ("Nova versão" e "Promoção"), com o nome novo.
export const MODELOS = {
  versao: {
    assunto: 'Nova versão do Arquionie para Revit',
    mensagem: 'Olá, {nome}!\n\nSaiu uma versão nova do Arquionie para Revit (o antigo Palheta Flow), com melhorias nas ferramentas que você já usa.\n\nAbra o Revit: o aviso de atualização aparece no alto do painel.',
  },
  promocao: {
    assunto: 'Cupom {cupom}: {desconto}% off no Arquionie PRO',
    mensagem: 'Olá, {nome}!\n\nPor tempo limitado, o Arquionie PRO (programa e plugin do Revit) sai com **{desconto}% de desconto** com o cupom {cupom}.\n\nÉ só chamar no WhatsApp pelo botão abaixo.',
  },
};

// ------------------------------------------------------------------------------------------------ versões e aulas
// Os manifestos que dizem o que está no ar. O do programa vem do R2; os do plugin, durante a convivência, ainda são os
// antigos (Supabase do escritório), até a atualização assinada da Etapa 5 do plano 17.
const MANIFESTOS = [
  { id: 'programa', nome: 'PROGRAMA', canal: 'canal estável', url: 'https://baixar.arquionie.com.br/estavel/versao.json', ler: (m) => ({ versao: m.versao, data: m.data ?? m.publicadoEm }) },
  { id: 'plugin-clientes', nome: 'PLUGIN · CLIENTES', canal: 'manifesto antigo (até o canal revit-estável)', url: 'https://khisoybksdpjdztalmrs.supabase.co/storage/v1/object/public/project-assets/downloads/palheta-flow-externo-latest.json', ler: (m) => ({ versao: m.version, data: m.date }) },
  { id: 'plugin-equipe', nome: 'PLUGIN · EQUIPE', canal: 'manifesto antigo (até o canal revit-escritório)', url: 'https://khisoybksdpjdztalmrs.supabase.co/storage/v1/object/public/project-assets/downloads/palheta-flow-latest.json', ler: (m) => ({ versao: m.version, data: m.date }) },
];

export async function lerVersoes() {
  if (AMOSTRA) {
    return MANIFESTOS.map((m, i) => ({ ...m, versao: ['1.8.2', '4.45.0', '4.47.0'][i], data: dias(-i) }));
  }
  return Promise.all(MANIFESTOS.map(async (m) => {
    try {
      const r = await fetch(`${m.url}?t=${Date.now()}`, { cache: 'no-cache' });
      if (!r.ok) return { ...m, versao: null };
      return { ...m, ...m.ler(await r.json()) };
    } catch {
      return { ...m, versao: null };
    }
  }));
}

// Computadores do plugin por versão (já vem na lista de licenças).
export async function lerVersoesDoPlugin() {
  if (AMOSTRA) return { '4.47.0': 4, '4.45.0': 31, '4.44.0': 9 };
  const { data } = await supabase.rpc('gestao_licencas');
  return data?.versoes ?? {};
}

const amostraAulas = [
  { id: 'a1', titulo: 'CRIAR PISO', youtubeId: 'abc123XYZ_-', duracao: '4:10', descricao: 'O piso pelo contorno do ambiente', posicao: 0, comando: 'CmdPiso' },
  { id: 'a2', titulo: 'COLOCAR PORTA', youtubeId: 'porta123456', duracao: '3:02', descricao: '', posicao: 1, comando: 'CmdPorta' },
  { id: 'a3', titulo: 'CRIAR TELHADO', youtubeId: 'telhado1234', duracao: '6:45', descricao: '', posicao: 2, comando: null },
];

export async function lerAulas() {
  if (AMOSTRA) return amostraAulas;
  const r = await rpc('gestao_aulas');
  return Array.isArray(r) ? r : [];
}

// Aceita o link inteiro do YouTube (youtu.be/…, watch?v=…, shorts/…) ou só o código.
export function codigoDoYoutube(texto) {
  const t = String(texto ?? '').trim();
  const m = t.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : t;
}

export async function salvarAula(a) {
  if (AMOSTRA) return { ok: true, id: a.id ?? 'nova' };
  return rpc('gestao_aula_salvar', {
    p_id: a.id ?? null, p_titulo: a.titulo, p_youtube_id: codigoDoYoutube(a.youtube), p_duracao: a.duracao || null,
    p_descricao: a.descricao || null, p_comando: a.comando || null, p_miniatura_url: a.miniaturaUrl || null,
  });
}

export const apagarAula = (id) => (AMOSTRA ? { ok: true } : rpc('gestao_aula_apagar', { p_id: id }));
export const ordenarAulas = (ids) => (AMOSTRA ? { ok: true } : rpc('gestao_aulas_ordenar', { p_ids: ids }));

// ------------------------------------------------------------------------------------------------ feedbacks
const amostraFeedbacks = {
  novos: 3,
  feedbacks: [
    { id: 'f1', email: 'ana@exemplo.com.br', edicao: 'interno', versao: '4.47.0', categoria: 'sugestao', nota: 10, mensagem: 'A tela de entrada ficou ótima. Dava para lembrar o último e-mail usado?', status: 'novo', origem: 'arquionie', criadoEm: minutos(-180) },
    { id: 'f2', email: 'arq.britoliveira@exemplo.com.br', edicao: 'externo', versao: '4.45.0', categoria: 'problema', nota: 6, mensagem: 'O CRIAR PISO não pegou o ambiente com pilar no meio.', status: 'novo', origem: 'arquionie', criadoEm: dias(-1) },
    { id: 'f3', email: null, edicao: 'externo', versao: '4.45.0', categoria: 'problema', nota: null, mensagem: 'O painel demorou para abrir hoje cedo.', status: 'novo', origem: 'arquionie', criadoEm: dias(-2) },
    { id: 'f4', email: 'lucas@exemplo.com.br', edicao: 'externo', versao: '4.44.0', categoria: 'elogio', nota: 10, mensagem: 'Muito bom!', status: 'lido', origem: 'flow', criadoEm: dias(-4) },
  ],
};

export async function lerFeedbacks() {
  if (AMOSTRA) return amostraFeedbacks;
  const r = await rpc('gestao_feedbacks');
  return r?.ok === false ? { novos: 0, feedbacks: [], erro: r.motivo } : r;
}

export const marcarFeedback = (id, status) => (AMOSTRA ? { ok: true } : rpc('gestao_feedback_marcar', { p_id: id, p_status: status }));

export const EDICOES = { interno: 'EQUIPE', externo: 'CLIENTES' };
export const CATEGORIAS = { sugestao: 'sugestão', problema: 'problema', elogio: 'elogio', duvida: 'dúvida' };
