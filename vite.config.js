import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// O segundo build (--ssr src/prerender.jsx) só gera o código que desenha as páginas prontas: não copia a pasta public de novo.
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: { copyPublicDir: !isSsrBuild },
}));
