-- Arquionie™: a LICENÇA ÚNICA (o programa e o plugin do Revit com a mesma licença) e as tabelas da gestão que vem do
-- Palheta Flow — preços, cupons, cadastros, descadastros, campanhas de e-mail, aulas e feedbacks. Plano 18 do repositório
-- do plugin (docs/migracao-arkiton/18), com as decisões do ÊDI de 14/10/2026. Rodar uma vez no SQL Editor do projeto
-- arquionie, depois da 20261005010000_licencas_e_conexao_pelo_navegador.sql (não depende da 20261011010000, que pode vir antes
-- ou depois). Pode rodar duas vezes sem estragar nada.
--
-- Licença única (ÊDI, 14/10/2026): a licença do programa e a do plugin são a mesma e não se vendem separadas; quem pagou o
-- plugin ganha o PRO do programa. A coluna `licencas.produto` fica (o site e as funções antigas ainda mandam o produto),
-- mas toda licença passa a ser gravada como `arquionie` e vale nos dois. Os COMPUTADORES continuam separados por produto,
-- até três no programa e até três no plugin (decisão 1 do plano 18).
--
-- Quem chama o quê (o que é novo aqui):
--   qualquer um (anon) ........ precos_vigentes, cupom_conferir, aulas_lista
--   site (/gestao) ............ gestao_precos, gestao_precos_salvar, gestao_cupons, gestao_cupom_criar, gestao_cupom_revogar,
--                               gestao_cupom_reativar, gestao_cupom_prorrogar, gestao_destinatarios, gestao_campanhas,
--                               gestao_campanha_criar, gestao_campanha_pausar, gestao_campanha_retomar, gestao_campanha_cancelar,
--                               gestao_aulas, gestao_aula_salvar, gestao_aula_apagar, gestao_aulas_ordenar, gestao_feedbacks,
--                               gestao_feedback_marcar, gestao_importar_dados_flow
--   funções do servidor ....... campanha_proximo_lote, campanha_registrar_envio, descadastrar, feedback_registrar —
--   (campanhas e feedback)      só com a chave secreta, nunca do navegador.
-- Nenhuma tabela nova se lê ou escreve direto: tudo passa pelas funções acima (RLS ligado e sem política).

-- ================================================================================================ LICENÇA ÚNICA
-- Toda licença é gravada como `arquionie`, venha de onde vier (LIBERAR, IMPORTAR CLIENTES DO FLOW, PASSAR PARA UM COLEGA).
create or replace function public.licencas_produto_unico() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.produto := 'arquionie';
  return new;
end $$;

revoke execute on function public.licencas_produto_unico() from public, anon, authenticated;

drop trigger if exists licencas_produto_unico on public.licencas;
create trigger licencas_produto_unico before insert or update of produto on public.licencas
  for each row execute function public.licencas_produto_unico();

do $$
begin
  if exists (select 1 from public.licencas where produto <> 'arquionie') then
    perform set_config('arquionie.acao', 'licença única (programa e plugin)', true);
    update public.licencas set produto = 'arquionie' where produto <> 'arquionie';
  end if;
end $$;

-- A licença em uso de uma pessoa, em qualquer produto (a de equipe primeiro, depois a que vence por último). O parâmetro
-- do produto fica só para as funções que já chamam assim (licenca_estado, testes, tours, apresentações, plano da conta).
create or replace function public.licenca_em_uso(p_usuario uuid, p_produto text) returns public.licencas
language sql stable security definer set search_path = '' as $$
  select l.* from public.licencas l
   where l.usuario_id = p_usuario and l.status = 'ativa' and l.expira_em > now()
   order by (l.plano = 'equipe') desc, l.expira_em desc
   limit 1;
$$;

revoke execute on function public.licenca_em_uso(uuid, text) from public, anon, authenticated;

-- LICENÇAS no /gestao: igual à de 05/10, só que os computadores de cada licença contam os dois produtos (programa e
-- plugin, cada um com o seu limite) e as versões contam só o plugin, como antes.
create or replace function public.gestao_licencas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  return jsonb_build_object(
    'resumo', (select jsonb_build_object(
        'total', count(*),
        'ativas', count(*) filter (where s in ('ativa', 'vencendo')),
        'esperando', count(*) filter (where s = 'esperando a conta'),
        'semTitular', count(*) filter (where s = 'sem titular'),
        'vencendo', count(*) filter (where s = 'vencendo'),
        'vencidas', count(*) filter (where s = 'vencida'),
        'revogadas', count(*) filter (where s = 'revogada'),
        'importadasEsperando', count(*) filter (where s = 'esperando a conta' and origem = 'importada-flow'))
      from (select public.licenca_situacao(status, expira_em, email, usuario_id) as s, origem from public.licencas) x),
    'versoes', (select coalesce(jsonb_object_agg(v, n), '{}'::jsonb) from (
        select coalesce(nullif(versao, ''), 'sem versão') as v, count(*) as n
          from public.computadores where produto = 'arquionie-revit' group by 1) y),
    'ajustes', (select to_jsonb(a) - 'id' from public.ajustes_licenca a where a.id),
    'licencas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'produto', l.produto, 'plano', l.plano, 'dono', l.dono_email, 'titular', l.email,
        'situacao', public.licenca_situacao(l.status, l.expira_em, l.email, l.usuario_id),
        'expiraEm', l.expira_em, 'origem', l.origem, 'bonus', l.bonus_em is not null, 'observacao', l.observacao,
        'computadores', (select count(*) from public.computadores c where c.usuario_id = l.usuario_id),
        'computadoresPrograma', (select count(*) from public.computadores c
                                  where c.usuario_id = l.usuario_id and c.produto = 'arquionie'),
        'computadoresPlugin', (select count(*) from public.computadores c
                                where c.usuario_id = l.usuario_id and c.produto = 'arquionie-revit'),
        'criadaEm', l.criada_em)
      order by l.criada_em desc, l.id), '[]'::jsonb) from public.licencas l)
  );
