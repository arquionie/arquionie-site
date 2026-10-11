-- Arquionie™: o ENVIAR PARA O CLIENTE e a página do cliente (mockup docs/mockups/enviar-para-o-cliente.html do repositório do
-- programa, aprovado por ÊDI em 11/10/2026; contrato no doc 65 de lá). O programa publica o vídeo, o tour e as imagens de um projeto
-- pela conta; o cliente abre arquionie.com.br/t/CODIGO sem conta, solicita ajustes (os comentários juntos) ou aprova pelo termo do
-- escritório; o programa lê as respostas; o sistema Palheta lê a situação. Rodar uma vez no SQL Editor do projeto arquionie, depois
-- da 20261010000000_tours.sql. Pode rodar duas vezes sem estragar nada.
--
-- As decisões de ÊDI (11/10/2026): o mesmo link a cada envio do projeto (a página mostra o mais novo; os de antes ficam só no
-- histórico do escritório); sem senha, com o código de 6 sinais; um ano no ar, mudável no envio; comentar é pedir ajuste e aprovar é
-- quando não há mais o que ajustar (dois caminhos); o termo de aprovação é do escritório (o de fábrica, o da Palheta); a identidade do
-- escritório fica na conta e vale em todas as páginas.
--
-- Os arquivos ficam no R2, no bucket arquionie-tours, em apresentacoes/CODIGO-PASTA/arquivos/IMPRESSAO.ext: o nome é a impressão
-- digital (SHA-256) do conteúdo, então o que não mudou de um envio para o outro não sobe de novo, e um envio só troca a página quando
-- o envio.json dele (também pela impressão) é publicado no banco. A PASTA é sorteada e só sai do banco com a apresentação no ar.
--
-- Quem chama o quê:
--   página do cliente (sem conta) ....... apresentacao_abrir
--   sistema Palheta (sem conta) .......... apresentacao_situacao
--   função cliente (do servidor) ......... apresentacao_comentar, apresentacao_aprovar — só com a chave secreta
--   programa e site (pessoa com conta) ... minhas_apresentacoes, apresentacao_respostas, apresentacao_marcar_lidas,
--                                          apresentacao_pausar, apresentacao_desfazer_aprovacao, meu_escritorio, gravar_escritorio
--   função apresentacoes (do servidor) ... apresentacao_enviar, apresentacao_concluir, apresentacao_excluir, apresentacao_vencidas,
--                                          escritorio_pasta, escritorio_logo — só com a chave secreta

-- ------------------------------------------------------------------------------------------------ ajustes
create table if not exists public.ajustes_apresentacoes (
  id boolean primary key default true check (id),
  limite int not null default 500 check (limite between 1 and 100000),      -- projetos com apresentação por conta
  livres_no_lancamento boolean not null default true,
  prazo_padrao int not null default 365 check (prazo_padrao between 30 and 1095)   -- dias no ar (ÊDI: um ano)
);
insert into public.ajustes_apresentacoes (id) values (true) on conflict (id) do nothing;
alter table public.ajustes_apresentacoes enable row level security;

-- ------------------------------------------------------------------------------------------------ o escritório
-- A identidade que vai em toda página da conta (o alto e o rodapé) e o termo de aprovação. O termo nulo é o de fábrica (o da Palheta).
create table if not exists public.escritorios (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '' check (length(nome) <= 120),
  frase text not null default '' check (length(frase) <= 160),
  titulo text not null default '' check (length(titulo) <= 160),
  texto text not null default '' check (length(texto) <= 2000),
  site text not null default '' check (length(site) <= 200),
  redes jsonb not null default '[]'::jsonb check (jsonb_typeof(redes) = 'array' and jsonb_array_length(redes) <= 12),
  cor text not null default '#E76353' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  pasta text check (pasta ~ '^[a-z0-9]{16}$'),         -- a pasta do logo no R2, sorteada na primeira vez
  logo text check (logo ~ '^escritorios/[a-z0-9]{16}/logo-[0-9]+\.(png|svg|jpg)$'),
  termo jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.escritorios enable row level security;

-- O termo de fábrica: o da Palheta (o do WhatsApp do escritório, que ÊDI mandou em 11/10/2026).
create or replace function public.termo_de_fabrica() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'titulo', 'APROVAÇÃO DA PROPOSTA',
    'abertura', 'Para dar continuidade em seu projeto precisamos que você confirme que está de acordo com os itens abaixo:',
    'itens', jsonb_build_array(
      'A proposta apresentada contempla todas as necessidades apresentadas nas reuniões e nos formulários.',
      'As expectativas plásticas e arquitetônicas foram atendidas.',
      'As soluções apresentadas estão claras e compreensíveis.'),
    'pergunta', 'Você concorda e aprova a proposta como está?')
