import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

// A volta do Google para o programa (doc 57, §4.2): o Arquionie™ abre o navegador pedindo que o Google volte a esta
// página com a porta em que ele espera, neste mesmo computador; a página só repassa o código ao programa, que o troca
// pela sessão com o verificador que só ele tem. O site não usa o código (supabase.js não lê a URL nesta rota).
export default function Programa() {
  const { porta } = useParams();
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    const busca = new URLSearchParams(window.location.search);
    const repassar = new URLSearchParams();
    for (const chave of ['code', 'error', 'error_description']) if (busca.get(chave)) repassar.set(chave, busca.get(chave));
    if (!/^\d{2,5}$/.test(porta ?? '') || ![...repassar.keys()].length) {
      setFalhou(true);
      return;
    }
    window.location.replace(`http://127.0.0.1:${porta}/?${repassar.toString()}`);
  }, [porta]);

  return (
    <section className="mx-auto max-w-[640px] px-4 py-16 text-center">
      <p className="titulo-secao mb-3">Arquionie™</p>
      {falhou ? (
        <>
          <h1 className="mb-3 text-[26px] font-semibold text-white">Não deu para voltar ao programa.</h1>
          <p className="text-aqi-muted">Volte ao Arquionie™ e clique de novo em CONTINUAR COM O GOOGLE.</p>
        </>
      ) : (
        <>
          <h1 className="mb-3 text-[26px] font-semibold text-white">Voltando ao Arquionie™…</h1>
          <p className="text-aqi-muted">Se o navegador perguntar, permita abrir o endereço deste computador.</p>
        </>
      )}
    </section>
  );
}
