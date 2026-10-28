-- Arquionie™ — os PEDIDOS DE AJUSTE para o sistema Palheta (27/10/2026). O painel do projeto no sistema mostrava a etiqueta
-- AJUSTES (26) pela apresentacao_situacao, mas não tinha onde ler os comentários: só abrindo o link. Esta função devolve os
-- comentários do cliente de cada envio que recebeu algum (o texto, o lugar no tour e o feito marcado no programa), do envio mais novo
-- ao mais velho. Sem conta, só leitura e sem contar visita (a apresentacao_abrir conta). O código é a chave: são os mesmos comentários
-- que a página /t/ mostra a quem abre. Os erros contam no limite por endereço, como na situação. Pode rodar duas vezes.

create or replace function public.apresentacao_pedidos(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.apresentacoes;
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
  return jsonb_build_object('envio', a.envio, 'envios', (select coalesce(jsonb_agg(jsonb_build_object(
      'numero', e.numero, 'fase', e.fase, 'em', e.publicado_em,
      'pedidos', (select coalesce(jsonb_agg(jsonb_build_object('nome', d.nome, 'em', d.criado_em,
          'comentarios', (select coalesce(jsonb_agg(c.valor || jsonb_build_object('feito', d.feitos -> (c.n)::text) order by c.n), '[]'::jsonb)
                          from jsonb_array_elements(d.comentarios) with ordinality as c(valor, n)))
          order by d.criado_em), '[]'::jsonb)
        from public.pedidos_de_ajuste d where d.envio_id = e.id))
      order by e.numero desc), '[]'::jsonb)
    from public.envios_apresentacao e
    where e.apresentacao_id = a.id and e.situacao <> 'enviando'
      and exists (select 1 from public.pedidos_de_ajuste d where d.envio_id = e.id)));
end $$;

revoke execute on function public.apresentacao_pedidos(text) from public;
grant execute on function public.apresentacao_pedidos(text) to anon, authenticated;
