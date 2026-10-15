-- Arquionie™: a COMPRA DO PRO (plano 19 do repositório do plugin, docs/migracao-arkiton/19, decisões do ÊDI de 15/10/2026).
-- Rodar uma vez no SQL Editor do projeto arquionie, depois da 20261015000000_licenca_unica_e_gestao_do_flow.sql. Pode rodar
-- duas vezes sem estragar nada.
--
-- O que muda:
--   1. PLANOS. Dois produtos à venda, cada um com mensal (recorrente) e anual (o principal):
--        PLUGIN PRO .... só o plugin do Revit ............. R$ 69 no mensal, R$ 39/mês no anual
--        ARQUIONIE PRO . o programa + o plugin PRO ......... R$ 119 no mensal, R$ 79/mês no anual
--      A licença ganha o plano `plugin` (só o plugin). O `pro` continua sendo o completo (programa + plugin), como as 8
--      licenças que vieram do Flow; o `equipe` não muda. O programa ignora a licença `plugin`; o plugin aceita as três, e a
--      ficha do plugin diz `pro` para a `plugin` (o plugin 4.x só conhece `pro` e `equipe`).
--   2. PREÇOS. A tabela `precos` ganha os quatro valores (o anual guardado POR MÊS, como aparece na vitrine). Os campos de
--      antes (parcela, parcelas, avista) ficam para a aba PREÇOS E CUPONS de hoje, até ela mudar.
--   3. PEDIDOS. O formulário `arquionie.com.br/comprar` (sem conta) grava o pedido e leva a pessoa ao WhatsApp de vendas; o
--      /gestao › PEDIDOS confirma o pagamento e libera a licença pelo e-mail (sem chave), renova o mensal e encerra.
--      O cupom de campanha vale só no anual (ÊDI, 15/10/2026). O valor é sempre calculado aqui, nunca vem do navegador.
--
-- Quem chama o quê (o que é novo aqui):
--   qualquer um (anon) ........ pedido_criar (e precos_vigentes, que agora devolve também os planos)
--   site (/gestao) ............ gestao_precos_planos_salvar, gestao_pedidos, gestao_pedido_liberar, gestao_pedido_renovar,
--                               gestao_pedido_cancelar, gestao_pedido_encerrar, gestao_pedido_chave
-- A tabela nova não se lê nem se escreve direto: tudo passa pelas funções acima (RLS ligado e sem política).

-- ================================================================================================ LICENÇA: o plano `plugin`
alter table public.licencas drop constraint if exists licencas_plano_check;
alter table public.licencas add constraint licencas_plano_check check (plano in ('pro', 'equipe', 'plugin'));

-- A licença em uso de uma pessoa (a de equipe primeiro, depois a completa, depois a que vence por último). No programa
-- (`arquionie`) a licença só do plugin não conta; no plugin (`arquionie-revit`) contam todas.
create or replace function public.licenca_em_uso(p_usuario uuid, p_produto text) returns public.licencas
language sql stable security definer set search_path = '' as $$
  select l.* from public.licencas l
   where l.usuario_id = p_usuario and l.status = 'ativa' and l.expira_em > now()
     and (coalesce(p_produto, 'arquionie') = 'arquionie-revit' or l.plano <> 'plugin')
   order by (l.plano = 'equipe') desc, (l.plano = 'pro') desc, l.expira_em desc
   limit 1;
$$;

revoke execute on function public.licenca_em_uso(uuid, text) from public, anon, authenticated;

