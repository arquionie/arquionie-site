import { useEffect, useState } from 'react';
import { Botao, Campo, Chave, Etiqueta, Lista, Mensagem } from '@/components/Formulario';
import { Confirmacao, Grupo, Linha, TextoDaLinha, Vazio } from '@/components/Listas';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { AMOSTRA, dataCurta } from '@/lib/licencas';
import { quandoLegivel } from '@/lib/tours';
import { cifrarCopia, decifrarCopia, nomeDaCopia } from '@/lib/copiaDasChaves';

// OS PROJETOS PROTEGIDOS, na MINHA CONTA › EQUIPE do responsável (doc 73 do programa, etapa 1; mockup projetos-do-escritorio, aprovado
// por ÊDI em 20/10/2026; migração 20261020120000_projetos_do_escritorio.sql). Os PEDIDOS DE ACESSO de quem abriu uma cópia de um projeto
// do escritório sem acesso (ACEITAR deixa a pessoa só ver as pranchas, como convidada daquele projeto) e a CÓPIA DE SEGURANÇA DAS CHAVES,
// para os projetos abrirem mesmo que o Arquionie saia do ar: o arquivo sai protegido por uma senha que nunca deixa o navegador.

const AMOSTRA_PEDIDOS = [
  { id: 'p1', projeto: 'a1', nomeDoProjeto: '225 · Templo', email: 'calculista@exemplo.com.br', nome: 'Eng. Carlos', pedidoEm: new Date(Date.now() - 3600e3).toISOString() },
];
const AMOSTRA_SITUACAO = { projetos: 38, baixadaEm: null, faltam: 38 };
const AMOSTRA_PEDIDOS_DO_ESCRITORIO = [
  { id: 'e1', projeto: 'm1', nomeDoProjeto: '212-2', escritorio: 'r1', nomeDoEscritorio: 'PALHETA ARQUITETURA', pedidoPor: 'ÊDI',
    pedidoEm: new Date(Date.now() - 1200e3).toISOString(), convite: false },
];
const AMOSTRA_DA_CONTA = {
  projetos: [
    { projeto: 'm1', nome: '212-2', desde: new Date(Date.now() - 4 * 864e5).toISOString(), comPagina: true },
    { projeto: 'm2', nome: 'Reforma do apartamento (exemplo)', desde: new Date(Date.now() - 6 * 864e5).toISOString(), comPagina: false },
  ],
  escritorios: [{ responsavel: 'r1', escritorio: 'PALHETA ARQUITETURA' }],
  passados: [],
  chegaram: [{ projeto: 'c1', nome: '214 · Casa (exemplo)', de: 'Osmar', aPedidoSeu: true, em: new Date(Date.now() - 864e5).toISOString() }],
};

// A PROTEÇÃO COMO OPÇÃO E A TROCA DO DONO (doc 73, §8, do programa; mockup trocar-o-dono, versão 2, aprovado por ÊDI em 27/10/2026;
// migração 20261027000000_protecao_como_opcao_e_troca_do_dono.sql): o padrão do escritório, os pedidos do escritório, os projetos da
// conta com PASSAR AO ESCRITÓRIO, os que chegaram e os que foram passados.

