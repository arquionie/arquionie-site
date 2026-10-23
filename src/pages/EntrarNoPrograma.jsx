import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Cartao, { Miolo } from '@/components/Cartao';
import { Botao, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/Sessao';
import { AMOSTRA } from '@/lib/licencas';

// /programa/entrar?porta=PORTA&desafio=DESAFIO&nome=COMPUTADOR — ENTRAR PELO NAVEGADOR (mockup docs/mockups/entrar-pelo-navegador do
// repositório do programa, aprovado por ÊDI em 22/10/2026). O programa abre esta página; a conta já vem aberta (RotaDaConta leva antes a
// ENTRAR, com a verificação de pessoa, e ao COMPLETAR de quem vem pelo Google). A pessoa confere o e-mail e o computador e clica: a função
// programa dá um código de uso único, que volta ao programa por /programa/PORTA (127.0.0.1). O programa troca o código pela sessão dele.

const PORTA = /^\d{2,5}$/;
const DESAFIO = /^[A-Za-z0-9_-]{43}$/;

export default function EntrarNoPrograma() {
  const [busca] = useSearchParams();
  const navegar = useNavigate();
  const { usuario } = useSessao();
  const porta = busca.get('porta') ?? '';
  const desafio = busca.get('desafio') ?? '';
  const computador = (busca.get('nome') ?? '').trim().slice(0, 60) || 'este computador';
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  if (!AMOSTRA && (!PORTA.test(porta) || !DESAFIO.test(desafio))) {
    return (
      <Miolo>
        <Cartao titulo="Este link não veio do Arquionie™">
          <p className="text-texto-apagado">Para entrar no programa, clique em ENTRAR PELO NAVEGADOR na janela da conta do Arquionie™.</p>
        </Cartao>
      </Miolo>
    );
  }

  async function entrar() {
    setErro('');
    setOcupado(true);
    if (AMOSTRA) return navegar('/programa/0', { replace: true });
    const { data, error } = await supabase.functions.invoke('programa', { body: { acao: 'autorizar', desafio } });
    if (error || !data?.ok) {
      setOcupado(false);
      return setErro(error ? 'Não deu para entrar no programa agora. Tente de novo em instantes.' : data.motivo);
    }
    navegar(`/programa/${porta}?code=${encodeURIComponent(data.codigo)}`, { replace: true });
  }

  // USAR OUTRA CONTA: sai só deste navegador e volta a ENTRAR, que traz a pessoa de volta para cá.
  async function outraConta() {
    await supabase.auth.signOut({ scope: 'local' });
    navegar(`/entrar?volta=${encodeURIComponent(`/programa/entrar?${busca.toString()}`)}`, { replace: true });
  }

  const email = usuario?.email ?? (AMOSTRA ? 'ana@exemplo.com.br' : '');
  return (
    <Miolo>
      <Cartao
        titulo="Entrar no programa"
        aoEnviar={entrar}
        botoes={
          <>
            <Botao nivel={2} type="button" onClick={outraConta}>Usar outra conta</Botao>
            <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'Entrando…' : 'Entrar no programa'}</Botao>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-dentro bg-superficie-2 p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amg-destaque-suave font-bold text-destaque-texto">
            {email.slice(0, 2).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col">
            <b className="break-all font-semibold">{email}</b>
            <small className="text-amg-legenda text-texto-apagado">no computador {computador}</small>
          </span>
        </div>
        <Mensagem erro>{erro}</Mensagem>
      </Cartao>
    </Miolo>
  );
}
