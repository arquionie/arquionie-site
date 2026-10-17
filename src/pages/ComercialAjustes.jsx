import { useState } from 'react';
import { Botao, Campo, Chave, Icone, Mensagem } from '@/components/Formulario';
import { Confirmacao, Escolha, Grupo, LinkCopiavel } from '@/components/Listas';
import { SITE_URL } from '@/config';
import { mensagemDeErro } from '@/lib/erros';
import { AMOSTRA, AMOSTRA_ESTADO, CHAVES, COM_OPCOES, TIPOS_DE_PERGUNTA, nomeDoTipo, rpc } from '@/lib/comercial';
import { Janela, PontoDaEtapa } from '@/components/ComercialPecas';
import { PerguntaDoCliente } from '@/pages/ComercialPublico';

// Os FORMULÁRIOS (o criador), os AJUSTES e o PRIMEIRO ACESSO do Comercial (mockup crm-gratis, seções 6, 8 e 9, aprovado por ÊDI em
// 16/10/2026). O criador: à esquerda as perguntas em ordem, no meio a escolhida, à direita como o cliente vê. Os ajustes: as etapas
// livres (o tipo é o que os indicadores leem), os preços da ficha, as regras, as mensagens do WhatsApp e os motivos de recusa.

const CAMPO = 'h-amg-altura-campo min-w-0 rounded-toque bg-superficie px-4 text-[16px] ring-1 ring-inset ring-linha focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destaque';
const AREA_DE_TEXTO = 'w-full rounded-dentro bg-superficie p-3.5 text-[16px] ring-1 ring-inset ring-linha focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destaque';

function Subir({ aoClicar, rotulo, desabilitado }) {
  return (
    <button type="button" onClick={aoClicar} disabled={desabilitado} aria-label={rotulo}
      className="grid h-8 w-8 place-items-center rounded-toque bg-superficie-2 text-texto-apagado disabled:opacity-40">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d={rotulo.startsWith('Subir') ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
      </svg>
    </button>
  );
}
const trocar = (lista, i, j) => {
  const c = [...lista];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
};

// ------------------------------------------------------------------------------------------------ os formulários
export function Formularios({ estado, area, aoMudar, aoVoltar }) {
  const [editando, setEditando] = useState(null);
  if (editando) return <Criador estado={estado} area={area} formulario={editando} aoVoltar={() => { setEditando(null); aoMudar(); }} />;
  const novo = { id: null, nome: 'Formulário novo', ativo: true, desvio: {}, perguntas: [{ id: 'dados', tipo: 'contato', texto: 'Para falarmos com você', obrigatoria: true }] };
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={aoVoltar} className="inline-flex items-center gap-1 self-start text-destaque-texto">
        <Icone nome="seta" className="rotate-180" /> Comercial
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-amg-titulo">Formulários</h2>
        <Botao principal type="button" onClick={() => setEditando(novo)}>Novo formulário</Botao>
      </div>
      <Grupo>
        {estado.formularios.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-3 border-t border-linha px-4 py-3 first:border-t-0">
            <div className="min-w-[180px] flex-1">
              <b className="block font-semibold">{f.nome}</b>
              <small className="text-amg-legenda text-texto-apagado">
                {f.pausadoPeloGestor ? 'Pausado pela gestão do Arquionie' : f.ativo ? `No ar · ${f.respostasNoMes} ${f.respostasNoMes === 1 ? 'resposta' : 'respostas'} este mês` : 'Pausado'}
              </small>
            </div>
            <div className="w-full sm:w-[300px]"><LinkCopiavel link={`${SITE_URL}/f/${f.codigo}`} curto={`arquionie.com.br/f/${f.codigo}`} pausado={!f.ativo} /></div>
            <Botao pequeno nivel={2} type="button" onClick={() => setEditando(f)}>Editar</Botao>
          </div>
        ))}
      </Grupo>
    </div>
  );
}

