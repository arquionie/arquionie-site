-- Arquionie™ — o LIMITE POR ENDEREÇO (a checagem de segurança de 22/10/2026). As portas sem conta contam os pedidos de cada endereço
-- numa janela de uma hora; passou do limite, a porta responde "limite" até a hora virar:
--   - os códigos (o link /t/ da apresentação e do tour, a situação da apresentação, o formulário e a proposta do Comercial, o aceite):
--     só os ERROS contam. Quem abre o próprio link mil vezes passa; quem tenta adivinhar códigos para depois de 30 erros, e aí nem os
--     códigos certos abrem daquele endereço (senão a diferença entre "limite" e "publicado" ainda contaria o segredo);
--   - o cupom do /comprar: também só os erros;
--   - o pedido do PRO, a denúncia de formulário: cada pedido conta;
--   - as funções do servidor sem conta (feedback do plugin, conectar computador, a resposta do cliente na página /t/) chamam
--     limite_somar com o endereço que receberam (supabase/functions/_compartilhado/limite.ts).
-- O endereço nunca fica guardado: só a impressão (SHA-256 com o sal deste banco, o IPv6 pela rede /64), e as janelas de ontem saem
-- sozinhas. Os limites ficam em ajustes_limites (mudar com um update, sem publicar nada). Pode rodar duas vezes.

create table if not exists public.ajustes_limites (
  id boolean primary key default true check (id),
  sal text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  codigo int not null default 30 check (codigo between 1 and 100000),      -- erros de código por hora
  cupom int not null default 30 check (cupom between 1 and 100000),        -- cupons errados por hora
  pedido int not null default 6 check (pedido between 1 and 100000),       -- pedidos do PRO por hora
  denuncia int not null default 5 check (denuncia between 1 and 100000),   -- denúncias de formulário por hora
  feedback int not null default 10 check (feedback between 1 and 100000),  -- feedbacks do plugin por hora
  conectar int not null default 20 check (conectar between 1 and 100000),  -- pedidos de conexão de computador por hora
  cliente int not null default 30 check (cliente between 1 and 100000)     -- respostas na página do cliente por hora
);
insert into public.ajustes_limites (id) values (true) on conflict (id) do nothing;
alter table public.ajustes_limites enable row level security;

create table if not exists public.limites (
  chave text not null,              -- a ação e a impressão do endereço ("codigo:9f2c…")
  janela timestamptz not null,      -- o começo da hora
  contagem int not null default 0,
  primary key (chave, janela)
);
alter table public.limites enable row level security;
revoke all on public.ajustes_limites, public.limites from anon, authenticated;

-- O endereço de quem chamou pelo navegador, como o Supabase passa ao banco (os cabeçalhos do pedido ao PostgREST). Nos pedidos das
-- funções do servidor quem chama o banco é a função: ela passa o endereço que recebeu.
create or replace function public.endereco_do_pedido() returns text
language plpgsql stable set search_path = '' as $$
declare
  h jsonb;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  return nullif(btrim(coalesce(h ->> 'cf-connecting-ip', split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1))), '');
end $$;

