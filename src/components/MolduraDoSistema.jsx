import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSessao } from '@/lib/Sessao';
import { dadosDaConta, iniciais, primeiroNome } from '@/lib/conta';
import { AMOSTRA, useEhAdministrador } from '@/lib/gestao';
import { supabase } from '@/lib/supabase';
import { MetaDaPagina } from '@/lib/seo';
import { useAparenciaDaConta } from '@/components/Moldura';

// As telas de quem entrou no jeito de sistema (ÊDI, 19/10/2026, pela referência do menu lateral do Sistema Palheta): o menu solto
// da borda em três blocos do tamanho do que guardam — o leão num círculo no alto, a navegação numa pílula no meio do espaço que
// sobra e, embaixo, a Gestão (só de quem administra) e a conta —, os ícones em círculos de 46 px e o ativo no coral suave. No
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
  aparencia: (
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

// no celular, 42 px: os sete cabem na largura de um telefone de 375 px
const circulo = (ativo, pequeno) =>
  `grid ${pequeno ? 'h-[42px] w-[42px]' : 'h-[46px] w-[46px]'} shrink-0 place-items-center rounded-full transition-colors ${
    ativo ? 'bg-amg-destaque-suave text-destaque-texto' : 'text-texto-apagado hover:bg-superficie-2 hover:text-texto'}`;

// na área de um escritório, Apresentações e Equipe ficam nele (/conta/escritorio/<nome>/equipe); a Minha área volta pelas cápsulas do alto
function Item({ item, pequeno }) {
  const { pathname } = useLocation();
  const ativo = item.ativo(pathname);
  const area = pathname.match(/^\/conta\/escritorio\/[^/]+\//)?.[0];
  const para = area && item.para.startsWith('/conta/') ? area + item.para.slice('/conta/'.length) : item.para;
  return (
    <Link to={para} title={item.nome} aria-label={item.nome} aria-current={ativo ? 'page' : undefined} className={circulo(ativo, pequeno)}>
      <IconeDoMenu nome={item.id} />
    </Link>
  );
}

// a foto da conta (a do Google, quando entrou por ele) ou as iniciais
function Foto({ usuario }) {
  const foto = usuario?.user_metadata?.avatar_url || usuario?.user_metadata?.picture;
  if (foto) return <img src={foto} alt="" referrerPolicy="no-referrer" className="h-[38px] w-[38px] rounded-full object-cover" />;
  return (
    <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-amg-destaque-suave text-amg-rotulo text-destaque-texto">
      {usuario ? iniciais(usuario) : <IconeDoMenu nome="dados" />}
    </span>
  );
}

// a conta: a foto abre Meus dados, Aparência e Sair; à direita da foto no computador, acima dela no celular
function MenuDaConta({ pequeno }) {
  const { usuario } = useSessao();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef(null);
  const botao = useRef(null);

  useEffect(() => setAberto(false), [pathname]);
  useEffect(() => {
    if (!aberto) return undefined;
    caixa.current?.querySelector('a, button')?.focus();
    const fora = (e) => !caixa.current?.parentElement.contains(e.target) && setAberto(false);
    const tecla = (e) => {
      if (e.key !== 'Escape') return;
      setAberto(false);
      botao.current?.focus();
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  async function sair() {
    await supabase.auth.signOut();
    navegar('/', { replace: true });
  }

  const linha = 'flex min-h-amg-toque-minimo w-full items-center gap-2.5 rounded-dentro px-3 text-left font-medium text-texto no-underline hover:bg-superficie-2 sm:min-h-[38px]';
  const nome = usuario ? primeiroNome(usuario) : 'Minha conta';
  return (
    <div className="relative">
      <button ref={botao} type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} aria-label={`Conta de ${nome}`} title={nome}
        className={`${circulo(false, pequeno)} hover:bg-transparent`}>
        <Foto usuario={usuario} />
      </button>
      {aberto && (
        <div ref={caixa} className="absolute bottom-[calc(100%+12px)] right-0 z-50 w-60 rounded-cartao bg-superficie p-1.5 shadow-amg-janela md:bottom-0 md:left-[calc(100%+27px)] md:right-auto">
          <p className="truncate px-3 pb-1.5 pt-2 font-semibold">{usuario ? dadosDaConta(usuario).nome || dadosDaConta(usuario).email : 'Minha conta'}</p>
          <Link to="/conta/dados" className={linha}>
            <span className="text-texto-apagado"><IconeDoMenu nome="dados" tamanho={16} /></span>
            Meus dados
          </Link>
          <Link to="/conta/aparencia" className={linha}>
            <span className="text-texto-apagado"><IconeDoMenu nome="aparencia" tamanho={16} /></span>
            Aparência
          </Link>
          <div className="my-1 h-px bg-linha" />
          <button type="button" onClick={sair} className={linha}>
            <span className="text-texto-apagado"><IconeDoMenu nome="sair" tamanho={16} /></span>
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

export default function MolduraDoSistema() {
  useAparenciaDaConta();
  // a Gestão só para quem administra; no servidor de desenvolvimento com ?amostra, aparece para conferir a tela
  const admin = useEhAdministrador() || AMOSTRA;

  const pilula = 'flex items-center gap-1.5 rounded-full bg-superficie shadow-cartao';
  return (
    <div className="flex min-h-screen">
      <MetaDaPagina />
      <aside className="sticky top-0 hidden h-screen shrink-0 py-3 pl-3 md:block">
        <div className="flex h-full w-[76px] flex-col gap-3">
          <Link to="/" title="Arquionie™" aria-label="Arquionie™, o site" className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-full bg-superficie shadow-cartao">
            <img src="/leao.png" alt="" className="h-9 w-9" />
          </Link>
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <nav aria-label="Menu" className={`${pilula} min-h-0 flex-col overflow-y-auto py-4`}>
              {ITENS.map((item) => <Item key={item.id} item={item} />)}
            </nav>
          </div>
          <div className={`${pilula} shrink-0 flex-col py-3`}>
            {admin && <Item item={GESTAO} />}
            <MenuDaConta />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-28 md:pb-0">
        <Outlet />
      </main>

      {/* no celular: a mesma navegação numa pílula embaixo, com a conta na ponta. Os cartões passam por baixo dela, então ela se
          separa deles (ÊDI, 19/10/2026: "sem contraste em relação aos cartões do fundo"): os cartões somem no fundo antes de chegar
          nela, e ela fica um tom acima deles, com contorno e sombra de janela */}
      <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-40 flex justify-center bg-gradient-to-t from-fundo from-40% to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-8 md:hidden">
        <div className="flex items-center gap-1 rounded-full bg-superficie-2 p-1.5 shadow-amg-janela ring-1 ring-linha">
          {ITENS.map((item) => <Item key={item.id} item={item} pequeno />)}
          {admin && <Item item={GESTAO} pequeno />}
          <MenuDaConta pequeno />
        </div>
      </nav>
    </div>
  );
}
