-- Os projetos do escritório (doc 73 do programa, etapa 1; mockup aprovado por ÊDI em 20/10/2026): cada projeto tem um dono, a conta
-- de quem ele é (a do responsável, para o projeto do escritório; a da própria pessoa, para a MINHA ÁREA), e uma chave. O programa cifra o
-- conteúdo do .aqi com a chave, e o servidor a entrega só a quem tem acesso: o dono, a equipe ativa dele (da_equipe) e os convidados
-- daquele projeto. O servidor NÃO guarda o arquivo do projeto: guarda o dono, a chave, os convidados, os pedidos de acesso e o registro.
-- Pode rodar mais de uma vez.

-- ------------------------------------------------------------------------------------------------ tabelas
create table if not exists public.projetos (
  id uuid primary key,                                                    -- o identificador que o programa grava no .aqi
  dono_id uuid not null references auth.users(id) on delete cascade,      -- a conta de quem o projeto é
  nome text not null default '' check (char_length(nome) <= 200),
  chave bytea not null check (octet_length(chave) = 32),                  -- a chave do conteúdo (AES-256), nunca devolvida a quem não tem acesso
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists projetos_dono on public.projetos (dono_id);
alter table public.projetos enable row level security;

-- Os convidados de um projeto (o engenheiro de fora): pelo e-mail, como a equipe. Não editam; o que veem fica nas marcas.
create table if not exists public.projeto_convidados (
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  papel text not null default 'ver' check (papel in ('ver', 'comentar')),
  pranchas boolean not null default true,
  baixar boolean not null default false,
  ajustes boolean not null default false,
  convidado_por uuid references auth.users(id) on delete set null,
  convidado_em timestamptz not null default now(),
  primary key (projeto_id, email)
);
create index if not exists projeto_convidados_email on public.projeto_convidados (email);
alter table public.projeto_convidados enable row level security;

-- Os pedidos de acesso de quem abriu uma cópia sem acesso: chegam ao dono do projeto.
create table if not exists public.projeto_pedidos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  situacao text not null default 'esperando' check (situacao in ('esperando', 'aceito', 'recusado')),
  pedido_em timestamptz not null default now(),
  respondido_em timestamptz,
  unique (projeto_id, usuario_id)
);
alter table public.projeto_pedidos enable row level security;

-- O registro do que se fez com a chave fora do uso de todo dia: a cópia aberta e a cópia de segurança das chaves.
create table if not exists public.projeto_registro (
  id bigint generated always as identity primary key,
  projeto_id uuid references public.projetos(id) on delete cascade,
  usuario_id uuid references auth.users(id) on delete set null,
  acao text not null check (acao in ('copia_aberta', 'copia_de_seguranca')),
  em timestamptz not null default now()
);
create index if not exists projeto_registro_usuario on public.projeto_registro (usuario_id, acao, em desc);
alter table public.projeto_registro enable row level security;
-- Ninguém lê nem escreve as tabelas direto: só pelas funções abaixo.

-- ------------------------------------------------------------------------------------------------ quem abre o quê
-- O papel de quem chama no projeto: 'dono', 'equipe', 'convidado' ou nulo (sem acesso).
create or replace function public.papel_no_projeto(p_quem uuid, p_projeto uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p.dono_id = p_quem then 'dono'
    when public.da_equipe(p_quem, p.dono_id) then 'equipe'
    when exists (select 1 from public.projeto_convidados c join auth.users u on lower(u.email) = c.email and u.email_confirmed_at is not null
                  where c.projeto_id = p.id and u.id = p_quem) then 'convidado'
  end
  from public.projetos p where p.id = p_projeto and p_quem is not null
$$;

-- A resposta de quem tem acesso: a chave, o dono, o papel e, do convidado, o que ele pode.
create or replace function public.chave_do_projeto(p_quem uuid, p_projeto uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ok', true, 'projeto', p.id, 'chave', encode(p.chave, 'base64'), 'dono', p.dono_id,
    'nomeDoDono', public.nome_do_escritorio(p.dono_id), 'nome', p.nome, 'papel', public.papel_no_projeto(p_quem, p.id),
    'convidado', (select jsonb_build_object('papel', c.papel, 'pranchas', c.pranchas, 'baixar', c.baixar, 'ajustes', c.ajustes)
                    from public.projeto_convidados c join auth.users u on lower(u.email) = c.email
                   where c.projeto_id = p.id and u.id = p_quem))
  from public.projetos p where p.id = p_projeto
$$;

-- REGISTRAR: o projeto novo ganha dono e chave (a que o programa sorteou). Quem registra precisa ser o dono ou da equipe dele. Já
-- registrado, devolve o que está guardado (o dono não muda, a chave também não) para quem tem acesso; o nome se atualiza.
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
  return public.chave_do_projeto(v_usuario, p_projeto);
end $$;

-- A CHAVE: ao abrir o projeto. Sem acesso, o nome do dono (para a tela PEDIR ACESSO) e o pedido de quem chama, se houver.
create or replace function public.projeto_chave(p_projeto uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_dono uuid;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  select dono_id into v_dono from public.projetos where id = p_projeto;
  if v_dono is null then
    return jsonb_build_object('ok', false, 'motivo', 'desconhecido');
  end if;
  if public.papel_no_projeto(v_usuario, p_projeto) is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_acesso', 'nomeDoDono', public.nome_do_escritorio(v_dono),
      'pedido', (select situacao from public.projeto_pedidos where projeto_id = p_projeto and usuario_id = v_usuario));
  end if;
  return public.chave_do_projeto(v_usuario, p_projeto);
end $$;

-- PEDIR ACESSO: o pedido chega ao dono. Pedir de novo depois de recusado vale como um pedido novo.
create or replace function public.projeto_pedir_acesso(p_projeto uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  if not exists (select 1 from public.projetos where id = p_projeto) then
    return jsonb_build_object('ok', false, 'motivo', 'Este projeto não está registrado no Arquionie.');
  end if;
  if public.papel_no_projeto(v_usuario, p_projeto) is not null then
    return jsonb_build_object('ok', true, 'jaTem', true);
  end if;
  insert into public.projeto_pedidos (projeto_id, usuario_id) values (p_projeto, v_usuario)
  on conflict (projeto_id, usuario_id) do update set situacao = 'esperando', pedido_em = now(), respondido_em = null
   where public.projeto_pedidos.situacao <> 'esperando';
  return jsonb_build_object('ok', true, 'nomeDoDono',
    public.nome_do_escritorio((select dono_id from public.projetos where id = p_projeto)));
end $$;

-- Os pedidos de acesso que esperam o dono (quem chama): o projeto, quem pediu e quando.
create or replace function public.projeto_pedidos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'projeto', p.id, 'nomeDoProjeto', p.nome,
      'email', u.email, 'nome', public.nome_da_conta(u.id), 'pedidoEm', d.pedido_em) order by d.pedido_em)
    from public.projeto_pedidos d join public.projetos p on p.id = d.projeto_id join auth.users u on u.id = d.usuario_id
   where p.dono_id = v_usuario and d.situacao = 'esperando'), '[]'::jsonb);
