-- Arquionie™: licenças por produto (o programa `arquionie` e o plugin do Revit `arquionie-revit`), a conexão de um
-- computador pelo navegador, como o "gh auth login", e os testes de 3 usos contados por conta. Plano 17 do repositório do
-- plugin (docs/migracao-arkiton/17), com as decisões do ÊDI de 05/10/2026. Rodar uma vez no SQL Editor do projeto
-- arquionie, depois da 20261005000000_registrar_computador.sql.
--
-- O que muda no que já existe: `computadores` ganha o produto e o resumo da credencial de um computador conectado pelo
-- navegador; o limite de três passa a valer por produto; `registrar_computador` continua igual para o programa, só que
-- olhando apenas os computadores do produto `arquionie`.
--
-- Quem chama o quê:
--   site (pessoa com conta) ... conexao_ver, conexao_autorizar, conexao_cancelar, minhas_licencas, licenca_passar, licenca_ficar
--   site (/gestao) ............ gestao_licencas, gestao_liberar, gestao_renovar, gestao_revogar, gestao_reativar,
--                               gestao_trocar_email, gestao_importar_flow, gestao_copia_licencas, gestao_ajustes_licenca
--   funções do servidor ....... conexao_iniciar, conexao_concluir, licenca_estado, licenca_testes, licenca_usar_teste,
--   (conectar e licenca)        licenca_sair — só com a chave secreta, nunca do navegador.

-- ------------------------------------------------------------------------------------------------ ajustes
-- Uma linha só. O fim da convivência com a chave antiga do Flow fica vazio até o dia da troca (plano 17, etapa 9):
-- enquanto estiver vazio, ninguém ganha o bônus.
create table if not exists public.ajustes_licenca (
  id boolean primary key default true check (id),
  limite_computadores int not null default 3 check (limite_computadores between 1 and 20),
  dias_sem_internet int not null default 30 check (dias_sem_internet between 1 and 90),
  dias_entre_trocas int not null default 30 check (dias_entre_trocas between 0 and 365),
  dias_de_bonus int not null default 30 check (dias_de_bonus between 0 and 365),
  limite_testes int not null default 3 check (limite_testes between 0 and 50),
  fim_convivencia timestamptz
);

insert into public.ajustes_licenca (id) values (true) on conflict (id) do nothing;

alter table public.ajustes_licenca enable row level security;

