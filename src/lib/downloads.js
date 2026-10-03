import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Total de downloads para a página inicial (ÊDI, 03/10/2026: aparece desde o primeiro, sempre o número real).
// Sem a função no banco, ou sem conexão, devolve null e a página não mostra o contador.
export function useTotalDownloads() {
  const [total, setTotal] = useState(null);
  useEffect(() => {
    let ativo = true;
    supabase.rpc('total_downloads').then(({ data, error }) => {
      if (ativo && !error && typeof data === 'number') setTotal(data);
    });
    return () => {
      ativo = false;
    };
  }, []);
  return total;
}

// Todo clique em BAIXAR conta. Não segura o download: se falhar, o arquivo baixa do mesmo jeito.
export function registrarDownload(versao) {
  supabase.rpc('registrar_download', { p_versao: versao ?? '' }).then(() => {});
}

export function numeroLegivel(n) {
  return Number(n).toLocaleString('pt-BR');
}
