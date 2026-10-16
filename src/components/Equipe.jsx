import { useEffect, useState } from 'react';
import { Botao, Campo, Etiqueta, Mensagem } from '@/components/Formulario';
import { Confirmacao, Linha, TextoDaLinha } from '@/components/Listas';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { AMOSTRA, copiarTexto, dataCurta } from '@/lib/licencas';
import { quandoLegivel } from '@/lib/tours';
import { AMOSTRA_MINHA_EQUIPE, textoConviteDaEquipe } from '@/lib/equipe';

// MINHA CONTA › EQUIPE, na conta do responsável (mockup docs/mockups/equipe-e-apresentacoes do repositório do programa, aprovado
// por ÊDI em 11/10/2026; migração 20261011010000_equipe_e_plano.sql). O responsável digita o e-mail e CADASTRA; quem já tem conta
// confirma na própria conta; quem não tem fica ESPERANDO A CONTA, com o COPIAR CONVITE para mandar pelo WhatsApp (o Arquionie não
// manda e-mail). TIRAR DA EQUIPE vale na hora. O SOLICITAR PLANO PERSONALIZADO fica embaixo dos computadores (PlanoDaConta).
// No modo AMIGÁVEL desde o mockup site-amigavel (16/10/2026): a tabela virou lista agrupada, com os botões em cada linha.

const SELO = {
  responsavel: ['Responsável', 'urgente'],
  ativo: ['Na equipe', 'neutra'],
  convidado: ['Falta confirmar', 'informacao'],
  esperando: ['Esperando a conta', 'informacao'],
  recusou: ['Recusou', 'neutra'],
};

function Selo({ situacao }) {
  const [texto, tipo] = SELO[situacao] ?? [situacao, 'neutra'];
  return <Etiqueta tipo={tipo}>{texto}</Etiqueta>;
}

// O cartão aberto dentro da página (o pedido de plano, o convite): o rótulo pequeno em cima.
export function CartaoAberto({ rotulo, children, ...resto }) {
  const Tag = resto.onSubmit ? 'form' : 'div';
  return (
    <Tag className="mt-3 flex max-w-[640px] flex-col gap-3 rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5" {...resto}>
      <p className="rotulo">{rotulo}</p>
      {children}
    </Tag>
  );
}

// SOLICITAR PLANO PERSONALIZADO: quantas pessoas usam ao mesmo tempo, o WhatsApp e a mensagem; chega a ÊDI em /gestao.
export function PlanoPersonalizado({ pedido, aoEnviar, aberto: abertoNoComeco = false }) {
  const [aberto, setAberto] = useState(abertoNoComeco);
  const [pessoas, setPessoas] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    const n = Number(String(pessoas).replace(/\D/g, ''));
    if (!(n >= 2)) return setErro('Diga quantas pessoas usam o Arquionie ao mesmo tempo.');
    setOcupado(true);
    let r;
    if (AMOSTRA) r = { ok: true, em: new Date().toISOString() };
    else {
      const { data, error } = await supabase.rpc('pedir_plano', { p_pessoas: n, p_whatsapp: whatsapp, p_mensagem: mensagem });
      if (error) { setOcupado(false); return setErro(mensagemDeErro(error)); }
      r = data;
    }
    setOcupado(false);
    if (!r.ok) return setErro(r.motivo);
    setAberto(false);
    aoEnviar?.({ em: r.em, pessoas: n, respondidoEm: null });
  }

  const pendente = pedido && !pedido.respondidoEm;
  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-amg-legenda text-texto-apagado">
        {pendente ? (
          <span>
            <b className="text-texto">Pedido enviado em {dataCurta(pedido.em)}</b> · {pedido.pessoas} pessoas · a gente chama no WhatsApp para montar o plano
          </span>
        ) : (
          <span>Mais gente usando ao mesmo tempo?</span>
        )}
        <Botao pequeno nivel={2} type="button" onClick={() => setAberto(true)}>
          {pendente ? 'Mudar o pedido' : 'Solicitar plano personalizado'}
        </Botao>
      </div>
    );
  }
  return (
    <CartaoAberto rotulo="Solicitar plano personalizado" onSubmit={enviar}>
      <div className="flex flex-col gap-2">
        <Campo id="plano-pessoas" rotulo="Pessoas" tipo="text" valor={pessoas} aoMudar={setPessoas} placeholder="quantas usam ao mesmo tempo" autoFocus inputMode="numeric" />
        <Campo id="plano-whatsapp" rotulo="WhatsApp" tipo="tel" valor={whatsapp} aoMudar={setWhatsapp} placeholder="(DDD) número para conversarmos" />
        <Campo id="plano-mensagem" rotulo="Mensagem" valor={mensagem} aoMudar={setMensagem} placeholder="opcional: como a equipe trabalha" />
      </div>
      <p className="text-amg-legenda text-texto-apagado">
        A gente chama no WhatsApp para montar o plano. Com o plano fechado, as contas a mais aparecem em Licenças, para você passar a quem vai usar.
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Botao type="button" onClick={() => { setAberto(false); setErro(''); }}>Cancelar</Botao>
        <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar pedido'}</Botao>
      </div>
      <Mensagem erro>{erro}</Mensagem>
    </CartaoAberto>
  );
}

