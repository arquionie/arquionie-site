"use strict";
/*
  O tour como maquete (ÊDI, 10/10/2026, pelo vídeo do aluno com o Claude: "Era disso aqui que eu estava falando"; as sete
  recomendações aceitas, "PODE SEGUIR"). Lê o pacote do TourDaMaquete (formato 6) e desenha o modelo na hora, nosso, em WebGL 2:
  - MAQUETE: girar em volta, aproximar, arrastar; as paredes cortadas a 2,40 m do piso, com o corte escuro, para ver dentro;
  - PLANTA: a mesma maquete vista de cima;
  - ANDAR: em pé, sem atravessar parede (chao.js, o mesmo andar do programa); o toque no chão leva até lá;
  - os ambientes com nome e área; o toque leva até o ambiente e abre o cartão (área, medidas, pé-direito, piso, forro);
  - o sol pela hora e pelo lugar do projeto, com sombra; a altura das paredes; o pavimento;
  - os panoramas do EXPORTAR como pontos de foto 360°: o toque entra na foto, em qualidade final; de uma foto à outra, os pontos no
    chão e a passagem pelo modelo pintado pelos dois panoramas (como no tour dos panoramas).
*/
window.TourDaMaquete = async function (base, tour) {
  const $ = id => document.getElementById(id);
  const tela = $("tela");
  const gl = tela.getContext("webgl2", { antialias: false, stencil: true });
  if (!gl) throw new Error("Este navegador não mostra o tour (falta o WebGL 2).");
  const toque = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  document.body.classList.add("maquete");
  const rad = Math.PI / 180;
  // Os pavimentos com ambiente ou foto 360° (a CALÇADA, a COBERTURA e a PLATIBANDA do 225 ficam de fora); o número do pavimento de cada
  // ambiente passa a ser o da lista que fica.
  const pans = tour.panoramas || [];
  const todos = tour.pavimentos.length ? tour.pavimentos : [{ nome: "", z: tour.regiao[2] + .5, topo: tour.regiao[5] }];
  const comAlgo = todos.map((p, i) => tour.ambientes.some(a => a.pavimento === i) || pans.some(f => f.chao >= p.z - .6 && f.chao < p.topo - .6));
  const pavs = todos.filter((p, i) => comAlgo[i]);
  if (!pavs.length) pavs.push(todos[0]);
  const novoNumero = todos.map((p, i) => pavs.indexOf(p));
  const ambientes = tour.ambientes.filter(a => novoNumero[a.pavimento] >= 0).map(a => ({ ...a, pavimento: novoNumero[a.pavimento] }));
  const regMin = tour.regiao.slice(0, 3), regMax = tour.regiao.slice(3, 6);
  // O modelo em float, no mundo (o pacote leva o modelo inteiro): a caixa do vértice é a identidade; o de antes, em 16 bits na região.
  const emFloat = tour.modelo.posicao === "float";
  const PASSO = emFloat ? 24 : 16;
  const [cxMin, cxMax] = emFloat ? [[0, 0, 0], [1, 1, 1]] : [regMin, regMax];
  const limites = tour.limites || tour.regiao;

  // ---------------------------------------------------------------- a carga
  let baixado = 0, total = 0;
  const mb = b => (b / 1048576).toFixed(b >= 10485760 ? 0 : 1).replace(".", ",");
  function andamento() {
    if (!total) return;
    $("barra").style.width = Math.min(100, 100 * baixado / total) + "%";
    $("carga").textContent = `carregando · ${mb(baixado)} de ${mb(total)} MB`;
  }
  async function baixar(nome, contar = true) {
    const r = await fetch(typeof base === "function" ? base(nome) : base + nome);
    if (!r.ok) throw new Error(`${nome}: ${r.status}`);
    const b = await r.arrayBuffer();
    if (contar) { baixado += b.byteLength; andamento(); }
    return b;
  }
  const imagemDe = async (b, tipo) => createImageBitmap(new Blob([b], { type: tipo }));
  const tamanho = n => (tour.arquivos || {})[n] || 0;
  document.title = tour.projeto;
  $("projeto").textContent = tour.projeto;
  $("passeio").textContent = `${ambientes.length} ambientes · ${pans.length} fotos 360°`;
  const pecas = tour.pecas;
  total = tamanho(tour.modelo.vertices) + tamanho(tour.modelo.indices) + (tour.modelo.vidro ? tamanho(tour.modelo.vidro) : 0) + tamanho(tour.chao.arquivo)
    + (pecas ? tamanho(pecas.vertices) + tamanho(pecas.indices) + tamanho(pecas.copias) : 0)
    + tour.materiais.reduce((s, m) => s + (m.imagem ? tamanho(m.imagem) : 0), 0) + tour.plantas.reduce((s, p) => s + tamanho(p.imagem), 0);
  andamento();
  const [vertices, indices, vidro, imagensDosMateriais, chao, plantas, verticesDasPecas, indicesDasPecas, copiasDasPecas] = await Promise.all([
    baixar(tour.modelo.vertices), baixar(tour.modelo.indices),
    tour.modelo.vidro ? baixar(tour.modelo.vidro) : null,
    Promise.all(tour.materiais.map(m => m.imagem ? baixar(m.imagem).then(b => imagemDe(b, m.imagem.endsWith(".png") ? "image/png" : "image/jpeg")) : null)),
    baixar(tour.chao.arquivo).then(b => ChaoDoTour.ler(b, tour.chao)),
    Promise.all(tour.plantas.map(p => baixar(p.imagem).then(b => imagemDe(b, "image/png")))),
    pecas ? baixar(pecas.vertices) : null, pecas ? baixar(pecas.indices) : null, pecas ? baixar(pecas.copias) : null,
  ]);

  // ---------------------------------------------------------------- a tela por cima (a barra, a dica, o cartão, os rótulos)
  const estilo = document.createElement("style");
  estilo.textContent = `
    body.maquete { background: #e9e7e3; }
    body.maquete #controles, body.maquete #lado, body.maquete #retomar, body.maquete .comando, body.maquete #dica { display: none !important; }
    #mq-rotulos, #mq-marcas, #mq-cotas, #mq-alfinetes { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .mq-alfinete { position: absolute; left: 0; top: 0; width: 26px; height: 26px; margin: -34px 0 0 -13px; border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg); background: #E76353; box-shadow: 0 3px 8px rgba(0,0,0,.35); pointer-events: auto; cursor: pointer; }
    .mq-alfinete b { display: block; transform: rotate(45deg); color: #fff; font: 700 12px/26px "Segoe UI", sans-serif; text-align: center; }
    .mq-alfinete.rascunho { background: #fff; border: 2.5px solid #E76353; margin: -36px 0 0 -15px; }
    .mq-alfinete.rascunho b { color: #E76353; line-height: 21px; }
    body.comentando #tela { cursor: crosshair; }
    #mq-cotas { width: 100%; height: 100%; }
    #mq-cotas text { font: 600 11.5px Inter, "Segoe UI", sans-serif; fill: #2b3036; stroke: rgba(244,243,240,.85); stroke-width: 2.5px; paint-order: stroke; }
    .mq-rotulo { position: absolute; left: 0; top: 0; padding: 3px 8px; background: rgba(255,255,255,.86); color: #2a2f36; font: 600 11px "Segoe UI", sans-serif;
      letter-spacing: .2px; text-align: center; white-space: nowrap; pointer-events: auto; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.18); }
    .mq-rotulo span { display: block; font-weight: 400; font-size: 10px; color: #5c6570; }
    .mq-rotulo.escolhido { background: #f6d58a; }
    .mq-360 { position: absolute; left: 0; top: 0; width: 30px; height: 30px; border-radius: 50%; background: #e76353; color: #fff; border: 2px solid #fff;
      font: 700 9px "Segoe UI", sans-serif; display: flex; align-items: center; justify-content: center; pointer-events: auto; cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,.35); padding: 0; min-width: 0; }
    #mq-dica { position: absolute; left: 50%; transform: translateX(-50%); top: calc(10px + env(safe-area-inset-top)); padding: 5px 12px; background: rgba(17,21,26,.66);
      color: #e6e9ee; font-size: 11.5px; white-space: nowrap; max-width: 92vw; overflow: hidden; text-overflow: ellipsis; }
    /* A barra (mockup docs/mockups/controles-do-tour do repositório do programa, aprovado por ÊDI em 12/10/2026): no computador, uma
       linha em grupos com o nome pequeno em cima (PAVIMENTO, VER, PASSEAR, LUZ e CORTE) e a tela cheia no fim, o coral só no escolhido
       ou ligado; no celular, o pavimento e a tela cheia no alto, o sol e o corte nas laterais (como o volume do iPhone) e, embaixo, os
       três modos e o ▶, com o meio livre para o dedo. */
    #mq-barra { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(12px + env(safe-area-inset-bottom)); display: flex;
      align-items: stretch; background: rgba(17,21,26,.84); padding: 5px; color: #e6e9ee; width: max-content; max-width: calc(100vw - 20px); flex-wrap: wrap;
      justify-content: center; row-gap: 6px; box-shadow: 0 6px 18px rgba(0,0,0,.35); }
    .mq-grupo { display: flex; flex-direction: column; justify-content: flex-end; padding: 0 6px; }
    .mq-grupo + .mq-grupo { border-left: 1px solid rgba(255,255,255,.12); }
    .mq-tit { font-size: 8.5px; font-weight: 700; letter-spacing: .12em; color: #9aa4b2; margin: 0 0 3px 2px; line-height: 1; }
    .mq-linha { display: flex; align-items: center; gap: 2px; height: 34px; }
    #mq-barra button, #mq-topo button { height: 34px; min-width: 0; padding: 0 10px; background: rgba(255,255,255,.07); color: #e6e9ee;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; letter-spacing: .04em; }
    #mq-barra svg, #mq-topo svg, .mq-vert svg { width: 16px; height: 16px; display: block; flex: none; }
    #mq-barra b { display: contents; }
    .mq-seg { background: rgba(255,255,255,.05); gap: 0; }
    #mq-barra .mq-seg button { background: transparent; color: #c9d0da; }
    #mq-barra button.mq-passear { background: rgba(255,255,255,.05); color: #c9d0da; }
    #mq-barra .mq-seg button.ativo, #mq-barra button.mq-passear.ativo { background: #e76353; color: #fff; }
    .mq-pav { display: flex; align-items: center; gap: 3px; height: 34px; }
    #mq-barra .mq-pav button.mq-ir, #mq-topo .mq-pav button.mq-ir { width: 34px; padding: 0; background: rgba(255,255,255,.16); color: #fff; }
    .mq-pav button.mq-ir:disabled { opacity: .32; cursor: default; }
    #mq-pav { min-width: 108px; height: 34px; padding: 0 12px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.06);
      box-shadow: 0 0 0 1px rgba(255,255,255,.28) inset; color: #fff; font-size: 12px; font-weight: 800; letter-spacing: .07em; white-space: nowrap;
      max-width: 44vw; overflow: hidden; text-overflow: ellipsis; }
    .mq-desl { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 4px; color: #c9d0da; }
    .mq-desl input[type=range] { width: 96px; accent-color: #e76353; }
    .mq-desl .valor { color: #fff; min-width: 40px; font-size: 11.5px; font-weight: 700; }
    #mq-barra button.mq-chave { padding: 0 8px; font-size: 10.5px; color: #c9d0da; }
    .mq-chave i { width: 26px; height: 14px; border-radius: 7px; background: rgba(255,255,255,.25); position: relative; flex: none; }
    .mq-chave i::after { content: ""; position: absolute; left: 2px; top: 2px; width: 10px; height: 10px; border-radius: 50%; background: #fff; transition: left .15s; }
    .mq-chave.ativo i { background: #e76353; } .mq-chave.ativo i::after { left: 14px; }
    /* o celular */
    body.toque #mq-barra { left: calc(8px + env(safe-area-inset-left)); right: calc(8px + env(safe-area-inset-right)); bottom: calc(10px + env(safe-area-inset-bottom));
      transform: none; width: auto; max-width: none; padding: 0; gap: 4px; flex-wrap: nowrap; background: none; box-shadow: none; }
    body.toque #mq-barra .mq-seg { flex: 1; height: 38px; background: rgba(17,21,26,.78); }
    body.toque #mq-barra .mq-seg button { flex: 1; height: 38px; font-size: 10.5px; }
    body.toque #mq-barra button.mq-passear { width: 44px; height: 38px; padding: 0; background: rgba(17,21,26,.78); }
    body.toque #mq-barra button.mq-passear.ativo { background: #e76353; }
    body.toque .mq-passear span { display: none; }
    body.toque #parada { display: none !important; }
    #mq-topo { top: calc(12px + env(safe-area-inset-top)); left: 0; right: 0; height: 32px; background: none; pointer-events: none; }
    #mq-topo .mq-esq { position: absolute; left: calc(12px + env(safe-area-inset-left)); display: flex; gap: 4px; pointer-events: auto; }
    body.embutido #mq-topo .mq-esq { left: calc(48px + env(safe-area-inset-left)); }
    #mq-topo button { width: 32px; height: 32px; padding: 0; background: rgba(17,21,26,.72); color: #fff; }
    #mq-topo button.ativo { background: #e76353; }
    #mq-topo .mq-pav { position: absolute; left: 50%; transform: translateX(-50%); gap: 2px; height: 32px; pointer-events: auto; }
    #mq-topo .mq-pav button.mq-ir { width: 28px; height: 32px; background: rgba(17,21,26,.82); }
    #mq-topo .mq-pav button.mq-ir:disabled { opacity: 1; color: rgba(255,255,255,.3); }
    #mq-topo #mq-pav { min-width: 74px; height: 32px; padding: 0 8px; background: rgba(17,21,26,.72); font-size: 11px; letter-spacing: .06em; }
    .mq-vert { position: absolute; top: 19%; height: 36%; width: 30px; display: flex; flex-direction: column; align-items: center; gap: 6px; background: none; }
    #mq-v-sol { left: calc(12px + env(safe-area-inset-left)); } #mq-v-corte { right: calc(12px + env(safe-area-inset-right)); }
    .mq-vert .mq-ico, #mq-v-sol #mq-sombra { width: 26px; height: 26px; min-width: 0; padding: 0; border-radius: 50%; background: rgba(17,21,26,.62); color: #fff;
      display: flex; align-items: center; justify-content: center; flex: none; }
    .mq-vert .mq-ico svg, #mq-v-sol #mq-sombra svg { width: 14px; height: 14px; }
    #mq-v-sol #mq-sombra { color: #c9d0da; } #mq-v-sol #mq-sombra.ativo { background: #e76353; color: #fff; }
    .mq-vbarra { position: relative; flex: 1; width: 34px; display: flex; justify-content: center; touch-action: none; cursor: ns-resize; }
    .mq-vbarra .t { position: relative; width: 6px; height: 100%; border-radius: 3px; background: rgba(17,21,26,.42); box-shadow: 0 0 0 1px rgba(255,255,255,.55) inset;
      transition: width .12s; }
    .mq-vbarra .t i { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 3px; background: #e76353; }
    .mq-vbarra.mexendo .t { width: 14px; } .mq-vbarra.mexendo .t i { border-radius: 7px; }
    .mq-vbarra .bolha { position: absolute; left: 36px; transform: translateY(50%); background: rgba(17,21,26,.88); color: #fff; font-size: 12px; font-weight: 800;
      padding: 3px 8px; white-space: nowrap; display: none; pointer-events: none; }
    #mq-v-corte .mq-vbarra .bolha { left: auto; right: 36px; }
    .mq-vbarra.mexendo .bolha { display: block; }
    body.toque #mq-dica { top: calc(52px + env(safe-area-inset-top)); font-size: 11px; }
    body.toque #mq-voltar { top: calc(84px + env(safe-area-inset-top)); }
    body.embutido #mapa { top: calc(56px + env(safe-area-inset-top)); }
    #mq-cartao { position: absolute; right: calc(12px + env(safe-area-inset-right)); top: calc(54px + env(safe-area-inset-top)); width: 270px; background: rgba(17,21,26,.88);
      color: #e6e9ee; padding: 14px 16px 12px; display: none; }
    body.toque #mq-cartao { left: 10px; right: 10px; width: auto; top: auto; bottom: calc(60px + env(safe-area-inset-bottom)); }
    #mq-cartao .tipo { font-size: 10px; letter-spacing: .6px; color: #9aa4b2; font-weight: 700; }
    #mq-cartao h2 { margin: 2px 0 10px; font-size: 19px; font-weight: 600; letter-spacing: .4px; color: #fff; }
    #mq-cartao dl { display: grid; grid-template-columns: 92px 1fr; gap: 4px 8px; margin: 0 0 12px; font-size: 12px; }
    #mq-cartao dt { color: #9aa4b2; font-size: 10.5px; letter-spacing: .4px; font-weight: 700; padding-top: 1px; }
    #mq-cartao dd { margin: 0; color: #fff; }
    #mq-cartao .acoes { display: flex; gap: 6px; flex-wrap: wrap; }
    #mq-cartao .acoes button.forte { background: #e76353; color: #fff; }
    #mq-cartao .fechar { position: absolute; right: 6px; top: 6px; min-width: 28px; height: 28px; background: none; font-size: 15px; }
    #mq-voltar { position: absolute; left: 50%; transform: translateX(-50%); top: calc(44px + env(safe-area-inset-top)); display: none; background: #794b49; color: #fff; }
  `;
  document.head.appendChild(estilo);
  // Os símbolos da barra (o traço do programa, nas cores do tour).
  const ICONES = {
    antes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    depois: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>',
    pausa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    sol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
    corte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16M6 20V9h12v11M6 13h12M10 9v4M14 13v7"/></svg>',
    cheia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    giro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3 8a9 9 0 0 0 0 8M21 8a9 9 0 0 1 0 8"/></svg>',
    sombra: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  };
  const pavimento = `<div class="mq-pav"><button id="mq-abaixo" class="mq-ir" title="Pavimento de baixo" aria-label="Pavimento de baixo">${ICONES.antes}</button>`
    + `<span id="mq-pav"></span><button id="mq-acima" class="mq-ir" title="Pavimento de cima" aria-label="Pavimento de cima">${ICONES.depois}</button></div>`;
  const modos = '<div class="mq-linha mq-seg"><button id="mq-maquete">MAQUETE</button><button id="mq-planta">PLANTA</button><button id="mq-andar">ANDAR</button></div>';
  const passear = `<button id="mq-play" class="mq-passear" title="Passear pelos ambientes" aria-label="Passear pelos ambientes"><b id="mq-play-icone">${ICONES.play}</b>`
    + '<span id="mq-play-nome">PASSEAR</span></button>';
  const barra = toque ? `
    <div class="sobre esconder" id="mq-topo"><div class="mq-esq"><button id="mq-cheia" title="Tela cheia" aria-label="Tela cheia">${ICONES.cheia}</button>`
      + `<button id="mq-giro" title="Movimento do celular" aria-label="Movimento do celular">${ICONES.giro}</button></div>${pavimento}</div>
    <div class="sobre esconder mq-vert" id="mq-v-sol"><span class="mq-ico" title="A hora do sol">${ICONES.sol}</span>
      <div class="mq-vbarra" id="mq-vb-sol" role="slider" aria-label="A hora do sol"><div class="t"><i></i></div><b class="bolha"></b></div>
      <button id="mq-sombra" title="Ligar e desligar a sombra do sol" aria-label="Sombra">${ICONES.sombra}</button></div>
    <div class="sobre esconder mq-vert" id="mq-v-corte"><span class="mq-ico" title="A altura das paredes">${ICONES.corte}</span>
      <div class="mq-vbarra" id="mq-vb-corte" role="slider" aria-label="A altura das paredes"><div class="t"><i></i></div><b class="bolha"></b></div></div>
    <div class="sobre esconder" id="mq-barra">${modos}${passear}
      <input type="range" id="mq-sol" min="360" max="1080" step="5" hidden><input type="range" id="mq-paredes" min="0.8" max="3.6" step="0.1" hidden>
      <span id="mq-hora" hidden></span><span id="mq-altura" hidden></span></div>` : `
    <div class="sobre esconder" id="mq-barra">
      <div class="mq-grupo"><span class="mq-tit">PAVIMENTO</span>${pavimento}</div>
      <div class="mq-grupo"><span class="mq-tit">VER</span>${modos}</div>
      <div class="mq-grupo"><span class="mq-tit">PASSEAR</span><div class="mq-linha">${passear}</div></div>
      <div class="mq-grupo"><span class="mq-tit">LUZ</span><div class="mq-linha"><label class="mq-desl" title="A hora do sol">${ICONES.sol}`
        + `<input type="range" id="mq-sol" min="360" max="1080" step="5"><span class="valor" id="mq-hora"></span></label>`
        + `<button id="mq-sombra" class="mq-chave" title="Ligar e desligar a sombra do sol"><i></i>SOMBRA</button></div></div>
      <div class="mq-grupo"><span class="mq-tit">CORTE</span><div class="mq-linha"><label class="mq-desl" title="A altura das paredes">${ICONES.corte}`
        + `<input type="range" id="mq-paredes" min="0.8" max="3.6" step="0.1"><span class="valor" id="mq-altura"></span></label></div></div>
      <div class="mq-grupo"><span class="mq-tit">&nbsp;</span><div class="mq-linha"><button id="mq-giro" title="Movimento do celular" aria-label="Movimento do celular">${ICONES.giro}</button>`
        + `<button id="mq-cheia" title="Tela cheia" aria-label="Tela cheia">${ICONES.cheia}</button></div></div>
    </div>`;
  // Dentro da página do cliente (?embutido=1), o ✕ e o COMENTAR da página ficam nos cantos de cima: a tela cheia e o mapinha se afastam deles.
  if (new URLSearchParams(location.search).get("embutido")) document.body.classList.add("embutido");
  const camada = document.createElement("div");
  camada.innerHTML = `
    <svg id="mq-cotas" xmlns="http://www.w3.org/2000/svg"></svg><div id="mq-rotulos"></div><div id="mq-marcas"></div><div id="mq-alfinetes"></div>
    <div class="sobre esconder" id="mq-dica"></div>
    <button class="sobre" id="mq-voltar">✕ VOLTAR À MAQUETE</button>
    ${barra}
    <div class="sobre" id="mq-cartao"></div>`;
  document.body.insertBefore(camada, $("preto"));

  // ---------------------------------------------------------------- o desenho (WebGL 2)
  function programa(vs, fs) {
    const p = gl.createProgram();
    for (const [tipo, fonte] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(tipo); gl.shaderSource(s, fonte); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, "pos"); gl.bindAttribLocation(p, 1, "nor"); gl.bindAttribLocation(p, 2, "uv");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }
  const CORES = `
    vec3 linear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
    vec3 srgb(vec3 l) { l = clamp(l, 0.0, 1.0); return mix(l * 12.92, 1.055 * pow(l, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), l)); }
    vec3 filmica(vec3 x) { x = max(x, vec3(0.0)); return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }`;
  // O vértice: na caixa (a da região, ou a da peça), levado ao mundo pelo lugar da cópia (as três linhas da transformação; no modelo, a
  // identidade); a cópia espelhada inverte a frente das faces.
  const COPIA = `layout(location = 3) in vec4 l0; layout(location = 4) in vec4 l1; layout(location = 5) in vec4 l2; layout(location = 6) in float espelho;
    vec3 noMundo(vec3 p) { vec4 q = vec4(p, 1.0); return vec3(dot(l0, q), dot(l1, q), dot(l2, q)); }`;
  const VERTICE = `#version 300 es
    layout(location = 0) in vec3 pos; layout(location = 1) in vec2 nor; layout(location = 2) in vec2 uv;
    ${COPIA}
    uniform mat4 vp; uniform vec3 minimo, maximo; out vec3 mundo; out vec3 normal; out vec2 vuv; out float vespelho;
    vec3 octaedro(vec2 e) { vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y)); float t = max(-n.z, 0.0); n.x += n.x >= 0.0 ? -t : t; n.y += n.y >= 0.0 ? -t : t; return normalize(n); }
    void main() {
      mundo = noMundo(mix(minimo, maximo, pos));
      vec3 n = octaedro(nor);
      normal = normalize(vec3(dot(l0.xyz, n), dot(l1.xyz, n), dot(l2.xyz, n)));
      vuv = uv; vespelho = espelho; gl_Position = vp * vec4(mundo, 1.0);
    }`;
  // A cor de cada ponto: a do material (a cor e a imagem misturadas, vezes o Tint) vezes a luz do sol (com a sombra) e a do céu e do
  // chão em volta (pela normal); o corte das paredes (o lado de dentro visto pelo corte) escuro, como na planta.
  const modelo = programa(VERTICE, `#version 300 es
    precision highp float; precision highp sampler2DShadow;
    in vec3 mundo; in vec3 normal; in vec2 vuv; in float vespelho;
    uniform sampler2D imagem; uniform sampler2DShadow sombra; uniform mat4 luzVp, vp; uniform vec3 olho;
    uniform vec3 corBase, tint, dirSol, corSol, ceu, chao; uniform float mistura, corte, exposicao, texel, destaque;
    uniform vec4 acesa;
    uniform bool comImagem, recorte, comSombra; out vec4 cor;
    ${CORES}
    void main() {
      if (mundo.z > corte) discard;
      vec3 b = corBase;
      if (comImagem) { vec4 t = texture(imagem, vuv); if (recorte && t.a < 0.5) discard; b = mix(b, linear(t.rgb), mistura); }
      b *= tint;
      // O material aceso (o difusor da luminária, a fita de LED) brilha com a luz dele, sem o sol e sem a sombra; com imagem (o painel),
      // a imagem acesa.
      if (acesa.a > 0.0) {
        vec3 base = comImagem ? b / max(max(b.r, b.g), max(b.b, 1e-3)) : vec3(1.0);
        vec3 e = base * acesa.rgb / max(max(acesa.r, acesa.g), max(acesa.b, 1e-3)) * acesa.a;
        cor = vec4(mix(srgb(filmica(e)), vec3(0.906, 0.388, 0.325), destaque), 1.0);
        return;
      }
      // O verso com a normal virada (o Revit manda muita face em dobro, a face e o verso no mesmo lugar: com o verso escuro, a maquete
      // piscava e o pilar saía pontilhado; ÊDI). O corte das paredes é a tampa do estêncil, desenhada depois.
      bool frente = gl_FrontFacing == (vespelho > 0.0);
      vec3 n = normalize(frente ? normal : -normal);
      float ndl = dot(n, dirSol), s = 0.0;
      if (ndl > 0.0 && !comSombra) s = 1.0;
      else if (ndl > 0.0) {
        vec4 q = luzVp * vec4(mundo + n * 0.025, 1.0);
        vec3 p = q.xyz / q.w * 0.5 + 0.5;
        float vies = 0.0004 + 0.0012 * (1.0 - ndl);
        for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) s += texture(sombra, vec3(p.xy + vec2(i, j) * texel, p.z - vies));
        s /= 9.0;
        if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) s = 1.0;
      }
      vec3 luz = corSol * max(ndl, 0.0) * s + mix(chao, ceu, n.z * 0.5 + 0.5);
      vec3 v = srgb(filmica(b * luz * exposicao));
      cor = vec4(mix(v, vec3(0.906, 0.388, 0.325), destaque), 1.0);
    }`);
  // A sombra: só a profundidade, vista do sol; o que está acima do corte não faz sombra (o sol entra pelo corte, como no vídeo).
  const sombraProg = programa(VERTICE, `#version 300 es
    precision highp float; in vec3 mundo; in vec3 normal; in vec2 vuv; uniform sampler2D imagem; uniform float corte; uniform bool recorte; out vec4 cor;
    void main() { if (mundo.z > corte) discard; if (recorte && texture(imagem, vuv).a < 0.5) discard; cor = vec4(1.0); }`);
  // O vidro: quase preto, um cinza bem escuro (ÊDI, 10/10/2026: "mais preta ... não é cinza esbranquiçado"), deixando ver um pouco do que
  // está atrás, e refletindo de leve o céu (em cima) e o chão (embaixo), mais de lado.
  const vidroProg = programa(`#version 300 es
    layout(location = 0) in vec3 pos; uniform mat4 vp; uniform vec3 minimo, maximo; out vec3 mundo;
    void main() { mundo = mix(minimo, maximo, pos); gl_Position = vp * vec4(mundo, 1.0); }`,
  `#version 300 es
    precision highp float; in vec3 mundo; uniform vec3 olho, corVidro, ceu; uniform float corte, opacidade; out vec4 cor;
    void main() {
      if (mundo.z > corte) discard;
      vec3 n = normalize(cross(dFdx(mundo), dFdy(mundo))), v = normalize(mundo - olho);
      if (dot(n, v) > 0.0) n = -n;
      float lado = pow(1.0 - abs(dot(n, v)), 3.0), f = 0.06 + 0.3 * lado;
      vec3 r = reflect(v, n);
      vec3 reflexo = mix(vec3(0.1, 0.105, 0.1), pow(ceu, vec3(1.0 / 2.2)) * 0.6, smoothstep(-0.12, 0.3, r.z));
      vec3 tinta = pow(corVidro, vec3(1.0 / 2.2)) * 0.1;
      cor = vec4(mix(tinta, reflexo, f), clamp(max(opacidade, 0.8) + lado * 0.15, 0.0, 0.94));
    }`);
  // O fundo: claro e liso na maquete e na planta (como o vídeo), o céu andando.
  const fundoProg = programa(`#version 300 es
    layout(location = 0) in vec3 pos; out vec2 q; void main() { q = pos.xy; gl_Position = vec4(pos.xy, 0.9999, 1.0); }`,
  `#version 300 es
    precision highp float; in vec2 q; uniform vec3 alto, baixo; out vec4 cor;
    void main() { cor = vec4(mix(baixo, alto, q.y * 0.5 + 0.5), 1.0); }`);
  // O ambiente escolhido: a tampa dele um pouco acima do piso, em coral.
  const tampaProg = programa(`#version 300 es
    layout(location = 0) in vec3 pos; uniform mat4 vp; void main() { gl_Position = vp * vec4(pos, 1.0); }`,
  `#version 300 es
    precision highp float; uniform vec3 corT; uniform float alfa; out vec4 cor; void main() { cor = vec4(corT, alfa); }`);
  // O plano do corte (a tampa das paredes): um retângulo do tamanho do modelo, na altura do corte.
  const vaoCorte = gl.createVertexArray(); gl.bindVertexArray(vaoCorte);
  const bcorte = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bcorte);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  let alturaDoPlano = null;
  function planoDoCorte(z) {
    if (alturaDoPlano === z) return;
    alturaDoPlano = z;
    const [x0, y0, , x1, y1] = limites;
    gl.bindBuffer(gl.ARRAY_BUFFER, bcorte);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z]), gl.DYNAMIC_DRAW);
  }
  // A foto 360°: o cubo do panorama (ou dois, na passagem), pela direção; o mundo (z para cima) vai ao cubo por (x, z, -y).
  const NO_CUBO = `vec3 noCubo(vec3 d) { return vec3(d.x, d.z, -d.y); }`;
  const fotoProg = programa(`#version 300 es
    layout(location = 0) in vec3 pos; out vec2 q; void main() { q = pos.xy; gl_Position = vec4(pos.xy, 0.9999, 1.0); }`,
  `#version 300 es
    precision highp float; in vec2 q; uniform mat4 inv; uniform samplerCube a, b; uniform float mistura, alfa; out vec4 cor;
    ${NO_CUBO}
    void main() {
      vec4 p0 = inv * vec4(q, -1.0, 1.0), p1 = inv * vec4(q, 1.0, 1.0);
      vec3 d = noCubo(normalize(p1.xyz / p1.w - p0.xyz / p0.w));
      cor = vec4(mix(texture(a, d).rgb, texture(b, d).rgb, mistura), alfa);
    }`);
  const passagemProg = programa(VERTICE, `#version 300 es
    precision highp float; in vec3 mundo; in vec3 normal; in vec2 vuv;
    uniform samplerCube a, b, da, db; uniform vec3 ca, cb; uniform float mistura; out vec4 cor;
    ${NO_CUBO}
    float distancia(samplerCube t, vec3 d) { vec4 e = texture(t, d); return dot(e.rgb, vec3(1.0, 1.0 / 255.0, 1.0 / 65025.0)) * 200.0; }
    void main() {
      vec3 va = mundo - ca, vb = mundo - cb;
      float ra = length(va), rb = length(vb);
      vec3 la = noCubo(va), lb = noCubo(vb);
      float folga = 0.04 + 0.025 * max(ra, rb);
      float wa = (1.0 - mistura) * step(ra, distancia(da, la) + folga), wb = mistura * step(rb, distancia(db, lb) + folga);
      if (wa + wb < 1e-4) { wa = 1.0 - mistura; wb = mistura; }
      cor = vec4((texture(a, la).rgb * wa + texture(b, lb).rgb * wb) / (wa + wb), 1.0);
    }`);
  const distanciasProg = programa(`#version 300 es
    layout(location = 0) in vec3 pos; uniform vec3 minimo, maximo, centro; uniform mat3 face; out vec3 rel;
    ${COPIA}
    ${NO_CUBO}
    void main() {
      rel = noMundo(mix(minimo, maximo, pos)) - centro;
      vec3 c = face * noCubo(rel);
      const float perto = 0.05, longe = 200.0;
      gl_Position = vec4(c.x, c.y, c.z * (longe + perto) / (longe - perto) - 2.0 * longe * perto / (longe - perto), c.z);
    }`,
  `#version 300 es
    precision highp float; in vec3 rel; out vec4 cor;
    void main() {
      float v = clamp(length(rel) / 200.0, 0.0, 0.999);
      vec3 e = fract(v * vec3(1.0, 255.0, 65025.0));
      e -= e.yzz * vec3(1.0 / 255.0, 1.0 / 255.0, 0.0);
      cor = vec4(e, 1.0);
    }`);
  const FACES = [
    [[0, 0, -1], [0, -1, 0], [1, 0, 0]], [[0, 0, 1], [0, -1, 0], [-1, 0, 0]],
    [[1, 0, 0], [0, 0, 1], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, -1, 0]],
    [[1, 0, 0], [0, -1, 0], [0, 0, 1]], [[-1, 0, 0], [0, -1, 0], [0, 0, -1]],
  ].map(([l1, l2, l3]) => new Float32Array([l1[0], l2[0], l3[0], l1[1], l2[1], l3[1], l1[2], l2[2], l3[2]]));

  // Os buffers: o modelo (16 bytes por vértice: x, y, z em 16 bits, a normal em dois bytes, a coordenada da imagem em dois float).
  const vaoModelo = gl.createVertexArray(); gl.bindVertexArray(vaoModelo);
  const bv = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bv); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const bi = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  for (const l of [0, 1, 2]) gl.enableVertexAttribArray(l);
  // O modelo inteiro não tem cópia: a transformação é a identidade (o valor fixo dos atributos 3 a 6, fora das listas).
  gl.vertexAttrib4f(3, 1, 0, 0, 0); gl.vertexAttrib4f(4, 0, 1, 0, 0); gl.vertexAttrib4f(5, 0, 0, 1, 0); gl.vertexAttrib1f(6, 1);
  let vaoPecas = null, bpv = null, bcp = null;
  if (pecas) {
    vaoPecas = gl.createVertexArray(); gl.bindVertexArray(vaoPecas);
    bpv = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bpv); gl.bufferData(gl.ARRAY_BUFFER, verticesDasPecas, gl.STATIC_DRAW);
    const bpi = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bpi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indicesDasPecas), gl.STATIC_DRAW);
    bcp = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bcp); gl.bufferData(gl.ARRAY_BUFFER, copiasDasPecas, gl.STATIC_DRAW);
    for (const l of [0, 1, 2, 3, 4, 5, 6]) gl.enableVertexAttribArray(l);
    for (const l of [3, 4, 5, 6]) gl.vertexAttribDivisor(l, 1);
  }
  let vaoVidro = null;
  if (vidro) {
    vaoVidro = gl.createVertexArray(); gl.bindVertexArray(vaoVidro);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, vidro, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    if (emFloat) gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0); else gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, true, 6, 0);
  }
  const vaoTela = gl.createVertexArray(); gl.bindVertexArray(vaoTela);
  const bt = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bt); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const vaoTampa = gl.createVertexArray(); gl.bindVertexArray(vaoTampa);
  const btampa = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, btampa);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  let triangulosDaTampa = 0;

  // As imagens dos materiais: repetem, com todos os níveis e o filtro de lado.
  const anisotropia = gl.getExtension("EXT_texture_filter_anisotropic");
  const anis = anisotropia ? Math.min(8, gl.getParameter(anisotropia.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;
  function texturaDoMaterial(img) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    if (anis) gl.texParameterf(gl.TEXTURE_2D, anisotropia.TEXTURE_MAX_ANISOTROPY_EXT, anis);
    return t;
  }
  const branca = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, branca);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  // O brilho do material aceso pela intensidade dele (no 225, de 0,003 a 0,11): de 2 a 3,5 antes da curva de tons, perto do branco.
  const brilhoDaLuz = m => m.acesa ? [m.acesa[0], m.acesa[1], m.acesa[2], 2 + 1.5 * Math.max(0, Math.min(1, Math.log10(Math.max(1e-6, m.acesa[3]) / .003) / 1.6))] : [0, 0, 0, 0];
  const porMaterial = new Map(tour.materiais.map((m, i) => [m.id, { ...m, luz: brilhoDaLuz(m), textura: imagensDosMateriais[i] ? texturaDoMaterial(imagensDosMateriais[i]) : null }]));
  const semMaterial = { cor: [.8, .8, .8], tint: [1, 1, 1], mistura: 0, textura: null, recorte: false, luz: [0, 0, 0, 0] };

  // O desenho do modelo: os lotes (cada um com os vértices dele), com o material ou só a forma; sem a porta pela qual se passa.
  // O desempate das faces coplanares de materiais diferentes (o Revit manda o topo da travessa da pele de vidro e a peça ao lado na mesma
  // altura; andando, uma e outra ganhavam a profundidade e piscavam, "um pedaço está branco, outro está escuro", ÊDI, 10/10/2026): cada
  // material puxa a profundidade um pouco, sempre o mesmo tanto, e a mesma face ganha sempre (de 0 a 15 unidades, menos de um milímetro).
  const desempate = id => -(((id % 16) + 16) % 16);
  function desenharModelo(prog, { comMaterial = false, semPorta = -1, soOCorte = false, desempatar = false } = {}) {
    gl.bindVertexArray(vaoModelo); gl.bindBuffer(gl.ARRAY_BUFFER, bv);
    gl.uniform3fv(prog.u.minimo, cxMin); gl.uniform3fv(prog.u.maximo, cxMax);
    for (const k of tour.modelo.lotes) {
      if (k.porta >= 0 && k.porta === semPorta) continue;
      if (soOCorte && !k.corta) continue;
      if (comMaterial) {
        const m = porMaterial.get(k.material) || semMaterial;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.textura || branca);
        if (prog.u.corBase) { gl.uniform3fv(prog.u.corBase, m.cor); gl.uniform3fv(prog.u.tint, m.tint); gl.uniform1f(prog.u.mistura, m.mistura); gl.uniform1i(prog.u.comImagem, m.textura ? 1 : 0); }
        if (prog.u.acesa) gl.uniform4fv(prog.u.acesa, m.luz);
        if (desempatar) gl.polygonOffset(0, desempate(k.material));
        gl.uniform1i(prog.u.recorte, m.recorte && m.textura ? 1 : 0);
      }
      const o = k.vertice * PASSO;
      if (emFloat) gl.vertexAttribPointer(0, 3, gl.FLOAT, false, PASSO, o); else gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, true, PASSO, o);
      gl.vertexAttribPointer(1, 2, gl.BYTE, true, PASSO, o + (emFloat ? 12 : 6));
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, PASSO, o + (emFloat ? 16 : 8));
      gl.drawElements(gl.TRIANGLES, k.indices, gl.UNSIGNED_SHORT, k.indice * 2);
    }
    // As peças repetidas: cada lote uma vez para todas as cópias (a caixa da peça e as linhas de cada cópia).
    if (!pecas || soOCorte) return;
    gl.bindVertexArray(vaoPecas);
    for (const pc of pecas.lista) {
      if (comMaterial) {
        const m = porMaterial.get(pc.material) || semMaterial;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.textura || branca);
        if (prog.u.corBase) { gl.uniform3fv(prog.u.corBase, m.cor); gl.uniform3fv(prog.u.tint, m.tint); gl.uniform1f(prog.u.mistura, m.mistura); gl.uniform1i(prog.u.comImagem, m.textura ? 1 : 0); }
        if (prog.u.acesa) gl.uniform4fv(prog.u.acesa, m.luz);
        if (desempatar) gl.polygonOffset(0, desempate(pc.material));
        gl.uniform1i(prog.u.recorte, m.recorte && m.textura ? 1 : 0);
      }
      gl.uniform3fv(prog.u.minimo, pc.min); gl.uniform3fv(prog.u.maximo, pc.max);
      gl.bindBuffer(gl.ARRAY_BUFFER, bcp);
      const c0 = pc.copia * 52;
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 52, c0); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 52, c0 + 16);
      gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 52, c0 + 32); gl.vertexAttribPointer(6, 1, gl.FLOAT, false, 52, c0 + 48);
      gl.bindBuffer(gl.ARRAY_BUFFER, bpv);
      for (const k of pc.lotes) {
        gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, true, 16, k.vertice * 16);
        gl.vertexAttribPointer(1, 2, gl.BYTE, true, 16, k.vertice * 16 + 6);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 16, k.vertice * 16 + 8);
        gl.drawElementsInstanced(gl.TRIANGLES, k.indices, gl.UNSIGNED_SHORT, k.indice * 2, pc.copias);
      }
    }
    gl.uniform3fv(prog.u.minimo, cxMin); gl.uniform3fv(prog.u.maximo, cxMax);
  }

  // ---------------------------------------------------------------- as contas
  const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const ponto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = a => { const c = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / c, a[1] / c, a[2] / c]; };
  const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  function olharPara(olho, frente, cima = [0, 0, 1]) {
    const f = unit(frente);
    if (Math.abs(ponto(f, cima)) > .999) cima = [0, 1, 0];
    const d = unit(cruz(f, cima)), c = cruz(d, f);
    return [d[0], c[0], -f[0], 0, d[1], c[1], -f[1], 0, d[2], c[2], -f[2], 0, -ponto(d, olho), -ponto(c, olho), ponto(f, olho), 1];
  }
  function perspectiva(vertical, aspecto, perto, longe) {
    const f = 1 / Math.tan(vertical * rad / 2);
    return [f / aspecto, 0, 0, 0, 0, f, 0, 0, 0, 0, (longe + perto) / (perto - longe), -1, 0, 0, 2 * longe * perto / (perto - longe), 0];
  }
  const ortografica = (l, r, b, t, n, f) => [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1];
  function multiplicar(a, b) {
    const r = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) r[c * 4 + l] += a[k * 4 + l] * b[c * 4 + k];
    return r;
  }
  const aplicar = (m, p) => [0, 1, 2, 3].map(l => m[l] * p[0] + m[4 + l] * p[1] + m[8 + l] * p[2] + m[12 + l] * (p[3] ?? 1));
  function inverter(s) {
    const inv = new Array(16);
    inv[0] = s[5]*s[10]*s[15]-s[5]*s[11]*s[14]-s[9]*s[6]*s[15]+s[9]*s[7]*s[14]+s[13]*s[6]*s[11]-s[13]*s[7]*s[10];
    inv[4] = -s[4]*s[10]*s[15]+s[4]*s[11]*s[14]+s[8]*s[6]*s[15]-s[8]*s[7]*s[14]-s[12]*s[6]*s[11]+s[12]*s[7]*s[10];
    inv[8] = s[4]*s[9]*s[15]-s[4]*s[11]*s[13]-s[8]*s[5]*s[15]+s[8]*s[7]*s[13]+s[12]*s[5]*s[11]-s[12]*s[7]*s[9];
    inv[12] = -s[4]*s[9]*s[14]+s[4]*s[10]*s[13]+s[8]*s[5]*s[14]-s[8]*s[6]*s[13]-s[12]*s[5]*s[10]+s[12]*s[6]*s[9];
    inv[1] = -s[1]*s[10]*s[15]+s[1]*s[11]*s[14]+s[9]*s[2]*s[15]-s[9]*s[3]*s[14]-s[13]*s[2]*s[11]+s[13]*s[3]*s[10];
    inv[5] = s[0]*s[10]*s[15]-s[0]*s[11]*s[14]-s[8]*s[2]*s[15]+s[8]*s[3]*s[14]+s[12]*s[2]*s[11]-s[12]*s[3]*s[10];
    inv[9] = -s[0]*s[9]*s[15]+s[0]*s[11]*s[13]+s[8]*s[1]*s[15]-s[8]*s[3]*s[13]-s[12]*s[1]*s[11]+s[12]*s[3]*s[9];
    inv[13] = s[0]*s[9]*s[14]-s[0]*s[10]*s[13]-s[8]*s[1]*s[14]+s[8]*s[2]*s[13]+s[12]*s[1]*s[10]-s[12]*s[2]*s[9];
    inv[2] = s[1]*s[6]*s[15]-s[1]*s[7]*s[14]-s[5]*s[2]*s[15]+s[5]*s[3]*s[14]+s[13]*s[2]*s[7]-s[13]*s[3]*s[6];
    inv[6] = -s[0]*s[6]*s[15]+s[0]*s[7]*s[14]+s[4]*s[2]*s[15]-s[4]*s[3]*s[14]-s[12]*s[2]*s[7]+s[12]*s[3]*s[6];
    inv[10] = s[0]*s[5]*s[15]-s[0]*s[7]*s[13]-s[4]*s[1]*s[15]+s[4]*s[3]*s[13]+s[12]*s[1]*s[7]-s[12]*s[3]*s[5];
    inv[14] = -s[0]*s[5]*s[14]+s[0]*s[6]*s[13]+s[4]*s[1]*s[14]-s[4]*s[2]*s[13]-s[12]*s[1]*s[6]+s[12]*s[2]*s[5];
    inv[3] = -s[1]*s[6]*s[11]+s[1]*s[7]*s[10]+s[5]*s[2]*s[11]-s[5]*s[3]*s[10]-s[9]*s[2]*s[7]+s[9]*s[3]*s[6];
    inv[7] = s[0]*s[6]*s[11]-s[0]*s[7]*s[10]-s[4]*s[2]*s[11]+s[4]*s[3]*s[10]+s[8]*s[2]*s[7]-s[8]*s[3]*s[6];
    inv[11] = -s[0]*s[5]*s[11]+s[0]*s[7]*s[9]+s[4]*s[1]*s[11]-s[4]*s[3]*s[9]-s[8]*s[1]*s[7]+s[8]*s[3]*s[5];
    inv[15] = s[0]*s[5]*s[10]-s[0]*s[6]*s[9]-s[4]*s[1]*s[10]+s[4]*s[2]*s[9]+s[8]*s[1]*s[6]-s[8]*s[2]*s[5];
    const det = s[0] * inv[0] + s[1] * inv[4] + s[2] * inv[8] + s[3] * inv[12];
    return inv.map(v => v / det);
  }
  const suave = s => s * s * (3 - 2 * s);
  const voltaDe = (de, para) => Math.atan2(Math.sin(para - de), Math.cos(para - de));
  const m2 = v => v.toFixed(2).replace(".", ",");
  // O campo da planta: o tamanho da vista chapada é o que a perspectiva de 32° tinha no ponto olhado.
  const CAMPO_DA_PLANTA = 32;

  // ---------------------------------------------------------------- o sol e a sombra
  const LADO_SOMBRA = toque ? 2048 : 4096;
  const sombraTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sombraTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, LADO_SOMBRA, LADO_SOMBRA);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const quadroSombra = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, quadroSombra);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, sombraTex, 0);
  const corDaSombra = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, corDaSombra);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.R8, LADO_SOMBRA, LADO_SOMBRA);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, corDaSombra);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const sol = { minutos: 600, dir: [0, 0, 1], cor: [1, 1, 1], luzVp: null, corteDaSombra: null, minutosDaSombra: null };
  {
    const h = tour.sol.hora;
    sol.minutos = h >= 7 && h <= 17 ? Math.round(h * 60 / 5) * 5 : 600;
  }
  function direcaoDoSol(minutos) {
    const tab = tour.sol.direcoes, h = minutos / 60;
    let i = 0; while (i < tab.length - 2 && tab[i + 1][0] < h) i++;
    const a = tab[i], b = tab[i + 1], f = Math.max(0, Math.min(1, (h - a[0]) / ((b[0] - a[0]) || 1)));
    return unit([a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f]);
  }
  function luzDoSol() {
    const d = direcaoDoSol(sol.minutos);
    sol.dir = d;
    const alto = Math.max(0, Math.min(1, d[2] / .35)), forca = 2.1 * suave(Math.max(0, Math.min(1, d[2] / .12)));
    const quente = [1, .62, .38], branco = [1, .96, .9];
    sol.cor = quente.map((q, k) => (q + (branco[k] - q) * alto) * forca);
  }
  // A caixa da região até o corte, vista do sol, e o mapa da profundidade (refeito quando o sol ou o corte mudam).
  function fazerSombra(corte) {
    const s = sol.dir;
    const topo = Math.min(regMax[2], corte), c = [(regMin[0] + regMax[0]) / 2, (regMin[1] + regMax[1]) / 2, (regMin[2] + topo) / 2];
    const raio = distancia(regMin, regMax);
    const olho = c.map((v, k) => v + s[k] * raio);
    const vista = olharPara(olho, s.map(v => -v));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = aplicar(vista, [i & 1 ? regMax[0] : regMin[0], i & 2 ? regMax[1] : regMin[1], i & 4 ? topo : regMin[2], 1]);
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]);
    }
    sol.luzVp = multiplicar(ortografica(x0, x1, y0, y1, -z1 - 1, -z0 + 1), vista);
    gl.bindFramebuffer(gl.FRAMEBUFFER, quadroSombra);
    gl.viewport(0, 0, LADO_SOMBRA, LADO_SOMBRA);
    gl.clearColor(1, 1, 1, 1); gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
    gl.useProgram(sombraProg.p);
    gl.uniformMatrix4fv(sombraProg.u.vp, false, sol.luzVp); gl.uniform3fv(sombraProg.u.minimo, regMin); gl.uniform3fv(sombraProg.u.maximo, regMax);
    gl.uniform1f(sombraProg.u.corte, corte); gl.uniform1i(sombraProg.u.imagem, 0);
    desenharModelo(sombraProg, { comMaterial: true });
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    sol.corteDaSombra = corte; sol.minutosDaSombra = sol.minutos;
  }

  // ---------------------------------------------------------------- a sombra de contato da PLANTA
  // A planta humanizada com a sombra suave em volta dos móveis e nos cantos das paredes, para dar profundidade e separar o móvel do chão
  // (ÊDI, 11/10/2026, pelas plantas humanizadas de referência). Vista de cima, a planta é um mapa de alturas: cada ponto escurece pelo
  // que está mais alto em volta dele (a parede cortada, a mesa, a cadeira), um pouco mais do lado de onde o sol não vem. O mapa é feito
  // uma vez por pavimento, altura do corte e hora do sol, visto de cima sobre os ambientes do pavimento, e a planta só o lê: andar e
  // girar não custam nada a mais.
  const LADO_CONTATO = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), toque ? 2048 : 3072);
  const contato = { chaveAlturas: "", chave: "", caixa: null, topo: 0, fundo: 1, largura: 0, altura: 0, pronto: false };
  const alturasTex = gl.createTexture(), contatoA = gl.createTexture(), contatoB = gl.createTexture();
  const quadroAlturas = gl.createFramebuffer(), quadroA = gl.createFramebuffer(), quadroB = gl.createFramebuffer();
  function texturaDoContato(t, formato, filtro) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, formato, LADO_CONTATO, LADO_CONTATO);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  texturaDoContato(alturasTex, gl.DEPTH24_STENCIL8, gl.NEAREST);
  texturaDoContato(contatoA, gl.R8, gl.LINEAR); texturaDoContato(contatoB, gl.R8, gl.LINEAR);
  gl.bindFramebuffer(gl.FRAMEBUFFER, quadroAlturas);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, alturasTex, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, contatoB, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, quadroA); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, contatoA, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, quadroB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, contatoB, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // A altura de cada ponto do mapa: a profundidade vista de cima, do topo para baixo (o vazio fica em 1).
  const ALTURAS = `uniform highp sampler2D alturas; uniform float topo, fundo; uniform ivec2 tamanho;
    float alturaEm(ivec2 s) { float d = texelFetch(alturas, clamp(s, ivec2(0), tamanho - 1), 0).r; return d >= 1.0 ? -1e9 : topo - d * fundo; }`;
  // O quanto cada ponto fica encoberto: o que está mais alto num disco de 40 cm em volta (o centro do disco um pouco para o lado do sol), pesando
  // mais o perto e o alto; a rotação das amostras muda de ponto a ponto e o borrão depois a alisa.
  const contatoProg = programa(`#version 300 es
    layout(location = 0) in vec3 pos; void main() { gl_Position = vec4(pos.xy, 0.0, 1.0); }`,
  `#version 300 es
    precision highp float; out vec4 cor;
    ${ALTURAS}
    uniform float metro, raio, forca; uniform vec2 desvio;
    void main() {
      ivec2 p = ivec2(gl_FragCoord.xy);
      float h0 = alturaEm(p);
      if (h0 < -1e8) { cor = vec4(1.0); return; }
      float giro = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec2 centro = gl_FragCoord.xy + desvio * metro;
      float soma = 0.0, pesos = 0.0;
      for (int i = 0; i < 24; i++) {
        float f = (float(i) + 0.5) / 24.0, r = raio * sqrt(f), a = giro + float(i) * 2.3999632;
        vec2 s = centro + vec2(cos(a), sin(a)) * r * metro;
        float dh = alturaEm(ivec2(s)) - h0 - 0.03;
        float w = 1.0 - f;
        pesos += w;
        if (dh > 0.0) soma += w * dh / (dh + r + 0.05);
      }
      cor = vec4(vec3(1.0 - forca * soma / pesos), 1.0);
    }`);
  // O borrão em duas passadas (deitado e em pé), só entre pontos da mesma altura: a sombra não passa do chão para o tampo da mesa.
  const borraoProg = programa(`#version 300 es
    layout(location = 0) in vec3 pos; void main() { gl_Position = vec4(pos.xy, 0.0, 1.0); }`,
  `#version 300 es
    precision highp float; out vec4 cor;
    ${ALTURAS}
    uniform sampler2D origem; uniform ivec2 passo;
    void main() {
      ivec2 p = ivec2(gl_FragCoord.xy);
      float h0 = alturaEm(p), soma = 0.0, pesos = 0.0;
      for (int i = -4; i <= 4; i++) {
        ivec2 s = clamp(p + passo * i, ivec2(0), tamanho - 1);
        float w = exp(-float(i * i) / 8.0) * step(abs(alturaEm(s) - h0), 0.05);
        soma += w * texelFetch(origem, s, 0).r; pesos += w;
      }
      cor = vec4(vec3(soma / max(pesos, 1e-4)), 1.0);
    }`);
  // Na planta, o mapa por cima do que foi desenhado, multiplicando: um retângulo do tamanho do mapa, levado à tela como o modelo.
  const contatoNaTela = programa(`#version 300 es
    layout(location = 0) in vec3 pos; uniform mat4 vp; uniform vec4 caixa; out vec2 uv;
    void main() { uv = (pos.xy - caixa.xy) / (caixa.zw - caixa.xy); gl_Position = vp * vec4(pos, 1.0); }`,
  `#version 300 es
    precision highp float; in vec2 uv; uniform sampler2D mapa; out vec4 cor;
    void main() { cor = vec4(vec3(texture(mapa, uv).r), 1.0); }`);
  const vaoContato = gl.createVertexArray(); gl.bindVertexArray(vaoContato);
  const bcontato = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bcontato);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  // A caixa do mapa: os ambientes do pavimento com 6 m em volta, dentro do modelo (sem ambiente, o modelo).
  function caixaDoContato() {
    const [lx0, ly0, , lx1, ly1] = limites;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const a of ambDoPav()) for (let k = 0; k < a.contorno.length; k += 2) { x0 = Math.min(x0, a.contorno[k]); x1 = Math.max(x1, a.contorno[k]); y0 = Math.min(y0, a.contorno[k + 1]); y1 = Math.max(y1, a.contorno[k + 1]); }
    if (!isFinite(x0)) return [lx0, ly0, lx1, ly1];
    return [Math.max(lx0, x0 - 6), Math.max(ly0, y0 - 6), Math.min(lx1, x1 + 6), Math.min(ly1, y1 + 6)];
  }
  function fazerContato(c) {
    const caixa = caixaDoContato();
    const [x0, y0, x1, y1] = caixa, lado = Math.max(x1 - x0, y1 - y0);
    if (!(lado > 0)) { contato.pronto = false; return; }
    const metro = LADO_CONTATO / lado;   // pontos do mapa por metro
    const largura = Math.max(1, Math.round((x1 - x0) * metro)), altura = Math.max(1, Math.round((y1 - y0) * metro));
    const topo = Math.min(c, regMax[2]) + 1, fundo = topo - regMin[2] + 1;
    const chaveAlturas = [est.pav, c.toFixed(3), caixa.map(v => v.toFixed(2)).join()].join("|");
    // As alturas: o modelo até o corte visto de cima, e a tampa do corte das paredes na altura do corte (como na tela).
    if (chaveAlturas !== contato.chaveAlturas) {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const vista = olharPara([cx, cy, topo], [0, 0, -1], [0, 1, 0]);
      const vp = multiplicar(ortografica(x0 - cx, x0 - cx + largura / metro, y0 - cy, y0 - cy + altura / metro, 0, fundo), vista);
      gl.bindFramebuffer(gl.FRAMEBUFFER, quadroAlturas);
      gl.viewport(0, 0, largura, altura);
      gl.clearColor(1, 1, 1, 1); gl.clearDepth(1); gl.clearStencil(0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
      gl.useProgram(sombraProg.p);
      gl.uniformMatrix4fv(sombraProg.u.vp, false, vp); gl.uniform1f(sombraProg.u.corte, c); gl.uniform1i(sombraProg.u.imagem, 0);
      desenharModelo(sombraProg, { comMaterial: true });
      if (c < 1e8 && tour.modelo.lotes.some(k => k.corta)) {
        gl.enable(gl.STENCIL_TEST);
        gl.colorMask(false, false, false, false); gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
        gl.stencilFunc(gl.ALWAYS, 0, 0xff);
        gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
        gl.uniform1i(sombraProg.u.recorte, 0);
        desenharModelo(sombraProg, { soOCorte: true });
        gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
        gl.stencilFunc(gl.NOTEQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        planoDoCorte(c);
        gl.useProgram(tampaProg.p); gl.bindVertexArray(vaoCorte);
        gl.uniformMatrix4fv(tampaProg.u.vp, false, vp); gl.uniform3fv(tampaProg.u.corT, [1, 1, 1]); gl.uniform1f(tampaProg.u.alfa, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.colorMask(true, true, true, true); gl.disable(gl.STENCIL_TEST);
      }
      contato.chaveAlturas = chaveAlturas; contato.chave = "";
    }
    // O encobrimento e o borrão; o desvio leva o centro do disco para o lado do sol (a sombra cai do outro lado), mais com o sol baixo.
    const s = sol.dir, h = Math.hypot(s[0], s[1]) || 1, m = Math.min(.1, .035 * h / Math.max(s[2], .25));
    const chave = chaveAlturas + "|" + m.toFixed(3) + "|" + (s[0] / h).toFixed(2) + "|" + (s[1] / h).toFixed(2);
    if (chave !== contato.chave) {
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.viewport(0, 0, largura, altura);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, alturasTex);
      gl.bindVertexArray(vaoTela);
      gl.bindFramebuffer(gl.FRAMEBUFFER, quadroA);
      gl.useProgram(contatoProg.p);
      gl.uniform1i(contatoProg.u.alturas, 2); gl.uniform1f(contatoProg.u.topo, topo); gl.uniform1f(contatoProg.u.fundo, fundo);
      gl.uniform2i(contatoProg.u.tamanho, largura, altura); gl.uniform1f(contatoProg.u.metro, metro);
      gl.uniform1f(contatoProg.u.raio, .4); gl.uniform1f(contatoProg.u.forca, .62); gl.uniform2f(contatoProg.u.desvio, s[0] / h * m, s[1] / h * m);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(borraoProg.p);
      gl.uniform1i(borraoProg.u.alturas, 2); gl.uniform1f(borraoProg.u.topo, topo); gl.uniform1f(borraoProg.u.fundo, fundo);
      gl.uniform2i(borraoProg.u.tamanho, largura, altura); gl.uniform1i(borraoProg.u.origem, 3);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, quadroB); gl.bindTexture(gl.TEXTURE_2D, contatoA); gl.uniform2i(borraoProg.u.passo, 2, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, quadroA); gl.bindTexture(gl.TEXTURE_2D, contatoB); gl.uniform2i(borraoProg.u.passo, 0, 2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
      contato.chave = chave;
      // O retângulo do mapa na tela.
      const xa = x0 + largura / metro, ya = y0 + altura / metro, z = doPav().z;
      gl.bindBuffer(gl.ARRAY_BUFFER, bcontato);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, z, xa, y0, z, xa, ya, z, x0, y0, z, xa, ya, z, x0, ya, z]), gl.DYNAMIC_DRAW);
      // A textura do mapa por inteiro, de lado a lado (o mapa ocupa só o canto dela do tamanho da caixa).
      contato.caixa = [x0, y0, x0 + LADO_CONTATO / metro, y0 + LADO_CONTATO / metro];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    contato.pronto = true;
  }
  function desenharContato(vp) {
    if (!contato.pronto) return;
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    gl.useProgram(contatoNaTela.p); gl.bindVertexArray(vaoContato);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, contatoA);
    gl.uniformMatrix4fv(contatoNaTela.u.vp, false, vp); gl.uniform4fv(contatoNaTela.u.caixa, contato.caixa); gl.uniform1i(contatoNaTela.u.mapa, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
  }

  // ---------------------------------------------------------------- a sombra ambiente da maquete e de quem anda
  // Como a sombra ambiente do Revit (ÊDI, 11/10/2026: "os objetos no geral deveriam ter essas sombrazinhas para criar esse volume"): o
  // que encosta em alguma coisa escurece de leve — a cadeira no piso, o tampo sobre a base, o encontro da parede com o teto. O modelo é
  // desenhado num quadro nosso, suavizado (4 amostras), e a profundidade dele é copiada para uma imagem que a sombra lê: cada ponto olha
  // em volta, num disco de 45 cm no mundo, quanto do que está perto sobe na frente dele (pela normal), borra só entre pontos da mesma
  // distância e multiplica a cor; o quadro pronto vai para a tela no fim. Na PLANTA, a sombra de contato acima faz o mesmo papel.
  const AMOSTRAS_DA_TELA = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
  const ESCALA_AMBIENTE = toque ? 2 : 1;   // no celular, a sombra em meia resolução
  const telaQ = { quadro: null, largura: 0, altura: 0, cor: null, prof: null, profTex: null, quadroProf: null,
    aoA: null, aoB: null, quadroAoA: null, quadroAoB: null, aoL: 0, aoH: 0, pronta: null, quadroPronta: null,
    raio: 1, forca: 2.2, soASombra: false };
  function prepararQuadroDaTela() {
    const w = tela.width, h = tela.height;
    if (telaQ.largura === w && telaQ.altura === h) return telaQ.quadro;
    for (const r of [telaQ.cor, telaQ.prof]) if (r) gl.deleteRenderbuffer(r);
    for (const x of [telaQ.profTex, telaQ.aoA, telaQ.aoB, telaQ.pronta]) if (x) gl.deleteTexture(x);
    for (const f of [telaQ.quadro, telaQ.quadroProf, telaQ.quadroAoA, telaQ.quadroAoB, telaQ.quadroPronta]) if (f) gl.deleteFramebuffer(f);
    Object.assign(telaQ, { largura: w, altura: h, quadro: null });
    const quadro = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, quadro);
    telaQ.cor = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, telaQ.cor);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, AMOSTRAS_DA_TELA, gl.RGBA8, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, telaQ.cor);
    telaQ.prof = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, telaQ.prof);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, AMOSTRAS_DA_TELA, gl.DEPTH24_STENCIL8, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, telaQ.prof);
    const completo = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    // A profundidade copiada (a imagem que a sombra lê) e as duas da sombra (a conta e o borrão).
    const textura = (formato, l, a, filtro) => {
      const x = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, x); gl.texStorage2D(gl.TEXTURE_2D, 1, formato, l, a);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return x;
    };
    telaQ.profTex = textura(gl.DEPTH24_STENCIL8, w, h, gl.NEAREST);
    telaQ.quadroProf = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, telaQ.quadroProf);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, telaQ.profTex, 0);
    telaQ.aoL = Math.ceil(w / ESCALA_AMBIENTE); telaQ.aoH = Math.ceil(h / ESCALA_AMBIENTE);
    telaQ.aoA = textura(gl.R8, telaQ.aoL, telaQ.aoH, gl.LINEAR); telaQ.aoB = textura(gl.R8, telaQ.aoL, telaQ.aoH, gl.LINEAR);
    telaQ.quadroAoA = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, telaQ.quadroAoA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, telaQ.aoA, 0);
    telaQ.quadroAoB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, telaQ.quadroAoB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, telaQ.aoB, 0);
    // A imagem pronta, sem as amostras (a tela da página pode já ser suavizada, e um quadro suavizado não se copia para outro): é
    // desenhada na tela no fim.
    telaQ.pronta = textura(gl.RGBA8, w, h, gl.NEAREST);
    telaQ.quadroPronta = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, telaQ.quadroPronta);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, telaQ.pronta, 0);
    gl.bindTexture(gl.TEXTURE_2D, null); gl.bindRenderbuffer(gl.RENDERBUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // Sem o quadro (a placa recusou), o desenho vai direto para a tela, sem a sombra ambiente.
    telaQ.quadro = completo && AMOSTRAS_DA_TELA > 0 ? quadro : null;
    if (!telaQ.quadro) gl.deleteFramebuffer(quadro);
    return telaQ.quadro;
  }
  // A distância de cada ponto e a posição dele vista da câmera, pela profundidade copiada.
  const PROFUNDIDADE = `uniform highp sampler2D prof; uniform vec2 tamanho; uniform float perto, longe, p00, p11;
    float distanciaEm(vec2 px) {
      float d = texelFetch(prof, ivec2(clamp(px, vec2(0.0), tamanho - 1.0)), 0).r;
      return d >= 1.0 ? -1.0 : 2.0 * perto * longe / (longe + perto - (2.0 * d - 1.0) * (longe - perto));
    }
    vec3 posicaoEm(vec2 px) {
      float p = distanciaEm(px); vec2 ndc = (floor(px) + 0.5) / tamanho * 2.0 - 1.0;
      return vec3(ndc.x * p / p00, ndc.y * p / p11, -p);
    }`;
  const ambienteProg = programa(`#version 300 es
    layout(location = 0) in vec3 pos; void main() { gl_Position = vec4(pos.xy, 0.0, 1.0); }`,
  `#version 300 es
    precision highp float; out vec4 cor;
    ${PROFUNDIDADE}
    uniform float escala, raio, forca;
    void main() {
      vec2 c = floor(gl_FragCoord.xy * escala);
      if (distanciaEm(c) < 0.0) { cor = vec4(1.0); return; }
      vec3 p = posicaoEm(c);
      // A normal pelos vizinhos, do lado que não atravessa a borda do objeto.
      vec3 dr = posicaoEm(c + vec2(1.0, 0.0)) - p, dl = p - posicaoEm(c - vec2(1.0, 0.0));
      vec3 du = posicaoEm(c + vec2(0.0, 1.0)) - p, dd = p - posicaoEm(c - vec2(0.0, 1.0));
      vec3 n = normalize(cross(abs(dr.z) < abs(dl.z) ? dr : dl, abs(du.z) < abs(dd.z) ? du : dd));
      float raioPx = min(raio * p11 * tamanho.y * 0.5 / -p.z, tamanho.y * 0.12);
      if (raioPx < 1.5) { cor = vec4(1.0); return; }
      float giro = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float soma = 0.0;
      for (int i = 0; i < 12; i++) {
        float a = (float(i) + 0.5) / 12.0, ang = giro + float(i) * 2.3999632;
        vec2 s = c + vec2(cos(ang), sin(ang)) * a * raioPx;
        if (s.x < 0.0 || s.y < 0.0 || s.x >= tamanho.x || s.y >= tamanho.y || distanciaEm(s) < 0.0) continue;
        vec3 v = posicaoEm(s) - p;
        float vv = dot(v, v), queda = max(0.0, 1.0 - vv / (raio * raio));
        soma += queda * max(0.0, dot(v, n) * inversesqrt(vv + 1e-6) - 0.12);
      }
      cor = vec4(vec3(clamp(1.0 - forca * soma / 12.0, 0.0, 1.0)), 1.0);
    }`);
  const borraoAmbienteProg = programa(`#version 300 es
    layout(location = 0) in vec3 pos; void main() { gl_Position = vec4(pos.xy, 0.0, 1.0); }`,
  `#version 300 es
    precision highp float; out vec4 cor;
    ${PROFUNDIDADE}
    uniform sampler2D origem; uniform vec2 passo; uniform float escala; uniform vec2 tamanhoAo;
    void main() {
      vec2 c = floor(gl_FragCoord.xy), cc = c * escala;
      if (distanciaEm(cc) < 0.0) { cor = vec4(1.0); return; }
      // Só entre pontos do mesmo plano: pela distância ao plano do ponto (pela normal), não pela distância à câmera, que muda muito de
      // um ponto ao vizinho na parede vista de lado (ali o borrão recusava tudo e o granulado ficava; ÊDI, 11/10/2026, no portão do 225).
      vec3 p0 = posicaoEm(cc);
      vec3 dr = posicaoEm(cc + vec2(1.0, 0.0)) - p0, dl = p0 - posicaoEm(cc - vec2(1.0, 0.0));
      vec3 du = posicaoEm(cc + vec2(0.0, 1.0)) - p0, dd = p0 - posicaoEm(cc - vec2(0.0, 1.0));
      vec3 n0 = normalize(cross(abs(dr.z) < abs(dl.z) ? dr : dl, abs(du.z) < abs(dd.z) ? du : dd));
      float folga = 0.015 + 0.004 * -p0.z, soma = 0.0, pesos = 0.0;
      for (int i = -6; i <= 6; i++) {
        vec2 s = clamp(c + passo * float(i), vec2(0.0), tamanhoAo - 1.0);
        if (distanciaEm(s * escala) < 0.0) continue;
        float w = exp(-float(i * i) / 18.0) * max(0.0, 1.0 - abs(dot(posicaoEm(s * escala) - p0, n0)) / folga);
        soma += w * texelFetch(origem, ivec2(s), 0).r; pesos += w;
      }
      cor = vec4(vec3(pesos > 1e-4 ? soma / pesos : 1.0), 1.0);
    }`);
  const ambienteNaTela = programa(`#version 300 es
    layout(location = 0) in vec3 pos; void main() { gl_Position = vec4(pos.xy, 0.0, 1.0); }`,
  `#version 300 es
    precision highp float; uniform sampler2D mapa; uniform vec2 tamanho; out vec4 cor;
    void main() { cor = vec4(vec3(texture(mapa, gl_FragCoord.xy / tamanho).r), 1.0); }`);
  const prontaNaTela = programa(`#version 300 es
    layout(location = 0) in vec3 pos; void main() { gl_Position = vec4(pos.xy, 0.0, 1.0); }`,
  `#version 300 es
    precision highp float; uniform sampler2D pronta; out vec4 cor;
    void main() { cor = vec4(texelFetch(pronta, ivec2(gl_FragCoord.xy), 0).rgb, 1.0); }`);
  // O quadro pronto na tela: as amostras juntadas na imagem pronta e ela desenhada na tela, opaca.
  function quadroNaTela() {
    const w = telaQ.largura, h = telaQ.altura;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, telaQ.quadro); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, telaQ.quadroPronta);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST);
    gl.useProgram(prontaNaTela.p); gl.bindVertexArray(vaoTela);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, telaQ.pronta); gl.uniform1i(prontaNaTela.u.pronta, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); gl.enable(gl.DEPTH_TEST);
  }
  function desenharSombraAmbiente(perto, longe, vertical) {
    if (!telaQ.quadro || telaQ.semSombraAmbiente) return;
    const w = telaQ.largura, h = telaQ.altura, p11 = 1 / Math.tan(vertical * rad / 2), p00 = p11 / aspecto;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, telaQ.quadro); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, telaQ.quadroProf);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST);
    gl.bindVertexArray(vaoTela);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, telaQ.profTex);
    const comum = prog => {
      gl.useProgram(prog.p);
      gl.uniform1i(prog.u.prof, 2); gl.uniform2f(prog.u.tamanho, w, h);
      gl.uniform1f(prog.u.perto, perto); gl.uniform1f(prog.u.longe, longe); gl.uniform1f(prog.u.p00, p00); gl.uniform1f(prog.u.p11, p11);
      gl.uniform1f(prog.u.escala, ESCALA_AMBIENTE);
    };
    gl.viewport(0, 0, telaQ.aoL, telaQ.aoH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, telaQ.quadroAoA);
    comum(ambienteProg); gl.uniform1f(ambienteProg.u.raio, telaQ.raio); gl.uniform1f(ambienteProg.u.forca, telaQ.forca);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    comum(borraoAmbienteProg); gl.uniform1i(borraoAmbienteProg.u.origem, 3); gl.uniform2f(borraoAmbienteProg.u.tamanhoAo, telaQ.aoL, telaQ.aoH);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, telaQ.quadroAoB); gl.bindTexture(gl.TEXTURE_2D, telaQ.aoA); gl.uniform2f(borraoAmbienteProg.u.passo, 1, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, telaQ.quadroAoA); gl.bindTexture(gl.TEXTURE_2D, telaQ.aoB); gl.uniform2f(borraoAmbienteProg.u.passo, 0, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // A sombra multiplicando o que já está no quadro.
    gl.bindFramebuffer(gl.FRAMEBUFFER, telaQ.quadro); gl.viewport(0, 0, w, h);
    if (!telaQ.soASombra) { gl.enable(gl.BLEND); gl.blendFunc(gl.DST_COLOR, gl.ZERO); }
    gl.useProgram(ambienteNaTela.p); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, telaQ.aoA);
    gl.uniform1i(ambienteNaTela.u.mapa, 3); gl.uniform2f(ambienteNaTela.u.tamanho, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
  }

  // ---------------------------------------------------------------- as fotos 360° (os panoramas do EXPORTAR)
  const ladoDaFoto = toque ? tour.lados.celular : tour.lados.inteira;
  const facesDe = (i, l) => [0, 1, 2, 3, 4, 5].map(f => `${pans[i].arquivo}-${l}-${f}.jpg`);
  function cubo(imagens) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
    imagens.forEach((img, f) => gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img));
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_CUBE_MAP, k, gl.CLAMP_TO_EDGE);
    if (anis) gl.texParameterf(gl.TEXTURE_CUBE_MAP, anisotropia.TEXTURE_MAX_ANISOTROPY_EXT, anis);
    return t;
  }
  const previas = new Map(), inteiros = new Map(), baixando = new Map(), guardados = new Map();
  async function previaDe(i) {
    if (previas.has(i)) return previas.get(i);
    const tira = await imagemDe(await baixar(`${pans[i].arquivo}-previa.jpg`, false), "image/jpeg");
    const l = tour.lados.previa;
    const t = cubo(await Promise.all([0, 1, 2, 3, 4, 5].map(f => createImageBitmap(tira, f * l, 0, l, l))));
    previas.set(i, t);
    return t;
  }
  function baixarInteiro(i) {
    if (guardados.has(i)) return Promise.resolve(guardados.get(i));
    if (!baixando.has(i)) baixando.set(i, Promise.all(facesDe(i, ladoDaFoto).map(n => baixar(n, false))).then(b => { guardados.set(i, b); baixando.delete(i); return b; }));
    return baixando.get(i);
  }
  async function garantirInteiro(i) {
    if (inteiros.has(i)) return;
    const imagens = await Promise.all((await baixarInteiro(i)).map(b => imagemDe(b, "image/jpeg")));
    if (inteiros.has(i)) return;
    inteiros.set(i, cubo(imagens));
    imagens.forEach(b => b.close && b.close());
    while (inteiros.size > 3) { const [k, t] = inteiros.entries().next().value; if (k === foto.atual || k === foto.destino) { inteiros.delete(k); inteiros.set(k, t); continue; } gl.deleteTexture(t); inteiros.delete(k); }
  }
  const cuboDaFoto = i => inteiros.get(i) || previas.get(i);
  const DIST = 512;
  const cubosDistancia = new Map();
  const profundidade = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, profundidade); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, DIST, DIST);
  const quadroDist = gl.createFramebuffer();
  function cuboDistancia(i) {
    if (cubosDistancia.has(i)) return cubosDistancia.get(i);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
    for (let f = 0; f < 6; f++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA, DIST, DIST, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, k, v);
    gl.bindFramebuffer(gl.FRAMEBUFFER, quadroDist);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, profundidade);
    gl.viewport(0, 0, DIST, DIST);
    gl.useProgram(distanciasProg.p);
    gl.uniform3fv(distanciasProg.u.minimo, regMin); gl.uniform3fv(distanciasProg.u.maximo, regMax); gl.uniform3fv(distanciasProg.u.centro, pans[i].olho);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    for (let f = 0; f < 6; f++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, t, 0);
      gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix3fv(distanciasProg.u.face, false, FACES[f]);
      desenharModelo(distanciasProg);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    cubosDistancia.set(i, t);
    while (cubosDistancia.size > 6) { const [k, v] = cubosDistancia.entries().next().value; gl.deleteTexture(v); cubosDistancia.delete(k); }
    return t;
  }

  // ---------------------------------------------------------------- o estado: o modo, o pavimento, o corte e as câmeras
  // A sombra do sol começa ligada; o botão SOMBRA liga e desliga (ÊDI: só o nome, coral ligada).
  // A sombra do sol: ligada na maquete e em pé, desligada na PLANTA (ÊDI, 11/10/2026: "por padrão ela viesse sem a sombra projetada");
  // o SOMBRA liga e desliga a do modo em que se está.
  const est = { modo: "maquete", pav: 0, paredes: tour.corte || 2.4, ambiente: null, reproduzindo: false, proximo: 0, sombraNoModo: { maquete: true, andar: true, planta: false, foto: true },
    get sombra() { return this.sombraNoModo[this.modo] ?? true; }, set sombra(v) { this.sombraNoModo[this.modo] = v; } };
  // O pavimento de partida: o térreo (o de ambientes mais perto do nível zero).
  {
    let melhor = 0, d0 = Infinity;
    pavs.forEach((p, i) => { if (ambientes.some(a => a.pavimento === i) && Math.abs(p.z) < d0) { d0 = Math.abs(p.z); melhor = i; } });
    est.pav = melhor;
  }
  const doPav = () => pavs[est.pav];
  // O plano do corte fica 7 mm acima da altura escolhida: a face modelada bem na altura (o topo de uma travessa da pele de vidro a 2,40 m)
  // pisca no plano, ora cortada, ora não (a "manchazinha preta" de ÊDI, 10/10/2026).
  // Em pé, o PAREDES vale como na maquete: a altura escolhida é a do corte (ÊDI, 11/10/2026: em pé ele só subia acima do teto e "parou de
  // funcionar"); em TUDO, o prédio inteiro, com o forro e as luminárias (ÊDI, 10/10/2026: "é só subir a linha do corte").
  const corte = () => est.modo === "foto" || est.paredes >= 3.55 ? 1e9 : doPav().z + est.paredes + .007;
  // A órbita (a maquete e a planta): o ponto olhado, a distância, a direção e a inclinação, e os desejados (ela chega neles devagar).
  const ambDoPav = () => ambientes.filter(a => a.pavimento === est.pav);
  function caixaDoPav() {
    const lista = ambDoPav();
    if (!lista.length) return { cx: (regMin[0] + regMax[0]) / 2, cy: (regMin[1] + regMax[1]) / 2, l: Math.max(regMax[0] - regMin[0], regMax[1] - regMin[1]) * .7 };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const a of lista) for (let k = 0; k < a.contorno.length; k += 2) { x0 = Math.min(x0, a.contorno[k]); x1 = Math.max(x1, a.contorno[k]); y0 = Math.min(y0, a.contorno[k + 1]); y1 = Math.max(y1, a.contorno[k + 1]); }
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, l: Math.max(x1 - x0, y1 - y0) };
  }
  const orb = { alvo: [0, 0, 0], dist: 30, guinada: -2.2, inclinacao: .75 };
  const orbAlvo = { alvo: [0, 0, 0], dist: 30, guinada: -2.2, inclinacao: .75 };
  function enquadrarPav(imediato) {
    const c = caixaDoPav();
    orbAlvo.alvo = [c.cx, c.cy, doPav().z];
    orbAlvo.dist = Math.max(8, c.l * (est.modo === "planta" ? 1.9 : 1.45));
    if (est.modo === "planta") { orbAlvo.inclinacao = 89 * rad; orbAlvo.guinada = -Math.PI / 2; }
    else if (orbAlvo.inclinacao > 80 * rad) orbAlvo.inclinacao = .75;
    if (imediato) Object.assign(orb, { alvo: orbAlvo.alvo.slice(), dist: orbAlvo.dist, guinada: orbAlvo.guinada, inclinacao: orbAlvo.inclinacao });
  }
  const olhoDaOrbita = () => {
    const ci = Math.cos(orb.inclinacao);
    return [orb.alvo[0] + orb.dist * ci * Math.cos(orb.guinada), orb.alvo[1] + orb.dist * ci * Math.sin(orb.guinada), orb.alvo[2] + orb.dist * Math.sin(orb.inclinacao)];
  };
  // Em pé (andar e foto): o olho, a direção e o campo.
  const ALTURA = tour.chao.alturaDoOlho || 1.6;
  // A velocidade do teclado, a do programa (Vista3DCanvas.VelocidadeDoTeclado, em m/s), e quantas vezes mais com Shift.
  const VELOCIDADE = 3, RAPIDO = 5;
  const normalizar = v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
  const pe = { olho: [0, 0, 0], guinada: 0, inclinacao: 0, campo: 0, chaoAlvo: null, indo: null };
  // A passagem da maquete para dentro e de volta (o olho voa de uma câmera à outra).
  let voo = null;
  const foto = { atual: -1, destino: null, passagem: null, alfa: 1 };

  // ---------------------------------------------------------------- os rótulos dos ambientes e as marcas 360°
  const rotulos = ambientes.map((a, i) => {
    const r = document.createElement("div");
    r.className = "mq-rotulo"; r.style.display = "none";
    r.innerHTML = `${a.nome}<span>${m2(a.area)} m²</span>`;
    r.addEventListener("pointerdown", e => e.stopPropagation());
    r.addEventListener("click", e => { e.stopPropagation(); parar(); escolherAmbiente(i); });
    $("mq-rotulos").appendChild(r);
    return r;
  });
  const marcas = pans.map((p, i) => {
    const b = document.createElement("button");
    b.className = "mq-360"; b.textContent = "360°"; b.title = `Ver em 360°: ${p.lugar}`; b.style.display = "none";
    b.addEventListener("pointerdown", e => e.stopPropagation());
    b.addEventListener("click", e => { e.stopPropagation(); parar(); entrarNaFoto(i); });
    $("mq-marcas").appendChild(b);
    return b;
  });
  const pavDe = z => { let k = 0; for (let i = 0; i < pavs.length; i++) if (pavs[i].z <= z + .6) k = i; return k; };
  function naTela(vp, p) {
    const q = aplicar(vp, [p[0], p[1], p[2], 1]);
    if (q[3] < .1) return null;
    const x = (q[0] / q[3] * .5 + .5) * tela.clientWidth, y = (1 - (q[1] / q[3] * .5 + .5)) * tela.clientHeight;
    if (x < -80 || x > tela.clientWidth + 80 || y < -40 || y > tela.clientHeight + 40) return null;
    return [x, y, q[3]];
  }
  // As cotas internas na PLANTA (ÊDI, 10/10/2026): as duas de cada ambiente do pavimento (o pacote as traz, de face a face), com o traço
  // inclinado nas pontas, como na prancha, e a medida em cima; só a que cabe na tela com folga.
  const cotasSvg = $("mq-cotas");
  let cotasDesenhadas = "";
  function desenharCotas(vp) {
    let svg = "";
    if (est.modo === "planta")
      for (const a of ambientes) {
        if (a.pavimento !== est.pav || !a.cotas) continue;
        for (const c of a.cotas) {
          const [x0, y0, x1, y1] = c, n = c.length >= 6 ? [c[4], c[5]] : [(x0 + x1) / 2, (y0 + y1) / 2];
          const s0 = naTela(vp, [x0, y0, a.z + .02]), s1 = naTela(vp, [x1, y1, a.z + .02]), sn = naTela(vp, [n[0], n[1], a.z + .02]);
          if (!s0 || !s1 || !sn) continue;
          const dx = s1[0] - s0[0], dy = s1[1] - s0[1], l = Math.hypot(dx, dy);
          if (l < 60) continue;
          // Só o número, junto da parede, girado com ela (de baixo para cima nas que ficam em pé), sem a linha pelo ambiente.
          let angulo = Math.atan2(dy, dx) / rad;
          if (angulo > 90) angulo -= 180; else if (angulo <= -90) angulo += 180;
          const f = v => v.toFixed(1);
          svg += `<text x="${f(sn[0])}" y="${f(sn[1])}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${angulo.toFixed(1)} ${f(sn[0])} ${f(sn[1])})">${m2(Math.hypot(x1 - x0, y1 - y0))}</text>`;
        }
      }
    if (svg !== cotasDesenhadas) { cotasSvg.innerHTML = svg; cotasDesenhadas = svg; }
  }
  function desenharRotulos(vp) {
    const mostrar = est.modo === "maquete" || est.modo === "planta";
    const ocupados = [];
    // Os maiores primeiro; o que cai em cima de outro fica de fora.
    const ordem = ambientes.map((a, i) => i).filter(i => mostrar && ambientes[i].pavimento === est.pav).sort((a, b) => ambientes[b].area - ambientes[a].area);
    const vistos = new Set();
    for (const i of ordem) {
      const a = ambientes[i], r = rotulos[i];
      const ponto = [a.centro[0], a.centro[1], a.z + (est.modo === "planta" ? .1 : 1.0)];
      // Só de perto (ÊDI): o nome aparece com a câmera a menos de 18 m do ambiente (o maior, um pouco mais longe); o escolhido, sempre.
      if (i !== est.ambiente && distancia(olhoAtual, ponto) > 18 + Math.sqrt(a.area)) continue;
      const s = naTela(vp, ponto);
      if (!s) continue;
      const w = r.offsetWidth || 90, h = r.offsetHeight || 30, x = s[0] - w / 2, y = s[1] - h / 2;
      if (i !== est.ambiente && ocupados.some(o => x < o[2] && x + w > o[0] && y < o[3] && y + h > o[1])) continue;
      ocupados.push([x - 4, y - 2, x + w + 4, y + h + 2]);
      vistos.add(i);
      r.style.transform = `translate(${x}px, ${y}px)`;
    }
    rotulos.forEach((r, i) => { const ver = vistos.has(i); if ((r.style.display !== "none") !== ver) r.style.display = ver ? "" : "none"; r.classList.toggle("escolhido", i === est.ambiente); });
    for (let i = 0; i < marcas.length; i++) {
      const p = pans[i], m = marcas[i];
      let ver = (est.modo === "maquete" || est.modo === "planta" || est.modo === "andar") && pavDe(p.chao) === est.pav;
      // Na maquete e na planta, como os nomes: só de perto (de longe, os pontos se amontoavam).
      if (ver && est.modo !== "andar") ver = distancia(olhoAtual, p.olho) < 30;
      // O ponto fica no chão, debaixo da foto (ÊDI, 10/10/2026: "no chão mesmo. E não ficar flutuando"), meio deitado: achatado pela
      // inclinação do olhar (até a metade, para o 360° ainda se ler).
      const noChao = [p.olho[0], p.olho[1], p.chao + .03];
      let s = null;
      if (ver) { s = naTela(vp, noChao); ver = !!s; }
      // Em pé, só a foto que se alcança pelo chão (a parede esconde a de trás).
      if (ver && est.modo === "andar") ver = distancia(p.olho, pe.olho) > .4 && chao.alcanca(pe.olho[0], pe.olho[1], p.olho[0], p.olho[1], pe.olho[2] - ALTURA);
      m.style.display = ver ? "" : "none";
      if (ver) {
        const v = noChao.map((x, k) => x - olhoAtual[k]), achatado = .5 + .5 * Math.min(1, Math.abs(v[2]) / Math.max(1e-6, Math.hypot(...v)));
        m.style.transform = `translate(${s[0] - 15}px, ${s[1] - 15}px) scaleY(${achatado.toFixed(3)})`;
      }
    }
  }

  // ---------------------------------------------------------------- o cartão do ambiente
  function escolherAmbiente(i, { voar = true } = {}) {
    est.ambiente = i;
    if (i == null) { $("mq-cartao").style.display = "none"; triangulosDaTampa = 0; atualizar(); return; }
    const a = ambientes[i];
    if (a.pavimento !== est.pav) mudarPav(a.pavimento, false);
    // A tampa acesa, um pouco acima do piso.
    const t = [];
    for (let k = 0; k < a.contorno.length; k += 2) t.push(a.contorno[k], a.contorno[k + 1], a.z + .02);
    gl.bindBuffer(gl.ARRAY_BUFFER, btampa); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(t), gl.DYNAMIC_DRAW);
    triangulosDaTampa = t.length / 3;
    // O cartão: o que o modelo sabe do ambiente.
    const foto360 = pans.findIndex(p => pavDe(p.chao) === a.pavimento && dentro(a, p.olho[0], p.olho[1]));
    const linhas = [["ÁREA", `${m2(a.area)} m²`], ["MEDIDAS", `${m2(a.medidas[0])} × ${m2(a.medidas[1])} m`], ["PÉ-DIREITO", `${m2(a.peDireito)} m`],
      ["PISO", a.piso], ["FORRO", a.forro], ["PERÍMETRO", `${m2(a.perimetro)} m`]].filter(l => l[1]);
    $("mq-cartao").innerHTML = `<button class="fechar" title="Fechar">✕</button>
      <div class="tipo">AMBIENTE${a.numero ? " " + a.numero : ""} · ${(pavs[a.pavimento].nome || "").toUpperCase()}</div><h2>${a.nome}</h2>
      <dl>${linhas.map(l => `<dt>${l[0]}</dt><dd>${l[1]}</dd>`).join("")}</dl>
      <div class="acoes"><button class="forte" data-a="andar">ANDAR AQUI</button>${foto360 >= 0 ? `<button class="forte" data-a="foto">VER EM 360°</button>` : ""}<button data-a="planta">PLANTA INTEIRA</button></div>`;
    $("mq-cartao").style.display = "block";
    $("mq-cartao").querySelector(".fechar").onclick = () => escolherAmbiente(null);
    $("mq-cartao").querySelector("[data-a=andar]").onclick = () => andarEm(a.centro[0], a.centro[1], a.z);
    $("mq-cartao").querySelector("[data-a=planta]").onclick = () => { escolherAmbiente(null); mudarModo("planta"); };
    const bf = $("mq-cartao").querySelector("[data-a=foto]");
    if (bf) bf.onclick = () => entrarNaFoto(foto360);
    if (voar && (est.modo === "maquete" || est.modo === "planta")) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < a.contorno.length; k += 2) { x0 = Math.min(x0, a.contorno[k]); x1 = Math.max(x1, a.contorno[k]); y0 = Math.min(y0, a.contorno[k + 1]); y1 = Math.max(y1, a.contorno[k + 1]); }
      orbAlvo.alvo = [(x0 + x1) / 2, (y0 + y1) / 2, a.z];
      orbAlvo.dist = Math.max(5, Math.max(x1 - x0, y1 - y0) * (est.modo === "planta" ? 2.4 : 1.9) + 2);
      if (est.modo === "maquete") orbAlvo.inclinacao = Math.max(orbAlvo.inclinacao, 50 * rad);
    }
    atualizar();
  }
  function dentro(a, x, y) {
    const c = a.contorno;
    for (let k = 0; k < c.length; k += 6) {
      const d = (c[k + 3] - c[k + 5]) * (c[k] - c[k + 4]) + (c[k + 4] - c[k + 2]) * (c[k + 1] - c[k + 5]);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((c[k + 3] - c[k + 5]) * (x - c[k + 4]) + (c[k + 4] - c[k + 2]) * (y - c[k + 5])) / d;
      const v = ((c[k + 5] - c[k + 1]) * (x - c[k + 4]) + (c[k] - c[k + 4]) * (y - c[k + 5])) / d;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) return true;
    }
    return false;
  }
  // O toque na maquete: o raio da câmera até o piso de cada ambiente do pavimento; o mais perto.
  let vpAtual = null, olhoAtual = [0, 0, 0];
  function raioDaTela(x, y) {
    const r = tela.getBoundingClientRect(), nx = (x - r.left) / r.width * 2 - 1, ny = 1 - (y - r.top) / r.height * 2;
    const inv = inverter(vpAtual);
    const p0 = aplicar(inv, [nx, ny, -1, 1]), p1 = aplicar(inv, [nx, ny, 1, 1]);
    const a = [p0[0] / p0[3], p0[1] / p0[3], p0[2] / p0[3]], b = [p1[0] / p1[3], p1[1] / p1[3], p1[2] / p1[3]];
    return { o: a, d: unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]) };
  }
  function ambienteNoToque(x, y) {
    const { o, d } = raioDaTela(x, y);
    let melhor = null, t0 = Infinity;
    ambientes.forEach((a, i) => {
      if (a.pavimento !== est.pav || Math.abs(d[2]) < 1e-6) return;
      const t = (a.z - o[2]) / d[2];
      if (t <= 0 || t >= t0) return;
      if (dentro(a, o[0] + d[0] * t, o[1] + d[1] * t)) { t0 = t; melhor = i; }
    });
    return melhor;
  }

  // ---------------------------------------------------------------- os comentários do cliente (a página do ENVIAR PARA O CLIENTE)
  // A página conversa com o tour por mensagens (ÊDI, 11/10/2026, mockup do ENVIAR PARA O CLIENTE): com COMENTAR ligado, o toque na
  // maquete, na planta ou em pé marca o ponto (o que está na tela ali, pela profundidade do quadro) e o devolve à página com o pavimento,
  // o ambiente e a vista; a página manda os alfinetes (os enviados, cheios, e os por enviar, vazados), desenhados no lugar de cada um.
  const comentarios = { ligado: false, alfinetes: [], els: new Map() };
  const leituraProg = programa(`#version 300 es
    layout(location = 0) in vec3 pos; void main() { gl_Position = vec4(pos.xy, 0.0, 1.0); }`,
  `#version 300 es
    precision highp float; uniform highp sampler2D prof; uniform ivec2 px; out vec4 cor;
    void main() {
      float d = texelFetch(prof, px, 0).r;
      vec3 e = fract(d * vec3(1.0, 255.0, 65025.0));
      e -= e.yzz * vec3(1.0 / 255.0, 1.0 / 255.0, 0.0);
      cor = vec4(e, 1.0);
    }`);
  const leituraTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, leituraTex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 1, 1);
  const quadroLeitura = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, quadroLeitura);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, leituraTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, null);
  /** O ponto do modelo debaixo do cursor (x, y na página), pela profundidade do último quadro; nulo onde só há o céu ou o fundo. */
  function pontoNaTela(x, y) {
    if (!telaQ.quadro || !vpAtual) return null;
    const w = telaQ.largura, h = telaQ.altura, r = tela.getBoundingClientRect();
    const px = Math.floor((x - r.left) / r.width * w), py = Math.floor((1 - (y - r.top) / r.height) * h);
    if (px < 0 || py < 0 || px >= w || py >= h) return null;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, telaQ.quadro); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, telaQ.quadroProf);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, quadroLeitura); gl.viewport(0, 0, 1, 1);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST);
    gl.useProgram(leituraProg.p); gl.bindVertexArray(vaoTela);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, telaQ.profTex);
    gl.uniform1i(leituraProg.u.prof, 2); gl.uniform2i(leituraProg.u.px, px, py);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const b = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
    gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.enable(gl.DEPTH_TEST);
    const d = b[0] / 255 + b[1] / 255 / 255 + b[2] / 255 / 65025;
    if (d > .99999) return null;
    const q = aplicar(inverter(vpAtual), [(px + .5) / w * 2 - 1, (py + .5) / h * 2 - 1, d * 2 - 1, 1]);
    return [q[0] / q[3], q[1] / q[3], q[2] / q[3]];
  }
  function marcarComentario(x, y) {
    const p = pontoNaTela(x, y);
    if (!p) return;
    const i = ambienteNoToque(x, y), a = i === null ? null : ambientes[i];
    const r3 = v => Math.round(v * 1000) / 1000;
    const vista = est.modo === "andar"
      ? { modo: "andar", olho: pe.olho.map(r3), guinada: r3(pe.guinada), inclinacao: r3(pe.inclinacao) }
      : { modo: est.modo, alvo: orb.alvo.map(r3), dist: r3(orb.dist), guinada: r3(orb.guinada), inclinacao: r3(orb.inclinacao) };
    parent.postMessage({ arquionie: true, tipo: "ponto", lugar: { pavimento: doPav().nome || "", pav: est.pav, ambiente: a ? a.nome : "",
      ponto: p.map(r3), vista: { ...vista, paredes: est.paredes } } }, "*");
  }
  function desenharAlfinetes(vp) {
    for (const a of comentarios.alfinetes) {
      let el = comentarios.els.get(a.n);
      if (!el) {
        el = document.createElement("div"); el.innerHTML = "<b></b>";
        el.onclick = () => parent.postMessage({ arquionie: true, tipo: "alfinete", n: a.n }, "*");
        $("mq-alfinetes").appendChild(el); comentarios.els.set(a.n, el);
      }
      el.className = "mq-alfinete" + (a.rascunho ? " rascunho" : "");
      el.firstChild.textContent = a.n;
      el.title = [a.nome, a.texto].filter(Boolean).join(" · ");
      const s = (a.lugar.pav ?? est.pav) === est.pav && est.modo !== "foto" ? naTela(vp, a.lugar.ponto) : null;
      el.style.display = s ? "" : "none";
      if (s) el.style.transform = `translate(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px) rotate(-45deg)`;
    }
  }
  addEventListener("message", ev => {
    const m = ev.data;
    if (!m || !m.arquionie || ev.source !== parent) return;
    if (m.tipo === "comentar") { comentarios.ligado = !!m.ligado; document.body.classList.toggle("comentando", comentarios.ligado); }
    if (m.tipo === "alfinetes") {
      comentarios.alfinetes = (m.lista || []).filter(a => a.lugar && Array.isArray(a.lugar.ponto));
      const vivos = new Set(comentarios.alfinetes.map(a => a.n));
      for (const [n, el] of comentarios.els) if (!vivos.has(n)) { el.remove(); comentarios.els.delete(n); }
    }
  });

  // ---------------------------------------------------------------- os modos
  function mudarPav(n, enquadrar = true) {
    est.pav = Math.max(0, Math.min(pavs.length - 1, n));
    if (est.ambiente != null && ambientes[est.ambiente].pavimento !== est.pav) escolherAmbiente(null);
    if (enquadrar && (est.modo === "maquete" || est.modo === "planta")) enquadrarPav(false);
    atualizar();
  }
  function mudarModo(modo) {
    if (modo === est.modo && modo !== "andar") return;
    if (est.modo === "foto") sairDaFoto(modo);
    else if (modo === "andar") {
      const a = est.ambiente != null ? ambientes[est.ambiente] : null;
      if (a) andarEm(a.centro[0], a.centro[1], a.z);
      else andarEm(orb.alvo[0], orb.alvo[1], doPav().z);
      return;
    } else {
      const deDentro = est.modo === "andar";
      est.modo = modo;
      if (deDentro) { orb.alvo = [pe.olho[0], pe.olho[1], pe.olho[2] - ALTURA]; orb.dist = .5; orb.guinada = pe.guinada + Math.PI; orb.inclinacao = .3; }
      if (modo === "planta") { orbAlvo.inclinacao = 89 * rad; orbAlvo.guinada = -Math.PI / 2; }
      else { orbAlvo.inclinacao = deDentro ? .75 : Math.min(orbAlvo.inclinacao, 70 * rad); if (orbAlvo.inclinacao > 80 * rad) orbAlvo.inclinacao = .75; }
      if (est.ambiente != null) escolherAmbiente(est.ambiente); else enquadrarPav(false);
      if (deDentro) { orbAlvo.alvo = [pe.olho[0], pe.olho[1], doPav().z]; orbAlvo.dist = 14; orbAlvo.guinada = pe.guinada + Math.PI; }
    }
    atualizar();
  }
  // Para dentro, em pé, no ponto (x, y) do piso: o olho desce da órbita até lá, olhando para onde a órbita olhava.
  function andarEm(x, y, zPiso) {
    const z = chao.chaoEm(x, y, zPiso);
    const destino = [x, y, (Number.isNaN(z) ? zPiso : z) + ALTURA];
    const de = est.modo === "andar" ? pe.olho.slice() : olhoDaOrbita();
    const guinadaDe = est.modo === "andar" ? pe.guinada : orb.guinada + Math.PI, guinadaPara = guinadaDe;
    const inclDe = est.modo === "andar" ? pe.inclinacao : -orb.inclinacao;
    est.modo = "andar"; $("mq-cartao").style.display = "none";
    pe.olho = de.slice(); pe.guinada = guinadaDe; pe.inclinacao = inclDe; pe.chaoAlvo = null; pe.indo = null;
    voo = { de, para: destino, t0: performance.now(), duracao: 1300, guinadaDe, guinadaPara, inclDe, inclPara: 0 };
    atualizar();
  }

  // A foto: a órbita mergulha até o olho do panorama e a foto aparece; ✕ volta.
  async function entrarNaFoto(i) {
    const p = pans[i];
    $("mq-cartao").style.display = "none";
    const pronto = Promise.all([previaDe(i), garantirInteiro(i).catch(() => {})]);
    const de = est.modo === "andar" ? pe.olho.slice() : olhoDaOrbita();
    const g = Math.atan2(p.olho[1] - de[1], p.olho[0] - de[0]);
    const guinadaDe = est.modo === "andar" ? pe.guinada : orb.guinada + Math.PI;
    voo = { de, para: p.olho.slice(), t0: performance.now(), duracao: 1400, guinadaDe, guinadaPara: guinadaDe + voltaDe(guinadaDe, Math.hypot(p.olho[0] - de[0], p.olho[1] - de[1]) > .5 ? g : guinadaDe),
      inclDe: est.modo === "andar" ? pe.inclinacao : -orb.inclinacao, inclPara: 0, foto: i, pronto };
    est.modo = "andar"; pe.indo = null;
    atualizar();
  }
  function sairDaFoto(modo) {
    const i = foto.atual;
    foto.atual = -1; foto.passagem = null; foto.destino = null;
    est.modo = "andar";
    pe.olho = pans[i].olho.slice(); pe.chaoAlvo = null;
    if (modo !== "andar") mudarModo(modo || "maquete");
    atualizar();
  }

  // ---------------------------------------------------------------- de uma foto à outra (o tour dos panoramas, dentro da maquete)
  const pontosDaFoto = i => [
    ...pans[i].vizinhos.map(j => ({ para: j, x: pans[j].olho[0], y: pans[j].olho[1], z: pans[j].chao })),
    ...(pans[i].portas || []).map(p => ({ para: p.para, x: p.via[0], y: p.via[1], z: p.via[2], via: p.via, porta: p.porta })),
  ];
  function caminhoPelaPorta(a, b, via) {
    const v = [via[0], via[1], (a[2] + b[2]) / 2];
    const perto = p => { const d = distancia(p, v) || 1, k = Math.min(.45, d / 2) / d; return v.map((x, n) => x + (p[n] - x) * k); };
    const ent = perto(a), sai = perto(b), pts = [], N = 24;
    for (let n = 0; n <= N; n++) { const f = n / N; pts.push(a.map((x, k) => x + (ent[k] - x) * f)); }
    for (let n = 1; n <= N; n++) { const f = n / N, g = 1 - f; pts.push([0, 1, 2].map(k => g * g * ent[k] + 2 * g * f * v[k] + f * f * sai[k])); }
    for (let n = 1; n <= N; n++) { const f = n / N; pts.push(sai.map((x, k) => x + (b[k] - x) * f)); }
    const acc = [0];
    for (let n = 1; n < pts.length; n++) acc.push(acc[n - 1] + distancia(pts[n - 1], pts[n]));
    const total = acc[acc.length - 1];
    return {
      total, em(e) {
        const alvo = e * total; let n = 1; while (n < acc.length - 1 && acc[n] < alvo) n++;
        const f = (alvo - acc[n - 1]) / ((acc[n] - acc[n - 1]) || 1);
        return { olho: pts[n - 1].map((x, k) => x + (pts[n][k] - x) * f), guinada: Math.atan2(pts[n][1] - pts[n - 1][1], pts[n][0] - pts[n - 1][0]) };
      },
    };
  }
  async function irParaFoto(j) {
    if (j === foto.atual || foto.destino != null) return;
    foto.destino = j; atualizar();
    const de = foto.atual;
    const vizinho = pans[de].vizinhos.includes(j);
    const porta = !vizinho ? (pans[de].portas || []).find(p => p.para === j) : null;
    await previaDe(j);
    const pronto = garantirInteiro(j).catch(() => {});
    await Promise.race([pronto, new Promise(r => setTimeout(r, guardados.has(j) ? 1500 : 350))]);
    if (vizinho || porta) {
      cuboDistancia(de); cuboDistancia(j);
      if (porta) {
        const caminho = caminhoPelaPorta(pans[de].olho, pans[j].olho, porta.via);
        foto.passagem = { de, para: j, t0: performance.now(), duracao: Math.max(1.2, Math.min(3, .7 + caminho.total * .2)) * 1000, caminho, guinadaDe: pe.guinada,
          inclDe: pe.inclinacao, porta: porta.porta ?? -1 };
      } else {
        const d = distancia(pans[de].olho, pans[j].olho);
        const g = Math.atan2(pans[j].olho[1] - pans[de].olho[1], pans[j].olho[0] - pans[de].olho[0]), volta = voltaDe(pe.guinada, g);
        foto.passagem = { de, para: j, t0: performance.now(), duracao: Math.max(.8, Math.min(2, .55 + d * .16)) * 1000,
          virar: Math.abs(volta) > 50 * rad ? { de: pe.guinada, volta, incl: pe.inclinacao } : null };
      }
    } else foto.passagem = { de, para: j, t0: performance.now(), duracao: 1100, longe: true, guinadaPara: pans[j].direcao * rad };
  }
  function chegarNaFoto(j) {
    foto.atual = j; foto.destino = null; foto.passagem = null;
    pe.olho = pans[j].olho.slice();
    est.pav = pavDe(pans[j].chao);
    for (const q of pontosDaFoto(j).slice(0, 6)) baixarInteiro(q.para).catch(() => {});
    while (guardados.size > 10) { const k = guardados.keys().next().value; if (k === foto.atual) break; guardados.delete(k); }
    atualizar();
  }
  const botoesDaFoto = [];
  function botaoDaFoto(n) {
    while (botoesDaFoto.length <= n) {
      const b = document.createElement("button");
      b.style.display = "none";
      b.addEventListener("pointerdown", e => e.stopPropagation());
      b.onclick = e => { e.stopPropagation(); if (b.para != null) irParaFoto(b.para); };
      $("pontos").appendChild(b);
      botoesDaFoto.push(b);
    }
    return botoesDaFoto[n];
  }
  function desenharPontosDaFoto(vp, vertical) {
    const pts = est.modo === "foto" && foto.destino == null ? pontosDaFoto(foto.atual) : [];
    for (let i = pts.length; i < botoesDaFoto.length; i++) if (botoesDaFoto[i].style.display !== "none") botoesDaFoto[i].style.display = "none";
    const focal = tela.clientHeight / 2 / Math.tan(vertical * rad / 2), o = pe.olho;
    pts.forEach((q, i) => {
      const b = botaoDaFoto(i);
      if (b.para !== q.para) { b.para = q.para; b.title = pans[q.para].lugar; }
      const s = naTela(vp, [q.x, q.y, q.z + .02]);
      if (!s) { b.style.display = "none"; return; }
      const d = Math.max(22, Math.min(120, .5 * focal / s[2])), h = Math.hypot(q.x - o[0], q.y - o[1]);
      const achatado = Math.max(.22, Math.min(1, (o[2] - q.z) / Math.hypot(h, o[2] - q.z)));
      b.style.display = ""; b.style.width = b.style.height = `${d}px`;
      b.style.transform = `translate(${s[0] - d / 2}px, ${s[1] - d / 2}px) scaleY(${achatado})`;
    });
  }

  // ---------------------------------------------------------------- a barra, a dica e o passeio pelos ambientes
  function atualizar() {
    for (const m of ["maquete", "planta", "andar"]) $("mq-" + m).classList.toggle("ativo", est.modo === m);
    $("mq-pav").textContent = (doPav().nome || "").toUpperCase();
    $("mq-abaixo").disabled = est.pav <= 0; $("mq-acima").disabled = est.pav >= pavs.length - 1;
    const h = Math.floor(sol.minutos / 60), mi = sol.minutos % 60;
    $("mq-hora").textContent = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    $("mq-altura").textContent = est.paredes >= 3.55 ? "TUDO" : `${m2(est.paredes)} m`;
    $("mq-play").classList.toggle("ativo", est.reproduzindo);
    if ($("mq-play").dataset.passeando !== String(est.reproduzindo)) {
      $("mq-play").dataset.passeando = String(est.reproduzindo);
      $("mq-play-icone").innerHTML = est.reproduzindo ? ICONES.pausa : ICONES.play;
      $("mq-play-nome").textContent = est.reproduzindo ? "PASSEANDO" : "PASSEAR";
    }
    if (toque) {
      // as barras das laterais: a altura do cheio e o valor na bolha
      $("mq-vb-sol").querySelector("i").style.height = `${100 * (sol.minutos - 360) / 720}%`;
      $("mq-vb-sol").querySelector(".bolha").textContent = $("mq-hora").textContent;
      $("mq-vb-sol").querySelector(".bolha").style.bottom = `${100 * (sol.minutos - 360) / 720}%`;
      const f = Math.min(1, Math.max(0, (est.paredes - .8) / 2.8));
      $("mq-vb-corte").querySelector("i").style.height = `${100 * f}%`;
      $("mq-vb-corte").querySelector(".bolha").textContent = $("mq-altura").textContent;
      $("mq-vb-corte").querySelector(".bolha").style.bottom = `${100 * f}%`;
    }
    $("mq-sombra").classList.toggle("ativo", est.sombra);
    $("mq-voltar").style.display = est.modo === "foto" ? "block" : "none";
    $("mq-giro").style.display = toque && (est.modo === "andar" || est.modo === "foto") ? "" : "none";
    const dicas = toque ? {
      maquete: "arraste para girar · dois dedos aproximam · toque num ambiente",
      planta: "arraste para mover · dois dedos aproximam · toque num ambiente",
      andar: "arraste para olhar · toque no chão para ir até lá",
      foto: "arraste para olhar · toque nos pontos do chão para andar",
    } : {
      maquete: "arrastar gira · direito olha · Ctrl + direito orbita · meio move · roda aproxima · setas ou W A S D andam · E sobe · Q desce",
      planta: "arrastar move · roda aproxima · setas ou W A S D andam · clique num ambiente",
      andar: "arrastar olha · setas ou W A S D andam · clique no chão para ir até lá · Esc sai",
      foto: "arrastar olha · clique nos pontos do chão para andar · Esc volta à maquete",
    };
    $("mq-dica").textContent = dicas[est.modo];
    const a = est.modo === "foto" ? pans[foto.atual]?.lugar : est.ambiente != null ? ambientes[est.ambiente].nome : (doPav().nome || "");
    $("parada").innerHTML = `${a || ""}<span>${tour.projeto}</span>`;
    const pl = tour.plantas.findIndex(p => Math.abs(p.z - doPav().z) < .05);
    $("mapa").classList.toggle("esconder", !(est.modo === "andar" || est.modo === "foto") || pl < 0);
  }
  $("mq-maquete").onclick = () => { parar(); mudarModo("maquete"); };
  $("mq-planta").onclick = () => { parar(); mudarModo("planta"); };
  $("mq-andar").onclick = () => { parar(); mudarModo("andar"); };
  $("mq-abaixo").onclick = () => { parar(); mudarPav(est.pav - 1); };
  $("mq-acima").onclick = () => { parar(); mudarPav(est.pav + 1); };
  $("mq-voltar").onclick = () => mudarModo("maquete");
  $("mq-sombra").onclick = () => { est.sombra = !est.sombra; atualizar(); };
  const solInput = $("mq-sol"), paredesInput = $("mq-paredes");
  solInput.value = sol.minutos; paredesInput.value = est.paredes;
  solInput.oninput = () => { sol.minutos = +solInput.value; luzDoSol(); atualizar(); };
  paredesInput.oninput = () => { est.paredes = +paredesInput.value; atualizar(); };
  // No celular, o sol e o corte nas barras verticais das laterais: o dedo sobe e desce, a barra engrossa e mostra o valor.
  function barraVertical(id, entrada) {
    const el = $(id);
    if (!el) return;
    const t = el.querySelector(".t");
    const valorEm = y => {
      const r = t.getBoundingClientRect(), f = Math.min(1, Math.max(0, (r.bottom - y) / r.height));
      const min = +entrada.min, max = +entrada.max, passo = +entrada.step || 1;
      return Math.round((min + f * (max - min)) / passo) * passo;
    };
    const mover = e => { entrada.value = valorEm(e.clientY); entrada.oninput(); };
    el.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); el.classList.add("mexendo"); mover(e); });
    el.addEventListener("pointermove", e => { if (el.classList.contains("mexendo")) { e.stopPropagation(); mover(e); } });
    const soltar = () => el.classList.remove("mexendo");
    el.addEventListener("pointerup", soltar); el.addEventListener("pointercancel", soltar);
  }
  barraVertical("mq-vb-sol", solInput); barraVertical("mq-vb-corte", paredesInput);
  // ▶: de ambiente em ambiente do pavimento, pelo tamanho, cinco segundos em cada um, a maquete girando devagar.
  function parar() { if (est.reproduzindo) { est.reproduzindo = false; atualizar(); } }
  $("mq-play").onclick = () => {
    est.reproduzindo = !est.reproduzindo;
    if (est.reproduzindo) { if (est.modo !== "maquete") mudarModo("maquete"); est.proximo = 0; }
    atualizar();
  };
  function proximoDoPasseio() {
    const lista = ambDoPav().map(a => ambientes.indexOf(a)).sort((a, b) => ambientes[b].area - ambientes[a].area);
    if (!lista.length) return;
    const k = lista.indexOf(est.ambiente);
    escolherAmbiente(lista[(k + 1) % lista.length]);
  }

  // A tela cheia e o movimento do celular.
  const raiz = document.documentElement;
  const pedirTelaCheia = raiz.requestFullscreen ? o => raiz.requestFullscreen(o) : raiz.webkitRequestFullscreen ? () => raiz.webkitRequestFullscreen() : null;
  const telaCheia = () => { if (pedirTelaCheia) Promise.resolve().then(() => pedirTelaCheia({ navigationUI: "hide" })).catch(() => {}); };
  $("mq-cheia").onclick = telaCheia;
  if (!pedirTelaCheia) $("mq-cheia").style.display = "none";
  function avisar(texto) { const a = $("aviso"); a.textContent = texto; a.style.display = "block"; clearTimeout(avisar.t); avisar.t = setTimeout(() => a.style.display = "none", 6000); }
  const movimento = { ligado: false, aparelho: null, deslocamento: 0, inclinacao: 0 };
  const mult = (a, b) => [a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1], a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
    a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  function aoOrientar(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const x = e.beta * rad / 2, y = e.alpha * rad / 2, z = -e.gamma * rad / 2;
    const c1 = Math.cos(x), c2 = Math.cos(y), c3 = Math.cos(z), s1 = Math.sin(x), s2 = Math.sin(y), s3 = Math.sin(z);
    let q = [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
    q = mult(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
    const daTela = -((screen.orientation ? screen.orientation.angle : window.orientation) || 0) * rad / 2;
    q = mult(q, [0, 0, Math.sin(daTela), Math.cos(daTela)]);
    const [qx, qy, qz, qw] = q, tx = -2 * qy, ty = 2 * qx;
    const fx = qw * tx - qz * ty, fy = qw * ty + qz * tx, fz = -1 + qx * ty - qy * tx;
    const ap = { guinada: Math.atan2(-fz, fx), inclinacao: Math.asin(Math.max(-1, Math.min(1, fy))) };
    if (!movimento.aparelho) { movimento.deslocamento = pe.guinada - ap.guinada; movimento.inclinacao = pe.inclinacao - ap.inclinacao; }
    movimento.aparelho = ap;
  }
  function ligarMovimento(ligar) {
    if (!ligar) { movimento.ligado = false; removeEventListener("deviceorientation", aoOrientar); $("mq-giro").classList.remove("ativo"); return; }
    if (!window.isSecureContext || !("DeviceOrientationEvent" in window)) { avisar("O movimento do celular precisa do endereço seguro (https)."); return; }
    const pedir = typeof DeviceOrientationEvent.requestPermission === "function" ? DeviceOrientationEvent.requestPermission() : Promise.resolve("granted");
    pedir.then(r => {
      if (r !== "granted") { avisar("O celular não deixou usar o movimento."); return; }
      movimento.ligado = true; movimento.aparelho = null;
      addEventListener("deviceorientation", aoOrientar); $("mq-giro").classList.add("ativo");
    }).catch(() => avisar("O celular não deixou usar o movimento."));
  }
  $("mq-giro").onclick = () => ligarMovimento(!movimento.ligado);

  // ---------------------------------------------------------------- o mapa (em pé): a planta do pavimento, você e as fotos; o toque volta à PLANTA
  function desenharMapa() {
    const i = tour.plantas.findIndex(p => Math.abs(p.z - doPav().z) < .05);
    if (i < 0 || !(est.modo === "andar" || est.modo === "foto")) return;
    const pl = tour.plantas[i], img = plantas[i], cv = $("mapinha"), ctx = cv.getContext("2d"), escala = Math.min(devicePixelRatio || 1, 2);
    const maxL = toque ? 112 : 190, k = Math.min(maxL / img.width, maxL * 1.25 / img.height);
    cv.style.width = img.width * k + "px"; cv.style.height = img.height * k + "px";
    cv.width = Math.round(img.width * k * escala); cv.height = Math.round(img.height * k * escala);
    const e = k * escala;
    ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const px = (x, y) => [(x - pl.origem[0]) / pl.celula * e, (pl.linhas - (y - pl.origem[1]) / pl.celula) * e];
    ctx.fillStyle = "#794B49";
    for (const p of pans) if (pavDe(p.chao) === est.pav) { const [x, y] = px(p.olho[0], p.olho[1]); ctx.beginPath(); ctx.arc(x, y, 4 * escala, 0, 2 * Math.PI); ctx.fill(); }
    const [x, y] = px(pe.olho[0], pe.olho[1]), g = pe.guinada, al = 22 * escala;
    ctx.fillStyle = "rgba(231,99,83,.4)"; ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(g + .55) * al, y - Math.sin(g + .55) * al); ctx.lineTo(x + Math.cos(g - .55) * al, y - Math.sin(g - .55) * al); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#E76353"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 * escala; ctx.beginPath(); ctx.arc(x, y, 5 * escala, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  }
  $("mapa").onclick = () => mudarModo("planta");

  // ---------------------------------------------------------------- o mouse, o toque e o teclado
  let aspecto = 1;
  function ajustar() {
    const l = innerWidth, a = innerHeight, escala = Math.min(devicePixelRatio || 1, toque ? 2 : 2.5);
    aspecto = l / a;
    tela.width = Math.round(l * escala); tela.height = Math.round(a * escala);
  }
  addEventListener("resize", ajustar);
  const ponteiros = new Map();
  tela.addEventListener("contextmenu", e => e.preventDefault());
  tela.addEventListener("pointerdown", e => {
    if (e.button === 1) e.preventDefault();
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY, arrasto: 0, botao: e.button, shift: e.shiftKey });
    tela.setPointerCapture(e.pointerId); parar();
  });
  // O botão do meio move a vista (sem a rolagem automática do navegador).
  tela.addEventListener("mousedown", e => { if (e.button === 1) e.preventDefault(); });
  // A lente em pé abre com os 112° na horizontal das cenas do programa (ÊDI, 10/10/2026: abria "com um zoom muito fechado", e era preciso
  // tirar o zoom todo para andar); no celular em pé, 90° na vertical. A roda e os dois dedos fecham (ou abrem mais um pouco).
  function campoEmPe() { const base = aspecto >= 1 ? 2 * Math.atan(Math.tan(56 * rad) / aspecto) / rad : 90; return Math.max(25, Math.min(110, base + pe.campo)); }
  tela.addEventListener("pointermove", e => {
    const p = ponteiros.get(e.pointerId);
    if (est.modo === "andar" && !p) mostrarAnel(e.clientX, e.clientY);
    if (!p) return;
    if (ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()];
      const antes = Math.hypot(a.x - b.x, a.y - b.y), meioAntes = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      const depois = Math.hypot(a.x - b.x, a.y - b.y), meio = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      p.arrasto += 99;
      if (est.modo === "maquete" || est.modo === "planta") {
        if (antes > 0) orbAlvo.dist = Math.max(2, Math.min(300, orbAlvo.dist * antes / Math.max(1, depois)));
        arrastarAlvo(meio[0] - meioAntes[0], meio[1] - meioAntes[1]);
      } else if (antes > 0) pe.campo = Math.max(-55, Math.min(25, pe.campo + (antes - depois) * .15));
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.arrasto += Math.abs(dx) + Math.abs(dy);
    p.x = e.clientX; p.y = e.clientY;
    if (p.arrasto < 5) return;
    if (est.modo === "planta") arrastarAlvo(dx, dy);
    else if (est.modo === "maquete") {
      // Como no RENDERIZAR do programa: o direito olha ao redor, Ctrl + direito (ou Ctrl + meio) orbita, o meio move; o esquerdo (e o
      // dedo) orbita, e com Shift move.
      if (e.ctrlKey && (p.botao === 2 || p.botao === 1)) orbitar(dx, dy);
      else if (p.botao === 2) olharAoRedor(dx, dy);
      else if (p.botao === 1) moverNaTela(dx, dy);
      else if (p.shift) arrastarAlvo(dx, dy);
      else orbitar(dx, dy);
    } else {
      // Em pé e na foto, a imagem acompanha o dedo.
      const g = campoEmPe() * rad / tela.clientHeight;
      pe.guinada += dx * g; pe.inclinacao = Math.max(-1.45, Math.min(1.45, pe.inclinacao + dy * g));
      if (movimento.ligado) { movimento.deslocamento += dx * g; movimento.inclinacao += dy * g; }
      pe.indo = null;
    }
  });
  function orbitar(dx, dy) {
    orbAlvo.guinada -= dx * .006;
    orbAlvo.inclinacao = Math.max(Math.min(8 * rad, orbAlvo.inclinacao), Math.min(89 * rad, orbAlvo.inclinacao + dy * .005));
  }
  // Olhar ao redor: o olho parado, a direção girando (o ponto olhado anda em volta dele), na hora.
  function olharAoRedor(dx, dy) {
    const olho = olhoDaOrbita();
    orb.guinada = orbAlvo.guinada = orb.guinada - dx * .004;
    orb.inclinacao = orbAlvo.inclinacao = Math.max(-1.4, Math.min(1.5, orb.inclinacao + dy * .004));
    const ci = Math.cos(orb.inclinacao), d = orb.dist = orbAlvo.dist;
    orb.alvo = [olho[0] - d * ci * Math.cos(orb.guinada), olho[1] - d * ci * Math.sin(orb.guinada), olho[2] - d * Math.sin(orb.inclinacao)];
    orbAlvo.alvo = orb.alvo.slice();
  }
  // Mover a vista no plano da tela (o botão do meio do programa).
  function moverNaTela(dx, dy) {
    const olho = olhoDaOrbita(), f = orb.alvo.map((v, i) => v - olho[i]), fl = Math.hypot(...f);
    const frente = f.map(v => v / fl), direita = normalizar([frente[1], -frente[0], 0]);
    const cima = [direita[1] * frente[2] - direita[2] * frente[1], direita[2] * frente[0] - direita[0] * frente[2], direita[0] * frente[1] - direita[1] * frente[0]];
    const escala = orb.dist * 2 * Math.tan(45 * rad / 2) / tela.clientHeight;
    for (let i = 0; i < 3; i++) { const passo = (-direita[i] * dx + cima[i] * dy) * escala; orbAlvo.alvo[i] += passo; orb.alvo[i] += passo; }
  }
  // Arrastar o ponto olhado na tela: no plano do piso, pela distância.
  function arrastarAlvo(dx, dy) {
    const escala = orb.dist * 2 * Math.tan((est.modo === "planta" ? CAMPO_DA_PLANTA : 45) * rad / 2) / tela.clientHeight;
    const g = orb.guinada, frente = [-Math.cos(g), -Math.sin(g)], lado = [Math.sin(g), -Math.cos(g)];
    orbAlvo.alvo[0] += (-dx * lado[0] + dy * frente[0]) * escala;
    orbAlvo.alvo[1] += (-dx * lado[1] + dy * frente[1]) * escala;
  }
  const soltar = e => {
    const p = ponteiros.get(e.pointerId);
    ponteiros.delete(e.pointerId);
    if (!p || p.arrasto >= 5 || e.type !== "pointerup" || ponteiros.size) return;
    if (comentarios.ligado && est.modo !== "foto") { marcarComentario(e.clientX, e.clientY); return; }
    if (est.modo === "maquete" || est.modo === "planta") escolherAmbiente(ambienteNoToque(e.clientX, e.clientY));
    else if (est.modo === "andar") irAoChao(e.clientX, e.clientY);
  };
  tela.addEventListener("pointerup", soltar); tela.addEventListener("pointercancel", soltar);
  tela.addEventListener("wheel", e => {
    e.preventDefault(); parar();
    if (est.modo === "maquete" || est.modo === "planta") {
      const k = Math.max(2, Math.min(300, orbAlvo.dist * Math.exp(e.deltaY * .0012))) / orbAlvo.dist;
      // O ponto do plano do piso debaixo do cursor: o alvo se aproxima dele na mesma proporção da distância (ele fica debaixo do cursor).
      const { o, d } = raioDaTela(e.clientX, e.clientY);
      const zp = orbAlvo.alvo[2];
      if (Math.abs(d[2]) > 1e-4) {
        const t = (zp - o[2]) / d[2];
        if (t > 0) { const P = [o[0] + d[0] * t, o[1] + d[1] * t]; orbAlvo.alvo[0] = P[0] + (orbAlvo.alvo[0] - P[0]) * k; orbAlvo.alvo[1] = P[1] + (orbAlvo.alvo[1] - P[1]) * k; }
      }
      orbAlvo.dist *= k;
    }
    else pe.campo = Math.max(-55, Math.min(25, pe.campo + Math.sign(e.deltaY) * 5));
  }, { passive: false });
  const teclas = new Set();
  addEventListener("keydown", e => {
    if (e.code === "Escape") { if (est.modo === "andar" || est.modo === "foto") mudarModo("maquete"); else escolherAmbiente(null); return; }
    if (e.code === "Space") { e.preventDefault(); $("mq-play").onclick(); return; }
    if (e.code.startsWith("Arrow")) e.preventDefault();
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    teclas.add(e.code);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ"].includes(e.code)) parar();
  });
  addEventListener("keyup", e => teclas.delete(e.code));
  addEventListener("blur", () => teclas.clear());

  // Em pé: o anel no chão debaixo do mouse; o clique leva até lá (andando pelo chão, sem atravessar parede).
  const anel = document.createElement("div");
  anel.style.cssText = "position:absolute;left:0;top:0;width:44px;height:44px;border-radius:50%;border:3px solid rgba(255,255,255,.9);box-shadow:0 0 0 2px rgba(0,0,0,.25);pointer-events:none;display:none";
  $("mq-marcas").appendChild(anel);
  function pontoNoChao(x, y) {
    if (!vpAtual) return null;
    const { o, d } = raioDaTela(x, y), pes = pe.olho[2] - ALTURA;
    if (d[2] > -.02) return null;
    const t = (pes - o[2]) / d[2];
    if (t <= 0 || t > 40) return null;
    return [o[0] + d[0] * t, o[1] + d[1] * t, pes];
  }
  function mostrarAnel(x, y) {
    const p = est.modo === "andar" && !voo ? pontoNoChao(x, y) : null;
    if (!p || !chao.alcanca(pe.olho[0], pe.olho[1], p[0], p[1], p[2])) { anel.style.display = "none"; return; }
    const h = Math.hypot(p[0] - pe.olho[0], p[1] - pe.olho[1]), achatado = Math.max(.2, Math.min(1, ALTURA / Math.hypot(h, ALTURA)));
    anel.style.display = "";
    anel.style.transform = `translate(${x - 22}px, ${y - 22}px) scaleY(${achatado})`;
  }
  function irAoChao(x, y) {
    const p = pontoNoChao(x, y);
    if (p && chao.alcanca(pe.olho[0], pe.olho[1], p[0], p[1], p[2])) pe.indo = [p[0], p[1]];
  }
  function mover(dx, dy) {
    if (!dx && !dy) return;
    const o = pe.olho, pes = o[2] - ALTURA;
    const [x, y] = chao.andar(o[0], o[1], o[0] + dx, o[1] + dy, pes, tour.chao.raio);
    o[0] = x; o[1] = y;
    const z = chao.chaoEm(x, y, pes);
    if (!Number.isNaN(z)) pe.chaoAlvo = z + ALTURA;
  }

  // ---------------------------------------------------------------- cada quadro
  let antes = performance.now(), quadroDoMapa = 0, acabouDeEntrar = false;
  function quadro(agora) {
    const dt = Math.min(.1, (agora - antes) / 1000); antes = agora;
    const k = 1 - Math.exp(-dt * 6);
    // A órbita chega devagar nos desejados.
    orb.alvo = orb.alvo.map((v, i) => v + (orbAlvo.alvo[i] - v) * k);
    orb.dist += (orbAlvo.dist - orb.dist) * k;
    orb.guinada += voltaDe(orb.guinada, orbAlvo.guinada) * k;
    orb.inclinacao += (orbAlvo.inclinacao - orb.inclinacao) * k;
    // O teclado na maquete e na planta, como no RENDERIZAR do programa: as setas e W A S D andam no plano (a frente é para onde se
    // olha), E sobe e Q desce; com Shift, mais rápido. O olho e o ponto olhado andam juntos.
    if ((est.modo === "maquete" || est.modo === "planta") && !voo && teclas.size) {
      const vel = VELOCIDADE * (teclas.has("ShiftLeft") || teclas.has("ShiftRight") ? RAPIDO : 1) * dt;
      const g = orb.guinada, f = [-Math.cos(g), -Math.sin(g)], d = [f[1], -f[0]];
      let px = 0, py = 0, pz = 0;
      const tem = (...c) => c.some(x => teclas.has(x));
      if (tem("ArrowUp", "KeyW")) { px += f[0]; py += f[1]; }
      if (tem("ArrowDown", "KeyS")) { px -= f[0]; py -= f[1]; }
      if (tem("ArrowRight", "KeyD")) { px += d[0]; py += d[1]; }
      if (tem("ArrowLeft", "KeyA")) { px -= d[0]; py -= d[1]; }
      if (est.modo === "maquete" && tem("KeyE")) pz += 1;
      if (est.modo === "maquete" && tem("KeyQ")) pz -= 1;
      const n = Math.hypot(px, py, pz);
      if (n > 0) {
        const passo = [px / n * vel, py / n * vel, pz / n * vel];
        for (let i = 0; i < 3; i++) { orb.alvo[i] += passo[i]; orbAlvo.alvo[i] += passo[i]; }
      }
    }
    if (est.reproduzindo && est.modo === "maquete") {
      orbAlvo.guinada += .08 * dt;
      if (agora > est.proximo) { est.proximo = agora + 5000; proximoDoPasseio(); }
    }
    // O voo da órbita para dentro (ANDAR ou a foto).
    if (voo) {
      const s = Math.min(1, (agora - voo.t0) / voo.duracao), e = suave(s);
      pe.olho = voo.de.map((v, i) => v + (voo.para[i] - v) * e);
      pe.guinada = voo.guinadaDe + voltaDe(voo.guinadaDe, voo.guinadaPara) * e;
      pe.inclinacao = voo.inclDe + (voo.inclPara - voo.inclDe) * e;
      if (s >= 1) {
        const i = voo.foto; voo = null;
        if (i != null) {
          est.modo = "foto"; foto.alfa = 0; chegarNaFoto(i);
          pe.guinada = pe.guinada; acabouDeEntrar = true;
        }
        atualizar();
      }
    }
    if (est.modo === "foto" && foto.alfa < 1) foto.alfa = Math.min(1, foto.alfa + dt / .45);
    // Em pé: o teclado, o ir até o anel e o olho acompanhando o chão.
    if (est.modo === "andar" && !voo) {
      // Em pé, como no SOLO do programa: as setas e W A S D andam para a frente, para trás e para os lados.
      const vel = VELOCIDADE * (teclas.has("ShiftLeft") || teclas.has("ShiftRight") ? RAPIDO : 1) * dt;
      const f = [Math.cos(pe.guinada), Math.sin(pe.guinada)], d = [Math.sin(pe.guinada), -Math.cos(pe.guinada)];
      let qx = 0, qy = 0;
      const anda = (x, y, ...c) => { if (c.some(k => teclas.has(k))) { qx += x; qy += y; pe.indo = null; } };
      anda(f[0], f[1], "KeyW", "ArrowUp"); anda(-f[0], -f[1], "KeyS", "ArrowDown");
      anda(d[0], d[1], "KeyD", "ArrowRight"); anda(-d[0], -d[1], "KeyA", "ArrowLeft");
      const qn = Math.hypot(qx, qy);
      let px = qn > 0 ? qx / qn * vel : 0, py = qn > 0 ? qy / qn * vel : 0;
      if (pe.indo) {
        const vx = pe.indo[0] - pe.olho[0], vy = pe.indo[1] - pe.olho[1], dd = Math.hypot(vx, vy), passo = Math.min(dd, 1.6 * dt);
        if (dd < .05) pe.indo = null; else { px += vx / dd * passo; py += vy / dd * passo; }
      }
      const antesX = pe.olho[0], antesY = pe.olho[1];
      const pedacos = Math.max(1, Math.ceil(Math.hypot(px, py) / .2));
      for (let i = 0; i < pedacos; i++) mover(px / pedacos, py / pedacos);
      if (pe.indo && Math.hypot(pe.olho[0] - antesX, pe.olho[1] - antesY) < 1e-4) pe.indo = null;
      if (pe.chaoAlvo !== null) pe.olho[2] += (pe.chaoAlvo - pe.olho[2]) * Math.min(1, dt * 12);
      const z = pavDe(pe.olho[2] - ALTURA);
      if (z !== est.pav) { est.pav = z; atualizar(); }
    }
    if (movimento.ligado && movimento.aparelho && (est.modo === "andar" || est.modo === "foto")) {
      pe.guinada = movimento.aparelho.guinada + movimento.deslocamento;
      pe.inclinacao = Math.max(-1.45, Math.min(1.45, movimento.aparelho.inclinacao + movimento.inclinacao));
    }
    // A passagem entre as fotos.
    let mistura = 0, de = foto.atual, para = foto.atual, pelaPassagem = false;
    if (est.modo === "foto" && foto.passagem) {
      const ps = foto.passagem, s = Math.min(1, (agora - ps.t0) / ps.duracao), e = suave(s);
      de = ps.de; para = ps.para;
      if (ps.longe) ps.e = e;
      else if (ps.caminho) {
        const c = ps.caminho.em(e), r = suave(Math.min(1, s / .3));
        pe.olho = c.olho; pe.guinada = ps.guinadaDe + voltaDe(ps.guinadaDe, c.guinada) * r; pe.inclinacao = ps.inclDe * (1 - r);
        mistura = suave(Math.max(0, Math.min(1, (e - .3) / .4))); pelaPassagem = s < 1;
      } else {
        mistura = e; pe.olho = pans[de].olho.map((v, i) => v + (pans[para].olho[i] - v) * e);
        if (ps.virar) { const r = suave(Math.min(1, s / .55)); pe.guinada = ps.virar.de + ps.virar.volta * r; pe.inclinacao = ps.virar.incl * (1 - r); }
        pelaPassagem = s < 1;
      }
      if (s >= 1) { if (ps.longe) { pe.guinada = ps.guinadaPara; pe.inclinacao = 0; } chegarNaFoto(ps.para); de = para = ps.para; mistura = 0; pelaPassagem = false; }
    }
    if (agora - quadroDoMapa > 150) { quadroDoMapa = agora; desenharMapa(); }

    // A câmera.
    let olho, frente, vertical, perto, longe;
    if (est.modo === "maquete" || est.modo === "planta") {
      olho = olhoDaOrbita(); frente = orb.alvo.map((v, i) => v - olho[i]);
      vertical = est.modo === "planta" ? CAMPO_DA_PLANTA : 45; perto = Math.max(.1, orb.dist * (est.modo === "planta" ? .3 : .12)); longe = orb.dist * 8 + 400;
    } else {
      olho = pe.olho; const ci = Math.cos(pe.inclinacao);
      frente = [Math.cos(pe.guinada) * ci, Math.sin(pe.guinada) * ci, Math.sin(pe.inclinacao)];
      vertical = campoEmPe(); perto = .05; longe = 500;
    }
    // A PLANTA chapada, sem perspectiva (ÊDI, 10/10/2026: "eu não quero que ela fique em 3D com perspectiva ... chapada mesmo"): vista de
    // cima na projeção ortográfica, do tamanho que a perspectiva de 32° tinha no ponto olhado (a roda e o arrasto continuam iguais), com o
    // alto da tela para onde a maquete olhava.
    let vp;
    if (est.modo === "planta") {
      const g = orb.guinada, meia = orb.dist * Math.tan(CAMPO_DA_PLANTA * rad / 2);
      olho = [orb.alvo[0], orb.alvo[1], orb.alvo[2] + orb.dist]; frente = [0, 0, -1];
      vp = multiplicar(ortografica(-meia * aspecto, meia * aspecto, -meia, meia, -2000, 2000), olharPara(olho, frente, [-Math.cos(g), -Math.sin(g), 0]));
    } else vp = multiplicar(perspectiva(vertical, aspecto, perto, longe), olharPara(olho, frente));
    vpAtual = vp; olhoAtual = olho;
    const c = corte();
    if (est.sombra && (sol.minutosDaSombra !== sol.minutos || Math.abs((sol.corteDaSombra ?? -1) - c) > 1e-3)) fazerSombra(c);
    if (est.modo === "planta") fazerContato(c);

    const quadroDaTela = prepararQuadroDaTela();
    gl.bindFramebuffer(gl.FRAMEBUFFER, quadroDaTela);
    gl.viewport(0, 0, tela.width, tela.height);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const naFoto = est.modo === "foto" && foto.atual >= 0 && cuboDaFoto(foto.atual);
    // O fundo: claro na maquete e na planta; o céu em pé.
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(fundoProg.p); gl.bindVertexArray(vaoTela);
    const emPe = est.modo === "andar" || est.modo === "foto";
    gl.uniform3fv(fundoProg.u.alto, emPe ? [.62, .74, .9] : [.93, .925, .91]); gl.uniform3fv(fundoProg.u.baixo, emPe ? [.86, .88, .9] : [.85, .84, .82]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // O modelo, com a luz do sol e do céu.
    if (!naFoto || foto.alfa < 1 || pelaPassagem) {
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      gl.useProgram(modelo.p);
      const u = modelo.u;
      gl.uniformMatrix4fv(u.vp, false, vp); gl.uniform3fv(u.minimo, regMin); gl.uniform3fv(u.maximo, regMax); gl.uniform3fv(u.olho, olho);
      gl.uniformMatrix4fv(u.luzVp, false, sol.luzVp || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); gl.uniform1i(u.imagem, 0); gl.uniform1i(u.sombra, 1);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sombraTex);
      gl.uniform3fv(u.dirSol, sol.dir); gl.uniform3fv(u.corSol, sol.cor);
      const dia = Math.max(.25, Math.min(1, sol.dir[2] / .25 + .3));
      const amb = emPe ? 1.25 : 1;
      gl.uniform3fv(u.ceu, [.42 * dia * amb, .47 * dia * amb, .56 * dia * amb]); gl.uniform3fv(u.chao, [.27 * dia * amb, .25 * dia * amb, .23 * dia * amb]);
      gl.uniform1i(u.comSombra, est.sombra && sol.luzVp ? 1 : 0);
      gl.uniform1f(u.corte, c); gl.uniform1f(u.exposicao, 1.05); gl.uniform1f(u.texel, 1 / LADO_SOMBRA); gl.uniform1f(u.destaque, 0);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      desenharModelo(modelo, { comMaterial: true, desempatar: true });
      gl.disable(gl.POLYGON_OFFSET_FILL);
      // A tampa do corte das paredes: em cada ponto da tela, a conta dos versos menos as faces do que o corte tampa (a parede, o pilar,
      // a laje), embaixo do corte; diferente de zero, o plano do corte está dentro da peça, e a tampa escura é desenhada nele.
      if ((est.modo === "maquete" || est.modo === "planta") && c < 1e8 && tour.modelo.lotes.some(k => k.corta)) {
        gl.enable(gl.STENCIL_TEST); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
        gl.colorMask(false, false, false, false); gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
        gl.stencilFunc(gl.ALWAYS, 0, 0xff);
        gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
        gl.useProgram(sombraProg.p);
        gl.uniformMatrix4fv(sombraProg.u.vp, false, vp); gl.uniform1f(sombraProg.u.corte, c); gl.uniform1i(sombraProg.u.recorte, 0);
        desenharModelo(sombraProg, { soOCorte: true });
        gl.colorMask(true, true, true, true); gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
        gl.stencilFunc(gl.NOTEQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        planoDoCorte(c);
        gl.useProgram(tampaProg.p); gl.bindVertexArray(vaoCorte);
        gl.uniformMatrix4fv(tampaProg.u.vp, false, vp); gl.uniform3fv(tampaProg.u.corT, [.17, .17, .18]); gl.uniform1f(tampaProg.u.alfa, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disable(gl.STENCIL_TEST);
      }
      // A sombra de contato da planta, por cima do modelo e da tampa.
      if (est.modo === "planta") desenharContato(vp);
      else if (est.modo === "maquete" || est.modo === "andar") desenharSombraAmbiente(perto, longe, vertical);
      // O ambiente escolhido, aceso.
      if (triangulosDaTampa && (est.modo === "maquete" || est.modo === "planta")) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -4);
        gl.useProgram(tampaProg.p); gl.bindVertexArray(vaoTampa);
        gl.uniformMatrix4fv(tampaProg.u.vp, false, vp); gl.uniform3fv(tampaProg.u.corT, [.906, .388, .325]); gl.uniform1f(tampaProg.u.alfa, .32);
        gl.drawArrays(gl.TRIANGLES, 0, triangulosDaTampa);
        gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true); gl.disable(gl.BLEND);
      }
      // O vidro por último, sem escrever a profundidade.
      if (vaoVidro && !telaQ.semVidro) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        gl.useProgram(vidroProg.p); gl.bindVertexArray(vaoVidro);
        gl.uniformMatrix4fv(vidroProg.u.vp, false, vp); gl.uniform3fv(vidroProg.u.minimo, cxMin); gl.uniform3fv(vidroProg.u.maximo, cxMax);
        gl.uniform3fv(vidroProg.u.olho, olho); gl.uniform3fv(vidroProg.u.ceu, [.75, .82, .9]); gl.uniform1f(vidroProg.u.corte, c);
        for (const g of tour.modelo.vidros) {
          const m = porMaterial.get(g.material) || { cor: [.3, .35, .35], opacidade: .15 };
          gl.uniform3fv(vidroProg.u.corVidro, m.cor); gl.uniform1f(vidroProg.u.opacidade, Math.min(.6, m.opacidade ?? .15));
          gl.drawArrays(gl.TRIANGLES, g.vertice, g.vertices);
        }
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    }
    // A foto 360° (por cima, aparecendo; na passagem, o modelo pintado pelas duas fotos).
    if (naFoto) {
      if (pelaPassagem) {
        gl.enable(gl.DEPTH_TEST); gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(passagemProg.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, cuboDaFoto(de));
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_CUBE_MAP, cuboDaFoto(para));
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_CUBE_MAP, cuboDistancia(de));
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_CUBE_MAP, cuboDistancia(para));
        gl.uniform1i(passagemProg.u.a, 0); gl.uniform1i(passagemProg.u.b, 1); gl.uniform1i(passagemProg.u.da, 2); gl.uniform1i(passagemProg.u.db, 3);
        gl.uniformMatrix4fv(passagemProg.u.vp, false, vp); gl.uniform3fv(passagemProg.u.minimo, regMin); gl.uniform3fv(passagemProg.u.maximo, regMax);
        gl.uniform3fv(passagemProg.u.ca, pans[de].olho); gl.uniform3fv(passagemProg.u.cb, pans[para].olho); gl.uniform1f(passagemProg.u.mistura, mistura);
        gl.bindFramebuffer(gl.FRAMEBUFFER, quadroDaTela); gl.viewport(0, 0, tela.width, tela.height);
        desenharModelo(passagemProg, { semPorta: foto.passagem && foto.passagem.porta != null ? foto.passagem.porta : -1 });
      } else {
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(fotoProg.p); gl.bindVertexArray(vaoTela);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, cuboDaFoto(de));
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_CUBE_MAP, cuboDaFoto(para) || cuboDaFoto(de));
        gl.uniform1i(fotoProg.u.a, 0); gl.uniform1i(fotoProg.u.b, 1);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        const ps = foto.passagem;
        if (ps && ps.longe) {
          const e = ps.e || 0, g = ps.guinadaPara, outra = [Math.cos(g), Math.sin(g), 0];
          gl.uniformMatrix4fv(fotoProg.u.inv, false, inverter(multiplicar(perspectiva(vertical - 12 * e, aspecto, perto, longe), olharPara(olho, frente))));
          gl.uniform1f(fotoProg.u.mistura, 0); gl.uniform1f(fotoProg.u.alfa, 1); gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.uniformMatrix4fv(fotoProg.u.inv, false, inverter(multiplicar(perspectiva(vertical - 12 * (1 - e), aspecto, perto, longe), olharPara(pans[para].olho, outra))));
          gl.uniform1f(fotoProg.u.mistura, 1); gl.uniform1f(fotoProg.u.alfa, e); gl.drawArrays(gl.TRIANGLES, 0, 3);
        } else {
          gl.uniformMatrix4fv(fotoProg.u.inv, false, inverter(vp)); gl.uniform1f(fotoProg.u.mistura, 0); gl.uniform1f(fotoProg.u.alfa, foto.alfa);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.disable(gl.BLEND);
      }
    }
    // O quadro pronto na tela.
    if (quadroDaTela) quadroNaTela();
    gl.activeTexture(gl.TEXTURE0);
    desenharRotulos(vp); desenharCotas(vp); desenharAlfinetes(vp);
    desenharPontosDaFoto(vp, vertical);
    if (est.modo !== "andar") anel.style.display = "none";
    requestAnimationFrame(quadro);
  }

  // ---------------------------------------------------------------- a partida
  luzDoSol();
  enquadrarPav(true);
  orb.dist = orbAlvo.dist * 1.6; orb.inclinacao = .95;
  ajustar(); atualizar();
  // Conferência: ?modo=planta|andar&ambiente=NOME&hora=15&paredes=2.4&foto=N&camera=x,y,z,guinada,inclinação (graus)
  const pedidos = new URLSearchParams(location.search);
  if (pedidos.get("hora")) { sol.minutos = Math.round(+pedidos.get("hora") * 60); solInput.value = sol.minutos; luzDoSol(); }
  if (pedidos.get("paredes")) { est.paredes = +pedidos.get("paredes"); paredesInput.value = est.paredes; }
  if (pedidos.get("pavimento")) { const n = pavs.findIndex(p => p.nome.toUpperCase().includes(pedidos.get("pavimento").toUpperCase())); if (n >= 0) mudarPav(n); enquadrarPav(true); }
  if (pedidos.get("modo") === "planta") { est.modo = "planta"; enquadrarPav(true); }
  if (pedidos.get("ambiente")) { const n = ambientes.findIndex(a => a.nome.toUpperCase().includes(pedidos.get("ambiente").toUpperCase())); if (n >= 0) { escolherAmbiente(n); Object.assign(orb, { alvo: orbAlvo.alvo.slice(), dist: orbAlvo.dist, inclinacao: orbAlvo.inclinacao, guinada: orbAlvo.guinada }); } }
  if (pedidos.get("camera")) {
    const [x, y, z, g, i] = pedidos.get("camera").split(",").map(Number);
    est.modo = "andar"; pe.olho = [x, y, z]; pe.guinada = g * rad; pe.inclinacao = (i || 0) * rad; est.pav = pavDe(z - ALTURA);
  }
  atualizar();
  requestAnimationFrame(quadro);
  if (pedidos.get("foto")) setTimeout(() => entrarNaFoto(+pedidos.get("foto") - 1), 200);
  window.__maquete = { est, orb, orbAlvo, pe, foto, sol, telaQ, comentarios, marcarComentario, escolherAmbiente, mudarModo, entrarNaFoto, irParaFoto, andarEm, get voo() { return voo; } };
  return () => {
    for (const id of ["parada", "mq-barra", "mq-dica", ...(toque ? ["mq-topo", "mq-v-sol", "mq-v-corte"] : [])]) $(id).classList.remove("esconder");
    atualizar();
    if (parent !== window) parent.postMessage({ arquionie: true, tipo: "pronto" }, "*");
    return { telaCheia, ligarMovimento: () => {} };
  };
};
