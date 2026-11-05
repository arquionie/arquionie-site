-- Arquionie™: a página do cliente passada ao escritório continua no mesmo link (ÊDI, 04/11/2026: o 236 e o Start Kids publicados pela
-- conta de quem enviou não apareciam na área do escritório). Rodar uma vez no SQL Editor do projeto arquionie, depois das de antes. Pode
-- rodar duas vezes sem estragar nada.
--
-- A apresentação é da conta que a enviou, ou do escritório escolhido no "em nome de" do primeiro envio. Quando a página passa ao
-- escritório depois (o PASSAR AO ESCRITÓRIO, ou à mão pelo supabase/ferramentas/passar-paginas-ao-escritorio.sql), o projeto aberto
-- continua mandando o envio seguinte para a própria área de quem envia, e a apresentacao_enviar de antes, sem a página ali, criava outra
-- com outro link. Agora: quem envia pela própria área e não tem a página deste projeto, mas está na equipe de um escritório que tem, envia
-- para o escritório, no mesmo link. Quem não está na equipe continua criando a sua (ninguém pega a página de outro escritório pela chave).

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
  v_dono uuid := p_usuario;
  v_escritorio uuid;
begin
  -- a página que passou ao escritório: o envio pela própria área vai para lá
  if (p_enviado_por is null or p_enviado_por = p_usuario)
     and not exists (select 1 from public.apresentacoes where usuario_id = p_usuario and chave = p_chave) then
    select x.usuario_id into v_escritorio from public.apresentacoes x
     where x.chave = p_chave and x.usuario_id <> p_usuario and public.da_equipe(p_usuario, x.usuario_id)
     order by coalesce(x.atualizado_em, x.criado_em) desc limit 1;
    if v_escritorio is not null then
      v_dono := v_escritorio;
    end if;
  end if;
  select * into j from public.ajustes_apresentacoes where id;
  l := public.licenca_em_uso(v_dono, 'arquionie');
  if not coalesce(j.livres_no_lancamento, true) and (l.id is null or l.plano not in ('pro', 'equipe')) then
    return jsonb_build_object('ok', false, 'motivo', 'plano', 'texto', 'O ENVIAR PARA O CLIENTE faz parte do plano PRO do Arquionie.');
  end if;
  if coalesce(p_fase, '') not in ('aprovacao', 'final') then
    return jsonb_build_object('ok', false, 'motivo', 'fase', 'texto', 'A fase vai como aprovacao ou final.');
  end if;
  v_dias := greatest(30, least(1095, coalesce(p_dias, j.prazo_padrao, 365)));
  select * into a from public.apresentacoes where usuario_id = v_dono and chave = p_chave;
  if not found then
    select count(*) into v_publicadas from public.apresentacoes where usuario_id = v_dono;
    if v_publicadas >= coalesce(j.limite, 500) then
      return jsonb_build_object('ok', false, 'motivo', 'limite',
        'texto', format('A conta já tem %s projetos com apresentação, o limite do plano.', v_publicadas));
    end if;
    insert into public.apresentacoes (codigo, usuario_id, chave, nome, pasta)
    values (upper(p_codigo), v_dono, p_chave, p_nome, p_pasta)
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

revoke execute on function public.apresentacao_enviar(uuid, text, text, text, text, text, int, text, text, uuid) from public, anon, authenticated;
grant execute on function public.apresentacao_enviar(uuid, text, text, text, text, text, int, text, text, uuid) to service_role;
