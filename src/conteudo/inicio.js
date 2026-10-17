// Os textos da página inicial, para ÊDI revisar. Dizem só o que o programa já faz (CLAUDE.md e doc 07, 03/10/2026); as imagens são de
// projetos de amostra do próprio Arquionie, nunca de cliente. Ficam fora da página porque o build também os usa no llms.txt e
// nas perguntas dos dados estruturados (src/prerender.jsx), para o que os robôs leem ser o mesmo que está na tela.

// O caminho do escritório (ÊDI, 16/10/2026: o Arquionie é um ecossistema, do primeiro contato com o cliente ao projeto aprovado).
export const PASSOS = [
  ['Captar', 'Um formulário com a marca do escritório para o cliente pedir orçamento. Os pedidos caem num quadro com as suas etapas, e dali saem o orçamento, a proposta com aceite pela internet e a conversa pelo WhatsApp.'],
  ['Projetar', 'O modelo BIM começa do zero ou vem do Revit, pelo Arquionie™ para Revit. Dele saem plantas, cortes, elevações e pontos elétricos, pelas normas brasileiras.'],
  ['Apresentar', 'O renderizador próprio mostra o projeto com luz e materiais enquanto você trabalha. Imagens, panoramas 360° e vídeos saem da mesma vista.'],
  ['Aprovar', 'Um link leva ao cliente o vídeo, as imagens e um tour 3D para ele andar pelo projeto no celular. Ele pede ajustes apontando o lugar no tour, ou aprova, e a resposta volta no programa.'],
];

export const DESTAQUES = [
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

export const RECURSOS = [
  ['Trazer do Revit', 'O pacote do Arquionie™ para Revit vira paredes, pisos, ambientes, forros, portas e janelas do Arquionie™, com as câmeras do projeto.'],
  ['Planta a partir do PDF', 'A planta em PDF exportada pelo Revit vira paredes, pilares, pisos, portas, janelas e ambientes.'],
  ['Pontos elétricos', 'Tomadas, interruptores e pontos de luz com as alturas da NBR 9050, legenda automática e quantidades.'],
  ['Com a sua IA', 'A IA que você já usa, como o Claude ou o ChatGPT, consulta e cria projetos no Arquionie™.'],
  ['Escadas e guarda-corpos', 'Escadas em L, em U e com patamar, e guarda-corpos de vidro, tubulares e acessíveis pela NBR 9050.'],
  ['Os projetos são seus', 'O arquivo fica no seu computador. Nada do que você desenha, salva ou exporta pertence à Palheta Arquitetura.'],
];

export const PUBLICO = [
  ['Arquitetos', 'Do estudo à apresentação no mesmo programa, com o catálogo e os padrões do seu escritório.'],
  ['Engenheiros', 'Pontos elétricos com legenda e quantidades sobre a arquitetura, que chega do Revit ou nasce aqui.'],
  ['Estudantes', 'Grátis para estudar, aprender BIM e montar as primeiras pranchas.'],
  ['Escritórios', 'Catálogo, materiais e padrões gráficos do escritório, e a mesma conta em até três computadores.'],
];

// As mesmas trilhas da aba APRENDER do programa (Controles/TelaAprender.cs).
export const TRILHAS = [
  ['Comece por aqui', ['A janela do Arquionie™', 'Criar sem parar', 'Atalhos de modelagem', 'Biblioteca de ativos']],
  ['Projeto residencial do zero', ['Terreno e divisa', 'Paredes', 'Portas e janelas', 'Pisos e forros', 'Cortes e elevações', 'Luminárias']],
  ['Aprenda uma ferramenta', ['Desenhar na face', 'Caixa de corte', 'Copiar e colar', 'Editor de materiais', 'Elevações']],
  ['Trazer e levar projeto', ['Abrir um pacote do Flow', 'Converter CAD do Revit', 'Exportar para o Revit', 'Fontes e texturas']],
];

export const PERGUNTAS = [
  [
    'O Arquionie™ é gratuito?',
    'Sim. A versão grátis traz tudo o que se usa no dia a dia, inclusive criar e editar projetos. A versão PRO entrega o resultado final no nível máximo: o render em qualidade máxima, até 200 projetos enviados ao cliente e a conexão com a sua IA. Abrir, ver, imprimir e exportar os seus projetos é sempre grátis.',
  ],
  [
    'Preciso de internet?',
    'Para entrar na conta e receber as versões novas. Depois de entrar, o programa funciona até 30 dias sem internet. Abrir e ver projetos não depende de conta.',
  ],
  [
    'Ele abre arquivos do Revit?',
    'Abre o pacote exportado pelo Arquionie™ para Revit, o plugin (o antigo Palheta Flow), e converte paredes, pisos, ambientes, forros, portas e janelas em elementos do Arquionie™. Também lê a planta em PDF exportada pelo Revit. O arquivo .rvt direto, não.',
  ],
  ['Onde ficam os meus projetos?', 'No seu computador, em arquivos .aqi. A conta guarda só o cadastro e os computadores conectados; os seus arquivos não vão para servidor nenhum.'],
  ['Em quantos computadores posso usar?', 'A mesma conta fica conectada em até três computadores ao mesmo tempo. Na página Minha conta você vê e desconecta cada um.'],
  ['Como chegam as versões novas?', 'O programa baixa sozinho, confere o arquivo e avisa na barra de estado. Você escolhe instalar ao fechar ou na hora, e ele reabre no mesmo projeto.'],
  ['Funciona no Mac ou no Linux?', 'Por enquanto, só no Windows 10 e 11, 64 bits.'],
  ['Como uso a minha IA?', 'Na versão PRO, o botão CONECTAR IA, nas configurações do programa, liga o Arquionie™ ao Claude, ao Claude Code ou ao Codex e ChatGPT. A IA fica com você: o programa não guarda chave nem paga cota.'],
];
