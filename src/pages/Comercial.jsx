import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Botao, Campo, Etiqueta, Icone, Mensagem } from '@/components/Formulario';
import { Escolha, Grupo, Vazio } from '@/components/Listas';
import { Numero } from '@/components/GestaoPecas';
import { SITE_URL } from '@/config';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { copiarTexto } from '@/lib/licencas';
import { whatsappLegivel } from '@/lib/equipe';
import {
  AMOSTRA, AMOSTRA_ESTADO, etiquetaDoPedido, hojeISO, quandoChegou, reais, reaisCurtos, rpc,
} from '@/lib/comercial';
import Ficha from '@/pages/ComercialFicha';
import { BotaoWhatsApp, Janela, PontoDaEtapa, abrirWhatsApp } from '@/components/ComercialPecas';
import { Ajustes, Formularios, PrimeiroAcesso } from '@/pages/ComercialAjustes';

// O COMERCIAL, o CRM grátis do painel do escritório (mockup docs/mockups/crm-gratis, aprovado por ÊDI em 16/10/2026; doc 68; contrato
// no doc 72 do repositório do programa): o título grande, os cinco números, HOJE, o quadro com as etapas livres (a lista, para o leitor
// de tela e a busca), o orçamento como folha, os formulários e os ajustes. As palavras do escritório: "pedido", não "lead".

