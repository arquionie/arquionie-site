// Licenças por produto e conexão de computadores pelo navegador (migração 20261005010000; plano 17 do repositório do
// plugin). Aqui ficam os nomes que a pessoa lê, os textos prontos e os dados de amostra para conferir as telas.

export const NOMES_PRODUTO = {
  arquionie: 'Arquionie™',
  'arquionie-revit': 'Arquionie™ para Revit',
};

export const nomeProduto = (produto) => NOMES_PRODUTO[produto] ?? produto;

export const PLANOS = { pro: 'PRO', equipe: 'EQUIPE', gratis: 'GRÁTIS' };

export const dataCurta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

const diasAte = (iso) => Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 864e5));

// A situação que o banco calcula (licenca_situacao), no texto do selo.
export function rotuloSituacao(situacao, expiraEm) {
  switch (situacao) {
    case 'ativa':
      return `ATIVA ATÉ ${dataCurta(expiraEm)}`;
    case 'vencendo':
      return `VENCE EM ${diasAte(expiraEm)} ${diasAte(expiraEm) === 1 ? 'DIA' : 'DIAS'}`;
    case 'esperando a conta':
      return 'ESPERANDO A CONTA';
    case 'sem titular':
      return 'SEM TITULAR';
    case 'vencida':
      return 'VENCIDA';
    case 'revogada':
      return 'REVOGADA';
    default:
      return String(situacao ?? '').toUpperCase();
  }
}

// O convite que o dono manda ao colega depois de PASSAR PARA UM COLEGA.
export function textoConvite({ quemPassou, email, produto, expiraEm }) {
  return (
    `${quemPassou ? `${quemPassou} passou para você` : 'Você recebeu'} uma licença do ${nomeProduto(produto)}, ` +
    `válida até ${dataCurta(expiraEm)}.\n` +
    `1) Crie sua conta em arquionie.com.br com este e-mail: ${email} (se já tem conta, é só entrar).\n` +
    `2) No ${produto === 'arquionie-revit' ? 'Revit' : 'programa'}, clique ENTRAR COM A CONTA ARQUIONIE.`
  );
}

// A mensagem do WhatsApp que o gestor manda depois de LIBERAR (ou a qualquer momento, pela lista).
export function textoWhatsApp({ email, produto, quantidade = 1, expiraEm }) {
  let t =
    `Olá! Sua licença do ${nomeProduto(produto)} está liberada até ${dataCurta(expiraEm)}.\n` +
    `1) Crie sua conta em arquionie.com.br com este e-mail: ${email} (se já tem conta, é só entrar).\n` +
    `2) No ${produto === 'arquionie-revit' ? 'Revit' : 'programa'}, clique ENTRAR COM A CONTA ARQUIONIE.`;
  if (quantidade > 1) {
    t += `\nAs ${quantidade} licenças ficaram no seu e-mail: passe cada uma para quem vai usar em arquionie.com.br/conta.`;
  }
  return t + '\nQualquer dúvida, é só responder aqui.';
}

