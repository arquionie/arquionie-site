// Peças repetidas das abas do /gestao que vieram do Palheta Flow (mockup aprovado pelo ÊDI em 15/10/2026): o cabeçalho
// com o título e os botões, os números do alto, o painel com título de seção e o selo de situação.
import { AMOSTRA } from '@/lib/gestao';

export function Cabecalho({ titulo, children }) {
  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <div className="mr-auto">
        <p className="titulo-secao mb-1">Painel do gestor{AMOSTRA ? ' · dados de exemplo' : ''}</p>
        <h1 className="text-[28px] font-semibold text-white">{titulo}</h1>
      </div>
      {children}
    </div>
  );
}

export function Numeros({ children, colunas = 4 }) {
  return <div className={`grid gap-px bg-[#262D37] sm:grid-cols-2 ${colunas === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>{children}</div>;
}

export function Numero({ rotulo, valor, detalhe }) {
  return (
    <div className="bg-aqi-barra p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-aqi-muted">{rotulo}</div>
      <div className="mt-1 text-[30px] font-bold leading-tight text-white">{valor ?? 0}</div>
      {detalhe && <div className="text-[12px] text-aqi-muted">{detalhe}</div>}
    </div>
  );
}

export function Painel({ titulo, direita, children, className = '' }) {
  return (
    <section className={`bg-aqi-barra p-5 ${className}`}>
      {(titulo || direita) && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {titulo && <h2 className="mr-auto text-[13px] font-semibold uppercase tracking-[0.12em] text-aqi-coral">{titulo}</h2>}
          {direita}
        </div>
      )}
      {children}
    </section>
  );
}

// Selo de situação: coral para o que pede atenção, apagado para o que é só informação.
export function Selo({ children, tom }) {
  const cor = tom === 'atencao' ? 'border-aqi-coral text-aqi-coral' : tom === 'apagado' ? 'border-aqi-borda text-aqi-muted' : 'border-aqi-borda text-white';
  return <span className={`whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${cor}`}>{children}</span>;
}

// Ação em link dentro das listas (REVOGAR, +7 DIAS, EDITAR).
export function Acao({ children, ...resto }) {
  return (
    <button type="button" className="link whitespace-nowrap text-[12px] font-semibold" {...resto}>
      {children}
    </button>
  );
}