end $$;

-- ACEITAR (como convidado, só para ver as pranchas) ou RECUSAR um pedido: só o dono do projeto.
create or replace function public.projeto_responder_pedido(p_pedido uuid, p_aceitar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_projeto uuid;
  v_email text;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  select d.projeto_id, lower(u.email) into v_projeto, v_email
    from public.projeto_pedidos d join public.projetos p on p.id = d.projeto_id join auth.users u on u.id = d.usuario_id
   where d.id = p_pedido and p.dono_id = v_usuario and d.situacao = 'esperando';
  if v_projeto is null then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido não encontrado ou já respondido.');
  end if;
  update public.projeto_pedidos set situacao = case when p_aceitar then 'aceito' else 'recusado' end, respondido_em = now()
   where id = p_pedido;
  if p_aceitar then
    insert into public.projeto_convidados (projeto_id, email, convidado_por) values (v_projeto, v_email, v_usuario)
    on conflict (projeto_id, email) do nothing;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------------------------------------ para nunca ficar refém do servidor
-- SALVAR CÓPIA ABERTA: só o dono (o responsável, no projeto do escritório). Fica registrado quem salvou.
create or replace function public.projeto_copia_aberta(p_projeto uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  if public.papel_no_projeto(v_usuario, p_projeto) is distinct from 'dono' then
    return jsonb_build_object('ok', false, 'motivo', 'Só o responsável salva a cópia aberta.');
  end if;
  insert into public.projeto_registro (projeto_id, usuario_id, acao) values (p_projeto, v_usuario, 'copia_aberta');
  return jsonb_build_object('ok', true);
end $$;

-- A CÓPIA DE SEGURANÇA DAS CHAVES: as chaves de todos os projetos de quem chama (o dono), para o site gravar num arquivo protegido
-- pela senha dele. Fica registrada; a situação diz quantos projetos ainda não estão na última cópia.
create or replace function public.chaves_do_escritorio() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  insert into public.projeto_registro (usuario_id, acao) values (v_usuario, 'copia_de_seguranca');
  return jsonb_build_object('ok', true, 'escritorio', public.nome_do_escritorio(v_usuario), 'em', now(),
    'projetos', coalesce((select jsonb_agg(jsonb_build_object('projeto', p.id, 'nome', p.nome, 'chave', encode(p.chave, 'base64'),
      'criadoEm', p.criado_em) order by p.criado_em) from public.projetos p where p.dono_id = v_usuario), '[]'::jsonb));
end $$;

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
    'faltam', (select count(*) from public.projetos where dono_id = v_usuario and (v_ultima is null or criado_em > v_ultima)));
end $$;

-- ------------------------------------------------------------------------------------------------ quem pode chamar
revoke execute on function public.papel_no_projeto(uuid, uuid) from public, anon, authenticated;
grant execute on function public.papel_no_projeto(uuid, uuid) to service_role;
revoke execute on function public.chave_do_projeto(uuid, uuid) from public, anon, authenticated;
grant execute on function public.chave_do_projeto(uuid, uuid) to service_role;
revoke execute on function public.projeto_registrar(uuid, uuid, text, text) from public, anon;
grant execute on function public.projeto_registrar(uuid, uuid, text, text) to authenticated;
revoke execute on function public.projeto_chave(uuid) from public, anon;
grant execute on function public.projeto_chave(uuid) to authenticated;
revoke execute on function public.projeto_pedir_acesso(uuid) from public, anon;
grant execute on function public.projeto_pedir_acesso(uuid) to authenticated;
revoke execute on function public.projeto_pedidos() from public, anon;
grant execute on function public.projeto_pedidos() to authenticated;
revoke execute on function public.projeto_responder_pedido(uuid, boolean) from public, anon;
grant execute on function public.projeto_responder_pedido(uuid, boolean) to authenticated;
revoke execute on function public.projeto_copia_aberta(uuid) from public, anon;
grant execute on function public.projeto_copia_aberta(uuid) to authenticated;
revoke execute on function public.chaves_do_escritorio() from public, anon;
grant execute on function public.chaves_do_escritorio() to authenticated;
revoke execute on function public.copia_de_seguranca_situacao() from public, anon;
grant execute on function public.copia_de_seguranca_situacao() to authenticated;
