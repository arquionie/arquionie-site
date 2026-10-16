import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSessao } from '@/lib/Sessao';
import { AMOSTRA, lerPainel, planilhaDasContas, useEhAdministrador } from '@/lib/gestao';
import { numeroLegivel } from '@/lib/downloads';
import { ATUACOES } from '@/config';
import { Botao, Mensagem } from '@/components/Formulario';
import { Vazio } from '@/components/Listas';
import { Busca, Cabecalho, NUM, Numero, Numeros, Painel, Selecao, Selo, TD, TH, Tabela } from '@/components/GestaoPecas';
import GestaoLicencas from '@/components/GestaoLicencas';
import GestaoPedidosDePlano, { usePedidosDePlano } from '@/components/GestaoPedidosDePlano';
import GestaoPrecosCupons from '@/components/GestaoPrecosCupons';
import GestaoCampanhas from '@/components/GestaoCampanhas';
import GestaoVersoesAulas from '@/components/GestaoVersoesAulas';
import GestaoFeedbacks, { useFeedbacksNovos } from '@/components/GestaoFeedbacks';

// Painel do gestor (ÊDI, 03/10/2026, como o /admin do Palheta Flow): quem se cadastrou, quem baixou e quantas vezes.
// Todo e-mail aqui foi confirmado pelo código, então são contas de verdade. Os dados vêm de funções do banco que só
// respondem aos administradores (supabase/migrations/20261003020000_painel_do_gestor.sql). No modo AMIGÁVEL desde o mockup gestao-amigavel
// (ÊDI, 16/10/2026), como o resto do site, e com a aparência de Minha conta.

const rotuloAtuacao = (v) => ATUACOES.find((a) => a.valor === v)?.rotulo.toLowerCase() ?? (v === 'sem' || !v ? 'sem atuação' : v);
const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

