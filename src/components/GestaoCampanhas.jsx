// CAMPANHAS no /gestao (plano 18; mockup aprovado em 15/10/2026): a campanha de e-mail do Flow, agora no Arquionie. O texto
// com as variáveis, a oferta com o botão do WhatsApp, os destinatários (cadastros do Flow e contas que querem novidades,
// sem quem tem licença nem quem pediu para sair) e o ritmo: LOTE e-mails a cada INTERVALO minutos, até LIMITE por dia.
// A fila fica no banco; quem manda é a função do servidor chamada pelo pg_cron.
// No modo AMIGÁVEL desde o mockup gestao-amigavel (ÊDI, 16/10/2026).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Botao, Campo, Etiqueta, Icone, Lista, Mensagem } from '@/components/Formulario';
import { Confirmacao, Grupo, Linha, TextoDaLinha } from '@/components/Listas';
import { Busca, Cabecalho, Numero, Numeros, Painel } from '@/components/GestaoPecas';
import {
  cancelarCampanha, criarCampanha, dia, lerCampanhas, lerCupons, lerDestinatarios, MODELOS, pausarCampanha, quando, retomarCampanha,
  testarCampanha,
} from '@/lib/gestaoFlow';

const POR_PAGINA = 10;
const minutosAte = (iso) => Math.max(0, Math.round((new Date(iso) - Date.now()) / 6e4));

// Os grupos da lista Destinatários (no lugar dos links TODOS / NUNCA RECEBERAM / NENHUM). "Escolhidos na lista" aparece sozinho
// quando se marca ou desmarca alguém um a um.
const GRUPOS = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'nunca', rotulo: 'Nunca receberam' },
  { valor: 'nenhum', rotulo: 'Nenhum' },
  { valor: 'mao', rotulo: 'Escolhidos na lista' },
];

// A caixa de várias linhas: o único campo que não é cápsula (raio-dentro, 12 px; aprovado no mockup gestao-amigavel).
const CAIXA = 'rounded-dentro bg-superficie px-4 py-3 ring-1 ring-inset ring-linha focus-within:ring-2 focus-within:ring-destaque';

function Andamento({ c, aoMudar, setErro }) {
  const [confirmar, setConfirmar] = useState(false);
  const pct = c.total ? Math.round((100 * c.enviados) / c.total) : 0;
  async function agir(fn) {
    const r = await fn(c.id);
    if (r?.ok === false) setErro(r.motivo ?? 'Não deu certo.');
    setConfirmar(false);
    aoMudar();
  }
  return (
    <Painel
      titulo={c.status === 'pausada' ? 'Pausada' : 'Enviando agora'}
      direita={
        !confirmar && (
          <div className="flex gap-2">
            {c.status === 'pausada'
              ? <Botao nivel={2} pequeno type="button" onClick={() => agir(retomarCampanha)}>Retomar</Botao>
              : <Botao nivel={3} pequeno type="button" onClick={() => agir(pausarCampanha)}>Pausar</Botao>}
            <Botao nivel={3} pequeno type="button" onClick={() => setConfirmar(true)}>Cancelar</Botao>
          </div>
        )
      }
    >
      <p className="mb-2.5 break-words">{c.assunto}</p>
      <div className="h-2 overflow-hidden rounded-toque bg-superficie-2" role="progressbar" aria-label="Andamento do envio"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-toque bg-destaque" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-amg-legenda text-texto-apagado">
        {c.enviados} de {c.total} enviados{c.erros ? ` · ${c.erros} com erro` : ''} · {c.lote} a cada {c.intervaloMin} min, até {c.limiteDia} por dia
        {c.status === 'enviando' && c.proximoLoteEm ? ` · próximo lote em até ${minutosAte(c.proximoLoteEm)} min` : ''}
      </p>
      {confirmar && (
        <div className="mt-3">
          <Confirmacao voltar={() => setConfirmar(false)} acao={() => agir(cancelarCampanha)} rotulo="Cancelar campanha">
            Cancelar? O que não saiu não sai mais.
          </Confirmacao>
        </div>
      )}
    </Painel>
  );
}

