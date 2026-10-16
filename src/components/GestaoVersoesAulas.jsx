// VERSÕES E AULAS no /gestao (plano 18; mockup aprovado em 15/10/2026). As versões só se CONFEREM aqui: publicar é pela
// ferramenta de publicação assinada, no computador do ÊDI (o PUBLICAR pelo navegador do Flow não vem). As aulas são as que
// o plugin mostra em AULAS & TUTORIAIS, na mesma ordem; "ferramenta" é a classe do comando (Cmd…), para o VER COMO USAR.
// No modo AMIGÁVEL desde o mockup gestao-amigavel (ÊDI, 16/10/2026).
import { useEffect, useState } from 'react';
import { Botao, Campo, Mensagem } from '@/components/Formulario';
import { Acao, Cabecalho, Painel, Selo } from '@/components/GestaoPecas';
import { Confirmacao, Grupo, Linha, TextoDaLinha, Vazio, emFrase } from '@/components/Listas';
import { apagarAula, codigoDoYoutube, dia, lerAulas, lerVersoes, lerVersoesDoPlugin, ordenarAulas, salvarAula } from '@/lib/gestaoFlow';

const VAZIA = { id: null, titulo: '', youtube: '', duracao: '', comando: '', descricao: '' };

// O lado de texto da linha com uma largura mínima: no celular, as etiquetas e os botões é que descem, e não o texto que espreme.
const ESQUERDA = 'flex min-w-[min(100%,16rem)] flex-1 items-start gap-3';

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
    <div className="flex flex-col gap-4">
      <Cabecalho titulo="Versões e aulas" />
      {/* vazio, o aviso não ocupa lugar: o -mt-4 desfaz o espaço da coluna */}
      <div aria-live="polite" className="flex flex-col gap-2 empty:-mt-4">
        <Mensagem>{aviso}</Mensagem>
        <Mensagem erro>{erro}</Mensagem>
      </div>

      <div>
        {versoes === null ? (
          <section>
            <h2 className="rotulo mb-1.5 ml-3.5">Versões publicadas</h2>
            <Vazio>Lendo os manifestos…</Vazio>
          </section>
        ) : (
          <Grupo rotulo="Versões publicadas">
            {versoes.map((v) => (
              <Linha key={v.id}>
                <div className={ESQUERDA}><TextoDaLinha titulo={emFrase(v.nome)} sub={v.canal} /></div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {v.versao ? <span className="whitespace-nowrap text-amg-valor tabular-nums">{v.versao}</span> : <Selo tom="atencao">Sem manifesto</Selo>}
                  {v.data && <span className="whitespace-nowrap text-amg-legenda text-texto-apagado">{dia(v.data)}</span>}
                </div>
              </Linha>
            ))}
          </Grupo>
        )}
        <p className="mx-3.5 mt-2 max-w-[72ch] text-amg-legenda text-texto-apagado">
          Publicar é pela ferramenta de publicação assinada, no computador do ÊDI; esta tela só mostra o que está no ar.
          {versoesTexto ? ` Computadores do plugin por versão: ${versoesTexto}.` : ''}
        </p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <form onSubmit={salvar}>
          <Painel titulo={aula.id ? 'Editar aula' : 'Nova aula'}>
            <div className="flex flex-col gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {/* o título e a duração lado a lado; os de texto comprido na largura toda */}
                <Campo id="au-titulo" rotulo="Título" valor={aula.titulo} aoMudar={mudar('titulo')} placeholder="CRIAR PISO" />
                <Campo id="au-duracao" rotulo="Duração" valor={aula.duracao} aoMudar={mudar('duracao')} placeholder="4:10" />
                <div className="sm:col-span-2">
                  <Campo id="au-video" rotulo="Vídeo" valor={aula.youtube} aoMudar={mudar('youtube')} placeholder="link do YouTube ou o código"
                    dica={aula.youtube && codigoDoYoutube(aula.youtube) !== aula.youtube.trim() ? codigoDoYoutube(aula.youtube) : ''} />
                </div>
                <div className="sm:col-span-2">
                  <Campo id="au-comando" rotulo="Ferramenta" valor={aula.comando} aoMudar={mudar('comando')} placeholder="classe do comando, ex.: CmdPiso" />
                </div>
                <div className="sm:col-span-2">
                  <Campo id="au-descricao" rotulo="Descrição" valor={aula.descricao} aoMudar={mudar('descricao')} placeholder="opcional" />
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {aula.id && <Botao type="button" onClick={() => setAula(VAZIA)}>Cancelar</Botao>}
                <Botao principal type="submit">Salvar aula</Botao>
              </div>
            </div>
          </Painel>
        </form>

        <div>
          {aulas.length === 0 ? (
            <section>
              <h2 className="rotulo mb-1.5 ml-3.5">Aulas · 0 · na ordem do plugin</h2>
              <Vazio>Nenhuma aula ainda. Importe as do Flow em Preços e cupons › Importar dados do Flow.</Vazio>
            </section>
          ) : (
            <Grupo rotulo={`Aulas · ${aulas.length} · na ordem do plugin`}>
              {aulas.map((a, i) => (
                <Linha key={a.id}>
                  <div className={ESQUERDA}>
                    <span className="w-5 shrink-0 text-amg-legenda text-texto-apagado tabular-nums">{i + 1}</span>
                    <TextoDaLinha titulo={a.titulo} sub={a.duracao} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!a.comando && <Selo tom="atencao">Sem ferramenta</Selo>}
                    {i > 0 && <Acao aria-label={`Subir ${a.titulo}`} onClick={() => mover(i, -1)}>↑</Acao>}
                    {i < aulas.length - 1 && <Acao aria-label={`Descer ${a.titulo}`} onClick={() => mover(i, 1)}>↓</Acao>}
                    <Acao nivel={2} onClick={() => setAula({ id: a.id, titulo: a.titulo, youtube: a.youtubeId, duracao: a.duracao ?? '', comando: a.comando ?? '', descricao: a.descricao ?? '' })}>Editar</Acao>
                    <Acao onClick={() => setApagar(a.id)}>Apagar</Acao>
                  </div>
                  {apagar === a.id && (
                    <div className="w-full">
                      <Confirmacao voltar={() => setApagar(null)} acao={() => confirmarApagar(a)} rotulo="Apagar">
                        Apagar a aula <b>{a.titulo}</b>? Ela sai das aulas do plugin.
                      </Confirmacao>
                    </div>
                  )}
                </Linha>
              ))}
            </Grupo>
          )}
          <p className="mx-3.5 mt-2 text-amg-legenda text-texto-apagado">O robô de aulas do YouTube vai gravar aqui também.</p>
        </div>
      </div>
    </div>
  );
}
