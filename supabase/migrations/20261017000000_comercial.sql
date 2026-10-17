-- Arquionie™: o COMERCIAL, o CRM grátis do painel do escritório (doc 68 e mockup docs/mockups/crm-gratis do repositório do programa,
-- aprovados por ÊDI em 15 e 16/10/2026; o contrato no doc 72 de lá). O escritório monta o formulário, recebe os pedidos no quadro,
-- faz o orçamento, manda a proposta pelo WhatsApp e o cliente aceita pelo link. Rodar uma vez no SQL Editor do projeto arquionie,
-- depois da 20261016000000_compra_do_pro.sql. Pode rodar duas vezes sem estragar nada.
--
-- As decisões de ÊDI (15 e 16/10/2026): tudo o que ele listou é grátis (o formulário, o quadro com as etapas livres, os indicadores,
-- a proposta pelos três jeitos e o envio pelo WhatsApp); seis etapas de fábrica (SOLICITAÇÃO, EM CONTATO, REUNIÃO, RETORNO, APROVADO e
-- RECUSADO), cada uma com o tipo que os indicadores leem; o orçamento no padrão do sistema Palheta (o valor pelo m², os três pacotes, o
-- pagamento); "pedido" no lugar de "lead"; o selo "Feito com Arquionie" no grátis; o PRO do Arquionie tira o selo e destrava o resto.
--
-- Quem chama o quê:
--   formulário e proposta do cliente (sem conta) .. comercial_formulario_abrir, comercial_proposta_abrir, comercial_proposta_aceitar,
--                                                  comercial_denunciar
--   função comercial (do servidor) ................ comercial_pedido_criar (depois do Turnstile), comercial_proposta_pdf,
--                                                  comercial_mover_parados e comercial_lixo_pegar (a tarefa diária) — só com a
--                                                  chave secreta
--   site (pessoa com conta; p_area = o escritório, a conta dela ou uma em que está na equipe):
--     comercial_iniciar, comercial_estado, comercial_pedido, comercial_pedido_novo, comercial_pedido_salvar, comercial_pedido_mover,
--     comercial_whatsapp, comercial_anotar, comercial_pedido_excluir, comercial_formulario_salvar, comercial_formulario_excluir,
--     comercial_ajustes_salvar, comercial_proposta_criar, comercial_exportar
--   site (/gestao) ................................ gestao_comercial, gestao_comercial_pausar

-- ------------------------------------------------------------------------------------------------ ajustes gerais
create table if not exists public.ajustes_comercial (
  id boolean primary key default true check (id),
  livres_no_lancamento boolean not null default true,                         -- no lançamento, ninguém esbarra nos limites do grátis
  formularios_gratis int not null default 3 check (formularios_gratis between 1 and 100),
  espaco_gratis_mb int not null default 300 check (espaco_gratis_mb between 10 and 100000),
  espaco_pro_mb int not null default 5000 check (espaco_pro_mb between 10 and 1000000),
  pedidos_por_hora int not null default 10 check (pedidos_por_hora between 1 and 1000),  -- do mesmo endereço, contra o lixo
  pedidos_por_dia int not null default 300 check (pedidos_por_dia between 1 and 100000)  -- por formulário
);
insert into public.ajustes_comercial (id) values (true) on conflict (id) do nothing;
alter table public.ajustes_comercial enable row level security;

-- ------------------------------------------------------------------------------------------------ as tabelas
-- Os ajustes de cada escritório (a conta do responsável): as etapas, as regras, as mensagens, os motivos de recusa e os preços da ficha.
create table if not exists public.comercial_ajustes (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  modelo text not null default 'arquitetura' check (modelo in ('arquitetura', 'interiores', 'engenharia')),
  etapas jsonb not null,
  regras jsonb not null,
  mensagens jsonb not null,
  motivos jsonb not null,
  precos jsonb not null,
  whatsapp text not null default '' check (whatsapp ~ '^([0-9]{12,13})?$'),   -- o FALAR NO WHATSAPP das páginas do cliente
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.comercial_ajustes add column if not exists whatsapp text not null default '' check (whatsapp ~ '^([0-9]{12,13})?$');
alter table public.comercial_ajustes enable row level security;

-- Os formulários: o endereço público (arquionie.com.br/f/CODIGO), as perguntas e a versão (cada pedido guarda as perguntas como
-- estavam quando respondeu).
create table if not exists public.comercial_formularios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[A-Z0-9][A-Z0-9-]{2,39}$'),
  nome text not null check (length(btrim(nome)) between 1 and 80),
  perguntas jsonb not null check (jsonb_typeof(perguntas) = 'array'),
  desvio jsonb not null default '{}'::jsonb,
  versao int not null default 1,
  ativo boolean not null default true,
  pausado_pelo_gestor boolean not null default false,
  denuncias int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists comercial_formularios_usuario on public.comercial_formularios (usuario_id);
alter table public.comercial_formularios enable row level security;

-- Os pedidos (o "lead" no mercado; "pedido" é a palavra do escritório, ÊDI 16/10/2026): os campos-chave, as respostas, a etapa, o
-- orçamento e o controle.
create table if not exists public.comercial_pedidos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  numero int not null,
  formulario_id uuid references public.comercial_formularios (id) on delete set null,
  formulario_nome text not null default '',
  respostas jsonb not null default '[]'::jsonb,
  etapa text not null,
  etapa_desde timestamptz not null default now(),
  nome text not null check (length(btrim(nome)) between 1 and 120),
  whatsapp text not null default '' check (whatsapp ~ '^([0-9]{10,13})?$'),
  email text not null default '' check (length(email) <= 200),
  cidade text not null default '' check (length(cidade) <= 120),
  tipo text not null default '' check (length(tipo) <= 120),
  area numeric check (area is null or area between 0 and 1000000),
  obra text not null default '' check (length(obra) <= 120),
  inicio text not null default '' check (length(inicio) <= 60),
  origem text not null default '' check (length(origem) <= 60),
  valor numeric check (valor is null or valor between 0 and 1000000000),
  nota int check (nota is null or nota between 0 and 5),
  retorno date,
  reuniao timestamptz,
  motivo text not null default '' check (length(motivo) <= 80),
  observacoes text not null default '' check (length(observacoes) <= 4000),
  orcamento jsonb not null default '{}'::jsonb check (jsonb_typeof(orcamento) = 'object' and length(orcamento::text) <= 40000),
  responsavel uuid references auth.users (id) on delete set null,
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{16,64}$'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (usuario_id, numero)
);
create index if not exists comercial_pedidos_usuario on public.comercial_pedidos (usuario_id, etapa);
create index if not exists comercial_pedidos_ip on public.comercial_pedidos (ip_hash, criado_em);
alter table public.comercial_pedidos enable row level security;

-- A linha do tempo de cada pedido, que se escreve sozinha.
create table if not exists public.comercial_atividades (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.comercial_pedidos (id) on delete cascade,
  tipo text not null check (tipo in ('chegou', 'criado', 'etapa', 'whatsapp', 'proposta', 'abriu', 'aceite', 'anotacao', 'reuniao', 'retorno')),
  dados jsonb not null default '{}'::jsonb,
  por uuid references auth.users (id) on delete set null,
  em timestamptz not null default now()
);
create index if not exists comercial_atividades_pedido on public.comercial_atividades (pedido_id, em);
alter table public.comercial_atividades enable row level security;

-- As propostas: o endereço público (arquionie.com.br/p/CODIGO), o jeito (PDF, link ou o modelo do Arquionie), as aberturas e o aceite.
create table if not exists public.comercial_propostas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.comercial_pedidos (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{8}$'),
  jeito text not null check (jeito in ('pdf', 'link', 'modelo')),
  arquivo text check (arquivo is null or arquivo ~ '^comercial/[a-z0-9-]{36}/[A-HJ-NP-Z2-9]{8}\.pdf$'),
  tamanho bigint not null default 0 check (tamanho between 0 and 10485760),
  link text check (link is null or (link ~ '^https://' and length(link) <= 500)),
  conteudo jsonb not null default '{}'::jsonb check (jsonb_typeof(conteudo) = 'object' and length(conteudo::text) <= 40000),
  valor numeric check (valor is null or valor between 0 and 1000000000),
  valida_ate date,
  enviada_em timestamptz not null default now(),
  enviada_por uuid references auth.users (id) on delete set null,
  aberturas int not null default 0,
  ultima_abertura timestamptz,
  aceite jsonb,
  aceita_em timestamptz
);
create index if not exists comercial_propostas_pedido on public.comercial_propostas (pedido_id);
alter table public.comercial_propostas enable row level security;

-- As denúncias do formulário público (DENUNCIAR no rodapé): chegam ao /gestao, que pode pausar o formulário.
create table if not exists public.comercial_denuncias (
  id uuid primary key default gen_random_uuid(),
  formulario_id uuid not null references public.comercial_formularios (id) on delete cascade,
  motivo text not null check (length(btrim(motivo)) between 1 and 500),
  criado_em timestamptz not null default now()
);
alter table public.comercial_denuncias enable row level security;

-- Os PDFs que saíram do banco (pedido excluído) e ainda estão no R2: a tarefa diária da função comercial apaga e esvazia.
create table if not exists public.comercial_lixo (
  arquivo text primary key check (arquivo ~ '^comercial/'),
  criado_em timestamptz not null default now()
);
alter table public.comercial_lixo enable row level security;
-- Ninguém lê nem escreve as tabelas direto: só pelas funções abaixo.

-- ------------------------------------------------------------------------------------------------ o de fábrica
-- As seis etapas de fábrica (ÊDI, 16/10/2026): o fluxo da Palheta é um fluxo, não o padrão; quem não responde ou não tem o perfil
-- vai para RECUSADO, com o motivo. O tipo é o que os indicadores leem; o aviso é quantos dias parado até pedir atenção.
-- O dia de hoje e o começo do mês no Brasil. O relógio do Supabase é UTC: depois das 21h de Brasília, o current_date já é amanhã e o
-- "Retorno hoje" virava antes da hora.
create or replace function public.comercial_hoje() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
create or replace function public.comercial_inicio_do_mes() returns timestamptz
language sql stable set search_path = '' as $$ select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' $$;

create or replace function public.comercial_etapas_de_fabrica() returns jsonb
language sql immutable set search_path = '' as $$
  select '[
    {"id": "solicitacao", "nome": "Solicitação", "cor": "#8E8A86", "tipo": "andamento", "aviso": 2},
    {"id": "contato", "nome": "Em contato", "cor": "#4F7BD8", "tipo": "andamento", "aviso": 14},
    {"id": "reuniao", "nome": "Reunião", "cor": "#8E6CCB", "tipo": "andamento", "aviso": 7},
    {"id": "retorno", "nome": "Retorno", "cor": "#D2952A", "tipo": "andamento", "aviso": null, "pelaData": true},
    {"id": "aprovado", "nome": "Aprovado", "cor": "#3E9A63", "tipo": "ganho", "aviso": null},
    {"id": "recusado", "nome": "Recusado", "cor": "#C25B5B", "tipo": "perdido", "aviso": null}
  ]'::jsonb
$$;

-- As regras de fábrica (as do sistema Palheta ligadas; a de mover o parado, desligada).
create or replace function public.comercial_regras_de_fabrica() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "whatsapp": {"liga": true, "de": "solicitacao", "para": "contato"},
    "proposta": {"liga": true, "para": "retorno"},
    "reuniao": {"liga": true, "para": "reuniao"},
    "aceite": {"liga": true, "para": "aprovado"},
    "parado": {"liga": false, "para": "recusado", "motivo": "Sem resposta"}
  }'::jsonb
