// Os textos da página do Arquionie™ para Revit (/para-revit, o antigo Palheta Flow; mockup aprovado por ÊDI em 17/10/2026). A tela,
// o llms.txt e os dados estruturados leem daqui. O quadro de preço segue o plano 19 do repositório do plugin (ÊDI, 15/10/2026):
// GRÁTIS · PRO MENSAL · PRO ANUAL, o anual em destaque, sem o total do ano na vitrine.

// "O antigo Palheta Flow" no alto da página por 6 meses (ÊDI, 17/10/2026). O build depois desta data já sai sem ele.
export const NOME_ANTIGO_ATE = '2027-04-17';

// O manifesto do plugin para os clientes (o mesmo que a gestão lê em VERSÕES) e a pasta dos instaladores, até o canal revit-estavel.
export const MANIFESTO_PLUGIN_URL =
  'https://khisoybksdpjdztalmrs.supabase.co/storage/v1/object/public/project-assets/downloads/palheta-flow-externo-latest.json';
export const instaladorDoPlugin = (versao) =>
  `https://khisoybksdpjdztalmrs.supabase.co/storage/v1/object/public/project-assets/downloads/ARQUIONIE_${versao}.exe`;

// O portal de quem já assina com a chave antiga: continua no site do Flow até o fim da convivência (plano 17, item 8).
export const PORTAL_ANTIGO = 'https://www.palhetaflow.com.br/pro/portal';
export const CANAL_DAS_AULAS = 'https://www.youtube.com/@palhetaflowoficial/videos';

// Os preços de quando o build rodou; a página confere de novo em precos_vigentes() ao abrir.
export const PRECOS_PADRAO = { mensal: 69, anual: 39, desconto: 43 };

export const NUMEROS = [
  ['220+', 'projetos entregues'],
  ['8', 'países atendidos'],
  ['30 dias', 'da concepção à documentação'],
];

// As ferramentas nas mesmas etapas e grupos do painel; `true` marca as PRO (catálogo de 17/10/2026, palheta-flow-ferramentas.json).
export const ETAPAS = [
  ['Arquivo', [
    ['Projeto', [['Salvar projeto'], ['Meus projetos'], ['Abrir site']]],
    ['Recursos', [['Biblioteca de famílias'], ['Claude IA', true]]],
  ]],
  ['Modelar', [
    ['Arquitetura', [['Criar piso'], ['Colocar porta'], ['Criar soleira'], ['Nomear portas'], ['Colocar forro'], ['Criar revestimento'],
      ['Criar rodapé'], ['Criar telhado'], ['Criar arquibancada'], ['Colocar cadeiras']]],
    ['Estrutura', [['Criar viga', true], ['Nervurar laje', true]]],
    ['Terreno', [['Topografia DWG', true], ['Fazer terraplanagem', true], ['Criar calçada', true], ['Criar estacionamento']]],
    ['Elétrica', [['Colocar luminárias'], ['Colocar tomadas'], ['Colocar interruptor'], ['Checar conflitos', true]]],
    ['Materiais', [['Criar material', true], ['Clonar material']]],
    ['Modificar', [['Unir elementos'], ['Transferir itens', true], ['Isolar ambiente', true], ['Ocultar arestas']]],
  ]],
  ['Renderizar', [
    ['Apresentação', [['Criar passeio', true], ['Criar imagens'], ['Criar panoramas', true]]],
  ]],
  ['Documentar', [
    ['Projeto', [['Índices urbanísticos', true], ['Aplicar escopo', true], ['Criar detalhe 3D'], ['Padronizar documentação'],
      ['Criar eixos', true], ['Inserir ar-condicionado', true], ['Numerar itens', true]]],
    ['Cotas', [['Cotas internas'], ['Cotas gerais'], ['Cotas de itens', true], ['Cotas elétricas', true], ['Cotas de luminárias', true]]],
    ['Entrega', [['Montar pranchas', true], ['Exportar projeto', true]]],
  ]],
];

export const GRATIS = [
  'Pisos, portas, soleiras, forros, rodapés e telhados',
  'Luminárias, tomadas e interruptores',
  'Imagens, detalhe 3D, cotas internas e gerais',
  '3 usos de teste em ferramentas PRO, e as aulas',
];

export const PRO = [
  'Todas as ferramentas, inclusive montar pranchas e exportar o projeto',
  'Claude IA dentro do Revit',
  'Grupo dos assinantes no WhatsApp, com a equipe',
];

export const AULAS = [
  ['ly_Oac0tpXY', 'Apresentação'],
  ['Gjl4VVmctpA', 'Como instalar o plugin'],
  ['Z6QymVgRq6A', 'Criar pisos automaticamente'],
  ['yVLCyOrgjVA', 'Colocar portas alinhadas'],
];

export const REQUISITOS = [
  ['Revit', '2025, 2026, 2027 ou 2028'],
  ['Windows', '10 ou 11, 64 bits'],
  ['Instalação', 'Abra o instalador como administrador. O painel aparece no Revit.'],
];

export const PERGUNTAS_REVIT = [
  ['Eu tinha o Palheta Flow. E agora?',
    'Nada muda no seu Revit. O Palheta Flow passou a se chamar Arquionie™ para Revit, e a atualização trocou só o nome. A sua chave PRO continua valendo até o fim da assinatura.'],
  ['É grátis?', 'Sim, grátis, com versão PRO. As ferramentas do dia a dia são grátis para sempre; o PRO libera todas as outras.'],
  ['Quais versões do Revit ele aceita?', 'Revit 2025, 2026, 2027 e 2028, no Windows 10 ou 11 de 64 bits.'],
  ['Como compro o PRO?', 'Pelo WhatsApp: escolha o plano mensal ou o anual e combine o pagamento por Pix ou cartão.'],
  ['O PRO do plugin vale no Arquionie™?',
    'O Plugin PRO vale no Revit. O Arquionie™ PRO traz o programa e o plugin PRO juntos, para quem quer os dois.'],
  ['Serve para estudantes?', 'Sim, a versão grátis serve para estudantes. Não existe PRO para estudante.'],
];
