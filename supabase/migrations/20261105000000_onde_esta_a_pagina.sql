-- Arquionie™: em que conta está a página do cliente de um projeto (ÊDI, 05/11/2026, pelo 236: "Por que eu não consigo ver em qual área
-- de trabalho ele está publicado? Ou em qual conta ele está publicado?"). Rodar uma vez no SQL Editor do projeto arquionie, depois das de
-- antes (depois da 20261104000000_pagina_passada_ao_escritorio.sql, cuja regra esta repete). Pode rodar duas vezes sem estragar nada.
--
-- O programa pergunta pelo código do link e pela chave do projeto (a que fica dentro do arquivo: só quem tem o projeto sabe as duas) e
-- mostra no painel do ENVIAR, em A PUBLICAÇÃO, a conta dona da página (o nome do escritório e o e-mail), se ela aparece em MINHA CONTA ›
-- APRESENTAÇÕES de quem pergunta e se o envio seguinte de quem pergunta vai para essa página, no mesmo link, pelas mesmas regras da
-- apresentacao_enviar (o "em nome de" escolhido e a página que passou ao escritório). Quando não vai, o programa avisa antes do ENVIAR:
-- o envio criaria outra página, com outro link.

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
  -- para onde vai o envio seguinte de quem pergunta: o escritorio_para_enviar e, pela própria área, a página que o escritório da equipe
  -- já tem do projeto (a apresentacao_enviar de 20261104000000)
  v_dono := public.escritorio_para_enviar(v_quem, p_escritorio);
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

revoke execute on function public.apresentacao_onde(text, text, uuid) from public, anon;
grant execute on function public.apresentacao_onde(text, text, uuid) to authenticated;
