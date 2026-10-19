import { useEffect, useState } from 'react';
import { useSessao } from '@/lib/Sessao';
import { primeiroNome } from '@/lib/conta';
import { supabase } from '@/lib/supabase';
import { AMOSTRA as AMOSTRA_DO_COMERCIAL, AMOSTRA_ESTADO, reaisCurtos, rpc } from '@/lib/comercial';
import { AMOSTRA, AMOSTRA_MINHAS_LICENCAS, PLANOS, dataCurta, nomeProduto } from '@/lib/licencas';
import { AMOSTRA_APRESENTACOES, ajustesAFazer } from '@/lib/equipe';
import { dataLegivel, lerManifesto, tamanhoLegivel } from '@/lib/manifesto';
import { registrarDownload } from '@/lib/downloads';
import { Botao, Icone } from '@/components/Formulario';
import { IconeDoMenu } from '@/components/MolduraDoSistema';
import { ComoInstalar } from '@/pages/Baixar';
import { useInstalador } from '@/pages/ParaRevit';
import { REQUISITOS } from '@/conteudo/paraRevit';

// O INÍCIO e o PROGRAMA do painel (ÊDI, 19/10/2026: "põe o Início e o Programa no menu lateral"). O Início é a casa do sistema, para
// onde o login leva: um cartão por parte, com o número que pede atenção e o botão para abrir. O Programa é o BAIXAR dentro do
// sistema, com o Arquionie™ para Windows e o para Revit lado a lado.

const CARTAO = 'flex flex-col gap-3 rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5';

