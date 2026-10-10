-- Arquionie™: os tours no link (mockup docs/mockups/tour-no-link.html do repositório do programa, aprovado por ÊDI em
-- 10/10/2026). O programa publica o tour de um passeio pela conta; o cliente abre arquionie.com.br/t/CODIGO sem conta;
-- MINHA CONTA › TOURS lista, copia o link, pausa, reativa e exclui. Rodar uma vez no SQL Editor do projeto arquionie,
-- depois da 20261005010000_licencas_e_conexao_pelo_navegador.sql. Pode rodar duas vezes sem estragar nada.
--
-- As decisões de ÊDI (10/10/2026): o código de 6 letras e números, sem senha; gerar de novo o mesmo passeio troca o
-- conteúdo no mesmo link; o tour entra no plano PRO e no EQUIPE, até 20 publicados por conta (os pausados contam), e
-- durante o lançamento fica liberado para todos; as visitas contadas sem guardar nada de quem abriu; sem prazo.
--
-- Os arquivos ficam no R2, no bucket arquionie-tours (separado do dos downloads do programa: a chave da função só alcança os
-- tours), em tours/CODIGO-PASTA/vN/: a PASTA é sorteada e só sai do banco
-- enquanto o tour está publicado, então o tour pausado não se abre nem por quem guardou o endereço dos arquivos.
--
-- Quem chama o quê:
--   página do tour (sem conta) ... tour_abrir
--   site (pessoa com conta) ...... meus_tours, tour_pausar
--   função tours (do servidor) ... tour_enviar, tour_prefixo, tour_concluir, tour_excluir — só com a chave secreta.

-- ------------------------------------------------------------------------------------------------ ajustes
create table if not exists public.ajustes_tours (
  id boolean primary key default true check (id),
  limite int not null default 20 check (limite between 1 and 1000),
  livres_no_lancamento boolean not null default true
);

insert into public.ajustes_tours (id) values (true) on conflict (id) do nothing;

alter table public.ajustes_tours enable row level security;

-- ------------------------------------------------------------------------------------------------ tours
create table if not exists public.tours (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{6}$'),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  -- O passeio de origem (o projeto e o passeio, como o programa os identifica): gerar de novo o mesmo troca o conteúdo.
  chave text not null check (length(chave) between 1 and 200),
  nome text not null check (length(nome) between 1 and 200),
  passeio text not null default '' check (length(passeio) <= 200),
  pasta text not null check (pasta ~ '^[a-z0-9]{16}$'),
  versao int not null default 0,          -- a publicada (0: ainda nenhuma)
  enviando int,                           -- a que está subindo
  situacao text not null default 'enviando' check (situacao in ('enviando', 'publicado', 'pausado')),
  paradas int not null default 0,
  tamanho bigint not null default 0,
  visitas int not null default 0,
  ultima_visita timestamptz,
  publicado_em timestamptz,
  atualizado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (usuario_id, chave)
);

create index if not exists tours_usuario on public.tours (usuario_id);

alter table public.tours enable row level security;
-- Ninguém lê nem escreve a tabela direto: só pelas funções abaixo.

-- ------------------------------------------------------------------------------------------------ a página do tour
-- O que a página /t/CODIGO precisa: publicado, a pasta dos arquivos (e conta a visita); pausado ou inexistente, só isso.
create or replace function public.tour_abrir(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tours;
begin
  select * into t from public.tours where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found or t.versao = 0 then
    return jsonb_build_object('situacao', 'inexistente');
  end if;
  if t.situacao = 'pausado' then
    return jsonb_build_object('situacao', 'pausado', 'nome', t.nome);
  end if;
  update public.tours set visitas = visitas + 1, ultima_visita = now() where id = t.id;
  return jsonb_build_object('situacao', 'publicado', 'nome', t.nome, 'passeio', t.passeio,
    'pasta', format('tours/%s-%s/v%s/', t.codigo, t.pasta, t.versao));
end $$;

-- ------------------------------------------------------------------------------------------------ a conta
create or replace function public.meus_tours() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  return jsonb_build_object(
    'limite', coalesce((select limite from public.ajustes_tours where id), 20),
    'tours', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id, 'codigo', t.codigo, 'chave', t.chave, 'nome', t.nome, 'passeio', t.passeio, 'situacao', t.situacao,
                'paradas', t.paradas, 'tamanho', t.tamanho, 'visitas', t.visitas, 'ultimaVisita', t.ultima_visita,
                'publicadoEm', t.publicado_em, 'atualizadoEm', t.atualizado_em,
                'capa', case when t.versao > 0 then format('tours/%s-%s/v%s/capa.jpg', t.codigo, t.pasta, t.versao) end)
              order by coalesce(t.atualizado_em, t.criado_em) desc), '[]'::jsonb)
              from public.tours t where t.usuario_id = v_usuario and t.versao > 0)
  );
end $$;

