import { Link } from 'react-router-dom';
import { numeroLegivel, useTotalDownloads } from '@/lib/downloads';

// Textos para ÊDI revisar. Dizem só o que o programa já faz (CLAUDE.md e doc 07, 03/10/2026); as imagens são de
// projetos de amostra do próprio Arquionie, nunca de cliente.

const PASSOS = [
  ['Comece do zero ou traga do Revit', 'Abra um projeto novo com o catálogo do escritório, ou o pacote exportado pelo Palheta Flow, o plugin do Revit.'],
  ['Modele com peças de verdade', 'Paredes com camadas, pisos, forros, portas e janelas, escadas, guarda-corpos, terreno e vias, em três níveis de detalhe.'],
  ['Documente pelas normas', 'Plantas, cortes e elevações na linguagem técnica da ABNT, com perfis de vista aplicados em lote.'],
  ['Apresente sem sair dele', 'Imagens, panoramas e vídeos pelo renderizador próprio, com câmeras, céu, sol e caminhos de vídeo.'],
];

const DESTAQUES = [
  {
    imagem: '/imagens/carros-realista.jpg',
    titulo: 'Um renderizador que é do programa',
    texto:
      'O estilo Realista mostra o projeto com sol, céu, sombras, reflexos e materiais enquanto você trabalha. Imagens, panoramas e vídeos saem da mesma vista, sem exportar para outro programa.',
  },
  {
    imagem: '/imagens/vegetacao-prancha.jpg',
    titulo: 'Vegetação desenhada pelo programa',
    texto:
      'Vinte e uma espécies, das palmeiras às forrações, com a folha desenhada pelo próprio Arquionie™. Cada planta aparece leve nas vistas 2D e completa no 3D, e os materiais vêm com texturas.',
  },
  {
    imagem: '/imagens/vagas-planta.jpg',
    titulo: 'Implantação e urbanismo',
    texto:
      'Terreno com relevo, lote e divisas, vias com calçada e guia, e vagas de estacionamento numeradas na ordem da planta, com as medidas de cada uma.',
  },
  {
    imagem: '/imagens/vagas-3d.jpg',
    titulo: 'Planta, corte e 3D do mesmo modelo',
    texto:
      'Tudo sai de um modelo só. Mudou no 3D, muda na planta, no corte e na elevação, cada vista no nível de detalhe que ela pede.',
  },
];

const RECURSOS = [
  ['Trazer do Revit', 'O pacote do Palheta Flow vira paredes, pisos, ambientes, forros, portas e janelas do Arquionie™, com as câmeras do projeto.'],
  ['Planta a partir do PDF', 'A planta em PDF exportada pelo Revit vira paredes, pilares, pisos, portas, janelas e ambientes.'],
  ['Pontos elétricos', 'Tomadas, interruptores e pontos de luz com as alturas da NBR 9050, legenda automática e quantidades.'],
  ['Com a sua IA', 'A IA que você já usa, como o Claude ou o ChatGPT, consulta e cria projetos no Arquionie™.'],
  ['Escadas e guarda-corpos', 'Escadas em L, em U e com patamar, e guarda-corpos de vidro, tubulares e acessíveis pela NBR 9050.'],
  ['Os projetos são seus', 'O arquivo fica no seu computador. Nada do que você desenha, salva ou exporta pertence à Palheta Arquitetura.'],
];

const PUBLICO = [
  ['Arquitetos', 'Do estudo à apresentação no mesmo programa, com o catálogo e os padrões do seu escritório.'],
  ['Engenheiros', 'Pontos elétricos com legenda e quantidades sobre a arquitetura, que chega do Revit ou nasce aqui.'],
  ['Estudantes', 'Grátis para estudar, aprender BIM e montar as primeiras pranchas.'],
  ['Escritórios', 'Catálogo, materiais e padrões gráficos do escritório, e a mesma conta em até três computadores.'],
];

// As mesmas trilhas da aba APRENDER do programa (Controles/TelaAprender.cs).
const TRILHAS = [
  ['Comece por aqui', ['A janela do Arquionie™', 'Criar sem parar', 'Atalhos de modelagem', 'Biblioteca de ativos']],
  ['Projeto residencial do zero', ['Terreno e divisa', 'Paredes', 'Portas e janelas', 'Pisos e forros', 'Cortes e elevações', 'Luminárias']],
  ['Aprenda uma ferramenta', ['Desenhar na face', 'Caixa de corte', 'Copiar e colar', 'Editor de materiais', 'Elevações']],
  ['Trazer e levar projeto', ['Abrir um pacote do Flow', 'Converter CAD do Revit', 'Exportar para o Revit', 'Fontes e texturas']],
];

