import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Botao, Campo, Icone, Lista, Marcar, Mensagem } from '@/components/Formulario';
import { ARQUIVOS_URL, TURNSTILE_CHAVE as CHAVE_DO_TURNSTILE } from '@/config';
import { mensagemDeErro } from '@/lib/erros';
import {
  AMOSTRA, AMOSTRA_FORMULARIO_PUBLICO, AMOSTRA_PROPOSTA_PUBLICA, coresDoEscritorio, dataCurta, funcao, linkWhatsApp, pagamentoEmReais, reais, rpc,
  urlDoLogo,
} from '@/lib/comercial';
import { AULA, aceiteNaAula, formularioDaAula, pedidoNovoNaAula, propostaPublicaDaAula } from '@/lib/aula';

// na amostra nada vai ao servidor, então o formulário não pede a verificação de pessoa
const TURNSTILE_CHAVE = AMOSTRA ? '' : CHAVE_DO_TURNSTILE;

// As páginas do cliente do COMERCIAL (mockup docs/mockups/crm-gratis, seções 5 e 7, aprovado por ÊDI em 16/10/2026): o formulário
// (/f/CODIGO) e a proposta (/p/CODIGO), sem conta, claras, com a logo e a cor do escritório no lugar da terracota, as cápsulas grandes para
// o dedo e o selo "Feito com Arquionie" no rodapé do grátis. Ficam fora da moldura do site.

export function Pagina({ escritorio, passo, selo, children, rodape, previa }) {
  const iniciais = (escritorio?.nome || '·').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  useEffect(() => {
    if (escritorio?.nome && !previa) document.title = escritorio.nome;
  }, [escritorio?.nome, previa]);
  return (
    <div data-tema="claro" className={`flex flex-col bg-fundo text-texto ${previa ? 'rounded-cartao' : 'min-h-screen'}`} style={coresDoEscritorio(escritorio?.cor)}>
      <header className="mx-auto flex w-full max-w-[560px] items-center gap-2.5 px-4 pb-3 pt-4">
        {escritorio?.logo ? (
          <img src={urlDoLogo(escritorio.logo)} alt="" className="h-9 w-9 rounded-toque object-contain" />
        ) : (
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-toque bg-botao-1 text-amg-rotulo text-botao-1-texto">{iniciais}</span>
        )}
        <b className="font-semibold">{escritorio?.nome}</b>
        {passo && <small className="ml-auto tabular-nums text-amg-legenda text-texto-apagado">{passo}</small>}
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-4 pb-6">{children}</main>
      <footer className="mx-auto flex w-full max-w-[560px] flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 pb-6 text-amg-legenda text-texto-apagado">
        {selo && (
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex min-h-amg-toque-minimo items-center gap-1.5 text-texto-apagado no-underline">
            <img src="/leao.png" alt="" className="h-4 w-4" />
            Feito com Arquionie
          </a>
        )}
        {rodape}
      </footer>
    </div>
  );
}

function Situacao({ titulo, children, sinal }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
      {sinal && (
        <span className="grid h-16 w-16 place-items-center rounded-toque bg-amg-sucesso-suave text-sucesso">
          <Icone nome="ok" tamanho={30} />
        </span>
      )}
      <h1 className="text-amg-titulo">{titulo}</h1>
      {children}
    </div>
  );
}

const OPCAO = 'flex min-h-amg-altura-opcao w-full items-center rounded-toque px-5 text-left text-amg-corpo-celular font-medium ring-inset transition';
const opcao = (marcada) => `${OPCAO} ${marcada ? 'bg-amg-destaque-suave font-semibold text-destaque-texto ring-2 ring-botao-1' : 'bg-superficie ring-1 ring-linha hover:ring-texto-apagado'}`;

