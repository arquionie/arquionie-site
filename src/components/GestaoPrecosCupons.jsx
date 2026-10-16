// PREÇOS E CUPONS no /gestao (plano 18; mockup aprovado em 15/10/2026): o preço do PRO, que vale para o programa e o
// plugin (licença única), os cupons e a importação dos dados do Palheta Flow (uma vez só, com prévia).
// No modo AMIGÁVEL desde o mockup gestao-amigavel (ÊDI, 16/10/2026).
import { useEffect, useState } from 'react';
import { Botao, Campo, Etiqueta, Lista, Mensagem } from '@/components/Formulario';
import { Acao, Cabecalho, Painel, Selo } from '@/components/GestaoPecas';
import { Confirmacao, Grupo, Linha, TextoDaLinha, Vazio } from '@/components/Listas';
import {
  criarCupom, dia, gerarCodigo, importarDadosFlow, lerCupons, lerPrecos, prorrogarCupom, reais, reativarCupom, revogarCupom, salvarPrecos,
} from '@/lib/gestaoFlow';

const fimDoDia = (data) => (data ? new Date(`${data}T23:59:59`).toISOString() : null);
const diasAte = (iso) => Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 864e5));

// O lado de texto da linha com uma largura mínima: no celular, as etiquetas e os botões é que descem, e não o texto que espreme.
const ESQUERDA = 'flex min-w-[min(100%,16rem)] flex-1 items-start gap-3';