// O padrão do escritório: proteger os projetos novos da equipe, desligado de fábrica. Ligado, o NOVO da equipe mostra a escolha com o
// escritório marcado.
export function PadraoDoEscritorio() {
  const [ligado, setLigado] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    (async () => {
      if (AMOSTRA) return setLigado(false);
      const { data, error } = await supabase.rpc('protecao_padrao');
      setLigado(error ? false : !!data.proprio);
    })();
  }, []);

  async function trocar(novo) {
    setErro('');
    if (!AMOSTRA) {
      const { data, error } = await supabase.rpc('protecao_padrao_gravar', { p_ligar: novo });
      if (error || !data.ok) return setErro(error ? mensagemDeErro(error) : 'Não deu certo. Tente de novo.');
    }
    setLigado(novo);
  }

  if (ligado === null) return null;
  const rotulo = 'Proteger os projetos novos da sua equipe';
  return (
    <div className="flex max-w-[640px] flex-col gap-2">
      <Grupo>
        <Linha className="flex-nowrap">
          <TextoDaLinha
            titulo={rotulo}
            sub={ligado
              ? 'Ligado: no NOVO, a equipe vê o escritório marcado, com a Minha área e o Sem proteção ao lado.'
              : 'Desligado: os projetos nascem abertos, e cada um liga a proteção quando quiser, no ARQUIVO do programa.'}
          />
          <Chave rotulo={rotulo} ligada={ligado} aoMudar={trocar} />
        </Linha>
      </Grupo>
      <Mensagem erro>{erro}</Mensagem>
    </div>
  );
}

const textoDaPassagem = (projeto, escritorio, comPagina) =>
  `Passar o ${projeto} para ${escritorio}? A equipe passa a abrir e editar o projeto, e você continua nela. Os convidados, os pedidos de ` +
  `acesso${comPagina === false ? '' : ' e a página do cliente'} vão junto. Depois, o projeto é do escritório: daqui não se desfaz.`;

// Os pedidos do escritório: quem é da equipe pediu que o projeto da sua conta passe ao escritório. Com o convite da equipe esperando, o
// PASSAR entra na equipe junto.
function PedidosDoEscritorio({ aoMudar }) {
  const [pedidos, setPedidos] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState('');

  const carregar = async () => {
    if (AMOSTRA) return setPedidos((p) => p ?? AMOSTRA_PEDIDOS_DO_ESCRITORIO);
    const { data, error } = await supabase.rpc('projeto_pedidos_ao_escritorio');
    setPedidos(error ? [] : data);
  };
  useEffect(() => {
    carregar();
  }, []);

  async function responder(pedido, aceitar) {
    setErro('');
    setFeito('');
    setOcupado(pedido.id);
    if (!AMOSTRA) {
      const { data, error } = await supabase.rpc('projeto_responder_pedido_ao_escritorio', { p_pedido: pedido.id, p_aceitar: aceitar });
      if (error || !data.ok) { setOcupado(null); return setErro(error ? mensagemDeErro(error) : data.motivo); }
    }
    setConfirmando(null);
    setOcupado(null);
    if (aceitar) setFeito(`O ${pedido.nomeDoProjeto} passou para ${pedido.nomeDoEscritorio}.`);
    if (AMOSTRA) setPedidos((p) => p.filter((x) => x.id !== pedido.id));
    else await carregar();
    aoMudar?.();
  }

  if (!pedidos || (pedidos.length === 0 && !feito && !erro)) return null;
  return (
    <div className="flex flex-col gap-2">
      {pedidos.length > 0 && (
        <Grupo rotulo="Pedidos do escritório">
          {pedidos.map((p) => (
            <Linha key={p.id}>
              {confirmando === p.id ? (
                <div className="w-full">
                  <Confirmacao
                    voltar={() => setConfirmando(null)}
                    acao={() => responder(p, true)}
                    rotulo={p.convite ? 'Entrar na equipe e passar' : 'Passar ao escritório'}
                    ocupado={ocupado === p.id}
                    rotuloOcupado="Passando…"
                  >
                    {(p.convite ? `Você entra na equipe de ${p.nomeDoEscritorio}. ` : '') + textoDaPassagem(p.nomeDoProjeto, p.nomeDoEscritorio)}
                  </Confirmacao>
                </div>
              ) : (
                <>
                  <TextoDaLinha titulo={`${p.nomeDoEscritorio} pediu o ${p.nomeDoProjeto}`}>
                    <small className="block text-amg-legenda text-texto-apagado">
                      Pedido por {p.pedidoPor} · {quandoLegivel(p.pedidoEm)}.
                      {p.convite ? ' O escritório convidou você para a equipe: passar o projeto entra na equipe junto.' : ''}
                    </small>
                  </TextoDaLinha>
                  <div className="flex flex-wrap items-center gap-2">
                    <Botao pequeno type="button" disabled={ocupado === p.id} onClick={() => responder(p, false)}>Recusar</Botao>
                    <Botao pequeno principal type="button" onClick={() => setConfirmando(p.id)}>
                      {p.convite ? 'Entrar na equipe e passar' : 'Passar ao escritório'}
                    </Botao>
                  </div>
                </>
              )}
            </Linha>
          ))}
        </Grupo>
      )}
      <Mensagem erro>{erro}</Mensagem>
      <Mensagem>{feito}</Mensagem>
    </div>
  );
}

