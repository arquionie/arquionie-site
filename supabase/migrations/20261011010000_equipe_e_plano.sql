-- Arquionie™: a equipe do escritório, os ajustes do cliente feitos e o plano personalizado (mockups
-- docs/mockups/comentarios-do-cliente e docs/mockups/equipe-e-apresentacoes do repositório do programa, aprovados por ÊDI em
-- 11/10/2026; contrato no doc 65, §7, de lá). Rodar uma vez no SQL Editor do projeto arquionie, depois da
-- 20261011000000_apresentacoes.sql, e ANTES de publicar de novo a função apresentacoes (ela passa a chamar a apresentacao_enviar
-- com quem enviou). Pode rodar duas vezes sem estragar nada.
--
-- As decisões de ÊDI (11/10/2026): a conta principal é do escritório ou do arquiteto, o RESPONSÁVEL; ele cadastra os e-mails da equipe
-- na página EQUIPE (sem e-mail do Arquionie: o convite se copia para o WhatsApp); cada pessoa entra com o próprio e-mail ou o Google e
-- confirma uma vez (ENTRAR NA EQUIPE ou RECUSAR); quem é da equipe vê e envia as apresentações do escritório, marca os ajustes feitos e
-- pausa; só o responsável cadastra e tira pessoas, muda a identidade e o termo e exclui; tirar vale na hora. As respostas do cliente
-- ficam no projeto e na conta do escritório; o aviso e o "lido" são de cada pessoa. Uma conta usa o Arquionie em até três computadores
-- ao mesmo tempo; com mais gente, o escritório pede o plano personalizado, que chega a ÊDI em /gestao.
--
-- Quem chama o quê:
--   site e programa (pessoa com conta) ... minha_equipe, equipe_cadastrar, equipe_tirar, minhas_equipes, equipe_responder, equipe_sair,
--                                          minhas_apresentacoes(p_area), apresentacao_respostas, apresentacao_marcar_lidas,
--                                          apresentacao_marcar_feito, apresentacao_pausar, apresentacao_desfazer_aprovacao, pedir_plano
--   site (/gestao) ....................... gestao_pedidos_de_plano, gestao_pedido_respondido
--   função apresentacoes (do servidor) ... escritorio_para_enviar, apresentacao_enviar (com quem enviou) — só com a chave secreta

-- ------------------------------------------------------------------------------------------------ a equipe
-- Uma linha por pessoa cadastrada pelo responsável. A pessoa se liga pelo e-mail confirmado (pode cadastrar antes de ela ter conta):
-- convidado até ela confirmar; ativo depois do ENTRAR NA EQUIPE; recusou (o responsável vê e pode cadastrar de novo). Tirar e sair
-- apagam a linha.
create table if not exists public.equipe (
  id uuid primary key default gen_random_uuid(),
  responsavel_id uuid not null references auth.users (id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and email = lower(email)),
  situacao text not null default 'convidado' check (situacao in ('convidado', 'ativo', 'recusou')),
  cadastrado_em timestamptz not null default now(),
  entrou_em timestamptz,
  unique (responsavel_id, email)
);
create index if not exists equipe_email on public.equipe (email);
alter table public.equipe enable row level security;

-- O que cada pessoa já viu das respostas dos clientes (o aviso do Windows aparece uma vez para cada uma).
create table if not exists public.respostas_lidas (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  resposta_id uuid not null,
  lido_em timestamptz not null default now(),
  primary key (usuario_id, resposta_id)
);
alter table public.respostas_lidas enable row level security;

-- Os ajustes feitos de cada pedido: { "1": { "por": "MARIA SOUZA", "em": "…" } }, pelo número do comentário (o do alfinete).
alter table public.pedidos_de_ajuste add column if not exists feitos jsonb not null default '{}'::jsonb;
alter table public.pedidos_de_ajuste add column if not exists feitos_em timestamptz;
-- Quem enviou (a pessoa da equipe), quando o envio sai em nome do escritório.
alter table public.envios_apresentacao add column if not exists enviado_por uuid references auth.users (id) on delete set null;

