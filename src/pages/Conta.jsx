import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Botao, Campo, Chave, Etiqueta, Icone, Mensagem } from '@/components/Formulario';
import { Confirmacao, Grupo, Linha, LinhaDeValor, TextoDaLinha, Vazio, emFrase } from '@/components/Listas';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { useSessao } from '@/lib/Sessao';
import { dadosDaConta } from '@/lib/conta';
import { dataLegivel } from '@/lib/manifesto';
import { TEMAS, guardarTema, useTema } from '@/lib/aparencia';
import { ATUACOES, EMAIL_CONTATO } from '@/config';
import MeusTours from '@/components/MeusTours';
import Apresentacoes from '@/components/Apresentacoes';
import Equipe, { CartaoAberto, ConvitePronto, PlanoDaConta } from '@/components/Equipe';
import { AMOSTRA_CONVITE, AMOSTRA_MINHAS_EQUIPES } from '@/lib/equipe';
import {
  AMOSTRA, AMOSTRA_COMPUTADORES, AMOSTRA_MINHAS_LICENCAS, PLANOS, dataCurta, estadoDaAmostra, nomeProduto, rotuloSituacao, textoConvite,
} from '@/lib/licencas';

// No modo AMIGÁVEL desde o mockup site-amigavel (aprovado por ÊDI em 16/10/2026): o menu em cápsulas, as tabelas viraram listas
// agrupadas com os botões em cada linha, e a página Aparência (Claro, Escuro e Automático).

const LIMITE_COMPUTADORES = 3; // decisão de 02/10/2026

function Bloco({ id, titulo, children }) {
  return (
    <section id={id} className="mb-9 flex scroll-mt-6 flex-col gap-3">
      <h2 className="text-amg-secao">{titulo}</h2>
      {children}
    </section>
  );
}

// Os computadores vêm da tabela `computadores` (supabase/migrations): o programa registra ao entrar e o plugin do Revit
// ao ser autorizado em /conectar. Cada produto tem o seu limite de três. Sem nenhum computador, a página diz isso.
function Computadores() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const carregar = async () => {
    if (AMOSTRA) return setLista(AMOSTRA_COMPUTADORES);
    const { data, error } = await supabase.from('computadores').select('id, nome, versao, ultimo_acesso, produto').order('ultimo_acesso', { ascending: false });
    if (error) setLista([]);
    else setLista(data);
  };
  useEffect(() => {
    carregar();
  }, []);

  async function desconectar(id) {
    setErro('');
    if (AMOSTRA) return setLista((l) => l.filter((c) => c.id !== id));
    const { error } = await supabase.from('computadores').delete().eq('id', id);
    if (error) return setErro(mensagemDeErro(error));
    carregar();
  }

  if (lista === null) return <p className="text-texto-apagado">Carregando…</p>;
  const grupos = ['arquionie-revit', 'arquionie']
    .map((p) => ({ produto: p, itens: lista.filter((c) => (c.produto ?? 'arquionie') === p) }))
    .filter((g) => g.itens.length > 0);
  return (
    <>
      <p className="text-texto-apagado">
        Até {LIMITE_COMPUTADORES} computadores por produto ao mesmo tempo. Desconectar tira o acesso daquele computador na próxima vez que ele
        conferir a conta.
      </p>
      {grupos.length === 0 ? (
        <Vazio>Nenhum computador conectado ainda. Ele aparece aqui quando você entrar com esta conta no programa ou no Revit.</Vazio>
      ) : (
        grupos.map((g) => (
          <Grupo key={g.produto} rotulo={`${nomeProduto(g.produto)} · ${g.itens.length} de ${LIMITE_COMPUTADORES}`}>
            {g.itens.map((c) => (
              <Linha key={c.id}>
                <TextoDaLinha
                  titulo={c.nome}
                  sub={`último acesso ${new Date(c.ultimo_acesso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · versão ${c.versao ?? '—'}`}
                />
                <Botao pequeno type="button" onClick={() => desconectar(c.id)}>Desconectar</Botao>
              </Linha>
            ))}
          </Grupo>
        ))
      )}
      <Mensagem erro>{erro}</Mensagem>
    </>
  );
}