export default function GestaoCampanhas() {
  const [campanhas, setCampanhas] = useState([]);
  const [destinatarios, setDestinatarios] = useState(null);
  const [cupons, setCupons] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const [grupo, setGrupo] = useState('todos');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('Olá, {nome}!\n\n');
  const [cupom, setCupom] = useState('');
  const [desconto, setDesconto] = useState('');
  const [oferta, setOferta] = useState({ chamada: '', de: '', por: '', parcelas: '12', parcela: '', validoAte: '', whatsapp: 'Olá! Vi a promoção do Arquionie PRO e quero aproveitar.' });
  const [lote, setLote] = useState('10');
  const [intervalo, setIntervalo] = useState('5');
  const [limite, setLimite] = useState('80');
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const texto = useRef(null);

  async function carregar() {
    const [c, d, cu] = await Promise.all([lerCampanhas(), lerDestinatarios(), lerCupons()]);
    setCampanhas(c);
    setCupons(cu.filter((x) => x.situacao === 'ativo'));
    setDestinatarios(d);
    setSelecionados(new Set(d.map((x) => x.email)));   // como no Flow: todos marcados de saída
    setGrupo('todos');
  }
  useEffect(() => { carregar(); }, []);
  useEffect(() => {
    const t = setInterval(() => lerCampanhas().then(setCampanhas), 10000);   // o andamento a cada 10 s
    return () => clearInterval(t);
  }, []);

  const lista = destinatarios ?? [];
  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return b ? lista.filter((d) => d.email.includes(b) || (d.nome ?? '').toLowerCase().includes(b)) : lista;
  }, [lista, busca]);
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const daPagina = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const doFlow = lista.filter((d) => d.origem === 'flow').length;
  const jaReceberam = lista.filter((d) => d.jaRecebeu).length;
  const ativas = campanhas.filter((c) => c.status === 'enviando' || c.status === 'pausada');
  const enviadas = campanhas.filter((c) => c.status === 'concluida' || c.status === 'cancelada');
  const proxima = ativas.find((c) => c.status === 'enviando' && c.proximoLoteEm);

  const marcarSo = (filtro) => setSelecionados(new Set(lista.filter(filtro).map((d) => d.email)));
  const alternar = (email) => {
    setGrupo('mao');
    setSelecionados((s) => { const n = new Set(s); if (n.has(email)) n.delete(email); else n.add(email); return n; });
  };

  function escolherGrupo(v) {
    setGrupo(v);
    if (v === 'todos') marcarSo(() => true);
    else if (v === 'nunca') marcarSo((d) => !d.jaRecebeu);
    else if (v === 'nenhum') setSelecionados(new Set());
  }

  function inserir(variavel) {
    const el = texto.current;
    if (!el) { setMensagem((m) => m + variavel); return; }
    const ini = el.selectionStart ?? mensagem.length, fim = el.selectionEnd ?? mensagem.length;
    setMensagem(mensagem.slice(0, ini) + variavel + mensagem.slice(fim));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = ini + variavel.length; });
  }

  function usarModelo(m) {
    setAssunto(MODELOS[m].assunto);
    setMensagem(MODELOS[m].mensagem);
  }

  function escolherCupom(codigo) {
    setCupom(codigo);
    const c = cupons.find((x) => x.codigo === codigo);
    if (c) setDesconto(String(c.desconto));
  }

  const mudarOferta = (k) => (v) => setOferta((o) => ({ ...o, [k]: v }));
  const numero = (t) => (t === '' ? null : Number(String(t).replace(',', '.')));

  const ofertaPronta = () => (oferta.chamada || oferta.por
    ? { chamada: oferta.chamada, de: numero(oferta.de), por: numero(oferta.por), parcelas: numero(oferta.parcelas),
        parcela: numero(oferta.parcela), validoAte: oferta.validoAte || null, whatsapp: oferta.whatsapp }
    : null);

  // {cupom} e {desconto} sem cupom escolhido saem vazios ("Cupom : % off", visto no 1º teste do ÊDI, 15/10/2026).
  const faltaCupom = () => /\{(cupom|desconto)\}/.test(assunto + mensagem) && !cupom;
  const avisoCupom = 'O texto usa {cupom} ou {desconto}, mas nenhum cupom foi escolhido. Escolha o cupom ou tire essas variáveis.';

  const [testando, setTestando] = useState(false);
  async function testar() {
    setErro(''); setAviso('');
    if (faltaCupom()) { setErro(avisoCupom); return; }
    setTestando(true);
    const r = await testarCampanha({ assunto, mensagem, cupom, desconto: desconto ? Number(desconto) : null, oferta: ofertaPronta() });
    setTestando(false);
    if (r?.ok) setAviso(`Teste enviado para ${r.para}. Confira a caixa de entrada (e o spam, na primeira vez).`);
    else setErro(r?.motivo ?? 'Não deu para mandar o teste.');
  }

  async function iniciar() {
    setErro(''); setAviso('');
    if (faltaCupom()) { setErro(avisoCupom); setConfirmar(false); return; }
    if (!confirmar) { setConfirmar(true); return; }
    setConfirmar(false);
    const r = await criarCampanha({
      assunto, mensagem, cupom, desconto: desconto ? Number(desconto) : null, oferta: ofertaPronta(),
      destinatarios: lista.filter((d) => selecionados.has(d.email)).map((d) => ({ email: d.email, nome: d.nome })),
      lote: Number(lote), intervaloMin: Number(intervalo), limiteDia: Number(limite),
    });
    if (r?.ok === false) { setErro(r.motivo ?? 'Não deu para iniciar.'); return; }
    setAviso(`Campanha na fila: ${r.naFila} e-mails${r.pulados ? ` (${r.pulados} ficaram de fora: pediram para sair ou têm licença)` : ''}. Ela sai pela função de envio, ${lote} a cada ${intervalo} min.`);
    carregar();
  }

  return (
    <div className="flex flex-col gap-4">
      <Cabecalho titulo="Campanhas">
        <Botao nivel={3} type="button" onClick={() => usarModelo('versao')}>Modelo: nova versão</Botao>
        <Botao nivel={3} type="button" onClick={() => usarModelo('promocao')}>Modelo: promoção</Botao>
      </Cabecalho>

      <div className="flex flex-col gap-2 empty:hidden" aria-live="polite">
        <Mensagem>{aviso}</Mensagem>
        <Mensagem erro>{erro}</Mensagem>
      </div>

      <Numeros>
        <Numero rotulo="Na lista" valor={lista.length} detalhe={`${doFlow} do Flow · ${lista.length - doFlow} contas`} />
        <Numero rotulo="Já receberam" valor={jaReceberam} detalhe="alguma campanha" />
        <Numero rotulo="Nunca receberam" valor={lista.length - jaReceberam} detalhe="quem tem licença ou saiu fica de fora" />
        <Numero rotulo="Próximo lote" valor={proxima ? `${minutosAte(proxima.proximoLoteEm)} min` : '—'} detalhe={proxima ? `${proxima.lote} e-mails` : 'nenhuma enviando'} />
      </Numeros>

      {ativas.map((c) => <Andamento key={c.id} c={c} aoMudar={carregar} setErro={setErro} />)}

      {/* Um cartão só, como no mockup: o texto, a oferta, os destinatários e o ritmo em sequência, com UM botão nível 1 no fim. */}
      <Painel titulo="Nova campanha" className="max-w-3xl">
        <div className="flex flex-col gap-2.5">
          <Campo id="ca-assunto" rotulo="Assunto" valor={assunto} aoMudar={setAssunto} placeholder="Ex.: Cupom PFPRO10: 10% off no Arquionie PRO" />
          <div className={CAIXA}>
            <label htmlFor="ca-mensagem" className="sr-only">Mensagem</label>
            <textarea id="ca-mensagem" ref={texto} value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={8}
              className="block w-full resize-y bg-transparent text-[16px] leading-relaxed text-texto placeholder:text-texto-apagado focus-visible:outline-none" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[['{nome}', '{nome}'], ['{cupom}', '{cupom}'], ['{desconto}', '{desconto}'], ['**negrito**', 'negrito']].map(([v, nome]) => (
              <Botao key={v} nivel={3} pequeno type="button" onClick={() => inserir(v)}>+ {nome}</Botao>
            ))}
          </div>
          <p className="ml-1 text-amg-legenda text-texto-apagado">Linha em branco separa parágrafos. Sai de suporte@arquionie.com.br, com o link de descadastro no rodapé.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Lista id="ca-cupom" rotulo="Cupom" valor={cupom || 'sem'} aoMudar={(v) => escolherCupom(v === 'sem' ? '' : v)}
              opcoes={[{ valor: 'sem', rotulo: 'Sem cupom' }, ...cupons.map((c) => ({ valor: c.codigo, rotulo: `${c.codigo} (${c.desconto}%)` }))]} />
            <Lista id="ca-grupo" rotulo="Destinatários" valor={grupo} aoMudar={escolherGrupo} opcoes={GRUPOS} />
          </div>
        </div>

        <h3 className="rotulo mb-1.5 ml-3.5 mt-5">Oferta (o botão abre o WhatsApp)</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Campo id="ca-desconto" rotulo="Desconto (%)" tipo="number" valor={desconto} aoMudar={setDesconto} min="1" max="100" placeholder="opcional" />
          <Campo id="ca-chamada" rotulo="Chamada" valor={oferta.chamada} aoMudar={mudarOferta('chamada')} placeholder="opcional, ex.: Black Friday antecipada" />
          <Campo id="ca-de" rotulo="De (R$)" valor={oferta.de} aoMudar={mudarOferta('de')} inputMode="decimal" placeholder="599" />
          <Campo id="ca-por" rotulo="Por (R$)" valor={oferta.por} aoMudar={mudarOferta('por')} inputMode="decimal" placeholder="179" />
          <Campo id="ca-parcelas" rotulo="Parcelas" tipo="number" valor={oferta.parcelas} aoMudar={mudarOferta('parcelas')} min="1" max="24" />
          <Campo id="ca-parcela" rotulo="Parcela (R$)" valor={oferta.parcela} aoMudar={mudarOferta('parcela')} inputMode="decimal" placeholder="17,90" />
          <Campo id="ca-ate" rotulo="Válido até" tipo="date" valor={oferta.validoAte} aoMudar={mudarOferta('validoAte')} />
          <Campo id="ca-whats" rotulo="WhatsApp" valor={oferta.whatsapp} aoMudar={mudarOferta('whatsapp')} />
        </div>

        <h3 className="rotulo mb-1.5 ml-3.5 mt-5">Destinatários · {selecionados.size} escolhidos</h3>
        <div className="overflow-hidden rounded-dentro ring-1 ring-inset ring-linha">
          <div className="flex border-b border-linha p-2">
            <Busca valor={busca} aoMudar={(v) => { setBusca(v); setPagina(0); }} rotulo="Filtrar por nome ou e-mail" className="flex-1" />
          </div>
          {destinatarios === null ? (
            <p className="px-4 py-6 text-center text-texto-apagado">Carregando…</p>
          ) : daPagina.length === 0 ? (
            <p className="px-4 py-6 text-center text-texto-apagado">Ninguém com esse filtro.</p>
          ) : (
            <ul>
              {daPagina.map((d) => {
                const marcado = selecionados.has(d.email);
                return (
                  <li key={d.email} className="border-t border-linha first:border-t-0">
                    <label className="flex min-h-amg-toque-minimo cursor-pointer items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <b className="min-w-0 break-words font-semibold">{d.nome || '—'}</b>
                          <Etiqueta tipo="neutra">{d.origem === 'flow' ? 'Flow' : 'Conta'}</Etiqueta>
                          {d.jaRecebeu && <Etiqueta tipo="informacao">Já recebeu</Etiqueta>}
                        </span>
                        <span className="block truncate text-amg-legenda text-texto-apagado">{d.email}</span>
                      </span>
                      <input type="checkbox" checked={marcado} onChange={() => alternar(d.email)} className="peer sr-only" />
                      {/* a marca de escolha à direita: o círculo do Marcar (Formulario), vazio com o contorno, cheio na terracota com o ✓ */}
                      <span aria-hidden="true"
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-toque peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-destaque ${
                          marcado ? 'bg-botao-1 text-botao-1-texto' : 'ring-2 ring-inset ring-texto-apagado'}`}>
                        {marcado && <Icone nome="ok" tamanho={13} />}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="ml-1 mr-auto text-amg-legenda text-texto-apagado">
            {selecionados.size} escolhidos · página {pagina + 1} de {paginas} · {filtrados.length} na lista
          </span>
          <Botao nivel={3} pequeno type="button" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Botao>
          <Botao nivel={3} pequeno type="button" disabled={pagina >= paginas - 1} onClick={() => setPagina(pagina + 1)}>Próxima</Botao>
        </div>

        <h3 className="rotulo mb-1.5 ml-3.5 mt-5">Ritmo</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <Campo id="ca-lote" rotulo="Lote" tipo="number" valor={lote} aoMudar={setLote} min="1" max="100" dica="e-mails" />
          <Campo id="ca-intervalo" rotulo="Intervalo" tipo="number" valor={intervalo} aoMudar={setIntervalo} min="1" max="1440" dica="min" />
          <Campo id="ca-limite" rotulo="Limite por dia" tipo="number" valor={limite} aoMudar={setLimite} min="1" max="5000" />
        </div>
        <p className="ml-1 mt-2 text-amg-legenda text-texto-apagado">Roda no servidor: pode fechar a página.</p>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {confirmar && <Botao nivel={3} type="button" onClick={() => setConfirmar(false)}>Voltar</Botao>}
          <Botao nivel={3} type="button" onClick={testar} disabled={testando}>{testando ? 'Mandando…' : 'Teste para mim'}</Botao>
          <Botao principal type="button" onClick={iniciar} disabled={selecionados.size === 0}>
            {confirmar ? `Confirmar: enviar para ${selecionados.size}` : `Iniciar campanha · ${selecionados.size}`}
          </Botao>
        </div>
        {/* O resultado do TESTE e do INICIAR também aqui, ao lado dos botões: no alto da página ele ficava fora da vista (ÊDI, 15/10/2026). */}
        <div className="mt-3 flex flex-col gap-2 empty:hidden" aria-live="polite">
          <Mensagem>{aviso}</Mensagem>
          <Mensagem erro>{erro}</Mensagem>
        </div>
      </Painel>

      <Grupo rotulo="Já enviadas">
        {enviadas.length === 0 ? (
          <Linha><span className="text-texto-apagado">Nenhuma ainda.</span></Linha>
        ) : (
          enviadas.map((c) => (
            <Linha key={c.id}>
              <TextoDaLinha titulo={c.assunto} sub={`${c.enviados} enviados · ${dia(c.concluidaEm ?? c.criadaEm)}`} />
              {(c.origem === 'flow' || c.status === 'cancelada') && (
                <span className="flex flex-wrap gap-1.5">
                  {c.origem === 'flow' && <Etiqueta tipo="neutra">Veio do Flow</Etiqueta>}
                  {c.status === 'cancelada' && <Etiqueta tipo="neutra">Cancelada</Etiqueta>}
                </span>
              )}
            </Linha>
          ))
        )}
      </Grupo>
      <p className="ml-1 text-amg-legenda text-texto-apagado">Atualizado {quando(new Date().toISOString())}; o andamento se atualiza sozinho a cada 10 segundos.</p>
    </div>
  );
}
