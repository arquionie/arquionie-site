-- OS AVISOS NO CELULAR (o app do Arquionie, doc 90 do repositório do programa; mockup da plataforma, tela 4, aprovado por ÊDI em
-- 16/11/2026, "Aprovo as cinco"): o pedido novo do Comercial, o retorno do dia e o comentário do cliente na apresentação chegam como
-- aviso do aparelho, mesmo com o app fechado. Cada tipo se liga e desliga em Mais › Avisos, por aparelho.
--
-- Aqui ficam os aparelhos (o endereço que o Firebase ou a Apple dá a cada um, a conta e os tipos ligados) e a fila dos avisos. Quem
-- enche a fila é o banco (o pedido que chega pelo formulário, o pedido de ajuste do cliente e, de manhã, os retornos do dia); quem a
-- esvazia é a função avisos (com a chave secreta), logo depois do pedido ou do comentário e, de reserva, a cada 5 minutos. O aviso vai
-- para a conta do escritório e para as pessoas ativas da equipe dela. Pode rodar duas vezes.

-- ------------------------------------------------------------------------------------------------ os aparelhos
create table if not exists public.aparelhos (
  token text primary key check (length(token) between 20 and 4096),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  plataforma text not null check (plataforma in ('android', 'ios')),
  nome text not null default '' check (length(nome) <= 60),
  avisos jsonb not null default '{"pedido": true, "retorno": true, "comentario": true}'::jsonb,
  criado_em timestamptz not null default now(),
  visto_em timestamptz not null default now()
);
create index if not exists aparelhos_usuario on public.aparelhos (usuario_id);
alter table public.aparelhos enable row level security;

-- ------------------------------------------------------------------------------------------------ a fila
-- Um aviso por acontecimento; a chave não deixa o mesmo acontecimento entrar duas vezes (o retorno de hoje de um pedido, por exemplo).
create table if not exists public.avisos_fila (
  id bigint generated always as identity primary key,
  chave text not null unique,
  area uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('pedido', 'retorno', 'comentario', 'teste')),
  titulo text not null,
  texto text not null default '',
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index if not exists avisos_fila_pendentes on public.avisos_fila (criado_em) where enviado_em is null;
alter table public.avisos_fila enable row level security;

