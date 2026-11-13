"use strict";
/*
  O tocador do vídeo da página do cliente (mockup docs/mockups/enviar-para-o-cliente.html do repositório do programa, aprovado por
  ÊDI em 11/10/2026): o HLS que o Arquionie faz (pedaços de 4 s em MP4 fragmentado, em 480p, 720p e 1080p, e a capa). Nosso, sem
  biblioteca: no Safari (iPhone), o próprio navegador toca o HLS; nos outros, pelo Media Source do navegador, que recebe os pedaços um a
  um. A qualidade é escolhida pela internet de quem assiste e troca no meio sem parar (no começo do pedaço seguinte).
    TocadorDoVideo(video, { hls, mp4, capa, aoTrocar(qualidade) })  devolve { parar, qualidades, fixada, fixar }
  Pelo menu do vídeo (ÊDI, 13/11/2026), quem assiste fixa uma qualidade ou volta à automática.
  O BAIXAR O VÍDEO (ÊDI, 13/11/2026) junta no navegador o começo e os pedaços da maior qualidade num arquivo só, um MP4 que o
  computador e o celular tocam, e entrega com o nome do projeto: o envio não leva um MP4 inteiro.
    BaixarOVideo({ hls, mp4, nome, aoAndar(parte de 0 a 1) })
*/
(() => {
// A leitura do HLS, do tocador e do BAIXAR O VÍDEO.
const endereco = (de, uri) => new URL(uri, de).href;
const atributos = linha => Object.fromEntries([...linha.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)].map(m => [m[1], m[2].replace(/^"|"$/g, "")]));
async function texto(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); }
/** As qualidades do HLS principal: a banda, a altura, os codecs e a lista dos pedaços de cada uma. */
async function lerPrincipal(url) {
  const linhas = (await texto(url)).split(/\r?\n/);
  const qualidades = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i].startsWith("#EXT-X-STREAM-INF:")) continue;
    const a = atributos(linhas[i].slice(18)), uri = linhas[++i].trim();
    qualidades.push({ banda: +a.BANDWIDTH || 0, altura: +(a.RESOLUTION || "x0").split("x")[1] || 0, codecs: a.CODECS || "avc1.640028,mp4a.40.2", url: endereco(url, uri) });
  }
  return qualidades.sort((x, y) => x.banda - y.banda);
}
/** Uma lista de pedaços: o começo (o init do MP4 fragmentado) e cada pedaço com a duração e o instante em que começa. */
async function lerLista(q) {
  const linhas = (await texto(q.url)).split(/\r?\n/);
  q.pedacos = []; let t = 0, duracao = 0;
  for (const l of linhas) {
    if (l.startsWith("#EXT-X-MAP:")) q.inicio = endereco(q.url, atributos(l.slice(11)).URI);
    else if (l.startsWith("#EXTINF:")) duracao = parseFloat(l.slice(8));
    else if (l && !l.startsWith("#")) { q.pedacos.push({ url: endereco(q.url, l.trim()), t, d: duracao }); t += duracao; }
  }
  q.total = t;
}

