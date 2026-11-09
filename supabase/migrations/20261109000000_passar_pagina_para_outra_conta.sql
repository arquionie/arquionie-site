-- Arquionie™: passar a página do cliente para outra conta (ÊDI, 09/11/2026, pelo TCC do Natanael: renderizado e enviado pelo computador
-- da Palheta, a página ficou na conta de lá, e ele precisa dela na conta dele; "a gente tem como transferir um projeto de uma conta para
-- outra". Mockup docs/mockups/passar-pagina-para-outra-conta do repositório do programa, aprovado por ÊDI: "Pode seguir").
-- Rodar uma vez no SQL Editor do projeto arquionie, depois das de antes, e só então publicar a função apresentacoes (o envio seguinte
-- de quem recebeu, no mesmo link). Pode rodar duas vezes sem estragar nada.
--
-- No site, em MINHA CONTA › APRESENTAÇÕES, os três pontinhos do cartão: Passar para outra conta.
-- - Para outra pessoa, pelo e-mail com que ela entra: o pedido espera 30 dias pelo aceite dela (Aceitar ou Recusar, no alto das
--   Apresentações dela, em "Chegou para você"). Até lá a página fica com quem passou, no ar, e dá para cancelar.
-- - Para o escritório em cuja equipe quem passa está: na hora, sem aceite (era o caso do 236, passado por script em 04/11).
-- Só o dono da página passa (na área do escritório, o responsável, como o Excluir). Vão junto o link, os envios, os comentários, a
-- aprovação e as visitas; os arquivos ficam onde estão (a pasta é pelo código). A página passa a mostrar a identidade (o nome, o logo, o
-- termo) da conta nova, pela identidade_do_escritorio(usuario_id) de sempre. Quem recebe e já tem uma página do mesmo projeto que nunca
-- foi ao ar (um envio que parou no meio) perde essa página vazia; com uma publicada, não aceita.
--
-- O envio seguinte de quem recebeu: o arquivo pode ter guardado o "em nome do escritório" de quem enviou antes (EscritorioDaPagina), e
-- a escritorio_para_enviar recusava quem não está na equipe dele. A dono_do_envio manda o envio para a página que a pessoa já tem do
-- projeto; a apresentacao_onde segue a mesma regra.

-- ------------------------------------------------------------------------------------------------ as passagens
create table if not exists public.passagens_de_apresentacao (
  id uuid primary key default gen_random_uuid(),
  apresentacao_id uuid not null references public.apresentacoes (id) on delete cascade,
  de uuid not null references auth.users (id) on delete cascade,        -- a conta dona da página na hora do pedido
  por uuid references auth.users (id) on delete set null,               -- quem pediu
  para_email text not null check (para_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and para_email = lower(para_email)),
  para uuid references auth.users (id) on delete set null,              -- a conta que respondeu (ou o escritório)
  situacao text not null default 'esperando' check (situacao in ('esperando', 'aceita', 'recusada', 'cancelada', 'vencida')),
  criado_em timestamptz not null default now(),
  vence_em timestamptz not null default now() + interval '30 days',
  respondido_em timestamptz
);
create unique index if not exists passagens_uma_esperando on public.passagens_de_apresentacao (apresentacao_id) where situacao = 'esperando';
create index if not exists passagens_para_email on public.passagens_de_apresentacao (para_email) where situacao = 'esperando';
alter table public.passagens_de_apresentacao enable row level security;

-- O limite de páginas por conta (o mesmo da apresentacao_enviar).
create or replace function public.limite_de_apresentacoes() returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select limite from public.ajustes_apresentacoes where id), 500)
$$;