end $$;

-- ================================================================================================ PREÇOS
-- Uma linha só: o PRO por ano, parcelado e à vista (no Flow: palheta_flow_precos, R$ 59 × 12 ou R$ 599 em 14/10/2026).
create table if not exists public.precos (
  id boolean primary key default true check (id),
  parcela numeric(10, 2) not null default 59 check (parcela > 0),
  parcelas int not null default 12 check (parcelas between 1 and 24),
  avista numeric(10, 2) not null default 599 check (avista > 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

insert into public.precos (id) values (true) on conflict (id) do nothing;

alter table public.precos enable row level security;

-- A página de venda lê o preço sem conta.
create or replace function public.precos_vigentes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('parcela', p.parcela, 'parcelas', p.parcelas, 'avista', p.avista,
                            'totalParcelado', p.parcela * p.parcelas, 'atualizadoEm', p.atualizado_em)
    from public.precos p where p.id;
$$;

create or replace function public.gestao_precos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  return public.precos_vigentes();
end $$;

create or replace function public.gestao_precos_salvar(p_parcela numeric, p_parcelas int, p_avista numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  if p_parcela is null or p_parcela <= 0 or p_avista is null or p_avista <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'Os valores têm que ser maiores que zero.');
  end if;
  if p_parcelas is null or p_parcelas < 1 or p_parcelas > 24 then
    return jsonb_build_object('ok', false, 'motivo', 'As parcelas vão de 1 a 24.');
  end if;
  update public.precos
     set parcela = round(p_parcela, 2), parcelas = p_parcelas, avista = round(p_avista, 2),
         atualizado_em = now(), atualizado_por = (select auth.uid())
   where id;
  return jsonb_build_object('ok', true) || public.precos_vigentes();
end $$;

-- ================================================================================================ CUPONS
create table if not exists public.cupons (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo = upper(btrim(codigo)) and codigo ~ '^[A-Z0-9-]{3,32}$'),
  desconto int not null check (desconto between 1 and 100),
  expira_em timestamptz,                 -- vazio = sem validade
  observacao text,
  ativo boolean not null default true,
  origem text not null default 'arquionie' check (origem in ('arquionie', 'flow')),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null
);

alter table public.cupons enable row level security;

-- A página de venda confere um cupom sem conta: só diz se vale e quanto desconta.
create or replace function public.cupom_conferir(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('valido', true, 'codigo', c.codigo, 'desconto', c.desconto, 'expiraEm', c.expira_em)
       from public.cupons c
      where c.codigo = upper(btrim(coalesce(p_codigo, ''))) and c.ativo
        and (c.expira_em is null or c.expira_em > now())),
    jsonb_build_object('valido', false));
$$;

create or replace function public.gestao_cupons() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'codigo', c.codigo, 'desconto', c.desconto, 'expiraEm', c.expira_em, 'observacao', c.observacao,
      'ativo', c.ativo, 'origem', c.origem, 'criadoEm', c.criado_em,
      'situacao', case when not c.ativo then 'revogado'
                       when c.expira_em is not null and c.expira_em <= now() then 'vencido'
                       else 'ativo' end)
    order by c.criado_em desc, c.id), '[]'::jsonb) from public.cupons c);
end $$;

create or replace function public.gestao_cupom_criar(p_codigo text, p_desconto int, p_expira_em timestamptz default null,
                                                     p_observacao text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_id uuid;
begin
  perform public.gestao_exigir();
  if v_codigo !~ '^[A-Z0-9-]{3,32}$' then
    return jsonb_build_object('ok', false, 'motivo', 'O código vai de 3 a 32 letras, números ou hífen.');
  end if;
  if p_desconto is null or p_desconto < 1 or p_desconto > 100 then
    return jsonb_build_object('ok', false, 'motivo', 'O desconto vai de 1 a 100%.');
  end if;
  if p_expira_em is not null and p_expira_em <= now() then
    return jsonb_build_object('ok', false, 'motivo', 'A validade tem que ser uma data futura.');
  end if;
  if exists (select 1 from public.cupons where codigo = v_codigo) then
    return jsonb_build_object('ok', false, 'motivo', 'Já existe um cupom com este código.');
  end if;
  insert into public.cupons (codigo, desconto, expira_em, observacao, criado_por)
  values (v_codigo, p_desconto, p_expira_em, nullif(btrim(p_observacao), ''), (select auth.uid()))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_codigo);
end $$;

create or replace function public.gestao_cupom_revogar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  update public.cupons set ativo = false where id = p_id and ativo;
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.gestao_cupom_reativar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  update public.cupons set ativo = true where id = p_id and not ativo;
  return jsonb_build_object('ok', found);
end $$;

-- +7 DIAS (ou o que vier): soma a partir da validade, ou de hoje se ela já passou. Sem validade continua sem validade.
create or replace function public.gestao_cupom_prorrogar(p_id uuid, p_dias int default 7) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ate timestamptz;
begin
  perform public.gestao_exigir();
  if p_dias is null or p_dias < 1 or p_dias > 365 then
    return jsonb_build_object('ok', false, 'motivo', 'Prorrogue de 1 a 365 dias.');
  end if;
  update public.cupons
     set expira_em = case when expira_em is null then null else greatest(expira_em, now()) + make_interval(days => p_dias) end
   where id = p_id returning expira_em into v_ate;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Cupom não encontrado.');
  end if;
  return jsonb_build_object('ok', true, 'expiraEm', v_ate);
end $$;

-- ================================================================================================ CADASTROS E DESCADASTROS
-- Quem baixou o grátis do Flow e deixou nome e e-mail (decisão 2 do plano 18: vêm para as campanhas do Arquionie).
-- Um e-mail só uma vez, com a primeira data de cadastro e a última de download.
create table if not exists public.cadastros_flow (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nome text,
  cadastrado_em timestamptz,
  baixou_em timestamptz,
  importado_em timestamptz not null default now()
);

