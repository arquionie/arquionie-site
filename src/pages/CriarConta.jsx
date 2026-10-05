import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Cartao from '@/components/Cartao';
import { BotaoGoogle, Botao, Campo, Lista, Marcar, Mensagem, Ou } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { destinoSeguro } from '@/lib/conta';
import { ATUACOES, VERSAO_TERMOS } from '@/config';
import { entrarComGoogle } from '@/pages/Entrar';

// Quatro campos (decisão de 02/10/2026): nome, e-mail, senha e atuação; termos obrigatórios; novidades opcional e
// desmarcado (LGPD). O e-mail se confirma por código de 6 dígitos na página seguinte.
export default function CriarConta() {
  const [busca] = useSearchParams();
  const volta = destinoSeguro(busca.get('volta'));
  const navegar = useNavigate();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [atuacao, setAtuacao] = useState('');
  const [termos, setTermos] = useState(false);
  const [novidades, setNovidades] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [tentou, setTentou] = useState(false);

  async function criar() {
    setErro('');
    setTentou(true);
    if (!nome.trim() || !email.trim() || !senha) return setErro('Preencha o nome, o e-mail e a senha.');
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (!atuacao) return setErro('Escolha a sua atuação: clique na lista ATUAÇÃO.');
    if (!termos) return setErro('Marque a caixa "Li e aceito" para criar a conta.');
    setOcupado(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: {
        emailRedirectTo: `${window.location.origin}${volta}`,
        data: {
          nome: nome.trim(),
          atuacao,
          novidades,
          aceite_termos_em: new Date().toISOString(),
          versao_termos: VERSAO_TERMOS,
        },
      },
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    // Com a confirmação ligada, um e-mail que já tem conta volta sem identidades, e não com erro.
    if (data.user && (data.user.identities ?? []).length === 0) {
      return setErro('Esse e-mail já tem conta. Entre ou recupere a senha.');
    }
    navegar(`/confirmar?email=${encodeURIComponent(email.trim())}&volta=${encodeURIComponent(volta)}`);
  }

  async function google() {
    setErro('');
    const { error } = await entrarComGoogle(volta);
    if (error) setErro(mensagemDeErro(error));
  }

  return (
    <section className="px-4 py-10">
      <Cartao
        compacto
        titulo="Criar conta"
        nota="Grátis no lançamento. Mandamos um código para confirmar o e-mail."
        aoEnviar={criar}
        estado={
          <span>
            Já tem conta?{' '}
            <Link to={`/entrar?volta=${encodeURIComponent(volta)}`} className="link-apagado">
              Entrar
            </Link>
          </span>
        }
        botoes={
          <>
            <Botao type="button" onClick={() => navegar(-1)}>
              VOLTAR
            </Botao>
            <Botao principal type="submit" disabled={ocupado}>
              {ocupado ? 'CRIANDO…' : 'CRIAR CONTA'}
            </Botao>
          </>
        }
      >
        <BotaoGoogle aoClicar={google} />
        <Ou />
        <Campo id="nome" rotulo="NOME" valor={nome} aoMudar={setNome} autoComplete="name" autoFocus placeholder="Seu nome" />
        <Campo id="email" rotulo="E-MAIL" tipo="email" valor={email} aoMudar={setEmail} autoComplete="email" />
        <Campo id="senha" rotulo="SENHA" tipo="password" valor={senha} aoMudar={setSenha} autoComplete="new-password" placeholder="•••••••• (mínimo de 8)" />
        <Lista id="atuacao" rotulo="ATUAÇÃO" valor={atuacao} aoMudar={setAtuacao} opcoes={ATUACOES} falta={tentou && !atuacao} />
        <Marcar id="termos" marcado={termos} aoMudar={setTermos} falta={tentou && !termos}>
          <span>
            Li e aceito os{' '}
            <Link to="/termos" target="_blank" className="text-white underline">
              termos de uso
            </Link>{' '}
            e a{' '}
            <Link to="/privacidade" target="_blank" className="text-white underline">
              política de privacidade
            </Link>
          </span>
        </Marcar>
        <Marcar id="novidades" marcado={novidades} aoMudar={setNovidades}>
          Quero receber novidades do Arquionie™ por e-mail (opcional)
        </Marcar>
        <Mensagem erro>{erro}</Mensagem>
      </Cartao>
    </section>
  );
}