/** Uma pergunta como o cliente vê. Serve também para a prévia do criador de formulários. */
export function PerguntaDoCliente({ pergunta: q, valor, aoMudar, falta }) {
  const id = `p-${q.id}`;
  if (q.tipo === 'secao') return null;
  if (['escolha', 'faixa'].includes(q.tipo))
    return (
      <div role="radiogroup" aria-label={q.texto} className="flex flex-col gap-2">
        {q.opcoes.map((o) => (
          <button key={o.texto} type="button" role="radio" aria-checked={valor === o.texto} onClick={() => aoMudar(o.texto)} className={opcao(valor === o.texto)}>
            {o.texto}
          </button>
        ))}
      </div>
    );
  if (q.tipo === 'multipla') {
    const lista = Array.isArray(valor) ? valor : [];
    return (
      <div role="group" aria-label={q.texto} className="flex flex-col gap-2">
        {q.opcoes.map((o) => {
          const marcada = lista.includes(o.texto);
          return (
            <button key={o.texto} type="button" role="checkbox" aria-checked={marcada} onClick={() => aoMudar(marcada ? lista.filter((x) => x !== o.texto) : [...lista, o.texto])}
              className={opcao(marcada)}>
              {o.texto}
            </button>
          );
        })}
      </div>
    );
  }
  if (q.tipo === 'lista') return <Lista rotulo="Resposta" id={id} valor={valor ?? ''} aoMudar={aoMudar} falta={falta} opcoes={q.opcoes.map((o) => ({ valor: o.texto, rotulo: o.texto }))} />;
  if (q.tipo === 'nota')
    return (
      <div role="radiogroup" aria-label={q.texto} className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={valor === n} onClick={() => aoMudar(n)} className={`${opcao(valor === n)} justify-center px-0`}>
            {n}
          </button>
        ))}
      </div>
    );
  if (q.tipo === 'contato') {
    const v = valor ?? {};
    const mudar = (k) => (x) => aoMudar({ ...v, [k]: x });
    return (
      <div className="flex flex-col gap-2.5">
        <Campo rotulo="Nome" id={`${id}-nome`} valor={v.nome ?? ''} aoMudar={mudar('nome')} autoComplete="name" falta={falta && !v.nome} placeholder="Seu nome" />
        <Campo rotulo="WhatsApp" id={`${id}-whatsapp`} tipo="tel" valor={v.whatsapp ?? ''} aoMudar={mudar('whatsapp')} autoComplete="tel" inputMode="tel" placeholder="(11) 98765-4321" />
        <Campo rotulo="E-mail" id={`${id}-email`} tipo="email" valor={v.email ?? ''} aoMudar={mudar('email')} autoComplete="email" />
      </div>
    );
  }
  if (q.tipo === 'texto-longo')
    return (
      <textarea id={id} aria-label={q.texto} rows={5} value={valor ?? ''} onChange={(e) => aoMudar(e.target.value)} maxLength={2000}
        className={`w-full rounded-dentro bg-superficie p-4 text-[16px] ring-1 ring-inset ring-linha focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destaque ${falta ? 'ring-2 ring-destaque' : ''}`} />
    );
  const especial = {
    data: { tipo: 'date' }, 'mes-ano': { tipo: 'month' }, numero: { inputMode: 'decimal' }, area: { inputMode: 'decimal', dica: 'm²' },
    valor: { inputMode: 'decimal', dica: 'R$' }, link: { tipo: 'url', placeholder: 'https://' }, cidade: { placeholder: 'Cidade/UF', autoComplete: 'address-level2' },
  }[q.tipo] ?? {};
  return <Campo rotulo="Resposta" id={id} valor={valor ?? ''} aoMudar={aoMudar} falta={falta} placeholder={especial.placeholder ?? ''} {...especial} />;
}

const vazio = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const visivel = (q, respostas) => {
  if (!q.mostrarSe) return true;
  const r = respostas[q.mostrarSe.pergunta];
  return Array.isArray(r) ? r.some((x) => q.mostrarSe.respostas.includes(x)) : q.mostrarSe.respostas.includes(r);
};

