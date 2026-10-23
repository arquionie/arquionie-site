import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { TURNSTILE_CHAVE } from '@/config';

// A verificação de pessoa da Cloudflare (Turnstile), contra robôs, nas telas da conta (entrar, criar conta, esqueci a senha, outro
// código), que mandam o token ao Supabase (a checagem de segurança de 22/10/2026; o formulário do Comercial tem a dele). Quase sempre
// passa sozinha, sem clique. O token vale uma vez: depois de cada tentativa, a tela chama reiniciar() para ganhar outro. No
// desenvolvimento não desenha nada (a chave só vale nos endereços do site) e o token fica vazio.

const CHAVE = import.meta.env.DEV ? '' : TURNSTILE_CHAVE;
let carregando = null;
function carregar() {
  if (window.turnstile) return Promise.resolve();
  carregando ??= new Promise((pronto, falhou) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = pronto;
    s.onerror = () => { carregando = null; falhou(); };
    document.head.appendChild(s);
  });
  return carregando;
}

const VerificacaoDePessoa = forwardRef(function VerificacaoDePessoa({ aoConfirmar }, ref) {
  const caixa = useRef(null);
  const widget = useRef(null);
  const avisar = useRef(aoConfirmar);
  avisar.current = aoConfirmar;

  useImperativeHandle(ref, () => ({
    reiniciar() {
      avisar.current('');
      if (widget.current != null) window.turnstile?.reset(widget.current);
    },
  }), []);

  useEffect(() => {
    if (!CHAVE) return undefined;
    let vivo = true;
    carregar().then(() => {
      if (!vivo || !caixa.current) return;
      widget.current = window.turnstile.render(caixa.current, {
        sitekey: CHAVE,
        language: 'pt-BR',
        callback: (token) => avisar.current(token),
        'expired-callback': () => avisar.current(''),
        'error-callback': () => avisar.current(''),
      });
    }, () => {});
    return () => {
      vivo = false;
      if (widget.current != null) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  return CHAVE ? <div ref={caixa} className="min-h-[65px]" /> : null;
});

export default VerificacaoDePessoa;
