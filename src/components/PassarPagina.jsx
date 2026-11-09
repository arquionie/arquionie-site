import { useEffect, useRef, useState } from 'react';
import { Botao, Campo, Icone, Mensagem } from '@/components/Formulario';
import { Escolha } from '@/components/Listas';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { AMOSTRA, dataCurta, estadoDaAmostra } from '@/lib/licencas';
import { linkCurto } from '@/lib/tours';
import { AMOSTRA_MINHAS_EQUIPES, AMOSTRA_PARA_MIM } from '@/lib/equipe';

// Passar a página do cliente para outra conta (mockup docs/mockups/passar-pagina-para-outra-conta do repositório do programa, aprovado
// por ÊDI em 09/11/2026: "Pode seguir"; migração 20261109000000_passar_pagina_para_outra_conta.sql). O caso: o TCC do Natanael,
// renderizado e enviado pelo computador da Palheta, ficou na conta de lá. No cartão de MINHA CONTA › APRESENTAÇÕES, os três pontinhos
// no fim da faixa de baixo (ÊDI: "para não ficar tão explícito") abrem Passar para outra conta e Excluir; quem recebe aceita no bloco
// Chegou para você, no alto das Apresentações dele.

// O menu dos três pontinhos. Ele flutua por cima da página, embaixo do botão (o cartão corta o que passa da borda dele), e fecha com
// um clique fora, com o Esc ou ao rolar a página.
export function MaisAcoes({ itens }) {
  const [lugar, setLugar] = useState(null);
  const botao = useRef(null);
  const caixa = useRef(null);
  const fechar = (foco = true) => {
    setLugar(null);
    if (foco) botao.current?.focus();
  };

  useEffect(() => {
    if (!lugar) return undefined;
    caixa.current?.querySelector('button')?.focus();
    const fora = (e) => !caixa.current?.contains(e.target) && !botao.current?.contains(e.target) && setLugar(null);
    const tecla = (e) => e.key === 'Escape' && fechar();
    const mexeu = () => setLugar(null);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', mexeu, true);
    window.addEventListener('resize', mexeu);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', mexeu, true);
      window.removeEventListener('resize', mexeu);
    };
  }, [lugar]);

  function abrir() {
    if (lugar) return fechar(false);
    const r = botao.current.getBoundingClientRect();
    setLugar({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
  }

  return (
    <>
      <button ref={botao} type="button" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={!!lugar} onClick={abrir}
        className={`grid aspect-square h-botao-pequeno place-items-center rounded-toque hover:bg-superficie-2 hover:text-texto ${
          lugar ? 'bg-superficie-2 text-texto' : 'text-texto-apagado'}`}>
        <Icone nome="mais" tamanho={18} />
      </button>
      {lugar && (
        <div ref={caixa} role="menu" style={{ position: 'fixed', top: lugar.top, right: lugar.right }}
          className="z-50 w-64 max-w-[calc(100vw-16px)] rounded-cartao bg-superficie p-1.5 text-amg-corpo shadow-amg-janela">
          {itens.map((item, i) =>
            item === '-' ? (
              <div key={`linha-${i}`} className="my-1 h-px bg-linha" />
            ) : (
              <button key={item.rotulo} type="button" role="menuitem"
                onClick={() => {
                  fechar(false);
                  item.acao();
                }}
                className={`flex min-h-amg-toque-minimo w-full items-center gap-2.5 rounded-dentro px-3 text-left font-medium hover:bg-superficie-2 sm:min-h-[38px] ${
                  item.perigo ? 'text-destaque-texto' : 'text-texto'}`}>
                <span className={item.perigo ? '' : 'text-texto-apagado'}><Icone nome={item.icone} tamanho={16} /></span>
                {item.rotulo}
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}

function LinhaDoQueMuda({ rotulo, children }) {
  return (
    <div className="grid gap-x-3 gap-y-0.5 border-t border-linha px-3.5 py-2.5 first:border-t-0 sm:grid-cols-[110px_minmax(0,1fr)]">
      <span className="text-texto-apagado">{rotulo}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

// O painel aberto dentro do cartão: para outra pessoa, pelo e-mail (espera o aceite), ou para o escritório da equipe (na hora).
export function PainelDePassar({ apresentacao, area, voltar, aoPassar }) {
  const [equipes, setEquipes] = useState([]);
  const [para, setPara] = useState('pessoa');
  const [email, setEmail] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const ativas = (lista) => lista.filter((e) => e.situacao === 'ativo' && e.responsavel !== area);
    if (AMOSTRA) return setEquipes(ativas(AMOSTRA_MINHAS_EQUIPES));
    supabase.rpc('minhas_equipes').then(({ data }) => setEquipes(ativas(data ?? [])));
  }, [area]);

  const escritorio = equipes.find((e) => e.responsavel === para);
  const semEmail = !escritorio && !email.trim();

  async function passar() {
    setErro('');
    setOcupado(true);
    if (AMOSTRA) {
      setOcupado(false);
      return aoPassar(escritorio ? { passada: true, para: escritorio.escritorio }
        : { passada: false, para: email.trim(), paraEmail: email.trim().toLowerCase() });
    }
    const { data, error } = await supabase.rpc('apresentacao_passar', escritorio
      ? { p_id: apresentacao.id, p_escritorio: escritorio.responsavel }
      : { p_id: apresentacao.id, p_email: email });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    if (!data.ok) return setErro(data.motivo);
    aoPassar({ ...data, paraEmail: email.trim().toLowerCase() });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-linha p-4">
      <b className="font-semibold">Passar a página para outra conta</b>
      {equipes.length > 0 && (
        <div>
          <Escolha rotulo="Para quem" valor={para} aoMudar={setPara}
            opcoes={[['pessoa', 'Outra pessoa'], ...equipes.map((e) => [e.responsavel, `O escritório ${e.escritorio}`])]} />
        </div>
      )}
      {!escritorio && (
        <Campo rotulo="E-mail de quem recebe" id={`passar-${apresentacao.id}`} tipo="email" valor={email} aoMudar={setEmail}
          autoComplete="off" autoFocus />
      )}
      <div className="overflow-hidden rounded-dentro bg-superficie-2 text-amg-legenda">
        <LinhaDoQueMuda rotulo="Vai junto">
          o link, que não muda; os envios; os comentários e a aprovação; as visitas; os arquivos, que não sobem de novo
        </LinhaDoQueMuda>
        <LinhaDoQueMuda rotulo="Muda">
          {escritorio
            ? `a página vai para a área do escritório ${escritorio.escritorio} na hora e mostra o nome e o logo dele; você continua vendo a página lá, como toda a equipe`
            : 'a página passa a mostrar o nome e o logo de quem recebe; o limite de páginas conta na conta dela; você deixa de ver a página'}
        </LinhaDoQueMuda>
        {!escritorio && (
          <LinhaDoQueMuda rotulo="Até aceitar">a página continua no ar, com você, e dá para cancelar; o pedido vale 30 dias</LinhaDoQueMuda>
        )}
      </div>
      {!escritorio && (
        <p className="rounded-dentro bg-amg-informacao-suave px-3.5 py-2.5 text-amg-legenda text-amg-informacao">
          Mande também o arquivo do projeto, o salvo depois do envio. É ele que guarda o link, para quem recebe mandar de novo pelo
          Arquionie no mesmo endereço.
        </p>
      )}
      <Mensagem erro>{erro}</Mensagem>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Botao type="button" onClick={voltar}>Voltar</Botao>
        <Botao principal type="button" disabled={ocupado || semEmail} onClick={passar}>
          {ocupado ? 'Passando…' : escritorio ? 'Passar ao escritório' : 'Passar a página'}
        </Botao>
      </div>
    </div>
  );
}

// No alto das Apresentações de quem recebe: as páginas que esperam o aceite dela, com Aceitar e Recusar.
export function ChegouParaVoce({ aoAceitar }) {
  const [dados, setDados] = useState(null);
  const [respondendo, setRespondendo] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = async () => {
    if (AMOSTRA) return setDados(estadoDaAmostra() === 'passagem' ? AMOSTRA_PARA_MIM : { passagens: [] });
    const { data, error } = await supabase.rpc('passagens_para_mim');
    setDados(error ? { passagens: [] } : data);
  };
  useEffect(() => {
    carregar();
  }, []);

  async function responder(p, aceitar) {
    setErro('');
    setAviso('');
    setRespondendo(p.id);
    if (AMOSTRA) {
      setDados((d) => ({ ...d, passagens: d.passagens.filter((x) => x.id !== p.id) }));
    } else {
      const { data, error } = await supabase.rpc('apresentacao_responder_passagem', { p_passagem: p.id, p_aceitar: aceitar });
      if (error || !data.ok) {
        setRespondendo(null);
        await carregar();
        return setErro(error ? mensagemDeErro(error) : data.motivo);
      }
      await carregar();
    }
    setRespondendo(null);
    setAviso(aceitar ? `A página de ${p.nome} é sua, no mesmo link: ${linkCurto(p.codigo)}.` : `Você recusou a página de ${p.nome}.`);
    if (aceitar) aoAceitar?.();
  }

  if (!dados || (!dados.passagens.length && !aviso && !erro)) return null;
  return (
    <section className="flex flex-col gap-1.5">
      {dados.passagens.length > 0 && <h2 className="rotulo ml-3.5">Chegou para você</h2>}
      {dados.passagens.map((p) => (
        <div key={p.id} className="flex flex-col gap-3 rounded-cartao bg-superficie p-4 shadow-cartao ring-2 ring-inset ring-destaque">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-dentro bg-amg-destaque-suave text-destaque-texto">
              <Icone nome="passar" tamanho={20} />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <b className="break-words font-semibold">{p.de} passou para você a página de {p.nome}</b>
              <small className="text-amg-legenda text-texto-apagado">
                {p.envios} {p.envios === 1 ? 'envio' : 'envios'} · {p.visitas} {p.visitas === 1 ? 'visita' : 'visitas'} ·{' '}
                {p.comentarios ? `${p.comentarios} ${p.comentarios === 1 ? 'comentário' : 'comentários'}` : 'nenhum comentário ainda'} ·{' '}
                {linkCurto(p.codigo)}
              </small>
              <small className="text-amg-legenda text-texto-apagado">
                {dados.temIdentidade
                  ? 'A página vai mostrar o seu nome e o seu logo.'
                  : 'A página vai mostrar o seu nome e o seu logo. Você ainda não preencheu: ela sai sem logo até você preencher no Arquionie, em Configurações › Escritório.'}{' '}
                O pedido vale até {dataCurta(p.venceEm)}.
              </small>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Botao type="button" disabled={!!respondendo} onClick={() => responder(p, false)}>Recusar</Botao>
            <Botao principal type="button" disabled={!!respondendo} onClick={() => responder(p, true)}>
              {respondendo === p.id ? 'Aceitando…' : 'Aceitar a página'}
            </Botao>
          </div>
        </div>
      ))}
      <Mensagem>{aviso}</Mensagem>
      <Mensagem erro>{erro}</Mensagem>
    </section>
  );
}
