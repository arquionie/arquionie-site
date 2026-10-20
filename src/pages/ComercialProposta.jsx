import { useEffect, useMemo, useRef, useState } from 'react';
import { Botao, Campo, Icone, Mensagem } from '@/components/Formulario';
import { Escolha } from '@/components/Listas';
import { mensagemDeErro } from '@/lib/erros';
import {
  AMOSTRA, AMOSTRA_FORMULARIO_PUBLICO, PACOTES, calcularOrcamento, conteudoDaProposta, enviarLogo, reais, rpc, urlDoLogo,
} from '@/lib/comercial';
import { AULA, gravarEscritorioDaAula, gravarPrecosDaAula, marcaDaAula } from '@/lib/aula';
import { CorpoDaProposta, Pagina } from '@/pages/ComercialPublico';
import { CIRCULO_CROMATICO, SeletorDeCor } from '@/components/SeletorDeCor';

// A SUA PROPOSTA, passo a passo (ÊDI, 19/10/2026: "esse fluxo da pessoa configurar uma coisa por vez, eu achei excelente", e a cor
// pelo código da marca: "aquele seletor hexadecimal, que a pessoa cola ali a cor do kit da marca dela"). Uma coisa por tela: a marca
// (nome, logo e cor), os preços (o m² da obra por tipo e os honorários), os pacotes (quanto cada um vale e o que inclui), o
// pagamento, as palavras (sobre o escritório e as condições) e a prévia, a proposta como o cliente abre. Servem ao primeiro acesso e ao botão SUA PROPOSTA do Comercial.

export const CORES = ['#E76353', '#A9513F', '#2F7D6D', '#3D6FB6', '#6B4FA0', '#C9973A', '#20252B'];
const CAMPO_NUMERO = 'h-[42px] w-[110px] rounded-toque bg-superficie-2 px-3.5 text-right text-[16px] tabular-nums';
const CAMPO_TEXTO = 'h-[42px] min-w-0 flex-1 rounded-toque bg-superficie-2 px-3.5 text-[16px]';
const AREA_DE_TEXTO = 'w-full rounded-dentro bg-superficie-2 p-3.5 text-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destaque';
// os números como se escrevem no Brasil: 3.500 é três mil e quinhentos; a vírgula é a dos centavos
const lerNumero = (v) => Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
const mostrar = (n) => (n || n === 0 ? Number(n).toLocaleString('pt-BR') : '');

// o exemplo de todos os passos: uma casa de 180 m², no primeiro tipo de projeto
function exemplo(precos) {
  const tipos = Object.keys(precos.m2 ?? {});
  const tipo = tipos.find((t) => /constru/i.test(t)) ?? tipos[0];
  const orcamento = { nome: 'Casa térrea', tipo, area: 180, m2: precos.m2?.[tipo] ?? 0, honorarios: precos.honorarios, escolhido: 'completo' };
  return { tipo, orcamento, conta: calcularOrcamento(orcamento, precos) };
}

