import { useEffect, useState } from 'react';
import { dataLegivel, lerManifesto } from '@/lib/manifesto';

// As mesmas notas do aviso de atualização no programa: a fonte é o manifesto de versões. Um cartão por versão (modo AMIGÁVEL).
export default function Versoes() {
  const [manifesto, setManifesto] = useState(undefined);
  useEffect(() => {
    lerManifesto().then(setManifesto);
  }, []);

  const historico = manifesto ? [manifesto, ...(manifesto.anteriores ?? [])] : [];

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-3 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="mb-3 text-amg-titulo-grande">O que mudou em cada versão</h1>
      {manifesto === undefined ? (
        <p className="text-texto-apagado">Carregando…</p>
      ) : historico.length === 0 ? (
        <p className="rounded-cartao bg-superficie p-4 text-texto-apagado shadow-cartao sm:p-5">
          A primeira versão pública está sendo preparada. As notas de cada versão aparecem aqui.
        </p>
      ) : (
        historico.map((v) => (
          <article key={v.versao} className="rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5">
            <h2 className="text-amg-secao">Versão {v.versao}</h2>
            <p className="mb-3 text-amg-legenda text-texto-apagado">Publicada em {dataLegivel(v.data)}</p>
            {(v.notas ?? []).map((n, i) => (
              <p key={i} className="mb-2 last:mb-0">
                {n}
              </p>
            ))}
          </article>
        ))
      )}
    </div>
  );
}