-- ------------------------------------------------------------------------------------------------ o aparelho (o app, com a conta)
-- REGISTRAR: o app chama a cada abertura com a conta; o endereço muda de dono se outra conta entrar no mesmo aparelho.
create or replace function public.aparelho_registrar(p_token text, p_plataforma text, p_nome text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_avisos jsonb;
begin
  if v_eu is null then
    raise exception 'sem conta';
  end if;
  if length(coalesce(p_token, '')) not between 20 and 4096 or p_plataforma not in ('android', 'ios') then
    return jsonb_build_object('ok', false, 'motivo', 'Este aparelho não deu um endereço de avisos válido.');
  end if;
  insert into public.aparelhos (token, usuario_id, plataforma, nome)
  values (p_token, v_eu, p_plataforma, left(coalesce(p_nome, ''), 60))
  on conflict (token) do update set
    usuario_id = excluded.usuario_id, plataforma = excluded.plataforma, nome = excluded.nome, visto_em = now(),
    -- outra conta no mesmo aparelho começa com tudo ligado
    avisos = case when public.aparelhos.usuario_id = excluded.usuario_id then public.aparelhos.avisos
                  else '{"pedido": true, "retorno": true, "comentario": true}'::jsonb end
  returning avisos into v_avisos;
  return jsonb_build_object('ok', true, 'avisos', v_avisos);
end $$;
revoke execute on function public.aparelho_registrar(text, text, text) from public, anon;
grant execute on function public.aparelho_registrar(text, text, text) to authenticated;

-- OS TIPOS LIGADOS neste aparelho (Mais › Avisos).
create or replace function public.aparelho_avisos(p_token text, p_avisos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_avisos jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'sem conta';
  end if;
  if jsonb_typeof(p_avisos) <> 'object' then
    return jsonb_build_object('ok', false, 'motivo', 'Os avisos vieram num formato que não dá para ler.');
  end if;
  v_avisos := jsonb_build_object('pedido', coalesce((p_avisos ->> 'pedido')::boolean, true),
    'retorno', coalesce((p_avisos ->> 'retorno')::boolean, true), 'comentario', coalesce((p_avisos ->> 'comentario')::boolean, true));
  update public.aparelhos set avisos = v_avisos, visto_em = now() where token = p_token and usuario_id = (select auth.uid());
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Este aparelho não está registrado. Feche e abra o app.');
  end if;
  return jsonb_build_object('ok', true, 'avisos', v_avisos);
end $$;
revoke execute on function public.aparelho_avisos(text, jsonb) from public, anon;
grant execute on function public.aparelho_avisos(text, jsonb) to authenticated;

-- SAIR DA CONTA no aparelho: ele deixa de receber os avisos dela.
create or replace function public.aparelho_tirar(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.aparelhos where token = p_token and usuario_id = (select auth.uid());
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.aparelho_tirar(text) from public, anon;
grant execute on function public.aparelho_tirar(text) to authenticated;

-- ------------------------------------------------------------------------------------------------ quem enche a fila (o banco)
-- O PEDIDO NOVO que chega pelo formulário (o criado à mão tem responsável e não avisa: quem criou já sabe).
create or replace function public.avisos_ao_chegar_pedido() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.responsavel is null then
    insert into public.avisos_fila (chave, area, tipo, titulo, texto, dados)
    values ('pedido:' || new.id, new.usuario_id, 'pedido', 'Novo pedido',
      new.nome || ' pediu um orçamento' || coalesce(nullif(': ' || concat_ws(', ', nullif(lower(new.tipo), ''),
        case when new.area is not null then trim(to_char(new.area, 'FM999G999')) || ' m²' end, nullif(new.cidade, '')), ': '), '') || '.',
      jsonb_build_object('tipo', 'pedido', 'pedido', new.id))
    on conflict (chave) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists avisos_pedido on public.comercial_pedidos;
create trigger avisos_pedido after insert on public.comercial_pedidos for each row execute function public.avisos_ao_chegar_pedido();

-- O COMENTÁRIO DO CLIENTE: o pedido de ajuste na página da apresentação.
create or replace function public.avisos_ao_comentar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a public.apresentacoes;
  n int := jsonb_array_length(new.comentarios);
begin
  select x.* into a from public.apresentacoes x join public.envios_apresentacao e on e.apresentacao_id = x.id where e.id = new.envio_id;
  if found then
    insert into public.avisos_fila (chave, area, tipo, titulo, texto, dados)
    values ('comentario:' || new.id, a.usuario_id, 'comentario', 'Comentário no tour',
      a.nome || ': ' || new.nome || ' deixou ' || n || case when n = 1 then ' comentário.' else ' comentários.' end,
      jsonb_build_object('tipo', 'comentario', 'apresentacao', a.codigo))
    on conflict (chave) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists avisos_comentario on public.pedidos_de_ajuste;
create trigger avisos_comentario after insert on public.pedidos_de_ajuste for each row execute function public.avisos_ao_comentar();

-- OS RETORNOS DO DIA (a tarefa da manhã): um aviso por pedido em andamento com o retorno marcado para hoje.
create or replace function public.avisos_retornos_do_dia() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := public.comercial_hoje();
  v_n int;
begin
  insert into public.avisos_fila (chave, area, tipo, titulo, texto, dados)
  select 'retorno:' || p.id || ':' || v_hoje, p.usuario_id, 'retorno', 'Retorno hoje',
         p.nome || coalesce('. ' || nullif(concat_ws(', ', nullif(p.tipo, ''), nullif(p.cidade, '')), ''), '') || '.',
         jsonb_build_object('tipo', 'retorno', 'pedido', p.id)
    from public.comercial_pedidos p
    join public.comercial_ajustes a on a.usuario_id = p.usuario_id
   where p.retorno = v_hoje and (public.comercial_etapa(a.etapas, p.etapa) ->> 'tipo') = 'andamento'
  on conflict (chave) do nothing;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'retornos', v_n);
end $$;
revoke execute on function public.avisos_retornos_do_dia() from public, anon, authenticated;
grant execute on function public.avisos_retornos_do_dia() to service_role;

-- ------------------------------------------------------------------------------------------------ quem esvazia a fila (a função avisos)
-- PEGAR: os avisos pendentes (até 200, os de mais de um dia caem) com os aparelhos que os recebem: os da conta do escritório e os das
-- pessoas ativas da equipe dela, com o tipo ligado. Marca como enviados ao pegar: um aviso não sai duas vezes, nem com duas tarefas.
create or replace function public.avisos_pegar() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  update public.avisos_fila set enviado_em = now() where enviado_em is null and criado_em < now() - interval '1 day';
  with pegos as (
    update public.avisos_fila f set enviado_em = now()
     where f.id in (select id from public.avisos_fila where enviado_em is null order by criado_em limit 200 for update skip locked)
    returning f.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'tipo', g.tipo, 'titulo', g.titulo, 'texto', g.texto, 'dados', g.dados,
           'aparelhos', (select coalesce(jsonb_agg(jsonb_build_object('token', d.token, 'plataforma', d.plataforma)), '[]'::jsonb)
                           from public.aparelhos d
                          where (g.tipo = 'teste' or coalesce((d.avisos ->> g.tipo)::boolean, true))
                            and (d.usuario_id = g.area or (g.tipo <> 'teste' and d.usuario_id in (
                                 select u.id from public.equipe q join auth.users u on lower(u.email) = q.email
                                  where q.responsavel_id = g.area and q.situacao = 'ativo'))))
         )), '[]'::jsonb) into v
    from pegos g;
  return v;
