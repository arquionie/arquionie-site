import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSessao } from '@/lib/Sessao';
import { cadastroCompleto, primeiroNome } from '@/lib/conta';
import { dataLegivel, lerManifesto, tamanhoLegivel } from '@/lib/manifesto';
import { registrarDownload } from '@/lib/downloads';

// BAIXAR pede a conta (substitui a captação do e-mail no download de 10/09/2026). O link sai do manifesto de
// versões; sem ele, a página diz que a versão está sendo preparada.
export default function Baixar() {
  const { usuario, carregando } = useSessao();
  const [manifesto, setManifesto] = useState(undefined);

  useEffect(() => {
    lerManifesto().then(setManifesto);
  }, []);

  const instalador = manifesto?.pacotes?.instalador;

  return (
    <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-7">
      <p className="titulo-secao mb-2">Baixar</p>
      <h1 className="mb-3 text-[32px] font-semibold leading-tight text-white">Arquionie™ para Windows</h1>
      <p className="mb-8 text-aqi-muted">Windows 10 ou 11, 64 bits. O programa vem com o .NET dentro: não é preciso instalar mais nada.</p>

      {carregando ? (
        <p className="text-aqi-muted">Carregando…</p>
      ) : usuario && !cadastroCompleto(usuario) ? (
        // Entrou pelo Google e o Google devolveu direto para cá: falta o cadastro (atuação e termos) antes de baixar.
        <Navigate to="/completar?volta=%2Fbaixar" replace />
      ) : !usuario ? (
        <div className="bg-aqi-barra p-6">
          <p className="mb-4">Para baixar, entre na sua conta ou crie uma. É grátis no lançamento e leva um minuto.</p>
          <div className="flex flex-wrap gap-2.5">
            <Link to="/criar-conta?volta=%2Fbaixar" className="inline-flex h-[40px] items-center bg-aqi-campo px-5 text-[13px] font-bold tracking-wide text-white no-underline hover:bg-aqi-campohover">
              CRIAR CONTA
            </Link>
            <Link to="/entrar?volta=%2Fbaixar" className="inline-flex h-[40px] items-center border border-aqi-borda px-5 text-[13px] font-bold tracking-wide text-aqi-texto no-underline hover:bg-aqi-faixa">
              ENTRAR
            </Link>
          </div>
        </div>
      ) : manifesto === undefined ? (
        <p className="text-aqi-muted">Procurando a versão mais recente…</p>
      ) : !instalador?.url ? (
        <div className="bg-aqi-barra p-6">
          <p className="mb-1 font-semibold text-white">Olá, {primeiroNome(usuario)}.</p>
          <p className="text-aqi-muted">
            A primeira versão para download está sendo preparada. Você recebe um aviso no e-mail da conta quando ela estiver
            aqui.
          </p>
        </div>
      ) : (
        <div className="bg-aqi-barra p-6">
          <a href={instalador.url} onClick={() => registrarDownload(manifesto.versao)} className="inline-flex items-center gap-3 bg-aqi-campo px-6 py-4 text-[15px] font-bold tracking-wide text-white no-underline hover:bg-aqi-campohover">
            ⤓ BAIXAR A VERSÃO {manifesto.versao}
          </a>
          <p className="mt-3 text-[13px] text-aqi-muted">
            Publicada em {dataLegivel(manifesto.data)} · {tamanhoLegivel(instalador.tamanho)} ·{' '}
            <Link to="/versoes" className="link-apagado">
              o que mudou
            </Link>
          </p>
        </div>
      )}

      <h2 className="mb-3 mt-12 text-[20px] font-semibold text-white">Como instalar</h2>
      <ol className="list-decimal space-y-2 pl-6 text-[16px]">
        <li>Abra o arquivo baixado, Palheta_Arquionie com o número da versão.</li>
        <li>
          Se o Windows mostrar <b className="text-white">“O Windows protegeu o computador”</b>, clique em <b className="text-white">Mais informações</b> e
          depois em <b className="text-white">Executar assim mesmo</b>. O aviso aparece porque o instalador ainda não tem assinatura digital; ela chega com
          a abertura ao público.
        </li>
        <li>Aceite a licença no cartão do instalador e clique em INSTALAR. O Windows pede a permissão de administrador uma vez.</li>
        <li>Pronto: as versões novas chegam sozinhas, com o aviso na barra de estado do Arquionie™.</li>
      </ol>
    </div>
  );
}
