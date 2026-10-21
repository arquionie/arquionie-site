import { useEffect, useState } from 'react';
import { Botao, Campo, Mensagem } from '@/components/Formulario';
import { Linha, TextoDaLinha, Vazio } from '@/components/Listas';
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
