// Peças repetidas das abas do /gestao, no modo AMIGÁVEL (mockup gestao-amigavel, aprovado por ÊDI em 16/10/2026): o cabeçalho com o
// rótulo, o título grande e os botões; os números em cartões; o painel (cartão com título); o selo de situação (a etiqueta); a busca e
// as listas de filtro em cápsula; e a tabela dentro do cartão. Só tokens: nenhuma cor, raio ou altura escrita à mão.
import { Botao, Etiqueta, Icone } from '@/components/Formulario';
import { emFrase } from '@/components/Listas';
import { AMOSTRA } from '@/lib/gestao';
import { numeroLegivel } from '@/lib/downloads';

export function Cabecalho({ titulo, children }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="mr-auto">
        <p className="rotulo mb-1">Painel do gestor{AMOSTRA ? ' · dados de exemplo' : ''}</p>
        <h1 className="text-amg-titulo-grande">{titulo}</h1>
      </div>
      {children && <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:flex-wrap">{children}</div>}
    </div>
  );
}

export function Numeros({ children, colunas = 4 }) {
  return <div className={`grid grid-cols-2 gap-3 ${colunas === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>{children}</div>;
}

export function Numero({ rotulo, valor, detalhe }) {
  return (
    <div className="min-w-0 rounded-cartao bg-superficie px-4 py-3.5 shadow-cartao">
      <div className="text-amg-legenda text-texto-apagado">{rotulo}</div>
      <div className="mt-0.5 text-amg-titulo tabular-nums">{typeof valor === 'number' ? numeroLegivel(valor) : valor ?? 0}</div>
      {detalhe && <div className="text-amg-legenda text-texto-apagado">{detalhe}</div>}
    </div>
  );
}

// O cartão com título (Amg-secao) e, à direita, os botões ou a contagem.
export function Painel({ titulo, direita, children, className = '' }) {
  return (
    <section className={`rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5 ${className}`}>
      {(titulo || direita) && (
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          {titulo && <h2 className="mr-auto text-amg-secao">{titulo}</h2>}
          {direita}
        </div>
      )}
      {children}
    </section>
  );
}

// O selo de situação é a etiqueta: urgente para o que pede atenção, neutra para o que é só informação apagada, informação para o resto.
// O texto em caixa alta que vem do banco vira frase.
const TOM = { atencao: 'urgente', apagado: 'neutra', sucesso: 'sucesso', informacao: 'informacao' };

export function Selo({ children, tom }) {
  return <Etiqueta tipo={TOM[tom] ?? 'informacao'}>{typeof children === 'string' ? emFrase(children) : children}</Etiqueta>;
}

// A ação dentro das listas (Revogar, +7 dias, Editar): o botão pequeno nível 3.
export function Acao({ children, ...resto }) {
  return (
    <Botao pequeno type="button" {...resto}>
      {typeof children === 'string' ? emFrase(children) : children}
    </Botao>
  );
}

// A busca e as listas de filtro, em cápsula, na faixa de cima de uma lista.
const FILTRO = 'h-amg-toque-minimo rounded-toque bg-superficie text-texto ring-1 ring-inset ring-linha focus-within:ring-2 focus-within:ring-destaque sm:h-botao';

export function Busca({ valor, aoMudar, rotulo, className = '' }) {
  return (
    <input
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      placeholder={rotulo}
      aria-label={rotulo}
      className={`${FILTRO} min-w-0 px-4 text-[16px] placeholder:text-texto-apagado focus-visible:outline-none sm:text-amg-corpo ${className}`}
    />
  );
}

export function Selecao({ valor, aoMudar, opcoes, rotulo, className = '' }) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <select value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label={rotulo}
        className={`${FILTRO} w-full cursor-pointer appearance-none pl-4 pr-10 focus-visible:outline-none`}>
        {opcoes.map(([v, nome]) => (
          <option key={v} value={v}>{nome}</option>
        ))}
      </select>
      <Icone nome="abaixo" tamanho={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-texto-apagado" />
    </span>
  );
}

// A tabela dentro do cartão: a primeira linha com os nomes das colunas em texto apagado, as linhas com a divisória.
export const TH = 'whitespace-nowrap px-3 py-2.5 text-left text-amg-legenda font-medium text-texto-apagado';
export const TD = 'border-t border-linha px-3 py-2.5 align-top';
export const NUM = 'text-right tabular-nums whitespace-nowrap';

export function Tabela({ children, minimo = 0 }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={minimo ? { minWidth: minimo } : undefined}>
        {children}
      </table>
    </div>
  );
}
