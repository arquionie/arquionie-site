import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Botao, Icone } from '@/components/Formulario';
import {
  AULAS, CANAL_DAS_AULAS, ETAPAS, GRATIS, MANIFESTO_PLUGIN_URL, NOME_ANTIGO_ATE, NUMEROS, PERGUNTAS_REVIT, PORTAL_ANTIGO, PRECOS_PADRAO,
  PRO, REQUISITOS, WHATSAPP_VENDAS, instaladorDoPlugin,
} from '@/conteudo/paraRevit';

// O Arquionie™ para Revit, o antigo Palheta Flow (mockup aprovado por ÊDI em 17/10/2026; plano 17, item 8, do repositório do plugin).
// As âncoras são as da landing antiga (#historia, #functions-guide, #gratis-vs-pro, #planos, #tutoriais, #download), porque e-mails já
// enviados e os redirecionamentos do palhetaflow.com.br apontam para elas. As ferramentas de todas as etapas saem no HTML (as que não
// estão na aba ficam escondidas), para o Google e as IAs lerem a lista inteira.
const SECAO = 'mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14 scroll-mt-4';
const CARTAO = 'flex flex-col gap-1.5 rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5';

const real = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
const comprar = (texto) => `https://wa.me/${WHATSAPP_VENDAS}?text=${encodeURIComponent(texto)}`;

function Titulo({ rotulo, titulo }) {
  return (
    <div className="mb-5 max-w-[760px]">
      <p className="rotulo mb-1.5">{rotulo}</p>
      <h2 className="text-amg-titulo">{titulo}</h2>
    </div>
  );
}

function Balao() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l1.4-4A8 8 0 1 1 8.3 19z" />
    </svg>
  );
}

