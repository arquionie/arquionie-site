import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const ContextoSessao = createContext({ sessao: null, usuario: null, carregando: true });

export function ProvedorSessao({ children }) {
  const [sessao, setSessao] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, nova) => setSessao(nova));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <ContextoSessao.Provider value={{ sessao, usuario: sessao?.user ?? null, carregando }}>
      {children}
    </ContextoSessao.Provider>
  );
}

export const useSessao = () => useContext(ContextoSessao);
