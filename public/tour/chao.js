"use strict";
/*
  O chão do tour no navegador (ÊDI, 09/10/2026: "essa amostra ainda está atravessando as paredes"): o andar do SOLO do Arquionie
  (ChaoDoPasseio.Andar), refeito aqui conta por conta, para o visualizador chegar ao mesmo lugar que o programa. Lê o chao.bin que o
  programa grava (ChaoDoPasseio.EmBytes): célula por célula, linha por linha, os chãos de cima para baixo; a altura de cada chão
  acima de zBase em centímetros (uint16), depois a folga de cada um em centímetros (byte; zero barra), depois quantos chãos tem cada
  célula (byte). Quem anda para a um corpo (o raio) da parede, do móvel, da porta fechada e do guarda-corpo, desliza ao longo deles,
  contorna a quina, sobe a escada degrau a degrau e não cai pela beirada. A conferência: ferramentas/tour/conferir-chao.mjs.
  No visualizador é o ChaoDoTour global; no Node, o module.exports.
*/
const ChaoDoTour = (() => {
  const Vizinhos = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  /** O chão lido do buffer do chao.bin, com o cabeçalho do cena.json (origem, celula, colunas, linhas, nos, zBase, degrau). */
  function ler(buffer, info) {
    const ox = info.origem[0], oy = info.origem[1], celula = info.celula, colunas = info.colunas, linhas = info.linhas, nos = info.nos;
    const degrau = info.degrau ?? .35, celulas = colunas * linhas;
    const visao = new DataView(buffer), bytes = new Uint8Array(buffer);
    // Float32, como no programa (o chão guarda float).
    const z = new Float32Array(nos), folga = new Float32Array(nos), celulaDoNo = new Int32Array(nos), inicio = new Int32Array(celulas + 1);
    for (let c = 0; c < celulas; c++) inicio[c + 1] = inicio[c] + bytes[3 * nos + c];
    for (let n = 0; n < nos; n++) {
      z[n] = info.zBase + visao.getUint16(2 * n, true) / 100;
      folga[n] = bytes[2 * nos + n] / 100;
    }
    for (let c = 0; c < celulas; c++) for (let n = inicio[c]; n < inicio[c + 1]; n++) celulaDoNo[n] = c;

    const dentro = (c, l) => c >= 0 && l >= 0 && c < colunas && l < linhas;
    const coluna = x => Math.floor((x - ox) / celula), linha = y => Math.floor((y - oy) / celula);
    /** O que fica mais de um degrau abaixo da altura preferida conta uma vez e meia (ChaoDoPasseio.Distancia). */
    const distancia = (zc, zp) => zc >= zp - degrau ? Math.abs(zc - zp) : 1.5 * (zp - zc);

    /** O chão da célula do ponto mais perto da altura preferida; -1 sem chão. */
    function noDoLugar(x, y, zp) {
      const c = coluna(x), l = linha(y);
      if (!dentro(c, l)) return -1;
      let melhor = -1;
      for (let n = inicio[l * colunas + c]; n < inicio[l * colunas + c + 1]; n++)
        if (melhor < 0 || distancia(z[n], zp) < distancia(z[melhor], zp)) melhor = n;
      return melhor;
    }

    /** O chão da célula vizinha a um degrau do nó (o mais perto na altura); -1 sem ele. */
    function vizinho(no, dc, dl) {
      const cel = celulaDoNo[no], c = cel % colunas + dc, l = Math.trunc(cel / colunas) + dl;
      if (!dentro(c, l)) return -1;
      const zn = z[no];
      let melhor = -1, perto = 3.4028234663852886e38;
      for (let n = inicio[l * colunas + c]; n < inicio[l * colunas + c + 1]; n++) {
        const d = Math.fround(Math.abs(Math.fround(z[n] - zn)));
        if (d <= degrau && d < perto) { perto = d; melhor = n; }
      }
      return melhor;
    }

    /** De (dx, dy) para (px, py), a meia célula por vez: até onde se chega antes da célula sem chão ligado ou perto demais. */
    function percorrer(no, dx, dy, px, py, minimo) {
      const vx = px - dx, vy = py - dy;
      const passos = Math.max(1, Math.ceil(Math.sqrt(vx * vx + vy * vy) / (celula * .5)));
      let ux = dx, uy = dy;
      for (let k = 1; k <= passos; k++) {
        const t = k / passos, x = dx + vx * t, y = dy + vy * t;
        const c = coluna(x), l = linha(y), cel = celulaDoNo[no], cAtual = cel % colunas, lAtual = Math.trunc(cel / colunas);
        if (c !== cAtual || l !== lAtual) {
          if (Math.abs(c - cAtual) > 1 || Math.abs(l - lAtual) > 1) return { x: ux, y: uy, no, inteiro: false };
          const j = vizinho(no, c - cAtual, l - lAtual);
          if (j < 0 || folga[j] < minimo) return { x: ux, y: uy, no, inteiro: false };
          no = j;
        }
        ux = x; uy = y;
      }
      return { x: px, y: py, no, inteiro: true };
    }

    /** Para onde a folga cresce em volta do nó (Sobel): a direção que sai do obstáculo mais perto. */
    function paraFora(no) {
      const F = (dc, dl) => { const j = vizinho(no, dc, dl); return j < 0 ? 0 : folga[j]; };
      return [F(1, 1) + 2 * F(1, 0) + F(1, -1) - F(-1, 1) - 2 * F(-1, 0) - F(-1, -1),
        F(1, 1) + 2 * F(0, 1) + F(-1, 1) - F(1, -1) - 2 * F(0, -1) - F(-1, -1)];
    }

    /**
     * Anda de (dx, dy) para (px, py) com os pés na altura zPes e o corpo do raio: devolve [x, y] onde chega. Sem chão debaixo, anda
     * livre; quem está mais perto que o raio só não chega mais perto. O que barra a frente faz deslizar ao longo dele.
     */
    function andar(dx, dy, px, py, zPes, raio) {
      const no = noDoLugar(dx, dy, zPes);
      if (no < 0) return [px, py];
      const minimo = Math.min(raio, folga[no]) - 1e-4;
      const ate = percorrer(no, dx, dy, px, py, minimo);
      if (ate.inteiro) return [px, py];
      const ax = ate.x, ay = ate.y, noAqui = ate.no;
      let rx = px - ax, ry = py - ay;
      let [fx, fy] = paraFora(noAqui);
      const tamanho = Math.sqrt(fx * fx + fy * fy);
      if (tamanho > 1e-9) {
        const inverso = 1 / tamanho;
        fx *= inverso; fy *= inverso;
        const entra = rx * fx + ry * fy;
        if (entra < 0) { rx -= fx * entra; ry -= fy * entra; }
      }
      const porEixos = (x1, y1, x2, y2) => {
        const a = percorrer(noAqui, ax, ay, ax + x1, ay + y1, minimo);
        const b = percorrer(a.no, a.x, a.y, a.x + x2, a.y + y2, minimo);
        return [b.x, b.y];
      };
      const xAntes = porEixos(rx, 0, 0, ry), yAntes = porEixos(0, ry, rx, 0);
      const comprimento = p => Math.sqrt((p[0] - ax) * (p[0] - ax) + (p[1] - ay) * (p[1] - ay));
      return comprimento(xAntes) >= comprimento(yAntes) ? xAntes : yAntes;
    }

    /**
     * Se dá para ir em linha reta de (dx, dy) até (px, py) pelo chão, sem parede nem móvel no meio (os pontos das outras paradas no chão,
     * como os da Matterport, só aparecem para as que se alcançam assim; 10/10/2026).
     */
    function alcanca(dx, dy, px, py, zPes) {
      const no = noDoLugar(dx, dy, zPes);
      return no >= 0 && percorrer(no, dx, dy, px, py, 1e-4).inteiro;
    }

    /** A altura do chão no ponto, mais perto da altura preferida; NaN sem chão. */
    function chaoEm(x, y, zp) { const no = noDoLugar(x, y, zp); return no >= 0 ? z[no] : NaN; }
    /** A folga do chão no ponto, mais perto da altura preferida; zero sem chão. */
    function folgaEm(x, y, zp) { const no = noDoLugar(x, y, zp); return no >= 0 ? folga[no] : 0; }

    return { andar, alcanca, chaoEm, folgaEm };
  }

  return { ler };
})();
if (typeof module !== "undefined") module.exports = ChaoDoTour;
