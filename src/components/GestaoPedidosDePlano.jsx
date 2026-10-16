import { useEffect, useState } from 'react';
import { Botao, Mensagem } from '@/components/FormularioTecnico';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { AMOSTRA, dataCurta } from '@/lib/licencas';
import { AMOSTRA_PEDIDOS_DE_PLANO, linkDoWhatsApp, whatsappLegivel } from '@/lib/equipe';

// /gestao › PEDIDOS DE PLANO (mockup docs/mockups/equipe-e-apresentacoes do repositório do programa, aprovado por ÊDI em
// 11/10/2026): os pedidos do plano personalizado, os abertos primeiro, com quantas pessoas, o WhatsApp para conversar e a mensagem.
// LIBERAR LICENÇAS abre o LIBERAR das licenças com o e-mail preenchido; MARCAR COMO RESPONDIDO tira dos abertos.
export function usePedidosDePlano() {
  const [pedidos, setPedidos] = useState(null);
  const carregar = async () => {
    if (AMOSTRA) return setPedidos((p) => p ?? AMOSTRA_PEDIDOS_DE_PLANO);
    const { data, error } = await supabase.rpc('gestao_pedidos_de_plano');
    setPedidos(error ? [] : data ?? []);
  };
  useEffect(() => {
    carregar();
  }, []);
  return [pedidos, setPedidos, carregar];
}

export default function GestaoPedidosDePlano({ pedidos, setPedidos, carregar, aoLiberar }) {
  const [erro, setErro] = useState('');

  async function respondido(p) {
    setErro('');
    if (AMOSTRA) return setPedidos((l) => l.map((x) => (x.id === p.id ? { ...x, respondidoEm: new Date().toISOString() } : x)));
    const { data, error } = await supabase.rpc('gestao_pedido_respondido', { p_id: p.id });
    if (error || !data.ok) return setErro(error ? mensagemDeErro(error) : data.motivo);
    carregar();
  }

  if (pedidos === null) return <p className="text-aqi-muted">Carregando…</p>;
  const abertos = pedidos.filter((p) => !p.respondidoEm).length;
  return (
    <div>
      <div className="mb-4">
        <p className="titulo-secao mb-1">Painel do gestor{AMOSTRA ? ' · dados de exemplo' : ''}</p>
        <h1 className="text-[28px] font-semibold text-white">Pedidos de plano</h1>
        <p className="mt-1 max-w-[72ch] text-[14px] text-aqi-muted">
          Os escritórios que pediram mais contas para usar o Arquionie ao mesmo tempo (a página EQUIPE e o aviso do quarto computador). Combine o
          plano pelo WhatsApp e libere as licenças no e-mail da conta: elas aparecem em LICENÇAS, para o responsável passar a cada pessoa.
        </p>
      </div>
      {pedidos.length === 0 ? (
        <p className="bg-aqi-barra px-4 py-3 text-[14px] text-aqi-muted">Nenhum pedido de plano ainda.</p>
      ) : (
        <>
          <p className="mb-1.5 text-[11px] font-semibold tracking-[0.1em] text-aqi-coral">
            {pedidos.length} {pedidos.length === 1 ? 'PEDIDO' : 'PEDIDOS'} · {abertos} {abertos === 1 ? 'ABERTO' : 'ABERTOS'}
          </p>
          <div className="grid gap-2">
            {pedidos.map((p) => (
              <div key={p.id} className={`grid gap-2 bg-aqi-barra px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${p.respondidoEm ? 'opacity-70' : ''}`}>
                <div className="min-w-0 text-[13.5px]">
                  <b className="text-white">{p.escritorio || p.nome || p.email} · {p.pessoas} pessoas ao mesmo tempo</b>
                  <div className="text-aqi-muted">
                    <span className="break-all">{p.email}</span> · WhatsApp{' '}
                    <a href={linkDoWhatsApp(p.whatsapp)} target="_blank" rel="noreferrer" className="link">{whatsappLegivel(p.whatsapp)}</a>
                    {' '}· {dataCurta(p.em)} · equipe com {p.equipe} {p.equipe === 1 ? 'pessoa' : 'pessoas'} · {p.licencas} {p.licencas === 1 ? 'licença' : 'licenças'}
                  </div>
                  {p.mensagem && <div className="mt-0.5 text-aqi-texto">“{p.mensagem}”</div>}
                  {p.respondidoEm && <div className="mt-0.5 text-[12px] text-[#BFE3C4]">respondido em {dataCurta(p.respondidoEm)}</div>}
                </div>
                <div className="flex flex-wrap justify-end gap-2.5">
                  {!p.respondidoEm && <Botao type="button" onClick={() => respondido(p)}>MARCAR COMO RESPONDIDO</Botao>}
                  <Botao principal type="button" onClick={() => aoLiberar(p.email)}>LIBERAR LICENÇAS</Botao>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mt-2"><Mensagem erro>{erro}</Mensagem></div>
    </div>
  );
}