// As licenças da conta: as que a pessoa usa e as que ela comprou para distribuir aos colegas (decisão 5 do ÊDI,
// 05/10/2026; função minhas_licencas). Uma troca a cada 30 dias depois que o colega começa a usar.
function Licencas({ nome }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [alvo, setAlvo] = useState(null);
  const [email, setEmail] = useState('');
  const [convite, setConvite] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = async () => {
    if (AMOSTRA) return setDados(AMOSTRA_MINHAS_LICENCAS);
    const { data, error } = await supabase.rpc('minhas_licencas');
    if (error) {
      setErro(mensagemDeErro(error));
      return setDados({ usa: [], comprou: [] });
    }
    setDados(data);
  };
  useEffect(() => {
    carregar();
  }, []);

  if (dados === null) return <p className="text-texto-apagado">Carregando…</p>;
  const usaOProduto = (produto) => dados.usa.some((u) => u.produto === produto && ['ativa', 'vencendo'].includes(u.situacao));

  function abrirPassar(l) {
    setErro('');
    setConvite('');
    setEmail('');
    setAlvo(l);
  }

  async function passar(e) {
    e.preventDefault();
    setErro('');
    const v = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return setErro('Digite o e-mail do colega, por exemplo bruno@exemplo.com.br.');
    setOcupado(true);
    let r;
    if (AMOSTRA) r = { ok: true, email: v, esperandoConta: true, expiraEm: alvo.expiraEm };
    else {
      const { data, error } = await supabase.rpc('licenca_passar', { p_id: alvo.id, p_email: v });
      if (error) {
        setOcupado(false);
        return setErro(mensagemDeErro(error));
      }
      r = data;
    }
    setOcupado(false);
    if (!r.ok) return setErro(r.motivo + (r.proximaTroca ? ` A próxima troca fica liberada em ${dataCurta(r.proximaTroca)}.` : ''));
    setConvite(textoConvite({ quemPassou: nome, email: v, produto: alvo.produto, expiraEm: r.expiraEm ?? alvo.expiraEm }));
    if (AMOSTRA) {
      setDados((d) => ({
        ...d,
        comprou: d.comprou.map((x) => (x.id === alvo.id ? { ...x, titular: v, titularEhVoce: false, situacao: 'esperando a conta' } : x)),
      }));
    } else carregar();
    setAlvo(null);
    setEmail('');
  }

  async function ficar(l) {
    setErro('');
    setConvite('');
    if (AMOSTRA) {
      return setDados((d) => ({
        ...d,
        comprou: d.comprou.map((x) => (x.id === l.id ? { ...x, titular: 'você', titularEhVoce: true, situacao: 'ativa' } : x)),
      }));
    }
    const { data, error } = await supabase.rpc('licenca_ficar', { p_id: l.id });
    if (error) return setErro(mensagemDeErro(error));
    if (!data.ok) return setErro(data.motivo);
    carregar();
  }

  function mostrarConvite(l) {
    setErro('');
    setAlvo(null);
    setConvite(textoConvite({ quemPassou: nome, email: l.titular, produto: l.produto, expiraEm: l.expiraEm }));
  }

  const selo = (l) => {
    if (l.situacao === 'sem titular') return <Etiqueta tipo="urgente">Sem titular</Etiqueta>;
    if (l.situacao === 'esperando a conta') return <Etiqueta tipo="informacao">Esperando a conta</Etiqueta>;
    if (l.situacao === 'ativa' || l.situacao === 'vencendo') return <Etiqueta>Em uso</Etiqueta>;
    return <Etiqueta>{emFrase(rotuloSituacao(l.situacao, l.expiraEm))}</Etiqueta>;
  };

  const acoes = (l) => {
    const valendo = !['vencida', 'revogada'].includes(l.situacao);
    if (!valendo) return null;
    // os botões pela hierarquia (DECISOES 11/10/2026): a terracota só na licença sem ninguém, que pede atenção; o mais forte à direita
    if (l.situacao === 'sem titular') {
      return (
        <div className="flex flex-wrap gap-2">
          {!usaOProduto(l.produto) && <Botao pequeno nivel={2} type="button" onClick={() => ficar(l)}>Ficar com esta</Botao>}
          <Botao pequeno nivel={1} type="button" onClick={() => abrirPassar(l)}>Passar para um colega</Botao>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        {l.proximaTroca ? (
          <span className="text-amg-legenda text-texto-apagado">próxima troca em {dataCurta(l.proximaTroca)}</span>
        ) : (
          <Botao pequeno nivel={2} type="button" onClick={() => abrirPassar(l)}>Trocar</Botao>
        )}
        {l.situacao === 'esperando a conta' && <Botao pequeno nivel={2} type="button" onClick={() => mostrarConvite(l)}>Copiar convite</Botao>}
      </div>
    );
  };

  return (
    <>
      {dados.usa.length === 0 ? (
        <p className="text-texto-apagado">Nenhuma licença paga em uso nesta conta.</p>
      ) : (
        <Grupo>
          {dados.usa.map((u) => (
            <Linha key={u.id}>
              <TextoDaLinha titulo={nomeProduto(u.produto)}>
                <span className="block">
                  {['ativa', 'vencendo'].includes(u.situacao) ? `Em uso por você, até ${dataCurta(u.expiraEm)}.` : emFrase(rotuloSituacao(u.situacao, u.expiraEm))}
                </span>
                {u.bonus && <small className="block text-amg-legenda text-texto-apagado">Os 30 dias de bônus da troca já estão somados.</small>}
                {u.compradaPor && <small className="block text-amg-legenda text-texto-apagado">Comprada por {u.compradaPor}.</small>}
              </TextoDaLinha>
              <Etiqueta tipo="urgente">{emFrase(PLANOS[u.plano] ?? u.plano)}</Etiqueta>
            </Linha>
          ))}
        </Grupo>
      )}

      {dados.comprou.length > 0 && (
        <>
          <h3 className="mt-2 font-semibold">Licenças que você comprou</h3>
          <p className="-mt-1 text-texto-apagado">
            Passe cada uma para quem vai usar: a pessoa entra com o próprio e-mail. Depois que ela começa a usar, a licença troca de pessoa no
            máximo uma vez a cada 30 dias.
          </p>
          <Grupo>
            {dados.comprou.map((l, i) => (
              <Linha key={l.id}>
                <span aria-hidden="true" className="w-6 shrink-0 text-texto-apagado tabular-nums">{i + 1}</span>
                <TextoDaLinha titulo={l.titularEhVoce ? 'Você' : l.titular || '—'} sub={`Licença ${i + 1} · validade ${dataCurta(l.expiraEm)}`} />
                <div className="flex flex-wrap items-center gap-2">
                  {selo(l)}
                  {acoes(l)}
                </div>
              </Linha>
            ))}
          </Grupo>
        </>
      )}

      {alvo && (
        <CartaoAberto rotulo={`Passar a licença ${dados.comprou.findIndex((x) => x.id === alvo.id) + 1} para um colega`} onSubmit={passar}>
          <Campo id="email-colega" rotulo="E-mail do colega" tipo="email" valor={email} aoMudar={setEmail} autoFocus />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Botao type="button" onClick={() => { setAlvo(null); setErro(''); }}>Cancelar</Botao>
            <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'Passando…' : 'Passar'}</Botao>
          </div>
        </CartaoAberto>
      )}

      {convite && <ConvitePronto convite={convite} />}

      <Mensagem erro>{erro}</Mensagem>
    </>
  );
}

