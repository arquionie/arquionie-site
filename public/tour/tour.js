"use strict";
/*
  O tour no link (ÊDI, 10/10/2026; mockups docs/mockups/tour-no-link.html e tour-imersivo.html, aprovados): o visualizador do
  cliente. Lê o pacote do PacoteDoTour e mostra o passeio como no tour do programa:
  - REPRODUZIR anda o caminho do vídeo do passeio (trajeto.bin); ⏭ anda até a câmera seguinte e para nela; ⏮ volta pelo preto;
  - andar (o comando, as setas, W A S D) ou olhar (arrastar, o comando OLHAR, o movimento do celular) passa ao LIVRE: quem anda não
    atravessa parede (chao.js, o mesmo andar do programa) e o RETOMAR volta ao caminho no ponto mais perto;
  - o mapa no canto mostra a planta do pavimento, o caminho, as câmeras e você; aberto grande, um toque leva ao ambiente.
  O tour nunca usa os dois pontos de fuga. A luz vem pronta das renderizações (as páginas luz-N.jpg).
*/
(() => {
  const $ = id => document.getElementById(id);
  // O banco e os arquivos públicos (nada aqui é segredo: a chave publicável é feita para o navegador).
  const SUPABASE_URL = "https://sowazotriildoeaxbhkl.supabase.co", CHAVE_PUBLICAVEL = "sb_publishable_aSoXh3xrkPi2T-cd0pslWw_Jj8n9xSY";
  const ARQUIVOS_URL = "https://tours.arquionie.com.br/";
  const tela = $("tela");
  const gl = tela.getContext("webgl2", { antialias: true });
  const toque = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (toque) document.body.classList.add("toque");

  // ---------------------------------------------------------------- abertura e carga
  function fechado(titulo, texto) {
    $("projeto").textContent = titulo; $("passeio").textContent = ""; $("carga").textContent = "";
    $("barra").parentElement.classList.add("esconder"); $("ajuda").textContent = texto;
  }

  /** Onde estão os arquivos: ?pacote=ENDEREÇO, o link /t/CÓDIGO (pelo banco) ou a pasta da página. Nulo: pausado ou inexistente. */
  async function acharPacote() {
    const dado = new URLSearchParams(location.search).get("pacote");
    if (dado) return dado.endsWith("/") ? dado : dado + "/";
    const m = location.pathname.match(/^\/t\/([A-Za-z0-9]{6})\/?$/);
    if (!m) return "";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tour_abrir`, {
      method: "POST", headers: { apikey: CHAVE_PUBLICAVEL, "Content-Type": "application/json" }, body: JSON.stringify({ p_codigo: m[1] }),
    });
    if (!r.ok) throw new Error("O tour não abriu agora. Tente de novo em instantes.");
    const d = await r.json();
    if (d.situacao === "pausado") { fechado("Este tour está pausado", "Quem enviou o link tirou o tour do ar por enquanto. Fale com o escritório que mandou."); return null; }
    if (d.situacao !== "publicado") { fechado("Tour não encontrado", "O link está errado ou o tour foi excluído. Confira o link com o escritório que mandou."); return null; }
    return ARQUIVOS_URL + d.pasta;
  }

  let baixado = 0, total = 0;
  const mb = b => (b / 1048576).toFixed(b >= 10485760 ? 0 : 1).replace(".", ",");
  function andamento() {
    if (!total) return;
    $("barra").style.width = Math.min(100, 100 * baixado / total) + "%";
    $("carga").textContent = `carregando · ${mb(baixado)} de ${mb(total)} MB`;
  }
  async function baixar(base, nome) {
    const r = await fetch(base + nome);
    if (!r.ok) throw new Error(`${nome}: ${r.status}`);
    if (!r.body || !r.body.getReader) { const b = await r.arrayBuffer(); baixado += b.byteLength; andamento(); return b; }
    const leitor = r.body.getReader(), partes = [];
    let n = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(value); n += value.length; baixado += value.length; andamento();
    }
    const tudo = new Uint8Array(n);
    let o = 0;
    for (const p of partes) { tudo.set(p, o); o += p.length; }
    return tudo.buffer;
  }
  const imagem = async (base, nome) => createImageBitmap(new Blob([await baixar(base, nome)]));

  async function carregar() {
    const base = await acharPacote();
    if (base === null) return null;
    const tour = await (await fetch(base + "tour.json")).json();
    document.title = tour.projeto;
    $("projeto").textContent = tour.projeto;
    const ambientes = new Set(tour.paradas.map(p => p.nome)).size;
    $("passeio").textContent = `${ambientes} ${ambientes === 1 ? "ambiente" : "ambientes"}`;
    if (tour.logo) { $("logo").src = base + tour.logo; $("logo").classList.remove("esconder"); }
    total = Object.entries(tour.arquivos || {}).filter(([k]) => k !== "capa.jpg").reduce((s, [, v]) => s + v, 0);
    andamento();
    // Formato 2: os vértices compartilhados, com os índices de 16 bits em lotes; o 1 levava três vértices por triângulo.
    const [dados, indices, paginas, fundo, chao, trajeto, plantas] = await Promise.all([
      baixar(base, "modelo.bin"),
      tour.formato >= 2 ? baixar(base, "indices.bin") : null,
      Promise.all(tour.paginas.map(p => imagem(base, p.imagem))),
      imagem(base, tour.fundo.imagem),
      baixar(base, tour.chao.arquivo).then(b => ChaoDoTour.ler(b, tour.chao)),
      tour.trajeto ? baixar(base, tour.trajeto.arquivo).then(b => new Float32Array(b)) : null,
      Promise.all(tour.plantas.map(p => imagem(base, p.imagem))),
    ]);
    return { tour, dados: new Uint16Array(dados), indices: indices && new Uint16Array(indices), paginas, fundo, chao, trajeto, plantas };
  }

  // ---------------------------------------------------------------- o desenho (WebGL 2)
  function programa(vs, fs) {
    const p = gl.createProgram();
    for (const [tipo, fonte] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(tipo); gl.shaderSource(s, fonte); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function textura(img, repetir, mipmaps) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repetir ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mipmaps) {
      // Poucos níveis: o nível muito pequeno misturaria um retalho com o vizinho.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 2);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    return t;
  }
  const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const ponto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = a => { const c = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / c, a[1] / c, a[2] / c]; };
  function vista(olho, frente) {
    const f = unit(frente), d = unit(cruz(f, [0, 0, 1])), c = cruz(d, f);
    return [d[0], c[0], -f[0], 0, d[1], c[1], -f[1], 0, d[2], c[2], -f[2], 0, -ponto(d, olho), -ponto(c, olho), ponto(f, olho), 1];
  }
  function projecao(campoVertical, aspecto) {
    const f = 1 / Math.tan(campoVertical * Math.PI / 360), perto = .03, longe = 400;
    return [f / aspecto, 0, 0, 0, 0, f, 0, 0, 0, 0, (longe + perto) / (perto - longe), -1, 0, 0, 2 * longe * perto / (perto - longe), 0];
  }
  function multiplicar(a, b) {
    const r = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) r[c * 4 + l] += a[k * 4 + l] * b[c * 4 + k];
    return r;
  }
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

  // ---------------------------------------------------------------- o tour
  function iniciar({ tour, dados, indices, paginas, fundo, chao, trajeto, plantas }) {
    const modelo = programa(`#version 300 es
      in vec3 pos; in vec2 uv; uniform mat4 vp; uniform vec3 minimo, maximo; out vec2 vuv;
      void main() { vuv = uv; gl_Position = vp * vec4(mix(minimo, maximo, pos), 1.0); }`,
    `#version 300 es
      precision highp float; in vec2 vuv; uniform sampler2D luz; out vec4 cor;
      void main() { cor = vec4(texture(luz, vuv).rgb, 1.0); }`);
    const ceu = programa(`#version 300 es
      in vec2 p; out vec2 q; void main() { q = p; gl_Position = vec4(p, 0.9999, 1.0); }`,
    `#version 300 es
      precision highp float; in vec2 q; uniform mat4 inv; uniform sampler2D fundo; uniform float direcao; out vec4 cor;
      void main() {
        vec4 a = inv * vec4(q, -1.0, 1.0), b = inv * vec4(q, 1.0, 1.0);
        vec3 d = normalize(b.xyz / b.w - a.xyz / a.w);
        float lon = atan(d.y, d.x), lat = asin(clamp(d.z, -1.0, 1.0));
        cor = vec4(texture(fundo, vec2((direcao - lon) / 6.28318530718 + 0.5, (1.5707963268 - lat) / 3.14159265359)).rgb, 1.0);
      }`);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, dados, gl.STATIC_DRAW);
    const vaoModelo = gl.createVertexArray(); gl.bindVertexArray(vaoModelo);
    const lp = gl.getAttribLocation(modelo, "pos"), lu = gl.getAttribLocation(modelo, "uv");
    gl.enableVertexAttribArray(lp); gl.enableVertexAttribArray(lu);
    gl.vertexAttribPointer(lp, 3, gl.UNSIGNED_SHORT, true, 10, 0); gl.vertexAttribPointer(lu, 2, gl.UNSIGNED_SHORT, true, 10, 6);
    if (indices) { const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW); }
    const regMin = tour.regiao.slice(0, 3), regMax = tour.regiao.slice(3, 6);
    const vaoCeu = gl.createVertexArray(); gl.bindVertexArray(vaoCeu);
    const tri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const lc = gl.getAttribLocation(ceu, "p"); gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 2, gl.FLOAT, false, 0, 0);
    const texturas = paginas.map(i => textura(i, false, true));
    const texturaFundo = textura(fundo, true, false);
    const u = { vp: gl.getUniformLocation(modelo, "vp"), minimo: gl.getUniformLocation(modelo, "minimo"), maximo: gl.getUniformLocation(modelo, "maximo"),
      luz: gl.getUniformLocation(modelo, "luz"), inv: gl.getUniformLocation(ceu, "inv"), direcao: gl.getUniformLocation(ceu, "direcao"), fundo: gl.getUniformLocation(ceu, "fundo") };

    // A câmera e o passeio.
    const paradas = tour.paradas, passo = tour.trajeto ? tour.trajeto.passo : 0, duracao = tour.trajeto ? tour.trajeto.duracao : 0;
    const alturaDoOlho = tour.chao.alturaDoOlho;
    const camera = { olho: paradas[0].olho.slice(), guinada: 0, inclinacao: 0 };
    let estado = "parado", tempo = 0, pararEm = null, olhoNoChao = null, ultimaParada = 0;
    // O ambiente para onde o mapa levou (no LIVRE, o nome no alto é o dele).
    let ambienteDoMapa = null;
    // A direção do caminho (ou da câmera) fica guardada: com o movimento do celular, o olhar é ela mais o giro do aparelho.
    const doCaminho = { guinada: 0, inclinacao: 0 };
    function olharPara(d) {
      doCaminho.guinada = camera.guinada = Math.atan2(d[1], d[0]);
      doCaminho.inclinacao = camera.inclinacao = Math.asin(Math.max(-1, Math.min(1, d[2] / (Math.hypot(d[0], d[1], d[2]) || 1))));
    }
    function noCaminho(t) {
      if (!trajeto) return null;
      const n = trajeto.length / 6, x = Math.max(0, Math.min(n - 1, t / passo)), i = Math.min(n - 2, Math.floor(x)), f = Math.max(0, x - i);
      const a = i * 6, b = Math.min(n - 1, i + 1) * 6, l = (k) => trajeto[a + k] + (trajeto[b + k] - trajeto[a + k]) * f;
      return { olho: [l(0), l(1), l(2)], direcao: [l(3), l(4), l(5)] };
    }
    function irAoTempo(t) {
      tempo = Math.max(0, Math.min(duracao, t));
      const c = noCaminho(tempo);
      if (c) { camera.olho = c.olho; olharPara(c.direcao); }
      olhoNoChao = null;
    }
    function irAParada(i) {
      ultimaParada = i; ancorarMovimento();
      if (trajeto) irAoTempo(paradas[i].t);
      else { camera.olho = paradas[i].olho.slice(); olharPara(paradas[i].direcao); olhoNoChao = null; }
    }
    const proxima = t => { const i = paradas.findIndex(p => p.t > t + .05); return i < 0 ? null : i; };
    const anteriorA = t => { for (let i = paradas.length - 1; i >= 0; i--) if (paradas[i].t < t - .05) return i; return null; };
    const paradaEm = t => { let k = 0; for (let i = 0; i < paradas.length; i++) if (paradas[i].t <= t + .05) k = i; return k; };
    function maisPerto(o) {
      if (!trajeto) return 0;
      let melhor = 0, d0 = Infinity;
      for (let k = 0; k < trajeto.length; k += 6) {
        const dx = trajeto[k] - o[0], dy = trajeto[k + 1] - o[1], dz = 3 * (trajeto[k + 2] - o[2]), d = dx * dx + dy * dy + dz * dz;
        if (d < d0) { d0 = d; melhor = k / 6 * passo; }
      }
      return melhor;
    }

    // O preto entre um lugar e outro e a chegada na câmera.
    let pretoAte = 0;
    function peloPreto(fazer) {
      $("preto").style.opacity = 1;
      setTimeout(() => { fazer(); $("preto").style.opacity = 0; }, 380);
    }
    let chegadaAte = 0;
    function mostrarChegada(i) {
      const c = $("chegada");
      c.querySelector("span").textContent = `CÂMERA ${i + 1}`; c.querySelector("b").textContent = paradas[i].nome;
      c.style.opacity = 1; chegadaAte = performance.now() + 2200;
    }

    function atualizarEstado() {
      $("play").textContent = estado === "reproduzindo" ? "❚❚" : "▶";
      $("estado").textContent = estado === "reproduzindo" ? "REPRODUZINDO" : estado === "livre" ? "LIVRE"
        : trajeto && !naParada() ? "PAUSADO" : `PARADO NA CÂMERA ${ultimaParada + 1}`;
      $("retomar").classList.toggle("esconder", estado !== "livre" || !trajeto);
      const i = estado === "livre" ? ultimaParada : paradaEm(tempo);
      const nome = estado === "livre" && ambienteDoMapa ? ambienteDoMapa : `${String(i + 1).padStart(2, "0")} · ${paradas[i].nome}`;
      $("parada").innerHTML = `${nome}<span>${tour.projeto}</span>`;
      if (estado !== "livre") ambienteDoMapa = null;
    }
    const naParada = () => trajeto && Math.abs(tempo - paradas[ultimaParada].t) < .1;
    function chegarNa(i) { peloPreto(() => { irAParada(i); estado = "parado"; pararEm = null; mostrarChegada(i); atualizarEstado(); }); }
    function reproduzir(ate) {
      if (!trajeto) { chegarNa((ultimaParada + 1) % paradas.length); return; }
      if (tempo >= duracao - .05) irAoTempo(0);
      ancorarMovimento();
      pararEm = ate ?? (tour.paraEmCadaCamera ? (proxima(tempo) !== null ? paradas[proxima(tempo)].t : null) : null);
      estado = "reproduzindo"; atualizarEstado();
    }
    function pausar() { estado = "parado"; pararEm = null; ultimaParada = paradaEm(tempo); atualizarEstado(); }
    function ficarLivre() {
      if (estado === "livre") return;
      if (trajeto) ultimaParada = paradaEm(tempo);
      estado = "livre"; pararEm = null;
      if (movimento.aparelho) { movimento.deslocamento = camera.guinada - movimento.aparelho.guinada; movimento.inclinacao = camera.inclinacao - movimento.aparelho.inclinacao; }
      atualizarEstado();
    }
    $("play").onclick = () => estado === "reproduzindo" ? pausar() : estado === "livre" ? retomar() : reproduzir();
    // ⏭ anda pelo caminho até a câmera seguinte e para nela; do LIVRE (ou sem caminho), vai pelo preto.
    $("proxima").onclick = () => {
      if (!trajeto) { if (ultimaParada + 1 < paradas.length) chegarNa(ultimaParada + 1); return; }
      if (estado === "livre") { const i = proxima(maisPerto(camera.olho)); if (i !== null) chegarNa(i); return; }
      const i = proxima(tempo);
      if (i !== null) reproduzir(paradas[i].t);
    };
    // ⏮ volta pelo preto: parado numa câmera, à de antes; andando (ou pausado no meio), à que acabou de passar.
    $("anterior").onclick = () => {
      if (!trajeto || (estado === "parado" && naParada())) { chegarNa(Math.max(0, ultimaParada - 1)); return; }
      chegarNa(paradaEm(estado === "livre" ? maisPerto(camera.olho) : tempo));
    };
    function retomar() { const t = maisPerto(camera.olho); peloPreto(() => { irAoTempo(t); ultimaParada = paradaEm(t); reproduzir(); }); }
    $("retomar").onclick = retomar;

    // Andar pelo chão: o passo vai até onde o chão deixa e o olho vai, suave, à altura do olho acima do chão de baixo dele.
    function mover(dx, dy) {
      if (!dx && !dy) return;
      ficarLivre();
      const o = camera.olho, pes = o[2] - alturaDoOlho;
      // No alto (a câmera do passeio AÉREO, de drone), anda na altura em que está, sem colisão, como no tour do programa; perto do
      // chão, anda como uma pessoa.
      const debaixo = chao.chaoEm(o[0], o[1], pes);
      if (Number.isNaN(debaixo) || o[2] - debaixo > alturaDoOlho + .6) { o[0] += dx; o[1] += dy; olhoNoChao = null; return; }
      const [x, y] = chao.andar(o[0], o[1], o[0] + dx, o[1] + dy, pes, tour.chao.raio);
      o[0] = x; o[1] = y;
      const z = chao.chaoEm(x, y, pes);
      if (!Number.isNaN(z)) olhoNoChao = z + alturaDoOlho;
    }

    // A tela.
    let aspecto = 1;
    function ajustar() {
      const l = innerWidth, a = innerHeight, escala = Math.min(devicePixelRatio || 1, toque ? 2 : 2.5);
      aspecto = l / a;
      tela.width = Math.round(l * escala); tela.height = Math.round(a * escala);
      document.body.classList.toggle("deitado", l > a);
      desenharMapa();
    }
    addEventListener("resize", ajustar);

    // O teclado, os ponteiros e os comandos de andar e olhar.
    const teclas = new Set();
    addEventListener("keydown", e => {
      if (e.code === "Space") { e.preventDefault(); $("play").onclick(); return; }
      if (e.code === "KeyM") { abrirMapa(!mapaAberto); return; }
      if (e.code === "Escape" && mapaAberto) { abrirMapa(false); return; }
      teclas.add(e.code);
    });
    addEventListener("keyup", e => teclas.delete(e.code));
    addEventListener("blur", () => teclas.clear());
    const ponteiros = new Map();
    const comandos = { andar: { el: $("andar"), v: [0, 0] }, olhar: { el: $("olhar"), v: [0, 0] } };
    const RAIO = 52;
    function noComando(nome, x, y) {
      const el = comandos[nome].el;
      if (getComputedStyle(el).display === "none") return false;
      const r = el.getBoundingClientRect();
      return Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) < r.width * .8;
    }
    function moverPino(nome, dx, dy) { comandos[nome].el.querySelector("i").style.transform = `translate(${dx}px, ${dy}px)`; }
    tela.addEventListener("pointerdown", e => {
      const papel = noComando("andar", e.clientX, e.clientY) ? "andar" : noComando("olhar", e.clientX, e.clientY) ? "olhar-comando" : "olhar";
      ponteiros.set(e.pointerId, { papel, x: e.clientX, y: e.clientY, arrasto: 0 });
      tela.setPointerCapture(e.pointerId);
    });
    tela.addEventListener("pointermove", e => {
      const p = ponteiros.get(e.pointerId);
      if (!p) return;
      if (p.papel === "olhar") {
        const giro = toque ? .006 : .004, dx = e.clientX - p.x, dy = e.clientY - p.y;
        // Só o arrasto olha: o toque à toa na tela (ou o dedo que treme) não tira do passeio.
        if ((p.arrasto += Math.abs(dx) + Math.abs(dy)) < 6) return;
        ficarLivre();
        if (movimento.ligado) movimento.deslocamento -= dx * giro;
        else { camera.guinada -= dx * giro; camera.inclinacao = Math.max(-1.4, Math.min(1.4, camera.inclinacao - dy * giro)); }
        p.x = e.clientX; p.y = e.clientY;
      } else {
        const nome = p.papel === "andar" ? "andar" : "olhar", r = comandos[nome].el.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy);
        if (d > RAIO) { dx *= RAIO / d; dy *= RAIO / d; }
        comandos[nome].v = [dx / RAIO, dy / RAIO];
        moverPino(nome, dx, dy);
      }
    });
    const soltar = e => {
      const p = ponteiros.get(e.pointerId);
      if (p && p.papel !== "olhar") { const nome = p.papel === "andar" ? "andar" : "olhar"; comandos[nome].v = [0, 0]; moverPino(nome, 0, 0); }
      ponteiros.delete(e.pointerId);
    };
    tela.addEventListener("pointerup", soltar); tela.addEventListener("pointercancel", soltar);
    tela.addEventListener("wheel", e => {
      e.preventDefault();
      const passoDaRoda = -Math.sign(e.deltaY) * .35;
      mover(Math.cos(camera.guinada) * passoDaRoda, Math.sin(camera.guinada) * passoDaRoda);
    }, { passive: false });

    // A tela cheia e o movimento do celular.
    const raiz = document.documentElement;
    const pedirTelaCheia = raiz.requestFullscreen ? o => raiz.requestFullscreen(o) : raiz.webkitRequestFullscreen ? () => raiz.webkitRequestFullscreen() : null;
    const telaCheia = () => { if (pedirTelaCheia) Promise.resolve().then(() => pedirTelaCheia({ navigationUI: "hide" })).catch(() => {}); };
    const naTelaCheia = () => $("telaCheia").classList.toggle("esconder", !pedirTelaCheia || !!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", naTelaCheia); document.addEventListener("webkitfullscreenchange", naTelaCheia);
    $("telaCheia").onclick = telaCheia;
    function avisar(texto) { const a = $("aviso"); a.textContent = texto; a.style.display = "block"; clearTimeout(avisar.t); avisar.t = setTimeout(() => a.style.display = "none", 6000); }
    // O movimento do celular: no caminho (reproduzindo ou parado numa câmera), o olhar é o do caminho mais o quanto o aparelho girou
    // desde que o caminho começou (girar o celular olha em volta sem sair do passeio); no LIVRE, o olhar segue o aparelho.
    const movimento = { ligado: false, aparelho: null, zero: null, deslocamento: 0, inclinacao: 0 };
    function ancorarMovimento() { movimento.zero = movimento.aparelho ? { ...movimento.aparelho } : null; }
    const mult = (a, b) => [a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1], a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
      a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    function aoOrientar(e) {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      // A conta do DeviceOrientationControls, com o Z para cima do Arquionie.
      const r = Math.PI / 180, x = e.beta * r / 2, y = e.alpha * r / 2, z = -e.gamma * r / 2;
      const c1 = Math.cos(x), c2 = Math.cos(y), c3 = Math.cos(z), s1 = Math.sin(x), s2 = Math.sin(y), s3 = Math.sin(z);
      let q = [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
      q = mult(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
      const daTela = -((screen.orientation ? screen.orientation.angle : window.orientation) || 0) * r / 2;
      q = mult(q, [0, 0, Math.sin(daTela), Math.cos(daTela)]);
      const [qx, qy, qz, qw] = q, tx = -2 * qy, ty = 2 * qx;
      const fx = qw * tx - qz * ty, fy = qw * ty + qz * tx, fz = -1 + qx * ty - qy * tx;
      movimento.aparelho = { guinada: Math.atan2(-fz, fx), inclinacao: Math.asin(Math.max(-1, Math.min(1, fy))) };
    }
    function ligarMovimento(ligar) {
      if (!ligar) { movimento.ligado = false; removeEventListener("deviceorientation", aoOrientar); $("giro").classList.remove("forte"); return; }
      if (!window.isSecureContext || !("DeviceOrientationEvent" in window)) { avisar("O movimento do celular precisa do endereço seguro (https)."); return; }
      const pedir = typeof DeviceOrientationEvent.requestPermission === "function" ? DeviceOrientationEvent.requestPermission() : Promise.resolve("granted");
      pedir.then(resposta => {
        if (resposta !== "granted") { if (toque) avisar("O celular não deixou usar o movimento."); return; }
        movimento.ligado = true; movimento.aparelho = null; movimento.zero = null;
        addEventListener("deviceorientation", aoOrientar);
        $("giro").classList.add("forte");
      }).catch(() => { if (toque) avisar("O celular não deixou usar o movimento."); });
    }
    $("giro").onclick = () => ligarMovimento(!movimento.ligado);
    if (!toque) $("giro").classList.add("esconder");

    // ---------------------------------------------------------------- o mapa
    const pisoDe = olhoZ => { let k = 0; for (let i = 0; i < tour.plantas.length; i++) if (tour.plantas[i].z <= olhoZ - alturaDoOlho + .6) k = i; return k; };
    let mapaAberto = false, pisoDoMapaGrande = 0;
    function desenharPlanta(cv, i, grande) {
      const pl = tour.plantas[i], img = plantas[i];
      if (!pl || !img) return null;
      const ctx = cv.getContext("2d"), escalaTela = Math.min(devicePixelRatio || 1, 2);
      const maxL = grande ? Math.min(innerWidth * .94, 1100) : toque ? 112 : 190, maxA = grande ? innerHeight * .76 : maxL * 1.25;
      const k = Math.min(maxL / img.width, maxA / img.height);
      cv.style.width = img.width * k + "px"; cv.style.height = img.height * k + "px";
      cv.width = Math.round(img.width * k * escalaTela); cv.height = Math.round(img.height * k * escalaTela);
      const e = k * escalaTela;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      const px = (x, y) => [(x - pl.origem[0]) / pl.celula * e, (pl.linhas - (y - pl.origem[1]) / pl.celula) * e];
      const proximo = tour.plantas[i + 1] ? tour.plantas[i + 1].z : Infinity;
      const nesteAndar = z => z - alturaDoOlho >= pl.z - .6 && z - alturaDoOlho < proximo - .6;
      if (trajeto) {
        ctx.strokeStyle = "rgba(231,99,83,.85)"; ctx.lineWidth = Math.max(1.5, 2.2 * escalaTela * (grande ? 1.4 : 1)); ctx.setLineDash([6 * escalaTela, 5 * escalaTela]);
        ctx.beginPath(); let dentro = false;
        for (let s = 0; s < trajeto.length; s += 6) {
          const [x, y] = px(trajeto[s], trajeto[s + 1]);
          if (nesteAndar(trajeto[s + 2])) { if (dentro) ctx.lineTo(x, y); else ctx.moveTo(x, y); dentro = true; } else dentro = false;
        }
        ctx.stroke(); ctx.setLineDash([]);
      }
      const r = (grande ? 11 : 7) * escalaTela;
      ctx.font = `700 ${(grande ? 11 : 8) * escalaTela}px "Segoe UI", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const pontos = [];
      paradas.forEach((p, n) => {
        if (!nesteAndar(p.olho[2])) return;
        const [x, y] = px(p.olho[0], p.olho[1]);
        ctx.fillStyle = "#794B49"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5 * escalaTela;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.fillText(String(n + 1), x, y + .5);
        pontos.push({ x: x / escalaTela, y: y / escalaTela, parada: n });
      });
      if (grande) {
        ctx.font = `600 ${11 * escalaTela}px "Segoe UI", sans-serif`; ctx.fillStyle = "#cfd5de";
        for (const a of pl.ambientes) { const [x, y] = px(a.x, a.y); ctx.fillText(a.nome, x, y - 16 * escalaTela); pontos.push({ x: x / escalaTela, y: y / escalaTela, ambiente: a }); }
      }
      if (pisoDe(camera.olho[2]) === i) {
        const [x, y] = px(camera.olho[0], camera.olho[1]), g = camera.guinada, abre = .55, alcance = (grande ? 46 : 22) * escalaTela;
        ctx.fillStyle = "rgba(231,99,83,.35)";
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(g + abre) * alcance, y - Math.sin(g + abre) * alcance); ctx.lineTo(x + Math.cos(g - abre) * alcance, y - Math.sin(g - abre) * alcance);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#E76353"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 * escalaTela;
        ctx.beginPath(); ctx.arc(x, y, (grande ? 7 : 5) * escalaTela, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      }
      return { pontos, pl, e, escalaTela };
    }
    let pontosDoMapaGrande = null;
    function desenharMapa() {
      if (!tour.plantas.length) return;
      desenharPlanta($("mapinha"), pisoDe(camera.olho[2]), false);
      if (mapaAberto) {
        pontosDoMapaGrande = desenharPlanta($("mapaGrande"), pisoDoMapaGrande, true);
        $("nomeDoPiso").textContent = tour.plantas[pisoDoMapaGrande].nome;
      }
    }
    function abrirMapa(abrir) {
      mapaAberto = abrir && tour.plantas.length > 0;
      $("grande").classList.toggle("esconder", !mapaAberto);
      if (mapaAberto) { pisoDoMapaGrande = pisoDe(camera.olho[2]); desenharMapa(); }
    }
    $("mapa").onclick = () => abrirMapa(true);
    $("fecharMapa").onclick = () => abrirMapa(false);
    $("pisoAbaixo").onclick = () => { pisoDoMapaGrande = Math.max(0, pisoDoMapaGrande - 1); desenharMapa(); };
    $("pisoAcima").onclick = () => { pisoDoMapaGrande = Math.min(tour.plantas.length - 1, pisoDoMapaGrande + 1); desenharMapa(); };
    $("mapaGrande").addEventListener("pointerup", e => {
      if (!pontosDoMapaGrande) return;
      const r = $("mapaGrande").getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let melhor = null, d0 = 34;
      for (const p of pontosDoMapaGrande.pontos) { const d = Math.hypot(p.x - x, p.y - y); if (d < d0) { d0 = d; melhor = p; } }
      if (!melhor) return;
      abrirMapa(false);
      // A câmera do passeio daquele ambiente; sem câmera, o meio dele.
      const n = melhor.parada ?? paradas.findIndex(p => p.nome === melhor.ambiente.nome);
      if (n >= 0) { peloPreto(() => { irAParada(n); estado = "parado"; pararEm = null; mostrarChegada(n); atualizarEstado(); }); return; }
      const a = melhor.ambiente, pl = pontosDoMapaGrande.pl;
      peloPreto(() => {
        const z = chao.chaoEm(a.x, a.y, pl.z);
        camera.olho = [a.x, a.y, (Number.isNaN(z) ? pl.z : z) + alturaDoOlho]; olhoNoChao = null;
        estado = "livre"; ambienteDoMapa = a.nome; atualizarEstado();
      });
    });

    // ---------------------------------------------------------------- cada quadro
    const velocidade = [0, 0];
    let antes = performance.now(), quadroDoMapa = 0;
    function quadro(agora) {
      const dt = Math.min(.1, (agora - antes) / 1000); antes = agora;
      if (estado === "reproduzindo") {
        let t = tempo + dt;
        if (pararEm !== null && t >= pararEm) {
          t = pararEm; estado = "parado"; pararEm = null; irAoTempo(t);
          ultimaParada = paradaEm(t); mostrarChegada(ultimaParada); atualizarEstado();
        } else if (t >= duracao) { irAoTempo(duracao); pausar(); }
        else { irAoTempo(t); const i = paradaEm(t); if (i !== ultimaParada) { ultimaParada = i; atualizarEstado(); } }
      }
      if (movimento.ligado && movimento.aparelho) {
        const ap = movimento.aparelho;
        if (estado === "livre") {
          camera.guinada = ap.guinada + movimento.deslocamento;
          camera.inclinacao = Math.max(-1.4, Math.min(1.4, ap.inclinacao + movimento.inclinacao));
        } else {
          if (!movimento.zero) movimento.zero = { ...ap };
          camera.guinada = doCaminho.guinada + (ap.guinada - movimento.zero.guinada);
          camera.inclinacao = Math.max(-1.4, Math.min(1.4, doCaminho.inclinacao + ap.inclinacao - movimento.zero.inclinacao));
        }
      }
      const olhar = comandos.olhar.v;
      if (olhar[0] || olhar[1]) {
        ficarLivre();
        const f = Math.hypot(olhar[0], olhar[1]) < .12 ? 0 : 1;
        if (movimento.ligado) movimento.deslocamento -= olhar[0] * 1.6 * dt * f;
        else { camera.guinada -= olhar[0] * 1.6 * dt * f; camera.inclinacao = Math.max(-1.4, Math.min(1.4, camera.inclinacao - olhar[1] * 1.1 * dt * f)); }
      }
      const vel = (teclas.has("ShiftLeft") || teclas.has("ShiftRight") ? 3.2 : 1.3) * dt;
      const f = [Math.cos(camera.guinada), Math.sin(camera.guinada)], d = [Math.sin(camera.guinada), -Math.cos(camera.guinada)];
      let px = 0, py = 0;
      const anda = (k, x, y) => { if (teclas.has(k)) { px += x * vel; py += y * vel; } };
      anda("KeyW", f[0], f[1]); anda("ArrowUp", f[0], f[1]); anda("KeyS", -f[0], -f[1]); anda("ArrowDown", -f[0], -f[1]);
      anda("KeyD", d[0], d[1]); anda("ArrowRight", d[0], d[1]); anda("KeyA", -d[0], -d[1]); anda("ArrowLeft", -d[0], -d[1]);
      // O comando de andar: sem efeito perto do meio, devagar até a metade e o passo de quem caminha (1,1 m/s) na borda, chegando
      // aos poucos à velocidade pedida.
      const a = comandos.andar.v, forca = Math.hypot(a[0], a[1]), MEIO = .15;
      const pedida = forca < MEIO ? 0 : Math.pow((Math.min(1, forca) - MEIO) / (1 - MEIO), 1.7) * 1.1;
      const alvo = forca < MEIO ? [0, 0] : [(f[0] * -a[1] + d[0] * a[0]) / forca * pedida, (f[1] * -a[1] + d[1] * a[0]) / forca * pedida];
      const k = Math.min(1, dt * 5);
      velocidade[0] += (alvo[0] - velocidade[0]) * k; velocidade[1] += (alvo[1] - velocidade[1]) * k;
      if (Math.hypot(velocidade[0], velocidade[1]) < .01 && pedida === 0) velocidade[0] = velocidade[1] = 0;
      px += velocidade[0] * dt; py += velocidade[1] * dt;
      mover(px, py);
      if (olhoNoChao !== null) camera.olho[2] += (olhoNoChao - camera.olho[2]) * Math.min(1, dt * 12);
      if (chegadaAte && agora > chegadaAte) { $("chegada").style.opacity = 0; chegadaAte = 0; }
      if (agora - quadroDoMapa > 120) { quadroDoMapa = agora; desenharMapa(); }

      // O campo: o horizontal do passeio, deitado; em pé, 80° na vertical (o horizontal de 90° ficaria estreito demais).
      const horizontal = (tour.campoHorizontal || 90) * Math.PI / 180;
      const vertical = aspecto >= 1 ? 2 * Math.atan(Math.tan(horizontal / 2) / aspecto) * 180 / Math.PI : 80;
      const ci = Math.cos(camera.inclinacao), frente = [f[0] * ci, f[1] * ci, Math.sin(camera.inclinacao)];
      const vp = multiplicar(projecao(vertical, aspecto), vista(camera.olho, frente));
      gl.viewport(0, 0, tela.width, tela.height);
      gl.clearColor(0.07, 0.08, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(ceu); gl.bindVertexArray(vaoCeu);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texturaFundo);
      gl.uniformMatrix4fv(u.inv, false, inverter(vp)); gl.uniform1f(u.direcao, tour.fundo.direcao * Math.PI / 180); gl.uniform1i(u.fundo, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(modelo); gl.bindVertexArray(vaoModelo);
      gl.uniformMatrix4fv(u.vp, false, vp); gl.uniform3fv(u.minimo, regMin); gl.uniform3fv(u.maximo, regMax); gl.uniform1i(u.luz, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      tour.paginas.forEach((p, i) => {
        gl.bindTexture(gl.TEXTURE_2D, texturas[i]);
        if (!p.lotes) { gl.drawArrays(gl.TRIANGLES, p.inicio, p.vertices); return; }
        // Cada lote com os vértices dele (o WebGL 2 não tem o vértice-base): o atributo começa no primeiro vértice do lote.
        for (const l of p.lotes) {
          gl.vertexAttribPointer(lp, 3, gl.UNSIGNED_SHORT, true, 10, l.vertice * 10);
          gl.vertexAttribPointer(lu, 2, gl.UNSIGNED_SHORT, true, 10, l.vertice * 10 + 6);
          gl.drawElements(gl.TRIANGLES, l.indices, gl.UNSIGNED_SHORT, l.indice * 2);
        }
      });
      requestAnimationFrame(quadro);
    }

    // A dica dos comandos, nos primeiros segundos.
    $("dica").innerHTML = toque ? "arraste a tela<br>para olhar" : "setas ou W A S D andam · arrastar olha · espaço reproduz · M abre o mapa";
    irAParada(0); ajustar(); atualizarEstado();
    requestAnimationFrame(quadro);
    return () => {
      for (const id of ["parada", "controles", "lado", "dica"]) $(id).classList.remove("esconder");
      if (tour.plantas.length) $("mapa").classList.remove("esconder");
      naTelaCheia();
      if (!toque) $("giro").classList.add("esconder");
      setTimeout(() => $("dica").classList.add("esconder"), 7000);
      mostrarChegada(0);
      return { telaCheia, ligarMovimento };
    };
  }

  carregar().then(pacote => {
    if (!pacote) return;
    const mostrar = iniciar(pacote);
    $("carga").textContent = "";
    $("barra").parentElement.classList.add("esconder");
    $("entrar").classList.remove("esconder");
    $("ajuda").textContent = toque && !document.documentElement.requestFullscreen && !document.documentElement.webkitRequestFullscreen
      ? "No iPhone, para a tela cheia: Compartilhar › Adicionar à Tela de Início, e abrir por lá." : "";
    $("entrar").onclick = () => {
      const { telaCheia, ligarMovimento } = mostrar();
      telaCheia();
      if (toque) ligarMovimento(true);
      $("abertura").remove();
    };
  }).catch(erro => { fechado("O tour não abriu", erro.message); console.error(erro); });
})();
