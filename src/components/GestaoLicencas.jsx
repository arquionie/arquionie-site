import { useEffect, useMemo, useState } from 'react';
import { Botao, Campo, Lista, Mensagem } from '@/components/Formulario';
import { Confirmacao, Escolha, emFrase } from '@/components/Listas';
import { Busca, Cabecalho, Numero, Numeros, Painel, Selo } from '@/components/GestaoPecas';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import {
  AMOSTRA, AMOSTRA_GESTAO_LICENCAS, PLANOS, baixarArquivo, copiarTexto, dataCurta, nomeProduto, rotuloSituacao, textoWhatsApp,
} from '@/lib/licencas';

// /gestao › LICENÇAS (mockup aprovado pelo ÊDI em 05/10/2026; plano 17 do plugin). A venda é pelo WhatsApp: o gestor
// LIBERA pelo e-mail de quem comprou e copia a mensagem pronta. Todas as funções conferem no banco se quem chama é
// administrador (gestao_*); esta tela só mostra e pede.
// No modo AMIGÁVEL desde o mockup gestao-amigavel (ÊDI, 16/10/2026).

// A origem no meio da linha apagada ("usa: … · PRO · importada do Flow"), por isso em minúscula fora os nomes próprios.
const ORIGENS = { whatsapp: 'WhatsApp', 'importada-flow': 'importada do Flow', equipe: 'equipe', cortesia: 'cortesia' };
const FILTROS = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'esperando a conta', rotulo: 'Esperando a conta' },
  { valor: 'sem titular', rotulo: 'Sem titular' },
  { valor: 'vencendo', rotulo: 'Vencendo' },
  { valor: 'vencida', rotulo: 'Vencidas' },
  { valor: 'revogada', rotulo: 'Revogadas' },
];
// O tom da etiqueta da situação: urgente para o que pede atenção, informação para esperar a conta, neutra para o resto.
const TOM_DA_SITUACAO = { vencendo: 'atencao', vencida: 'atencao', 'sem titular': 'atencao', 'esperando a conta': 'informacao' };
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

// O cartão aberto (liberar, importar, a mensagem pronta), como o de Minha conta: o rótulo pequeno em cima. Dentro da linha de uma
// licença (trocar e-mail) ele fica "dentro" do cartão da lista: raio-dentro com o contorno da linha, sem sombra (na superfície 2 o
// botão nível 3 sumia, porque tem a mesma cor).
function CartaoAberto({ rotulo, dentro, children, ...resto }) {
  const Tag = resto.onSubmit ? 'form' : 'div';
  const caixa = dentro ? 'w-full rounded-dentro ring-1 ring-inset ring-linha p-3 sm:p-4' : 'rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5';
  return (
    <Tag className={`flex flex-col gap-3 ${caixa}`} {...resto}>
      <p className="rotulo">{rotulo}</p>
      {children}
    </Tag>
  );
}

// Os botões de um cartão aberto: lado a lado o mais forte à direita; em pilha no celular, ele em cima.
function Botoes({ children }) {
  return <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>;
}

// A pergunta antes de renovar ou reativar: como a Confirmacao, mas no tom neutro (não é perigo; o revogar usa a Confirmacao).
function Pergunta({ children, voltar, acao, rotulo, ocupado }) {
  return (
    <div className="flex w-full flex-wrap items-center gap-3 rounded-dentro ring-1 ring-inset ring-linha px-4 py-3">
      <span className="min-w-[min(100%,240px)] flex-1">{children}</span>
      <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
        <Botao type="button" onClick={voltar}>Voltar</Botao>
        <Botao principal type="button" disabled={ocupado} onClick={acao}>{rotulo}</Botao>
      </div>
    </div>
  );
}

