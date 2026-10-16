import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// As peças do formulário no modo AMIGÁVEL (design/sistema-de-design do repositório do Arquionie; mockup site-amigavel, aprovado por ÊDI
// em 16/10/2026). O que se toca é cápsula (raio-toque): botões, campos, listas e etiquetas; o que fica dentro de um cartão usa
// raio-dentro. As cores, os raios e as alturas vêm só dos tokens. O /gestao usa as mesmas.

// Exemplo esmaecido dentro do campo vazio, para quem chega pela primeira vez ver que ali se digita (teste cego de 05/10/2026).
const EXEMPLOS = { email: 'exemplo@exemplo.com', password: '••••••••' };

// A cápsula do campo: o rótulo pequeno à esquerda e o valor à direita. O anel do foco fica na cápsula inteira.
const CAPSULA =
  'flex h-amg-altura-campo min-w-0 items-center gap-2.5 rounded-toque bg-superficie pl-[18px] pr-1.5 ring-1 ring-inset ring-linha focus-within:ring-2 focus-within:ring-destaque';
const ROTULO = 'shrink-0 whitespace-nowrap text-amg-legenda text-texto-apagado';
// 16 px no valor: com menos, o iPhone aproxima a tela ao tocar no campo.
const VALOR = 'w-0 min-w-0 flex-1 bg-transparent text-[16px] text-texto placeholder:text-texto-apagado focus-visible:outline-none';