// Os projetos protegidos da conta, os que chegaram e os que foram passados. A lista dos da conta, com PASSAR AO ESCRITÓRIO, só aparece
// para quem está na equipe de um escritório.
export function ProjetosDaConta() {
  const [dados, setDados] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [para, setPara] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState('');

  const carregar = async () => {
    if (AMOSTRA) return setDados((d) => d ?? AMOSTRA_DA_CONTA);
    const { data, error } = await supabase.rpc('meus_projetos_protegidos');
    setDados(error ? { projetos: [], escritorios: [], passados: [], chegaram: [] } : data);
  };
  useEffect(() => {
    carregar();
  }, []);

  function abrir(projeto) {
    setErro('');
    setFeito('');
    setPara(dados.escritorios[0]?.responsavel ?? '');
    setConfirmando(projeto.projeto);
  }

  async function passar(projeto) {
    const escritorio = dados.escritorios.find((e) => e.responsavel === para);
    if (!escritorio) return setErro('Escolha o escritório.');
    setErro('');
    setOcupado(true);
    if (AMOSTRA) setDados((d) => ({ ...d, projetos: d.projetos.filter((x) => x.projeto !== projeto.projeto),
      passados: [{ projeto: projeto.projeto, nome: projeto.nome, para: escritorio.escritorio, em: new Date().toISOString() }, ...d.passados] }));
    else {
      const { data, error } = await supabase.rpc('projeto_passar', { p_projeto: projeto.projeto, p_escritorio: escritorio.responsavel });
      if (error || !data.ok) { setOcupado(false); return setErro(error ? mensagemDeErro(error) : data.motivo); }
      await carregar();
    }
    setOcupado(false);
    setConfirmando(null);
    setFeito(`O ${projeto.nome} passou para ${escritorio.escritorio}.`);
  }

  if (dados === null) return <p className="text-texto-apagado">Carregando…</p>;
  const podePassar = dados.escritorios.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <PedidosDoEscritorio aoMudar={carregar} />
      {podePassar && dados.projetos.length > 0 && (
        <div className="flex flex-col gap-2">
          <Grupo rotulo="Os seus projetos protegidos · Minha área">
            {dados.projetos.map((p) => (
              <Linha key={p.projeto}>
                {confirmando === p.projeto ? (
                  <div className="flex w-full flex-col gap-2">
                    {dados.escritorios.length > 1 && (
                      <Lista id={`para-${p.projeto}`} rotulo="Para o escritório" valor={para} aoMudar={setPara}
                        opcoes={dados.escritorios.map((e) => ({ valor: e.responsavel, rotulo: e.escritorio }))} />
                    )}
                    <Confirmacao voltar={() => setConfirmando(null)} acao={() => passar(p)} rotulo="Passar ao escritório"
                      ocupado={ocupado} rotuloOcupado="Passando…">
                      {textoDaPassagem(p.nome, dados.escritorios.find((e) => e.responsavel === para)?.escritorio ?? 'o escritório', p.comPagina)}
                    </Confirmacao>
                  </div>
                ) : (
                  <>
                    <TextoDaLinha titulo={p.nome || 'Projeto sem nome'}
                      sub={`Na sua conta desde ${dataCurta(p.desde)}${p.comPagina ? ' · a página do cliente vai junto' : ''}`} />
                    <Botao pequeno type="button" onClick={() => abrir(p)}>Passar ao escritório</Botao>
                  </>
                )}
              </Linha>
            ))}
          </Grupo>
          <p className="ml-3.5 text-amg-legenda text-texto-apagado">
            O projeto passa com a mesma chave: todas as cópias do arquivo, também as do histórico do Drive, abrem para a equipe sem regravar.
            A página do cliente vai junto quando o projeto já foi aberto na versão nova do programa; senão, passe pelo programa, em ARQUIVO ›
            Passar ao escritório.
          </p>
        </div>
      )}
      <Mensagem erro>{erro}</Mensagem>
      <Mensagem>{feito}</Mensagem>
      {dados.chegaram.length > 0 && (
        <Grupo rotulo="Chegaram ao escritório">
          {dados.chegaram.map((c, i) => (
            <Linha key={`${c.projeto}-${i}`}>
              <TextoDaLinha titulo={c.nome || 'Projeto sem nome'}
                sub={`Passado por ${c.de} em ${dataCurta(c.em)}${c.aPedidoSeu ? ', a pedido seu' : c.aPedidoDe ? `, a pedido de ${c.aPedidoDe}` : ''}.`} />
              <Etiqueta>Do escritório</Etiqueta>
            </Linha>
          ))}
        </Grupo>
      )}
      {dados.passados.length > 0 && (
        <Grupo rotulo="Passados ao escritório">
          {dados.passados.map((p, i) => (
            <Linha key={`${p.projeto}-${i}`}>
              <TextoDaLinha titulo={p.nome || 'Projeto sem nome'} sub={`Para ${p.para} em ${dataCurta(p.em)}.`} />
            </Linha>
          ))}
        </Grupo>
      )}
    </div>
  );
}