const PERGUNTAS = [
  [
    'O Arquionie™ é gratuito?',
    'Durante o lançamento, a conta usa o programa por completo, sem custo. Quando houver assinatura, avisamos antes, por e-mail. Abrir, ver, imprimir e exportar os seus projetos continua sempre grátis, e estudantes não pagam.',
  ],
  [
    'Preciso de internet?',
    'Para entrar na conta e receber as versões novas. Depois de entrar, o programa funciona até 30 dias sem internet. Abrir e ver projetos não depende de conta.',
  ],
  [
    'Ele abre arquivos do Revit?',
    'Abre o pacote exportado pelo Palheta Flow, o plugin do Revit, e converte paredes, pisos, ambientes, forros, portas e janelas em elementos do Arquionie™. Também lê a planta em PDF exportada pelo Revit. O arquivo .rvt direto, não.',
  ],
  ['Onde ficam os meus projetos?', 'No seu computador, em arquivos .aqi. A conta guarda só o cadastro e os computadores conectados; os seus arquivos não vão para servidor nenhum.'],
  ['Em quantos computadores posso usar?', 'A mesma conta fica conectada em até três computadores ao mesmo tempo. Na página Minha conta você vê e desconecta cada um.'],
  ['Como chegam as versões novas?', 'O programa baixa sozinho, confere o arquivo e avisa na barra de estado. Você escolhe instalar ao fechar ou na hora, e ele reabre no mesmo projeto.'],
  ['Funciona no Mac ou no Linux?', 'Por enquanto, só no Windows 10 e 11, 64 bits.'],
  ['Como uso a minha IA?', 'Nas configurações do programa, o botão CONECTAR IA liga o Arquionie™ ao Claude, ao Claude Code ou ao Codex e ChatGPT. A IA fica com você: o programa não guarda chave nem paga cota.'],
];

function Titulo({ rotulo, titulo, children }) {
  return (
    <div className="mb-8 max-w-[760px]">
      <p className="titulo-secao mb-2">{rotulo}</p>
      <h2 className="text-[28px] font-semibold leading-tight text-white sm:text-[32px]">{titulo}</h2>
      {children && <p className="mt-3 text-aqi-muted">{children}</p>}
    </div>
  );
}

function BotaoBaixar({ grande }) {
  return (
    <Link
      to="/baixar"
      className={`inline-flex items-center gap-3 bg-aqi-campo font-bold tracking-[0.06em] text-white no-underline hover:bg-aqi-campohover ${
        grande ? 'px-6 py-4 text-[15px]' : 'h-[44px] px-6 text-[14px]'
      }`}
    >
      ⤓ BAIXAR PARA WINDOWS
    </Link>
  );
}

function Contador() {
  const total = useTotalDownloads();
  if (!total) return null; // aparece desde o primeiro download
  return (
    <div className="mt-6 flex items-baseline gap-3 border-l-4 border-aqi-coral pl-4" aria-live="polite">
      <span className="text-[34px] font-bold leading-none text-white">{numeroLegivel(total)}</span>
      <span className="text-[15px] text-aqi-muted">{total === 1 ? 'download feito' : 'downloads feitos'}</span>
    </div>
  );
}

