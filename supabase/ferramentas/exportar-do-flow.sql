-- Exporta os dados da gestão do Palheta Flow para a importação no /gestao do Arquionie (função gestao_importar_dados_flow,
-- migração 20261015000000; plano 18 do repositório do plugin). SÓ LEITURA: não muda nada no Supabase do escritório.
--
-- Como usar (ÊDI):
--   1. Abrir o SQL Editor do Supabase do ESCRITÓRIO (não o do Arquionie) e rodar esta consulta inteira.
--   2. Copiar o valor da coluna "dados" (um JSON só) e salvar como flow-gestao.json numa pasta PARTICULAR — são e-mails
--      de clientes: nunca no Drive compartilhado, nunca no repositório.
--   3. No /gestao do Arquionie, importar o arquivo (prévia antes de confirmar).
-- Não vêm por aqui: as licenças (IMPORTAR CLIENTES DO FLOW, na aba LICENÇAS), as contas com senha (roteiro próprio) e o
-- CPF (decisão 4 do plano 18). Se uma coluna tiver outro nome no banco (várias tabelas do Flow foram criadas pelo painel,
-- sem cópia no repositório), o SQL Editor diz qual; é só trocar o nome aqui.
select jsonb_build_object(
  'geradoEm', now(),
  'precos', (select jsonb_build_object('parcela', p.parcela, 'parcelas', p.parcelas, 'avista', p.avista)
               from public.palheta_flow_precos p order by p.id limit 1),
  'cupons', (select coalesce(jsonb_agg(jsonb_build_object(
                'codigo', c.codigo, 'desconto', c.desconto, 'expira_em', c.expira_em, 'observacao', c.observacao,
                'ativo', c.ativo, 'criado_em', c.criado_em) order by c.criado_em), '[]'::jsonb)
               from public.flow_cupons c),
  'cadastros', (select coalesce(jsonb_agg(jsonb_build_object(
                'email', r.email, 'nome', r.name, 'created_at', r.created_at, 'downloaded_at', r.downloaded_at)
                order by r.created_at), '[]'::jsonb)
               from public.palheta_flow_downloads_registrations r where r.email is not null),
  'descadastros', (select coalesce(jsonb_agg(jsonb_build_object('email', o.email, 'created_at', o.criado_em)), '[]'::jsonb)
               from public.flow_optout o),
  'campanhas', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', k.id, 'assunto', k.assunto, 'mensagem', k.mensagem, 'cupom', k.cupom, 'desconto', k.desconto,
                'oferta', k.oferta, 'criada_em', k.criada_em,
                'envios', (select coalesce(jsonb_agg(jsonb_build_object(
                             'email', e.email, 'nome', e.nome, 'status', e.status, 'erro', e.erro, 'enviado_em', e.enviado_em)),
                           '[]'::jsonb)
                             from public.flow_campanha_envios e where e.campanha_id = k.id))
                order by k.criada_em), '[]'::jsonb)
               from public.flow_campanhas k),
  'aulas', (select coalesce(jsonb_agg(jsonb_build_object(
                'title', t.title, 'youtube_id', t.youtube_id, 'duration', t.duration, 'description', t.description,
                'position', t.position, 'command', t.command, 'thumbnail_url', t.thumbnail_url) order by t.position), '[]'::jsonb)
               from public.palheta_flow_tutorials t),
  'feedbacks', (select coalesce(jsonb_agg(jsonb_build_object(
                'email', f.email, 'edicao', f.edicao, 'versao', f.versao, 'categoria', f.categoria, 'nota', f.nota,
                'mensagem', f.mensagem, 'status', f.status, 'created_at', f.created_at) order by f.created_at), '[]'::jsonb)
               from public.feedbacks f)
) as dados;
