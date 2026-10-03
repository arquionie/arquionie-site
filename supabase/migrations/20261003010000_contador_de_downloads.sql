-- Arquionie™: contador de downloads (ÊDI, 03/10/2026). Todo clique em BAIXAR conta, e a página inicial mostra o total
-- desde o primeiro. O número é sempre o real. Ninguém lê a tabela pelo site: o total sai pela função, sem dizer quem
-- baixou (LGPD). Rodar uma vez no SQL Editor do projeto arquionie.

create table if not exists public.downloads (
  id bigint generated always as identity primary key,
  usuario_id uuid references auth.users (id) on delete set null,
  versao text,
  criado_em timestamptz not null default now()
);

alter table public.downloads enable row level security;

-- Cada clique em BAIXAR, de quem está na conta.
create or replace function public.registrar_download(p_versao text) returns void
language sql security definer set search_path = '' as $$
  insert into public.downloads (usuario_id, versao) values (auth.uid(), left(p_versao, 32));
$$;

revoke execute on function public.registrar_download(text) from public, anon;
grant execute on function public.registrar_download(text) to authenticated;

-- Só o total, para a página inicial.
create or replace function public.total_downloads() returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.downloads;
$$;

revoke execute on function public.total_downloads() from public;
grant execute on function public.total_downloads() to anon, authenticated;
