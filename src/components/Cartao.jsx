// O cartão das telas de conta, no desenho do instalador e da abertura do programa (mockup aprovado em 02/10/2026):
// leão e nome no alto, o formulário centralizado no espaço à direita do leão, a barra coral e os botões embaixo à direita.
export function Marca({ compacta }) {
  return (
    <div className={`flex items-center ${compacta ? 'h-[96px]' : 'h-[150px] sm:h-[186px]'} pt-3`}>
      <img
        src="/leao.svg"
        alt=""
        className={compacta ? 'mx-3.5 h-[76px] w-[76px]' : 'mx-2 h-[96px] w-[96px] sm:ml-[34px] sm:mr-[30px] sm:h-[176px] sm:w-[176px]'}
      />
      <div>
        <div className="text-[12px] font-semibold tracking-[4px] text-aqi-muted">PALHETA</div>
        <div className={`${compacta ? 'text-[28px]' : 'text-[26px] sm:text-[46px]'} font-semibold leading-tight tracking-[2px]`}>
          ARQUIONIE<sup className="relative top-1 align-top text-[12px] tracking-normal">™</sup>
        </div>
        {!compacta && <div className="text-[12px] text-aqi-lema">Modelagem e documentação BIM</div>}
      </div>
    </div>
  );
}

export default function Cartao({ titulo, nota, compacto, children, estado, versao, botoes, aoEnviar }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoEnviar?.();
      }}
      noValidate
      className="relative mx-auto w-full max-w-[680px] bg-aqi-barra px-4 pb-4 shadow-[0_0_0_1px_#000,0_18px_50px_#0008]"
    >
      <div className="absolute right-4 top-3 text-[12px] text-aqi-muted">by Palheta Arquitetura</div>
      <Marca compacta={compacto} />
      <div className={compacto ? 'px-0 pt-1.5 sm:px-3.5' : 'pt-2 sm:ml-[210px]'}>
        <div className={compacto ? '' : 'mx-auto w-full max-w-[360px]'}>
          <h1 className="mb-1 text-[20px] font-semibold leading-tight text-aqi-texto">{titulo}</h1>
          {nota && <p className="mb-3.5 text-[12px] text-aqi-muted">{nota}</p>}
          {children}
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex min-h-[16px] justify-between gap-4 text-[11px] text-aqi-muted">
          <span>{estado}</span>
          <span>{versao}</span>
        </div>
        <div className="mb-[18px] h-[2px] bg-aqi-coral" />
        <div className="flex flex-wrap justify-end gap-2.5">{botoes}</div>
      </div>
    </form>
  );
}
