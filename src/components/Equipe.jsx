import { useEffect, useState } from 'react';
import { Botao, Campo, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { AMOSTRA, copiarTexto, dataCurta } from '@/lib/licencas';
import { quandoLegivel } from '@/lib/tours';
import { AMOSTRA_MINHA_EQUIPE, textoConviteDaEquipe } from '@/lib/equipe';

// MINHA CONTA › EQUIPE, na conta do responsável (mockup docs/mockups/equipe-e-apresentacoes do repositório do programa, aprovado
// por ÊDI em 11/10/2026; migração 20261011010000_equipe_e_plano.sql). O responsável digita o e-mail e CADASTRA; quem já tem conta
// confirma na própria conta; quem não tem fica ESPERANDO A CONTA, com o COPIAR CONVITE para mandar pelo WhatsApp (o Arquionie não
// manda e-mail). TIRAR DA EQUIPE vale na hora. Embaixo, os computadores da conta e o SOLICITAR PLANO PERSONALIZADO.

const SELO = {
  ativo: ['EQUIPE', 'border border-aqi-borda text-white'],
  convidado: ['FALTA CONFIRMAR', 'border border-aqi-borda text-aqi-muted'],
  esperando: ['ESPERANDO A CONTA', 'border border-aqi-borda text-aqi-muted'],
  recusou: ['RECUSOU', 'border border-aqi-borda text-[#E8877B]'],
};

function Selo({ situacao }) {
  const [texto, classes] = situacao === 'responsavel' ? ['RESPONSÁVEL', 'bg-aqi-campo text-white'] : SELO[situacao] ?? [situacao.toUpperCase(), 'border border-aqi-borda'];
  return <span className={`inline-block whitespace-nowrap px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide ${classes}`}>{texto}</span>;
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
      <span className="text-[13px]">
        {pendente ? (
          <span className="text-aqi-muted">
            <b className="text-white">PEDIDO ENVIADO EM {dataCurta(pedido.em)}</b> ({pedido.pessoas} pessoas) · a gente chama no WhatsApp para montar o plano ·{' '}
          </span>
        ) : null}
        <button type="button" onClick={() => setAberto(true)} className="link font-semibold tracking-[0.04em]">
          {pendente ? 'MUDAR O PEDIDO' : 'SOLICITAR PLANO PERSONALIZADO'}
        </button>
      </span>
    );
  }
  return (
    <form onSubmit={enviar} className="mt-3 max-w-[640px] bg-aqi-barra p-4">
      <p className="mb-2 text-[13px] font-semibold tracking-[0.08em] text-aqi-coral">SOLICITAR PLANO PERSONALIZADO</p>
      <Campo id="plano-pessoas" rotulo="PESSOAS" tipo="text" valor={pessoas} aoMudar={setPessoas} placeholder="quantas usam ao mesmo tempo" autoFocus inputMode="numeric" />
      <Campo id="plano-whatsapp" rotulo="WHATSAPP" tipo="tel" valor={whatsapp} aoMudar={setWhatsapp} placeholder="(DDD) número para conversarmos" />
      <Campo id="plano-mensagem" rotulo="MENSAGEM" valor={mensagem} aoMudar={setMensagem} placeholder="opcional: como a equipe trabalha" />
      <p className="mt-2 text-[12.5px] text-aqi-muted">
        A gente chama no WhatsApp para montar o plano. Com o plano fechado, as contas a mais aparecem em LICENÇAS, para você passar a quem vai usar.
      </p>
      <div className="mt-3 flex justify-end gap-2.5">
        <Botao type="button" onClick={() => { setAberto(false); setErro(''); }}>CANCELAR</Botao>
        <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'ENVIANDO…' : 'ENVIAR PEDIDO'}</Botao>
      </div>
      <div className="mt-2"><Mensagem erro>{erro}</Mensagem></div>
    </form>
  );
}

