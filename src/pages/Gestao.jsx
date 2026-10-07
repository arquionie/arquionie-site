import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSessao } from '@/lib/Sessao';
import { AMOSTRA, lerPainel, planilhaDasContas, useEhAdministrador } from '@/lib/gestao';
import { numeroLegivel } from '@/lib/downloads';
import { ATUACOES } from '@/config';
import GestaoLicencas from '@/components/GestaoLicencas';

// Painel do gestor (ÊDI, 03/10/2026, como o /admin do Palheta Flow): quem se cadastrou, quem baixou e quantas vezes.
// Todo e-mail aqui foi confirmado pelo código, então são contas de verdade. Os dados vêm de funções do banco que só
// respondem aos administradores (supabase/migrations/20261003020000_painel_do_gestor.sql).

const rotuloAtuacao = (v) => ATUACOES.find((a) => a.valor === v)?.rotulo.toLowerCase() ?? (v === 'sem' || !v ? 'sem atuação' : v);
const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

function Numero({ rotulo, valor, detalhe }) {
  return (
    <div className="bg-aqi-barra p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-aqi-muted">{rotulo}</div>
      <div className="mt-1 text-[30px] font-bold leading-tight text-white">{numeroLegivel(valor ?? 0)}</div>
      {detalhe && <div className="text-[12px] text-aqi-muted">{detalhe}</div>}
    </div>
  );
}