function TrocarSenha({ temSenha }) {
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    setAviso('');
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (senha !== repetir) return setErro('As duas senhas não são iguais.');
    setOcupado(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (!error) await supabase.auth.signOut({ scope: 'others' });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    setSenha('');
    setRepetir('');
    setAviso('Senha salva. As sessões abertas em outros computadores foram encerradas.');
  }

  return (
    <form onSubmit={salvar} className="flex max-w-[520px] flex-col gap-2">
      {!temSenha && <p className="mb-1 text-texto-apagado">Você entra pelo Google. Se quiser, crie também uma senha para entrar pelo e-mail.</p>}
      <Campo id="nova-senha" rotulo="Nova senha" tipo="password" valor={senha} aoMudar={setSenha} autoComplete="new-password" />
      <Campo id="repetir-senha" rotulo="Repetir a senha" tipo="password" valor={repetir} aoMudar={setRepetir} autoComplete="new-password" />
      <div className="mt-1 flex flex-col sm:block">
        <Botao principal type="submit" disabled={ocupado}>
          {ocupado ? 'Salvando…' : 'Salvar senha'}
        </Botao>
      </div>
      <Mensagem erro>{erro}</Mensagem>
      <Mensagem>{aviso}</Mensagem>
    </form>
  );
}

// As novidades por e-mail, na chave (mockup site-amigavel, 16/10/2026). Os avisos da conta (códigos, senha, segurança) chegam sempre.
function Novidades({ ligado }) {
  const [valor, setValor] = useState(!!ligado);
  const [erro, setErro] = useState('');
  async function trocar(novo) {
    setErro('');
    if (!AMOSTRA) {
      const { error } = await supabase.auth.updateUser({ data: { novidades: novo } });
      if (error) return setErro(mensagemDeErro(error));
    }
    setValor(novo);
  }
  const rotulo = 'Receber por e-mail as novidades do Arquionie (versões novas e recursos)';
  return (
    <div className="flex max-w-[640px] flex-col gap-2">
      <Grupo>
        <Linha className="flex-nowrap">
          <span className="min-w-0 flex-1" aria-hidden="true">{rotulo}</span>
          <Chave rotulo={rotulo} ligada={valor} aoMudar={trocar} />
        </Linha>
      </Grupo>
      <Mensagem erro>{erro}</Mensagem>
    </div>
  );
}