-- O pedido do plano personalizado (mais gente usando ao mesmo tempo): quantas pessoas, o WhatsApp e a mensagem. Um aberto por conta.
create table if not exists public.pedidos_de_plano (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  pessoas int not null check (pessoas between 2 and 1000),
  whatsapp text not null check (whatsapp ~ '^[0-9]{10,13}$'),
  mensagem text not null default '' check (length(mensagem) <= 1000),
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);
create index if not exists pedidos_de_plano_usuario on public.pedidos_de_plano (usuario_id);
alter table public.pedidos_de_plano enable row level security;
-- Ninguém lê nem escreve as tabelas direto: só pelas funções abaixo.

-- ------------------------------------------------------------------------------------------------ quem é quem
-- O nome da conta (o do cadastro, ou o que veio do Google); vazio sem nome.
create or replace function public.nome_da_conta(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'nome'), ''), nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), '')
  from auth.users u where u.id = p_id
$$;

-- O e-mail confirmado de quem chama, em minúsculas; nulo sem conta ou sem confirmação.
create or replace function public.meu_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = (select auth.uid()) and u.email_confirmed_at is not null
$$;

-- Quem vê o que é do escritório (as apresentações e os ajustes): o responsável e quem está na equipe dele, ativo.
create or replace function public.da_equipe(p_quem uuid, p_responsavel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_quem is not null and p_responsavel is not null and (p_quem = p_responsavel or exists (
    select 1 from public.equipe q join auth.users u on lower(u.email) = q.email and u.email_confirmed_at is not null
     where q.responsavel_id = p_responsavel and q.situacao = 'ativo' and u.id = p_quem))
$$;

-- As contas cujas apresentações quem chama vê: a dele e as dos escritórios em que está na equipe.
create or replace function public.escritorios_de(p_quem uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p_quem
  union
  select q.responsavel_id from public.equipe q join auth.users u on lower(u.email) = q.email and u.email_confirmed_at is not null
   where u.id = p_quem and q.situacao = 'ativo'
$$;

-- O nome do escritório de uma conta: o de CONFIGURAÇÕES › ESCRITÓRIO, ou o e-mail dela.
create or replace function public.nome_do_escritorio(p_responsavel uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(btrim(e.nome), '') from public.escritorios e where e.usuario_id = p_responsavel),
    (select u.email from auth.users u where u.id = p_responsavel), '')
$$;

-- ------------------------------------------------------------------------------------------------ a página EQUIPE (o responsável)
-- A equipe de quem chama: o escritório, as pessoas (esperando a conta, convidado, ativo, recusou), os computadores da conta e o
-- pedido de plano mais novo.
create or replace function public.minha_equipe() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  return jsonb_build_object(
    'escritorio', public.nome_do_escritorio(v_usuario),
    'email', (select u.email from auth.users u where u.id = v_usuario),
    'computadores', (select count(*) from public.computadores c where c.usuario_id = v_usuario and coalesce(c.produto, 'arquionie') = 'arquionie'),
    'limiteComputadores', coalesce((select limite_computadores from public.ajustes_licenca where id), 3),
    'pessoas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'email', q.email, 'nome', coalesce(public.nome_da_conta(u.id), ''),
        'situacao', case when q.situacao = 'convidado' and u.id is null then 'esperando' else q.situacao end,
        'cadastradoEm', q.cadastrado_em, 'entrouEm', q.entrou_em,
        'ultimoAcesso', (select max(c.ultimo_acesso) from public.computadores c where c.usuario_id = u.id))
        order by q.cadastrado_em), '[]'::jsonb)
      from public.equipe q left join auth.users u on lower(u.email) = q.email and u.email_confirmed_at is not null
      where q.responsavel_id = v_usuario),
    'pedidoDePlano', (select jsonb_build_object('em', p.criado_em, 'pessoas', p.pessoas, 'respondidoEm', p.respondido_em)
      from public.pedidos_de_plano p where p.usuario_id = v_usuario order by p.criado_em desc limit 1));
end $$;

