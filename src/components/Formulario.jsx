import { useRef, useState } from 'react';

// Peças do formulário no desenho do programa (doc 19): rótulo no laranja fechado, valor na metade mais fechada,
// checkbox com a marca à direita, confirmação no laranja fechado com texto branco, secundário em cinza.

export function Campo({ rotulo, id, tipo = 'text', valor, aoMudar, dica, autoComplete, obrigatorio, autoFocus, ...resto }) {
  const [mostrar, setMostrar] = useState(false);
  const senha = tipo === 'password';
  return (
    <div className="mb-1.5 grid min-h-[38px] grid-cols-[112px_minmax(0,1fr)] text-[13px] sm:grid-cols-[150px_minmax(0,1fr)]">
      <label htmlFor={id} className="flex items-center bg-aqi-campo px-3 font-semibold tracking-wide text-white">
        {rotulo}
      </label>
      <div className="flex items-center gap-2 bg-aqi-valor px-3">
        <input
          id={id}
          type={senha && mostrar ? 'text' : tipo}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          autoComplete={autoComplete}
          required={obrigatorio}
          autoFocus={autoFocus}
          className="w-0 min-w-0 flex-1 bg-transparent py-2 text-white placeholder:text-[#C9A9A5] focus:outline-none"
          {...resto}
        />
        {senha ? (
          <button type="button" onClick={() => setMostrar(!mostrar)} className="text-[11px] tracking-wide text-[#E8C9C5] hover:text-white">
            {mostrar ? 'ESCONDER' : 'MOSTRAR'}
          </button>
        ) : dica ? (
          <span className="text-[11px] text-[#E8C9C5]">{dica}</span>
        ) : null}
      </div>
    </div>
  );
}

export function Lista({ rotulo, id, valor, aoMudar, opcoes, obrigatorio }) {
  return (
    <div className="mb-1.5 grid min-h-[38px] grid-cols-[112px_minmax(0,1fr)] text-[13px] sm:grid-cols-[150px_minmax(0,1fr)]">
      <label htmlFor={id} className="flex items-center bg-aqi-campo px-3 font-semibold tracking-wide text-white">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        required={obrigatorio}
        className="w-full cursor-pointer bg-aqi-valor px-3 text-white focus:outline-none"
      >
        <option value="" disabled>
          ESCOLHA
        </option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor} className="bg-aqi-valor">
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Marcar({ id, marcado, aoMudar, children }) {
  return (
    <label htmlFor={id} className="mb-1.5 grid min-h-[38px] cursor-pointer grid-cols-[1fr_44px] text-[13px]">
      <span className="flex items-center bg-aqi-campo px-3 py-2 text-white">{children}</span>
      <span className="grid place-items-center bg-aqi-valor text-white">
        <input id={id} type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} className="peer sr-only" />
        <span aria-hidden="true" className="text-[15px]">{marcado ? '✓' : ''}</span>
      </span>
    </label>
  );
}

export function Botao({ principal, children, className = '', ...resto }) {
  const base =
    'inline-flex h-[40px] min-w-[129px] items-center justify-center px-4 text-[13px] font-bold tracking-wide transition-colors disabled:cursor-not-allowed';
  const estilo = principal
    ? 'bg-aqi-campo text-white hover:bg-aqi-campohover disabled:bg-aqi-painel disabled:text-aqi-muted'
    : 'border border-aqi-borda bg-aqi-barra text-aqi-texto hover:bg-aqi-faixa';
  return (
    <button className={`${base} ${estilo} ${className}`} {...resto}>
      {children}
    </button>
  );
}

// O botão escuro das regras de marca do Google: a única peça com cantos arredondados, porque a marca é dele.
export function BotaoGoogle({ aoClicar, desabilitado }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      className="mb-3 mt-0.5 flex h-[40px] w-full items-center justify-center gap-2.5 rounded-[4px] border border-[#8E918F] bg-[#131314] text-[14px] font-medium text-[#E3E3E3] hover:bg-[#1F1F21] disabled:opacity-60"
    >
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      Continuar com o Google
    </button>
  );
}

export function Ou({ children = 'ou com o e-mail' }) {
  return (
    <div className="mb-3 flex items-center gap-2.5 text-[11px] tracking-wide text-aqi-muted">
      <span className="h-px flex-1 bg-aqi-borda" />
      {children}
      <span className="h-px flex-1 bg-aqi-borda" />
    </div>
  );
}

// Seis caixas para o código do e-mail; aceita colar o código inteiro.
export function Codigo({ valor, aoMudar }) {
  const caixas = useRef([]);
  const digitos = valor.padEnd(6, ' ').slice(0, 6).split('');
  const definir = (texto, inicio) => {
    const limpo = texto.replace(/\D/g, '');
    if (!limpo) return;
    const novo = (valor.slice(0, inicio) + limpo).slice(0, 6);
    aoMudar(novo);
    caixas.current[Math.min(novo.length, 5)]?.focus();
  };
  return (
    <div className="mb-2.5 mt-1 flex gap-1.5 sm:gap-2" role="group" aria-label="Código de 6 dígitos">
      {digitos.map((d, i) => (
        <input
          key={i}
          ref={(el) => (caixas.current[i] = el)}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Dígito ${i + 1}`}
          value={d.trim()}
          onChange={(e) => definir(e.target.value, i)}
          onPaste={(e) => {
            e.preventDefault();
            definir(e.clipboardData.getData('text'), 0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              const pos = d.trim() ? i : Math.max(i - 1, 0);
              aoMudar(valor.slice(0, pos));
              caixas.current[pos]?.focus();
            }
          }}
          className="h-[52px] w-[42px] sm:h-[56px] sm:w-[46px] bg-aqi-valor text-center text-[26px] font-semibold text-white caret-aqi-coral focus:shadow-[inset_0_-3px_0_#E76353] focus:outline-none"
        />
      ))}
    </div>
  );
}

export function Mensagem({ erro, children }) {
  if (!children) return null;
  return (
    <p role={erro ? 'alert' : 'status'} className={`mb-2 text-[13px] ${erro ? 'text-aqi-coral' : 'text-aqi-lema'}`}>
      {children}
    </p>
  );
}