export default function Inicio() {
  return (
    <>
      {/* topo */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-16 pt-12 sm:px-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <p className="titulo-secao mb-3">Palheta Arquionie™</p>
          <h1 className="mb-4 text-[38px] font-semibold leading-[1.12] text-white sm:text-[46px]">Modelagem e documentação BIM</h1>
          <p className="mb-7 max-w-[540px] text-[18px] text-aqi-muted">
            Projete, documente e apresente no mesmo programa. Feito pela Palheta Arquitetura a partir do trabalho de um
            escritório de verdade, pelas normas brasileiras.
          </p>
          <BotaoBaixar grande />
          <p className="mt-3 text-[13px] text-aqi-muted">Windows 10 ou 11, 64 bits · grátis no lançamento</p>
          <Contador />
        </div>
        <figure className="m-0">
          <img
            src="/imagens/programa.jpg"
            alt="A janela do Arquionie com um estacionamento em 3D, carros e vagas numeradas"
            className="w-full shadow-[0_0_0_1px_#000,0_24px_60px_#000a]"
          />
          <figcaption className="mt-2 text-[12px] text-aqi-muted">A janela do Arquionie™, com um projeto de amostra.</figcaption>
        </figure>
      </section>

      {/* como funciona */}
      <section id="como-funciona" className="border-t border-[#262D37] bg-aqi-barra">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-7">
          <Titulo rotulo="Como funciona" titulo="Do primeiro traço à apresentação" />
          <ol className="grid gap-px bg-[#262D37] sm:grid-cols-2 lg:grid-cols-4">
            {PASSOS.map(([titulo, texto], i) => (
              <li key={titulo} className="bg-aqi-barra p-6">
                <span className="mb-3 block text-[34px] font-bold leading-none text-aqi-coral">{i + 1}</span>
                <h3 className="mb-2 text-[17px] font-semibold text-white">{titulo}</h3>
                <p className="text-[15px] text-aqi-muted">{texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* destaques com imagem */}
      <section id="o-que-e" className="mx-auto max-w-[1200px] px-4 py-16 sm:px-7">
        <Titulo rotulo="O que ele faz" titulo="Um programa para o projeto inteiro" />
        <div className="space-y-14">
          {DESTAQUES.map((d, i) => (
            <article key={d.titulo} className="grid items-center gap-8 md:grid-cols-2">
              <img
                src={d.imagem}
                alt=""
                loading="lazy"
                className={`w-full shadow-[0_0_0_1px_#000,0_18px_50px_#0008] ${i % 2 ? 'md:order-2' : ''}`}
              />
              <div>
                <h3 className="mb-3 text-[24px] font-semibold leading-tight text-white">{d.titulo}</h3>
                <p className="text-[16px] text-aqi-muted">{d.texto}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* mais recursos */}
      <section className="border-t border-[#262D37] bg-aqi-barra">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-7">
          <Titulo rotulo="E mais" titulo="O que já está no programa" />
          <div className="grid gap-px bg-[#262D37] sm:grid-cols-2 lg:grid-cols-3">
            {RECURSOS.map(([titulo, texto]) => (
              <article key={titulo} className="bg-aqi-barra p-6">
                <h3 className="mb-2 text-[17px] font-semibold text-white">{titulo}</h3>
                <p className="text-[15px] text-aqi-muted">{texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* para quem é */}
      <section id="para-quem" className="mx-auto max-w-[1200px] px-4 py-16 sm:px-7">
        <Titulo rotulo="Para quem é" titulo="Feito para quem projeta" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PUBLICO.map(([titulo, texto]) => (
            <article key={titulo} className="border-t-2 border-aqi-coral bg-aqi-barra p-6">
              <h3 className="mb-2 text-[18px] font-semibold text-white">{titulo}</h3>
              <p className="text-[15px] text-aqi-muted">{texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* aprender */}
      <section id="aprender" className="border-t border-[#262D37] bg-aqi-barra">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-7">
          <Titulo rotulo="Aprender" titulo="Trilhas para começar com o pé direito">
            As mesmas trilhas da aba APRENDER do programa. Cada aula abre o manual da função; as aulas em vídeo vêm depois.
          </Titulo>
          <div className="grid gap-px bg-[#262D37] sm:grid-cols-2 lg:grid-cols-4">
            {TRILHAS.map(([titulo, aulas]) => (
              <article key={titulo} className="bg-aqi-barra p-6">
                <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-aqi-coral">{titulo}</h3>
                <ol className="space-y-1.5 text-[15px] text-aqi-texto">
                  {aulas.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* perguntas */}
      <section id="perguntas" className="mx-auto max-w-[900px] px-4 py-16 sm:px-7">
        <Titulo rotulo="Perguntas frequentes" titulo="O que as pessoas perguntam" />
        <div className="divide-y divide-[#262D37] border-y border-[#262D37]">
          {PERGUNTAS.map(([pergunta, resposta]) => (
            <details key={pergunta} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold text-white">
                {pergunta}
                <span className="text-aqi-coral transition-transform group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[16px] text-aqi-muted">{resposta}</p>
            </details>
          ))}
        </div>
      </section>

      {/* chamada final */}
      <section className="border-t border-[#262D37] bg-aqi-barra">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 px-4 py-16 sm:px-7 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <img src="/leao.png" alt="" className="h-[72px] w-[72px]" />
            <div>
              <h2 className="text-[26px] font-semibold text-white">Comece agora</h2>
              <p className="text-aqi-muted">Crie a conta, baixe e abra o seu primeiro projeto.</p>
            </div>
          </div>
          <BotaoBaixar />
        </div>
      </section>
    </>
  );
}
