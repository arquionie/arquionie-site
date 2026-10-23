import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Cartao, { Miolo } from '@/components/Cartao';
import { BotaoGoogle, Botao, Campo, Mensagem, Ou } from '@/components/Formulario';
import VerificacaoDePessoa from '@/components/VerificacaoDePessoa';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { useSessao } from '@/lib/Sessao';
import { cadastroCompleto, destinoSeguro } from '@/lib/conta';

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
  const [pessoa, setPessoa] = useState('');
  const verificacao = useRef(null);

  // Quem já entrou segue para onde ia; quem entrou pelo Google e ainda não completou o cadastro passa antes por ele.
  useEffect(() => {
    if (!usuario) return;
    navegar(cadastroCompleto(usuario) ? volta : `/completar?volta=${encodeURIComponent(volta)}`, { replace: true });
  }, [usuario, volta, navegar]);

  async function entrar() {
    setErro('');
    if (!email.trim() || !senha) return setErro('Digite o e-mail e a senha.');
    setOcupado(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha, options: { captchaToken: pessoa } });
    setOcupado(false);
    verificacao.current?.reiniciar();
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
    <Miolo>
      <Cartao
        titulo="Entrar na sua conta"
        nota="Use o e-mail do cadastro. Ainda não tem conta? Crie em um minuto."
        aoEnviar={entrar}
        botoes={
          <>
            <Botao type="button" onClick={() => navegar(`/criar-conta?volta=${encodeURIComponent(volta)}`)}>
              Criar conta
            </Botao>
            <Botao principal type="submit" disabled={ocupado}>
              {ocupado ? 'Entrando…' : 'Entrar'}
            </Botao>
          </>
        }
      >
        <BotaoGoogle aoClicar={google} />
        <Ou />
        <div className="flex flex-col gap-2">
          <Campo id="email" rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} autoComplete="email" autoFocus />
          <Campo id="senha" rotulo="Senha" tipo="password" valor={senha} aoMudar={setSenha} autoComplete="current-password" />
        </div>
        {/* o link de ação, no destaque */}
        <Link to={`/recuperar?email=${encodeURIComponent(email.trim())}`} className="self-start font-semibold text-destaque no-underline hover:underline">
          Esqueci a senha
        </Link>
        <VerificacaoDePessoa ref={verificacao} aoConfirmar={setPessoa} />
        <Mensagem erro>{erro}</Mensagem>
      </Cartao>
    </Miolo>
  );
}
