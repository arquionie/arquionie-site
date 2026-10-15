-- Exporta as LICENÇAS ATIVAS dos clientes PRO do Palheta Flow e as CONTAS deles, com a senha CIFRADA (bcrypt), para o
-- roteiro importar-licencas-e-contas-do-flow.sql no Supabase do Arquionie (plano 18 do repositório do plugin, decisão 3:
-- os clientes entram no Arquionie com o mesmo e-mail e a mesma senha). SÓ LEITURA: não muda nada no escritório.
--
-- Como usar (ÊDI):
--   1. SQL Editor do Supabase do ESCRITÓRIO: rodar esta consulta. Sai uma linha, coluna "dados".
--   2. Export › Copy as JSON e colar direto no roteiro de importação, no SQL Editor do ARQUIONIE (no lugar de
--      a palavra grande que pede o JSON). Não salvar em arquivo nem mandar por mensagem: tem a senha cifrada dos clientes.
-- O que vai: e-mail, validade e quantidade de cada dono de licença ativa e não vencida; da conta, o e-mail, a senha
-- cifrada, o nome e as datas. Não vai: a chave PFPRO-, a máquina, o CPF. Quem ainda não definiu a senha (link de
-- primeiro acesso não usado) vai marcado: no Arquionie, essa pessoa usa ESQUECI A SENHA.
with lic as (
  select lower(btrim(l.email_dono)) as email, max(l.expira_em) as expira_em, count(*) as quantidade
    from public.licencas l
   where l.status = 'ativa' and l.expira_em > now()
   group by 1
)
select jsonb_build_object(
  'geradoEm', now(),
  'licencas', (select coalesce(jsonb_agg(jsonb_build_object('email', x.email, 'expira_em', x.expira_em, 'quantidade', x.quantidade)
                order by x.email), '[]'::jsonb) from lic x),
  'contas', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', u.id,
                'email', lower(u.email),
                'senha', u.encrypted_password,
                'senha_definida', coalesce(u.raw_user_meta_data ->> 'setup_token', '') = '',
                'nome', coalesce(u.raw_user_meta_data ->> 'nome', u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
                'confirmada_em', coalesce(u.email_confirmed_at, u.created_at),
                'criada_em', u.created_at) order by u.email), '[]'::jsonb)
               from auth.users u
               join lic x on x.email = lower(u.email)
              where coalesce(u.encrypted_password, '') <> '')
) as dados;
