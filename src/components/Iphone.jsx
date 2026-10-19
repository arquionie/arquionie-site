// O celular das fotos do site: um iPhone 15 desenhado (a moldura, a aresta, os botões do lado, a ilha, a barra de status e a de início),
// com a foto da tela dentro (ÊDI, 19/10/2026, no mockup da /comercial). As medidas seguem a largura do aparelho (cqw), então valem do
// tamanho grande ao pequeno. As cores são as do aparelho, não as do tema; a tela é sempre a clara, a de fábrica das páginas do cliente.
// Os botões do lado são o ::before (o de ligar, à direita) e o ::after (a tecla de ação e, pela sombra, os dois de volume, à esquerda).
export default function Iphone({ src, alt, largura = 780, altura = 1688, carregamento = 'lazy', className = '' }) {
  return (
    <div className={`[container-type:inline-size] ${className}`}>
      <div
        className={`relative rounded-[16.5cqw] bg-[#1C1C1E] p-[3.4cqw] shadow-[inset_0_0_0_.7cqw_#3A3A3D,0_14px_34px_rgba(0,0,0,.22)]
          before:absolute before:-right-[1cqw] before:top-[29%] before:h-[15%] before:w-[1.1cqw] before:rounded-[1cqw] before:bg-[#3A3A3D] before:content-['']
          after:absolute after:-left-[1cqw] after:top-[19%] after:h-[6%] after:w-[1.1cqw] after:rounded-[1cqw] after:bg-[#3A3A3D] after:content-['']
          after:shadow-[0_10cqw_0_#3A3A3D,0_23cqw_0_#3A3A3D]`}
      >
        <div className="relative flex aspect-[393/852] flex-col overflow-hidden rounded-[13.2cqw] bg-[#F3F1EF]">
          <div className="relative flex h-[14cqw] shrink-0 items-center justify-between pl-[9cqw] pr-[7.5cqw] pt-[1cqw] font-semibold text-[#1E1B19] [font-size:4.4cqw]">
            <span aria-hidden="true">9:41</span>
            <span aria-hidden="true" className="absolute left-1/2 top-[2.9cqw] h-[9.2cqw] w-[31cqw] -translate-x-1/2 rounded-[999px] bg-black" />
            <svg viewBox="0 0 66 13" aria-hidden="true" className="w-[17cqw]">
              <g fill="currentColor">
                <rect x="0" y="8" width="3" height="4" rx="1" />
                <rect x="4.5" y="6" width="3" height="6" rx="1" />
                <rect x="9" y="3.5" width="3" height="8.5" rx="1" />
                <rect x="13.5" y="1" width="3" height="11" rx="1" />
                <path d="M28.5 4.2a10.5 10.5 0 0 1 14 0l-1.5 1.6a8.3 8.3 0 0 0-11 0z M31 6.9a6.8 6.8 0 0 1 9 0l-1.5 1.6a4.6 4.6 0 0 0-6 0z M33.5 9.6a3 3 0 0 1 4 0L35.5 11.7z" />
                <rect x="46" y="1.5" width="17" height="9.6" rx="2.7" fill="none" stroke="currentColor" strokeOpacity=".4" />
                <rect x="47.6" y="3.1" width="13.8" height="6.4" rx="1.5" />
                <rect x="64" y="4.7" width="1.5" height="3.4" rx=".7" fillOpacity=".4" />
              </g>
            </svg>
          </div>
          <img src={src} alt={alt} width={largura} height={altura} loading={carregamento} className="min-h-0 w-full flex-1 object-cover object-top" />
          <span aria-hidden="true" className="absolute bottom-[2.2cqw] left-1/2 h-[1.4cqw] w-[35cqw] -translate-x-1/2 rounded-[999px] bg-[#1E1B19]" />
        </div>
      </div>
    </div>
  );
}
