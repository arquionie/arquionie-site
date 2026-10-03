-- Arquionie™: painel do gestor (ÊDI, 03/10/2026, "igual a gente tem no Palheta Flow"). Quem está em `administradores`
-- vê as contas e os downloads; ninguém mais. O site não lê as tabelas direto: as funções abaixo conferem a lista antes
-- de devolver qualquer dado. Rodar uma vez no SQL Editor do projeto arquionie.

create table if not exists public.administradores (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.administradores enable row level security;

-- Quem administra, pelo e-mail da conta do site. Para acrescentar alguém depois, rode só este insert com o e-mail dele.
insert into public.administradores (usuario_id)
select id from auth.users where email in ('palhetaarquitetura@gmail.com', 'palhetaarquionie@gmail.com')
on conflict do nothing;

create or replace function public.eh_administrador() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.administradores where usuario_id = auth.uid());
$$;

revoke execute on function public.eh_administrador() from public, anon;
grant execute on function public.eh_administrador() to authenticated;

-- Números da página inicial do painel.
create or replace function public.gestao_resumo() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_administrador() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'contas', (select count(*) from auth.users),
    'confirmadas', (select count(*) from auth.users where email_confirmed_at is not null),
    'novas_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'novas_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'novidades', (select count(*) from auth.users where coalesce((raw_user_meta_data ->> 'novidades')::boolean, false)),
    'por_atuacao', (select coalesce(jsonb_object_agg(a, n), '{}'::jsonb) from (
        select coalesce(nullif(raw_user_meta_data ->> 'atuacao', ''), 'sem') as a, count(*) as n from auth.users group by 1) x),
    'pelo_google', (select count(*) from auth.users where raw_app_meta_data -> 'providers' ? 'google'),
    'downloads', (select count(*) from public.downloads),
    'pessoas_que_baixaram', (select count(distinct usuario_id) from public.downloads),
    'downloads_7d', (select count(*) from public.downloads where criado_em > now() - interval '7 days'),
    'por_versao', (select coalesce(jsonb_object_agg(v, n), '{}'::jsonb) from (
        select coalesce(nullif(versao, ''), 'sem versão') as v, count(*) as n from public.downloads group by 1) y),
    'computadores', (select count(*) from public.computadores)
  );
end $$;

-- Todas as contas, com quantas vezes cada uma baixou.
create or replace function public.gestao_contas()
returns table (
  id uuid, nome text, email text, atuacao text, criada_em timestamptz, confirmada_em timestamptz,
  ultimo_acesso timestamptz, provedores text[], novidades boolean, downloads bigint, ultimo_download timestamptz,
  computadores bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_administrador() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return query
  select u.id,
         coalesce(u.raw_user_meta_data ->> 'nome', u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
         u.email::text,
         u.raw_user_meta_data ->> 'atuacao',
         u.created_at,
         u.email_confirmed_at,
         u.last_sign_in_at,
         array(select jsonb_array_elements_text(coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb))),
         coalesce((u.raw_user_meta_data ->> 'novidades')::boolean, false),
         (select count(*) from public.downloads d where d.usuario_id = u.id),
         (select max(d.criado_em) from public.downloads d where d.usuario_id = u.id),
         (select count(*) from public.computadores c where c.usuario_id = u.id)
  from auth.users u
  order by u.created_at desc;
end $$;

-- Os últimos downloads, de quem e de qual versão.
create or replace function public.gestao_downloads(p_limite integer default 300)
returns table (criado_em timestamptz, versao text, nome text, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_administrador() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return query
  select d.criado_em, d.versao,
         coalesce(u.raw_user_meta_data ->> 'nome', u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
         u.email::text
  from public.downloads d
  left join auth.users u on u.id = d.usuario_id
  order by d.criado_em desc
  limit least(greatest(p_limite, 1), 2000);
end $$;

revoke execute on function public.gestao_resumo() from public, anon;
revoke execute on function public.gestao_contas() from public, anon;
revoke execute on function public.gestao_downloads(integer) from public, anon;
grant execute on function public.gestao_resumo() to authenticated;
grant execute on function public.gestao_contas() to authenticated;
grant execute on function public.gestao_downloads(integer) to authenticated;