-- CADASTRAR: o e-mail entra na equipe (de novo, se tinha recusado). Devolve se a pessoa ainda não tem conta (o convite pelo WhatsApp).
create or replace function public.equipe_cadastrar(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'motivo', 'Digite o e-mail da pessoa, por exemplo maria@escritorio.com.br.');
  end if;
  if v_email = (select lower(u.email) from auth.users u where u.id = v_usuario) then
    return jsonb_build_object('ok', false, 'motivo', 'Este é o e-mail da sua conta: você já é o responsável pela equipe.');
  end if;
  if not exists (select 1 from public.equipe where responsavel_id = v_usuario and email = v_email)
     and (select count(*) from public.equipe where responsavel_id = v_usuario) >= 100 then
    return jsonb_build_object('ok', false, 'motivo', 'A equipe chegou a 100 pessoas. Peça um plano personalizado.');
  end if;
  insert into public.equipe (responsavel_id, email) values (v_usuario, v_email)
  on conflict (responsavel_id, email) do update set situacao = 'convidado', cadastrado_em = now(), entrou_em = null
   where public.equipe.situacao = 'recusou';
  return jsonb_build_object('ok', true, 'email', v_email, 'escritorio', public.nome_do_escritorio(v_usuario),
    'esperandoConta', not exists (select 1 from auth.users u where lower(u.email) = v_email and u.email_confirmed_at is not null));
end $$;

-- TIRAR DA EQUIPE: vale na hora (a pessoa deixa de ver o que é do escritório). O que ela fez fica com o nome dela.
create or replace function public.equipe_tirar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.equipe where id = p_id and responsavel_id = (select auth.uid());
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Pessoa não encontrada na equipe.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------------------------------------ as equipes de quem é da equipe
-- Os escritórios em que quem chama foi cadastrado: os convites para confirmar e as equipes em que entrou, cada uma com as pessoas.
create or replace function public.minhas_equipes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_email text := public.meu_email();
begin
  if (select auth.uid()) is null then
    raise exception 'sem conta';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'responsavel', q.responsavel_id, 'escritorio', public.nome_do_escritorio(q.responsavel_id), 'emailDoResponsavel', r.email,
      'nomeDoResponsavel', public.nome_da_conta(r.id), 'situacao', q.situacao, 'entrouEm', q.entrou_em,
      'pessoas', case when q.situacao <> 'ativo' then '[]'::jsonb else (
        select coalesce(jsonb_agg(jsonb_build_object('email', x.email, 'nome', coalesce(public.nome_da_conta(u.id), ''),
          'voce', x.email = v_email) order by x.entrou_em nulls last), '[]'::jsonb)
        from public.equipe x left join auth.users u on lower(u.email) = x.email and u.email_confirmed_at is not null
        where x.responsavel_id = q.responsavel_id and x.situacao = 'ativo') end)
      order by q.cadastrado_em), '[]'::jsonb)
    from public.equipe q join auth.users r on r.id = q.responsavel_id
    where q.email = v_email and q.situacao in ('convidado', 'ativo'));
end $$;

-- ENTRAR NA EQUIPE ou RECUSAR: a primeira vez, a pessoa confirma.
create or replace function public.equipe_responder(p_responsavel uuid, p_entrar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.equipe set situacao = case when coalesce(p_entrar, false) then 'ativo' else 'recusou' end,
    entrou_em = case when coalesce(p_entrar, false) then now() end
   where responsavel_id = p_responsavel and email = public.meu_email() and situacao = 'convidado';
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Convite não encontrado.');
  end if;
  return jsonb_build_object('ok', true, 'escritorio', public.nome_do_escritorio(p_responsavel));
end $$;

-- SAIR DA EQUIPE.
create or replace function public.equipe_sair(p_responsavel uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.equipe where responsavel_id = p_responsavel and email = public.meu_email();
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Você não está nesta equipe.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------------------------------------ as apresentações da área
-- As apresentações de uma área (a conta de quem chama, ou um escritório em que ele está na equipe): cada projeto com os envios, e
-- cada envio com os pedidos de ajuste (os comentários, com o feito de cada um) e a aprovação (o termo). Para a página APRESENTAÇÕES.
drop function if exists public.minhas_apresentacoes();
create or replace function public.minhas_apresentacoes(p_area uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_area uuid := coalesce(p_area, (select auth.uid()));
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  if not public.da_equipe(v_usuario, v_area) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'limite', coalesce((select limite from public.ajustes_apresentacoes where id), 500),
    'escritorio', public.nome_do_escritorio(v_area), 'responsavel', v_usuario = v_area,
    'apresentacoes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'codigo', a.codigo, 'chave', a.chave, 'nome', a.nome, 'pausada', a.pausada, 'envio', a.envio,
        'visitas', a.visitas, 'ultimaVisita', a.ultima_visita,
        -- a pasta dos arquivos e o envio.json publicado (a capa do cartão vem dele), só para quem é do escritório
        'arquivos', format('apresentacoes/%s-%s/arquivos/', a.codigo, a.pasta),
        'manifesto', (select v.manifesto from public.envios_apresentacao v where v.apresentacao_id = a.id and v.numero = a.envio),
        'envios', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', e.id, 'numero', e.numero, 'fase', e.fase, 'paraQuem', e.para_quem, 'mudancas', e.mudancas, 'em', e.publicado_em,
            'expiraEm', e.expira_em, 'situacao', case when e.situacao <> 'expirado' and e.expira_em < now() then 'expirado' else e.situacao end,
            'visitas', e.visitas, 'tamanho', e.tamanho, 'enviadoPor', public.nome_da_conta(e.enviado_por),
            'comentarios', (select coalesce(sum(jsonb_array_length(d.comentarios)), 0) from public.pedidos_de_ajuste d where d.envio_id = e.id),
            'pedidos', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'em', d.criado_em,
                'comentarios', (select coalesce(jsonb_agg(c.valor || jsonb_build_object('feito', d.feitos -> (c.n)::text) order by c.n), '[]'::jsonb)
                                from jsonb_array_elements(d.comentarios) with ordinality as c(valor, n)))
                order by d.criado_em desc), '[]'::jsonb)
              from public.pedidos_de_ajuste d where d.envio_id = e.id),
            'aprovacao', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'em', p.criado_em, 'termo', p.termo)
              from public.aprovacoes p where p.envio_id = e.id and p.desfeita_em is null order by p.criado_em desc limit 1))
            order by e.numero desc), '[]'::jsonb)
            from public.envios_apresentacao e where e.apresentacao_id = a.id and e.situacao <> 'enviando'))
        order by coalesce(a.atualizado_em, a.criado_em) desc), '[]'::jsonb)
      from public.apresentacoes a where a.usuario_id = v_area and a.envio > 0)
  );
