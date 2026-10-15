-- Importa no Supabase do ARQUIONIE as licenças ativas dos clientes PRO do Palheta Flow e as contas deles com a senha que
-- já usam (plano 18 do repositório do plugin, decisões 3 e 4 do ÊDI, 14/10/2026). Rodar no SQL Editor do Arquionie,
-- depois da migração 20261015000000 (licença única).
--
-- Como usar (ÊDI):
--   1. Colar este roteiro no SQL Editor do ARQUIONIE.
--   2. No Supabase do ESCRITÓRIO, rodar exportar-licencas-e-contas-do-flow.sql e clicar Export › Copy as JSON.
--   3. Aqui, dar dois cliques na palavra grande que pede o JSON (numa linha sozinha, mais abaixo) e colar com Ctrl+V. Rodar.
-- Sai uma tabela com o que aconteceu. Pode rodar de novo: o que já veio não duplica.
--
-- O que faz, tudo de uma vez (se algo der errado, nada fica gravado):
--   - LICENÇAS: uma por licença do Flow, de licença única (programa e plugin), origem "importada do Flow", com a validade
--     do Flow MAIS os dias de bônus da troca (30; ÊDI, 15/10/2026: somar já na importação), marcada como bônus somado
--     (o bônus nunca soma duas vezes); uma só fica com o próprio dono, várias ficam SEM TITULAR para ele distribuir em MINHA CONTA. Dono que já
--     foi importado é pulado.
--   - CONTAS: e-mail já confirmado e a mesma senha cifrada; a licença liga sozinha quando a conta nasce. Quem JÁ TEM conta
--     no Arquionie com aquele e-mail fica como está (a senha de ninguém é trocada); a licença liga na conta que existe.
--     No primeiro acesso o site pede a atuação e o aceite dos termos do Arquionie (cadastro incompleto).
create temp table if not exists resultado_importacao (item text, quantidade int, detalhe text);
truncate resultado_importacao;

do $importar$
declare
  d jsonb := $flow$
COLE_AQUI_O_JSON
$flow$::jsonb;
  r jsonb;
  v_email text;
  v_ate timestamptz;
  v_qtd int;
  v_id uuid;
  v_conta uuid;
  v_bonus int := coalesce((select dias_de_bonus from public.ajustes_licenca where id), 30);
  v_instancia uuid := coalesce((select instance_id from auth.users limit 1), '00000000-0000-0000-0000-000000000000');
  n_lic_donos int := 0; n_lic int := 0; n_lic_pulados int := 0;
  n_contas int := 0; n_existentes int := 0; n_sem_senha int := 0;
  existentes text := '';
begin
  if jsonb_typeof(d) = 'array' then d := d -> 0 -> 'dados'; end if;   -- o "Copy as JSON" vem como [{ "dados": ... }]
  if jsonb_typeof(d) = 'string' then d := (d #>> '{}')::jsonb; end if;
  if jsonb_typeof(d -> 'licencas') is distinct from 'array' or jsonb_typeof(d -> 'contas') is distinct from 'array' then
    raise exception 'Isto não é o resultado da exportar-licencas-e-contas-do-flow.sql (faltam "licencas" e "contas").';
  end if;

  -- 1. Licenças (antes das contas: a conta nova liga sozinha nas licenças que esperam o e-mail dela)
  perform set_config('arquionie.acao', 'importada do Flow', true);
  for r in select * from jsonb_array_elements(d -> 'licencas') loop
    v_email := lower(btrim(coalesce(r ->> 'email', '')));
    v_ate := (r ->> 'expira_em')::timestamptz;
    v_qtd := coalesce((r ->> 'quantidade')::int, 1);
    continue when v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_ate is null or v_ate <= now() or v_qtd < 1;
    if exists (select 1 from public.licencas where origem = 'importada-flow' and dono_email = v_email) then
      n_lic_pulados := n_lic_pulados + 1;
      continue;
    end if;
    for i in 1 .. v_qtd loop
      insert into public.licencas (produto, plano, dono_email, email, expira_em, origem, bonus_em, observacao)
      values ('arquionie', 'pro', v_email, case when v_qtd = 1 then v_email end, v_ate + make_interval(days => v_bonus),
              'importada-flow', now(),
              'importada do Palheta Flow em ' || to_char(now(), 'DD/MM/YYYY') || ', com ' || v_bonus || ' dias de bônus');
    end loop;
    n_lic_donos := n_lic_donos + 1;
    n_lic := n_lic + v_qtd;
    v_conta := public.conta_confirmada(v_email);   -- já tem conta no Arquionie: liga agora
    if v_conta is not null then
      perform public.licencas_ligar(v_email, v_conta);
    end if;
  end loop;

  -- 2. Contas, com a senha cifrada do Flow
  for r in select * from jsonb_array_elements(d -> 'contas') loop
    v_email := lower(btrim(coalesce(r ->> 'email', '')));
    continue when v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(r ->> 'senha', '') = '';
    if exists (select 1 from auth.users where lower(email) = v_email) then
      n_existentes := n_existentes + 1;
      existentes := existentes || case when existentes = '' then '' else ', ' end || v_email;
      continue;
    end if;
    v_id := nullif(r ->> 'id', '')::uuid;
    if v_id is null or exists (select 1 from auth.users where id = v_id) then
      v_id := gen_random_uuid();
    end if;
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change,
                            email_change_token_current, reauthentication_token, phone_change, phone_change_token)
    values (v_instancia, v_id, 'authenticated', 'authenticated', v_email, r ->> 'senha',
            coalesce((r ->> 'confirmada_em')::timestamptz, now()),
            '{"provider": "email", "providers": ["email"]}'::jsonb,
            jsonb_strip_nulls(jsonb_build_object('nome', nullif(btrim(r ->> 'nome'), ''), 'veio_do_flow', true)),
            coalesce((r ->> 'criada_em')::timestamptz, now()), now(),
            '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text, 'email',
            jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false), now(), now());
    n_contas := n_contas + 1;
    if not coalesce((r ->> 'senha_definida')::boolean, true) then
      n_sem_senha := n_sem_senha + 1;
    end if;
  end loop;

  insert into resultado_importacao values
    ('licenças criadas', n_lic, n_lic_donos || ' dono(s), com ' || v_bonus || ' dias de bônus; várias no mesmo e-mail ficam SEM TITULAR'),
    ('donos pulados', n_lic_pulados, 'já tinham sido importados antes'),
    ('contas criadas com a senha do Flow', n_contas, case when n_sem_senha > 0
       then n_sem_senha || ' ainda não tinham definido a senha no Flow: usam ESQUECI A SENHA' else 'todas com senha definida' end),
    ('contas que já existiam no Arquionie', n_existentes, nullif(existentes, '')),
    ('licenças deste arquivo já ligadas a uma conta', (select count(*)::int from public.licencas l
       where l.origem = 'importada-flow' and l.usuario_id is not null
         and l.dono_email in (select lower(btrim(x ->> 'email')) from jsonb_array_elements(d -> 'licencas') x)),
     'as outras esperam o dono passar para alguém em MINHA CONTA');
end $importar$;

select * from resultado_importacao;
