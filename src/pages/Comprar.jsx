import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Botao, Campo, Etiqueta, Icone, Mensagem } from '@/components/Formulario';
import { Miolo } from '@/components/Cartao';
import {
  AMOSTRA, PRECOS_PADRAO, PRODUTOS, conferirCupom, criarPedido, lerEscolha, lerPrecos, linkDoWhatsapp, mensagemDoWhatsapp, porMes, total,
  valores,
} from '@/lib/compra';

// O formulário /comprar, público e sem conta (plano 19 do repositório do plugin, versão 4 aprovada por ÊDI em 15/10/2026). No alto, o
// resumo fixo VOCÊ ESCOLHEU (o formulário não pergunta de novo o que a pessoa já escolheu no quadro de preço); os campos são só NOME,
// E-MAIL e WHATSAPP; o cupom aparece quando vem no link ou pelo TEM UM CUPOM?. COMPRAR PELO WHATSAPP grava o pedido e leva ao WhatsApp
// de vendas com a mensagem pronta e o número do pedido; se gravar falhar, leva assim mesmo. Link sem o período: o quadro do produto.

const CARTAO = 'flex flex-col gap-1.5 rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5';
const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const digitos = (texto) => texto.replace(/\D/g, '');

// De onde a pessoa veio: TROCAR DE PLANO volta ao quadro daquela página.
const QUADRO_DA_ORIGEM = { revit: '/para-revit#planos' };

function usePrecos() {
  const [precos, setPrecos] = useState(PRECOS_PADRAO);
  useEffect(() => {
    lerPrecos().then(setPrecos).catch(() => {});
  }, []);
  return precos;
}