-- ------------------------------------------------------------------------------------------------ licenças
-- A licença é comprada por um DONO (o e-mail de quem pagou) e usada por um TITULAR. As duas pontas podem existir antes
-- das contas: quando a conta com aquele e-mail fica confirmada, a licença se liga a ela sozinha.
create table if not exists public.licencas (
  id uuid primary key default gen_random_uuid(),
  produto text not null check (produto in ('arquionie', 'arquionie-revit')),
  plano text not null default 'pro' check (plano in ('pro', 'equipe')),
  dono_email text not null check (dono_email = lower(btrim(dono_email)) and dono_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  dono_id uuid references auth.users (id) on delete set null,
  email text check (email is null or (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  usuario_id uuid references auth.users (id) on delete set null,
  status text not null default 'ativa' check (status in ('ativa', 'revogada')),
  inicio timestamptz not null default now(),
  expira_em timestamptz not null,
  origem text not null default 'whatsapp' check (origem in ('whatsapp', 'importada-flow', 'equipe', 'cortesia')),
  bonus_em timestamptz,     -- quando os dias de bônus da convivência foram somados (uma vez só)
  trocado_em timestamptz,   -- última vez que o dono passou a licença para alguém (limite de trocas)
  observacao text,
  criada_por uuid references auth.users (id) on delete set null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create index if not exists licencas_usuario on public.licencas (usuario_id);
create index if not exists licencas_dono on public.licencas (dono_id);
create index if not exists licencas_email on public.licencas (email);
create index if not exists licencas_dono_email on public.licencas (dono_email);

alter table public.licencas enable row level security;

drop policy if exists "titular e dono leem a licença" on public.licencas;
create policy "titular e dono leem a licença" on public.licencas
  for select to authenticated using ((select auth.uid()) in (usuario_id, dono_id));

grant select on public.licencas to authenticated;

-- Tudo o que acontece com uma licença fica registrado: quem, quando, antes e depois. As funções dizem o nome da ação
-- (set_config 'arquionie.acao'); sem nome, fica o da operação.
create table if not exists public.licencas_historico (
  id bigint generated always as identity primary key,
  licenca_id uuid not null references public.licencas (id) on delete cascade,
  acao text not null,
  antes jsonb,
  depois jsonb,
  feito_por uuid references auth.users (id) on delete set null,
  feito_em timestamptz not null default now()
);

create index if not exists licencas_historico_licenca on public.licencas_historico (licenca_id);

alter table public.licencas_historico enable row level security;

create or replace function public.licencas_carimbo() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizada_em := now();
  return new;
end $$;

drop trigger if exists licencas_carimbo on public.licencas;
create trigger licencas_carimbo before update on public.licencas
  for each row execute function public.licencas_carimbo();

create or replace function public.licencas_registrar_historico() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.licencas_historico (licenca_id, acao, antes, depois, feito_por)
  values (new.id,
          coalesce(nullif(current_setting('arquionie.acao', true), ''), lower(tg_op)),
          case when tg_op = 'UPDATE' then to_jsonb(old) end,
          to_jsonb(new),
          auth.uid());
  return null;
end $$;

revoke execute on function public.licencas_carimbo() from public, anon, authenticated;
revoke execute on function public.licencas_registrar_historico() from public, anon, authenticated;

drop trigger if exists licencas_historico on public.licencas;
create trigger licencas_historico after insert or update on public.licencas
  for each row execute function public.licencas_registrar_historico();

-- Situação legível de uma licença (a mesma no site, no /gestao e na planilha).
create or replace function public.licenca_situacao(p_status text, p_expira timestamptz, p_email text, p_usuario uuid)
returns text language sql stable set search_path = '' as $$
  select case
    when p_status = 'revogada' then 'revogada'
    when p_expira <= now() then 'vencida'
    when p_email is null then 'sem titular'
    when p_usuario is null then 'esperando a conta'
    when p_expira <= now() + interval '30 days' then 'vencendo'
    else 'ativa'
  end;
$$;

-- ------------------------------------------------------------------------------------------------ ligação com a conta
-- A conta confirmada com aquele e-mail, se existir.
create or replace function public.conta_confirmada(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
   where lower(u.email) = lower(btrim(p_email)) and u.email_confirmed_at is not null
   limit 1;
$$;

-- Liga ao usuário as licenças que esperavam pelo e-mail dele (como dono e como titular) e soma o bônus da convivência
-- às importadas do Flow, uma vez só, se a ligação acontece antes do fim da convivência (decisão 7 do ÊDI).
create or replace function public.licencas_ligar(p_email text, p_usuario uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  a public.ajustes_licenca;
  v_bonus boolean;
begin
  if v_email is null or v_email = '' or p_usuario is null then
    return;
  end if;
  select * into a from public.ajustes_licenca where id;
  v_bonus := a.fim_convivencia is not null and now() <= a.fim_convivencia;

  perform set_config('arquionie.acao', 'conta ligada', true);
  update public.licencas set dono_id = p_usuario
   where dono_id is null and dono_email = v_email;
  update public.licencas l
     set usuario_id = p_usuario,
         expira_em = case when v_bonus and l.origem = 'importada-flow' and l.bonus_em is null
                          then l.expira_em + make_interval(days => a.dias_de_bonus) else l.expira_em end,
         bonus_em = case when v_bonus and l.origem = 'importada-flow' and l.bonus_em is null
                         then now() else l.bonus_em end
   where l.usuario_id is null and l.email = v_email;
end $$;

-- Na conta: ao criar já confirmada (Google) e ao confirmar o e-mail. Nunca impede a conta de ser criada.
create or replace function public.licencas_ao_confirmar_conta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and new.email is not null then
    begin
      perform public.licencas_ligar(new.email, new.id);
    exception when others then
      raise warning 'licencas_ao_confirmar_conta: %', sqlerrm;
    end;
  end if;
  return new;
end $$;

revoke execute on function public.conta_confirmada(text) from public, anon, authenticated;
revoke execute on function public.licencas_ligar(text, uuid) from public, anon, authenticated;
revoke execute on function public.licencas_ao_confirmar_conta() from public, anon, authenticated;

drop trigger if exists licencas_ao_criar_conta on auth.users;
create trigger licencas_ao_criar_conta after insert on auth.users
  for each row execute function public.licencas_ao_confirmar_conta();

drop trigger if exists licencas_ao_confirmar_conta on auth.users;
create trigger licencas_ao_confirmar_conta after update of email, email_confirmed_at on auth.users
  for each row execute function public.licencas_ao_confirmar_conta();

-- ------------------------------------------------------------------------------------------------ computadores
-- O mesmo computador vale uma vez em cada produto: o programa e o plugin no mesmo Windows são duas linhas, cada uma no
-- seu limite de três. O computador conectado pelo navegador guarda só o resumo (SHA-256) da credencial que recebeu.
alter table public.computadores add column if not exists maquina text;
alter table public.computadores add column if not exists produto text not null default 'arquionie';
alter table public.computadores add column if not exists credencial_hash text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'computadores_produto_valido') then
    alter table public.computadores
      add constraint computadores_produto_valido check (produto in ('arquionie', 'arquionie-revit'));
  end if;
end $$;

drop index if exists public.computadores_usuario_maquina;
create unique index if not exists computadores_usuario_produto_maquina on public.computadores (usuario_id, produto, maquina);
create unique index if not exists computadores_credencial on public.computadores (credencial_hash) where credencial_hash is not null;

-- O site lê os próprios computadores, mas nunca o resumo da credencial.
revoke select on public.computadores from authenticated;
grant select (id, usuario_id, produto, maquina, nome, versao, ultimo_acesso, criado_em) on public.computadores to authenticated;

-- O programa: igual à 20261005000000, só que olhando os computadores do produto `arquionie`.
create or replace function public.registrar_computador(p_id text, p_nome text, p_versao text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_computador uuid;
  v_lista jsonb;
  v_limite int := coalesce((select limite_computadores from public.ajustes_licenca where id), 3);
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  if coalesce(trim(p_id), '') = '' then
    raise exception 'sem identidade do computador';
  end if;

  update public.computadores
     set nome = left(p_nome, 120), versao = left(p_versao, 40), ultimo_acesso = now()
   where usuario_id = v_usuario and produto = 'arquionie' and maquina = p_id
  returning id into v_computador;
  if v_computador is not null then
    return jsonb_build_object('situacao', 'ok', 'id', v_computador);
  end if;

  if (select count(*) from public.computadores where usuario_id = v_usuario and produto = 'arquionie') >= v_limite then
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'versao', c.versao, 'ultimo_acesso', c.ultimo_acesso)
                              order by c.ultimo_acesso desc), '[]'::jsonb)
      into v_lista
      from public.computadores c
     where c.usuario_id = v_usuario and c.produto = 'arquionie';
    return jsonb_build_object('situacao', 'limite', 'computadores', v_lista);
  end if;

  insert into public.computadores (usuario_id, produto, maquina, nome, versao)
  values (v_usuario, 'arquionie', p_id, left(p_nome, 120), left(p_versao, 40))
  returning id into v_computador;
  return jsonb_build_object('situacao', 'ok', 'id', v_computador);
end $$;

revoke execute on function public.registrar_computador(text, text, text) from public, anon;
grant execute on function public.registrar_computador(text, text, text) to authenticated;

-- ------------------------------------------------------------------------------------------------ testes de 3 usos
create table if not exists public.testes (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  produto text not null check (produto in ('arquionie', 'arquionie-revit')),
  ferramenta text not null,
  usados int not null default 0 check (usados >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, produto, ferramenta)
);

alter table public.testes enable row level security;

-- ------------------------------------------------------------------------------------------------ conexão pelo navegador
-- O programa pede um código curto (a pessoa confere no site) e um segredo longo (só o programa conhece; aqui fica só o
-- resumo). A pessoa entra no site e AUTORIZA; o programa, que pergunta a cada 3 segundos com o segredo, recebe a
-- credencial do computador. Vale 10 minutos, uma vez só.
create table if not exists public.conexoes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  segredo_hash text not null unique,
  produto text not null check (produto in ('arquionie', 'arquionie-revit')),
  maquina text not null,
  nome text not null,
  versao text,
  usuario_id uuid references auth.users (id) on delete cascade,
  desconectar uuid,   -- o computador que sai para este entrar, quando a conta já está no limite
  status text not null default 'aguardando' check (status in ('aguardando', 'autorizada', 'cancelada')),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '10 minutes'
);

alter table public.conexoes enable row level security;

-- "kmtr 4qpx", "KMTR4QPX" e "KMTR-4QPX" são o mesmo código.
create or replace function public.conexao_codigo(p_codigo text) returns text
language sql immutable set search_path = '' as $$
  select case when length(c) = 8 then substr(c, 1, 4) || '-' || substr(c, 5, 4) else c end
    from (select upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')) as c) x;
$$;

-- A licença em uso de uma pessoa num produto (a de equipe primeiro, depois a que vence por último).
create or replace function public.licenca_em_uso(p_usuario uuid, p_produto text) returns public.licencas
language sql stable security definer set search_path = '' as $$
  select l.* from public.licencas l
   where l.usuario_id = p_usuario and l.produto = p_produto and l.status = 'ativa' and l.expira_em > now()
   order by (l.plano = 'equipe') desc, l.expira_em desc
   limit 1;
$$;

revoke execute on function public.licenca_em_uso(uuid, text) from public, anon, authenticated;

-- Site: o que mostrar na página /conectar.
create or replace function public.conexao_ver(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  x public.conexoes;
  l public.licencas;
  v_limite int := coalesce((select limite_computadores from public.ajustes_licenca where id), 3);
  v_lista jsonb;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  select * into x from public.conexoes where codigo = public.conexao_codigo(p_codigo);
  if not found then
    return jsonb_build_object('situacao', 'inexistente');
  end if;
  if x.status = 'aguardando' and x.expira_em < now() then
    return jsonb_build_object('situacao', 'vencida');
  end if;
  if x.status <> 'aguardando' then
    return jsonb_build_object('situacao', x.status);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'versao', c.versao, 'ultimo_acesso', c.ultimo_acesso)
                            order by c.ultimo_acesso desc), '[]'::jsonb)
    into v_lista
    from public.computadores c
   where c.usuario_id = v_usuario and c.produto = x.produto and c.maquina is distinct from x.maquina;

  l := public.licenca_em_uso(v_usuario, x.produto);
  return jsonb_build_object(
    'situacao', 'aguardando',
    'codigo', x.codigo,
    'produto', x.produto,
    'computador', x.nome,
    'expiraEm', x.expira_em,
    'emUso', jsonb_array_length(v_lista),
    'limite', v_limite,
    'computadores', v_lista,
    'plano', coalesce(l.plano, 'gratis'),
    'licencaAte', l.expira_em
  );
end $$;

-- Site: AUTORIZAR (e, no limite, DESCONECTAR E AUTORIZAR). O computador escolhido sai quando o novo entra de fato.
create or replace function public.conexao_autorizar(p_codigo text, p_desconectar uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  x public.conexoes;
  v_limite int := coalesce((select limite_computadores from public.ajustes_licenca where id), 3);
  v_em_uso int;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  select * into x from public.conexoes where codigo = public.conexao_codigo(p_codigo) for update;
  if not found then
    return jsonb_build_object('situacao', 'inexistente');
  end if;
  if x.status = 'aguardando' and x.expira_em < now() then
    return jsonb_build_object('situacao', 'vencida');
  end if;
  if x.status <> 'aguardando' then
    return jsonb_build_object('situacao', x.status);
  end if;

  select count(*) into v_em_uso from public.computadores
   where usuario_id = v_usuario and produto = x.produto and maquina is distinct from x.maquina;

  if v_em_uso >= v_limite then
    if p_desconectar is null then
      return public.conexao_ver(p_codigo) || jsonb_build_object('situacao', 'limite');
    end if;
    if not exists (select 1 from public.computadores
                    where id = p_desconectar and usuario_id = v_usuario and produto = x.produto) then
      return jsonb_build_object('situacao', 'computador inválido');
    end if;
  end if;

  update public.conexoes
     set usuario_id = v_usuario,
         status = 'autorizada',
         desconectar = case when v_em_uso >= v_limite then p_desconectar end
   where id = x.id;
  return jsonb_build_object('situacao', 'autorizada', 'computador', x.nome, 'produto', x.produto);
end $$;

create or replace function public.conexao_cancelar(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sem conta';
  end if;
  update public.conexoes set status = 'cancelada'
   where codigo = public.conexao_codigo(p_codigo) and status = 'aguardando';
  return jsonb_build_object('situacao', 'cancelada');
end $$;

-- Servidor (função conectar): começa uma conexão. Limpa as vencidas e a anterior do mesmo computador.
create or replace function public.conexao_iniciar(p_codigo text, p_segredo_hash text, p_produto text, p_maquina text,
                                                  p_nome text, p_versao text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_expira timestamptz;
begin
  if p_produto not in ('arquionie', 'arquionie-revit') then
    raise exception 'produto inválido';
  end if;
  if coalesce(btrim(p_maquina), '') = '' then
    raise exception 'sem identidade do computador';
  end if;
  delete from public.conexoes where expira_em < now() - interval '1 day';
  delete from public.conexoes where maquina = p_maquina and produto = p_produto and status = 'aguardando';
  insert into public.conexoes (codigo, segredo_hash, produto, maquina, nome, versao)
  values (public.conexao_codigo(p_codigo), p_segredo_hash, p_produto, left(btrim(p_maquina), 200),
          left(coalesce(nullif(btrim(p_nome), ''), 'COMPUTADOR'), 120), left(p_versao, 40))
  returning expira_em into v_expira;
  return jsonb_build_object('situacao', 'ok', 'expiraEm', v_expira);
end $$;

-- Servidor (função conectar): a pergunta do programa. Autorizada, o computador entra na conta (ou renova a credencial,
-- se já estava) e a conexão some.
create or replace function public.conexao_concluir(p_segredo_hash text, p_credencial_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x public.conexoes;
  v_id uuid;
  v_limite int := coalesce((select limite_computadores from public.ajustes_licenca where id), 3);
begin
  select * into x from public.conexoes where segredo_hash = p_segredo_hash for update;
  if not found then
    return jsonb_build_object('situacao', 'inexistente');
  end if;
  if x.status = 'cancelada' then
    return jsonb_build_object('situacao', 'cancelada');
  end if;
  if x.status = 'aguardando' then
    if x.expira_em < now() then
      return jsonb_build_object('situacao', 'vencida');
    end if;
    return jsonb_build_object('situacao', 'aguardando');
  end if;

  if x.desconectar is not null then
    delete from public.computadores where id = x.desconectar and usuario_id = x.usuario_id and produto = x.produto;
  end if;
  -- Outro computador pode ter entrado entre o AUTORIZAR e esta pergunta.
  if (select count(*) from public.computadores
       where usuario_id = x.usuario_id and produto = x.produto and maquina is distinct from x.maquina) >= v_limite then
    update public.conexoes set status = 'cancelada' where id = x.id;
    return jsonb_build_object('situacao', 'limite');
  end if;

  insert into public.computadores (usuario_id, produto, maquina, nome, versao, credencial_hash, ultimo_acesso)
  values (x.usuario_id, x.produto, x.maquina, x.nome, x.versao, p_credencial_hash, now())
  on conflict (usuario_id, produto, maquina) do update
     set nome = excluded.nome, versao = excluded.versao, credencial_hash = excluded.credencial_hash, ultimo_acesso = now()
  returning id into v_id;

  delete from public.conexoes where id = x.id;
  return jsonb_build_object('situacao', 'autorizada', 'computador', v_id, 'maquina', x.maquina, 'versao', x.versao);
end $$;

-- ------------------------------------------------------------------------------------------------ a ficha da licença
-- Servidor (funções conectar e licenca): o estado que vai na ficha assinada. Confere a credencial e a máquina, e anota o
-- último acesso. Sem licença ativa, o plano é o grátis (decisão 1: grátis com conta).
create or replace function public.licenca_estado(p_credencial_hash text, p_maquina text, p_versao text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.computadores;
  l public.licencas;
  a public.ajustes_licenca;
  v_plano text;
  v_vale timestamptz;
begin
  select * into c from public.computadores where credencial_hash = p_credencial_hash;
  if not found or c.maquina is distinct from p_maquina then
    return jsonb_build_object('situacao', 'desconectado');
  end if;
  update public.computadores
     set ultimo_acesso = now(), versao = coalesce(nullif(left(p_versao, 40), ''), versao)
   where id = c.id;

  select * into a from public.ajustes_licenca where id;
  l := public.licenca_em_uso(c.usuario_id, c.produto);
  v_plano := coalesce(l.plano, 'gratis');
  v_vale := now() + make_interval(days => a.dias_sem_internet);
  if l.id is not null and l.expira_em < v_vale then
    v_vale := l.expira_em;
  end if;

  return jsonb_build_object(
    'situacao', 'ok',
    'produto', c.produto,
    'plano', v_plano,
    'email', (select u.email from auth.users u where u.id = c.usuario_id),
    'expiraEm', l.expira_em,
    'valeAte', v_vale,
    'emitidaEm', now(),
    'computador', c.id,
    'maquina', c.maquina,
    'canal', case when c.produto = 'arquionie-revit'
                  then case when v_plano = 'equipe' then 'revit-escritorio' else 'revit-estavel' end
                  else case when v_plano = 'equipe' then 'escritorio' else 'estavel' end end,
    'limiteTestes', a.limite_testes
  );
end $$;

-- Servidor (função licenca): quantos usos de teste cada ferramenta já gastou, sem gastar nenhum.
create or replace function public.licenca_testes(p_credencial_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.computadores;
begin
  select * into c from public.computadores where credencial_hash = p_credencial_hash;
  if not found then
    return jsonb_build_object('situacao', 'desconectado');
  end if;
  return jsonb_build_object(
    'situacao', 'ok',
    'limite', (select limite_testes from public.ajustes_licenca where id),
    'usados', (select coalesce(jsonb_object_agg(t.ferramenta, t.usados), '{}'::jsonb)
                 from public.testes t where t.usuario_id = c.usuario_id and t.produto = c.produto)
  );
end $$;

-- Servidor (função licenca): gasta um uso de teste. Com licença ativa, não conta.
create or replace function public.licenca_usar_teste(p_credencial_hash text, p_ferramenta text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.computadores;
  v_limite int := coalesce((select limite_testes from public.ajustes_licenca where id), 3);
  v_ferramenta text := left(btrim(coalesce(p_ferramenta, '')), 80);
  v_usados int;
begin
  select * into c from public.computadores where credencial_hash = p_credencial_hash;
  if not found then
    return jsonb_build_object('situacao', 'desconectado');
  end if;
  if v_ferramenta = '' then
    raise exception 'sem ferramenta';
  end if;
  if (public.licenca_em_uso(c.usuario_id, c.produto)).id is not null then
    return jsonb_build_object('situacao', 'ok', 'permitido', true, 'ilimitado', true);
  end if;

  insert into public.testes (usuario_id, produto, ferramenta) values (c.usuario_id, c.produto, v_ferramenta)
  on conflict (usuario_id, produto, ferramenta) do nothing;
  update public.testes set usados = usados + 1, atualizado_em = now()
   where usuario_id = c.usuario_id and produto = c.produto and ferramenta = v_ferramenta and usados < v_limite
  returning usados into v_usados;
  if v_usados is null then
    select usados into v_usados from public.testes
     where usuario_id = c.usuario_id and produto = c.produto and ferramenta = v_ferramenta;
    return jsonb_build_object('situacao', 'ok', 'permitido', false, 'usados', v_usados, 'limite', v_limite);
  end if;
  return jsonb_build_object('situacao', 'ok', 'permitido', true, 'usados', v_usados, 'limite', v_limite);
end $$;

-- Servidor (função licenca): SAIR no programa. O computador sai da conta.
create or replace function public.licenca_sair(p_credencial_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.computadores where credencial_hash = p_credencial_hash;
  return jsonb_build_object('situacao', 'ok');
end $$;

-- ------------------------------------------------------------------------------------------------ MINHA CONTA
-- As licenças que a pessoa usa e as que ela comprou (com quem usa cada uma).
create or replace function public.minhas_licencas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_dias int := coalesce((select dias_entre_trocas from public.ajustes_licenca where id), 30);
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  return jsonb_build_object(
    'usa', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', l.id, 'produto', l.produto, 'plano', l.plano, 'expiraEm', l.expira_em,
                'situacao', public.licenca_situacao(l.status, l.expira_em, l.email, l.usuario_id),
                'bonus', l.bonus_em is not null,
                'compradaPor', case when l.dono_id is distinct from v_usuario then l.dono_email end)
              order by l.produto, l.expira_em desc), '[]'::jsonb)
              from public.licencas l where l.usuario_id = v_usuario),
    'comprou', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', l.id, 'produto', l.produto, 'plano', l.plano, 'expiraEm', l.expira_em,
                'titular', l.email,
                'titularEhVoce', l.usuario_id = v_usuario,
                'situacao', public.licenca_situacao(l.status, l.expira_em, l.email, l.usuario_id),
                'proximaTroca', case when l.usuario_id is not null and l.trocado_em is not null
                                          and l.trocado_em + make_interval(days => v_dias) > now()
                                     then l.trocado_em + make_interval(days => v_dias) end)
              order by l.produto, l.criada_em, l.id), '[]'::jsonb)
              from public.licencas l where l.dono_id = v_usuario)
  );
end $$;

-- PASSAR PARA UM COLEGA (e TROCAR). Só o dono. Enquanto o titular não tem conta, dá para corrigir o e-mail à vontade;
-- depois que ele usa, uma troca a cada 30 dias (ÊDI, 05/10/2026), para a licença não virar rodízio.
create or replace function public.licenca_passar(p_id uuid, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_dias int := coalesce((select dias_entre_trocas from public.ajustes_licenca where id), 30);
  l public.licencas;
  v_conta uuid;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  select * into l from public.licencas where id = p_id for update;
  if not found or l.dono_id is distinct from v_usuario then
    return jsonb_build_object('ok', false, 'motivo', 'Esta licença não é sua.');
  end if;
  if l.status <> 'ativa' or l.expira_em <= now() then
    return jsonb_build_object('ok', false, 'motivo', 'Esta licença não está valendo.');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'motivo', 'Digite um e-mail válido.');
  end if;
  if l.email = v_email then
    return jsonb_build_object('ok', true, 'email', v_email, 'esperandoConta', l.usuario_id is null, 'expiraEm', l.expira_em);
  end if;
  if l.usuario_id is not null and l.trocado_em is not null and l.trocado_em + make_interval(days => v_dias) > now() then
    return jsonb_build_object('ok', false, 'motivo', 'Esta licença já trocou de pessoa há pouco.',
                              'proximaTroca', l.trocado_em + make_interval(days => v_dias));
  end if;
  if exists (select 1 from public.licencas o
              where o.id <> l.id and o.produto = l.produto and o.status = 'ativa' and o.expira_em > now() and o.email = v_email) then
    return jsonb_build_object('ok', false, 'motivo', 'Esta pessoa já tem uma licença deste produto.');
  end if;

  perform set_config('arquionie.acao', 'passada pelo dono', true);
  update public.licencas set email = v_email, usuario_id = null, trocado_em = now() where id = l.id;
  v_conta := public.conta_confirmada(v_email);
  if v_conta is not null then
    perform public.licencas_ligar(v_email, v_conta);
  end if;
  select * into l from public.licencas where id = p_id;
  return jsonb_build_object('ok', true, 'email', v_email, 'esperandoConta', l.usuario_id is null, 'expiraEm', l.expira_em);
end $$;

-- FICAR COM ESTA: o dono passa a usar uma licença que ainda não tem titular.
create or replace function public.licenca_ficar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_email text := (select lower(u.email) from auth.users u where u.id = (select auth.uid()));
  l public.licencas;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  select * into l from public.licencas where id = p_id for update;
  if not found or l.dono_id is distinct from v_usuario then
    return jsonb_build_object('ok', false, 'motivo', 'Esta licença não é sua.');
  end if;
  if l.email is not null then
    return jsonb_build_object('ok', false, 'motivo', 'Esta licença já tem titular.');
  end if;
  if l.status <> 'ativa' or l.expira_em <= now() then
    return jsonb_build_object('ok', false, 'motivo', 'Esta licença não está valendo.');
  end if;
  if (public.licenca_em_uso(v_usuario, l.produto)).id is not null then
    return jsonb_build_object('ok', false, 'motivo', 'Você já usa uma licença deste produto.');
  end if;

  perform set_config('arquionie.acao', 'o dono ficou com ela', true);
  update public.licencas set email = v_email, usuario_id = null, trocado_em = now() where id = l.id;
  perform public.licencas_ligar(v_email, v_usuario);
  return jsonb_build_object('ok', true, 'email', v_email);
end $$;

-- ------------------------------------------------------------------------------------------------ /gestao
create or replace function public.gestao_exigir() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_administrador() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
end $$;

-- A lista de LICENÇAS, os números do alto e os ajustes.
create or replace function public.gestao_licencas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  return jsonb_build_object(
    'resumo', (select jsonb_build_object(
        'total', count(*),
        'ativas', count(*) filter (where s in ('ativa', 'vencendo')),
        'esperando', count(*) filter (where s = 'esperando a conta'),
        'semTitular', count(*) filter (where s = 'sem titular'),
        'vencendo', count(*) filter (where s = 'vencendo'),
        'vencidas', count(*) filter (where s = 'vencida'),
        'revogadas', count(*) filter (where s = 'revogada'),
        'importadasEsperando', count(*) filter (where s = 'esperando a conta' and origem = 'importada-flow'))
      from (select public.licenca_situacao(status, expira_em, email, usuario_id) as s, origem from public.licencas) x),
    'versoes', (select coalesce(jsonb_object_agg(v, n), '{}'::jsonb) from (
        select coalesce(nullif(versao, ''), 'sem versão') as v, count(*) as n
          from public.computadores where produto = 'arquionie-revit' group by 1) y),
    'ajustes', (select to_jsonb(a) - 'id' from public.ajustes_licenca a where a.id),
    'licencas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'produto', l.produto, 'plano', l.plano, 'dono', l.dono_email, 'titular', l.email,
        'situacao', public.licenca_situacao(l.status, l.expira_em, l.email, l.usuario_id),
        'expiraEm', l.expira_em, 'origem', l.origem, 'bonus', l.bonus_em is not null, 'observacao', l.observacao,
        'computadores', (select count(*) from public.computadores c
                          where c.usuario_id = l.usuario_id and c.produto = l.produto),
        'criadaEm', l.criada_em)
      order by l.criada_em desc, l.id), '[]'::jsonb) from public.licencas l)
  );