// liberarPara (os PEDIDOS DE PLANO, 11/10/2026): { email } abre o LIBERAR com o e-mail de quem pediu.
export default function GestaoLicencas({ liberarPara = null }) {
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
  const produto = 'arquionie';   // licença única (ÊDI, 14/10/2026): programa e plugin com a mesma licença
  const [plano, setPlano] = useState('pro');
  const [quantidade, setQuantidade] = useState('1');
  const [validade, setValidade] = useState(daquiAUmAno());
  const [observacao, setObservacao] = useState('');
  // IMPORTAR e TROCAR E-MAIL
  const [linhas, setLinhas] = useState(null);
  const [qual, setQual] = useState('titular');
  const [novoEmail, setNovoEmail] = useState('');
  const [fim, setFim] = useState('');
  useEffect(() => {
    if (!liberarPara?.email) return;
    setDono(liberarPara.email);
    setPainel('liberar');
    setMensagem('');
    setErro('');
  }, [liberarPara]);

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

  if (!dados) return <p className="text-texto-apagado">Carregando as licenças…</p>;
  if (dados.erro) {
    return (
      <Mensagem erro>
        Não deu para ler as licenças: {dados.erro.message}. Confira se a migração 20261005010000 foi rodada no Supabase.
      </Mensagem>
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
    setCopiada((await copiarTexto(mensagem)) ? 'Copiada.' : 'Selecione o texto acima e copie com Ctrl+C.');
  }

  const selo = (l) => <Selo tom={TOM_DA_SITUACAO[l.situacao] ?? 'apagado'}>{rotuloSituacao(l.situacao, l.expiraEm)}</Selo>;
  // A escolha do filtro com a contagem depois do nome (Todas 6, Esperando a conta 1…), sobre todas as licenças.
  const todas = dados.licencas ?? [];
  const filtros = FILTROS.map((f) => [f.valor, f.rotulo, f.valor === 'todas' ? todas.length : todas.filter((l) => l.situacao === f.valor).length]);

  return (
    <div className="flex flex-col gap-4">
      <Cabecalho titulo="Licenças">
        <Botao type="button" onClick={baixarCopia} disabled={ocupado}>Baixar cópia das licenças</Botao>
        <Botao type="button" onClick={() => { setPainel('importar'); setMensagem(''); setErro(''); }}>Importar clientes do Flow</Botao>
        <Botao principal type="button" onClick={() => { setPainel('liberar'); setMensagem(''); setErro(''); }}>Liberar licença</Botao>
      </Cabecalho>

      {/* vazio, o -mt-4 desfaz o espaço da coluna; com um aviso, a primeira mensagem devolve o espaço */}
      <div className="-mt-4 flex flex-col gap-2 [&>:first-child]:mt-4" aria-live="polite">
        <Mensagem>{aviso}</Mensagem>
        <Mensagem erro>{erro}</Mensagem>
      </div>

      <Numeros>
        <Numero rotulo="Ativas" valor={r.ativas} detalhe={`${r.vencendo} ${r.vencendo === 1 ? 'vence' : 'vencem'} em 30 dias`} />
        <Numero
          rotulo="Esperando a conta"
          valor={r.esperando}
          detalhe={`${r.importadasEsperando} ${r.importadasEsperando === 1 ? 'importada' : 'importadas'} do Flow`}
        />
        <Numero rotulo="Sem titular" valor={r.semTitular} detalhe="para os donos distribuírem" />
        <Numero rotulo="Computadores no Revit" valor={computadoresRevit} detalhe={versoes || 'nenhum ainda'} />
      </Numeros>

      {painel === 'liberar' && (
        <CartaoAberto rotulo="Liberar licença" onSubmit={liberar}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo id="lib-dono" rotulo="E-mail de quem comprou" tipo="email" valor={dono} aoMudar={setDono} autoFocus />
            </div>
            <Lista id="lib-plano" rotulo="Plano" valor={plano} aoMudar={setPlano}
              opcoes={[{ valor: 'pro', rotulo: 'PRO (cliente)' }, { valor: 'equipe', rotulo: 'Equipe (colaborador)' }]} />
            <Campo id="lib-qtd" rotulo="Quantidade" tipo="number" valor={quantidade} aoMudar={setQuantidade} min="1" max="100" />
            <Campo id="lib-validade" rotulo="Validade" tipo="date" valor={validade} aoMudar={setValidade} />
            <Campo id="lib-obs" rotulo="Observação" valor={observacao} aoMudar={setObservacao} placeholder="opcional, ex.: pago por Pix" />
          </div>
          <p className="text-amg-legenda text-texto-apagado">
            Uma licença fica com quem comprou. Várias ficam sem titular, para ele passar aos colegas em Minha conta.
          </p>
          <Botoes>
            <Botao type="button" onClick={() => setPainel(null)}>Cancelar</Botao>
            <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'Liberando…' : 'Liberar'}</Botao>
          </Botoes>
        </CartaoAberto>
      )}

      {painel === 'importar' && (
        <CartaoAberto rotulo="Importar clientes do Flow">
          <p>
            Uma vez só, no dia da troca: o arquivo exportado do Supabase do escritório, com as colunas email, expira_em e quantidade. Quem já foi
            importado é pulado.
          </p>
          <input type="file" accept=".csv,.txt,.json" aria-label="Arquivo dos clientes do Flow" onChange={(e) => lerArquivo(e.target.files?.[0])}
            className="block w-full min-w-0 text-amg-legenda text-texto-apagado file:mr-3 file:h-botao-pequeno file:cursor-pointer file:rounded-toque file:border-0 file:bg-botao-2 file:px-[13px] file:font-semibold file:text-botao-2-texto" />
          {linhas && (
            <p role="status">
              {linhas.length} clientes, {linhas.reduce((a, l) => a + (Number(l.quantidade) || 0), 0)} licenças no arquivo. Confira e clique Importar.
            </p>
          )}
          <Botoes>
            <Botao type="button" onClick={() => { setPainel(null); setLinhas(null); }}>Cancelar</Botao>
            <Botao principal type="button" onClick={importar} disabled={!linhas?.length || ocupado}>Importar</Botao>
          </Botoes>
        </CartaoAberto>
      )}

      {mensagem && (
        <CartaoAberto rotulo="Mensagem pronta para o WhatsApp">
          <p className="whitespace-pre-line">{mensagem}</p>
          <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <span role="status" className="text-amg-legenda text-texto-apagado">{copiada}</span>
            <Botao principal type="button" onClick={copiarMensagem}>Copiar mensagem</Botao>
          </div>
        </CartaoAberto>
      )}

      {/* A lista agrupada do modo AMIGÁVEL (mockup gestao-amigavel, 16/10/2026), herdeira do cartão de MINHA CONTA (12/10/2026): em cada
          linha quem comprou, embaixo a linha apagada com quem usa, o plano e a origem, e outra com os computadores e a validade; à direita
          a etiqueta e os botões pela hierarquia (o mais forte à direita; o nível 1 só onde há algo a fazer, como renovar uma licença que vence). */}
      <section>
        <h2 className="rotulo mb-1.5 ml-3.5">Licenças · {lista.length}</h2>
        <div className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">
          <div className="flex flex-col gap-2 border-b border-linha p-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
            <Escolha rotulo="Filtro" opcoes={filtros} valor={filtro} aoMudar={setFiltro} />
            <Busca valor={busca} aoMudar={setBusca} rotulo="Procurar e-mail" className="sm:min-w-[200px] sm:flex-1" />
            <Botao nivel={2} type="button" onClick={baixarPlanilha}>Baixar planilha</Botao>
          </div>
          {lista.length === 0 ? (
            <p className="px-4 py-6 text-center text-texto-apagado">Nenhuma licença com esse filtro.</p>
          ) : (
            lista.map((l) => {
              const urgente = l.situacao === 'vencendo' || l.situacao === 'vencida';
              return (
                <article key={l.id} className="flex min-h-amg-toque-minimo flex-wrap items-center gap-x-3 gap-y-2 border-t border-linha px-4 py-2.5 first:border-t-0">
                  <div className="min-w-[min(100%,260px)] flex-1">
                    <b className="block break-all font-semibold">{l.dono}</b>
                    <small className="block break-words text-amg-legenda text-texto-apagado">
                      {[`usa: ${l.titular ? (l.titular === l.dono ? 'o próprio dono' : l.titular) : 'ninguém ainda'}`,
                        emFrase(PLANOS[l.plano] ?? l.plano), ORIGENS[l.origem] ?? l.origem, l.bonus ? 'bônus somado' : '', l.observacao ?? '']
                        .filter(Boolean).join(' · ')}
                    </small>
                    <small className="block text-amg-legenda text-texto-apagado">
                      <b className="font-semibold text-texto">{l.computadoresPrograma ?? 0}</b> de 3 no programa ·{' '}
                      <b className="font-semibold text-texto">{l.computadoresPlugin ?? l.computadores ?? 0}</b> de 3 no Revit ·{' '}
                      {l.situacao === 'vencida' ? 'venceu em' : 'até'} <b className="font-semibold text-texto">{dataCurta(l.expiraEm)}</b>
                    </small>
                  </div>
                  <div className="flex max-w-full flex-wrap items-center gap-2">
                    {selo(l)}
                    {/* no celular os botões vão para a linha de baixo da etiqueta, juntos */}
                    <div className="flex basis-full flex-wrap gap-2 sm:basis-auto">
                      {l.situacao === 'revogada' ? (
                        <Botao pequeno nivel={2} type="button" onClick={() => setAcao({ tipo: 'reativar', l })}>Reativar</Botao>
                      ) : (
                        <>
                          <Botao pequeno nivel={3} type="button" onClick={() => setAcao({ tipo: 'revogar', l })}>Revogar</Botao>
                          <Botao pequeno nivel={3} type="button" onClick={() => { setAcao({ tipo: 'trocar', l }); setQual('titular'); setNovoEmail(''); }}>
                            Trocar e-mail
                          </Botao>
                          <Botao pequeno nivel={2} type="button"
                            onClick={() => { setMensagem(textoWhatsApp({ email: l.titular || l.dono, produto: l.produto, expiraEm: l.expiraEm })); setCopiada(''); }}>
                            Copiar mensagem
                          </Botao>
                          <Botao pequeno nivel={urgente ? 1 : 2} type="button" onClick={() => setAcao({ tipo: 'renovar', l })}>Renovar</Botao>
                        </>
                      )}
                    </div>
                  </div>
                  {acao?.l.id === l.id && (
                    acao.tipo === 'trocar' ? (
                      <CartaoAberto dentro rotulo="Trocar e-mail">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Lista id={`qual-${l.id}`} rotulo="Qual e-mail" valor={qual} aoMudar={setQual}
                            opcoes={[{ valor: 'titular', rotulo: 'Quem usa' }, { valor: 'dono', rotulo: 'Quem comprou' }]} />
                          <Campo id={`novo-${l.id}`} rotulo="Novo e-mail" tipo="email" valor={novoEmail} aoMudar={setNovoEmail}
                            placeholder={qual === 'titular' ? 'vazio = sem titular' : 'exemplo@exemplo.com'} />
                        </div>
                        <p className="text-amg-legenda text-texto-apagado">O novo e-mail recebe a licença na hora, se já tiver conta.</p>
                        <Botoes>
                          <Botao type="button" onClick={() => setAcao(null)}>Cancelar</Botao>
                          <Botao principal type="button" onClick={confirmarAcao} disabled={ocupado}>Salvar</Botao>
                        </Botoes>
                      </CartaoAberto>
                    ) : acao.tipo === 'revogar' ? (
                      <div className="w-full">
                        <Confirmacao voltar={() => setAcao(null)} acao={confirmarAcao} rotulo="Revogar" rotuloOcupado="Revogando…" ocupado={ocupado}>
                          Revogar esta licença? Os computadores dela voltam ao grátis na próxima conferência.
                        </Confirmacao>
                      </div>
                    ) : (
                      <Pergunta voltar={() => setAcao(null)} acao={confirmarAcao} ocupado={ocupado}
                        rotulo={acao.tipo === 'renovar' ? 'Renovar' : 'Reativar'}>
                        {acao.tipo === 'renovar' ? (
                          <>Renovar por 12 meses, a partir de <b className="font-semibold">{dataCurta(new Date(Math.max(Date.now(), new Date(l.expiraEm))).toISOString())}</b>?</>
                        ) : (
                          'Reativar esta licença?'
                        )}
                      </Pergunta>
                    )
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>

      <Painel titulo="Fim da convivência com a chave antiga" className="max-w-[640px]">
        <p className="mb-3 text-amg-legenda text-texto-apagado">
          Vazio até o dia da troca. Quem entrar com a conta até esta data ganha 30 dias nas licenças importadas do Flow.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <Campo id="fim-convivencia" rotulo="Fim da convivência" tipo="date" valor={fim} aoMudar={setFim} />
          </div>
          <Botao principal type="button" onClick={salvarFim} disabled={ocupado}>Salvar</Botao>
        </div>
      </Painel>
    </div>
  );
}
