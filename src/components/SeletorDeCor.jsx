import { useEffect, useRef, useState } from 'react';
import { Botao, Campo } from '@/components/Formulario';

// A COR DA MARCA (ÊDI, 19/10/2026): as bolinhas de sempre e mais uma, o círculo cromático. Ela abre o seletor por cima: o quadro para
// arrastar (a força e a luz da cor), a faixa do arco-íris (o tom) e o código, para colar o da marca. Pelo teclado, as setas mexem no
// quadro e na faixa; o código é o caminho do leitor de tela.

const hexParaHsv = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
};
const hsvParaHex = ({ h, s, v }) => {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
};
const valida = (c) => /^#[0-9A-F]{6}$/.test(c);
const ARCO_IRIS = 'linear-gradient(to right, #F00, #FF0, #0F0, #0FF, #00F, #F0F, #F00)';
export const CIRCULO_CROMATICO = 'conic-gradient(#F00, #FF0, #0F0, #0FF, #00F, #F0F, #F00)';

function arrastar(e, el, aoMover) {
  const mover = (ev) => {
    const r = el.getBoundingClientRect();
    aoMover(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
  };
  mover(e);
  const soltar = () => {
    window.removeEventListener('pointermove', mover);
    window.removeEventListener('pointerup', soltar);
  };
  window.addEventListener('pointermove', mover);
  window.addEventListener('pointerup', soltar);
}

export function SeletorDeCor({ cor, aoMudar, aoFechar }) {
  const [hsv, setHsv] = useState(() => hexParaHsv(cor));
  const [codigo, setCodigo] = useState(cor);
  const caixa = useRef(null);
  const quadro = useRef(null);
  const faixa = useRef(null);

  useEffect(() => {
    const fora = (e) => caixa.current && !caixa.current.contains(e.target) && !e.target.closest?.('[data-abre-seletor]') && aoFechar();
    const tecla = (e) => e.key === 'Escape' && aoFechar();
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aoFechar]);

  function mudar(novo) {
    setHsv(novo);
    const hex = hsvParaHex(novo);
    setCodigo(hex);
    aoMudar(hex);
  }
  function digitar(v) {
    const limpo = v.trim().toUpperCase();
    setCodigo(limpo);
    const hex = limpo.startsWith('#') ? limpo : `#${limpo}`;
    if (valida(hex)) {
      setHsv(hexParaHsv(hex));
      aoMudar(hex);
    }
  }
  const setas = (e, eixo) => {
    const passo = e.shiftKey ? 0.1 : 0.02;
    const d = { ArrowLeft: -passo, ArrowRight: passo, ArrowUp: passo, ArrowDown: -passo }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    if (eixo === 'h') return mudar({ ...hsv, h: (hsv.h + d * 360 + 360) % 360 });
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') mudar({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + d)) });
    else mudar({ ...hsv, v: Math.min(1, Math.max(0, hsv.v + d)) });
  };
  const tom = hsvParaHex({ h: hsv.h, s: 1, v: 1 });
  return (
    <div ref={caixa} role="dialog" aria-label="Escolher a cor da marca"
      className="absolute left-0 top-[calc(100%+10px)] z-40 flex w-[300px] flex-col gap-3 rounded-cartao bg-superficie p-4 shadow-amg-janela">
      <div ref={quadro} role="slider" tabIndex={0} aria-label="Força e luz da cor" aria-valuetext={codigo}
        onPointerDown={(e) => arrastar(e, quadro.current, (x, y) => mudar({ ...hsv, s: x, v: 1 - y }))} onKeyDown={(e) => setas(e, 'sv')}
        className="relative h-[170px] w-full cursor-crosshair touch-none rounded-dentro"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #FFF, ${tom})` }}>
        <span aria-hidden="true" className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: codigo }} />
      </div>
      <div ref={faixa} role="slider" tabIndex={0} aria-label="Tom da cor" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)}
        onPointerDown={(e) => arrastar(e, faixa.current, (x) => mudar({ ...hsv, h: x * 360 }))} onKeyDown={(e) => setas(e, 'h')}
        className="relative h-3.5 w-full cursor-pointer touch-none rounded-full" style={{ background: ARCO_IRIS }}>
        <span aria-hidden="true" className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: tom }} />
      </div>
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="h-[46px] w-[46px] shrink-0 rounded-full" style={{ backgroundColor: valida(codigo) ? codigo : cor }} />
        <div className="min-w-0 flex-1">
          <Campo rotulo="Código" id="pa-cor" valor={codigo} aoMudar={digitar} placeholder="#A9513F" maxLength={7} spellCheck={false}
            onFocus={(e) => e.target.select()} />
        </div>
      </div>
      <Botao nivel={2} type="button" onClick={aoFechar}>Pronto</Botao>
    </div>
  );
}