export function PedidosDeAcesso() {
  const [pedidos, setPedidos] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(null);

  const carregar = async () => {
    if (AMOSTRA) return setPedidos((p) => p ?? AMOSTRA_PEDIDOS);
    const { data, error } = await supabase.rpc('projeto_pedidos');
    setPedidos(error ? [] : data);
  };
  useEffect(() => {
    carregar();
  }, []);

  async function responder(pedido, aceitar) {
    setErro('');
    setOcupado(pedido.id);
    if (AMOSTRA) setPedidos((p) => p.filter((x) => x.id !== pedido.id));
    else {
      const { data, error } = await supabase.rpc('projeto_responder_pedido', { p_pedido: pedido.id, p_aceitar: aceitar });
      if (error || !data.ok) { setOcupado(null); return setErro(error ? mensagemDeErro(error) : data.motivo); }
      await carregar();
    }
    setOcupado(null);
  }

  if (pedidos === null) return <p className="text-texto-apagado">Carregando…</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="rotulo ml-3.5">Pedidos de acesso</p>
      {pedidos.length === 0 ? (
        <Vazio>Nenhum pedido. Quem abrir uma cópia de um projeto do escritório sem acesso pode pedir, e o pedido aparece aqui.</Vazio>
      ) : (
        <div className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">
          {pedidos.map((p) => (
            <Linha key={p.id}>
              <TextoDaLinha titulo={p.nome || p.email} sub={p.nome ? p.email : null}>
                <small className="block text-amg-legenda text-texto-apagado">
                  Pediu para abrir o {p.nomeDoProjeto || 'projeto'} · {quandoLegivel(p.pedidoEm)}. Aceito, só vê as pranchas, sem editar.
                </small>
              </TextoDaLinha>
              <div className="flex flex-wrap items-center gap-2">
                <Botao pequeno type="button" disabled={ocupado === p.id} onClick={() => responder(p, false)}>Recusar</Botao>
                <Botao pequeno principal type="button" disabled={ocupado === p.id} onClick={() => responder(p, true)}>Aceitar</Botao>
              </div>
            </Linha>
          ))}
        </div>
      )}
      <Mensagem erro>{erro}</Mensagem>
    </div>
  );
}