// Conta › Aparência: Claro (de fábrica), Escuro e Automático, que segue o aparelho. As prévias são só para o olho (o clique nelas vale
// igual); para o leitor de tela, a escolha é a lista Tema. A escolha fica no navegador e na conta (lib/aparencia.js).
function Aparencia() {
  const tema = useTema();
  const [erro, setErro] = useState('');
  async function escolher(novo) {
    setErro('');
    guardarTema(novo);
    if (AMOSTRA) return;
    const { error } = await supabase.auth.updateUser({ data: { aparencia: novo } });
    if (error) setErro('A aparência ficou neste navegador, mas não deu para guardar na conta agora. Tente de novo daqui a pouco.');
  }
  const previa = (id) =>
    id === 'auto' ? (
      <span className="flex h-full w-full overflow-hidden rounded-dentro">
        <span data-tema="claro" className="modo-amigavel flex w-1/2 flex-col gap-[7px] bg-fundo py-3.5 pl-2.5">{barras('rounded-l-toque')}</span>
        <span data-tema="escuro" className="modo-amigavel flex w-1/2 flex-col gap-[7px] bg-fundo py-3.5 pr-2.5">{barras('rounded-r-toque')}</span>
      </span>
    ) : (
      <span data-tema={id} className="modo-amigavel flex h-full w-full flex-col gap-[7px] rounded-dentro bg-fundo px-2.5 py-3.5">{barras('rounded-toque')}</span>
    );
  const barras = (raio) => [0, 1, 2].map((i) => <i key={i} className={`block h-4 bg-superficie ${raio}`} />);
  return (
    <div className="flex max-w-[520px] flex-col gap-5">
      <div aria-hidden="true" className="grid grid-cols-3 gap-3 sm:flex sm:gap-4">
        {TEMAS.map(([id, nome]) => (
          <button key={id} type="button" tabIndex={-1} onClick={() => escolher(id)}
            className={`flex flex-col items-center gap-2 ${tema === id ? 'font-semibold text-texto' : 'font-medium text-texto-apagado'}`}>
            <span className={`block aspect-[2/3] w-[70px] rounded-dentro sm:w-[88px] ${tema === id ? 'ring-[3px] ring-destaque' : 'ring-1 ring-linha'}`}>{previa(id)}</span>
            {nome}
          </button>
        ))}
      </div>
      <section>
        <h2 className="rotulo mb-1.5 ml-3.5" id="rotulo-tema">Tema</h2>
        <div role="radiogroup" aria-labelledby="rotulo-tema" className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">
          {TEMAS.map(([id, nome]) => (
            <button key={id} type="button" role="radio" aria-checked={tema === id} onClick={() => escolher(id)}
              aria-label={id === 'auto' ? `${nome}, segue o aparelho` : nome}
              className="flex min-h-amg-toque-minimo w-full items-center gap-3 border-t border-linha px-4 py-2 text-left first:border-t-0 hover:bg-superficie-2">
              <span className="font-medium">{nome}</span>
              {id === 'auto' && <small className="text-amg-legenda text-texto-apagado">segue o aparelho</small>}
              {tema === id && <Icone nome="ok" tamanho={18} className="ml-auto text-destaque" />}
            </button>
          ))}
        </div>
      </section>
      <Mensagem erro>{erro}</Mensagem>
    </div>
  );
}

