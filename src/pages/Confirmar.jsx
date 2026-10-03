import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Cartao from '@/components/Cartao';
import { Botao, Codigo, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { destinoSeguro } from '@/lib/conta';

const ESPERA_REENVIO = 60; // segundos

export default function Confirmar() {
  const [busca] = useSearchParams();
  const email = busca.get('email') ?? '';
  const volta = destinoSeguro(busca.get('volta'));
  const navegar = useNavigate();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [espera, setEspera] = useState(ESPERA_REENVIO);

  useEffect(() => {
    if (espera <= 0) return undefined;
    const t = setTimeout(() => setEspera(espera - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function confirmar() {
    setErro('');
    if (codigo.length !== 6) return setErro('Digite os seis dígitos do código.');
    setOcupado(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    navegar(volta, { replace: true });
  }

  async function reenviar() {
    setErro('');
    setAviso('');
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) return setErro(mensagemDeErro(error));
    setAviso('Mandamos um código novo.');
    setEspera(ESPERA_REENVIO);
  }

  const minutos = `${Math.floor(espera / 60)}:${String(espera % 60).padStart(2, '0')}`;

  return (
    <section className="px-4 py-10">
      <Cartao
        titulo="Confirme o seu e-mail"
        nota={
          <>
            Mandamos um código de 6 dígitos para <b className="font-semibold text-aqi-texto">{email || 'o seu e-mail'}</b>. Ele vale por 1 hora.
          </>
        }
        aoEnviar={confirmar}
        botoes={
          <>
            <Botao type="button" onClick={() => navegar(-1)}>
              VOLTAR
            </Botao>
            <Botao principal type="submit" disabled={ocupado || codigo.length !== 6}>
              {ocupado ? 'CONFIRMANDO…' : 'CONFIRMAR'}
            </Botao>
          </>
        }
      >
        <Codigo valor={codigo} aoMudar={setCodigo} />
        <div className="mb-2 flex flex-wrap justify-between gap-2 text-[12px]">
          {espera > 0 ? (
            <span className="text-aqi-muted">REENVIAR CÓDIGO em {minutos}</span>
          ) : (
            <button type="button" onClick={reenviar} className="link-apagado text-left" disabled={!email}>
              REENVIAR CÓDIGO
            </button>
          )}
          <span className="text-aqi-muted">Não chegou? Olhe a caixa de spam.</span>
        </div>
        <p className="mb-2 text-[12px] text-aqi-muted">
          O e-mail trouxe um link em vez do código? Clique nele neste mesmo navegador: a conta fica confirmada e você entra.
        </p>
        <Mensagem erro>{erro}</Mensagem>
        <Mensagem>{aviso}</Mensagem>
      </Cartao>
    </section>
  );
}
