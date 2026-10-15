// PREÇOS E CUPONS no /gestao (plano 18; mockup aprovado em 15/10/2026): o preço do PRO, que vale para o programa e o
// plugin (licença única), os cupons e a importação dos dados do Palheta Flow (uma vez só, com prévia).
import { useEffect, useState } from 'react';
import { Botao, Campo, Lista, Mensagem } from '@/components/Formulario';
import { Acao, Cabecalho, Painel, Selo } from '@/components/GestaoPecas';
import {
  criarCupom, dia, gerarCodigo, importarDadosFlow, lerCupons, lerPrecos, prorrogarCupom, reais, reativarCupom, revogarCupom, salvarPrecos,
} from '@/lib/gestaoFlow';

const fimDoDia = (data) => (data ? new Date(`${data}T23:59:59`).toISOString() : null);
const diasAte = (iso) => Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 864e5));

function seloDoCupom(c) {
  if (c.situacao === 'revogado') return <Selo tom="apagado">REVOGADO</Selo>;
  if (c.situacao === 'vencido') return <Selo tom="apagado">VENCIDO</Selo>;
  if (c.expiraEm && diasAte(c.expiraEm) <= 30) return <Selo tom="atencao">VENCE EM {diasAte(c.expiraEm)} {diasAte(c.expiraEm) === 1 ? 'DIA' : 'DIAS'}</Selo>;
  return <Selo>ATIVO</Selo>;
}

function ImportarDoFlow({ aoTerminar }) {
  const [dados, setDados] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function lerArquivo(arquivo) {
    setErro(''); setPrevia(null); setPronto('');
    try {
      const texto = await arquivo.text();
      let json = JSON.parse(texto);
      if (Array.isArray(json) && json[0]?.dados) json = json[0].dados;   // o SQL Editor baixa a linha inteira
      if (json?.dados) json = json.dados;
      if (typeof json === 'string') json = JSON.parse(json);
      setDados(json);
      setOcupado(true);
      const r = await importarDadosFlow(json, true);
      setOcupado(false);
      if (r?.ok === false) setErro(r.motivo); else setPrevia(r);
    } catch {
      setOcupado(false);
      setErro('Este arquivo não é o JSON da exportação do Flow (supabase/ferramentas/exportar-do-flow.sql).');
    }
  }

  async function confirmar() {
    setOcupado(true);
    const r = await importarDadosFlow(dados, false);
    setOcupado(false);
    if (!r?.ok) { setErro(r?.motivo ?? 'Não deu para importar.'); return; }
    const i = r.importado;
    setPronto(`Importado: ${i.cupons} cupons, ${i.cadastros} cadastros, ${i.descadastros} descadastros, ${i.campanhas} campanhas (${i.envios} envios), ${i.aulas} aulas e ${i.feedbacks} feedbacks${i.precos ? ', e o preço' : ''}. Rodar de novo não duplica nada.`);
    setPrevia(null);
    aoTerminar?.();
  }

  return (
    <Painel titulo="Importar dados do Flow" className="max-w-[640px]">
      <p className="mb-3 text-[13px] text-aqi-muted">
        O arquivo sai da consulta <code>exportar-do-flow.sql</code>, rodada no Supabase do escritório. Traz preço, cupons, cadastros, descadastros,
        campanhas, aulas e feedbacks. As licenças entram pela aba LICENÇAS e o CPF não vem.
      </p>
      <input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])}
        className="mb-3 block w-full text-[13px] text-aqi-texto file:mr-3 file:h-[34px] file:cursor-pointer file:border-0 file:bg-aqi-campo file:px-3 file:font-bold file:text-white" />
      <div aria-live="polite">
        <Mensagem erro>{erro}</Mensagem>
        <Mensagem>{pronto}</Mensagem>
      </div>
      {previa && (
        <>
          <p className="mb-3 text-[13px] text-white">
            PRÉVIA: {previa.cupons} cupons · {previa.cadastros} cadastros · {previa.descadastros} descadastros · {previa.campanhas} campanhas ·{' '}
            {previa.aulas} aulas · {previa.feedbacks} feedbacks{previa.precos ? ' · o preço' : ''}
          </p>
          <div className="flex justify-end gap-2">
            <Botao nivel={3} type="button" onClick={() => { setPrevia(null); setDados(null); }}>CANCELAR</Botao>
            <Botao principal type="button" onClick={confirmar} disabled={ocupado}>CONFIRMAR IMPORTAÇÃO</Botao>
          </div>
        </>
      )}
    </Painel>
  );
}