function Criador({ estado, area, formulario, aoVoltar }) {
  const [f, setF] = useState({ ...formulario, perguntas: formulario.perguntas.filter((q) => q.tipo !== 'privacidade') });
  const [sel, setSel] = useState(0);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [origens, setOrigens] = useState(false);
  const [previa, setPrevia] = useState({});
  const q = f.perguntas[sel];
  const mudarQ = (campos) => setF({ ...f, perguntas: f.perguntas.map((x, i) => (i === sel ? { ...x, ...campos } : x)) });
  const anteriores = f.perguntas.slice(0, sel).filter((x) => COM_OPCOES.includes(x.tipo));

  function novaPergunta() {
    let n = f.perguntas.length + 1;
    while (f.perguntas.some((x) => x.id === `p${n}`)) n++;
    setF({ ...f, perguntas: [...f.perguntas, { id: `p${n}`, tipo: 'texto-curto', texto: 'Pergunta nova', obrigatoria: false }] });
    setSel(f.perguntas.length);
  }
  function mudarTipo(tipo) {
    mudarQ({ tipo, ...(COM_OPCOES.includes(tipo) && !q.opcoes?.length ? { opcoes: [{ texto: 'Opção 1' }, { texto: 'Opção 2' }] } : {}) });
  }
  async function publicar() {
    setErro('');
    setAviso('');
    setOcupado(true);
    try {
      if (AMOSTRA) return setAviso('Publicado.');
      const r = await rpc('comercial_formulario_salvar', { p_area: area, p_id: f.id, p: { nome: f.nome, ativo: f.ativo, desvio: f.desvio, perguntas: f.perguntas } });
      if (!r.ok) return setErro(r.motivo);
      setF({ ...r.formulario, perguntas: r.formulario.perguntas.filter((x) => x.tipo !== 'privacidade') });
      setAviso('Publicado.');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={aoVoltar} className="inline-flex items-center gap-1 self-start text-destaque-texto">
        <Icone nome="seta" className="rotate-180" /> Formulários
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Nome do formulário" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-amg-titulo focus-visible:outline-none" />
        <Chave rotulo="No ar" ligada={f.ativo} aoMudar={(v) => setF({ ...f, ativo: v })} />
        <span className="text-texto-apagado">{f.ativo ? 'No ar' : 'Pausado'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {f.codigo && <div className="w-full sm:w-[320px]"><LinkCopiavel link={`${SITE_URL}/f/${f.codigo}`} curto={`arquionie.com.br/f/${f.codigo}`} /></div>}
        <span className="hidden flex-1 sm:block" />
        {f.codigo && <Botao type="button" onClick={() => setOrigens(true)}>Links de origem</Botao>}
        {f.codigo && <Botao type="button" href={`/f/${f.codigo}`} target="_blank" rel="noreferrer">Ver como o cliente</Botao>}
        <Botao principal type="button" onClick={publicar} disabled={ocupado}>{ocupado ? 'Publicando…' : f.id ? 'Publicar mudanças' : 'Publicar'}</Botao>
      </div>
      <Mensagem erro>{erro}</Mensagem>
      <Mensagem>{aviso}</Mensagem>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-2">
          <ol className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">
            {f.perguntas.map((x, i) => (
              <li key={x.id}>
                <button type="button" aria-current={i === sel} onClick={() => setSel(i)}
                  className={`flex w-full items-center gap-3 border-t border-linha px-4 py-2.5 text-left first:border-t-0 ${i === sel ? 'bg-amg-destaque-suave' : ''}`}>
                  <span className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-toque text-amg-rotulo ${i === sel ? 'bg-botao-1 text-botao-1-texto' : 'bg-superficie-2 text-texto-apagado'}`}>{i + 1}</span>
                  <span className="min-w-0">
                    <b className="block truncate font-medium">{x.texto}</b>
                    <small className="text-amg-legenda text-texto-apagado">{nomeDoTipo(x.tipo)}{x.chave ? ' · no card' : ''}{x.opcoes?.some((o) => o.desvio) ? ' · desvio' : ''}</small>
                  </span>
                </button>
              </li>
            ))}
            <li className="flex items-center gap-3 border-t border-linha px-4 py-2.5 text-texto-apagado">
              <span className="grid h-[26px] w-[26px] place-items-center rounded-toque bg-superficie-2"><Icone nome="ok" tamanho={13} /></span>
              <span><b className="block font-medium text-texto">Privacidade</b><small className="text-amg-legenda">Aceite · sempre no fim</small></span>
            </li>
          </ol>
          <Botao nivel={2} cheio type="button" onClick={novaPergunta}>Nova pergunta</Botao>
        </div>

        {q ? (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="rotulo mb-1.5 ml-3.5">Tipo da pergunta {sel + 1}</h3>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo da pergunta">
                {TIPOS_DE_PERGUNTA.map(([id, nome]) => (
                  <button key={id} type="button" role="radio" aria-checked={q.tipo === id} onClick={() => mudarTipo(id)}
                    className={`min-h-botao-pequeno rounded-toque px-3 text-amg-legenda font-medium ${q.tipo === id ? 'bg-botao-1 text-botao-1-texto' : 'bg-superficie-2'}`}>
                    {nome}
                  </button>
                ))}
              </div>
            </div>
            <Campo rotulo="Pergunta" id="q-texto" valor={q.texto} aoMudar={(v) => mudarQ({ texto: v })} placeholder="" />
            <Campo rotulo="Ajuda" id="q-ajuda" valor={q.ajuda ?? ''} aoMudar={(v) => mudarQ({ ajuda: v })} placeholder="Opcional" />
            {COM_OPCOES.includes(q.tipo) && (
              <div>
                <h3 className="rotulo mb-1.5 ml-3.5">Opções</h3>
                <div className="flex flex-col gap-1.5">
                  {(q.opcoes ?? []).map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input aria-label={`Opção ${i + 1}`} value={o.texto} onChange={(e) => mudarQ({ opcoes: q.opcoes.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })}
                        className={`${CAMPO} flex-1`} />
                      {q.tipo !== 'multipla' && (
                        <Botao pequeno nivel={o.desvio ? 1 : 3} type="button" aria-pressed={!!o.desvio}
                          onClick={() => mudarQ({ opcoes: q.opcoes.map((x, j) => (j === i ? { ...x, desvio: !x.desvio } : x)) })}>
                          Desvio
                        </Botao>
                      )}
                      <Botao pequeno type="button" aria-label={`Apagar a opção ${o.texto}`} onClick={() => mudarQ({ opcoes: q.opcoes.filter((_, j) => j !== i) })}>Apagar</Botao>
                    </div>
                  ))}
                  <Botao pequeno type="button" className="self-start" onClick={() => mudarQ({ opcoes: [...(q.opcoes ?? []), { texto: `Opção ${(q.opcoes?.length ?? 0) + 1}` }] })}>
                    Nova opção
                  </Botao>
                </div>
              </div>
            )}
            <Grupo rotulo="Regras">
              <div className="flex min-h-amg-toque-minimo items-center gap-3 px-4">
                <span className="flex-1">Obrigatória</span><Chave rotulo="Obrigatória" ligada={!!q.obrigatoria} aoMudar={(v) => mudarQ({ obrigatoria: v })} />
              </div>
              <div className="flex min-h-amg-toque-minimo flex-wrap items-center gap-3 border-t border-linha px-4 py-2">
                <span className="flex-1">Mostrar no card como</span>
                <select aria-label="Campo do card" value={q.chave ?? ''} onChange={(e) => mudarQ({ chave: e.target.value || null, noCard: !!e.target.value })} className={CAMPO}>
                  {CHAVES.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                </select>
              </div>
              {anteriores.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-linha px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="flex-1">Mostrar só se</span>
                    <Chave rotulo="Mostrar só se" ligada={!!q.mostrarSe}
                      aoMudar={(v) => mudarQ({ mostrarSe: v ? { pergunta: anteriores[0].id, respostas: [anteriores[0].opcoes[0]?.texto].filter(Boolean) } : null })} />
                  </div>
                  {q.mostrarSe && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select aria-label="A pergunta" value={q.mostrarSe.pergunta} onChange={(e) => mudarQ({ mostrarSe: { pergunta: e.target.value, respostas: [] } })} className={CAMPO}>
                        {anteriores.map((x) => <option key={x.id} value={x.id}>{x.texto}</option>)}
                      </select>
                      <span className="text-texto-apagado">for</span>
                      {(anteriores.find((x) => x.id === q.mostrarSe.pergunta)?.opcoes ?? []).map((o) => {
                        const tem = q.mostrarSe.respostas.includes(o.texto);
                        return (
                          <Botao key={o.texto} pequeno nivel={tem ? 1 : 3} type="button" aria-pressed={tem}
                            onClick={() => mudarQ({ mostrarSe: { ...q.mostrarSe, respostas: tem ? q.mostrarSe.respostas.filter((r) => r !== o.texto) : [...q.mostrarSe.respostas, o.texto] } })}>
                            {o.texto}
                          </Botao>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </Grupo>
            {(q.opcoes ?? []).some((o) => o.desvio) && (
              <Grupo rotulo="A mensagem do desvio">
                <div className="flex flex-col gap-2 p-3">
                  <input aria-label="Título do desvio" value={f.desvio?.titulo ?? ''} onChange={(e) => setF({ ...f, desvio: { ...f.desvio, titulo: e.target.value } })}
                    placeholder="Obrigada pelo interesse!" className={CAMPO} />
                  <textarea aria-label="Texto do desvio" rows={3} value={f.desvio?.texto ?? ''} onChange={(e) => setF({ ...f, desvio: { ...f.desvio, texto: e.target.value } })} className={AREA_DE_TEXTO} />
                </div>
              </Grupo>
            )}
            <div className="flex flex-wrap gap-2">
              <Subir rotulo="Subir a pergunta" desabilitado={sel === 0} aoClicar={() => { setF({ ...f, perguntas: trocar(f.perguntas, sel, sel - 1) }); setSel(sel - 1); }} />
              <Subir rotulo="Descer a pergunta" desabilitado={sel === f.perguntas.length - 1} aoClicar={() => { setF({ ...f, perguntas: trocar(f.perguntas, sel, sel + 1) }); setSel(sel + 1); }} />
              <span className="flex-1" />
              <Botao type="button" onClick={() => { let n = 2; while (f.perguntas.some((x) => x.id === `${q.id}-${n}`)) n++; setF({ ...f, perguntas: [...f.perguntas.slice(0, sel + 1), { ...q, id: `${q.id}-${n}`.slice(0, 24) }, ...f.perguntas.slice(sel + 1)] }); }}>
                Duplicar
              </Botao>
              <Botao type="button" disabled={f.perguntas.length <= 1} onClick={() => { setF({ ...f, perguntas: f.perguntas.filter((_, i) => i !== sel) }); setSel(Math.max(0, sel - 1)); }}>Apagar</Botao>
            </div>
          </div>
        ) : <p className="text-texto-apagado">Escolha uma pergunta.</p>}

        <div className="hidden lg:block">
          <div className="sticky top-4 overflow-hidden rounded-[40px] border-[9px] border-texto bg-fundo">
            <div className="flex min-h-[520px] flex-col gap-3 p-4">
              <small className="text-amg-legenda text-texto-apagado">{sel + 1} de {f.perguntas.length}</small>
              {q && (
                <>
                  <h3 className="text-[22px] font-bold leading-tight tracking-[-0.02em]">{q.texto}</h3>
                  {q.ajuda && <p className="-mt-1 text-amg-legenda text-texto-apagado">{q.ajuda}</p>}
                  <PerguntaDoCliente pergunta={q} valor={previa[q.id]} aoMudar={(v) => setPrevia({ ...previa, [q.id]: v })} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {origens && (
        <Janela titulo="Links de origem" sub="Cada link grava de onde o pedido veio, sem perguntar ao cliente." aoFechar={() => setOrigens(false)}>
          <div className="flex flex-col gap-2">
            {[['Instagram', 'instagram'], ['WhatsApp', 'whatsapp'], ['Site', 'site'], ['Indicação', 'indicacao'], ['Google', 'google']].map(([nome, de]) => (
              <div key={de}>
                <h3 className="rotulo mb-1 ml-3.5">{nome}</h3>
                <LinkCopiavel link={`${SITE_URL}/f/${f.codigo}?de=${de}`} curto={`arquionie.com.br/f/${f.codigo}?de=${de}`} />
              </div>
            ))}
          </div>
        </Janela>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ os ajustes
const TIPOS_DE_ETAPA = [['andamento', 'Em andamento'], ['ganho', 'Ganho'], ['perdido', 'Perdido']];

export function Ajustes({ estado, area, aoSalvar, aoVoltar }) {
  const a = estado.ajustes;
  const [etapas, setEtapas] = useState(a.etapas);
  const [regras, setRegras] = useState(a.regras);
  const [mensagens, setMensagens] = useState(a.mensagens);
  const [motivos, setMotivos] = useState(a.motivos);
  const [precos, setPrecos] = useState(a.precos);
  const [whatsapp, setWhatsapp] = useState(a.whatsapp ?? '');
  const [motivoNovo, setMotivoNovo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [fabrica, setFabrica] = useState(false);
  const nome = (id) => etapas.find((e) => e.id === id)?.nome ?? '—';
  const mudarEtapa = (i, campos) => setEtapas(etapas.map((e, j) => (j === i ? { ...e, ...campos } : e)));

  async function salvar(deFabrica) {
    setErro('');
    setOcupado(true);
    try {
      if (AMOSTRA) return aoSalvar({ ...AMOSTRA_ESTADO, ajustes: { ...AMOSTRA_ESTADO.ajustes, etapas, regras, mensagens, motivos, precos, whatsapp } });
      const r = deFabrica ? await rpc('comercial_ajustes_de_fabrica', { p_area: area })
        : await rpc('comercial_ajustes_salvar', { p_area: area, p: { etapas, regras, mensagens, motivos, precos, whatsapp } });
      if (!r.ok) return setErro(r.motivo);
      aoSalvar(r.estado);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  function novaEtapa() {
    let n = etapas.length + 1;
    while (etapas.some((e) => e.id === `etapa-${n}`)) n++;
    const antesDoGanho = etapas.findIndex((e) => e.tipo !== 'andamento');
    const c = [...etapas];
    c.splice(antesDoGanho < 0 ? c.length : antesDoGanho, 0, { id: `etapa-${n}`, nome: 'Etapa nova', cor: '#5D6B80', tipo: 'andamento', aviso: 7 });
    setEtapas(c);
  }

  const REGRAS = [
    ['whatsapp', `O WhatsApp leva de ${nome(regras.whatsapp?.de)} para ${nome(regras.whatsapp?.para)}`],
    ['proposta', `Enviar proposta leva para ${nome(regras.proposta?.para)}`],
    ['reuniao', `A data da reunião leva para ${nome(regras.reuniao?.para)}`],
    ['aceite', `O aceite da proposta leva para ${nome(regras.aceite?.para)}`],
    ['parado', `Parado além do aviso vai para ${nome(regras.parado?.para)}, com o motivo ${regras.parado?.motivo ?? 'Sem resposta'}`],
  ];

  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={aoVoltar} className="inline-flex items-center gap-1 self-start text-destaque-texto">
        <Icone nome="seta" className="rotate-180" /> Comercial
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-amg-titulo">Ajustes</h2>
        <Botao type="button" onClick={() => setFabrica(true)}>Voltar ao modelo de fábrica</Botao>
        <Botao principal type="button" onClick={() => salvar(false)} disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar'}</Botao>
      </div>
      {fabrica && (
        <Confirmacao voltar={() => setFabrica(false)} acao={() => { setFabrica(false); salvar(true); }} rotulo="Voltar ao de fábrica">
          As etapas, as regras, as mensagens, os motivos e os preços voltam ao de fábrica. Os pedidos e os formulários ficam.
        </Confirmacao>
      )}
      <Mensagem erro>{erro}</Mensagem>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Grupo rotulo="Etapas">
            {etapas.map((e, i) => (
              <div key={e.id} className="flex flex-col gap-2 border-t border-linha px-3 py-2.5 first:border-t-0">
                <div className="flex items-center gap-2">
                  <Subir rotulo={`Subir ${e.nome}`} desabilitado={i === 0} aoClicar={() => setEtapas(trocar(etapas, i, i - 1))} />
                  <Subir rotulo={`Descer ${e.nome}`} desabilitado={i === etapas.length - 1} aoClicar={() => setEtapas(trocar(etapas, i, i + 1))} />
                  <input type="color" aria-label={`Cor de ${e.nome}`} value={e.cor} onChange={(ev) => mudarEtapa(i, { cor: ev.target.value.toUpperCase() })}
                    className="h-8 w-8 shrink-0 cursor-pointer rounded-toque bg-transparent" />
                  <input aria-label="Nome da etapa" value={e.nome} maxLength={30} onChange={(ev) => mudarEtapa(i, { nome: ev.target.value })} className={`${CAMPO} h-botao min-w-0 flex-1`} />
                  <Botao pequeno type="button" onClick={() => setEtapas(etapas.filter((_, j) => j !== i))} disabled={etapas.length <= 3}>Apagar</Botao>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:pl-[120px]">
                  <Escolha rotulo={`Tipo de ${e.nome}`} valor={e.tipo} aoMudar={(v) => mudarEtapa(i, { tipo: v })} opcoes={TIPOS_DE_ETAPA} />
                  <label className="flex items-center gap-1.5 text-amg-legenda text-texto-apagado">
                    Avisar parado após
                    <input aria-label={`Aviso de parado de ${e.nome}, em dias`} inputMode="numeric" value={e.aviso ?? ''} placeholder="—"
                      onChange={(ev) => mudarEtapa(i, { aviso: ev.target.value === '' ? null : Number(ev.target.value.replace(/\D/g, '')) })}
                      className="h-botao-pequeno w-[52px] rounded-toque bg-superficie-2 px-2 text-right text-[15px] text-texto" /> dias
                  </label>
                </div>
              </div>
            ))}
            <button type="button" onClick={novaEtapa} className="flex min-h-amg-toque-minimo w-full items-center gap-2 border-t border-linha px-4 font-semibold text-destaque-texto">+ Nova etapa</button>
          </Grupo>

          <Grupo rotulo="Preços da ficha">
            {Object.entries(precos.m2 ?? {}).map(([tipo, valor]) => (
              <div key={tipo} className="flex min-h-amg-toque-minimo items-center gap-3 border-t border-linha px-4 first:border-t-0">
                <span className="flex-1">{tipo}</span>
                <input aria-label={`R$ por m² de ${tipo}`} inputMode="decimal" value={valor} onChange={(e) => setPrecos({ ...precos, m2: { ...precos.m2, [tipo]: Number(e.target.value.replace(/[^\d.]/g, '')) } })}
                  className="h-botao-pequeno w-[100px] rounded-toque bg-superficie-2 px-3 text-right tabular-nums" />
                <span className="w-[104px] whitespace-nowrap text-amg-legenda text-texto-apagado">por m²</span>
              </div>
            ))}
            {[['honorarios', 'Honorários', '% da obra'], ['intermediario', 'Intermediário', '% do completo'], ['basico', 'Básico', '% do completo'],
              ['entrada', 'Entrada', '%'], ['parcelas', 'Parcelas', 'vezes'], ['desconto', 'À vista', '% de desconto'], ['validadeDias', 'Validade', 'dias']].map(([k, rot, un]) => (
              <div key={k} className="flex min-h-amg-toque-minimo items-center gap-3 border-t border-linha px-4">
                <span className="flex-1">{rot}</span>
                <input aria-label={rot} inputMode="decimal" value={precos[k] ?? ''} onChange={(e) => setPrecos({ ...precos, [k]: Number(e.target.value.replace(/[^\d.]/g, '')) })}
                  className="h-botao-pequeno w-[100px] rounded-toque bg-superficie-2 px-3 text-right tabular-nums" />
                <span className="w-[104px] whitespace-nowrap text-amg-legenda text-texto-apagado">{un}</span>
              </div>
            ))}
          </Grupo>
        </div>

        <div className="flex flex-col gap-5">
          <Grupo rotulo="Regras">
            {REGRAS.map(([k, texto]) => (
              <div key={k} className="flex min-h-amg-toque-minimo items-center gap-3 border-t border-linha px-4 py-2 first:border-t-0">
                <span className="flex-1">{texto}</span>
                <Chave rotulo={texto} ligada={!!regras[k]?.liga} aoMudar={(v) => setRegras({ ...regras, [k]: { ...regras[k], liga: v } })} />
              </div>
            ))}
          </Grupo>
          <Grupo rotulo="Mensagens do WhatsApp">
            {[['primeiroContato', 'Primeiro contato'], ['proposta', 'Proposta'], ['retorno', 'Frase do retorno']].map(([k, rot]) => (
              <div key={k} className="flex flex-col gap-1 border-t border-linha px-4 py-2.5 first:border-t-0">
                <small className="text-amg-legenda font-semibold text-texto-apagado">{rot}</small>
                <textarea aria-label={rot} rows={2} value={mensagens[k] ?? ''} onChange={(e) => setMensagens({ ...mensagens, [k]: e.target.value })} className={AREA_DE_TEXTO} />
              </div>
            ))}
            <p className="border-t border-linha px-4 py-2.5 text-amg-legenda text-texto-apagado">
              Variáveis: <code>{'{nome}'}</code> <code>{'{pessoa}'}</code> <code>{'{escritorio}'}</code> <code>{'{link}'}</code> <code>{'{retorno}'}</code> <code>{'{data}'}</code>
            </p>
          </Grupo>
          <Grupo rotulo="Motivos de recusa">
            <div className="flex flex-wrap gap-1.5 p-3">
              {motivos.map((m) => (
                <Botao key={m} pequeno type="button" aria-label={`Tirar o motivo ${m}`} onClick={() => setMotivos(motivos.filter((x) => x !== m))}>{m} ×</Botao>
              ))}
            </div>
            <form className="flex gap-2 border-t border-linha p-3" onSubmit={(e) => { e.preventDefault(); if (motivoNovo.trim()) { setMotivos([...motivos, motivoNovo.trim()]); setMotivoNovo(''); } }}>
              <input aria-label="Motivo novo" value={motivoNovo} maxLength={60} onChange={(e) => setMotivoNovo(e.target.value)} placeholder="Motivo novo" className={`${CAMPO} flex-1`} />
              <Botao nivel={2} type="submit">Pôr</Botao>
            </form>
          </Grupo>
          <Grupo rotulo="O WhatsApp do escritório">
            <div className="p-3">
              <Campo rotulo="WhatsApp" id="aj-whatsapp" tipo="tel" valor={whatsapp} aoMudar={setWhatsapp} placeholder="(11) 3222-8800" />
              <p className="mt-2 px-1 text-amg-legenda text-texto-apagado">O botão Falar no WhatsApp das páginas do cliente.</p>
            </div>
          </Grupo>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ o primeiro acesso
const CORES = ['#E76353', '#A9513F', '#2F7D6D', '#3D6FB6', '#6B4FA0', '#C9973A', '#20252B'];
const MODELOS = [
  ['arquitetura', 'Arquitetura', 'Construir, reformar e regularizar'],
  ['interiores', 'Interiores', 'Ambientes, marcenaria e decoração'],
  ['engenharia', 'Engenharia', 'Estrutural, elétrico e hidrossanitário'],
];

export function PrimeiroAcesso({ estado, aoTerminar }) {
  const [passo, setPasso] = useState(0);
  const [nome, setNome] = useState(estado.escritorio?.includes('@') ? '' : estado.escritorio ?? '');
  const [cor, setCor] = useState('#A9513F');
  const [modelo, setModelo] = useState('arquitetura');
  const [pronto, setPronto] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function gravarEscritorio() {
    setErro('');
    if (!nome.trim()) return setErro('Escreva o nome do escritório.');
    setOcupado(true);
    try {
      if (!AMOSTRA) {
        const atual = await rpc('meu_escritorio');
        const r = await rpc('gravar_escritorio', { p: { ...atual, nome: nome.trim(), cor, termo: atual?.termo ?? null } });
        if (r && r.ok === false) return setErro(r.motivo);
      }
      setPasso(1);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }
  async function iniciar() {
    setErro('');
    setOcupado(true);
    try {
      const e = AMOSTRA ? AMOSTRA_ESTADO : await rpc('comercial_iniciar', { p_modelo: modelo });
      setPronto(e);
      setPasso(2);
    } catch (er) {
      setErro(mensagemDeErro(er));
    } finally {
      setOcupado(false);
    }
  }
  const pontos = (
    <div className="flex gap-1.5" aria-label={`Passo ${passo + 1} de 3`}>
      {[0, 1, 2].map((i) => <span key={i} className={`h-2 rounded-toque ${i === passo ? 'w-[22px] bg-botao-1' : 'w-2 bg-linha'}`} />)}
    </div>
  );
  const codigo = pronto?.formularios?.[0]?.codigo;
  return (
    <section className="px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-4 rounded-cartao bg-superficie p-5 shadow-cartao sm:p-6">
        {pontos}
        {passo === 0 && (
          <>
            <h1 className="text-amg-titulo">O seu escritório</h1>
            <p className="text-texto-apagado">O nome e a cor vão no formulário e na proposta que o cliente abre. A logo, você troca em Minha conta.</p>
            <Campo rotulo="Nome" id="pa-nome" valor={nome} aoMudar={setNome} placeholder="Lima Arquitetura" autoFocus />
            <div>
              <h2 className="rotulo mb-2 ml-1">Cor</h2>
              <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Cor do escritório">
                {CORES.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={cor === c} aria-label={`Cor ${c}`} onClick={() => setCor(c)}
                    className={`h-[34px] w-[34px] rounded-toque ${cor === c ? 'ring-2 ring-texto ring-offset-2 ring-offset-superficie' : ''}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <Mensagem erro>{erro}</Mensagem>
            <Botao principal grande cheio type="button" onClick={gravarEscritorio} disabled={ocupado}>Continuar</Botao>
          </>
        )}
        {passo === 1 && (
          <>
            <h1 className="text-amg-titulo">Como você trabalha?</h1>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Jeito de trabalhar">
              {MODELOS.map(([id, titulo, sub]) => (
                <button key={id} type="button" role="radio" aria-checked={modelo === id} onClick={() => setModelo(id)}
                  className={`flex items-center gap-3 rounded-cartao px-4 py-3.5 text-left ring-inset ${modelo === id ? 'bg-amg-destaque-suave ring-2 ring-botao-1' : 'ring-1 ring-linha'}`}>
                  <span className="flex-1"><b className="block font-semibold">{titulo}</b><small className="text-amg-legenda text-texto-apagado">{sub}</small></span>
                  <span className={`grid h-6 w-6 place-items-center rounded-toque ${modelo === id ? 'bg-botao-1 text-botao-1-texto' : 'ring-2 ring-inset ring-linha'}`}>
                    {modelo === id && <Icone nome="ok" tamanho={13} />}
                  </span>
                </button>
              ))}
            </div>
            <Mensagem erro>{erro}</Mensagem>
            <div className="grid grid-cols-2 gap-2">
              <Botao grande type="button" onClick={() => setPasso(0)}>Voltar</Botao>
              <Botao grande principal type="button" onClick={iniciar} disabled={ocupado}>{ocupado ? 'Preparando…' : 'Continuar'}</Botao>
            </div>
          </>
        )}
        {passo === 2 && (
          <>
            <span className="grid h-16 w-16 place-items-center rounded-toque bg-amg-sucesso-suave text-sucesso"><Icone nome="ok" tamanho={30} /></span>
            <h1 className="text-amg-titulo">Seu formulário está no ar</h1>
            <p className="text-texto-apagado">Ponha o link na bio do Instagram ou mande no WhatsApp.</p>
            {codigo && <LinkCopiavel link={`${SITE_URL}/f/${codigo}`} curto={`arquionie.com.br/f/${codigo}`} />}
            <Botao principal grande cheio type="button" onClick={() => aoTerminar(pronto)}>Abrir o Comercial</Botao>
          </>
        )}
      </div>
    </section>
  );
}