// Copiar para a área de transferência; sem permissão do navegador, devolve false e a tela mostra o texto selecionável.
export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export function baixarArquivo(conteudo, nome, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------------------------------------ amostra
// Só no servidor de desenvolvimento, com ?amostra na URL: as telas abrem com dados de exemplo, sem conta e sem tocar
// no banco (mesma ideia do ?amostra=1 do /gestao).
export const AMOSTRA = import.meta.env.DEV && new URLSearchParams(window.location.search).has('amostra');
export const estadoDaAmostra = () => new URLSearchParams(window.location.search).get('amostra') || '';

const daqui = (dias) => new Date(Date.now() + dias * 864e5).toISOString();

export const AMOSTRA_MINHAS_LICENCAS = {
  usa: [{ id: 'u1', produto: 'arquionie-revit', plano: 'pro', expiraEm: daqui(300), situacao: 'ativa', bonus: true, compradaPor: null }],
  comprou: [
    { id: 'c1', produto: 'arquionie-revit', plano: 'pro', expiraEm: daqui(300), titular: 'ana@exemplo.com.br', titularEhVoce: true, situacao: 'ativa', proximaTroca: null },
    { id: 'c2', produto: 'arquionie-revit', plano: 'pro', expiraEm: daqui(300), titular: 'bruno@exemplo.com.br', titularEhVoce: false, situacao: 'esperando a conta', proximaTroca: null },
    { id: 'c3', produto: 'arquionie-revit', plano: 'pro', expiraEm: daqui(300), titular: null, titularEhVoce: false, situacao: 'sem titular', proximaTroca: null },
  ],
};

export const AMOSTRA_COMPUTADORES = [
  { id: 'k1', produto: 'arquionie-revit', nome: 'ESCRITORIO-03', versao: '5.0.0', ultimo_acesso: daqui(-0.1) },
  { id: 'k2', produto: 'arquionie-revit', nome: 'NOTEBOOK-ANA', versao: '5.0.0', ultimo_acesso: daqui(-4) },
  { id: 'k3', produto: 'arquionie', nome: 'ESCRITORIO-03', versao: '0.1.2', ultimo_acesso: daqui(-0.2) },
];

export function amostraConexao(estado) {
  const base = {
    codigo: 'KMTR-4QPX', produto: 'arquionie-revit', computador: 'ESCRITORIO-03', expiraEm: daqui(0.006),
    limite: 3, plano: 'pro', licencaAte: daqui(300),
  };
  if (estado === 'limite') {
    return {
      ...base, situacao: 'limite', emUso: 3,
      computadores: [
        { id: 'k1', nome: 'NOTEBOOK-ANA', versao: '5.0.0', ultimo_acesso: daqui(-4) },
        { id: 'k2', nome: 'CASA-ANA', versao: '5.0.0', ultimo_acesso: daqui(-13) },
        { id: 'k3', nome: 'ESCRITORIO-01', versao: '5.0.0', ultimo_acesso: daqui(-0.3) },
      ],
    };
  }
  if (['vencida', 'cancelada', 'inexistente', 'autorizada'].includes(estado)) return { situacao: estado };
  return { ...base, situacao: 'aguardando', emUso: 1, computadores: [] };
}

export const AMOSTRA_GESTAO_LICENCAS = {
  resumo: { total: 6, ativas: 2, esperando: 1, semTitular: 1, vencendo: 1, vencidas: 0, revogadas: 1, importadasEsperando: 1 },
  versoes: { '5.0.0': 3, '4.42.0': 1 },
  ajustes: { limite_computadores: 3, dias_sem_internet: 30, dias_entre_trocas: 30, dias_de_bonus: 30, limite_testes: 3, fim_convivencia: null },
  licencas: [
    { id: 'g1', produto: 'arquionie-revit', plano: 'pro', dono: 'ana@exemplo.com.br', titular: 'ana@exemplo.com.br', situacao: 'ativa', expiraEm: daqui(340), origem: 'importada-flow', bonus: true, observacao: null, computadores: 2, criadaEm: daqui(-2) },
    { id: 'g2', produto: 'arquionie-revit', plano: 'pro', dono: 'ana@exemplo.com.br', titular: 'bruno@exemplo.com.br', situacao: 'esperando a conta', expiraEm: daqui(310), origem: 'importada-flow', bonus: false, observacao: null, computadores: 0, criadaEm: daqui(-2) },
    { id: 'g3', produto: 'arquionie-revit', plano: 'pro', dono: 'ana@exemplo.com.br', titular: null, situacao: 'sem titular', expiraEm: daqui(310), origem: 'importada-flow', bonus: false, observacao: null, computadores: 0, criadaEm: daqui(-2) },
    { id: 'g4', produto: 'arquionie-revit', plano: 'pro', dono: 'carlos@exemplo.com.br', titular: 'carlos@exemplo.com.br', situacao: 'vencendo', expiraEm: daqui(15), origem: 'whatsapp', bonus: false, observacao: 'pago por Pix', computadores: 1, criadaEm: daqui(-350) },
    { id: 'g5', produto: 'arquionie-revit', plano: 'equipe', dono: 'gestor@exemplo.com.br', titular: 'lucas@exemplo.com.br', situacao: 'ativa', expiraEm: daqui(450), origem: 'equipe', bonus: false, observacao: null, computadores: 1, criadaEm: daqui(-1) },
    { id: 'g6', produto: 'arquionie-revit', plano: 'pro', dono: 'diana@exemplo.com.br', titular: 'diana@exemplo.com.br', situacao: 'revogada', expiraEm: daqui(150), origem: 'whatsapp', bonus: false, observacao: 'estorno', computadores: 0, criadaEm: daqui(-200) },
  ],
};
