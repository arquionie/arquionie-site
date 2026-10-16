import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSessao } from '@/lib/Sessao';
import { iniciais, primeiroNome } from '@/lib/conta';
import { useEhAdministrador } from '@/lib/gestao';
import { aplicarAparencia, guardarTema, temaGuardado } from '@/lib/aparencia';
import { Botao } from '@/components/Formulario';
import { EMAIL_CONTATO } from '@/config';

// O site no modo AMIGÁVEL (mockup site-amigavel, aprovado por ÊDI em 16/10/2026): a barra branca no alto com o leão, as abas em
// cápsula e o Entrar (ou a pessoa), e o rodapé. No celular as abas descem para uma faixa própria, que rola de lado.
// O /gestao continua no TÉCNICO escuro, com o topo também no técnico (MolduraTecnica, embaixo).

const aba = ({ isActive }) =>
  `inline-flex min-h-amg-toque-minimo shrink-0 items-center whitespace-nowrap rounded-toque px-[15px] no-underline sm:min-h-0 sm:py-[7px] ${
    isActive ? 'bg-superficie-2 font-semibold text-texto' : 'font-medium text-texto-apagado hover:text-texto'}`;

function Topo() {
  const { usuario } = useSessao();
  const admin = useEhAdministrador();
  return (
    <header className="border-b border-linha bg-superficie">
      <nav className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:flex-nowrap sm:px-6" aria-label="Principal">
        <Link to="/" className="flex items-center gap-2.5 text-amg-secao text-texto no-underline">
          <img src="/leao.png" alt="" className="h-[30px] w-[30px]" />
          Arquionie™
        </Link>
        <div className="sem-barra order-3 -mx-4 flex w-[calc(100%+2rem)] gap-1.5 overflow-x-auto px-4 pb-1 sm:order-2 sm:mx-auto sm:w-auto sm:gap-1 sm:overflow-visible sm:p-0">
          <NavLink to="/" end className={aba}>
            O que é
          </NavLink>
          <NavLink to="/versoes" className={aba}>
            Versões
          </NavLink>
          <NavLink to="/baixar" className={aba}>
            Baixar
          </NavLink>
          {admin && (
            <NavLink to="/gestao" className={aba}>
              Gestão
            </NavLink>
          )}
        </div>
        <div className="order-2 ml-auto sm:order-3 sm:ml-0">
          {usuario ? (
            <NavLink to="/conta" aria-label="Minha conta" className="flex min-h-amg-toque-minimo items-center gap-2.5 rounded-toque font-medium text-texto no-underline sm:min-h-0">
              <span aria-hidden="true" className="grid h-[30px] w-[30px] place-items-center rounded-toque bg-amg-destaque-suave text-amg-rotulo text-destaque-texto">
                {iniciais(usuario)}
              </span>
              <span aria-hidden="true">{primeiroNome(usuario)}</span>
            </NavLink>
          ) : (
            <Botao para="/entrar">Entrar</Botao>
          )}
        </div>
      </nav>
    </header>
  );
}

function Rodape() {
  const link = 'inline-flex min-h-amg-toque-minimo items-center text-texto-apagado no-underline hover:text-texto sm:min-h-0';
  return (
    <footer className="mt-16 border-t border-linha">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-5 text-amg-legenda text-texto-apagado sm:px-6">
        <span className="mr-auto w-full sm:w-auto">Palheta Arquionie™ · by Palheta Arquitetura</span>
        <Link to="/termos" className={link}>
          Termos de uso
        </Link>
        <Link to="/privacidade" className={link}>
          Privacidade
        </Link>
        <a href={`mailto:${EMAIL_CONTATO}`} className={link}>
          Contato
        </a>
      </div>
    </footer>
  );
}

export default function Moldura() {
  const { pathname } = useLocation();
  const { usuario } = useSessao();
  const tecnico = pathname === '/gestao' || pathname.startsWith('/gestao/');

  useEffect(() => {
    aplicarAparencia({ tecnico });
  }, [tecnico]);

  // A aparência guardada na conta vale em todo aparelho em que a pessoa entrar.
  const daConta = usuario?.user_metadata?.aparencia;
  useEffect(() => {
    if (daConta && daConta !== temaGuardado()) guardarTema(daConta);
  }, [daConta]);

  if (tecnico) return <MolduraTecnica />;
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

// ------------------------------------------------------------------ o /gestao, no TÉCNICO escuro como era (cores do App.axaml)
const itemTecnico = ({ isActive }) =>
  `text-[12px] font-semibold tracking-[0.08em] no-underline ${isActive ? 'text-aqi-coral' : 'text-aqi-muted hover:text-aqi-texto'}`;

function MolduraTecnica() {
  const { usuario } = useSessao();
  return (
    <div className="flex min-h-screen flex-col bg-aqi-pagina font-sans text-[17px] leading-[1.6] text-aqi-texto antialiased">
      <header className="border-b border-[#262D37] bg-aqi-pagina">
        <nav className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5 sm:px-7" aria-label="Principal">
          <Link to="/" className="mr-auto flex items-center gap-2.5 text-[15px] font-semibold tracking-[2px] text-white no-underline">
            <img src="/leao.png" alt="" className="h-[30px] w-[30px]" />
            ARQUIONIE™
          </Link>
          <NavLink to="/" end className={itemTecnico}>
            O QUE É
          </NavLink>
          <NavLink to="/versoes" className={itemTecnico}>
            VERSÕES
          </NavLink>
          <NavLink to="/baixar" className={itemTecnico}>
            BAIXAR
          </NavLink>
          <NavLink to="/gestao" className={itemTecnico}>
            GESTÃO
          </NavLink>
          {usuario && (
            <NavLink to="/conta" className={itemTecnico} aria-label="Minha conta">
              <span className="inline-flex items-center gap-2">
                <span className="grid h-[22px] w-[22px] place-items-center bg-aqi-campo text-[10px] text-white">{iniciais(usuario)}</span>
                {primeiroNome(usuario).toUpperCase()}
              </span>
            </NavLink>
          )}
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
