import { numeroLegivel, useTotalDownloads } from '@/lib/downloads';
import { Botao, Icone } from '@/components/Formulario';
import { DESTAQUES, PASSOS, PERGUNTAS, PUBLICO, RECURSOS, TRILHAS } from '@/conteudo/inicio';

// O início no modo AMIGÁVEL (mockup site-amigavel, aprovado por ÊDI em 16/10/2026): a capa com o título de capa e a frase, as seções
// em cartões de 18 px sobre o fundo, as perguntas numa lista agrupada e o Baixar em terracota, o nível 1.
const SECAO = 'mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14';
const CARTAO = 'flex flex-col gap-1.5 rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5';

function Titulo({ rotulo, titulo, children }) {
  return (
    <div className="mb-5 max-w-[760px]">
      <p className="rotulo mb-1.5">{rotulo}</p>
      <h2 className="text-amg-titulo">{titulo}</h2>
      {children && <p className="mt-2 text-amg-frase text-texto-apagado">{children}</p>}
    </div>
  );
}

function BotaoBaixar() {
  return (
    <Botao para="/baixar" principal grande>
      <Icone nome="baixar" tamanho={18} />
      Baixar para Windows
    </Botao>
  );
}

function Contador() {
  const total = useTotalDownloads();
  if (!total) return null; // aparece desde o primeiro download
  return (
    <p className="mt-5 flex items-baseline gap-2" aria-live="polite">
      <b className="text-amg-titulo tabular-nums">{numeroLegivel(total)}</b>
      <span className="text-texto-apagado">{total === 1 ? 'download feito' : 'downloads feitos'}</span>
    </p>
  );
}

export default function Inicio() {
  return (
    <>
      {/* a capa */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-8 px-4 pb-6 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-11">
        <div>
          <p className="rotulo mb-2">Palheta Arquionie™</p>
          <h1 className="text-amg-titulo-grande sm:text-amg-titulo-capa">Do primeiro contato ao projeto aprovado</h1>
          <p className="mb-6 mt-3.5 max-w-[540px] text-amg-frase text-texto-apagado">
            Capte clientes, projete em BIM, renderize e mande o projeto para o cliente aprovar pelo celular. Tudo num só lugar, feito por
            um escritório de arquitetura brasileiro.
          </p>
          <div className="flex flex-col sm:block">
            <BotaoBaixar />
          </div>
          <p className="mt-2.5 text-amg-legenda text-texto-apagado">Windows 10 ou 11, 64 bits · grátis, com versão PRO</p>
          <Contador />
        </div>
        <img
          src="/imagens/programa.jpg"
          alt="A janela do Arquionie com um estacionamento em 3D, carros e vagas numeradas, num projeto de amostra"
          className="w-full rounded-cartao shadow-cartao"
        />
      </section>

      {/* como funciona */}
      <section id="como-funciona" className={SECAO}>
        <Titulo rotulo="Como funciona" titulo="Um caminho só, em quatro etapas" />
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PASSOS.map(([titulo, texto], i) => (
            <li key={titulo} className={CARTAO}>
              <span aria-hidden="true" className="mb-1 grid h-8 w-8 place-items-center rounded-toque bg-amg-destaque-suave font-bold text-destaque-texto">
                {i + 1}
              </span>
              <h3 className="text-amg-secao">{titulo}</h3>
              <p className="text-texto-apagado">{texto}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* destaques com imagem */}
      <section id="o-que-e" className={SECAO}>
        <Titulo rotulo="O que ele faz" titulo="Um programa para o projeto inteiro" />
        <div className="space-y-4">
          {DESTAQUES.map((d, i) => (
            <article key={d.titulo} className="grid items-center gap-5 rounded-cartao bg-superficie p-3 shadow-cartao md:grid-cols-2 md:gap-7">
              <img src={d.imagem} alt="" loading="lazy" className={`w-full rounded-dentro ${i % 2 ? 'md:order-2' : ''}`} />
              <div className="px-2 pb-3 md:px-4 md:pb-0">
                <h3 className="mb-2 text-amg-secao">{d.titulo}</h3>
                <p className="text-amg-frase text-texto-apagado">{d.texto}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* mais recursos */}
      <section className={SECAO}>
        <Titulo rotulo="E mais" titulo="O que já está no programa" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RECURSOS.map(([titulo, texto]) => (
            <article key={titulo} className={CARTAO}>
              <h3 className="text-amg-secao">{titulo}</h3>
              <p className="text-texto-apagado">{texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* para quem é */}
      <section id="para-quem" className={SECAO}>
        <Titulo rotulo="Para quem é" titulo="Feito para quem projeta" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PUBLICO.map(([titulo, texto]) => (
            <article key={titulo} className={CARTAO}>
              <h3 className="text-amg-secao">{titulo}</h3>
              <p className="text-texto-apagado">{texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* aprender */}
      <section id="aprender" className={SECAO}>
        <Titulo rotulo="Aprender" titulo="Trilhas para começar com o pé direito">
          As mesmas trilhas da aba APRENDER do programa. Cada aula abre o manual da função; as aulas em vídeo vêm depois.
        </Titulo>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TRILHAS.map(([titulo, aulas]) => (
            <article key={titulo} className={CARTAO}>
              <h3 className="mb-1 text-amg-secao">{titulo}</h3>
              <ol className="space-y-1 text-texto-apagado">
                {aulas.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      {/* perguntas */}
      <section id="perguntas" className="mx-auto max-w-[900px] px-4 py-10 sm:px-6 sm:py-14">
        <Titulo rotulo="Perguntas frequentes" titulo="O que as pessoas perguntam" />
        <div className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">
          {PERGUNTAS.map(([pergunta, resposta]) => (
            <details key={pergunta} className="group border-t border-linha first:border-t-0">
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
              <p className="mt-1 text-texto-apagado">Crie a conta, baixe e abra o seu primeiro projeto.</p>
            </div>
          </div>
          <BotaoBaixar />
        </div>
      </section>
    </>
  );
}