alter table public.cadastros_flow enable row level security;

-- Quem pediu para não receber mais. Vale para sempre e para todas as listas (Flow e Arquionie).
create table if not exists public.descadastros (
  email text primary key check (email = lower(btrim(email))),
  origem text not null default 'arquionie' check (origem in ('arquionie', 'flow')),
  descadastrado_em timestamptz not null default now()
);

alter table public.descadastros enable row level security;

-- Servidor (link de descadastro, conferido por assinatura na função): grava o descadastro. Responde sempre ok.
create or replace function public.descadastrar(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    insert into public.descadastros (email) values (v_email) on conflict (email) do nothing;
    update public.perfis set novidades = false where lower(email) = v_email;
  end if;
  return jsonb_build_object('situacao', 'ok');
end $$;

-- ================================================================================================ CAMPANHAS DE E-MAIL
-- A campanha guarda o texto com as variáveis ({nome}, {cupom}, {desconto}, **negrito**), a oferta opcional (chamada, de,
-- por, parcelas, parcela, validade, mensagem do WhatsApp) e o ritmo: LOTE e-mails a cada INTERVALO minutos, até LIMITE
-- por dia (horário de Brasília). Quem manda é a função do servidor, chamada pelo pg_cron, que pede o próximo lote aqui.
create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  assunto text not null check (length(btrim(assunto)) between 1 and 200),
  mensagem text not null check (length(btrim(mensagem)) between 1 and 20000),
  cupom text,
  desconto int check (desconto is null or desconto between 1 and 100),
  oferta jsonb,
  lote int not null default 10 check (lote between 1 and 100),
  intervalo_min int not null default 5 check (intervalo_min between 1 and 1440),
  limite_dia int not null default 80 check (limite_dia between 1 and 5000),
  status text not null default 'enviando' check (status in ('enviando', 'pausada', 'concluida', 'cancelada')),
  origem text not null default 'arquionie' check (origem in ('arquionie', 'flow')),
  ultimo_lote_em timestamptz,
  criada_por uuid references auth.users (id) on delete set null,
  criada_em timestamptz not null default now(),
  concluida_em timestamptz
);

create table if not exists public.campanha_envios (
  id bigint generated always as identity primary key,
  campanha_id uuid not null references public.campanhas (id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  nome text,
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'erro', 'pulado')),
  erro text,
  enviado_em timestamptz,
  unique (campanha_id, email)
);

create index if not exists campanha_envios_status on public.campanha_envios (campanha_id, status);
create index if not exists campanha_envios_email on public.campanha_envios (email) where status = 'enviado';
create index if not exists campanha_envios_dia on public.campanha_envios (enviado_em) where status = 'enviado';

alter table public.campanhas enable row level security;
alter table public.campanha_envios enable row level security;

-- Quem tem licença valendo (como titular ou pelo e-mail) não entra nas campanhas de venda.
create or replace function public.tem_licenca_valendo(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.licencas l
      left join auth.users u on u.id = l.usuario_id
     where l.status = 'ativa' and l.expira_em > now()
       and (l.email = lower(btrim(p_email)) or lower(u.email) = lower(btrim(p_email))));
$$;

revoke execute on function public.tem_licenca_valendo(text) from public, anon, authenticated;

-- DESTINATÁRIOS: os cadastros do Flow e as contas que aceitaram novidades, menos quem tem licença valendo e quem pediu
-- para sair; "já recebeu" = já recebeu alguma campanha (de qualquer origem).
create or replace function public.gestao_destinatarios() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'email', x.email, 'nome', x.nome, 'origem', x.origem, 'desde', x.desde,
      'jaRecebeu', exists (select 1 from public.campanha_envios e where e.email = x.email and e.status = 'enviado'))
    order by x.desde desc nulls last, x.email), '[]'::jsonb)
    from (
      select distinct on (email) email, nome, origem, desde from (
        select c.email, c.nome, 'flow' as origem, coalesce(c.cadastrado_em, c.importado_em) as desde, 2 as ordem
          from public.cadastros_flow c
        union all
        select lower(p.email), p.nome, 'conta', p.criado_em, 1
          from public.perfis p where p.novidades and p.email is not null
      ) t
      order by email, ordem
    ) x
   where not exists (select 1 from public.descadastros d where d.email = x.email)
     and not public.tem_licenca_valendo(x.email));
end $$;

-- A lista de campanhas com o andamento de cada uma.
create or replace function public.gestao_campanhas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'assunto', c.assunto, 'mensagem', c.mensagem, 'cupom', c.cupom, 'desconto', c.desconto,
      'oferta', c.oferta, 'lote', c.lote, 'intervaloMin', c.intervalo_min, 'limiteDia', c.limite_dia,
      'status', c.status, 'origem', c.origem, 'criadaEm', c.criada_em, 'concluidaEm', c.concluida_em,
      'ultimoLoteEm', c.ultimo_lote_em,
      'proximoLoteEm', case when c.status = 'enviando' then
                         greatest(now(), coalesce(c.ultimo_lote_em + make_interval(mins => c.intervalo_min), now())) end,
      'total', (select count(*) from public.campanha_envios e where e.campanha_id = c.id),
      'enviados', (select count(*) from public.campanha_envios e where e.campanha_id = c.id and e.status = 'enviado'),
      'pendentes', (select count(*) from public.campanha_envios e where e.campanha_id = c.id and e.status in ('pendente', 'enviando')),
      'erros', (select count(*) from public.campanha_envios e where e.campanha_id = c.id and e.status = 'erro'))
    order by c.criada_em desc, c.id), '[]'::jsonb) from public.campanhas c);
end $$;

