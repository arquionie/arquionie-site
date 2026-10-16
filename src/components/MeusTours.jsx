import { useEffect, useState } from 'react';
import { Botao, Etiqueta, Mensagem } from '@/components/Formulario';
import { CartaoDoProjeto } from '@/components/Apresentacoes';
import { Confirmacao, Vazio } from '@/components/Listas';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { AMOSTRA, dataCurta } from '@/lib/licencas';
import { AMOSTRA_MEUS_TOURS, capaDoTour, linkCurto, linkDoTour, quandoLegivel, tamanhoLegivel } from '@/lib/tours';

// MINHA CONTA › TOURS (mockup docs/mockups/tour-no-link.html do repositório do programa, aprovado por ÊDI em 10/10/2026): os tours
// que a pessoa publicou pelo programa, com as visitas, o link com o COPIAR, ABRIR, PAUSAR / REATIVAR e EXCLUIR (com confirmação).
// Os dados vêm de meus_tours; pausar é tour_pausar; excluir passa pela função tours, que apaga os arquivos do R2.
// soComTours (MINHA CONTA › APRESENTAÇÕES, desde 11/10/2026): só os tours publicados antes do ENVIAR PARA O CLIENTE, até vencerem;
// sem nenhum, nada aparece. No modo AMIGÁVEL desde o mockup site-amigavel (16/10/2026), no mesmo cartão das APRESENTAÇÕES.
export default function MeusTours({ soComTours = false }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [excluindo, setExcluindo] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = async () => {
    if (AMOSTRA) return setDados(AMOSTRA_MEUS_TOURS);
    const { data, error } = await supabase.rpc('meus_tours');
    // Antes da migração dos tours no banco, a seção fica vazia (sem erro na conta).
    setDados(error ? { limite: 20, tours: [] } : data);
  };
  useEffect(() => {
    carregar();
  }, []);

  async function pausar(t, pausar) {
    setErro('');
    if (AMOSTRA) return setDados((d) => ({ ...d, tours: d.tours.map((x) => (x.id === t.id ? { ...x, situacao: pausar ? 'pausado' : 'publicado' } : x)) }));
    const { data, error } = await supabase.rpc('tour_pausar', { p_id: t.id, p_pausar: pausar });
    if (error) return setErro(mensagemDeErro(error));
    if (!data.ok) return setErro(data.motivo);
    carregar();
  }

  async function excluir(t) {
    setErro('');
    setOcupado(true);
    if (AMOSTRA) {
      setDados((d) => ({ ...d, tours: d.tours.filter((x) => x.id !== t.id) }));
    } else {
      const { data, error } = await supabase.functions.invoke('tours', { body: { acao: 'excluir', id: t.id } });
      if (error || !data?.ok) {
        setOcupado(false);
        return setErro(error ? 'Não deu para excluir agora. Tente de novo em instantes.' : data.motivo);
      }
      await carregar();
    }
    setOcupado(false);
    setExcluindo(null);
  }

  if (dados === null) return soComTours ? null : <p className="text-texto-apagado">Carregando…</p>;
  if (soComTours && dados.tours.length === 0) return null;
  const total = dados.tours.reduce((s, t) => s + (t.tamanho || 0), 0);
  return (
    <div className={`flex flex-col gap-3 ${soComTours ? 'mt-8' : ''}`}>
      {soComTours ? (
        <div>
          <h2 className="text-amg-secao">Tours publicados antes</h2>
          <p className="mt-1 text-texto-apagado">
            Os tours do passeio publicados antes do ENVIAR PARA O CLIENTE. Continuam no ar até vencer; os novos vão dentro da apresentação.
          </p>
        </div>
      ) : (
        <p className="text-texto-apagado">
          Os tours que você publicou pelo programa. O link abre no navegador do celular ou do computador, sem conta e sem instalar nada. Para
          publicar um tour novo ou atualizar um destes, use o GERAR TOUR PARA O CLIENTE no painel do passeio.
        </p>
      )}
      {dados.tours.length === 0 ? (
        <Vazio>Nenhum tour publicado ainda. Ele aparece aqui quando você gerar o primeiro no programa.</Vazio>
      ) : (
        <>
          <p className="text-amg-legenda text-texto-apagado">
            {dados.tours.length} {dados.tours.length === 1 ? 'tour' : 'tours'} · {tamanhoLegivel(total)} · até {dados.limite} tours por conta
          </p>
          {dados.tours.map((t) => {
            const pausado = t.situacao === 'pausado';
            const ultima = quandoLegivel(t.ultimaVisita);
            return (
              <CartaoDoProjeto
                key={t.id}
                capa={capaDoTour(t.capa)}
                pausado={pausado}
                titulo={t.nome}
                etiqueta={pausado && <Etiqueta>Pausado</Etiqueta>}
                sub={
                  [t.passeio, `${t.paradas} paradas`, tamanhoLegivel(t.tamanho), `publicado em ${dataCurta(t.publicadoEm)}`].filter(Boolean).join(' · ') +
                  (t.atualizadoEm && t.publicadoEm && t.atualizadoEm.slice(0, 16) !== t.publicadoEm.slice(0, 16) ? `, atualizado ${quandoLegivel(t.atualizadoEm)}` : '')
                }
                link={linkDoTour(t.codigo)}
                curto={linkCurto(t.codigo)}
                numeros={
                  <>
                    <b className="text-texto">{t.visitas}</b> {t.visitas === 1 ? 'visita' : 'visitas'}
                    {ultima ? ` · a última ${ultima}` : ''}
                  </>
                }
                botoes={
                  <>
                    <Botao pequeno type="button" onClick={() => setExcluindo(t.id)}>Excluir</Botao>
                    <Botao pequeno nivel={pausado ? 2 : 3} type="button" onClick={() => pausar(t, !pausado)}>{pausado ? 'Reativar' : 'Pausar'}</Botao>
                    <Botao pequeno nivel={2} href={linkDoTour(t.codigo)} target="_blank" rel="noreferrer">Abrir</Botao>
                  </>
                }
              >
                {excluindo === t.id && (
                  <div className="border-t border-linha p-3">
                    <Confirmacao voltar={() => setExcluindo(null)} acao={() => excluir(t)} rotulo="Excluir" rotuloOcupado="Excluindo…" ocupado={ocupado}>
                      Excluir o tour <b>{t.passeio || t.nome}</b>? O link deixa de funcionar e os arquivos saem do servidor. Não dá para desfazer.
                    </Confirmacao>
                  </div>
                )}
              </CartaoDoProjeto>
            );
          })}
        </>
      )}
      <Mensagem erro>{erro}</Mensagem>
    </div>
  );
}
