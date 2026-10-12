import { useEffect, useState } from 'react';
import { Botao, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { AMOSTRA, copiarTexto, dataCurta } from '@/lib/licencas';
import { linkCurto, linkDoTour, quandoLegivel, tamanhoLegivel } from '@/lib/tours';
import {
  AMOSTRA_APRESENTACOES, abaDaApresentacao, ajustesAFazer, capaDaApresentacao, etiquetaDaApresentacao, lugarDoComentario,
} from '@/lib/equipe';

// MINHA CONTA › APRESENTAÇÕES (mockup docs/mockups/equipe-e-apresentacoes do repositório do programa, aprovado por ÊDI em
// 11/10/2026): as páginas enviadas aos clientes pelo ENVIAR PARA O CLIENTE, um cartão por projeto, da área escolhida (a conta de
// quem entrou, ou o escritório em que ela está na equipe). Cada cartão com o envio mais novo, a etiqueta, as visitas, o prazo, o
// link (COPIAR, ABRIR), PAUSAR e EXCLUIR (só o responsável); VER OS AJUSTES abre o que o cliente pediu, com o feito de cada um (o
// feito se marca no programa). Os dados vêm de minhas_apresentacoes(p_area).

const COR_DA_ETIQUETA = { ajustes: 'bg-aqi-botao', aprovado: 'bg-[#3F8F63]', espera: 'bg-[#5D6B80]' };

function Etiqueta({ etiqueta }) {
  return (
    <span className={`ml-2 inline-block px-1.5 py-[1px] align-[2px] text-[10.5px] font-bold tracking-wide text-white ${COR_DA_ETIQUETA[etiqueta.tipo]}`}>
      {etiqueta.texto}
    </span>
  );
}

function Pino({ numero, feito }) {
  return (
    <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 border-white text-[10.5px] font-bold text-white ${feito ? 'bg-[#3F8F63]' : 'bg-aqi-coral'}`}>
      {feito ? '✓' : numero}
    </span>
  );
}

// Os comentários de um pedido: o número do alfinete, o lugar, o texto e, à direita, a fazer ou o feito com quem marcou.
function Pedido({ pedido, numero }) {
  const faltam = pedido.comentarios.filter((c) => !c.feito).length;
  return (
    <div className="grid gap-1.5">
      <p className="text-[12px] font-bold text-aqi-coral">
        {pedido.nome} · {quandoLegivel(pedido.em)}{' '}
        <span className="font-normal text-aqi-muted">
          · {pedido.comentarios.length === 1 ? '1 comentário' : `${pedido.comentarios.length} comentários`} no envio {numero}
          {faltam ? ` · ${faltam} a fazer` : pedido.comentarios.length > 1 ? ' · todos feitos' : ' · feito'}
        </span>
      </p>
      {pedido.comentarios.map((c, i) => (
        <div key={i} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-0.5 bg-aqi-painel px-2.5 py-2">
          <span className="row-span-2 mt-0.5"><Pino numero={i + 1} feito={!!c.feito} /></span>
          <span className="text-[10px] font-bold tracking-[0.05em] text-aqi-muted">{lugarDoComentario(c)}</span>
          <span className={`row-span-2 whitespace-nowrap text-right text-[11px] ${c.feito ? 'text-[#BFE3C4]' : 'text-aqi-muted'}`}>
            {c.feito ? `feito por ${c.feito.por} · ${dataCurta(c.feito.em)}` : 'a fazer'}
          </span>
          <span className="text-[13.5px] text-white">{c.texto}</span>
        </div>
      ))}
    </div>
  );
}

function Ajustes({ apresentacao }) {
  const [abertos, setAbertos] = useState(() => new Set());
  const comPedidos = apresentacao.envios.filter((e) => e.pedidos?.length || e.aprovacao);
  return (
    <div className="grid gap-2.5 border-t border-[#262D37] bg-aqi-faixa px-3.5 py-3">
      {comPedidos.map((envio, i) => {
        const aberto = i === 0 || abertos.has(envio.id);
        if (!aberto) {
          const total = envio.pedidos.reduce((s, p) => s + p.comentarios.length, 0), faltam = ajustesAFazer(envio);
          return (
            <p key={envio.id} className="text-[12.5px] text-aqi-muted">
              ENVIO {envio.numero} · {dataCurta(envio.em)} · {total === 1 ? '1 comentário' : `${total} comentários`}
              {faltam ? `, ${faltam} a fazer` : total > 1 ? ', todos feitos' : ', feito'}
              <Botao pequeno nivel={3} type="button" className="ml-3" onClick={() => setAbertos((a) => new Set(a).add(envio.id))}>VER</Botao>
            </p>
          );
        }
        return (
          <div key={envio.id} className="grid gap-2">
            {comPedidos.length > 1 && <p className="text-[11px] font-semibold tracking-[0.1em] text-aqi-muted">ENVIO {envio.numero} · {dataCurta(envio.em)}</p>}
            {envio.aprovacao && (
              <div className="border-l-[3px] border-[#3F8F63] bg-aqi-painel px-2.5 py-2 text-[12.5px]">
                <b className="text-[#BFE3C4]">✓ APROVADO POR {envio.aprovacao.nome} · {quandoLegivel(envio.aprovacao.em)}</b>
                {envio.aprovacao.termo?.titulo && (
                  <div className="text-aqi-texto">
                    {envio.aprovacao.termo.titulo}: {envio.aprovacao.termo.itens?.length === 1 ? 'o item do termo marcado' : `os ${envio.aprovacao.termo.itens?.length ?? 0} itens do termo marcados`}.
                  </div>
                )}
              </div>
            )}
            {envio.pedidos.map((p) => <Pedido key={p.id} pedido={p} numero={envio.numero} />)}
          </div>
        );
      })}
      <p className="text-[12px] text-aqi-muted">O feito se marca no programa, no painel AJUSTES DO CLIENTE, e aparece aqui.</p>
    </div>
  );
}

function Cartao({ apresentacao, responsavel, aoMudar, aoErro }) {
  const [capa, setCapa] = useState(apresentacao.capa ?? null);
  const [ajustes, setAjustes] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let vivo = true;
    capaDaApresentacao(apresentacao).then((c) => vivo && setCapa(c));
    return () => { vivo = false; };
  }, [apresentacao]);
  const envio = apresentacao.envios[0];
  const etiqueta = etiquetaDaApresentacao(apresentacao);
  const temRespostas = apresentacao.envios.some((e) => e.pedidos?.length || e.aprovacao);
  const faltam = ajustesAFazer(envio);
  const ultima = quandoLegivel(apresentacao.ultimaVisita);

  async function pausar(pausar) {
    aoErro('');
    if (AMOSTRA) return aoMudar((d) => ({ ...d, apresentacoes: d.apresentacoes.map((x) => (x.id === apresentacao.id ? { ...x, pausada: pausar } : x)) }));
    const { data, error } = await supabase.rpc('apresentacao_pausar', { p_id: apresentacao.id, p_pausar: pausar });
    if (error) return aoErro(mensagemDeErro(error));
    if (!data.ok) return aoErro(data.motivo);
    aoMudar();
  }
  async function excluir() {
    aoErro('');
    setOcupado(true);
    if (AMOSTRA) aoMudar((d) => ({ ...d, apresentacoes: d.apresentacoes.filter((x) => x.id !== apresentacao.id) }));
    else {
      const { data, error } = await supabase.functions.invoke('apresentacoes', { body: { acao: 'excluir', id: apresentacao.id } });
      if (error || !data?.ok) { setOcupado(false); return aoErro(error ? 'Não deu para excluir agora. Tente de novo em instantes.' : data.motivo); }
      aoMudar();
    }
    setOcupado(false);
    setExcluindo(false);
  }

  // O cartão (mockup minha-conta-em-paginas, aprovado por ÊDI em 12/10/2026): em cima a capa, o nome, o envio e o link; embaixo, a
  // faixa com as visitas e o prazo e, no fim dela, os botões pela hierarquia (o mais forte à direita; a terracota só onde há ajuste a fazer).
  return (
    <div className="mt-2.5 bg-aqi-barra">
      <div className="grid gap-3 px-3.5 py-3 sm:grid-cols-[136px_minmax(0,1fr)_300px] sm:items-center sm:gap-4">
        {capa ? (
          <img src={capa} alt="" className={`aspect-video w-full object-cover sm:w-[136px] ${apresentacao.pausada ? 'brightness-[.6] grayscale' : ''}`} />
        ) : (
          <div className="grid aspect-video w-full place-items-center bg-aqi-faixa text-[11px] text-aqi-muted sm:w-[136px]">sem capa</div>
        )}
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-white">
            {apresentacao.nome}
            <Etiqueta etiqueta={etiqueta} />
          </div>
          {envio && (
            <div className="mt-0.5 text-[12.5px] text-aqi-muted">
              {[`ENVIO ${envio.numero} · ${dataCurta(envio.em)}`, envio.paraQuem, envio.fase === 'final' ? 'entrega final' : 'estudo',
                envio.enviadoPor ? `enviado por ${envio.enviadoPor}` : ''].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <div className="flex">
          <span className={`min-w-0 flex-1 truncate border border-[#262D37] bg-aqi-pagina px-2.5 py-[7px] text-[13px] ${apresentacao.pausada ? 'text-aqi-muted line-through' : 'text-white'}`}>
            {linkCurto(apresentacao.codigo)}
          </span>
          <button type="button" onClick={async () => setCopiado(await copiarTexto(linkDoTour(apresentacao.codigo)))}
            className={`px-3 text-[11.5px] font-bold tracking-[0.06em] text-white ${copiado ? 'bg-[#3d6b4f]' : 'bg-aqi-campo hover:bg-aqi-campohover'}`}>
            {copiado ? '✓ COPIADO' : 'COPIAR'}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[#262D37] bg-aqi-faixa px-3.5 py-2 text-[12.5px] text-aqi-muted">
        <span className="mr-auto">
          <b className="text-white">{apresentacao.visitas}</b> {apresentacao.visitas === 1 ? 'visita' : 'visitas'}
          {ultima ? ` · a última ${ultima}` : ''}
          {envio && <> · no ar até <b className="text-white">{dataCurta(envio.expiraEm)}</b></>}
        </span>
        <div className="flex flex-wrap gap-2">
          {responsavel && <Botao pequeno nivel={3} type="button" onClick={() => setExcluindo(true)}>EXCLUIR</Botao>}
          <Botao pequeno nivel={apresentacao.pausada ? 2 : 3} type="button" onClick={() => pausar(!apresentacao.pausada)}>
            {apresentacao.pausada ? 'REATIVAR' : 'PAUSAR'}
          </Botao>
          <Botao pequeno nivel={2} href={linkDoTour(apresentacao.codigo)} target="_blank" rel="noreferrer">ABRIR</Botao>
          {temRespostas && (
            <Botao pequeno nivel={ajustes ? 3 : faltam > 0 ? 1 : 2} type="button" aria-expanded={ajustes} onClick={() => setAjustes(!ajustes)}>
              {ajustes ? 'FECHAR' : envio?.aprovacao && !envio.pedidos?.length ? 'VER A APROVAÇÃO' : 'VER OS AJUSTES'}
            </Botao>
          )}
        </div>
      </div>
      {ajustes && <Ajustes apresentacao={apresentacao} />}
      {excluindo && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[#262D37] px-3.5 py-2.5 text-[13.5px]">
          <span className="min-w-[240px] flex-1">
            Excluir a apresentação de <b className="text-white">{apresentacao.nome}</b>? O link deixa de funcionar e os arquivos saem do servidor. Não dá
            para desfazer.
          </span>
          <Botao nivel={3} type="button" onClick={() => setExcluindo(false)}>VOLTAR</Botao>
          <Botao principal type="button" disabled={ocupado} onClick={excluir}>{ocupado ? 'EXCLUINDO…' : 'EXCLUIR'}</Botao>
        </div>
      )}
    </div>
  );
}

// A contagem da aba numa plaquinha, sem parênteses (ÊDI, 12/10/2026).
export function Contagem({ n, ligada }) {
  return (
    <span className={`ml-1.5 inline-block min-w-[18px] px-1 text-center text-[10.5px] text-white ${ligada ? 'bg-aqi-campo' : 'bg-aqi-painel'}`}>{n}</span>
  );
}

const ABAS = [['todas', 'TODAS'], ['ajustes', 'COM AJUSTES'], ['aguardando', 'AGUARDANDO'], ['aprovadas', 'APROVADAS']];

export default function Apresentacoes({ area = null }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('todas');

  const carregar = async () => {
    if (AMOSTRA) return setDados(area ? { ...AMOSTRA_APRESENTACOES, responsavel: false } : AMOSTRA_APRESENTACOES);
    const { data, error } = await supabase.rpc('minhas_apresentacoes', area ? { p_area: area } : {});
    if (error) { setErro(mensagemDeErro(error)); return setDados({ limite: 500, apresentacoes: [] }); }
    setDados(data);
  };
  useEffect(() => {
    setDados(null);
    carregar();
  }, [area]);
  const mudar = (f) => (typeof f === 'function' ? setDados(f) : carregar());

  if (dados === null) return <p className="text-aqi-muted">Carregando…</p>;
  const lista = dados.apresentacoes;
  const contar = (a) => (a === 'todas' ? lista.length : lista.filter((x) => abaDaApresentacao(x) === a).length);
  const naAba = aba === 'todas' ? lista : lista.filter((x) => abaDaApresentacao(x) === aba);
  const faltam = lista.reduce((s, a) => s + ajustesAFazer(a.envios[0]), 0);
  const total = lista.reduce((s, a) => s + (a.envios[0]?.tamanho || 0), 0);
  return (
    <>
      <p className="mb-3 text-[14px] text-aqi-muted">
        As páginas enviadas aos clientes pelo ENVIAR PARA O CLIENTE, um cartão por projeto. O link é o mesmo a cada envio do projeto.
      </p>
      {lista.length === 0 ? (
        <p className="bg-aqi-barra px-4 py-3 text-[14px] text-aqi-muted">
          <b className="text-white">Nenhuma apresentação ainda.</b> No Arquionie, abra o projeto e use ENVIAR PARA O CLIENTE, no APRESENTAR. O link
          aparece aqui, com as visitas e os ajustes que o cliente pedir.
        </p>
      ) : (
        <>
          <p className="mb-1.5 text-[11px] font-semibold tracking-[0.1em] text-aqi-coral">
            {lista.length} {lista.length === 1 ? 'PROJETO' : 'PROJETOS'}
            {faltam ? ` · ${faltam} ${faltam === 1 ? 'AJUSTE A FAZER' : 'AJUSTES A FAZER'}` : ''}
            {total ? ` · ${tamanhoLegivel(total)}` : ''} · ATÉ {dados.limite} POR CONTA
          </p>
          <div role="tablist" aria-label="Apresentações" className="mb-1 flex flex-wrap gap-x-5 border-b border-aqi-borda text-[11.5px] font-semibold tracking-[0.06em]">
            {ABAS.map(([id, rotulo]) => (
              <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
                className={`-mb-px border-b-2 py-2 ${aba === id ? 'border-aqi-coral text-aqi-coral' : 'border-transparent text-aqi-texto hover:text-white'}`}>
                {rotulo}<Contagem n={contar(id)} ligada={aba === id} />
              </button>
            ))}
          </div>
          {naAba.length === 0 && <p className="py-3 text-[14px] text-aqi-muted">Nenhum projeto nesta aba.</p>}
          {naAba.map((a) => <Cartao key={a.id} apresentacao={a} responsavel={dados.responsavel !== false} aoMudar={mudar} aoErro={setErro} />)}
        </>
      )}
      <div className="mt-2">
        <Mensagem erro>{erro}</Mensagem>
      </div>
    </>
  );
}