-- PAUSAR tira do ar na hora; REATIVAR volta com o mesmo link.
create or replace function public.tour_pausar(p_id uuid, p_pausar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  update public.tours set situacao = case when p_pausar then 'pausado' else 'publicado' end
   where id = p_id and usuario_id = v_usuario and versao > 0;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Tour não encontrado.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------------------------------------ a função tours
-- ENVIAR: o programa vai subir uma versão do tour do passeio (p_chave). Confere o plano e o limite, acha o tour do mesmo
-- passeio (o link continua) ou cria um com código novo, e reserva a versão seguinte.
create or replace function public.tour_enviar(p_usuario uuid, p_chave text, p_nome text, p_passeio text, p_codigo text, p_pasta text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.ajustes_tours;
  l public.licencas;
  t public.tours;
  v_publicados int;
begin
  select * into a from public.ajustes_tours where id;
  l := public.licenca_em_uso(p_usuario, 'arquionie');
  if not coalesce(a.livres_no_lancamento, true) and (l.id is null or l.plano not in ('pro', 'equipe')) then
    return jsonb_build_object('ok', false, 'motivo', 'plano', 'texto', 'O tour no link faz parte do plano PRO do Arquionie.');
  end if;
  select * into t from public.tours where usuario_id = p_usuario and chave = p_chave;
  if not found then
    select count(*) into v_publicados from public.tours where usuario_id = p_usuario and versao > 0;
    if v_publicados >= coalesce(a.limite, 20) then
      return jsonb_build_object('ok', false, 'motivo', 'limite',
        'texto', format('A conta já tem %s tours publicados, o limite do plano. Exclua um em MINHA CONTA › TOURS.', v_publicados));
    end if;
    insert into public.tours (codigo, usuario_id, chave, nome, passeio, pasta)
    values (upper(p_codigo), p_usuario, p_chave, p_nome, coalesce(p_passeio, ''), p_pasta)
    returning * into t;
  end if;
  update public.tours set enviando = t.versao + 1, nome = p_nome, passeio = coalesce(p_passeio, '')
   where id = t.id returning * into t;
  return jsonb_build_object('ok', true, 'id', t.id, 'codigo', t.codigo, 'versao', t.enviando,
    'prefixo', format('tours/%s-%s/', t.codigo, t.pasta), 'anterior', case when t.versao > 0 then t.versao end);
end $$;

-- A pasta do tour no R2, para a função conferir o que subiu e apagar as versões velhas (só o dono).
create or replace function public.tour_prefixo(p_usuario uuid, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  t public.tours;
begin
  select * into t from public.tours where id = p_id and usuario_id = p_usuario;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Tour não encontrado.');
  end if;
  return jsonb_build_object('ok', true, 'id', t.id, 'prefixo', format('tours/%s-%s/', t.codigo, t.pasta));
end $$;

-- CONCLUIR: a versão subiu inteira; passa a ser a publicada (o pausado continua pausado, com o conteúdo novo).
create or replace function public.tour_concluir(p_usuario uuid, p_id uuid, p_versao int, p_paradas int, p_tamanho bigint)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tours;
begin
  update public.tours
     set versao = p_versao, enviando = null, paradas = coalesce(p_paradas, 0), tamanho = coalesce(p_tamanho, 0),
         situacao = case when situacao = 'pausado' then 'pausado' else 'publicado' end,
         publicado_em = coalesce(publicado_em, now()), atualizado_em = now()
   where id = p_id and usuario_id = p_usuario and enviando = p_versao
  returning * into t;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Este envio não é mais o esperado: gere o tour de novo.');
  end if;
  return jsonb_build_object('ok', true, 'codigo', t.codigo, 'situacao', t.situacao);
end $$;

-- EXCLUIR: some do banco; a função apaga os arquivos do prefixo devolvido.
create or replace function public.tour_excluir(p_usuario uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tours;
begin
  delete from public.tours where id = p_id and usuario_id = p_usuario returning * into t;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Tour não encontrado.');
  end if;
  return jsonb_build_object('ok', true, 'prefixo', format('tours/%s-%s/', t.codigo, t.pasta));
end $$;

-- ------------------------------------------------------------------------------------------------ quem pode chamar
revoke execute on function public.tour_abrir(text) from public;
grant execute on function public.tour_abrir(text) to anon, authenticated;
revoke execute on function public.meus_tours() from public, anon;
grant execute on function public.meus_tours() to authenticated;
revoke execute on function public.tour_pausar(uuid, boolean) from public, anon;
grant execute on function public.tour_pausar(uuid, boolean) to authenticated;
revoke execute on function public.tour_enviar(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.tour_enviar(uuid, text, text, text, text, text) to service_role;
revoke execute on function public.tour_prefixo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tour_prefixo(uuid, uuid) to service_role;
revoke execute on function public.tour_concluir(uuid, uuid, int, int, bigint) from public, anon, authenticated;
grant execute on function public.tour_concluir(uuid, uuid, int, int, bigint) to service_role;
revoke execute on function public.tour_excluir(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tour_excluir(uuid, uuid) to service_role;