function Cartao({ icone, titulo, acao, children }) {
  return (
    <section className={CARTAO}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amg-destaque-suave text-destaque-texto">
          <IconeDoMenu nome={icone} tamanho={18} />
        </span>
        <h2 className="mr-auto text-amg-secao">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

// o número na frente da palavra: "3 para hoje", "2 ajustes a fazer"
function Destaque({ valor, palavra, detalhe }) {
  return (
    <div>
      <p>
        <span className="text-amg-titulo tabular-nums">{valor}</span> {palavra && <span className="text-texto-apagado">{palavra}</span>}
      </p>
      {detalhe && <p className="text-amg-legenda text-texto-apagado">{detalhe}</p>}
    </div>
  );
}

const plural = (n, um, varios) => (n === 1 ? um : varios);

function useComercial() {
  const [estado, setEstado] = useState(undefined);
  useEffect(() => {
    if (AMOSTRA_DO_COMERCIAL) return setEstado(AMOSTRA_ESTADO);
    const ano = new Date().getFullYear();
    rpc('comercial_estado', { p_area: null, p_de: `${ano}-01-01`, p_ate: `${ano}-12-31` }).then(setEstado, () => setEstado(null));
  }, []);
  return estado;
}

function useApresentacoes() {
  const [dados, setDados] = useState(undefined);
  useEffect(() => {
    if (AMOSTRA) return setDados(AMOSTRA_APRESENTACOES);
    supabase.rpc('minhas_apresentacoes', {}).then(({ data, error }) => setDados(error ? null : data));
  }, []);
  return dados;
}

function useLicencas() {
  const [dados, setDados] = useState(undefined);
  useEffect(() => {
    if (AMOSTRA) return setDados(AMOSTRA_MINHAS_LICENCAS);
    supabase.rpc('minhas_licencas').then(({ data, error }) => setDados(error ? null : data));
  }, []);
  return dados;
}

function useManifesto() {
  const [manifesto, setManifesto] = useState(undefined);
  useEffect(() => {
    lerManifesto().then(setManifesto);
  }, []);
  return manifesto;
}

const carregando = <p className="text-texto-apagado">Carregando…</p>;

export function InicioDoPainel() {
  const { usuario } = useSessao();
  const comercial = useComercial();
  const apresentacoes = useApresentacoes();
  const licencas = useLicencas();
  const manifesto = useManifesto();
  const plugin = useInstalador();

  const hoje = comercial?.hoje?.length ?? 0;
  const ind = comercial?.indicadores;
  const lista = apresentacoes?.apresentacoes ?? [];
  const faltam = lista.reduce((s, a) => s + ajustesAFazer(a.envios[0]), 0);
  const emUso = licencas?.usa?.find((l) => ['ativa', 'vencendo'].includes(l.situacao));
  const compradas = licencas?.comprou?.length ?? 0;

  useEffect(() => {
    const antes = document.title;
    document.title = 'Início · Arquionie™';
    return () => { document.title = antes; };
  }, []);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-4 py-6 sm:px-6 md:py-10">
      <h1 className="text-amg-titulo-grande">{usuario ? `Olá, ${primeiroNome(usuario)}.` : 'Início'}</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <Cartao icone="comercial" titulo="Comercial"
          acao={<Botao pequeno nivel={hoje ? 1 : 2} para="/painel/comercial">{comercial?.novo ? 'Começar' : 'Abrir'}</Botao>}>
          {comercial === undefined ? carregando : comercial?.novo ? (
            <Destaque valor="Grátis" palavra="para começar hoje" />
          ) : (
            <Destaque valor={hoje} palavra="para hoje"
              detalhe={ind && `${ind.pedidos} ${plural(Number(ind.pedidos), 'pedido', 'pedidos')}${ind.emNegociacao ? ` · ${reaisCurtos(ind.emNegociacao)} em negociação` : ''}`} />
          )}
        </Cartao>

        <Cartao icone="apresentacoes" titulo="Apresentações"
          acao={<Botao pequeno nivel={faltam ? 1 : 2} para="/conta/apresentacoes">{faltam ? 'Ver os ajustes' : 'Abrir'}</Botao>}>
          {apresentacoes === undefined ? carregando : (
            <Destaque valor={faltam} palavra={plural(faltam, 'ajuste a fazer', 'ajustes a fazer')}
              detalhe={`${lista.length} ${plural(lista.length, 'projeto enviado', 'projetos enviados')}`} />
          )}
        </Cartao>

        <Cartao icone="programa" titulo="Programa" acao={<Botao pequeno nivel={2} para="/painel/programa">Baixar</Botao>}>
          {/* a versão mais nova de cada um; sem a do Windows publicada, a do Revit vem na frente */}
          {manifesto === undefined ? carregando : (
            <Destaque valor={manifesto?.versao ?? plugin?.versao ?? 'Em breve'}
              palavra={manifesto?.versao ? 'para Windows' : plugin?.versao && 'para Revit'}
              detalhe={manifesto?.versao && plugin?.versao && `${plugin.versao} para Revit`} />
          )}
        </Cartao>

        <Cartao icone="equipe" titulo="Equipe e licenças" acao={<Botao pequeno nivel={2} para="/conta/equipe">Abrir</Botao>}>
          {licencas === undefined ? carregando : (
            <Destaque valor={emUso ? PLANOS[emUso.plano] ?? emUso.plano : 'Grátis'}
              palavra={emUso && `${nomeProduto(emUso.produto)}, até ${dataCurta(emUso.expiraEm)}`}
              detalhe={compradas > 0 && `${compradas} ${plural(compradas, 'licença comprada', 'licenças compradas')}`} />
          )}
        </Cartao>
      </div>
    </div>
  );
}

export function ProgramaDoPainel() {
  const manifesto = useManifesto();
  const plugin = useInstalador();
  const instalador = manifesto?.pacotes?.instalador;

  useEffect(() => {
    const antes = document.title;
    document.title = 'Programa · Arquionie™';
    return () => { document.title = antes; };
  }, []);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-4 py-6 sm:px-6 md:py-10">
      <h1 className="text-amg-titulo-grande">Programa</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <Cartao icone="programa" titulo="Arquionie™ para Windows">
          {manifesto === undefined ? carregando : !instalador?.url ? (
            <p className="text-texto-apagado">A versão para download está sendo preparada. O aviso chega no e-mail da conta.</p>
          ) : (
            <>
              <Destaque valor={manifesto.versao} detalhe={`${dataLegivel(manifesto.data)} · ${tamanhoLegivel(instalador.tamanho)}`} />
              <div className="flex flex-wrap justify-end gap-2">
                <Botao para="/versoes">O que mudou</Botao>
                <Botao principal href={instalador.url} onClick={() => registrarDownload(manifesto.versao)}>
                  <Icone nome="baixar" tamanho={16} />
                  Baixar
                </Botao>
              </div>
            </>
          )}
        </Cartao>

        <Cartao icone="plugin" titulo="Arquionie™ para Revit">
          {/* sem o manifesto do plugin, o botão CONHECER leva aos requisitos */}
          {plugin && <Destaque valor={plugin.versao} detalhe={`Revit ${REQUISITOS.find(([q]) => q === 'Revit')?.[1]}`} />}
          <div className="flex flex-wrap justify-end gap-2">
            <Botao para="/para-revit">Conhecer</Botao>
            {plugin && (
              <Botao principal href={plugin.url}>
                <Icone nome="baixar" tamanho={16} />
                Baixar
              </Botao>
            )}
          </div>
        </Cartao>
      </div>
      <ComoInstalar />
    </div>
  );
}