-- A ficha assinada: igual à de 05/10, com a licença `plugin` saindo como `pro` (o plugin 4.x só conhece `pro` e `equipe`).
create or replace function public.licenca_estado(p_credencial_hash text, p_maquina text, p_versao text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.computadores;
  l public.licencas;
  a public.ajustes_licenca;
  v_plano text;
  v_vale timestamptz;
begin
  select * into c from public.computadores where credencial_hash = p_credencial_hash;
  if not found or c.maquina is distinct from p_maquina then
    return jsonb_build_object('situacao', 'desconectado');
  end if;
  update public.computadores
     set ultimo_acesso = now(), versao = coalesce(nullif(left(p_versao, 40), ''), versao)
   where id = c.id;

  select * into a from public.ajustes_licenca where id;
  l := public.licenca_em_uso(c.usuario_id, c.produto);
  v_plano := case when l.plano = 'plugin' then 'pro' else coalesce(l.plano, 'gratis') end;
  v_vale := now() + make_interval(days => a.dias_sem_internet);
  if l.id is not null and l.expira_em < v_vale then
    v_vale := l.expira_em;
  end if;

  return jsonb_build_object(
    'situacao', 'ok',
    'produto', c.produto,
    'plano', v_plano,
    'email', (select u.email from auth.users u where u.id = c.usuario_id),
    'expiraEm', l.expira_em,
    'valeAte', v_vale,
    'emitidaEm', now(),
    'computador', c.id,
    'maquina', c.maquina,
    'canal', case when c.produto = 'arquionie-revit'
                  then case when v_plano = 'equipe' then 'revit-escritorio' else 'revit-estavel' end
                  else case when v_plano = 'equipe' then 'escritorio' else 'estavel' end end,
    'limiteTestes', a.limite_testes
  );
end $$;

revoke execute on function public.licenca_estado(text, text, text) from public, anon, authenticated;
grant execute on function public.licenca_estado(text, text, text) to service_role;

-- ================================================================================================ PREÇOS DOS PLANOS
alter table public.precos add column if not exists plugin_mensal numeric(10, 2) not null default 69 check (plugin_mensal > 0);
alter table public.precos add column if not exists plugin_anual numeric(10, 2) not null default 39 check (plugin_anual > 0);
alter table public.precos add column if not exists arquionie_mensal numeric(10, 2) not null default 119 check (arquionie_mensal > 0);
alter table public.precos add column if not exists arquionie_anual numeric(10, 2) not null default 79 check (arquionie_anual > 0);

-- O preço de um plano, por mês (o anual também é por mês: "R$ 39/mês, cobrado anualmente").
create or replace function public.preco_do_plano(p_produto text, p_periodo text) returns numeric
language sql stable security definer set search_path = '' as $$
  select case
           when p_produto = 'plugin' and p_periodo = 'mensal' then p.plugin_mensal
           when p_produto = 'plugin' and p_periodo = 'anual' then p.plugin_anual
           when p_produto = 'arquionie' and p_periodo = 'mensal' then p.arquionie_mensal
           when p_produto = 'arquionie' and p_periodo = 'anual' then p.arquionie_anual
         end
    from public.precos p where p.id;
$$;

revoke execute on function public.preco_do_plano(text, text) from public, anon, authenticated;

-- A página de venda lê o preço sem conta. Os campos de antes continuam; `planos` é o que os quadros de preço usam.
create or replace function public.precos_vigentes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'parcela', p.parcela, 'parcelas', p.parcelas, 'avista', p.avista, 'totalParcelado', p.parcela * p.parcelas,
    'atualizadoEm', p.atualizado_em,
    'planos', jsonb_build_object(
      'plugin', jsonb_build_object('mensal', p.plugin_mensal, 'anual', p.plugin_anual, 'anualTotal', p.plugin_anual * 12,
                                   'desconto', floor((1 - p.plugin_anual / p.plugin_mensal) * 100)),
      'arquionie', jsonb_build_object('mensal', p.arquionie_mensal, 'anual', p.arquionie_anual,
                                      'anualTotal', p.arquionie_anual * 12,
                                      'desconto', floor((1 - p.arquionie_anual / p.arquionie_mensal) * 100))))
    from public.precos p where p.id;
$$;

create or replace function public.gestao_precos_planos_salvar(p_plugin_mensal numeric, p_plugin_anual numeric,
                                                              p_arquionie_mensal numeric, p_arquionie_anual numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  if coalesce(p_plugin_mensal, 0) <= 0 or coalesce(p_plugin_anual, 0) <= 0
     or coalesce(p_arquionie_mensal, 0) <= 0 or coalesce(p_arquionie_anual, 0) <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'Os valores têm que ser maiores que zero.');
  end if;
  if p_plugin_anual >= p_plugin_mensal or p_arquionie_anual >= p_arquionie_mensal then
    return jsonb_build_object('ok', false, 'motivo', 'O anual (por mês) tem que sair mais barato que o mensal.');
  end if;
  update public.precos
     set plugin_mensal = round(p_plugin_mensal, 2), plugin_anual = round(p_plugin_anual, 2),
         arquionie_mensal = round(p_arquionie_mensal, 2), arquionie_anual = round(p_arquionie_anual, 2),
         atualizado_em = now(), atualizado_por = (select auth.uid())
   where id;
  return jsonb_build_object('ok', true) || public.precos_vigentes();
end $$;

