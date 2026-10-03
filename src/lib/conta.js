// O que o cadastro guarda na conta (metadados do usuário no Supabase); o banco espelha em `perfis`
// (supabase/migrations). Quem entrou pelo Google traz nome e e-mail dele e completa atuação e aceite na primeira vez.
export function dadosDaConta(usuario) {
  const m = usuario?.user_metadata ?? {};
  return {
    nome: m.nome || m.full_name || m.name || '',
    email: usuario?.email ?? '',
    atuacao: m.atuacao || '',
    novidades: m.novidades === true,
    aceiteTermosEm: m.aceite_termos_em || null,
    pelaGoogle: (usuario?.app_metadata?.providers ?? []).includes('google'),
    pelaSenha: (usuario?.app_metadata?.providers ?? []).includes('email'),
    desde: usuario?.created_at ?? null,
  };
}

export function cadastroCompleto(usuario) {
  const d = dadosDaConta(usuario);
  return Boolean(d.atuacao && d.aceiteTermosEm);
}

export function primeiroNome(usuario) {
  const nome = dadosDaConta(usuario).nome || dadosDaConta(usuario).email;
  return nome.split(/[\s@]/)[0] ?? '';
}

export function iniciais(usuario) {
  const nome = dadosDaConta(usuario).nome;
  if (!nome) return (dadosDaConta(usuario).email[0] ?? '?').toUpperCase();
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

// Volta para onde a pessoa estava (só caminhos do próprio site, nunca outro endereço).
export function destinoSeguro(volta, padrao = '/conta') {
  return typeof volta === 'string' && volta.startsWith('/') && !volta.startsWith('//') ? volta : padrao;
}
