-- A proteção como opção e a troca do dono (doc 73, §8, do programa; mockup trocar-o-dono, versão 2, aprovado por ÊDI em 27/10/2026:
-- "Aprovo as doze recomendações"). O projeto nasce aberto e a proteção se liga quando o escritório quiser; o responsável pode deixar a
-- proteção ligada de padrão para a equipe; o dono de um projeto protegido passa o projeto ao escritório em que está na equipe, com o
-- mesmo identificador e a mesma chave (todas as cópias do arquivo continuam abrindo), e as páginas do cliente vão junto, com o mesmo link;
-- quem é do escritório pede; a troca, a proteção ligada e a tirada ficam no registro. Pode rodar mais de uma vez.

-- ------------------------------------------------------------------------------------------------ tabelas
-- Quando o projeto chegou ao dono de agora (nulo: desde que foi criado), para a cópia de segurança das chaves contar o que chegou; e a
-- chave da página do cliente do projeto, que o programa manda, para a troca pelo site levar a página junto.
alter table public.projetos add column if not exists do_dono_desde timestamptz;
alter table public.projetos add column if not exists pagina text;
alter table public.projetos drop constraint if exists projetos_pagina_tamanho;
alter table public.projetos add constraint projetos_pagina_tamanho check (pagina is null or char_length(pagina) between 1 and 200);

-- O registro ganha a troca do dono (de quem, para quem, a pedido de quem) e a proteção ligada e tirada.
alter table public.projeto_registro drop constraint if exists projeto_registro_acao_check;
alter table public.projeto_registro add constraint projeto_registro_acao_check
  check (acao in ('copia_aberta', 'copia_de_seguranca', 'protecao_ligada', 'protecao_tirada', 'troca_de_dono'));
alter table public.projeto_registro add column if not exists de_dono uuid references auth.users(id) on delete set null;
alter table public.projeto_registro add column if not exists para_dono uuid references auth.users(id) on delete set null;
alter table public.projeto_registro add column if not exists pedido_por uuid references auth.users(id) on delete set null;
create index if not exists projeto_registro_trocas on public.projeto_registro (para_dono, em desc) where acao = 'troca_de_dono';

-- O PEDIR AO ESCRITÓRIO: quem é da equipe de um escritório pede ao dono de um projeto da MINHA ÁREA que o passe ao escritório.
create table if not exists public.projeto_pedidos_ao_escritorio (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  escritorio_id uuid not null references auth.users(id) on delete cascade,   -- a conta do responsável (o escritório)
  pedido_por uuid references auth.users(id) on delete set null,
  situacao text not null default 'esperando' check (situacao in ('esperando', 'aceito', 'recusado')),
  pedido_em timestamptz not null default now(),
  respondido_em timestamptz,
  unique (projeto_id, escritorio_id)
);
alter table public.projeto_pedidos_ao_escritorio enable row level security;

-- O padrão do escritório: proteger os projetos novos da equipe (desligado de fábrica). Uma linha por conta de responsável.
create table if not exists public.protecao_padrao (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  proteger_novos boolean not null default false,
  atualizado_em timestamptz not null default now()
);
alter table public.protecao_padrao enable row level security;
-- Ninguém lê nem escreve as tabelas direto: só pelas funções abaixo.