export default function Equipe({ aoMudar }) {
  const [dados, setDados] = useState(null);
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState('');
  const [convite, setConvite] = useState(null);
  const [copiado, setCopiado] = useState('');
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
    if (r.esperandoConta) { setConvite(textoConviteDaEquipe({ escritorio: r.escritorio, email: r.email })); setCopiado(''); }
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
    setCopiado('');
  }

  if (dados === null) return <p className="text-aqi-muted">Carregando…</p>;
  const situacao = (p) => (
    <>
      {p.situacao === 'ativo' ? `Entrou em ${dataCurta(p.entrouEm)}` : p.situacao === 'esperando' ? 'Ainda não entrou no Arquionie com este e-mail.'
        : p.situacao === 'convidado' ? 'Tem conta: falta confirmar a entrada na equipe.' : 'Recusou o convite. Cadastre de novo para convidar outra vez.'}
      {p.situacao === 'ativo' && p.ultimoAcesso && <small className="block text-[12px] text-aqi-muted">último acesso {quandoLegivel(p.ultimoAcesso)}</small>}
    </>
  );
  return (
    <>
      <p className="mb-3 max-w-[72ch] text-[14px] text-aqi-muted">
        Quem você cadastrar aqui entra com o próprio e-mail ou com o Google e passa a ver a área do escritório: as apresentações, os ajustes
        dos clientes e os envios. No programa, abre os projetos do escritório e recebe os ajustes que chegam. A licença de cada pessoa continua
        em LICENÇAS.
      </p>
      <form onSubmit={cadastrar} className="mb-4 grid max-w-[640px] grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <Campo id="equipe-email" rotulo="E-MAIL" tipo="email" valor={email} aoMudar={setEmail} placeholder="nome@escritorio.com.br" />
        <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'CADASTRANDO…' : 'CADASTRAR'}</Botao>
      </form>

      <p className="mb-1.5 text-[11px] font-semibold tracking-[0.1em] text-aqi-coral">
        {dados.escritorio ? `${dados.escritorio} · ` : ''}{dados.pessoas.length + 1} {dados.pessoas.length === 0 ? 'PESSOA' : 'PESSOAS'}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-aqi-borda text-left text-[11px] tracking-[0.1em] text-aqi-muted">
              <th className="w-[34%] px-3 py-2 font-semibold">PESSOA</th>
              <th className="w-[17%] px-3 py-2 font-semibold">PAPEL</th>
              <th className="px-3 py-2 font-semibold">SITUAÇÃO</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#262D37] align-top">
              <td className="px-3 py-2.5"><b className="text-white">Você</b><small className="block break-all text-[12px] text-aqi-muted">{dados.email}</small></td>
              <td className="px-3 py-2.5"><Selo situacao="responsavel" /></td>
              <td className="px-3 py-2.5">Cadastra a equipe, cuida da identidade e do termo e pede o plano.</td>
              <td />
            </tr>
            {dados.pessoas.map((p) => (
              <tr key={p.id} className="border-b border-[#262D37] align-top">
                <td className="px-3 py-2.5">
                  <b className="break-all text-white">{p.nome || p.email}</b>
                  {p.nome && <small className="block break-all text-[12px] text-aqi-muted">{p.email}</small>}
                </td>
                <td className="px-3 py-2.5"><Selo situacao={p.situacao} /></td>
                <td className="px-3 py-2.5">{situacao(p)}</td>
                <td className="px-3 py-2.5 text-right text-[12px] font-semibold tracking-[0.04em]">
                  <div className="flex flex-col items-end gap-1.5 whitespace-nowrap">
                    {p.situacao === 'esperando' && <button type="button" onClick={() => mostrarConvite(p)} className="link">COPIAR CONVITE</button>}
                    <button type="button" onClick={() => setTirando(p)} className="text-[#E8877B] underline underline-offset-[3px]">TIRAR DA EQUIPE</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tirando && (
        <div className="mt-3 flex flex-wrap items-center gap-3 bg-aqi-barra px-3.5 py-2.5 text-[13.5px]">
          <span className="min-w-[260px] flex-1">
            Tirar <b className="text-white">{tirando.nome || tirando.email}</b> da equipe? Deixa de ver as apresentações e os ajustes do escritório na hora.
            O que já fez fica no histórico com o nome.
          </span>
          <Botao principal type="button" disabled={ocupado} onClick={() => tirar(tirando)}>{ocupado ? 'TIRANDO…' : 'TIRAR'}</Botao>
          <Botao type="button" onClick={() => setTirando(null)}>VOLTAR</Botao>
        </div>
      )}

      {convite && (
        <div className="mt-3 max-w-[640px] bg-aqi-barra p-4">
          <p className="mb-2 text-[13px] font-semibold tracking-[0.08em] text-aqi-coral">CONVITE PRONTO PARA MANDAR</p>
          <p className="whitespace-pre-line text-[14px]">{convite}</p>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
            <span role="status" className="text-[12px] text-aqi-muted">{copiado}</span>
            <Botao principal type="button" onClick={async () => setCopiado((await copiarTexto(convite)) ? 'COPIADO' : 'Selecione o texto acima e copie com Ctrl+C.')}>
              COPIAR CONVITE
            </Botao>
          </div>
        </div>
      )}

      <div id="plano" className="mt-5 scroll-mt-6 border-t border-[#262D37] pt-3">
        <p className="mb-1 text-[11px] font-semibold tracking-[0.1em] text-aqi-muted">COMPUTADORES AO MESMO TEMPO</p>
        <p className="mb-1 text-[13.5px]">
          A conta do escritório: <b className="text-white">{dados.computadores} de {dados.limiteComputadores}</b> computadores conectados. Quem é do
          escritório pode entrar com a conta do escritório em até {dados.limiteComputadores} computadores ao mesmo tempo; com mais gente, o escritório
          precisa de mais contas.
        </p>
        <PlanoPersonalizado pedido={dados.pedidoDePlano} aberto={window.location.hash === '#plano'}
          aoEnviar={(pedido) => setDados((d) => ({ ...d, pedidoDePlano: pedido }))} />
      </div>
      <div className="mt-2"><Mensagem erro>{erro}</Mensagem></div>
    </>
  );
}
