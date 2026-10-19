import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSessao } from '@/lib/Sessao';
import { cadastroCompleto, primeiroNome } from '@/lib/conta';
import { dataLegivel, lerManifesto, tamanhoLegivel } from '@/lib/manifesto';
import { registrarDownload } from '@/lib/downloads';
import { Botao, Icone } from '@/components/Formulario';

// BAIXAR pede a conta (substitui a captação do e-mail no download de 10/09/2026). O link sai do manifesto de
// versões; sem ele, a página diz que a versão está sendo preparada. No modo AMIGÁVEL (mockup site-amigavel, 16/10/2026).
const CARTAO = 'rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5';

const PASSOS = [
  'Abra o arquivo baixado, Palheta_Arquionie com o número da versão.',
  <>
    Se o Windows mostrar <b>“O Windows protegeu o computador”</b>, clique em <b>Mais informações</b> e depois em <b>Executar assim mesmo</b>.
    O aviso aparece porque o instalador ainda não tem assinatura digital; ela chega com a abertura ao público.
  </>,
  'Aceite a licença no cartão do instalador e clique em INSTALAR. O Windows pede a permissão de administrador uma vez.',
  'Pronto: as versões novas chegam sozinhas, com o aviso na barra de estado do Arquionie™.',
];

// os passos da instalação, aqui e no PROGRAMA do painel
export function ComoInstalar() {
  return (
    <div className="mt-4">
      <h2 className="rotulo mb-1.5 ml-3.5">Como instalar</h2>
      <ol className="overflow-hidden rounded-cartao bg-superficie shadow-cartao">
        {PASSOS.map((passo, i) => (
          <li key={i} className="flex min-h-amg-toque-minimo items-start gap-3 border-t border-linha px-4 py-3 first:border-t-0">
            <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-toque bg-amg-destaque-suave text-amg-legenda font-bold text-destaque-texto">
              {i + 1}
            </span>
            <span className="pt-0.5">{passo}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Baixar() {
  const { usuario, carregando } = useSessao();
  const [manifesto, setManifesto] = useState(undefined);

  useEffect(() => {
    lerManifesto().then(setManifesto);
  }, []);

  const instalador = manifesto?.pacotes?.instalador;

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <h1 className="text-amg-titulo-grande">Arquionie™ para Windows</h1>
        <p className="mt-1.5 text-texto-apagado">Windows 10 ou 11, 64 bits. O programa vem com o .NET dentro: não é preciso instalar mais nada.</p>
      </div>

      {carregando ? (
        <p className="text-texto-apagado">Carregando…</p>
      ) : usuario && !cadastroCompleto(usuario) ? (
        // Entrou pelo Google e o Google devolveu direto para cá: falta o cadastro (atuação e termos) antes de baixar.
        <Navigate to="/completar?volta=%2Fbaixar" replace />
      ) : !usuario ? (
        <div className={`${CARTAO} flex flex-col gap-3.5`}>
          <p>Para baixar, entre na sua conta ou crie uma. É grátis e leva um minuto.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Botao para="/entrar?volta=%2Fbaixar">Entrar</Botao>
            <Botao principal para="/criar-conta?volta=%2Fbaixar">Criar conta</Botao>
          </div>
        </div>
      ) : manifesto === undefined ? (
        <p className="text-texto-apagado">Procurando a versão mais recente…</p>
      ) : !instalador?.url ? (
        <div className={CARTAO}>
          <p className="mb-1 font-semibold">Olá, {primeiroNome(usuario)}.</p>
          <p className="text-texto-apagado">
            A primeira versão para download está sendo preparada. Você recebe um aviso no e-mail da conta quando ela estiver aqui.
          </p>
        </div>
      ) : (
        <div className={`${CARTAO} flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4`}>
          <Botao href={instalador.url} principal grande onClick={() => registrarDownload(manifesto.versao)}>
            <Icone nome="baixar" tamanho={18} />
            Baixar a versão {manifesto.versao}
          </Botao>
          <p className="text-amg-legenda text-texto-apagado sm:mr-auto">
            Publicada em {dataLegivel(manifesto.data)} · {tamanhoLegivel(instalador.tamanho)}
          </p>
          <Botao para="/versoes" pequeno className="self-start sm:self-auto">
            O que mudou
          </Botao>
        </div>
      )}

      <ComoInstalar />
    </div>
  );
}