export default function GestaoPrecosCupons() {
  const [precos, setPrecos] = useState(null);
  const [parcela, setParcela] = useState('');
  const [parcelas, setParcelas] = useState('12');
  const [avista, setAvista] = useState('');
  const [cupons, setCupons] = useState([]);
  const [codigo, setCodigo] = useState('');
  const [desconto, setDesconto] = useState('10');
  const [validade, setValidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [importar, setImportar] = useState(false);

  async function carregar() {
    const [p, c] = await Promise.all([lerPrecos(), lerCupons()]);
    if (p) {
      setPrecos(p);
      setParcela(reais(p.parcela)); setParcelas(String(p.parcelas)); setAvista(reais(p.avista));
    }
    setCupons(c);
  }
  useEffect(() => { carregar(); }, []);

  const numero = (t) => Number(String(t).replace(/\./g, '').replace(',', '.'));
  const nParcela = numero(parcela), nParcelas = Number(parcelas), nAvista = numero(avista);
  const previaSite = nParcela > 0 && nAvista > 0
    ? `${nParcelas} × de R$ ${reais(nParcela)} (R$ ${reais(nParcela * nParcelas)} no total) ou R$ ${reais(nAvista)} à vista no Pix, por licença e por ano.`
    : 'Preencha os valores.';

  const avisar = (r, texto) => {
    if (r?.ok === false) { setErro(r.motivo ?? 'Não deu certo.'); setAviso(''); return false; }
    setErro(''); setAviso(texto); return true;
  };

  async function salvar(e) {
    e.preventDefault();
    const r = await salvarPrecos(nParcela, nParcelas, nAvista);
    if (avisar(r, 'Preço salvo. A página de venda já mostra o novo.')) carregar();
  }

  async function criar(e) {
    e.preventDefault();
    const r = await criarCupom(codigo, Number(desconto), fimDoDia(validade), observacao);
    if (avisar(r, `Cupom ${r?.codigo ?? codigo.toUpperCase()} criado.`)) {
      setCodigo(''); setValidade(''); setObservacao('');
      carregar();
    }
  }

  async function agir(fn, c, texto) {
    const r = await fn(c.id);
    if (avisar(r, texto)) carregar();
  }

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Preços e cupons">
        <Botao nivel={3} type="button" onClick={() => setImportar(!importar)}>IMPORTAR DADOS DO FLOW</Botao>
      </Cabecalho>

      <div className="min-h-[20px]" aria-live="polite">
        <Mensagem>{aviso}</Mensagem>
        <Mensagem erro>{erro}</Mensagem>
      </div>

      {importar && <ImportarDoFlow aoTerminar={carregar} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={salvar}>
          <Painel titulo="Preço do PRO (programa e plugin)">
            <Campo id="pr-parcela" rotulo="PARCELA (R$)" valor={parcela} aoMudar={setParcela} inputMode="decimal" />
            <Lista id="pr-parcelas" rotulo="PARCELAS" valor={parcelas} aoMudar={setParcelas}
              opcoes={Array.from({ length: 24 }, (_, i) => ({ valor: String(i + 1), rotulo: `${i + 1} ×` }))} />
            <Campo id="pr-avista" rotulo="À VISTA (R$)" valor={avista} aoMudar={setAvista} inputMode="decimal" />
            <p className="mb-3 mt-2 text-[12px] leading-relaxed text-aqi-muted">NO SITE: {previaSite}</p>
            {precos?.atualizadoEm && <p className="mb-3 text-[12px] text-aqi-muted">Mudado pela última vez em {dia(precos.atualizadoEm)}.</p>}
            <div className="flex justify-end"><Botao principal type="submit">SALVAR PREÇOS</Botao></div>
          </Painel>
        </form>

        <form onSubmit={criar}>
          <Painel titulo="Novo cupom">
            <Campo id="cu-codigo" rotulo="CÓDIGO" valor={codigo} aoMudar={(v) => setCodigo(v.toUpperCase())} placeholder="PFPRO15"
              dica={<button type="button" className="font-semibold text-white hover:underline" onClick={() => setCodigo(gerarCodigo())}>GERAR</button>} />
            <Campo id="cu-desconto" rotulo="DESCONTO (%)" tipo="number" valor={desconto} aoMudar={setDesconto} min="1" max="100" />
            <Campo id="cu-validade" rotulo="VALIDADE" tipo="date" valor={validade} aoMudar={setValidade} dica={validade ? '' : 'sem validade'} />
            <Campo id="cu-obs" rotulo="OBSERVAÇÃO" valor={observacao} aoMudar={setObservacao} placeholder="opcional, ex.: só pro João (WhatsApp)" />
            <div className="mt-3 flex justify-end"><Botao principal type="submit">CRIAR CUPOM</Botao></div>
          </Painel>
        </form>
      </div>

      <Painel titulo={`Cupons (${cupons.length})`}>
        {cupons.length === 0 ? (
          <p className="text-[14px] text-aqi-muted">Nenhum cupom ainda.</p>
        ) : (
          <ul className="divide-y divide-[#262D37]">
            {cupons.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
                <b className="min-w-[90px] tracking-[0.06em] text-white">{c.codigo}</b>
                <span className="text-white">{c.desconto}%</span>
                <span className="mr-auto text-aqi-muted">
                  {c.expiraEm ? `até ${dia(c.expiraEm)}` : 'sem validade'}{c.observacao ? ` · ${c.observacao}` : ''}
                </span>
                {c.origem === 'flow' && <Selo tom="apagado">VEIO DO FLOW</Selo>}
                {seloDoCupom(c)}
                {c.situacao !== 'revogado' && c.expiraEm && <Acao onClick={() => agir(prorrogarCupom, c, `${c.codigo}: mais 7 dias.`)}>+7 DIAS</Acao>}
                {c.situacao === 'revogado'
                  ? <Acao onClick={() => agir(reativarCupom, c, `${c.codigo} voltou a valer.`)}>REATIVAR</Acao>
                  : <Acao onClick={() => agir(revogarCupom, c, `${c.codigo} revogado.`)}>REVOGAR</Acao>}
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}
