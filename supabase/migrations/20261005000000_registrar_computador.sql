-- Arquionie™: o programa registra o computador na conta ao entrar (doc 57, §4.3; até três ao mesmo tempo, ÊDI 02/10/2026).
-- Rodar uma vez no SQL Editor do projeto arquionie, depois da 20261003000000_perfis_e_computadores.sql.

-- A máquina (a identidade do Windows, que o programa manda) separa os computadores; o mesmo computador com duas contas
-- (um colaborador que usa a máquina de outro) vale um em cada conta.
alter table public.computadores add column if not exists maquina text;
create unique index if not exists computadores_usuario_maquina on public.computadores (usuario_id, maquina);

-- Renova o computador que já está na conta; com menos de três, acrescenta; com três, devolve a lista para a pessoa
-- desconectar um no próprio programa (a regra de apagar já existe: cada pessoa desconecta os próprios).
create or replace function public.registrar_computador(p_id text, p_nome text, p_versao text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_computador uuid;
  v_lista jsonb;
begin
  if v_usuario is null then
    raise exception 'sem conta';
  end if;
  if coalesce(trim(p_id), '') = '' then
    raise exception 'sem identidade do computador';
  end if;

  update public.computadores
     set nome = left(p_nome, 120), versao = left(p_versao, 40), ultimo_acesso = now()
   where usuario_id = v_usuario and maquina = p_id
  returning id into v_computador;
  if v_computador is not null then
    return jsonb_build_object('situacao', 'ok', 'id', v_computador);
  end if;

  if (select count(*) from public.computadores where usuario_id = v_usuario) >= 3 then
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'versao', c.versao, 'ultimo_acesso', c.ultimo_acesso)
                              order by c.ultimo_acesso desc), '[]'::jsonb)
      into v_lista
      from public.computadores c
     where c.usuario_id = v_usuario;
    return jsonb_build_object('situacao', 'limite', 'computadores', v_lista);
  end if;

  insert into public.computadores (usuario_id, maquina, nome, versao)
  values (v_usuario, p_id, left(p_nome, 120), left(p_versao, 40))
  returning id into v_computador;
  return jsonb_build_object('situacao', 'ok', 'id', v_computador);
end $$;

revoke execute on function public.registrar_computador(text, text, text) from public, anon;
grant execute on function public.registrar_computador(text, text, text) to authenticated;
