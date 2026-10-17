import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Moldura from '@/components/Moldura';
import RotaDaConta from '@/components/RotaDaConta';
import Inicio from '@/pages/Inicio';
import Baixar from '@/pages/Baixar';
import Versoes from '@/pages/Versoes';
import Entrar from '@/pages/Entrar';
import CriarConta from '@/pages/CriarConta';
import Confirmar from '@/pages/Confirmar';
import Recuperar from '@/pages/Recuperar';
import Completar from '@/pages/Completar';
import Conta from '@/pages/Conta';
import Gestao from '@/pages/Gestao';
import Programa from '@/pages/Programa';
import Conectar from '@/pages/Conectar';
import { NaoEncontrada, Privacidade, Termos } from '@/pages/Textos';

// O COMERCIAL (o CRM grátis) e as páginas do cliente dele carregam só quando alguém abre: não pesam no resto do site.
const Comercial = lazy(() => import('@/pages/Comercial'));
const FormularioDoCliente = lazy(() => import('@/pages/ComercialPublico').then((m) => ({ default: m.FormularioDoCliente })));
const PropostaDoCliente = lazy(() => import('@/pages/ComercialPublico').then((m) => ({ default: m.PropostaDoCliente })));
const Carregando = () => <p className="px-4 py-10 text-center text-texto-apagado">Carregando…</p>;

export default function App() {
  return (
    <Routes>
      {/* as páginas do cliente do Comercial: sem a moldura do site, com a cara do escritório */}
      <Route path="/f/:codigo" element={<Suspense fallback={<Carregando />}><FormularioDoCliente /></Suspense>} />
      <Route path="/p/:codigo" element={<Suspense fallback={<Carregando />}><PropostaDoCliente /></Suspense>} />
      <Route element={<Moldura />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/baixar" element={<Baixar />} />
        <Route path="/versoes" element={<Versoes />} />
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/criar-conta" element={<CriarConta />} />
        <Route path="/confirmar" element={<Confirmar />} />
        <Route path="/recuperar" element={<Recuperar />} />
        <Route path="/completar" element={<Completar />} />
        <Route
          path="/conta/*"
          element={
            <RotaDaConta>
              <Conta />
            </RotaDaConta>
          }
        />
        <Route
          path="/conectar"
          element={
            <RotaDaConta>
              <Conectar />
            </RotaDaConta>
          }
        />
        <Route path="/painel" element={<Navigate to="/painel/comercial" replace />} />
        <Route
          path="/painel/comercial"
          element={
            <RotaDaConta>
              <Suspense fallback={<Carregando />}>
                <Comercial />
              </Suspense>
            </RotaDaConta>
          }
        />
        <Route path="/gestao" element={<Gestao />} />
        <Route path="/programa/:porta" element={<Programa />} />
        <Route path="/termos" element={<Termos />} />
        <Route path="/privacidade" element={<Privacidade />} />
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}
