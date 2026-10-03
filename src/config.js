// Endereços e chaves públicas do Arquionie™. Nada aqui é segredo: a chave publicável do Supabase é feita para
// ficar no navegador, e o que ela pode fazer é limitado pelas regras de cada tabela (RLS). A chave secreta nunca
// entra no site nem no repositório.
export const SUPABASE_URL = 'https://sowazotriildoeaxbhkl.supabase.co';
export const SUPABASE_CHAVE_PUBLICAVEL = 'sb_publishable_aSoXh3xrkPi2T-cd0pslWw_Jj8n9xSY';

// Manifesto de versões no R2 (doc 57, §4.4): a mesma fonte do aviso de atualização no programa.
export const MANIFESTO_URL = 'https://baixar.arquionie.com.br/estavel/versao.json';

export const EMAIL_CONTATO = 'conta@arquionie.com.br';

// Versão dos termos aceita no cadastro; muda quando o advogado revisar (decisão de 02/10/2026).
export const VERSAO_TERMOS = 'rascunho-2026-10';

export const ATUACOES = [
  { valor: 'arquiteto', rotulo: 'ARQUITETO(A)' },
  { valor: 'engenheiro', rotulo: 'ENGENHEIRO(A)' },
  { valor: 'estudante', rotulo: 'ESTUDANTE' },
  { valor: 'outra', rotulo: 'OUTRA' },
];