-- A impressão do endereço, com o sal deste banco. O IPv6 conta pela rede /64: um aparelho troca o fim do endereço à vontade.
create or replace function public.limite_impressao(p_endereco text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v text := btrim(coalesce(p_endereco, ''));
begin
  if v = '' then
    return null;
  end if;
  begin
    v := host(network(set_masklen(v::inet, case when family(v::inet) = 6 then 64 else 32 end)));
  exception when others then
    v := left(v, 100);
  end;
  return left(encode(sha256(convert_to((select sal from public.ajustes_limites where id) || '|' || v, 'UTF8')), 'hex'), 32);
end $$;

create or replace function public.limite_maximo(p_acao text) returns int
language plpgsql stable security definer set search_path = '' as $$
declare
  v int;
begin
  select (to_jsonb(a) ->> p_acao)::int into v from public.ajustes_limites a where id;
  if v is null then
    raise exception 'limite desconhecido: %', p_acao;
  end if;
  return v;
end $$;

-- Ainda cabe, sem somar? Sem endereço cabe sempre: o limite é contra robô, não contra quem o Supabase não identificou.
create or replace function public.limite_livre(p_acao text, p_endereco text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_quem text := public.limite_impressao(p_endereco);
begin
  if v_quem is null then
    return true;
  end if;
  return coalesce((select contagem from public.limites
                    where chave = p_acao || ':' || v_quem and janela = date_trunc('hour', now())), 0) < public.limite_maximo(p_acao);
end $$;

-- Soma um pedido e diz se ainda coube. De vez em quando, apaga as janelas de ontem.
create or replace function public.limite_somar(p_acao text, p_endereco text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_quem text := public.limite_impressao(p_endereco);
  v int;
begin
  if v_quem is null then
    return true;
  end if;
  insert into public.limites (chave, janela, contagem) values (p_acao || ':' || v_quem, date_trunc('hour', now()), 1)
  on conflict (chave, janela) do update set contagem = public.limites.contagem + 1
  returning contagem into v;
  if random() < 0.01 then
    delete from public.limites where janela < now() - interval '1 day';
  end if;
  return v <= public.limite_maximo(p_acao);
end $$;

-- ------------------------------------------------------------------------------------------------ os códigos (só os erros contam)

create or replace function public.apresentacao_abrir(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.apresentacoes;
  e public.envios_apresentacao;
  v_escritorio jsonb;
  v_aprovacao jsonb;
  v_endereco text := public.endereco_do_pedido();
begin
  if not public.limite_livre('codigo', v_endereco) then
    return jsonb_build_object('situacao', 'limite');
  end if;
  select * into a from public.apresentacoes where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found or a.envio = 0 then
    perform public.limite_somar('codigo', v_endereco);
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

-- volátil agora (soma os erros); a mesma resposta de antes
create or replace function public.apresentacao_situacao(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.apresentacoes;
  e public.envios_apresentacao;
  p public.aprovacoes;
  v_endereco text := public.endereco_do_pedido();
begin
  if not public.limite_livre('codigo', v_endereco) then
    return jsonb_build_object('situacao', 'limite');
  end if;
  select * into a from public.apresentacoes where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found or a.envio = 0 then
    perform public.limite_somar('codigo', v_endereco);
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

create or replace function public.tour_abrir(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tours;
  v_endereco text := public.endereco_do_pedido();
begin
  if not public.limite_livre('codigo', v_endereco) then
    return jsonb_build_object('situacao', 'limite');
  end if;
  select * into t from public.tours where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found or t.versao = 0 then
    perform public.limite_somar('codigo', v_endereco);
    return jsonb_build_object('situacao', 'inexistente');
  end if;
  if t.situacao = 'pausado' then
    return jsonb_build_object('situacao', 'pausado', 'nome', t.nome);
  end if;
  update public.tours set visitas = visitas + 1, ultima_visita = now() where id = t.id;
  return jsonb_build_object('situacao', 'publicado', 'nome', t.nome, 'passeio', t.passeio,
    'pasta', format('tours/%s-%s/v%s/', t.codigo, t.pasta, t.versao));
end $$;

-- volátil agora (soma os erros); a mesma resposta de antes
create or replace function public.comercial_formulario_abrir(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f public.comercial_formularios;
  v_ident jsonb;
  v_endereco text := public.endereco_do_pedido();
begin
  if not public.limite_livre('codigo', v_endereco) then
    return jsonb_build_object('situacao', 'limite');
  end if;
  select * into f from public.comercial_formularios where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then
    perform public.limite_somar('codigo', v_endereco);
    return jsonb_build_object('situacao', 'inexistente');
  end if;
  v_ident := public.identidade_do_escritorio(f.usuario_id) - 'termo';
  if not f.ativo or f.pausado_pelo_gestor then
    return jsonb_build_object('situacao', 'pausado', 'escritorio', v_ident);
  end if;
  return jsonb_build_object('situacao', 'aberto', 'codigo', f.codigo, 'nome', f.nome, 'versao', f.versao, 'perguntas', f.perguntas,
    'desvio', f.desvio, 'escritorio', v_ident, 'whatsappEscritorio', nullif((public.comercial_ajustes_de(f.usuario_id)).whatsapp, ''),
    'selo', not public.comercial_pro(f.usuario_id));
end $$;

create or replace function public.comercial_proposta_abrir(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x public.comercial_propostas;
  v public.comercial_pedidos;
  v_situacao text;
  v_endereco text := public.endereco_do_pedido();
begin
  if not public.limite_livre('codigo', v_endereco) then
    return jsonb_build_object('situacao', 'limite');
  end if;
  select * into x from public.comercial_propostas where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then
    perform public.limite_somar('codigo', v_endereco);
    return jsonb_build_object('situacao', 'inexistente');
  end if;
  select * into v from public.comercial_pedidos where id = x.pedido_id;
  v_situacao := case when x.aceita_em is not null then 'aceita'
                     when x.valida_ate is not null and x.valida_ate < public.comercial_hoje() then 'vencida'
                     when x.jeito = 'pdf' and x.arquivo is null then 'preparando'
                     else 'aberta' end;
  if v_situacao in ('aberta', 'aceita') then
    if x.ultima_abertura is null or (x.ultima_abertura at time zone 'America/Sao_Paulo')::date < public.comercial_hoje() then
      perform public.comercial_registrar(x.pedido_id, 'abriu', jsonb_build_object('codigo', x.codigo, 'vez', x.aberturas + 1), null);
    end if;
    update public.comercial_propostas set aberturas = aberturas + 1, ultima_abertura = now() where id = x.id;
  end if;
  return jsonb_build_object('situacao', v_situacao, 'codigo', x.codigo, 'jeito', x.jeito, 'link', x.link,
    'arquivo', case when v_situacao in ('aberta', 'aceita') then x.arquivo end,
    'conteudo', x.conteudo, 'valor', x.valor, 'validaAte', x.valida_ate, 'cliente', v.nome, 'aceite', x.aceite,
    'escritorio', public.identidade_do_escritorio(x.usuario_id) - 'termo',
    'whatsappEscritorio', nullif((public.comercial_ajustes_de(x.usuario_id)).whatsapp, ''),
    'selo', not public.comercial_pro(x.usuario_id));
end $$;

create or replace function public.comercial_proposta_aceitar(p_codigo text, p_nome text, p_concordo boolean, p_pacote text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x public.comercial_propostas;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_pacote jsonb;
  v_valor numeric;
  v_termo text;
  v_endereco text := public.endereco_do_pedido();
begin
  if not public.limite_livre('codigo', v_endereco) then
    return jsonb_build_object('ok', false, 'motivo', 'Muitas tentativas daqui. Tente de novo daqui a uma hora.');
  end if;
  select * into x from public.comercial_propostas where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then
    perform public.limite_somar('codigo', v_endereco);
    return jsonb_build_object('ok', false, 'motivo', 'Proposta não encontrada.');
  end if;
  if x.aceita_em is not null then
    return jsonb_build_object('ok', false, 'motivo', 'Esta proposta já foi aceita.', 'aceite', x.aceite);
  end if;
  if x.valida_ate is not null and x.valida_ate < public.comercial_hoje() then
    return jsonb_build_object('ok', false, 'motivo', 'Esta proposta venceu. Fale com o escritório para receber uma nova.');
  end if;
  if length(v_nome) not between 3 and 120 then
    return jsonb_build_object('ok', false, 'motivo', 'Escreva o seu nome completo.');
  end if;
  if not coalesce(p_concordo, false) then
    return jsonb_build_object('ok', false, 'motivo', 'Para aceitar, marque que leu e concorda com a proposta.');
  end if;
  v_valor := x.valor;
  if x.jeito = 'modelo' then
    if p_pacote is null and jsonb_array_length(x.conteudo -> 'pacotes') = 1 then
      v_pacote := x.conteudo -> 'pacotes' -> 0;
    else
      select pk into v_pacote from jsonb_array_elements(x.conteudo -> 'pacotes') pk where pk ->> 'nome' = p_pacote limit 1;
    end if;
    if v_pacote is null then
      return jsonb_build_object('ok', false, 'motivo', 'Escolha um dos pacotes.');
    end if;
    if (v_pacote ->> 'valor') ~ '^[0-9]+(\.[0-9]+)?$' then
      v_valor := (v_pacote ->> 'valor')::numeric;
    end if;
  end if;
  v_termo := format('Li e concordo com a proposta de %s.', public.nome_do_escritorio(x.usuario_id));
  update public.comercial_propostas set aceita_em = now(), aceite = jsonb_strip_nulls(jsonb_build_object('nome', v_nome, 'em', now(),
    'termo', v_termo, 'pacote', v_pacote ->> 'nome', 'valor', v_valor)) where id = x.id;
  update public.comercial_pedidos set valor = coalesce(v_valor, valor), atualizado_em = now() where id = x.pedido_id;
  perform public.comercial_registrar(x.pedido_id, 'aceite',
    jsonb_strip_nulls(jsonb_build_object('nome', v_nome, 'pacote', v_pacote ->> 'nome', 'valor', v_valor, 'codigo', x.codigo)), null);
  perform public.comercial_regra(x.pedido_id, 'aceite', null);
  return jsonb_build_object('ok', true, 'aviso', jsonb_build_object('email', (select u.email from auth.users u where u.id = x.usuario_id),
    'cliente', (select nome from public.comercial_pedidos where id = x.pedido_id), 'nome', v_nome, 'pacote', v_pacote ->> 'nome', 'valor', v_valor));
end $$;

-- ------------------------------------------------------------------------------------------------ a denúncia (cada uma conta)

create or replace function public.comercial_denunciar(p_codigo text, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f public.comercial_formularios;
begin
  if not public.limite_somar('denuncia', public.endereco_do_pedido()) then
    return jsonb_build_object('ok', false, 'motivo', 'Muitas denúncias daqui agora. Tente de novo daqui a uma hora.');
  end if;
  select * into f from public.comercial_formularios where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Formulário não encontrado.');
  end if;
  if length(btrim(coalesce(p_motivo, ''))) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'motivo', 'Conte em poucas palavras o que há de errado.');
  end if;
  insert into public.comercial_denuncias (formulario_id, motivo) values (f.id, btrim(p_motivo));
  update public.comercial_formularios set denuncias = denuncias + 1 where id = f.id;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------------------------------------ o /comprar

-- volátil agora (soma os erros); a mesma resposta de antes, e { valido: false, limite: true } depois de 30 cupons errados na hora
create or replace function public.cupom_conferir(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  v_endereco text := public.endereco_do_pedido();
begin
  if not public.limite_livre('cupom', v_endereco) then
    return jsonb_build_object('valido', false, 'limite', true);
  end if;
  select jsonb_build_object('valido', true, 'codigo', c.codigo, 'desconto', c.desconto, 'expiraEm', c.expira_em) into v
    from public.cupons c
   where c.codigo = upper(btrim(coalesce(p_codigo, ''))) and c.ativo
     and (c.expira_em is null or c.expira_em > now());
  if v is null then
    perform public.limite_somar('cupom', v_endereco);
    return jsonb_build_object('valido', false);
  end if;
  return v;
end $$;

-- A trava de 60 pedidos por hora valia para o site inteiro: um robô com 60 pedidos falsos parava as vendas por uma hora. Agora são
-- 6 por hora de cada endereço (ajustes_limites.pedido), 3 por e-mail, e a trava geral sobe para 300.
create or replace function public.pedido_criar(p_produto text, p_periodo text, p_nome text, p_email text, p_whatsapp text,
                                               p_cupom text default null, p_origem text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_whats text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_nome text := btrim(coalesce(p_nome, ''));
  v_base numeric;
  v_cupom jsonb;
  v_codigo text;
  v_desconto int := 0;
  v_mes numeric;
  p public.pedidos;
begin
  if p_produto not in ('plugin', 'arquionie') or p_periodo not in ('mensal', 'anual') then
    return jsonb_build_object('ok', false, 'motivo', 'Escolha o plano no quadro de preço.');
  end if;
  if length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'motivo', 'Digite o seu nome.');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'motivo', 'Digite um e-mail válido: a sua conta será com ele.');
  end if;
  if length(v_whats) between 10 and 11 then
    v_whats := '55' || v_whats;
  end if;
  if v_whats !~ '^[0-9]{12,13}$' then
    return jsonb_build_object('ok', false, 'motivo', 'Digite o WhatsApp com o DDD.');
  end if;
  if not public.limite_somar('pedido', public.endereco_do_pedido())
     or (select count(*) from public.pedidos where email = v_email and criado_em > now() - interval '1 hour') >= 3
     or (select count(*) from public.pedidos where criado_em > now() - interval '1 hour') >= 300 then
    return jsonb_build_object('ok', false, 'motivo', 'Muitos pedidos agora. Fale direto com a gente no WhatsApp.');
  end if;

  v_base := public.preco_do_plano(p_produto, p_periodo);
  if p_periodo = 'anual' and nullif(btrim(coalesce(p_cupom, '')), '') is not null then
    v_cupom := public.cupom_conferir(p_cupom);
    if (v_cupom ->> 'valido')::boolean then
      v_codigo := v_cupom ->> 'codigo';
      v_desconto := (v_cupom ->> 'desconto')::int;
    end if;
  end if;
  v_mes := round(v_base * (100 - v_desconto) / 100.0, 2);

  insert into public.pedidos (produto, periodo, nome, email, whatsapp, cupom, desconto, valor_mes, valor_cobranca, origem)
  values (p_produto, p_periodo, left(v_nome, 120), v_email, v_whats, v_codigo, v_desconto, v_mes,
          case when p_periodo = 'anual' then v_mes * 12 else v_mes end,
          case when p_origem in ('arquionie', 'revit', 'campanha', 'whatsapp') then p_origem else 'outro' end)
  returning * into p;

  return jsonb_build_object('ok', true, 'pedido', public.pedido_codigo(p.numero), 'produto', p.produto, 'periodo', p.periodo,
                            'valorMes', p.valor_mes, 'valorCobranca', p.valor_cobranca, 'cupom', p.cupom,
                            'desconto', p.desconto,
                            'cupomRecusado', nullif(btrim(coalesce(p_cupom, '')), '') is not null and p.cupom is null);
end $$;

-- ------------------------------------------------------------------------------------------------ quem pode chamar
-- As funções de antes continuam com as permissões delas (o create or replace não as muda). As novas são só por dentro, menos o
-- limite_somar, que as funções do servidor chamam com a chave secreta.
revoke execute on function public.endereco_do_pedido() from public, anon, authenticated;
revoke execute on function public.limite_impressao(text) from public, anon, authenticated;
revoke execute on function public.limite_maximo(text) from public, anon, authenticated;
revoke execute on function public.limite_livre(text, text) from public, anon, authenticated;
revoke execute on function public.limite_somar(text, text) from public, anon, authenticated;
grant execute on function public.limite_somar(text, text) to service_role;
