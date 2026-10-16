import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Cartao, { Miolo } from '@/components/Cartao';
import { Botao, Campo, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { useSessao } from '@/lib/Sessao';

// Esqueci a senha: o e-mail, depois o código de 6 dígitos e a senha nova, na mesma tela (decisão de 02/10/2026).
// O e-mail traz também um link (e só o link enquanto o envio for o padrão do Supabase): ele volta para cá com a sessão
// de recuperação aberta, e aí basta a senha nova. Trocar a senha encerra as sessões abertas nos outros computadores.
const VOLTA_DO_LINK = () => `${window.location.origin}/recuperar?etapa=senha`;

export default function Recuperar() {
  const [busca] = useSearchParams();
  const navegar = useNavigate();
  const { usuario } = useSessao();
  const peloLink = busca.get('etapa') === 'senha';
  const [email, setEmail] = useState(busca.get('email') ?? '');
  const [etapa, setEtapa] = useState(peloLink ? 'senha' : 'email');
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
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: VOLTA_DO_LINK() });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    setEtapa('codigo');
    setAviso('');
  }

  async function salvar() {
    setErro('');
    const limpo = codigo.replace(/\D/g, '');
    if (etapa === 'codigo' && limpo.length !== 6) return setErro('Digite os seis dígitos do código.');
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (senha !== repetir) return setErro('As duas senhas não são iguais.');
    if (etapa === 'senha' && !usuario) return setErro('O link venceu ou foi aberto em outro navegador. Peça um código novo.');
    setOcupado(true);
    if (etapa === 'codigo') {
      const verificado = await supabase.auth.verifyOtp({ email: email.trim(), token: limpo, type: 'recovery' });
      if (verificado.error) {
        setOcupado(false);
        return setErro(mensagemDeErro(verificado.error));
      }
    }
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (!error) await supabase.auth.signOut({ scope: 'others' });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    navegar('/conta', { replace: true });
  }

  async function reenviar() {
    setErro('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: VOLTA_DO_LINK() });
    setAviso(error ? '' : 'Mandamos um código novo.');
    if (error) setErro(mensagemDeErro(error));
  }

  if (etapa === 'email') {
    return (
      <Miolo>
        <Cartao
          titulo="Esqueci a senha"
          nota="Digite o e-mail da conta. Mandamos um código de 6 dígitos para criar a senha nova."
          aoEnviar={pedirCodigo}
          botoes={
            <>
              <Botao type="button" onClick={() => navegar(-1)}>
                Voltar
              </Botao>
              <Botao principal type="submit" disabled={ocupado}>
                {ocupado ? 'Mandando…' : 'Mandar código'}
              </Botao>
            </>
          }
        >
          <Campo id="email" rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} autoComplete="email" autoFocus />
          <Mensagem erro>{erro}</Mensagem>
        </Cartao>
      </Miolo>
    );
  }

  return (
    <Miolo>
      <Cartao
        titulo="Nova senha"
        nota={
          etapa === 'senha' ? (
            'Digite a senha nova da sua conta.'
          ) : (
            <>
              Mandamos um código para <b className="font-semibold text-texto">{email}</b>. Se o e-mail trouxer um link,
              clique nele neste navegador.
            </>
          )
        }
        aoEnviar={salvar}
        rodape={
          etapa === 'codigo' && (
            <Botao pequeno nivel={2} type="button" onClick={reenviar}>
              Mandar outro código
            </Botao>
          )
        }
        botoes={
          <>
            <Botao type="button" onClick={() => setEtapa('email')}>
              Voltar
            </Botao>
            <Botao principal type="submit" disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Salvar senha'}
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          {etapa === 'codigo' && (
            <Campo id="codigo" rotulo="Código" valor={codigo} aoMudar={setCodigo} inputMode="numeric" autoComplete="one-time-code" autoFocus />
          )}
          <Campo id="senha" rotulo="Nova senha" tipo="password" valor={senha} aoMudar={setSenha} autoComplete="new-password" />
          <Campo id="repetir" rotulo="Repetir a senha" tipo="password" valor={repetir} aoMudar={setRepetir} autoComplete="new-password" />
        </div>
        <Mensagem erro>{erro}</Mensagem>
        <Mensagem>{aviso}</Mensagem>
      </Cartao>
    </Miolo>
  );
}
