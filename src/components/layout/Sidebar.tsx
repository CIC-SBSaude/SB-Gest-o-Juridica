import React, { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Mail,
  BrainCircuit,
  Building2,
  CalendarClock,
  Cpu,
  LayoutDashboard,
  Scale,
  ShieldCheck,
  Sliders,
  Users,
  X,
} from 'lucide-react';
import {
  attentionIndicatorsService,
  ATTENTION_INDICATORS_REFRESH_EVENT,
} from '../../services/attentionIndicatorsService';

interface SidebarProps {
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpenMobile, onCloseMobile }) => {
  const [attention, setAttention] = useState({
    openExceptions: 0,
    urgentDeadlines: 0,
  });

  const refreshAttention = useCallback(async () => {
    try {
      const indicators = await attentionIndicatorsService.getIndicators();
      setAttention(indicators);
    } catch (error) {
      console.error('[ATTENTION INDICATORS] falha inesperada:', error);
    }
  }, []);

  useEffect(() => {
    void refreshAttention();

    const timer = window.setInterval(() => void refreshAttention(), 60_000);
    const onFocus = () => void refreshAttention();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshAttention();
    };
    const onExplicitRefresh = () => void refreshAttention();

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(ATTENTION_INDICATORS_REFRESH_EVENT, onExplicitRefresh);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(ATTENTION_INDICATORS_REFRESH_EVENT, onExplicitRefresh);
    };
  }, [refreshAttention]);

  const renderBadge = (count: number, tone: 'red' | 'amber', label: string) => {
    if (count <= 0) return null;

    const value = count > 99 ? '99+' : String(count);
    const toneClass = tone === 'red'
      ? 'bg-[#E30613] text-white'
      : 'bg-amber-100 text-amber-800 border border-amber-200';

    return (
      <span
        className={`ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${toneClass}`}
        title={label}
        aria-label={label}
      >
        {value}
      </span>
    );
  };
  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center gap-3 rounded-r-lg py-2.5 pl-4 pr-3 text-sm transition-all ${
      isActive
        ? 'bg-[#FFF0F1] text-[#D90416] font-semibold before:absolute before:left-0 before:top-1/2 before:h-7 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-[#E30613]'
        : 'text-[#44546A] font-medium hover:bg-[#F8FAFC] hover:text-[#17233A]'
    }`;

  const navContent = (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#EDF1F5] px-5 py-5">
        <img src="/sb-saude-logo.png" alt="SB Saúde" className="h-auto w-[132px] object-contain object-left" />
        <div className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.19em] text-[#7A8AA0]">Gestão Jurídica</div>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-4">
        <div className="px-2.5 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#97A6BA]">Operação</div>
        <nav className="space-y-1">
          <NavLink id="nav-painel" to="/painel" onClick={onCloseMobile} className={navItemClass}>
            <LayoutDashboard className="h-4 w-4 shrink-0" /><span>Painel</span>
          </NavLink>
          <NavLink id="nav-processos" to="/processos" onClick={onCloseMobile} className={navItemClass}>
            <Scale className="h-4 w-4 shrink-0" /><span>Processos</span>
          </NavLink>
          <NavLink id="nav-prazos" to="/prazos" onClick={onCloseMobile} className={navItemClass}>
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span>Prazos</span>
            {renderBadge(
              attention.urgentDeadlines,
              'amber',
              `${attention.urgentDeadlines} prazo(s) vencido(s) ou vencendo nas próximas 48 horas`
            )}
          </NavLink>
          <NavLink id="nav-caixa-juridica" to="/caixa-juridica" onClick={onCloseMobile} className={navItemClass}>
            <BrainCircuit className="h-4 w-4 shrink-0" /><span>Interpretação Jurídica</span>
          </NavLink>
        </nav>

        <div className="px-2.5 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.14em] text-[#97A6BA]">Cadastros</div>
        <nav className="space-y-1">
          <NavLink id="nav-empresas" to="/empresas" onClick={onCloseMobile} className={navItemClass}>
            <Building2 className="h-4 w-4 shrink-0" /><span>Empresas</span>
          </NavLink>
        </nav>

        <div className="px-2.5 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.14em] text-[#97A6BA]">Administração</div>
        <nav className="space-y-1">
          <NavLink id="nav-usuarios" to="/admin/usuarios" onClick={onCloseMobile} className={navItemClass}>
            <Users className="h-4 w-4 shrink-0" /><span>Usuários</span>
          </NavLink>
          <NavLink id="nav-regras-email" to="/admin/regras-email" onClick={onCloseMobile} className={navItemClass}>
            <Sliders className="h-4 w-4 shrink-0" /><span>Regras de E-mail</span>
          </NavLink>
          <NavLink id="nav-conta-email" to="/admin/conta-email" onClick={onCloseMobile} className={navItemClass}>
            <Mail className="h-4 w-4 shrink-0" /><span>Conta de E-mail</span>
          </NavLink>
          <NavLink id="nav-uso-ia" to="/admin/uso-ia" onClick={onCloseMobile} className={navItemClass}>
            <Cpu className="h-4 w-4 shrink-0" /><span>Uso da IA</span>
          </NavLink>
          <NavLink id="nav-excecoes" to="/admin/excecoes" onClick={onCloseMobile} className={navItemClass}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Fila de Exceções</span>
            {renderBadge(
              attention.openExceptions,
              'red',
              `${attention.openExceptions} exceção(ões) aguardando análise`
            )}
          </NavLink>
          <NavLink id="nav-diagnostico" to="/admin/diagnostico" onClick={onCloseMobile} className={navItemClass}>
            <Activity className="h-4 w-4 shrink-0" />
            <span>Diagnóstico Técnico</span>
          </NavLink>
        </nav>
      </div>

      <div className="border-t border-[#EDF1F5] px-5 py-4">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#97A6BA]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#E30613]" />
          Ambiente corporativo
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside id="desktop-sidebar" className="hidden h-screen w-[232px] xl:w-[248px] flex-col border-r border-[#E2E8F0] bg-white lg:fixed lg:inset-y-0 lg:flex lg:z-20">
        {navContent}
      </aside>

      {isOpenMobile && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onCloseMobile} />
          <div className="relative flex w-[270px] max-w-[86vw] flex-col bg-white shadow-2xl">
            <button
              id="close-mobile-sidebar-btn"
              type="button"
              onClick={onCloseMobile}
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-[#64748B] hover:bg-[#F8FAFC]"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