// A primeira vez: quem cadastrou a pessoa na equipe, com ENTRAR NA EQUIPE e RECUSAR (mockup aprovado em 11/10/2026).
function ConviteDaEquipe({ convite, aoResponder }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  async function responder(entrar) {
    setErro('');
    setOcupado(true);
    if (!AMOSTRA) {
      const { data, error } = await supabase.rpc('equipe_responder', { p_responsavel: convite.responsavel, p_entrar: entrar });
      if (error || !data.ok) { setOcupado(false); return setErro(error ? mensagemDeErro(error) : data.motivo); }
    }
    setOcupado(false);
    aoResponder(convite, entrar);
  }
  return (
    <div className="mb-6 flex max-w-[760px] flex-col gap-2.5 rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5">
      <b className="text-amg-secao">{convite.escritorio} colocou você na equipe do escritório</b>
      <span className="text-texto-apagado">
        Com a equipe, você vê as apresentações do escritório e os ajustes dos clientes, aqui e no programa. Quem cadastrou:{' '}
        <span className="break-all">{convite.emailDoResponsavel}</span>.
      </span>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Botao type="button" disabled={ocupado} onClick={() => responder(false)}>Recusar</Botao>
        <Botao principal type="button" disabled={ocupado} onClick={() => responder(true)}>Entrar na equipe</Botao>
      </div>
      <Mensagem erro>{erro}</Mensagem>
    </div>
  );
}

// A EQUIPE na área do escritório (quem é da equipe): quem mais está nela e o SAIR DA EQUIPE. Só o responsável cadastra e tira.
function EquipeDoEscritorio({ equipe, aoSair }) {
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState('');
  async function sair() {
    setErro('');
    if (!AMOSTRA) {
      const { data, error } = await supabase.rpc('equipe_sair', { p_responsavel: equipe.responsavel });
      if (error || !data.ok) return setErro(error ? mensagemDeErro(error) : data.motivo);
    }
    aoSair(equipe);
  }
  return (
    <div className="flex max-w-[640px] flex-col gap-3">
      <p className="text-texto-apagado">Quem está na equipe. Só o responsável cadastra e tira pessoas.</p>
      <Grupo>
        <Linha>
          <TextoDaLinha titulo={equipe.nomeDoResponsavel || equipe.escritorio} sub={equipe.emailDoResponsavel} />
          <Etiqueta tipo="urgente">Responsável</Etiqueta>
        </Linha>
        {equipe.pessoas.map((p) => (
          <Linha key={p.email}>
            <TextoDaLinha titulo={p.voce ? 'Você' : p.nome || p.email} sub={p.email} />
            <Etiqueta>Na equipe</Etiqueta>
          </Linha>
        ))}
      </Grupo>
      {saindo ? (
        <Confirmacao voltar={() => setSaindo(false)} acao={sair} rotulo="Sair">
          Sair da equipe de <b>{equipe.escritorio}</b>? Você deixa de ver as apresentações e os ajustes dele.
        </Confirmacao>
      ) : (
        <Botao pequeno type="button" className="self-start" onClick={() => setSaindo(true)}>Sair da equipe</Botao>
      )}
      <Mensagem erro>{erro}</Mensagem>
    </div>
  );
}

