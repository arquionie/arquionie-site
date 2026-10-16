import { Icone } from '@/components/Formulario';

// O cartão das telas de conta (entrar, criar conta, confirmar, recuperar, completar e conectar), no modo AMIGÁVEL (mockup site-amigavel,
// aprovado por ÊDI em 16/10/2026): um cartão só, com o leão pequeno no alto, o título e a nota; o formulário; e os botões embaixo. No
// computador eles ficam lado a lado, o mais forte à direita; no celular, um em cima do outro, o mais forte em cima. "feito" troca o
// leão pelo sinal verde.
export default function Cartao({ titulo, nota, children, rodape, botoes, aoEnviar, centro, feito }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoEnviar?.();
      }}
      noValidate
      className={`mx-auto flex w-full max-w-[420px] flex-col gap-3.5 rounded-cartao bg-superficie p-5 shadow-cartao sm:p-6 ${centro ? 'items-center text-center' : ''}`}
    >
      <div className="flex flex-col gap-1.5">
        {feito ? (
          // o sinal do feito no lugar do leão
          <span className="mx-auto mb-1 grid h-16 w-16 place-items-center rounded-toque bg-amg-sucesso-suave text-sucesso">
            <Icone nome="ok" tamanho={30} />
          </span>
        ) : (
          <img src="/leao.png" alt="" className={`mb-1 h-14 w-14 ${centro ? 'mx-auto' : ''}`} />
        )}
        <h1 className="text-amg-titulo">{titulo}</h1>
        {nota && <p className="text-texto-apagado">{nota}</p>}
      </div>
      {children}
      {rodape && <div className="text-amg-legenda text-texto-apagado">{rodape}</div>}
      {botoes && <div className={`mt-1 flex w-full flex-col-reverse gap-2 sm:flex-row sm:flex-wrap ${centro ? 'sm:justify-center' : 'sm:justify-end'}`}>{botoes}</div>}
    </form>
  );
}

// Em volta do cartão: o fundo da página com a margem do celular (16 px) e do computador.
export function Miolo({ children }) {
  return <section className="px-4 py-8 sm:py-12">{children}</section>;
}
