import { useEffect, useState } from 'react';
import { Botao, Campo, Icone, Mensagem } from '@/components/Formulario';
import { Cabecalho, Selo } from '@/components/GestaoPecas';
import { Confirmacao, Escolha, Grupo, Vazio } from '@/components/Listas';
import GestaoPedidosDePlano from '@/components/GestaoPedidosDePlano';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { copiarTexto } from '@/lib/licencas';
import { whatsappLegivel } from '@/lib/equipe';
import {
  AMOSTRA, AMOSTRA_PEDIDOS, LINK_DO_FORMULARIO, ORIGENS_DO_PEDIDO, estaLiberado, linkDoWhatsappDe, nomeDoPlano, precisaDeVoce, seloDoPedido,
  textoDaCobranca, textoDaLiberacao, textoDoPagamento, valorDoPedido,
} from '@/lib/compra';

// /gestao › PEDIDOS (plano 19 do repositório do plugin, item 3.2, PEDIDOS v3 aprovado por ÊDI em 15/10/2026; no modo AMIGÁVEL do mockup
// gestao-amigavel, 16/10/2026): os pedidos de compra do PRO que chegam pelo arquionie.com.br/comprar, numa lista com colunas rotuladas
// (PEDIDO · CLIENTE · PLANO · VALOR · SITUAÇÃO). A linha abre o detalhe logo abaixo, um por vez: a régua das etapas, os dados e os botões
// da situação, o mais forte à direita. A aba abre em PRECISAM DE VOCÊ; o filtro EQUIPE mostra os pedidos de plano de equipe de antes.
// Todas as funções conferem no banco se quem chama é administrador (gestao_pedido_*); esta tela só mostra e pede.

const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const vezes = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const somar = (iso, periodo) => {
  const d = new Date(Math.max(Date.now(), new Date(iso ?? Date.now()).getTime()));
  if (periodo === 'anual') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
};

export function usePedidos() {
  const [dados, setDados] = useState(null);
  const carregar = async () => {
    if (AMOSTRA) return setDados((d) => d ?? AMOSTRA_PEDIDOS);
    const { data, error } = await supabase.rpc('gestao_pedidos');
    setDados(error ? { erro: error, pedidos: [] } : data);
  };
  useEffect(() => {
    carregar();
  }, []);
  return [dados, setDados, carregar];
}

// Quantos pedidos de compra precisam do gestor (a plaquinha da aba).
export const contarPrecisam = (dados) => (dados?.pedidos ?? []).filter(precisaDeVoce).length;

const FILTROS = {
  precisam: precisaDeVoce,
  liberados: estaLiberado,
  todos: () => true,
};

