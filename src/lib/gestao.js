import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/Sessao';

// Quem está na lista de administradores do banco (migração do painel do gestor). O banco confere de novo em cada
// função: esconder o link é só conforto, não é a proteção.
export function useEhAdministrador() {
  const { usuario } = useSessao();
  const [admin, setAdmin] = useState(null);
  useEffect(() => {
    let ativo = true;
    if (!usuario) {
      setAdmin(false);
      return undefined;
    }
    supabase.rpc('eh_administrador').then(({ data, error }) => {
      if (ativo) setAdmin(!error && data === true);
    });
    return () => {
      ativo = false;
    };
  }, [usuario]);
  return admin;
}

// Dados de exemplo, só no servidor de desenvolvimento com ?amostra=1, para conferir a tela sem conta de administrador.
export const AMOSTRA = import.meta.env.DEV && new URLSearchParams(window.location.search).has('amostra');

const agora = Date.now();
const dias = (n) => new Date(agora - n * 864e5).toISOString();

export const DADOS_DE_AMOSTRA = {
  resumo: {
    contas: 4, confirmadas: 3, novas_7d: 3, novas_30d: 4, novidades: 2, pelo_google: 1, downloads: 7,
    pessoas_que_baixaram: 3, downloads_7d: 5, computadores: 2,
    por_atuacao: { arquiteto: 2, engenheiro: 1, estudante: 1 },
    por_versao: { '0.2.0': 5, '0.1.0': 2 },
  },
  contas: [
    { id: '1', nome: 'Pessoa de Exemplo Um', email: 'exemplo.um@exemplo.com', atuacao: 'arquiteto', criada_em: dias(1), confirmada_em: dias(1), ultimo_acesso: dias(0), provedores: ['email'], novidades: true, downloads: 3, ultimo_download: dias(0), computadores: 1 },
    { id: '2', nome: 'Pessoa de Exemplo Dois', email: 'exemplo.dois@exemplo.com', atuacao: 'engenheiro', criada_em: dias(3), confirmada_em: dias(3), ultimo_acesso: dias(2), provedores: ['google'], novidades: false, downloads: 3, ultimo_download: dias(2), computadores: 1 },
    { id: '3', nome: 'Pessoa de Exemplo Três', email: 'exemplo.tres@exemplo.com', atuacao: 'estudante', criada_em: dias(6), confirmada_em: dias(6), ultimo_acesso: dias(6), provedores: ['email'], novidades: true, downloads: 1, ultimo_download: dias(6), computadores: 0 },
    { id: '4', nome: 'Pessoa de Exemplo Quatro', email: 'exemplo.quatro@exemplo.com', atuacao: 'arquiteto', criada_em: dias(12), confirmada_em: null, ultimo_acesso: null, provedores: ['email'], novidades: false, downloads: 0, ultimo_download: null, computadores: 0 },
  ],
  downloads: [
    { criado_em: dias(0), versao: '0.2.0', nome: 'Pessoa de Exemplo Um', email: 'exemplo.um@exemplo.com' },
    { criado_em: dias(2), versao: '0.2.0', nome: 'Pessoa de Exemplo Dois', email: 'exemplo.dois@exemplo.com' },
    { criado_em: dias(2), versao: '0.2.0', nome: 'Pessoa de Exemplo Dois', email: 'exemplo.dois@exemplo.com' },
    { criado_em: dias(6), versao: '0.1.0', nome: 'Pessoa de Exemplo Três', email: 'exemplo.tres@exemplo.com' },
  ],
};

export async function lerPainel() {
  if (AMOSTRA) return { ...DADOS_DE_AMOSTRA, erro: null };
  const [resumo, contas, downloads] = await Promise.all([
    supabase.rpc('gestao_resumo'),
    supabase.rpc('gestao_contas'),
    supabase.rpc('gestao_downloads', { p_limite: 300 }),
  ]);
  const erro = resumo.error || contas.error || downloads.error;
  return { resumo: resumo.data, contas: contas.data ?? [], downloads: downloads.data ?? [], erro };
}

// Planilha das contas, para abrir no Excel (separador ponto e vírgula, como o Excel em português espera).
export function planilhaDasContas(contas) {
  const cab = ['Nome', 'E-mail', 'Atuação', 'Criada em', 'Confirmada', 'Entra por', 'Novidades', 'Downloads', 'Último download', 'Computadores'];
  const data = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '');
  const linhas = contas.map((c) => [
    c.nome ?? '', c.email ?? '', c.atuacao ?? '', data(c.criada_em), c.confirmada_em ? 'sim' : 'não',
    (c.provedores ?? []).map((p) => (p === 'google' ? 'Google' : 'e-mail')).join(' e '), c.novidades ? 'sim' : 'não',
    c.downloads ?? 0, data(c.ultimo_download), c.computadores ?? 0,
  ]);
  const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
}