$$;

-- A identidade como a página a mostra (o termo de fábrica no lugar do vazio).
create or replace function public.identidade_do_escritorio(p_usuario uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('nome', e.nome, 'frase', e.frase, 'titulo', e.titulo, 'texto', e.texto, 'site', e.site,
      'redes', e.redes, 'cor', e.cor, 'logo', e.logo, 'termo', coalesce(e.termo, public.termo_de_fabrica()))
    from public.escritorios e where e.usuario_id = p_usuario),
    jsonb_build_object('nome', '', 'frase', '', 'titulo', '', 'texto', '', 'site', '', 'redes', '[]'::jsonb, 'cor', '#E76353',
      'logo', null, 'termo', public.termo_de_fabrica()))
$$;

-- ------------------------------------------------------------------------------------------------ as apresentações
-- Uma por projeto da conta: o link (o código), a pasta, o envio publicado e o que está subindo.
create table if not exists public.apresentacoes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{6}$'),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  chave text not null check (length(chave) between 1 and 200),     -- o projeto, como o programa o identifica
  nome text not null check (length(nome) between 1 and 200),
  pasta text not null check (pasta ~ '^[a-z0-9]{16}$'),
  pausada boolean not null default false,
  envio int not null default 0,          -- o número do envio publicado (0: ainda nenhum)
  visitas int not null default 0,
  ultima_visita timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz,
  unique (usuario_id, chave)
);
create index if not exists apresentacoes_usuario on public.apresentacoes (usuario_id);
alter table public.apresentacoes enable row level security;

-- Cada envio: a fase da página, para quem, o que mudou, até quando fica no ar, o envio.json e as impressões dos arquivos.
create table if not exists public.envios_apresentacao (
  id uuid primary key default gen_random_uuid(),
  apresentacao_id uuid not null references public.apresentacoes (id) on delete cascade,
  numero int not null,
  fase text not null default 'aprovacao' check (fase in ('aprovacao', 'final')),
  para_quem text not null default '' check (length(para_quem) <= 200),
  mudancas text not null default '' check (length(mudancas) <= 2000),
  expira_em timestamptz not null,
  manifesto text check (manifesto ~ '^[0-9a-f]{64}\.json$'),
  arquivos text[] not null default '{}',
  tamanho bigint not null default 0,
  situacao text not null default 'enviando' check (situacao in ('enviando', 'aguardando', 'ajustes', 'aprovado', 'expirado')),
  visitas int not null default 0,
  publicado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (apresentacao_id, numero)
);
alter table public.envios_apresentacao enable row level security;

-- O pedido de ajustes: quem pediu e os comentários enviados juntos, cada um com o lugar no tour (o pavimento, o ponto e a vista).
create table if not exists public.pedidos_de_ajuste (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null references public.envios_apresentacao (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 120),
  comentarios jsonb not null check (jsonb_typeof(comentarios) = 'array'),
  criado_em timestamptz not null default now(),
  lido_em timestamptz
);
create index if not exists pedidos_envio on public.pedidos_de_ajuste (envio_id);
alter table public.pedidos_de_ajuste enable row level security;

-- A aprovação: quem aprovou e o termo como estava (o texto e os itens marcados). O escritório pode desfazer (um engano).
create table if not exists public.aprovacoes (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null references public.envios_apresentacao (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 120),
  termo jsonb not null,
  criado_em timestamptz not null default now(),
  desfeita_em timestamptz,
  lido_em timestamptz
);
create index if not exists aprovacoes_envio on public.aprovacoes (envio_id);
alter table public.aprovacoes enable row level security;
-- Ninguém lê nem escreve as tabelas direto: só pelas funções abaixo.

