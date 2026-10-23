import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_CHAVE_PUBLICAVEL } from '@/config';

// Sessão guardada no navegador e renovada sozinha; o retorno do Google chega pela URL (PKCE). Em /programa/PORTA o
// código é do Arquionie™ (o programa troca pela sessão dele): o site não lê a URL ali. O /programa/entrar é do site (a volta do
// Google de quem entra pelo navegador para o programa chega nele) e lê. No build, quando as páginas públicas saem
// prontas (src/prerender.jsx), não há navegador: o cliente existe, mas não guarda nem renova sessão nenhuma.
const noNavegador = typeof window !== 'undefined';

export const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICAVEL, {
  auth: {
    persistSession: noNavegador,
    storageKey: 'arquionie-sessao',
    autoRefreshToken: noNavegador,
    detectSessionInUrl: noNavegador && !/^\/programa\/\d/.test(window.location.pathname),
    flowType: 'pkce',
  },
});
