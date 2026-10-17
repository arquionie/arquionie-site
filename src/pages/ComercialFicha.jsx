import { useEffect, useMemo, useState } from 'react';
import { Botao, Campo, Etiqueta, Icone, Mensagem } from '@/components/Formulario';
import { Confirmacao, Escolha, Grupo } from '@/components/Listas';
import { SITE_URL } from '@/config';
import { mensagemDeErro } from '@/lib/erros';
import { copiarTexto } from '@/lib/licencas';
import { whatsappLegivel } from '@/lib/equipe';
import {
  AMOSTRA, amostraDoPedido, calcularOrcamento, conteudoDaProposta, dataCurta, dataHora, escopoDoPacote, etiquetaDoPedido, funcao, hojeISO,
  linkWhatsApp, mesAno, reais, rpc,
} from '@/lib/comercial';
import { BotaoWhatsApp, Janela, PontoDaEtapa, abrirWhatsApp } from '@/components/ComercialPecas';

// O ORÇAMENTO (a ficha do pedido), no padrão do sistema Palheta e no jeito das listas do iPhone (mockup crm-gratis, seção 3, aprovado
// por ÊDI em 16/10/2026): abre ao lado do quadro no computador e sobe de baixo como uma folha no celular. As partes em ordem: dados
// gerais, projeto, valor (a obra pelo m², os três pacotes e o escopo), pagamento, controle, observações e a linha do tempo.

const TEXTO_DA_ATIVIDADE = {
  chegou: (d) => `Chegou pelo formulário ${d.formulario ?? ''}${d.origem ? `, pelo link do ${d.origem}` : ''}`,
  criado: () => 'Criado à mão',
  etapa: (d, nome) => `Foi para ${nome(d.para)}${d.motivo ? ` (${d.motivo})` : ''}`,
  whatsapp: () => 'Chamou no WhatsApp',
  proposta: (d) => `Enviou a proposta (${{ pdf: 'PDF', link: 'link', modelo: 'modelo do Arquionie' }[d.jeito] ?? d.jeito})`,
  abriu: (d) => `Abriu a proposta${d.vez > 1 ? ` pela ${d.vez}ª vez` : ''}`,
  aceite: (d) => `${d.nome} aceitou a proposta${d.pacote ? ` (pacote ${d.pacote})` : ''}`,
  anotacao: (d) => d.texto,
  reuniao: (d) => `Reunião marcada para ${dataHora(d.em)}`,
  retorno: (d) => `Retorno combinado para ${dataCurta(d.data)}`,
};

function Parte({ titulo, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="rotulo ml-3.5">{titulo}</h3>
      {children}
    </section>
  );
}

const CAMPO_PEQUENO = 'h-amg-altura-campo w-full rounded-toque bg-superficie px-4 text-[16px] ring-1 ring-inset ring-linha focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destaque';

