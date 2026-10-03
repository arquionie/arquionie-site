import { useEffect, useState } from 'react';
import { dataLegivel, lerManifesto } from '@/lib/manifesto';

// As mesmas notas do aviso de atualização no programa: a fonte é o manifesto de versões.
export default function Versoes() {
  const [manifesto, setManifesto] = useState(undefined);
  useEffect(() => {
    lerManifesto().then(setManifesto);
  }, []);

  const historico = manifesto ? [manifesto, ...(manifesto.anteriores ?? [])] : [];

  return (
    <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-7">
      <p className="titulo-secao mb-2">Versões</p>
      <h1 className="mb-8 text-[32px] font-semibold leading-tight text-white">O que mudou em cada versão</h1>
      {manifesto === undefined ? (
        <p className="text-aqi-muted">Carregando…</p>
      ) : historico.length === 0 ? (
        <p className="bg-aqi-barra px-5 py-4 text-aqi-muted">A primeira versão pública está sendo preparada. As notas de cada versão aparecem aqui.</p>
      ) : (
        historico.map((v) => (
          <article key={v.versao} className="mb-6 bg-aqi-barra p-6">
            <h2 className="text-[20px] font-semibold text-white">Versão {v.versao}</h2>
            <p className="mb-3 text-[13px] text-aqi-muted">Publicada em {dataLegivel(v.data)}</p>
            {(v.notas ?? []).map((n, i) => (
              <p key={i} className="mb-2">
                {n}
              </p>
            ))}
          </article>
        ))
      )}
    </div>
  );
}