function Barras({ titulo, dados, rotular = (k) => k }) {
  const itens = Object.entries(dados ?? {}).sort((a, b) => b[1] - a[1]);
  const maior = Math.max(1, ...itens.map(([, n]) => n));
  return (
    <Painel titulo={titulo}>
      {itens.length === 0 ? (
        <p className="text-texto-apagado">Nada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map(([k, n]) => (
            <li key={k} className="grid grid-cols-[120px_1fr_40px] items-center gap-2.5">
              <span className="truncate">{rotular(k)}</span>
              <span className="h-2 overflow-hidden rounded-toque bg-superficie-2" aria-hidden="true">
                <span className="block h-full rounded-toque bg-destaque" style={{ width: `${(100 * n) / maior}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums">{numeroLegivel(n)}</span>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}

const FILTROS = [
  ['todas', 'Todas'],
  ['baixaram', 'Baixaram'],
  ['nao-baixaram', 'Não baixaram'],
  ['sem-confirmar', 'Sem confirmar o e-mail'],
  ['novidades', 'Querem novidades'],
];
const ORDENS = [
  ['recentes', 'Mais recentes'],
  ['downloads', 'Mais downloads'],
  ['acesso', 'Último acesso'],
];

function Contas({ contas }) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [ordem, setOrdem] = useState('recentes');
  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let l = contas.filter((c) => !termo || `${c.nome ?? ''} ${c.email ?? ''}`.toLowerCase().includes(termo));
    if (filtro === 'baixaram') l = l.filter((c) => c.downloads > 0);
    if (filtro === 'nao-baixaram') l = l.filter((c) => !c.downloads);
    if (filtro === 'sem-confirmar') l = l.filter((c) => !c.confirmada_em);
    if (filtro === 'novidades') l = l.filter((c) => c.novidades);
    if (ordem === 'downloads') l = [...l].sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0));
    if (ordem === 'acesso') l = [...l].sort((a, b) => (b.ultimo_acesso ?? '').localeCompare(a.ultimo_acesso ?? ''));
    return l;
  }, [contas, busca, filtro, ordem]);

  function baixarPlanilha() {
    const url = URL.createObjectURL(planilhaDasContas(lista));
    const a = document.createElement('a');
    a.href = url;
    a.download = `contas-arquionie-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selos = (c) => (
    <>
      {!c.confirmada_em && <Selo tom="atencao">Sem confirmar</Selo>}
      {c.novidades && <Selo>Novidades</Selo>}
    </>
  );
  return (
    <section>
      <h2 className="rotulo mb-1.5 ml-3.5">Contas · {numeroLegivel(lista.length)}</h2>
      <div className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">
        <div className="flex flex-col gap-2 border-b border-linha p-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
          <Busca valor={busca} aoMudar={setBusca} rotulo="Procurar nome ou e-mail" className="sm:flex-1" />
          <Selecao valor={filtro} aoMudar={setFiltro} opcoes={FILTROS} rotulo="Filtro" />
          <Selecao valor={ordem} aoMudar={setOrdem} opcoes={ORDENS} rotulo="Ordem" />
          <Botao nivel={2} type="button" onClick={baixarPlanilha}>Baixar planilha</Botao>
        </div>
        {/* no computador, a tabela; no celular, a lista com o nome, o e-mail e os downloads */}
        <div className="hidden md:block">
          <Tabela minimo={860}>
            <thead>
              <tr>
                <th className={TH}>Pessoa</th>
                <th className={TH}>Atuação</th>
                <th className={TH}>Criada</th>
                <th className={TH}>Entra por</th>
                <th className={`${TH} text-right`}>Downloads</th>
                <th className={TH}>Último download</th>
                <th className={TH}>Último acesso</th>
                <th className={`${TH} text-right`}>Computadores</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td className={TD}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <b className="font-semibold">{c.nome || '—'}</b>
                      {selos(c)}
                    </div>
                    <div className="text-amg-legenda text-texto-apagado">{c.email}</div>
                  </td>
                  <td className={TD}>{rotuloAtuacao(c.atuacao)}</td>
                  <td className={TD}>{dia(c.criada_em)}</td>
                  <td className={TD}>{(c.provedores ?? []).map((p) => (p === 'google' ? 'Google' : 'e-mail')).join(' e ')}</td>
                  <td className={`${TD} ${NUM} font-semibold`}>{numeroLegivel(c.downloads ?? 0)}</td>
                  <td className={TD}>{quando(c.ultimo_download)}</td>
                  <td className={TD}>{quando(c.ultimo_acesso)}</td>
                  <td className={`${TD} ${NUM}`}>{c.computadores ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </div>
        <ul className="md:hidden">
          {lista.map((c) => (
            <li key={c.id} className="flex min-h-amg-toque-minimo items-center gap-3 border-t border-linha px-4 py-2.5 first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <b className="font-semibold">{c.nome || '—'}</b>
                  {selos(c)}
                </div>
                <div className="truncate text-amg-legenda text-texto-apagado">{c.email}</div>
              </div>
              <span className="text-right">
                <b className="block font-semibold tabular-nums">{numeroLegivel(c.downloads ?? 0)}</b>
                <small className="text-amg-legenda text-texto-apagado">{c.downloads === 1 ? 'download' : 'downloads'}</small>
              </span>
            </li>
          ))}
        </ul>
        {lista.length === 0 && <p className="px-4 py-6 text-center text-texto-apagado">Nenhuma conta com esse filtro.</p>}
      </div>
    </section>
  );
}

function UltimosDownloads({ downloads }) {
  return (
    <section>
      <h2 className="rotulo mb-1.5 ml-3.5">Últimos downloads</h2>
      {downloads.length === 0 ? (
        <Vazio>Nenhum download ainda. Eles aparecem quando o primeiro instalador estiver no ar.</Vazio>
      ) : (
        <ul className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">
          {downloads.slice(0, 40).map((d, i) => (
            <li key={i} className="flex min-h-amg-toque-minimo flex-wrap items-center justify-between gap-x-4 border-t border-linha px-4 py-2 first:border-t-0">
              <span className="font-medium">{d.nome || d.email || 'conta apagada'}</span>
              <span className="text-amg-legenda text-texto-apagado">
                versão {d.versao || '—'} · {quando(d.criado_em)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Gestao() {
  const { usuario, carregando } = useSessao();
  const admin = useEhAdministrador();
  const [dados, setDados] = useState(null);
  // As abas que vieram do Palheta Flow (plano 18, mockup aprovado em 15/10/2026): preços e cupons, campanhas, versões e aulas, feedbacks.
  const [aba, setAba] = useState(() => (
    ['licencas', 'pedidos', 'precos', 'campanhas', 'versoes', 'feedbacks'].find((a) => window.location.hash === `#${a}`) ?? 'contas'));
  // o LIBERAR LICENÇAS de um pedido de plano abre o LIBERAR com o e-mail da conta
  const [liberarPara, setLiberarPara] = useState(null);
  const [pedidos, setPedidos, lerPedidos] = usePedidosDePlano();
  const [feedbacksNovos, setFeedbacksNovos] = useFeedbacksNovos();

  const pode = AMOSTRA || admin === true;
  async function atualizar() {
    setDados(null);
    setDados(await lerPainel());
  }
  useEffect(() => {
    if (pode) atualizar();
  }, [pode]);

  if (!AMOSTRA) {
    if (carregando || (usuario && admin === null)) return <p className="px-4 py-16 text-center text-texto-apagado">Carregando…</p>;
    if (!usuario) return <Navigate to="/entrar?volta=%2Fgestao" replace />;
    if (!admin) return <p className="px-4 py-16 text-center text-texto-apagado">Esta página é só para os administradores do Arquionie™.</p>;
  }

  const r = dados?.resumo;
  // As abas em cápsulas (mockup gestao-amigavel, 16/10/2026), com a contagem numa plaquinha; /gestao#licencas abre direto nas licenças,
  // /gestao#pedidos nos pedidos de plano.
  const trocarAba = (a) => {
    setAba(a);
    window.history.replaceState(null, '', a === 'contas' ? window.location.pathname + window.location.search : `#${a}`);
  };
  const abertos = (pedidos ?? []).filter((p) => !p.respondidoEm).length;
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <div role="tablist" aria-label="Painel do gestor" className="sem-barra -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:gap-1 sm:px-0">
        {[
          ['contas', 'Contas e downloads'],
          ['licencas', 'Licenças'],
          ['pedidos', 'Pedidos de plano', abertos],
          ['precos', 'Preços e cupons'],
          ['campanhas', 'Campanhas'],
          ['versoes', 'Versões e aulas'],
          ['feedbacks', 'Feedbacks', feedbacksNovos],
        ].map(([id, rotulo, n]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => trocarAba(id)}
            className={`relative inline-flex min-h-amg-toque-minimo shrink-0 items-center gap-1.5 whitespace-nowrap rounded-toque px-3.5 sm:min-h-botao ${
              aba === id ? 'bg-superficie-2 font-semibold text-texto' : 'font-medium text-texto-apagado hover:text-texto'}`}
          >
            {rotulo}
            {n ? (
              <span className="grid min-w-5 place-items-center rounded-toque bg-botao-1 px-1.5 text-amg-rotulo text-botao-1-texto">
                {n}
                <span className="sr-only">{id === 'pedidos' ? (n === 1 ? ' pedido aberto' : ' pedidos abertos') : n === 1 ? ' novo' : ' novos'}</span>
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {aba === 'precos' ? (
        <GestaoPrecosCupons />
      ) : aba === 'campanhas' ? (
        <GestaoCampanhas />
      ) : aba === 'versoes' ? (
        <GestaoVersoesAulas />
      ) : aba === 'feedbacks' ? (
        <GestaoFeedbacks aoMudarNovos={setFeedbacksNovos} />
      ) : aba === 'pedidos' ? (
        <GestaoPedidosDePlano pedidos={pedidos} setPedidos={setPedidos} carregar={lerPedidos}
          aoLiberar={(email) => { setLiberarPara({ email, vez: Date.now() }); trocarAba('licencas'); }} />
      ) : aba === 'licencas' ? (
        <GestaoLicencas liberarPara={liberarPara} />
      ) : (
        <div className="flex flex-col gap-4">
          <Cabecalho titulo="Contas e downloads">
            <Botao type="button" onClick={atualizar}>Atualizar</Botao>
          </Cabecalho>

          {!dados ? (
            <p className="text-texto-apagado">Carregando os números…</p>
          ) : dados.erro ? (
            <Mensagem erro>Não deu para ler o painel: {dados.erro.message}. Confira se o SQL do painel do gestor foi rodado no Supabase.</Mensagem>
          ) : (
            <>
              <Numeros>
                <Numero rotulo="Contas" valor={r.contas} detalhe={`${numeroLegivel(r.confirmadas)} com o e-mail confirmado`} />
                <Numero rotulo="Novas" valor={r.novas_7d} detalhe={`nos últimos 7 dias · ${numeroLegivel(r.novas_30d)} em 30`} />
                <Numero rotulo="Downloads" valor={r.downloads} detalhe={`${numeroLegivel(r.downloads_7d)} nos últimos 7 dias`} />
                <Numero rotulo="Pessoas que baixaram" valor={r.pessoas_que_baixaram} detalhe={`${numeroLegivel(r.computadores)} computadores conectados`} />
              </Numeros>
              <div className="grid gap-3 lg:grid-cols-3">
                <Barras titulo="Por atuação" dados={r.por_atuacao} rotular={rotuloAtuacao} />
                <Barras titulo="Downloads por versão" dados={r.por_versao} rotular={(v) => `versão ${v}`} />
                <Painel titulo="Como entram">
                  <p>
                    <b>{numeroLegivel(r.pelo_google)}</b> pelo Google · <b>{numeroLegivel(r.contas - r.pelo_google)}</b> pelo e-mail
                  </p>
                  <p className="mt-1.5 text-texto-apagado">
                    <b className="text-texto">{numeroLegivel(r.novidades)}</b> aceitaram receber novidades
                  </p>
                </Painel>
              </div>
              <Contas contas={dados.contas} />
              <UltimosDownloads downloads={dados.downloads} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