/** O Turnstile da Cloudflare (com a chave pública configurada): o token vai com o pedido. */
function Turnstile({ aoConfirmar }) {
  const caixa = useRef(null);
  useEffect(() => {
    if (!TURNSTILE_CHAVE) return;
    const desenhar = () => window.turnstile?.render(caixa.current, { sitekey: TURNSTILE_CHAVE, callback: aoConfirmar, language: 'pt-BR' });
    if (window.turnstile) return void desenhar();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = desenhar;
    document.head.appendChild(s);
  }, []);
  return TURNSTILE_CHAVE ? <div ref={caixa} className="min-h-[65px]" /> : null;
}

function Denunciar({ codigo, aoFechar }) {
  const [texto, setTexto] = useState('');
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState('');
  async function enviar() {
    setErro('');
    try {
      const r = AMOSTRA ? { ok: true } : await rpc('comercial_denunciar', { p_codigo: codigo, p_motivo: texto });
      if (!r.ok) return setErro(r.motivo);
      setFeito(true);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Denunciar este formulário" className="fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center">
      <div className="flex w-full max-w-[460px] flex-col gap-3 rounded-t-cartao bg-fundo p-5 shadow-amg-janela sm:rounded-cartao">
        <h2 className="text-amg-titulo">Denunciar</h2>
        {feito ? (
          <p>Recebemos a sua denúncia. Obrigado por avisar.</p>
        ) : (
          <>
            <p className="text-texto-apagado">Conte em poucas palavras o que há de errado com este formulário. Nunca preencha senha, cartão ou documento num formulário.</p>
            <textarea aria-label="O que há de errado" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500}
              className="w-full rounded-dentro bg-superficie p-3 text-[16px] ring-1 ring-inset ring-linha focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destaque" />
            <Mensagem erro>{erro}</Mensagem>
          </>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Botao type="button" onClick={aoFechar}>{feito ? 'Fechar' : 'Voltar'}</Botao>
          {!feito && <Botao principal type="button" disabled={!texto.trim()} onClick={enviar}>Denunciar</Botao>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ o formulário (/f/CODIGO)
export function FormularioDoCliente() {
  const { codigo } = useParams();
  const [busca] = useSearchParams();
  const [form, setForm] = useState(null);
  const [respostas, setRespostas] = useState({});
  const [passo, setPasso] = useState(0);
  const [falta, setFalta] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [token, setToken] = useState('');
  const [fim, setFim] = useState(null); // 'enviado' | 'desvio'
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [denunciar, setDenunciar] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setForm(AULA ? formularioDaAula() : AMOSTRA ? AMOSTRA_FORMULARIO_PUBLICO : await rpc('comercial_formulario_abrir', { p_codigo: codigo }));
      } catch {
        setForm({ situacao: 'inexistente' });
      }
    })();
  }, [codigo]);

  const passos = useMemo(() => (form?.perguntas ?? []).filter((q) => q.tipo !== 'privacidade' && visivel(q, respostas)), [form, respostas]);

  if (!form) return <Pagina><p className="py-10 text-center text-texto-apagado">Carregando…</p></Pagina>;
  if (form.situacao !== 'aberto')
    return (
      <Pagina escritorio={form.escritorio}>
        <Situacao titulo={form.situacao === 'pausado' ? 'Este formulário está pausado' : 'Formulário não encontrado'}>
          <p className="text-texto-apagado">{form.situacao === 'pausado' ? 'Ele não está recebendo pedidos agora.' : 'Confira o link com quem mandou.'}</p>
        </Situacao>
      </Pagina>
    );

  const q = passos[passo];
  const ultimo = passo === passos.length - 1;
  const rodape = (
    <button type="button" onClick={() => setDenunciar(true)} className="min-h-amg-toque-minimo text-texto-apagado underline-offset-2 hover:underline">
      Denunciar
    </button>
  );

  if (fim)
    return (
      <Pagina escritorio={form.escritorio} selo={form.selo} rodape={rodape}>
        {fim === 'desvio' ? (
          <Situacao titulo={form.desvio?.titulo || 'Obrigado pelo interesse!'}>
            <p className="text-texto-apagado">{form.desvio?.texto}</p>
            <Botao type="button" grande onClick={() => setFim(null)}>Voltar</Botao>
          </Situacao>
        ) : (
          <Situacao titulo="Recebemos o seu pedido" sinal>
            <p className="text-texto-apagado">{form.escritorio?.nome} vai falar com você em breve.</p>
            {form.whatsappEscritorio && (
              <Botao grande href={linkWhatsApp(form.whatsappEscritorio)} target="_blank" rel="noreferrer" className="mt-2 !bg-amg-whatsapp-suave !text-amg-whatsapp">
                Falar no WhatsApp
              </Botao>
            )}
          </Situacao>
        )}
        {denunciar && <Denunciar codigo={form.codigo} aoFechar={() => setDenunciar(false)} />}
      </Pagina>
    );

  const valor = respostas[q.id];
  const respondida = q.tipo === 'contato' ? !!valor?.nome && (!!valor?.whatsapp || !!valor?.email) : !vazio(valor);

  async function seguir() {
    setErro('');
    if (q.obrigatoria && !respondida && q.tipo !== 'secao') return setFalta(true);
    setFalta(false);
    if (['escolha', 'faixa', 'lista'].includes(q.tipo) && q.opcoes.some((o) => o.texto === valor && o.desvio)) return setFim('desvio');
    if (!ultimo) return setPasso(passo + 1);
    if (!aceite) return setErro('Para enviar, aceite o uso dos seus dados.');
    if (TURNSTILE_CHAVE && !token) return setErro('Espere a confirmação de que você é uma pessoa.');
    setEnviando(true);
    try {
      const lista = [...passos.map((p) => ({ id: p.id, valor: respostas[p.id] ?? null })), { id: 'privacidade', valor: true }];
      if (AULA) pedidoNovoNaAula(lista, busca.get('de') ?? '');
      const r = AMOSTRA ? { ok: true } : await funcao({ acao: 'pedido', codigo: form.codigo, respostas: lista, origem: busca.get('de') ?? '', turnstile: token });
      if (r.desvio) return setFim('desvio');
      if (!r.ok) {
        const i = passos.findIndex((p) => p.id === r.pergunta);
        if (i >= 0) setPasso(i);
        return setErro(r.motivo);
      }
      setFim('enviado');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pagina escritorio={form.escritorio} passo={`${passo + 1} de ${passos.length}`} selo={form.selo} rodape={rodape}>
      <div className="mb-5 h-1.5 overflow-hidden rounded-toque bg-superficie-2" aria-hidden="true">
        <div className="h-full rounded-toque bg-botao-1 transition-all" style={{ width: `${((passo + 1) / passos.length) * 100}%` }} />
      </div>
      <form className="flex flex-1 flex-col gap-3" onSubmit={(e) => { e.preventDefault(); seguir(); }} noValidate>
        <h1 className="text-amg-titulo" id="pergunta">{q.texto}</h1>
        {q.ajuda && <p className="-mt-1 text-texto-apagado">{q.ajuda}</p>}
        <PerguntaDoCliente pergunta={q} valor={valor} falta={falta} aoMudar={(v) => setRespostas({ ...respostas, [q.id]: v })} />
        {falta && <Mensagem erro>{q.tipo === 'contato' ? 'Escreva o seu nome e o WhatsApp ou o e-mail.' : 'Responda para continuar.'}</Mensagem>}
        {ultimo && (
          <>
            <div className="mt-2 rounded-cartao bg-superficie px-3 py-1.5">
              <Marcar id="aceite" marcado={aceite} aoMudar={setAceite}>
                Meus dados vão para {form.escritorio?.nome || 'o escritório'}, para responder ao meu pedido.{' '}
                <a href="/privacidade" target="_blank" rel="noreferrer" className="font-semibold text-destaque-texto">Privacidade</a>
              </Marcar>
            </div>
            <Turnstile aoConfirmar={setToken} />
          </>
        )}
        <Mensagem erro>{erro}</Mensagem>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
          {passo > 0 ? <Botao grande type="button" onClick={() => { setErro(''); setPasso(passo - 1); }}>Voltar</Botao> : <span />}
          <Botao grande principal type="submit" disabled={enviando}>{ultimo ? (enviando ? 'Enviando…' : 'Enviar') : 'Continuar'}</Botao>
        </div>
      </form>
      {denunciar && <Denunciar codigo={form.codigo} aoFechar={() => setDenunciar(false)} />}
    </Pagina>
  );
}

// ------------------------------------------------------------------------------------------------ a proposta (/p/CODIGO)
export function PropostaDoCliente() {
  const { codigo } = useParams();
  const [p, setP] = useState(null);
  const [pacote, setPacote] = useState(null);
  const [tela, setTela] = useState('proposta'); // 'aceitar' | 'aceita'
  const [nome, setNome] = useState('');
  const [concordo, setConcordo] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const aberta = useRef(false);

  useEffect(() => {
    if (aberta.current) return; // a abertura conta uma vez (o modo estrito do React chama duas)
    aberta.current = true;
    (async () => {
      try {
        const d = AULA ? propostaPublicaDaAula() : AMOSTRA ? AMOSTRA_PROPOSTA_PUBLICA : await rpc('comercial_proposta_abrir', { p_codigo: codigo });
        setP(d);
        setNome(d.cliente ?? '');
        setPacote(d.conteudo?.pacotes?.[0]?.nome ?? null);
      } catch {
        setP({ situacao: 'inexistente' });
      }
    })();
  }, [codigo]);

  if (!p) return <Pagina><p className="py-10 text-center text-texto-apagado">Carregando…</p></Pagina>;
  const whats = p.whatsappEscritorio && (
    <Botao grande href={linkWhatsApp(p.whatsappEscritorio, `Olá! Sobre a proposta ${p.codigo}.`)} target="_blank" rel="noreferrer" className="!bg-amg-whatsapp-suave !text-amg-whatsapp">
      WhatsApp
    </Botao>
  );
  if (p.situacao === 'inexistente' || p.situacao === 'preparando' || p.situacao === 'vencida')
    return (
      <Pagina escritorio={p.escritorio} selo={p.selo}>
        <Situacao titulo={{ inexistente: 'Proposta não encontrada', preparando: 'A proposta está sendo preparada', vencida: 'Esta proposta venceu' }[p.situacao]}>
          <p className="text-texto-apagado">
            {{ inexistente: 'Confira o link com quem mandou.', preparando: 'Volte em alguns minutos.', vencida: 'Fale com o escritório para receber uma nova.' }[p.situacao]}
          </p>
          {whats}
        </Situacao>
      </Pagina>
    );

  if (tela === 'aceita' || p.aceite)
    return (
      <Pagina escritorio={p.escritorio} selo={p.selo}>
        <Situacao titulo="Proposta aceita" sinal>
          <p className="text-texto-apagado">
            {(p.aceite?.nome ?? nome)} aceitou {p.aceite?.pacote || pacote ? `o pacote ${p.aceite?.pacote ?? pacote}` : 'a proposta'} de {p.escritorio?.nome}.
            {' '}O escritório já foi avisado.
          </p>
          {whats}
        </Situacao>
      </Pagina>
    );

  async function aceitar() {
    setErro('');
    if (nome.trim().length < 3) return setErro('Escreva o seu nome completo.');
    if (!concordo) return setErro('Para aceitar, marque que leu e concorda com a proposta.');
    setOcupado(true);
    try {
      if (AULA) aceiteNaAula(nome, pacote);
      const r = AMOSTRA ? { ok: true } : await rpc('comercial_proposta_aceitar', { p_codigo: p.codigo, p_nome: nome, p_concordo: true, p_pacote: p.jeito === 'modelo' ? pacote : null });
      if (!r.ok) return setErro(r.motivo);
      setTela('aceita');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const escolhido = p.conteudo?.pacotes?.find((k) => k.nome === pacote);
  if (tela === 'aceitar')
    return (
      <Pagina escritorio={p.escritorio} selo={p.selo}>
        <form className="flex flex-1 flex-col gap-3" onSubmit={(e) => { e.preventDefault(); aceitar(); }} noValidate>
          <h1 className="text-amg-titulo">Aceitar a proposta</h1>
          <p className="text-texto-apagado">
            Para dar continuidade ao seu projeto, confirme que está de acordo com a proposta como está: o escopo, o valor e a forma de pagamento.
          </p>
          {p.jeito === 'modelo' && escolhido && (
            <div className="flex items-center justify-between gap-3 rounded-cartao bg-superficie px-4 py-3">
              <span>Pacote <b className="font-semibold">{escolhido.nome}</b></span>
              <b className="whitespace-nowrap font-bold tabular-nums">{reais(escolhido.valor)}</b>
            </div>
          )}
          <Campo rotulo="Seu nome completo" id="nome" valor={nome} aoMudar={setNome} autoComplete="name" />
          <div className="rounded-cartao bg-superficie px-3 py-1.5">
            <Marcar id="concordo" marcado={concordo} aoMudar={setConcordo}>Li e concordo com a proposta de {p.escritorio?.nome}.</Marcar>
          </div>
          <Mensagem erro>{erro}</Mensagem>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
            <Botao grande type="button" onClick={() => setTela('proposta')}>Voltar</Botao>
            <Botao grande principal type="submit" disabled={ocupado}>{ocupado ? 'Aceitando…' : 'Aceitar'}</Botao>
          </div>
        </form>
      </Pagina>
    );

  return (
    <Pagina escritorio={p.escritorio} selo={p.selo}>
      <div className="flex flex-1 flex-col gap-3">
        <CorpoDaProposta p={p} pacote={pacote} aoPacote={setPacote} />

        <div className={`mt-auto grid gap-2 pt-4 ${whats ? 'grid-cols-2' : ''}`}>
          {whats}
          <Botao grande principal type="button" onClick={() => setTela('aceitar')}>{whats ? 'Aceitar' : 'Aceitar a proposta'}</Botao>
        </div>
      </div>
    </Pagina>
  );
}

/** O corpo da proposta como o cliente vê: a página do cliente e a prévia de SUA PROPOSTA usam o mesmo. Mais completa desde 19/10/2026
 * (ÊDI: a prévia "muito simplória"): sobre o escritório, cada pacote com o que inclui e o que não inclui, o pagamento do pacote
 * escolhido em reais e as condições. As propostas de antes, sem as palavras, mostram só o que têm. */
export function CorpoDaProposta({ p, pacote, aoPacote }) {
  const c = p.conteudo ?? {};
  const pag = c.pagamento;
  const pacotes = c.pacotes ?? [];
  const escolhido = pacotes.find((k) => k.nome === pacote) ?? pacotes[0];
  const itens = [...new Set(pacotes.flatMap((k) => k.inclui ?? []))];
  const contas = escolhido && pag ? pagamentoEmReais(escolhido.valor, pag) : null;
  const condicoes = (c.condicoes ?? []).filter(Boolean);
  const bloco = 'flex flex-col gap-2 rounded-cartao bg-superficie px-4 py-4';
  return (
    <>
      {p.validaAte && <span className="self-start rounded-toque bg-amg-sucesso-suave px-2.5 py-[3px] text-amg-rotulo text-sucesso">Válida até {dataCurta(p.validaAte)}</span>}
      <h1 className="text-amg-titulo">Proposta para {p.cliente}</h1>
      {c.projeto && <p className="-mt-1 text-texto-apagado">{c.projeto}</p>}

      {c.apresentacao && (
        <section className={bloco}>
          <h2 className="rotulo">Sobre {p.escritorio?.nome || 'o escritório'}</h2>
          <p className="whitespace-pre-line">{c.apresentacao}</p>
        </section>
      )}

      {p.jeito === 'modelo' && (
        <>
          <h2 className="rotulo mt-2">{pacotes.length > 1 ? 'Escolha o pacote' : 'O pacote'}</h2>
          <div role="radiogroup" aria-label="Pacotes" className="flex flex-col gap-2.5">
            {pacotes.map((k) => {
              const marcado = escolhido?.nome === k.nome;
              return (
                <button key={k.nome} type="button" role="radio" aria-checked={marcado} onClick={() => aoPacote(k.nome)}
                  className={`flex flex-col gap-2.5 rounded-cartao px-4 py-3.5 text-left ring-inset ${
                    marcado ? 'bg-amg-destaque-suave ring-2 ring-botao-1' : 'bg-superficie ring-1 ring-linha'}`}>
                  <span className="flex items-baseline justify-between gap-3">
                    <b className={`text-[17px] font-semibold ${marcado ? 'text-destaque-texto' : ''}`}>{k.nome}</b>
                    <b className="whitespace-nowrap text-[19px] font-bold tabular-nums">{reais(k.valor)}</b>
                  </span>
                  {itens.length > 0 && (
                    <ul className="flex flex-col gap-1 text-amg-legenda">
                      {itens.map((item) => {
                        const tem = (k.inclui ?? []).includes(item);
                        return (
                          <li key={item} className={`flex items-start gap-2 ${tem ? '' : 'text-texto-apagado'}`}>
                            {tem ? <Icone nome="ok" tamanho={14} className="mt-[3px] text-sucesso" /> : <span aria-hidden="true" className="w-[14px] text-center">—</span>}
                            <span>{item}{tem ? '' : <span className="sr-only">, não inclui</span>}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
          {contas && (
            <section className={bloco}>
              <h2 className="rotulo">O pagamento do {escolhido.nome}</h2>
              <div className="flex flex-col">
                {[
                  [`Entrada, na assinatura (${pag.entrada}%)`, contas.entrada],
                  contas.parcelas > 0 && [`Depois, ${contas.parcelas} ${contas.parcelas === 1 ? 'parcela' : 'parcelas'} de`, contas.parcela],
                  Number(pag.desconto) > 0 && [`Ou à vista, com ${pag.desconto}% de desconto`, contas.avista],
                ].filter(Boolean).map(([rotulo, valor]) => (
                  <div key={rotulo} className="flex items-baseline justify-between gap-3 border-t border-linha py-2 first:border-t-0">
                    <span>{rotulo}</span><b className="whitespace-nowrap tabular-nums">{reais(valor)}</b>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {p.jeito === 'pdf' && (
        <>
          <iframe title="A proposta em PDF" src={`${ARQUIVOS_URL}/${p.arquivo}`} className="h-[62vh] w-full rounded-cartao bg-superficie-2" />
          <Botao grande href={`${ARQUIVOS_URL}/${p.arquivo}`} target="_blank" rel="noreferrer">Abrir em tela cheia</Botao>
        </>
      )}
      {p.jeito === 'link' && (
        <Botao grande nivel={2} href={p.link} target="_blank" rel="noreferrer">Abrir a proposta <Icone nome="seta" /></Botao>
      )}

      {condicoes.length > 0 && (
        <section className={bloco}>
          <h2 className="rotulo">Condições</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-amg-legenda">
            {condicoes.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </section>
      )}
    </>
  );
}