-- ------------------------------------------------------------------------------------------------ passar
create or replace function public.apresentacao_passar(p_id uuid, p_email text default null, p_escritorio uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
  a public.apresentacoes;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_para uuid;
  p public.passagens_de_apresentacao;
begin
  if v_quem is null then
    return jsonb_build_object('ok', false, 'motivo', 'Entre com a conta.');
  end if;
  select * into a from public.apresentacoes where id = p_id for update;
  if not found or a.usuario_id <> v_quem then
    return jsonb_build_object('ok', false, 'motivo', 'Só o dono da página passa a página para outra conta.');
  end if;
  update public.passagens_de_apresentacao set situacao = 'vencida'
   where apresentacao_id = a.id and situacao = 'esperando' and vence_em < now();
  if exists (select 1 from public.passagens_de_apresentacao where apresentacao_id = a.id and situacao = 'esperando') then
    return jsonb_build_object('ok', false, 'motivo', 'A página já está esperando o aceite de outra conta. Cancele a passagem antes.');
  end if;

  -- para o escritório da equipe: na hora
  if p_escritorio is not null then
    if p_escritorio = v_quem or not public.da_equipe(v_quem, p_escritorio) then
      return jsonb_build_object('ok', false, 'motivo', 'Você não está na equipe deste escritório.');
    end if;
    if exists (select 1 from public.apresentacoes x where x.usuario_id = p_escritorio and x.chave = a.chave) then
      return jsonb_build_object('ok', false, 'motivo', 'O escritório já tem uma página deste projeto: arquionie.com.br/t/' ||
        (select x.codigo from public.apresentacoes x where x.usuario_id = p_escritorio and x.chave = a.chave limit 1));
    end if;
    if (select count(*) from public.apresentacoes x where x.usuario_id = p_escritorio) >= public.limite_de_apresentacoes() then
      return jsonb_build_object('ok', false, 'motivo', 'O escritório já está no limite de páginas do plano.');
    end if;
    update public.apresentacoes set usuario_id = p_escritorio where id = a.id;
    insert into public.passagens_de_apresentacao (apresentacao_id, de, por, para_email, para, situacao, respondido_em)
    values (a.id, v_quem, v_quem, (select lower(u.email) from auth.users u where u.id = p_escritorio), p_escritorio, 'aceita', now());
    return jsonb_build_object('ok', true, 'passada', true, 'para', public.nome_do_escritorio(p_escritorio));
  end if;

  -- para outra pessoa: pelo e-mail, esperando o aceite
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva o e-mail com que a pessoa entra no Arquionie.');
  end if;
  if v_email = (select lower(u.email) from auth.users u where u.id = v_quem) then
    return jsonb_build_object('ok', false, 'motivo', 'Esse é o e-mail desta conta.');
  end if;
  insert into public.passagens_de_apresentacao (apresentacao_id, de, por, para_email)
  values (a.id, v_quem, v_quem, v_email) returning * into p;
  select u.id into v_para from auth.users u where lower(u.email) = v_email limit 1;
  return jsonb_build_object('ok', true, 'passada', false, 'conta', v_para is not null, 'venceEm', p.vence_em,
    'para', coalesce(nullif(public.nome_da_conta(v_para), ''), v_email));
end $$;

-- Cancelar o pedido que ainda espera.
create or replace function public.apresentacao_cancelar_passagem(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
begin
  if v_quem is null or not exists (select 1 from public.apresentacoes a where a.id = p_id and a.usuario_id = v_quem) then
    return jsonb_build_object('ok', false, 'motivo', 'Só o dono da página cancela a passagem.');
  end if;
  update public.passagens_de_apresentacao set situacao = 'cancelada', respondido_em = now()
   where apresentacao_id = p_id and situacao = 'esperando';
  return jsonb_build_object('ok', true);
end $$;

-- A passagem de cada página da área, para o cartão: a que espera (até vencer) ou a recusada nos últimos 7 dias.
create or replace function public.passagens_das_minhas_apresentacoes(p_area uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
  v_area uuid := coalesce(p_area, (select auth.uid()));
begin
  if v_quem is null then
    raise exception 'sem conta';
  end if;
  if not public.da_equipe(v_quem, v_area) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'apresentacao', x.apresentacao_id, 'situacao', x.situacao, 'paraEmail', x.para_email,
      'para', coalesce(nullif(public.nome_da_conta(coalesce(x.para, (select u.id from auth.users u where lower(u.email) = x.para_email limit 1))), ''), x.para_email),
      'em', x.criado_em, 'venceEm', x.vence_em, 'respondidoEm', x.respondido_em)), '[]'::jsonb)
    from (select distinct on (p.apresentacao_id) p.*
            from public.passagens_de_apresentacao p join public.apresentacoes a on a.id = p.apresentacao_id
           where a.usuario_id = v_area and p.de = v_area
             and ((p.situacao = 'esperando' and p.vence_em > now()) or (p.situacao = 'recusada' and p.respondido_em > now() - interval '7 days'))
           order by p.apresentacao_id, p.criado_em desc) x);
