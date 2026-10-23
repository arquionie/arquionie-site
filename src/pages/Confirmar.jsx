import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Cartao, { Miolo } from '@/components/Cartao';
import { Botao, Codigo, Mensagem } from '@/components/Formulario';
import VerificacaoDePessoa from '@/components/VerificacaoDePessoa';
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
  const [pessoa, setPessoa] = useState('');
  const verificacao = useRef(null);

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
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { captchaToken: pessoa } });
    verificacao.current?.reiniciar();
    if (error) return setErro(mensagemDeErro(error));
    setAviso('Mandamos um código novo.');
    setEspera(ESPERA_REENVIO);
  }

  const minutos = `${Math.floor(espera / 60)}:${String(espera % 60).padStart(2, '0')}`;

  return (
    <Miolo>
      <Cartao
        titulo="Confirme o seu e-mail"
        nota={
          <>
            Mandamos um código de 6 dígitos para <b className="font-semibold text-texto">{email || 'o seu e-mail'}</b>. Ele vale por 1 hora.
          </>
        }
        aoEnviar={confirmar}
        botoes={
          <>
            <Botao type="button" onClick={() => navegar(-1)}>
              Voltar
            </Botao>
            <Botao principal type="submit" disabled={ocupado || codigo.length !== 6}>
              {ocupado ? 'Confirmando…' : 'Confirmar'}
            </Botao>
          </>
        }
      >
        <Codigo valor={codigo} aoMudar={setCodigo} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-amg-legenda text-texto-apagado">
          {espera > 0 ? (
            <span>Mandar outro código em {minutos}</span>
          ) : (
            <Botao pequeno nivel={2} type="button" onClick={reenviar} disabled={!email}>
              Mandar outro código
            </Botao>
          )}
          <span>Não chegou? Olhe a caixa de spam.</span>
        </div>
        {espera <= 0 && <VerificacaoDePessoa ref={verificacao} aoConfirmar={setPessoa} />}
        <p className="text-amg-legenda text-texto-apagado">
          O e-mail trouxe um link em vez do código? Clique nele neste mesmo navegador: a conta fica confirmada e você entra.
        </p>
        <Mensagem erro>{erro}</Mensagem>
        <Mensagem>{aviso}</Mensagem>
      </Cartao>
    </Miolo>
  );
}
