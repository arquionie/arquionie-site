-- O COMPUTADOR DE RENDERIZAÇÃO (mockup docs/mockups/computador-de-renderizacao do repositório do programa, aprovado por ÊDI em
-- 10/11/2026: "Aprovo as doze"). As máquinas paradas do escritório renderizam as exportações que qualquer pessoa da equipe manda pelo
-- EXPORTAR. Aqui fica só a fila: cada máquina, o sinal dela (livre ou com o quê) e os pedidos com o andamento. Nenhum arquivo: o projeto
-- vai pelo Drive do escritório e o que sai volta para a pasta 3. APRESENTAÇÃO dele. Etapa 1: uma máquina e um pedido de cada vez.
-- Pode rodar duas vezes.

-- ------------------------------------------------------------------------------------------------ as máquinas
-- Uma linha por computador de renderização de um escritório (a conta do responsável da equipe, ou a da própria pessoa sem equipe). O
-- computador é a identidade do Windows (a mesma do registrar_computador). O sinal chega a cada poucos segundos; sem ele há 2 minutos, a
-- máquina aparece "sem sinal". Sair do modo põe 'desligado' (a linha fica, com a história dos pedidos).
create table if not exists public.renderizadores (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references auth.users (id) on delete cascade,
  ligado_por uuid not null references auth.users (id) on delete cascade,
  computador text not null check (length(computador) between 1 and 80),
  nome text not null check (length(btrim(nome)) between 1 and 40),
  info jsonb not null default '{}'::jsonb,
  estado text not null default 'livre' check (estado in ('livre', 'exportando', 'pausado', 'desligado')),
  agora jsonb,
  visto_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (escritorio_id, computador)
);
alter table public.renderizadores enable row level security;

-- ------------------------------------------------------------------------------------------------ os pedidos
-- O pedido de exportação de uma pessoa a uma máquina: o projeto (o nome, o caminho dentro do Drive e a identidade), os itens que saem
-- (o pedido, com os segundos de cada um sem o ritmo de nenhuma máquina), a estimativa na máquina escolhida e o andamento que ela conta.
-- 'esperando' na fila; 'renderizando' com a máquina; 'pronto', 'cancelado' ou 'erro' no fim.
create table if not exists public.pedidos_de_renderizacao (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references auth.users (id) on delete cascade,
  renderizador_id uuid not null references public.renderizadores (id) on delete cascade,
  quem_pediu uuid not null references auth.users (id) on delete cascade,
  projeto text not null check (length(projeto) between 1 and 200),
  caminho text not null check (length(caminho) between 1 and 1000),
  identidade text,
  pedido jsonb not null,
  quantos int not null default 0 check (quantos >= 0),
  segundos numeric not null default 0 check (segundos >= 0),
  estado text not null default 'esperando' check (estado in ('esperando', 'renderizando', 'pronto', 'cancelado', 'erro')),
  andamento jsonb not null default '{}'::jsonb,
  texto text,
  comecar_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  comecou_em timestamptz,
  terminou_em timestamptz
);
create index if not exists pedidos_de_renderizacao_fila on public.pedidos_de_renderizacao (renderizador_id, estado, criado_em);
create index if not exists pedidos_de_renderizacao_quem on public.pedidos_de_renderizacao (quem_pediu, criado_em desc);
alter table public.pedidos_de_renderizacao enable row level security;

-- ------------------------------------------------------------------------------------------------ o escritório de quem chama
-- O escritório em que a máquina entra: o da primeira equipe em que a pessoa está ativa; sem equipe, a própria conta.
create or replace function public.escritorio_da_renderizacao(p_quem uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select q.responsavel_id from public.equipe q join auth.users u on lower(u.email) = q.email and u.email_confirmed_at is not null
     where u.id = p_quem and q.situacao = 'ativo' order by q.entrou_em nulls last, q.cadastrado_em limit 1), p_quem)
$$;
revoke execute on function public.escritorio_da_renderizacao(uuid) from public, anon, authenticated;

