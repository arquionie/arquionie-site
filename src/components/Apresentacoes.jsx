import { useEffect, useState } from 'react';
import { Botao, Etiqueta, Icone, Mensagem } from '@/components/Formulario';
import { Confirmacao, Escolha, LinkCopiavel, Vazio, emFrase } from '@/components/Listas';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { AMOSTRA, dataCurta } from '@/lib/licencas';
import { linkCurto, linkDoTour, quandoLegivel, tamanhoLegivel } from '@/lib/tours';
import {
  AMOSTRA_APRESENTACOES, abaDaApresentacao, ajustesAFazer, capaDaApresentacao, etiquetaDaApresentacao, lugarDoComentario,
} from '@/lib/equipe';

// MINHA CONTA › APRESENTAÇÕES (mockup docs/mockups/equipe-e-apresentacoes do repositório do programa, aprovado por ÊDI em
// 11/10/2026): as páginas enviadas aos clientes pelo ENVIAR PARA O CLIENTE, um cartão por projeto, da área escolhida (a conta de
// quem entrou, ou o escritório em que ela está na equipe). Cada cartão com o envio mais novo, a etiqueta, as visitas, o prazo, o
// link (COPIAR, ABRIR), PAUSAR e EXCLUIR (só o responsável); VER OS AJUSTES abre o que o cliente pediu, com o feito de cada um (o
// feito se marca no programa). Os dados vêm de minhas_apresentacoes(p_area).
// No modo AMIGÁVEL desde o mockup site-amigavel (16/10/2026): cartões de 18 px, a escolha em cápsulas e as etiquetas em frase.

const TIPO_DA_ETIQUETA = { ajustes: 'urgente', aprovado: 'sucesso', espera: 'neutra' };