function Cartao({ pedido: p, etapa, aoAbrir, aoWhatsApp, arrastavel }) {
  const etq = etiquetaDoPedido(p, etapa);
  return (
    <div role="button" tabIndex={0} onClick={aoAbrir} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), aoAbrir())}
      draggable={arrastavel} onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
      aria-label={`${p.nome}, ${[p.tipo, p.cidade].filter(Boolean).join(', ')}${p.valor ? `, ${reais(p.valor)}` : ''}${etq ? `, ${etq.texto}` : ''}`}
      className="flex cursor-pointer flex-col gap-0.5 rounded-cartao bg-superficie px-3.5 pb-3 pt-[13px] text-left shadow-cartao focus-visible:outline focus-visible:outline-2 focus-visible:outline-destaque">
      <b className="truncate text-[15px] font-semibold tracking-[-0.01em]">{p.nome}</b>
      <small className="truncate text-amg-legenda text-texto-apagado">{[p.tipo, p.cidade].filter(Boolean).join(' · ') || 'Sem projeto ainda'}</small>
      <div className="mt-[11px] flex items-center gap-2">
        {p.valor ? <strong className="mr-auto shrink-0 whitespace-nowrap text-amg-valor tabular-nums">{reais(p.valor)}</strong>
          : <span className="mr-auto text-amg-legenda text-texto-apagado">{quandoChegou(p.criadoEm)}</span>}
        {etq && <Etiqueta tipo={etq.tipo} className="min-w-0">{etq.texto}</Etiqueta>}
        {p.whatsapp && etapa?.tipo !== 'perdido' && <BotaoWhatsApp redondo nome={p.nome} aoClicar={aoWhatsApp} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ o painel
const PERIODOS = [['ano', 'Este ano'], ['mes', 'Este mês'], ['tudo', 'Tudo']];
function datasDoPeriodo(p) {
  const h = new Date();
  if (p === 'mes') return [new Date(h.getFullYear(), h.getMonth(), 1), new Date(h.getFullYear(), h.getMonth() + 1, 0)];
  if (p === 'tudo') return [new Date(2020, 0, 1), new Date(h.getFullYear() + 5, 11, 31)];
  return [new Date(h.getFullYear(), 0, 1), new Date(h.getFullYear(), 11, 31)];
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Comercial() {
  const [busca, setBusca] = useSearchParams();
  const area = busca.get('area') || null;
  const [estado, setEstado] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [vista, setVista] = useState('quadro');
  const [aberto, setAberto] = useState(null);
  const [novo, setNovo] = useState(false);
  const [mover, setMover] = useState(null);
  const [periodo, setPeriodo] = useState('ano');
  const [equipes, setEquipes] = useState([]);
  const [copiado, setCopiado] = useState(false);

  async function carregar() {
    setErro('');
    if (AMOSTRA) return setEstado(estado ?? { ...AMOSTRA_ESTADO, novo: new URLSearchParams(window.location.search).get('amostra') === 'novo' });
    try {
      const [de, ate] = datasDoPeriodo(periodo);
      setEstado(await rpc('comercial_estado', { p_area: area, p_de: iso(de), p_ate: iso(ate) }));
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }
  useEffect(() => {
    carregar();
  }, [area, periodo]);
  useEffect(() => {
    if (AMOSTRA) return;
    supabase.rpc('minhas_equipes').then(({ data }) => setEquipes((data ?? []).filter((e) => e.situacao === 'ativo')));
  }, []);
  useEffect(() => {
    document.title = 'Comercial · Arquionie';
  }, []);

  if (erro) return <section className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6"><Mensagem erro>{erro}</Mensagem></section>;
  if (!estado) return <section className="mx-auto max-w-[1180px] px-4 py-8 text-texto-apagado sm:px-6">Carregando…</section>;
  if (estado.novo) return <PrimeiroAcesso estado={estado} aoTerminar={(e) => setEstado(e)} />;

  const etapas = estado.ajustes.etapas;
  const etapaDe = (id) => etapas.find((e) => e.id === id);
  const formulario = estado.formularios.find((f) => f.ativo && !f.pausadoPeloGestor) ?? estado.formularios[0];
  const ind = estado.indicadores;
  const aoWhats = (p) => abrirWhatsApp(area, p, () => carregar(), setAviso);

  async function moverPara(p, etapaId, motivo) {
    const e = etapaDe(etapaId);
    if (!e || p.etapa === etapaId) return;
    if (e.tipo === 'perdido' && !motivo) return setMover({ pedido: p, etapa: e });
    setMover(null);
    if (AMOSTRA) return setEstado({ ...estado, pedidos: estado.pedidos.map((x) => (x.id === p.id ? { ...x, etapa: etapaId, motivo: motivo ?? '' } : x)) });
    try {
      const r = await rpc('comercial_pedido_mover', { p_area: area, p_id: p.id, p_etapa: etapaId, p_motivo: motivo ?? null });
      if (!r.ok) return setAviso(r.motivo);
      carregar();
    } catch (er) {
      setAviso(mensagemDeErro(er));
    }
  }

  const areas = [{ responsavel: null, escritorio: 'Minha área' }, ...equipes];
  return (
    <section className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      {/* os produtos (Comercial, Apresentações, Equipe) ficam no menu lateral do sistema; aqui, só as áreas */}
      {areas.length > 1 && (
        <nav aria-label="Áreas" className="sem-barra -mx-4 mb-5 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {areas.map((a) => (
            <button key={a.responsavel ?? 'eu'} type="button" aria-pressed={area === a.responsavel}
              onClick={() => setBusca(a.responsavel ? { area: a.responsavel } : {})}
              className={`min-h-amg-toque-minimo shrink-0 rounded-toque px-3 sm:min-h-0 sm:py-[7px] ${area === a.responsavel ? 'bg-amg-destaque-suave font-semibold text-destaque-texto' : 'text-texto-apagado'}`}>
              {a.escritorio}
            </button>
          ))}
        </nav>
      )}

      {!['formularios', 'ajustes'].includes(vista) && (
        <header className="mb-5 flex flex-wrap items-center gap-3">
          <div className="mr-2">
            <h1 className="text-amg-titulo-grande">Comercial</h1>
            <p className="mt-1 text-texto-apagado">{ind.pedidos} {Number(ind.pedidos) === 1 ? 'pedido' : 'pedidos'} · {estado.escritorio}</p>
          </div>
          <Escolha rotulo="Vista" valor={vista} aoMudar={setVista}
            opcoes={[['quadro', 'Quadro'], ['lista', 'Lista'], ['indicadores', 'Indicadores']]} />
          <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
            <Botao type="button" onClick={() => setVista('formularios')}>Formulários</Botao>
            {estado.responsavel && <Botao type="button" onClick={() => setVista('ajustes')}>Ajustes</Botao>}
            {formulario && (
              <Botao nivel={2} type="button" aria-live="polite" onClick={async () => setCopiado(await copiarTexto(`${SITE_URL}/f/${formulario.codigo}`))}>
                <Icone nome={copiado ? 'ok' : 'copiar'} tamanho={15} />
                {copiado ? 'Link copiado' : <span>Copiar link<span className="hidden sm:inline"> do formulário</span></span>}
              </Botao>
            )}
            <Botao principal type="button" onClick={() => setNovo(true)} className="order-first sm:order-none">Novo pedido</Botao>
          </div>
        </header>
      )}

      {aviso && <div className="mb-4"><Mensagem erro>{aviso}</Mensagem></div>}

      {vista === 'formularios' && <Formularios estado={estado} area={area} aoMudar={carregar} aoVoltar={() => setVista('quadro')} />}
      {vista === 'ajustes' && <Ajustes estado={estado} area={area} aoSalvar={(e) => { setEstado(e); setVista('quadro'); }} aoVoltar={() => setVista('quadro')} />}

      {['quadro', 'lista', 'indicadores'].includes(vista) && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
            <Numero rotulo="Pedidos" valor={reaisInteiro(ind.pedidos)} detalhe={`${ind.emAndamento} em andamento`} />
            <Numero rotulo="Conversão" valor={`${ind.conversao}%`} detalhe={`${ind.ganhos} de ${ind.pedidos}`} />
            <Numero rotulo="Ticket médio" valor={reais(ind.ticketMedio)} detalhe={`${ind.ganhos} ${Number(ind.ganhos) === 1 ? 'proposta aceita' : 'propostas aceitas'}`} />
            <Numero rotulo="Ganhos" valor={reais(ind.valorGanho)} detalhe={`${ind.ganhos} ${Number(ind.ganhos) === 1 ? 'aprovado' : 'aprovados'}`} />
            <Numero rotulo="Em negociação" valor={reais(ind.emNegociacao)} detalhe={`${ind.emAndamento} pedidos`} />
          </div>
          {vista !== 'indicadores' && <Hoje itens={estado.hoje} etapaDe={etapaDe} aoAbrir={(p) => setAberto(p.id)} aoWhatsApp={aoWhats} />}
          {vista === 'quadro' && <Quadro estado={estado} etapaDe={etapaDe} aoAbrir={(p) => setAberto(p.id)} aoWhatsApp={aoWhats} aoMover={moverPara} />}
          {vista === 'lista' && <ListaDePedidos estado={estado} etapaDe={etapaDe} aoAbrir={(p) => setAberto(p.id)} aoWhatsApp={aoWhats} />}
          {vista === 'indicadores' && <Indicadores estado={estado} periodo={periodo} aoPeriodo={setPeriodo} />}
          {estado.pedidos.length === 0 && (
            <Vazio>
              Seu primeiro pedido aparece aqui. Copie o link do formulário e coloque na bio do Instagram ou mande no WhatsApp.
            </Vazio>
          )}
        </>
      )}

      {aberto && <Ficha area={area} id={aberto} estado={estado} aoFechar={() => setAberto(null)} aoMudar={carregar} />}
      {novo && <NovoPedido area={area} estado={estado} aoFechar={() => setNovo(false)} aoCriar={(p) => { setNovo(false); carregar(); setAberto(p.id); }} />}
      {mover && (
        <Janela titulo={`Mover para ${mover.etapa.nome}`} sub="Por que este pedido não seguiu?" aoFechar={() => setMover(null)}>
          <div className="flex flex-wrap gap-2">
            {estado.ajustes.motivos.map((m) => (
              <Botao key={m} type="button" onClick={() => moverPara(mover.pedido, mover.etapa.id, m)}>{m}</Botao>
            ))}
          </div>
        </Janela>
      )}
    </section>
  );
}
const reaisInteiro = (n) => Number(n ?? 0).toLocaleString('pt-BR');

