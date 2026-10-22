"use strict";
/*
  O tour dos panoramas no link (ÊDI, 10/10/2026: "a gente realmente usaria somente os panoramas que a gente está exportando em alta
  qualidade ... e a gente conectaria eles"; "se a gente tivesse um outro meio de criar essa conexão entre um panorama e outro, sem
  precisar do take, para mim seria melhor ainda"). Lê o pacote do TourDosPanoramas (formato 5):
  - parado num ponto, a imagem é o panorama do EXPORTAR como saiu (as seis faces do cubo, 2048 px no computador, 1024 no celular);
  - os pontos no chão (como os da Matterport) são os outros panoramas que se enxergam dali; o toque leva até ele;
  - a passagem: o olho anda de verdade de um ponto ao outro dentro do modelo leve, pintado pelos dois panoramas projetados de onde
    cada um foi tirado (cada ponto do modelo toma a cor do panorama que o enxerga, pela distância guardada num cubo), sem vídeo;
  - o mapa, o ⏮ ⏭ (pela ordem das cenas) e o ▶ (passa de um a outro sozinho).
*/
window.TourDosPanoramas = async function (base, tour) {
  const $ = id => document.getElementById(id);
  // O que vem do pacote (o nome do projeto, dos lugares) entra na tela como texto, nunca como HTML (a checagem de segurança de 22/10/2026).
  const escapar = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const tela = $("tela");
  const gl = tela.getContext("webgl2", { antialias: true, stencil: true });
  if (!gl) throw new Error("Este navegador não mostra o tour (falta o WebGL 2).");
  const toque = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  document.body.classList.add("panoramas");
  const pans = tour.panoramas;
  // O lado das faces: 1024 no celular (a tela pequena não mostra mais que isso), 2048 no computador.
  const lado = toque ? tour.lados.celular : tour.lados.inteira;

  // ---------------------------------------------------------------- a carga
  let baixado = 0, total = 0;
  const mb = b => (b / 1048576).toFixed(b >= 10485760 ? 0 : 1).replace(".", ",");
  function andamento() {
    if (!total) return;
    $("barra").style.width = Math.min(100, 100 * baixado / total) + "%";
    $("carga").textContent = `carregando · ${mb(baixado)} de ${mb(total)} MB`;
  }
  async function baixar(nome, contar) {
    const r = await fetch(base + nome);
    if (!r.ok) throw new Error(`${nome}: ${r.status}`);
    const b = await r.arrayBuffer();
    if (contar) { baixado += b.byteLength; andamento(); }
    return b;
  }
  const bitmap = async b => createImageBitmap(new Blob([b], { type: "image/jpeg" }));
  const arquivos = tour.arquivos || {};
  const tamanho = n => arquivos[n] || 0;
  const faces = (i, l) => [0, 1, 2, 3, 4, 5].map(f => `${pans[i].arquivo}-${l}-${f}.jpg`);
  total = tamanho(tour.modelo.vertices) + tamanho(tour.modelo.indices) + pans.reduce((s, p) => s + tamanho(`${p.arquivo}-previa.jpg`), 0)
    + faces(0, lado).reduce((s, n) => s + tamanho(n), 0);
  document.title = tour.projeto;
  $("projeto").textContent = tour.projeto;
  $("passeio").textContent = `${pans.length} ${pans.length === 1 ? "panorama" : "panoramas"}`;
  andamento();
  const [vertices, indices, previas, primeira] = await Promise.all([
    baixar(tour.modelo.vertices, true), baixar(tour.modelo.indices, true),
    Promise.all(pans.map(p => baixar(`${p.arquivo}-previa.jpg`, true).then(bitmap))),
    Promise.all(faces(0, lado).map(n => baixar(n, true))),
  ]);

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
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }
  const anisotropia = gl.getExtension("EXT_texture_filter_anisotropic");
  // O cubo de um panorama: as seis faces (ImageBitmap) na ordem +X, −X, +Y, −Y, +Z, −Z, com os níveis (a face vista de longe no
  // zoom aberto) e o filtro de lado.
  function cubo(imagens) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
    imagens.forEach((img, f) => gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img));
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_CUBE_MAP, k, gl.CLAMP_TO_EDGE);
    if (anisotropia) gl.texParameterf(gl.TEXTURE_CUBE_MAP, anisotropia.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(anisotropia.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  }
  // A direção do mundo (z para cima) no cubo: (x, z, −y), a mesma conta das faces gravadas (TourDosPanoramas.NoMundo).
  const NO_CUBO = `vec3 noCubo(vec3 d) { return vec3(d.x, d.z, -d.y); }`;
  const ceu = programa(`#version 300 es
    in vec2 p; out vec2 q; void main() { q = p; gl_Position = vec4(p, 0.9999, 1.0); }`,
  `#version 300 es
    precision highp float; in vec2 q; uniform mat4 inv; uniform samplerCube a, b; uniform float mistura, alfa; out vec4 cor;
    ${NO_CUBO}
    void main() {
      vec4 p0 = inv * vec4(q, -1.0, 1.0), p1 = inv * vec4(q, 1.0, 1.0);
      vec3 d = noCubo(normalize(p1.xyz / p1.w - p0.xyz / p0.w));
      cor = vec4(mix(texture(a, d).rgb, texture(b, d).rgb, mistura), alfa);
    }`);
  // A passagem: cada ponto do modelo com a cor do panorama que o enxerga (a distância do ponto ao centro do panorama contra a guardada
  // no cubo das distâncias dele); os dois enxergando, a mistura pelo andar do olho.
  const passagem = programa(`#version 300 es
    in vec3 pos; uniform mat4 vp; uniform vec3 minimo, maximo; out vec3 mundo;
    void main() { mundo = mix(minimo, maximo, pos); gl_Position = vp * vec4(mundo, 1.0); }`,
  `#version 300 es
    precision highp float; in vec3 mundo; uniform samplerCube a, b, da, db; uniform vec3 ca, cb; uniform float mistura; out vec4 cor;
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
  // O cubo das distâncias de um panorama: o modelo desenhado do centro dele para cada face, a distância em três bytes.
  const distancias = programa(`#version 300 es
    in vec3 pos; uniform vec3 minimo, maximo, centro; uniform mat3 face; out vec3 rel;
    ${NO_CUBO}
    void main() {
      rel = mix(minimo, maximo, pos) - centro;
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
  // As linhas da matriz de cada face (o ponto da face sai de x = linha 1, y = linha 2 e a profundidade = linha 3 da direção no cubo); a
  // mat3 do GLSL é por colunas: a transposta.
  const FACES = [
    [[0, 0, -1], [0, -1, 0], [1, 0, 0]], [[0, 0, 1], [0, -1, 0], [-1, 0, 0]],
    [[1, 0, 0], [0, 0, 1], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, -1, 0]],
    [[1, 0, 0], [0, -1, 0], [0, 0, 1]], [[-1, 0, 0], [0, -1, 0], [0, 0, -1]],
  ].map(([l1, l2, l3]) => new Float32Array([l1[0], l2[0], l3[0], l1[1], l2[1], l3[1], l1[2], l2[2], l3[2]]));

  const regMin = tour.regiao.slice(0, 3), regMax = tour.regiao.slice(3, 6);
  const vaoCeu = gl.createVertexArray(); gl.bindVertexArray(vaoCeu);
  const tri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const lc = gl.getAttribLocation(ceu.p, "p"); gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 2, gl.FLOAT, false, 0, 0);
  // O modelo leve: x, y, z em 16 bits na região; os índices em 16 bits por lotes (cada lote com os vértices dele).
  const vaoModelo = gl.createVertexArray(); gl.bindVertexArray(vaoModelo);
  const bv = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bv); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const bi = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  // O modelo; sem a porta pela qual se passa (os lotes de cada porta levam o número dela).
  function desenharModelo(prog, semPorta = -1) {
    const l = gl.getAttribLocation(prog.p, "pos");
    gl.bindVertexArray(vaoModelo); gl.bindBuffer(gl.ARRAY_BUFFER, bv);
    gl.enableVertexAttribArray(l);
    for (const k of tour.modelo.lotes) {
      if (k.porta != null && k.porta === semPorta) continue;
      gl.vertexAttribPointer(l, 3, gl.UNSIGNED_SHORT, true, 6, k.vertice * 6);
      gl.drawElements(gl.TRIANGLES, k.indices, gl.UNSIGNED_SHORT, k.indice * 2);
    }
  }

  // Os cubos: a prévia de todos (já baixada), o inteiro dos que estão perto (até três na placa) e o das distâncias.
  const cubosPrevia = await Promise.all(previas.map(async strip => cubo(await Promise.all([0, 1, 2, 3, 4, 5].map(f => createImageBitmap(strip, f * tour.lados.previa, 0, tour.lados.previa, tour.lados.previa))))));
  const inteiros = new Map(), baixando = new Map(), guardados = new Map();
  function baixarInteiro(i) {
    if (guardados.has(i)) return Promise.resolve(guardados.get(i));
    if (!baixando.has(i)) baixando.set(i, Promise.all(faces(i, lado).map(n => baixar(n, false))).then(b => { guardados.set(i, b); baixando.delete(i); return b; }));
    return baixando.get(i);
  }
  async function subirInteiro(i, buffers) {
    if (inteiros.has(i)) return;
    const imagens = await Promise.all(buffers.map(bitmap));
    if (inteiros.has(i)) return;
    inteiros.set(i, cubo(imagens));
    imagens.forEach(b => b.close && b.close());
    // Só os três mais recentes ficam na placa (o de 2048 tem 128 MB com os níveis).
    while (inteiros.size > 3) { const [k, t] = inteiros.entries().next().value; if (k === atual || k === destino) { inteiros.delete(k); inteiros.set(k, t); continue; } gl.deleteTexture(t); inteiros.delete(k); }
  }
  const imagemDe = i => inteiros.get(i) || cubosPrevia[i];
  async function garantirInteiro(i) { await subirInteiro(i, await baixarInteiro(i)); }
  // Os guardados (os bytes das faces dos vizinhos): até dez panoramas.
  function guardarVizinhos(i) {
    for (const j of pontosDe(i).map(q => q.para).slice(0, 6)) baixarInteiro(j).catch(() => {});
    while (guardados.size > 10) { const k = guardados.keys().next().value; if (k === atual) break; guardados.delete(k); }
  }
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
    gl.useProgram(distancias.p);
    gl.uniform3fv(distancias.u.minimo, regMin); gl.uniform3fv(distancias.u.maximo, regMax); gl.uniform3fv(distancias.u.centro, pans[i].olho);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    for (let f = 0; f < 6; f++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, t, 0);
      gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix3fv(distancias.u.face, false, FACES[f]);
      desenharModelo(distancias);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    cubosDistancia.set(i, t);
    while (cubosDistancia.size > 6) { const [k, v] = cubosDistancia.entries().next().value; gl.deleteTexture(v); cubosDistancia.delete(k); }
    return t;
  }

  // ---------------------------------------------------------------- as contas da câmera
  const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const ponto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = a => { const c = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / c, a[1] / c, a[2] / c]; };
  function vista(olho, frente) {
    const f = unit(frente), d = unit(cruz(f, [0, 0, 1])), c = cruz(d, f);
    return [d[0], c[0], -f[0], 0, d[1], c[1], -f[1], 0, d[2], c[2], -f[2], 0, -ponto(d, olho), -ponto(c, olho), ponto(f, olho), 1];
  }
  function projecao(campoVertical, aspecto) {
    const f = 1 / Math.tan(campoVertical * Math.PI / 360), perto = .05, longe = 400;
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
  const rad = Math.PI / 180;
  const camera = { olho: pans[0].olho.slice(), guinada: pans[0].direcao * rad, inclinacao: 0, campo: 0 };
  let atual = 0, destino = null, passagem_ = null, preto = null;
  const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const chamada = (i) => `${String(i + 1).padStart(2, "0")} · ${pans[i].lugar}`;
  function atualizarEstado() {
    $("play").textContent = reproduzindo ? "❚❚" : "▶";
    $("estado").textContent = destino !== null ? `INDO A ${pans[destino].lugar}` : reproduzindo ? "REPRODUZINDO" : `${atual + 1} DE ${pans.length}`;
    $("parada").innerHTML = `${escapar(chamada(atual))}<span>${escapar(tour.projeto)}</span>`;
  }
  let chegadaAte = 0;
  function mostrarChegada(i) {
    const c = $("chegada");
    c.querySelector("span").textContent = `PANORAMA ${i + 1}`; c.querySelector("b").textContent = pans[i].lugar;
    c.style.opacity = 1; chegadaAte = performance.now() + 1800;
  }

  // Ir a um panorama: o vizinho pelo modelo (o olho anda até lá); o outro, longe ou atrás da parede, pela mistura das duas fotos com
  // um passo para a frente, já olhando para onde a cena dele olha.
  // Os pontos no chão de um panorama: os vizinhos (no chão deles) e os que se alcançam pela porta (na soleira dela).
  const pontosDe = i => [
    ...pans[i].vizinhos.map(j => ({ para: j, x: pans[j].olho[0], y: pans[j].olho[1], z: pans[j].chao })),
    ...(pans[i].portas || []).map(p => ({ para: p.para, x: p.via[0], y: p.via[1], z: p.via[2], via: p.via })),
  ];
  // O caminho pela porta: do olho até a porta (na altura do olho) e dela ao outro, com a quina arredondada a 45 cm da porta; pelo
  // comprimento (o olho anda por igual).
  function caminhoPelaPorta(a, b, via) {
    const v = [via[0], via[1], (a[2] + b[2]) / 2];
    const perto = p => { const d = distancia(p, v) || 1, k = Math.min(.45, d / 2) / d; return v.map((x, n) => x + (p[n] - x) * k); };
    const ent = perto(a), sai = perto(b), pontos = [];
    const N = 24;
    for (let n = 0; n <= N; n++) { const f = n / N; pontos.push(a.map((x, k) => x + (ent[k] - x) * f)); }
    for (let n = 1; n <= N; n++) { const f = n / N, g = 1 - f; pontos.push([0, 1, 2].map(k => g * g * ent[k] + 2 * g * f * v[k] + f * f * sai[k])); }
    for (let n = 1; n <= N; n++) { const f = n / N; pontos.push(sai.map((x, k) => x + (b[k] - x) * f)); }
    const acumulado = [0];
    for (let n = 1; n < pontos.length; n++) acumulado.push(acumulado[n - 1] + distancia(pontos[n - 1], pontos[n]));
    const total = acumulado[acumulado.length - 1];
    function em(e) {
      const alvo = e * total;
      let n = 1; while (n < acumulado.length - 1 && acumulado[n] < alvo) n++;
      const f = (alvo - acumulado[n - 1]) / ((acumulado[n] - acumulado[n - 1]) || 1);
      const p = pontos[n - 1].map((x, k) => x + (pontos[n][k] - x) * f);
      return { olho: p, guinada: Math.atan2(pontos[n][1] - pontos[n - 1][1], pontos[n][0] - pontos[n - 1][0]) };
    }
    return { em, total };
  }
  const voltaDe = (de, para) => Math.atan2(Math.sin(para - de), Math.cos(para - de));

  async function irPara(j, { olhar = false } = {}) {
    if (j === atual || destino !== null) return;
    destino = j; atualizarEstado();
    const vizinho = pans[atual].vizinhos.includes(j);
    const porta = !vizinho ? (pans[atual].portas || []).find(p => p.para === j) : null;
    const pronto = garantirInteiro(j).catch(() => {});
    // Espera um pouco o inteiro (o vizinho guardado já está aqui); senão, vai com a prévia e troca quando chegar.
    await Promise.race([pronto, new Promise(r => setTimeout(r, guardados.has(j) ? 1500 : 350))]);
    if (vizinho) {
      cuboDistancia(atual); cuboDistancia(j);
      const d = distancia(pans[atual].olho, pans[j].olho);
      // Indo para trás ou para o lado (o ⏭, o mapa), o olhar vira para onde se anda na primeira metade (como a Matterport).
      const g = Math.atan2(pans[j].olho[1] - pans[atual].olho[1], pans[j].olho[0] - pans[atual].olho[0]);
      const volta = Math.atan2(Math.sin(g - camera.guinada), Math.cos(g - camera.guinada));
      passagem_ = { de: atual, para: j, t0: performance.now(), duracao: Math.max(.8, Math.min(2, .55 + d * .16)) * 1000,
        virar: Math.abs(volta) > 50 * rad ? { de: camera.guinada, volta, inclinacao: camera.inclinacao } : null };
    } else if (porta) {
      // Pela porta: o olhar vira para onde se anda e segue o caminho; a foto do outro cômodo entra quando se passa pela porta.
      cuboDistancia(atual); cuboDistancia(j);
      const caminho = caminhoPelaPorta(pans[atual].olho, pans[j].olho, porta.via);
      passagem_ = { de: atual, para: j, t0: performance.now(), duracao: Math.max(1.2, Math.min(3, .7 + caminho.total * .2)) * 1000,
        caminho, guinadaDe: camera.guinada, inclinacaoDe: camera.inclinacao, porta: porta.porta ?? -1 };
    } else {
      passagem_ = { de: atual, para: j, t0: performance.now(), duracao: 1100, longe: true, guinadaPara: pans[j].direcao * rad };
    }
  }
  function chegar(j) {
    atual = j; destino = null; passagem_ = null;
    camera.olho = pans[j].olho.slice();
    mostrarChegada(j); atualizarEstado(); guardarVizinhos(j);
    garantirInteiro(j).catch(() => {});
    if (reproduzindo) proximoDoPasseio = performance.now() + 7000;
  }

  // ▶: passa de um panorama ao seguinte (pela ordem das cenas), girando devagar em cada um.
  let reproduzindo = false, proximoDoPasseio = 0;
  $("play").onclick = () => { reproduzindo = !reproduzindo; proximoDoPasseio = performance.now() + 5000; atualizarEstado(); };
  $("proxima").onclick = () => irPara((atual + 1) % pans.length, { olhar: true });
  $("anterior").onclick = () => irPara((atual - 1 + pans.length) % pans.length, { olhar: true });
  const parar = () => { if (reproduzindo) { reproduzindo = false; atualizarEstado(); } };

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
  // O campo vertical: deitado, o de 90° na horizontal; em pé, 80° na vertical; a roda e a pinça aproximam (de 30° a 100°).
  function campoVertical() {
    const base = aspecto >= 1 ? 2 * Math.atan(Math.tan(45 * rad) / aspecto) / rad : 80;
    return Math.max(25, Math.min(105, base + camera.campo));
  }

  // O olhar: o arrasto leva a imagem junto com o dedo (como no tour do sistema); o toque sem arrastar num ponto vai até ele.
  const ponteiros = new Map();
  const giroPorPonto = () => campoVertical() * rad / tela.clientHeight;
  tela.addEventListener("pointerdown", e => { ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, arrasto: 0 }); tela.setPointerCapture(e.pointerId); parar(); });
  tela.addEventListener("pointermove", e => {
    const p = ponteiros.get(e.pointerId);
    if (!p) return;
    if (ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()];
      const antes = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.clientX; p.y = e.clientY;
      const depois = Math.hypot(a.x - b.x, a.y - b.y);
      if (antes > 0) camera.campo = Math.max(-55, Math.min(25, camera.campo + (antes - depois) * .15));
      p.arrasto += 99;
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.arrasto += Math.abs(dx) + Math.abs(dy);
    if (p.arrasto < 5) return;
    const g = giroPorPonto();
    camera.guinada += dx * g;
    camera.inclinacao = Math.max(-1.45, Math.min(1.45, camera.inclinacao + dy * g));
    if (movimento.ligado) { movimento.deslocamento += dx * g; movimento.inclinacao += dy * g; }
    p.x = e.clientX; p.y = e.clientY;
  });
  const soltar = e => {
    const p = ponteiros.get(e.pointerId);
    ponteiros.delete(e.pointerId);
    if (p && p.arrasto < 5 && e.type === "pointerup") tocarNaVista(e.clientX, e.clientY);
  };
  tela.addEventListener("pointerup", soltar); tela.addEventListener("pointercancel", soltar);
  tela.addEventListener("wheel", e => { e.preventDefault(); camera.campo = Math.max(-55, Math.min(25, camera.campo + Math.sign(e.deltaY) * 5)); }, { passive: false });
  // O toque na vista, fora dos pontos: vai ao vizinho mais na direção do toque (até 20° dela), como a Matterport.
  let vpAtual = null;
  function tocarNaVista(x, y) {
    if (!vpAtual || destino !== null) return;
    const r = tela.getBoundingClientRect(), nx = (x - r.left) / r.width * 2 - 1, ny = 1 - (y - r.top) / r.height * 2;
    const inv = inverter(vpAtual);
    const um = (z) => { const v = [nx, ny, z, 1], o = [0, 0, 0, 0]; for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) o[l] += inv[k * 4 + l] * v[k]; return [o[0] / o[3], o[1] / o[3], o[2] / o[3]]; };
    const a = um(-1), b = um(1), d = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    let melhor = null, angulo = 20 * rad;
    for (const q of pontosDe(atual)) {
      const v = unit([q.x - camera.olho[0], q.y - camera.olho[1], q.z - camera.olho[2]]);
      const ang = Math.acos(Math.max(-1, Math.min(1, ponto(v, d))));
      if (ang < angulo) { angulo = ang; melhor = q.para; }
    }
    if (melhor !== null) irPara(melhor);
  }
  const teclas = new Set();
  addEventListener("keydown", e => {
    if (e.code === "Space") { e.preventDefault(); $("play").onclick(); return; }
    if (e.code === "KeyM") { abrirMapa(!mapaAberto); return; }
    if (e.code === "Escape" && mapaAberto) { abrirMapa(false); return; }
    if (e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); irAoDaFrente(); return; }
    teclas.add(e.code); parar();
  });
  addEventListener("keyup", e => teclas.delete(e.code));
  addEventListener("blur", () => teclas.clear());
  // ↑: o vizinho mais à frente (até 35° da direção do olhar).
  function irAoDaFrente() {
    let melhor = null, angulo = 35 * rad;
    for (const q of pontosDe(atual)) {
      const ang = Math.abs(voltaDe(camera.guinada, Math.atan2(q.y - camera.olho[1], q.x - camera.olho[0])));
      if (ang < angulo) { angulo = ang; melhor = q.para; }
    }
    if (melhor !== null) irPara(melhor);
  }

  // A tela cheia e o movimento do celular (o olhar segue o aparelho, mais o quanto se arrastou).
  const raiz = document.documentElement;
  const pedirTelaCheia = raiz.requestFullscreen ? o => raiz.requestFullscreen(o) : raiz.webkitRequestFullscreen ? () => raiz.webkitRequestFullscreen() : null;
  const telaCheia = () => { if (pedirTelaCheia) Promise.resolve().then(() => pedirTelaCheia({ navigationUI: "hide" })).catch(() => {}); };
  const naTelaCheia = () => $("telaCheia").classList.toggle("esconder", !pedirTelaCheia || !!(document.fullscreenElement || document.webkitFullscreenElement));
  document.addEventListener("fullscreenchange", naTelaCheia); document.addEventListener("webkitfullscreenchange", naTelaCheia);
  $("telaCheia").onclick = telaCheia;
  function avisar(texto) { const a = $("aviso"); a.textContent = texto; a.style.display = "block"; clearTimeout(avisar.t); avisar.t = setTimeout(() => a.style.display = "none", 6000); }
  const movimento = { ligado: false, aparelho: null, deslocamento: 0, inclinacao: 0 };
  const mult = (a, b) => [a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1], a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
    a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  function aoOrientar(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const r = rad, x = e.beta * r / 2, y = e.alpha * r / 2, z = -e.gamma * r / 2;
    const c1 = Math.cos(x), c2 = Math.cos(y), c3 = Math.cos(z), s1 = Math.sin(x), s2 = Math.sin(y), s3 = Math.sin(z);
    let q = [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
    q = mult(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
    const daTela = -((screen.orientation ? screen.orientation.angle : window.orientation) || 0) * r / 2;
    q = mult(q, [0, 0, Math.sin(daTela), Math.cos(daTela)]);
    const [qx, qy, qz, qw] = q, tx = -2 * qy, ty = 2 * qx;
    const fx = qw * tx - qz * ty, fy = qw * ty + qz * tx, fz = -1 + qx * ty - qy * tx;
    const ap = { guinada: Math.atan2(-fz, fx), inclinacao: Math.asin(Math.max(-1, Math.min(1, fy))) };
    if (!movimento.aparelho) { movimento.deslocamento = camera.guinada - ap.guinada; movimento.inclinacao = camera.inclinacao - ap.inclinacao; }
    movimento.aparelho = ap;
  }
  function ligarMovimento(ligar) {
    if (!ligar) { movimento.ligado = false; removeEventListener("deviceorientation", aoOrientar); $("giro").classList.remove("forte"); return; }
    if (!window.isSecureContext || !("DeviceOrientationEvent" in window)) { avisar("O movimento do celular precisa do endereço seguro (https)."); return; }
    const pedir = typeof DeviceOrientationEvent.requestPermission === "function" ? DeviceOrientationEvent.requestPermission() : Promise.resolve("granted");
    pedir.then(resposta => {
      if (resposta !== "granted") { if (toque) avisar("O celular não deixou usar o movimento."); return; }
      movimento.ligado = true; movimento.aparelho = null;
      addEventListener("deviceorientation", aoOrientar);
      $("giro").classList.add("forte");
    }).catch(() => { if (toque) avisar("O celular não deixou usar o movimento."); });
  }
  $("giro").onclick = () => ligarMovimento(!movimento.ligado);
  if (!toque) $("giro").classList.add("esconder");

  // ---------------------------------------------------------------- o mapa
  const plantas = await Promise.all((tour.plantas || []).map(p => baixar(p.imagem, false).then(b => createImageBitmap(new Blob([b], { type: "image/png" })))));
  const pisoDe = z => { let k = 0; for (let i = 0; i < tour.plantas.length; i++) if (tour.plantas[i].z <= z + .6) k = i; return k; };
  let mapaAberto = false, pisoDoMapaGrande = 0, pontosDoMapaGrande = null;
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
    const r = (grande ? 11 : 6) * escalaTela;
    ctx.font = `700 ${(grande ? 10 : 7) * escalaTela}px "Segoe UI", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const pontos = [];
    pans.forEach((p, n) => {
      if (pisoDe(p.chao) !== i) return;
      const [x, y] = px(p.olho[0], p.olho[1]);
      ctx.fillStyle = n === atual ? "#E76353" : "#794B49"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5 * escalaTela;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillText(String(n + 1), x, y + .5);
      pontos.push({ x: x / escalaTela, y: y / escalaTela, panorama: n });
    });
    if (pisoDe(pans[atual].chao) === i) {
      const [x, y] = px(camera.olho[0], camera.olho[1]), g = camera.guinada, abre = .55, alcance = (grande ? 46 : 22) * escalaTela;
      ctx.fillStyle = "rgba(231,99,83,.4)";
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(g + abre) * alcance, y - Math.sin(g + abre) * alcance); ctx.lineTo(x + Math.cos(g - abre) * alcance, y - Math.sin(g - abre) * alcance);
      ctx.closePath(); ctx.fill();
    }
    return { pontos };
  }
  function desenharMapa() {
    if (!tour.plantas || !tour.plantas.length) return;
    desenharPlanta($("mapinha"), pisoDe(pans[atual].chao), false);
    if (mapaAberto) { pontosDoMapaGrande = desenharPlanta($("mapaGrande"), pisoDoMapaGrande, true); $("nomeDoPiso").textContent = tour.plantas[pisoDoMapaGrande].nome; }
  }
  function abrirMapa(abrir) {
    mapaAberto = abrir && tour.plantas.length > 0;
    $("grande").classList.toggle("esconder", !mapaAberto);
    if (mapaAberto) { pisoDoMapaGrande = pisoDe(pans[atual].chao); desenharMapa(); }
  }
  $("mapa").onclick = () => abrirMapa(true);
  $("fecharMapa").onclick = () => abrirMapa(false);
  $("pisoAbaixo").onclick = () => { pisoDoMapaGrande = Math.max(0, pisoDoMapaGrande - 1); desenharMapa(); };
  $("pisoAcima").onclick = () => { pisoDoMapaGrande = Math.min(tour.plantas.length - 1, pisoDoMapaGrande + 1); desenharMapa(); };
  $("mapaGrande").addEventListener("pointerup", e => {
    if (!pontosDoMapaGrande) return;
    const r = $("mapaGrande").getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let melhor = null, d0 = 30;
    for (const p of pontosDoMapaGrande.pontos) { const d = Math.hypot(p.x - x, p.y - y); if (d < d0) { d0 = d; melhor = p; } }
    if (!melhor) return;
    abrirMapa(false); parar();
    irPara(melhor.panorama, { olhar: true });
  });

  // ---------------------------------------------------------------- os pontos no chão
  const botoes = [];
  function botao(n) {
    while (botoes.length <= n) {
      const b = document.createElement("button");
      b.style.display = "none";
      b.addEventListener("pointerdown", e => e.stopPropagation());
      b.onclick = e => { e.stopPropagation(); parar(); if (b.para != null) irPara(b.para); };
      $("pontos").appendChild(b);
      botoes.push(b);
    }
    return botoes[n];
  }
  function desenharPontos(vp, vertical) {
    const largura = tela.clientWidth, altura = tela.clientHeight, focal = altura / 2 / Math.tan(vertical * rad / 2);
    const pontos = destino === null ? pontosDe(atual) : [];
    const o = camera.olho;
    for (let i = pontos.length; i < botoes.length; i++) if (botoes[i].style.display !== "none") botoes[i].style.display = "none";
    for (let i = 0; i < pontos.length; i++) {
      const b = botao(i), q = pontos[i];
      if (b.para !== q.para) { b.para = q.para; b.title = chamada(q.para); }
      let ver = true, w = 0, sx = 0, sy = 0;
      if (ver) {
        const p = [q.x, q.y, q.z + .02];
        w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
        if (w < .2) ver = false;
        else {
          sx = ((vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12]) / w * .5 + .5) * largura;
          sy = (1 - ((vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13]) / w * .5 + .5)) * altura;
          if (sx < -60 || sx > largura + 60 || sy < -60 || sy > altura + 60) ver = false;
        }
      }
      if (!ver) { if (b.style.display !== "none") b.style.display = "none"; continue; }
      const d = Math.max(22, Math.min(120, .5 * focal / w));
      const h = Math.hypot(q.x - o[0], q.y - o[1]);
      const achatado = Math.max(.22, Math.min(1, (o[2] - q.z) / Math.hypot(h, o[2] - q.z)));
      b.style.display = "";
      b.style.width = b.style.height = `${d}px`;
      b.style.transform = `translate(${sx - d / 2}px, ${sy - d / 2}px) scaleY(${achatado})`;
    }
  }

  // ---------------------------------------------------------------- cada quadro
  let antes = performance.now(), quadroDoMapa = 0;
  const suave = s => s * s * (3 - 2 * s);
  function quadro(agora) {
    const dt = Math.min(.1, (agora - antes) / 1000); antes = agora;
    const vel = (teclas.has("ShiftLeft") || teclas.has("ShiftRight") ? 2.2 : 1.1) * dt;
    if (teclas.has("ArrowLeft") || teclas.has("KeyA")) camera.guinada += vel;
    if (teclas.has("ArrowRight") || teclas.has("KeyD")) camera.guinada -= vel;
    if (teclas.has("ArrowDown") || teclas.has("KeyS")) camera.inclinacao = Math.max(-1.45, camera.inclinacao - vel * .7);
    if (movimento.ligado && movimento.aparelho) {
      camera.guinada = movimento.aparelho.guinada + movimento.deslocamento;
      camera.inclinacao = Math.max(-1.45, Math.min(1.45, movimento.aparelho.inclinacao + movimento.inclinacao));
    }
    if (reproduzindo && destino === null) {
      if (!movimento.ligado) camera.guinada += .1 * dt;
      if (agora > proximoDoPasseio) { proximoDoPasseio = Infinity; irPara((atual + 1) % pans.length); }
    }
    let mistura = 0, de = atual, para = atual, pelaPassagem = false;
    if (passagem_) {
      const s = Math.min(1, (agora - passagem_.t0) / passagem_.duracao), e = suave(s);
      de = passagem_.de; para = passagem_.para;
      if (passagem_.longe) {
        // Longe (atrás da parede, o mapa, o ⏭): a primeira foto avança um pouco e a segunda aparece por cima dela, chegando, já olhando
        // como a cena dela.
        passagem_.e = e;
      } else if (passagem_.caminho) {
        const c = passagem_.caminho.em(e), r = suave(Math.min(1, s / .3));
        camera.olho = c.olho;
        camera.guinada = passagem_.guinadaDe + voltaDe(passagem_.guinadaDe, c.guinada) * r;
        camera.inclinacao = passagem_.inclinacaoDe * (1 - r);
        mistura = suave(Math.max(0, Math.min(1, (e - .3) / .4)));
        pelaPassagem = s < 1;
      } else {
        mistura = e;
        camera.olho = pans[de].olho.map((v, k) => v + (pans[para].olho[k] - v) * e);
        if (passagem_.virar) {
          const r = suave(Math.min(1, s / .55));
          camera.guinada = passagem_.virar.de + passagem_.virar.volta * r;
          camera.inclinacao = passagem_.virar.inclinacao * (1 - r);
        }
        pelaPassagem = s < 1;
      }
      if (s >= 1) {
        const j = passagem_.para;
        if (passagem_.longe) { camera.guinada = passagem_.guinadaPara; camera.inclinacao = 0; }
        chegar(j); de = para = j; mistura = 0; pelaPassagem = false;
      }
    }
    if (chegadaAte && agora > chegadaAte) { $("chegada").style.opacity = 0; chegadaAte = 0; }
    if (agora - quadroDoMapa > 150) { quadroDoMapa = agora; desenharMapa(); }

    const vertical = campoVertical();
    const ci = Math.cos(camera.inclinacao), frente = [Math.cos(camera.guinada) * ci, Math.sin(camera.guinada) * ci, Math.sin(camera.inclinacao)];
    const vp = multiplicar(projecao(vertical, aspecto), vista(camera.olho, frente));
    vpAtual = vp;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, tela.width, tela.height);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // O fundo: o panorama (ou os dois, na passagem, pela direção; o modelo cobre o que ele tem).
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(ceu.p); gl.bindVertexArray(vaoCeu);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, imagemDe(de));
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_CUBE_MAP, imagemDe(para));
    gl.uniformMatrix4fv(ceu.u.inv, false, inverter(vp)); gl.uniform1i(ceu.u.a, 0); gl.uniform1i(ceu.u.b, 1);
    gl.uniform1f(ceu.u.mistura, mistura); gl.uniform1f(ceu.u.alfa, 1);
    if (passagem_ && passagem_.longe) {
      const e = passagem_.e || 0;
      // A primeira, avançando (o campo fecha 12°); a segunda por cima, do campo fechado ao normal, na direção da cena dela.
      gl.uniformMatrix4fv(ceu.u.inv, false, inverter(multiplicar(projecao(vertical - 12 * e, aspecto), vista(camera.olho, frente))));
      gl.uniform1f(ceu.u.mistura, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const g = passagem_.guinadaPara, outra = [Math.cos(g), Math.sin(g), 0];
      gl.uniformMatrix4fv(ceu.u.inv, false, inverter(multiplicar(projecao(vertical - 12 * (1 - e), aspecto), vista(pans[para].olho, outra))));
      gl.uniform1f(ceu.u.mistura, 1); gl.uniform1f(ceu.u.alfa, e);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    if (pelaPassagem) {
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      gl.useProgram(passagem.p);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_CUBE_MAP, cuboDistancia(de));
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_CUBE_MAP, cuboDistancia(para));
      gl.uniform1i(passagem.u.a, 0); gl.uniform1i(passagem.u.b, 1); gl.uniform1i(passagem.u.da, 2); gl.uniform1i(passagem.u.db, 3);
      gl.uniformMatrix4fv(passagem.u.vp, false, vp); gl.uniform3fv(passagem.u.minimo, regMin); gl.uniform3fv(passagem.u.maximo, regMax);
      gl.uniform3fv(passagem.u.ca, pans[de].olho); gl.uniform3fv(passagem.u.cb, pans[para].olho); gl.uniform1f(passagem.u.mistura, mistura);
      desenharModelo(passagem, passagem_ && passagem_.porta != null ? passagem_.porta : -1);
      gl.viewport(0, 0, tela.width, tela.height);
    }
    gl.activeTexture(gl.TEXTURE0);
    desenharPontos(vp, vertical);
    requestAnimationFrame(quadro);
  }

  // O primeiro panorama inteiro antes de entrar; os vizinhos dele em seguida.
  await subirInteiro(0, primeira);
  guardarVizinhos(0);
  $("dica").innerHTML = toque ? "arraste para olhar<br>toque nos pontos do chão para andar" : "arraste para olhar · clique nos pontos do chão para andar · ↑ vai em frente · M abre o mapa";
  ajustar(); atualizarEstado();
  // Conferência: ?panorama=N&olhar=guinada,inclinação (graus) abre noutro ponto; ?ir=M já vai dele ao M (a passagem).
  const pedidos = new URLSearchParams(location.search);
  if (pedidos.get("panorama")) { const n = +pedidos.get("panorama") - 1; if (n >= 0 && n < pans.length) { await garantirInteiro(n); chegar(n); $("chegada").style.opacity = 0; } }
  if (pedidos.get("olhar")) { const [g, i] = pedidos.get("olhar").split(",").map(Number); camera.guinada = g * rad; camera.inclinacao = (i || 0) * rad; }
  requestAnimationFrame(quadro);
  if (pedidos.get("ir")) setTimeout(() => irPara(+pedidos.get("ir") - 1), 300);
  window.__tour = { irPara, camera, get atual() { return atual; }, get passagem() { return passagem_; } };
  return () => {
    for (const id of ["parada", "controles", "lado", "dica"]) $(id).classList.remove("esconder");
    if (tour.plantas && tour.plantas.length) $("mapa").classList.remove("esconder");
    naTelaCheia();
    if (!toque) $("giro").classList.add("esconder");
    setTimeout(() => $("dica").classList.add("esconder"), 7000);
    mostrarChegada(atual);
    return { telaCheia, ligarMovimento };
  };
};
