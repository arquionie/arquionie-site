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