-- ------------------------------------------------------------------------------------------------ o pedido ao escritório
-- O escritório que pode pedir o projeto: um escritório de quem chama (a própria conta ou uma equipe em que está, ativo) em cuja equipe o
-- dono do projeto está, ativo ou com o convite esperando. O da própria conta vem primeiro (o responsável que pede).
create or replace function public.escritorio_do_pedido(p_quem uuid, p_projeto uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select e.r
    from public.projetos p cross join lateral public.escritorios_de(p_quem) as e(r)
   where p.id = p_projeto and e.r <> p.dono_id
     and exists (select 1 from public.equipe q join auth.users u on lower(u.email) = q.email and u.email_confirmed_at is not null
                  where q.responsavel_id = e.r and u.id = p.dono_id and q.situacao in ('ativo', 'convidado'))
   order by (e.r = p_quem) desc, e.r
   limit 1
$$;

-- A CHAVE: como antes; sem acesso, também o escritório que pode pedir o projeto ao dono e a situação desse pedido.
create or replace function public.projeto_chave(p_projeto uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_dono uuid;
  v_escritorio uuid;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  select dono_id into v_dono from public.projetos where id = p_projeto;
  if v_dono is null then
    return jsonb_build_object('ok', false, 'motivo', 'desconhecido');
  end if;
  if public.papel_no_projeto(v_usuario, p_projeto) is null then
    v_escritorio := public.escritorio_do_pedido(v_usuario, p_projeto);
    return jsonb_build_object('ok', false, 'motivo', 'sem_acesso', 'nomeDoDono', public.nome_do_escritorio(v_dono),
      'pedido', (select situacao from public.projeto_pedidos where projeto_id = p_projeto and usuario_id = v_usuario),
      'escritorioQuePede', case when v_escritorio is not null then
        jsonb_build_object('responsavel', v_escritorio, 'nome', public.nome_do_escritorio(v_escritorio)) end,
      'pedidoAoEscritorio', (select situacao from public.projeto_pedidos_ao_escritorio
                              where projeto_id = p_projeto and escritorio_id = v_escritorio));
  end if;
  return public.chave_do_projeto(v_usuario, p_projeto);
end $$;

-- PEDIR AO ESCRITÓRIO: o pedido chega ao dono. Pedir de novo depois de recusado vale como um pedido novo.
create or replace function public.projeto_pedir_ao_escritorio(p_projeto uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_escritorio uuid;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  if not exists (select 1 from public.projetos where id = p_projeto) then
    return jsonb_build_object('ok', false, 'motivo', 'Este projeto não está registrado no Arquionie.');
  end if;
  v_escritorio := public.escritorio_do_pedido(v_usuario, p_projeto);
  if v_escritorio is null then
    return jsonb_build_object('ok', false, 'motivo', 'O dono deste projeto não está na equipe do seu escritório.');
  end if;
  insert into public.projeto_pedidos_ao_escritorio (projeto_id, escritorio_id, pedido_por) values (p_projeto, v_escritorio, v_usuario)
  on conflict (projeto_id, escritorio_id) do update set situacao = 'esperando', pedido_por = excluded.pedido_por, pedido_em = now(),
    respondido_em = null
   where public.projeto_pedidos_ao_escritorio.situacao <> 'esperando';
  return jsonb_build_object('ok', true, 'nomeDoDono',
    public.nome_do_escritorio((select dono_id from public.projetos where id = p_projeto)), 'escritorio', public.nome_do_escritorio(v_escritorio));
end $$;

-- Os pedidos ao escritório que esperam o dono (quem chama): o projeto, o escritório, quem pediu e se o convite da equipe ainda espera.
create or replace function public.projeto_pedidos_ao_escritorio() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_email text := public.meu_email();
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'projeto', p.id, 'nomeDoProjeto', p.nome, 'escritorio', d.escritorio_id,
      'nomeDoEscritorio', public.nome_do_escritorio(d.escritorio_id), 'pedidoPor', coalesce(nullif(public.nome_da_conta(u.id), ''), u.email),
      'pedidoEm', d.pedido_em,
      'convite', exists (select 1 from public.equipe q where q.responsavel_id = d.escritorio_id and q.email = v_email and q.situacao = 'convidado'))
      order by d.pedido_em)
    from public.projeto_pedidos_ao_escritorio d join public.projetos p on p.id = d.projeto_id
    left join auth.users u on u.id = d.pedido_por
   where p.dono_id = v_usuario and d.situacao = 'esperando'), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------------------------------------ a troca do dono