// MINHA CONTA em páginas, cada uma com o seu endereço (mockup docs/mockups/minha-conta-em-paginas do repositório do programa,
// aprovado por ÊDI em 12/10/2026, e a APARÊNCIA do mockup site-amigavel, 16/10/2026): APRESENTAÇÕES (a primeira), EQUIPE E LICENÇAS,
// MEUS DADOS e APARÊNCIA. Na área de um escritório em que a pessoa está na equipe, só APRESENTAÇÕES e EQUIPE, em
// /conta/escritorio/NOME/... Os links de antes (/conta#licencas, #tours do programa, #plano do CONECTAR) abrem a página nova certa.
const PAGINAS = [
  ['apresentacoes', 'Apresentações'],
  ['equipe', 'Equipe e licenças'],
  ['dados', 'Meus dados'],
  ['aparencia', 'Aparência'],
];
const PAGINAS_DO_ESCRITORIO = [
  ['apresentacoes', 'Apresentações'],
  ['equipe', 'Equipe'],
];
const PAGINA_DA_PARTE = {
  apresentacoes: 'apresentacoes', tours: 'apresentacoes',
  equipe: 'equipe', licencas: 'equipe', computadores: 'equipe', plano: 'equipe',
  dados: 'dados', senha: 'dados', emails: 'dados', privacidade: 'dados',
  aparencia: 'aparencia',
};
const ATALHOS = {
  equipe: [['equipe', 'Equipe'], ['licencas', 'Licenças'], ['computadores', 'Computadores']],
  dados: [['dados', 'Conta'], ['senha', 'Senha'], ['emails', 'E-mails'], ['privacidade', 'Privacidade']],
};

// o nome do escritório no endereço: "PALHETA ARQUITETURA" vira "palheta-arquitetura"
const nomeNoEndereco = (e) =>
  e.escritorio.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || e.responsavel;

// a cápsula de uma página no menu (e de uma área no alto)
const capsula = (aqui) =>
  `inline-flex min-h-amg-toque-minimo shrink-0 items-center whitespace-nowrap rounded-toque px-3.5 no-underline md:min-h-0 md:py-[9px] ${
    aqui ? 'bg-superficie-2 font-semibold text-texto' : 'font-medium text-texto-apagado hover:text-texto'}`;