end $$;

-- ------------------------------------------------------------------------------------------------ receber
-- As páginas que esperam o aceite de quem chama (pelo e-mail confirmado da conta).
create or replace function public.passagens_para_mim() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
  v_email text := public.meu_email();
begin
  if v_quem is null then
    raise exception 'sem conta';
  end if;
  return jsonb_build_object(
    'temIdentidade', exists (select 1 from public.escritorios e where e.usuario_id = v_quem
                              and (nullif(btrim(e.nome), '') is not null or e.logo is not null)),
    'passagens', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nome', a.nome, 'codigo', a.codigo, 'envios', a.envio, 'visitas', a.visitas,
        'comentarios', (select coalesce(sum(jsonb_array_length(d.comentarios)), 0) from public.pedidos_de_ajuste d
                          join public.envios_apresentacao e on e.id = d.envio_id where e.apresentacao_id = a.id),
        'de', public.nome_do_escritorio(p.de), 'em', p.criado_em, 'venceEm', p.vence_em) order by p.criado_em desc), '[]'::jsonb)
      from public.passagens_de_apresentacao p join public.apresentacoes a on a.id = p.apresentacao_id
     where v_email is not null and p.para_email = v_email and p.situacao = 'esperando' and p.vence_em > now()
       and a.usuario_id = p.de));
end $$;

-- Aceitar ou recusar.
create or replace function public.apresentacao_responder_passagem(p_passagem uuid, p_aceitar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
  v_email text := public.meu_email();
  p public.passagens_de_apresentacao;
  a public.apresentacoes;
  v_minha public.apresentacoes;
begin
  if v_quem is null or v_email is null then
    return jsonb_build_object('ok', false, 'motivo', 'Entre com a conta e confirme o e-mail.');
  end if;
  select * into p from public.passagens_de_apresentacao where id = p_passagem and situacao = 'esperando' for update;
  if not found or p.para_email <> v_email then
    return jsonb_build_object('ok', false, 'motivo', 'Este pedido não é mais para esta conta.');
  end if;
  if p.vence_em < now() then
    update public.passagens_de_apresentacao set situacao = 'vencida' where id = p.id;
    return jsonb_build_object('ok', false, 'motivo', 'O pedido venceu. Peça para passarem a página de novo.');
  end if;
  select * into a from public.apresentacoes where id = p.apresentacao_id for update;
  if a.usuario_id <> p.de then
    update public.passagens_de_apresentacao set situacao = 'cancelada', respondido_em = now() where id = p.id;
    return jsonb_build_object('ok', false, 'motivo', 'A página mudou de conta depois do pedido.');
  end if;
  if not coalesce(p_aceitar, false) then
    update public.passagens_de_apresentacao set situacao = 'recusada', para = v_quem, respondido_em = now() where id = p.id;
    return jsonb_build_object('ok', true, 'aceita', false);
  end if;
  select * into v_minha from public.apresentacoes x where x.usuario_id = v_quem and x.chave = a.chave;
  if found and v_minha.envio > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'Você já tem uma página publicada deste projeto: arquionie.com.br/t/' || v_minha.codigo);
  end if;
  if found then
    delete from public.apresentacoes where id = v_minha.id;  -- a página vazia de um envio que parou no meio
  end if;
  if (select count(*) from public.apresentacoes x where x.usuario_id = v_quem) >= public.limite_de_apresentacoes() then
    return jsonb_build_object('ok', false, 'motivo', 'Sua conta já está no limite de páginas do plano.');
  end if;
  update public.apresentacoes set usuario_id = v_quem where id = a.id;
  update public.passagens_de_apresentacao set situacao = 'aceita', para = v_quem, respondido_em = now() where id = p.id;
  return jsonb_build_object('ok', true, 'aceita', true, 'codigo', a.codigo);