function Barras({ titulo, dados, rotular = (k) => k }) {
  const itens = Object.entries(dados ?? {}).sort((a, b) => b[1] - a[1]);
  const maior = Math.max(1, ...itens.map(([, n]) => n));
  return (
    <section className="bg-aqi-barra p-5">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-aqi-coral">{titulo}</h2>
      {itens.length === 0 ? (
        <p className="text-[14px] text-aqi-muted">Nada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map(([k, n]) => (
            <li key={k} className="grid grid-cols-[130px_1fr_44px] items-center gap-3 text-[14px]">
              <span className="truncate text-aqi-texto">{rotular(k)}</span>
              <span className="h-[10px] bg-aqi-painel">
                <span className="block h-[10px] bg-aqi-campo" style={{ width: `${(100 * n) / maior}%` }} />
              </span>
              <span className="text-right font-semibold text-white">{numeroLegivel(n)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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

  const seletor = 'h-[38px] bg-aqi-valor px-3 text-[13px] text-white focus:outline-none';
  return (
    <section className="bg-aqi-barra p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[13px] font-semibold uppercase tracking-[0.12em] text-aqi-coral">
          Contas <span className="text-aqi-muted">· {numeroLegivel(lista.length)}</span>
        </h2>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar nome ou e-mail"
          aria-label="Procurar nome ou e-mail"
          className="h-[38px] w-[220px] bg-aqi-valor px-3 text-[13px] text-white placeholder:text-[#C9A9A5] focus:outline-none"
        />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={seletor} aria-label="Filtro">
          <option value="todas">TODAS</option>
          <option value="baixaram">BAIXARAM</option>
          <option value="nao-baixaram">NÃO BAIXARAM</option>
          <option value="sem-confirmar">SEM CONFIRMAR O E-MAIL</option>
          <option value="novidades">QUEREM NOVIDADES</option>
        </select>
        <select value={ordem} onChange={(e) => setOrdem(e.target.value)} className={seletor} aria-label="Ordem">
          <option value="recentes">MAIS RECENTES</option>
          <option value="downloads">MAIS DOWNLOADS</option>
          <option value="acesso">ÚLTIMO ACESSO</option>
        </select>
        <button type="button" onClick={baixarPlanilha} className="h-[38px] bg-aqi-campo px-4 text-[12px] font-bold tracking-wide text-white hover:bg-aqi-campohover">
          BAIXAR PLANILHA
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-aqi-borda text-left text-[11px] tracking-[0.1em] text-aqi-muted">
              <th className="px-2 py-2 font-semibold">PESSOA</th>
              <th className="px-2 py-2 font-semibold">ATUAÇÃO</th>
              <th className="px-2 py-2 font-semibold">CRIADA</th>
              <th className="px-2 py-2 font-semibold">ENTRA POR</th>
              <th className="px-2 py-2 text-right font-semibold">DOWNLOADS</th>
              <th className="px-2 py-2 font-semibold">ÚLTIMO DOWNLOAD</th>
              <th className="px-2 py-2 font-semibold">ÚLTIMO ACESSO</th>
              <th className="px-2 py-2 text-right font-semibold">COMPUTADORES</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className="border-b border-[#262D37] align-top">
                <td className="px-2 py-2.5">
                  <div className="text-white">{c.nome || '—'}</div>
                  <div className="text-aqi-muted">
                    {c.email}
                    {!c.confirmada_em && <span className="ml-2 text-[10px] font-bold tracking-wide text-aqi-alerta">SEM CONFIRMAR</span>}
                    {c.novidades && <span className="ml-2 text-[10px] font-bold tracking-wide text-aqi-lema">NOVIDADES</span>}
                  </div>
                </td>
                <td className="px-2 py-2.5">{rotuloAtuacao(c.atuacao)}</td>
                <td className="px-2 py-2.5">{dia(c.criada_em)}</td>
                <td className="px-2 py-2.5">{(c.provedores ?? []).map((p) => (p === 'google' ? 'Google' : 'e-mail')).join(' e ')}</td>
                <td className="px-2 py-2.5 text-right text-[15px] font-semibold text-white">{numeroLegivel(c.downloads ?? 0)}</td>
                <td className="px-2 py-2.5">{quando(c.ultimo_download)}</td>
                <td className="px-2 py-2.5">{quando(c.ultimo_acesso)}</td>
                <td className="px-2 py-2.5 text-right">{c.computadores ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && <p className="py-6 text-center text-aqi-muted">Nenhuma conta com esse filtro.</p>}
      </div>
    </section>
  );
}

function UltimosDownloads({ downloads }) {
  return (
    <section className="bg-aqi-barra p-5">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-aqi-coral">Últimos downloads</h2>
      {downloads.length === 0 ? (
        <p className="text-[14px] text-aqi-muted">Nenhum download ainda. Eles aparecem quando o primeiro instalador estiver no ar.</p>
      ) : (
        <ul className="divide-y divide-[#262D37] text-[13px]">
          {downloads.slice(0, 40).map((d, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-x-4 py-2">
              <span className="text-white">{d.nome || d.email || 'conta apagada'}</span>
              <span className="text-aqi-muted">
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
  const [aba, setAba] = useState(() => (window.location.hash === '#licencas' ? 'licencas' : 'contas'));

  const pode = AMOSTRA || admin === true;
  async function atualizar() {
    setDados(null);
    setDados(await lerPainel());
  }
  useEffect(() => {
    if (pode) atualizar();
  }, [pode]);

  if (!AMOSTRA) {
    if (carregando || (usuario && admin === null)) return <p className="px-4 py-16 text-center text-aqi-muted">Carregando…</p>;
    if (!usuario) return <Navigate to="/entrar?volta=%2Fgestao" replace />;
    if (!admin) return <p className="px-4 py-16 text-center text-aqi-muted">Esta página é só para os administradores do Arquionie™.</p>;
  }

  const r = dados?.resumo;
  // Abas sublinhadas (padrão do Arquionie); /gestao#licencas abre direto nas licenças.
  const trocarAba = (a) => {
    setAba(a);
    window.history.replaceState(null, '', a === 'licencas' ? '#licencas' : window.location.pathname + window.location.search);
  };
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-7">
      <div role="tablist" aria-label="Painel do gestor" className="mb-6 flex gap-6 border-b border-aqi-borda text-[12px] font-semibold tracking-[0.08em]">
        {[
          ['contas', 'CONTAS E DOWNLOADS'],
          ['licencas', 'LICENÇAS'],
        ].map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => trocarAba(id)}
            className={`-mb-px border-b-2 py-2.5 ${aba === id ? 'border-aqi-coral text-aqi-coral' : 'border-transparent text-aqi-muted hover:text-aqi-texto'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {aba === 'licencas' ? (
        <GestaoLicencas />
      ) : (
      <>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="titulo-secao mb-1">Painel do gestor{AMOSTRA ? ' · dados de exemplo' : ''}</p>
          <h1 className="text-[28px] font-semibold text-white">Contas e downloads</h1>
        </div>
        <button type="button" onClick={atualizar} className="h-[38px] border border-aqi-borda px-4 text-[12px] font-bold tracking-wide text-aqi-texto hover:bg-aqi-faixa">
          ATUALIZAR
        </button>
      </div>

      {!dados ? (
        <p className="text-aqi-muted">Carregando os números…</p>
      ) : dados.erro ? (
        <p className="bg-aqi-barra p-5 text-aqi-alerta">
          Não deu para ler o painel: {dados.erro.message}. Confira se o SQL do painel do gestor foi rodado no Supabase.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-px bg-[#262D37] sm:grid-cols-2 lg:grid-cols-4">
            <Numero rotulo="Contas" valor={r.contas} detalhe={`${numeroLegivel(r.confirmadas)} com o e-mail confirmado`} />
            <Numero rotulo="Novas" valor={r.novas_7d} detalhe={`nos últimos 7 dias · ${numeroLegivel(r.novas_30d)} em 30`} />
            <Numero rotulo="Downloads" valor={r.downloads} detalhe={`${numeroLegivel(r.downloads_7d)} nos últimos 7 dias`} />
            <Numero rotulo="Pessoas que baixaram" valor={r.pessoas_que_baixaram} detalhe={`${numeroLegivel(r.computadores)} computadores conectados`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Barras titulo="Por atuação" dados={r.por_atuacao} rotular={rotuloAtuacao} />
            <Barras titulo="Downloads por versão" dados={r.por_versao} rotular={(v) => `versão ${v}`} />
            <section className="bg-aqi-barra p-5 text-[14px]">
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-aqi-coral">Como entram</h2>
              <p>
                <b className="text-white">{numeroLegivel(r.pelo_google)}</b> pelo Google ·{' '}
                <b className="text-white">{numeroLegivel(r.contas - r.pelo_google)}</b> pelo e-mail
              </p>
              <p className="mt-2">
                <b className="text-white">{numeroLegivel(r.novidades)}</b> aceitaram receber novidades
              </p>
            </section>
          </div>
          <Contas contas={dados.contas} />
          <UltimosDownloads downloads={dados.downloads} />
        </div>
      )}
      </>
      )}
    </div>
  );
}