export default function Conta() {
  const { usuario } = useSessao();
  const navegar = useNavigate();
  const local = useLocation();
  const d = dadosDaConta(usuario);
  const atuacao = ATUACOES.find((a) => a.valor === d.atuacao)?.rotulo ?? d.atuacao;
  const [, , primeira, segunda, terceira] = local.pathname.replace(/\/+$/, '').split('/');
  const noEscritorio = primeira === 'escritorio';
  const pagina = noEscritorio ? terceira ?? 'apresentacoes' : primeira;
  const caminho = (p, e = null) => `/conta/${e ? `escritorio/${nomeNoEndereco(e)}/` : ''}${p}${local.search}`;

  // as equipes em que a pessoa está (as áreas) e os convites para confirmar; null enquanto carrega
  const [equipes, setEquipes] = useState(null);
  const lerEquipes = async () => {
    if (AMOSTRA) {
      const qual = estadoDaAmostra();
      const lista = qual === 'convite' ? AMOSTRA_CONVITE : qual === 'equipe' ? AMOSTRA_MINHAS_EQUIPES : [];
      setEquipes(lista);
      if (qual === 'equipe' && !noEscritorio && !primeira) navegar(caminho('apresentacoes', lista[0]), { replace: true });
      return;
    }
    const { data, error } = await supabase.rpc('minhas_equipes');
    setEquipes(error ? [] : data ?? []);
  };
  useEffect(() => {
    lerEquipes();
  }, []);
  const ativas = (equipes ?? []).filter((e) => e.situacao === 'ativo');
  const convites = (equipes ?? []).filter((e) => e.situacao === 'convidado');
  const doEscritorio = noEscritorio ? ativas.find((e) => nomeNoEndereco(e) === segunda || e.responsavel === segunda) ?? null : null;
  const lista = doEscritorio ? PAGINAS_DO_ESCRITORIO : PAGINAS;
  const titulo = lista.find(([p]) => p === pagina)?.[1];

  function aoResponder(convite, entrar) {
    setEquipes((l) => (entrar ? l.map((e) => (e.responsavel === convite.responsavel ? { ...e, situacao: 'ativo', pessoas: e.pessoas.length ? e.pessoas : [{ email: d.email, nome: d.nome, voce: true }] } : e))
      : l.filter((e) => e.responsavel !== convite.responsavel)));
    if (entrar) navegar(caminho('apresentacoes', convite));
    if (!AMOSTRA) lerEquipes();
  }
  function aoSair(equipe) {
    setEquipes((l) => l.filter((e) => e.responsavel !== equipe.responsavel));
    navegar(caminho('apresentacoes'));
  }

  // o título da aba do navegador acompanha a página (o leitor de tela anuncia), e a parte do endereço (#licencas) rola até ela
  useEffect(() => {
    if (!titulo) return undefined;
    const antes = document.title;
    document.title = `${doEscritorio ? `${titulo} · ${doEscritorio.escritorio}` : titulo} · Arquionie™`;
    return () => { document.title = antes; };
  }, [titulo, doEscritorio]);
  useEffect(() => {
    if (!titulo) return;
    const parte = local.hash.slice(1);
    if (parte) setTimeout(() => document.getElementById(parte)?.scrollIntoView(), 0);
    else window.scrollTo(0, 0);
  }, [titulo, local.hash]);

  async function sair() {
    await supabase.auth.signOut();
    navegar('/', { replace: true });
  }

  // /conta sozinho, um link de antes (/conta#licencas) ou uma página que não existe: a página certa
  if (!noEscritorio && !titulo) {
    const parte = local.hash.slice(1);
    return <Navigate to={`/conta/${PAGINA_DA_PARTE[parte] ?? 'apresentacoes'}${local.search}${parte && PAGINA_DA_PARTE[parte] ? local.hash : ''}`} replace />;
  }
  if (noEscritorio && equipes === null) return <p className="px-4 py-16 text-center text-texto-apagado">Carregando…</p>;
  if (noEscritorio && (!doEscritorio || !titulo)) return <Navigate to={caminho('apresentacoes')} replace />;

  const pedidoExclusao = `mailto:${EMAIL_CONTATO}?subject=${encodeURIComponent('Excluir a minha conta do Arquionie')}&body=${encodeURIComponent(
    `Peço a exclusão da conta ${d.email} e dos meus dados.`,
  )}`;

  // as áreas no alto: a MINHA ÁREA e a de cada escritório em que a pessoa está na equipe (mockup aprovado em 11/10/2026)
  const abasDasAreas = ativas.length > 0 && (
    <nav aria-label="Áreas da conta" className="sem-barra mx-auto flex max-w-[1100px] gap-1.5 overflow-x-auto px-4 pt-5 sm:px-6">
      {[null, ...ativas].map((e) => {
        const aqui = e ? doEscritorio?.responsavel === e.responsavel : !doEscritorio;
        return (
          <Link key={e?.responsavel ?? 'minha'} to={caminho('apresentacoes', e)} aria-current={aqui ? 'page' : undefined} className={capsula(aqui)}>
            {e ? e.escritorio : 'Minha área'}
            {e && <span className="sr-only">, área do escritório</span>}
          </Link>
        );
      })}
    </nav>
  );

  // o menu das páginas: à esquerda no computador; no celular, uma faixa de cápsulas no alto, que rola de lado
  const menu = (
    <nav aria-label={doEscritorio ? `Páginas de ${doEscritorio.escritorio}` : 'Minha conta'}
      className="sem-barra -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-col md:items-stretch md:gap-0.5 md:overflow-visible md:px-0">
      {lista.map(([p, nome]) => (
        <Link key={p} to={caminho(p, doEscritorio)} aria-current={p === pagina ? 'page' : undefined} className={capsula(p === pagina)}>
          {nome}
        </Link>
      ))}
      <Botao type="button" onClick={sair} className="md:mt-3.5 md:self-start">
        Sair
      </Botao>
    </nav>
  );

  const atalhos = !doEscritorio && ATALHOS[pagina] && (
    <nav aria-label="Nesta página" className="mb-6 flex flex-wrap items-center gap-2 text-amg-legenda text-texto-apagado">
      <span>Nesta página:</span>
      {ATALHOS[pagina].map(([id, nome]) => (
        <Botao key={id} pequeno href={`#${id}`}>{nome}</Botao>
      ))}
    </nav>
  );

  let conteudo;
  if (doEscritorio && pagina === 'apresentacoes') conteudo = <Apresentacoes area={doEscritorio.responsavel} />;
  else if (doEscritorio) conteudo = <EquipeDoEscritorio equipe={doEscritorio} aoSair={aoSair} />;
  else if (pagina === 'apresentacoes') {
    conteudo = (
      <>
        <Apresentacoes />
        {/* os tours publicados antes do ENVIAR PARA O CLIENTE, até vencerem; sem nenhum, a seção some */}
        <MeusTours soComTours />
      </>
    );
  } else if (pagina === 'equipe') {
    conteudo = (
      <>
        <Bloco id="equipe" titulo="Equipe">
          <Equipe />
        </Bloco>
        <Bloco id="licencas" titulo="Licenças">
          <Licencas nome={d.nome || d.email} />
        </Bloco>
        <Bloco id="computadores" titulo="Computadores conectados">
          <Computadores />
          <PlanoDaConta />
        </Bloco>
      </>
    );
  } else if (pagina === 'aparencia') {
    conteudo = <Aparencia />;
  } else {
    conteudo = (
      <>
        <Bloco id="dados" titulo="Conta">
          <div className="max-w-[640px]">
            <Grupo>
              <LinhaDeValor rotulo="Nome">{d.nome || 'Sem nome'}</LinhaDeValor>
              <LinhaDeValor rotulo="E-mail">{d.email}</LinhaDeValor>
              <LinhaDeValor rotulo="Atuação">{atuacao}</LinhaDeValor>
              <LinhaDeValor rotulo="Desde">{dataLegivel(d.desde)}</LinhaDeValor>
              <LinhaDeValor rotulo="Entra por">
                {[d.pelaGoogle && 'Google', d.pelaSenha && 'e-mail e senha'].filter(Boolean).join(' e ') || 'e-mail'}
              </LinhaDeValor>
            </Grupo>
          </div>
        </Bloco>
        <Bloco id="senha" titulo="Senha">
          <TrocarSenha temSenha={d.pelaSenha} />
        </Bloco>
        <Bloco id="emails" titulo="E-mails">
          <Novidades ligado={d.novidades} />
        </Bloco>
        <Bloco id="privacidade" titulo="Privacidade">
          <p className="max-w-[72ch] text-texto-apagado">
            Os seus projetos ficam no seu computador; a conta guarda o cadastro, os computadores conectados e as apresentações que você publica.
            Veja a{' '}
            <a href="/privacidade" className="link-frase">
              política de privacidade
            </a>
            .
          </p>
          <Botao pequeno href={pedidoExclusao} className="self-start">Pedir a exclusão da conta e dos dados</Botao>
        </Bloco>
      </>
    );
  }

  return (
    <>
      {abasDasAreas}
      <div className="mx-auto grid max-w-[1100px] gap-5 px-4 py-6 sm:px-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8 md:py-10">
        {menu}
        <div className="min-w-0">
          {!doEscritorio && convites.map((c) => <ConviteDaEquipe key={c.responsavel} convite={c} aoResponder={aoResponder} />)}
          <h1 className="mb-4 text-amg-titulo-grande">{doEscritorio ? `${titulo} · ${doEscritorio.escritorio}` : titulo}</h1>
          {atalhos}
          {conteudo}
        </div>
      </div>
    </>
  );
}
