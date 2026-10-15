// CAMPANHAS no /gestao (plano 18; mockup aprovado em 15/10/2026): a campanha de e-mail do Flow, agora no Arquionie. O texto
// com as variáveis, a oferta com o botão do WhatsApp, os destinatários (cadastros do Flow e contas que querem novidades,
// sem quem tem licença nem quem pediu para sair) e o ritmo: LOTE e-mails a cada INTERVALO minutos, até LIMITE por dia.
// A fila fica no banco; quem manda é a função do servidor chamada pelo pg_cron.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Botao, Campo, Lista, Mensagem } from '@/components/Formulario';
import { Acao, Cabecalho, Numero, Numeros, Painel, Selo } from '@/components/GestaoPecas';
import {
  cancelarCampanha, criarCampanha, dia, lerCampanhas, lerCupons, lerDestinatarios, MODELOS, pausarCampanha, quando, retomarCampanha,
  testarCampanha,
} from '@/lib/gestaoFlow';

const POR_PAGINA = 10;
const minutosAte = (iso) => Math.max(0, Math.round((new Date(iso) - Date.now()) / 6e4));

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
        confirmar ? (
          <>
            <span className="text-[12px] text-aqi-texto">Cancelar? O que não saiu não sai mais.</span>
            <Botao nivel={3} pequeno type="button" onClick={() => setConfirmar(false)}>VOLTAR</Botao>
            <Botao principal pequeno type="button" onClick={() => agir(cancelarCampanha)}>CANCELAR CAMPANHA</Botao>
          </>
        ) : (
          <>
            {c.status === 'pausada'
              ? <Botao nivel={2} pequeno type="button" onClick={() => agir(retomarCampanha)}>RETOMAR</Botao>
              : <Botao nivel={3} pequeno type="button" onClick={() => agir(pausarCampanha)}>PAUSAR</Botao>}
            <Botao nivel={3} pequeno type="button" onClick={() => setConfirmar(true)}>CANCELAR</Botao>
          </>
        )
      }
    >
      <p className="mb-2 text-[14px] text-white">{c.assunto}</p>
      <div className="h-[10px] bg-aqi-painel"><div className="h-[10px] bg-aqi-campo" style={{ width: `${pct}%` }} /></div>
      <p className="mt-1.5 text-[12px] text-aqi-muted">
        {c.enviados} de {c.total} enviados{c.erros ? ` · ${c.erros} com erro` : ''} · {c.lote} a cada {c.intervaloMin} min, até {c.limiteDia} por dia
        {c.status === 'enviando' && c.proximoLoteEm ? ` · próximo lote em até ${minutosAte(c.proximoLoteEm)} min` : ''}
      </p>
    </Painel>
  );
}

