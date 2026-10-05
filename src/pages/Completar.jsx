import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Cartao from '@/components/Cartao';
import { Botao, Lista, Marcar, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { useSessao } from '@/lib/Sessao';
import { cadastroCompleto, dadosDaConta, destinoSeguro } from '@/lib/conta';
import { ATUACOES, VERSAO_TERMOS } from '@/config';

// Quem entrou pelo Google já tem nome e e-mail; na primeira vez falta só a atuação e o aceite dos termos.
export default function Completar() {
  const [busca] = useSearchParams();
  const volta = destinoSeguro(busca.get('volta'));
  const navegar = useNavigate();
  const { usuario, carregando } = useSessao();
  const [atuacao, setAtuacao] = useState('');
  const [termos, setTermos] = useState(false);
  const [novidades, setNovidades] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [tentou, setTentou] = useState(false);

  useEffect(() => {
    if (usuario && cadastroCompleto(usuario)) navegar(volta, { replace: true });
  }, [usuario, volta, navegar]);

  if (carregando) return <p className="px-4 py-16 text-center text-aqi-muted">Carregando…</p>;
  if (!usuario) return <Navigate to={`/entrar?volta=${encodeURIComponent(volta)}`} replace />;

  const dados = dadosDaConta(usuario);

  async function concluir() {
    setErro('');
    setTentou(true);
    if (!atuacao && !termos) return setErro('Escolha a sua atuação na lista e marque a caixa dos termos.');
    if (!atuacao) return setErro('Escolha a sua atuação: clique na lista ATUAÇÃO.');
    if (!termos) return setErro('Marque a caixa "Li e aceito" para continuar.');
    setOcupado(true);
    const { error } = await supabase.auth.updateUser({
      data: { nome: dados.nome, atuacao, novidades, aceite_termos_em: new Date().toISOString(), versao_termos: VERSAO_TERMOS },
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    navegar(volta, { replace: true });
  }

  return (
    <section className="px-4 py-10">
      <Cartao
        compacto
        titulo="Falta pouco"
        nota={
          <>
            Você entrou como <b className="font-semibold text-aqi-texto">{dados.email}</b>. Faltam dois passos: escolha a sua
            atuação na lista e marque a caixa dos termos.
          </>
        }
        aoEnviar={concluir}
        botoes={
          <>
            <Botao type="button" onClick={() => supabase.auth.signOut().then(() => navegar('/'))}>
              SAIR
            </Botao>
            <Botao principal type="submit" disabled={ocupado}>
              {ocupado ? 'SALVANDO…' : 'CONTINUAR'}
            </Botao>
          </>
        }
      >
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
