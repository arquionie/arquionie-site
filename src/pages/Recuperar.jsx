import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Cartao from '@/components/Cartao';
import { Botao, Campo, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';

// Esqueci a senha: o e-mail, depois o código de 6 dígitos e a senha nova, na mesma tela (decisão de 02/10/2026).
// Trocar a senha encerra as sessões abertas nos outros computadores.
export default function Recuperar() {
  const [busca] = useSearchParams();
  const navegar = useNavigate();
  const [email, setEmail] = useState(busca.get('email') ?? '');
  const [etapa, setEtapa] = useState('email');
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function pedirCodigo() {
    setErro('');
    if (!email.trim()) return setErro('Digite o e-mail da conta.');
    setOcupado(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    setEtapa('codigo');
    setAviso('');
  }

  async function salvar() {
    setErro('');
    const limpo = codigo.replace(/\D/g, '');
    if (limpo.length !== 6) return setErro('Digite os seis dígitos do código.');
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (senha !== repetir) return setErro('As duas senhas não são iguais.');
    setOcupado(true);
    const verificado = await supabase.auth.verifyOtp({ email: email.trim(), token: limpo, type: 'recovery' });
    if (verificado.error) {
      setOcupado(false);
      return setErro(mensagemDeErro(verificado.error));
    }
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (!error) await supabase.auth.signOut({ scope: 'others' });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    navegar('/conta', { replace: true });
  }

  async function reenviar() {
    setErro('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setAviso(error ? '' : 'Mandamos um código novo.');
    if (error) setErro(mensagemDeErro(error));
  }

  if (etapa === 'email') {
    return (
      <section className="px-4 py-10">
        <Cartao
          titulo="Esqueci a senha"
          nota="Digite o e-mail da conta. Mandamos um código de 6 dígitos para criar a senha nova."
          aoEnviar={pedirCodigo}
          botoes={
            <>
              <Botao type="button" onClick={() => navegar(-1)}>
                VOLTAR
              </Botao>
              <Botao principal type="submit" disabled={ocupado}>
                {ocupado ? 'ENVIANDO…' : 'MANDAR CÓDIGO'}
              </Botao>
            </>
          }
        >
          <Campo id="email" rotulo="E-MAIL" tipo="email" valor={email} aoMudar={setEmail} autoComplete="email" autoFocus />
          <Mensagem erro>{erro}</Mensagem>
        </Cartao>
      </section>
    );
  }

  return (
    <section className="px-4 py-10">
      <Cartao
        titulo="Nova senha"
        nota={
          <>
            Mandamos um código para <b className="font-semibold text-aqi-texto">{email}</b>.
          </>
        }
        aoEnviar={salvar}
        estado={
          <button type="button" onClick={reenviar} className="link-apagado">
            REENVIAR CÓDIGO
          </button>
        }
        botoes={
          <>
            <Botao type="button" onClick={() => setEtapa('email')}>
              VOLTAR
            </Botao>
            <Botao principal type="submit" disabled={ocupado}>
              {ocupado ? 'SALVANDO…' : 'SALVAR SENHA'}
            </Botao>
          </>
        }
      >
        <Campo id="codigo" rotulo="CÓDIGO" valor={codigo} aoMudar={setCodigo} inputMode="numeric" autoComplete="one-time-code" autoFocus />
        <Campo id="senha" rotulo="NOVA SENHA" tipo="password" valor={senha} aoMudar={setSenha} autoComplete="new-password" />
        <Campo id="repetir" rotulo="REPETIR A SENHA" tipo="password" valor={repetir} aoMudar={setRepetir} autoComplete="new-password" />
        <Mensagem erro>{erro}</Mensagem>
        <Mensagem>{aviso}</Mensagem>
      </Cartao>
    </section>
  );
}
