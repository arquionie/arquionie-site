// O e-mail das campanhas (plano 18 do repositório do plugin): o layout que o Palheta Flow usava desde 12/10/2026 — o de
// sempre e o de PROMOÇÃO, com a "cara de Black Friday" que o ÊDI pediu —, com a marca e as cores do Arquionie, e o link
// de descadastro assinado. Usado pela função campanhas (o lote do pg_cron e o TESTE PARA MIM).

export const SITE = Deno.env.get("SITE_URL") ?? "https://www.arquionie.com.br";
export const WHATSAPP = (Deno.env.get("WHATSAPP_NUMERO") ?? "5511991961580").replace(/\D/g, "");

const TERRACOTA = "#A9513F", CORAL = "#D47263", ESCURO = "#1A1F25";

const escapar = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const brl = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });

const zap = (texto: string) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;

// Assinatura do link de descadastro: HMAC-SHA256 do e-mail com o segredo das campanhas, 32 sinais em hexadecimal.
export async function assinarEmail(email: string, segredo: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export const linkDescadastro = (funcoes: string, email: string, sig: string) =>
  `${funcoes}/campanhas?descadastrar=${encodeURIComponent(email.trim().toLowerCase())}&s=${sig}`;

// A oferta como a gestão grava (chamada, de, por, parcelas, parcela, validoAte "AAAA-MM-DD", whatsapp = a mensagem).
export type Oferta = { chamada?: string; de: number; por: number; parcelas?: number; parcela?: number; validoAte?: string; whatsapp: string };

export function lerOferta(o: unknown): Oferta | null {
  if (!o || typeof o !== "object") return null;
  const x = o as Record<string, unknown>;
  const de = Number(x.de), por = Number(x.por);
  if (!(de > 0) || !(por > 0) || por >= de) return null;
  const parcelas = Math.round(Number(x.parcelas) || 0), parcela = Number(x.parcela) || 0;
  const valido = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(x.validoAte ?? ""));
  return {
    de, por,
    chamada: String(x.chamada ?? "").trim().toUpperCase().slice(0, 40) || undefined,
    parcelas: parcelas > 1 && parcela > 0 ? parcelas : undefined,
    parcela: parcelas > 1 && parcela > 0 ? parcela : undefined,
    validoAte: valido ? `${valido[3]}/${valido[2]}` : undefined,
    whatsapp: String(x.whatsapp ?? "").trim().slice(0, 500) || "Olá! Vi a promoção do Arquionie PRO e quero aproveitar.",
  };
}

// {nome} {cupom} {desconto} trocados; parágrafo por linha em branco; **texto** em negrito. O assunto também troca as variáveis.
export function trocar(texto: string, nome: string, cupom?: string | null, desconto?: number | null) {
  const primeiro = (nome || "").trim().split(/\s+/)[0];
  const nomeBonito = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : "";
  return texto.replaceAll("{nome}", nomeBonito || "arquiteto(a)").replaceAll("{cupom}", cupom ?? "").replaceAll("{desconto}", desconto ? String(desconto) : "");
}

