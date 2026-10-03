import { Link, NavLink, Outlet } from 'react-router-dom';
import { useSessao } from '@/lib/Sessao';
import { iniciais, primeiroNome } from '@/lib/conta';
import { useEhAdministrador } from '@/lib/gestao';
import { EMAIL_CONTATO } from '@/config';

const itemMenu = ({ isActive }) =>
  `text-[12px] font-semibold tracking-[0.08em] no-underline ${isActive ? 'text-aqi-coral' : 'text-aqi-muted hover:text-aqi-texto'}`;

function Topo() {
  const { usuario } = useSessao();
  const admin = useEhAdministrador();
  return (
    <header className="border-b border-[#262D37] bg-aqi-pagina">
      <nav className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5 sm:px-7" aria-label="Principal">
        <Link to="/" className="mr-auto flex items-center gap-2.5 text-[15px] font-semibold tracking-[2px] text-white no-underline">
          <img src="/leao.png" alt="" className="h-[30px] w-[30px]" />
          ARQUIONIE™
        </Link>
        <NavLink to="/" end className={itemMenu}>
          O QUE É
        </NavLink>
        <NavLink to="/versoes" className={itemMenu}>
          VERSÕES
        </NavLink>
        <NavLink to="/baixar" className={itemMenu}>
          BAIXAR
        </NavLink>
        {admin && (
          <NavLink to="/gestao" className={itemMenu}>
            GESTÃO
          </NavLink>
        )}
        {usuario ? (
          <NavLink to="/conta" className={itemMenu} aria-label="Minha conta">
            <span className="inline-flex items-center gap-2">
              <span className="grid h-[22px] w-[22px] place-items-center bg-aqi-campo text-[10px] text-white">{iniciais(usuario)}</span>
              {primeiroNome(usuario).toUpperCase()}
            </span>
          </NavLink>
        ) : (
          <NavLink to="/entrar" className={itemMenu}>
            ENTRAR
          </NavLink>
        )}
      </nav>
    </header>
  );
}

function Rodape() {
  return (
    <footer className="mt-16 border-t border-[#262D37] bg-aqi-pagina">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-[13px] text-aqi-muted sm:px-7">
        <span className="mr-auto">Palheta Arquionie™ · by Palheta Arquitetura</span>
        <Link to="/termos" className="link-apagado">
          Termos de uso
        </Link>
        <Link to="/privacidade" className="link-apagado">
          Privacidade
        </Link>
        <a href={`mailto:${EMAIL_CONTATO}`} className="link-apagado">
          Contato
        </a>
      </div>
    </footer>
  );
}

export default function Moldura() {
  return (
    <div className="flex min-h-screen flex-col">
      <Topo />
      <main className="flex-1">
        <Outlet />
      </main>
      <Rodape />
    </div>
  );
}
