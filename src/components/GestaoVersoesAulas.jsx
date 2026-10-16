// VERSÕES E AULAS no /gestao (plano 18; mockup aprovado em 15/10/2026). As versões só se CONFEREM aqui: publicar é pela
// ferramenta de publicação assinada, no computador do ÊDI (o PUBLICAR pelo navegador do Flow não vem). As aulas são as que
// o plugin mostra em AULAS & TUTORIAIS, na mesma ordem; "ferramenta" é a classe do comando (Cmd…), para o VER COMO USAR.
import { useEffect, useState } from 'react';
import { Botao, Campo, Mensagem } from '@/components/FormularioTecnico';
import { Acao, Cabecalho, Painel, Selo } from '@/components/GestaoPecas';
import { apagarAula, codigoDoYoutube, dia, lerAulas, lerVersoes, lerVersoesDoPlugin, ordenarAulas, salvarAula } from '@/lib/gestaoFlow';

const VAZIA = { id: null, titulo: '', youtube: '', duracao: '', comando: '', descricao: '' };

export default function GestaoVersoesAulas() {
  const [versoes, setVersoes] = useState(null);
  const [porVersao, setPorVersao] = useState({});
  const [aulas, setAulas] = useState([]);
  const [aula, setAula] = useState(VAZIA);
  const [apagar, setApagar] = useState(null);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');

  async function carregarAulas() { setAulas(await lerAulas()); }
  useEffect(() => {
    lerVersoes().then(setVersoes);
    lerVersoesDoPlugin().then(setPorVersao);
    carregarAulas();
  }, []);

  const avisar = (r, texto) => {
    if (r?.ok === false) { setErro(r.motivo ?? 'Não deu certo.'); setAviso(''); return false; }
    setErro(''); setAviso(texto); return true;
  };
  const mudar = (k) => (v) => setAula((a) => ({ ...a, [k]: v }));

  async function salvar(e) {
    e.preventDefault();
    const r = await salvarAula(aula);
    if (avisar(r, aula.id ? `Aula ${aula.titulo} alterada.` : `Aula ${aula.titulo} criada, no fim da lista.`)) {
      setAula(VAZIA);
      carregarAulas();
    }
  }

  async function mover(i, passo) {
    const nova = [...aulas];
    [nova[i], nova[i + passo]] = [nova[i + passo], nova[i]];
    setAulas(nova);
    const r = await ordenarAulas(nova.map((a) => a.id));
    if (r?.ok === false) { setErro(r.motivo); carregarAulas(); }
  }

  async function confirmarApagar(a) {
    const r = await apagarAula(a.id);
    setApagar(null);
    if (avisar(r, `Aula ${a.titulo} apagada.`)) carregarAulas();
  }

  const versoesTexto = Object.entries(porVersao).sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }))
    .map(([v, n]) => `${v} (${n})`).join(' · ');

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Versões e aulas" />
      <div className="min-h-[20px]" aria-live="polite">
        <Mensagem>{aviso}</Mensagem>
        <Mensagem erro>{erro}</Mensagem>
      </div>

      <Painel titulo="Versões publicadas">
        {versoes === null ? (
          <p className="text-aqi-muted">Lendo os manifestos…</p>
        ) : (
          <ul className="divide-y divide-[#262D37]">
            {versoes.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
                <span className="min-w-[160px] text-white">{v.nome}</span>
                <span className="mr-auto text-aqi-muted">{v.canal}</span>
                {v.versao ? <b className="text-white">{v.versao}</b> : <Selo tom="atencao">SEM MANIFESTO</Selo>}
                {v.data && <span className="text-aqi-muted">{dia(v.data)}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] leading-relaxed text-aqi-muted">
          Publicar é pela ferramenta de publicação assinada, no computador do ÊDI; esta tela só mostra o que está no ar.
          {versoesTexto ? ` Computadores do plugin por versão: ${versoesTexto}.` : ''}
        </p>
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={salvar} className="h-full">
          <Painel titulo={aula.id ? 'Editar aula' : 'Nova aula'} className="flex h-full flex-col">
            <Campo id="au-titulo" rotulo="TÍTULO" valor={aula.titulo} aoMudar={mudar('titulo')} placeholder="CRIAR PISO" />
            <Campo id="au-video" rotulo="VÍDEO" valor={aula.youtube} aoMudar={mudar('youtube')} placeholder="link do YouTube ou o código"
              dica={aula.youtube && codigoDoYoutube(aula.youtube) !== aula.youtube.trim() ? codigoDoYoutube(aula.youtube) : ''} />
            <Campo id="au-duracao" rotulo="DURAÇÃO" valor={aula.duracao} aoMudar={mudar('duracao')} placeholder="4:10" />
            <Campo id="au-comando" rotulo="FERRAMENTA" valor={aula.comando} aoMudar={mudar('comando')} placeholder="classe do comando, ex.: CmdPiso" />
            <Campo id="au-descricao" rotulo="DESCRIÇÃO" valor={aula.descricao} aoMudar={mudar('descricao')} placeholder="opcional" />
            <div className="mt-auto flex justify-end gap-2 pt-3">
              {aula.id && <Botao nivel={3} type="button" onClick={() => setAula(VAZIA)}>CANCELAR</Botao>}
              <Botao principal type="submit">SALVAR AULA</Botao>
            </div>
          </Painel>
        </form>

        <Painel titulo={`Aulas (${aulas.length}) · na ordem do plugin`}>
          {aulas.length === 0 ? (
            <p className="text-[14px] text-aqi-muted">Nenhuma aula ainda. Importe as do Flow em PREÇOS E CUPONS › IMPORTAR DADOS DO FLOW.</p>
          ) : (
            <ul className="divide-y divide-[#262D37]">
              {aulas.map((a, i) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
                  <span className="w-5 text-aqi-muted">{i + 1}</span>
                  <span className="mr-auto text-white">{a.titulo}</span>
                  {!a.comando && <Selo tom="atencao">SEM FERRAMENTA</Selo>}
                  {a.duracao && <span className="text-aqi-muted">{a.duracao}</span>}
                  {apagar === a.id ? (
                    <>
                      <span className="text-[12px] text-aqi-texto">Apagar?</span>
                      <Acao onClick={() => setApagar(null)}>VOLTAR</Acao>
                      <Acao onClick={() => confirmarApagar(a)}>APAGAR</Acao>
                    </>
                  ) : (
                    <>
                      {i > 0 && <Acao aria-label={`Subir ${a.titulo}`} onClick={() => mover(i, -1)}>↑</Acao>}
                      {i < aulas.length - 1 && <Acao aria-label={`Descer ${a.titulo}`} onClick={() => mover(i, 1)}>↓</Acao>}
                      <Acao onClick={() => setAula({ id: a.id, titulo: a.titulo, youtube: a.youtubeId, duracao: a.duracao ?? '', comando: a.comando ?? '', descricao: a.descricao ?? '' })}>EDITAR</Acao>
                      <Acao onClick={() => setApagar(a.id)}>APAGAR</Acao>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[12px] text-aqi-muted">O robô de aulas do YouTube vai gravar aqui também.</p>
        </Painel>
      </div>
    </div>
  );
}
