import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Botao, Campo, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { useSessao } from '@/lib/Sessao';
import { dadosDaConta } from '@/lib/conta';
import { dataLegivel } from '@/lib/manifesto';
import { ATUACOES, EMAIL_CONTATO } from '@/config';
import {
  AMOSTRA, AMOSTRA_COMPUTADORES, AMOSTRA_MINHAS_LICENCAS, PLANOS, copiarTexto, dataCurta, nomeProduto, rotuloSituacao, textoConvite,
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
                      <button type="button" onClick={() => desconectar(c.id)} className="link text-[12px]">
                        DESCONECTAR
                      </button>
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
    if (l.situacao === 'sem titular') {
      return (
        <>
          <button type="button" onClick={() => abrirPassar(l)} className="link text-[12px]">PASSAR PARA UM COLEGA</button>
          {!usaOProduto(l.produto) && (
            <button type="button" onClick={() => ficar(l)} className="link ml-4 text-[12px]">FICAR COM ESTA</button>
          )}
        </>
      );
    }
    return (
      <>
        {l.situacao === 'esperando a conta' && (
          <button type="button" onClick={() => mostrarConvite(l)} className="link text-[12px]">COPIAR CONVITE</button>
        )}
        {l.proximaTroca ? (
          <span className="ml-4 text-[12px] text-aqi-muted">próxima troca em {dataCurta(l.proximaTroca)}</span>
        ) : (
          <button type="button" onClick={() => abrirPassar(l)} className="link ml-4 text-[12px]">TROCAR</button>
        )}
      </>
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
            <Botao type="button" onClick={() => { setAlvo(null); setErro(''); }}>CANCELAR</Botao>
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

function Novidades({ ligado }) {
  const [valor, setValor] = useState(ligado);
  const [erro, setErro] = useState('');
  async function trocar() {
    setErro('');
    const novo = !valor;
    const { error } = await supabase.auth.updateUser({ data: { novidades: novo } });
    if (error) return setErro(mensagemDeErro(error));
    setValor(novo);
  }
  return (
    <>
      <p className="text-[15px]">
        Novidades por e-mail: <b className="text-white">{valor ? 'SIM' : 'NÃO'}</b> ·{' '}
        <button type="button" onClick={trocar} className="link">
          {valor ? 'NÃO QUERO MAIS' : 'QUERO RECEBER'}
        </button>
      </p>
      <p className="mt-1 text-[13px] text-aqi-muted">Os avisos da conta (códigos, senha, segurança) chegam sempre; esta escolha vale só para as novidades.</p>
      <Mensagem erro>{erro}</Mensagem>
    </>
  );
}

export default function Conta() {
  const { usuario } = useSessao();
  const navegar = useNavigate();
  const d = dadosDaConta(usuario);
  const atuacao = ATUACOES.find((a) => a.valor === d.atuacao)?.rotulo.toLowerCase() ?? d.atuacao;

  async function sair() {
    await supabase.auth.signOut();
    navegar('/', { replace: true });
  }

  const pedidoExclusao = `mailto:${EMAIL_CONTATO}?subject=${encodeURIComponent('Excluir a minha conta do Arquionie')}&body=${encodeURIComponent(
    `Peço a exclusão da conta ${d.email} e dos meus dados.`,
  )}`;

  return (
    <div className="mx-auto grid max-w-[1100px] gap-8 px-4 py-10 sm:px-7 md:grid-cols-[220px_1fr]">
      <nav className="text-[12px] font-semibold tracking-[0.08em]" aria-label="Minha conta">
        {[
          ['#dados', 'MINHA CONTA'],
          ['#licencas', 'LICENÇAS'],
          ['#computadores', 'COMPUTADORES'],
          ['#senha', 'SENHA'],
          ['#emails', 'E-MAILS'],
          ['#privacidade', 'PRIVACIDADE'],
        ].map(([href, rotulo], i) => (
          <a key={href} href={href} className={`block border-b border-[#262D37] py-2.5 no-underline ${i === 0 ? 'text-aqi-coral' : 'text-aqi-muted hover:text-aqi-texto'}`}>
            {rotulo}
          </a>
        ))}
        <button type="button" onClick={sair} className="mt-4 block py-2 text-aqi-muted hover:text-aqi-texto">
          SAIR
        </button>
      </nav>

      <div>
        <Bloco id="dados" titulo="Minha conta">
          <p className="text-[15px]">
            {d.nome || 'Sem nome'} · {d.email} · {atuacao}
          </p>
          <p className="mt-1 text-[13px] text-aqi-muted">
            Conta criada em {dataLegivel(d.desde)}. Entra por {[d.pelaGoogle && 'Google', d.pelaSenha && 'e-mail e senha'].filter(Boolean).join(' e ') || 'e-mail'}.
            Durante o lançamento, a conta usa o Arquionie™ por completo, sem custo.
          </p>
        </Bloco>
        <Bloco id="licencas" titulo="Licenças">
          <Licencas nome={d.nome || d.email} />
        </Bloco>
        <Bloco id="computadores" titulo="Computadores conectados">
          <Computadores />
        </Bloco>
        <Bloco id="senha" titulo="Senha">
          <TrocarSenha temSenha={d.pelaSenha} />
        </Bloco>
        <Bloco id="emails" titulo="E-mails">
          <Novidades ligado={d.novidades} />
        </Bloco>
        <Bloco id="privacidade" titulo="Privacidade">
          <p className="mb-2 text-[14px] text-aqi-muted">
            Os seus projetos ficam no seu computador; a conta guarda só o cadastro e os computadores conectados. Veja a{' '}
            <a href="/privacidade" className="link">
              política de privacidade
            </a>
            .
          </p>
          <a href={pedidoExclusao} className="text-[14px] text-[#E8877B] underline">
            Pedir a exclusão da minha conta e dos meus dados
          </a>
        </Bloco>
      </div>
    </div>
  );
}