end $$;

-- As respostas dos clientes desde um instante (o programa pergunta ao abrir o projeto e de tempos em tempos): os pedidos de ajuste e
-- as aprovações das apresentações que quem chama vê (as dele e as dos escritórios em que está na equipe), com o "lido" dele, e os
-- feitos de cada pedido que já teve algum marcado (por qualquer pessoa da equipe; o programa compara com o que já sabia).
create or replace function public.apresentacao_respostas(p_desde timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  return jsonb_build_object('agora', now(),
    'pedidos', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'codigo', a.codigo, 'chave', a.chave, 'envio', e.numero,
        'nome', d.nome, 'em', d.criado_em, 'comentarios', d.comentarios, 'feitos', d.feitos,
        'lido', exists (select 1 from public.respostas_lidas l where l.usuario_id = v_usuario and l.resposta_id = d.id)) order by d.criado_em), '[]'::jsonb)
      from public.pedidos_de_ajuste d join public.envios_apresentacao e on e.id = d.envio_id join public.apresentacoes a on a.id = e.apresentacao_id
      where a.usuario_id in (select public.escritorios_de(v_usuario)) and d.criado_em > coalesce(p_desde, '-infinity'::timestamptz)),
    'aprovacoes', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'codigo', a.codigo, 'chave', a.chave, 'envio', e.numero,
        'nome', p.nome, 'em', p.criado_em, 'termo', p.termo, 'desfeita', p.desfeita_em,
        'lido', exists (select 1 from public.respostas_lidas l where l.usuario_id = v_usuario and l.resposta_id = p.id)) order by p.criado_em), '[]'::jsonb)
      from public.aprovacoes p join public.envios_apresentacao e on e.id = p.envio_id join public.apresentacoes a on a.id = e.apresentacao_id
      where a.usuario_id in (select public.escritorios_de(v_usuario)) and (p.criado_em > coalesce(p_desde, '-infinity'::timestamptz)
        or p.desfeita_em > coalesce(p_desde, '-infinity'::timestamptz))),
    'feitos', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'chave', a.chave, 'envio', e.numero, 'feitos', d.feitos)), '[]'::jsonb)
      from public.pedidos_de_ajuste d join public.envios_apresentacao e on e.id = d.envio_id join public.apresentacoes a on a.id = e.apresentacao_id
      where a.usuario_id in (select public.escritorios_de(v_usuario)) and d.feitos_em is not null));
end $$;