$$;

create or replace function public.comercial_mensagens_de_fabrica() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'primeiroContato', 'Olá, {nome}! Aqui é {pessoa}, da {escritorio}. Recebi o seu pedido de projeto. Podemos conversar?',
    'proposta', 'Olá, {nome}! Segue a sua proposta da {escritorio}: {link} {retorno}',
    'retorno', 'Ficou combinado de você me dar um retorno no dia {data}. Vou te ligar.')
$$;

create or replace function public.comercial_motivos_de_fabrica() returns jsonb
language sql immutable set search_path = '' as $$
  select '["Sem resposta", "Fora do perfil", "Preço", "Prazo", "Escolheu outro", "Desistiu da obra", "Outro"]'::jsonb
$$;

-- Os preços da ficha (mockup, seção 8): o R$/m² de obra por tipo, os honorários sobre a obra, os pacotes, o pagamento e o escopo.
create or replace function public.comercial_precos_de_fabrica() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "m2": {"Construção do zero": 3500, "Reforma": 2200, "Interiores": 1800, "Regularização": 1200, "Comercial": 3000},
    "honorarios": 5, "intermediario": 70, "basico": 50, "entrada": 30, "parcelas": 7, "desconto": 10, "validadeDias": 30,
    "escopo": [
      {"item": "Levantamento e programa", "desde": "basico"},
      {"item": "Estudo preliminar com 3D", "desde": "basico"},
      {"item": "Projeto legal para a prefeitura", "desde": "intermediario"},
      {"item": "Projeto executivo", "desde": "completo"},
      {"item": "4 visitas à obra", "desde": "completo"}
    ]
  }'::jsonb
$$;

-- Os formulários de fábrica, um por jeito de trabalhar (o primeiro acesso). O de ARQUITETURA é o CASA E REFORMA do mockup (onze
-- perguntas, com o desvio do terreno desligado de fábrica). A privacidade é sempre a última.
create or replace function public.comercial_formulario_de_fabrica(p_modelo text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p_modelo
  when 'interiores' then '{
    "nome": "Interiores",
    "perguntas": [
      {"id": "objetivo", "tipo": "escolha", "texto": "O que você quer fazer?", "obrigatoria": true, "chave": "tipo", "noCard": true,
       "opcoes": [{"texto": "Interiores"}, {"texto": "Marcenaria"}, {"texto": "Decoração"}, {"texto": "Outro"}]},
      {"id": "ambientes", "tipo": "multipla", "texto": "Quais ambientes?", "obrigatoria": true,
       "opcoes": [{"texto": "Sala"}, {"texto": "Cozinha"}, {"texto": "Quartos"}, {"texto": "Banheiros"}, {"texto": "Área externa"}, {"texto": "Comercial"}]},
      {"id": "area", "tipo": "area", "texto": "Qual a área aproximada?", "obrigatoria": false, "chave": "area", "noCard": true},
      {"id": "cidade", "tipo": "cidade", "texto": "Onde fica?", "obrigatoria": true, "chave": "cidade", "noCard": true},
      {"id": "investimento", "tipo": "faixa", "texto": "Quanto pretende investir?", "ajuda": "Um valor aproximado já ajuda.", "obrigatoria": true, "chave": "obra",
       "opcoes": [{"texto": "Até R$ 50 mil"}, {"texto": "R$ 50 mil a R$ 150 mil"}, {"texto": "R$ 150 mil a R$ 300 mil"}, {"texto": "Acima de R$ 300 mil"}, {"texto": "Ainda não sei"}]},
      {"id": "inicio", "tipo": "mes-ano", "texto": "Quando quer começar?", "obrigatoria": false, "chave": "inicio"},
      {"id": "origem", "tipo": "escolha", "texto": "Como nos conheceu?", "obrigatoria": false, "chave": "origem",
       "opcoes": [{"texto": "Instagram"}, {"texto": "Indicação"}, {"texto": "Google"}, {"texto": "Outro"}]},
      {"id": "dados", "tipo": "contato", "texto": "Para falarmos com você", "obrigatoria": true},
      {"id": "privacidade", "tipo": "privacidade", "texto": "Privacidade", "obrigatoria": true}
    ]}'::jsonb
  when 'engenharia' then '{
    "nome": "Projeto de engenharia",
    "perguntas": [
      {"id": "disciplina", "tipo": "multipla", "texto": "Qual projeto você precisa?", "obrigatoria": true, "chave": "tipo", "noCard": true,
       "opcoes": [{"texto": "Estrutural"}, {"texto": "Elétrico"}, {"texto": "Hidrossanitário"}, {"texto": "Regularização"}, {"texto": "Outro"}]},
      {"id": "arquitetura", "tipo": "escolha", "texto": "Já existe o projeto de arquitetura?", "obrigatoria": true,
       "opcoes": [{"texto": "Sim"}, {"texto": "Está sendo feito"}, {"texto": "Ainda não"}]},
      {"id": "area", "tipo": "area", "texto": "Qual a área aproximada?", "obrigatoria": true, "chave": "area", "noCard": true},
      {"id": "cidade", "tipo": "cidade", "texto": "Onde fica?", "obrigatoria": true, "chave": "cidade", "noCard": true},
      {"id": "inicio", "tipo": "mes-ano", "texto": "Para quando precisa?", "obrigatoria": false, "chave": "inicio"},
      {"id": "origem", "tipo": "escolha", "texto": "Como nos conheceu?", "obrigatoria": false, "chave": "origem",
       "opcoes": [{"texto": "Instagram"}, {"texto": "Indicação"}, {"texto": "Google"}, {"texto": "Outro"}]},
      {"id": "dados", "tipo": "contato", "texto": "Para falarmos com você", "obrigatoria": true},
      {"id": "privacidade", "tipo": "privacidade", "texto": "Privacidade", "obrigatoria": true}
    ]}'::jsonb
  else '{
    "nome": "Casa e reforma",
    "perguntas": [
      {"id": "objetivo", "tipo": "escolha", "texto": "O que você quer fazer?", "obrigatoria": true, "chave": "tipo", "noCard": true,
       "opcoes": [{"texto": "Construir do zero"}, {"texto": "Reformar"}, {"texto": "Interiores"}, {"texto": "Regularizar na prefeitura"}, {"texto": "Outro"}]},
      {"id": "terreno", "tipo": "escolha", "texto": "Você já tem o terreno ou o imóvel?", "obrigatoria": true,
       "opcoes": [{"texto": "Sim"}, {"texto": "Ainda não", "desvio": false}]},
      {"id": "area", "tipo": "area", "texto": "Qual a área aproximada?", "obrigatoria": false, "chave": "area", "noCard": true},
      {"id": "cidade", "tipo": "cidade", "texto": "Onde fica?", "obrigatoria": true, "chave": "cidade", "noCard": true},
      {"id": "investimento", "tipo": "faixa", "texto": "Quanto pretende investir na obra?", "ajuda": "Um valor aproximado já ajuda.",
       "obrigatoria": true, "chave": "obra", "noCard": true,
       "mostrarSe": {"pergunta": "objetivo", "respostas": ["Construir do zero", "Reformar"]},
       "opcoes": [{"texto": "Até R$ 300 mil"}, {"texto": "R$ 300 mil a R$ 500 mil"}, {"texto": "R$ 500 mil a R$ 800 mil"}, {"texto": "Acima de R$ 800 mil"}, {"texto": "Ainda não sei"}]},
      {"id": "inicio", "tipo": "mes-ano", "texto": "Quando quer começar?", "obrigatoria": false, "chave": "inicio"},
      {"id": "decide", "tipo": "escolha", "texto": "Quem decide sobre o projeto?", "obrigatoria": false,
       "opcoes": [{"texto": "Eu"}, {"texto": "Eu e outra pessoa"}, {"texto": "Outra pessoa"}]},
      {"id": "referencias", "tipo": "link", "texto": "Tem referências?", "ajuda": "Um link do Pinterest ou do Instagram.", "obrigatoria": false},
      {"id": "origem", "tipo": "escolha", "texto": "Como nos conheceu?", "obrigatoria": false, "chave": "origem",
       "opcoes": [{"texto": "Instagram"}, {"texto": "Indicação"}, {"texto": "Google"}, {"texto": "Outro"}]},
      {"id": "dados", "tipo": "contato", "texto": "Para falarmos com você", "obrigatoria": true},
      {"id": "privacidade", "tipo": "privacidade", "texto": "Privacidade", "obrigatoria": true}
    ]}'::jsonb
  end
$$;

-- ------------------------------------------------------------------------------------------------ ajudantes
-- Um código sorteado no alfabeto sem I, O, 0 e 1 (os que se confundem), com bytes sorteados de verdade.
create or replace function public.comercial_sortear(p_tamanho int) returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_letras constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := decode(md5(gen_random_uuid()::text), 'hex') || decode(md5(gen_random_uuid()::text), 'hex');
  v text := '';
