-- Arquionie™: passa a página do cliente do TCC do Natanael (CENTRO DE CONVENÇÕES BEZALEL) para a conta dele, com o mesmo link (ÊDI,
-- 09/11/2026: o projeto foi renderizado e enviado pelo computador da Palheta, porque o dele não dava conta, e a página ficou na conta de lá;
-- ela tem de ficar na conta dele, para ele mandar o link aos professores pela conta dele).
--
-- ANTES DE RODAR: troque o e-mail de exemplo, na primeira linha depois deste texto, pelo e-mail com que ele entra no Arquionie (a conta dele
-- precisa existir: ele entra uma vez no site ou no programa). Rodar no SQL Editor do projeto arquionie. Pode rodar de novo: o que já está
-- com ele fica como está.
--
-- Vai junto: os envios, os comentários e a aprovação dos professores e as visitas. A página passa a mostrar a identidade do escritório dele
-- (CONFIGURAÇÕES › ESCRITÓRIO no programa, entrando com a conta dele; sem ela, a página sai sem logo e com o termo de fábrica), e não mais a
-- da Palheta. Uma página do mesmo projeto que já esteja na conta dele e nunca foi ao ar (um envio que parou no meio) sai, para dar lugar a
-- esta; uma página dele já publicada não sai, e nada muda.
--
-- O resultado é uma linha: o projeto, o link, a conta em que estava e o que aconteceu. Sem a conta dele, a linha lista as contas com
-- "natanael" no nome ou no e-mail, e nada muda.

select set_config('passagem.email', lower(btrim('EMAIL-DO-NATANAEL')), false);

-- 1. a página vazia do mesmo projeto na conta dele (um envio dele que não terminou), que impediria a passagem
delete from public.apresentacoes x
 using public.apresentacoes a, auth.users u
 where u.id = x.usuario_id and lower(u.email) = current_setting('passagem.email')
   and a.nome ilike '%BEZALEL%' and a.usuario_id <> x.usuario_id and a.envio > 0
   and x.chave = a.chave and x.envio = 0;

-- 2. a passagem
with natanael as (
  select u.id, u.email from auth.users u where lower(u.email) = current_setting('passagem.email') limit 1
), paginas as (
  select a.id, a.codigo, a.nome, a.chave, a.envio, a.usuario_id, coalesce(a.atualizado_em, a.criado_em) as quando,
         (select u.email from auth.users u where u.id = a.usuario_id) as conta
    from public.apresentacoes a
   where a.nome ilike '%BEZALEL%'
), alvo as (
  select p.* from paginas p
   where p.usuario_id is distinct from (select id from natanael)
   order by (p.envio > 0) desc, p.quando desc
   limit 1
), passada as (
  update public.apresentacoes a set usuario_id = (select id from natanael)
    from alvo
   where a.id = alvo.id
     and (select id from natanael) is not null
     and not exists (select 1 from public.apresentacoes x where x.usuario_id = (select id from natanael) and x.chave = a.chave)
  returning a.id
)
select coalesce(al.nome, (select string_agg(p.nome, ' · ') from paginas p), '—') as projeto,
       coalesce('https://www.arquionie.com.br/t/' || al.codigo,
                (select string_agg('https://www.arquionie.com.br/t/' || p.codigo, ' · ') from paginas p), '—') as link,
       coalesce(al.conta, (select string_agg(distinct p.conta, ' · ') from paginas p), '—') as estava_na_conta,
       case
         when (select id from natanael) is null then
           'NÃO PASSOU: nenhuma conta com o e-mail "' || current_setting('passagem.email') || '". Contas com NATANAEL: ' ||
           coalesce((select string_agg(coalesce(nullif(btrim(pf.nome), '') || ' ', '') || '<' || u.email || '>', ' · ')
                       from auth.users u left join public.perfis pf on pf.id = u.id
                      where u.email ~* 'nath?ana' or pf.nome ~* 'nath?ana'), 'nenhuma')
         when al.id is null and exists (select 1 from paginas p where p.usuario_id = (select id from natanael)) then
           'já estava na conta dele (' || (select email from natanael) || ')'
         when al.id is null then 'NÃO PASSOU: nenhuma página com BEZALEL no nome'
         when al.id in (select id from passada) then 'PASSOU PARA A CONTA DELE (' || (select email from natanael) || ')'
         else 'NÃO PASSOU: a conta dele já tem uma página publicada deste projeto: ' ||
           (select string_agg('https://www.arquionie.com.br/t/' || p.codigo, ' · ') from paginas p
             where p.usuario_id = (select id from natanael))
       end as resultado
  from (select 1) as um left join alvo al on true;
