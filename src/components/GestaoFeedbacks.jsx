// FEEDBACKS no /gestao (plano 18; mockup aprovado em 15/10/2026): o que chega pelo botão de feedback do plugin, com os do
// Flow importados. Novos primeiro; MARCAR COMO LIDO.
// No modo AMIGÁVEL desde o mockup gestao-amigavel (ÊDI, 16/10/2026).
import { useEffect, useMemo, useState } from 'react';
import { Etiqueta, Mensagem } from '@/components/Formulario';
import { emFrase, Escolha, Grupo, Linha, TextoDaLinha, Vazio } from '@/components/Listas';
import { Acao, Cabecalho, Numero, Numeros } from '@/components/GestaoPecas';
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

  if (!dados) return <p className="py-10 text-center text-texto-apagado">Carregando…</p>;
  return (
    <div className="flex flex-col gap-4">
      <Cabecalho titulo="Feedbacks" />
      <Mensagem erro>{erro}</Mensagem>
      <Numeros colunas={3}>
        <Numero rotulo="Novos" valor={dados.novos} detalhe="para ler" />
        <Numero rotulo="No total" valor={lista.length} detalhe={doFlow ? `${doFlow} ${doFlow === 1 ? 'veio' : 'vieram'} do Flow` : 'todos do Arquionie'} />
        <Numero rotulo="Nota média" valor={media} detalhe="de 0 a 10" />
      </Numeros>
      <div>
        <Escolha rotulo="Filtro" valor={filtro} aoMudar={setFiltro}
          opcoes={[['todos', 'Todos'], ['novos', 'Novos', dados.novos], ['lidos', 'Lidos']]} />
      </div>
      {mostrar.length === 0 ? (
        <Vazio>{filtro === 'novos' ? 'Nenhum feedback novo. Tudo lido.' : 'Nada aqui.'}</Vazio>
      ) : (
        <Grupo>
          {mostrar.map((f) => (
            <Linha key={f.id} className={`py-3 ${f.status === 'lido' ? 'opacity-80' : ''}`}>
              {/* no celular o texto ocupa a linha toda e a etiqueta e o botão descem para baixo dele */}
              <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                <TextoDaLinha
                  titulo={f.email || 'sem e-mail'}
                  sub={[emFrase(EDICOES[f.edicao] ?? f.edicao), f.versao, CATEGORIAS[f.categoria] ?? f.categoria, Number.isInteger(f.nota) ? `nota ${f.nota}` : null, quando(f.criadoEm)]
                    .filter(Boolean).join(' · ')}
                />
              </div>
              <span className="flex flex-wrap items-center gap-1.5">
                <Etiqueta tipo={f.status === 'novo' ? 'urgente' : 'neutra'}>{f.status === 'novo' ? 'Novo' : 'Lido'}</Etiqueta>
                {f.origem === 'flow' && <Etiqueta tipo="neutra">Veio do Flow</Etiqueta>}
              </span>
              {f.status === 'novo'
                ? <Acao className="ml-auto sm:ml-0" onClick={() => marcar(f, 'lido')}>Marcar como lido</Acao>
                : <Acao className="ml-auto sm:ml-0" onClick={() => marcar(f, 'novo')}>Marcar como novo</Acao>}
              <p className="basis-full whitespace-pre-line break-words leading-relaxed">{f.mensagem}</p>
            </Linha>
          ))}
        </Grupo>
      )}
    </div>
  );
}