begin
  for i in 0 .. p_tamanho - 1 loop
    v := v || substr(v_letras, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return v;
end $$;

-- O pedaço de endereço de um nome: sem acento, em maiúsculas, com hífen no lugar do resto.
create or replace function public.comercial_trecho(p text, p_max int default 20) returns text
language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(upper(translate(lower(coalesce(p, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')), '[^A-Z0-9]+', '-', 'g'), '-'), p_max)
$$;

-- O endereço novo de um formulário: a primeira palavra do escritório e a do formulário (LIMA-CASA), com -2, -3… se já existir.
create or replace function public.comercial_endereco_novo(p_usuario uuid, p_nome text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_base text;
  v text;
  n int := 1;
begin
  v_base := concat_ws('-', nullif(split_part(public.comercial_trecho(public.nome_do_escritorio(p_usuario)), '-', 1), ''),
                           nullif(split_part(public.comercial_trecho(p_nome), '-', 1), ''));
  if v_base is null or length(v_base) < 3 or v_base ~ '@' then
    v_base := 'F-' || public.comercial_sortear(5);
  end if;
  v_base := left(v_base, 34);
  v := v_base;
  while exists (select 1 from public.comercial_formularios where codigo = v) loop
    n := n + 1;
    v := v_base || '-' || n;
  end loop;
  return v;
end $$;

-- O escritório de quem chama: a área pedida, se a pessoa é o responsável ou está na equipe dele; senão, recusa.
create or replace function public.comercial_area(p_area uuid, p_so_responsavel boolean default false) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_area uuid := coalesce(p_area, (select auth.uid()));
begin
  if v_usuario is null then
    raise exception 'sem conta' using errcode = '42501';
  end if;
  if not public.da_equipe(v_usuario, v_area) or (p_so_responsavel and v_usuario <> v_area) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return v_area;
end $$;

-- O escritório é PRO? O PRO do Arquionie destrava o Comercial PRO, sem preço novo (doc 68, seção 5).
create or replace function public.comercial_pro(p_usuario uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.licenca_em_uso(p_usuario, 'arquionie')).id is not null
$$;

create or replace function public.comercial_ajustes_de(p_usuario uuid) returns public.comercial_ajustes
language sql stable security definer set search_path = '' as $$
  select * from public.comercial_ajustes where usuario_id = p_usuario
$$;

-- A etapa de um id nos ajustes (nulo se não existe).
create or replace function public.comercial_etapa(p_etapas jsonb, p_id text) returns jsonb
language sql immutable set search_path = '' as $$
  select e from jsonb_array_elements(p_etapas) e where e ->> 'id' = p_id limit 1
$$;

-- O WhatsApp só com os números, com o 55 do Brasil quando faltar (10 ou 11 números).
create or replace function public.comercial_whatsapp_limpo(p text) returns text
language sql immutable set search_path = '' as $$
  select case when length(d) in (10, 11) then '55' || d when length(d) between 12 and 13 then d else '' end
    from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

-- Escreve na linha do tempo.
create or replace function public.comercial_registrar(p_pedido uuid, p_tipo text, p_dados jsonb, p_por uuid) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.comercial_atividades (pedido_id, tipo, dados, por) values (p_pedido, p_tipo, coalesce(p_dados, '{}'::jsonb), p_por)
$$;

-- Muda a etapa de um pedido (e anota na linha do tempo), se for outra.
create or replace function public.comercial_trocar_etapa(p_pedido uuid, p_para text, p_motivo text, p_por uuid, p_porque text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_de text;
begin
  select etapa into v_de from public.comercial_pedidos where id = p_pedido;
  if v_de is null or v_de = p_para then
    return false;
  end if;
  update public.comercial_pedidos set etapa = p_para, etapa_desde = now(), motivo = coalesce(p_motivo, ''), atualizado_em = now()
   where id = p_pedido;
  perform public.comercial_registrar(p_pedido, 'etapa',
    jsonb_strip_nulls(jsonb_build_object('de', v_de, 'para', p_para, 'motivo', nullif(p_motivo, ''), 'porque', p_porque)), p_por);
  return true;
end $$;

-- Aplica uma regra de movimento (whatsapp, proposta, reuniao, aceite) se estiver ligada e a etapa de destino existir.
create or replace function public.comercial_regra(p_pedido uuid, p_regra text, p_por uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.comercial_pedidos;
  a public.comercial_ajustes;
  r jsonb;
begin
  select * into p from public.comercial_pedidos where id = p_pedido;
  a := public.comercial_ajustes_de(p.usuario_id);
  r := a.regras -> p_regra;
  if r is null or not coalesce((r ->> 'liga')::boolean, false) or public.comercial_etapa(a.etapas, r ->> 'para') is null then
    return false;
  end if;
  if r ? 'de' and p.etapa <> r ->> 'de' then
    return false;
  end if;
  -- uma regra nunca tira o pedido de uma etapa GANHO ou PERDIDO (só a pessoa, movendo)
  if (public.comercial_etapa(a.etapas, p.etapa) ->> 'tipo') <> 'andamento' and p_regra <> 'aceite' then
    return false;
  end if;
  return public.comercial_trocar_etapa(p_pedido, r ->> 'para', null, p_por, p_regra);
end $$;

-- Troca as variáveis de uma mensagem.
create or replace function public.comercial_mensagem(p_texto text, p_vars jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := coalesce(p_texto, '');
  k text;
begin
  for k in select jsonb_object_keys(p_vars) loop
    v := replace(v, '{' || k || '}', coalesce(p_vars ->> k, ''));
  end loop;
  return btrim(regexp_replace(v, ' {2,}', ' ', 'g'));
end $$;

-- O pedido como o card e a lista mostram.
create or replace function public.comercial_cartao(p public.comercial_pedidos) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'numero', p.numero, 'etapa', p.etapa, 'etapaDesde', p.etapa_desde, 'nome', p.nome, 'whatsapp', p.whatsapp,
    'tipo', p.tipo, 'cidade', p.cidade, 'area', p.area, 'obra', p.obra, 'origem', p.origem, 'valor', p.valor, 'nota', p.nota,
    'retorno', p.retorno, 'reuniao', p.reuniao, 'motivo', p.motivo, 'criadoEm', p.criado_em,
    'proposta', (select jsonb_build_object('aberturas', x.aberturas, 'ultimaAbertura', x.ultima_abertura, 'aceitaEm', x.aceita_em,
                   'enviadaEm', x.enviada_em)
                   from public.comercial_propostas x where x.pedido_id = p.id order by x.enviada_em desc limit 1))
$$;

-- ------------------------------------------------------------------------------------------------ as perguntas (o criador)
-- Confere as perguntas de um formulário e devolve a lista arrumada (a privacidade sempre no fim). Erro com a frase para a pessoa.
create or replace function public.comercial_perguntas_conferidas(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  q jsonb;
  o jsonb;
  v_ids text[] := '{}';
  v_out jsonb := '[]'::jsonb;
  v_tipos constant text[] := array['texto-curto', 'texto-longo', 'escolha', 'multipla', 'lista', 'data', 'mes-ano', 'numero', 'area',
    'valor', 'faixa', 'contato', 'cidade', 'link', 'nota', 'secao'];
  v_chaves constant text[] := array['nome', 'whatsapp', 'email', 'cidade', 'tipo', 'area', 'obra', 'inicio', 'origem'];
  v_com_opcoes constant text[] := array['escolha', 'multipla', 'lista', 'faixa'];
  v_contato boolean := false;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    raise exception 'As perguntas vieram num formato que não dá para ler.';
  end if;
  for q in select x from jsonb_array_elements(p) x loop
    if q ->> 'tipo' = 'privacidade' then
      continue;  -- a privacidade é posta sempre no fim, abaixo
    end if;
    if not (q ->> 'tipo' = any (v_tipos)) then
      raise exception 'Tipo de pergunta desconhecido: %.', coalesce(q ->> 'tipo', 'vazio');
    end if;
    if coalesce(q ->> 'id', '') !~ '^[a-z0-9-]{1,24}$' or q ->> 'id' = 'privacidade' or q ->> 'id' = any (v_ids) then
      raise exception 'Cada pergunta precisa de um código só dela.';
    end if;
    if length(btrim(coalesce(q ->> 'texto', ''))) not between 1 and 200 then
      raise exception 'Toda pergunta precisa de um texto de até 200 letras.';
    end if;
    if length(coalesce(q ->> 'ajuda', '')) > 300 then
      raise exception 'A ajuda de uma pergunta vai até 300 letras.';
    end if;
    if q ? 'chave' and q -> 'chave' <> 'null'::jsonb and not (q ->> 'chave' = any (v_chaves)) then
      raise exception 'Campo-chave desconhecido: %.', q ->> 'chave';
    end if;
    if q ->> 'tipo' = any (v_com_opcoes) then
      if jsonb_typeof(q -> 'opcoes') <> 'array' or jsonb_array_length(q -> 'opcoes') not between 1 and 30 then
        raise exception 'A pergunta "%" precisa de 1 a 30 opções.', q ->> 'texto';
      end if;
      for o in select x from jsonb_array_elements(q -> 'opcoes') x loop
        if length(btrim(coalesce(o ->> 'texto', ''))) not between 1 and 120 then
          raise exception 'Toda opção precisa de um texto de até 120 letras.';
        end if;
      end loop;
    end if;
    if q ? 'mostrarSe' and q -> 'mostrarSe' <> 'null'::jsonb and not ((q -> 'mostrarSe' ->> 'pergunta') = any (v_ids)) then
      raise exception 'A regra "mostrar só se" da pergunta "%" precisa apontar para uma pergunta de antes.', q ->> 'texto';
    end if;
    if q ->> 'tipo' = 'contato' then
      v_contato := true;
    end if;
    v_ids := v_ids || (q ->> 'id');
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', q ->> 'id', 'tipo', q ->> 'tipo', 'texto', btrim(q ->> 'texto'), 'ajuda', nullif(btrim(coalesce(q ->> 'ajuda', '')), ''),
      'obrigatoria', coalesce((q ->> 'obrigatoria')::boolean, false), 'chave', nullif(q ->> 'chave', ''),
      'noCard', case when coalesce((q ->> 'noCard')::boolean, false) then true end,
      'opcoes', case when q ->> 'tipo' = any (v_com_opcoes) then (
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('texto', btrim(x ->> 'texto'),
          'desvio', case when coalesce((x ->> 'desvio')::boolean, false) then true end)))
          from jsonb_array_elements(q -> 'opcoes') x) end,
      'mostrarSe', case when q ? 'mostrarSe' and q -> 'mostrarSe' <> 'null'::jsonb then q -> 'mostrarSe' end)));
  end loop;
  if jsonb_array_length(v_out) not between 1 and 40 then
    raise exception 'Um formulário tem de 1 a 40 perguntas.';
  end if;
  if not v_contato and not exists (select 1 from jsonb_array_elements(v_out) x where x ->> 'chave' in ('whatsapp', 'email')) then
    raise exception 'O formulário precisa pedir o WhatsApp ou o e-mail, para o escritório responder.';
  end if;
  return v_out || jsonb_build_array(jsonb_build_object('id', 'privacidade', 'tipo', 'privacidade', 'texto', 'Privacidade', 'obrigatoria', true));
end $$;

-- ------------------------------------------------------------------------------------------------ o primeiro acesso e o estado
-- O primeiro acesso: os ajustes e o formulário de fábrica do jeito de trabalhar escolhido. Se já existem, só devolve o estado.
create or replace function public.comercial_iniciar(p_modelo text default 'arquitetura') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(null, true);
  v_modelo text := case when p_modelo in ('arquitetura', 'interiores', 'engenharia') then p_modelo else 'arquitetura' end;
  v_form jsonb := public.comercial_formulario_de_fabrica(v_modelo);
begin
  if not exists (select 1 from public.comercial_ajustes where usuario_id = v_area) then
    insert into public.comercial_ajustes (usuario_id, modelo, etapas, regras, mensagens, motivos, precos)
    values (v_area, v_modelo, public.comercial_etapas_de_fabrica(), public.comercial_regras_de_fabrica(),
            public.comercial_mensagens_de_fabrica(), public.comercial_motivos_de_fabrica(), public.comercial_precos_de_fabrica());
    insert into public.comercial_formularios (usuario_id, codigo, nome, perguntas, desvio)
    values (v_area, public.comercial_endereco_novo(v_area, v_form ->> 'nome'), v_form ->> 'nome',
            public.comercial_perguntas_conferidas(v_form -> 'perguntas'),
            jsonb_build_object('titulo', 'Obrigada pelo interesse!',
              'texto', 'Começamos os projetos quando o terreno ou o imóvel já está definido. Quando tiver o seu, preencha de novo: vamos adorar conversar.'));
  end if;
  return public.comercial_estado(v_area);
end $$;

-- O estado do Comercial de um escritório: os ajustes, os formulários, os indicadores do período, HOJE e os pedidos para o quadro.
-- p_de e p_ate filtram os indicadores (de fábrica, o ano de agora). Sem ajustes ainda, diz "novo" (o site mostra o primeiro acesso).
create or replace function public.comercial_estado(p_area uuid default null, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area);
  a public.comercial_ajustes;
  v_de date := coalesce(p_de, date_trunc('year', public.comercial_hoje())::date);
  v_ate date := coalesce(p_ate, (date_trunc('year', public.comercial_hoje()) + interval '1 year' - interval '1 day')::date);
  v_pro boolean := public.comercial_pro(v_area);
  v_tipos jsonb;
  v_ind jsonb;
  v_hoje jsonb;
begin
  a := public.comercial_ajustes_de(v_area);
  if a.usuario_id is null then
    return jsonb_build_object('novo', true, 'escritorio', public.nome_do_escritorio(v_area), 'responsavel', (select auth.uid()) = v_area);
  end if;
  select jsonb_object_agg(e ->> 'id', e ->> 'tipo') into v_tipos from jsonb_array_elements(a.etapas) e;

  -- os cinco números do topo (os do sistema Palheta, com as palavras do escritório)
  select jsonb_build_object(
      'pedidos', count(*),
      'emAndamento', count(*) filter (where v_tipos ->> p.etapa = 'andamento'),
      'ganhos', count(*) filter (where v_tipos ->> p.etapa = 'ganho'),
      'conversao', case when count(*) = 0 then 0
                   else round(100.0 * count(*) filter (where v_tipos ->> p.etapa = 'ganho') / count(*)) end,
      'ticketMedio', coalesce(round(avg(p.valor) filter (where v_tipos ->> p.etapa = 'ganho' and p.valor > 0)), 0),
      'valorGanho', coalesce(sum(p.valor) filter (where v_tipos ->> p.etapa = 'ganho'), 0),
      'emNegociacao', coalesce(sum(p.valor) filter (where v_tipos ->> p.etapa = 'andamento'), 0))
    into v_ind
    from public.comercial_pedidos p
   where p.usuario_id = v_area and (p.criado_em at time zone 'America/Sao_Paulo')::date between v_de and v_ate;

  -- HOJE: os retornos de hoje e os vencidos, os parados além do aviso da etapa e as propostas abertas sem resposta
  select coalesce(jsonb_agg(h order by h ->> 'ordem', h ->> 'em'), '[]'::jsonb) into v_hoje from (
    select jsonb_build_object('motivo', 'retorno', 'ordem', '1', 'em', p.retorno, 'pedido', public.comercial_cartao(p)) h
      from public.comercial_pedidos p
     where p.usuario_id = v_area and v_tipos ->> p.etapa = 'andamento' and p.retorno is not null and p.retorno <= public.comercial_hoje()
    union all
    select jsonb_build_object('motivo', 'parado', 'ordem', '2', 'em', p.etapa_desde,
             'dias', floor(extract(epoch from now() - p.etapa_desde) / 86400), 'pedido', public.comercial_cartao(p))
      from public.comercial_pedidos p
      join lateral (select public.comercial_etapa(a.etapas, p.etapa) e) x on true
     where p.usuario_id = v_area and x.e ->> 'tipo' = 'andamento' and (x.e ->> 'aviso') is not null
       and now() - p.etapa_desde > make_interval(days => (x.e ->> 'aviso')::int)
       and (p.retorno is null or p.retorno > public.comercial_hoje())
    union all
    select jsonb_build_object('motivo', 'abriu', 'ordem', '3', 'em', x.ultima_abertura, 'aberturas', x.aberturas,
             'pedido', public.comercial_cartao(p))
      from public.comercial_pedidos p
      join lateral (select * from public.comercial_propostas y where y.pedido_id = p.id order by y.enviada_em desc limit 1) x on true
     where p.usuario_id = v_area and v_tipos ->> p.etapa = 'andamento' and x.aberturas > 0 and x.aceita_em is null
       and x.ultima_abertura > now() - interval '7 days'
       and (p.retorno is null or p.retorno > public.comercial_hoje())
  ) t;

  return jsonb_build_object(
    'novo', false,
    'escritorio', public.nome_do_escritorio(v_area),
    'responsavel', (select auth.uid()) = v_area,
    'pro', v_pro,
    'selo', not v_pro,
    'periodo', jsonb_build_object('de', v_de, 'ate', v_ate),
    'ajustes', jsonb_build_object('modelo', a.modelo, 'whatsapp', a.whatsapp, 'etapas', a.etapas, 'regras', a.regras, 'mensagens', a.mensagens,
                 'motivos', a.motivos, 'precos', a.precos),
    'formularios', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'codigo', f.codigo, 'nome', f.nome, 'ativo', f.ativo,
                       'pausadoPeloGestor', f.pausado_pelo_gestor, 'versao', f.versao, 'perguntas', f.perguntas, 'desvio', f.desvio,
                       'respostasNoMes', (select count(*) from public.comercial_pedidos p where p.formulario_id = f.id
                                           and p.criado_em > public.comercial_inicio_do_mes()))
                       order by f.criado_em), '[]'::jsonb)
                     from public.comercial_formularios f where f.usuario_id = v_area),
    'indicadores', v_ind,
    'hoje', v_hoje,
    -- o quadro: todos os pedidos em andamento e os 300 mais novos dos que já fecharam
    'pedidos', (select coalesce(jsonb_agg(public.comercial_cartao(p) order by p.criado_em desc), '[]'::jsonb)
                  from public.comercial_pedidos p
                 where p.usuario_id = v_area
                   and (v_tipos ->> p.etapa = 'andamento' or p.id in (
                        select y.id from public.comercial_pedidos y where y.usuario_id = v_area
                           and coalesce(v_tipos ->> y.etapa, '') <> 'andamento' order by y.criado_em desc limit 300))));
end $$;

-- ------------------------------------------------------------------------------------------------ o formulário público
-- O formulário como o cliente vê (sem conta): as perguntas, a identidade do escritório e o selo.
create or replace function public.comercial_formulario_abrir(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  f public.comercial_formularios;
  v_ident jsonb;
begin
  select * into f from public.comercial_formularios where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then
    return jsonb_build_object('situacao', 'inexistente');
  end if;
  v_ident := public.identidade_do_escritorio(f.usuario_id) - 'termo';
  if not f.ativo or f.pausado_pelo_gestor then
    return jsonb_build_object('situacao', 'pausado', 'escritorio', v_ident);
  end if;
  return jsonb_build_object('situacao', 'aberto', 'codigo', f.codigo, 'nome', f.nome, 'versao', f.versao, 'perguntas', f.perguntas,
    'desvio', f.desvio, 'escritorio', v_ident, 'whatsappEscritorio', nullif((public.comercial_ajustes_de(f.usuario_id)).whatsapp, ''),
    'selo', not public.comercial_pro(f.usuario_id));
end $$;

-- Grava o pedido que veio do formulário público. Chamada só pela função comercial do servidor, depois do Turnstile, com a impressão
-- do endereço de quem mandou (para o limite por hora; nunca o endereço em si).
create or replace function public.comercial_pedido_criar(p_codigo text, p_respostas jsonb, p_origem text default null,
  p_ip_hash text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f public.comercial_formularios;
  a public.comercial_ajustes;
  aj public.ajustes_comercial;
  q jsonb;
  r jsonb;
  v jsonb;
  v_valor jsonb;
  v_snap jsonb := '[]'::jsonb;
  v_visivel boolean;
  v_txt text;
  v_campos jsonb := '{}'::jsonb;
  v_respostas jsonb := '{}'::jsonb;
  v_primeira text;
  v_id uuid;
  v_numero int;
  v_whats text;
  v_origem text := left(btrim(coalesce(p_origem, '')), 60);
begin
  select * into aj from public.ajustes_comercial where id;
  select * into f from public.comercial_formularios where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found or not f.ativo or f.pausado_pelo_gestor then
    return jsonb_build_object('ok', false, 'motivo', 'Este formulário não está recebendo pedidos.');
  end if;
  if p_ip_hash is not null and (select count(*) from public.comercial_pedidos
       where ip_hash = p_ip_hash and criado_em > now() - interval '1 hour') >= aj.pedidos_por_hora then
    return jsonb_build_object('ok', false, 'motivo', 'Muitos pedidos daqui em pouco tempo. Tente de novo mais tarde.');
  end if;
  if (select count(*) from public.comercial_pedidos where formulario_id = f.id and criado_em > now() - interval '1 day') >= aj.pedidos_por_dia then
    return jsonb_build_object('ok', false, 'motivo', 'Este formulário recebeu pedidos demais hoje. Tente amanhã.');
  end if;
  a := public.comercial_ajustes_de(f.usuario_id);
  if a.usuario_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'Este formulário não está recebendo pedidos.');
  end if;
  if jsonb_typeof(p_respostas) = 'array' then
    select coalesce(jsonb_object_agg(x ->> 'id', x -> 'valor'), '{}'::jsonb) into v_respostas from jsonb_array_elements(p_respostas) x;
  elsif jsonb_typeof(p_respostas) = 'object' then
    v_respostas := p_respostas;
  end if;

  for q in select x from jsonb_array_elements(f.perguntas) x loop
    v_valor := v_respostas -> (q ->> 'id');
    if v_valor = 'null'::jsonb or (jsonb_typeof(v_valor) = 'string' and btrim(v_valor #>> '{}') = '') then
      v_valor := null;
    end if;
    -- a pergunta escondida pela regra "mostrar só se" não conta
    v_visivel := true;
    if q ? 'mostrarSe' then
      r := v_respostas -> (q -> 'mostrarSe' ->> 'pergunta');
      v_visivel := r is not null and exists (select 1 from jsonb_array_elements_text(q -> 'mostrarSe' -> 'respostas') t
        where t = (case when jsonb_typeof(r) = 'string' then r #>> '{}' end)
           or (jsonb_typeof(r) = 'array' and r ? t));
    end if;
    if not v_visivel or q ->> 'tipo' = 'secao' then
      continue;
    end if;
    if v_valor is null then
      if coalesce((q ->> 'obrigatoria')::boolean, false) then
        return jsonb_build_object('ok', false, 'motivo', format('Responda: %s', q ->> 'texto'), 'pergunta', q ->> 'id');
      end if;
      continue;
    end if;
    -- confere o valor pelo tipo
    case q ->> 'tipo'
      when 'privacidade' then
        if v_valor <> 'true'::jsonb then
          return jsonb_build_object('ok', false, 'motivo', 'Para enviar, aceite o uso dos seus dados.', 'pergunta', 'privacidade');
        end if;
        continue;
      when 'escolha', 'lista', 'faixa' then
        if jsonb_typeof(v_valor) <> 'string' or not exists (select 1 from jsonb_array_elements(q -> 'opcoes') o where o ->> 'texto' = v_valor #>> '{}') then
          return jsonb_build_object('ok', false, 'motivo', format('Escolha uma das opções: %s', q ->> 'texto'), 'pergunta', q ->> 'id');
        end if;
        if exists (select 1 from jsonb_array_elements(q -> 'opcoes') o where o ->> 'texto' = v_valor #>> '{}' and coalesce((o ->> 'desvio')::boolean, false)) then
          return jsonb_build_object('ok', false, 'desvio', true, 'motivo', coalesce(f.desvio ->> 'texto', 'Obrigado pelo interesse!'));
        end if;
      when 'multipla' then
        if jsonb_typeof(v_valor) <> 'array' or jsonb_array_length(v_valor) = 0 or exists (select 1 from jsonb_array_elements(v_valor) x
             where jsonb_typeof(x) <> 'string' or not exists (select 1 from jsonb_array_elements(q -> 'opcoes') o where o ->> 'texto' = x #>> '{}')) then
          return jsonb_build_object('ok', false, 'motivo', format('Escolha entre as opções: %s', q ->> 'texto'), 'pergunta', q ->> 'id');
        end if;
      when 'numero', 'area', 'valor' then
        if (v_valor #>> '{}') !~ '^[0-9]{1,10}([.,][0-9]{1,2})?$' then
          return jsonb_build_object('ok', false, 'motivo', format('Escreva um número: %s', q ->> 'texto'), 'pergunta', q ->> 'id');
        end if;
        v_valor := to_jsonb(replace(v_valor #>> '{}', ',', '.')::numeric);
      when 'nota' then
        if (v_valor #>> '{}') !~ '^[1-5]$' then
          return jsonb_build_object('ok', false, 'motivo', format('Dê uma nota de 1 a 5: %s', q ->> 'texto'), 'pergunta', q ->> 'id');
        end if;
        v_valor := to_jsonb((v_valor #>> '{}')::int);
      when 'data' then
        if (v_valor #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
          return jsonb_build_object('ok', false, 'motivo', format('Escolha uma data: %s', q ->> 'texto'), 'pergunta', q ->> 'id');
        end if;
      when 'mes-ano' then
        if (v_valor #>> '{}') !~ '^[0-9]{4}-[0-9]{2}$' then
          return jsonb_build_object('ok', false, 'motivo', format('Escolha o mês e o ano: %s', q ->> 'texto'), 'pergunta', q ->> 'id');
        end if;
      when 'contato' then
        if jsonb_typeof(v_valor) <> 'object' or length(btrim(coalesce(v_valor ->> 'nome', ''))) not between 1 and 120 then
          return jsonb_build_object('ok', false, 'motivo', 'Escreva o seu nome.', 'pergunta', q ->> 'id');
        end if;
        v_whats := public.comercial_whatsapp_limpo(v_valor ->> 'whatsapp');
        if v_whats = '' and coalesce(v_valor ->> 'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
          return jsonb_build_object('ok', false, 'motivo', 'Escreva o seu WhatsApp ou o seu e-mail, para o escritório responder.', 'pergunta', q ->> 'id');
        end if;
        v_valor := jsonb_build_object('nome', btrim(v_valor ->> 'nome'), 'whatsapp', v_whats,
                                      'email', lower(btrim(coalesce(v_valor ->> 'email', ''))));
        v_campos := v_campos || jsonb_build_object('nome', v_valor ->> 'nome', 'whatsapp', v_valor ->> 'whatsapp', 'email', v_valor ->> 'email');
      when 'link' then
        if length(v_valor #>> '{}') > 300 then
          return jsonb_build_object('ok', false, 'motivo', format('O link vai até 300 letras: %s', q ->> 'texto'), 'pergunta', q ->> 'id');
        end if;
      else
        if jsonb_typeof(v_valor) <> 'string' or length(v_valor #>> '{}') > 2000 then
          return jsonb_build_object('ok', false, 'motivo', format('A resposta vai até 2.000 letras: %s', q ->> 'texto'), 'pergunta', q ->> 'id');
        end if;
        v_valor := to_jsonb(btrim(v_valor #>> '{}'));
    end case;
    -- os campos-chave alimentam o card e os indicadores
    if q ->> 'chave' is not null then
      v_txt := case when jsonb_typeof(v_valor) = 'array' then (select string_agg(x, ', ') from jsonb_array_elements_text(v_valor) x)
                    else v_valor #>> '{}' end;
      v_campos := v_campos || jsonb_build_object(q ->> 'chave', v_txt);
    end if;
    v_snap := v_snap || jsonb_build_array(jsonb_build_object('id', q ->> 'id', 'texto', q ->> 'texto', 'tipo', q ->> 'tipo', 'valor', v_valor));
  end loop;

  if length(btrim(coalesce(v_campos ->> 'nome', ''))) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva o seu nome.');
  end if;
  v_whats := public.comercial_whatsapp_limpo(v_campos ->> 'whatsapp');
  if v_whats = '' and coalesce(v_campos ->> 'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva o seu WhatsApp ou o seu e-mail, para o escritório responder.');
  end if;

  v_primeira := (select e ->> 'id' from jsonb_array_elements(a.etapas) with ordinality t(e, n)
                  where e ->> 'tipo' = 'andamento' order by n limit 1);
  select coalesce(max(numero), 0) + 1 into v_numero from public.comercial_pedidos where usuario_id = f.usuario_id;
  insert into public.comercial_pedidos (usuario_id, numero, formulario_id, formulario_nome, respostas, etapa, nome, whatsapp, email,
      cidade, tipo, area, obra, inicio, origem, ip_hash)
  values (f.usuario_id, v_numero, f.id, f.nome, v_snap, v_primeira, left(btrim(v_campos ->> 'nome'), 120), v_whats,
      left(lower(btrim(coalesce(v_campos ->> 'email', ''))), 200), left(coalesce(v_campos ->> 'cidade', ''), 120),
      left(coalesce(v_campos ->> 'tipo', ''), 120),
      case when coalesce(v_campos ->> 'area', '') ~ '^[0-9]+(\.[0-9]+)?$' then (v_campos ->> 'area')::numeric end,
      left(coalesce(v_campos ->> 'obra', ''), 120), left(coalesce(v_campos ->> 'inicio', ''), 60),
      coalesce(nullif(v_origem, ''), left(coalesce(v_campos ->> 'origem', ''), 60)), p_ip_hash)
  returning id into v_id;
  perform public.comercial_registrar(v_id, 'chegou',
    jsonb_strip_nulls(jsonb_build_object('formulario', f.nome, 'origem', nullif(coalesce(nullif(v_origem, ''), v_campos ->> 'origem'), ''))), null);
  return jsonb_build_object('ok', true, 'numero', v_numero,
    'aviso', jsonb_build_object('email', (select u.email from auth.users u where u.id = f.usuario_id), 'nome', v_campos ->> 'nome',
      'formulario', f.nome));
end $$;

-- DENUNCIAR, no rodapé do formulário público: o /gestao vê e pode pausar.
create or replace function public.comercial_denunciar(p_codigo text, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f public.comercial_formularios;
begin
  select * into f from public.comercial_formularios where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Formulário não encontrado.');
  end if;
  if length(btrim(coalesce(p_motivo, ''))) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'motivo', 'Conte em poucas palavras o que há de errado.');
  end if;
  insert into public.comercial_denuncias (formulario_id, motivo) values (f.id, btrim(p_motivo));
  update public.comercial_formularios set denuncias = denuncias + 1 where id = f.id;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------------------------------------ o orçamento (a ficha)
-- O pedido inteiro: os dados, as respostas, o orçamento, o controle, as propostas e a linha do tempo.
create or replace function public.comercial_pedido(p_area uuid, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area);
  p public.comercial_pedidos;
begin
  select * into p from public.comercial_pedidos where id = p_id and usuario_id = v_area;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido não encontrado.');
  end if;
  return jsonb_build_object('ok', true, 'pedido', public.comercial_cartao(p) || jsonb_build_object(
    'email', p.email, 'inicio', p.inicio, 'observacoes', p.observacoes, 'orcamento', p.orcamento, 'respostas', p.respostas,
    'formulario', p.formulario_nome, 'responsavel', public.nome_da_conta(p.responsavel),
    'propostas', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'codigo', x.codigo, 'jeito', x.jeito, 'link', x.link,
                     'arquivo', x.arquivo is not null, 'conteudo', x.conteudo, 'valor', x.valor, 'validaAte', x.valida_ate,
                     'enviadaEm', x.enviada_em, 'enviadaPor', public.nome_da_conta(x.enviada_por), 'aberturas', x.aberturas,
                     'ultimaAbertura', x.ultima_abertura, 'aceite', x.aceite, 'aceitaEm', x.aceita_em) order by x.enviada_em desc), '[]'::jsonb)
                   from public.comercial_propostas x where x.pedido_id = p.id),
    'linhaDoTempo', (select coalesce(jsonb_agg(jsonb_build_object('tipo', t.tipo, 'dados', t.dados, 'em', t.em,
                       'por', public.nome_da_conta(t.por)) order by t.em desc), '[]'::jsonb)
                     from public.comercial_atividades t where t.pedido_id = p.id)));
end $$;

-- NOVO PEDIDO, à mão (quem chega por telefone ou indicação).
create or replace function public.comercial_pedido_novo(p_area uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area);
  a public.comercial_ajustes;
  v_id uuid;
  v_numero int;
  v_etapa text;
begin
  a := public.comercial_ajustes_de(v_area);
  if a.usuario_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'Comece o Comercial primeiro.');
  end if;
  if length(btrim(coalesce(p ->> 'nome', ''))) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva o nome.');
  end if;
  v_etapa := coalesce(nullif(p ->> 'etapa', ''), (select e ->> 'id' from jsonb_array_elements(a.etapas) with ordinality t(e, n)
                                                    where e ->> 'tipo' = 'andamento' order by n limit 1));
  if public.comercial_etapa(a.etapas, v_etapa) is null then
    return jsonb_build_object('ok', false, 'motivo', 'Essa etapa não existe.');
  end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.comercial_pedidos where usuario_id = v_area;
  insert into public.comercial_pedidos (usuario_id, numero, etapa, nome, whatsapp, email, cidade, tipo, origem, responsavel)
  values (v_area, v_numero, v_etapa, btrim(p ->> 'nome'), public.comercial_whatsapp_limpo(p ->> 'whatsapp'),
          left(lower(btrim(coalesce(p ->> 'email', ''))), 200), left(btrim(coalesce(p ->> 'cidade', '')), 120),
          left(btrim(coalesce(p ->> 'tipo', '')), 120), left(btrim(coalesce(p ->> 'origem', '')), 60), (select auth.uid()))
  returning id into v_id;
  perform public.comercial_registrar(v_id, 'criado', jsonb_build_object('etapa', v_etapa), (select auth.uid()));
  return public.comercial_pedido(v_area, v_id);
end $$;

-- SALVAR o orçamento: os dados gerais, o projeto e o valor (o orçamento inteiro, que o site calcula), o pagamento e o controle.
-- Só os campos que vierem mudam. Marcar a reunião aplica a regra REUNIÃO; a data de retorno entra na linha do tempo.
create or replace function public.comercial_pedido_salvar(p_area uuid, p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area);
  v public.comercial_pedidos;
  v_eu uuid := (select auth.uid());
begin
  select * into v from public.comercial_pedidos where id = p_id and usuario_id = v_area;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido não encontrado.');
  end if;
  if p ? 'nome' and length(btrim(coalesce(p ->> 'nome', ''))) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva o nome.');
  end if;
  if p ? 'valor' and p ->> 'valor' is not null and (p ->> 'valor') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then
    return jsonb_build_object('ok', false, 'motivo', 'O valor precisa ser um número.');
  end if;
  if p ? 'nota' and p ->> 'nota' is not null and (p ->> 'nota') !~ '^[0-5]$' then
    return jsonb_build_object('ok', false, 'motivo', 'A nota vai de 0 a 5.');
  end if;
  if p ? 'orcamento' and (jsonb_typeof(p -> 'orcamento') <> 'object' or length((p -> 'orcamento')::text) > 40000) then
    return jsonb_build_object('ok', false, 'motivo', 'O orçamento veio num formato que não dá para ler.');
  end if;
  update public.comercial_pedidos set
    nome = case when p ? 'nome' then btrim(p ->> 'nome') else nome end,
    whatsapp = case when p ? 'whatsapp' then public.comercial_whatsapp_limpo(p ->> 'whatsapp') else whatsapp end,
    email = case when p ? 'email' then left(lower(btrim(coalesce(p ->> 'email', ''))), 200) else email end,
    cidade = case when p ? 'cidade' then left(btrim(coalesce(p ->> 'cidade', '')), 120) else cidade end,
    tipo = case when p ? 'tipo' then left(btrim(coalesce(p ->> 'tipo', '')), 120) else tipo end,
    area = case when p ? 'area' then case when (p ->> 'area') ~ '^[0-9]+(\.[0-9]+)?$' then (p ->> 'area')::numeric end else area end,
    obra = case when p ? 'obra' then left(btrim(coalesce(p ->> 'obra', '')), 120) else obra end,
    inicio = case when p ? 'inicio' then left(btrim(coalesce(p ->> 'inicio', '')), 60) else inicio end,
    origem = case when p ? 'origem' then left(btrim(coalesce(p ->> 'origem', '')), 60) else origem end,
    valor = case when p ? 'valor' then (p ->> 'valor')::numeric else valor end,
    nota = case when p ? 'nota' then (p ->> 'nota')::int else nota end,
    retorno = case when p ? 'retorno' then (p ->> 'retorno')::date else retorno end,
    reuniao = case when p ? 'reuniao' then (p ->> 'reuniao')::timestamptz else reuniao end,
    observacoes = case when p ? 'observacoes' then left(coalesce(p ->> 'observacoes', ''), 4000) else observacoes end,
    orcamento = case when p ? 'orcamento' then p -> 'orcamento' else orcamento end,
    atualizado_em = now()
   where id = p_id;
  if p ? 'retorno' and (p ->> 'retorno') is distinct from (v.retorno::text) and p ->> 'retorno' is not null then
    perform public.comercial_registrar(p_id, 'retorno', jsonb_build_object('data', p ->> 'retorno'), v_eu);
  end if;
  if p ? 'reuniao' and p ->> 'reuniao' is not null and (p ->> 'reuniao')::timestamptz is distinct from v.reuniao then
    perform public.comercial_registrar(p_id, 'reuniao', jsonb_build_object('em', p ->> 'reuniao'), v_eu);
    perform public.comercial_regra(p_id, 'reuniao', v_eu);
  end if;
  return public.comercial_pedido(v_area, p_id);
end $$;

-- MOVER (arrastar o card ou a etapa da ficha). Para uma etapa PERDIDO, o motivo é obrigatório.
create or replace function public.comercial_pedido_mover(p_area uuid, p_id uuid, p_etapa text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area);
  a public.comercial_ajustes := public.comercial_ajustes_de(v_area);
  e jsonb := public.comercial_etapa(a.etapas, p_etapa);
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 80);
begin
  if not exists (select 1 from public.comercial_pedidos where id = p_id and usuario_id = v_area) then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido não encontrado.');
  end if;
  if e is null then
    return jsonb_build_object('ok', false, 'motivo', 'Essa etapa não existe.');
  end if;
  if e ->> 'tipo' = 'perdido' and v_motivo = '' then
    return jsonb_build_object('ok', false, 'motivo', 'Escolha o motivo da recusa.', 'pedeMotivo', true);
  end if;
  perform public.comercial_trocar_etapa(p_id, p_etapa, case when e ->> 'tipo' = 'perdido' then v_motivo end, (select auth.uid()), null);
  return jsonb_build_object('ok', true, 'pedido', (select public.comercial_cartao(p) from public.comercial_pedidos p where p.id = p_id));
end $$;

-- O botão do WhatsApp (o card, HOJE ou a ficha): devolve o número e a mensagem de primeiro contato pronta, anota na linha do tempo e
-- aplica a regra (de SOLICITAÇÃO para EM CONTATO). O site abre wa.me com eles; nada sai sem a pessoa apertar enviar.
create or replace function public.comercial_whatsapp(p_area uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area);
  a public.comercial_ajustes := public.comercial_ajustes_de(v_area);
  p public.comercial_pedidos;
  v_eu uuid := (select auth.uid());
  v_moveu boolean;
begin
  select * into p from public.comercial_pedidos where id = p_id and usuario_id = v_area;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido não encontrado.');
  end if;
  if p.whatsapp = '' then
    return jsonb_build_object('ok', false, 'motivo', 'Este pedido não tem WhatsApp. Escreva o número no orçamento.');
  end if;
  perform public.comercial_registrar(p_id, 'whatsapp', '{}'::jsonb, v_eu);
  v_moveu := public.comercial_regra(p_id, 'whatsapp', v_eu);
  return jsonb_build_object('ok', true, 'whatsapp', p.whatsapp, 'moveu', v_moveu,
    'texto', public.comercial_mensagem(a.mensagens ->> 'primeiroContato', jsonb_build_object(
      'nome', split_part(p.nome, ' ', 1), 'pessoa', coalesce(nullif(split_part(public.nome_da_conta(v_eu), ' ', 1), ''), 'a equipe'),
      'escritorio', public.nome_do_escritorio(v_area))),
    'pedido', (select public.comercial_cartao(x) from public.comercial_pedidos x where x.id = p_id));
end $$;

-- ANOTAR, na linha do tempo.
create or replace function public.comercial_anotar(p_area uuid, p_id uuid, p_texto text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area);
begin
  if not exists (select 1 from public.comercial_pedidos where id = p_id and usuario_id = v_area) then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido não encontrado.');
  end if;
  if length(btrim(coalesce(p_texto, ''))) not between 1 and 2000 then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva a anotação (até 2.000 letras).');
  end if;
  perform public.comercial_registrar(p_id, 'anotacao', jsonb_build_object('texto', btrim(p_texto)), (select auth.uid()));
  return public.comercial_pedido(v_area, p_id);
end $$;

-- EXCLUIR um pedido apaga de verdade (a LGPD): só o responsável. Os PDFs vão para a fila do lixo (a tarefa diária apaga do R2).
create or replace function public.comercial_pedido_excluir(p_area uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area, true);
  v_arquivos jsonb;
begin
  select coalesce(jsonb_agg(x.arquivo), '[]'::jsonb) into v_arquivos
    from public.comercial_propostas x where x.pedido_id = p_id and x.usuario_id = v_area and x.arquivo is not null;
  delete from public.comercial_pedidos where id = p_id and usuario_id = v_area;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido não encontrado.');
  end if;
  insert into public.comercial_lixo (arquivo) select a #>> '{}' from jsonb_array_elements(v_arquivos) a on conflict do nothing;
  return jsonb_build_object('ok', true, 'arquivos', v_arquivos);
end $$;

-- ------------------------------------------------------------------------------------------------ os formulários (o criador)
-- PUBLICAR AS MUDANÇAS (ou criar um formulário novo, com p_id nulo). Mudar as perguntas sobe a versão. No grátis, até
-- ajustes_comercial.formularios_gratis ativos (fora do lançamento). Responsável e equipe.
create or replace function public.comercial_formulario_salvar(p_area uuid, p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area);
  aj public.ajustes_comercial;
  f public.comercial_formularios;
  v_perguntas jsonb;
  v_nome text := btrim(coalesce(p ->> 'nome', ''));
  v_ativo boolean := coalesce((p ->> 'ativo')::boolean, true);
  v_desvio jsonb;
begin
  select * into aj from public.ajustes_comercial where id;
  if not exists (select 1 from public.comercial_ajustes where usuario_id = v_area) then
    return jsonb_build_object('ok', false, 'motivo', 'Comece o Comercial primeiro.');
  end if;
  if length(v_nome) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'motivo', 'Dê um nome ao formulário (até 80 letras).');
  end if;
  begin
    v_perguntas := public.comercial_perguntas_conferidas(p -> 'perguntas');
  exception when raise_exception then
    return jsonb_build_object('ok', false, 'motivo', sqlerrm);
  end;
  v_desvio := case when jsonb_typeof(p -> 'desvio') = 'object' then jsonb_build_object(
    'titulo', left(btrim(coalesce(p -> 'desvio' ->> 'titulo', '')), 120), 'texto', left(btrim(coalesce(p -> 'desvio' ->> 'texto', '')), 600))
    else null end;
  if v_ativo and not aj.livres_no_lancamento and not public.comercial_pro(v_area)
     and (select count(*) from public.comercial_formularios where usuario_id = v_area and ativo and id is distinct from p_id) >= aj.formularios_gratis then
    return jsonb_build_object('ok', false, 'motivo', format('No grátis, até %s formulários no ar. Pause um ou veja o PRO.', aj.formularios_gratis),
      'limite', true);
  end if;
  if p_id is null then
    insert into public.comercial_formularios (usuario_id, codigo, nome, perguntas, desvio, ativo)
    values (v_area, public.comercial_endereco_novo(v_area, v_nome), v_nome, v_perguntas, coalesce(v_desvio, '{}'::jsonb), v_ativo)
    returning * into f;
  else
    update public.comercial_formularios set
      nome = v_nome, ativo = v_ativo, desvio = coalesce(v_desvio, desvio),
      versao = versao + case when perguntas is distinct from v_perguntas then 1 else 0 end,
      perguntas = v_perguntas, atualizado_em = now()
     where id = p_id and usuario_id = v_area
    returning * into f;
    if not found then
      return jsonb_build_object('ok', false, 'motivo', 'Formulário não encontrado.');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'formulario', jsonb_build_object('id', f.id, 'codigo', f.codigo, 'nome', f.nome, 'ativo', f.ativo,
    'versao', f.versao, 'perguntas', f.perguntas, 'desvio', f.desvio));
end $$;

-- APAGAR um formulário: os pedidos que vieram dele ficam (com as respostas e o nome do formulário). Só o responsável.
create or replace function public.comercial_formulario_excluir(p_area uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area, true);
begin
  delete from public.comercial_formularios where id = p_id and usuario_id = v_area;
  return jsonb_build_object('ok', found);
end $$;

-- ------------------------------------------------------------------------------------------------ os ajustes
-- SALVAR os ajustes: as etapas (pelo menos uma de cada tipo; o pedido numa etapa apagada vai para a primeira), as regras (a que aponta
-- para uma etapa que não existe mais é desligada), as mensagens, os motivos e os preços. Só o responsável. Só o que vier muda.
create or replace function public.comercial_ajustes_salvar(p_area uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area, true);
  a public.comercial_ajustes := public.comercial_ajustes_de(v_area);
  v_etapas jsonb := a.etapas;
  v_regras jsonb := a.regras;
  e jsonb;
  k text;
  v_ids text[] := '{}';
  v_primeira text;
  v_movidos int := 0;
begin
  if a.usuario_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'Comece o Comercial primeiro.');
  end if;
  if p ? 'etapas' then
    if jsonb_typeof(p -> 'etapas') <> 'array' or jsonb_array_length(p -> 'etapas') not between 3 and 15 then
      return jsonb_build_object('ok', false, 'motivo', 'O fluxo tem de 3 a 15 etapas.');
    end if;
    v_etapas := '[]'::jsonb;
    for e in select x from jsonb_array_elements(p -> 'etapas') x loop
      if coalesce(e ->> 'id', '') !~ '^[a-z0-9-]{1,24}$' or e ->> 'id' = any (v_ids) then
        return jsonb_build_object('ok', false, 'motivo', 'Cada etapa precisa de um código só dela.');
      end if;
      if length(btrim(coalesce(e ->> 'nome', ''))) not between 1 and 30 then
        return jsonb_build_object('ok', false, 'motivo', 'Toda etapa precisa de um nome de até 30 letras.');
      end if;
      if coalesce(e ->> 'tipo', '') not in ('andamento', 'ganho', 'perdido') then
        return jsonb_build_object('ok', false, 'motivo', format('O tipo da etapa %s precisa ser em andamento, ganho ou perdido.', e ->> 'nome'));
      end if;
      if coalesce(e ->> 'cor', '') !~ '^#[0-9A-Fa-f]{6}$' then
        return jsonb_build_object('ok', false, 'motivo', format('A cor da etapa %s não é uma cor.', e ->> 'nome'));
      end if;
      if e ->> 'aviso' is not null and (e ->> 'aviso') !~ '^[0-9]{1,3}$' then
        return jsonb_build_object('ok', false, 'motivo', 'O aviso de parado é um número de dias.');
      end if;
      v_ids := v_ids || (e ->> 'id');
      v_etapas := v_etapas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id', e ->> 'id', 'nome', btrim(e ->> 'nome'),
        'cor', upper(e ->> 'cor'), 'tipo', e ->> 'tipo', 'aviso', (e ->> 'aviso')::int,
        'pelaData', case when coalesce((e ->> 'pelaData')::boolean, false) then true end)));
    end loop;
    if not exists (select 1 from jsonb_array_elements(v_etapas) x where x ->> 'tipo' = 'andamento')
       or not exists (select 1 from jsonb_array_elements(v_etapas) x where x ->> 'tipo' = 'ganho')
       or not exists (select 1 from jsonb_array_elements(v_etapas) x where x ->> 'tipo' = 'perdido') then
      return jsonb_build_object('ok', false, 'motivo', 'O fluxo precisa de pelo menos uma etapa em andamento, uma de ganho e uma de perdido.');
    end if;
  end if;
  if p ? 'regras' then
    if jsonb_typeof(p -> 'regras') <> 'object' then
      return jsonb_build_object('ok', false, 'motivo', 'As regras vieram num formato que não dá para ler.');
    end if;
    for k in select jsonb_object_keys(p -> 'regras') loop
      if k in ('whatsapp', 'proposta', 'reuniao', 'aceite', 'parado') then
        v_regras := jsonb_set(v_regras, array[k], coalesce(v_regras -> k, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'liga', ((p -> 'regras' -> k) ->> 'liga')::boolean, 'de', (p -> 'regras' -> k) ->> 'de', 'para', (p -> 'regras' -> k) ->> 'para',
          'motivo', (p -> 'regras' -> k) ->> 'motivo')));
      end if;
    end loop;
  end if;
  -- a regra que aponta para uma etapa que não existe mais é desligada
  for k in select jsonb_object_keys(v_regras) loop
    if public.comercial_etapa(v_etapas, v_regras -> k ->> 'para') is null
       or (v_regras -> k ? 'de' and public.comercial_etapa(v_etapas, v_regras -> k ->> 'de') is null) then
      v_regras := jsonb_set(v_regras, array[k, 'liga'], 'false'::jsonb);
    end if;
  end loop;
  if p ? 'mensagens' and (jsonb_typeof(p -> 'mensagens') <> 'object'
       or exists (select 1 from jsonb_each_text(p -> 'mensagens') m where length(m.value) > 1000)) then
    return jsonb_build_object('ok', false, 'motivo', 'Cada mensagem vai até 1.000 letras.');
  end if;
  if p ? 'motivos' and (jsonb_typeof(p -> 'motivos') <> 'array' or jsonb_array_length(p -> 'motivos') not between 1 and 20
       or exists (select 1 from jsonb_array_elements(p -> 'motivos') m where jsonb_typeof(m) <> 'string' or length(btrim(m #>> '{}')) not between 1 and 60)) then
    return jsonb_build_object('ok', false, 'motivo', 'De 1 a 20 motivos, cada um com até 60 letras.');
  end if;
  if p ? 'precos' and (jsonb_typeof(p -> 'precos') <> 'object' or length((p -> 'precos')::text) > 20000) then
    return jsonb_build_object('ok', false, 'motivo', 'Os preços vieram num formato que não dá para ler.');
  end if;
  if p ? 'whatsapp' and coalesce(p ->> 'whatsapp', '') <> '' and public.comercial_whatsapp_limpo(p ->> 'whatsapp') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'O WhatsApp do escritório precisa do DDD e do número.');
  end if;

  -- os pedidos numa etapa que saiu vão para a primeira etapa em andamento
  v_primeira := (select x ->> 'id' from jsonb_array_elements(v_etapas) with ordinality t(x, n) where x ->> 'tipo' = 'andamento' order by n limit 1);
  with movidos as (
    update public.comercial_pedidos set etapa = v_primeira, etapa_desde = now(), atualizado_em = now()
     where usuario_id = v_area and public.comercial_etapa(v_etapas, etapa) is null
    returning id)
  select count(*) into v_movidos from movidos;

  update public.comercial_ajustes set
    etapas = v_etapas, regras = v_regras,
    mensagens = case when p ? 'mensagens' then mensagens || (p -> 'mensagens') else mensagens end,
    motivos = case when p ? 'motivos' then (select jsonb_agg(btrim(m #>> '{}')) from jsonb_array_elements(p -> 'motivos') m) else motivos end,
    precos = case when p ? 'precos' then p -> 'precos' else precos end,
    whatsapp = case when p ? 'whatsapp' then public.comercial_whatsapp_limpo(p ->> 'whatsapp') else whatsapp end,
    atualizado_em = now()
   where usuario_id = v_area;
  return jsonb_build_object('ok', true, 'movidos', v_movidos, 'estado', public.comercial_estado(v_area));
end $$;

-- VOLTAR AO MODELO DE FÁBRICA (as etapas, as regras, as mensagens, os motivos e os preços; os formulários e os pedidos ficam).
create or replace function public.comercial_ajustes_de_fabrica(p_area uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area, true);
begin
  return public.comercial_ajustes_salvar(v_area, jsonb_build_object('etapas', public.comercial_etapas_de_fabrica(),
    'regras', public.comercial_regras_de_fabrica(), 'mensagens', public.comercial_mensagens_de_fabrica(),
    'motivos', public.comercial_motivos_de_fabrica(), 'precos', public.comercial_precos_de_fabrica()));
end $$;

-- ------------------------------------------------------------------------------------------------ a proposta
-- ENVIAR PELO WHATSAPP: cria a proposta (PDF, link ou o modelo, com o conteúdo do orçamento), aplica a regra (vai para RETORNO) e
-- devolve o código, o número e a mensagem pronta com o link. O PDF sobe depois, pela função comercial (comercial_proposta_pdf).
create or replace function public.comercial_proposta_criar(p_area uuid, p_pedido uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area);
  a public.comercial_ajustes := public.comercial_ajustes_de(v_area);
  v public.comercial_pedidos;
  v_eu uuid := (select auth.uid());
  v_jeito text := p ->> 'jeito';
  v_codigo text;
  v_link text;
  v_retorno text := '';
  v_valida date;
  v_url text;
begin
  select * into v from public.comercial_pedidos where id = p_pedido and usuario_id = v_area;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido não encontrado.');
  end if;
  if v_jeito not in ('pdf', 'link', 'modelo') then
    return jsonb_build_object('ok', false, 'motivo', 'Escolha o jeito da proposta: PDF, link ou o modelo do Arquionie.');
  end if;
  if v_jeito = 'link' then
    v_link := btrim(coalesce(p ->> 'link', ''));
    if v_link !~ '^https://[^\s]+$' or length(v_link) > 500 then
      return jsonb_build_object('ok', false, 'motivo', 'Cole um link que comece com https://.');
    end if;
  end if;
  if v_jeito = 'modelo' and (jsonb_typeof(p -> 'conteudo') <> 'object' or jsonb_typeof(p -> 'conteudo' -> 'pacotes') <> 'array'
       or jsonb_array_length(p -> 'conteudo' -> 'pacotes') not between 1 and 3) then
    return jsonb_build_object('ok', false, 'motivo', 'O modelo precisa de 1 a 3 pacotes, que vêm do orçamento.');
  end if;
  if p ? 'valor' and p ->> 'valor' is not null and (p ->> 'valor') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then
    return jsonb_build_object('ok', false, 'motivo', 'O valor precisa ser um número.');
  end if;
  v_valida := coalesce((p ->> 'validaAte')::date, public.comercial_hoje() + coalesce((a.precos ->> 'validadeDias')::int, 30));
  loop
    v_codigo := public.comercial_sortear(8);
    exit when not exists (select 1 from public.comercial_propostas where codigo = v_codigo);
  end loop;
  insert into public.comercial_propostas (pedido_id, usuario_id, codigo, jeito, link, conteudo, valor, valida_ate, enviada_por)
  values (p_pedido, v_area, v_codigo, v_jeito, v_link,
          case when v_jeito = 'modelo' then p -> 'conteudo' else '{}'::jsonb end,
          coalesce((p ->> 'valor')::numeric, v.valor), v_valida, v_eu);
  if p ? 'valor' and p ->> 'valor' is not null then
    update public.comercial_pedidos set valor = (p ->> 'valor')::numeric, atualizado_em = now() where id = p_pedido;
  end if;
  if p ? 'retorno' and p ->> 'retorno' is not null then
    update public.comercial_pedidos set retorno = (p ->> 'retorno')::date, atualizado_em = now() where id = p_pedido;
    v_retorno := public.comercial_mensagem(a.mensagens ->> 'retorno', jsonb_build_object('data', to_char((p ->> 'retorno')::date, 'DD/MM')));
  end if;
  perform public.comercial_registrar(p_pedido, 'proposta', jsonb_build_object('codigo', v_codigo, 'jeito', v_jeito), v_eu);
  perform public.comercial_regra(p_pedido, 'proposta', v_eu);
  v_url := 'arquionie.com.br/p/' || v_codigo;
  return jsonb_build_object('ok', true, 'codigo', v_codigo, 'url', v_url, 'whatsapp', v.whatsapp, 'subirPdf', v_jeito = 'pdf',
    'texto', public.comercial_mensagem(coalesce(p ->> 'mensagem', a.mensagens ->> 'proposta'), jsonb_build_object(
      'nome', split_part(v.nome, ' ', 1), 'pessoa', coalesce(nullif(split_part(public.nome_da_conta(v_eu), ' ', 1), ''), 'a equipe'),
      'escritorio', public.nome_do_escritorio(v_area), 'link', v_url, 'retorno', v_retorno)),
    'pedido', (select public.comercial_cartao(x) from public.comercial_pedidos x where x.id = p_pedido));
end $$;

-- O PDF da proposta, registrado pela função comercial antes de dar a URL de subida ao R2 (comercial/<pedido>/<CODIGO>.pdf). p_usuario é
-- quem sobe: o responsável ou alguém da equipe dele. Confere o espaço do plano: 300 MB no grátis e 5 GB no PRO, de fábrica.
create or replace function public.comercial_proposta_pdf(p_usuario uuid, p_codigo text, p_tamanho bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  aj public.ajustes_comercial;
  x public.comercial_propostas;
  v_usado bigint;
  v_limite bigint;
begin
  select * into aj from public.ajustes_comercial where id;
  select * into x from public.comercial_propostas where codigo = p_codigo;
  if not found or x.jeito <> 'pdf' or not public.da_equipe(p_usuario, x.usuario_id) then
    return jsonb_build_object('ok', false, 'motivo', 'Proposta não encontrada.');
  end if;
  if p_tamanho is null or p_tamanho < 1 or p_tamanho > 10485760 then
    return jsonb_build_object('ok', false, 'motivo', 'O PDF vai até 10 MB.');
  end if;
  select coalesce(sum(tamanho), 0) into v_usado from public.comercial_propostas where usuario_id = x.usuario_id and id <> x.id;
  v_limite := (case when public.comercial_pro(x.usuario_id) then aj.espaco_pro_mb else aj.espaco_gratis_mb end)::bigint * 1048576;
  if v_usado + p_tamanho > v_limite then
    return jsonb_build_object('ok', false, 'motivo', format('Os PDFs passaram de %s MB. Exclua propostas antigas ou veja o PRO.', v_limite / 1048576),
      'limite', true);
  end if;
  update public.comercial_propostas set arquivo = format('comercial/%s/%s.pdf', x.pedido_id, x.codigo), tamanho = p_tamanho where id = x.id;
  return jsonb_build_object('ok', true, 'arquivo', format('comercial/%s/%s.pdf', x.pedido_id, x.codigo));
end $$;

-- A proposta como o cliente vê (sem conta): conta a abertura e avisa o escritório pela linha do tempo (só a primeira abertura do dia
-- entra lá, para não encher).
create or replace function public.comercial_proposta_abrir(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x public.comercial_propostas;
  v public.comercial_pedidos;
  v_situacao text;
begin
  select * into x from public.comercial_propostas where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then
    return jsonb_build_object('situacao', 'inexistente');
  end if;
  select * into v from public.comercial_pedidos where id = x.pedido_id;
  v_situacao := case when x.aceita_em is not null then 'aceita'
                     when x.valida_ate is not null and x.valida_ate < public.comercial_hoje() then 'vencida'
                     when x.jeito = 'pdf' and x.arquivo is null then 'preparando'
                     else 'aberta' end;
  if v_situacao in ('aberta', 'aceita') then
    if x.ultima_abertura is null or (x.ultima_abertura at time zone 'America/Sao_Paulo')::date < public.comercial_hoje() then
      perform public.comercial_registrar(x.pedido_id, 'abriu', jsonb_build_object('codigo', x.codigo, 'vez', x.aberturas + 1), null);
    end if;
    update public.comercial_propostas set aberturas = aberturas + 1, ultima_abertura = now() where id = x.id;
  end if;
  return jsonb_build_object('situacao', v_situacao, 'codigo', x.codigo, 'jeito', x.jeito, 'link', x.link,
    'arquivo', case when v_situacao in ('aberta', 'aceita') then x.arquivo end,
    'conteudo', x.conteudo, 'valor', x.valor, 'validaAte', x.valida_ate, 'cliente', v.nome, 'aceite', x.aceite,
    'escritorio', public.identidade_do_escritorio(x.usuario_id) - 'termo',
    'whatsappEscritorio', nullif((public.comercial_ajustes_de(x.usuario_id)).whatsapp, ''),
    'selo', not public.comercial_pro(x.usuario_id));
end $$;

-- ACEITAR A PROPOSTA (sem conta): o nome, o "li e concordo" e o pacote escolhido (no modelo). Grava o aceite com o termo como estava,
-- põe o valor do pacote no pedido e aplica a regra (vai para APROVADO).
create or replace function public.comercial_proposta_aceitar(p_codigo text, p_nome text, p_concordo boolean, p_pacote text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x public.comercial_propostas;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_pacote jsonb;
  v_valor numeric;
  v_termo text;
begin
  select * into x from public.comercial_propostas where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Proposta não encontrada.');
  end if;
  if x.aceita_em is not null then
    return jsonb_build_object('ok', false, 'motivo', 'Esta proposta já foi aceita.', 'aceite', x.aceite);
  end if;
  if x.valida_ate is not null and x.valida_ate < public.comercial_hoje() then
    return jsonb_build_object('ok', false, 'motivo', 'Esta proposta venceu. Fale com o escritório para receber uma nova.');
  end if;
  if length(v_nome) not between 3 and 120 then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva o seu nome completo.');
  end if;
  if not coalesce(p_concordo, false) then
    return jsonb_build_object('ok', false, 'motivo', 'Para aceitar, marque que leu e concorda com a proposta.');
  end if;
  v_valor := x.valor;
  if x.jeito = 'modelo' then
    if p_pacote is null and jsonb_array_length(x.conteudo -> 'pacotes') = 1 then
      v_pacote := x.conteudo -> 'pacotes' -> 0;
    else
      select pk into v_pacote from jsonb_array_elements(x.conteudo -> 'pacotes') pk where pk ->> 'nome' = p_pacote limit 1;
    end if;
    if v_pacote is null then
      return jsonb_build_object('ok', false, 'motivo', 'Escolha um dos pacotes.');
    end if;
    if (v_pacote ->> 'valor') ~ '^[0-9]+(\.[0-9]+)?$' then
      v_valor := (v_pacote ->> 'valor')::numeric;
    end if;
  end if;
  v_termo := format('Li e concordo com a proposta de %s.', public.nome_do_escritorio(x.usuario_id));
  update public.comercial_propostas set aceita_em = now(), aceite = jsonb_strip_nulls(jsonb_build_object('nome', v_nome, 'em', now(),
    'termo', v_termo, 'pacote', v_pacote ->> 'nome', 'valor', v_valor)) where id = x.id;
  update public.comercial_pedidos set valor = coalesce(v_valor, valor), atualizado_em = now() where id = x.pedido_id;
  perform public.comercial_registrar(x.pedido_id, 'aceite',
    jsonb_strip_nulls(jsonb_build_object('nome', v_nome, 'pacote', v_pacote ->> 'nome', 'valor', v_valor, 'codigo', x.codigo)), null);
  perform public.comercial_regra(x.pedido_id, 'aceite', null);
  return jsonb_build_object('ok', true, 'aviso', jsonb_build_object('email', (select u.email from auth.users u where u.id = x.usuario_id),
    'cliente', (select nome from public.comercial_pedidos where id = x.pedido_id), 'nome', v_nome, 'pacote', v_pacote ->> 'nome', 'valor', v_valor));
end $$;

-- ------------------------------------------------------------------------------------------------ a tarefa diária e a exportação
-- A regra PARADO (desligada de fábrica): quem ficou mais que o aviso da etapa vai para a etapa da regra, com o motivo. Rodada todo dia
-- pela tarefa da função comercial.
create or replace function public.comercial_mover_parados() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_total int := 0;
  r record;
begin
  for r in
    select p.id, a.regras -> 'parado' ->> 'para' as para, coalesce(a.regras -> 'parado' ->> 'motivo', 'Sem resposta') as motivo
      from public.comercial_pedidos p
      join public.comercial_ajustes a on a.usuario_id = p.usuario_id
      join lateral (select public.comercial_etapa(a.etapas, p.etapa) e) x on true
     where coalesce((a.regras -> 'parado' ->> 'liga')::boolean, false)
       and public.comercial_etapa(a.etapas, a.regras -> 'parado' ->> 'para') is not null
       and x.e ->> 'tipo' = 'andamento' and (x.e ->> 'aviso') is not null
       and now() - p.etapa_desde > make_interval(days => (x.e ->> 'aviso')::int)
       and (p.retorno is null or p.retorno < public.comercial_hoje())
  loop
    if public.comercial_trocar_etapa(r.id, r.para, r.motivo, null, 'parado') then
      v_total := v_total + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'movidos', v_total);
end $$;

-- A fila do lixo, para a tarefa diária: devolve até 500 PDFs a apagar do R2 e já tira da fila.
create or replace function public.comercial_lixo_pegar() returns jsonb
language sql volatile security definer set search_path = '' as $$
  with fora as (
    delete from public.comercial_lixo where arquivo in (select arquivo from public.comercial_lixo order by criado_em limit 500)
    returning arquivo)
  select coalesce(jsonb_agg(arquivo), '[]'::jsonb) from fora
$$;

-- EXPORTAR PLANILHA: todos os pedidos com as respostas, sempre grátis ("nenhum arquivo refém").
create or replace function public.comercial_exportar(p_area uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_area uuid := public.comercial_area(p_area);
  a public.comercial_ajustes := public.comercial_ajustes_de(v_area);
begin
  return jsonb_build_object('ok', true, 'etapas', a.etapas, 'pedidos', (select coalesce(jsonb_agg(jsonb_build_object(
      'numero', p.numero, 'etapa', coalesce(public.comercial_etapa(a.etapas, p.etapa) ->> 'nome', p.etapa), 'nome', p.nome,
      'whatsapp', p.whatsapp, 'email', p.email, 'cidade', p.cidade, 'tipo', p.tipo, 'area', p.area, 'obra', p.obra, 'inicio', p.inicio,
      'origem', p.origem, 'valor', p.valor, 'nota', p.nota, 'retorno', p.retorno, 'motivo', p.motivo, 'criadoEm', p.criado_em,
      'formulario', p.formulario_nome, 'respostas', p.respostas, 'observacoes', p.observacoes) order by p.numero), '[]'::jsonb)
    from public.comercial_pedidos p where p.usuario_id = v_area));
end $$;

-- ------------------------------------------------------------------------------------------------ o /gestao
create or replace function public.gestao_comercial() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_administrador() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'escritorios', (select count(*) from public.comercial_ajustes),
    'pedidos', (select count(*) from public.comercial_pedidos),
    'pedidosNoMes', (select count(*) from public.comercial_pedidos where criado_em > public.comercial_inicio_do_mes()),
    'propostas', (select count(*) from public.comercial_propostas),
    'aceitas', (select count(*) from public.comercial_propostas where aceita_em is not null),
    'denunciados', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'codigo', f.codigo, 'nome', f.nome,
                      'escritorio', public.nome_do_escritorio(f.usuario_id), 'denuncias', f.denuncias,
                      'pausado', f.pausado_pelo_gestor,
                      'motivos', (select jsonb_agg(d.motivo order by d.criado_em desc) from public.comercial_denuncias d where d.formulario_id = f.id))
                      order by f.denuncias desc), '[]'::jsonb)
                    from public.comercial_formularios f where f.denuncias > 0));
end $$;

create or replace function public.gestao_comercial_pausar(p_formulario uuid, p_pausar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_administrador() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  update public.comercial_formularios set pausado_pelo_gestor = coalesce(p_pausar, true) where id = p_formulario;
  return jsonb_build_object('ok', found);
end $$;

-- ------------------------------------------------------------------------------------------------ quem pode chamar
do $$
declare
  f text;
begin
  -- só por dentro (as outras funções chamam)
  foreach f in array array[
    'comercial_sortear(int)', 'comercial_trecho(text, int)', 'comercial_endereco_novo(uuid, text)', 'comercial_area(uuid, boolean)',
    'comercial_pro(uuid)', 'comercial_ajustes_de(uuid)', 'comercial_etapa(jsonb, text)', 'comercial_whatsapp_limpo(text)',
    'comercial_registrar(uuid, text, jsonb, uuid)', 'comercial_trocar_etapa(uuid, text, text, uuid, text)',
    'comercial_regra(uuid, text, uuid)', 'comercial_mensagem(text, jsonb)', 'comercial_cartao(public.comercial_pedidos)',
    'comercial_perguntas_conferidas(jsonb)', 'comercial_etapas_de_fabrica()', 'comercial_regras_de_fabrica()',
    'comercial_mensagens_de_fabrica()', 'comercial_motivos_de_fabrica()', 'comercial_precos_de_fabrica()',
    'comercial_formulario_de_fabrica(text)', 'comercial_hoje()', 'comercial_inicio_do_mes()']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  -- o cliente, sem conta
  foreach f in array array['comercial_formulario_abrir(text)', 'comercial_proposta_abrir(text)',
    'comercial_proposta_aceitar(text, text, boolean, text)', 'comercial_denunciar(text, text)']
  loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  -- a função comercial do servidor, com a chave secreta
  foreach f in array array['comercial_pedido_criar(text, jsonb, text, text)', 'comercial_proposta_pdf(uuid, text, bigint)',
    'comercial_mover_parados()', 'comercial_lixo_pegar()']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- quem tem conta (o escritório e a equipe; cada função confere a área)
  foreach f in array array['comercial_iniciar(text)', 'comercial_estado(uuid, date, date)', 'comercial_pedido(uuid, uuid)',
    'comercial_pedido_novo(uuid, jsonb)', 'comercial_pedido_salvar(uuid, uuid, jsonb)', 'comercial_pedido_mover(uuid, uuid, text, text)',
    'comercial_whatsapp(uuid, uuid)', 'comercial_anotar(uuid, uuid, text)', 'comercial_pedido_excluir(uuid, uuid)',
    'comercial_formulario_salvar(uuid, uuid, jsonb)', 'comercial_formulario_excluir(uuid, uuid)', 'comercial_ajustes_salvar(uuid, jsonb)',
    'comercial_ajustes_de_fabrica(uuid)', 'comercial_proposta_criar(uuid, uuid, jsonb)', 'comercial_exportar(uuid)',
    'gestao_comercial()', 'gestao_comercial_pausar(uuid, boolean)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
