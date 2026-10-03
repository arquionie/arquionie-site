/** Cores do tema escuro do programa (App.axaml do Arquionie): o site é a mesma identidade. */
export default {
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
          coral: '#E76353', // só identidade: títulos, abas, barra; nunca botão
          campo: '#794B49', // laranja fechado: rótulos e botões de confirmação
          valor: '#6C4241', // metade mais fechada do campo
          campohover: '#8C5855',
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
