"use strict";
/*
  A página do cliente em arquionie.com.br/t/CÓDIGO (mockup docs/mockups/enviar-para-o-cliente.html do repositório do programa, aprovado
  por ÊDI em 11/10/2026; contrato no doc 65 de lá). Abre no vídeo, que guia o olhar; EXPLORAR O PROJETO leva ao tour (a maquete do
  Arquionie, num quadro desta página); as imagens num carrossel, a do meio maior. A marca é a do escritório (o alto e o rodapé). O
  cliente, sem conta, SOLICITA AJUSTES (o nome e os comentários, cada um com o alfinete no tour, enviados juntos) ou APROVA O PROJETO
  pelo termo do escritório: dois caminhos.
  Prova sem o servidor: ?prova=PASTA abre PASTA/abrir.json (o que o banco devolveria) com os arquivos em PASTA/arquivos/, e guarda as
  respostas só neste navegador.
*/
(() => {
  const $ = id => document.getElementById(id);
  // O banco e os arquivos públicos (nada aqui é segredo: a chave publicável é feita para o navegador).
  const SUPABASE_URL = "https://sowazotriildoeaxbhkl.supabase.co", CHAVE_PUBLICAVEL = "sb_publishable_aSoXh3xrkPi2T-cd0pslWw_Jj8n9xSY";
  const ARQUIVOS_URL = "https://tours.arquionie.com.br/";
  const pedidos = new URLSearchParams(location.search);
  const prova = pedidos.get("prova");
  const pastaDaProva = prova ? new URL(prova.endsWith("/") ? prova : prova + "/", location.href).href : null;
  const toque = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  const codigo = (location.pathname.match(/^\/t\/([A-Za-z0-9]{6})\/?$/) || [])[1]?.toUpperCase() || pedidos.get("codigo")?.toUpperCase() || "";

  const data = (iso, comHora = false) => {
    if (!iso) return "";
    const d = new Date(iso), dois = n => String(n).padStart(2, "0");
    return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}` + (comHora ? `, ${dois(d.getHours())}:${dois(d.getMinutes())}` : "");
  };
  const mb = b => b >= 1e9 ? `${(b / 1e9).toFixed(1).replace(".", ",")} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`;
  function nota(texto) {
    const n = $("nota"); n.textContent = texto; n.hidden = false;
    clearTimeout(nota.t); nota.t = setTimeout(() => { n.hidden = true; }, 3200);
  }
  function fechado(titulo, texto, escritorio) {
    $("carregando").hidden = true;
    $("fechadoTitulo").textContent = titulo; $("fechadoTexto").textContent = texto;
    if (escritorio?.logo) $("fechadoLogo").src = ARQUIVOS_URL + escritorio.logo; else $("fechadoLogo").remove();
    if (escritorio?.nome) document.title = escritorio.nome;
    $("fechado").hidden = false;
  }

  // ---------------------------------------------------------------- o banco (ou a prova)
  async function rpc(nome, args) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
      method: "POST", headers: { apikey: CHAVE_PUBLICAVEL, "Content-Type": "application/json" }, body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error("A apresentação não abriu agora. Tente de novo em instantes.");
    return r.json();
  }
  async function abrir() {
    if (pastaDaProva) {
      const d = await (await fetch(pastaDaProva + "abrir.json")).json();
      const guardado = JSON.parse(localStorage.getItem("prova:" + pastaDaProva) || "{}");
      if (guardado.pedidos) d.envio.pedidos = [...d.envio.pedidos, ...guardado.pedidos];
      if (guardado.aprovacao) { d.envio.aprovacao = guardado.aprovacao; d.envio.situacao = "aprovado"; }
      return { ...d, base: pastaDaProva + "arquivos/" };
    }
    if (!codigo) return { situacao: "inexistente" };
    const d = await rpc("apresentacao_abrir", { p_codigo: codigo });
    return { ...d, base: d.arquivos ? ARQUIVOS_URL + d.arquivos : null };
  }
  async function responder(corpo) {
    if (pastaDaProva) {
      const guardado = JSON.parse(localStorage.getItem("prova:" + pastaDaProva) || "{}");
      if (corpo.acao === "comentar") (guardado.pedidos ||= []).push({ nome: corpo.nome, em: new Date().toISOString(), comentarios: corpo.comentarios });
      else guardado.aprovacao = { nome: corpo.nome, em: new Date().toISOString() };
      localStorage.setItem("prova:" + pastaDaProva, JSON.stringify(guardado));
      return { ok: true, situacao: corpo.acao === "comentar" ? "ajustes" : "aprovado", em: new Date().toISOString() };
    }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/cliente`, {
      method: "POST", headers: { apikey: CHAVE_PUBLICAVEL, "Content-Type": "application/json" }, body: JSON.stringify({ ...corpo, codigo }),
    });
    if (!r.ok) return { ok: false, motivo: "Não deu para enviar agora. Confira a internet e tente de novo." };
    return r.json();
  }

  // ---------------------------------------------------------------- a cor do escritório
  function cores(hex) {
    const ok = /^#[0-9A-Fa-f]{6}$/.test(hex || "") ? hex : "#E76353";
    const c = [1, 3, 5].map(i => parseInt(ok.slice(i, i + 2), 16));
    const mistura = (alvo, f) => "#" + c.map(v => Math.round(v + (alvo - v) * f).toString(16).padStart(2, "0")).join("");
    const raiz = document.documentElement.style;
    raiz.setProperty("--cor", ok); raiz.setProperty("--cor-escura", mistura(0, .45)); raiz.setProperty("--cor-clara", mistura(255, .86));
  }

  // ---------------------------------------------------------------- os ícones do rodapé
  const ICONES = {
    instagram: '<svg viewBox="0 0 24 24"><path d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zm0 2a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H7zm5 3.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zm0 2a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM17.5 6a1 1 0 110 2 1 1 0 010-2z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24"><path d="M21.6 7.2a2.7 2.7 0 00-1.9-1.9C18 4.8 12 4.8 12 4.8s-6 0-7.7.5a2.7 2.7 0 00-1.9 1.9C2 8.9 2 12 2 12s0 3.1.4 4.8a2.7 2.7 0 001.9 1.9c1.7.5 7.7.5 7.7.5s6 0 7.7-.5a2.7 2.7 0 001.9-1.9c.4-1.7.4-4.8.4-4.8s0-3.1-.4-4.8zM10 15V9l5.2 3L10 15z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><path d="M14 8V6.5c0-.7.5-1 1-1h2V2h-3c-2.8 0-4 2-4 4.3V8H8v3.5h2V22h4V11.5h2.8L17.3 8H14z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24"><path d="M4.5 3.5a2 2 0 110 4 2 2 0 010-4zM3 9h3v12H3V9zm6 0h2.9v1.7c.4-.8 1.5-1.9 3.3-1.9 3.4 0 4 2.2 4 5.1V21h-3v-6.2c0-1.5 0-3.4-2.1-3.4s-2.4 1.6-2.4 3.3V21H9V9z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.8 11.9 11.9 0 004.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 001.8-1.3 2.3 2.3 0 00.2-1.3c-.1-.1-.2-.2-.4-.3z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M16.6 2h-3.3v13.2a2.9 2.9 0 11-2-2.8V9a6.2 6.2 0 104.9 6.1V8.6a7.8 7.8 0 004.6 1.5V6.8a4.6 4.6 0 01-4.2-4.8z"/></svg>',
    site: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.9 6h-3a15.7 15.7 0 00-1.4-3.6A8 8 0 0118.9 8zM12 4a14 14 0 011.9 4h-3.8A14 14 0 0112 4zM4.3 14a8.3 8.3 0 010-4h3.4a16.5 16.5 0 000 4H4.3zm.8 2h3a15.7 15.7 0 001.4 3.6A8 8 0 015.1 16zm3-8h-3a8 8 0 014.4-3.6A15.7 15.7 0 008.1 8zM12 20a14 14 0 01-1.9-4h3.8A14 14 0 0112 20zm2.3-6H9.7a14.6 14.6 0 010-4h4.6a14.6 14.6 0 010 4zm.2 5.6a15.7 15.7 0 001.4-3.6h3a8 8 0 01-4.4 3.6zm1.8-5.6a16.5 16.5 0 000-4h3.4a8.3 8.3 0 010 4h-3.4z"/></svg>',
    compartilhar: '<svg viewBox="0 0 24 24"><path d="M18 16a3 3 0 00-2.4 1.2l-6.9-3.5a3 3 0 000-1.4l6.9-3.5A3 3 0 1015 7l-6.9 3.5a3 3 0 100 3L15 17a3 3 0 103-1z"/></svg>',
  };
  const endereco = s => /^https?:\/\//i.test(s) ? s : "https://" + s.replace(/^\/+/, "");
  async function compartilhar(titulo) {
    const url = location.href.split("#")[0];
    if (toque && navigator.share) { try { await navigator.share({ title: titulo, url }); return; } catch { return; } }
    try { await navigator.clipboard.writeText(url); nota("Link copiado: é só colar para mandar."); } catch { prompt("Copie o link desta página:", url); }
  }

  // ---------------------------------------------------------------- a página
  let d, manifesto, base;
  async function carregar() {
    d = await abrir();
    if (d.situacao === "inexistente") {
      // Um tour no link de antes (o GERAR E PUBLICAR do passeio): a página dele.
      if (codigo && !pastaDaProva) {
        const t = await rpc("tour_abrir", { p_codigo: codigo }).catch(() => null);
        if (t && t.situacao !== "inexistente") { location.replace(`/tour/index.html?codigo=${codigo}`); return; }
      }
      return fechado("Apresentação não encontrada", "O link está errado ou a apresentação foi excluída. Confira o link com o escritório que mandou.");
    }
    if (d.situacao === "pausado") return fechado(d.nome, "Esta apresentação está pausada por enquanto. Fale com o escritório que mandou o link.", d.escritorio);
    if (d.situacao === "expirado") return fechado(d.nome, "Este material expirou. Fale com o escritório para receber de novo.", d.escritorio);
    base = d.base;
    manifesto = await (await fetch(base + d.envio.manifesto)).json();
    montar();
  }

  function montar() {
    const e = d.escritorio || {}, envio = d.envio;
    cores(e.cor);
    document.title = `${d.nome} · ${e.nome || "apresentação"}`;
    // O alto: o logo e o nome do escritório no canto, o projeto e a fase.
    if (e.logo) { $("logo").style.backgroundImage = `url("${ARQUIVOS_URL + e.logo}")`; $("logo").classList.add("imagem"); }
    else $("logo").textContent = (e.nome || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("");
    $("nomeEscritorio").textContent = e.nome || "";
    if (e.site) $("marca").href = endereco(e.site); else $("marca").removeAttribute("href");
    $("nomeProjeto").textContent = d.nome;
    const final = envio.fase === "final";
    // os nomes da fase desde 12/10/2026 (mockup enviar-no-painel do programa): ESTUDO e ENTREGA FINAL; no banco, 'aprovacao' e 'final'
    $("fase").textContent = final ? "ENTREGA FINAL" : `ESTUDO · ENVIO ${envio.numero} · ${data(envio.em)}`;
    $("fase").classList.toggle("final", final);
    atualizarSituacao();
    // O vídeo, o tour e as imagens, na ordem do mockup; o que o envio não tem não aparece.
    const v = manifesto.video;
    if (v && (v.hls || v.mp4)) {
      $("video").hidden = false;
      TocadorDoVideo($("player"), { hls: v.hls && base + v.hls, mp4: v.mp4 && base + v.mp4, capa: v.capa && base + v.capa,
        aoTrocar: q => { $("qualidade").textContent = q ? `qualidade ${q}` : ""; $("qualidade").hidden = !q; } });
      $("player").addEventListener("ended", () => irPara("explorar"));
    }
    if (manifesto.tour) {
      $("explorar").hidden = false;
      if (manifesto.tour.capa) $("capaTour").style.backgroundImage = `url("${base + manifesto.tour.capa}")`;
      const tamanho = Object.values(manifesto.tour.tamanhos || {}).reduce((s, t) => s + t, 0);
      $("tamanhoTour").textContent = tamanho ? `carrega uns ${mb(tamanho)}` : "";
      $("entrarTour").onclick = entrarNoTour;
    } else for (const b of document.querySelectorAll(".explorar")) b.hidden = true;
    if ((manifesto.imagens || []).length) { $("imagens").hidden = false; montarCarrossel(manifesto.imagens); }
    // O rodapé do escritório.
    const icones = $("icones");
    if (e.site) icones.insertAdjacentHTML("beforeend", e.logo
      ? `<a class="logoR" href="${endereco(e.site)}" target="_blank" rel="noopener" title="o site do escritório" style="background-image:url('${ARQUIVOS_URL + e.logo}')"></a>`
      : `<a href="${endereco(e.site)}" target="_blank" rel="noopener" title="o site do escritório">${ICONES.site}</a>`);
    for (const r of e.redes || []) {
      const nome = String(r.rede || "").toLowerCase();
      const a = document.createElement("a");
      a.href = endereco(r.endereco || ""); a.target = "_blank"; a.rel = "noopener"; a.title = r.rede;
      a.innerHTML = ICONES[nome] || ICONES.site;
      icones.append(a);
    }
    const share = document.createElement("button");
    share.type = "button"; share.title = "compartilhar esta página"; share.innerHTML = ICONES.compartilhar;
    share.onclick = () => compartilhar(document.title);
    icones.append(share);
    $("compartilharTopo").onclick = () => compartilhar(document.title);
    $("frase").textContent = e.frase || ""; $("titulo").textContent = e.titulo || ""; $("texto").textContent = e.texto || "";
    if (!e.frase && !e.titulo && !e.texto) document.querySelector(".rodapeEsc hr").hidden = true;
    $("ate").textContent = envio.expiraEm ? `Disponível até ${data(envio.expiraEm)}` : "";
    // O menu acompanha a parte que está na tela.
    for (const a of document.querySelectorAll("[data-ir]")) a.addEventListener("click", ev => {
      ev.preventDefault(); irPara(a.dataset.ir);
      // O EXPLORAR O PROJETO do vídeo já entra no tour; o do menu só leva até ele.
      if (a.classList.contains("explorar") && manifesto.tour && !$("quadroTour").src) entrarNoTour();
    });
    for (const s of ["video", "explorar", "imagens"].map($)) if (!s.hidden) observador.observe(s);
    $("carregando").hidden = true;
    for (const id of ["topo", "pagina", "rodape"]) $(id).hidden = false;
    montarRespostas();
  }
  const observador = new IntersectionObserver(itens => {
    for (const it of itens) if (it.isIntersecting) for (const a of document.querySelectorAll("#menu a")) a.classList.toggle("on", a.dataset.ir === it.target.id);
  }, { rootMargin: "-40% 0px -55% 0px" });
  function irPara(id) { const s = $(id); if (s && !s.hidden) s.scrollIntoView({ behavior: "smooth", block: "start" }); }

  // ---------------------------------------------------------------- a situação: os botões, o selo e o pedido
  function atualizarSituacao() {
    const envio = d.envio, final = envio.fase === "final", aprovada = envio.aprovacao;
    const responde = !final && !aprovada;
    $("acoes").hidden = !responde;
    $("comentar").hidden = !responde || !$("quadroTour").src;
    if (final) { $("selo").textContent = "✓ PROJETO APROVADO · APRESENTAÇÃO FINAL"; $("selo").hidden = false; }
    else if (aprovada) { $("selo").textContent = `✓ PROJETO APROVADO · por ${aprovada.nome} · ${data(aprovada.em, true)}`; $("selo").hidden = false; }
    else $("selo").hidden = true;
    const ped = (envio.pedidos || []).at(-1);
    if (ped && !final) {
      const n = ped.comentarios.length;
      $("pedido").textContent = `✎ AJUSTES SOLICITADOS · ${n} ${n === 1 ? "comentário" : "comentários"} de ${ped.nome} · ${data(ped.em)}`;
      $("pedido").hidden = false;
    }
  }

  // ---------------------------------------------------------------- o tour, num quadro desta página
  let tourPronto = false, comentando = false;
  function entrarNoTour() {
    const quadro = $("quadroTour");
    const envioUrl = base + d.envio.manifesto;
    quadro.src = `/tour/index.html?envio=${encodeURIComponent(envioUrl)}&embutido=1`;
    quadro.hidden = false;
    $("capaTour").hidden = true;
    atualizarSituacao();
    if (toque) {
      // No celular, o tour em tela cheia (com o giroscópio), e o ✕ SAIR DO TOUR volta à página.
      const t = $("tour");
      t.classList.add("cheio"); $("sairTour").hidden = false;
      (t.requestFullscreen || t.webkitRequestFullscreen || (() => {})).call(t)?.catch?.(() => {});
    }
  }
  $("sairTour").onclick = () => {
    $("tour").classList.remove("cheio"); $("sairTour").hidden = true;
    if (document.fullscreenElement) document.exitFullscreen?.();
  };
  const paraOTour = mensagem => { if (tourPronto) $("quadroTour").contentWindow.postMessage({ arquionie: true, ...mensagem }, "*"); };
  function ligarComentar(ligado) {
    comentando = ligado;
    $("comentar").classList.toggle("on", ligado);
    $("tour").classList.toggle("comentando", ligado);
    $("comentar").innerHTML = ligado ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg><span class="rotulo">PARAR DE COMENTAR</span>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg><span class="rotulo">COMENTAR</span>';
    $("comentar").setAttribute("aria-label", ligado ? "Parar de comentar" : "Comentar");
    $("avisoComentar").hidden = !ligado;
    paraOTour({ tipo: "comentar", ligado });
  }
  $("comentar").onclick = () => ligarComentar(!comentando);
  addEventListener("message", ev => {
    if (ev.source !== $("quadroTour").contentWindow || !ev.data?.arquionie) return;
    const m = ev.data;
    if (m.tipo === "pronto") { tourPronto = true; enviarAlfinetes(); if (comentando) paraOTour({ tipo: "comentar", ligado: true }); }
    if (m.tipo === "ponto" && comentando) {
      ligarComentar(false);
      rascunho.push({ texto: "", lugar: m.lugar });
      guardarRascunho(); abrirPainel(); desenharLista(true);
    }
    if (m.tipo === "alfinete") { abrirPainel(); const el = document.querySelector(`[data-n="${m.n}"]`); el?.scrollIntoView({ block: "center" }); el?.querySelector("textarea")?.focus(); }
  });

  // ---------------------------------------------------------------- SOLICITAR AJUSTES
  const chaveRascunho = () => `rascunho:${codigo || pastaDaProva}:${d.envio.numero}`;
  let rascunho = [];
  const guardarRascunho = () => { try { localStorage.setItem(chaveRascunho(), JSON.stringify({ nome: $("nomeAjustes").value, lista: rascunho })); } catch { } };
  const enviadosLista = () => (d.envio.pedidos || []).flatMap(p => p.comentarios.map(c => ({ ...c, nome: p.nome, em: p.em })));
  const ondeFica = l => l ? [l.ambiente, l.pavimento].filter(Boolean).join(" · ") || "no tour" : "no projeto em geral";
  function enviarAlfinetes() {
    const enviados = enviadosLista();
    const lista = [...enviados.map((c, i) => ({ n: i + 1, lugar: c.lugar, texto: c.texto, nome: c.nome, rascunho: false })),
      ...rascunho.map((c, i) => ({ n: enviados.length + i + 1, lugar: c.lugar, texto: c.texto, nome: $("nomeAjustes").value, rascunho: true }))]
      .filter(a => a.lugar?.ponto);
    paraOTour({ tipo: "alfinetes", lista });
  }
  function montarRespostas() {
    try {
      const g = JSON.parse(localStorage.getItem(chaveRascunho()) || "null");
      if (g) { rascunho = g.lista || []; $("nomeAjustes").value = g.nome || ""; }
    } catch { }
    $("nomeAprovar").value = $("nomeAjustes").value;
    $("botaoAjustes").onclick = () => { abrirPainel(); if (!rascunho.length) $("novoComentario").focus(); };
    $("fecharPainel").onclick = () => { $("painel").hidden = true; };
    $("nomeAjustes").oninput = () => { guardarRascunho(); conferirBotoes(); };
    $("novoComentario").onclick = () => {
      irPara("explorar");
      if (!$("quadroTour").src) entrarNoTour();
      ligarComentar(true);
      if (toque) $("painel").hidden = true;
    };
    $("semLugar").onclick = () => { rascunho.push({ texto: "", lugar: null }); guardarRascunho(); desenharLista(true); };
    $("descartar").onclick = () => {
      if (!rascunho.length || confirm("Descartar os comentários que ainda não foram enviados?")) { rascunho = []; guardarRascunho(); desenharLista(); }
    };
    $("enviarComentarios").onclick = enviarComentarios;
    $("botaoAprovar").onclick = abrirTermo;
    desenharLista();
  }
  function abrirPainel() { $("painel").hidden = false; desenharLista(); }
  function desenharLista(focarUltimo = false) {
    const enviados = enviadosLista();
    $("enviados").innerHTML = enviados.length ? `<div class="campo"><span>ENVIADOS AO ESCRITÓRIO (${enviados.length})</span></div>` : "";
    enviados.forEach((c, i) => {
      const el = document.createElement("div"); el.className = "it enviado"; el.dataset.n = i + 1;
      el.innerHTML = `<div class="n${c.lugar?.ponto ? "" : " geral"}">${i + 1}</div><div class="meio"><small></small><div></div></div>`;
      el.querySelector("small").textContent = `${c.nome} · ${data(c.em, true)} · ${ondeFica(c.lugar)}`;
      el.querySelector(".meio div").textContent = c.texto;
      $("enviados").append(el);
    });
    const lista = $("lista"); lista.innerHTML = "";
    rascunho.forEach((c, i) => {
      const n = enviados.length + i + 1;
      const el = document.createElement("div"); el.className = "it"; el.dataset.n = n;
      el.innerHTML = `<div class="n${c.lugar?.ponto ? "" : " geral"}">${n}</div><div class="meio"><small></small><textarea maxlength="2000" placeholder="Escreva o comentário…"></textarea><button class="tirar" type="button">tirar</button></div>`;
      el.querySelector("small").textContent = ondeFica(c.lugar);
      const caixa = el.querySelector("textarea");
      caixa.value = c.texto;
      caixa.oninput = () => { c.texto = caixa.value; guardarRascunho(); conferirBotoes(); enviarAlfinetes(); };
      el.querySelector(".tirar").onclick = () => { rascunho.splice(i, 1); guardarRascunho(); desenharLista(); };
      lista.append(el);
    });
    if (focarUltimo) lista.lastElementChild?.querySelector("textarea")?.focus();
    conferirBotoes(); enviarAlfinetes();
  }
  function conferirBotoes() {
    const prontos = rascunho.filter(c => c.texto.trim()).length;
    $("enviarComentarios").textContent = `ENVIAR OS COMENTÁRIOS${prontos ? ` (${prontos})` : ""}`;
    $("enviarComentarios").disabled = !prontos || !$("nomeAjustes").value.trim();
    $("painelTitulo").textContent = `SOLICITAR AJUSTES · ENVIO ${d.envio.numero}`;
    // Enquanto há comentário por enviar, o APROVAR fica apagado (ÊDI: comentar é pedir ajuste).
    const pendente = rascunho.some(c => c.texto.trim());
    $("botaoAprovar").disabled = pendente;
    $("botaoAprovar").title = pendente ? "Envie ou descarte os comentários antes de aprovar." : "";
  }
  async function enviarComentarios() {
    const nome = $("nomeAjustes").value.trim(), comentarios = rascunho.filter(c => c.texto.trim()).map(c => ({ texto: c.texto.trim(), ...(c.lugar ? { lugar: c.lugar } : {}) }));
    $("enviarComentarios").disabled = true; $("erroAjustes").hidden = true;
    const r = await responder({ acao: "comentar", envio: d.envio.numero, nome, comentarios }).catch(() => ({ ok: false, motivo: "Não deu para enviar agora." }));
    if (!r.ok) { $("erroAjustes").textContent = r.motivo || "Não deu para enviar agora."; $("erroAjustes").hidden = false; conferirBotoes(); return; }
    (d.envio.pedidos ||= []).push({ nome, em: new Date().toISOString(), comentarios });
    d.envio.situacao = "ajustes";
    rascunho = []; guardarRascunho();
    desenharLista(); atualizarSituacao();
    nota("Comentários enviados ao escritório.");
  }

  // ---------------------------------------------------------------- APROVAR O PROJETO: o termo do escritório
  function abrirTermo() {
    const termo = d.escritorio.termo;
    $("termoTitulo").textContent = `${termo.titulo} · ENVIO ${d.envio.numero}`;
    $("termoAbertura").textContent = termo.abertura || ""; $("termoAbertura").hidden = !termo.abertura;
    $("termoPergunta").textContent = termo.pergunta;
    const itens = $("termoItens"); itens.innerHTML = "";
    for (const texto of termo.itens) {
      const l = document.createElement("label"); l.className = "item";
      l.innerHTML = `<input type="checkbox"><span></span>`; l.querySelector("span").textContent = texto;
      l.querySelector("input").onchange = conferirTermo;
      itens.append(l);
    }
    $("termoDica").textContent = `O APROVAR acende com ${termo.itens.length === 1 ? "o item marcado" : `os ${termo.itens.length} itens marcados`} e o nome.`;
    $("erroAprovar").hidden = true;
    $("nomeAprovar").value ||= $("nomeAjustes").value;
    $("nomeAprovar").oninput = conferirTermo;
    $("voltarTermo").onclick = () => { $("fundoTermo").hidden = true; };
    $("confirmarAprovar").onclick = aprovar;
    $("fundoTermo").hidden = false;
    conferirTermo();
  }
  function conferirTermo() {
    const marcados = [...$("termoItens").querySelectorAll("input")].map(i => i.checked);
    $("confirmarAprovar").disabled = !marcados.every(Boolean) || !$("nomeAprovar").value.trim();
  }
  async function aprovar() {
    const itens = [...$("termoItens").querySelectorAll("input")].map(i => i.checked), nome = $("nomeAprovar").value.trim();
    $("confirmarAprovar").disabled = true;
    const r = await responder({ acao: "aprovar", envio: d.envio.numero, nome, itens }).catch(() => ({ ok: false }));
    if (!r.ok) { $("erroAprovar").textContent = r.motivo || "Não deu para aprovar agora. Confira a internet e tente de novo."; $("erroAprovar").hidden = false; conferirTermo(); return; }
    d.envio.aprovacao = { nome, em: r.em || new Date().toISOString() }; d.envio.situacao = "aprovado";
    $("fundoTermo").hidden = true; $("painel").hidden = true;
    atualizarSituacao(); ligarComentar(false);
    nota("Projeto aprovado. O escritório foi avisado.");
  }
  addEventListener("keydown", ev => {
    if (ev.key !== "Escape") return;
    if (!$("telaCheia").hidden) $("telaCheia").hidden = true;
    else if (!$("fundoTermo").hidden) $("fundoTermo").hidden = true;
  });

  // ---------------------------------------------------------------- as imagens: o carrossel e a tela cheia
  function montarCarrossel(imagens) {
    const caixa = $("carrossel"), f = imagens.map(im => {
      const el = document.createElement("div"); el.className = "f"; el.style.backgroundImage = `url("${base + im.arquivo}")`;
      caixa.append(el); return el;
    });
    let atual = 0;
    const pontos = $("pontos");
    imagens.forEach((_, i) => { const p = document.createElement("i"); p.onclick = () => ir(i); pontos.append(p); });
    function desenhar() {
      const W = caixa.clientWidth, H = caixa.clientHeight;
      // A do meio com 46% da largura (no celular, 80%), as dos lados a 60% e a 40% dela: as vizinhas inteiras, as de fora aparecendo.
      const centro = Math.min(W * (W < 760 ? .8 : .46), (H - 24) * 16 / 9), alt = centro * 9 / 16;
      f.forEach((el, i) => {
        let o = i - atual;
        if (o > imagens.length / 2) o -= imagens.length; if (o < -imagens.length / 2) o += imagens.length;
        const a = Math.abs(o), escala = a === 0 ? 1 : a === 1 ? .6 : .4;
        const largura = centro * escala, dx = o === 0 ? 0 : Math.sign(o) * (centro / 2 + (a === 1 ? largura / 2 - 26 : centro * .6 - 26 + largura / 2 - 18));
        el.style.width = largura + "px"; el.style.height = alt * escala + "px";
        el.style.transform = `translate(calc(-50% + ${dx}px), -50%)`;
        el.style.opacity = a === 0 ? 1 : a === 1 ? .82 : a === 2 ? .45 : 0;
        el.style.zIndex = 5 - a; el.style.pointerEvents = a > 2 ? "none" : "";
        el.classList.toggle("c", a === 0);
        el.onclick = () => a === 0 ? abrirCheia(i) : ir(i);
      });
      [...pontos.children].forEach((p, i) => p.classList.toggle("on", i === atual));
      $("legenda").textContent = `${imagens[atual].nome || "IMAGEM"} · ${atual + 1} de ${imagens.length} · ${toque ? "toque" : "clique"} para ver em tela cheia`;
    }
    const ir = i => { atual = (i + imagens.length) % imagens.length; desenhar(); };
    caixa.querySelector(".seta.e").onclick = () => ir(atual - 1);
    caixa.querySelector(".seta.d").onclick = () => ir(atual + 1);
    // O arrasto e o dedo passam.
    let x0 = null;
    caixa.addEventListener("pointerdown", ev => { x0 = ev.clientX; });
    caixa.addEventListener("pointerup", ev => { if (x0 !== null && Math.abs(ev.clientX - x0) > 40) ir(atual + (ev.clientX < x0 ? 1 : -1)); x0 = null; });
    // Redesenha quando o carrossel ganha tamanho: ele é montado com a página ainda escondida (largura zero, só o contorno branco aparecia;
    // ÊDI, 12/10/2026, no primeiro envio de verdade), e depois a cada mudança da largura.
    if (typeof ResizeObserver === "function") new ResizeObserver(desenhar).observe(caixa);
    else addEventListener("resize", desenhar);
    desenhar();
    // A tela cheia.
    let cheia = 0;
    function abrirCheia(i) { cheia = i; mostrarCheia(); $("telaCheia").hidden = false; }
    function mostrarCheia() {
      $("imagemCheia").src = base + imagens[cheia].arquivo;
      $("legendaCheia").textContent = `${imagens[cheia].nome || "IMAGEM"} · ${cheia + 1} de ${imagens.length}`;
    }
    const tc = $("telaCheia");
    tc.querySelector(".seta.e").onclick = () => { cheia = (cheia - 1 + imagens.length) % imagens.length; mostrarCheia(); };
    tc.querySelector(".seta.d").onclick = () => { cheia = (cheia + 1) % imagens.length; mostrarCheia(); };
    tc.querySelector(".fechar").onclick = () => { tc.hidden = true; ir(cheia); };
    addEventListener("keydown", ev => {
      if (tc.hidden) return;
      if (ev.key === "ArrowLeft") tc.querySelector(".seta.e").click();
      if (ev.key === "ArrowRight") tc.querySelector(".seta.d").click();
    });
    let tx = null;
    tc.addEventListener("pointerdown", ev => { tx = ev.clientX; });
    tc.addEventListener("pointerup", ev => { if (tx !== null && Math.abs(ev.clientX - tx) > 50) tc.querySelector(ev.clientX < tx ? ".seta.d" : ".seta.e").click(); tx = null; });
  }

  carregar().catch(e => { console.error(e); fechado("A apresentação não abriu", e.message || "Tente de novo em instantes."); });
})();