-- ------------------------------------------------------------------------------------------------ a página do cliente
-- O que a página /t/CODIGO precisa: o envio publicado (a fase, a data, o prazo, a situação, os comentários e a aprovação), o
-- envio.json e a identidade do escritório; conta a visita. Pausada, vencida ou inexistente, só isso (com a marca do escritório).
create or replace function public.apresentacao_abrir(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.apresentacoes;
  e public.envios_apresentacao;
  v_escritorio jsonb;
  v_aprovacao jsonb;
begin
  select * into a from public.apresentacoes where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found or a.envio = 0 then
    return jsonb_build_object('situacao', 'inexistente');
  end if;
  v_escritorio := public.identidade_do_escritorio(a.usuario_id);
  if a.pausada then
    return jsonb_build_object('situacao', 'pausado', 'nome', a.nome, 'escritorio', v_escritorio - 'termo');
  end if;
  select * into e from public.envios_apresentacao where apresentacao_id = a.id and numero = a.envio;
  if e.situacao = 'expirado' or e.expira_em < now() then
    return jsonb_build_object('situacao', 'expirado', 'nome', a.nome, 'escritorio', v_escritorio - 'termo');
  end if;
  update public.apresentacoes set visitas = visitas + 1, ultima_visita = now() where id = a.id;
  update public.envios_apresentacao set visitas = visitas + 1 where id = e.id;
  select jsonb_build_object('nome', p.nome, 'em', p.criado_em) into v_aprovacao
    from public.aprovacoes p where p.envio_id = e.id and p.desfeita_em is null order by p.criado_em desc limit 1;
  return jsonb_build_object(
    'situacao', 'publicado', 'codigo', a.codigo, 'nome', a.nome,
    'arquivos', format('apresentacoes/%s-%s/arquivos/', a.codigo, a.pasta),
    'envio', jsonb_build_object('numero', e.numero, 'fase', e.fase, 'em', e.publicado_em, 'expiraEm', e.expira_em,
      'situacao', e.situacao, 'manifesto', e.manifesto, 'aprovacao', v_aprovacao,
      'pedidos', (select coalesce(jsonb_agg(jsonb_build_object('nome', d.nome, 'em', d.criado_em, 'comentarios', d.comentarios)
                    order by d.criado_em), '[]'::jsonb) from public.pedidos_de_ajuste d where d.envio_id = e.id)),
    'escritorio', v_escritorio);
end $$;

-- A situação para o sistema Palheta (a etiqueta), sem contar visita: o contrato do doc 65 do repositório do programa.
create or replace function public.apresentacao_situacao(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.apresentacoes;
  e public.envios_apresentacao;
  p public.aprovacoes;
begin
  select * into a from public.apresentacoes where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found or a.envio = 0 then
    return jsonb_build_object('situacao', 'inexistente');
  end if;
  select * into e from public.envios_apresentacao where apresentacao_id = a.id and numero = a.envio;
  select * into p from public.aprovacoes where envio_id = e.id and desfeita_em is null order by criado_em desc limit 1;
  return jsonb_build_object(
    'situacao', case when a.pausada then 'pausado' when e.situacao = 'expirado' or e.expira_em < now() then 'expirado' else e.situacao end,
    'fase', e.fase, 'envio', e.numero, 'enviadoEm', e.publicado_em,
    'comentarios', (select coalesce(sum(jsonb_array_length(d.comentarios)), 0) from public.pedidos_de_ajuste d where d.envio_id = e.id),
    'aprovadoPor', p.nome, 'aprovadoEm', p.criado_em, 'expiraEm', e.expira_em);
end $$;

-- O envio de agora, se aceita resposta do cliente (publicado, no ar, em aprovação e ainda não aprovado). Para as duas abaixo.
create or replace function public.envio_que_responde(p_codigo text, p_numero int) returns public.envios_apresentacao
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.apresentacoes;
  e public.envios_apresentacao;
begin
  select * into a from public.apresentacoes where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found or a.pausada or a.envio = 0 or a.envio <> p_numero then
    return null;
  end if;
  select * into e from public.envios_apresentacao where apresentacao_id = a.id and numero = a.envio;
  if e.fase <> 'aprovacao' or e.situacao in ('aprovado', 'expirado', 'enviando') or e.expira_em < now() then
    return null;
  end if;
  return e;
end $$;

-- SOLICITAR AJUSTES: o nome e os comentários juntos (1 a 50, cada um com o texto e o lugar). Devolve o que o aviso ao escritório
-- precisa (o e-mail da conta, o projeto, o link).
create or replace function public.apresentacao_comentar(p_codigo text, p_numero int, p_nome text, p_comentarios jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.envios_apresentacao;
  a public.apresentacoes;
  c jsonb;
  v_lista jsonb := '[]'::jsonb;
  v_nome text := btrim(coalesce(p_nome, ''));
begin
  e := public.envio_que_responde(p_codigo, p_numero);
  if e.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'Este envio não recebe mais comentários. Recarregue a página.');
  end if;
  if length(v_nome) < 1 or length(v_nome) > 120 then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva o seu nome.');
  end if;
  if jsonb_typeof(p_comentarios) <> 'array' or jsonb_array_length(p_comentarios) < 1 or jsonb_array_length(p_comentarios) > 50 then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva de 1 a 50 comentários.');
  end if;
  if (select count(*) from public.pedidos_de_ajuste where envio_id = e.id) >= 200 then
    return jsonb_build_object('ok', false, 'motivo', 'Este envio já recebeu muitos pedidos. Fale com o escritório.');
  end if;
  for c in select * from jsonb_array_elements(p_comentarios) loop
    if length(btrim(coalesce(c ->> 'texto', ''))) not between 1 and 2000 then
      return jsonb_build_object('ok', false, 'motivo', 'Cada comentário precisa de um texto (até 2.000 letras).');
    end if;
    if c ? 'lugar' and (jsonb_typeof(c -> 'lugar') <> 'object' or length((c -> 'lugar')::text) > 4000) then
      return jsonb_build_object('ok', false, 'motivo', 'O lugar de um comentário veio errado. Recarregue a página.');
    end if;
    v_lista := v_lista || jsonb_build_array(jsonb_build_object('texto', btrim(c ->> 'texto'), 'lugar', c -> 'lugar'));
  end loop;
  insert into public.pedidos_de_ajuste (envio_id, nome, comentarios) values (e.id, v_nome, v_lista);
  update public.envios_apresentacao set situacao = 'ajustes' where id = e.id;
  select * into a from public.apresentacoes where id = e.apresentacao_id;
  return jsonb_build_object('ok', true, 'situacao', 'ajustes',
    'aviso', jsonb_build_object('email', (select u.email from auth.users u where u.id = a.usuario_id), 'projeto', a.nome,
      'codigo', a.codigo, 'envio', e.numero, 'nome', v_nome, 'comentarios', v_lista));
end $$;

-- APROVAR O PROJETO: o nome e os itens do termo marcados (todos). O termo fica guardado como estava.
create or replace function public.apresentacao_aprovar(p_codigo text, p_numero int, p_nome text, p_itens jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.envios_apresentacao;
  a public.apresentacoes;
  v_termo jsonb;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_em timestamptz := now();
begin
  e := public.envio_que_responde(p_codigo, p_numero);
  if e.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'Este envio não pode mais ser aprovado. Recarregue a página.');
  end if;
  if length(v_nome) < 1 or length(v_nome) > 120 then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva o seu nome.');
  end if;
  select * into a from public.apresentacoes where id = e.apresentacao_id;
  v_termo := public.identidade_do_escritorio(a.usuario_id) -> 'termo';
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) <> jsonb_array_length(v_termo -> 'itens')
     or exists (select 1 from jsonb_array_elements(p_itens) i where i <> 'true'::jsonb) then
    return jsonb_build_object('ok', false, 'motivo', 'Marque todos os itens do termo para aprovar.');
  end if;
  insert into public.aprovacoes (envio_id, nome, termo, criado_em) values (e.id, v_nome, v_termo, v_em);
  update public.envios_apresentacao set situacao = 'aprovado' where id = e.id;
  return jsonb_build_object('ok', true, 'situacao', 'aprovado', 'em', v_em,
    'aviso', jsonb_build_object('email', (select u.email from auth.users u where u.id = a.usuario_id), 'projeto', a.nome,
      'codigo', a.codigo, 'envio', e.numero, 'nome', v_nome, 'termo', v_termo));
end $$;

-- ------------------------------------------------------------------------------------------------ a conta (o programa e o site)
create or replace function public.minhas_apresentacoes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  return jsonb_build_object(
    'limite', coalesce((select limite from public.ajustes_apresentacoes where id), 500),
    'apresentacoes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'codigo', a.codigo, 'chave', a.chave, 'nome', a.nome, 'pausada', a.pausada, 'envio', a.envio,
        'visitas', a.visitas, 'ultimaVisita', a.ultima_visita,
        'envios', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', e.id, 'numero', e.numero, 'fase', e.fase, 'paraQuem', e.para_quem, 'mudancas', e.mudancas, 'em', e.publicado_em,
            'expiraEm', e.expira_em, 'situacao', case when e.situacao <> 'expirado' and e.expira_em < now() then 'expirado' else e.situacao end,
            'visitas', e.visitas, 'tamanho', e.tamanho,
            'comentarios', (select coalesce(sum(jsonb_array_length(d.comentarios)), 0) from public.pedidos_de_ajuste d where d.envio_id = e.id))
            order by e.numero desc), '[]'::jsonb)
            from public.envios_apresentacao e where e.apresentacao_id = a.id and e.situacao <> 'enviando'))
        order by coalesce(a.atualizado_em, a.criado_em) desc), '[]'::jsonb)
      from public.apresentacoes a where a.usuario_id = v_usuario and a.envio > 0)
  );