// ------------------------------------------------------------------------------------------------ HOJE
function Hoje({ itens, etapaDe, aoAbrir, aoWhatsApp }) {
  if (!itens?.length) return null;
  const etq = (h) =>
    h.motivo === 'retorno' ? { texto: h.em < hojeISO() ? 'Retorno vencido' : 'Retorno hoje', tipo: 'urgente' }
      : h.motivo === 'parado' ? { texto: `Parado ${h.dias} dias`, tipo: 'neutra' }
        : { texto: `Abriu ${h.aberturas} ${h.aberturas === 1 ? 'vez' : 'vezes'}`, tipo: 'informacao' };
  const desc = (h) => [h.pedido.tipo, h.motivo === 'parado' ? etapaDe(h.pedido.etapa)?.nome : h.pedido.cidade].filter(Boolean).join(' · ');
  return (
    <section aria-labelledby="hoje" className="mb-6 overflow-hidden rounded-cartao bg-superficie shadow-cartao">
      <h2 id="hoje" className="flex items-center gap-2 px-4 pb-2 pt-3 text-amg-secao">
        Hoje <span className="rounded-toque bg-botao-1 px-2 text-amg-rotulo leading-5 text-botao-1-texto">{itens.length}</span>
      </h2>
      {itens.map((h, i) => {
        const e = etq(h);
        return (
          <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-linha px-4 py-2.5 sm:flex-nowrap">
            <span className="w-full sm:w-[150px] sm:shrink-0"><Etiqueta tipo={e.tipo}>{e.texto}</Etiqueta></span>
            <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{h.pedido.nome}</b> <small className="text-amg-legenda text-texto-apagado">{desc(h)}</small></span>
            <Botao pequeno type="button" onClick={() => aoAbrir(h.pedido)}>Abrir</Botao>
            {h.pedido.whatsapp && <BotaoWhatsApp redondo nome={h.pedido.nome} aoClicar={() => aoWhatsApp(h.pedido)} />}
          </div>
        );
      })}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ o quadro
function Quadro({ estado, etapaDe, aoAbrir, aoWhatsApp, aoMover }) {
  const etapas = estado.ajustes.etapas;
  const [noCelular, setNoCelular] = useState(etapas[0]?.id);
  const [sobre, setSobre] = useState(null);
  const porEtapa = useMemo(() => {
    const m = Object.fromEntries(etapas.map((e) => [e.id, []]));
    for (const p of estado.pedidos) (m[p.etapa] ??= []).push(p);
    for (const e of etapas)
      m[e.id]?.sort((a, b) => (e.pelaData ? (a.retorno ?? '9999').localeCompare(b.retorno ?? '9999') : new Date(b.criadoEm) - new Date(a.criadoEm)));
    return m;
  }, [estado.pedidos, etapas]);
  const soma = (id) => porEtapa[id]?.reduce((s, p) => s + Number(p.valor ?? 0), 0) ?? 0;

  return (
    <>
      {/* no celular: as etapas em pílulas e os cartões da escolhida */}
      <div className="sm:hidden">
        <div className="sem-barra -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
          {etapas.map((e) => (
            <button key={e.id} type="button" aria-pressed={noCelular === e.id} onClick={() => setNoCelular(e.id)}
              className={`inline-flex min-h-amg-toque-minimo shrink-0 items-center gap-1.5 rounded-toque px-3.5 ${noCelular === e.id ? 'bg-texto text-fundo' : 'bg-superficie ring-1 ring-inset ring-linha'}`}>
              {e.nome} <span className="tabular-nums opacity-70">{porEtapa[e.id]?.length ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          {(porEtapa[noCelular] ?? []).map((p) => (
            <Cartao key={p.id} pedido={p} etapa={etapaDe(p.etapa)} aoAbrir={() => aoAbrir(p)} aoWhatsApp={() => aoWhatsApp(p)} />
          ))}
        </div>
      </div>

      {/* no computador: as colunas, que rolam para o lado; arrastar o cartão muda a etapa */}
      <div className="hidden gap-4 overflow-x-auto pb-2 sm:flex" role="list" aria-label="Quadro de pedidos">
        {etapas.map((e) => (
          <div key={e.id} role="listitem" aria-label={`${e.nome}, ${porEtapa[e.id]?.length ?? 0} pedidos`}
            onDragOver={(ev) => { ev.preventDefault(); setSobre(e.id); }} onDragLeave={() => setSobre(null)}
            onDrop={(ev) => { ev.preventDefault(); setSobre(null); const p = estado.pedidos.find((x) => x.id === ev.dataTransfer.getData('text/plain')); if (p) aoMover(p, e.id); }}
            className={`flex w-[248px] shrink-0 flex-col gap-[9px] rounded-cartao p-0.5 ${sobre === e.id ? 'bg-superficie-2' : ''}`}>
            <div className="flex items-center gap-2 px-1 pb-0.5 text-[14.5px] font-semibold">
              <PontoDaEtapa cor={e.cor} />
              {e.nome}
              <span className="font-medium tabular-nums text-texto-apagado">{porEtapa[e.id]?.length ?? 0}</span>
              {e.tipo !== 'perdido' && soma(e.id) > 0 && <small className="ml-auto text-amg-legenda font-medium text-texto-apagado">{reaisCurtos(soma(e.id))}</small>}
            </div>
            {(porEtapa[e.id] ?? []).map((p) => (
              <Cartao key={p.id} arrastavel pedido={p} etapa={e} aoAbrir={() => aoAbrir(p)} aoWhatsApp={() => aoWhatsApp(p)} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ a lista
function ListaDePedidos({ estado, etapaDe, aoAbrir, aoWhatsApp }) {
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState('andamento');
  const [origem, setOrigem] = useState('');
  const origens = [...new Set(estado.pedidos.map((p) => p.origem).filter(Boolean))];
  const t = texto.trim().toLowerCase();
  const lista = estado.pedidos.filter((p) => (filtro === 'todos' || etapaDe(p.etapa)?.tipo === filtro) && (!origem || p.origem === origem)
    && (!t || [p.nome, p.cidade, p.whatsapp, p.tipo].some((x) => String(x ?? '').toLowerCase().includes(t))));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[240px] flex-1"><Campo rotulo="Buscar" id="busca" valor={texto} aoMudar={setTexto} placeholder="Nome, cidade ou WhatsApp" /></div>
        <Escolha rotulo="Situação" valor={filtro} aoMudar={setFiltro} opcoes={[['andamento', 'Em andamento'], ['ganho', 'Ganhos'], ['perdido', 'Perdidos'], ['todos', 'Todos']]} />
        {origens.length > 0 && (
          <select aria-label="Origem" value={origem} onChange={(e) => setOrigem(e.target.value)}
            className="h-amg-altura-campo rounded-toque bg-superficie px-4 text-[16px] ring-1 ring-inset ring-linha">
            <option value="">Todas as origens</option>
            {origens.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
      </div>
      <Grupo>
        {lista.length === 0 ? (
          <p className="px-4 py-4 text-texto-apagado">Nenhum pedido com esse filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="text-left text-amg-legenda text-texto-apagado">
                  {['Nome', 'Etapa', 'Projeto', 'Valor', 'Origem', 'Próximo passo', ''].map((h) => <th key={h} className="px-4 pb-2 pt-3 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const e = etapaDe(p.etapa);
                  const etq = etiquetaDoPedido(p, e);
                  return (
                    <tr key={p.id} className="border-t border-linha align-middle">
                      <td className="px-4 py-2.5"><b className="font-semibold">{p.nome}</b><small className="block text-amg-legenda text-texto-apagado">{whatsappLegivel(p.whatsapp) || '—'}</small></td>
                      <td className="whitespace-nowrap px-4 py-2.5"><span className="inline-flex items-center gap-2"><PontoDaEtapa cor={e?.cor} />{e?.nome ?? p.etapa}</span></td>
                      <td className="px-4 py-2.5">{p.tipo || '—'}<small className="block text-amg-legenda text-texto-apagado">{p.cidade}</small></td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold tabular-nums">{reais(p.valor)}</td>
                      <td className="px-4 py-2.5">{p.origem || '—'}</td>
                      <td className="px-4 py-2.5">{etq ? <Etiqueta tipo={etq.tipo}>{etq.texto}</Etiqueta> : <span className="text-texto-apagado">{quandoChegou(p.criadoEm)}</span>}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <Botao pequeno type="button" onClick={() => aoAbrir(p)} aria-label={`Abrir o pedido de ${p.nome}`}>Abrir</Botao>
                          {p.whatsapp && <BotaoWhatsApp redondo nome={p.nome} aoClicar={() => aoWhatsApp(p)} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Grupo>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ os indicadores
function Indicadores({ estado, periodo, aoPeriodo }) {
  const etapas = estado.ajustes.etapas;
  const tipo = Object.fromEntries(etapas.map((e) => [e.id, e.tipo]));
  const porOrigem = {};
  for (const p of estado.pedidos) {
    const o = p.origem || 'Sem origem';
    porOrigem[o] ??= { pedidos: 0, ganhos: 0, valor: 0 };
    porOrigem[o].pedidos++;
    if (tipo[p.etapa] === 'ganho') { porOrigem[o].ganhos++; porOrigem[o].valor += Number(p.valor ?? 0); }
  }
  const motivos = {};
  for (const p of estado.pedidos) if (tipo[p.etapa] === 'perdido') motivos[p.motivo || 'Sem motivo'] = (motivos[p.motivo || 'Sem motivo'] ?? 0) + 1;
  return (
    <div className="flex flex-col gap-5">
      <Escolha rotulo="Período" valor={periodo} aoMudar={aoPeriodo} opcoes={PERIODOS} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Grupo rotulo="Por etapa">
          {etapas.map((e) => {
            const lista = estado.pedidos.filter((p) => p.etapa === e.id);
            return (
              <div key={e.id} className="flex min-h-amg-toque-minimo items-center gap-3 border-t border-linha px-4 first:border-t-0">
                <PontoDaEtapa cor={e.cor} /><span className="flex-1">{e.nome}</span>
                <span className="tabular-nums text-texto-apagado">{lista.length}</span>
                <span className="w-[110px] text-right font-semibold tabular-nums">{lista.some((p) => Number(p.valor) > 0) ? reaisCurtos(lista.reduce((s, p) => s + Number(p.valor ?? 0), 0)) : '—'}</span>
              </div>
            );
          })}
        </Grupo>
        <Grupo rotulo="Por origem">
          {Object.entries(porOrigem).sort((a, b) => b[1].pedidos - a[1].pedidos).map(([o, v]) => (
            <div key={o} className="flex min-h-amg-toque-minimo items-center gap-3 border-t border-linha px-4 first:border-t-0">
              <span className="flex-1">{o}</span>
              <span className="tabular-nums text-texto-apagado">{v.pedidos} {v.pedidos === 1 ? 'pedido' : 'pedidos'}</span>
              <span className="w-[120px] text-right tabular-nums">{Math.round((100 * v.ganhos) / v.pedidos)}% fecharam</span>
            </div>
          ))}
        </Grupo>
        {Object.keys(motivos).length > 0 && (
          <Grupo rotulo="Motivos de recusa">
            {Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([m, n]) => (
              <div key={m} className="flex min-h-amg-toque-minimo items-center gap-3 border-t border-linha px-4 first:border-t-0">
                <span className="flex-1">{m}</span><span className="tabular-nums text-texto-apagado">{n}</span>
              </div>
            ))}
          </Grupo>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ NOVO PEDIDO
function NovoPedido({ area, estado, aoFechar, aoCriar }) {
  const [d, setD] = useState({ nome: '', whatsapp: '', tipo: '', cidade: '', origem: 'Indicação' });
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const mudar = (k) => (v) => setD({ ...d, [k]: v });
  async function criar() {
    setErro('');
    if (!d.nome.trim()) return setErro('Escreva o nome.');
    setOcupado(true);
    try {
      if (AMOSTRA) return aoCriar(estado.pedidos[0]);
      const r = await rpc('comercial_pedido_novo', { p_area: area, p: d });
      if (!r.ok) return setErro(r.motivo);
      aoCriar(r.pedido);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }
  return (
    <Janela titulo="Novo pedido" sub="Para quem chegou por telefone, indicação ou pessoalmente." aoFechar={aoFechar}>
      <form className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); criar(); }} noValidate>
        <Campo rotulo="Nome" id="novo-nome" valor={d.nome} aoMudar={mudar('nome')} autoFocus placeholder="" />
        <Campo rotulo="WhatsApp" id="novo-whatsapp" tipo="tel" valor={d.whatsapp} aoMudar={mudar('whatsapp')} placeholder="(11) 98765-4321" />
        <Campo rotulo="Projeto" id="novo-tipo" valor={d.tipo} aoMudar={mudar('tipo')} placeholder="Construir do zero, reforma…" />
        <Campo rotulo="Cidade" id="novo-cidade" valor={d.cidade} aoMudar={mudar('cidade')} placeholder="Cidade/UF" />
        <Campo rotulo="Origem" id="novo-origem" valor={d.origem} aoMudar={mudar('origem')} placeholder="" />
        <Mensagem erro>{erro}</Mensagem>
        <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Botao type="button" onClick={aoFechar}>Cancelar</Botao>
          <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'Criando…' : 'Criar pedido'}</Botao>
        </div>
      </form>
    </Janela>
  );
}