export default function GestaoCampanhas() {
  const [campanhas, setCampanhas] = useState([]);
  const [destinatarios, setDestinatarios] = useState(null);
  const [cupons, setCupons] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
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
  const alternar = (email) => setSelecionados((s) => { const n = new Set(s); if (n.has(email)) n.delete(email); else n.add(email); return n; });

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

  const [testando, setTestando] = useState(false);
  async function testar() {
    setErro(''); setAviso('');
    setTestando(true);
    const r = await testarCampanha({ assunto, mensagem, cupom, desconto: desconto ? Number(desconto) : null, oferta: ofertaPronta() });
    setTestando(false);
    if (r?.ok) setAviso(`Teste enviado para ${r.para}. Confira a caixa de entrada (e o spam, na primeira vez).`);
    else setErro(r?.motivo ?? 'Não deu para mandar o teste.');
  }

  async function iniciar() {
    setErro(''); setAviso('');
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
    <div className="space-y-4">
      <Cabecalho titulo="Campanhas">
        <Botao nivel={3} type="button" onClick={() => usarModelo('versao')}>MODELO: NOVA VERSÃO</Botao>
        <Botao nivel={3} type="button" onClick={() => usarModelo('promocao')}>MODELO: PROMOÇÃO</Botao>
      </Cabecalho>

      <div className="min-h-[20px]" aria-live="polite">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Nova campanha" className="h-full">
          <Campo id="ca-assunto" rotulo="ASSUNTO" valor={assunto} aoMudar={setAssunto} placeholder="Ex.: Cupom PFPRO10: 10% off no Arquionie PRO" />
          <label htmlFor="ca-mensagem" className="sr-only">Mensagem</label>
          <textarea id="ca-mensagem" ref={texto} value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={8}
            className="mb-1.5 block w-full resize-y bg-aqi-valor px-3 py-2 text-[13px] leading-relaxed text-white placeholder:text-[#C9A9A5] focus:outline-none" />
          <div className="mb-1 flex flex-wrap gap-1.5">
            {['{nome}', '{cupom}', '{desconto}', '**negrito**'].map((v) => (
              <Botao key={v} nivel={3} pequeno type="button" onClick={() => inserir(v)}>+ {v}</Botao>
            ))}
          </div>
          <p className="mb-3 text-[12px] text-aqi-muted">Linha em branco separa parágrafos. Sai de suporte@arquionie.com.br, com o link de descadastro no rodapé.</p>
          <Lista id="ca-cupom" rotulo="CUPOM" valor={cupom || 'sem'} aoMudar={(v) => escolherCupom(v === 'sem' ? '' : v)}
            opcoes={[{ valor: 'sem', rotulo: 'SEM CUPOM' }, ...cupons.map((c) => ({ valor: c.codigo, rotulo: `${c.codigo} (${c.desconto}%)` }))]} />
          <Campo id="ca-desconto" rotulo="DESCONTO (%)" tipo="number" valor={desconto} aoMudar={setDesconto} min="1" max="100" placeholder="opcional" />
          <h3 className="mb-2 mt-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-aqi-coral">Oferta (o botão abre o WhatsApp)</h3>
          <Campo id="ca-chamada" rotulo="CHAMADA" valor={oferta.chamada} aoMudar={mudarOferta('chamada')} placeholder="opcional, ex.: BLACK FRIDAY ANTECIPADA" />
          <Campo id="ca-de" rotulo="DE (R$)" valor={oferta.de} aoMudar={mudarOferta('de')} inputMode="decimal" placeholder="599" />
          <Campo id="ca-por" rotulo="POR (R$)" valor={oferta.por} aoMudar={mudarOferta('por')} inputMode="decimal" placeholder="179" />
          <Campo id="ca-parcelas" rotulo="PARCELAS" tipo="number" valor={oferta.parcelas} aoMudar={mudarOferta('parcelas')} min="1" max="24" />
          <Campo id="ca-parcela" rotulo="PARCELA (R$)" valor={oferta.parcela} aoMudar={mudarOferta('parcela')} inputMode="decimal" placeholder="17,90" />
          <Campo id="ca-ate" rotulo="VÁLIDO ATÉ" tipo="date" valor={oferta.validoAte} aoMudar={mudarOferta('validoAte')} />
          <Campo id="ca-whats" rotulo="WHATSAPP" valor={oferta.whatsapp} aoMudar={mudarOferta('whatsapp')} />
        </Painel>

        <Painel
          titulo="Destinatários"
          direita={
            <div className="flex gap-3">
              <Acao onClick={() => marcarSo(() => true)}>TODOS</Acao>
              <Acao onClick={() => marcarSo((d) => !d.jaRecebeu)}>NUNCA RECEBERAM</Acao>
              <Acao onClick={() => setSelecionados(new Set())}>NENHUM</Acao>
            </div>
          }
        >
          <Campo id="ca-busca" rotulo="FILTRAR" valor={busca} aoMudar={(v) => { setBusca(v); setPagina(0); }} placeholder="nome ou e-mail…" />
          {destinatarios === null ? (
            <p className="py-6 text-center text-aqi-muted">Carregando…</p>
          ) : (
            <ul className="mt-2">
              {daPagina.map((d) => {
                const marcado = selecionados.has(d.email);
                return (
                  <li key={d.email}>
                    <label className="mb-1 grid min-h-[34px] cursor-pointer grid-cols-[minmax(0,1fr)_44px] text-[13px]">
                      <span className="flex min-w-0 items-center gap-2 bg-aqi-painel px-3">
                        <span className="min-w-0 truncate"><span className="text-white">{d.nome || '—'}</span> · <span className="text-aqi-muted">{d.email}</span></span>
                        <span className="ml-auto flex gap-1.5">
                          <Selo tom="apagado">{d.origem === 'flow' ? 'FLOW' : 'CONTA'}</Selo>
                          {d.jaRecebeu && <Selo>JÁ RECEBEU</Selo>}
                        </span>
                      </span>
                      <span className="grid place-items-center bg-aqi-painel">
                        <input type="checkbox" checked={marcado} onChange={() => alternar(d.email)} className="peer sr-only" />
                        <span aria-hidden="true" className={`grid h-[18px] w-[18px] place-items-center text-[12px] font-bold ${marcado ? 'bg-aqi-botao text-white' : 'border-2 border-aqi-borda'}`}>
                          {marcado ? '✓' : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-2 text-[12px] text-aqi-muted">
            <span className="mr-auto">{selecionados.size} selecionados · página {pagina + 1} de {paginas} · {filtrados.length} na lista</span>
            <Botao nivel={3} pequeno type="button" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>ANTERIOR</Botao>
            <Botao nivel={3} pequeno type="button" disabled={pagina >= paginas - 1} onClick={() => setPagina(pagina + 1)}>PRÓXIMA</Botao>
          </div>

          <h3 className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-aqi-coral">Ritmo</h3>
          <Campo id="ca-lote" rotulo="LOTE" tipo="number" valor={lote} aoMudar={setLote} min="1" max="100" dica="e-mails" />
          <Campo id="ca-intervalo" rotulo="INTERVALO" tipo="number" valor={intervalo} aoMudar={setIntervalo} min="1" max="1440" dica="min" />
          <Campo id="ca-limite" rotulo="LIMITE POR DIA" tipo="number" valor={limite} aoMudar={setLimite} min="1" max="5000" />
          <p className="mb-3 mt-1 text-[12px] text-aqi-muted">Roda no servidor: pode fechar a página.</p>
          <div className="flex flex-wrap justify-end gap-2">
            {confirmar && <Botao nivel={3} type="button" onClick={() => setConfirmar(false)}>VOLTAR</Botao>}
            <Botao nivel={2} type="button" onClick={testar} disabled={testando}>{testando ? 'MANDANDO…' : 'TESTE PARA MIM'}</Botao>
            <Botao principal type="button" onClick={iniciar} disabled={selecionados.size === 0}>
              {confirmar ? `CONFIRMAR: ENVIAR PARA ${selecionados.size}` : `INICIAR CAMPANHA (${selecionados.size})`}
            </Botao>
          </div>
          {/* O resultado do TESTE e do INICIAR também aqui, ao lado dos botões: no alto da página ele ficava fora da vista (ÊDI, 15/10/2026). */}
          <div className="mt-3 text-right" aria-live="polite">
            <Mensagem>{aviso}</Mensagem>
            <Mensagem erro>{erro}</Mensagem>
          </div>
        </Painel>
      </div>

      <Painel titulo="Já enviadas">
        {enviadas.length === 0 ? (
          <p className="text-[14px] text-aqi-muted">Nenhuma ainda.</p>
        ) : (
          <ul className="divide-y divide-[#262D37]">
            {enviadas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
                <span className="mr-auto text-white">{c.assunto}</span>
                {c.origem === 'flow' && <Selo tom="apagado">VEIO DO FLOW</Selo>}
                {c.status === 'cancelada' && <Selo tom="apagado">CANCELADA</Selo>}
                <span className="text-aqi-muted">{c.enviados} enviados · {dia(c.concluidaEm ?? c.criadaEm)}</span>
              </li>
            ))}
          </ul>
        )}
      </Painel>
      <p className="text-[12px] text-aqi-muted">Atualizado {quando(new Date().toISOString())}; o andamento se atualiza sozinho a cada 10 segundos.</p>
    </div>
  );
}