function Lista({ itens }) {
  return (
    <ul className="my-1.5 space-y-1.5">
      {itens.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden="true" className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-toque bg-destaque" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function usePrecos() {
  const [precos, setPrecos] = useState(PRECOS_PADRAO);
  useEffect(() => {
    supabase.rpc('precos_vigentes').then(({ data }) => {
      const plugin = data?.planos?.plugin;
      if (plugin?.mensal && plugin?.anual) setPrecos({ mensal: plugin.mensal, anual: plugin.anual, desconto: plugin.desconto });
    });
  }, []);
  return precos;
}

// O instalador da versão mais nova, lido do manifesto do plugin; sem ele, o botão leva aos requisitos.
function useInstalador() {
  const [instalador, setInstalador] = useState(null);
  useEffect(() => {
    fetch(MANIFESTO_PLUGIN_URL, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => m?.version && setInstalador({ url: instaladorDoPlugin(m.version), versao: m.version }))
      .catch(() => {});
  }, []);
  return instalador;
}

function BotaoBaixar({ instalador, nivel }) {
  return (
    <Botao href={instalador?.url ?? '#download'} principal={!nivel} nivel={nivel} grande>
      <Icone nome="baixar" tamanho={18} />
      Baixar para Revit
    </Botao>
  );
}

export default function ParaRevit() {
  const precos = usePrecos();
  const instalador = useInstalador();
  const [etapa, setEtapa] = useState('Modelar');
  const nomeAntigo = new Date().toISOString().slice(0, 10) < NOME_ANTIGO_ATE;

  return (
    <>
      {/* a capa */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-8 px-4 pb-6 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-11">
        <div>
          {nomeAntigo && <p className="rotulo mb-2">O antigo Palheta Flow</p>}
          <h1 className="text-amg-titulo-grande sm:text-amg-titulo-capa">Arquionie™ para Revit</h1>
          <p className="mb-6 mt-3.5 max-w-[540px] text-amg-frase text-texto-apagado">
            O plugin que tira o trabalho repetido do Revit: pisos, portas, cotas, imagens e pranchas em poucos cliques. Feito por um
            escritório de arquitetura brasileiro.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Botao href="#planos" nivel={2} grande>
              Comprar o PRO
            </Botao>
            <BotaoBaixar instalador={instalador} />
          </div>
          <p className="mt-2.5 text-amg-legenda text-texto-apagado">Revit 2025 a 2028 · Windows 10 ou 11 · grátis, com versão PRO</p>
        </div>
        <div className="flex max-h-[470px] justify-center overflow-hidden rounded-cartao bg-superficie-2 px-5 pt-5">
          <img
            src="/imagens/painel-revit-claro.jpg"
            alt="O painel do Arquionie para Revit aberto na etapa Modelar, com as ferramentas de arquitetura, estrutura, terreno e elétrica"
            width="380"
            height="1100"
            className="so-claro w-[330px] max-w-full self-start rounded-t-dentro shadow-cartao"
          />
          <img src="/imagens/painel-revit-escuro.jpg" alt="" width="380" height="1100" className="so-escuro w-[330px] max-w-full self-start rounded-t-dentro" />
        </div>
      </section>

      {/* de onde vem */}
      <section id="historia" className={SECAO}>
        <div className="mb-4 max-w-[760px]">
          <p className="rotulo mb-1.5">De onde vem</p>
          <h2 className="text-amg-titulo">Nascido da prática, em mais de 220 projetos reais</h2>
          <p className="mt-2 text-amg-frase text-texto-apagado">
            O plugin nasceu dentro da Palheta Arquitetura para encurtar o próprio trabalho. Um projeto que levava de 6 meses a 1 ano passou a
            sair em cerca de 30 dias, em qualquer tipologia.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {NUMEROS.map(([numero, texto]) => (
            <div key={texto} className={CARTAO}>
              <b className="text-amg-titulo tabular-nums">{numero}</b>
              <span className="text-texto-apagado">{texto}</span>
            </div>
          ))}
        </div>
      </section>

      {/* as ferramentas */}
      <section id="functions-guide" className={SECAO}>
        <Titulo rotulo="Ferramentas" titulo="As mesmas etapas do painel" />
        <div className="sem-barra mb-3.5 flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Etapas">
          {ETAPAS.map(([nome]) => (
            <button
              key={nome}
              type="button"
              role="tab"
              aria-selected={etapa === nome}
              onClick={() => setEtapa(nome)}
              className={`min-h-amg-toque-minimo shrink-0 rounded-toque px-4 font-semibold ${
                etapa === nome ? 'bg-superficie text-texto shadow-cartao' : 'bg-superficie-2 text-texto-apagado'}`}
            >
              {nome}
            </button>
          ))}
        </div>
        {ETAPAS.map(([nome, grupos]) => (
          <div key={nome} role="tabpanel" aria-label={nome} hidden={etapa !== nome} className={`${CARTAO} ${etapa !== nome ? 'hidden' : ''}`}>
            {grupos.map(([grupo, ferramentas], i) => (
              <div key={grupo} className={i ? 'mt-2 border-t border-linha pt-3.5' : ''}>
                <h3 className="rotulo">{grupo}</h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {ferramentas.map(([ferramenta, pro]) => (
                    <li key={ferramenta} className="inline-flex items-center gap-1.5 rounded-toque bg-superficie-2 px-3 py-1.5">
                      {ferramenta}
                      {pro && <span className="rounded-toque bg-amg-destaque-suave px-[7px] text-[11px] font-bold tracking-[0.06em] text-destaque-texto">PRO</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* grátis e PRO: o quadro do plano 19, o anual em destaque à direita */}
      <section id="planos" className={SECAO}>
        <span id="gratis-vs-pro" className="block scroll-mt-4" />
        <Titulo rotulo="Grátis e PRO" titulo="Comece grátis. Libere tudo com o PRO" />
        <div className="grid gap-3 md:grid-cols-3">
          <article className={CARTAO}>
            <h3 className="text-amg-secao">Grátis</h3>
            <p className="text-amg-titulo-grande tabular-nums">R$ 0</p>
            <p className="text-texto-apagado">Para sempre, em qualquer projeto. Serve para estudantes.</p>
            <Lista itens={GRATIS} />
            <div className="mt-auto flex flex-col">
              <BotaoBaixar instalador={instalador} nivel={3} />
            </div>
          </article>
          <article className={CARTAO}>
            <h3 className="text-amg-secao">PRO mensal</h3>
            <p className="text-amg-titulo-grande tabular-nums">
              {real(precos.mensal)}
              <span className="text-amg-frase font-normal text-texto-apagado">/mês</span>
            </p>
            <p className="text-texto-apagado">Renova todo mês.</p>
            <Lista itens={PRO} />
            <div className="mt-auto flex flex-col">
              <Botao href={comprar(`Olá! Quero assinar o Plugin PRO mensal (${real(precos.mensal)}/mês). Vim pela página do Arquionie para Revit.`)} grande>
                <Balao />
                Assinar o mensal
              </Botao>
            </div>
          </article>
          <article className={`${CARTAO} ring-2 ring-destaque`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-amg-secao">PRO anual</h3>
              <span className="rounded-toque bg-amg-destaque-suave px-2.5 py-0.5 text-amg-rotulo text-destaque-texto">{precos.desconto}% OFF</span>
            </div>
            <p className="text-amg-titulo-grande tabular-nums">
              {real(precos.anual)}
              <span className="text-amg-frase font-normal text-texto-apagado">/mês</span>
            </p>
            <p className="text-texto-apagado">Cobrado anualmente.</p>
            <Lista itens={PRO} />
            <div className="mt-auto flex flex-col">
              <Botao href={comprar(`Olá! Quero assinar o Plugin PRO anual (${real(precos.anual)}/mês). Vim pela página do Arquionie para Revit.`)} principal grande>
                <Balao />
                Assinar o anual
              </Botao>
            </div>
          </article>
        </div>
        <div className="mt-3 flex flex-col items-start gap-3 rounded-cartao bg-superficie p-4 shadow-cartao sm:flex-row sm:items-center sm:p-5">
          <p className="text-texto-apagado sm:mr-auto">Pix ou cartão, combinados no WhatsApp. Pensando em sair do Revit? Conheça o Arquionie™.</p>
          <div className="flex flex-wrap gap-2">
            <Botao href={PORTAL_ANTIGO}>Já sou assinante</Botao>
            <Botao para="/">Conhecer o Arquionie™</Botao>
          </div>
        </div>
      </section>

      {/* aulas */}
      <section id="tutoriais" className={SECAO}>
        <Titulo rotulo="Aprender" titulo="24 aulas em vídeo, da instalação às pranchas" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AULAS.map(([id, titulo]) => (
            <a key={id} href={`https://www.youtube.com/watch?v=${id}`} className={`${CARTAO} gap-2.5 text-texto no-underline`}>
              <span aria-hidden="true" className="grid aspect-video place-items-center rounded-dentro bg-superficie-2">
                <span className="grid h-[46px] w-[46px] place-items-center rounded-toque bg-botao-1">
                  <svg width="16" height="18" viewBox="0 0 10 12" className="ml-[3px] fill-botao-1-texto">
                    <path d="M0 0l10 6-10 6z" />
                  </svg>
                </span>
              </span>
              <h3 className="text-amg-secao">{titulo}</h3>
            </a>
          ))}
        </div>
        <div className="mt-3.5">
          <Botao href={CANAL_DAS_AULAS}>Ver as 24 aulas no YouTube</Botao>
        </div>
      </section>

      {/* baixar */}
      <section id="download" className={SECAO}>
        <Titulo rotulo="Baixar" titulo="O que precisa para instalar" />
        <div className="grid gap-3 sm:grid-cols-3">
          {REQUISITOS.map(([titulo, texto]) => (
            <div key={titulo} className={CARTAO}>
              <h3 className="text-amg-secao">{titulo}</h3>
              <p className="text-texto-apagado">{texto}</p>
            </div>
          ))}
        </div>
        <div className="mt-3.5 flex flex-col items-start gap-1.5">
          <BotaoBaixar instalador={instalador} />
          {instalador && <p className="text-amg-legenda text-texto-apagado">Versão {instalador.versao}</p>}
        </div>
      </section>

      {/* perguntas */}
      <section id="perguntas" className="mx-auto max-w-[900px] scroll-mt-4 px-4 py-10 sm:px-6 sm:py-14">
        <Titulo rotulo="Perguntas frequentes" titulo="O que as pessoas perguntam" />
        <div className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">
          {PERGUNTAS_REVIT.map(([pergunta, resposta], i) => (
            <details key={pergunta} open={i === 0} className="group border-t border-linha first:border-t-0">
              <summary className="flex min-h-amg-toque-minimo cursor-pointer list-none items-center justify-between gap-4 px-4 py-2.5 font-semibold [&::-webkit-details-marker]:hidden">
                {pergunta}
                <Icone nome="seta" className="text-texto-apagado transition-transform group-open:rotate-90" />
              </summary>
              <p className="px-4 pb-4 text-texto-apagado">{resposta}</p>
            </details>
          ))}
        </div>
      </section>

      {/* chamada final */}
      <section className="mx-auto max-w-[1200px] px-4 pb-4 sm:px-6">
        <div className="flex flex-col items-stretch gap-5 rounded-cartao bg-superficie p-5 shadow-cartao sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-center gap-4 sm:mr-auto">
            <img src="/leao.png" alt="" className="h-16 w-16" />
            <div>
              <h2 className="text-amg-titulo">Comece agora</h2>
              <p className="mt-1 text-texto-apagado">Baixe, abra o Revit e o painel já está lá.</p>
            </div>
          </div>
          <BotaoBaixar instalador={instalador} />
        </div>
      </section>
    </>
  );
}
