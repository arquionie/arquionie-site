import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Botao, Campo, Marcar, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { useSessao } from '@/lib/Sessao';
import { dadosDaConta } from '@/lib/conta';
import { dataLegivel } from '@/lib/manifesto';
import { ATUACOES, EMAIL_CONTATO } from '@/config';
import MeusTours from '@/components/MeusTours';
import Apresentacoes from '@/components/Apresentacoes';
import Equipe, { PlanoDaConta } from '@/components/Equipe';
import { AMOSTRA_CONVITE, AMOSTRA_MINHAS_EQUIPES } from '@/lib/equipe';
import {
  AMOSTRA, AMOSTRA_COMPUTADORES, AMOSTRA_MINHAS_LICENCAS, PLANOS, copiarTexto, dataCurta, estadoDaAmostra, nomeProduto, rotuloSituacao, textoConvite,
} from '@/lib/licencas';

const LIMITE_COMPUTADORES = 3; // decisão de 02/10/2026

function Bloco({ id, titulo, children }) {
  return (
    <section id={id} className="mb-10 scroll-mt-6">
      <h2 className="mb-3 text-[17px] font-semibold text-white">{titulo}</h2>
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

  if (lista === null) return <p className="text-aqi-muted">Carregando…</p>;
  const grupos = ['arquionie-revit', 'arquionie']
    .map((p) => ({ produto: p, itens: lista.filter((c) => (c.produto ?? 'arquionie') === p) }))
    .filter((g) => g.itens.length > 0);
  return (
    <>
      <p className="mb-3 text-[14px] text-aqi-muted">
        Até {LIMITE_COMPUTADORES} computadores por produto ao mesmo tempo. DESCONECTAR tira o acesso daquele computador na próxima vez que ele
        conferir a conta.
      </p>
      {grupos.length === 0 ? (
        <p className="bg-aqi-barra px-4 py-3 text-[14px] text-aqi-muted">
          Nenhum computador conectado ainda. Ele aparece aqui quando você entrar com esta conta no programa ou no Revit.
        </p>
      ) : (
        grupos.map((g) => (
          <div key={g.produto} className="mb-5">
            <p className="mb-1 text-[11px] font-semibold tracking-[0.1em] text-aqi-coral">
              {nomeProduto(g.produto).toUpperCase()} · {g.itens.length} DE {LIMITE_COMPUTADORES}
            </p>
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-aqi-borda text-left text-[11px] tracking-[0.1em] text-aqi-muted">
                  <th className="px-3 py-2 font-semibold">COMPUTADOR</th>
                  <th className="px-3 py-2 font-semibold">ÚLTIMO ACESSO</th>
                  <th className="px-3 py-2 font-semibold">VERSÃO</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.itens.map((c) => (
                  <tr key={c.id} className="border-b border-[#262D37]">
                    <td className="px-3 py-2.5">{c.nome}</td>
                    <td className="px-3 py-2.5">{new Date(c.ultimo_acesso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-3 py-2.5">{c.versao ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Botao pequeno nivel={3} type="button" onClick={() => desconectar(c.id)}>DESCONECTAR</Botao>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  const [copiado, setCopiado] = useState('');
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

  if (dados === null) return <p className="text-aqi-muted">Carregando…</p>;
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
    setCopiado('');
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
    setCopiado('');
  }

  async function copiar() {
    setCopiado((await copiarTexto(convite)) ? 'COPIADO' : 'Selecione o texto acima e copie com Ctrl+C.');
  }

  const selo = (l) => {
    if (l.situacao === 'sem titular') return <span className="bg-aqi-campo px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">SEM TITULAR</span>;
    if (l.situacao === 'esperando a conta') return <span className="border border-aqi-borda px-1.5 py-0.5 text-[11px] font-bold tracking-wide">ESPERANDO A CONTA</span>;
    if (l.situacao === 'ativa' || l.situacao === 'vencendo') return <span className="border border-aqi-borda px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">EM USO</span>;
    return <span className="border border-aqi-borda px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-aqi-muted">{rotuloSituacao(l.situacao, l.expiraEm)}</span>;
  };

  const acoes = (l) => {
    const valendo = !['vencida', 'revogada'].includes(l.situacao);
    if (!valendo) return null;
    // os botões pela hierarquia (DECISOES 11/10/2026): a terracota só na licença sem ninguém, que pede atenção; o mais forte à direita
    if (l.situacao === 'sem titular') {
      return (
        <div className="flex flex-wrap justify-end gap-2">
          {!usaOProduto(l.produto) && <Botao pequeno nivel={2} type="button" onClick={() => ficar(l)}>FICAR COM ESTA</Botao>}
          <Botao pequeno nivel={1} type="button" onClick={() => abrirPassar(l)}>PASSAR PARA UM COLEGA</Botao>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {l.proximaTroca ? (
          <span className="text-[12px] text-aqi-muted">próxima troca em {dataCurta(l.proximaTroca)}</span>
        ) : (
          <Botao pequeno nivel={2} type="button" onClick={() => abrirPassar(l)}>TROCAR</Botao>
        )}
        {l.situacao === 'esperando a conta' && <Botao pequeno nivel={2} type="button" onClick={() => mostrarConvite(l)}>COPIAR CONVITE</Botao>}
      </div>
    );
  };

  return (
    <>
      {dados.usa.length === 0 ? (
        <p className="mb-4 text-[14px] text-aqi-muted">Nenhuma licença paga em uso nesta conta.</p>
      ) : (
        <table className="mb-6 w-full border-collapse text-[14px]">
          <tbody>
            {dados.usa.map((u) => (
              <tr key={u.id} className="border-b border-[#262D37] align-top">
                <td className="w-[44%] px-3 py-2.5">
                  <b className="text-white">{nomeProduto(u.produto).toUpperCase()}</b>
                  <br />
                  <span className="mt-1 inline-block bg-aqi-coral px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">{PLANOS[u.plano] ?? u.plano}</span>
                </td>
                <td className="px-3 py-2.5">
                  {['ativa', 'vencendo'].includes(u.situacao) ? `Em uso por você, até ${dataCurta(u.expiraEm)}.` : rotuloSituacao(u.situacao, u.expiraEm)}
                  {u.bonus && <div className="text-[12px] text-aqi-muted">Os 30 dias de bônus da troca já estão somados.</div>}
                  {u.compradaPor && <div className="text-[12px] text-aqi-muted">Comprada por {u.compradaPor}.</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dados.comprou.length > 0 && (
        <>
          <h3 className="mb-1 mt-2 text-[15px] font-semibold text-white">Licenças que você comprou</h3>
          <p className="mb-3 text-[14px] text-aqi-muted">
            Passe cada uma para quem vai usar: a pessoa entra com o próprio e-mail. Depois que ela começa a usar, a licença troca de pessoa no
            máximo uma vez a cada 30 dias.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-aqi-borda text-left text-[11px] tracking-[0.1em] text-aqi-muted">
                  <th className="w-[8%] px-3 py-2 font-semibold">Nº</th>
                  <th className="px-3 py-2 font-semibold">QUEM USA</th>
                  <th className="w-[18%] px-3 py-2 font-semibold">VALIDADE</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dados.comprou.map((l, i) => (
                  <tr key={l.id} className="border-b border-[#262D37] align-top">
                    <td className="px-3 py-2.5">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="mb-1 break-all text-white">{l.titularEhVoce ? 'Você' : l.titular || '—'}</div>
                      {selo(l)}
                    </td>
                    <td className="px-3 py-2.5">{dataCurta(l.expiraEm)}</td>
                    <td className="px-3 py-2.5 text-right">{acoes(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {alvo && (
        <form onSubmit={passar} className="mt-4 max-w-[560px] bg-aqi-barra p-4">
          <p className="mb-3 text-[13px] font-semibold tracking-[0.08em] text-aqi-coral">
            PASSAR A LICENÇA {dados.comprou.findIndex((x) => x.id === alvo.id) + 1} PARA UM COLEGA
          </p>
          <Campo id="email-colega" rotulo="E-MAIL DO COLEGA" tipo="email" valor={email} aoMudar={setEmail} autoFocus />
          <div className="mt-3 flex justify-end gap-2.5">
            <Botao nivel={3} type="button" onClick={() => { setAlvo(null); setErro(''); }}>CANCELAR</Botao>
            <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'PASSANDO…' : 'PASSAR'}</Botao>
          </div>
        </form>
      )}

      {convite && (
        <div className="mt-4 max-w-[560px] bg-aqi-barra p-4">
          <p className="mb-2 text-[13px] font-semibold tracking-[0.08em] text-aqi-coral">CONVITE PRONTO PARA MANDAR</p>
          <p className="whitespace-pre-line text-[14px]">{convite}</p>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
            <span role="status" className="text-[12px] text-aqi-muted">{copiado}</span>
            <Botao principal type="button" onClick={copiar}>COPIAR CONVITE</Botao>
          </div>
        </div>
      )}

      <div className="mt-2">
        <Mensagem erro>{erro}</Mensagem>
      </div>
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
    <form onSubmit={salvar} className="max-w-[520px]">
      {!temSenha && (
        <p className="mb-3 text-[14px] text-aqi-muted">Você entra pelo Google. Se quiser, crie também uma senha para entrar pelo e-mail.</p>
      )}
      <Campo id="nova-senha" rotulo="NOVA SENHA" tipo="password" valor={senha} aoMudar={setSenha} autoComplete="new-password" />
      <Campo id="repetir-senha" rotulo="REPETIR A SENHA" tipo="password" valor={repetir} aoMudar={setRepetir} autoComplete="new-password" />
      <div className="mt-3">
        <Botao principal type="submit" disabled={ocupado}>
          {ocupado ? 'SALVANDO…' : 'SALVAR SENHA'}
        </Botao>
      </div>
      <div className="mt-2">
        <Mensagem erro>{erro}</Mensagem>
        <Mensagem>{aviso}</Mensagem>
      </div>
    </form>
  );
}

// As novidades por e-mail, na caixa de marcar do formulário (mockup minha-conta-em-paginas, 12/10/2026). Os avisos da conta (códigos,
// senha, segurança) chegam sempre.
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
  return (
    <div className="max-w-[640px]">
      <Marcar id="novidades" marcado={valor} aoMudar={trocar}>Receber por e-mail as novidades do Arquionie (versões novas e recursos).</Marcar>
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
    <div className="mb-6 grid max-w-[760px] gap-2.5 border-l-[3px] border-aqi-coral bg-aqi-valor/40 px-4 py-3.5">
      <b className="text-[15px] text-white">{convite.escritorio} colocou você na equipe do escritório</b>
      <span className="text-[13.5px]">
        Com a equipe, você vê as apresentações do escritório e os ajustes dos clientes, aqui e no programa. Quem cadastrou:{' '}
        <span className="break-all">{convite.emailDoResponsavel}</span>.
      </span>
      <div className="flex flex-wrap gap-2.5">
        <Botao principal type="button" disabled={ocupado} onClick={() => responder(true)}>ENTRAR NA EQUIPE</Botao>
        <Botao type="button" disabled={ocupado} onClick={() => responder(false)}>RECUSAR</Botao>
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
    <>
      <p className="mb-3 text-[14px] text-aqi-muted">Quem está na equipe. Só o responsável cadastra e tira pessoas.</p>
      <table className="w-full max-w-[640px] border-collapse text-[14px]">
        <tbody>
          <tr className="border-b border-[#262D37]">
            <td className="px-3 py-2.5"><b className="text-white">{equipe.nomeDoResponsavel || equipe.escritorio}</b>
              <small className="block break-all text-[12px] text-aqi-muted">{equipe.emailDoResponsavel}</small></td>
            <td className="px-3 py-2.5 text-right"><span className="bg-aqi-campo px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-white">RESPONSÁVEL</span></td>
          </tr>
          {equipe.pessoas.map((p) => (
            <tr key={p.email} className="border-b border-[#262D37]">
              <td className="px-3 py-2.5"><b className="text-white">{p.voce ? 'Você' : p.nome || p.email}</b>
                <small className="block break-all text-[12px] text-aqi-muted">{p.email}</small></td>
              <td className="px-3 py-2.5 text-right"><span className="border border-aqi-borda px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-white">EQUIPE</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {saindo ? (
        <div className="mt-3 flex max-w-[640px] flex-wrap items-center gap-3 bg-aqi-barra px-3.5 py-2.5 text-[13.5px]">
          <span className="min-w-[240px] flex-1">Sair da equipe de <b className="text-white">{equipe.escritorio}</b>? Você deixa de ver as apresentações e os ajustes dele.</span>
          <Botao nivel={3} type="button" onClick={() => setSaindo(false)}>VOLTAR</Botao>
          <Botao principal type="button" onClick={sair}>SAIR</Botao>
        </div>
      ) : (
        <Botao pequeno nivel={3} type="button" className="mt-3" onClick={() => setSaindo(true)}>SAIR DA EQUIPE</Botao>
      )}
      <Mensagem erro>{erro}</Mensagem>
    </>
  );
}

// MINHA CONTA em três páginas, cada uma com o seu endereço (mockup docs/mockups/minha-conta-em-paginas do repositório do programa,
// aprovado por ÊDI em 12/10/2026): APRESENTAÇÕES (a primeira), EQUIPE E LICENÇAS e MEUS DADOS. Na área de um escritório em que a pessoa
// está na equipe, só APRESENTAÇÕES e EQUIPE, em /conta/escritorio/NOME/... Os links de antes (/conta#licencas, #tours do programa,
// #plano do CONECTAR) abrem a página nova certa.
const PAGINAS = [
  ['apresentacoes', 'APRESENTAÇÕES', 'Apresentações'],
  ['equipe', 'EQUIPE E LICENÇAS', 'Equipe e licenças'],
  ['dados', 'MEUS DADOS', 'Meus dados'],
];
const PAGINAS_DO_ESCRITORIO = [
  ['apresentacoes', 'APRESENTAÇÕES', 'Apresentações'],
  ['equipe', 'EQUIPE', 'Equipe'],
];
const PAGINA_DA_PARTE = {
  apresentacoes: 'apresentacoes', tours: 'apresentacoes',
  equipe: 'equipe', licencas: 'equipe', computadores: 'equipe', plano: 'equipe',
  dados: 'dados', senha: 'dados', emails: 'dados', privacidade: 'dados',
};
const ATALHOS = {
  equipe: [['equipe', 'EQUIPE'], ['licencas', 'LICENÇAS'], ['computadores', 'COMPUTADORES']],
  dados: [['dados', 'CONTA'], ['senha', 'SENHA'], ['emails', 'E-MAILS'], ['privacidade', 'PRIVACIDADE']],
};

// o nome do escritório no endereço: "PALHETA ARQUITETURA" vira "palheta-arquitetura"
const nomeNoEndereco = (e) =>
  e.escritorio.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || e.responsavel;

export default function Conta() {
  const { usuario } = useSessao();
  const navegar = useNavigate();
  const local = useLocation();
  const d = dadosDaConta(usuario);
  const atuacao = ATUACOES.find((a) => a.valor === d.atuacao)?.rotulo.toLowerCase() ?? d.atuacao;
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
  const titulo = lista.find(([p]) => p === pagina)?.[2];

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
  if (noEscritorio && equipes === null) return <p className="px-4 py-16 text-center text-aqi-muted">Carregando…</p>;
  if (noEscritorio && (!doEscritorio || !titulo)) return <Navigate to={caminho('apresentacoes')} replace />;

  const pedidoExclusao = `mailto:${EMAIL_CONTATO}?subject=${encodeURIComponent('Excluir a minha conta do Arquionie')}&body=${encodeURIComponent(
    `Peço a exclusão da conta ${d.email} e dos meus dados.`,
  )}`;

  // as áreas no alto: a MINHA ÁREA e a de cada escritório em que a pessoa está na equipe (mockup aprovado em 11/10/2026)
  const abasDasAreas = ativas.length > 0 && (
    <nav aria-label="Áreas da conta" className="mx-auto flex max-w-[1100px] flex-wrap gap-x-2 border-b border-[#262D37] px-4 text-[12px] font-semibold tracking-[0.06em] sm:px-7">
      {[null, ...ativas].map((e) => {
        const aqui = e ? doEscritorio?.responsavel === e.responsavel : !doEscritorio;
        return (
          <Link key={e?.responsavel ?? 'minha'} to={caminho('apresentacoes', e)} aria-current={aqui ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2.5 no-underline ${aqui ? 'border-aqi-coral text-aqi-coral' : 'border-transparent text-aqi-muted hover:text-aqi-texto'}`}>
            {e ? e.escritorio.toUpperCase() : 'MINHA ÁREA'}
            {e && <small className="ml-1.5 font-normal tracking-normal text-aqi-muted">área do escritório</small>}
          </Link>
        );
      })}
    </nav>
  );

  // o menu das páginas: à esquerda no computador; no celular, uma faixa de abas no alto
  const menu = (
    <nav aria-label={doEscritorio ? `Páginas de ${doEscritorio.escritorio}` : 'Minha conta'}
      className="-mx-4 flex gap-x-1 overflow-x-auto border-b border-[#262D37] px-4 text-[12px] font-semibold tracking-[0.08em] md:mx-0 md:block md:overflow-visible md:border-0 md:px-0">
      {lista.map(([p, rotulo]) => (
        <Link key={p} to={caminho(p, doEscritorio)} aria-current={p === pagina ? 'page' : undefined}
          className={`shrink-0 whitespace-nowrap border-b-2 px-2 py-2.5 no-underline md:block md:border-b md:border-[#262D37] md:px-0 ${
            p === pagina ? 'border-aqi-coral text-aqi-coral' : 'border-transparent text-aqi-muted hover:text-aqi-texto'}`}>
          {rotulo}
        </Link>
      ))}
      <button type="button" onClick={sair} className="shrink-0 px-2 py-2.5 text-left text-aqi-muted hover:text-aqi-texto md:mt-4 md:block md:px-0">
        SAIR
      </button>
    </nav>
  );

  const atalhos = !doEscritorio && ATALHOS[pagina] && (
    <nav aria-label="Nesta página" className="mb-7 flex flex-wrap gap-x-4 gap-y-1 border-b border-[#262D37] pb-3 text-[11.5px] font-semibold tracking-[0.08em] text-aqi-muted">
      <span>NESTA PÁGINA:</span>
      {ATALHOS[pagina].map(([id, rotulo]) => (
        <a key={id} href={`#${id}`} className="no-underline text-aqi-texto hover:text-aqi-coral">{rotulo}</a>
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
  } else {
    conteudo = (
      <>
        <Bloco id="dados" titulo="Conta">
          <p className="text-[15px]">
            {d.nome || 'Sem nome'} · {d.email} · {atuacao}
          </p>
          <p className="mt-1 text-[13px] text-aqi-muted">
            Conta criada em {dataLegivel(d.desde)}. Entra por {[d.pelaGoogle && 'Google', d.pelaSenha && 'e-mail e senha'].filter(Boolean).join(' e ') || 'e-mail'}.
            Durante o lançamento, a conta usa o Arquionie™ por completo, sem custo.
          </p>
        </Bloco>
        <Bloco id="senha" titulo="Senha">
          <TrocarSenha temSenha={d.pelaSenha} />
        </Bloco>
        <Bloco id="emails" titulo="E-mails">
          <Novidades ligado={d.novidades} />
        </Bloco>
        <Bloco id="privacidade" titulo="Privacidade">
          <p className="mb-3 text-[14px] text-aqi-muted">
            Os seus projetos ficam no seu computador; a conta guarda o cadastro, os computadores conectados e as apresentações que você publica.
            Veja a{' '}
            <a href="/privacidade" className="link">
              política de privacidade
            </a>
            .
          </p>
          <Botao pequeno nivel={3} href={pedidoExclusao}>PEDIR A EXCLUSÃO DA CONTA E DOS DADOS</Botao>
        </Bloco>
      </>
    );
  }

  return (
    <>
      {abasDasAreas}
      <div className="mx-auto grid max-w-[1100px] gap-6 px-4 py-6 sm:px-7 md:grid-cols-[220px_1fr] md:gap-8 md:py-10">
        {menu}
        <div className="min-w-0">
          {!doEscritorio && convites.map((c) => <ConviteDaEquipe key={c.responsavel} convite={c} aoResponder={aoResponder} />)}
          <h1 className="mb-1 text-[20px] font-semibold text-white">{doEscritorio ? `${titulo} · ${doEscritorio.escritorio}` : titulo}</h1>
          {atalhos || <div className="mb-3" />}
          {conteudo}
        </div>
      </div>
    </>
  );
}
