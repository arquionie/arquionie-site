import { Botao, Icone } from '@/components/Formulario';
import Iphone from '@/components/Iphone';
import {
  AULA_DO_COMERCIAL, CRIAR_CONTA, NUMEROS_COMERCIAL, PASSOS_COMERCIAL, PERGUNTAS_COMERCIAL, PLANOS_COMERCIAL, RECURSOS_COMERCIAL,
} from '@/conteudo/comercial';

// A página do Comercial, o CRM grátis (/comercial; mockup docs/mockups/pagina-comercial do repositório do programa, aprovado por ÊDI em
// 19/10/2026). É a página para onde vão o anúncio e a bio do @arquionie: tudo leva a CRIAR CONTA GRÁTIS, que volta direto para o
// primeiro acesso do Comercial. Mesmo desenho da /para-revit. As fotos são do Comercial de verdade com os dados de amostra (?amostra).
// Os planos são só os do Comercial (grátis, mensal e anual); o PRO do Arquionie, que traz o Comercial completo, não aparece aqui.
const SECAO = 'mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14 scroll-mt-4';
const CARTAO = 'flex flex-col gap-1.5 rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5';

function Titulo({ rotulo, titulo, children }) {
  return (
    <div className="mb-5 max-w-[760px]">
      <p className="rotulo mb-1.5">{rotulo}</p>
      <h2 className="text-amg-titulo">{titulo}</h2>
      {children}
    </div>
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

function CriarConta({ nivel }) {
  return (
    <Botao para={CRIAR_CONTA} principal={!nivel} nivel={nivel} grande>
      Criar conta grátis
    </Botao>
  );
}

export default function PaginaDoComercial() {
  return (
    <>
      {/* a capa */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-8 px-4 pb-6 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-11">
        <div>
          <p className="rotulo mb-2">Arquionie™ Comercial</p>
          <h1 className="text-amg-titulo-grande sm:text-amg-titulo-capa">O CRM grátis para quem projeta</h1>
          <p className="mb-6 mt-3.5 max-w-[540px] text-amg-frase text-texto-apagado">
            Um formulário com a sua logo para o cliente pedir orçamento, os pedidos num quadro, o orçamento por m² e a proposta pelo
            WhatsApp, com aceite pelo celular. Feito por um escritório de arquitetura brasileiro.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <CriarConta />
            <Botao href="#como-funciona" nivel={2} grande>
              Ver como funciona
            </Botao>
          </div>
          <p className="mt-2.5 text-amg-legenda text-texto-apagado">
            Arquitetura, interiores e engenharia · no navegador, sem instalar · grátis, com planos para quem envia mais
          </p>
        </div>
        <div className="relative pb-10">
          <img
            src="/imagens/comercial-quadro-claro.jpg"
            alt="O Comercial aberto: os cinco números no alto, a lista Hoje com um retorno, um pedido parado e uma proposta aberta 3 vezes, e o quadro com as etapas Solicitação, Em contato, Reunião, Retorno e Aprovado"
            width="2160"
            height="1350"
            className="so-claro w-full rounded-cartao border border-linha shadow-cartao"
          />
          <img src="/imagens/comercial-quadro-escuro.jpg" alt="" width="2160" height="1350" className="so-escuro w-full rounded-cartao border border-linha shadow-cartao" />
          <Iphone
            src="/imagens/comercial-proposta-claro.jpg"
            alt="A proposta no celular do cliente, com a logo do escritório e os pacotes Completo, Intermediário e Básico"
            carregamento="eager"
            className="absolute -right-1.5 bottom-0 w-[30%] max-w-[200px]"
          />
        </div>
      </section>

      {/* como funciona */}
      <section id="como-funciona" className={SECAO}>
        <Titulo rotulo="Como funciona" titulo="Do pedido à proposta aceita, em cinco passos" />
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <ol className="space-y-2.5">
            {PASSOS_COMERCIAL.map(([titulo, texto], i) => (
              <li key={titulo} className="grid grid-cols-[34px_minmax(0,1fr)] items-start gap-3.5">
                <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-toque bg-amg-destaque-suave font-bold text-destaque-texto">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-0.5 rounded-cartao bg-superficie px-4 py-3.5 shadow-cartao">
                  <h3 className="text-amg-secao">{titulo}</h3>
                  <p className="text-texto-apagado">{texto}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mx-auto grid w-full max-w-[420px] grid-cols-2 gap-3.5">
            <figure className="m-0 flex flex-col gap-2">
              <Iphone
                src="/imagens/comercial-formulario-claro.jpg"
                alt="O formulário no celular do cliente, uma pergunta por tela: O que você quer fazer? Construir do zero, Reformar, Interiores, Regularizar na prefeitura ou Outro"
              />
              <figcaption className="text-center text-amg-legenda text-texto-apagado">O formulário, com a sua marca</figcaption>
            </figure>
            <figure className="m-0 flex flex-col gap-2">
              <Iphone src="/imagens/comercial-proposta-claro.jpg" alt="A proposta no celular do cliente, com os três pacotes e os valores" />
              <figcaption className="text-center text-amg-legenda text-texto-apagado">A proposta, com os pacotes</figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* o que tem */}
      <section className={SECAO}>
        <Titulo rotulo="O que tem" titulo="O comercial do escritório num lugar só" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RECURSOS_COMERCIAL.map(([titulo, texto]) => (
            <article key={titulo} className={CARTAO}>
              <h3 className="text-amg-secao">{titulo}</h3>
              <p className="text-texto-apagado">{texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* de onde vem */}
      <section className={SECAO}>
        <Titulo rotulo="De onde vem" titulo="Nascido no comercial de um escritório de verdade">
          <p className="mt-2 text-amg-frase text-texto-apagado">
            O Comercial nasceu do CRM que a Palheta Arquitetura usa todo dia para atender igrejas no Brasil inteiro, refeito para qualquer
            escritório.
          </p>
        </Titulo>
        <div className="grid gap-3 sm:grid-cols-3">
          {NUMEROS_COMERCIAL.map(([numero, texto]) => (
            <div key={texto} className={CARTAO}>
              <b className="text-amg-titulo tabular-nums">{numero}</b>
              <span className="text-texto-apagado">{texto}</span>
            </div>
          ))}
        </div>
      </section>

      {/* grátis e PRO */}
      <section id="planos" className={SECAO}>
        <Titulo rotulo="Planos" titulo="Comece grátis. Pague só quando enviar mais" />
        <div className="grid gap-3 md:grid-cols-3">
          {PLANOS_COMERCIAL.map((plano) => (
            <article key={plano.nome} className={`${CARTAO} ${plano.destaque ? 'ring-2 ring-destaque' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-amg-secao">{plano.nome}</h3>
                {plano.etiqueta && (
                  <span className="rounded-toque bg-amg-destaque-suave px-2.5 py-0.5 text-amg-rotulo text-destaque-texto">{plano.etiqueta}</span>
                )}
              </div>
              <p className="text-amg-titulo-grande tabular-nums">
                {plano.preco}
                {plano.porMes && <span className="text-amg-frase font-normal text-texto-apagado">/mês</span>}
              </p>
              <p className="text-texto-apagado">{plano.nota}</p>
              <Lista itens={plano.itens} />
              <div className="mt-auto flex flex-col">
                {plano.emBreve ? (
                  <Botao type="button" disabled grande>
                    Em breve
                  </Botao>
                ) : (
                  <CriarConta />
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* aprender: a aula dos primeiros passos, quando tiver endereço */}
      {AULA_DO_COMERCIAL && (
        <section id="aprender" className={SECAO}>
          <Titulo rotulo="Aprender" titulo="Veja o Comercial funcionando">
            <p className="mt-2 text-amg-frase text-texto-apagado">
              Do escritório configurado ao primeiro pedido, à proposta pelo WhatsApp e ao aceite do cliente.
            </p>
          </Titulo>
          <Botao href={AULA_DO_COMERCIAL}>
            <Icone nome="seta" tamanho={18} />
            Ver no YouTube
          </Botao>
        </section>
      )}

      {/* perguntas */}
      <section id="perguntas" className="mx-auto max-w-[900px] scroll-mt-4 px-4 py-10 sm:px-6 sm:py-14">
        <Titulo rotulo="Perguntas frequentes" titulo="O que as pessoas perguntam" />
        <div className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">
          {PERGUNTAS_COMERCIAL.map(([pergunta, resposta], i) => (
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
              <p className="mt-1 text-texto-apagado">Crie a conta e o seu formulário fica pronto em 2 minutos.</p>
            </div>
          </div>
          <CriarConta />
        </div>
      </section>
    </>
  );
}
