import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSessao } from '@/lib/Sessao';
import { dadosDaConta, iniciais, primeiroNome } from '@/lib/conta';
import { AMOSTRA, useEhAdministrador } from '@/lib/gestao';
import { AULA } from '@/lib/aula';
import { supabase } from '@/lib/supabase';
import { MetaDaPagina } from '@/lib/seo';
import { TEMAS, escolherTema, useTema } from '@/lib/aparencia';
import { useAparenciaDaConta } from '@/components/Moldura';
import { Icone } from '@/components/Formulario';
import SalienciaDoMenu from '@/components/SalienciaDoMenu';

// As telas de quem entrou no jeito de sistema (ÊDI, 19/10/2026, pela referência do menu lateral do Sistema Palheta): o menu solto
// da borda em três blocos do tamanho do que guardam — o leão num círculo no alto, a navegação numa pílula no meio do espaço que
// sobra e, embaixo, a Gestão (só de quem administra), a aparência e a conta —, os ícones em círculos de 46 px e o ativo no coral suave. No
// celular os mesmos ícones descem para uma pílula embaixo. Sem a barra do alto e sem o rodapé do site.

// os ícones, com os traços do Lucide (licença ISC), no tamanho do Sistema Palheta
const TRACOS = {
  inicio: (
    <>
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </>
  ),
  programa: (
    <>
      <path d="M12 13V7" />
      <path d="m15 10-3 3-3-3" />
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
    </>
  ),
  plugin: (
    <>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </>
  ),
  comercial: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </>
  ),
  apresentacoes: (
    <>
      <path d="M2 3h20" />
      <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" />
      <path d="m7 21 5-5 5 5" />
    </>
  ),
  equipe: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  gestao: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  dados: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </>
  ),
  claro: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </>
  ),
  escuro: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  auto: (
    <>
      <path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.3 17.7-1.4 1.4" />
      <path d="m19.1 4.9-1.4 1.4" />
    </>
  ),
  sair: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
};

export function IconeDoMenu({ nome, tamanho = 20 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRACOS[nome]}
    </svg>
  );
}

// na ordem dos produtos que o Comercial mostrava no alto; o ativo vale também na área de um escritório
// (/conta/escritorio/<nome>/apresentacoes)
export const ITENS = [
  { id: 'inicio', nome: 'Início', para: '/painel', ativo: (c) => /^\/painel\/?$/.test(c) },
  { id: 'comercial', nome: 'Comercial', para: '/painel/comercial', ativo: (c) => c.startsWith('/painel/comercial') },
  { id: 'apresentacoes', nome: 'Apresentações', para: '/conta/apresentacoes', ativo: (c) => /^\/conta\/(escritorio\/[^/]+\/)?apresentacoes/.test(c) },
  { id: 'programa', nome: 'Programa', para: '/painel/programa', ativo: (c) => c.startsWith('/painel/programa') },
  { id: 'equipe', nome: 'Equipe e licenças', para: '/conta/equipe', ativo: (c) => /^\/conta\/(escritorio\/[^/]+\/)?equipe/.test(c) },
];
const GESTAO = { id: 'gestao', nome: 'Gestão', para: '/gestao', ativo: (c) => c.startsWith('/gestao') };

// Os botões do menu: o círculo de 46 px no menu lateral e o de 40 px no celular (os oito de quem administra cabem na largura de um
// telefone de 375 px). No menu lateral, o nome sai da barra ao passar o mouse, pela saliência (SalienciaDoMenu, que lê o data-nome).
const cor = (ativo) => (ativo ? 'bg-amg-destaque-suave text-destaque-texto' : 'text-texto-apagado hover:bg-superficie-2 hover:text-texto');
const circulo = (ativo, pequeno) =>
  `grid ${pequeno ? 'h-10 w-10' : 'h-[46px] w-[46px]'} shrink-0 place-items-center rounded-full no-underline transition-colors ${cor(ativo)}`;