-- A máquina de um escritório de quem chama, pelo computador.
create or replace function public.renderizador_de(p_quem uuid, p_computador text) returns uuid
language sql stable security definer set search_path = '' as $$
  select r.id from public.renderizadores r
   where r.computador = p_computador and r.escritorio_id in (select public.escritorios_de(p_quem))
   order by r.visto_em desc limit 1
$$;
revoke execute on function public.renderizador_de(uuid, text) from public, anon, authenticated;

-- O pedido, como a máquina e quem pediu o leem.
create or replace function public.pedido_de_renderizacao_json(p public.pedidos_de_renderizacao) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'renderizador', p.renderizador_id,
    'maquina', (select r.nome from public.renderizadores r where r.id = p.renderizador_id),
    'quem', coalesce(public.nome_da_conta(p.quem_pediu), (select u.email from auth.users u where u.id = p.quem_pediu), ''),
    'projeto', p.projeto, 'caminho', p.caminho, 'identidade', p.identidade, 'quantos', p.quantos, 'segundos', p.segundos,
    'estado', p.estado, 'andamento', p.andamento, 'texto', p.texto, 'comecarEm', p.comecar_em, 'criadoEm', p.criado_em,
    'comecouEm', p.comecou_em, 'terminouEm', p.terminou_em)
