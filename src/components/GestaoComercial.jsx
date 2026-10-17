// COMERCIAL no /gestao (doc 72 do repositório do programa, seção 2): os números do CRM grátis em todos os escritórios e os
// formulários denunciados pelo VER ALGO ERRADO? do /f/CÓDIGO, com os motivos, o formulário e PAUSAR ou RETOMAR. Pausado pelo gestor,
// o endereço mostra "pausado" e não recebe pedidos; o escritório vê "Pausado pela gestão do Arquionie" nos ajustes.
// No modo AMIGÁVEL, como as outras abas (mockup gestao-amigavel, 16/10/2026).
import { useEffect, useState } from 'react';
import { Botao, Etiqueta, Mensagem } from '@/components/Formulario';
import { Confirmacao, Grupo, Linha, TextoDaLinha, Vazio } from '@/components/Listas';
import { Acao, Cabecalho, Numero, Numeros } from '@/components/GestaoPecas';
import { lerGestaoComercial, pausarFormulario } from '@/lib/comercial';
import { numeroLegivel } from '@/lib/downloads';

const MOTIVOS_DE_SAIDA = 3;
const emAberto = (d) => (d?.denunciados ?? []).filter((f) => !f.pausado).length;

// A plaquinha da aba: os denunciados que ainda estão no ar.
export function useDenunciadosNoAr() {
  const [n, setN] = useState(0);
  useEffect(() => { lerGestaoComercial().then((d) => setN(emAberto(d))).catch(() => {}); }, []);
  return [n, setN];
}

function Denunciado({ f, aoMudar, setErro }) {
  const [confirmar, setConfirmar] = useState(false);
  const [todos, setTodos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const motivos = f.motivos ?? [];
  const mostrar = todos ? motivos : motivos.slice(0, MOTIVOS_DE_SAIDA);

  async function agir() {
    setOcupado(true);
    try {
      const r = await pausarFormulario(f.id, !f.pausado);
      if (r?.ok === false) setErro('O formulário não foi encontrado. Ele pode ter sido excluído pelo escritório.');
      else aoMudar({ ...f, pausado: !f.pausado });
    } catch (e) {
      setErro(`Não deu certo: ${e.message}`);
    }
    setOcupado(false);
    setConfirmar(false);
  }

  return (
    <Linha className="py-3">
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <TextoDaLinha
          titulo={f.nome}
          sub={`${f.escritorio || 'escritório sem nome'} · /f/${f.codigo} · ${numeroLegivel(f.denuncias)} ${f.denuncias === 1 ? 'denúncia' : 'denúncias'}`}
        />
      </div>
      <Etiqueta tipo={f.pausado ? 'neutra' : 'urgente'}>{f.pausado ? 'Pausado' : 'No ar'}</Etiqueta>
      {!confirmar && (
        <span className="ml-auto flex gap-2 sm:ml-0">
          <Botao pequeno type="button" href={`/f/${f.codigo}`} target="_blank" rel="noreferrer">Ver o formulário</Botao>
          <Acao nivel={2} onClick={() => setConfirmar(true)}>{f.pausado ? 'Retomar' : 'Pausar'}</Acao>
        </span>
      )}
      {motivos.length > 0 && (
        <ul className="basis-full space-y-1.5" aria-label="Motivos das denúncias">
          {mostrar.map((m, i) => (
            <li key={i} className="whitespace-pre-line break-words rounded-dentro bg-superficie-2 px-3 py-2">{m}</li>
          ))}
        </ul>
      )}
      {motivos.length > MOTIVOS_DE_SAIDA && (
        <Acao onClick={() => setTodos(!todos)}>{todos ? 'Ver menos' : `Ver mais ${motivos.length - MOTIVOS_DE_SAIDA}`}</Acao>
      )}
      {confirmar && (
        <div className="basis-full">
          <Confirmacao voltar={() => setConfirmar(false)} acao={agir} ocupado={ocupado}
            rotulo={f.pausado ? 'Retomar' : 'Pausar'} rotuloOcupado={f.pausado ? 'Retomando…' : 'Pausando…'}>
            {f.pausado
              ? `Retomar ${f.codigo}? O formulário volta a abrir e a receber pedidos.`
              : `Pausar ${f.codigo}? O formulário para de abrir e de receber pedidos até você retomar.`}
          </Confirmacao>
        </div>
      )}
    </Linha>
  );
}

export default function GestaoComercial({ aoMudarNoAr }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  async function carregar() {
    setDados(null);
    setErro('');
    try {
      const d = await lerGestaoComercial();
      setDados(d);
      aoMudarNoAr?.(emAberto(d));
    } catch (e) {
      setDados({ falhou: e.message });
    }
  }
  useEffect(() => { carregar(); }, []);

  function mudar(f) {
    const d = { ...dados, denunciados: dados.denunciados.map((x) => (x.id === f.id ? f : x)) };
    setDados(d);
    aoMudarNoAr?.(emAberto(d));
  }

  const lista = dados?.denunciados ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Cabecalho titulo="Comercial">
        <Botao type="button" onClick={carregar}>Atualizar</Botao>
      </Cabecalho>
      {!dados ? (
        <p className="text-texto-apagado">Carregando os números…</p>
      ) : dados.falhou ? (
        <Mensagem erro>Não deu para ler o Comercial: {dados.falhou}. Confira se a migração do Comercial foi rodada no Supabase.</Mensagem>
      ) : (
        <>
          <Mensagem erro>{erro}</Mensagem>
          <Numeros>
            <Numero rotulo="Escritórios" valor={dados.escritorios} />
            <Numero rotulo="Pedidos" valor={dados.pedidos} />
            <Numero rotulo="Pedidos neste mês" valor={dados.pedidosNoMes} />
            <Numero rotulo="Propostas" valor={dados.propostas} detalhe={`${numeroLegivel(dados.aceitas)} ${dados.aceitas === 1 ? 'aceita' : 'aceitas'}`} />
          </Numeros>
          {lista.length === 0 ? (
            <Vazio>Nenhum formulário denunciado.</Vazio>
          ) : (
            <Grupo rotulo={`${numeroLegivel(lista.length)} ${lista.length === 1 ? 'formulário denunciado' : 'formulários denunciados'}`}>
              {lista.map((f) => <Denunciado key={f.id} f={f} aoMudar={mudar} setErro={setErro} />)}
            </Grupo>
          )}
        </>
      )}
    </div>
  );
}