end $$;

-- ------------------------------------------------------------------------------------------------ o envio seguinte
-- Para quem vai o envio: a conta de quem envia, o escritório do "em nome de" (estando na equipe) ou, fora da equipe dele, a página que
-- quem envia já tem do projeto (a que recebeu de outra conta). Nula: fora da equipe, sem página.
create or replace function public.dono_do_envio(p_quem uuid, p_escritorio uuid, p_chave text) returns uuid
language sql stable security definer set search_path = '' as $$
  select case
    when p_escritorio is null then p_quem
    when public.da_equipe(p_quem, p_escritorio) then p_escritorio
    when exists (select 1 from public.apresentacoes x where x.usuario_id = p_quem and x.chave = coalesce(p_chave, '')) then p_quem
  end
$$;

-- A de 20261105000000, com a dono_do_envio no lugar da escritorio_para_enviar.
create or replace function public.apresentacao_onde(p_codigo text, p_chave text, p_escritorio uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
  a public.apresentacoes;
  v_dono uuid;
  v_outro uuid;
begin
  if v_quem is null then
    return jsonb_build_object('ok', false, 'motivo', 'Entre com a conta.');
  end if;
  select * into a from public.apresentacoes
   where codigo = upper(btrim(coalesce(p_codigo, ''))) and chave = coalesce(p_chave, '');
  if not found then
    return jsonb_build_object('ok', true, 'achada', false);
  end if;
  v_dono := public.dono_do_envio(v_quem, p_escritorio, a.chave);
  if v_dono = v_quem and not exists (select 1 from public.apresentacoes x where x.usuario_id = v_quem and x.chave = a.chave) then
    select x.usuario_id into v_outro from public.apresentacoes x
     where x.chave = a.chave and x.usuario_id <> v_quem and public.da_equipe(v_quem, x.usuario_id)
     order by coalesce(x.atualizado_em, x.criado_em) desc limit 1;
    if v_outro is not null then
      v_dono := v_outro;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'achada', true,
    'email', (select u.email from auth.users u where u.id = a.usuario_id),
    'escritorio', (select nullif(btrim(e.nome), '') from public.escritorios e where e.usuario_id = a.usuario_id),
    'minha', a.usuario_id = v_quem,
    'naMinhaConta', public.da_equipe(v_quem, a.usuario_id),
    'semEquipe', v_dono is null,
    'mesmoLink', v_dono is not null and v_dono = a.usuario_id);
end $$;

revoke execute on function public.limite_de_apresentacoes() from public, anon, authenticated;
grant execute on function public.limite_de_apresentacoes() to service_role;
revoke execute on function public.apresentacao_passar(uuid, text, uuid) from public, anon;
grant execute on function public.apresentacao_passar(uuid, text, uuid) to authenticated;
revoke execute on function public.apresentacao_cancelar_passagem(uuid) from public, anon;
grant execute on function public.apresentacao_cancelar_passagem(uuid) to authenticated;
revoke execute on function public.passagens_das_minhas_apresentacoes(uuid) from public, anon;
grant execute on function public.passagens_das_minhas_apresentacoes(uuid) to authenticated;
revoke execute on function public.passagens_para_mim() from public, anon;
grant execute on function public.passagens_para_mim() to authenticated;
revoke execute on function public.apresentacao_responder_passagem(uuid, boolean) from public, anon;
grant execute on function public.apresentacao_responder_passagem(uuid, boolean) to authenticated;
revoke execute on function public.dono_do_envio(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.dono_do_envio(uuid, uuid, text) to service_role;
revoke execute on function public.apresentacao_onde(text, text, uuid) from public, anon;
grant execute on function public.apresentacao_onde(text, text, uuid) to authenticated;