end $$;

-- LIBERAR: uma licença fica com quem comprou; várias ficam SEM TITULAR para ele distribuir (decisão 5).
create or replace function public.gestao_liberar(p_dono_email text, p_produto text, p_quantidade int, p_expira_em timestamptz,
                                                 p_plano text default 'pro', p_origem text default 'whatsapp',
                                                 p_observacao text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dono text := lower(btrim(coalesce(p_dono_email, '')));
  v_ids uuid[] := '{}';
  v_id uuid;
  v_conta uuid;
begin
  perform public.gestao_exigir();
  if v_dono !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'motivo', 'Digite o e-mail de quem comprou.');
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then
    return jsonb_build_object('ok', false, 'motivo', 'A quantidade vai de 1 a 100.');
  end if;
  if p_expira_em is null or p_expira_em <= now() then
    return jsonb_build_object('ok', false, 'motivo', 'A validade tem que ser uma data futura.');
  end if;

  perform set_config('arquionie.acao', 'liberada', true);
  for i in 1 .. p_quantidade loop
    insert into public.licencas (produto, plano, dono_email, email, expira_em, origem, observacao, criada_por)
    values (p_produto, coalesce(p_plano, 'pro'), v_dono, case when p_quantidade = 1 then v_dono end, p_expira_em,
            coalesce(p_origem, 'whatsapp'), nullif(btrim(p_observacao), ''), (select auth.uid()))
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  v_conta := public.conta_confirmada(v_dono);
  if v_conta is not null then
    perform public.licencas_ligar(v_dono, v_conta);
  end if;
  return jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids), 'quantidade', p_quantidade, 'dono', v_dono,
                            'contaExiste', v_conta is not null);
