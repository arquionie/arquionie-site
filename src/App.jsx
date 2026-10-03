import { Route, Routes } from 'react-router-dom';
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
import { NaoEncontrada, Privacidade, Termos } from '@/pages/Textos';

export default function App() {
  return (
    <Routes>
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
          path="/conta"
          element={
            <RotaDaConta>
              <Conta />
            </RotaDaConta>
          }
        />
        <Route path="/gestao" element={<Gestao />} />
        <Route path="/termos" element={<Termos />} />
        <Route path="/privacidade" element={<Privacidade />} />
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}