end $$;

-- As respostas dos clientes desde um instante (o programa pergunta ao abrir o projeto e de tempos em tempos): os pedidos de ajuste e
-- as aprovações das apresentações da conta, com o código e o número do envio.
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
        'nome', d.nome, 'em', d.criado_em, 'comentarios', d.comentarios, 'lido', d.lido_em is not null) order by d.criado_em), '[]'::jsonb)
      from public.pedidos_de_ajuste d join public.envios_apresentacao e on e.id = d.envio_id join public.apresentacoes a on a.id = e.apresentacao_id
      where a.usuario_id = v_usuario and d.criado_em > coalesce(p_desde, '-infinity'::timestamptz)),
    'aprovacoes', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'codigo', a.codigo, 'chave', a.chave, 'envio', e.numero,
        'nome', p.nome, 'em', p.criado_em, 'termo', p.termo, 'desfeita', p.desfeita_em, 'lido', p.lido_em is not null) order by p.criado_em), '[]'::jsonb)
      from public.aprovacoes p join public.envios_apresentacao e on e.id = p.envio_id join public.apresentacoes a on a.id = e.apresentacao_id
      where a.usuario_id = v_usuario and (p.criado_em > coalesce(p_desde, '-infinity'::timestamptz)
        or p.desfeita_em > coalesce(p_desde, '-infinity'::timestamptz))));