export function Pontos({ passo, total }) {
  return (
    <div className="flex gap-1.5" aria-label={`Passo ${passo + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={`h-2 rounded-toque ${i === passo ? 'w-[22px] bg-botao-1' : 'w-2 bg-linha'}`} />)}
    </div>
  );
}

function Cabeca({ titulo, children }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-amg-titulo">{titulo}</h1>
      {children && <p className="text-amg-corpo-celular text-texto-apagado">{children}</p>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ 1. a marca
export function PassoMarca({ marca, aoMudar }) {
  const [enviando, setEnviando] = useState(false);
  const [seletor, setSeletor] = useState(false);
  const [erro, setErro] = useState('');
  const arquivo = useRef(null);

  async function escolherLogo(f) {
    if (!f) return;
    setErro('');
    setEnviando(true);
    try {
      if (AMOSTRA) {
        const leitor = new FileReader();
        const dados = await new Promise((ok) => { leitor.onload = () => ok(leitor.result); leitor.readAsDataURL(f); });
        return aoMudar({ ...marca, logo: dados });
      }
      const r = await enviarLogo(f);
      if (!r.ok) return setErro(r.motivo);
      aoMudar({ ...marca, logo: r.logo });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
      if (arquivo.current) arquivo.current.value = '';
    }
  }
  const iniciais = (marca.nome || '·').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const daMarca = !CORES.includes(marca.cor);
  return (
    <>
      <Cabeca titulo="A sua marca">Ela vai no formulário e na proposta que o cliente abre.</Cabeca>
      <Campo rotulo="Nome" id="pa-nome" valor={marca.nome} aoMudar={(nome) => aoMudar({ ...marca, nome })} placeholder="Lima Arquitetura" />
      <div className="flex items-center gap-3">
        {marca.logo ? (
          <img src={urlDoLogo(marca.logo)} alt="A logo" className="h-16 w-16 rounded-full bg-superficie-2 object-contain p-1.5" />
        ) : (
          <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full text-amg-secao text-white" style={{ backgroundColor: marca.cor }}>{iniciais}</span>
        )}
        <Botao nivel={2} type="button" disabled={enviando} onClick={() => arquivo.current?.click()}>
          {enviando ? 'Enviando…' : marca.logo ? 'Trocar a logo' : 'Escolher a logo'}
        </Botao>
        <input ref={arquivo} id="pa-logo" type="file" accept="image/png,image/svg+xml,image/jpeg" className="sr-only" aria-label="A logo do escritório"
          onChange={(e) => escolherLogo(e.target.files?.[0])} />
      </div>
      <div className="flex flex-col gap-2.5">
        <h2 className="rotulo ml-1">Cor</h2>
        <div className="relative flex flex-wrap gap-2.5" role="radiogroup" aria-label="Cor do escritório">
          {CORES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={marca.cor === c} aria-label={`Cor ${c}`} onClick={() => aoMudar({ ...marca, cor: c })}
              className={`h-[38px] w-[38px] rounded-full ${marca.cor === c ? 'ring-2 ring-texto ring-offset-2 ring-offset-superficie' : ''}`} style={{ backgroundColor: c }} />
          ))}
          <button type="button" role="radio" aria-checked={daMarca} data-abre-seletor aria-expanded={seletor} onClick={() => setSeletor((a) => !a)}
            aria-label={daMarca ? `A cor da sua marca, ${marca.cor}. Escolher outra` : 'Escolher a cor da sua marca'}
            className={`grid h-[38px] w-[38px] place-items-center rounded-full ${daMarca ? 'ring-2 ring-texto ring-offset-2 ring-offset-superficie' : ''}`}
            style={{ background: CIRCULO_CROMATICO }}>
            {daMarca && <span aria-hidden="true" className="h-[18px] w-[18px] rounded-full border-2 border-white" style={{ backgroundColor: marca.cor }} />}
          </button>
          {seletor && <SeletorDeCor cor={marca.cor} aoMudar={(cor) => aoMudar({ ...marca, cor })} aoFechar={() => setSeletor(false)} />}
        </div>
      </div>
      <Mensagem erro>{erro}</Mensagem>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ 2. os preços
export function PassoPrecos({ precos, aoMudar }) {
  const linhas = Object.entries(precos.m2 ?? {});
  const mudarLinhas = (l) => aoMudar({ ...precos, m2: Object.fromEntries(l) });
  const pct = Number(precos.honorarios ?? 0);
  const { tipo, conta } = exemplo(precos);
  return (
    <>
      <Cabeca titulo="Os seus preços">Para cada tipo de projeto, quanto custa o m² da obra. Os seus honorários são uma porcentagem dela.</Cabeca>
      <div className="flex min-h-[58px] items-center gap-3 rounded-cartao bg-amg-destaque-suave px-4">
        <span className="flex-1 font-semibold text-destaque-texto">Os seus honorários</span>
        <input aria-label="Honorários, em porcentagem do custo da obra" inputMode="decimal" value={mostrar(precos.honorarios)} className={`${CAMPO_NUMERO} w-[80px] bg-superficie`}
          onChange={(e) => aoMudar({ ...precos, honorarios: lerNumero(e.target.value) })} />
        <span className="w-[120px] text-destaque-texto">% da obra</span>
      </div>
      <div className="overflow-hidden rounded-cartao ring-1 ring-inset ring-linha">
        <div className="hidden gap-3 px-4 pb-1 pt-3 text-amg-rotulo uppercase text-texto-apagado sm:flex">
          <span className="flex-1">Tipo de projeto</span><span className="w-[150px]">A obra, por m²</span><span className="w-[150px]">Os seus honorários</span><span className="w-8" />
        </div>
        {linhas.map(([t, v], i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-linha px-4 py-2.5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0">
            <input aria-label={`Tipo de projeto ${i + 1}`} value={t} maxLength={40} className={`${CAMPO_TEXTO} basis-full sm:basis-auto`}
              onChange={(e) => mudarLinhas(linhas.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} />
            <label className="flex w-[150px] items-center gap-1.5">
              <span className="text-texto-apagado">R$</span>
              <input aria-label={`Custo da obra por m², ${t}`} inputMode="numeric" value={mostrar(v)} className={`${CAMPO_NUMERO} w-[96px]`}
                onChange={(e) => mudarLinhas(linhas.map((x, j) => (j === i ? [x[0], lerNumero(e.target.value)] : x)))} />
            </label>
            <span className="w-[150px] font-semibold tabular-nums">{reais(Math.round((Number(v) * pct) / 100))}<span className="font-normal text-texto-apagado"> /m²</span></span>
            <button type="button" aria-label={`Tirar ${t}`} disabled={linhas.length <= 1} onClick={() => mudarLinhas(linhas.filter((_, j) => j !== i))}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-toque text-[18px] text-texto-apagado hover:bg-superficie-2 disabled:opacity-30">×</button>
          </div>
        ))}
        <button type="button" onClick={() => mudarLinhas([...linhas, [`Tipo ${linhas.length + 1}`, 0]])}
          className="flex min-h-amg-toque-minimo w-full items-center border-t border-linha px-4 font-semibold text-destaque-texto">+ Tipo novo</button>
      </div>
      {tipo && (
        <p className="text-texto-apagado">
          Uma casa de 180 m² ({tipo.toLowerCase()}): obra de {reais(conta.obra)}, honorários de <b className="text-texto">{reais(conta.pacotes[0].valor)}</b>.
        </p>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ 3. os pacotes
const DESDE = PACOTES.map(([id, nome]) => [id, nome]).reverse(); // Básico, Intermediário, Completo
export function PassoPacotes({ precos, aoMudar }) {
  const { conta } = exemplo(precos);
  const escopo = precos.escopo ?? [];
  const mudarEscopo = (e) => aoMudar({ ...precos, escopo: e });
  return (
    <>
      <Cabeca titulo="Os seus pacotes">O cliente escolhe um dos três. O Completo vale os seus honorários; os outros, uma parte dele.</Cabeca>
      <div className="grid grid-cols-3 gap-2.5">
        {conta.pacotes.map((k) => (
          <div key={k.id} className="flex flex-col gap-1.5 rounded-cartao px-4 py-3.5 ring-1 ring-inset ring-linha">
            <span className="font-semibold">{k.nome}</span>
            <b className="text-amg-titulo tabular-nums">{reais(k.valor)}</b>
            {k.id === 'completo' ? (
              <span className="flex h-[34px] items-center text-texto-apagado">100% dos honorários</span>
            ) : (
              <label className="flex items-center gap-1.5 text-texto-apagado">
                <input aria-label={`${k.nome}, em porcentagem do Completo`} inputMode="decimal" value={mostrar(precos[k.id])}
                  onChange={(e) => aoMudar({ ...precos, [k.id]: lerNumero(e.target.value) })}
                  className="h-[34px] w-[60px] rounded-toque bg-superficie-2 px-2.5 text-right text-[16px] tabular-nums text-texto" />% do Completo
              </label>
            )}
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-cartao ring-1 ring-inset ring-linha">
        <div className="hidden gap-3 px-4 pb-1 pt-3 text-amg-rotulo uppercase text-texto-apagado sm:flex">
          <span className="flex-1">O que entra</span><span className="w-[322px]">A partir do pacote</span><span className="w-8" />
        </div>
        {escopo.map((e, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-linha px-4 py-2.5 sm:flex-nowrap sm:[&:nth-child(2)]:border-t-0">
            <input aria-label={`Item ${i + 1} do pacote`} value={e.item} maxLength={80} placeholder="O que entra" className={`${CAMPO_TEXTO} basis-full sm:basis-auto`}
              onChange={(ev) => mudarEscopo(escopo.map((x, j) => (j === i ? { ...x, item: ev.target.value } : x)))} />
            <Escolha rotulo={`A partir de qual pacote: ${e.item}`} valor={e.desde} opcoes={DESDE}
              aoMudar={(v) => mudarEscopo(escopo.map((x, j) => (j === i ? { ...x, desde: v } : x)))} />
            <button type="button" aria-label={`Tirar ${e.item}`} onClick={() => mudarEscopo(escopo.filter((_, j) => j !== i))}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-toque text-[18px] text-texto-apagado hover:bg-superficie-2">×</button>
          </div>
        ))}
        <button type="button" onClick={() => mudarEscopo([...escopo, { item: '', desde: 'completo' }])}
          className="flex min-h-amg-toque-minimo w-full items-center border-t border-linha px-4 font-semibold text-destaque-texto">+ Item novo</button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ 4. o pagamento
export function PassoPagamento({ precos, aoMudar }) {
  const { conta } = exemplo(precos);
  const ate = new Date(Date.now() + Number(precos.validadeDias ?? 30) * 864e5).toLocaleDateString('pt-BR');
  const linha = (k, rotulo, unidade, resultado) => (
    <div key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-linha px-4 py-3 first:border-t-0">
      <span className="w-[120px] font-semibold">{rotulo}</span>
      <label className="flex items-center gap-2">
        <input aria-label={`${rotulo}, em ${unidade}`} inputMode="decimal" value={mostrar(precos[k])} className={`${CAMPO_NUMERO} w-[80px]`}
          onChange={(e) => aoMudar({ ...precos, [k]: lerNumero(e.target.value) })} />
        <span className="w-[130px] text-texto-apagado">{unidade}</span>
      </label>
      <span className="ml-auto tabular-nums">{resultado}</span>
    </div>
  );
  return (
    <>
      <Cabeca titulo="O pagamento">Como o cliente paga e por quanto tempo a proposta vale. Ao lado, o exemplo no pacote Completo.</Cabeca>
      <div className="overflow-hidden rounded-cartao ring-1 ring-inset ring-linha">
        {linha('entrada', 'Entrada', '% na assinatura', <b>{reais(conta.entrada)}</b>)}
        {linha('parcelas', 'Parcelas', 'vezes', <span><b>{conta.parcelas}×</b> de <b>{reais(conta.parcela)}</b></span>)}
        {linha('desconto', 'À vista', '% de desconto', <b>{reais(conta.avista)}</b>)}
        {linha('validadeDias', 'Validade', 'dias', <span>até <b>{ate}</b></span>)}
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ 5. o texto
export function PassoTexto({ precos, aoMudar }) {
  const condicoes = (precos.condicoes ?? []).join('\n');
  return (
    <>
      <Cabeca titulo="As suas palavras">O que o cliente lê na proposta, além dos pacotes e do pagamento.</Cabeca>
      <label className="flex flex-col gap-1.5">
        <span className="rotulo ml-1">Sobre o escritório</span>
        <textarea aria-label="Sobre o escritório" rows={3} maxLength={600} value={precos.apresentacao ?? ''} className={AREA_DE_TEXTO}
          onChange={(e) => aoMudar({ ...precos, apresentacao: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="rotulo ml-1">Condições, uma por linha</span>
        <textarea aria-label="Condições, uma por linha" rows={5} maxLength={1500} value={condicoes} className={AREA_DE_TEXTO}
          onChange={(e) => aoMudar({ ...precos, condicoes: e.target.value.split('\n') })} />
      </label>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ 6. a prévia
export function PassoPrevia({ marca, precos }) {
  const { orcamento } = exemplo(precos);
  const conteudo = useMemo(() => conteudoDaProposta({ tipo: orcamento.tipo, cidade: 'Sorocaba/SP' }, orcamento, limpar(precos)), [orcamento, precos]);
  const [pacote, setPacote] = useState(conteudo.pacotes[0]?.nome);
  const validaAte = new Date(Date.now() + (precos.validadeDias ?? 30) * 864e5).toISOString().slice(0, 10);
  const escritorio = { nome: marca.nome, cor: marca.cor, logo: marca.logo };
  const p = { jeito: 'modelo', cliente: 'Mariana Costa', validaAte, conteudo, escritorio };
  return (
    <>
      <Cabeca titulo="A prévia">Assim o cliente abre a sua proposta.</Cabeca>
      <div className="overflow-hidden rounded-cartao ring-1 ring-inset ring-linha">
        <Pagina escritorio={escritorio} selo previa>
          <div className="flex flex-col gap-3">
            <CorpoDaProposta p={p} pacote={pacote} aoPacote={setPacote} />
          </div>
        </Pagina>
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ gravar
export async function gravarMarca(marca) {
  if (AULA) gravarEscritorioDaAula(marca.nome.trim(), marca.cor, marca.logo);
  if (AMOSTRA) return null;
  const { termoDeFabrica, ...atual } = (await rpc('meu_escritorio')) ?? {};
  // o termo de fábrica vai nulo, para continuar o de fábrica (e acompanhar quando ele mudar)
  const r = await rpc('gravar_escritorio', { p: { ...atual, nome: marca.nome.trim(), cor: marca.cor, termo: termoDeFabrica ? null : atual.termo ?? null } });
  return r && r.ok === false ? r.motivo : null;
}

function limpar(precos) {
  return {
    ...precos,
    m2: Object.fromEntries(Object.entries(precos.m2 ?? {}).map(([t, v]) => [t.trim(), v]).filter(([t]) => t)),
    escopo: (precos.escopo ?? []).map((e) => ({ ...e, item: e.item.trim() })).filter((e) => e.item),
    apresentacao: (precos.apresentacao ?? '').trim(),
    condicoes: (precos.condicoes ?? []).map((c) => c.trim()).filter(Boolean),
  };
}

/** Grava os preços com o resto dos ajustes como estão; devolve o estado novo do Comercial. */
export async function gravarPrecos(estado, area, precos) {
  const p = limpar(precos);
  if (AULA) return gravarPrecosDaAula(p);
  if (AMOSTRA) return { ...estado, ajustes: { ...estado.ajustes, precos: p } };
  const a = estado.ajustes;
  const r = await rpc('comercial_ajustes_salvar', { p_area: area, p: { etapas: a.etapas, regras: a.regras, mensagens: a.mensagens, motivos: a.motivos, precos: p, whatsapp: a.whatsapp ?? '' } });
  if (!r.ok) throw new Error(r.motivo);
  return r.estado;
}

export function validarMarca(marca) {
  if (!marca.nome.trim()) return 'Escreva o nome do escritório.';
  if (!/^#[0-9A-Fa-f]{6}$/.test(marca.cor)) return 'A cor vai no código de 6 letras e números, como #A9513F.';
  return '';
}

// a marca de hoje: a do escritório da conta (ou a da amostra)
export function useMarca(nomeInicial) {
  const [marca, setMarca] = useState(null);
  useEffect(() => {
    if (AULA) return setMarca({ ...marcaDaAula(), nome: nomeInicial ?? marcaDaAula().nome });
    if (AMOSTRA) return setMarca({ ...AMOSTRA_FORMULARIO_PUBLICO.escritorio, nome: nomeInicial ?? AMOSTRA_FORMULARIO_PUBLICO.escritorio.nome });
    rpc('meu_escritorio').then(
      (e) => setMarca({ nome: e?.nome || nomeInicial || '', cor: e?.nome ? e.cor : '#A9513F', logo: e?.logo ?? null }),
      () => setMarca({ nome: nomeInicial ?? '', cor: '#A9513F', logo: null }),
    );
  }, []);
  return [marca, setMarca];
}

// ------------------------------------------------------------------------------------------------ SUA PROPOSTA (o botão do Comercial)
const PASSOS = [PassoMarca, PassoPrecos, PassoPacotes, PassoPagamento, PassoTexto, PassoPrevia];

export function SuaProposta({ estado, area, aoSalvar, aoVoltar }) {
  const [passo, setPasso] = useState(0);
  const [marca, setMarca] = useMarca(estado.escritorio?.includes('@') ? '' : estado.escritorio);
  const [precos, setPrecos] = useState(estado.ajustes.precos);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function seguir() {
    setErro('');
    if (passo === 0) {
      const falta = validarMarca(marca);
      if (falta) return setErro(falta);
    }
    if (passo < PASSOS.length - 1) return setPasso(passo + 1);
    setOcupado(true);
    try {
      const motivo = await gravarMarca(marca);
      if (motivo) return setErro(motivo);
      const novo = await gravarPrecos(estado, area, precos);
      aoSalvar({ ...novo, escritorio: marca.nome.trim() });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  if (!marca) return <p className="text-texto-apagado">Carregando…</p>;
  const Passo = PASSOS[passo];
  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={aoVoltar} className="inline-flex items-center gap-1 self-start text-destaque-texto">
        <Icone nome="seta" className="rotate-180" /> Comercial
      </button>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 rounded-cartao bg-superficie p-5 shadow-cartao sm:p-7">
        <Pontos passo={passo} total={PASSOS.length} />
        <Passo marca={marca} aoMudar={passo === 0 ? setMarca : setPrecos} precos={precos} />
        <Mensagem erro>{erro}</Mensagem>
        <div className="grid grid-cols-2 gap-2">
          {passo > 0 ? <Botao grande type="button" onClick={() => { setErro(''); setPasso(passo - 1); }}>Voltar</Botao> : <span />}
          <Botao grande principal type="button" onClick={seguir} disabled={ocupado}>
            {passo < PASSOS.length - 1 ? 'Continuar' : ocupado ? 'Salvando…' : 'Salvar a proposta'}
          </Botao>
        </div>
      </div>
    </div>
  );
}