end $$;

-- RENOVAR: soma a partir da validade, ou de hoje se ela já passou.
create or replace function public.gestao_renovar(p_id uuid, p_meses int default 12) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ate timestamptz;
begin
  perform public.gestao_exigir();
  if p_meses is null or p_meses < 1 or p_meses > 60 then
    return jsonb_build_object('ok', false, 'motivo', 'Renove de 1 a 60 meses.');
  end if;
  perform set_config('arquionie.acao', 'renovada', true);
  update public.licencas set expira_em = greatest(expira_em, now()) + make_interval(months => p_meses)
   where id = p_id returning expira_em into v_ate;
  if v_ate is null then
    return jsonb_build_object('ok', false, 'motivo', 'Licença não encontrada.');
  end if;
  return jsonb_build_object('ok', true, 'expiraEm', v_ate);
end $$;

create or replace function public.gestao_revogar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  perform set_config('arquionie.acao', 'revogada', true);
  update public.licencas set status = 'revogada' where id = p_id and status = 'ativa';
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.gestao_reativar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  perform set_config('arquionie.acao', 'reativada', true);
  update public.licencas set status = 'ativa' where id = p_id and status = 'revogada';
  return jsonb_build_object('ok', found);
end $$;

-- TROCAR E-MAIL do dono ou do titular (o gestor não tem limite de trocas). Titular vazio = SEM TITULAR.
create or replace function public.gestao_trocar_email(p_id uuid, p_qual text, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_conta uuid;
begin
  perform public.gestao_exigir();
  if p_qual not in ('dono', 'titular') then
    raise exception 'diga se é o e-mail do dono ou do titular';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'motivo', 'Digite um e-mail válido.');
  end if;
  if p_qual = 'dono' and v_email is null then
    return jsonb_build_object('ok', false, 'motivo', 'A licença precisa de um dono.');
  end if;

  perform set_config('arquionie.acao', 'e-mail trocado pelo gestor', true);
  if p_qual = 'dono' then
    update public.licencas set dono_email = v_email, dono_id = null where id = p_id;
  else
    update public.licencas set email = v_email, usuario_id = null where id = p_id;
  end if;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Licença não encontrada.');
  end if;
  if v_email is not null then
    v_conta := public.conta_confirmada(v_email);
    if v_conta is not null then
      perform public.licencas_ligar(v_email, v_conta);
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- IMPORTAR CLIENTES DO FLOW, uma vez só: [{ "email": ..., "expira_em": ..., "quantidade": n }]. Quem já foi importado é
-- pulado (rodar de novo não duplica). Uma licença fica com o próprio e-mail; várias ficam SEM TITULAR.
create or replace function public.gestao_importar_flow(p_linhas jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_email text;
  v_ate timestamptz;
  v_qtd int;
  v_conta uuid;
  v_importados int := 0;
  v_licencas int := 0;
  v_pulados int := 0;
  v_problemas jsonb := '[]'::jsonb;
begin
  perform public.gestao_exigir();
  if jsonb_typeof(p_linhas) is distinct from 'array' then
    raise exception 'esperava uma lista';
  end if;
  perform set_config('arquionie.acao', 'importada do Flow', true);
  for r in select * from jsonb_array_elements(p_linhas) loop
    v_email := lower(btrim(coalesce(r ->> 'email', '')));
    begin
      v_ate := (r ->> 'expira_em')::timestamptz;
      v_qtd := coalesce(nullif(btrim(r ->> 'quantidade'), '')::int, 1);
    exception when others then
      v_ate := null;
      v_qtd := 0;
    end;
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_ate is null or v_ate <= now() or v_qtd < 1 or v_qtd > 100 then
      v_problemas := v_problemas || jsonb_build_object('linha', r, 'motivo', 'e-mail, validade ou quantidade inválidos');
      continue;
    end if;
    if exists (select 1 from public.licencas where origem = 'importada-flow' and dono_email = v_email) then
      v_pulados := v_pulados + 1;
      continue;
    end if;
    for i in 1 .. v_qtd loop
      insert into public.licencas (produto, plano, dono_email, email, expira_em, origem, criada_por)
      values ('arquionie-revit', 'pro', v_email, case when v_qtd = 1 then v_email end, v_ate, 'importada-flow',
              (select auth.uid()));
    end loop;
    v_importados := v_importados + 1;
    v_licencas := v_licencas + v_qtd;
    v_conta := public.conta_confirmada(v_email);
    if v_conta is not null then
      perform public.licencas_ligar(v_email, v_conta);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'importados', v_importados, 'licencas', v_licencas, 'pulados', v_pulados,
                            'problemas', v_problemas);