-- O programa marca como lidos os pedidos e as aprovações que já mostrou a esta pessoa (o aviso não volta para ela).
create or replace function public.apresentacao_marcar_lidas(p_lista jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  p_ids uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_lista, '[]'::jsonb)) x);
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  insert into public.respostas_lidas (usuario_id, resposta_id)
  select v_usuario, d.id from public.pedidos_de_ajuste d join public.envios_apresentacao e on e.id = d.envio_id
    join public.apresentacoes a on a.id = e.apresentacao_id
   where d.id = any (p_ids) and a.usuario_id in (select public.escritorios_de(v_usuario))
  union
  select v_usuario, p.id from public.aprovacoes p join public.envios_apresentacao e on e.id = p.envio_id
    join public.apresentacoes a on a.id = e.apresentacao_id
   where p.id = any (p_ids) and a.usuario_id in (select public.escritorios_de(v_usuario))
  on conflict do nothing;
  -- a primeira leitura também fica no pedido (o que a página e o programa de antes conferiam)
  update public.pedidos_de_ajuste d set lido_em = now()
    from public.envios_apresentacao e join public.apresentacoes a on a.id = e.apresentacao_id
   where d.id = any (p_ids) and d.envio_id = e.id and a.usuario_id in (select public.escritorios_de(v_usuario)) and d.lido_em is null;
  update public.aprovacoes p set lido_em = now()
    from public.envios_apresentacao e join public.apresentacoes a on a.id = e.apresentacao_id
   where p.id = any (p_ids) and p.envio_id = e.id and a.usuario_id in (select public.escritorios_de(v_usuario)) and p.lido_em is null;
  return jsonb_build_object('ok', true);
end $$;

