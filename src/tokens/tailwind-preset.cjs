// Gerado por ferramentas/tokens/gerar_tokens.py a partir de design/tokens/tokens.json e design/cores/cores.json; não editar aqui.
// Uso no tailwind.config.js do site: presets: [require('<caminho>/tailwind-preset.cjs')], e o tokens.css carregado antes do Tailwind.
// As cores mudam com data-tema e data-modo no <html>; os raios seguem o modo (cápsula e cartão no amigável, retos no técnico).
module.exports = {
  theme: {
    extend: {
      colors: {
        'fundo': 'var(--fundo)',
        'superficie': 'var(--superficie)',
        'superficie-2': 'var(--superficie-2)',
        'linha': 'var(--linha)',
        'texto': 'var(--texto)',
        'texto-apagado': 'var(--texto-apagado)',
        'destaque': 'var(--destaque)',
        'destaque-texto': 'var(--destaque-texto)',
        'botao-1': 'var(--botao-1)',
        'botao-1-texto': 'var(--botao-1-texto)',
        'botao-2': 'var(--botao-2)',
        'botao-2-texto': 'var(--botao-2-texto)',
        'botao-3': 'var(--botao-3)',
        'botao-3-texto': 'var(--botao-3-texto)',
        'sucesso': 'var(--sucesso)'
      },
      borderRadius: {
        toque: 'var(--raio-toque)',
        cartao: 'var(--raio-cartao)',
        dentro: 'var(--raio-dentro)',
      },
      boxShadow: { cartao: 'var(--sombra-cartao)' },
      fontFamily: { letra: ['var(--letra)'] },
      height: { botao: 'var(--altura-botao)', 'botao-pequeno': 'var(--altura-botao-pequeno)' },
    },
  },
};
