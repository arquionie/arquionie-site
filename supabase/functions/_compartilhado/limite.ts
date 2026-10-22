// Arquionie™ — o limite por endereço das funções sem conta (migração 20261022000000_limite_por_endereco.sql): o endereço de quem chamou
// e a soma no banco (limite_somar, que guarda só a impressão do endereço, nunca ele). Sem endereço, passa: o limite é contra robô.

type Banco = { rpc(nome: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** O endereço de quem chamou, como a Cloudflare e o Supabase passam. */
export function endereco(req: Request): string {
  return (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
}

/** Soma o pedido no limite da ação e diz se ainda coube. Erro do banco aqui não barra ninguém (fica só no registro). */
export async function cabe(db: Banco, acao: string, req: Request): Promise<boolean> {
  const { data, error } = await db.rpc("limite_somar", { p_acao: acao, p_endereco: endereco(req) });
  if (error) console.error("limite:", error.message);
  return data !== false;
}
