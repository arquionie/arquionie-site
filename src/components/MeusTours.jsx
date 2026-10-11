import { useEffect, useState } from 'react';
import { Botao, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { AMOSTRA, copiarTexto, dataCurta } from '@/lib/licencas';
import { AMOSTRA_MEUS_TOURS, capaDoTour, linkCurto, linkDoTour, quandoLegivel, tamanhoLegivel } from '@/lib/tours';

// MINHA CONTA › TOURS (mockup docs/mockups/tour-no-link.html do repositório do programa, aprovado por ÊDI em 10/10/2026): os tours
// que a pessoa publicou pelo programa, com as visitas, o link com o COPIAR, ABRIR, PAUSAR / REATIVAR e EXCLUIR (com confirmação).
// Os dados vêm de meus_tours; pausar é tour_pausar; excluir passa pela função tours, que apaga os arquivos do R2.
// soComTours (MINHA CONTA › APRESENTAÇÕES, desde 11/10/2026): só os tours publicados antes do ENVIAR PARA O CLIENTE, até vencerem;
// sem nenhum, nada aparece.
export default function MeusTours({ soComTours = false }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState('');
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

  async function copiar(t) {
    setCopiado((await copiarTexto(linkDoTour(t.codigo))) ? t.id : '');
  }

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

  if (dados === null) return soComTours ? null : <p className="text-aqi-muted">Carregando…</p>;
  if (soComTours && dados.tours.length === 0) return null;
  const total = dados.tours.reduce((s, t) => s + (t.tamanho || 0), 0);
  return (
    <>
      {soComTours ? (
        <>
          <h3 className="mb-1 mt-6 text-[15px] font-semibold text-white">Tours publicados antes</h3>
          <p className="mb-3 text-[14px] text-aqi-muted">
            Os tours do passeio publicados antes do ENVIAR PARA O CLIENTE. Continuam no ar até vencer; os novos vão dentro da apresentação.
          </p>
        </>
      ) : (
        <p className="mb-3 text-[14px] text-aqi-muted">
          Os tours que você publicou pelo programa. O link abre no navegador do celular ou do computador, sem conta e sem instalar nada. Para
          publicar um tour novo ou atualizar um destes, use o GERAR TOUR PARA O CLIENTE no painel do passeio.
        </p>
      )}
      {dados.tours.length === 0 ? (
        <p className="bg-aqi-barra px-4 py-3 text-[14px] text-aqi-muted">
          Nenhum tour publicado ainda. Ele aparece aqui quando você gerar o primeiro no programa.
        </p>
      ) : (
        <>
          <p className="mb-1.5 text-[11px] font-semibold tracking-[0.1em] text-aqi-coral">
            {dados.tours.length} {dados.tours.length === 1 ? 'TOUR' : 'TOURS'} · {tamanhoLegivel(total)} · ATÉ {dados.limite} TOURS POR CONTA
          </p>
          {dados.tours.map((t) => {
            const pausado = t.situacao === 'pausado';
            const ultima = quandoLegivel(t.ultimaVisita);
            return (
              <div key={t.id} className="grid gap-3 border-b border-[#262D37] py-3 sm:grid-cols-[136px_minmax(0,1fr)_300px] sm:items-center sm:gap-4">
                {capaDoTour(t.capa) ? (
                  <img src={capaDoTour(t.capa)} alt="" className={`aspect-video w-full object-cover sm:w-[136px] ${pausado ? 'brightness-[.6] grayscale' : ''}`} />
                ) : (
                  <div className="aspect-video w-full bg-aqi-barra sm:w-[136px]" />
                )}
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-white">
                    {t.nome}
                    {pausado && <span className="ml-2 border border-aqi-borda px-1.5 align-[2px] text-[10.5px] font-bold tracking-wide text-aqi-muted">PAUSADO</span>}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-aqi-muted">
                    {[t.passeio, `${t.paradas} paradas`, tamanhoLegivel(t.tamanho), `publicado em ${dataCurta(t.publicadoEm)}`].filter(Boolean).join(' · ')}
                    {t.atualizadoEm && t.publicadoEm && t.atualizadoEm.slice(0, 16) !== t.publicadoEm.slice(0, 16) ? `, atualizado ${quandoLegivel(t.atualizadoEm)}` : ''}
                  </div>
                  <div className="mt-1 text-[12.5px]">
                    <b className="text-white">{t.visitas}</b> {t.visitas === 1 ? 'visita' : 'visitas'}
                    {ultima ? ` · a última ${ultima}` : ''}
                  </div>
                </div>
                <div>
                  <div className="flex">
                    <span className={`min-w-0 flex-1 truncate border border-[#262D37] bg-aqi-barra px-2.5 py-[7px] text-[13px] ${pausado ? 'text-aqi-muted line-through' : 'text-white'}`}>
                      {linkCurto(t.codigo)}
                    </span>
                    <button type="button" onClick={() => copiar(t)}
                      className={`px-3 text-[11.5px] font-bold tracking-[0.06em] text-white ${copiado === t.id ? 'bg-[#3d6b4f]' : 'bg-aqi-campo hover:bg-aqi-campohover'}`}>
                      {copiado === t.id ? '✓ COPIADO' : 'COPIAR'}
                    </button>
                  </div>
                  <div className="mt-2 flex justify-end gap-3.5 text-[11.5px] font-semibold tracking-[0.06em]">
                    <a href={linkDoTour(t.codigo)} target="_blank" rel="noreferrer" className="link">ABRIR</a>
                    <button type="button" onClick={() => pausar(t, !pausado)} className="link">{pausado ? 'REATIVAR' : 'PAUSAR'}</button>
                    <button type="button" onClick={() => setExcluindo(t.id)} className="text-[#E8877B] underline underline-offset-[3px]">EXCLUIR</button>
                  </div>
                </div>
                {excluindo === t.id && (
                  <div className="flex flex-wrap items-center gap-3 bg-aqi-barra px-3.5 py-2.5 text-[13.5px] sm:col-span-3">
                    <span className="min-w-[240px] flex-1">
                      Excluir o tour <b className="text-white">{t.passeio || t.nome}</b>? O link deixa de funcionar e os arquivos saem do servidor. Não dá
                      para desfazer.
                    </span>
                    <Botao principal type="button" disabled={ocupado} onClick={() => excluir(t)}>{ocupado ? 'EXCLUINDO…' : 'EXCLUIR'}</Botao>
                    <Botao type="button" onClick={() => setExcluindo(null)}>VOLTAR</Botao>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
      <div className="mt-2">
        <Mensagem erro>{erro}</Mensagem>
      </div>
    </>
  );
}
