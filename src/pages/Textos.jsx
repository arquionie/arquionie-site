import { EMAIL_CONTATO } from '@/config';

// RASCUNHO para os testes internos (decisão de 02/10/2026): o advogado revisa os dois textos antes de o cadastro
// abrir ao público. Os trechos entre colchetes dependem dele ou de ÊDI.

function Pagina({ titulo, children }) {
  return (
    <div className="mx-auto max-w-[820px] px-4 py-12 sm:px-7">
      <p className="mb-6 border-l-4 border-aqi-coral bg-aqi-barra px-4 py-3 text-[14px] text-aqi-alerta">
        Rascunho para os testes internos. O texto final passa pela revisão do advogado antes da abertura ao público.
      </p>
      <h1 className="mb-6 text-[32px] font-semibold leading-tight text-white">{titulo}</h1>
      <div className="space-y-4 text-[16px] [&_h2]:mb-1 [&_h2]:mt-8 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:text-white">{children}</div>
    </div>
  );
}

export function Termos() {
  return (
    <Pagina titulo="Termos de uso">
      <p>
        Estes termos valem para a conta do Arquionie™ e para o uso do programa e deste site, oferecidos pela Palheta
        Arquitetura [CNPJ]. Ao criar a conta, você concorda com eles.
      </p>
      <h2>A conta</h2>
      <p>
        A conta é pessoal: uma pessoa por conta, com dados verdadeiros. Guarde a sua senha e não a compartilhe. A conta pode
        ficar conectada em até três computadores ao mesmo tempo; para entrar num quarto, desconecte um deles.
      </p>
      <h2>O programa</h2>
      <p>
        O uso do Arquionie™ segue a licença de uso aceita na instalação: você pode usá-lo em projetos pessoais e
        profissionais, inclusive comerciais, e não pode modificá-lo, descompilá-lo, remover a marca nem redistribuí-lo
        alterado. Durante o lançamento, a conta usa o programa por completo, sem custo.
      </p>
      <h2>Os seus projetos</h2>
      <p>
        Os projetos que você cria são seus e ficam no seu computador. Abrir e ver um arquivo do Arquionie™ não depende de
        conta; criar e salvar pedem a conta.
      </p>
      <h2>Assinatura no futuro</h2>
      <p>
        Quando houver cobrança, avisamos antes, por e-mail, com os preços e as condições. Nenhum arquivo fica preso: sem
        assinatura, o programa continua abrindo, mostrando, imprimindo e exportando os seus projetos.
      </p>
      <h2>Sem garantia</h2>
      <p>
        O programa e o site são fornecidos como estão. Guarde cópias dos seus projetos: nenhum programa está livre de
        falhas. A Palheta Arquitetura não responde por perda de dados ou lucros cessantes decorrentes do uso.
      </p>
      <h2>Encerramento</h2>
      <p>
        Você pode pedir a exclusão da conta a qualquer momento. A conta pode ser suspensa em caso de uso indevido, como
        tentar acessar contas de outras pessoas ou burlar a licença.
      </p>
      <h2>Lei e contato</h2>
      <p>
        Estes termos seguem as leis do Brasil [foro a definir]. Dúvidas: <a href={`mailto:${EMAIL_CONTATO}`} className="link">{EMAIL_CONTATO}</a>.
      </p>
    </Pagina>
  );
}

export function Privacidade() {
  return (
    <Pagina titulo="Política de privacidade">
      <p>
        Esta política explica quais dados a conta do Arquionie™ guarda, para quê e com quem, conforme a Lei Geral de
        Proteção de Dados (Lei 13.709/2018). A responsável pelos dados é a Palheta Arquitetura [CNPJ].
      </p>
      <h2>O que guardamos</h2>
      <p>
        Do cadastro: nome, e-mail, atuação, a data e a versão do aceite destes termos e a sua escolha sobre receber
        novidades. A senha é guardada só em forma cifrada; ninguém consegue lê-la. Se você entra pelo Google, recebemos
        dele o seu nome, o e-mail e a foto do perfil.
      </p>
      <p>
        Dos computadores conectados: o nome do computador no Windows, a versão do programa e a data do último acesso. E os
        registros de acesso (data, hora e endereço IP), que a lei manda guardar por seis meses.
      </p>
      <h2>O que não guardamos</h2>
      <p>Os seus projetos. Eles ficam no seu computador; a conta não recebe os seus arquivos.</p>
      <h2>Para quê</h2>
      <p>
        Para criar e manter a conta, confirmar o e-mail, recuperar a senha, controlar os computadores conectados, mandar
        avisos de serviço e, só se você aceitar, mandar novidades. As bases legais são a execução do contrato, o
        cumprimento de obrigação legal, o legítimo interesse na segurança da conta e, para as novidades, o seu consentimento,
        que pode ser retirado a qualquer momento na página Minha conta.
      </p>
      <h2>Com quem</h2>
      <p>
        Com os serviços que fazem a conta funcionar, cada um só no que lhe cabe: Supabase (contas e banco de dados, com
        servidores em São Paulo), Resend (envio dos e-mails), Vercel (este site), Cloudflare (endereços e downloads) e
        Google, se você escolher entrar por ele. Alguns desses serviços guardam registros fora do Brasil, com as garantias
        dos próprios contratos. Não vendemos nem cedemos dados para propaganda.
      </p>
      <h2>Por quanto tempo</h2>
      <p>
        Enquanto a conta existir. Depois do pedido de exclusão, os dados são apagados em até 30 dias, exceto os registros
        que a lei manda guardar.
      </p>
      <h2>Os seus direitos</h2>
      <p>
        Você pode confirmar se tratamos os seus dados, acessá-los, corrigi-los, pedir a exclusão ou a portabilidade e saber
        com quem foram compartilhados. Peça pelo e-mail <a href={`mailto:${EMAIL_CONTATO}`} className="link">{EMAIL_CONTATO}</a>, que
        também é o contato do encarregado [nome do encarregado].
      </p>
      <h2>No navegador</h2>
      <p>
        O site guarda a sua sessão no navegador só para manter você conectado. Não usamos cookies de propaganda nem de
        rastreamento.
      </p>
    </Pagina>
  );
}

export function NaoEncontrada() {
  return (
    <div className="mx-auto max-w-[820px] px-4 py-20 text-center">
      <h1 className="mb-3 text-[28px] font-semibold text-white">Página não encontrada</h1>
      <a href="/" className="link">
        Voltar ao início
      </a>
    </div>
  );
}