end $$;

-- BAIXAR CÓPIA DAS LICENÇAS: tudo, com o histórico. Enquanto o Supabase estiver no plano gratuito, é a cópia de
-- segurança (decisão 12): baixar toda semana e guardar numa pasta particular.
create or replace function public.gestao_copia_licencas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  return jsonb_build_object(
    'geradaEm', now(),
    'licencas', (select coalesce(jsonb_agg(to_jsonb(l) order by l.criada_em, l.id), '[]'::jsonb) from public.licencas l),
    'historico', (select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]'::jsonb) from public.licencas_historico h)
  );
end $$;

-- O fim da convivência (dia da troca + 90 dias, decisão 6). Vazio desliga o bônus.
create or replace function public.gestao_ajustes_licenca(p_fim_convivencia timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestao_exigir();
  update public.ajustes_licenca set fim_convivencia = p_fim_convivencia where id;
  return (select to_jsonb(a) - 'id' from public.ajustes_licenca a where a.id);
end $$;

-- ------------------------------------------------------------------------------------------------ quem pode chamar
revoke execute on function public.licenca_situacao(text, timestamptz, text, uuid) from public, anon;
revoke execute on function public.conexao_codigo(text) from public, anon;
grant execute on function public.licenca_situacao(text, timestamptz, text, uuid) to authenticated;
grant execute on function public.conexao_codigo(text) to authenticated;

revoke execute on function public.conexao_ver(text) from public, anon;
revoke execute on function public.conexao_autorizar(text, uuid) from public, anon;
revoke execute on function public.conexao_cancelar(text) from public, anon;
revoke execute on function public.minhas_licencas() from public, anon;
revoke execute on function public.licenca_passar(uuid, text) from public, anon;
revoke execute on function public.licenca_ficar(uuid) from public, anon;
grant execute on function public.conexao_ver(text) to authenticated;
grant execute on function public.conexao_autorizar(text, uuid) to authenticated;
grant execute on function public.conexao_cancelar(text) to authenticated;
grant execute on function public.minhas_licencas() to authenticated;
grant execute on function public.licenca_passar(uuid, text) to authenticated;
grant execute on function public.licenca_ficar(uuid) to authenticated;

revoke execute on function public.gestao_exigir() from public, anon, authenticated;
revoke execute on function public.gestao_licencas() from public, anon;
revoke execute on function public.gestao_liberar(text, text, int, timestamptz, text, text, text) from public, anon;
revoke execute on function public.gestao_renovar(uuid, int) from public, anon;
revoke execute on function public.gestao_revogar(uuid) from public, anon;
revoke execute on function public.gestao_reativar(uuid) from public, anon;
revoke execute on function public.gestao_trocar_email(uuid, text, text) from public, anon;
revoke execute on function public.gestao_importar_flow(jsonb) from public, anon;
revoke execute on function public.gestao_copia_licencas() from public, anon;
revoke execute on function public.gestao_ajustes_licenca(timestamptz) from public, anon;
grant execute on function public.gestao_licencas() to authenticated;
grant execute on function public.gestao_liberar(text, text, int, timestamptz, text, text, text) to authenticated;
grant execute on function public.gestao_renovar(uuid, int) to authenticated;
grant execute on function public.gestao_revogar(uuid) to authenticated;
grant execute on function public.gestao_reativar(uuid) to authenticated;
grant execute on function public.gestao_trocar_email(uuid, text, text) to authenticated;
grant execute on function public.gestao_importar_flow(jsonb) to authenticated;
grant execute on function public.gestao_copia_licencas() to authenticated;
grant execute on function public.gestao_ajustes_licenca(timestamptz) to authenticated;

revoke execute on function public.conexao_iniciar(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.conexao_concluir(text, text) from public, anon, authenticated;
revoke execute on function public.licenca_estado(text, text, text) from public, anon, authenticated;
revoke execute on function public.licenca_testes(text) from public, anon, authenticated;
revoke execute on function public.licenca_usar_teste(text, text) from public, anon, authenticated;
revoke execute on function public.licenca_sair(text) from public, anon, authenticated;
grant execute on function public.conexao_iniciar(text, text, text, text, text, text) to service_role;
grant execute on function public.conexao_concluir(text, text) to service_role;
grant execute on function public.licenca_estado(text, text, text) to service_role;
grant execute on function public.licenca_testes(text) to service_role;
grant execute on function public.licenca_usar_teste(text, text) to service_role;
grant execute on function public.licenca_sair(text) to service_role;
