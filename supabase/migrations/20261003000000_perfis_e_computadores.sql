-- Arquionie™: perfis das pessoas e computadores conectados (doc 57; decisões de 02/10/2026).
-- O projeto nasceu com "RLS automático" ligado e "expor tabelas novas" desligado: cada tabela abaixo liga as regras
-- de acesso e concede só o que o site precisa. Rodar uma vez no SQL Editor do projeto arquionie.

-- ------------------------------------------------------------------------------------------------ perfis
-- Espelho do cadastro (metadados da conta): o painel interno e, depois, o programa leem daqui.
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text,
  email text,
  atuacao text check (atuacao in ('arquiteto', 'engenheiro', 'estudante', 'outra')),
  novidades boolean not null default false,
  aceite_termos_em timestamptz,
  versao_termos text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;

drop policy if exists "cada pessoa lê o próprio perfil" on public.perfis;
create policy "cada pessoa lê o próprio perfil" on public.perfis
  for select to authenticated using ((select auth.uid()) = id);

grant select on public.perfis to authenticated;

-- A conta é a fonte: o perfil nasce e muda junto com ela. Quem entra pelo Google traz full_name/name.
create or replace function public.sincronizar_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.perfis (id, nome, email, atuacao, novidades, aceite_termos_em, versao_termos)
  values (
    new.id,
    coalesce(m ->> 'nome', m ->> 'full_name', m ->> 'name'),
    new.email,
    nullif(m ->> 'atuacao', ''),
    coalesce((m ->> 'novidades')::boolean, false),
    (m ->> 'aceite_termos_em')::timestamptz,
    m ->> 'versao_termos'
  )
  on conflict (id) do update set
    nome = excluded.nome,
    email = excluded.email,
    atuacao = excluded.atuacao,
    novidades = excluded.novidades,
    aceite_termos_em = excluded.aceite_termos_em,
    versao_termos = excluded.versao_termos,
    atualizado_em = now();
  return new;
end $$;

revoke execute on function public.sincronizar_perfil() from public, anon, authenticated;

drop trigger if exists perfil_ao_criar on auth.users;
create trigger perfil_ao_criar after insert on auth.users
  for each row execute function public.sincronizar_perfil();

drop trigger if exists perfil_ao_mudar on auth.users;
create trigger perfil_ao_mudar after update of raw_user_meta_data, email on auth.users
  for each row execute function public.sincronizar_perfil();

-- Contas que já existiam antes desta migração.
insert into public.perfis (id, nome, email, atuacao, novidades, aceite_termos_em, versao_termos)
select u.id,
       coalesce(u.raw_user_meta_data ->> 'nome', u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
       u.email,
       nullif(u.raw_user_meta_data ->> 'atuacao', ''),
       coalesce((u.raw_user_meta_data ->> 'novidades')::boolean, false),
       (u.raw_user_meta_data ->> 'aceite_termos_em')::timestamptz,
       u.raw_user_meta_data ->> 'versao_termos'
from auth.users u
on conflict (id) do nothing;

-- ------------------------------------------------------------------------------------------------ computadores
-- Até três por conta ao mesmo tempo (decisão de 02/10/2026). O programa registra o computador por uma função do
-- servidor (etapa do atualizador e da conta no programa); o site só lista e desconecta.
create table if not exists public.computadores (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  versao text,
  ultimo_acesso timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create index if not exists computadores_usuario on public.computadores (usuario_id);

alter table public.computadores enable row level security;

drop policy if exists "cada pessoa vê os próprios computadores" on public.computadores;
create policy "cada pessoa vê os próprios computadores" on public.computadores
  for select to authenticated using ((select auth.uid()) = usuario_id);

drop policy if exists "cada pessoa desconecta os próprios computadores" on public.computadores;
create policy "cada pessoa desconecta os próprios computadores" on public.computadores
  for delete to authenticated using ((select auth.uid()) = usuario_id);

grant select, delete on public.computadores to authenticated;