-- ================================================================================================ PEDIDOS
create sequence if not exists public.pedidos_numero;

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique default nextval('public.pedidos_numero'),
  produto text not null check (produto in ('plugin', 'arquionie')),
  periodo text not null check (periodo in ('mensal', 'anual')),
  nome text not null check (length(btrim(nome)) between 2 and 120),
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  whatsapp text not null check (whatsapp ~ '^[0-9]{10,13}$'),
  cupom text,
  desconto int not null default 0 check (desconto between 0 and 100),
  valor_mes numeric(10, 2) not null check (valor_mes >= 0),        -- o que a pessoa paga por mês, já com o cupom
  valor_cobranca numeric(10, 2) not null check (valor_cobranca >= 0), -- o que se cobra agora: o ano todo ou o mês
  origem text not null default 'outro' check (origem in ('arquionie', 'revit', 'campanha', 'whatsapp', 'outro')),
  situacao text not null default 'aguardando' check (situacao in ('aguardando', 'liberado', 'cancelado', 'encerrado')),
  licenca_id uuid references public.licencas (id) on delete set null,
  chave_plugin text,                 -- a chave PFPRO- do plugin 4.x, até o Dia D (plano 19, decisão 4)
  renovacoes int not null default 0,
  criado_em timestamptz not null default now(),
  liberado_em timestamptz,
  ultimo_pagamento_em timestamptz,
  encerrado_em timestamptz,
  atualizado_por uuid references auth.users (id) on delete set null
);

alter sequence public.pedidos_numero owned by public.pedidos.numero;
create index if not exists pedidos_criado on public.pedidos (criado_em desc);
create index if not exists pedidos_email on public.pedidos (email);

alter table public.pedidos enable row level security;

create or replace function public.pedido_codigo(p_numero int) returns text
language sql immutable set search_path = '' as $$
  select 'P-' || lpad(p_numero::text, 4, '0');
$$;

-- O formulário COMPRAR PELO WHATSAPP, sem conta. O plano e o período vêm do cartão que a pessoa clicou. O cupom só vale no
-- anual; cupom que não vale não impede o pedido (a venda continua no WhatsApp). Barreira contra robô: 3 pedidos por e-mail
-- por hora e 60 no total por hora.
create or replace function public.pedido_criar(p_produto text, p_periodo text, p_nome text, p_email text, p_whatsapp text,
                                               p_cupom text default null, p_origem text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_whats text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_nome text := btrim(coalesce(p_nome, ''));
  v_base numeric;
  v_cupom jsonb;
  v_codigo text;
  v_desconto int := 0;
  v_mes numeric;
  p public.pedidos;
begin
  if p_produto not in ('plugin', 'arquionie') or p_periodo not in ('mensal', 'anual') then
    return jsonb_build_object('ok', false, 'motivo', 'Escolha o plano no quadro de preço.');
  end if;
  if length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'motivo', 'Digite o seu nome.');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'motivo', 'Digite um e-mail válido: a sua conta será com ele.');
  end if;
  if length(v_whats) between 10 and 11 then
    v_whats := '55' || v_whats;
  end if;
  if v_whats !~ '^[0-9]{12,13}$' then
    return jsonb_build_object('ok', false, 'motivo', 'Digite o WhatsApp com o DDD.');
  end if;
  if (select count(*) from public.pedidos where email = v_email and criado_em > now() - interval '1 hour') >= 3
     or (select count(*) from public.pedidos where criado_em > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'motivo', 'Muitos pedidos agora. Fale direto com a gente no WhatsApp.');
  end if;

  v_base := public.preco_do_plano(p_produto, p_periodo);
  if p_periodo = 'anual' and nullif(btrim(coalesce(p_cupom, '')), '') is not null then
    v_cupom := public.cupom_conferir(p_cupom);
    if (v_cupom ->> 'valido')::boolean then
      v_codigo := v_cupom ->> 'codigo';
      v_desconto := (v_cupom ->> 'desconto')::int;
    end if;
  end if;
  v_mes := round(v_base * (100 - v_desconto) / 100.0, 2);

  insert into public.pedidos (produto, periodo, nome, email, whatsapp, cupom, desconto, valor_mes, valor_cobranca, origem)
  values (p_produto, p_periodo, left(v_nome, 120), v_email, v_whats, v_codigo, v_desconto, v_mes,
          case when p_periodo = 'anual' then v_mes * 12 else v_mes end,
          case when p_origem in ('arquionie', 'revit', 'campanha', 'whatsapp') then p_origem else 'outro' end)
  returning * into p;

  return jsonb_build_object('ok', true, 'pedido', public.pedido_codigo(p.numero), 'produto', p.produto, 'periodo', p.periodo,
                            'valorMes', p.valor_mes, 'valorCobranca', p.valor_cobranca, 'cupom', p.cupom,
                            'desconto', p.desconto,
                            'cupomRecusado', nullif(btrim(coalesce(p_cupom, '')), '') is not null and p.cupom is null);
