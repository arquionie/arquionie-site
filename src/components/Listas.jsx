import { useState } from 'react';
import { Botao, Icone } from '@/components/Formulario';
import { copiarTexto } from '@/lib/licencas';

// As listas agrupadas e os cartões de Minha conta, no modo AMIGÁVEL (mockup site-amigavel, aprovado por ÊDI em 16/10/2026): o rótulo
// pequeno em cima, o cartão de 18 px sem borda, as linhas com a divisória e os botões em cada linha.

// Os textos que o banco e as bibliotecas escrevem em caixa alta ("2 AJUSTES", "ATIVA ATÉ 05/10/2027") viram frase no amigável. As siglas
// de duas ou três letras (PRO) ficam como estão.
export function emFrase(texto) {
  if (!texto) return texto;
  const t = String(texto);
  if (/^[A-Z]{2,3}$/.test(t)) return t;
  // a maiúscula só quando a frase começa com letra: "2 AJUSTES" vira "2 ajustes"
  const baixo = t.toLocaleLowerCase('pt-BR');
  return /^\p{L}/u.test(baixo) ? baixo[0].toLocaleUpperCase('pt-BR') + baixo.slice(1) : baixo;
}

export function Grupo({ id, rotulo, children, className = '' }) {
  return (
    <section id={id} className={`scroll-mt-6 ${className}`}>
      {rotulo && <h2 className="rotulo mb-1.5 ml-3.5">{rotulo}</h2>}
      <div className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">{children}</div>
    </section>
  );
}

export function Linha({ children, className = '' }) {
  return (
    <div className={`flex min-h-amg-toque-minimo flex-wrap items-center gap-x-3 gap-y-2 border-t border-linha px-4 py-2.5 first:border-t-0 ${className}`}>
      {children}
    </div>
  );
}

// O nome em cima e a linha apagada embaixo, à esquerda de uma linha.
export function TextoDaLinha({ titulo, sub, children }) {
  return (
    <div className="min-w-0 flex-1">
      <b className="block break-words font-semibold">{titulo}</b>
      {sub && <small className="block break-words text-amg-legenda text-texto-apagado">{sub}</small>}
      {children}
    </div>
  );
}

// O rótulo à esquerda e o valor à direita, que nunca quebra: quem corta com reticências é ele.
export function LinhaDeValor({ rotulo, children }) {
  return (
    <div className="flex min-h-amg-toque-minimo items-center gap-3 border-t border-linha px-4 py-2 first:border-t-0">
      <span className="w-[110px] shrink-0 text-texto-apagado">{rotulo}</span>
      <span className="ml-auto min-w-0 truncate text-right font-medium">{children}</span>
    </div>
  );
}

// A pergunta antes de apagar ou sair: no tom da urgência, com Voltar e a ação, o mais forte à direita.
export function Confirmacao({ children, voltar, acao, rotulo, ocupado, rotuloOcupado }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-dentro bg-amg-destaque-suave px-4 py-3 text-destaque-texto">
      <span className="min-w-[240px] flex-1">{children}</span>
      <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
        <Botao type="button" onClick={voltar}>Voltar</Botao>
        <Botao principal type="button" disabled={ocupado} onClick={acao}>{ocupado ? rotuloOcupado : rotulo}</Botao>
      </div>
    </div>
  );
}

// O link em cápsula com o Copiar dentro; riscado quando pausado.
export function LinkCopiavel({ link, curto, pausado }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex h-amg-altura-campo min-w-0 items-center gap-2 rounded-toque bg-superficie pl-4 pr-1.5 ring-1 ring-inset ring-linha">
      <span className={`min-w-0 flex-1 truncate ${pausado ? 'text-texto-apagado line-through' : ''}`}>{curto}</span>
      <Botao pequeno nivel={2} type="button" onClick={async () => setCopiado(await copiarTexto(link))} aria-live="polite">
        <Icone nome={copiado ? 'ok' : 'copiar'} tamanho={14} />
        {copiado ? 'Copiado' : 'Copiar'}
      </Botao>
    </div>
  );
}

// A escolha entre poucas opções (o segmentado), com a contagem depois do nome.
export function Escolha({ rotulo, opcoes, valor, aoMudar }) {
  return (
    <div role="tablist" aria-label={rotulo} className="sem-barra inline-flex max-w-full overflow-x-auto rounded-toque bg-superficie-2 p-[3px]">
      {opcoes.map(([id, nome, n]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={valor === id}
          onClick={() => aoMudar(id)}
          className={`min-h-amg-toque-minimo shrink-0 whitespace-nowrap rounded-toque px-[15px] sm:min-h-botao-pequeno ${
            valor === id ? 'bg-amg-superficie-escolhida font-semibold text-texto shadow-cartao' : 'font-medium text-texto-apagado hover:text-texto'}`}
        >
          {nome}
          {n !== undefined && <span className="ml-1.5 tabular-nums">{n}</span>}
        </button>
      ))}
    </div>
  );
}

// O cartão com a caixa vazia: a frase apagada dentro de um cartão.
export function Vazio({ children }) {
  return <div className="rounded-cartao bg-superficie p-4 text-texto-apagado shadow-cartao sm:p-5">{children}</div>;
}
