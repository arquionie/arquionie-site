import tokens from './src/tokens/tailwind-preset.cjs';

// Os tokens do sistema de design (design/tokens do repositório do Arquionie, copiados por ferramentas/tokens/copiar-para-o-site.mjs):
// as cores, os raios e as alturas mudam com data-tema e data-modo no <html>. As cores `aqi` abaixo são as do tema escuro do programa
// (App.axaml), que valem até as telas passarem para o modo AMIGÁVEL.
export default {
  presets: [tokens],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        aqi: {
          barra: '#1A1F25', // fundo do cartão e da barra de título
          faixa: '#242B35',
          painel: '#2C3440',
          fundo: '#3B4453',
          borda: '#4A5562',
          texto: '#D4DAE6',
          forte: '#FFFFFF',
          muted: '#9AA6B8',
          lema: '#8FB3D9',
          // As cores do programa desde 11/10/2026 (design/cores/cores.json do repositório do programa, doc 66): o coral sereno, os
          // campos nos tons dele e a terracota no botão de destaque. O #E76353 fica só na marca (o leão).
          coral: '#D47263', // o destaque (coral sereno): títulos, abas, barra; nunca botão
          campo: '#734841', // o rótulo do campo e a opção escolhida
          valor: '#66403A', // a metade mais fechada do campo
          campohover: '#82564F',
          botao: '#A9513F', // o botão de destaque (terracota), com o texto branco
          botaohover: '#B65D4A',
          pagina: '#14181E',
          alerta: '#F2B8A0',
        },
      },
      fontFamily: { sans: ['Inter', '"Segoe UI"', 'system-ui', 'sans-serif'] },
      borderRadius: { DEFAULT: '0', none: '0' },
    },
  },
  plugins: [],
};