export default function Ficha({ area, id, estado, aoFechar, aoMudar }) {
  const [p, setP] = useState(null);
  const [d, setD] = useState({});
  const [o, setO] = useState({});
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [respostas, setRespostas] = useState(false);
  const [enviar, setEnviar] = useState(false);
  const [motivo, setMotivo] = useState(null);
  const [excluir, setExcluir] = useState(false);
  const [nota, setNota] = useState('');
  const precos = estado.ajustes.precos;
  const etapas = estado.ajustes.etapas;
  const nomeDaEtapa = (eid) => etapas.find((e) => e.id === eid)?.nome ?? eid;

  async function carregar() {
    setErro('');
    try {
      const r = AMOSTRA ? { ok: true, pedido: amostraDoPedido(estado.pedidos.find((x) => x.id === id) ?? estado.pedidos[0]) } : await rpc('comercial_pedido', { p_area: area, p_id: id });
      if (!r.ok) return setErro(r.motivo);
      const x = r.pedido;
      setP(x);
      setD({ nome: x.nome, whatsapp: whatsappLegivel(x.whatsapp), email: x.email, cidade: x.cidade, origem: x.origem, tipo: x.tipo, obra: x.obra,
        inicio: x.inicio, observacoes: x.observacoes, nota: x.nota ?? '', retorno: x.retorno ?? '', reuniao: x.reuniao ? x.reuniao.slice(0, 16) : '' });
      const tipoDoProjeto = x.orcamento?.tipo ?? Object.keys(precos.m2 ?? {}).find((k) => (x.tipo ?? '').toLowerCase().startsWith(k.toLowerCase().slice(0, 6)))
        ?? Object.keys(precos.m2 ?? {})[0];
      setO({ nome: '', area: x.area ?? '', pavimentos: 1, tipo: tipoDoProjeto, m2: precos.m2?.[tipoDoProjeto] ?? '', honorarios: precos.honorarios, escolhido: 'completo', ...x.orcamento });
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }
  useEffect(() => {
    carregar();
  }, [id]);

  const conta = useMemo(() => calcularOrcamento(o, precos), [o, precos]);
  if (!p && !erro) return <Folha aoFechar={aoFechar}><p className="text-texto-apagado">Carregando…</p></Folha>;
  if (!p) return <Folha aoFechar={aoFechar}><Mensagem erro>{erro}</Mensagem></Folha>;

  const etapa = etapas.find((e) => e.id === p.etapa);
  const etq = etiquetaDoPedido(p, etapa);
  const mudar = (k) => (v) => setD({ ...d, [k]: v });
  const mudarO = (k) => (v) => setO({ ...o, [k]: v, ...(k === 'tipo' ? { m2: precos.m2?.[v] ?? o.m2 } : {}) });
  const proposta = p.propostas?.[0];

  async function salvar() {
    setErro('');
    setAviso('');
    setSalvando(true);
    try {
      const corpo = { ...d, nota: d.nota === '' ? null : Number(d.nota), retorno: d.retorno || null, reuniao: d.reuniao ? new Date(d.reuniao).toISOString() : null,
        area: o.area === '' ? null : Number(o.area), orcamento: o, valor: conta.escolhido.valor > 0 ? String(conta.escolhido.valor) : p.valor === null ? null : String(p.valor) };
      if (AMOSTRA) return setAviso('Salvo.');
      const r = await rpc('comercial_pedido_salvar', { p_area: area, p_id: id, p: corpo });
      if (!r.ok) return setErro(r.motivo);
      setAviso('Salvo.');
      await carregar();
      aoMudar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function moverPara(eid, m) {
    const e = etapas.find((x) => x.id === eid);
    if (e?.tipo === 'perdido' && !m) return setMotivo(eid);
    setMotivo(null);
    if (AMOSTRA) return setP({ ...p, etapa: eid, motivo: m ?? '' });
    try {
      const r = await rpc('comercial_pedido_mover', { p_area: area, p_id: id, p_etapa: eid, p_motivo: m ?? null });
      if (!r.ok) return setErro(r.motivo);
      await carregar();
      aoMudar();
    } catch (er) {
      setErro(mensagemDeErro(er));
    }
  }

  async function anotar() {
    if (!nota.trim()) return;
    try {
      if (!AMOSTRA) {
        const r = await rpc('comercial_anotar', { p_area: area, p_id: id, p_texto: nota });
        if (!r.ok) return setErro(r.motivo);
        setP(r.pedido);
      }
      setNota('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function apagar() {
    try {
      if (!AMOSTRA) {
        const r = await rpc('comercial_pedido_excluir', { p_area: area, p_id: id });
        if (!r.ok) return setErro(r.motivo);
      }
      aoMudar();
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <Folha aoFechar={aoFechar} titulo={p.nome}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-amg-titulo">{p.nome}</h2>
          <p className="mt-0.5 text-amg-legenda text-texto-apagado">
            {[p.tipo, p.cidade].filter(Boolean).join(' · ')}{p.tipo || p.cidade ? ' · ' : ''}chegou em {dataCurta(p.criadoEm)}{p.origem ? ` pelo ${p.origem}` : ''}
          </p>
        </div>
        <button type="button" onClick={aoFechar} aria-label="Fechar o orçamento" className="grid h-9 w-9 shrink-0 place-items-center rounded-toque bg-superficie-2 text-texto-apagado">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative inline-flex h-botao-pequeno items-center gap-2 rounded-toque bg-superficie pl-3 pr-8 text-amg-legenda font-semibold ring-1 ring-inset ring-linha">
          <PontoDaEtapa cor={etapa?.cor} />
          <span className="sr-only">Etapa</span>
          <select value={p.etapa} onChange={(e) => moverPara(e.target.value)} className="appearance-none bg-transparent pr-1 focus-visible:outline-none">
            {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <Icone nome="abaixo" tamanho={14} className="pointer-events-none absolute right-3 text-texto-apagado" />
        </label>
        {etq && <Etiqueta tipo={etq.tipo}>{etq.texto}</Etiqueta>}
        <span className="flex-1" />
        {p.whatsapp && <BotaoWhatsApp aoClicar={() => abrirWhatsApp(area, p, () => { carregar(); aoMudar(); }, setErro)} />}
        <Botao principal type="button" onClick={() => setEnviar(true)}>Enviar proposta</Botao>
      </div>
      {motivo && (
        <div className="flex flex-col gap-2 rounded-dentro bg-amg-destaque-suave p-3 text-destaque-texto">
          <span>Por que este pedido não seguiu?</span>
          <div className="flex flex-wrap gap-2">
            {estado.ajustes.motivos.map((m) => <Botao key={m} pequeno type="button" onClick={() => moverPara(motivo, m)}>{m}</Botao>)}
            <Botao pequeno type="button" onClick={() => setMotivo(null)}>Cancelar</Botao>
          </div>
        </div>
      )}

      {proposta && (
        <div className="flex flex-wrap items-center gap-2 rounded-cartao bg-amg-informacao-suave px-4 py-3">
          <span className="min-w-0 flex-1">
            <b className="block font-semibold">{proposta.aceite ? `Aceita por ${proposta.aceite.nome}` : `Proposta enviada em ${dataCurta(proposta.enviadaEm)}`}</b>
            <small className="text-amg-legenda text-amg-informacao">
              {proposta.aceite ? `Pacote ${proposta.aceite.pacote ?? ''} · ${reais(proposta.aceite.valor)}`
                : proposta.aberturas ? `Abriu ${proposta.aberturas} ${proposta.aberturas === 1 ? 'vez' : 'vezes'}, a última ${dataHora(proposta.ultimaAbertura)}` : 'Ainda não abriu'}
            </small>
          </span>
          <Botao pequeno type="button" onClick={() => copiarTexto(`${SITE_URL}/p/${proposta.codigo}`)}>Copiar link</Botao>
          <Botao pequeno nivel={2} href={`/p/${proposta.codigo}`} target="_blank" rel="noreferrer">Ver</Botao>
        </div>
      )}

      <Parte titulo="Dados gerais">
        <div className="grid gap-2 sm:grid-cols-2">
          <Campo rotulo="Nome" id="f-nome" valor={d.nome} aoMudar={mudar('nome')} placeholder="" />
          <Campo rotulo="WhatsApp" id="f-whatsapp" tipo="tel" valor={d.whatsapp} aoMudar={mudar('whatsapp')} placeholder="" />
          <Campo rotulo="E-mail" id="f-email" tipo="email" valor={d.email} aoMudar={mudar('email')} placeholder="" />
          <Campo rotulo="Cidade" id="f-cidade" valor={d.cidade} aoMudar={mudar('cidade')} placeholder="" />
          <Campo rotulo="Objetivo" id="f-tipo" valor={d.tipo} aoMudar={mudar('tipo')} placeholder="" />
          <Campo rotulo="Origem" id="f-origem" valor={d.origem} aoMudar={mudar('origem')} placeholder="" />
          <Campo rotulo="Obra" id="f-obra" valor={d.obra} aoMudar={mudar('obra')} placeholder="" />
          <Campo rotulo="Início" id="f-inicio" tipo={!d.inicio || /^\d{4}-\d{2}$/.test(d.inicio) ? 'month' : 'text'} valor={d.inicio ?? ''} aoMudar={mudar('inicio')} placeholder="" />
        </div>
        {p.respostas?.length > 0 && (
          <>
            <Botao pequeno type="button" aria-expanded={respostas} onClick={() => setRespostas(!respostas)} className="self-start">
              {respostas ? 'Esconder as respostas' : `Ver as ${p.respostas.length} respostas do formulário`}
            </Botao>
            {respostas && (
              <Grupo>
                {p.respostas.map((r) => (
                  <div key={r.id} className="border-t border-linha px-4 py-2.5 first:border-t-0">
                    <small className="block text-amg-legenda text-texto-apagado">{r.texto}</small>
                    <span className="break-words">{typeof r.valor === 'object' && r.valor !== null && !Array.isArray(r.valor)
                      ? [r.valor.nome, whatsappLegivel(r.valor.whatsapp), r.valor.email].filter(Boolean).join(' · ')
                      : Array.isArray(r.valor) ? r.valor.join(', ') : r.tipo === 'mes-ano' ? mesAno(r.valor) : r.tipo === 'data' ? dataCurta(r.valor)
                      : r.tipo === 'area' ? `${r.valor} m²` : String(r.valor)}</span>
                  </div>
                ))}
              </Grupo>
            )}
          </>
        )}
      </Parte>

      <Parte titulo="Projeto">
        <div className="grid gap-2 sm:grid-cols-2">
          <Campo rotulo="Nome" id="o-nome" valor={o.nome ?? ''} aoMudar={mudarO('nome')} placeholder="Casa térrea" />
          <label className="flex h-amg-altura-campo items-center gap-2.5 rounded-toque bg-superficie pl-[18px] pr-3 ring-1 ring-inset ring-linha">
            <span className="text-amg-legenda text-texto-apagado">Tipo</span>
            <select value={o.tipo ?? ''} onChange={(e) => mudarO('tipo')(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[16px] focus-visible:outline-none">
              {Object.keys(precos.m2 ?? {}).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <Campo rotulo="Área" id="o-area" valor={o.area ?? ''} aoMudar={mudarO('area')} inputMode="decimal" dica="m²" placeholder="" />
          <Campo rotulo="Pavimentos" id="o-pav" valor={o.pavimentos ?? ''} aoMudar={mudarO('pavimentos')} inputMode="numeric" placeholder="" />
        </div>
      </Parte>

      <Parte titulo="Valor">
        <div className="flex flex-col gap-3 rounded-cartao bg-superficie p-4 shadow-cartao">
          <div className="flex flex-wrap items-center gap-1.5 text-texto-apagado">
            <b className="text-texto tabular-nums">{o.area || 0} m²</b> ×
            <input aria-label="R$ por m² de obra" value={o.m2 ?? ''} onChange={(e) => mudarO('m2')(e.target.value)} inputMode="decimal"
              className="w-[110px] rounded-toque bg-superficie-2 px-3 py-1 text-right tabular-nums text-texto" />
            / m² = <b className="text-texto tabular-nums">{reais(conta.obra)}</b> de obra ·
            <input aria-label="Honorários, em porcentagem da obra" value={o.honorarios ?? ''} onChange={(e) => mudarO('honorarios')(e.target.value)} inputMode="decimal"
              className="w-[56px] rounded-toque bg-superficie-2 px-2 py-1 text-right tabular-nums text-texto" />% de honorários
          </div>
          <div role="radiogroup" aria-label="Pacote escolhido" className="grid grid-cols-3 gap-2">
            {conta.pacotes.map((k) => (
              <button key={k.id} type="button" role="radio" aria-checked={conta.escolhido.id === k.id} onClick={() => mudarO('escolhido')(k.id)}
                className={`min-w-0 rounded-dentro px-2.5 py-2.5 text-left ring-inset sm:px-3 ${conta.escolhido.id === k.id ? 'bg-amg-destaque-suave ring-2 ring-botao-1' : 'ring-1 ring-linha'}`}>
                <small className={`block text-amg-legenda ${conta.escolhido.id === k.id ? 'text-destaque-texto' : 'text-texto-apagado'}`}>{k.nome}</small>
                <b className="block whitespace-nowrap text-[15px] font-bold tabular-nums sm:text-[17px]">{reais(k.valor)}</b>
              </button>
            ))}
          </div>
          <div>
            <table className="w-full text-amg-legenda">
              <thead>
                <tr className="text-texto-apagado"><th className="py-1.5 text-left font-semibold">Escopo</th>{conta.pacotes.map((k) => (
                  <th key={k.id} className="w-[64px] py-1.5 font-semibold sm:w-[84px]">
                    <span className="sm:hidden">{k.nome.length > 9 ? `${k.nome.slice(0, 6)}.` : k.nome}</span><span className="hidden sm:inline">{k.nome}</span>
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {(precos.escopo ?? []).map((e) => (
                  <tr key={e.item} className="border-t border-linha">
                    <td className="py-2">{e.item}</td>
                    {conta.pacotes.map((k) => (
                      <td key={k.id} className="text-center">
                        {escopoDoPacote(precos.escopo, k.id).includes(e.item) ? <Icone nome="ok" tamanho={15} className="mx-auto text-sucesso" /> : <span className="text-texto-apagado" aria-label="não inclui">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Parte>

      <Parte titulo="Pagamento">
        <div className="grid gap-2 sm:grid-cols-3">
          <Campo rotulo="Entrada" id="o-entrada" valor={o.entrada ?? precos.entrada} aoMudar={mudarO('entrada')} inputMode="decimal" dica="%" placeholder="" />
          <Campo rotulo="Parcelas" id="o-parcelas" valor={o.parcelas ?? precos.parcelas} aoMudar={mudarO('parcelas')} inputMode="numeric" placeholder="" />
          <Campo rotulo="À vista" id="o-desconto" valor={o.desconto ?? precos.desconto} aoMudar={mudarO('desconto')} inputMode="decimal" dica="% off" placeholder="" />
        </div>
        <p className="ml-3.5 text-amg-legenda text-texto-apagado">
          Entrada de <b className="tabular-nums text-texto">{reais(conta.entrada)}</b> e {conta.parcelas} × <b className="tabular-nums text-texto">{reais(conta.parcela)}</b>,
          ou <b className="tabular-nums text-texto">{reais(conta.avista)}</b> à vista.
        </p>
      </Parte>

      <Parte titulo="Controle">
        <div className="grid gap-2 sm:grid-cols-2">
          <Campo rotulo="Reunião" id="f-reuniao" tipo="datetime-local" valor={d.reuniao} aoMudar={mudar('reuniao')} placeholder="" />
          <Campo rotulo="Retorno" id="f-retorno" tipo="date" valor={d.retorno} aoMudar={mudar('retorno')} min={hojeISO()} placeholder="" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="ml-3.5 text-texto-apagado">Nota</span>
          <Escolha rotulo="Nota do pedido" valor={String(d.nota)} aoMudar={(v) => setD({ ...d, nota: v })} opcoes={['0', '1', '2', '3', '4', '5'].map((n) => [n, n])} />
        </div>
        <textarea aria-label="Observações" rows={3} value={d.observacoes ?? ''} onChange={(e) => mudar('observacoes')(e.target.value)} placeholder="Observações"
          className="w-full rounded-dentro bg-superficie p-4 text-[16px] ring-1 ring-inset ring-linha focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destaque" />
      </Parte>

      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-2 bg-fundo px-5 py-3 sm:-mx-6 sm:px-6">
        <span className="flex-1" role="status">{aviso && <span className="text-sucesso">{aviso}</span>}</span>
        <Botao principal type="button" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Botao>
      </div>
      <Mensagem erro>{erro}</Mensagem>

      <Parte titulo="Linha do tempo">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1"><Campo rotulo="Anotar" id="f-anotar" valor={nota} aoMudar={setNota} placeholder="Ligou, pediu para retornar na sexta…" /></div>
          <Botao type="button" onClick={anotar} disabled={!nota.trim()}>Anotar</Botao>
        </div>
        <ol className="flex flex-col rounded-cartao bg-superficie px-4 py-2 shadow-cartao">
          {(p.linhaDoTempo ?? []).map((t, i) => (
            <li key={i} className="relative ml-1.5 border-l-2 border-linha py-2 pl-5">
              <span aria-hidden="true" className="absolute -left-[7px] top-[13px] h-3 w-3 rounded-toque bg-superficie ring-[3px] ring-inset ring-botao-1" />
              <b className="block font-medium">{(TEXTO_DA_ATIVIDADE[t.tipo] ?? (() => t.tipo))(t.dados ?? {}, nomeDaEtapa)}</b>
              <small className="text-amg-legenda text-texto-apagado">{dataHora(t.em)}{t.por ? ` · ${t.por}` : ''}</small>
            </li>
          ))}
        </ol>
      </Parte>

      {estado.responsavel && (
        excluir ? (
          <Confirmacao voltar={() => setExcluir(false)} acao={apagar} rotulo="Excluir de vez">
            Excluir apaga o pedido, as respostas e as propostas de vez. Não dá para desfazer.
          </Confirmacao>
        ) : (
          <Botao type="button" onClick={() => setExcluir(true)} className="self-start">Excluir o pedido</Botao>
        )
      )}

      {enviar && <EnviarProposta area={area} pedido={p} orcamento={o} estado={estado} aoFechar={() => setEnviar(false)}
        aoEnviar={() => { setEnviar(false); carregar(); aoMudar(); }} />}
    </Folha>
  );
}

/** A folha: ao lado no computador, de baixo no celular, com o fundo atrás escurecido. */
function Folha({ aoFechar, titulo, children }) {
  useEffect(() => {
    const fechar = (e) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-40 bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <aside role="dialog" aria-modal="true" aria-label={titulo ? `Orçamento de ${titulo}` : 'Orçamento'}
        className="absolute inset-x-0 bottom-0 top-12 flex flex-col gap-5 overflow-y-auto rounded-t-cartao bg-fundo px-5 pb-6 pt-2 shadow-amg-janela sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:w-[640px] sm:rounded-none sm:px-6 sm:pt-6">
        <span aria-hidden="true" className="mx-auto h-[5px] w-10 shrink-0 rounded-toque bg-linha sm:hidden" />
        {children}
      </aside>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ ENVIAR PROPOSTA
function EnviarProposta({ area, pedido, orcamento, estado, aoFechar, aoEnviar }) {
  const [jeito, setJeito] = useState('modelo');
  const [link, setLink] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [quantos, setQuantos] = useState('todos');
  const [retorno, setRetorno] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState('');
  const conteudo = conteudoDaProposta(pedido, { ...orcamento, pacotesNaProposta: quantos === 'um' ? 'um' : 'todos' }, estado.ajustes.precos);
  const temValor = conteudo.pacotes.some((k) => k.valor > 0);
  const escolhido = calcularOrcamento(orcamento, estado.ajustes.precos).escolhido;
  const textoRetorno = retorno ? estado.ajustes.mensagens.retorno?.replace('{data}', dataCurta(retorno)) ?? '' : '';
  const previa = (estado.ajustes.mensagens.proposta ?? '')
    .replace('{nome}', pedido.nome.split(' ')[0]).replace('{escritorio}', estado.escritorio).replace('{pessoa}', '')
    .replace('{link}', 'arquionie.com.br/p/········').replace('{retorno}', textoRetorno).replace(/ {2,}/g, ' ').trim();

  async function criar(como) {
    setErro('');
    if (jeito === 'modelo' && !temValor) return setErro('Faça o valor no orçamento primeiro (a área e o R$/m²).');
    if (jeito === 'link' && !/^https:\/\/\S+$/.test(link.trim())) return setErro('Cole um link que comece com https://.');
    if (jeito === 'pdf' && !arquivo) return setErro('Escolha o PDF.');
    if (jeito === 'pdf' && arquivo.size > 10 * 1024 * 1024) return setErro('O PDF vai até 10 MB.');
    if (como === 'whatsapp' && !pedido.whatsapp) return setErro('Este pedido não tem WhatsApp. Escreva o número no orçamento.');
    const janela = como === 'whatsapp' ? window.open('', '_blank') : null;
    setOcupado(como);
    try {
      const r = AMOSTRA
        ? { ok: true, codigo: 'QX7M2KAB', whatsapp: pedido.whatsapp, texto: previa.replace('········', 'QX7M2KAB') }
        : await rpc('comercial_proposta_criar', { p_area: area, p_pedido: pedido.id, p: {
          jeito, link: jeito === 'link' ? link.trim() : null, conteudo: jeito === 'modelo' ? conteudo : null,
          valor: escolhido.valor > 0 ? String(escolhido.valor) : null, retorno: retorno || null } });
      if (!r.ok) {
        janela?.close();
        return setErro(r.motivo);
      }
      if (jeito === 'pdf' && !AMOSTRA) {
        const sub = await funcao({ acao: 'pdf', codigo: r.codigo, tamanho: arquivo.size });
        if (!sub.ok) {
          janela?.close();
          return setErro(sub.motivo ?? 'Não deu para subir o PDF.');
        }
        const put = await fetch(sub.url, { method: 'PUT', body: arquivo, headers: { 'Content-Type': 'application/pdf' } });
        if (!put.ok) {
          janela?.close();
          return setErro('O PDF não subiu. Tente de novo.');
        }
      }
      if (como === 'copiar') await copiarTexto(`${SITE_URL}/p/${r.codigo}`);
      if (como === 'whatsapp') {
        const url = linkWhatsApp(r.whatsapp, r.texto);
        if (janela) janela.location.href = url;
        else window.location.href = url;
      }
      aoEnviar();
    } catch (e) {
      janela?.close();
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado('');
    }
  }

  return (
    <Janela titulo="Enviar proposta" sub={`${pedido.nome}${pedido.whatsapp ? ` · ${whatsappLegivel(pedido.whatsapp)}` : ''}`} aoFechar={aoFechar}>
      <Escolha rotulo="Jeito da proposta" valor={jeito} aoMudar={setJeito} opcoes={[['pdf', 'PDF'], ['link', 'Link'], ['modelo', 'Modelo do Arquionie']]} />
      {jeito === 'modelo' && (
        temValor ? (
          <>
            <Grupo rotulo="Do orçamento">
              {conteudo.pacotes.map((k) => (
                <div key={k.nome} className="flex min-h-amg-toque-minimo items-center gap-3 border-t border-linha px-4 first:border-t-0">
                  <span className="flex-1">{k.nome}</span><b className="whitespace-nowrap font-semibold tabular-nums">{reais(k.valor)}</b>
                </div>
              ))}
              <div className="flex min-h-amg-toque-minimo items-center gap-3 border-t border-linha px-4 text-texto-apagado">
                {conteudo.pagamento.entrada}% e {conteudo.pagamento.parcelas} parcelas, ou {conteudo.pagamento.desconto}% à vista
              </div>
            </Grupo>
            <Escolha rotulo="Pacotes na proposta" valor={quantos} aoMudar={setQuantos} opcoes={[['todos', 'Os três pacotes'], ['um', `Só o ${escolhido.nome}`]]} />
          </>
        ) : (
          <p className="rounded-dentro bg-amg-destaque-suave px-4 py-3 text-destaque-texto">Faça o valor no orçamento primeiro: a área e o R$/m² montam os pacotes.</p>
        )
      )}
      {jeito === 'link' && <Campo rotulo="Link" id="p-link" tipo="url" valor={link} aoMudar={setLink} placeholder="https://www.canva.com/…" />}
      {jeito === 'pdf' && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-dentro border-2 border-dashed border-linha bg-superficie px-4 py-6 text-center text-texto-apagado">
          <b className="text-texto">{arquivo ? arquivo.name : 'Escolha o PDF'}</b>
          {arquivo ? `${(arquivo.size / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : 'até 10 MB'}
          <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        </label>
      )}
      <Campo rotulo="Retorno" id="p-retorno" tipo="date" valor={retorno} aoMudar={setRetorno} min={hojeISO()} placeholder="" />
      <div>
        <h3 className="rotulo mb-1.5 ml-3.5">Mensagem</h3>
        <p className="whitespace-pre-line rounded-[18px_18px_18px_6px] bg-amg-whatsapp-suave px-4 py-3">{previa}</p>
      </div>
      <Mensagem erro>{erro}</Mensagem>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Botao type="button" onClick={aoFechar}>Cancelar</Botao>
        <Botao nivel={2} type="button" disabled={!!ocupado} onClick={() => criar('copiar')}><Icone nome="copiar" tamanho={15} />{ocupado === 'copiar' ? 'Criando…' : 'Copiar link'}</Botao>
        <Botao type="button" disabled={!!ocupado} onClick={() => criar('whatsapp')} className="!bg-amg-whatsapp !text-fundo">
          {ocupado === 'whatsapp' ? 'Abrindo…' : 'Enviar pelo WhatsApp'}
        </Botao>
      </div>
    </Janela>
  );
}
