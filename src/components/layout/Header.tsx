import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BookOpen, KeyRound, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';

interface HeaderProps {
  onToggleMobileSidebar: () => void;
}

const pageInfo = (pathname: string) => {
  if (pathname.startsWith('/processos')) return ['Gestão de Processos', 'Acompanhamento da carteira processual e gestão operacional.'];
  if (pathname.startsWith('/prazos')) return ['Controle de Prazos', 'Obrigações, criticidade e vencimentos da operação jurídica.'];
  if (pathname.startsWith('/caixa-juridica')) return ['Interpretação Jurídica', 'Triagem, interpretação e vinculação de comunicações jurídicas.'];
  if (pathname.startsWith('/empresas')) return ['Empresas', 'Cadastro e vínculo das empresas relacionadas à carteira jurídica.'];
  if (pathname.startsWith('/admin/usuarios')) return ['Gestão de Usuários', 'Perfis, autorizações e controle de acesso ao sistema.'];
  if (pathname.startsWith('/admin/regras-email')) return ['Regras de E-mail', 'Parâmetros administrativos para triagem e processamento.'];
  if (pathname.startsWith('/admin/conta-email')) return ['Conta de E-mail', 'Credenciais IMAP, monitoramento e origem da configuração ativa.'];
  if (pathname.startsWith('/admin/uso-ia')) return ['Uso da IA', 'Consumo, limites e acompanhamento do processamento inteligente.'];
  if (pathname.startsWith('/admin/excecoes')) return ['Fila de Exceções', 'Itens que exigem revisão ou tratamento humano.'];
  return ['Painel de Controle', 'Visão consolidada da gestão jurídica e da saúde operacional.'];
};

export const Header: React.FC<HeaderProps> = ({ onToggleMobileSidebar }) => {
  const { signOut, user, profile } = useAuth();
  const location = useLocation();
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [title, subtitle] = pageInfo(location.pathname);

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const role = (profile?.role || 'CONSULTA').toUpperCase();
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0])
    .join('')
    .toUpperCase() || 'SB';

  return (
    <header id="main-header" className="sticky top-0 z-30 min-h-[78px] shrink-0 border-b border-[#E2E8F0] bg-white px-4 md:px-7">
      <div className="flex min-h-[78px] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            id="mobile-menu-toggle-btn"
            type="button"
            onClick={onToggleMobileSidebar}
            className="rounded-lg p-2 text-[#64748B] hover:bg-[#F8FAFC] lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-extrabold tracking-tight text-[#17233A] md:text-lg">{title}</h1>
            <p className="mt-0.5 hidden truncate text-[11px] text-[#7A8AA0] sm:block">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <a
            id="header-manual-link"
            href={`${import.meta.env.BASE_URL}docs/POP_Operacional_SB_Gestao_Juridica.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden xl:inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#DCE3EC] bg-white px-3 text-xs font-semibold text-[#52637A] transition hover:border-[#FECACA] hover:bg-[#FFF5F5] hover:text-[#D90416] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E30613]/30 focus-visible:ring-offset-2"
            title="Abrir Manual de Operação"
            aria-label="Abrir Manual de Operação"
          >
            <BookOpen className="h-4 w-4 text-[#E30613]" />
            <span>Manual de Operação</span>
          </a>

          <div className="hidden sm:flex items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white px-2.5 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#FFF1F2] text-[11px] font-extrabold text-[#D90416]">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : initials}
            </div>
            <div className="max-w-[170px] leading-tight">
              <div className="truncate text-xs font-bold text-[#17233A]">{displayName}</div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#E30613]">{role}</div>
            </div>
          </div>

          <button
            id="header-change-password-btn"
            type="button"
            onClick={() => setIsChangePasswordOpen(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#DCE3EC] bg-white px-3 text-xs font-semibold text-[#52637A] transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
            title="Alterar minha senha"
          >
            <KeyRound className="h-4 w-4 text-[#64748B]" />
            <span className="hidden xl:inline">Senha</span>
          </button>

          <button
            id="header-logout-btn"
            type="button"
            onClick={signOut}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#DCE3EC] bg-white px-3 text-xs font-semibold text-[#52637A] transition hover:border-[#FECACA] hover:bg-[#FFF5F5] hover:text-[#D90416]"
            title="Sair da sessão"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden lg:inline">Sair</span>
          </button>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </header>
  );
};
