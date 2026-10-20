// Os textos da página do Comercial (/comercial, o CRM grátis; mockup docs/mockups/pagina-comercial do repositório do programa,
// aprovado por ÊDI em 19/10/2026). A tela, o llms.txt e os dados estruturados leem daqui.
// Os preços aparecem com EM BREVE até a compra existir (ÊDI, 19/10/2026), e os contratos ficam fora dos cartões até existirem no
// Comercial.

// Criar a conta já volta para o primeiro acesso do Comercial, e não para o painel geral.
export const CRIAR_CONTA = '/criar-conta?volta=/painel/comercial';

// O vídeo da aula "Comercial · primeiros passos", narrada pelo Nie (aprovada por ÊDI em 20/10/2026; o INPI foi protocolado em
// 14/10/2026). Está no canal @arquionie como não listado: só abre por este link. Sem endereço, a parte Aprender não aparece.
export const AULA_DO_COMERCIAL = 'https://www.youtube.com/watch?v=yvHOYWvfedc';

export const PASSOS_COMERCIAL = [
  ['Monte o formulário', 'Com a sua logo e a sua cor, a partir de um modelo: Arquitetura, Interiores ou Engenharia. O link vai para a bio e para o WhatsApp.'],
  ['Os pedidos caem no quadro', 'Solicitação, Em contato, Reunião, Retorno, Aprovado e Recusado. As etapas são suas: mude o nome, a cor e a ordem.'],
  ['Faça o orçamento', 'Área × R$ por m² × honorários, com até três pacotes, entrada, parcelas e o valor à vista.'],
  ['Envie a proposta pelo WhatsApp', 'Um link com a sua marca. Você vê quando o cliente abriu e quantas vezes.'],
  ['O cliente aceita pelo celular', 'O nome, a data e a hora ficam registrados, e o pedido vai para Aprovado.'],
];

export const RECURSOS_COMERCIAL = [
  ['Hoje', 'Os retornos do dia, os pedidos parados e as propostas abertas, cada um com o botão do WhatsApp.'],
  ['Quadro e lista', 'Arraste o pedido de uma etapa para outra, ou veja tudo em lista.'],
  ['Indicadores', 'Pedidos, conversão, tíquete médio, ganhos e o que está em negociação, por período.'],
  ['WhatsApp com a mensagem pronta', 'O botão abre o seu WhatsApp, do seu número, com a mensagem escrita. Você muda o texto nos Ajustes.'],
  ['A proposta do seu jeito', 'O modelo do Arquionie, um PDF ou o link do Canva, sempre pelo mesmo endereço, com a sua marca.'],
  ['Um formulário que filtra', 'Uma pergunta por tela, perguntas que aparecem conforme a resposta e uma saída educada para quem ainda não está pronto.'],
];

// Os números da Palheta, os mesmos da bio do Instagram (ÊDI, 19/10/2026: valem nas duas páginas, aqui e na /para-revit).
export const NUMEROS_COMERCIAL = [
  ['230+', 'igrejas projetadas'],
  ['26 e 9', 'estados e países atendidos'],
  ['9 dias', 'do pedido ao contrato, na mediana'],
];

// Três cartões só do Comercial (ÊDI, 19/10/2026): o grátis, o mensal (assinatura) e o anual (pagamento único, parcelável no cartão).
// O PRO de R$ 99 não aparece aqui: o Comercial completo vem junto para quem compra o Arquionie, e é vendido pela frente do Arquionie.
// Quem procura esta página quer só o CRM.
const ITENS_PAGOS = ['De 16 a 40 propostas por mês', 'De 6 a 10 formulários', 'Tudo o que o grátis tem'];

export const PLANOS_COMERCIAL = [
  {
    nome: 'Grátis',
    preco: 'R$ 0',
    nota: 'Para sempre.',
    itens: [
      'Até 15 propostas por mês',
      'Até 5 formulários',
      'Pedidos sem limite',
      'Os modelos de Arquitetura, Interiores e Engenharia',
      'O selo "Feito com Arquionie" no formulário e na proposta',
    ],
  },
  {
    nome: 'Mensal',
    preco: 'R$ 59,90',
    porMes: true,
    nota: 'Assinatura, renova todo mês.',
    itens: ITENS_PAGOS,
    emBreve: true,
  },
  {
    nome: 'Anual',
    etiqueta: '33% OFF',
    preco: 'R$ 39,90',
    porMes: true,
    nota: 'Pagamento único de R$ 478,80, em até 12 vezes no cartão.',
    itens: ITENS_PAGOS,
    emBreve: true,
    destaque: true,
  },
];

export const PERGUNTAS_COMERCIAL = [
  ['É grátis mesmo?', 'Sim. O grátis envia até 15 propostas por mês e tem até 5 formulários. Os pedidos que chegam não têm limite. Quem envia mais passa para um plano pago, sem perder nada.'],
  ['Preciso instalar alguma coisa?', 'Não. O Comercial funciona no navegador, no computador e no celular.'],
  ['Serve para interiores e para engenharia?', 'Sim. No primeiro acesso você escolhe o modelo: Arquitetura, Interiores ou Engenharia. Cada um traz o formulário, as etapas e a mensagem prontos, e tudo se muda depois.'],
  ['O WhatsApp manda mensagem sozinho?', 'Não. O botão abre o seu WhatsApp com a mensagem pronta, e quem envia é você, do seu número. Não tem custo.'],
  ['Os dados dos meus clientes ficam com quem?', 'Com o seu escritório. O formulário termina com o aceite do uso dos dados, e excluir um pedido apaga de verdade.'],
  ['Preciso usar o programa Arquionie?', 'Não. O Comercial funciona sozinho. Quem usa o programa manda o projeto ao cliente pelo mesmo caminho da proposta.'],
];