-- MARCAR COMO FEITO (ou a fazer de novo) um comentário do pedido, pelo número dele, com o nome de quem marcou. O programa grava no
-- projeto e manda aqui, para o site e as outras pessoas da equipe verem.
create or replace function public.apresentacao_marcar_feito(p_pedido uuid, p_numero int, p_feito boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  d public.pedidos_de_ajuste;
  v_nome text;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  select x.* into d from public.pedidos_de_ajuste x join public.envios_apresentacao e on e.id = x.envio_id
    join public.apresentacoes a on a.id = e.apresentacao_id
   where x.id = p_pedido and public.da_equipe(v_usuario, a.usuario_id);
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido de ajuste não encontrado.');
  end if;
  if p_numero is null or p_numero < 1 or p_numero > jsonb_array_length(d.comentarios) then
    return jsonb_build_object('ok', false, 'motivo', 'Comentário não encontrado no pedido.');
  end if;
  v_nome := coalesce(nullif(public.nome_da_conta(v_usuario), ''), (select u.email from auth.users u where u.id = v_usuario));
  update public.pedidos_de_ajuste set feitos_em = now(),
    feitos = case when coalesce(p_feito, false) then feitos || jsonb_build_object(p_numero::text, jsonb_build_object('por', v_nome, 'em', now()))
                  else feitos - p_numero::text end
   where id = d.id returning * into d;
  return jsonb_build_object('ok', true, 'feitos', d.feitos);
end $$;

-- PAUSAR tira do ar na hora; REATIVAR volta com o mesmo link. O responsável e quem é da equipe.
create or replace function public.apresentacao_pausar(p_id uuid, p_pausar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.apresentacoes set pausada = coalesce(p_pausar, false)
   where id = p_id and public.da_equipe((select auth.uid()), usuario_id) and envio > 0;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Apresentação não encontrada.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- DESFAZER A APROVAÇÃO (um engano, ou outra pessoa com o link): o envio volta a AJUSTES se houve pedido, senão a AGUARDANDO.
create or replace function public.apresentacao_desfazer_aprovacao(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.aprovacoes;
begin
  update public.aprovacoes x set desfeita_em = now()
    from public.envios_apresentacao e join public.apresentacoes a on a.id = e.apresentacao_id
   where x.id = p_id and x.envio_id = e.id and public.da_equipe((select auth.uid()), a.usuario_id) and x.desfeita_em is null
  returning x.* into p;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Aprovação não encontrada.');
  end if;
  update public.envios_apresentacao e
     set situacao = case when exists (select 1 from public.pedidos_de_ajuste d where d.envio_id = e.id) then 'ajustes' else 'aguardando' end
   where e.id = p.envio_id and e.situacao = 'aprovado';
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------------------------------------ o envio em nome do escritório
-- Em nome de quem o envio vai: sem escritório, da própria conta; com ele, do escritório, se quem envia está na equipe; senão, nulo.
create or replace function public.escritorio_para_enviar(p_quem uuid, p_escritorio uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when p_escritorio is null then p_quem when public.da_equipe(p_quem, p_escritorio) then p_escritorio end
$$;

-- ENVIAR (a de 20261011000000, com quem enviou): ver a nota de lá. p_usuario é a conta dona da apresentação (o escritório); quem
-- enviou fica no envio.
drop function if exists public.apresentacao_enviar(uuid, text, text, text, text, text, int, text, text);
create or replace function public.apresentacao_enviar(p_usuario uuid, p_chave text, p_nome text, p_fase text, p_para_quem text,
  p_mudancas text, p_dias int, p_codigo text, p_pasta text, p_enviado_por uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  j public.ajustes_apresentacoes;
  l public.licencas;
  a public.apresentacoes;
  e public.envios_apresentacao;
  v_publicadas int;
  v_dias int;
begin
  select * into j from public.ajustes_apresentacoes where id;
  l := public.licenca_em_uso(p_usuario, 'arquionie');
  if not coalesce(j.livres_no_lancamento, true) and (l.id is null or l.plano not in ('pro', 'equipe')) then
    return jsonb_build_object('ok', false, 'motivo', 'plano', 'texto', 'O ENVIAR PARA O CLIENTE faz parte do plano PRO do Arquionie.');
  end if;
  if coalesce(p_fase, '') not in ('aprovacao', 'final') then
    return jsonb_build_object('ok', false, 'motivo', 'fase', 'texto', 'A fase vai como aprovacao ou final.');
  end if;
  v_dias := greatest(30, least(1095, coalesce(p_dias, j.prazo_padrao, 365)));
  select * into a from public.apresentacoes where usuario_id = p_usuario and chave = p_chave;
  if not found then
    select count(*) into v_publicadas from public.apresentacoes where usuario_id = p_usuario;
    if v_publicadas >= coalesce(j.limite, 500) then
      return jsonb_build_object('ok', false, 'motivo', 'limite',
        'texto', format('A conta já tem %s projetos com apresentação, o limite do plano.', v_publicadas));
    end if;
    insert into public.apresentacoes (codigo, usuario_id, chave, nome, pasta)
    values (upper(p_codigo), p_usuario, p_chave, p_nome, p_pasta)
    returning * into a;
  end if;
  update public.apresentacoes set nome = p_nome where id = a.id returning * into a;
  -- O que estava subindo (o programa caiu no meio) é retomado; senão, o envio seguinte.
  select * into e from public.envios_apresentacao where apresentacao_id = a.id and situacao = 'enviando' order by numero desc limit 1;
  if found then
    update public.envios_apresentacao set fase = p_fase, para_quem = left(coalesce(p_para_quem, ''), 200),
      mudancas = left(coalesce(p_mudancas, ''), 2000), expira_em = now() + make_interval(days => v_dias),
      enviado_por = coalesce(p_enviado_por, p_usuario)
     where id = e.id returning * into e;
  else
    insert into public.envios_apresentacao (apresentacao_id, numero, fase, para_quem, mudancas, expira_em, enviado_por)
    values (a.id, coalesce((select max(numero) from public.envios_apresentacao where apresentacao_id = a.id), 0) + 1, p_fase,
      left(coalesce(p_para_quem, ''), 200), left(coalesce(p_mudancas, ''), 2000), now() + make_interval(days => v_dias),
      coalesce(p_enviado_por, p_usuario))
    returning * into e;
  end if;
  return jsonb_build_object('ok', true, 'id', a.id, 'envio', e.id, 'numero', e.numero, 'codigo', a.codigo,
    'prefixo', format('apresentacoes/%s-%s/arquivos/', a.codigo, a.pasta), 'expiraEm', e.expira_em,
    'existentes', (select coalesce(array_agg(distinct x), '{}') from public.envios_apresentacao v, unnest(v.arquivos) x
                   where v.apresentacao_id = a.id and v.numero = a.envio));
end $$;

-- A pasta da apresentação de um envio (o responsável ou quem é da equipe), para a função conferir o que subiu.
create or replace function public.apresentacao_do_envio(p_usuario uuid, p_envio uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.envios_apresentacao;
  a public.apresentacoes;
begin
  select * into e from public.envios_apresentacao where id = p_envio;
  select * into a from public.apresentacoes where id = e.apresentacao_id and public.da_equipe(p_usuario, usuario_id);
  if not found or e.situacao <> 'enviando' then
    return jsonb_build_object('ok', false, 'motivo', 'Este envio não é mais o esperado: envie de novo.');
  end if;
  return jsonb_build_object('ok', true, 'prefixo', format('apresentacoes/%s-%s/arquivos/', a.codigo, a.pasta));
end $$;

-- CONCLUIR (a de 20261011000000, para o responsável e quem é da equipe).
create or replace function public.apresentacao_concluir(p_usuario uuid, p_envio uuid, p_manifesto text, p_lista jsonb, p_tamanho bigint)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.envios_apresentacao;
  a public.apresentacoes;
  v_antes text[];
  p_arquivos text[] := array(select x from jsonb_array_elements_text(coalesce(p_lista, '[]'::jsonb)) x);
begin
  if p_manifesto is null or p_manifesto !~ '^[0-9a-f]{64}\.json$' or not (p_manifesto = any (p_arquivos)) then
    return jsonb_build_object('ok', false, 'motivo', 'Falta o envio.json.');
  end if;
  select * into e from public.envios_apresentacao where id = p_envio and situacao = 'enviando';
  select * into a from public.apresentacoes where id = e.apresentacao_id and public.da_equipe(p_usuario, usuario_id);
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Este envio não é mais o esperado: envie de novo.');
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_antes from public.envios_apresentacao v, unnest(v.arquivos) x
   where v.apresentacao_id = a.id and v.numero = a.envio;
  update public.envios_apresentacao set manifesto = p_manifesto, arquivos = p_arquivos, tamanho = coalesce(p_tamanho, 0),
    situacao = 'aguardando', publicado_em = now() where id = e.id returning * into e;
  -- Os envios de antes ficam só no histórico (sem os arquivos, que saem do R2); o vencido continua vencido.
  update public.envios_apresentacao set arquivos = '{}' where apresentacao_id = a.id and id <> e.id;
  update public.apresentacoes set envio = e.numero, atualizado_em = now() where id = a.id returning * into a;
  return jsonb_build_object('ok', true, 'codigo', a.codigo, 'numero', e.numero, 'pausada', a.pausada,
    'apagar', (select coalesce(array_agg(x), '{}') from unnest(v_antes) x where not (x = any (p_arquivos))));
end $$;

-- ------------------------------------------------------------------------------------------------ o plano personalizado
-- SOLICITAR PLANO PERSONALIZADO: quantas pessoas usam ao mesmo tempo, o WhatsApp e a mensagem. O pedido aberto se atualiza.
create or replace function public.pedir_plano(p_pessoas int, p_whatsapp text, p_mensagem text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_em timestamptz := now();
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  if p_pessoas is null or p_pessoas < 2 or p_pessoas > 1000 then
    return jsonb_build_object('ok', false, 'motivo', 'Diga quantas pessoas usam ao mesmo tempo (de 2 a 1.000).');
  end if;
  if length(v_whatsapp) not between 10 and 13 then
    return jsonb_build_object('ok', false, 'motivo', 'Digite o WhatsApp com o DDD, por exemplo (91) 98888-7777.');
  end if;
  update public.pedidos_de_plano set pessoas = p_pessoas, whatsapp = v_whatsapp, mensagem = left(coalesce(btrim(p_mensagem), ''), 1000),
    criado_em = v_em where usuario_id = v_usuario and respondido_em is null;
  if not found then
    insert into public.pedidos_de_plano (usuario_id, pessoas, whatsapp, mensagem, criado_em)
    values (v_usuario, p_pessoas, v_whatsapp, left(coalesce(btrim(p_mensagem), ''), 1000), v_em);
  end if;
  return jsonb_build_object('ok', true, 'em', v_em);
end $$;

-- /gestao › PEDIDOS DE PLANO: os pedidos, os abertos primeiro, com a conta, o escritório e as licenças que ela já tem.
create or replace function public.gestao_pedidos_de_plano() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'email', u.email, 'nome', public.nome_da_conta(u.id),
      'escritorio', public.nome_do_escritorio(u.id), 'pessoas', p.pessoas, 'whatsapp', p.whatsapp, 'mensagem', p.mensagem,
      'em', p.criado_em, 'respondidoEm', p.respondido_em,
      'equipe', (select count(*) from public.equipe q where q.responsavel_id = u.id),
      'licencas', (select count(*) from public.licencas l where lower(l.dono_email) = lower(u.email) and l.status = 'ativa' and l.expira_em > now()))
      order by (p.respondido_em is null) desc, p.criado_em desc), '[]'::jsonb)
    from public.pedidos_de_plano p join auth.users u on u.id = p.usuario_id);
end $$;

create or replace function public.gestao_pedido_respondido(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  update public.pedidos_de_plano set respondido_em = now() where id = p_id and respondido_em is null;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido não encontrado ou já respondido.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------------------------------------ quem pode chamar
revoke execute on function public.nome_da_conta(uuid) from public, anon, authenticated;
grant execute on function public.nome_da_conta(uuid) to service_role;
revoke execute on function public.meu_email() from public, anon;
grant execute on function public.meu_email() to authenticated;
revoke execute on function public.da_equipe(uuid, uuid) from public, anon, authenticated;
grant execute on function public.da_equipe(uuid, uuid) to service_role;
revoke execute on function public.escritorios_de(uuid) from public, anon, authenticated;
grant execute on function public.escritorios_de(uuid) to service_role;
revoke execute on function public.nome_do_escritorio(uuid) from public, anon, authenticated;
grant execute on function public.nome_do_escritorio(uuid) to service_role;
revoke execute on function public.minha_equipe() from public, anon;
grant execute on function public.minha_equipe() to authenticated;
revoke execute on function public.equipe_cadastrar(text) from public, anon;
grant execute on function public.equipe_cadastrar(text) to authenticated;
revoke execute on function public.equipe_tirar(uuid) from public, anon;
grant execute on function public.equipe_tirar(uuid) to authenticated;
revoke execute on function public.minhas_equipes() from public, anon;
grant execute on function public.minhas_equipes() to authenticated;
revoke execute on function public.equipe_responder(uuid, boolean) from public, anon;
grant execute on function public.equipe_responder(uuid, boolean) to authenticated;
revoke execute on function public.equipe_sair(uuid) from public, anon;
grant execute on function public.equipe_sair(uuid) to authenticated;
revoke execute on function public.minhas_apresentacoes(uuid) from public, anon;
grant execute on function public.minhas_apresentacoes(uuid) to authenticated;
revoke execute on function public.apresentacao_respostas(timestamptz) from public, anon;
grant execute on function public.apresentacao_respostas(timestamptz) to authenticated;
revoke execute on function public.apresentacao_marcar_lidas(jsonb) from public, anon;
grant execute on function public.apresentacao_marcar_lidas(jsonb) to authenticated;
revoke execute on function public.apresentacao_marcar_feito(uuid, int, boolean) from public, anon;
grant execute on function public.apresentacao_marcar_feito(uuid, int, boolean) to authenticated;
revoke execute on function public.apresentacao_pausar(uuid, boolean) from public, anon;
grant execute on function public.apresentacao_pausar(uuid, boolean) to authenticated;
revoke execute on function public.apresentacao_desfazer_aprovacao(uuid) from public, anon;
grant execute on function public.apresentacao_desfazer_aprovacao(uuid) to authenticated;
revoke execute on function public.escritorio_para_enviar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.escritorio_para_enviar(uuid, uuid) to service_role;
revoke execute on function public.apresentacao_enviar(uuid, text, text, text, text, text, int, text, text, uuid) from public, anon, authenticated;
grant execute on function public.apresentacao_enviar(uuid, text, text, text, text, text, int, text, text, uuid) to service_role;
revoke execute on function public.apresentacao_do_envio(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apresentacao_do_envio(uuid, uuid) to service_role;
revoke execute on function public.apresentacao_concluir(uuid, uuid, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.apresentacao_concluir(uuid, uuid, text, jsonb, bigint) to service_role;
revoke execute on function public.pedir_plano(int, text, text) from public, anon;
grant execute on function public.pedir_plano(int, text, text) to authenticated;
revoke execute on function public.gestao_pedidos_de_plano() from public, anon;
grant execute on function public.gestao_pedidos_de_plano() to authenticated;
revoke execute on function public.gestao_pedido_respondido(uuid) from public, anon;
grant execute on function public.gestao_pedido_respondido(uuid) to authenticated;