-- PASSAR AO ESCRITÓRIO: só o dono, para um escritório em cuja equipe está, ativo. O identificador e a chave ficam; os convidados e os
-- pedidos de acesso seguem o projeto; a página do cliente (a da chave que o programa manda, ou a que o servidor já conhece) passa à conta
-- do escritório, com o mesmo link; os pedidos ao escritório se fecham; fica registrado.
create or replace function public.projeto_passar(p_projeto uuid, p_escritorio uuid, p_pagina text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_dono uuid;
  v_pagina text;
  v_paginas int := 0;
  v_pedido_por uuid;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  select dono_id, pagina into v_dono, v_pagina from public.projetos where id = p_projeto for update;
  if v_dono is null then
    return jsonb_build_object('ok', false, 'motivo', 'Este projeto não está registrado no Arquionie.');
  end if;
  if v_dono <> v_usuario then
    return jsonb_build_object('ok', false, 'motivo', 'Só o dono passa o projeto ao escritório.');
  end if;
  if p_escritorio is null or p_escritorio = v_usuario then
    return jsonb_build_object('ok', false, 'motivo', 'Escolha o escritório.');
  end if;
  if not public.da_equipe(v_usuario, p_escritorio) then
    return jsonb_build_object('ok', false, 'motivo', 'Você não está na equipe deste escritório: entre pelo convite antes de passar o projeto.');
  end if;
  v_pagina := coalesce(nullif(btrim(coalesce(p_pagina, '')), ''), v_pagina);
  if v_pagina is not null and char_length(v_pagina) > 200 then
    v_pagina := null;
  end if;
  select pedido_por into v_pedido_por from public.projeto_pedidos_ao_escritorio
   where projeto_id = p_projeto and escritorio_id = p_escritorio and situacao = 'esperando';
  update public.projetos set dono_id = p_escritorio, do_dono_desde = now(), pagina = v_pagina where id = p_projeto;
  if v_pagina is not null then
    update public.apresentacoes a set usuario_id = p_escritorio
     where a.usuario_id = v_usuario and a.chave = v_pagina
       and not exists (select 1 from public.apresentacoes x where x.usuario_id = p_escritorio and x.chave = v_pagina);
    get diagnostics v_paginas = row_count;
  end if;
  update public.projeto_pedidos_ao_escritorio set situacao = case when escritorio_id = p_escritorio then 'aceito' else 'recusado' end,
    respondido_em = now()
   where projeto_id = p_projeto and situacao = 'esperando';
  insert into public.projeto_registro (projeto_id, usuario_id, acao, de_dono, para_dono, pedido_por)
  values (p_projeto, v_usuario, 'troca_de_dono', v_usuario, p_escritorio, v_pedido_por);
  return public.chave_do_projeto(v_usuario, p_projeto) || jsonb_build_object('paginas', v_paginas);
end $$;

-- A resposta do dono ao PEDIR AO ESCRITÓRIO: RECUSAR, ou PASSAR (com o convite da equipe esperando, entra na equipe junto).
create or replace function public.projeto_responder_pedido_ao_escritorio(p_pedido uuid, p_aceitar boolean, p_pagina text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_projeto uuid;
  v_escritorio uuid;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  select d.projeto_id, d.escritorio_id into v_projeto, v_escritorio
    from public.projeto_pedidos_ao_escritorio d join public.projetos p on p.id = d.projeto_id
   where d.id = p_pedido and p.dono_id = v_usuario and d.situacao = 'esperando';
  if v_projeto is null then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido não encontrado ou já respondido.');
  end if;
  if not coalesce(p_aceitar, false) then
    update public.projeto_pedidos_ao_escritorio set situacao = 'recusado', respondido_em = now() where id = p_pedido;
    return jsonb_build_object('ok', true);
  end if;
  update public.equipe set situacao = 'ativo', entrou_em = now()
   where responsavel_id = v_escritorio and email = public.meu_email() and situacao = 'convidado';
  return public.projeto_passar(v_projeto, v_escritorio, p_pagina);
end $$;

-- A página do cliente do projeto: o programa manda a chave dela ao abrir, para a troca pelo site levar a página junto.
create or replace function public.projeto_pagina(p_projeto uuid, p_pagina text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  if coalesce(public.papel_no_projeto(v_usuario, p_projeto), '') not in ('dono', 'equipe') then
    return jsonb_build_object('ok', false, 'motivo', 'sem_acesso');
  end if;
  if nullif(btrim(coalesce(p_pagina, '')), '') is null or char_length(btrim(p_pagina)) > 200 then
    return jsonb_build_object('ok', false, 'motivo', 'A página não confere.');
  end if;
  update public.projetos set pagina = btrim(p_pagina) where id = p_projeto;
  return jsonb_build_object('ok', true);
end $$;

-- Os projetos protegidos de quem chama: os que são dele (para PASSAR AO ESCRITÓRIO pelo site), os escritórios para onde pode passar, os que
-- passou e os que chegaram a ele.
create or replace function public.meus_projetos_protegidos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  return jsonb_build_object(
    'projetos', coalesce((select jsonb_agg(jsonb_build_object('projeto', p.id, 'nome', p.nome, 'desde', coalesce(p.do_dono_desde, p.criado_em),
        'comPagina', p.pagina is not null) order by coalesce(p.do_dono_desde, p.criado_em) desc)
      from public.projetos p where p.dono_id = v_usuario), '[]'::jsonb),
    'escritorios', coalesce((select jsonb_agg(jsonb_build_object('responsavel', e.r, 'escritorio', public.nome_do_escritorio(e.r)) order by e.r)
      from public.escritorios_de(v_usuario) as e(r) where e.r <> v_usuario), '[]'::jsonb),
    'passados', coalesce((select jsonb_agg(x.item order by x.em desc) from (
        select jsonb_build_object('projeto', r.projeto_id, 'nome', p.nome, 'para', public.nome_do_escritorio(r.para_dono), 'em', r.em) as item, r.em
          from public.projeto_registro r join public.projetos p on p.id = r.projeto_id
         where r.acao = 'troca_de_dono' and r.de_dono = v_usuario order by r.em desc limit 20) x), '[]'::jsonb),
    'chegaram', coalesce((select jsonb_agg(x.item order by x.em desc) from (
        select jsonb_build_object('projeto', r.projeto_id, 'nome', p.nome,
            'de', coalesce(nullif(public.nome_da_conta(r.de_dono), ''), (select u.email from auth.users u where u.id = r.de_dono)),
            'aPedidoDe', case when r.pedido_por is null then null
              else coalesce(nullif(public.nome_da_conta(r.pedido_por), ''), (select u.email from auth.users u where u.id = r.pedido_por)) end,
            'aPedidoSeu', r.pedido_por = v_usuario, 'em', r.em) as item, r.em
          from public.projeto_registro r join public.projetos p on p.id = r.projeto_id
         where r.acao = 'troca_de_dono' and r.para_dono = v_usuario order by r.em desc limit 20) x), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------------------------------------------ a proteção ligada e tirada
-- REGISTRAR: como antes (o dono e a chave do projeto novo; já registrado, o que está guardado); o projeto novo fica no registro como a
-- proteção ligada, com quem ligou.
create or replace function public.projeto_registrar(p_projeto uuid, p_dono uuid, p_nome text, p_chave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_chave bytea;
  v_papel text;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  if p_projeto is null then
    return jsonb_build_object('ok', false, 'motivo', 'O projeto não tem identificador.');
  end if;
  if exists (select 1 from public.projetos where id = p_projeto) then
    v_papel := public.papel_no_projeto(v_usuario, p_projeto);
    if v_papel is null then
      return jsonb_build_object('ok', false, 'motivo', 'sem_acesso', 'nomeDoDono',
        public.nome_do_escritorio((select dono_id from public.projetos where id = p_projeto)));
    end if;
    if v_papel in ('dono', 'equipe') and nullif(btrim(coalesce(p_nome, '')), '') is not null then
      update public.projetos set nome = left(btrim(p_nome), 200) where id = p_projeto;
    end if;
    return public.chave_do_projeto(v_usuario, p_projeto);
  end if;
  if p_dono is null or not public.da_equipe(v_usuario, p_dono) then
    return jsonb_build_object('ok', false, 'motivo', 'Só o responsável e a equipe dele criam projetos do escritório.');
  end if;
  begin
    v_chave := decode(coalesce(p_chave, ''), 'base64');
  exception when others then
    v_chave := null;
  end;
  if v_chave is null or octet_length(v_chave) <> 32 then
    return jsonb_build_object('ok', false, 'motivo', 'A chave do projeto tem 32 bytes.');
  end if;
  insert into public.projetos (id, dono_id, nome, chave, criado_por)
  values (p_projeto, p_dono, left(btrim(coalesce(p_nome, '')), 200), v_chave, v_usuario)
  on conflict (id) do nothing;
  if found then
    insert into public.projeto_registro (projeto_id, usuario_id, acao, para_dono) values (p_projeto, v_usuario, 'protecao_ligada', p_dono);
  end if;
  return public.chave_do_projeto(v_usuario, p_projeto);
end $$;

-- TIRAR A PROTEÇÃO (a cópia aberta no lugar do arquivo): só o dono. O projeto fica no servidor, para as cópias protegidas de antes
-- continuarem abrindo para quem tinha acesso; fica registrado quem tirou.
create or replace function public.projeto_tirar_protecao(p_projeto uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  if public.papel_no_projeto(v_usuario, p_projeto) is distinct from 'dono' then
    return jsonb_build_object('ok', false, 'motivo', 'Só o dono tira a proteção: no projeto do escritório, o responsável.');
  end if;
  insert into public.projeto_registro (projeto_id, usuario_id, acao, de_dono) values (p_projeto, v_usuario, 'protecao_tirada', v_usuario);
  return jsonb_build_object('ok', true);
end $$;

-- A cópia de segurança conta também o projeto que chegou ao escritório depois da última cópia.
create or replace function public.copia_de_seguranca_situacao() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_ultima timestamptz;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  select max(em) into v_ultima from public.projeto_registro where usuario_id = v_usuario and acao = 'copia_de_seguranca';
  return jsonb_build_object('projetos', (select count(*) from public.projetos where dono_id = v_usuario),
    'baixadaEm', v_ultima,
    'faltam', (select count(*) from public.projetos where dono_id = v_usuario
                and (v_ultima is null or coalesce(do_dono_desde, criado_em) > v_ultima)));
end $$;

-- ------------------------------------------------------------------------------------------------ o padrão do escritório
-- O padrão de quem chama (a conta dele, como responsável) e o das equipes em que está, ativo: o programa mostra a escolha no NOVO quando
-- algum está ligado.
create or replace function public.protecao_padrao() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  return jsonb_build_object(
    'proprio', coalesce((select proteger_novos from public.protecao_padrao where usuario_id = v_usuario), false),
    'escritorios', coalesce((select jsonb_agg(jsonb_build_object('responsavel', e.r, 'escritorio', public.nome_do_escritorio(e.r),
        'protegerNovos', coalesce((select x.proteger_novos from public.protecao_padrao x where x.usuario_id = e.r), false)) order by e.r)
      from public.escritorios_de(v_usuario) as e(r) where e.r <> v_usuario), '[]'::jsonb));
end $$;

create or replace function public.protecao_padrao_gravar(p_ligar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  insert into public.protecao_padrao (usuario_id, proteger_novos, atualizado_em) values (v_usuario, coalesce(p_ligar, false), now())
  on conflict (usuario_id) do update set proteger_novos = excluded.proteger_novos, atualizado_em = now();
  return jsonb_build_object('ok', true, 'protegerNovos', coalesce(p_ligar, false));
end $$;

-- ------------------------------------------------------------------------------------------------ quem pode chamar
revoke execute on function public.escritorio_do_pedido(uuid, uuid) from public, anon, authenticated;
grant execute on function public.escritorio_do_pedido(uuid, uuid) to service_role;
revoke execute on function public.projeto_chave(uuid) from public, anon;
grant execute on function public.projeto_chave(uuid) to authenticated;
revoke execute on function public.projeto_registrar(uuid, uuid, text, text) from public, anon;
grant execute on function public.projeto_registrar(uuid, uuid, text, text) to authenticated;
revoke execute on function public.copia_de_seguranca_situacao() from public, anon;
grant execute on function public.copia_de_seguranca_situacao() to authenticated;
revoke execute on function public.projeto_pedir_ao_escritorio(uuid) from public, anon;
grant execute on function public.projeto_pedir_ao_escritorio(uuid) to authenticated;
revoke execute on function public.projeto_pedidos_ao_escritorio() from public, anon;
grant execute on function public.projeto_pedidos_ao_escritorio() to authenticated;
revoke execute on function public.projeto_passar(uuid, uuid, text) from public, anon;
grant execute on function public.projeto_passar(uuid, uuid, text) to authenticated;
revoke execute on function public.projeto_responder_pedido_ao_escritorio(uuid, boolean, text) from public, anon;
grant execute on function public.projeto_responder_pedido_ao_escritorio(uuid, boolean, text) to authenticated;
revoke execute on function public.projeto_pagina(uuid, text) from public, anon;
grant execute on function public.projeto_pagina(uuid, text) to authenticated;
revoke execute on function public.meus_projetos_protegidos() from public, anon;
grant execute on function public.meus_projetos_protegidos() to authenticated;
revoke execute on function public.projeto_tirar_protecao(uuid) from public, anon;
grant execute on function public.projeto_tirar_protecao(uuid) to authenticated;
revoke execute on function public.protecao_padrao() from public, anon;
grant execute on function public.protecao_padrao() to authenticated;
revoke execute on function public.protecao_padrao_gravar(boolean) from public, anon;
grant execute on function public.protecao_padrao_gravar(boolean) to authenticated;
