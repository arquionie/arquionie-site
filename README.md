# arquionie-site

O site do Palheta Arquionie™ em `arquionie.com.br`: página inicial, BAIXAR, criar conta, entrar (e-mail e senha ou
Google), confirmar o e-mail e trocar a senha por código de 6 dígitos, minha conta, versões, termos e privacidade.
Decisões e proposta: `docs/57-DISTRIBUICAO-CONTA-E-ATUALIZACAO.md` e `docs/DECISOES.md` (02/10/2026) no repositório do
Arquionie; telas no mockup aprovado `docs/mockups/conta-e-atualizacao.html`.

## Rodar e publicar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/
```

Publicação pela **Vercel**, ligada ao repositório na organização `arquionie` do GitHub: framework Vite, comando
`npm run build`, saída `dist`. Plano Hobby enquanto se monta; Pro na abertura ao público.

## O visual: o modo AMIGÁVEL

O site usa o modo AMIGÁVEL do sistema de design do Arquionie (ÊDI, 16/10/2026; mockup `docs/mockups/site-amigavel` no
repositório do programa): claro de fábrica, com Escuro e Automático em Minha conta › Aparência, a letra do aparelho, cápsulas e
cartões. O /gestao também (mockup `docs/mockups/gestao-amigavel`, aprovado no mesmo dia).

- As cores, os raios, as alturas e as letras vêm de `src/tokens/` (`tokens.css` e `tailwind-preset.cjs`), que **não se editam
  aqui**. A fonte é `design/tokens/tokens.json` no repositório do programa:
  ```bash
  python ferramentas/tokens/gerar_tokens.py
  node ferramentas/tokens/copiar-para-o-site.mjs
  ```
  (os dois rodam na pasta do repositório do programa).
- Nas telas, só os nomes dos tokens (`bg-superficie`, `rounded-toque`, `h-amg-altura-campo`, `text-amg-titulo`). Se faltar um papel,
  ele entra no `tokens.json`.
- As peças: `components/Formulario.jsx` (botões nos três níveis, campos, etiquetas), `components/Listas.jsx` (listas agrupadas) e
  `components/Cartao.jsx` (as telas de conta); as do /gestao, em `components/GestaoPecas.jsx`.

## Regras para não ficar preso a nenhum fornecedor

- O site é **só arquivos prontos** (o `dist` do Vite). Nada de Next.js, funções, banco, armazenamento ou imagens da
  Vercel; o `vercel.json` só redireciona as páginas para o `index.html`. Trocar de hospedagem é publicar a mesma pasta
  noutro lugar e mudar um registro de DNS.
- A lógica fica no **Supabase** (contas, banco, funções), os arquivos para baixar no **Cloudflare R2**, o DNS na
  **Cloudflare**.
- `src/config.js` só tem o que é público: o endereço do projeto e a **chave publicável**. A chave secreta do Supabase,
  a chave secreta do Google, a do Resend e os tokens nunca entram aqui nem no repositório.

## Supabase (projeto `arquionie`, São Paulo)

Configurações feitas no painel, em ordem:

1. **Authentication › URL Configuration** — Site URL `https://arquionie.com.br`; Redirect URLs
   `http://localhost:5173/**` e `https://arquionie.com.br/**` (a da Vercel entra quando o projeto existir).
2. **Authentication › Sign In / Providers › Email** — confirmação do e-mail ligada, senha mínima de 8 caracteres,
   código de 6 dígitos válido por 3600 segundos. **Google** ligado com o cliente Web do projeto Arquionie no Google Cloud.
