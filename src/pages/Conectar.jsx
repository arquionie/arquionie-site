import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Cartao, { Miolo } from '@/components/Cartao';
import { Botao, Campo, Etiqueta, Icone, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { useSessao } from '@/lib/Sessao';
import { AMOSTRA, PLANOS, amostraConexao, dataCurta, estadoDaAmostra, nomeProduto } from '@/lib/licencas';

// /conectar?codigo=KMTR-4QPX — o programa (ou o plugin do Revit) abre esta página com o código que mostra na tela.
// A pessoa confere e AUTORIZA; o programa, que pergunta ao servidor a cada 3 segundos, recebe sozinho a credencial do
// computador (função conectar). Como o "gh auth login". Mockup aprovado pelo ÊDI em 05/10/2026; plano 17 do plugin.
// No modo AMIGÁVEL desde o mockup site-amigavel (16/10/2026): a conta, o computador e o código numa lista dentro do cartão.

const ondeVolta = (produto) => (produto === 'arquionie-revit' ? 'Revit' : 'programa');

// A lista de dentro do cartão: o nome à esquerda, o valor à direita, que nunca quebra.
function Linhas({ itens }) {
  return (
    <dl className="overflow-hidden rounded-dentro ring-1 ring-inset ring-linha">
      {itens.map(([nome, valor, forte]) => (
        <div key={nome} className="flex min-h-amg-toque-minimo items-center gap-3 border-t border-linha px-3.5 first:border-t-0">
          <dt className="w-[96px] shrink-0 text-texto-apagado">{nome}</dt>
          <dd className={`ml-auto min-w-0 truncate text-right ${forte ? 'text-amg-secao tabular-nums tracking-[0.04em]' : 'font-medium'}`}>{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function Conectar() {
  const [busca, setBusca] = useSearchParams();
  const codigo = (busca.get('codigo') || '').trim();
  const { usuario } = useSessao();
  const [info, setInfo] = useState(null);
  const [escolhido, setEscolhido] = useState(null);
  const [digitado, setDigitado] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function ver() {
    setErro('');
    if (AMOSTRA) return setInfo(amostraConexao(estadoDaAmostra()));
    const { data, error } = await supabase.rpc('conexao_ver', { p_codigo: codigo });
    if (error) return setErro(mensagemDeErro(error));
    setInfo(data);
  }

  useEffect(() => {
    setInfo(null);
    setEscolhido(null);
    if (codigo) ver();
  }, [codigo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function autorizar() {
    setErro('');
    if (info?.situacao === 'limite' && !escolhido) return setErro('Escolha qual computador sai.');
    setOcupado(true);
    if (AMOSTRA) {
      setOcupado(false);
      return setInfo({ ...info, situacao: 'autorizada' });
    }
    const { data, error } = await supabase.rpc('conexao_autorizar', {
      p_codigo: codigo,
      p_desconectar: info?.situacao === 'limite' ? escolhido : null,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    if (data?.situacao === 'autorizada') return setInfo({ ...info, ...data });
    if (data?.situacao === 'computador inválido') return setErro('Esse computador não está mais na conta. Escolha outro.');
    setInfo(data);
  }

  async function cancelar() {
    setErro('');
    if (!AMOSTRA) {
      const { error } = await supabase.rpc('conexao_cancelar', { p_codigo: codigo });
      if (error) return setErro(mensagemDeErro(error));
    }
    setInfo({ situacao: 'cancelada' });
  }

  const outroCodigo = () => {
    setDigitado('');
    setBusca({});
  };

  // Sem código na URL: a pessoa digita o que aparece no Revit (ou no programa).
  if (!codigo) {
    return (
      <Miolo>
        <Cartao
          titulo="Conectar um computador"
          nota="Digite o código que aparece no Revit (ou no programa), na janela ENTRAR COM A CONTA ARQUIONIE."
          aoEnviar={() => digitado.trim() && setBusca({ codigo: digitado.trim().toUpperCase() })}
          botoes={<Botao principal type="submit">Continuar</Botao>}
        >
          <Campo id="codigo" rotulo="Código" valor={digitado} aoMudar={setDigitado} placeholder="KMTR-4QPX" autoFocus />
        </Cartao>
      </Miolo>
    );
  }

  if (!info) {
    return (
      <Miolo>
        <Cartao titulo="Conferindo o código…">
          <Mensagem erro>{erro}</Mensagem>
        </Cartao>
      </Miolo>
    );
  }

  const produto = nomeProduto(info.produto);
  // o plano e os computadores em uso, em etiquetas (o número antes da palavra)
  const etiquetas = info.produto && (
    <div className="flex flex-wrap gap-2">
      <Etiqueta>{`${info.emUso} de ${info.limite} computadores`}</Etiqueta>
      <Etiqueta tipo={info.plano === 'gratis' ? 'neutra' : 'urgente'}>
        {info.plano === 'gratis' ? 'Plano grátis' : `${PLANOS[info.plano] ?? info.plano} até ${dataCurta(info.licencaAte)}`}
      </Etiqueta>
    </div>
  );

  if (info.situacao === 'aguardando') {
    return (
      <Miolo>
        <Cartao
          titulo={`Conectar o ${produto}`}
          nota={`O ${produto} no computador ${info.computador} quer usar a sua conta. Confira se o código é o mesmo que aparece no ${ondeVolta(info.produto)}.`}
          aoEnviar={autorizar}
          rodape={`Não pediu isso no ${ondeVolta(info.produto)}? Cancele. Ninguém entra na sua conta sem este clique.`}
          botoes={
            <>
              <Botao type="button" onClick={cancelar}>Cancelar</Botao>
              <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'Autorizando…' : 'Autorizar'}</Botao>
            </>
          }
        >
          <Linhas
            itens={[
              ['Conta', usuario?.email ?? (AMOSTRA ? 'ana@exemplo.com.br' : '')],
              ['Computador', info.computador],
              ['Código', info.codigo, true],
            ]}
          />
          {etiquetas}
          <Mensagem erro>{erro}</Mensagem>
        </Cartao>
      </Miolo>
    );
  }

  if (info.situacao === 'limite') {
    return (
      <Miolo>
        <Cartao
          titulo="Escolha um computador para desconectar"
          nota={`A sua conta já usa o ${produto} em ${info.limite} computadores. Para conectar o ${info.computador}, um deles sai. Ele volta quando você entrar de novo nele.`}
          aoEnviar={autorizar}
          botoes={
            <>
              <Botao type="button" onClick={cancelar}>Cancelar</Botao>
              <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'Autorizando…' : 'Desconectar e autorizar'}</Botao>
            </>
          }
        >
          <div role="radiogroup" aria-label="Computador para desconectar" className="overflow-hidden rounded-dentro ring-1 ring-inset ring-linha">
            {(info.computadores ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={escolhido === c.id}
                onClick={() => setEscolhido(c.id)}
                className="flex min-h-amg-toque-minimo w-full items-center gap-3 border-t border-linha px-3.5 py-2 text-left first:border-t-0 hover:bg-superficie-2"
              >
                <span className="flex min-w-0 flex-col">
                  <b className="truncate font-semibold">{c.nome}</b>
                  <small className="text-amg-legenda text-texto-apagado">último acesso {dataCurta(c.ultimo_acesso)}</small>
                </span>
                {escolhido === c.id && <Icone nome="ok" tamanho={18} className="ml-auto text-destaque" />}
              </button>
            ))}
          </div>
          {etiquetas}
          {/* mais gente usando ao mesmo tempo: o plano personalizado (mockup aprovado por ÊDI em 11/10/2026) */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-amg-legenda text-texto-apagado">Mais gente usando ao mesmo tempo?</span>
            <Botao pequeno nivel={2} href="/conta/equipe#plano">Solicitar plano personalizado</Botao>
          </div>
          <Mensagem erro>{erro}</Mensagem>
        </Cartao>
      </Miolo>
    );
  }

  if (info.situacao === 'autorizada') {
    return (
      <Miolo>
        <Cartao
          centro
          feito
          titulo={`Pronto. Pode voltar ao ${ondeVolta(info.produto)}`}
          nota={`O ${info.produto ? produto : 'Arquionie™'} percebe sozinho em poucos segundos. Esta página já pode ser fechada.`}
          botoes={<Botao para="/conta/equipe#licencas">Ver minha conta</Botao>}
        >
          {info.computador && (
            <div className="flex w-full min-h-amg-toque-minimo items-center gap-3 rounded-dentro px-3.5 ring-1 ring-inset ring-linha">
              <b className="truncate font-semibold">{info.computador}</b>
              <Etiqueta tipo="sucesso" className="ml-auto">Conectado</Etiqueta>
            </div>
          )}
        </Cartao>
      </Miolo>
    );
  }

  const textos = {
    vencida: ['Este código não vale mais', 'O código vale 10 minutos e só uma vez. No Revit (ou no programa), clique ENTRAR COM A CONTA ARQUIONIE de novo: o navegador abre com um código novo.'],
    cancelada: ['Conexão cancelada', 'Ninguém entra na sua conta por este pedido. Se foi engano, peça um código novo no Revit (ou no programa).'],
    inexistente: ['Código não encontrado', 'Confira se o código é igual ao que aparece no Revit (ou no programa). Se a janela já fechou, peça um código novo lá.'],
  };
  const [titulo, nota] = textos[info.situacao] ?? ['Não deu para conferir o código', 'Tente de novo daqui a pouco.'];
  return (
    <Miolo>
      <Cartao titulo={titulo} nota={nota} botoes={<Botao principal type="button" onClick={outroCodigo}>Digitar outro código</Botao>}>
        <Mensagem erro>{erro}</Mensagem>
      </Cartao>
    </Miolo>
  );
}
