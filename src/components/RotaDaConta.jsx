import { Navigate, useLocation } from 'react-router-dom';
import { useSessao } from '@/lib/Sessao';
import { cadastroCompleto } from '@/lib/conta';
import { AMOSTRA } from '@/lib/licencas';

// Páginas que pedem a conta: sem sessão, vai para ENTRAR e volta depois; quem entrou pelo Google e ainda não
// escolheu a atuação nem aceitou os termos passa antes por COMPLETAR (decisão de 02/10/2026).
export default function RotaDaConta({ children }) {
  const { usuario, carregando } = useSessao();
  const local = useLocation();
  const volta = encodeURIComponent(local.pathname + local.search);
  if (AMOSTRA) return children; // só no servidor de desenvolvimento, com ?amostra: conferir a tela sem conta
  if (carregando) return <p className="px-4 py-16 text-center text-aqi-muted">Carregando…</p>;
  if (!usuario) return <Navigate to={`/entrar?volta=${volta}`} replace />;
  if (!cadastroCompleto(usuario)) return <Navigate to={`/completar?volta=${volta}`} replace />;
  return children;
}