window.TocadorDoVideo = function (video, { hls, mp4, capa, aoTrocar = () => {} }) {
  if (capa) video.poster = capa;
  video.playsInline = true;
  const MS = window.ManagedMediaSource || window.MediaSource;
  // O HLS do próprio navegador só nos da Apple: o Chrome passou a tocar HLS sozinho, mas sem deixar escolher a qualidade; nele
  // segue o nosso, pelo Media Source, como era antes de ele aprender (ÊDI, 13/11/2026: a qualidade no menu do vídeo).
  const daApple = /Apple/.test(navigator.vendor || "") || !window.MediaSource;
  const nativo = !!hls && !!video.canPlayType("application/vnd.apple.mpegurl") && daApple;
  if (!hls || nativo || !MS) {
    video.src = nativo ? hls : mp4 || hls;
    aoTrocar(nativo ? "automática" : "");
    return { parar() { video.removeAttribute("src"); video.load(); }, qualidades: () => [], fixada: () => 0, fixar() { } };
  }

  let parado = false, banda = 0, atual = null, proximo = 0, ultimoInicio = null, ocupado = false, fixa = null, trocar = false;
  const ms = new MS();
  if (window.ManagedMediaSource) video.disableRemotePlayback = true;
  video.src = URL.createObjectURL(ms);
  let qualidades, sb;
  const escolher = () => {
    // A que quem assiste escolheu no menu do vídeo vale sobre a medida da internet.
    if (fixa) return fixa;
    // A maior que cabe em 80% da banda medida; sem medida ainda, a do meio (720p) para começar logo.
    if (!banda) return qualidades[Math.min(1, qualidades.length - 1)];
    let q = qualidades[0];
    for (const x of qualidades) if (x.banda <= banda * .8) q = x;
    return q;
  };
  async function baixar(url) {
    const t0 = performance.now(), r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    const b = await r.arrayBuffer(), s = (performance.now() - t0) / 1000;
    if (s > .05 && b.byteLength > 20000) { const medida = b.byteLength * 8 / s; banda = banda ? banda * .7 + medida * .3 : medida; }
    return b;
  }
  const anexar = b => new Promise((ok, erro) => {
    const fim = () => { sb.removeEventListener("updateend", fim); sb.removeEventListener("error", falha); ok(); };
    const falha = () => { sb.removeEventListener("updateend", fim); sb.removeEventListener("error", falha); erro(new Error("o pedaço não entrou")); };
    sb.addEventListener("updateend", fim); sb.addEventListener("error", falha);
    sb.appendBuffer(b);
  });
  const tirar = (de, ate) => new Promise(ok => {
    if (ate <= de) return ok();
    const fim = () => { sb.removeEventListener("updateend", fim); ok(); };
    sb.addEventListener("updateend", fim); sb.remove(de, ate);
  });
  const naFrente = () => {
    const b = video.buffered, t = video.currentTime;
    for (let i = 0; i < b.length; i++) if (b.start(i) <= t + .3 && b.end(i) > t) return b.end(i) - t;
    return 0;
  };
  // Leva os pedaços: até 30 s à frente do que está tocando, cada um na qualidade escolhida na hora.
  async function alimentar() {
    if (ocupado || parado || !sb || (ms.readyState !== "open" && !trocar)) return;
    ocupado = true;
    try {
      if (trocar) {
        // A qualidade escolhida à mão vale logo: o que estava guardado à frente sai, e os pedaços seguem dali na nova.
        trocar = false;
        const t = video.currentTime;
        let i = atual.pedacos.findIndex(p => t < p.t + p.d);
        if (i < 0) i = atual.pedacos.length - 1;
        if (i + 1 < atual.pedacos.length) { proximo = i + 1; await tirar(atual.pedacos[proximo].t, atual.total); }
      }
      while (!parado && proximo < atual.pedacos.length && naFrente() < 30) {
        const q = escolher();
        if (q !== atual || ultimoInicio !== q.inicio) {
          if (!q.pedacos) await lerLista(q);
          if (q.codecs !== atual.codecs && sb.changeType) sb.changeType(`video/mp4; codecs="${q.codecs}"`);
          await anexar(await baixar(q.inicio)); ultimoInicio = q.inicio;
          if (q !== atual) { atual = q; aoTrocar(fixa ? `${q.altura}p` : `automática · ${q.altura}p`); }
        }
        await anexar(await baixar(atual.pedacos[proximo].url));
        proximo++;
      }
      if (proximo >= atual.pedacos.length && ms.readyState === "open" && !sb.updating) ms.endOfStream();
      // O que ficou bem para trás sai da memória.
      if (video.currentTime > 60) await tirar(0, video.currentTime - 45);
    } catch (e) {
      console.warn("vídeo:", e.message);
    } finally { ocupado = false; }
  }
  ms.addEventListener("sourceopen", async () => {
    try {
      qualidades = await lerPrincipal(hls);
      if (!qualidades.length) throw new Error("o vídeo não tem qualidades");
      atual = escolher(); await lerLista(atual);
      ms.duration = atual.total;
      sb = ms.addSourceBuffer(`video/mp4; codecs="${atual.codecs}"`);
      sb.mode = "segments";
      await anexar(await baixar(atual.inicio)); ultimoInicio = atual.inicio;
      aoTrocar(`automática · ${atual.altura}p`);
      alimentar();
    } catch (e) {
      // Sem conseguir pelo Media Source: o MP4 inteiro, se houver.
      console.warn("vídeo:", e.message);
      if (mp4) video.src = mp4;
    }
  }, { once: true });
  // Pular para outro instante: os pedaços seguem dali.
  video.addEventListener("seeking", () => {
    if (!atual || !atual.pedacos) return;
    const t = video.currentTime;
    let i = atual.pedacos.findIndex(p => t < p.t + p.d);
    if (i < 0) i = atual.pedacos.length - 1;
    if (naFrente() < .5) proximo = i;
    alimentar();
  });
  video.addEventListener("timeupdate", alimentar);
  video.addEventListener("waiting", alimentar);
  if (ms.addEventListener) ms.addEventListener("startstreaming", alimentar);
  return {
    parar() { parado = true; try { if (ms.readyState === "open") ms.endOfStream(); } catch { } video.removeAttribute("src"); video.load(); },
    /** As alturas que o vídeo tem (1080, 720, 480), da maior para a menor; vazio enquanto a lista não chegou. */
    qualidades: () => (qualidades || []).map(q => q.altura).filter(Boolean).sort((a, b) => b - a),
    /** A altura escolhida à mão, ou 0 na automática. */
    fixada: () => fixa ? fixa.altura : 0,
    /** Fixa uma altura, ou volta à automática com 0. */
    fixar(altura) {
      fixa = altura && (qualidades || []).find(q => q.altura === altura) || null;
      trocar = !!fixa;
      if (atual) aoTrocar(fixa ? `${fixa.altura}p` : `automática · ${atual.altura}p`);
      alimentar();
    },
  };
};

window.BaixarOVideo = async function ({ hls, mp4, nome, aoAndar = () => {} }) {
  // Cada arquivo com três tentativas: num vídeo comprido, uma queda da internet não perde o que já veio.
  async function buscar(url) {
    for (let vez = 1; ; vez++) {
      try { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return await r.arrayBuffer(); }
      catch (e) { if (vez >= 3) throw e; await new Promise(ok => setTimeout(ok, 800 * vez)); }
    }
  }
  const partes = [];
  let juntou = false;
  if (hls) try {
    const q = (await lerPrincipal(hls)).at(-1);
    if (!q) throw new Error("o vídeo não tem qualidades");
    await lerLista(q);
    if (!q.inicio || !q.pedacos.length) throw new Error("a lista não tem os pedaços");
    const enderecos = [q.inicio, ...q.pedacos.map(p => p.url)];
    for (let i = 0; i < enderecos.length; i++) { partes.push(await buscar(enderecos[i])); aoAndar((i + 1) / enderecos.length); }
    juntou = true;
  } catch (e) { if (!mp4) throw e; partes.length = 0; }
  if (!juntou) {
    if (!mp4) throw new Error("o envio não tem vídeo");
    partes.push(await buscar(mp4)); aoAndar(1);
  }
  const a = document.createElement("a"), url = URL.createObjectURL(new Blob(partes, { type: "video/mp4" }));
  a.href = url; a.download = nome; a.hidden = true;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
})();
