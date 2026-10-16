import tokens from './src/tokens/tailwind-preset.cjs';

// O site inteiro no modo AMIGÁVEL do sistema de design (ÊDI, 16/10/2026), o /gestao também. As cores, os raios, as alturas e as letras
// vêm só do preset dos tokens (design/tokens do repositório do Arquionie, copiados por ferramentas/tokens/copiar-para-o-site.mjs): elas
// mudam com data-tema e data-modo no <html>. Nada de cor, raio ou altura escrita aqui.
export default {
  presets: [tokens],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
};