// Link sem o período (alguém que digitou o endereço ou veio do cadastro antigo): o quadro do produto, o anual em destaque à direita.
function Quadro({ produto, precos, aoEscolher }) {
  const p = precos[produto];
  return (
    <section className="mx-auto max-w-[760px] px-4 py-8 sm:px-6 sm:py-12">
      <p className="rotulo mb-1.5">Comprar</p>
      <h1 className="text-amg-titulo">{PRODUTOS[produto].nome}</h1>
      <p className="mb-5 mt-1 text-texto-apagado">{PRODUTOS[produto].descricao}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <article className={CARTAO}>
          <h2 className="text-amg-secao">PRO mensal</h2>
          <p className="text-amg-titulo-grande tabular-nums">
            {porMes(p.mensal)}
            <span className="text-amg-frase font-normal text-texto-apagado">/mês</span>
          </p>
          <p className="mb-3 text-texto-apagado">Renova todo mês.</p>
          <Botao type="button" grande className="mt-auto" onClick={() => aoEscolher('mensal')}>
            Escolher o mensal
          </Botao>
        </article>
        <article className={`${CARTAO} ring-2 ring-destaque`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-amg-secao">PRO anual</h2>
            <span className="rounded-toque bg-amg-destaque-suave px-2.5 py-0.5 text-amg-rotulo text-destaque-texto">{p.desconto}% OFF</span>
          </div>
          <p className="text-amg-titulo-grande tabular-nums">
            {porMes(p.anual)}
            <span className="text-amg-frase font-normal text-texto-apagado">/mês</span>
          </p>
          <p className="mb-3 text-texto-apagado">Cobrado anualmente.</p>
          <Botao type="button" principal grande className="mt-auto" onClick={() => aoEscolher('anual')}>
            Escolher o anual
          </Botao>
        </article>
      </div>
    </section>
  );
}

// O resumo fixo: o plano, o preço por mês (o cheio riscado quando o cupom vale) e, só aqui, o que se paga hoje.
function Resumo({ produto, periodo, v, cupom, trocar }) {
  return (
    <div className="flex flex-col gap-1 rounded-dentro bg-superficie-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="rotulo">Você escolheu</p>
        {trocar}
      </div>
      <h1 className="text-amg-titulo">
        {PRODUTOS[produto].nome} · {periodo}
      </h1>
      <p className="text-texto-apagado">{PRODUTOS[produto].descricao}</p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-amg-titulo-grande tabular-nums">
        {v.desconto > 0 && <s className="text-amg-frase font-normal text-texto-apagado">{porMes(v.base)}</s>}
        <span>
          {porMes(v.mes)}
          <span className="text-amg-frase font-normal text-texto-apagado">/mês</span>
        </span>
        {v.desconto > 0 && <Etiqueta tipo="sucesso">{cupom} · {v.desconto}% OFF</Etiqueta>}
      </p>
      <p className="font-semibold">{periodo === 'anual' ? `Hoje: ${total(v.cobranca)} por 1 ano` : `Hoje: ${total(v.cobranca)} · renova todo mês`}</p>
    </div>
  );
}

export default function Comprar() {
  const [params, setParams] = useSearchParams();
  const escolha = lerEscolha(params);
  const { produto, periodo, origem } = escolha;
  const precos = usePrecos();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [isca, setIsca] = useState('');
  const [cupom, setCupom] = useState(escolha.cupom);
  const [abrirCupom, setAbrirCupom] = useState(Boolean(escolha.cupom));
  const [conferido, setConferido] = useState(null); // { codigo, valido, desconto } do último cupom conferido
  const [falta, setFalta] = useState({});
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [amostraMensagem, setAmostraMensagem] = useState('');

  // Confere o cupom meio segundo depois da última letra (o do link, logo ao abrir).
  const codigo = cupom.trim().toUpperCase();
  useEffect(() => {
    if (!codigo) return undefined;
    let vivo = true;
    const espera = setTimeout(() => {
      conferirCupom(codigo).then((r) => vivo && r && setConferido({ codigo, valido: Boolean(r.valido), desconto: r.desconto ?? 0 }));
    }, 500);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [codigo]);

  const escolher = (novo) => {
    const p = new URLSearchParams(params);
    p.set('produto', produto);
    if (novo) p.set('periodo', novo);
    else p.delete('periodo');
    setParams(p);
    window.scrollTo(0, 0);
  };

  if (!periodo) return <Quadro produto={produto} precos={precos} aoEscolher={escolher} />;

  const cupomDoMomento = conferido?.codigo === codigo ? conferido : null;
  const desconto = cupomDoMomento?.valido ? cupomDoMomento.desconto : 0;
  const v = valores(precos, produto, periodo, desconto);

  let avisoDoCupom = null;
  if (codigo && periodo === 'mensal') avisoDoCupom = <Etiqueta>Vale só no anual</Etiqueta>;
  else if (cupomDoMomento && !cupomDoMomento.valido) avisoDoCupom = <Etiqueta tipo="urgente">Cupom não encontrado</Etiqueta>;

  const voltar = QUADRO_DA_ORIGEM[origem];
  const trocar = voltar ? (
    <a href={voltar} className="text-amg-legenda font-semibold text-destaque-texto no-underline">
      Trocar de plano
    </a>
  ) : (
    <button type="button" className="text-amg-legenda font-semibold text-destaque-texto" onClick={() => escolher('')}>
      Trocar de plano
    </button>
  );

  const comprar = async () => {
    const zap = digitos(whatsapp);
    const novaFalta = {
      nome: nome.trim().length < 2,
      email: !EMAIL_VALIDO.test(email.trim()),
      whatsapp: !(zap.length >= 10 && zap.length <= 13),
    };
    setFalta(novaFalta);
    if (novaFalta.nome) return setErro('Digite o seu nome.');
    if (novaFalta.email) return setErro('Digite um e-mail válido: a sua conta será com ele.');
    if (novaFalta.whatsapp) return setErro('Digite o WhatsApp com o DDD.');
    setErro('');
    setEnviando(true);

    // O campo-isca, escondido de quem vê a tela: preenchido, é robô, e o pedido não grava.
    const pedido = isca
      ? null
      : await criarPedido({ produto, periodo, nome: nome.trim(), email: email.trim(), whatsapp: zap, cupom: periodo === 'anual' ? codigo : '', origem });
    const texto = mensagemDoWhatsapp({
      produto,
      periodo,
      mes: pedido?.valorMes ?? v.mes,
      cobranca: pedido?.valorCobranca ?? v.cobranca,
      cupom: pedido ? pedido.cupom : v.desconto ? codigo : null,
      pedido: pedido?.pedido,
      nome,
      email,
    });
    if (AMOSTRA) {
      setAmostraMensagem(texto);
      setEnviando(false);
      return;
    }
    window.location.assign(linkDoWhatsapp(texto));
  };

  return (
    <Miolo>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          comprar();
        }}
        noValidate
        className="mx-auto flex w-full max-w-[460px] flex-col gap-3.5 rounded-cartao bg-superficie p-4 shadow-cartao sm:p-5"
      >
        <Resumo produto={produto} periodo={periodo} v={v} cupom={codigo} trocar={trocar} />

        <div className="flex flex-col gap-2.5">
          <Campo rotulo="NOME" id="nome" valor={nome} aoMudar={setNome} autoComplete="name" placeholder="Seu nome" falta={falta.nome} />
          <Campo rotulo="E-MAIL" id="email" tipo="email" valor={email} aoMudar={setEmail} autoComplete="email" falta={falta.email} />
          <Campo
            rotulo="WHATSAPP"
            id="whatsapp"
            tipo="tel"
            inputMode="tel"
            valor={whatsapp}
            aoMudar={setWhatsapp}
            autoComplete="tel"
            placeholder="(11) 99999-9999"
            falta={falta.whatsapp}
          />
          {abrirCupom ? (
            <>
              <Campo rotulo="CUPOM" id="cupom" valor={cupom} aoMudar={(t) => setCupom(t.toUpperCase())} autoComplete="off" placeholder="" autoFocus={!escolha.cupom} />
              {avisoDoCupom && <div>{avisoDoCupom}</div>}
            </>
          ) : (
            <button type="button" className="self-start px-1 text-amg-legenda font-semibold text-destaque-texto" onClick={() => setAbrirCupom(true)}>
              Tem um cupom?
            </button>
          )}
          <input
            type="text"
            name="empresa"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={isca}
            onChange={(e) => setIsca(e.target.value)}
            className="hidden"
          />
        </div>

        <Mensagem erro>{erro}</Mensagem>

        <div className="flex flex-col gap-2">
          <Botao type="submit" principal grande cheio disabled={enviando}>
            <Icone nome="balao" tamanho={18} />
            {enviando ? 'Abrindo o WhatsApp…' : 'Comprar pelo WhatsApp'}
          </Botao>
          <p className="text-center text-amg-legenda text-texto-apagado">Você fala direto com a gente. O pagamento é por Pix ou cartão.</p>
        </div>

        {amostraMensagem && <Mensagem>AMOSTRA · o WhatsApp abriria com: {amostraMensagem}</Mensagem>}
      </form>
    </Miolo>
  );
}
