import { useEffect, useState } from 'react';
import { Botao, Etiqueta, Mensagem } from '@/components/Formulario';
import { Cabecalho } from '@/components/GestaoPecas';
import { Grupo, Linha, TextoDaLinha, Vazio } from '@/components/Listas';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { AMOSTRA, dataCurta } from '@/lib/licencas';
import { AMOSTRA_PEDIDOS_DE_PLANO, linkDoWhatsApp, whatsappLegivel } from '@/lib/equipe';

// O lado de texto da linha com uma largura mínima: no celular, as etiquetas e os botões é que descem, e não o texto que espreme.
const ESQUERDA = 'flex min-w-[min(100%,16rem)] flex-1 items-start gap-3';

// /gestao › PEDIDOS DE PLANO (mockup docs/mockups/equipe-e-apresentacoes do repositório do programa, aprovado por ÊDI em
// 11/10/2026): os pedidos do plano personalizado, os abertos primeiro, com quantas pessoas, o WhatsApp para conversar e a mensagem.
// LIBERAR LICENÇAS abre o LIBERAR das licenças com o e-mail preenchido; MARCAR COMO RESPONDIDO tira dos abertos.
// No modo AMIGÁVEL desde o mockup gestao-amigavel (ÊDI, 16/10/2026): o WhatsApp virou botão e o LIBERAR LICENÇAS é o nível 1 só do
// pedido aberto (no respondido fica nível 2, para liberar mais depois).
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

// dentro (a aba PEDIDOS, plano 19, 20/10/2026): sem o cabeçalho, como o filtro EQUIPE dos pedidos.
export default function GestaoPedidosDePlano({ pedidos, setPedidos, carregar, aoLiberar, dentro = false }) {
  const [erro, setErro] = useState('');

  async function respondido(p) {
    setErro('');
    if (AMOSTRA) return setPedidos((l) => l.map((x) => (x.id === p.id ? { ...x, respondidoEm: new Date().toISOString() } : x)));
    const { data, error } = await supabase.rpc('gestao_pedido_respondido', { p_id: p.id });
    if (error || !data.ok) return setErro(error ? mensagemDeErro(error) : data.motivo);
    carregar();
  }

  if (pedidos === null) return <p className="text-texto-apagado">Carregando…</p>;
  const abertos = pedidos.filter((p) => !p.respondidoEm).length;
  return (
    <div className="flex flex-col gap-4">
      <div>
        {!dentro && <Cabecalho titulo="Pedidos de plano" />}
        <p className={`max-w-[72ch] text-texto-apagado ${dentro ? '' : 'mt-1.5'}`}>
          Os escritórios que pediram mais contas para usar o Arquionie ao mesmo tempo (a página Equipe e o aviso do quarto computador). Combine o
          plano pelo WhatsApp e libere as licenças no e-mail da conta: elas aparecem em Licenças, para o responsável passar a cada pessoa.
        </p>
      </div>
      {pedidos.length === 0 ? (
        <Vazio>Nenhum pedido de plano de equipe ainda.</Vazio>
      ) : (
        <Grupo rotulo={`${dentro ? 'Equipe · ' : ''}${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'} · ${abertos} ${abertos === 1 ? 'aberto' : 'abertos'}`}>
          {pedidos.map((p) => (
            <Linha key={p.id}>
              <div className={ESQUERDA}>
                <TextoDaLinha
                  titulo={`${p.escritorio || p.nome || p.email} · ${p.pessoas} pessoas ao mesmo tempo`}
                  sub={
                    <>
                      <span className="break-all">{p.email}</span> · WhatsApp {whatsappLegivel(p.whatsapp)} · {dataCurta(p.em)} · equipe com {p.equipe}{' '}
                      {p.equipe === 1 ? 'pessoa' : 'pessoas'} · {p.licencas} {p.licencas === 1 ? 'licença' : 'licenças'}
                    </>
                  }
                >
                  {p.mensagem && <p className="mt-0.5 text-amg-legenda">“{p.mensagem}”</p>}
                </TextoDaLinha>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {p.respondidoEm && <Etiqueta tipo="sucesso">Respondido em {dataCurta(p.respondidoEm)}</Etiqueta>}
                {!p.respondidoEm && <Botao pequeno type="button" onClick={() => respondido(p)}>Marcar como respondido</Botao>}
                <Botao pequeno nivel={2} href={linkDoWhatsApp(p.whatsapp)} target="_blank" rel="noreferrer"
                  aria-label={`WhatsApp de ${p.escritorio || p.nome || p.email}, ${whatsappLegivel(p.whatsapp)}`}>
                  WhatsApp
                </Botao>
                <Botao pequeno principal={!p.respondidoEm} nivel={2} type="button" onClick={() => aoLiberar(p.email)}>Liberar licenças</Botao>
              </div>
            </Linha>
          ))}
        </Grupo>
      )}
      <Mensagem erro>{erro}</Mensagem>
    </div>
  );
}