export function CopiaDeSeguranca() {
  const [situacao, setSituacao] = useState(null);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = async () => {
    if (AMOSTRA) return setSituacao((s) => s ?? AMOSTRA_SITUACAO);
    const { data, error } = await supabase.rpc('copia_de_seguranca_situacao');
    setSituacao(error ? { projetos: 0, baixadaEm: null, faltam: 0 } : data);
  };
  useEffect(() => {
    carregar();
  }, []);

  async function baixar(e) {
    e.preventDefault();
    setErro('');
    setFeito('');
    if (senha.length < 10) return setErro('Use uma senha de pelo menos 10 letras: é ela que protege as chaves de todos os projetos.');
    if (senha !== confirmacao) return setErro('As duas senhas não são iguais.');
    setOcupado(true);
    try {
      let dados;
      if (AMOSTRA) dados = { ok: true, escritorio: 'PALHETA ARQUITETURA', em: new Date().toISOString(), projetos: [] };
      else {
        const { data, error } = await supabase.rpc('chaves_do_escritorio');
        if (error) throw new Error(mensagemDeErro(error));
        dados = data;
      }
      const texto = await cifrarCopia(dados, senha);
      // confere antes de entregar: a cópia abre com a senha digitada
      await decifrarCopia(texto, senha);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
      link.download = nomeDaCopia(dados.escritorio, dados.em);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
      setSenha('');
      setConfirmacao('');
      setFeito(`Cópia baixada com ${dados.projetos.length} ${dados.projetos.length === 1 ? 'projeto' : 'projetos'}. Guarde o arquivo e a senha em lugares separados.`);
      await carregar();
    } catch (falha) {
      setErro(falha.message || 'Não deu para baixar a cópia. Tente de novo.');
    }
    setOcupado(false);
  }

  if (situacao === null) return <p className="text-texto-apagado">Carregando…</p>;
  const pendente = situacao.faltam > 0;
  return (
    <form onSubmit={baixar} className="flex max-w-[640px] flex-col gap-3 rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5">
      <p className="rotulo">Cópia de segurança das chaves</p>
      <p className={pendente ? 'text-destaque-texto' : 'text-texto-apagado'}>
        {situacao.baixadaEm
          ? `Última cópia em ${dataCurta(situacao.baixadaEm)}. ${pendente ? `${situacao.faltam} ${situacao.faltam === 1 ? 'projeto novo ainda não está' : 'projetos novos ainda não estão'} nela.` : 'Todos os projetos estão nela.'}`
          : `Ainda não baixada. Com ela, os ${situacao.projetos} projetos protegidos do escritório abrem mesmo que o Arquionie saia do ar.`}
      </p>
      <div className="flex flex-col gap-2">
        <Campo id="copia-senha" rotulo="Senha" tipo="password" valor={senha} aoMudar={setSenha} autoComplete="new-password" placeholder="pelo menos 10 letras" />
        <Campo id="copia-confirmacao" rotulo="De novo" tipo="password" valor={confirmacao} aoMudar={setConfirmacao} autoComplete="new-password" placeholder="a mesma senha" />
      </div>
      <p className="text-amg-legenda text-texto-apagado">
        A senha não sai deste navegador e o Arquionie não a guarda: sem ela, a cópia não abre. No programa, ARQUIVO › busca "cópia de
        segurança" abre um projeto por ela.
      </p>
      <div className="flex justify-end">
        <Botao principal type="submit" disabled={ocupado}>{ocupado ? 'Preparando…' : 'Baixar a cópia de segurança'}</Botao>
      </div>
      <Mensagem erro>{erro}</Mensagem>
      <Mensagem>{feito}</Mensagem>
    </form>
  );
}