// na área de um escritório, Apresentações e Equipe ficam nele (/conta/escritorio/<nome>/equipe); a Minha área volta pelas cápsulas do alto
function Item({ item, pequeno }) {
  const { pathname } = useLocation();
  const ativo = item.ativo(pathname);
  const area = pathname.match(/^\/conta\/escritorio\/[^/]+\//)?.[0];
  const para = area && item.para.startsWith('/conta/') ? area + item.para.slice('/conta/'.length) : item.para;
  return (
    <Link to={para} aria-label={item.nome} aria-current={ativo ? 'page' : undefined} data-nome={pequeno ? undefined : item.nome}
      className={circulo(ativo, pequeno)}>
      <IconeDoMenu nome={item.id} />
    </Link>
  );
}

// a foto da conta (a do Google, quando entrou por ele) ou as iniciais
function Foto({ usuario, pequeno }) {
  const foto = usuario?.user_metadata?.avatar_url || usuario?.user_metadata?.picture;
  const tamanho = pequeno ? 'h-[34px] w-[34px]' : 'h-[38px] w-[38px]';
  if (foto) return <img src={foto} alt="" referrerPolicy="no-referrer" className={`${tamanho} rounded-full object-cover`} />;
  return (
    <span className={`grid ${tamanho} place-items-center rounded-full bg-amg-destaque-suave text-amg-rotulo text-destaque-texto`}>
      {usuario ? iniciais(usuario) : <IconeDoMenu nome="dados" />}
    </span>
  );
}

// o que abre ao lado do botão (a aparência, a conta): à direita dele no computador, acima dele no celular. Fecha ao clicar fora, no
// Esc (o foco volta ao botão) e ao trocar de página.
function Flutuante({ rotulo, nome, pequeno, botao, children }) {
  const { pathname } = useLocation();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef(null);
  const ref = useRef(null);
  const fechar = () => {
    setAberto(false);
    ref.current?.focus();
  };

  useEffect(() => setAberto(false), [pathname]);
  useEffect(() => {
    if (!aberto) return undefined;
    (caixa.current?.querySelector('[aria-checked="true"]') ?? caixa.current?.querySelector('a, button'))?.focus();
    const fora = (e) => !caixa.current?.parentElement.contains(e.target) && setAberto(false);
    const tecla = (e) => e.key === 'Escape' && fechar();
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  return (
    <div className="relative">
      <button ref={ref} type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} aria-label={rotulo}
        data-nome={pequeno ? undefined : nome} className={circulo(false, pequeno)}>
        {botao}
      </button>
      {aberto && (
        <div ref={caixa} className="absolute bottom-[calc(100%+12px)] right-0 z-50 w-60 rounded-cartao bg-superficie p-1.5 shadow-amg-janela md:bottom-0 md:left-[calc(100%+27px)] md:right-auto">
          {children(fechar)}
        </div>
      )}
    </div>
  );
}

const linha = 'flex min-h-amg-toque-minimo w-full items-center gap-2.5 rounded-dentro px-3 text-left font-medium text-texto no-underline hover:bg-superficie-2 sm:min-h-[38px]';

// a aparência num botão próprio, fora da conta (ÊDI, 19/10/2026): o ícone é o do tema que está valendo e abre Claro, Escuro e
// Automático. Vale já neste navegador e fica guardada na conta.
function MenuDaAparencia({ pequeno }) {
  const tema = useTema();
  const nomeDoTema = TEMAS.find(([id]) => id === tema)?.[1];
  return (
    <Flutuante pequeno={pequeno} rotulo={`Aparência: ${nomeDoTema}`} nome="Aparência" botao={<IconeDoMenu nome={tema} />}>
      {(fechar) => (
        <>
          <p id={`aparencia${pequeno ? '-celular' : ''}`} className="px-3 pb-1.5 pt-2 font-semibold">Aparência</p>
          <div role="radiogroup" aria-labelledby={`aparencia${pequeno ? '-celular' : ''}`}>
            {TEMAS.map(([id, nome]) => (
              <button key={id} type="button" role="radio" aria-checked={tema === id} className={linha}
                aria-label={id === 'auto' ? `${nome}, segue o aparelho` : nome}
                onClick={() => {
                  escolherTema(id, { naConta: !AMOSTRA });
                  fechar();
                }}>
                <span className="text-texto-apagado"><IconeDoMenu nome={id} tamanho={16} /></span>
                <span className="mr-auto">{nome}</span>
                {tema === id && <Icone nome="ok" tamanho={16} className="text-destaque" />}
              </button>
            ))}
          </div>
        </>
      )}
    </Flutuante>
  );
}

// a conta: a foto abre Meus dados e Sair
function MenuDaConta({ pequeno }) {
  const { usuario } = useSessao();
  const navegar = useNavigate();

  async function sair() {
    await supabase.auth.signOut();
    navegar('/', { replace: true });
  }

  const nome = usuario ? primeiroNome(usuario) : 'Minha conta';
  return (
    <Flutuante pequeno={pequeno} rotulo={`Conta de ${nome}`} nome={nome} botao={<Foto usuario={usuario} pequeno={pequeno} />}>
      {() => (
        <>
          <p className="truncate px-3 pb-1.5 pt-2 font-semibold">{usuario ? dadosDaConta(usuario).nome || dadosDaConta(usuario).email : 'Minha conta'}</p>
          <Link to="/conta/dados" className={linha}>
            <span className="text-texto-apagado"><IconeDoMenu nome="dados" tamanho={16} /></span>
            Meus dados
          </Link>
          <div className="my-1 h-px bg-linha" />
          <button type="button" onClick={sair} className={linha}>
            <span className="text-texto-apagado"><IconeDoMenu nome="sair" tamanho={16} /></span>
            Sair
          </button>
        </>
      )}
    </Flutuante>
  );
}

export default function MolduraDoSistema() {
  useAparenciaDaConta();
  // a Gestão só para quem administra; no servidor de desenvolvimento com ?amostra, aparece para conferir a tela (na aula, não)
  const admin = useEhAdministrador() || (AMOSTRA && !AULA);

  // Os três blocos com 76 px e os ícones no meio. A barra não se abre mais: ao passar o mouse (ou chegar pelo teclado) num ícone, o nome
  // sai de dentro dela, na saliência, como no Sistema Palheta (ÊDI, 27/10/2026: "esse painel lateral que ele expande desse jeito, eu
  // acho que é melhor a gente fazer igual o do sistema palheta"; antes, de 19/10, o painel inteiro se abria mostrando os títulos). Os
  // blocos ficam por cima da saliência (z 2 contra 1), e a navegação rola sem a barra de rolagem, que cortaria a pílula.
  const barraRef = useRef(null);
  const bloco = 'relative z-[2] w-[76px] rounded-full bg-superficie shadow-cartao';
  return (
    <div className="flex min-h-screen">
      <MetaDaPagina />
      <aside className="sticky top-0 hidden h-screen w-[88px] shrink-0 md:block">
        <div ref={barraRef} className="absolute inset-y-3 left-3 z-30 flex w-[76px] flex-col gap-3">
          <Link to="/" aria-label="Arquionie™, o site" className={`${bloco} grid h-[76px] shrink-0 place-items-center no-underline`}>
            <img src="/leao.png" alt="" className="h-9 w-9" />
          </Link>
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <nav aria-label="Menu" data-bloco-menu className={`${bloco} sem-barra flex min-h-0 flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden py-4`}>
              {ITENS.map((item) => <Item key={item.id} item={item} />)}
            </nav>
          </div>
          {/* a Gestão (só de quem administra), a aparência e a conta */}
          <div data-bloco-menu className={`${bloco} flex shrink-0 flex-col items-center gap-1.5 py-3`}>
            {admin && <Item item={GESTAO} />}
            <MenuDaAparencia />
            <MenuDaConta />
          </div>
          <SalienciaDoMenu barraRef={barraRef} />
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-28 md:pb-0">
        <Outlet />
      </main>

      {/* no celular: a mesma navegação numa pílula embaixo, com a conta na ponta. Os cartões passam por baixo dela, então ela se
          separa deles (ÊDI, 19/10/2026: "sem contraste em relação aos cartões do fundo"): os cartões somem no fundo antes de chegar
          nela, e ela fica um tom acima deles, com contorno e sombra de janela */}
      <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-40 flex justify-center bg-gradient-to-t from-fundo from-40% to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-8 md:hidden">
        <div className="flex items-center gap-0.5 rounded-full bg-superficie-2 p-1 shadow-amg-janela ring-1 ring-linha">
          {ITENS.map((item) => <Item key={item.id} item={item} pequeno />)}
          {admin && <Item item={GESTAO} pequeno />}
          <MenuDaAparencia pequeno />
          <MenuDaConta pequeno />
        </div>
      </nav>
    </div>
  );
}