end $$;

-- A situação que a aba mostra: aguardando, renovar (o mensal a 3 dias de vencer, o anual a 30), esperando a conta, em uso,
-- vencido, revogado, cancelado, encerrado. O mensal vencido também entra no RENOVAR ESTA SEMANA (o resumo e a ordem).
create or replace function public.pedido_situacao(p public.pedidos, l public.licencas) returns text
language sql stable set search_path = '' as $$
  select case
    when p.situacao <> 'liberado' then p.situacao
    when l.id is null or l.status = 'revogada' then 'revogado'
    when l.expira_em <= now() then 'vencido'
    when l.expira_em <= now() + case when p.periodo = 'mensal' then interval '3 days' else interval '30 days' end then 'renovar'
    when l.usuario_id is null then 'esperando a conta'
    else 'em uso'
  end;
$$;

create or replace function public.gestao_pedidos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  return (
    with x as (
      select p, l, public.pedido_situacao(p, l) as s
        from public.pedidos p left join public.licencas l on l.id = p.licenca_id)
    select jsonb_build_object(
      'resumo', jsonb_build_object(
        'total', count(*),
        'aguardando', count(*) filter (where s = 'aguardando'),
        'renovar', count(*) filter (where s = 'renovar' or (s = 'vencido' and (p).periodo = 'mensal')),
        'liberados', count(*) filter (where s in ('esperando a conta', 'em uso', 'renovar'))),
      'pedidos', coalesce(jsonb_agg(jsonb_build_object(
        'id', (p).id, 'pedido', public.pedido_codigo((p).numero), 'produto', (p).produto, 'periodo', (p).periodo,
        'nome', (p).nome, 'email', (p).email, 'whatsapp', (p).whatsapp, 'cupom', (p).cupom, 'desconto', (p).desconto,
        'valorMes', (p).valor_mes, 'valorCobranca', (p).valor_cobranca, 'origem', (p).origem, 'situacao', s,
        'chavePlugin', (p).chave_plugin, 'renovacoes', (p).renovacoes, 'criadoEm', (p).criado_em,
        'liberadoEm', (p).liberado_em, 'ultimoPagamentoEm', (p).ultimo_pagamento_em, 'encerradoEm', (p).encerrado_em,
        'licenca', case when (l).id is null then null else jsonb_build_object(
          'id', (l).id, 'expiraEm', (l).expira_em, 'ligada', (l).usuario_id is not null,
          'computadoresPrograma', (select count(*) from public.computadores c
                                    where c.usuario_id = (l).usuario_id and c.produto = 'arquionie'),
          'computadoresPlugin', (select count(*) from public.computadores c
                                  where c.usuario_id = (l).usuario_id and c.produto = 'arquionie-revit')) end)
        order by (s in ('aguardando', 'renovar') or (s = 'vencido' and (p).periodo = 'mensal')) desc, (p).criado_em desc),
        '[]'::jsonb))
      from x);
end $$;

