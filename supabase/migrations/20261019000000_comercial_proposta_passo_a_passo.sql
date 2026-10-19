-- A SUA PROPOSTA, passo a passo (ÊDI, 19/10/2026; o site em src/pages/ComercialProposta.jsx). Os preços de fábrica mudam em três
-- coisas: os honorários de fábrica passam de 5% para 3% da obra ("5% da obra é muito"), e entram as palavras da proposta, o texto
-- sobre o escritório e as condições, que o modelo do Arquionie mostra ao cliente. Vale para quem começa o Comercial e para quem
-- volta ao de fábrica; quem já ajustou os preços fica como está.
create or replace function public.comercial_precos_de_fabrica() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "m2": {"Construção do zero": 3500, "Reforma": 2200, "Interiores": 1800, "Regularização": 1200, "Comercial": 3000},
    "honorarios": 3, "intermediario": 70, "basico": 50, "entrada": 30, "parcelas": 7, "desconto": 10, "validadeDias": 30,
    "escopo": [
      {"item": "Levantamento e programa", "desde": "basico"},
      {"item": "Estudo preliminar com 3D", "desde": "basico"},
      {"item": "Projeto legal para a prefeitura", "desde": "intermediario"},
      {"item": "Projeto executivo", "desde": "completo"},
      {"item": "4 visitas à obra", "desde": "completo"}
    ],
    "apresentacao": "Cuidamos do seu projeto do primeiro estudo até a obra pronta, com atenção a cada detalhe e ao seu orçamento.",
    "condicoes": [
      "As taxas da prefeitura, do conselho profissional e de cartório não estão incluídas.",
      "Visitas à obra além das previstas no pacote são cobradas à parte.",
      "Mudanças depois do projeto aprovado são orçadas à parte.",
      "O prazo começa a contar depois do pagamento da entrada."
    ]
  }'::jsonb
$$;