end $$;

-- O programa marca como lidos os pedidos e as aprovações que já mostrou (o aviso não volta).
create or replace function public.apresentacao_marcar_lidas(p_lista jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  p_ids uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_lista, '[]'::jsonb)) x);
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  update public.pedidos_de_ajuste d set lido_em = now()
    from public.envios_apresentacao e join public.apresentacoes a on a.id = e.apresentacao_id
   where d.id = any (p_ids) and d.envio_id = e.id and a.usuario_id = v_usuario and d.lido_em is null;
  update public.aprovacoes p set lido_em = now()
    from public.envios_apresentacao e join public.apresentacoes a on a.id = e.apresentacao_id
   where p.id = any (p_ids) and p.envio_id = e.id and a.usuario_id = v_usuario and p.lido_em is null;
  return jsonb_build_object('ok', true);
end $$;

-- PAUSAR tira do ar na hora; REATIVAR volta com o mesmo link.
create or replace function public.apresentacao_pausar(p_id uuid, p_pausar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.apresentacoes set pausada = coalesce(p_pausar, false)
   where id = p_id and usuario_id = (select auth.uid()) and envio > 0;
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
   where x.id = p_id and x.envio_id = e.id and a.usuario_id = (select auth.uid()) and x.desfeita_em is null
  returning x.* into p;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Aprovação não encontrada.');
  end if;
  update public.envios_apresentacao e
     set situacao = case when exists (select 1 from public.pedidos_de_ajuste d where d.envio_id = e.id) then 'ajustes' else 'aguardando' end
   where e.id = p.envio_id and e.situacao = 'aprovado';
  return jsonb_build_object('ok', true);
end $$;

-- A identidade do escritório da conta (para CONFIGURAÇÕES › ESCRITÓRIO), com o termo de fábrica marcado.
create or replace function public.meu_escritorio() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  return public.identidade_do_escritorio(v_usuario)
    || jsonb_build_object('termoDeFabrica', not exists (select 1 from public.escritorios e where e.usuario_id = v_usuario and e.termo is not null));
end $$;

-- GRAVAR a identidade (o logo vai pela função apresentacoes). O termo nulo volta ao de fábrica.
create or replace function public.gravar_escritorio(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_termo jsonb := p -> 'termo';
  v_redes jsonb := coalesce(p -> 'redes', '[]'::jsonb);
  r jsonb;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  if jsonb_typeof(v_redes) <> 'array' or jsonb_array_length(v_redes) > 12 then
    return jsonb_build_object('ok', false, 'motivo', 'Até 12 redes.');
  end if;
  for r in select * from jsonb_array_elements(v_redes) loop
    if jsonb_typeof(r) <> 'object' or length(coalesce(r ->> 'rede', '')) not between 1 and 40 or length(coalesce(r ->> 'endereco', '')) not between 1 and 200 then
      return jsonb_build_object('ok', false, 'motivo', 'Cada rede precisa do nome e do endereço.');
    end if;
  end loop;
  if v_termo is not null and jsonb_typeof(v_termo) <> 'null' then
    if jsonb_typeof(v_termo -> 'itens') <> 'array' or jsonb_array_length(v_termo -> 'itens') not between 1 and 12
       or length(coalesce(v_termo ->> 'titulo', '')) not between 1 and 160 or length(coalesce(v_termo ->> 'pergunta', '')) not between 1 and 300
       or length(coalesce(v_termo ->> 'abertura', '')) > 1000
       or exists (select 1 from jsonb_array_elements(v_termo -> 'itens') i where jsonb_typeof(i) <> 'string' or length(i #>> '{}') not between 1 and 500) then
      return jsonb_build_object('ok', false, 'motivo', 'O termo precisa do título, de 1 a 12 itens e da pergunta.');
    end if;
    v_termo := jsonb_build_object('titulo', v_termo ->> 'titulo', 'abertura', coalesce(v_termo ->> 'abertura', ''),
      'itens', v_termo -> 'itens', 'pergunta', v_termo ->> 'pergunta');
  else
    v_termo := null;
  end if;
  if coalesce(p ->> 'cor', '#E76353') !~ '^#[0-9A-Fa-f]{6}$' then
    return jsonb_build_object('ok', false, 'motivo', 'A cor vai no formato #RRGGBB.');
  end if;
  insert into public.escritorios (usuario_id, nome, frase, titulo, texto, site, redes, cor, termo, atualizado_em)
  values (v_usuario, left(coalesce(p ->> 'nome', ''), 120), left(coalesce(p ->> 'frase', ''), 160), left(coalesce(p ->> 'titulo', ''), 160),
    left(coalesce(p ->> 'texto', ''), 2000), left(coalesce(p ->> 'site', ''), 200), v_redes, coalesce(p ->> 'cor', '#E76353'), v_termo, now())
  on conflict (usuario_id) do update set nome = excluded.nome, frase = excluded.frase, titulo = excluded.titulo, texto = excluded.texto,
    site = excluded.site, redes = excluded.redes, cor = excluded.cor, termo = excluded.termo, atualizado_em = now();
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------------------------------------ a função apresentacoes
-- ENVIAR: o programa vai subir um envio do projeto (p_chave). Confere o plano e o limite, acha a apresentação do projeto (o link
-- continua) ou cria uma com código novo, e reserva o envio seguinte (ou retoma o que estava subindo). Devolve as impressões que já
-- estão no R2 (as do envio publicado e as do que estava subindo), que não sobem de novo.
create or replace function public.apresentacao_enviar(p_usuario uuid, p_chave text, p_nome text, p_fase text, p_para_quem text,
  p_mudancas text, p_dias int, p_codigo text, p_pasta text) returns jsonb
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
      mudancas = left(coalesce(p_mudancas, ''), 2000), expira_em = now() + make_interval(days => v_dias)
     where id = e.id returning * into e;
  else
    insert into public.envios_apresentacao (apresentacao_id, numero, fase, para_quem, mudancas, expira_em)
    values (a.id, coalesce((select max(numero) from public.envios_apresentacao where apresentacao_id = a.id), 0) + 1, p_fase,
      left(coalesce(p_para_quem, ''), 200), left(coalesce(p_mudancas, ''), 2000), now() + make_interval(days => v_dias))
    returning * into e;
  end if;
  return jsonb_build_object('ok', true, 'id', a.id, 'envio', e.id, 'numero', e.numero, 'codigo', a.codigo,
    'prefixo', format('apresentacoes/%s-%s/arquivos/', a.codigo, a.pasta), 'expiraEm', e.expira_em,
    'existentes', (select coalesce(array_agg(distinct x), '{}') from public.envios_apresentacao v, unnest(v.arquivos) x
                   where v.apresentacao_id = a.id and v.numero = a.envio));
end $$;

-- A pasta da apresentação de um envio (só o dono), para a função conferir o que subiu.
create or replace function public.apresentacao_do_envio(p_usuario uuid, p_envio uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.envios_apresentacao;
  a public.apresentacoes;
begin
  select * into e from public.envios_apresentacao where id = p_envio;
  select * into a from public.apresentacoes where id = e.apresentacao_id and usuario_id = p_usuario;
  if not found or e.situacao <> 'enviando' then
    return jsonb_build_object('ok', false, 'motivo', 'Este envio não é mais o esperado: envie de novo.');
  end if;
  return jsonb_build_object('ok', true, 'prefixo', format('apresentacoes/%s-%s/arquivos/', a.codigo, a.pasta));
end $$;

-- CONCLUIR: o envio subiu inteiro (a função conferiu no R2); passa a ser o publicado, e a página troca de uma vez. Devolve as
-- impressões que mais nenhum envio usa (o anterior), para a função apagar do R2.
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
  select * into a from public.apresentacoes where id = e.apresentacao_id and usuario_id = p_usuario;
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

-- EXCLUIR: a apresentação some do banco (com os envios e as respostas); a função apaga os arquivos do prefixo devolvido.
create or replace function public.apresentacao_excluir(p_usuario uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.apresentacoes;
begin
  delete from public.apresentacoes where id = p_id and usuario_id = p_usuario returning * into a;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Apresentação não encontrada.');
  end if;
  return jsonb_build_object('ok', true, 'prefixo', format('apresentacoes/%s-%s/', a.codigo, a.pasta));
end $$;

-- VENCIDAS (a limpeza diária): o envio publicado que passou do prazo vira expirado e os arquivos dele saem do R2 (a função apaga
-- os prefixos devolvidos). A página passa a dizer que o material expirou.
create or replace function public.apresentacao_vencidas() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_prefixos jsonb;
begin
  with vencidos as (
    update public.envios_apresentacao e set situacao = 'expirado', arquivos = '{}'
      from public.apresentacoes a
     where a.id = e.apresentacao_id and e.numero = a.envio and e.expira_em < now() and e.situacao <> 'expirado'
    returning format('apresentacoes/%s-%s/', a.codigo, a.pasta) as prefixo)
  select coalesce(jsonb_agg(prefixo), '[]'::jsonb) into v_prefixos from vencidos;
  return jsonb_build_object('ok', true, 'prefixos', v_prefixos);
end $$;

-- O logo do escritório: a pasta (sorteada na primeira vez) e o número do logo seguinte; depois de subir, grava a chave e devolve a
-- de antes para apagar.
create or replace function public.escritorio_pasta(p_usuario uuid, p_pasta text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.escritorios;
begin
  insert into public.escritorios (usuario_id, pasta) values (p_usuario, p_pasta) on conflict (usuario_id) do nothing;
  update public.escritorios set pasta = coalesce(pasta, p_pasta) where usuario_id = p_usuario returning * into e;
  return jsonb_build_object('ok', true, 'pasta', e.pasta,
    'proximo', coalesce((regexp_match(coalesce(e.logo, ''), 'logo-([0-9]+)\.'))[1]::int, 0) + 1);
end $$;

create or replace function public.escritorio_logo(p_usuario uuid, p_logo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_antes text;
begin
  select logo into v_antes from public.escritorios where usuario_id = p_usuario;
  update public.escritorios set logo = p_logo, atualizado_em = now()
   where usuario_id = p_usuario and p_logo like format('escritorios/%s/logo-%%', pasta);
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'O logo não é da pasta do escritório.');
  end if;
  return jsonb_build_object('ok', true, 'apagar', v_antes);
end $$;

-- ------------------------------------------------------------------------------------------------ quem pode chamar
revoke execute on function public.termo_de_fabrica() from public;
grant execute on function public.termo_de_fabrica() to anon, authenticated, service_role;
revoke execute on function public.identidade_do_escritorio(uuid) from public, anon, authenticated;
grant execute on function public.identidade_do_escritorio(uuid) to service_role;
revoke execute on function public.apresentacao_abrir(text) from public;
grant execute on function public.apresentacao_abrir(text) to anon, authenticated;
revoke execute on function public.apresentacao_situacao(text) from public;
grant execute on function public.apresentacao_situacao(text) to anon, authenticated;
revoke execute on function public.envio_que_responde(text, int) from public, anon, authenticated;
grant execute on function public.envio_que_responde(text, int) to service_role;
revoke execute on function public.apresentacao_comentar(text, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.apresentacao_comentar(text, int, text, jsonb) to service_role;
revoke execute on function public.apresentacao_aprovar(text, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.apresentacao_aprovar(text, int, text, jsonb) to service_role;
revoke execute on function public.minhas_apresentacoes() from public, anon;
grant execute on function public.minhas_apresentacoes() to authenticated;
revoke execute on function public.apresentacao_respostas(timestamptz) from public, anon;
grant execute on function public.apresentacao_respostas(timestamptz) to authenticated;
revoke execute on function public.apresentacao_marcar_lidas(jsonb) from public, anon;
grant execute on function public.apresentacao_marcar_lidas(jsonb) to authenticated;
revoke execute on function public.apresentacao_pausar(uuid, boolean) from public, anon;
grant execute on function public.apresentacao_pausar(uuid, boolean) to authenticated;
revoke execute on function public.apresentacao_desfazer_aprovacao(uuid) from public, anon;
grant execute on function public.apresentacao_desfazer_aprovacao(uuid) to authenticated;
revoke execute on function public.meu_escritorio() from public, anon;
grant execute on function public.meu_escritorio() to authenticated;
revoke execute on function public.gravar_escritorio(jsonb) from public, anon;
grant execute on function public.gravar_escritorio(jsonb) to authenticated;
revoke execute on function public.apresentacao_enviar(uuid, text, text, text, text, text, int, text, text) from public, anon, authenticated;
grant execute on function public.apresentacao_enviar(uuid, text, text, text, text, text, int, text, text) to service_role;
revoke execute on function public.apresentacao_do_envio(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apresentacao_do_envio(uuid, uuid) to service_role;
revoke execute on function public.apresentacao_concluir(uuid, uuid, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.apresentacao_concluir(uuid, uuid, text, jsonb, bigint) to service_role;
revoke execute on function public.apresentacao_excluir(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apresentacao_excluir(uuid, uuid) to service_role;
revoke execute on function public.apresentacao_vencidas() from public, anon, authenticated;
grant execute on function public.apresentacao_vencidas() to service_role;
revoke execute on function public.escritorio_pasta(uuid, text) from public, anon, authenticated;
grant execute on function public.escritorio_pasta(uuid, text) to service_role;
revoke execute on function public.escritorio_logo(uuid, text) from public, anon, authenticated;
grant execute on function public.escritorio_logo(uuid, text) to service_role;