function Pino({ numero, feito }) {
  return (
    <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-toque text-amg-rotulo ${feito ? 'bg-amg-sucesso-suave text-sucesso' : 'bg-botao-1 text-botao-1-texto'}`}>
      {feito ? <Icone nome="ok" tamanho={12} /> : numero}
    </span>
  );
}

// Os comentários de um pedido: o número do alfinete, o lugar, o texto e, à direita, a fazer ou o feito com quem marcou.
function Pedido({ pedido, numero }) {
  const faltam = pedido.comentarios.filter((c) => !c.feito).length;
  return (
    <div className="grid gap-1.5">
      <p className="text-amg-legenda">
        <b className="font-semibold">{pedido.nome} · {quandoLegivel(pedido.em)}</b>{' '}
        <span className="text-texto-apagado">
          · {pedido.comentarios.length === 1 ? '1 comentário' : `${pedido.comentarios.length} comentários`} no envio {numero}
          {faltam ? ` · ${faltam} a fazer` : pedido.comentarios.length > 1 ? ' · todos feitos' : ' · feito'}
        </span>
      </p>
      {pedido.comentarios.map((c, i) => (
        <div key={i} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-0.5 rounded-dentro bg-superficie px-3 py-2.5">
          <span className="row-span-2 mt-0.5"><Pino numero={i + 1} feito={!!c.feito} /></span>
          <span className="rotulo">{lugarDoComentario(c)}</span>
          <span className={`row-span-2 whitespace-nowrap text-right text-amg-legenda ${c.feito ? 'text-sucesso' : 'text-texto-apagado'}`}>
            {c.feito ? `feito por ${c.feito.por} · ${dataCurta(c.feito.em)}` : 'a fazer'}
          </span>
          <span>{c.texto}</span>
        </div>
      ))}
    </div>
  );
}

function Ajustes({ apresentacao }) {
  const [abertos, setAbertos] = useState(() => new Set());
  const comPedidos = apresentacao.envios.filter((e) => e.pedidos?.length || e.aprovacao);
  return (
    <div className="grid gap-3 border-t border-linha bg-fundo px-4 py-3.5">
      {comPedidos.map((envio, i) => {
        const aberto = i === 0 || abertos.has(envio.id);
        if (!aberto) {
          const total = envio.pedidos.reduce((s, p) => s + p.comentarios.length, 0), faltam = ajustesAFazer(envio);
          return (
            <p key={envio.id} className="flex flex-wrap items-center gap-3 text-amg-legenda text-texto-apagado">
              <span>
                Envio {envio.numero} · {dataCurta(envio.em)} · {total === 1 ? '1 comentário' : `${total} comentários`}
                {faltam ? `, ${faltam} a fazer` : total > 1 ? ', todos feitos' : ', feito'}
              </span>
              <Botao pequeno type="button" onClick={() => setAbertos((a) => new Set(a).add(envio.id))}>Ver</Botao>
            </p>
          );
        }
        return (
          <div key={envio.id} className="grid gap-2">
            {comPedidos.length > 1 && <p className="rotulo">Envio {envio.numero} · {dataCurta(envio.em)}</p>}
            {envio.aprovacao && (
              <div className="flex items-start gap-2.5 rounded-dentro bg-amg-sucesso-suave px-3 py-2.5 text-sucesso">
                <Icone nome="ok" tamanho={16} className="mt-0.5" />
                <div>
                  <b className="font-semibold">Aprovado por {envio.aprovacao.nome} · {quandoLegivel(envio.aprovacao.em)}</b>
                  {envio.aprovacao.termo?.titulo && (
                    <div className="text-amg-legenda">
                      {envio.aprovacao.termo.titulo}: {envio.aprovacao.termo.itens?.length === 1 ? 'o item do termo marcado' : `os ${envio.aprovacao.termo.itens?.length ?? 0} itens do termo marcados`}.
                    </div>
                  )}
                </div>
              </div>
            )}
            {envio.pedidos.map((p) => <Pedido key={p.id} pedido={p} numero={envio.numero} />)}
          </div>
        );
      })}
      <p className="text-amg-legenda text-texto-apagado">O feito se marca no programa, no painel AJUSTES DO CLIENTE, e aparece aqui.</p>
    </div>
  );
}

// O cartão de um projeto: em cima a capa, o nome com a etiqueta, o envio e o link; embaixo, as visitas e o prazo e, no fim, os
// botões pela hierarquia (o mais forte à direita; a terracota só onde há ajuste a fazer). Também serve aos tours de antes (MeusTours).
export function CartaoDoProjeto({ capa, pausado, titulo, etiqueta, sub, link, curto, numeros, botoes, children }) {
  return (
    <div className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">
      <div className="grid gap-3 p-4 sm:grid-cols-[136px_minmax(0,1fr)] sm:items-center sm:gap-4 xl:grid-cols-[136px_minmax(0,1fr)_300px]">
        {capa ? (
          <img src={capa} alt="" className={`aspect-video w-full rounded-dentro object-cover sm:w-[136px] ${pausado ? 'brightness-[.6] grayscale' : ''}`} />
        ) : (
          <div className="grid aspect-video w-full place-items-center rounded-dentro bg-superficie-2 text-amg-legenda text-texto-apagado sm:w-[136px]">sem capa</div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <b className="text-amg-secao">{titulo}</b>
            {etiqueta}
          </div>
          {sub && <div className="mt-0.5 text-amg-legenda text-texto-apagado">{sub}</div>}
        </div>
        <div className="sm:col-span-2 xl:col-span-1">
          <LinkCopiavel link={link} curto={curto} pausado={pausado} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-linha px-4 py-2.5 text-amg-legenda text-texto-apagado">
        <span className="mr-auto">{numeros}</span>
        <div className="flex flex-wrap gap-2">{botoes}</div>
      </div>
      {children}
    </div>
  );
}

function Cartao({ apresentacao, responsavel, aoMudar, aoErro }) {
  const [capa, setCapa] = useState(apresentacao.capa ?? null);
  const [ajustes, setAjustes] = useState(false);
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

  return (
    <CartaoDoProjeto
      capa={capa}
      pausado={apresentacao.pausada}
      titulo={apresentacao.nome}
      etiqueta={<Etiqueta tipo={TIPO_DA_ETIQUETA[etiqueta.tipo]}>{emFrase(etiqueta.texto)}</Etiqueta>}
      sub={envio && [`Envio ${envio.numero} · ${dataCurta(envio.em)}`, envio.paraQuem, envio.fase === 'final' ? 'entrega final' : 'estudo',
        envio.enviadoPor ? `enviado por ${envio.enviadoPor}` : ''].filter(Boolean).join(' · ')}
      link={linkDoTour(apresentacao.codigo)}
      curto={linkCurto(apresentacao.codigo)}
      numeros={
        <>
          <b className="text-texto">{apresentacao.visitas}</b> {apresentacao.visitas === 1 ? 'visita' : 'visitas'}
          {ultima ? ` · a última ${ultima}` : ''}
          {envio && <> · no ar até <b className="text-texto">{dataCurta(envio.expiraEm)}</b></>}
        </>
      }
      botoes={
        <>
          {responsavel && <Botao pequeno type="button" onClick={() => setExcluindo(true)}>Excluir</Botao>}
          <Botao pequeno nivel={apresentacao.pausada ? 2 : 3} type="button" onClick={() => pausar(!apresentacao.pausada)}>
            {apresentacao.pausada ? 'Reativar' : 'Pausar'}
          </Botao>
          <Botao pequeno nivel={2} href={linkDoTour(apresentacao.codigo)} target="_blank" rel="noreferrer">Abrir</Botao>
          {temRespostas && (
            <Botao pequeno nivel={ajustes ? 3 : faltam > 0 ? 1 : 2} type="button" aria-expanded={ajustes} onClick={() => setAjustes(!ajustes)}>
              {ajustes ? 'Fechar' : envio?.aprovacao && !envio.pedidos?.length ? 'Ver a aprovação' : 'Ver os ajustes'}
            </Botao>
          )}
        </>
      }
    >
      {ajustes && <Ajustes apresentacao={apresentacao} />}
      {excluindo && (
        <div className="border-t border-linha p-3">
          <Confirmacao voltar={() => setExcluindo(false)} acao={excluir} rotulo="Excluir" rotuloOcupado="Excluindo…" ocupado={ocupado}>
            Excluir a apresentação de <b>{apresentacao.nome}</b>? O link deixa de funcionar e os arquivos saem do servidor. Não dá para desfazer.
          </Confirmacao>
        </div>
      )}
    </CartaoDoProjeto>
  );
}

const ABAS = [['todas', 'Todas'], ['ajustes', 'Com ajustes'], ['aguardando', 'Aguardando'], ['aprovadas', 'Aprovadas']];

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

  if (dados === null) return <p className="text-texto-apagado">Carregando…</p>;
  const lista = dados.apresentacoes;
  const contar = (a) => (a === 'todas' ? lista.length : lista.filter((x) => abaDaApresentacao(x) === a).length);
  const naAba = aba === 'todas' ? lista : lista.filter((x) => abaDaApresentacao(x) === aba);
  const faltam = lista.reduce((s, a) => s + ajustesAFazer(a.envios[0]), 0);
  const total = lista.reduce((s, a) => s + (a.envios[0]?.tamanho || 0), 0);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-texto-apagado">
        As páginas enviadas aos clientes pelo ENVIAR PARA O CLIENTE, um cartão por projeto. O link é o mesmo a cada envio do projeto.
      </p>
      {lista.length === 0 ? (
        <Vazio>
          <b className="text-texto">Nenhuma apresentação ainda.</b> No Arquionie, abra o projeto e use ENVIAR PARA O CLIENTE, no APRESENTAR. O link
          aparece aqui, com as visitas e os ajustes que o cliente pedir.
        </Vazio>
      ) : (
        <>
          <p className="text-amg-legenda text-texto-apagado">
            {lista.length} {lista.length === 1 ? 'projeto' : 'projetos'}
            {faltam ? ` · ${faltam} ${faltam === 1 ? 'ajuste a fazer' : 'ajustes a fazer'}` : ''}
            {total ? ` · ${tamanhoLegivel(total)}` : ''} · até {dados.limite} por conta
          </p>
          <div>
            <Escolha rotulo="Apresentações" valor={aba} aoMudar={setAba} opcoes={ABAS.map(([id, nome]) => [id, nome, contar(id)])} />
          </div>
          {naAba.length === 0 && <p className="py-2 text-texto-apagado">Nenhum projeto nesta aba.</p>}
          {naAba.map((a) => <Cartao key={a.id} apresentacao={a} responsavel={dados.responsavel !== false} aoMudar={mudar} aoErro={setErro} />)}
        </>
      )}
      <Mensagem erro>{erro}</Mensagem>
    </div>
  );
}