// PEDIDO RECEBIDO · PAGAMENTO · CONTA LIGADA, marcada até onde o pedido chegou.
function Regua({ p }) {
  const pago = !['aguardando', 'cancelado'].includes(p.situacao);
  const etapas = [
    ['Pedido recebido', true],
    ['Pagamento', pago],
    ['Conta ligada', pago && !!p.licenca?.ligada],
  ];
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5" aria-label="Etapas do pedido">
      {etapas.map(([nome, feito], i) => (
        <li key={nome} className="flex items-center gap-2">
          <span className={`grid size-6 place-items-center rounded-toque text-amg-rotulo ${
            feito ? 'bg-amg-sucesso-suave text-sucesso' : 'text-texto-apagado ring-1 ring-inset ring-linha'}`}>
            {feito ? <Icone nome="ok" tamanho={12} /> : i + 1}
          </span>
          <span className={`text-amg-legenda ${feito ? 'font-semibold' : 'text-texto-apagado'}`}>
            {nome}
            <span className="sr-only">{feito ? ', feito' : ', ainda não'}</span>
          </span>
          {i < etapas.length - 1 && <span className="h-px w-6 bg-linha sm:w-10" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

function Dado({ rotulo, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-amg-legenda text-texto-apagado">{rotulo}</dt>
      <dd className="break-words font-medium">{children}</dd>
    </div>
  );
}

function textoDaLicenca(p) {
  const l = p.licenca;
  if (!l) return p.situacao === 'aguardando' ? 'Sai quando o pagamento for confirmado' : '—';
  const ate = `${new Date(l.expiraEm) <= new Date() ? 'Venceu em' : 'Até'} ${dia(l.expiraEm)}`;
  if (!l.ligada) return `${ate} · esperando a conta`;
  const plugin = vezes(l.computadoresPlugin, 'computador', 'computadores');
  return p.produto === 'plugin'
    ? `${ate} · ${plugin} no plugin`
    : `${ate} · ${vezes(l.computadoresPrograma, 'computador', 'computadores')} no programa, ${plugin} no plugin`;
}

// Os botões da situação: lado a lado o mais forte à direita; em pilha no celular, ele em cima.
function Botoes({ children }) {
  return <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">{children}</div>;
}

// A pergunta neutra (liberar sem a chave), como a das licenças; o cancelar e o encerrar usam a Confirmacao.
function Pergunta({ children, voltar, acao, rotulo, ocupado }) {
  return (
    <div className="flex w-full flex-wrap items-center gap-3 rounded-dentro px-4 py-3 ring-1 ring-inset ring-linha">
      <span className="min-w-[min(100%,240px)] flex-1">{children}</span>
      <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
        <Botao type="button" onClick={voltar}>Voltar</Botao>
        <Botao principal type="button" disabled={ocupado} onClick={acao}>{rotulo}</Botao>
      </div>
    </div>
  );
}

function BotaoWhatsapp({ p, texto, nivel = 2, children = 'Abrir WhatsApp' }) {
  return (
    <Botao nivel={nivel} href={linkDoWhatsappDe(p.whatsapp, texto)} target="_blank" rel="noreferrer"
      aria-label={`${children}: ${p.nome}, ${whatsappLegivel(p.whatsapp)}`}>
      <Icone nome="balao" tamanho={14} />
      {children}
    </Botao>
  );
}

function Detalhe({ p, acoes }) {
  const { ocupado, pergunta, setPergunta, aviso, erro, chave, setChave, copiado } = acoes;
  const perguntando = pergunta?.id === p.id ? pergunta.tipo : null;
  const aguardando = p.situacao === 'aguardando';
  const renova = p.situacao === 'renovar' || p.situacao === 'vencido';
  const liberado = estaLiberado(p) || p.situacao === 'vencido';
  const campoDaChave = (aguardando || (liberado && !p.chavePlugin)) && (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="min-w-0 sm:max-w-[420px] sm:flex-1">
        <Campo rotulo="Chave do plugin" id={`chave-${p.id}`} valor={chave[p.id] ?? ''} aoMudar={(v) => setChave({ ...chave, [p.id]: v })}
          placeholder="PFPRO-…" autoComplete="off" spellCheck={false} />
      </div>
      {!aguardando && (
        <Botao type="button" disabled={ocupado || !(chave[p.id] ?? '').trim()} onClick={() => acoes.salvarChave(p)}>Salvar a chave</Botao>
      )}
    </div>
  );
  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-1">
      <Regua p={p} />
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Dado rotulo="WhatsApp">{whatsappLegivel(p.whatsapp)}</Dado>
        <Dado rotulo="Veio de">{ORIGENS_DO_PEDIDO[p.origem] ?? p.origem}</Dado>
        <Dado rotulo="Cupom">{p.cupom ? `${p.cupom} · ${p.desconto}% no anual` : 'Sem cupom'}</Dado>
        <Dado rotulo="Pedido em">{quando(p.criadoEm)}</Dado>
        <Dado rotulo="Licença">{textoDaLicenca(p)}</Dado>
        <Dado rotulo="E-mail">{p.email}</Dado>
        {p.chavePlugin && <Dado rotulo="Chave do plugin">{p.chavePlugin}</Dado>}
        {p.renovacoes > 0 && <Dado rotulo="Renovações">{`${p.renovacoes} · último pagamento em ${dia(p.ultimoPagamentoEm)}`}</Dado>}
        {p.encerradoEm && <Dado rotulo="Encerrado em">{dia(p.encerradoEm)}</Dado>}
      </dl>
      {campoDaChave && (
        <div className="flex flex-col gap-1.5">
          {campoDaChave}
          <p className="text-amg-legenda text-texto-apagado">
            A chave PFPRO- gerada no /admin antigo, para o plugin de hoje (até a versão nova, que entra pela conta). Ela vai na mensagem.
          </p>
        </div>
      )}
      <Mensagem>{aviso[p.id]}</Mensagem>
      <Mensagem erro>{erro[p.id]}</Mensagem>
      {perguntando === 'sem-chave' ? (
        <Pergunta voltar={() => setPergunta(null)} acao={() => acoes.liberar(p, true)} rotulo="Liberar sem a chave" ocupado={ocupado}>
          Liberar sem a chave do plugin? A mensagem vai sem ela; dá para colar a chave depois.
        </Pergunta>
      ) : perguntando === 'cancelar' ? (
        <Confirmacao voltar={() => setPergunta(null)} acao={() => acoes.cancelar(p)} rotulo="Cancelar o pedido" ocupado={ocupado}
          rotuloOcupado="Cancelando…">
          Cancelar o pedido {p.pedido}? Ele sai dos que precisam de você.
        </Confirmacao>
      ) : perguntando === 'encerrar' ? (
        <Confirmacao voltar={() => setPergunta(null)} acao={() => acoes.encerrar(p)} rotulo="Encerrar a assinatura" ocupado={ocupado}
          rotuloOcupado="Encerrando…">
          Encerrar a assinatura de {p.nome}? A licença vale até {dia(p.licenca?.expiraEm)} e depois a pessoa volta ao grátis.
        </Confirmacao>
      ) : aguardando ? (
        <Botoes>
          <Botao type="button" onClick={() => setPergunta({ id: p.id, tipo: 'cancelar' })}>Cancelar</Botao>
          <BotaoWhatsapp p={p} texto={textoDoPagamento(p)} />
          <Botao principal type="button" disabled={ocupado} onClick={() => acoes.liberar(p)}>Confirmar pagamento e liberar</Botao>
        </Botoes>
      ) : renova ? (
        <Botoes>
          <Botao type="button" onClick={() => setPergunta({ id: p.id, tipo: 'encerrar' })}>Encerrar</Botao>
          <BotaoWhatsapp p={p} texto={textoDaCobranca(p)}>Mandar cobrança</BotaoWhatsapp>
          <Botao principal type="button" disabled={ocupado} onClick={() => acoes.renovar(p)}>Confirmar renovação</Botao>
        </Botoes>
      ) : liberado ? (
        <Botoes>
          <BotaoWhatsapp p={p} texto={textoDaLiberacao(p)} nivel={3} />
          <Botao nivel={2} type="button" onClick={() => acoes.copiar(p)} aria-live="polite">
            <Icone nome={copiado === p.id ? 'ok' : 'copiar'} tamanho={14} />
            {copiado === p.id ? 'Mensagem copiada' : 'Copiar mensagem'}
          </Botao>
        </Botoes>
      ) : (
        <Botoes>
          <BotaoWhatsapp p={p} nivel={3} />
        </Botoes>
      )}
    </div>
  );
}

// As colunas da lista no computador; no celular, a linha empilha o nome, o selo e o resto embaixo.
const COLUNAS = 'md:grid md:grid-cols-[78px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,200px)_16px] md:items-center md:gap-x-3';

function ListaDeCompras({ pedidos, rotulo, acoes, aberto, setAberto }) {
  return (
    <Grupo rotulo={rotulo}>
      <div className={`hidden border-b border-linha px-4 ${COLUNAS}`} aria-hidden="true">
        {['Pedido', 'Cliente', 'Plano', 'Valor', 'Situação'].map((c) => <span key={c} className="whitespace-nowrap py-2.5 text-left text-amg-legenda font-medium text-texto-apagado">{c}</span>)}
      </div>
      <ul className="divide-y divide-linha">
        {pedidos.map((p) => {
          const selo = seloDoPedido(p);
          const abre = aberto === p.id;
          return (
            <li key={p.id}>
              <button type="button" aria-expanded={abre} onClick={() => setAberto(abre ? null : p.id)}
                className={`flex min-h-amg-toque-minimo w-full items-start gap-3 px-4 py-2.5 cursor-pointer text-left ${COLUNAS}`}>
                {/* no celular */}
                <span className="min-w-0 flex-1 md:hidden">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <b className="font-semibold">{p.nome}</b>
                    <Selo tom={selo.tom}>{selo.texto}</Selo>
                  </span>
                  <small className="block text-amg-legenda text-texto-apagado">
                    {p.pedido} · {nomeDoPlano(p)} {p.periodo} · {valorDoPedido(p)}
                  </small>
                </span>
                {/* no computador */}
                <span className="hidden font-semibold tabular-nums md:block">{p.pedido}</span>
                <span className="hidden min-w-0 md:block">
                  <b className="block truncate font-semibold">{p.nome}</b>
                  <small className="block truncate text-amg-legenda text-texto-apagado">{p.email}</small>
                </span>
                <span className="hidden min-w-0 md:block">
                  <span className="block truncate">{nomeDoPlano(p)}</span>
                  <small className="block text-amg-legenda text-texto-apagado">{p.periodo === 'anual' ? 'Anual' : 'Mensal'}</small>
                </span>
                <span className="hidden tabular-nums md:block">{valorDoPedido(p)}</span>
                <span className="hidden min-w-0 md:block"><Selo tom={selo.tom}>{selo.texto}</Selo></span>
                <Icone nome="abaixo" tamanho={16} className={`mt-1 text-texto-apagado transition-transform md:mt-0 ${abre ? 'rotate-180' : ''}`} />
              </button>
              {abre && <Detalhe p={p} acoes={acoes} />}
            </li>
          );
        })}
      </ul>
    </Grupo>
  );
}

export default function GestaoPedidos({ dados, setDados, carregar, equipe, aoLiberarEquipe }) {
  const [filtro, setFiltro] = useState('precisam');
  const [aberto, setAberto] = useState(null);
  // O pedido em que o gestor mexeu fica na lista até trocar o filtro: liberado, ele não some antes de copiar a mensagem.
  const [fixos, setFixos] = useState([]);
  const [pergunta, setPergunta] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState({});
  const [erro, setErro] = useState({});
  const [chave, setChave] = useState({});
  const [copiado, setCopiado] = useState(null);
  const [linkCopiado, setLinkCopiado] = useState(null);

  const trocarFiltro = (f) => {
    setFiltro(f);
    setFixos([]);
    setAberto(null);
    setPergunta(null);
  };

  // Chama a função do banco; na amostra, muda só a tela.
  async function pedir(p, nome, args, naAmostra, depois) {
    setAviso({ ...aviso, [p.id]: '' });
    setErro({ ...erro, [p.id]: '' });
    setOcupado(true);
    setFixos((f) => (f.includes(p.id) ? f : [...f, p.id]));
    try {
      let novo;
      if (AMOSTRA) {
        novo = naAmostra(p);
        setDados((d) => ({ ...d, pedidos: d.pedidos.map((x) => (x.id === p.id ? novo : x)) }));
      } else {
        const { data, error } = await supabase.rpc(nome, args);
        if (error || !data?.ok) {
          setErro((e) => ({ ...e, [p.id]: error ? mensagemDeErro(error) : data?.motivo ?? 'Não deu certo. Tente de novo.' }));
          return;
        }
        novo = { ...p, licenca: { ...p.licenca, expiraEm: data.expiraEm ?? p.licenca?.expiraEm } };
        await carregar();
      }
      if (depois) setAviso((a) => ({ ...a, [p.id]: depois(novo) }));
    } catch (e) {
      setErro((x) => ({ ...x, [p.id]: mensagemDeErro(e) }));
    } finally {
      setOcupado(false);
      setPergunta(null);
    }
  }

  const acoes = {
    ocupado, pergunta, setPergunta, aviso, erro, chave, setChave, copiado,
    liberar(p, semChave = false) {
      const c = (chave[p.id] ?? '').trim().toUpperCase();
      if (!c && !semChave) return setPergunta({ id: p.id, tipo: 'sem-chave' });
      return pedir(p, 'gestao_pedido_liberar', { p_id: p.id, p_chave_plugin: c || null }, (x) => ({
        ...x, situacao: 'esperando a conta', chavePlugin: c || null, liberadoEm: new Date().toISOString(), ultimoPagamentoEm: new Date().toISOString(),
        licenca: { id: `l-${x.id}`, expiraEm: somar(null, x.periodo), ligada: false, computadoresPrograma: 0, computadoresPlugin: 0 },
      }), (n) => `Liberado até ${dia(n.licenca?.expiraEm)}. Agora copie a mensagem e mande no WhatsApp.`);
    },
    renovar(p) {
      return pedir(p, 'gestao_pedido_renovar', { p_id: p.id }, (x) => ({
        ...x, situacao: x.licenca?.ligada ? 'em uso' : 'esperando a conta', renovacoes: x.renovacoes + 1, ultimoPagamentoEm: new Date().toISOString(),
        licenca: { ...x.licenca, expiraEm: somar(x.licenca?.expiraEm, x.periodo) },
      }), (n) => `Renovado até ${dia(n.licenca?.expiraEm)}.`);
    },
    cancelar(p) {
      return pedir(p, 'gestao_pedido_cancelar', { p_id: p.id }, (x) => ({ ...x, situacao: 'cancelado' }), () => 'Pedido cancelado.');
    },
    encerrar(p) {
      return pedir(p, 'gestao_pedido_encerrar', { p_id: p.id }, (x) => ({ ...x, situacao: 'encerrado', encerradoEm: new Date().toISOString() }),
        (n) => `Assinatura encerrada. A licença vale até ${dia(n.licenca?.expiraEm)}.`);
    },
    salvarChave(p) {
      const c = (chave[p.id] ?? '').trim().toUpperCase();
      return pedir(p, 'gestao_pedido_chave', { p_id: p.id, p_chave: c }, (x) => ({ ...x, chavePlugin: c }),
        () => 'Chave salva. Ela já vai na mensagem.');
    },
    async copiar(p) {
      if (await copiarTexto(textoDaLiberacao(p))) {
        setCopiado(p.id);
        setTimeout(() => setCopiado((c) => (c === p.id ? null : c)), 2500);
      } else {
        setAviso({ ...aviso, [p.id]: textoDaLiberacao(p) });
      }
    },
  };

  if (dados === null) return <p className="text-texto-apagado">Carregando…</p>;
  const pedidos = dados.pedidos ?? [];
  const aguardando = pedidos.filter((p) => p.situacao === 'aguardando').length;
  const renovar = pedidos.filter(precisaDeVoce).length - aguardando;
  const equipeAbertos = (equipe.pedidos ?? []).filter((p) => !p.respondidoEm).length;
  const contar = (f) => pedidos.filter(FILTROS[f]).length;
  const visiveis = filtro === 'equipe' ? [] : pedidos.filter((p) => FILTROS[filtro](p) || fixos.includes(p.id));

  const partes = [aguardando && `${vezes(aguardando, 'aguardando', 'aguardando')} pagamento`, renovar && `${renovar} para renovar esta semana`]
    .filter(Boolean);
  const resumo = partes.length
    ? `${vezes(aguardando + renovar, 'pedido precisa', 'pedidos precisam')} de você: ${partes.join(' e ')}.`
    : 'Nenhum pedido de compra precisa de você agora.';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Cabecalho titulo="Pedidos">
          <Botao nivel={2} type="button" aria-live="polite"
            onClick={async () => setLinkCopiado((await copiarTexto(LINK_DO_FORMULARIO)) ? 'copiado' : 'mostrar')}>
            <Icone nome={linkCopiado === 'copiado' ? 'ok' : 'copiar'} tamanho={14} />
            {linkCopiado === 'copiado' ? 'Link copiado' : 'Copiar link do formulário'}
          </Botao>
        </Cabecalho>
        <p className="mt-1.5 max-w-[72ch] text-texto-apagado">
          {resumo}
          {equipeAbertos > 0 && ` E ${vezes(equipeAbertos, 'pedido de equipe espera', 'pedidos de equipe esperam')} resposta.`}
        </p>
        {linkCopiado === 'mostrar' && <p className="mt-1.5 select-all break-all">{LINK_DO_FORMULARIO}</p>}
      </div>
      <Escolha rotulo="Quais pedidos" valor={filtro} aoMudar={trocarFiltro} opcoes={[
        ['precisam', 'Precisam de você', aguardando + renovar],
        ['liberados', 'Liberados', contar('liberados')],
        ['equipe', 'Equipe', (equipe.pedidos ?? []).length],
        ['todos', 'Todos', pedidos.length],
      ]} />
      {dados.erro && (
        <Mensagem erro>
          Não deu para ler os pedidos: {dados.erro.message}. Confira se a migração da compra do PRO foi rodada no Supabase.
        </Mensagem>
      )}
      {filtro !== 'equipe' && !dados.erro && (
        visiveis.length === 0 ? (
          <Vazio>
            {filtro === 'precisam' ? 'Nenhum pedido precisa de você agora.'
              : filtro === 'liberados' ? 'Nenhum pedido liberado ainda.'
                : 'Nenhum pedido de compra ainda. Eles chegam pelo arquionie.com.br/comprar.'}
          </Vazio>
        ) : (
          <ListaDeCompras pedidos={visiveis} acoes={acoes} aberto={aberto} setAberto={(id) => { setAberto(id); setPergunta(null); }}
            rotulo={`Compras do PRO · ${visiveis.length}`} />
        )
      )}
      {(filtro === 'equipe' || filtro === 'todos') && (
        <GestaoPedidosDePlano dentro pedidos={equipe.pedidos} setPedidos={equipe.setPedidos} carregar={equipe.carregar} aoLiberar={aoLiberarEquipe} />
      )}
    </div>
  );
}
