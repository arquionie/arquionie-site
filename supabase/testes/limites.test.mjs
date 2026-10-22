// Teste do LIMITE POR ENDEREÇO (migração 20261022000000_limite_por_endereco.sql) num Postgres local (PGlite): os códigos que só contam
// os erros, o cupom, o pedido do PRO, a denúncia, o limite_somar das funções do servidor, o IPv6 pela rede /64 e a impressão no lugar
// do endereço. Não toca no Supabase. Rodar da raiz do site:
//   npm i --no-save @electric-sql/pglite && node supabase/testes/limites.test.mjs
const banco = await import("./banco.test.mjs"); // aplica as migrações e roda o teste do banco antes
const { chamar, tentar, novaConta, db } = banco;
let certos = 0; const ruins = [];
const confere = (c, m) => { if (c) certos++; else { ruins.push(m); console.log("  FALHOU: " + m); } };

// Chama como o navegador de um endereço: o Supabase passa os cabeçalhos do pedido ao banco em request.headers.
async function chamarDe(ip, papel, nome, args = {}) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${papel}`);
    if (ip) await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ "x-forwarded-for": `${ip}, 10.0.0.9` })]);
    const k = Object.keys(args);
    const r = await tx.query(`select public.${nome}(${k.map((x, i) => `${x} => $${i + 1}`).join(", ")}) as r`,
      k.map((x) => (args[x] !== null && typeof args[x] === "object" ? JSON.stringify(args[x]) : args[x])));
    return r.rows[0].r;
  });
}
const vezes = async (n, f) => { let r; for (let i = 0; i < n; i++) r = await f(i); return r; };

console.log("\n1. Os códigos: só os erros contam, e passou de 30 nem o certo abre daquele endereço");
const juliana = await novaConta("juliana.limite@exemplo.com.br");
const form = (await chamar("authenticated", juliana, "comercial_iniciar", { p_modelo: "arquitetura" })).formularios[0];
let r = await vezes(20, () => chamarDe("200.1.1.1", "anon", "comercial_formulario_abrir", { p_codigo: form.codigo }));
confere(r.situacao === "aberto", "o código certo abre 20 vezes sem somar nada: " + r.situacao);
r = await vezes(30, (i) => chamarDe("200.1.1.1", "anon", "apresentacao_abrir", { p_codigo: "ZZZZ" + i }));
confere(r.situacao === "inexistente", "os 30 primeiros erros respondem inexistente: " + r.situacao);
r = await chamarDe("200.1.1.1", "anon", "tour_abrir", { p_codigo: "ZZZZZZ" });
confere(r.situacao === "limite", "o 31º erro, noutra porta de código, já é limite: " + r.situacao);
r = await chamarDe("200.1.1.1", "anon", "comercial_formulario_abrir", { p_codigo: form.codigo });
confere(r.situacao === "limite", "e o código certo também não abre daquele endereço: " + r.situacao);
for (const nome of ["apresentacao_situacao", "comercial_proposta_abrir"]) {
  r = await chamarDe("200.1.1.1", "anon", nome, { p_codigo: "ZZZZZZ" });
  confere(r.situacao === "limite", `${nome} também para: ` + r.situacao);
}
r = await chamarDe("200.1.1.1", "anon", "comercial_proposta_aceitar", { p_codigo: "ZZZZZZZZ", p_nome: "Fulano de Tal", p_concordo: true });
confere(r.ok === false && /Muitas tentativas/.test(r.motivo), "o aceite também para: " + JSON.stringify(r));
r = await chamarDe("200.1.1.2", "anon", "comercial_formulario_abrir", { p_codigo: form.codigo });
confere(r.situacao === "aberto", "o vizinho de endereço continua abrindo: " + r.situacao);
r = await vezes(40, (i) => chamarDe(null, "anon", "apresentacao_abrir", { p_codigo: "SEM" + i }));
confere(r.situacao === "inexistente", "sem endereço (o Supabase não passou), não há limite: " + r.situacao);

console.log("\n2. O IPv6 conta pela rede /64");
await vezes(30, (i) => chamarDe(`2804:14c:65a0:4000::${(i + 1).toString(16)}`, "anon", "tour_abrir", { p_codigo: "Y" + i }));
r = await chamarDe("2804:14c:65a0:4000:ffff:1:2:3", "anon", "tour_abrir", { p_codigo: "YYYYYY" });
confere(r.situacao === "limite", "trocar o fim do IPv6 não zera o limite: " + r.situacao);
r = await chamarDe("2804:14c:65a0:4001::1", "anon", "tour_abrir", { p_codigo: "YYYYYY" });
confere(r.situacao === "inexistente", "outra rede /64 conta à parte: " + r.situacao);

console.log("\n3. O cupom do /comprar");
await db.query(`insert into public.cupons (codigo, desconto) values ('LIMITE10', 10) on conflict do nothing`);
r = await vezes(30, (i) => chamarDe("200.2.2.2", "anon", "cupom_conferir", { p_codigo: "ERRADO" + i }));
confere(r.valido === false && !r.limite, "30 cupons errados respondem só não vale: " + JSON.stringify(r));
r = await chamarDe("200.2.2.2", "anon", "cupom_conferir", { p_codigo: "limite10" });
confere(r.valido === false && r.limite === true, "o 31º, mesmo certo, é limite: " + JSON.stringify(r));
r = await chamarDe("200.2.2.3", "anon", "cupom_conferir", { p_codigo: "limite10" });
confere(r.valido === true && r.desconto === 10, "de outro endereço, o cupom certo vale: " + JSON.stringify(r));

console.log("\n4. O pedido do PRO: 6 por hora de cada endereço (a trava geral era 60 para o site inteiro)");
const pedido = (i) => ({ p_produto: "plugin", p_periodo: "mensal", p_nome: "Cliente " + i, p_email: `cliente${i}@exemplo.com.br`,
  p_whatsapp: "11999990000" });
r = await vezes(6, (i) => chamarDe("200.3.3.3", "anon", "pedido_criar", pedido(i)));
confere(r.ok === true, "6 pedidos do mesmo endereço passam: " + JSON.stringify(r));
r = await chamarDe("200.3.3.3", "anon", "pedido_criar", pedido(7));
confere(r.ok === false && /Muitos pedidos/.test(r.motivo), "o 7º para: " + JSON.stringify(r));
r = await chamarDe("200.3.3.4", "anon", "pedido_criar", pedido(8));
confere(r.ok === true, "o pedido de outro endereço passa: " + JSON.stringify(r));
r = await vezes(8, () => chamarDe("200.3.3.5", "anon", "pedido_criar", { ...pedido(9), p_email: "sem-arroba" }));
confere(r.ok === false && /e-mail/.test(r.motivo), "o e-mail errado é recusado: " + JSON.stringify(r));
r = await vezes(6, (i) => chamarDe("200.3.3.5", "anon", "pedido_criar", pedido(20 + i)));
confere(r.ok === true, "e os 8 erros de digitação não contaram no limite: " + JSON.stringify(r));

console.log("\n5. A denúncia de formulário: 5 por hora");
r = await vezes(5, () => chamarDe("200.4.4.4", "anon", "comercial_denunciar", { p_codigo: form.codigo, p_motivo: "teste" }));
confere(r.ok === true, "5 denúncias passam: " + JSON.stringify(r));
r = await chamarDe("200.4.4.4", "anon", "comercial_denunciar", { p_codigo: form.codigo, p_motivo: "teste" });
confere(r.ok === false && /Muitas denúncias/.test(r.motivo), "a 6ª para: " + JSON.stringify(r));

console.log("\n6. O limite_somar das funções do servidor e quem lê o quê");
r = await vezes(10, () => chamar("service_role", null, "limite_somar", { p_acao: "feedback", p_endereco: "200.5.5.5" }));
confere(r === true, "10 feedbacks cabem: " + r);
r = await chamar("service_role", null, "limite_somar", { p_acao: "feedback", p_endereco: "200.5.5.5" });
confere(r === false, "o 11º não cabe: " + r);
r = await chamar("service_role", null, "limite_somar", { p_acao: "feedback", p_endereco: "" });
confere(r === true, "sem endereço, cabe: " + r);
r = await tentar("service_role", null, "limite_somar", { p_acao: "nao-existe", p_endereco: "200.5.5.5" });
confere(r.erro && /limite desconhecido/.test(r.erro), "uma ação sem limite é erro de programa: " + JSON.stringify(r));
for (const papel of ["anon", "authenticated"]) {
  r = await tentar(papel, papel === "anon" ? null : juliana, "limite_somar", { p_acao: "feedback", p_endereco: "1.1.1.1" });
  confere(r.erro && /permission denied/.test(r.erro), `${papel} não chama o limite_somar: ` + JSON.stringify(r));
}
const lidas = await db.transaction(async (tx) => { await tx.exec("set local role anon"); return tx.query("select * from public.limites"); })
  .then((x) => "leu " + x.rows.length, (e) => e.message);
confere(/permission denied/.test(lidas), "anônimo não lê a tabela dos limites: " + lidas);
const guardado = (await db.query(`select string_agg(chave, ' ') as t from public.limites`)).rows[0].t;
confere(!/200\.|2804|10\.0\.0/.test(guardado) && /^[a-z]+:[0-9a-f]{32}/.test(guardado), "a tabela guarda só a impressão, nunca o endereço");

console.log("\n7. O limite muda pelo ajustes_limites, sem publicar nada");
await db.query(`update public.ajustes_limites set feedback = 12`);
r = await chamar("service_role", null, "limite_somar", { p_acao: "feedback", p_endereco: "200.5.5.5" });
confere(r === true, "com o limite em 12, o 12º cabe: " + r);
await db.query(`update public.ajustes_limites set feedback = 10`);

console.log(`\nLIMITE POR ENDEREÇO: ${certos} certos, ${ruins.length} falhas`);
if (ruins.length) process.exit(1);
