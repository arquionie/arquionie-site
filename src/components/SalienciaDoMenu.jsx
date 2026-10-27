import { useEffect, useState } from 'react';

// O nome do item do menu lateral, como no Sistema Palheta (ÊDI, 27/10/2026: "esse painel lateral que ele expande desse jeito, eu acho
// que é melhor a gente fazer igual o do sistema palheta"; lá, o SalienciaDoMenu, de 20/10/2026: "como se o nome saísse de dentro da barra
// vertical se projetando para fora... e com o nome dentro, da mesma cor do ícone"). A barra não abre mais: fica com os ícones, e a
// pílula dela ganha uma saliência para a direita com o nome do item embaixo do mouse ou do foco do teclado.
//
// É um elemento só, fixo na tela e POR BAIXO da barra: a navegação rola (e o que sai de quem rola é cortado) e, por baixo, a saliência
// parece sair de dentro dela. Começa no centro do ícone; o que passa da borda da barra aparece, com os cantos côncavos onde encosta nela
// (index.css, .amg-saliencia). Os itens são lidos pelo data-nome e as caixas pelo data-bloco-menu, com os eventos presos na barra inteira.
const VAZIA = { visivel: false, deslizar: false, nome: '', ativo: false, chave: '', top: 0, left: 0, borda: 0, semTopo: false, semBase: false };
// metade da altura da saliência (a do botão) mais o canto côncavo (o raio de dentro): até onde ela alcança acima e abaixo do centro
const ALCANCE_DO_CANTO = 18 + 12;

export default function SalienciaDoMenu({ barraRef }) {
  const [saliencia, setSaliencia] = useState(VAZIA);

  useEffect(() => {
    const raiz = barraRef.current;
    if (!raiz) return undefined;

    const mostrar = (item) => {
      const bloco = item.closest('[data-bloco-menu]');
      // com a aparência ou a conta aberta ao lado, o nome não sai por baixo dela
      if (!bloco || item.getAttribute('aria-expanded') === 'true') return esconder();
      const caixaDoItem = item.getBoundingClientRect();
      const caixa = bloco.getBoundingClientRect();
      const left = caixaDoItem.left + caixaDoItem.width / 2;
      const top = caixaDoItem.top + caixaDoItem.height / 2;
      // no primeiro e no último item, o canto côncavo cairia na curva da ponta da caixa e ficaria um bico para fora: ali ele não aparece
      const raio = Math.min(parseFloat(getComputedStyle(bloco).borderTopRightRadius) || 0, caixa.width / 2, caixa.height / 2);
      const semTopo = top - ALCANCE_DO_CANTO < caixa.top + raio;
      const semBase = top + ALCANCE_DO_CANTO > caixa.bottom - raio;
      const chave = item.dataset.nome;
      setSaliencia((antes) => (antes.visivel && antes.chave === chave && antes.top === top
        ? antes
        // já aberta em outro item, ela desliza até o novo; fechada, aparece direto no lugar
        : { visivel: true, deslizar: antes.visivel, nome: item.dataset.nome, ativo: item.getAttribute('aria-current') === 'page', chave, top,
            left, borda: caixa.right - left, semTopo, semBase }));
    };
    const esconder = () => setSaliencia((antes) => (antes.visivel ? { ...antes, visivel: false, deslizar: false } : antes));

    const aoPassar = (e) => {
      const item = e.target.closest?.('[data-nome]');
      if (item) mostrar(item);
      // no vão entre dois ícones ela fica; fora das caixas, some
      else if (!e.target.closest?.('[data-bloco-menu]')) esconder();
    };
    const aoFocar = (e) => {
      const item = e.target.closest?.('[data-nome]');
      if (item?.matches(':focus-visible')) mostrar(item);
    };
    const aoSairDoFoco = (e) => {
      if (!e.relatedTarget?.closest?.('[data-nome]')) esconder();
    };

    raiz.addEventListener('pointerover', aoPassar);
    raiz.addEventListener('pointerleave', esconder);
    raiz.addEventListener('focusin', aoFocar);
    raiz.addEventListener('focusout', aoSairDoFoco);
    raiz.addEventListener('click', esconder);
    // rolar a barra tira o item de baixo da saliência: ela some e volta no próximo movimento
    raiz.addEventListener('scroll', esconder, true);
    window.addEventListener('resize', esconder);
    return () => {
      raiz.removeEventListener('pointerover', aoPassar);
      raiz.removeEventListener('pointerleave', esconder);
      raiz.removeEventListener('focusin', aoFocar);
      raiz.removeEventListener('focusout', aoSairDoFoco);
      raiz.removeEventListener('click', esconder);
      raiz.removeEventListener('scroll', esconder, true);
      window.removeEventListener('resize', esconder);
    };
  }, [barraRef]);

  return (
    <div
      aria-hidden="true"
      className="amg-saliencia"
      data-visivel={saliencia.visivel}
      data-deslizar={saliencia.deslizar}
      data-sem-topo={saliencia.semTopo}
      data-sem-base={saliencia.semBase}
      style={{ top: saliencia.top, left: saliencia.left, '--borda': `${saliencia.borda}px` }}
    >
      {/* a letra na cor do ícone: o ativo no coral, os outros no texto */}
      <div className={`amg-saliencia-corpo ${saliencia.ativo ? 'text-destaque-texto' : 'text-texto'}`}>
        <span className="amg-saliencia-texto">{saliencia.nome}</span>
      </div>
    </div>
  );
}
