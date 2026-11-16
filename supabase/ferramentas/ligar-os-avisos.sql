-- Liga os avisos no celular no Supabase do ARQUIONIE (migração 20261116000000_avisos_no_celular.sql; função avisos). Rodar uma vez,
-- DEPOIS da migração e da função publicadas. Pode rodar de novo sem estragar nada.
--   1. Sorteia o segredo das tarefas e guarda no cofre (Vault). Ninguém vê nem copia: a função avisos o lê pela segredo_dos_avisos().
--   2. Agenda as duas tarefas no pg_cron: "avisos-fila", a cada 5 minutos (a reserva: o aviso sai logo depois do pedido ou do
--      comentário, pelas funções comercial e cliente), e "avisos-retornos", às 7h de Brasília (10h UTC), com os retornos do dia.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'avisos_segredo') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'avisos_segredo',
                                'Arquionie: segredo das tarefas dos avisos no celular (app do Arquionie, doc 90)');
  end if;
end $$;

select cron.unschedule('avisos-fila') where exists (select 1 from cron.job where jobname = 'avisos-fila');
select cron.schedule('avisos-fila', '*/5 * * * *', $tarefa$
  select net.http_post(
    url := 'https://sowazotriildoeaxbhkl.supabase.co/functions/v1/avisos',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-avisos', (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_segredo' limit 1)),
    body := '{"acao":"processar"}'::jsonb)
  where exists (select 1 from public.avisos_fila where enviado_em is null);
$tarefa$);

select cron.unschedule('avisos-retornos') where exists (select 1 from cron.job where jobname = 'avisos-retornos');
select cron.schedule('avisos-retornos', '0 10 * * *', $tarefa$
  select net.http_post(
    url := 'https://sowazotriildoeaxbhkl.supabase.co/functions/v1/avisos',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-avisos', (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_segredo' limit 1)),
    body := '{"acao":"retornos"}'::jsonb);
$tarefa$);

-- Conferência: as duas tarefas (ativas) e o segredo guardado (sem mostrar o valor).
select jobname, schedule, active, (select count(*) from vault.secrets where name = 'avisos_segredo') as segredo_guardado
  from cron.job where jobname in ('avisos-fila', 'avisos-retornos') order by jobname;