export function montarEmail(o: { nome: string; mensagem: string; cupom?: string | null; desconto?: number | null; oferta?: unknown; descadastro: string }) {
  const of = lerOferta(o.oferta);
  const corpo = escapar(trocar(o.mensagem, o.nome, o.cupom, o.desconto))
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:#111;font-weight:800">$1</strong>`)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;color:#333;font-size:${of ? 16 : 15}px;line-height:1.65">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  const cupom = o.cupom
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fbf1ee;border:2px dashed ${CORAL};margin:8px 0 24px">
        <tr><td style="padding:20px 24px;text-align:center">
          <p style="margin:0 0 4px;color:#8a5a50;font-size:11px;text-transform:uppercase;letter-spacing:1px">Seu cupom${o.desconto ? ` de ${o.desconto}% de desconto` : ""}</p>
          <p style="margin:0;color:${TERRACOTA};font-size:30px;font-weight:800;letter-spacing:3px">${escapar(o.cupom)}</p>
        </td></tr></table>`
    : "";

  const moldura = (miolo: string) => `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f3f5;font-family:Inter,'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3f5;padding:32px 0"><tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff">
${miolo}
      <tr><td style="padding:18px 32px;background:#fafafa;border-top:1px solid #eee;text-align:center">
        <p style="margin:0 0 6px;color:#999;font-size:11px">Arquionie&trade; &bull; arquionie.com.br (antigo Palheta Flow)</p>
        <p style="margin:0;color:#aaa;font-size:10px">Você recebeu este e-mail porque baixou o Palheta Flow ou pediu as novidades do Arquionie.
          <a href="${o.descadastro}" style="color:#aaa">Não quero mais receber</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  if (!of) {
    const url = o.cupom ? zap(`Olá! Quero o Arquionie PRO com o cupom ${o.cupom}.`) : SITE;
    const rotulo = o.cupom ? `QUERO O PRO${o.desconto ? ` COM ${o.desconto}% OFF` : ""}` : "ABRIR O SITE DO ARQUIONIE";
    return moldura(`
      <tr><td style="background:${ESCURO};padding:26px 32px;text-align:center">
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:2px">ARQUIONIE&trade;</h1>
        <p style="margin:6px 0 0;color:${CORAL};font-size:13px">o programa e o plugin para Revit</p>
      </td></tr>
      <tr><td style="padding:30px 32px 24px">
        ${corpo}${cupom}
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="${url}" style="display:inline-block;background:${TERRACOTA};color:#ffffff;text-decoration:none;padding:14px 40px;font-size:15px;font-weight:700;letter-spacing:0.5px">${rotulo}</a>
        </td></tr></table>
      </td></tr>`);
  }

  const pct = Math.round((1 - of.por / of.de) * 100);
  const ate = of.validoAte ? `SÓ ATÉ ${of.validoAte}` : "POR TEMPO LIMITADO";
  return moldura(`
      <tr><td style="background:${TERRACOTA};padding:10px 16px;text-align:center">
        <p style="margin:0;color:#ffffff;font-size:13px;font-weight:800;letter-spacing:2px">&#9200; ${ate} &#9200;</p>
      </td></tr>
      <tr><td style="background:#111111;padding:34px 24px 30px;text-align:center">
        <p style="margin:0 0 10px;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:4px">ARQUIONIE&trade; PRO</p>
        ${of.chamada ? `<p style="margin:0 0 4px;color:#ffffff;font-size:26px;font-weight:900;letter-spacing:1px;line-height:1.15">${escapar(of.chamada)}</p>` : ""}
        <p style="margin:0;color:${CORAL};font-size:76px;font-weight:900;line-height:1;letter-spacing:-2px">${pct}% OFF</p>
        <p style="margin:12px 0 0;color:#bbbbbb;font-size:14px">na licença PRO anual: o programa e o plugin para Revit</p>
      </td></tr>
      <tr><td style="padding:30px 32px 8px">${corpo}</td></tr>
      <tr><td style="padding:0 32px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fbf1ee;border:3px solid ${TERRACOTA}">
          <tr><td style="padding:24px 20px;text-align:center">
            <p style="margin:0;color:#888;font-size:18px">de <s style="color:#888">${brl(of.de)}</s> por apenas</p>
            <p style="margin:4px 0 0;color:${TERRACOTA};font-size:56px;font-weight:900;line-height:1">${brl(of.por)}</p>
            ${of.parcelas ? `<p style="margin:10px 0 0;color:#333;font-size:15px">à vista ou <strong>${of.parcelas}x de ${brl(of.parcela!)}</strong> no cartão de crédito</p>` : ""}
            <p style="margin:14px 0 0"><span style="color:#ffffff;background:#111111;display:inline-block;padding:6px 14px;font-size:12px;font-weight:800;letter-spacing:1px">ECONOMIA DE ${brl(of.de - of.por)}</span></p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 32px 8px">
        <a href="${zap(of.whatsapp)}" style="display:block;background:${TERRACOTA};color:#ffffff;text-decoration:none;padding:20px 16px;font-size:18px;font-weight:800;letter-spacing:0.5px;text-align:center">QUERO APROVEITAR AGORA NO WHATSAPP</a>
        <p style="margin:12px 0 0;color:${TERRACOTA};font-size:13px;font-weight:800;text-align:center;letter-spacing:1px">${ate} &bull; DEPOIS VOLTA PARA ${brl(of.de)}</p>
      </td></tr>
      <tr><td style="padding:16px 32px 20px">${cupom}</td></tr>`);
}
