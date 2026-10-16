// FEEDBACKS no /gestao (plano 18; mockup aprovado em 15/10/2026): o que chega pelo botão de feedback do plugin, com os do
// Flow importados. Novos primeiro; MARCAR COMO LIDO.
import { useEffect, useMemo, useState } from 'react';
import { Botao, Mensagem } from '@/components/FormularioTecnico';
import { Cabecalho, Numero, Numeros, Selo } from '@/components/GestaoPecas';
import { CATEGORIAS, EDICOES, lerFeedbacks, marcarFeedback, quando } from '@/lib/gestaoFlow';

export function useFeedbacksNovos() {
  const [novos, setNovos] = useState(0);
  useEffect(() => { lerFeedbacks().then((r) => setNovos(r?.novos ?? 0)); }, []);
  return [novos, setNovos];
}

export default function GestaoFeedbacks({ aoMudarNovos }) {
  const [dados, setDados] = useState(null);
  const [filtro, setFiltro] = useState('novos');
  const [erro, setErro] = useState('');

  async function carregar() {
    const r = await lerFeedbacks();
    setDados(r);
    setErro(r?.erro ?? '');
    aoMudarNovos?.(r?.novos ?? 0);
  }
  useEffect(() => { carregar(); }, []);

  const lista = dados?.feedbacks ?? [];
  const notas = lista.filter((f) => Number.isInteger(f.nota));
  const media = notas.length ? (notas.reduce((s, f) => s + f.nota, 0) / notas.length).toFixed(1).replace('.', ',') : '—';
  const doFlow = lista.filter((f) => f.origem === 'flow').length;
  const mostrar = useMemo(() => lista.filter((f) => filtro === 'todos' || (filtro === 'novos' ? f.status === 'novo' : f.status === 'lido')), [lista, filtro]);

  async function marcar(f, status) {
    const r = await marcarFeedback(f.id, status);
    if (r?.ok === false) { setErro(r.motivo); return; }
    const feedbacks = dados.feedbacks.map((x) => (x.id === f.id ? { ...x, status } : x));
    const novos = feedbacks.filter((x) => x.status === 'novo').length;
    setDados({ ...dados, feedbacks, novos });
    aoMudarNovos?.(novos);
  }

  if (!dados) return <p className="py-10 text-center text-aqi-muted">Carregando…</p>;
  return (
    <div className="space-y-4">
      <Cabecalho titulo="Feedbacks" />
      <Mensagem erro>{erro}</Mensagem>
      <Numeros colunas={3}>
        <Numero rotulo="Novos" valor={dados.novos} detalhe="para ler" />
        <Numero rotulo="No total" valor={lista.length} detalhe={doFlow ? `${doFlow} ${doFlow === 1 ? 'veio' : 'vieram'} do Flow` : 'todos do Arquionie'} />
        <Numero rotulo="Nota média" valor={media} detalhe="de 0 a 10" />
      </Numeros>
      <div role="tablist" aria-label="Filtro" className="flex gap-5 text-[12px] font-semibold tracking-[0.08em]">
        {[['todos', 'TODOS'], ['novos', `NOVOS (${dados.novos})`], ['lidos', 'LIDOS']].map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={filtro === id} onClick={() => setFiltro(id)}
            className={filtro === id ? 'text-white' : 'text-aqi-coral hover:text-white'}>
            {rotulo}
          </button>
        ))}
      </div>
      {mostrar.length === 0 ? (
        <p className="bg-aqi-barra p-5 text-[14px] text-aqi-muted">{filtro === 'novos' ? 'Nenhum feedback novo. Tudo lido.' : 'Nada aqui.'}</p>
      ) : (
        mostrar.map((f) => (
          <article key={f.id} className={`bg-aqi-barra p-5 ${f.status === 'lido' ? 'opacity-80' : ''}`}>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <Selo tom={f.status === 'novo' ? 'atencao' : undefined}>{f.status === 'novo' ? 'NOVO' : 'LIDO'}</Selo>
              {f.origem === 'flow' && <Selo tom="apagado">VEIO DO FLOW</Selo>}
              <span className="text-white">{f.email || 'sem e-mail'}</span>
              <span className="mr-auto text-aqi-muted">
                {[EDICOES[f.edicao] ?? f.edicao, f.versao, CATEGORIAS[f.categoria] ?? f.categoria, Number.isInteger(f.nota) ? `nota ${f.nota}` : null, quando(f.criadoEm)]
                  .filter(Boolean).join(' · ')}
              </span>
              {f.status === 'novo'
                ? <Botao nivel={3} pequeno type="button" onClick={() => marcar(f, 'lido')}>MARCAR COMO LIDO</Botao>
                : <Botao nivel={3} pequeno type="button" onClick={() => marcar(f, 'novo')}>MARCAR COMO NOVO</Botao>}
            </div>
            <p className="mt-2.5 whitespace-pre-line text-[14px] leading-relaxed text-aqi-texto">{f.mensagem}</p>
          </article>
        ))
      )}
    </div>
  );
}