end $$;
revoke execute on function public.avisos_pegar() from public, anon, authenticated;
grant execute on function public.avisos_pegar() to service_role;

-- ESQUECER o aparelho que o Firebase ou a Apple dizem que não existe mais (o app desinstalado).
create or replace function public.aparelho_esquecer(p_tokens text[]) returns void
language sql security definer set search_path = '' as $$
  delete from public.aparelhos where token = any (p_tokens);
$$;
revoke execute on function public.aparelho_esquecer(text[]) from public, anon, authenticated;
grant execute on function public.aparelho_esquecer(text[]) to service_role;

-- O AVISO DE TESTE (Mais › Avisos): só para os aparelhos de quem pediu, até 5 por hora.
create or replace function public.avisos_testar(p_usuario uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if (select count(*) from public.avisos_fila where area = p_usuario and tipo = 'teste' and criado_em > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'Já foram 5 testes nesta hora. Tente mais tarde.');
  end if;
  select count(*) into v_n from public.aparelhos where usuario_id = p_usuario;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'Nenhum celular desta conta recebe avisos ainda. Feche e abra o app.');
  end if;
  insert into public.avisos_fila (chave, area, tipo, titulo, texto, dados)
  values ('teste:' || p_usuario || ':' || extract(epoch from clock_timestamp()), p_usuario, 'teste', 'Os avisos estão ligados',
    'É assim que os pedidos novos, os retornos e os comentários dos clientes vão chegar.', jsonb_build_object('tipo', 'teste'));
  return jsonb_build_object('ok', true, 'aparelhos', v_n);
end $$;
revoke execute on function public.avisos_testar(uuid) from public, anon, authenticated;
grant execute on function public.avisos_testar(uuid) to service_role;

-- ------------------------------------------------------------------------------------------------ as tarefas (pg_cron)
-- Na publicação, com a chave AVISOS_SEGREDO já nos segredos das funções (o mesmo valor no lugar de <SEGREDO>):
--   select cron.schedule('avisos-fila', '*/5 * * * *', $c$ select net.http_post(
--     url := 'https://sowazotriildoeaxbhkl.supabase.co/functions/v1/avisos',
--     headers := '{"Content-Type": "application/json", "x-avisos": "<SEGREDO>"}'::jsonb, body := '{"acao": "processar"}'::jsonb) $c$);
--   select cron.schedule('avisos-retornos', '0 10 * * *', $c$ select net.http_post(      -- 7h em Brasília
--     url := 'https://sowazotriildoeaxbhkl.supabase.co/functions/v1/avisos',
--     headers := '{"Content-Type": "application/json", "x-avisos": "<SEGREDO>"}'::jsonb, body := '{"acao": "retornos"}'::jsonb) $c$);
