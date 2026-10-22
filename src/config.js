// Endereços e chaves públicas do Arquionie™. Nada aqui é segredo: a chave publicável do Supabase é feita para
// ficar no navegador, e o que ela pode fazer é limitado pelas regras de cada tabela (RLS). A chave secreta nunca
// entra no site nem no repositório.
export const SUPABASE_URL = 'https://sowazotriildoeaxbhkl.supabase.co';
export const SUPABASE_CHAVE_PUBLICAVEL = 'sb_publishable_aSoXh3xrkPi2T-cd0pslWw_Jj8n9xSY';

// Manifesto de versões no R2 (doc 57, §4.4): a mesma fonte do aviso de atualização no programa.
export const MANIFESTO_URL = 'https://baixar.arquionie.com.br/estavel/versao.json';

// O endereço do site (o link dos tours) e o dos arquivos dos tours (o bucket arquionie-tours do R2, separado do dos downloads).
export const SITE_URL = 'https://www.arquionie.com.br';
export const ARQUIVOS_URL = 'https://tours.arquionie.com.br';

export const EMAIL_CONTATO = 'suporte@arquionie.com.br';

// As redes do Arquionie™: no rodapé do site e nos dados para o Google (o "sameAs"), para ele ligar o site, o perfil e o canal.
export const INSTAGRAM_URL = 'https://www.instagram.com/arquionie/';
export const YOUTUBE_URL = 'https://www.youtube.com/@arquionie';

// A chave pública (site key) do Cloudflare Turnstile do formulário do Comercial (/f/CODIGO): confere que quem manda é uma pessoa.
// Vazia, o formulário não mostra o Turnstile (desenvolvimento); a função comercial confere com o segredo TURNSTILE_SEGREDO.
export const TURNSTILE_CHAVE = '0x4AAAAAAFY--N7t-yCjDCQ7';

// Versão dos termos aceita no cadastro; muda quando o advogado revisar (decisão de 02/10/2026).
export const VERSAO_TERMOS = 'rascunho-2026-10';

// O designer de interiores entrou em 19/10/2026 (um dos três públicos do Comercial). O banco só aceita depois da migração
// 20261019010000_origem_da_conta.sql: rodar ela antes de publicar o site, senão a conta de quem escolhe DESIGNER não nasce.
export const ATUACOES = [
  { valor: 'arquiteto', rotulo: 'ARQUITETO(A)' },
  { valor: 'engenheiro', rotulo: 'ENGENHEIRO(A)' },
  { valor: 'designer', rotulo: 'DESIGNER DE INTERIORES' },
  { valor: 'estudante', rotulo: 'ESTUDANTE' },
  { valor: 'outra', rotulo: 'OUTRA' },
];
