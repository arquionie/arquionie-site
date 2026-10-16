// Gerado por ferramentas/tokens/gerar_tokens.py a partir de design/tokens/tokens.json e design/cores/cores.json; não editar aqui.
// Uso no tailwind.config.js do site: presets: [require('<caminho>/tailwind-preset.cjs')], e o tokens.css carregado antes do Tailwind.
// As cores mudam com data-tema e data-modo no <html>; os raios seguem o modo (cápsula e cartão no amigável, retos no técnico).
// O que só um modo tem vem com o prefixo (amg-, tec-): bg-amg-destaque-suave, h-amg-altura-campo, text-amg-titulo-grande.
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
        'sucesso': 'var(--sucesso)',
        'amg-superficie-escolhida': 'var(--amg-superficie-escolhida)',
        'amg-destaque-suave': 'var(--amg-destaque-suave)',
        'amg-whatsapp': 'var(--amg-whatsapp)',
        'amg-whatsapp-suave': 'var(--amg-whatsapp-suave)',
        'amg-sucesso-suave': 'var(--amg-sucesso-suave)',
        'amg-informacao': 'var(--amg-informacao)',
        'amg-informacao-suave': 'var(--amg-informacao-suave)',
        'amg-chave-ligada': 'var(--amg-chave-ligada)',
        'amg-etapa-1': 'var(--amg-etapa-1)',
        'amg-etapa-2': 'var(--amg-etapa-2)',
        'amg-etapa-3': 'var(--amg-etapa-3)',
        'amg-etapa-4': 'var(--amg-etapa-4)',
        'amg-etapa-5': 'var(--amg-etapa-5)',
        'amg-etapa-6': 'var(--amg-etapa-6)',
        'tec-texto-forte': 'var(--tec-texto-forte)',
        'tec-campo-rotulo': 'var(--tec-campo-rotulo)',
        'tec-campo-valor': 'var(--tec-campo-valor)',
        'tec-aviso': 'var(--tec-aviso)',
        'tec-aprovado': 'var(--tec-aprovado)'
      },
      borderRadius: {
        toque: 'var(--raio-toque)',
        cartao: 'var(--raio-cartao)',
        dentro: 'var(--raio-dentro)',
      },
      boxShadow: { cartao: 'var(--sombra-cartao)', 'amg-janela': 'var(--amg-sombra-janela)' },
      fontFamily: { letra: ['var(--letra)'], aparelho: ['var(--font-aparelho)'], tecnico: ['var(--font-tecnico)'] },
      fontSize: {
        'amg-titulo-capa': ['44px', { lineHeight: '1.08', fontWeight: '700', letterSpacing: '-0.03em' }],
        'amg-frase': ['17px', { lineHeight: '1.5', fontWeight: '400' }],
        'amg-titulo-grande': ['32px', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.025em' }],
        'amg-titulo': ['26px', { lineHeight: '1.15', fontWeight: '700', letterSpacing: '-0.02em' }],
        'amg-secao': ['17px', { lineHeight: '1.3', fontWeight: '700', letterSpacing: '-0.01em' }],
        'amg-corpo': ['14px', { lineHeight: '1.45', fontWeight: '400' }],
        'amg-corpo-celular': ['15px', { lineHeight: '1.45', fontWeight: '400' }],
        'amg-valor': ['14px', { lineHeight: '1.45', fontWeight: '600' }],
        'amg-legenda': ['13px', { lineHeight: '1.4', fontWeight: '400' }],
        'amg-rotulo': ['12px', { lineHeight: '1.3', fontWeight: '600', letterSpacing: '0.06em' }],
        'tec-titulo': ['16px', { lineHeight: '1.3', fontWeight: '600' }],
        'tec-corpo': ['12px', { lineHeight: '1.5', fontWeight: '400' }],
        'tec-auxiliar': ['11px', { lineHeight: '1.4', fontWeight: '400' }],
        'tec-botao': ['11.5px', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '0.06em' }],
        'tec-rotulo': ['11px', { lineHeight: '1.3', fontWeight: '600', letterSpacing: '0.1em' }]
      },
      height: {
        botao: 'var(--altura-botao)',
        'botao-pequeno': 'var(--altura-botao-pequeno)',
        'amg-altura-botao-grande': 'var(--amg-altura-botao-grande)',
        'amg-toque-minimo': 'var(--amg-toque-minimo)',
        'amg-altura-campo': 'var(--amg-altura-campo)',
        'amg-altura-opcao': 'var(--amg-altura-opcao)'
      },
      minHeight: {
        botao: 'var(--altura-botao)',
        'botao-pequeno': 'var(--altura-botao-pequeno)',
        'amg-altura-botao-grande': 'var(--amg-altura-botao-grande)',
        'amg-toque-minimo': 'var(--amg-toque-minimo)',
        'amg-altura-campo': 'var(--amg-altura-campo)',
        'amg-altura-opcao': 'var(--amg-altura-opcao)'
      },
    },
  },
};