// O convite pronto, com o COPIAR CONVITE (o Arquionie não manda e-mail: a pessoa manda pelo WhatsApp).
export function ConvitePronto({ convite }) {
  const [copiado, setCopiado] = useState('');
  return (
    <CartaoAberto rotulo="Convite pronto para mandar">
      <p className="whitespace-pre-line">{convite}</p>
      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <span role="status" className="text-amg-legenda text-texto-apagado">{copiado}</span>
        <Botao principal type="button" onClick={async () => setCopiado((await copiarTexto(convite)) ? 'Copiado.' : 'Selecione o texto acima e copie com Ctrl+C.')}>
          Copiar convite
        </Botao>
      </div>
    </CartaoAberto>
  );
}

export default function Equipe({ aoMudar }) {
  const [dados, setDados] = useState(null);
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState('');
  const [convite, setConvite] = useState(null);
  const [tirando, setTirando] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = async () => {
    if (AMOSTRA) return setDados((d) => d ?? AMOSTRA_MINHA_EQUIPE);
    const { data, error } = await supabase.rpc('minha_equipe');
    // Antes da migração da equipe no banco, a seção fica vazia (sem erro na conta).
    setDados(error ? { escritorio: '', pessoas: [], computadores: 0, limiteComputadores: 3, pedidoDePlano: null } : data);
  };
  useEffect(() => {
    carregar();
  }, []);

  async function cadastrar(e) {
    e.preventDefault();
    setErro('');
    setConvite(null);
    const v = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return setErro('Digite o e-mail da pessoa, por exemplo maria@escritorio.com.br.');
    setOcupado(true);
    let r;
    if (AMOSTRA) {
      r = { ok: true, email: v, esperandoConta: true, escritorio: dados.escritorio };
      setDados((d) => ({ ...d, pessoas: [...d.pessoas, { id: 'n' + Date.now(), email: v, nome: '', situacao: 'esperando', cadastradoEm: new Date().toISOString() }] }));
    } else {
      const { data, error } = await supabase.rpc('equipe_cadastrar', { p_email: v });
      if (error) { setOcupado(false); return setErro(mensagemDeErro(error)); }
      r = data;
    }
    setOcupado(false);
    if (!r.ok) return setErro(r.motivo);
    setEmail('');
    if (r.esperandoConta) setConvite(textoConviteDaEquipe({ escritorio: r.escritorio, email: r.email }));
    if (!AMOSTRA) carregar();
    aoMudar?.();
  }

  async function tirar(p) {
    setErro('');
    setOcupado(true);
    if (AMOSTRA) setDados((d) => ({ ...d, pessoas: d.pessoas.filter((x) => x.id !== p.id) }));
    else {
      const { data, error } = await supabase.rpc('equipe_tirar', { p_id: p.id });
      if (error || !data.ok) { setOcupado(false); return setErro(error ? mensagemDeErro(error) : data.motivo); }
      await carregar();
    }
    setOcupado(false);
    setTirando(null);
  }

  function mostrarConvite(p) {
    setErro('');
    setConvite(textoConviteDaEquipe({ escritorio: dados.escritorio, email: p.email }));
  }

  if (dados === null) return <p className="text-texto-apagado">Carregando…</p>;
  const situacao = (p) =>
    p.situacao === 'ativo'
      ? `Entrou em ${dataCurta(p.entrouEm)}${p.ultimoAcesso ? ` · último acesso ${quandoLegivel(p.ultimoAcesso)}` : ''}`
      : p.situacao === 'esperando'
        ? 'Ainda não entrou no Arquionie com este e-mail.'
        : p.situacao === 'convidado'
          ? 'Tem conta: falta confirmar a entrada na equipe.'
          : 'Recusou o convite. Cadastre de novo para convidar outra vez.';
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[72ch] text-texto-apagado">
        Quem você cadastrar aqui entra com o próprio e-mail ou com o Google e vê a área do escritório: as apresentações e os ajustes dos
        clientes. No programa, abre os projetos do escritório.
      </p>
      <form onSubmit={cadastrar} className="flex max-w-[640px] flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Campo id="equipe-email" rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} placeholder="nome@escritorio.com.br" />
        </div>
        <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'Cadastrando…' : 'Cadastrar'}</Botao>
      </form>

      <div>
        <p className="rotulo mb-1.5 ml-3.5">
          {dados.escritorio ? `${dados.escritorio} · ` : ''}{dados.pessoas.length + 1} {dados.pessoas.length === 0 ? 'pessoa' : 'pessoas'}
        </p>
        <div className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">
          <Linha>
            <TextoDaLinha titulo="Você" sub={dados.email}>
              <small className="block text-amg-legenda text-texto-apagado">Cadastra a equipe, cuida da identidade e do termo e pede o plano.</small>
            </TextoDaLinha>
            <Selo situacao="responsavel" />
          </Linha>
          {dados.pessoas.map((p) => (
            <Linha key={p.id}>
              <TextoDaLinha titulo={p.nome || p.email} sub={p.nome ? p.email : null}>
                <small className="block text-amg-legenda text-texto-apagado">{situacao(p)}</small>
              </TextoDaLinha>
              <div className="flex flex-wrap items-center gap-2">
                <Selo situacao={p.situacao} />
                <Botao pequeno type="button" onClick={() => setTirando(p)}>Tirar da equipe</Botao>
                {p.situacao === 'esperando' && <Botao pequeno nivel={2} type="button" onClick={() => mostrarConvite(p)}>Copiar convite</Botao>}
              </div>
            </Linha>
          ))}
        </div>
      </div>

      {tirando && (
        <Confirmacao voltar={() => setTirando(null)} acao={() => tirar(tirando)} rotulo="Tirar" rotuloOcupado="Tirando…" ocupado={ocupado}>
          Tirar <b>{tirando.nome || tirando.email}</b> da equipe? Deixa de ver as apresentações e os ajustes do escritório na hora. O que já fez
          fica no histórico com o nome.
        </Confirmacao>
      )}

      {convite && <ConvitePronto convite={convite} />}

      <Mensagem erro>{erro}</Mensagem>
    </div>
  );
}

// O SOLICITAR PLANO PERSONALIZADO embaixo dos computadores, na EQUIPE E LICENÇAS (mockup minha-conta-em-paginas, 12/10/2026). O pedido
// de antes vem de minha_equipe; o #plano (do aviso do quarto computador, no CONECTAR) já abre o formulário.
export function PlanoDaConta() {
  const [pedido, setPedido] = useState(undefined);
  useEffect(() => {
    if (AMOSTRA) return setPedido(AMOSTRA_MINHA_EQUIPE.pedidoDePlano);
    supabase.rpc('minha_equipe').then(({ data, error }) => setPedido(error ? null : data?.pedidoDePlano ?? null));
  }, []);
  if (pedido === undefined) return null;
  return (
    <div id="plano" className="mt-3 scroll-mt-6">
      <PlanoPersonalizado pedido={pedido} aberto={window.location.hash === '#plano'} aoEnviar={setPedido} />
    </div>
  );
}