-- INICIAR CAMPANHA: grava a campanha e a fila. O servidor confere de novo cada e-mail: quem pediu para sair ou tem
-- licença valendo entra como "pulado" (nunca recebe), mesmo que a lista do navegador esteja velha.
create or replace function public.gestao_campanha_criar(p_assunto text, p_mensagem text, p_destinatarios jsonb,
                                                        p_cupom text default null, p_desconto int default null,
                                                        p_oferta jsonb default null, p_lote int default 10,
                                                        p_intervalo_min int default 5, p_limite_dia int default 80) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  r jsonb;
  v_email text;
  v_fila int := 0;
  v_pulados int := 0;
begin
  perform public.gestao_exigir();
  if coalesce(btrim(p_assunto), '') = '' or coalesce(btrim(p_mensagem), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva o assunto e a mensagem.');
  end if;
  if jsonb_typeof(p_destinatarios) is distinct from 'array' or jsonb_array_length(p_destinatarios) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'Escolha pelo menos um destinatário.');
  end if;
  if p_lote is null or p_lote not between 1 and 100 or p_intervalo_min is null or p_intervalo_min not between 1 and 1440
     or p_limite_dia is null or p_limite_dia not between 1 and 5000 then
    return jsonb_build_object('ok', false, 'motivo', 'Lote de 1 a 100, intervalo de 1 a 1440 minutos, limite de 1 a 5000 por dia.');
  end if;
  if p_desconto is not null and p_desconto not between 1 and 100 then
    return jsonb_build_object('ok', false, 'motivo', 'O desconto vai de 1 a 100%.');
  end if;

  insert into public.campanhas (assunto, mensagem, cupom, desconto, oferta, lote, intervalo_min, limite_dia, criada_por)
  values (btrim(p_assunto), p_mensagem, nullif(upper(btrim(p_cupom)), ''), p_desconto,
          case when jsonb_typeof(p_oferta) = 'object' then p_oferta end, p_lote, p_intervalo_min, p_limite_dia,
          (select auth.uid()))
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_destinatarios) loop
    v_email := lower(btrim(coalesce(case when jsonb_typeof(r) = 'string' then r #>> '{}' else r ->> 'email' end, '')));
    continue when v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
    if exists (select 1 from public.descadastros d where d.email = v_email) or public.tem_licenca_valendo(v_email) then
      insert into public.campanha_envios (campanha_id, email, nome, status)
      values (v_id, v_email, nullif(btrim(r ->> 'nome'), ''), 'pulado') on conflict (campanha_id, email) do nothing;
      if found then v_pulados := v_pulados + 1; end if;
    else
      insert into public.campanha_envios (campanha_id, email, nome)
      values (v_id, v_email, case when jsonb_typeof(r) = 'object' then nullif(btrim(r ->> 'nome'), '') end)
      on conflict (campanha_id, email) do nothing;
      if found then v_fila := v_fila + 1; end if;
    end if;
  end loop;

  if v_fila = 0 then
    update public.campanhas set status = 'concluida', concluida_em = now() where id = v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'naFila', v_fila, 'pulados', v_pulados);
end $$;

create or replace function public.gestao_campanha_pausar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  update public.campanhas set status = 'pausada' where id = p_id and status = 'enviando';
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.gestao_campanha_retomar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  update public.campanhas set status = 'enviando' where id = p_id and status = 'pausada';
  return jsonb_build_object('ok', found);
end $$;

-- CANCELAR: o que ainda não saiu fica como "pulado"; o que saiu, saiu.
create or replace function public.gestao_campanha_cancelar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  update public.campanhas set status = 'cancelada', concluida_em = now()
   where id = p_id and status in ('enviando', 'pausada');
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  update public.campanha_envios set status = 'pulado' where campanha_id = p_id and status in ('pendente', 'enviando');
  return jsonb_build_object('ok', true);
end $$;

-- Servidor (a cada execução do pg_cron): o próximo lote da campanha mais antiga cujo intervalo já passou, respeitando o
-- limite do dia (todos os envios de hoje, horário de Brasília, contam). Marca o lote como "enviando" para dois processos
-- não mandarem o mesmo e-mail; quem não mandar devolve para "pendente" em campanha_registrar_envio. Sem nada a mandar,
-- devolve {situacao: "nada"}. Envio esquecido em "enviando" por mais de 30 minutos volta para a fila.
create or replace function public.campanha_proximo_lote() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.campanhas;
  v_hoje timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_enviados_hoje int;
  v_quantos int;
  v_lote jsonb;
begin
  update public.campanha_envios e set status = 'pendente'
   where e.status = 'enviando'
     and exists (select 1 from public.campanhas x where x.id = e.campanha_id
                  and x.ultimo_lote_em < now() - interval '30 minutes');

  select * into c from public.campanhas x
   where x.status = 'enviando'
     and (x.ultimo_lote_em is null or x.ultimo_lote_em + make_interval(mins => x.intervalo_min) <= now())
   order by x.criada_em
   limit 1
   for update skip locked;
  if not found then
    return jsonb_build_object('situacao', 'nada');
  end if;

  if not exists (select 1 from public.campanha_envios where campanha_id = c.id and status in ('pendente', 'enviando')) then
    update public.campanhas set status = 'concluida', concluida_em = now() where id = c.id;
    return jsonb_build_object('situacao', 'nada', 'concluida', c.id);
  end if;

  select count(*) into v_enviados_hoje from public.campanha_envios where status = 'enviado' and enviado_em >= v_hoje;
  v_quantos := least(c.lote, c.limite_dia - v_enviados_hoje);
  if v_quantos <= 0 then
    return jsonb_build_object('situacao', 'limite do dia', 'campanha', c.id);
  end if;

  with escolhidos as (
    select e.id from public.campanha_envios e
     where e.campanha_id = c.id and e.status = 'pendente'
     order by e.id
     limit v_quantos
     for update skip locked
  ), marcados as (
    update public.campanha_envios e set status = 'enviando'
      from escolhidos s where e.id = s.id
    returning e.id, e.email, e.nome
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'email', m.email, 'nome', m.nome) order by m.id), '[]'::jsonb)
    into v_lote from marcados m;

  update public.campanhas set ultimo_lote_em = now() where id = c.id;
  return jsonb_build_object(
    'situacao', 'lote',
    'campanha', jsonb_build_object('id', c.id, 'assunto', c.assunto, 'mensagem', c.mensagem, 'cupom', c.cupom,
                                   'desconto', c.desconto, 'oferta', c.oferta),
    'envios', v_lote);
