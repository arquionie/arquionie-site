-- Arquionie™ — ENTRAR PELO NAVEGADOR (mockup docs/mockups/entrar-pelo-navegador do repositório do programa, aprovado por ÊDI em
-- 22/10/2026). O programa não pede mais a senha: abre /programa/entrar com a porta em que espera neste computador e o desafio (o
-- SHA-256 do verificador que só ele tem, como no PKCE); a pessoa entra no site e clica ENTRAR NO PROGRAMA; a função programa grava
-- aqui o resumo de um código de uso único, que vai ao programa pela volta em 127.0.0.1; o programa troca o código e o verificador pela
-- sessão dele. O código vale 2 minutos e uma vez só: a primeira troca o gasta, certa ou errada. Pode rodar duas vezes.

create table if not exists public.programa_entradas (
  codigo_hash text primary key check (codigo_hash ~ '^[0-9a-f]{64}$'),
  desafio text not null check (desafio ~ '^[A-Za-z0-9_-]{43}$'),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  usado_em timestamptz
);
alter table public.programa_entradas enable row level security;
revoke all on public.programa_entradas from anon, authenticated;

-- O site pede o código para quem está com a conta aberta nele (a função confere a sessão). Os pedidos de ontem saem.
create or replace function public.programa_entrada_criar(p_usuario uuid, p_codigo_hash text, p_desafio text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_usuario is null or coalesce(p_codigo_hash, '') !~ '^[0-9a-f]{64}$' or coalesce(p_desafio, '') !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido inválido. Volte ao Arquionie e clique em ENTRAR PELO NAVEGADOR de novo.');
  end if;
  delete from public.programa_entradas where criado_em < now() - interval '1 day';
  insert into public.programa_entradas (codigo_hash, desafio, usuario_id) values (p_codigo_hash, p_desafio, p_usuario);
  return jsonb_build_object('ok', true);
end $$;

-- O programa troca o código: gasta na primeira vez, e só vale com o desafio certo, dentro de 2 minutos. Nulo, não vale.
create or replace function public.programa_entrada_usar(p_codigo_hash text, p_desafio text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e public.programa_entradas;
begin
  update public.programa_entradas set usado_em = now()
   where codigo_hash = coalesce(p_codigo_hash, '') and usado_em is null
  returning * into e;
  if not found or e.desafio <> coalesce(p_desafio, '') or e.criado_em < now() - interval '2 minutes' then
    return null;
  end if;
  return e.usuario_id;
end $$;

revoke execute on function public.programa_entrada_criar(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.programa_entrada_usar(text, text) from public, anon, authenticated;
grant execute on function public.programa_entrada_criar(uuid, text, text) to service_role;
grant execute on function public.programa_entrada_usar(text, text) to service_role;
