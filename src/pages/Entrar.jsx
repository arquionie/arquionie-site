import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Cartao from '@/components/Cartao';
import { BotaoGoogle, Botao, Campo, Mensagem, Ou } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { useSessao } from '@/lib/Sessao';
import { destinoSeguro } from '@/lib/conta';

export async function entrarComGoogle(volta) {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${destinoSeguro(volta)}` },
  });
}

export default function Entrar() {
  const [busca] = useSearchParams();
  const volta = destinoSeguro(busca.get('volta'));
  const navegar = useNavigate();
  const { usuario } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (usuario) navegar(volta, { replace: true });
  }, [usuario, volta, navegar]);

  async function entrar() {
    setErro('');
    if (!email.trim() || !senha) return setErro('Digite o e-mail e a senha.');
    setOcupado(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setOcupado(false);
    if (!error) return navegar(volta, { replace: true });
    if (/email not confirmed/i.test(error.message)) {
      return navegar(`/confirmar?email=${encodeURIComponent(email.trim())}&volta=${encodeURIComponent(volta)}`);
    }
    setErro(mensagemDeErro(error));
  }

  async function google() {
    setErro('');
    const { error } = await entrarComGoogle(volta);
    if (error) setErro(mensagemDeErro(error));
  }

  return (
    <section className="px-4 py-10">
      <Cartao
        titulo="Entrar na sua conta"
        nota="Use o e-mail do cadastro. Ainda não tem conta? Crie em um minuto."
        aoEnviar={entrar}
        botoes={
          <>
            <Botao type="button" onClick={() => navegar(`/criar-conta?volta=${encodeURIComponent(volta)}`)}>
              CRIAR CONTA
            </Botao>
            <Botao principal type="submit" disabled={ocupado}>
              {ocupado ? 'ENTRANDO…' : 'ENTRAR'}
            </Botao>
          </>
        }
      >
        <BotaoGoogle aoClicar={google} />
        <Ou />
        <Campo id="email" rotulo="E-MAIL" tipo="email" valor={email} aoMudar={setEmail} autoComplete="email" autoFocus />
        <Campo id="senha" rotulo="SENHA" tipo="password" valor={senha} aoMudar={setSenha} autoComplete="current-password" />
        <div className="mb-2 mt-2 text-[12px]">
          <Link to={`/recuperar?email=${encodeURIComponent(email.trim())}`} className="link">
            Esqueci a senha
          </Link>
        </div>
        <Mensagem erro>{erro}</Mensagem>
      </Cartao>
    </section>
  );
}