-- CONFIRMAR PAGAMENTO E LIBERAR: a licença de 1 ano (anual) ou 1 mês (mensal) no e-mail do pedido. Liga sozinha na conta
-- com esse e-mail, já confirmada ou quando for confirmada. Até o Dia D, a chave PFPRO- do plugin 4.x vai junto (opcional).
create or replace function public.gestao_pedido_liberar(p_id uuid, p_chave_plugin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.pedidos;
  r jsonb;
  v_lic uuid;
begin
  perform public.gestao_exigir();
  select * into p from public.pedidos where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido não encontrado.');
  end if;
  if p.situacao <> 'aguardando' then
    return jsonb_build_object('ok', false, 'motivo', 'Este pedido já foi ' || p.situacao || '.');
  end if;

  r := public.gestao_liberar(p.email, 'arquionie', 1,
         now() + case when p.periodo = 'anual' then interval '1 year' else interval '1 month' end,
         case when p.produto = 'plugin' then 'plugin' else 'pro' end, 'whatsapp',
         public.pedido_codigo(p.numero) || ' · ' || case when p.produto = 'plugin' then 'PLUGIN PRO' else 'ARQUIONIE PRO' end
           || ' ' || upper(p.periodo) || coalesce(' · cupom ' || p.cupom, ''));
  if not (r ->> 'ok')::boolean then
    return r;
  end if;
  v_lic := (r -> 'ids' ->> 0)::uuid;

  update public.pedidos
     set situacao = 'liberado', licenca_id = v_lic, liberado_em = now(), ultimo_pagamento_em = now(),
         chave_plugin = coalesce(nullif(upper(btrim(coalesce(p_chave_plugin, ''))), ''), chave_plugin),
         atualizado_por = (select auth.uid())
   where id = p.id;

  return jsonb_build_object('ok', true, 'pedido', public.pedido_codigo(p.numero), 'licenca', v_lic,
                            'expiraEm', (select expira_em from public.licencas where id = v_lic),
                            'contaExiste', (r ->> 'contaExiste')::boolean);
end $$;

-- CONFIRMAR RENOVAÇÃO: soma o período do pedido (1 mês ou 1 ano) a partir da validade, ou de hoje se já venceu.
create or replace function public.gestao_pedido_renovar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.pedidos;
  r jsonb;
begin
  perform public.gestao_exigir();
  select * into p from public.pedidos where id = p_id for update;
  if not found or p.situacao <> 'liberado' or p.licenca_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'Só se renova um pedido liberado.');
  end if;
  r := public.gestao_renovar(p.licenca_id, case when p.periodo = 'anual' then 12 else 1 end);
  if not (r ->> 'ok')::boolean then
    return r;
  end if;
  update public.pedidos
     set renovacoes = renovacoes + 1, ultimo_pagamento_em = now(), atualizado_por = (select auth.uid())
   where id = p.id;
  return jsonb_build_object('ok', true, 'expiraEm', r -> 'expiraEm', 'renovacoes', p.renovacoes + 1);
end $$;

-- CANCELAR: o pedido que não foi pago sai dos abertos.
create or replace function public.gestao_pedido_cancelar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  update public.pedidos set situacao = 'cancelado', atualizado_por = (select auth.uid())
   where id = p_id and situacao = 'aguardando';
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Só se cancela um pedido aguardando pagamento.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ENCERRAR: a assinatura não renova mais. A licença vale até o fim do que já foi pago e depois a pessoa volta ao grátis.
create or replace function public.gestao_pedido_encerrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  update public.pedidos set situacao = 'encerrado', encerrado_em = now(), atualizado_por = (select auth.uid())
   where id = p_id and situacao = 'liberado';
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Só se encerra um pedido liberado.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- A chave PFPRO- do plugin 4.x, colada depois de liberar (até o Dia D).
create or replace function public.gestao_pedido_chave(p_id uuid, p_chave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  if length(btrim(coalesce(p_chave, ''))) not between 5 and 64 then
    return jsonb_build_object('ok', false, 'motivo', 'Cole a chave do plugin (PFPRO-…).');
  end if;
  update public.pedidos set chave_plugin = upper(btrim(p_chave)), atualizado_por = (select auth.uid()) where id = p_id;
  return jsonb_build_object('ok', found);
end $$;

-- ================================================================================================ quem pode chamar
revoke execute on function public.pedido_codigo(int) from public;
revoke execute on function public.pedido_situacao(public.pedidos, public.licencas) from public, anon, authenticated;
revoke execute on function public.pedido_criar(text, text, text, text, text, text, text) from public;
grant execute on function public.pedido_criar(text, text, text, text, text, text, text) to anon, authenticated;

revoke execute on function public.gestao_precos_planos_salvar(numeric, numeric, numeric, numeric) from public, anon;
revoke execute on function public.gestao_pedidos() from public, anon;
revoke execute on function public.gestao_pedido_liberar(uuid, text) from public, anon;
revoke execute on function public.gestao_pedido_renovar(uuid) from public, anon;
revoke execute on function public.gestao_pedido_cancelar(uuid) from public, anon;
revoke execute on function public.gestao_pedido_encerrar(uuid) from public, anon;
revoke execute on function public.gestao_pedido_chave(uuid, text) from public, anon;
grant execute on function public.gestao_precos_planos_salvar(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.gestao_pedidos() to authenticated;
grant execute on function public.gestao_pedido_liberar(uuid, text) to authenticated;
grant execute on function public.gestao_pedido_renovar(uuid) to authenticated;
grant execute on function public.gestao_pedido_cancelar(uuid) to authenticated;
grant execute on function public.gestao_pedido_encerrar(uuid) to authenticated;
grant execute on function public.gestao_pedido_chave(uuid, text) to authenticated;
