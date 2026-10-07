import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Cartao from '@/components/Cartao';
import { Botao, Campo, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { useSessao } from '@/lib/Sessao';
import { AMOSTRA, PLANOS, amostraConexao, dataCurta, estadoDaAmostra, nomeProduto } from '@/lib/licencas';

// /conectar?codigo=KMTR-4QPX — o programa (ou o plugin do Revit) abre esta página com o código que mostra na tela.
// A pessoa confere e AUTORIZA; o programa, que pergunta ao servidor a cada 3 segundos, recebe sozinho a credencial do
// computador (função conectar). Como o "gh auth login". Mockup aprovado pelo ÊDI em 05/10/2026; plano 17 do plugin.

const ondeVolta = (produto) => (produto === 'arquionie-revit' ? 'Revit' : 'programa');

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
      <div className="px-4 py-10">
        <Cartao
          compacto
          titulo="Conectar um computador"
          nota="Digite o código que aparece no Revit (ou no programa), na janela ENTRAR COM A CONTA ARQUIONIE."
          aoEnviar={() => digitado.trim() && setBusca({ codigo: digitado.trim().toUpperCase() })}
          botoes={<Botao principal type="submit">CONTINUAR</Botao>}
        >
          <Campo id="codigo" rotulo="CÓDIGO" valor={digitado} aoMudar={setDigitado} placeholder="KMTR-4QPX" autoFocus />
        </Cartao>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="px-4 py-10">
        <Cartao compacto titulo="Conferindo o código…">
          <Mensagem erro>{erro}</Mensagem>
        </Cartao>
      </div>
    );
  }

  const produto = nomeProduto(info.produto);
  const plano = info.plano === 'gratis' ? 'PLANO GRÁTIS' : `${PLANOS[info.plano] ?? info.plano} ATÉ ${dataCurta(info.licencaAte)}`;
  const emUso = info.produto ? `${produto.toUpperCase()} · ${info.emUso} DE ${info.limite} COMPUTADORES EM USO` : '';

  if (info.situacao === 'aguardando') {
    return (
      <div className="px-4 py-10">
        <Cartao
          compacto
          titulo={`Conectar o ${produto}`}
          nota={`O ${produto} no computador ${info.computador} quer usar a sua conta. Confira se o código é o mesmo que aparece no ${ondeVolta(info.produto)}.`}
          estado={emUso}
          versao={plano}
          aoEnviar={autorizar}
          botoes={
            <>
              <Botao type="button" onClick={cancelar}>CANCELAR</Botao>
              <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'AUTORIZANDO…' : 'AUTORIZAR'}</Botao>
            </>
          }
        >
          <Campo id="conta" rotulo="CONTA" valor={usuario?.email ?? (AMOSTRA ? 'ana@exemplo.com.br' : '')} aoMudar={() => {}} readOnly />
          <Campo id="computador" rotulo="COMPUTADOR" valor={info.computador} aoMudar={() => {}} readOnly />
          <Campo id="codigo-conferir" rotulo="CÓDIGO" valor={info.codigo} aoMudar={() => {}} readOnly />
          <p className="mt-2 text-[12px] text-aqi-muted">
            Não pediu isso no {ondeVolta(info.produto)}? Clique CANCELAR. Ninguém entra na sua conta sem este clique.
          </p>
          <Mensagem erro>{erro}</Mensagem>
        </Cartao>
      </div>
    );
  }

  if (info.situacao === 'limite') {
    return (
      <div className="px-4 py-10">
        <Cartao
          compacto
          titulo="Escolha um computador para desconectar"
          nota={`A sua conta já usa o ${produto} em ${info.limite} computadores. Para conectar o ${info.computador}, um deles sai. Ele volta quando você entrar de novo nele.`}
          estado={emUso}
          versao={plano}
          aoEnviar={autorizar}
          botoes={
            <>
              <Botao type="button" onClick={cancelar}>CANCELAR</Botao>
              <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'AUTORIZANDO…' : 'DESCONECTAR E AUTORIZAR'}</Botao>
            </>
          }
        >
          <div role="radiogroup" aria-label="Computador para desconectar">
            {(info.computadores ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={escolhido === c.id}
                onClick={() => setEscolhido(c.id)}
                className={`mb-1.5 flex min-h-[38px] w-full items-center justify-between gap-3 border px-3 py-2 text-left text-[13px] ${
                  escolhido === c.id ? 'border-aqi-campo bg-aqi-campo text-white' : 'border-aqi-borda bg-aqi-painel text-aqi-texto hover:border-aqi-muted'
                }`}
              >
                <span>{c.nome}</span>
                <span className={escolhido === c.id ? 'text-white' : 'text-aqi-muted'}>último acesso {dataCurta(c.ultimo_acesso)}</span>
              </button>
            ))}
          </div>
          <Mensagem erro>{erro}</Mensagem>
        </Cartao>
      </div>
    );
  }

  if (info.situacao === 'autorizada') {
    return (
      <div className="px-4 py-10">
        <Cartao
          compacto
          titulo={`Pronto. Pode voltar ao ${ondeVolta(info.produto)}`}
          nota={`O ${info.produto ? produto : 'Arquionie™'} percebe sozinho em poucos segundos. Esta página já pode ser fechada.`}
          botoes={
            <Link to="/conta#licencas" className="inline-flex h-[40px] min-w-[129px] items-center justify-center border border-aqi-borda bg-aqi-barra px-4 text-[13px] font-bold tracking-wide text-aqi-texto no-underline hover:bg-aqi-faixa">
              VER MINHA CONTA
            </Link>
          }
        >
          {info.computador && <Campo id="conectado" rotulo="COMPUTADOR" valor={`${info.computador} · CONECTADO`} aoMudar={() => {}} readOnly />}
        </Cartao>
      </div>
    );
  }

  const textos = {
    vencida: ['Este código não vale mais', 'O código vale 10 minutos e só uma vez. No Revit (ou no programa), clique ENTRAR COM A CONTA ARQUIONIE de novo: o navegador abre com um código novo.'],
    cancelada: ['Conexão cancelada', 'Ninguém entra na sua conta por este pedido. Se foi engano, peça um código novo no Revit (ou no programa).'],
    inexistente: ['Código não encontrado', 'Confira se o código é igual ao que aparece no Revit (ou no programa). Se a janela já fechou, peça um código novo lá.'],
  };
  const [titulo, nota] = textos[info.situacao] ?? ['Não deu para conferir o código', 'Tente de novo daqui a pouco.'];
  return (
    <div className="px-4 py-10">
      <Cartao
        compacto
        titulo={titulo}
        botoes={<Botao type="button" onClick={outroCodigo}>DIGITAR OUTRO CÓDIGO</Botao>}
      >
        <p className={`text-[13px] ${info.situacao === 'cancelada' ? 'text-aqi-muted' : 'text-aqi-alerta'}`}>{nota}</p>
        <Mensagem erro>{erro}</Mensagem>
      </Cartao>
    </div>
  );
}