function seloDoCupom(c) {
  if (c.situacao === 'revogado') return <Selo tom="apagado">Revogado</Selo>;
  if (c.situacao === 'vencido') return <Selo tom="apagado">Vencido</Selo>;
  if (c.expiraEm && diasAte(c.expiraEm) <= 30) return <Selo tom="atencao">Vence em {diasAte(c.expiraEm)} {diasAte(c.expiraEm) === 1 ? 'dia' : 'dias'}</Selo>;
  return <Selo>Ativo</Selo>;
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
      <div className="flex flex-col gap-3">
        <p className="text-amg-legenda text-texto-apagado">
          O arquivo sai da consulta <code>exportar-do-flow.sql</code>, rodada no Supabase do escritório. Traz preço, cupons, cadastros, descadastros,
          campanhas, aulas e feedbacks. As licenças entram pela aba Licenças e o CPF não vem.
        </p>
        {/* o botão do arquivo com a cara do nível 2 pequeno */}
        <input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])}
          className="block w-full min-w-0 text-amg-legenda text-texto-apagado file:mr-3 file:h-botao-pequeno file:cursor-pointer file:rounded-toque file:border-0 file:bg-botao-2 file:px-[13px] file:font-semibold file:text-botao-2-texto" />
        <div aria-live="polite" className="flex flex-col gap-2 empty:-mt-3">
          <Mensagem erro>{erro}</Mensagem>
          <Mensagem>{pronto}</Mensagem>
        </div>
        {previa && (
          <>
            <p className="text-amg-legenda">
              <b className="font-semibold">Prévia:</b> {previa.cupons} cupons · {previa.cadastros} cadastros · {previa.descadastros} descadastros ·{' '}
              {previa.campanhas} campanhas · {previa.aulas} aulas · {previa.feedbacks} feedbacks{previa.precos ? ' · o preço' : ''}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Botao type="button" onClick={() => { setPrevia(null); setDados(null); }}>Cancelar</Botao>
              <Botao principal type="button" onClick={confirmar} disabled={ocupado}>Confirmar importação</Botao>
            </div>
          </>
        )}
      </div>
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
  // o REVOGAR pergunta antes, na própria linha (o guia do amigável: confirmar antes de apagar ou revogar)
  const [revogando, setRevogando] = useState(null);

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
    <div className="flex flex-col gap-4">
      <Cabecalho titulo="Preços e cupons">
        <Botao type="button" onClick={() => setImportar(!importar)}>Importar dados do Flow</Botao>
      </Cabecalho>

      {/* vazio, o aviso não ocupa lugar: o -mt-4 desfaz o espaço da coluna */}
      <div aria-live="polite" className="flex flex-col gap-2 empty:-mt-4">
        <Mensagem>{aviso}</Mensagem>
        <Mensagem erro>{erro}</Mensagem>
      </div>

      {importar && <ImportarDoFlow aoTerminar={carregar} />}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <form onSubmit={salvar}>
          <Painel titulo="Preço do PRO (programa e plugin)">
            <div className="flex flex-col gap-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <Campo id="pr-parcela" rotulo="Parcela (R$)" valor={parcela} aoMudar={setParcela} inputMode="decimal" />
                <Lista id="pr-parcelas" rotulo="Parcelas" valor={parcelas} aoMudar={setParcelas}
                  opcoes={Array.from({ length: 24 }, (_, i) => ({ valor: String(i + 1), rotulo: `${i + 1} ×` }))} />
                <Campo id="pr-avista" rotulo="À vista (R$)" valor={avista} aoMudar={setAvista} inputMode="decimal" />
              </div>
              <p className="text-amg-legenda text-texto-apagado">
                No site: {previaSite}
                {precos?.atualizadoEm && <span className="block">Mudado pela última vez em {dia(precos.atualizadoEm)}.</span>}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Botao principal type="submit">Salvar preços</Botao></div>
            </div>
          </Painel>
        </form>

        <form onSubmit={criar}>
          <Painel titulo="Novo cupom">
            <div className="flex flex-col gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {/* o GERAR fica dentro da cápsula do código, como o MOSTRAR da senha; o -mr-3 desfaz a margem da dica do Campo */}
                <Campo id="cu-codigo" rotulo="Código" valor={codigo} aoMudar={(v) => setCodigo(v.toUpperCase())} placeholder="PFPRO15"
                  dica={<Botao pequeno nivel={2} type="button" className="-mr-3" onClick={() => setCodigo(gerarCodigo())}>Gerar</Botao>} />
                <Campo id="cu-desconto" rotulo="Desconto (%)" tipo="number" valor={desconto} aoMudar={setDesconto} min="1" max="100" />
                <Campo id="cu-validade" rotulo="Validade" tipo="date" valor={validade} aoMudar={setValidade} dica={validade ? '' : 'sem validade'} />
                <Campo id="cu-obs" rotulo="Observação" valor={observacao} aoMudar={setObservacao} placeholder="opcional, ex.: só pro João (WhatsApp)" />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Botao principal type="submit">Criar cupom</Botao></div>
            </div>
          </Painel>
        </form>
      </div>

      {cupons.length === 0 ? (
        <section>
          <h2 className="rotulo mb-1.5 ml-3.5">Cupons · 0</h2>
          <Vazio>Nenhum cupom ainda.</Vazio>
        </section>
      ) : (
        <Grupo rotulo={`Cupons · ${cupons.length}`}>
          {cupons.map((c) => (
            <Linha key={c.id}>
              <div className={ESQUERDA}>
                <TextoDaLinha titulo={c.codigo} sub={`${c.expiraEm ? `até ${dia(c.expiraEm)}` : 'sem validade'}${c.observacao ? ` · ${c.observacao}` : ''}`} />
                <span className="whitespace-nowrap text-amg-valor tabular-nums">{c.desconto}%</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* direto na Etiqueta: o Selo passaria o Flow para minúscula */}
                {c.origem === 'flow' && <Etiqueta tipo="informacao">Veio do Flow</Etiqueta>}
                {seloDoCupom(c)}
                {c.situacao !== 'revogado' && c.expiraEm && (
                  <Acao nivel={2} onClick={() => agir(prorrogarCupom, c, `${c.codigo}: mais 7 dias.`)}>+7 dias</Acao>
                )}
                {c.situacao === 'revogado'
                  ? <Acao nivel={2} onClick={() => agir(reativarCupom, c, `${c.codigo} voltou a valer.`)}>Reativar</Acao>
                  : <Acao onClick={() => setRevogando(c.id)}>Revogar</Acao>}
              </div>
              {revogando === c.id && (
                <div className="w-full">
                  <Confirmacao voltar={() => setRevogando(null)} rotulo="Revogar"
                    acao={() => { setRevogando(null); agir(revogarCupom, c, `${c.codigo} revogado.`); }}>
                    Revogar o cupom <b>{c.codigo}</b>? Ele deixa de valer na página de venda. Dá para reativar depois.
                  </Confirmacao>
                </div>
              )}
            </Linha>
          ))}
        </Grupo>
      )}
    </div>
  );
}
