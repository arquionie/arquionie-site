import { useEffect, useMemo, useState } from 'react';
import { Botao, Campo, Lista, Mensagem } from '@/components/Formulario';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import {
  AMOSTRA, AMOSTRA_GESTAO_LICENCAS, PLANOS, baixarArquivo, copiarTexto, dataCurta, nomeProduto, rotuloSituacao, textoWhatsApp,
} from '@/lib/licencas';

// /gestao › LICENÇAS (mockup aprovado pelo ÊDI em 05/10/2026; plano 17 do plugin). A venda é pelo WhatsApp: o gestor
// LIBERA pelo e-mail de quem comprou e copia a mensagem pronta. Todas as funções conferem no banco se quem chama é
// administrador (gestao_*); esta tela só mostra e pede.

const ORIGENS = { whatsapp: 'WHATSAPP', 'importada-flow': 'IMPORTADA DO FLOW', equipe: 'EQUIPE', cortesia: 'CORTESIA' };
const FILTROS = [
  { valor: 'todas', rotulo: 'TODAS' },
  { valor: 'esperando a conta', rotulo: 'ESPERANDO A CONTA' },
  { valor: 'sem titular', rotulo: 'SEM TITULAR' },
  { valor: 'vencendo', rotulo: 'VENCENDO' },
  { valor: 'vencida', rotulo: 'VENCIDAS' },
  { valor: 'revogada', rotulo: 'REVOGADAS' },
];
const daquiAUmAno = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};
const fimDoDia = (data) => `${data}T23:59:59-03:00`;
const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// A planilha exportada do Supabase do escritório (email; expira_em; quantidade), em CSV ou JSON.
function lerArquivoDoFlow(texto) {
  const limpo = texto.replace(/^﻿/, '').trim();
  if (limpo.startsWith('[')) {
    try {
      return JSON.parse(limpo).map((l) => ({ email: l.email ?? l.email_dono ?? '', expira_em: l.expira_em ?? '', quantidade: l.quantidade ?? 1 }));
    } catch {
      return null;
    }
  }
  const linhas = limpo.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const sep = [';', ',', '\t'].sort((a, b) => linhas[0].split(b).length - linhas[0].split(a).length)[0];
  const limpar = (v) => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"').trim();
  const cab = linhas[0].split(sep).map((c) => limpar(c).toLowerCase());
  const col = (...nomes) => cab.findIndex((c) => nomes.includes(c));
  const iEmail = col('email', 'email_dono', 'e-mail');
  const iAte = col('expira_em', 'validade', 'expira');
  const iQtd = col('quantidade', 'licencas', 'licenças', 'qtd');
  if (iEmail < 0 || iAte < 0) return null;
  return linhas.slice(1).map((l) => {
    const v = l.split(sep).map(limpar);
    return { email: v[iEmail] ?? '', expira_em: v[iAte] ?? '', quantidade: iQtd >= 0 ? v[iQtd] || '1' : '1' };
  });
}

function Numero({ rotulo, valor, detalhe }) {
  return (
    <div className="bg-aqi-barra p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-aqi-muted">{rotulo}</div>
      <div className="mt-1 text-[30px] font-bold leading-tight text-white">{valor ?? 0}</div>
      {detalhe && <div className="text-[12px] text-aqi-muted">{detalhe}</div>}
    </div>
  );
}

function Painel({ titulo, children }) {
  return (
    <section className="bg-aqi-barra p-5">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-aqi-coral">{titulo}</h2>
      {children}
    </section>
  );
}

