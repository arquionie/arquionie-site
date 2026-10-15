-- Liga o envio das campanhas do /gestao no Supabase do ARQUIONIE (plano 18 do repositório do plugin). Rodar uma vez no SQL
-- Editor, DEPOIS de publicar a função campanhas. Pode rodar de novo sem estragar nada.
--   1. Sorteia o segredo da tarefa e dos links de descadastro e guarda no cofre do Supabase (Vault). Ninguém vê nem copia:
--      a função campanhas lê pela segredo_das_campanhas(), que só a chave secreta do servidor chama.
--   2. Agenda a tarefa "enviar-campanhas" no pg_cron: a cada 5 minutos, SE houver campanha enviando, chama a função, que manda
--      o próximo lote (o banco decide o intervalo, o tamanho do lote e o limite do dia).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'campanhas_segredo') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'campanhas_segredo',
                                'Arquionie: segredo da tarefa das campanhas e dos links de descadastro (plano 18)');
  end if;
end $$;

create or replace function public.segredo_das_campanhas() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'campanhas_segredo' limit 1;
$$;

revoke execute on function public.segredo_das_campanhas() from public, anon, authenticated;
grant execute on function public.segredo_das_campanhas() to service_role;

select cron.unschedule('enviar-campanhas') where exists (select 1 from cron.job where jobname = 'enviar-campanhas');
select cron.schedule('enviar-campanhas', '*/5 * * * *', $tarefa$
  select net.http_post(
    url := 'https://sowazotriildoeaxbhkl.supabase.co/functions/v1/campanhas',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-campanhas', (select decrypted_secret from vault.decrypted_secrets where name = 'campanhas_segredo' limit 1)),
    body := '{"acao":"processar"}'::jsonb)
  where exists (select 1 from public.campanhas where status = 'enviando');
$tarefa$);

-- Conferência: a tarefa agendada (uma linha, ativa) e o segredo guardado (sem mostrar o valor).
select jobname, schedule, active, (select count(*) from vault.secrets where name = 'campanhas_segredo') as segredo_guardado
  from cron.job where jobname = 'enviar-campanhas';
