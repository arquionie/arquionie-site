-- Arquionie™: passa as páginas do cliente do 236 e do Start Kids (o 212-2) à conta do escritório (escritorio@palhetaarquitetura.com),
-- com o mesmo link, para aparecerem em MINHA CONTA › APRESENTAÇÕES na área do escritório (ÊDI, 04/11/2026). As duas foram publicadas pela
-- conta de quem enviou: o 236 sem o "em nome do escritório" e o Start Kids pelo dono do projeto protegido (kemilyarq@gmail.com).
--
-- Rodar uma vez no SQL Editor do projeto arquionie, DEPOIS da migração 20261104000000_pagina_passada_ao_escritorio.sql (sem ela, o envio
-- seguinte do programa criaria outra página, com outro link, na conta de quem envia). Pode rodar de novo: o que já está no escritório fica.
--
-- O resultado é uma tabela, uma linha por página: o projeto, o link, a conta em que estava, o que aconteceu e se quem tinha a página está
-- na equipe do escritório (sem estar, a pessoa deixa de ver a página e o envio seguinte dela volta à área dela). A última linha diz se o
-- 225 ainda tem página no servidor (os links 95QPJ2 e J4FNAX não existem mais).

with escritorio as (
  select u.id, u.email from auth.users u where lower(u.email) = 'escritorio@palhetaarquitetura.com' limit 1
), alvo as (
  select a.id, a.codigo, a.nome, a.chave, a.usuario_id as antes
    from public.apresentacoes a
   where a.codigo = 'YHJH28' or a.nome ilike '%START KIDS%'
), movidas as (
  update public.apresentacoes a set usuario_id = (select id from escritorio)
    from alvo
   where a.id = alvo.id
     and (select id from escritorio) is not null
     and a.usuario_id <> (select id from escritorio)
     and not exists (select 1 from public.apresentacoes x where x.usuario_id = (select id from escritorio) and x.chave = a.chave)
  returning a.id
)
select alvo.nome as projeto,
       'https://www.arquionie.com.br/t/' || alvo.codigo as link,
       (select u.email from auth.users u where u.id = alvo.antes) as estava_na_conta,
       case
         when (select id from escritorio) is null then 'NÃO PASSOU: a conta escritorio@palhetaarquitetura.com não foi achada'
         when alvo.antes = (select id from escritorio) then 'já estava no escritório'
         when alvo.id in (select id from movidas) then 'PASSOU AO ESCRITÓRIO (' || (select email from escritorio) || ')'
         else 'NÃO PASSOU: o escritório já tem outra página deste projeto'
       end as resultado,
       case when public.da_equipe(alvo.antes, (select id from escritorio)) then 'sim' else 'NÃO: cadastre na EQUIPE do escritório' end
         as quem_enviou_esta_na_equipe
  from alvo
union all
select '225 - IGREJA PRESBITERIANA ALIANÇA', coalesce(string_agg('https://www.arquionie.com.br/t/' || a.codigo, ' · '), '—'),
       coalesce(string_agg(distinct u.email, ' · '), '—'),
       case when count(a.id) = 0 then 'só conferido: nenhuma página do 225 no servidor (precisa enviar de novo)'
            else 'só conferido: ainda tem página no servidor' end,
       '—'
  from public.apresentacoes a left join auth.users u on u.id = a.usuario_id
 where a.nome ilike '225%';