export default function GestaoLicencas() {
  const [dados, setDados] = useState(null);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [painel, setPainel] = useState(null);
  const [mensagem, setMensagem] = useState('');
  const [copiada, setCopiada] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [acao, setAcao] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  // LIBERAR
  const [dono, setDono] = useState('');
  const [produto, setProduto] = useState('arquionie-revit');
  const [plano, setPlano] = useState('pro');
  const [quantidade, setQuantidade] = useState('1');
  const [validade, setValidade] = useState(daquiAUmAno());
  const [observacao, setObservacao] = useState('');
  // IMPORTAR e TROCAR E-MAIL
  const [linhas, setLinhas] = useState(null);
  const [qual, setQual] = useState('titular');
  const [novoEmail, setNovoEmail] = useState('');
  const [fim, setFim] = useState('');

  async function carregar() {
    if (AMOSTRA) return setDados(AMOSTRA_GESTAO_LICENCAS);
    const { data, error } = await supabase.rpc('gestao_licencas');
    setDados(error ? { erro: error } : data);
    if (!error) setFim(data.ajustes?.fim_convivencia?.slice(0, 10) ?? '');
  }
  useEffect(() => {
    carregar();
  }, []);

  // Chama uma função do banco; na amostra, não grava nada.
  async function pedir(nome, args) {
    if (AMOSTRA) return { ok: true, amostra: true };
    const { data, error } = await supabase.rpc(nome, args);
    if (error) throw error;
    return data;
  }

  async function executar(fn) {
    setErro('');
    setAviso('');
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (dados?.licencas ?? []).filter(
      (l) => (filtro === 'todas' || l.situacao === filtro) && (!termo || `${l.dono} ${l.titular ?? ''}`.toLowerCase().includes(termo)),
    );
  }, [dados, busca, filtro]);

  if (!dados) return <p className="text-aqi-muted">Carregando as licenças…</p>;
  if (dados.erro) {
    return (
      <p className="bg-aqi-barra p-5 text-aqi-alerta">
        Não deu para ler as licenças: {dados.erro.message}. Confira se a migração 20261005010000 foi rodada no Supabase.
      </p>
    );
  }
  const r = dados.resumo;
  const computadoresRevit = Object.values(dados.versoes ?? {}).reduce((a, b) => a + b, 0);
  const versoes = Object.entries(dados.versoes ?? {}).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} (${n})`).join(' · ');

  const liberar = (e) => {
    e.preventDefault();
    executar(async () => {
      const email = dono.trim().toLowerCase();
      const qtd = Math.round(Number(quantidade));
      if (!emailValido(email)) return setErro('Digite o e-mail de quem comprou.');
      if (!(qtd >= 1 && qtd <= 100)) return setErro('A quantidade vai de 1 a 100.');
      if (!validade) return setErro('Escolha a validade.');
      const res = await pedir('gestao_liberar', {
        p_dono_email: email, p_produto: produto, p_quantidade: qtd, p_expira_em: fimDoDia(validade),
        p_plano: plano, p_origem: plano === 'equipe' ? 'equipe' : 'whatsapp', p_observacao: observacao.trim() || null,
      });
      if (!res.ok) return setErro(res.motivo);
      setMensagem(textoWhatsApp({ email, produto, quantidade: qtd, expiraEm: fimDoDia(validade) }));
      setCopiada('');
      setPainel(null);
      setDono('');
      setObservacao('');
      setQuantidade('1');
      setAviso(res.amostra ? 'Amostra: nada foi gravado.' : `${qtd === 1 ? 'Licença liberada' : `${qtd} licenças liberadas`} para ${email}.`);
      carregar();
    });
  };

  async function lerArquivo(arquivo) {
    setErro('');
    setLinhas(null);
    if (!arquivo) return;
    const lidas = lerArquivoDoFlow(await arquivo.text());
    if (lidas === null) return setErro('O arquivo precisa das colunas email e expira_em (e, se houver, quantidade).');
    setLinhas(lidas);
  }

  const importar = () =>
    executar(async () => {
      const res = await pedir('gestao_importar_flow', { p_linhas: linhas });
      setPainel(null);
      setLinhas(null);
      setAviso(
        res.amostra
          ? 'Amostra: nada foi gravado.'
          : `Importados ${res.importados} clientes (${res.licencas} licenças). Já estavam importados: ${res.pulados}. Linhas com problema: ${res.problemas?.length ?? 0}.`,
      );
      carregar();
    });

  const baixarCopia = () =>
    executar(async () => {
      const copia = AMOSTRA ? { geradaEm: new Date().toISOString(), licencas: dados.licencas, historico: [] } : await pedir('gestao_copia_licencas', {});
      baixarArquivo(JSON.stringify(copia, null, 2), `copia-licencas-arquionie-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
      setAviso('Cópia baixada. Guarde numa pasta particular: são dados de clientes.');
    });

  function baixarPlanilha() {
    const cab = ['Produto', 'Plano', 'Quem comprou', 'Quem usa', 'Situação', 'Validade', 'Origem', 'Bônus', 'Computadores', 'Observação', 'Criada em'];
    const ls = lista.map((l) => [
      nomeProduto(l.produto), PLANOS[l.plano] ?? l.plano, l.dono, l.titular ?? '', rotuloSituacao(l.situacao, l.expiraEm), dataCurta(l.expiraEm),
      ORIGENS[l.origem] ?? l.origem, l.bonus ? 'sim' : 'não', l.computadores ?? 0, l.observacao ?? '', dataCurta(l.criadaEm),
    ]);
    const csv = [cab, ...ls].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    baixarArquivo('﻿' + csv, `licencas-arquionie-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  }

  const confirmarAcao = () =>
    executar(async () => {
      const { tipo, l } = acao;
      if (tipo === 'trocar') {
        const v = novoEmail.trim().toLowerCase();
        if (qual === 'dono' && !emailValido(v)) return setErro('Digite o novo e-mail de quem comprou.');
        if (qual === 'titular' && v && !emailValido(v)) return setErro('Digite um e-mail válido, ou deixe vazio para tirar o titular.');
        const res = await pedir('gestao_trocar_email', { p_id: l.id, p_qual: qual, p_email: v || null });
        if (!res.ok) return setErro(res.motivo);
      } else if (tipo === 'renovar') {
        const res = await pedir('gestao_renovar', { p_id: l.id, p_meses: 12 });
        if (!res.ok) return setErro(res.motivo);
      } else {
        await pedir(tipo === 'revogar' ? 'gestao_revogar' : 'gestao_reativar', { p_id: l.id });
      }
      setAcao(null);
      setNovoEmail('');
      setAviso(AMOSTRA ? 'Amostra: nada foi gravado.' : 'Feito.');
      carregar();
    });

  const salvarFim = () =>
    executar(async () => {
      await pedir('gestao_ajustes_licenca', { p_fim_convivencia: fim ? fimDoDia(fim) : null });
      setAviso(AMOSTRA ? 'Amostra: nada foi gravado.' : fim ? `Fim da convivência: ${dataCurta(fimDoDia(fim))}.` : 'Fim da convivência apagado: ninguém ganha o bônus.');
    });

  async function copiarMensagem() {
    setCopiada((await copiarTexto(mensagem)) ? 'COPIADA' : 'Selecione o texto acima e copie com Ctrl+C.');
  }

  const selo = (l) => {
    const cor = {
      'sem titular': 'bg-aqi-campo text-white',
      'esperando a conta': 'border border-aqi-borda text-aqi-texto',
      vencendo: 'border border-aqi-alerta text-aqi-alerta',
      ativa: 'border border-aqi-borda text-white',
    }[l.situacao] ?? 'border border-aqi-borda text-aqi-muted';
    return <span className={`whitespace-nowrap px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${cor}`}>{rotuloSituacao(l.situacao, l.expiraEm)}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="mr-auto">
          <p className="titulo-secao mb-1">Painel do gestor{AMOSTRA ? ' · dados de exemplo' : ''}</p>
          <h1 className="text-[28px] font-semibold text-white">Licenças</h1>
        </div>
        <Botao type="button" onClick={baixarCopia} disabled={ocupado}>BAIXAR CÓPIA DAS LICENÇAS</Botao>
        <Botao type="button" onClick={() => { setPainel('importar'); setMensagem(''); setErro(''); }}>IMPORTAR CLIENTES DO FLOW</Botao>
        <Botao principal type="button" onClick={() => { setPainel('liberar'); setMensagem(''); setErro(''); }}>LIBERAR LICENÇA</Botao>
      </div>

      <div className="min-h-[20px]" aria-live="polite">
        <Mensagem>{aviso}</Mensagem>
        <Mensagem erro>{erro}</Mensagem>
      </div>

      <div className="grid gap-px bg-[#262D37] sm:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="Ativas" valor={r.ativas} detalhe={`${r.vencendo} ${r.vencendo === 1 ? 'vence' : 'vencem'} em 30 dias`} />
        <Numero
          rotulo="Esperando a conta"
          valor={r.esperando}
          detalhe={`${r.importadasEsperando} ${r.importadasEsperando === 1 ? 'importada' : 'importadas'} do Flow`}
        />
        <Numero rotulo="Sem titular" valor={r.semTitular} detalhe="para os donos distribuírem" />
        <Numero rotulo="Computadores no Revit" valor={computadoresRevit} detalhe={versoes || 'nenhum ainda'} />
      </div>

      {painel === 'liberar' && (
        <form onSubmit={liberar} className="max-w-[640px]">
          <Painel titulo="Liberar licença">
            <Campo id="lib-dono" rotulo="E-MAIL DE QUEM COMPROU" tipo="email" valor={dono} aoMudar={setDono} autoFocus />
            <Lista id="lib-produto" rotulo="PRODUTO" valor={produto} aoMudar={setProduto}
              opcoes={[{ valor: 'arquionie-revit', rotulo: nomeProduto('arquionie-revit').toUpperCase() }, { valor: 'arquionie', rotulo: nomeProduto('arquionie').toUpperCase() }]} />
            <Lista id="lib-plano" rotulo="PLANO" valor={plano} aoMudar={setPlano}
              opcoes={[{ valor: 'pro', rotulo: 'PRO (CLIENTE)' }, { valor: 'equipe', rotulo: 'EQUIPE (COLABORADOR)' }]} />
            <Campo id="lib-qtd" rotulo="QUANTIDADE" tipo="number" valor={quantidade} aoMudar={setQuantidade} min="1" max="100" />
            <Campo id="lib-validade" rotulo="VALIDADE" tipo="date" valor={validade} aoMudar={setValidade} />
            <Campo id="lib-obs" rotulo="OBSERVAÇÃO" valor={observacao} aoMudar={setObservacao} placeholder="opcional, ex.: pago por Pix" />
            <p className="mt-2 text-[12px] text-aqi-muted">Uma licença fica com quem comprou. Várias ficam sem titular, para ele passar aos colegas em MINHA CONTA.</p>
            <div className="mt-3 flex justify-end gap-2.5">
              <Botao type="button" onClick={() => setPainel(null)}>CANCELAR</Botao>
              <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'LIBERANDO…' : 'LIBERAR'}</Botao>
            </div>
          </Painel>
        </form>
      )}

      {painel === 'importar' && (
        <div className="max-w-[640px]">
          <Painel titulo="Importar clientes do Flow">
            <p className="mb-3 text-[14px]">
              Uma vez só, no dia da troca: o arquivo exportado do Supabase do escritório, com as colunas email, expira_em e quantidade. Quem já foi
              importado é pulado.
            </p>
            <input type="file" accept=".csv,.txt,.json" aria-label="Arquivo dos clientes do Flow" onChange={(e) => lerArquivo(e.target.files?.[0])}
              className="mb-3 block w-full text-[13px] text-aqi-texto file:mr-3 file:h-[38px] file:border-0 file:bg-aqi-campo file:px-4 file:text-[12px] file:font-bold file:text-white" />
            {linhas && (
              <p className="mb-3 text-[14px]" role="status">
                {linhas.length} clientes, {linhas.reduce((a, l) => a + (Number(l.quantidade) || 0), 0)} licenças no arquivo. Confira e clique IMPORTAR.
              </p>
            )}
            <div className="flex justify-end gap-2.5">
              <Botao type="button" onClick={() => { setPainel(null); setLinhas(null); }}>CANCELAR</Botao>
              <Botao principal type="button" onClick={importar} disabled={!linhas?.length || ocupado}>IMPORTAR</Botao>
            </div>
          </Painel>
        </div>
      )}

      {mensagem && (
        <div className="max-w-[640px]">
          <Painel titulo="Mensagem pronta para o WhatsApp">
            <p className="whitespace-pre-line text-[14px]">{mensagem}</p>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
              <span role="status" className="text-[12px] text-aqi-muted">{copiada}</span>
              <Botao principal type="button" onClick={copiarMensagem}>COPIAR MENSAGEM</Botao>
            </div>
          </Painel>
        </div>
      )}

      <section className="bg-aqi-barra p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-[13px] font-semibold uppercase tracking-[0.12em] text-aqi-coral">
            Licenças <span className="text-aqi-muted">· {lista.length}</span>
          </h2>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar e-mail" aria-label="Procurar e-mail"
            className="h-[38px] w-[220px] bg-aqi-valor px-3 text-[13px] text-white placeholder:text-[#C9A9A5] focus:outline-none" />
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtro" className="h-[38px] bg-aqi-valor px-3 text-[13px] text-white focus:outline-none">
            {FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
          </select>
          <button type="button" onClick={baixarPlanilha} className="h-[38px] bg-aqi-campo px-4 text-[12px] font-bold tracking-wide text-white hover:bg-aqi-campohover">
            BAIXAR PLANILHA
          </button>
        </div>
        {lista.length === 0 ? (
          <p className="py-6 text-center text-aqi-muted">Nenhuma licença com esse filtro.</p>
        ) : (
          <ul className="divide-y divide-[#262D37] border-t border-aqi-borda">
            {lista.map((l) => (
              <li key={l.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="mr-auto break-all text-[14px] text-white">{l.dono}</span>
                  {selo(l)}
                </div>
                <p className="mt-1 text-[12px] text-aqi-muted">
                  Usa: {l.titular ? (l.titular === l.dono ? 'o próprio dono' : l.titular) : 'ninguém ainda'} · {nomeProduto(l.produto)} ·{' '}
                  {PLANOS[l.plano] ?? l.plano} · até {dataCurta(l.expiraEm)} · {ORIGENS[l.origem] ?? l.origem}
                  {l.bonus ? ' · bônus somado' : ''} · {l.computadores ?? 0} de 3 computadores
                  {l.observacao ? ` · ${l.observacao}` : ''}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {l.situacao === 'revogada' ? (
                    <button type="button" className="link text-[12px]" onClick={() => setAcao({ tipo: 'reativar', l })}>REATIVAR</button>
                  ) : (
                    <>
                      <button type="button" className="link text-[12px]" onClick={() => setAcao({ tipo: 'renovar', l })}>RENOVAR</button>
                      <button type="button" className="link text-[12px]" onClick={() => setAcao({ tipo: 'revogar', l })}>REVOGAR</button>
                      <button type="button" className="link text-[12px]" onClick={() => { setAcao({ tipo: 'trocar', l }); setQual('titular'); setNovoEmail(''); }}>
                        TROCAR E-MAIL
                      </button>
                      <button type="button" className="link text-[12px]" onClick={() => { setMensagem(textoWhatsApp({ email: l.titular || l.dono, produto: l.produto, expiraEm: l.expiraEm })); setCopiada(''); }}>
                        COPIAR MENSAGEM
                      </button>
                    </>
                  )}
                </div>
                {acao?.l.id === l.id && (
                  <div className="mt-2 bg-aqi-pagina p-3">
                    {acao.tipo === 'trocar' ? (
                      <>
                        <Lista id={`qual-${l.id}`} rotulo="QUAL E-MAIL" valor={qual} aoMudar={setQual}
                          opcoes={[{ valor: 'titular', rotulo: 'QUEM USA' }, { valor: 'dono', rotulo: 'QUEM COMPROU' }]} />
                        <Campo id={`novo-${l.id}`} rotulo="NOVO E-MAIL" tipo="email" valor={novoEmail} aoMudar={setNovoEmail}
                          placeholder={qual === 'titular' ? 'vazio = sem titular' : 'exemplo@exemplo.com'} />
                      </>
                    ) : (
                      <p className="mb-2 text-[13px]">
                        {acao.tipo === 'renovar' && `Renovar por 12 meses, a partir de ${dataCurta(new Date(Math.max(Date.now(), new Date(l.expiraEm))).toISOString())}?`}
                        {acao.tipo === 'revogar' && 'Revogar esta licença? Os computadores dela voltam ao grátis na próxima conferência.'}
                        {acao.tipo === 'reativar' && 'Reativar esta licença?'}
                      </p>
                    )}
                    <div className="mt-2 flex justify-end gap-2.5">
                      <Botao type="button" onClick={() => setAcao(null)}>CANCELAR</Botao>
                      <Botao principal type="button" onClick={confirmarAcao} disabled={ocupado}>
                        {{ trocar: 'SALVAR', renovar: 'RENOVAR', revogar: 'REVOGAR', reativar: 'REATIVAR' }[acao.tipo]}
                      </Botao>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="max-w-[640px]">
        <Painel titulo="Fim da convivência com a chave antiga">
          <p className="mb-3 text-[13px] text-aqi-muted">
            Vazio até o dia da troca. Quem entrar com a conta até esta data ganha 30 dias nas licenças importadas do Flow.
          </p>
          <Campo id="fim-convivencia" rotulo="FIM DA CONVIVÊNCIA" tipo="date" valor={fim} aoMudar={setFim} />
          <div className="mt-3 flex justify-end">
            <Botao principal type="button" onClick={salvarFim} disabled={ocupado}>SALVAR</Botao>
          </div>
        </Painel>
      </div>
    </div>
  );
}