3. **Authentication › Emails › Templates** (só depois do SMTP próprio: sem ele o Supabase não deixa editar os modelos, e o
   e-mail padrão traz um link em inglês, que o site também aceita) — *Confirm signup* com `supabase/templates/confirmar-cadastro.html` (assunto
   "Seu código do Arquionie™") e *Reset password* com `supabase/templates/recuperar-senha.html` (assunto "Nova senha do
   Arquionie™"). Os modelos trazem o código (`{{ .Token }}`), que o site confirma com `verifyOtp`.
4. **SQL Editor** — rodar `supabase/migrations/20261003000000_perfis_e_computadores.sql` uma vez (perfis espelhando o
   cadastro e computadores conectados, com as regras de acesso).
   Depois, `supabase/migrations/20261003010000_contador_de_downloads.sql` (cada clique em BAIXAR e o total público).
5. **Depois do DNS** — SMTP próprio pelo Resend (`suporte@arquionie.com.br`). Até lá, o envio embutido do Supabase só
   manda e-mail para quem é membro da organização no Supabase e poucos por hora: serve para testar com o e-mail do
   Arquionie, não para os colaboradores.
6. **Licenças e conexão pelo navegador** (plano 17 do repositório do plugin, 05/10/2026; o programa e o plugin do Revit):
   1. **SQL Editor:** rodar `supabase/migrations/20261005010000_licencas_e_conexao_pelo_navegador.sql`. Ela já inclui o
      que a `20261005000000_registrar_computador.sql` faz, com os computadores separados por produto. Por isso a
      `20261005000000` **nunca** roda depois dela: recriaria o índice antigo e misturaria o programa com o plugin.
      Pode rodar duas vezes sem estragar nada.
   2. **Chave da ficha:** `node supabase/ferramentas/gerar-chave-da-licenca.mjs`.
      - A chave privada vai para a área de transferência: colar em **Edge Functions › Secrets** com o nome
        `LICENCA_CHAVE_PRIVADA`.
      - A pública fica em `supabase/functions/licenca-chave-publica.txt` e vai para o programa e o plugin.
      - **Trocada em 12/10/2026.** Em 11/10, na publicação do item 8, uma senha da limpeza foi colada por engano no
        `LICENCA_CHAVE_PRIVADA`, e a privada de 07/10 se perdeu (o Supabase não mostra o valor). Par novo gerado pelo ÊDI
        com `--substituir`; conferido pelo resumo SHA-256 (o da página bate com o da chave gerada). Nenhum programa tinha a
        pública antiga, então nada mais muda. Para colar um segredo, só a área de cima da página, nunca o menu de uma linha.
   3. **Funções `conectar` e `licenca`:** publicar o `index.ts` de cada uma com a verificação de JWT **desligada**,
      porque quem chama é o programa, sem conta ainda. Pelo painel (Edge Functions › Deploy a new function › Via
      editor) ou pelo CLI: `npx supabase functions deploy conectar --project-ref sowazotriildoeaxbhkl --no-verify-jwt`,
      e o mesmo para `licenca`.
   4. **Teste local**, sem tocar no Supabase de verdade: `npm i --no-save @electric-sql/pglite` e depois
      `node supabase/testes/funcoes.test.mjs` (roda também o teste do banco).
   5. **Telas** (mockups aprovados pelo ÊDI em 05/10/2026):
      - `/conectar`, onde a pessoa autoriza o computador;
      - MINHA CONTA › LICENÇAS, com as licenças compradas e o PASSAR PARA UM COLEGA;
      - `/gestao` › LICENÇAS (`/gestao#licencas`).
      Para conferir sem conta, no `npm run dev`, abrir com `?amostra` na URL. Ex.:
      `/conectar?codigo=KMTR-4QPX&amostra=limite` (também `aguardando`, `vencida`, `cancelada`, `inexistente`),
      `/conta?amostra=1#licencas` e `/gestao?amostra=1#licencas`. Fora do servidor de desenvolvimento, o `?amostra` não
      faz nada.
   6. **Teste no ar**, com o site e as funções publicados: `node supabase/testes/no-ar.mjs` faz o papel do plugin e
      mostra um link. Abrir o link, entrar com a conta e clicar AUTORIZAR. O teste confere a ficha com a chave
      pública, renova e sai, e o computador de teste some da conta. Rodado em 07/10/2026 com a conta do ÊDI: tudo
      certo.

7. **Tours no link** (o tour do passeio no celular do cliente; mockup `docs/mockups/tour-no-link.html` do repositório do
   programa, aprovado por ÊDI em 10/10/2026). Só com o ÊDI, uma vez, nesta ordem:
   1. **R2 › Create bucket** `arquionie-tours` (separado do `arquionie-downloads`: a chave da função só alcança os tours). Em
      **Settings › Public access › Custom Domains**, ligar `tours.arquionie.com.br` (o domínio já está na Cloudflare).
   2. No mesmo bucket, **Settings › CORS Policy**:
      `[{"AllowedOrigins":["https://www.arquionie.com.br","https://arquionie.com.br"],"AllowedMethods":["GET","HEAD"],"AllowedHeaders":["*"],"MaxAgeSeconds":86400}]`.
   3. **R2 › Manage API Tokens › Create API Token**: *Object Read & Write*, só no bucket `arquionie-tours`. Guardar o Access
      Key ID e o Secret Access Key.
   4. **Supabase › Edge Functions › Secrets**: `R2_CONTA` (o Account ID da Cloudflare, o mesmo do `ARQUIONIE_R2_CONTA`),
      `R2_CHAVE` (o Access Key ID) e `R2_SEGREDO` (o Secret Access Key).
   5. **SQL Editor:** rodar `supabase/migrations/20261010000000_tours.sql` (pode rodar duas vezes).
   6. **Função `tours`:** publicar com a verificação de JWT **ligada** (quem chama tem conta):
      `npx supabase functions deploy tours --project-ref sowazotriildoeaxbhkl`.
   7. **Teste local**, sem tocar no Supabase nem no R2: `node supabase/testes/tours.test.mjs` (confere também a assinatura
      do R2 pelos exemplos da AWS).
   8. **Telas:** MINHA CONTA › TOURS (`/conta?amostra=1#tours` no `npm run dev`) e a página do cliente em `/t/CÓDIGO`
      (`public/tour`, copiada do repositório do programa por `node ferramentas/tour/copiar-para-o-site.mjs`).
   Durante o lançamento, o tour fica liberado para toda conta (`ajustes_tours.livres_no_lancamento`); o limite é de 20
   publicados por conta (`ajustes_tours.limite`).
   **Publicado em 11/10/2026**, com o ÊDI, junto com o item 8: o bucket com o domínio (ativo) e o CORS (conferido: libera
   `www.arquionie.com.br` e recusa outra origem), o token do R2 só nesse bucket, os três segredos do R2, a migração no SQL
   Editor (conferido: `tour_abrir('ZZZZZZ')` responde `inexistente` e a tabela recusa o `anon`) e a função `tours`.

8. **ENVIAR PARA O CLIENTE** (a página do cliente em `/t/CÓDIGO`: o vídeo, o tour e as imagens, SOLICITAR AJUSTES e APROVAR O
   PROJETO; mockup `docs/mockups/enviar-para-o-cliente.html` e contrato no doc 65 do repositório do programa, aprovados por ÊDI em
   11/10/2026). Usa o bucket e os segredos do R2 do item 7. Só com o ÊDI, uma vez, nesta ordem:
   1. **SQL Editor:** rodar `supabase/migrations/20261011000000_apresentacoes.sql` (depois da dos tours; pode rodar duas vezes).
   2. **Supabase › Edge Functions › Secrets:** `LIMPEZA_SEGREDO` (uma senha longa qualquer, só para a tarefa diária) e
      `RESEND_API_KEY` (no Resend, uma chave que só envia, do domínio `arquionie.com.br`: o aviso por e-mail ao escritório quando o
      cliente pede ajustes ou aprova; sem ela, o aviso fica só no programa). Opcional: `AVISO_DE` (de fábrica,
      `Arquionie <suporte@arquionie.com.br>`).
   3. **Funções:** `npx supabase functions deploy apresentacoes --project-ref sowazotriildoeaxbhkl` (com a verificação de JWT ligada: quem
      chama é o programa, com a conta) e `npx supabase functions deploy cliente --no-verify-jwt --project-ref sowazotriildoeaxbhkl` (sem
      conta: é a página do cliente). As duas levam junto a pasta `supabase/functions/_compartilhado`.
   4. **Supabase › Integrations › Cron › Create job:** todo dia às 3h, *HTTP Request* `POST
      https://sowazotriildoeaxbhkl.supabase.co/functions/v1/cliente`, cabeçalho `x-limpeza` com o `LIMPEZA_SEGREDO` e corpo
      `{"acao":"limpar"}` (os envios vencidos, um ano depois, saem do R2; a página diz que o material expirou).
   5. **Teste local**, sem tocar no Supabase nem no R2: `node supabase/testes/apresentacoes.test.mjs` (o banco num Postgres local, o R2
      e o Resend de mentira).
   6. **A página sem o servidor:** `public/apresentacao/index.html?prova=PASTA`, com o envio de prova montado por
      `node ferramentas/apresentacao/envio-de-prova.mjs` do repositório do programa (o `abrir.json` e os arquivos pela impressão).
   O `/t/CÓDIGO` passa a abrir `public/apresentacao` (o `vercel.json`); o código de um tour de antes (item 7) vai para a página do tour.
   O tour dentro da página é o `public/tour` (com a `maquete.js`), copiado por `node ferramentas/tour/copiar-para-o-site.mjs`.
   **Publicado em 11/10/2026**, com o ÊDI (roteiro `docs/roteiros/publicar-o-enviar-para-o-cliente.md` do repositório do programa):
   - **Banco:** a `20261011000000_apresentacoes.sql`, depois da dos tours. Conferido sem gravar nada:
     `apresentacao_situacao('ZZZZZZ')` responde `inexistente`; as tabelas e a `apresentacao_vencidas` recusam o `anon`.
   - **Segredos:** `LIMPEZA_SEGREDO`. A `RESEND_API_KEY` **não** foi criada, por decisão do ÊDI (11/10/2026): o `suporte@` é o
     suporte do software, não um canal entre o escritório e o cliente dele, e as respostas do cliente aparecem no programa, ao
     abrir o projeto (etapa 4 do doc 65). Sem a chave, a função `cliente` não manda e-mail.
   - **Funções** `tours`, `apresentacoes` e `cliente` (esta com `--no-verify-jwt`), por `npx supabase functions deploy …
     --use-api` (sem Docker) com uma chave de acesso temporária do Supabase: o login do CLI neste computador é o da conta da
     Palheta, que não enxerga o projeto `arquionie`. Conferido: `tours` e `apresentacoes` recusam quem não tem conta; `cliente`
     atende sem conta e recusa o `limpar` sem o segredo.
   - **Tarefa diária:** as extensões `pg_cron` e `pg_net` ligadas; a tarefa `limpar-apresentacoes-vencidas`, `0 6 * * *` (o
     relógio do Supabase é UTC: 3h em Brasília), POST na função `cliente` com o cabeçalho `x-limpeza` e o corpo
     `{"acao":"limpar"}`. Rodada à mão às 12h12: a função respondeu 200.
   - **Site:** o `git push` dos 7 commits que esperavam (até `4260ec1`). Conferido: `https://www.arquionie.com.br/t/ZZZZZZ`
     diz "Apresentação não encontrada" e a página responde sem `X-Frame-Options` (o sistema Palheta pode abri-la num `iframe`).

9. **A EQUIPE do escritório, as APRESENTAÇÕES com os ajustes e o plano personalizado** (mockups
   `docs/mockups/equipe-e-apresentacoes` e `docs/mockups/comentarios-do-cliente` e o doc 65, §7, do repositório do programa, aprovados
   por ÊDI em 11/10/2026). **Ainda não publicado.** Só com o ÊDI, uma vez, nesta ordem:
   1. **SQL Editor:** rodar `supabase/migrations/20261011010000_equipe_e_plano.sql` (depois da `20261011000000_apresentacoes.sql`; pode
      rodar duas vezes). Ela troca a `apresentacao_enviar` e a `minhas_apresentacoes` por versões novas: rodar **antes** de publicar a
      função `apresentacoes` de novo, e nunca rodar a `20261011000000` depois dela.
   2. **Função:** `npx supabase functions deploy apresentacoes --project-ref sowazotriildoeaxbhkl` (como no item 8, com a verificação de
      JWT ligada): o ENVIAR passa a aceitar o envio em nome do escritório (`escritorio`) e guarda quem enviou.
   3. **Teste local:** `node supabase/testes/apresentacoes.test.mjs` (88 conferências, com a equipe, o feito, o lido de cada pessoa e o
      pedido de plano).
   4. **Site:** o `git push`. As telas para conferir sem conta, no `npm run dev`: `/conta?amostra=1` (a conta do responsável, com as
      APRESENTAÇÕES e a EQUIPE), `/conta?amostra=equipe` (a área do escritório de quem é da equipe), `/conta?amostra=convite` (a
      primeira vez), `/gestao?amostra=1#pedidos` (os PEDIDOS DE PLANO) e `/conectar?codigo=KMTR-4QPX&amostra=limite` (o quarto
      computador, com o SOLICITAR PLANO PERSONALIZADO).
   O que muda: MINHA CONTA ganha as abas das áreas (a MINHA ÁREA e cada escritório em que a pessoa está), o convite para confirmar, as
   APRESENTAÇÕES no lugar dos TOURS (os tours de antes ficam embaixo, até vencer) e a EQUIPE; a `/gestao` ganha os PEDIDOS DE PLANO.
   O site passa às cores novas do programa (o coral sereno, os campos nos tons dele e a terracota no botão principal; o `#E76353`
   fica só no leão).

10. **A LICENÇA ÚNICA e a gestão que vem do Palheta Flow** (plano 18 do repositório do plugin, decisões do ÊDI de 14/10/2026).
   **Ainda não publicado.** Só com o ÊDI, nesta ordem:
   1. **Teste local:** `node supabase/testes/gestao-flow.test.mjs` (49 conferências: licença única, preços, cupons, importação do
      Flow, destinatários, campanha com lotes, intervalo, limite do dia, pausa e cancelamento, descadastro, aulas e feedbacks; roda a
      migração duas vezes).
   2. **SQL Editor (Arquionie):** rodar `supabase/migrations/20261015000000_licenca_unica_e_gestao_do_flow.sql` (depois da
      `20261005010000`; pode rodar duas vezes). A partir daí toda licença vale no programa e no plugin; os computadores continuam
      três em cada um.
   3. **SQL Editor (escritório), só leitura:** `supabase/ferramentas/exportar-do-flow.sql` gera o arquivo com preços, cupons,
      cadastros, descadastros, campanhas, aulas e feedbacks do Flow. Guardar numa pasta particular. A importação entra com a tela
      do /gestao (ainda por fazer, depois do mockup).
   4. **Telas (mockup aprovado em 15/10/2026):** o /gestao ganha PREÇOS E CUPONS (com IMPORTAR DADOS DO FLOW), CAMPANHAS, VERSÕES E
      AULAS e FEEDBACKS; o LIBERAR deixa de pedir o produto (licença única). Para conferir sem conta: `/gestao?amostra=1#precos`
      (e `#campanhas`, `#versoes`, `#feedbacks`).
   5. **Funções `campanhas` e `feedback`** (testadas por `node supabase/testes/envio.test.mjs`, 19 conferências). Só com o ÊDI:
      - **Resend:** uma chave só de envio (Sending access, domínio arquionie.com.br), guardada em Edge Functions › Secrets como
        `RESEND_CAMPANHAS`. **Nunca** com o nome `RESEND_API_KEY`: com esse nome a função `cliente` passaria a mandar e-mail
        (decisão do ÊDI de 11/10/2026).
      - **Publicar:** `npx supabase functions deploy campanhas --project-ref sowazotriildoeaxbhkl --no-verify-jwt --use-api` e o mesmo
        para `feedback`, com uma chave de acesso temporária do Supabase na variável `SUPABASE_ACCESS_TOKEN` do terminal dele.
      - **SQL Editor:** `supabase/ferramentas/ligar-envio-das-campanhas.sql` sorteia o segredo da tarefa no cofre (ninguém copia) e
        agenda a `enviar-campanhas` a cada 5 minutos.
      - **Conferir:** TESTE PARA MIM na aba CAMPANHAS.

11. **A COMPRA DO PRO** (plano 19 do repositório do plugin, `docs/migracao-arkiton/19-plano-compra-do-pro.md`; mockups aprovados pelo
   ÊDI em 15/10/2026). **Banco pronto e testado; telas ainda por fazer; nada publicado.** Só com o ÊDI, nesta ordem:
   1. **Teste local:** `node supabase/testes/compra.test.mjs` (48 conferências: o plano `plugin` da licença, os preços dos planos, o
      formulário sem conta com o cupom só no anual, liberar, renovar, vencer, encerrar e cancelar; roda a migração duas vezes).
   2. **SQL Editor (Arquionie):** rodar `supabase/migrations/20261016000000_compra_do_pro.sql` (depois da `20261015000000`; pode rodar
      duas vezes).
      - A licença ganha o plano `plugin` (só o plugin); o `pro` continua completo. O programa ignora a `plugin`; o plugin recebe `pro`
        na ficha.
      - A tabela `precos` ganha os quatro valores dos planos: plugin 69 e 39, Arquionie 119 e 79 (o anual por mês).
      - A tabela `pedidos`, com o formulário `pedido_criar` (sem conta) e as funções do /gestao.
   3. **Telas, depois do banco:** o quadro de preço nas duas páginas, o `/comprar` com COMPRAR PELO WHATSAPP (grava e leva ao
      WhatsApp de vendas 5511991961580 com a mensagem pronta; se gravar falhar, leva assim mesmo) e a aba PEDIDOS em lista. As telas
      que mostram o plano da licença (LICENÇAS, MINHA CONTA, /conectar) passam a escrever PLUGIN PRO para o `plugin`.

12. **O COMERCIAL, o CRM grátis** (doc 68 e o contrato no doc 72 do repositório do programa; mockup `docs/mockups/crm-gratis`, aprovado
   por ÊDI em 16/10/2026). **Banco, função e telas prontos e testados; nada publicado.** Só com o ÊDI, uma vez, nesta ordem:
   1. **Teste local**, sem tocar no Supabase nem no R2:
      - `node supabase/testes/comercial.test.mjs` (98 conferências: o primeiro acesso, o formulário com cada tipo de resposta, o
        quadro e as regras, o orçamento, a proposta pelos três jeitos e o aceite, os ajustes, a equipe, os limites do grátis e do PRO,
        o /gestao e a tarefa diária; o banco em UTC como o Supabase; roda a migração duas vezes);
      - `node supabase/testes/comercial-funcao.test.mjs` (11 conferências da função: o Turnstile, o PDF e a tarefa).
   2. **As telas sem conta** (`npm run dev`): o painel em `/painel/comercial?amostra` (o primeiro acesso em `?amostra=novo`), o
      formulário do cliente em `/f/LIMA-CASA?amostra` e a proposta em `/p/QX7M2KAB?amostra`.
   3. **SQL Editor (Arquionie):** rodar `supabase/migrations/20261017000000_comercial.sql` (depois da `20261016000000`; pode rodar duas
      vezes). Ela cria as tabelas e as funções do Comercial. Ninguém lê as tabelas direto. No lançamento, os limites do grátis ficam
      desligados (`ajustes_comercial.livres_no_lancamento`).
   4. **Cloudflare › Turnstile › Add widget:** nome `Arquionie Comercial`, domínios `arquionie.com.br` e `www.arquionie.com.br`, modo
      *Managed*. A **Site Key** (pública) vai em `TURNSTILE_CHAVE`, no `src/config.js`. A **Secret Key** vai no passo 6.
   5. **R2 › `arquionie-tours` › Settings › CORS Policy:** o PDF da proposta sobe do navegador direto para o R2, então o `PUT` entra
      junto do `GET`:
      `[{"AllowedOrigins":["https://www.arquionie.com.br","https://arquionie.com.br"],"AllowedMethods":["GET","HEAD","PUT"],"AllowedHeaders":["*"],"MaxAgeSeconds":86400}]`.
      O PDF fica em `comercial/<pedido>/<CÓDIGO>.pdf` e abre por `tours.arquionie.com.br`.
   6. **Supabase › Edge Functions › Secrets:** `TURNSTILE_SEGREDO` (a Secret Key do passo 4), `COMERCIAL_SAL` e
      `COMERCIAL_TAREFA_SEGREDO` (duas senhas longas quaisquer: o sal da impressão do endereço de quem manda o formulário e a senha da
      tarefa diária). Os do R2 (`R2_CONTA`, `R2_CHAVE`, `R2_SEGREDO`) já existem desde o item 7.
   7. **Função `comercial`:** `npx supabase functions deploy comercial --project-ref sowazotriildoeaxbhkl --no-verify-jwt --use-api`
      (sem a verificação de JWT: o formulário não tem conta; o PDF confere a conta dentro da função). Como no item 8, com uma chave de
      acesso temporária do Supabase.
   8. **Tarefa diária:** `comercial-diaria`, `0 6 * * *` (3h em Brasília), POST
      `https://sowazotriildoeaxbhkl.supabase.co/functions/v1/comercial` com o cabeçalho `x-tarefa` (o `COMERCIAL_TAREFA_SEGREDO`) e o
      corpo `{"acao":"tarefa"}`: a regra PARADO (opcional, em Ajustes) e os PDFs dos pedidos excluídos saindo do R2.
   9. **Site:** juntar a branch `comercial` na `main`, com a `TURNSTILE_CHAVE` preenchida, e o `git push`. Conferir em `https://www.arquionie.com.br/f/ZZZZ`
      ("Formulário não encontrado") e, com uma conta de teste, o primeiro acesso, um pedido pelo formulário e uma proposta pelo modelo.

## Pendente

- Textos da página inicial para ÊDI revisar. As imagens são capturas de amostras do programa (`public/imagens`); faltam
  imagens com a marca nova de planta, corte, elétrica e IA. As dos carros usam modelos baixados (Sketchfab): para o site
  público, trocar por amostras só com peças nossas.
- Termos e privacidade são **rascunho para os testes internos**: o advogado revisa antes da abertura (CNPJ, foro,
  encarregado).
- O link de download depende do R2 e do manifesto `https://baixar.arquionie.com.br/estavel/versao.json` (com CORS
  liberado para `arquionie.com.br`); sem ele, a página diz que a versão está sendo preparada.
- Excluir a conta é por pedido em e-mail até existir a função do servidor; painel interno (contas, downloads,
  computadores) e registro dos computadores pelo programa vêm nas próximas etapas.
