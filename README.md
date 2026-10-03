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
