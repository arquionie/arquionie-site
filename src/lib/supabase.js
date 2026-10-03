import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_CHAVE_PUBLICAVEL } from '@/config';

// Sessão guardada no navegador e renovada sozinha; o retorno do Google chega pela URL (PKCE).
export const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICAVEL, {
  auth: {
    persistSession: true,
    storageKey: 'arquionie-sessao',
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
