import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Botao, Campo, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { useSessao } from '@/lib/Sessao';
import { dadosDaConta } from '@/lib/conta';
import { dataLegivel } from '@/lib/manifesto';
import { ATUACOES, EMAIL_CONTATO } from '@/config';

const LIMITE_COMPUTADORES = 3; // decisão de 02/10/2026

function Bloco({ id, titulo, children }) {
  return (
    <section id={id} className="mb-10 scroll-mt-6">
      <h2 className="mb-3 text-[17px] font-semibold text-white">{titulo}</h2>
      {children}
    </section>
  );
}

// Os computadores vêm da tabela `computadores` (supabase/migrations), que o programa preenche ao entrar. Antes da
// tabela existir, ou sem nenhum computador, a página diz isso em vez de dar erro.
function Computadores() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const carregar = async () => {
    const { data, error } = await supabase.from('computadores').select('id, nome, versao, ultimo_acesso').order('ultimo_acesso', { ascending: false });
    if (error) setLista([]);
    else setLista(data);
  };
  useEffect(() => {
    carregar();
  }, []);

  async function desconectar(id) {
    setErro('');
    const { error } = await supabase.from('computadores').delete().eq('id', id);
    if (error) return setErro(mensagemDeErro(error));
    carregar();
  }

  if (lista === null) return <p className="text-aqi-muted">Carregando…</p>;
  return (
    <>
      <p className="mb-3 text-[14px] text-aqi-muted">
        Até {LIMITE_COMPUTADORES} computadores podem ficar conectados ao mesmo tempo. Ao entrar num quarto, o Arquionie™ pede para desconectar um.
      </p>
      {lista.length === 0 ? (
        <p className="bg-aqi-barra px-4 py-3 text-[14px] text-aqi-muted">
          Nenhum computador conectado ainda. Ele aparece aqui quando você entrar com esta conta no programa.
        </p>
      ) : (
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
            {lista.map((c) => (
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
      )}
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
