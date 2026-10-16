import { numeroLegivel, useTotalDownloads } from '@/lib/downloads';
import { Botao, Icone } from '@/components/Formulario';

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
          <h1 className="text-amg-titulo-grande sm:text-amg-titulo-capa">Modelagem e documentação BIM</h1>
          <p className="mb-6 mt-3.5 max-w-[540px] text-amg-frase text-texto-apagado">
            Projete, documente e apresente no mesmo programa. Feito pela Palheta Arquitetura a partir do trabalho de um escritório de
            verdade, pelas normas brasileiras.
          </p>
          <div className="flex flex-col sm:block">
            <BotaoBaixar />
          </div>
          <p className="mt-2.5 text-amg-legenda text-texto-apagado">Windows 10 ou 11, 64 bits · grátis no lançamento</p>
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
        <Titulo rotulo="Como funciona" titulo="Do primeiro traço à apresentação" />
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
