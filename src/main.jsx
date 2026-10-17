import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { ProvedorSessao } from '@/lib/Sessao';
import '@/index.css';

const site = (
  <React.StrictMode>
    <BrowserRouter>
      <ProvedorSessao>
        <App />
      </ProvedorSessao>
    </BrowserRouter>
  </React.StrictMode>
);

// As páginas públicas chegam prontas do build (src/prerender.jsx): o React só liga os botões no que já está na tela. As outras chegam
// com a raiz vazia e são desenhadas aqui.
const raiz = document.getElementById('root');
if (raiz.firstElementChild) hydrateRoot(raiz, site);
else createRoot(raiz).render(site);