$$;
revoke execute on function public.pedido_de_renderizacao_json(public.pedidos_de_renderizacao) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------ na máquina
-- O SINAL, a cada poucos segundos: cria a máquina na primeira vez, guarda o nome, o que ela tem (a memória, a placa, o ritmo de cada tipo
-- de item, a versão), o estado e o pedido de agora. A máquina de renderização não conta no limite de três computadores da conta
-- (pergunta 8 do mockup): o registro dela como computador de trabalho sai.
create or replace function public.renderizador_sinal(p_computador text, p_nome text, p_info jsonb, p_estado text, p_agora jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
  v_escritorio uuid;
  v_id uuid;
begin
  if v_quem is null then
    raise exception 'sem conta';
  end if;
  if coalesce(btrim(p_computador), '') = '' or length(p_computador) > 80 then
    return jsonb_build_object('ok', false, 'motivo', 'Sem a identidade deste computador.');
  end if;
  if coalesce(btrim(p_nome), '') = '' or length(btrim(p_nome)) > 40 then
    return jsonb_build_object('ok', false, 'motivo', 'Dê um nome de até 40 letras a este computador.');
  end if;
  if p_estado not in ('livre', 'exportando', 'pausado') then
    return jsonb_build_object('ok', false, 'motivo', 'Estado desconhecido.');
  end if;
  if pg_column_size(coalesce(p_info, '{}'::jsonb)) > 20000 or pg_column_size(coalesce(p_agora, '{}'::jsonb)) > 20000 then
    return jsonb_build_object('ok', false, 'motivo', 'O sinal é grande demais.');
  end if;
  v_id := public.renderizador_de(v_quem, p_computador);
  if v_id is null then
    v_escritorio := public.escritorio_da_renderizacao(v_quem);
    insert into public.renderizadores (escritorio_id, ligado_por, computador, nome, info, estado, agora)
    values (v_escritorio, v_quem, p_computador, btrim(p_nome), coalesce(p_info, '{}'::jsonb), p_estado, p_agora)
    returning id into v_id;
  else
    update public.renderizadores set nome = btrim(p_nome), info = coalesce(p_info, '{}'::jsonb), estado = p_estado, agora = p_agora,
           visto_em = now()
     where id = v_id
    returning escritorio_id into v_escritorio;
  end if;
  delete from public.computadores c where c.usuario_id = v_quem and c.produto = 'arquionie' and c.maquina = p_computador;
  return jsonb_build_object('ok', true, 'id', v_id, 'escritorio', public.nome_do_escritorio(v_escritorio));
end $$;
revoke execute on function public.renderizador_sinal(text, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.renderizador_sinal(text, text, jsonb, text, jsonb) to authenticated;

-- SAIR DO MODO DE RENDERIZAÇÃO: a máquina fica 'desligado' e os pedidos que esperavam por ela são cancelados, com o motivo.
create or replace function public.renderizador_desligar(p_computador text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
  v_id uuid;
  v_cancelados int;
begin
  if v_quem is null then
    raise exception 'sem conta';
  end if;
  v_id := public.renderizador_de(v_quem, p_computador);
  if v_id is null then
    return jsonb_build_object('ok', true, 'cancelados', 0);
  end if;
  update public.renderizadores set estado = 'desligado', agora = null, visto_em = now() where id = v_id;
  update public.pedidos_de_renderizacao set estado = 'cancelado', terminou_em = now(),
         texto = 'O computador saiu do modo de renderização antes de começar.'
   where renderizador_id = v_id and estado = 'esperando';
  get diagnostics v_cancelados = row_count;
  return jsonb_build_object('ok', true, 'cancelados', v_cancelados);
end $$;
revoke execute on function public.renderizador_desligar(text) from public, anon;
grant execute on function public.renderizador_desligar(text) to authenticated;

-- PEGAR: o pedido de agora desta máquina, com o conteúdo (os itens). Se ela já tinha um em 'renderizando' (caiu ou reiniciou no meio), o mesmo, para continuar do
-- que falta; senão, o mais antigo da fila cuja hora chegou. Um de cada vez: a linha fica presa enquanto muda.
create or replace function public.renderizacao_pegar(p_computador text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
  v_id uuid;
  v_pedido public.pedidos_de_renderizacao;
begin
  if v_quem is null then
    raise exception 'sem conta';
  end if;
  v_id := public.renderizador_de(v_quem, p_computador);
  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'Este computador não está no modo de renderização.');
  end if;
  select * into v_pedido from public.pedidos_de_renderizacao
   where renderizador_id = v_id and estado = 'renderizando' order by comecou_em limit 1;
  if found then
    return jsonb_build_object('ok', true, 'retomar', true,
      'pedido', public.pedido_de_renderizacao_json(v_pedido) || jsonb_build_object('conteudo', v_pedido.pedido));
  end if;
  select * into v_pedido from public.pedidos_de_renderizacao
   where renderizador_id = v_id and estado = 'esperando' and comecar_em <= now()
   order by criado_em limit 1 for update skip locked;
  if not found then
    return jsonb_build_object('ok', true, 'pedido', null);
  end if;
  update public.pedidos_de_renderizacao set estado = 'renderizando', comecou_em = coalesce(comecou_em, now())
   where id = v_pedido.id returning * into v_pedido;
  return jsonb_build_object('ok', true, 'retomar', false,
    'pedido', public.pedido_de_renderizacao_json(v_pedido) || jsonb_build_object('conteudo', v_pedido.pedido));
end $$;
revoke execute on function public.renderizacao_pegar(text) from public, anon;
grant execute on function public.renderizacao_pegar(text) to authenticated;

-- O ANDAMENTO, pela máquina: o que saiu e o que falta; com o estado, o fim ('pronto', 'erro') ou a volta à fila ('esperando', a máquina
-- pausada). O pedido cancelado por quem pediu não muda mais: a resposta diz 'cancelado', e a máquina para.
create or replace function public.renderizacao_andamento(p_pedido uuid, p_estado text, p_andamento jsonb, p_texto text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
  v_pedido public.pedidos_de_renderizacao;
begin
  if v_quem is null then
    raise exception 'sem conta';
  end if;
  select * into v_pedido from public.pedidos_de_renderizacao where id = p_pedido;
  if not found or v_pedido.escritorio_id not in (select public.escritorios_de(v_quem)) then
    return jsonb_build_object('ok', false, 'motivo', 'Pedido não encontrado.');
  end if;
  if v_pedido.estado in ('cancelado', 'pronto', 'erro') then
    return jsonb_build_object('ok', true, 'cancelado', v_pedido.estado = 'cancelado', 'estado', v_pedido.estado);
  end if;
  if p_estado not in ('renderizando', 'pronto', 'erro', 'esperando') then
    return jsonb_build_object('ok', false, 'motivo', 'Estado desconhecido.');
  end if;
  if pg_column_size(coalesce(p_andamento, '{}'::jsonb)) > 500000 then
    return jsonb_build_object('ok', false, 'motivo', 'O andamento é grande demais.');
  end if;
  update public.pedidos_de_renderizacao set estado = p_estado, andamento = coalesce(p_andamento, andamento),
         texto = left(p_texto, 500),
         terminou_em = case when p_estado in ('pronto', 'erro') then now() else null end
   where id = p_pedido;
  return jsonb_build_object('ok', true, 'cancelado', false, 'estado', p_estado);
end $$;
revoke execute on function public.renderizacao_andamento(uuid, text, jsonb, text) from public, anon;
grant execute on function public.renderizacao_andamento(uuid, text, jsonb, text) to authenticated;

-- A FILA da máquina, na tela de espera: os que esperam (na ordem) e os que terminaram hoje.
create or replace function public.renderizador_fila(p_computador text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
  v_id uuid;
begin
  if v_quem is null then
    raise exception 'sem conta';
  end if;
  v_id := public.renderizador_de(v_quem, p_computador);
  if v_id is null then
    return jsonb_build_object('ok', true, 'fila', '[]'::jsonb, 'hoje', '[]'::jsonb);
  end if;
  return jsonb_build_object('ok', true,
    'fila', (select coalesce(jsonb_agg(public.pedido_de_renderizacao_json(p) order by p.criado_em), '[]'::jsonb)
               from public.pedidos_de_renderizacao p where p.renderizador_id = v_id and p.estado = 'esperando'),
    'hoje', (select coalesce(jsonb_agg(public.pedido_de_renderizacao_json(p) order by p.terminou_em desc), '[]'::jsonb)
               from public.pedidos_de_renderizacao p where p.renderizador_id = v_id and p.estado in ('pronto', 'erro')
                and p.terminou_em > now() - interval '18 hours'));
end $$;
revoke execute on function public.renderizador_fila(text) from public, anon;
grant execute on function public.renderizador_fila(text) to authenticated;

-- ------------------------------------------------------------------------------------------------ para quem pede
-- As máquinas dos escritórios de quem chama, com o estado (sem sinal há 2 minutos, 'sem sinal'), o que elas têm, o pedido de agora e
-- quanto há na fila de cada uma (os segundos estimados lá), para o EXPORTAR mostrar quando cada uma fica livre.
create or replace function public.renderizadores_do_escritorio() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
begin
  if v_quem is null then
    raise exception 'sem conta';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'nome', r.nome, 'computador', r.computador,
      'estado', case when r.visto_em < now() - interval '2 minutes' then 'sem sinal' else r.estado end,
      'vistoEm', r.visto_em, 'info', r.info, 'agora', r.agora,
      'naFila', (select count(*) from public.pedidos_de_renderizacao p where p.renderizador_id = r.id and p.estado = 'esperando'),
      'filaSegundos', (select coalesce(sum(p.segundos), 0) from public.pedidos_de_renderizacao p
                         where p.renderizador_id = r.id and p.estado = 'esperando'),
      'escritorio', public.nome_do_escritorio(r.escritorio_id))
      order by r.nome), '[]'::jsonb)
    from public.renderizadores r
   where r.escritorio_id in (select public.escritorios_de(v_quem)) and r.estado <> 'desligado');
end $$;
revoke execute on function public.renderizadores_do_escritorio() from public, anon;
grant execute on function public.renderizadores_do_escritorio() to authenticated;

-- PEDIR: o pedido entra na fila da máquina escolhida (de um escritório de quem pede, e não desligada). Devolve a posição na fila.
create or replace function public.renderizacao_pedir(p_renderizador uuid, p_projeto text, p_caminho text, p_identidade text,
  p_pedido jsonb, p_quantos int, p_segundos numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
  v_maquina public.renderizadores;
  v_id uuid;
begin
  if v_quem is null then
    raise exception 'sem conta';
  end if;
  select * into v_maquina from public.renderizadores where id = p_renderizador;
  if not found or v_maquina.escritorio_id not in (select public.escritorios_de(v_quem)) then
    return jsonb_build_object('ok', false, 'motivo', 'Esse computador de renderização não é do seu escritório.');
  end if;
  if v_maquina.estado = 'desligado' then
    return jsonb_build_object('ok', false, 'motivo', 'Esse computador saiu do modo de renderização.');
  end if;
  if coalesce(btrim(p_projeto), '') = '' or coalesce(btrim(p_caminho), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'O pedido veio sem o projeto.');
  end if;
  if p_pedido is null or jsonb_typeof(p_pedido) <> 'object' or pg_column_size(p_pedido) > 500000 then
    return jsonb_build_object('ok', false, 'motivo', 'O pedido veio sem os itens.');
  end if;
  if (select count(*) from public.pedidos_de_renderizacao p where p.renderizador_id = p_renderizador and p.estado = 'esperando') >= 30 then
    return jsonb_build_object('ok', false, 'motivo', 'A fila desse computador está cheia (30 pedidos).');
  end if;
  insert into public.pedidos_de_renderizacao (escritorio_id, renderizador_id, quem_pediu, projeto, caminho, identidade, pedido, quantos, segundos)
  values (v_maquina.escritorio_id, p_renderizador, v_quem, left(btrim(p_projeto), 200), left(p_caminho, 1000), left(p_identidade, 80),
          p_pedido, greatest(coalesce(p_quantos, 0), 0), greatest(coalesce(p_segundos, 0), 0))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'maquina', v_maquina.nome,
    'posicao', (select count(*) from public.pedidos_de_renderizacao p where p.renderizador_id = p_renderizador
                  and p.estado in ('esperando', 'renderizando')));
end $$;
revoke execute on function public.renderizacao_pedir(uuid, text, text, text, jsonb, int, numeric) from public, anon;
grant execute on function public.renderizacao_pedir(uuid, text, text, text, jsonb, int, numeric) to authenticated;

-- MEUS PEDIDOS: os que esperam ou renderizam, e os que terminaram nos últimos 3 dias (o aviso do fim aparece quando o programa abre).
create or replace function public.renderizacao_meus_pedidos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
begin
  if v_quem is null then
    raise exception 'sem conta';
  end if;
  return (select coalesce(jsonb_agg(public.pedido_de_renderizacao_json(p) order by p.criado_em desc), '[]'::jsonb)
    from public.pedidos_de_renderizacao p
   where p.quem_pediu = v_quem and (p.estado in ('esperando', 'renderizando') or p.terminou_em > now() - interval '3 days'));
end $$;
revoke execute on function public.renderizacao_meus_pedidos() from public, anon;
grant execute on function public.renderizacao_meus_pedidos() to authenticated;

-- CANCELAR O PEDIDO: quem pediu cancela o seu; o responsável do escritório cancela qualquer um (pergunta 10 do mockup).
create or replace function public.renderizacao_cancelar(p_pedido uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quem uuid := (select auth.uid());
  v_pedido public.pedidos_de_renderizacao;
begin
  if v_quem is null then
    raise exception 'sem conta';
  end if;
  select * into v_pedido from public.pedidos_de_renderizacao where id = p_pedido;
  if not found or (v_pedido.quem_pediu <> v_quem and v_pedido.escritorio_id <> v_quem) then
    return jsonb_build_object('ok', false, 'motivo', 'Só quem pediu, ou o responsável do escritório, cancela o pedido.');
  end if;
  if v_pedido.estado not in ('esperando', 'renderizando') then
    return jsonb_build_object('ok', false, 'motivo', 'O pedido já terminou.');
  end if;
  update public.pedidos_de_renderizacao set estado = 'cancelado', terminou_em = now(), texto = 'Cancelado por quem pediu.'
   where id = p_pedido;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.renderizacao_cancelar(uuid) from public, anon;
grant execute on function public.renderizacao_cancelar(uuid) to authenticated;
