import { useEffect, useState } from 'react';
import { Botao } from '@/components/Formulario';
import { mensagemDeErro } from '@/lib/erros';
import { AMOSTRA, AULA_PRIMEIROS_PASSOS, linkWhatsApp, rpc } from '@/lib/comercial';
import { AULA, whatsappNaAula } from '@/lib/aula';

// As peças do COMERCIAL que o painel, o orçamento e os ajustes usam (mockup crm-gratis, aprovado por ÊDI em 16/10/2026): a janela por
// cima da página, o ponto da etapa, o botão do WhatsApp e a abertura do WhatsApp com a mensagem pronta.

/** A janela por cima da página: no celular sobe de baixo, como uma folha; no computador fica no meio. */
export function Janela({ titulo, sub, aoFechar, children, largura = 'max-w-[560px]' }) {
  useEffect(() => {
    const fechar = (e) => e.key === 'Escape' && aoFechar?.();
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && aoFechar?.()}>
      <div role="dialog" aria-modal="true" aria-label={titulo}
        className={`flex max-h-[92vh] w-full ${largura} flex-col gap-4 overflow-y-auto rounded-t-cartao bg-fundo p-5 shadow-amg-janela sm:rounded-cartao sm:p-6`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-amg-titulo">{titulo}</h2>
            {sub && <p className="mt-0.5 text-texto-apagado">{sub}</p>}
          </div>
          {aoFechar && (
            <button type="button" onClick={aoFechar} aria-label="Fechar" className="grid h-9 w-9 shrink-0 place-items-center rounded-toque bg-superficie-2 text-texto-apagado">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/** A aula dos primeiros passos, com o Nie: a miniatura abre o vídeo numa janela, sem sair do site (o YouTube sem cookies). */
export function AulaDoComercial() {
  const [aberta, setAberta] = useState(false);
  const { id, minutos } = AULA_PRIMEIROS_PASSOS;
  return (
    <>
      <button type="button" onClick={() => setAberta(true)}
        className="mx-auto flex w-full max-w-[560px] items-center gap-4 rounded-cartao bg-superficie p-3 text-left shadow-cartao focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destaque">
        <span className="relative shrink-0 overflow-hidden rounded-dentro">
          <img src="/imagens/aula-comercial-primeiros-passos.jpg" alt="" width="128" height="72" className="block h-[72px] w-[128px] object-cover" />
          <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
            <span className="grid h-9 w-9 place-items-center rounded-toque bg-botao-1 text-botao-1-texto shadow-cartao">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
            </span>
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <b className="block font-semibold">Veja como funciona</b>
          <small className="text-amg-legenda text-texto-apagado">O Nie mostra os primeiros passos em {minutos} minutos</small>
        </span>
      </button>
      {aberta && (
        <Janela titulo="Comercial · primeiros passos" aoFechar={() => setAberta(false)} largura="max-w-[880px]">
          <div className="aspect-video w-full overflow-hidden rounded-dentro bg-black">
            <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`} title="Comercial do Arquionie: primeiros passos"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="h-full w-full border-0" />
          </div>
        </Janela>
      )}
    </>
  );
}

export const PontoDaEtapa = ({ cor }) => <span aria-hidden="true" className="inline-block h-[9px] w-[9px] shrink-0 rounded-toque" style={{ backgroundColor: cor }} />;

/** O balão do WhatsApp, só no que é do WhatsApp (a única cor fora da marca). */
export function BotaoWhatsApp({ aoClicar, nome, redondo, grande }) {
  const balao = (
    <svg width={grande ? 17 : 15} height={grande ? 17 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l1.4-4A8 8 0 1 1 8.3 19z" />
    </svg>
  );
  if (redondo)
    return (
      <button type="button" aria-label={`WhatsApp de ${nome}`} onClick={(e) => { e.stopPropagation(); aoClicar(); }}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-toque bg-amg-whatsapp-suave text-amg-whatsapp">
        {balao}
      </button>
    );
  return (
    <Botao type="button" grande={grande} onClick={aoClicar} className="!bg-amg-whatsapp-suave !text-amg-whatsapp">
      {balao}
      WhatsApp
    </Botao>
  );
}

/** Abre o WhatsApp do pedido com a mensagem pronta. A janela abre antes da resposta do banco, para o navegador não bloquear. */
export async function abrirWhatsApp(area, pedido, aoTerminar, aoErro) {
  const janela = window.open('', '_blank');
  try {
    const r = AMOSTRA
      ? { ok: true, whatsapp: pedido.whatsapp, texto: `Olá, ${pedido.nome.split(' ')[0]}! Aqui é Juliana, da Lima Arquitetura. Recebi o seu pedido de projeto. Podemos conversar?`,
        pedido: AULA ? whatsappNaAula(pedido.id) : undefined }
      : await rpc('comercial_whatsapp', { p_area: area, p_id: pedido.id });
    if (!r.ok) {
      janela?.close();
      return aoErro?.(r.motivo);
    }
    if (janela) janela.location.href = linkWhatsApp(r.whatsapp, r.texto);
    else window.location.href = linkWhatsApp(r.whatsapp, r.texto);
    aoTerminar?.(r.pedido);
  } catch (e) {
    janela?.close();
    aoErro?.(mensagemDeErro(e));
  }
}
