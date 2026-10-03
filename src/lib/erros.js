// As mensagens do serviço de contas vêm em inglês; a pessoa lê em português, sem jargão.
const TRADUCOES = [
  [/invalid login credentials/i, 'E-mail ou senha não conferem.'],
  [/email not confirmed/i, 'Falta confirmar o e-mail. Digite o código que mandamos ou peça outro.'],
  [/user already registered|already been registered/i, 'Esse e-mail já tem conta. Entre ou recupere a senha.'],
  [/token has expired or is invalid|otp.*expired|invalid.*otp/i, 'Código vencido ou errado. Confira os seis dígitos ou peça outro.'],
  [/password should be at least|weak password/i, 'A senha precisa ter pelo menos 8 caracteres.'],
  [/new password should be different/i, 'A senha nova precisa ser diferente da atual.'],
  [/for security purposes, you can only request this after/i, 'Espere um minuto antes de pedir outro código.'],
  [/rate limit/i, 'Muitos pedidos seguidos. Tente de novo daqui a alguns minutos.'],
  [/unable to validate email address|invalid format/i, 'Esse e-mail não parece certo. Confira o endereço.'],
  [/signups not allowed/i, 'O cadastro está fechado no momento.'],
  [/failed to fetch|network/i, 'Sem conexão com o servidor. Confira a internet e tente de novo.'],
];

export function mensagemDeErro(erro) {
  const texto = typeof erro === 'string' ? erro : erro?.message ?? '';
  for (const [padrao, mensagem] of TRADUCOES) if (padrao.test(texto)) return mensagem;
  return texto ? `Não deu certo: ${texto}` : 'Não deu certo. Tente de novo.';
}
