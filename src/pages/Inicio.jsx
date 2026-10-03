import { Link } from 'react-router-dom';

// Textos para ÊDI revisar: dizem só o que o programa já faz (CLAUDE.md e doc 07 de 02/10/2026).
const FRENTES = [
  {
    titulo: 'Modelar',
    texto:
      'Paredes, pisos, forros, portas e janelas, escadas, guarda-corpos, terreno e vias, com o catálogo do escritório e três níveis de detalhe em todas as vistas.',
  },
  {
    titulo: 'Documentar',
    texto: 'Plantas, cortes e elevações na linguagem técnica da ABNT, em escala de cinza, com perfis de vista aplicados em lote.',
  },
  {
    titulo: 'Apresentar',
    texto: 'Imagens, panoramas e vídeos pelo renderizador próprio, sem sair do programa e sem exportar para outro.',
  },
  {
    titulo: 'Trazer do Revit',
    texto: 'O pacote exportado pelo Palheta Flow abre no Arquionie™ e vira paredes, pisos, ambientes, forros, portas e janelas nossos.',
  },
  {
    titulo: 'Com a sua IA',
    texto: 'A IA que você já usa, como o Claude ou o ChatGPT, consulta e cria projetos no Arquionie™, na janela aberta ou direto no arquivo.',
  },
  {
    titulo: 'Os projetos são seus',
    texto: 'O arquivo fica no seu computador. Nada do que você desenha, salva ou exporta pertence à Palheta Arquitetura.',
  },
];

export default function Inicio() {
  return (
    <>
      <section className="mx-auto grid max-w-[1100px] items-center gap-10 px-4 pb-16 pt-14 sm:px-7 md:grid-cols-[1fr_320px]">
        <div>
          <p className="titulo-secao mb-3">Palheta Arquionie™</p>
          <h1 className="mb-4 text-[38px] font-semibold leading-[1.15] text-white sm:text-[46px]">Modelagem e documentação BIM</h1>
          <p className="mb-7 max-w-[560px] text-[18px] text-aqi-muted">
            Projete, documente e apresente no mesmo programa. Feito pela Palheta Arquitetura a partir do trabalho de um
            escritório de verdade.
          </p>
          <Link
            to="/baixar"
            className="inline-flex items-center gap-3 bg-aqi-campo px-6 py-4 text-[15px] font-bold tracking-[0.06em] text-white no-underline hover:bg-aqi-campohover"
          >
            ⤓ BAIXAR PARA WINDOWS
          </Link>
          <p className="mt-3 text-[13px] text-aqi-muted">Windows 10 ou 11, 64 bits · grátis no lançamento</p>
        </div>
        <img src="/leao.svg" alt="Leão, a marca do Arquionie" className="mx-auto w-[220px] md:w-[300px]" />
      </section>

      <section id="o-que-e" className="border-t border-[#262D37] bg-aqi-barra">
        <div className="mx-auto max-w-[1100px] px-4 py-14 sm:px-7">
          <p className="titulo-secao mb-2">O que é</p>
          <h2 className="mb-8 text-[28px] font-semibold text-white">Do primeiro traço à apresentação</h2>
          <div className="grid gap-px bg-[#262D37] sm:grid-cols-2 lg:grid-cols-3">
            {FRENTES.map((f) => (
              <article key={f.titulo} className="bg-aqi-barra p-6">
                <h3 className="mb-2 text-[17px] font-semibold text-white">{f.titulo}</h3>
                <p className="text-[15px] text-aqi-muted">{f.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-7">
        <p className="titulo-secao mb-2">Requisitos</p>
        <h2 className="mb-4 text-[28px] font-semibold text-white">O que o computador precisa</h2>
        <p className="max-w-[720px] text-aqi-muted">
          Windows 10 (versão 1809 em diante) ou Windows 11, 64 bits. O 3D usa a placa de vídeo; drivers atualizados ajudam.
          Não é preciso instalar .NET nem outro programa: tudo vem no instalador, e as versões novas chegam sozinhas.
        </p>
        <Link
          to="/baixar"
          className="mt-7 inline-flex h-[44px] items-center bg-aqi-campo px-6 text-[14px] font-bold tracking-[0.06em] text-white no-underline hover:bg-aqi-campohover"
        >
          CRIAR CONTA E BAIXAR
        </Link>
      </section>
    </>
  );
}