end $$;

-- Servidor: o resultado de cada e-mail — "enviado", "erro" (com o motivo) ou "pendente" (o serviço de e-mail pediu para
-- esperar: volta para a fila). Quando não sobra nada pendente, a campanha conclui.
create or replace function public.campanha_registrar_envio(p_envio bigint, p_situacao text, p_erro text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_campanha uuid;
begin
  if p_situacao not in ('enviado', 'erro', 'pendente') then
    raise exception 'situação inválida';
  end if;
  update public.campanha_envios
     set status = p_situacao,
         erro = case when p_situacao = 'erro' then left(p_erro, 500) end,
         enviado_em = case when p_situacao = 'enviado' then now() else enviado_em end
   where id = p_envio and status = 'enviando'
  returning campanha_id into v_campanha;
  if v_campanha is null then
    return jsonb_build_object('situacao', 'ignorado');
  end if;
  update public.campanhas set status = 'concluida', concluida_em = now()
   where id = v_campanha and status = 'enviando'
     and not exists (select 1 from public.campanha_envios where campanha_id = v_campanha and status in ('pendente', 'enviando'));
  return jsonb_build_object('situacao', 'ok');
end $$;

-- ================================================================================================ AULAS
-- As aulas do YouTube que o plugin mostra em AULAS & TUTORIAIS (no Flow: palheta_flow_tutorials). "comando" liga a aula
-- à ferramenta do painel (a classe Cmd…), para o VER COMO USAR.
create table if not exists public.aulas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{6,20}$'),
  duracao text,
  descricao text,
  posicao int not null default 0,
  comando text,
  miniatura_url text,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create unique index if not exists aulas_youtube on public.aulas (youtube_id);

alter table public.aulas enable row level security;

-- O plugin e o site leem as aulas sem conta.
create or replace function public.aulas_lista() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'titulo', a.titulo, 'youtubeId', a.youtube_id, 'duracao', a.duracao, 'descricao', a.descricao,
      'posicao', a.posicao, 'comando', a.comando, 'miniaturaUrl', a.miniatura_url)
    order by a.posicao, a.criada_em), '[]'::jsonb)
    from public.aulas a;
$$;

create or replace function public.gestao_aulas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  return public.aulas_lista();
end $$;

-- Cria (p_id vazio) ou altera uma aula. Aula nova entra no fim da lista.
create or replace function public.gestao_aula_salvar(p_id uuid, p_titulo text, p_youtube_id text, p_duracao text default null,
                                                     p_descricao text default null, p_comando text default null,
                                                     p_miniatura_url text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_yt text := btrim(coalesce(p_youtube_id, ''));
begin
  perform public.gestao_exigir();
  if coalesce(btrim(p_titulo), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva o título da aula.');
  end if;
  if v_yt !~ '^[A-Za-z0-9_-]{6,20}$' then
    return jsonb_build_object('ok', false, 'motivo', 'O código do vídeo do YouTube não é válido.');
  end if;
  if exists (select 1 from public.aulas where youtube_id = v_yt and id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'motivo', 'Este vídeo já está em outra aula.');
  end if;
  if p_id is null then
    insert into public.aulas (titulo, youtube_id, duracao, descricao, comando, miniatura_url, posicao)
    values (btrim(p_titulo), v_yt, nullif(btrim(p_duracao), ''), nullif(btrim(p_descricao), ''),
            nullif(btrim(p_comando), ''), nullif(btrim(p_miniatura_url), ''),
            coalesce((select max(posicao) + 1 from public.aulas), 0))
    returning id into v_id;
  else
    update public.aulas
       set titulo = btrim(p_titulo), youtube_id = v_yt, duracao = nullif(btrim(p_duracao), ''),
           descricao = nullif(btrim(p_descricao), ''), comando = nullif(btrim(p_comando), ''),
           miniatura_url = nullif(btrim(p_miniatura_url), ''), atualizada_em = now()
     where id = p_id returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'motivo', 'Aula não encontrada.');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.gestao_aula_apagar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  delete from public.aulas where id = p_id;
  return jsonb_build_object('ok', found);
end $$;

-- A ordem da lista: as aulas na ordem dos ids recebidos; as que faltarem vão para o fim, na ordem de antes.
create or replace function public.gestao_aulas_ordenar(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  update public.aulas a set posicao = o.n - 1, atualizada_em = now()
    from (select id, row_number() over (order by coalesce(array_position(p_ids, id), 100000 + posicao), criada_em) as n
            from public.aulas) o
   where a.id = o.id;
  return jsonb_build_object('ok', true);
end $$;

-- ================================================================================================ FEEDBACKS
-- O que chega pelo botão de feedback do plugin (no Flow: feedbacks, gravado pela função enviar-feedback).
create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  email text,
  usuario_id uuid references auth.users (id) on delete set null,
  edicao text,
  versao text,
  categoria text,
  nota int check (nota is null or nota between 0 and 10),
  mensagem text not null check (length(btrim(mensagem)) between 1 and 10000),
  status text not null default 'novo' check (status in ('novo', 'lido')),
  origem text not null default 'arquionie' check (origem in ('arquionie', 'flow')),
  criado_em timestamptz not null default now()
);

create index if not exists feedbacks_criado on public.feedbacks (criado_em desc);

alter table public.feedbacks enable row level security;

-- Servidor (função de feedback, que confere a credencial do computador quando houver): grava um feedback.
create or replace function public.feedback_registrar(p_mensagem text, p_email text default null, p_usuario uuid default null,
                                                     p_edicao text default null, p_versao text default null,
                                                     p_categoria text default null, p_nota int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if coalesce(btrim(p_mensagem), '') = '' then
    return jsonb_build_object('situacao', 'vazio');
  end if;
  insert into public.feedbacks (email, usuario_id, edicao, versao, categoria, nota, mensagem)
  values (nullif(lower(btrim(p_email)), ''), p_usuario, left(p_edicao, 40), left(p_versao, 40), left(p_categoria, 60),
          case when p_nota between 0 and 10 then p_nota end, left(p_mensagem, 10000))
  returning id into v_id;
  return jsonb_build_object('situacao', 'ok', 'id', v_id);
end $$;

create or replace function public.gestao_feedbacks() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  return jsonb_build_object(
    'novos', (select count(*) from public.feedbacks where status = 'novo'),
    'feedbacks', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'email', f.email, 'edicao', f.edicao, 'versao', f.versao, 'categoria', f.categoria,
        'nota', f.nota, 'mensagem', f.mensagem, 'status', f.status, 'origem', f.origem, 'criadoEm', f.criado_em)
      order by f.criado_em desc), '[]'::jsonb)
      from (select * from public.feedbacks order by criado_em desc limit 5000) f));