export function Campo({ rotulo, id, tipo = 'text', valor, aoMudar, dica, autoComplete, obrigatorio, autoFocus, placeholder, falta, ...resto }) {
  const [mostrar, setMostrar] = useState(false);
  const senha = tipo === 'password';
  return (
    <div className={`${CAPSULA} ${falta ? 'ring-2 ring-destaque' : ''}`}>
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <input
        id={id}
        type={senha && mostrar ? 'text' : tipo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        autoComplete={autoComplete}
        required={obrigatorio}
        autoFocus={autoFocus}
        placeholder={placeholder ?? EXEMPLOS[tipo]}
        className={`${VALOR} ${senha || dica ? '' : 'mr-3'}`}
        {...resto}
      />
      {senha ? (
        <Botao pequeno type="button" aria-pressed={mostrar} onClick={() => setMostrar(!mostrar)}>
          {mostrar ? 'Esconder' : 'Mostrar'}
        </Botao>
      ) : dica ? (
        <span className="mr-3 shrink-0 text-amg-legenda text-texto-apagado">{dica}</span>
      ) : null}
    </div>
  );
}

// A lista mostra a seta e, vazia, "Clique para escolher" (no teste cego, o "ESCOLHA" sozinho não dizia que era para clicar).
// "falta" acende o anel quando a pessoa tenta seguir sem escolher.
export function Lista({ rotulo, id, valor, aoMudar, opcoes, obrigatorio, falta }) {
  return (
    <div className={`relative ${CAPSULA} ${falta ? 'ring-2 ring-destaque' : ''}`}>
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        required={obrigatorio}
        className={`${VALOR} h-full cursor-pointer appearance-none pr-10 ${valor ? '' : 'text-texto-apagado'}`}
      >
        <option value="" disabled>
          Clique para escolher
        </option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <Icone nome="abaixo" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-texto-apagado" />
    </div>
  );
}

// A caixa de marcar é um círculo: vazio com o contorno, marcado cheio na terracota com o ✓. O texto fica à direita.
export function Marcar({ id, marcado, aoMudar, falta, children }) {
  return (
    <label htmlFor={id} className={`flex min-h-amg-toque-minimo cursor-pointer items-center gap-3 rounded-dentro px-1 py-1.5 ${falta ? 'ring-2 ring-destaque' : ''}`}>
      <input id={id} type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-toque peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-destaque ${
          marcado ? 'bg-botao-1 text-botao-1-texto' : 'ring-2 ring-inset ring-texto-apagado'
        }`}
      >
        {marcado && <Icone nome="ok" tamanho={13} />}
      </span>
      <span>{children}</span>
    </label>
  );
}

// A chave de ligar e desligar, com o estado no nome para o leitor de tela ("ligada", "desligada").
export function Chave({ rotulo, ligada, aoMudar, desabilitada }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      aria-label={`${rotulo}, ${ligada ? 'ligada' : 'desligada'}`}
      disabled={desabilitada}
      onClick={() => aoMudar(!ligada)}
      className={`relative h-botao-pequeno w-[50px] shrink-0 rounded-toque transition-colors disabled:opacity-60 ${ligada ? 'bg-amg-chave-ligada' : 'bg-superficie-2'}`}
    >
      {/* o botão redondo é branco nos dois temas, como o texto do botão nível 1 */}
      <span
        aria-hidden="true"
        className={`absolute bottom-0.5 top-0.5 aspect-square rounded-toque bg-botao-1-texto shadow-cartao transition-all ${ligada ? 'left-[calc(100%-2px)] -translate-x-full' : 'left-0.5'}`}
      />
    </button>
  );
}

// Os três níveis de botão (o guia do sistema de design): 1 a terracota, a ação principal, um por bloco; 2 o que abre ou ajuda; 3 o não
// escolhido, cancelar, voltar, apagar. Lado a lado, o mais forte fica à direita. No celular o botão tem 48 px; no computador, 36.
// "pequeno" é o de dentro de uma linha ou de um cartão; com href vira um link, e com "para" um link do site, com a cara de botão.
const NIVEL = {
  1: 'bg-botao-1 text-botao-1-texto hover:brightness-110',
  2: 'bg-botao-2 text-botao-2-texto hover:brightness-[1.04]',
  3: 'bg-botao-3 text-botao-3-texto hover:brightness-[1.04]',
};

export function Botao({ principal, nivel, pequeno, grande, cheio, href, para, children, className = '', ...resto }) {
  const n = principal ? 1 : nivel ?? 3;
  const tamanho = pequeno
    ? 'h-botao-pequeno px-[13px] text-amg-legenda'
    : grande
      ? 'h-amg-altura-botao-grande px-[22px] text-amg-corpo-celular'
      : 'h-amg-altura-botao-grande px-[17px] text-amg-corpo-celular sm:h-botao sm:text-amg-corpo';
  const classes = `inline-flex shrink-0 items-center justify-center gap-[7px] whitespace-nowrap rounded-toque font-semibold no-underline transition disabled:cursor-not-allowed disabled:opacity-60 ${tamanho} ${
    NIVEL[n]} ${cheio ? 'w-full' : ''} ${className}`;
  if (para) return <Link to={para} className={classes} {...resto}>{children}</Link>;
  if (href) return <a href={href} className={classes} {...resto}>{children}</a>;
  return (
    <button className={classes} {...resto}>
      {children}
    </button>
  );
}

// Do Google ficam só o que as regras de marca dele exigem: o "G" com as cores dele e o nome Google no texto.
export function BotaoGoogle({ aoClicar, desabilitado }) {
  return (
    <Botao type="button" cheio onClick={aoClicar} disabled={desabilitado}>
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      Continuar com o Google
    </Botao>
  );
}

export function Ou({ children = 'ou com o e-mail' }) {
  return (
    <div className="flex items-center gap-2.5 text-amg-legenda text-texto-apagado">
      <span className="h-px flex-1 bg-linha" />
      {children}
      <span className="h-px flex-1 bg-linha" />
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
    <div className="flex justify-center gap-1.5 sm:gap-2" role="group" aria-label="Código de 6 dígitos">
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
          className="h-amg-altura-botao-grande w-[42px] rounded-dentro bg-superficie-2 text-center text-amg-titulo text-texto caret-destaque focus-visible:outline-2 focus-visible:outline-offset-0 sm:w-[46px]"
        />
      ))}
    </div>
  );
}

// O erro no tom da urgência (destaque-suave com destaque-texto) e o aviso no do feito (sucesso-suave com sucesso).
export function Mensagem({ erro, children }) {
  if (!children) return null;
  return (
    <p
      role={erro ? 'alert' : 'status'}
      className={`rounded-dentro px-3.5 py-2.5 text-amg-legenda ${erro ? 'bg-amg-destaque-suave text-destaque-texto' : 'bg-amg-sucesso-suave text-sucesso'}`}
    >
      {children}
    </p>
  );
}

// A etiqueta do estado: neutra, urgente (pede atenção), sucesso (feito) ou informação. Se faltar espaço, quem corta é ela.
const ETIQUETA = {
  neutra: 'bg-superficie-2 text-texto-apagado',
  urgente: 'bg-amg-destaque-suave text-destaque-texto',
  sucesso: 'bg-amg-sucesso-suave text-sucesso',
  informacao: 'bg-amg-informacao-suave text-amg-informacao',
};

export function Etiqueta({ tipo = 'neutra', children, className = '' }) {
  return (
    <span className={`inline-block max-w-full truncate rounded-toque px-2.5 py-[3px] align-middle text-amg-rotulo normal-case tracking-normal ${ETIQUETA[tipo]} ${className}`}>
      {children}
    </span>
  );
}

// Os ícones de traço de 2 px, pontas redondas, na cor do texto ao lado.
const DESENHOS = {
  baixar: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  seta: <path d="M9 6l6 6-6 6" />,
  abaixo: <path d="M6 9l6 6 6-6" />,
  ok: <path d="M5 12l5 5 9-10" />,
  copiar: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>
  ),
};

export function Icone({ nome, tamanho = 16, className = '' }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={nome === 'ok' ? 2.4 : 2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      {DESENHOS[nome]}
    </svg>
  );
}
