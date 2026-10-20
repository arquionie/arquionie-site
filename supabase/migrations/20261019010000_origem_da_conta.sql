-- Arquionie™: de onde veio cada conta e o designer de interiores na atuação (passo 4 da configuração do Comercial, aprovada por ÊDI
-- em 19/10/2026). O site guarda a origem da primeira visita (lib/origem.js: utm_*, fbclid, ?de=, o site que mandou e a página de
-- entrada) e manda no cadastro; aqui o perfil guarda a primeira e nunca troca, e o /gestao conta as contas por origem.
--
-- Rodar no SQL Editor ANTES de publicar o site desta versão: o cadastro passa a aceitar "designer" na atuação, que a regra antiga
-- recusa, e a conta não nasceria. Pode rodar duas vezes.

-- ------------------------------------------------------------------------------------------------ o perfil
alter table public.perfis add column if not exists origem jsonb;

alter table public.perfis drop constraint if exists perfis_atuacao_check;
alter table public.perfis add constraint perfis_atuacao_check
  check (atuacao in ('arquiteto', 'engenheiro', 'designer', 'estudante', 'outra'));

-- O que vem do navegador não é confiável: só as marcas conhecidas, em texto, cada uma com até 200 letras. Nada útil vira null.
create or replace function public.origem_limpa(o jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(o) = 'object' then nullif((
    select coalesce(jsonb_object_agg(k, left(btrim(o ->> k), 200)), '{}'::jsonb)
    from unnest(array['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'de', 'referencia',
                      'entrada', 'em']) as k
    where jsonb_typeof(o -> k) = 'string' and btrim(o ->> k) <> ''
  ), '{}'::jsonb) end
$$;

revoke execute on function public.origem_limpa(jsonb) from public, anon, authenticated;

-- O mesmo espelho do cadastro da 20261003000000, agora com a origem: entra na criação da conta (e-mail) ou no primeiro acesso pelo
-- Google (Completar) e, depois de gravada, não muda mais, mesmo que os metadados da conta mudem.
create or replace function public.sincronizar_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.perfis as p (id, nome, email, atuacao, novidades, aceite_termos_em, versao_termos, origem)
  values (
    new.id,
    coalesce(m ->> 'nome', m ->> 'full_name', m ->> 'name'),
    new.email,
    nullif(m ->> 'atuacao', ''),
    coalesce((m ->> 'novidades')::boolean, false),
    (m ->> 'aceite_termos_em')::timestamptz,
    m ->> 'versao_termos',
    public.origem_limpa(m -> 'origem')
  )
  on conflict (id) do update set
    nome = excluded.nome,
    email = excluded.email,
    atuacao = excluded.atuacao,
    novidades = excluded.novidades,
    aceite_termos_em = excluded.aceite_termos_em,
    versao_termos = excluded.versao_termos,
    origem = coalesce(p.origem, excluded.origem),
    atualizado_em = now();
  return new;
end $$;

revoke execute on function public.sincronizar_perfil() from public, anon, authenticated;

-- Contas que já tinham a origem nos metadados antes desta migração.
update public.perfis p set origem = public.origem_limpa(u.raw_user_meta_data -> 'origem')
from auth.users u
where u.id = p.id and p.origem is null and u.raw_user_meta_data ? 'origem';

-- ------------------------------------------------------------------------------------------------ o /gestao
-- As contas por origem, num período (dias, pela data da conta; null = todas). A fonte é a marca do anúncio (utm_source); sem ela, o
-- ?de= dos links próprios; sem ele, o fbclid (clique vindo da Meta, que o Instagram também põe no clique da bio); sem ele, o site que
-- mandou; senão, direto. Ativada = recebeu o primeiro pedido pelo formulário do Comercial em até 7 dias da conta.
create or replace function public.gestao_contas_por_origem(p_dias int default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  return coalesce((
    select jsonb_agg(jsonb_build_object('fonte', fonte, 'meio', meio, 'campanha', campanha, 'contas', contas,
                                        'confirmadas', confirmadas, 'ativadas', ativadas)
                     order by contas desc, fonte, meio, campanha)
    from (
      select x.fonte, x.meio, x.campanha, count(*) as contas,
             count(*) filter (where x.confirmada) as confirmadas,
             count(*) filter (where x.ativada) as ativadas
      from (
        select
          case
            when p.origem is null then 'sem registro'
            else coalesce(nullif(p.origem ->> 'utm_source', ''), nullif(p.origem ->> 'de', ''),
                          case when p.origem ? 'fbclid' then 'meta, sem campanha' end,
                          nullif(p.origem ->> 'referencia', ''), 'direto')
          end as fonte,
          coalesce(p.origem ->> 'utm_medium', '') as meio,
          coalesce(p.origem ->> 'utm_campaign', '') as campanha,
          u.email_confirmed_at is not null as confirmada,
          exists (select 1 from public.comercial_pedidos c
                  where c.usuario_id = u.id and c.formulario_id is not null and c.criado_em < u.created_at + interval '7 days') as ativada
        from auth.users u
        left join public.perfis p on p.id = u.id
        where p_dias is null or u.created_at > now() - make_interval(days => greatest(p_dias, 1))
      ) x
      group by x.fonte, x.meio, x.campanha
    ) y
  ), '[]'::jsonb);
end $$;

revoke execute on function public.gestao_contas_por_origem(int) from public, anon;
grant execute on function public.gestao_contas_por_origem(int) to authenticated;