end $$;

create or replace function public.gestao_feedback_marcar(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  if p_status not in ('novo', 'lido') then
    return jsonb_build_object('ok', false, 'motivo', 'Situação inválida.');
  end if;
  update public.feedbacks set status = p_status where id = p_id;
  return jsonb_build_object('ok', found);
end $$;

-- ================================================================================================ IMPORTAR DO FLOW
-- Os dados do Flow de uma vez, num arquivo só (gerado pela consulta supabase/ferramentas/exportar-do-flow.sql, rodada pelo
-- ÊDI no Supabase do escritório). Pode rodar de novo: o que já veio não duplica. As licenças NÃO vêm por aqui (IMPORTAR
-- CLIENTES DO FLOW, na aba LICENÇAS) nem as contas com senha (roteiro próprio no SQL Editor). O CPF não vem (decisão 4).
--   { precos: {parcela, parcelas, avista}, cupons: [...], cadastros: [{email, nome, created_at, downloaded_at}],
--     descadastros: [{email, created_at}], campanhas: [{id, assunto, mensagem, cupom, desconto, oferta, criada_em,
--     envios: [{email, nome, status, enviado_em}]}], aulas: [...], feedbacks: [...] }
create or replace function public.gestao_importar_dados_flow(p_dados jsonb, p_conferir boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  e jsonb;
  v_campanha uuid;
  v_conta jsonb := jsonb_build_object('precos', false, 'cupons', 0, 'cadastros', 0, 'descadastros', 0,
                                      'campanhas', 0, 'envios', 0, 'aulas', 0, 'feedbacks', 0);
  v_email text;
  v_n int;
begin
  perform public.gestao_exigir();
  if jsonb_typeof(p_dados) is distinct from 'object' then
    raise exception 'esperava um objeto com precos, cupons, cadastros, descadastros, campanhas, aulas e feedbacks';
  end if;

  -- PRÉVIA: só conta o que veio no arquivo, sem gravar nada.
  if p_conferir then
    return jsonb_build_object('previa', true,
      'precos', jsonb_typeof(p_dados -> 'precos') = 'object',
      'cupons', coalesce(jsonb_array_length(case when jsonb_typeof(p_dados -> 'cupons') = 'array' then p_dados -> 'cupons' end), 0),
      'cadastros', coalesce(jsonb_array_length(case when jsonb_typeof(p_dados -> 'cadastros') = 'array' then p_dados -> 'cadastros' end), 0),
      'descadastros', coalesce(jsonb_array_length(case when jsonb_typeof(p_dados -> 'descadastros') = 'array' then p_dados -> 'descadastros' end), 0),
      'campanhas', coalesce(jsonb_array_length(case when jsonb_typeof(p_dados -> 'campanhas') = 'array' then p_dados -> 'campanhas' end), 0),
      'aulas', coalesce(jsonb_array_length(case when jsonb_typeof(p_dados -> 'aulas') = 'array' then p_dados -> 'aulas' end), 0),
      'feedbacks', coalesce(jsonb_array_length(case when jsonb_typeof(p_dados -> 'feedbacks') = 'array' then p_dados -> 'feedbacks' end), 0));
  end if;

  if jsonb_typeof(p_dados -> 'precos') = 'object' then
    update public.precos
       set parcela = coalesce((p_dados #>> '{precos,parcela}')::numeric, parcela),
           parcelas = coalesce((p_dados #>> '{precos,parcelas}')::int, parcelas),
           avista = coalesce((p_dados #>> '{precos,avista}')::numeric, avista),
           atualizado_em = now(), atualizado_por = (select auth.uid())
     where id;
    v_conta := jsonb_set(v_conta, '{precos}', 'true');
  end if;

  for r in select * from jsonb_array_elements(coalesce(case when jsonb_typeof(p_dados -> 'cupons') = 'array' then p_dados -> 'cupons' end, '[]')) loop
    continue when upper(btrim(coalesce(r ->> 'codigo', ''))) !~ '^[A-Z0-9-]{3,32}$'
               or coalesce((r ->> 'desconto')::int, 0) not between 1 and 100;
    insert into public.cupons (codigo, desconto, expira_em, observacao, ativo, origem, criado_em)
    values (upper(btrim(r ->> 'codigo')), (r ->> 'desconto')::int, nullif(r ->> 'expira_em', '')::timestamptz,
            nullif(btrim(r ->> 'observacao'), ''), coalesce((r ->> 'ativo')::boolean, true), 'flow',
            coalesce(nullif(r ->> 'criado_em', '')::timestamptz, now()))
    on conflict (codigo) do nothing;
    get diagnostics v_n = row_count;
    v_conta := jsonb_set(v_conta, '{cupons}', to_jsonb((v_conta ->> 'cupons')::int + v_n));
  end loop;

  -- Cadastros: um por e-mail, com o primeiro cadastro e o último download (rodar de novo não muda nada).
  for r in select * from jsonb_array_elements(coalesce(case when jsonb_typeof(p_dados -> 'cadastros') = 'array' then p_dados -> 'cadastros' end, '[]')) loop
    v_email := lower(btrim(coalesce(r ->> 'email', '')));
    continue when v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
    insert into public.cadastros_flow as c (email, nome, cadastrado_em, baixou_em)
    values (v_email, nullif(btrim(coalesce(r ->> 'nome', r ->> 'name')), ''),
            nullif(r ->> 'created_at', '')::timestamptz, nullif(r ->> 'downloaded_at', '')::timestamptz)
    on conflict (email) do update set
      nome = coalesce(c.nome, excluded.nome),
      cadastrado_em = least(c.cadastrado_em, excluded.cadastrado_em),
      baixou_em = greatest(c.baixou_em, excluded.baixou_em);
    get diagnostics v_n = row_count;
    v_conta := jsonb_set(v_conta, '{cadastros}', to_jsonb((v_conta ->> 'cadastros')::int + v_n));
  end loop;

  for r in select * from jsonb_array_elements(coalesce(case when jsonb_typeof(p_dados -> 'descadastros') = 'array' then p_dados -> 'descadastros' end, '[]')) loop
    v_email := lower(btrim(coalesce(r ->> 'email', '')));
    continue when v_email = '';
    insert into public.descadastros (email, origem, descadastrado_em)
    values (v_email, 'flow', coalesce(nullif(r ->> 'created_at', '')::timestamptz, now()))
    on conflict (email) do nothing;
    get diagnostics v_n = row_count;
    v_conta := jsonb_set(v_conta, '{descadastros}', to_jsonb((v_conta ->> 'descadastros')::int + v_n));
  end loop;

  -- Campanhas antigas: só o histórico (concluídas), para o "já recebeu" continuar valendo. Uma campanha que ainda estava
  -- enviando no Flow vem concluída: o resto, se for o caso, sai numa campanha nova daqui.
  for r in select * from jsonb_array_elements(coalesce(case when jsonb_typeof(p_dados -> 'campanhas') = 'array' then p_dados -> 'campanhas' end, '[]')) loop
    continue when coalesce(btrim(r ->> 'assunto'), '') = '' or coalesce(btrim(r ->> 'mensagem'), '') = '';
    v_campanha := nullif(r ->> 'id', '')::uuid;
    if v_campanha is not null and exists (select 1 from public.campanhas where id = v_campanha) then
      continue;
    end if;
    insert into public.campanhas (id, assunto, mensagem, cupom, desconto, oferta, status, origem, criada_em, concluida_em)
    values (coalesce(v_campanha, gen_random_uuid()), left(btrim(r ->> 'assunto'), 200), left(r ->> 'mensagem', 20000),
            nullif(upper(btrim(r ->> 'cupom')), ''),
            case when (r ->> 'desconto')::int between 1 and 100 then (r ->> 'desconto')::int end,
            case when jsonb_typeof(r -> 'oferta') = 'object' then r -> 'oferta' end,
            'concluida', 'flow', coalesce(nullif(r ->> 'criada_em', '')::timestamptz, now()),
            coalesce(nullif(r ->> 'concluida_em', '')::timestamptz, nullif(r ->> 'criada_em', '')::timestamptz, now()))
    returning id into v_campanha;
    v_conta := jsonb_set(v_conta, '{campanhas}', to_jsonb((v_conta ->> 'campanhas')::int + 1));
    for e in select * from jsonb_array_elements(coalesce(case when jsonb_typeof(r -> 'envios') = 'array' then r -> 'envios' end, '[]')) loop
      v_email := lower(btrim(coalesce(e ->> 'email', '')));
      continue when v_email = '';
      insert into public.campanha_envios (campanha_id, email, nome, status, erro, enviado_em)
      values (v_campanha, v_email, nullif(btrim(e ->> 'nome'), ''),
              case when e ->> 'status' in ('enviado', 'erro') then e ->> 'status' else 'pulado' end,
              left(e ->> 'erro', 500), nullif(e ->> 'enviado_em', '')::timestamptz)
      on conflict (campanha_id, email) do nothing;
      get diagnostics v_n = row_count;
      v_conta := jsonb_set(v_conta, '{envios}', to_jsonb((v_conta ->> 'envios')::int + v_n));
    end loop;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(case when jsonb_typeof(p_dados -> 'aulas') = 'array' then p_dados -> 'aulas' end, '[]')) loop
    continue when coalesce(btrim(coalesce(r ->> 'titulo', r ->> 'title')), '') = ''
               or btrim(coalesce(r ->> 'youtube_id', '')) !~ '^[A-Za-z0-9_-]{6,20}$';
    insert into public.aulas (titulo, youtube_id, duracao, descricao, posicao, comando, miniatura_url)
    values (btrim(coalesce(r ->> 'titulo', r ->> 'title')), btrim(r ->> 'youtube_id'),
            nullif(btrim(coalesce(r ->> 'duracao', r ->> 'duration')), ''),
            nullif(btrim(coalesce(r ->> 'descricao', r ->> 'description')), ''),
            coalesce(nullif(coalesce(r ->> 'posicao', r ->> 'position'), '')::int, 0),
            nullif(btrim(coalesce(r ->> 'comando', r ->> 'command')), ''),
            nullif(btrim(coalesce(r ->> 'miniatura_url', r ->> 'thumbnail_url')), ''))
    on conflict (youtube_id) do nothing;
    get diagnostics v_n = row_count;
    v_conta := jsonb_set(v_conta, '{aulas}', to_jsonb((v_conta ->> 'aulas')::int + v_n));
  end loop;

  for r in select * from jsonb_array_elements(coalesce(case when jsonb_typeof(p_dados -> 'feedbacks') = 'array' then p_dados -> 'feedbacks' end, '[]')) loop
    continue when coalesce(btrim(r ->> 'mensagem'), '') = '';
    continue when exists (select 1 from public.feedbacks f where f.origem = 'flow'
                           and f.criado_em = nullif(r ->> 'created_at', '')::timestamptz and f.mensagem = r ->> 'mensagem');
    insert into public.feedbacks (email, edicao, versao, categoria, nota, mensagem, status, origem, criado_em)
    values (nullif(lower(btrim(r ->> 'email')), ''), left(r ->> 'edicao', 40), left(r ->> 'versao', 40),
            left(r ->> 'categoria', 60), case when (r ->> 'nota')::int between 0 and 10 then (r ->> 'nota')::int end,
            left(r ->> 'mensagem', 10000), case when r ->> 'status' = 'lido' then 'lido' else 'novo' end, 'flow',
            coalesce(nullif(r ->> 'created_at', '')::timestamptz, now()));
    v_conta := jsonb_set(v_conta, '{feedbacks}', to_jsonb((v_conta ->> 'feedbacks')::int + 1));
  end loop;

  return jsonb_build_object('ok', true, 'importado', v_conta);
end $$;

-- ================================================================================================ quem pode chamar
revoke execute on function public.precos_vigentes() from public;
revoke execute on function public.cupom_conferir(text) from public;
revoke execute on function public.aulas_lista() from public;
grant execute on function public.precos_vigentes() to anon, authenticated;
grant execute on function public.cupom_conferir(text) to anon, authenticated;
grant execute on function public.aulas_lista() to anon, authenticated;

revoke execute on function public.gestao_precos() from public, anon;
revoke execute on function public.gestao_precos_salvar(numeric, int, numeric) from public, anon;
revoke execute on function public.gestao_cupons() from public, anon;
revoke execute on function public.gestao_cupom_criar(text, int, timestamptz, text) from public, anon;
revoke execute on function public.gestao_cupom_revogar(uuid) from public, anon;
revoke execute on function public.gestao_cupom_reativar(uuid) from public, anon;
revoke execute on function public.gestao_cupom_prorrogar(uuid, int) from public, anon;
revoke execute on function public.gestao_destinatarios() from public, anon;
revoke execute on function public.gestao_campanhas() from public, anon;
revoke execute on function public.gestao_campanha_criar(text, text, jsonb, text, int, jsonb, int, int, int) from public, anon;
revoke execute on function public.gestao_campanha_pausar(uuid) from public, anon;
revoke execute on function public.gestao_campanha_retomar(uuid) from public, anon;
revoke execute on function public.gestao_campanha_cancelar(uuid) from public, anon;
revoke execute on function public.gestao_aulas() from public, anon;
revoke execute on function public.gestao_aula_salvar(uuid, text, text, text, text, text, text) from public, anon;
revoke execute on function public.gestao_aula_apagar(uuid) from public, anon;
revoke execute on function public.gestao_aulas_ordenar(uuid[]) from public, anon;
revoke execute on function public.gestao_feedbacks() from public, anon;
revoke execute on function public.gestao_feedback_marcar(uuid, text) from public, anon;
revoke execute on function public.gestao_importar_dados_flow(jsonb, boolean) from public, anon;
grant execute on function public.gestao_precos() to authenticated;
grant execute on function public.gestao_precos_salvar(numeric, int, numeric) to authenticated;
grant execute on function public.gestao_cupons() to authenticated;
grant execute on function public.gestao_cupom_criar(text, int, timestamptz, text) to authenticated;
grant execute on function public.gestao_cupom_revogar(uuid) to authenticated;
grant execute on function public.gestao_cupom_reativar(uuid) to authenticated;
grant execute on function public.gestao_cupom_prorrogar(uuid, int) to authenticated;
grant execute on function public.gestao_destinatarios() to authenticated;
grant execute on function public.gestao_campanhas() to authenticated;
grant execute on function public.gestao_campanha_criar(text, text, jsonb, text, int, jsonb, int, int, int) to authenticated;
grant execute on function public.gestao_campanha_pausar(uuid) to authenticated;
grant execute on function public.gestao_campanha_retomar(uuid) to authenticated;
grant execute on function public.gestao_campanha_cancelar(uuid) to authenticated;
grant execute on function public.gestao_aulas() to authenticated;
grant execute on function public.gestao_aula_salvar(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.gestao_aula_apagar(uuid) to authenticated;
grant execute on function public.gestao_aulas_ordenar(uuid[]) to authenticated;
grant execute on function public.gestao_feedbacks() to authenticated;
grant execute on function public.gestao_feedback_marcar(uuid, text) to authenticated;
grant execute on function public.gestao_importar_dados_flow(jsonb, boolean) to authenticated;

revoke execute on function public.descadastrar(text) from public, anon, authenticated;
revoke execute on function public.campanha_proximo_lote() from public, anon, authenticated;
revoke execute on function public.campanha_registrar_envio(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.feedback_registrar(text, text, uuid, text, text, text, int) from public, anon, authenticated;
grant execute on function public.descadastrar(text) to service_role;
grant execute on function public.campanha_proximo_lote() to service_role;
grant execute on function public.campanha_registrar_envio(bigint, text, text) to service_role;
grant execute on function public.feedback_registrar(text, text, uuid, text, text, text, int) to service_role;
