import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ErrorMessage } from '../common/ErrorMessage';
import { useAuth } from '../../hooks/useAuth';
import { MustChangePasswordModal } from '../auth/MustChangePasswordModal';

export const AppLayout: React.FC = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { errorMessage, clearError, mustChangePassword } = useAuth();

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex">
      {/* Sidebar (260px Desktop Fixa / Mobile Drawer) */}
      <Sidebar
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Área Principal de Navegação e Conteúdo */}
      <div className="flex-1 lg:pl-[232px] xl:pl-[248px] flex flex-col min-w-0 min-h-screen">
        {/* Header do Sistema */}
        <Header onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)} />

        {/* Seção Principal de Conteúdo */}
        <main
          id="main-content-area"
          className="flex-1 w-full min-w-0 max-w-none mx-0 overflow-x-clip p-3 sm:p-4 lg:p-6 xl:p-7 2xl:p-8"
        >
          {/* Banner de Erro Centralizado */}
          {errorMessage && (
            <ErrorMessage
              message={errorMessage}
              onDismiss={clearError}
            />
          )}

          {/* Renderização da Rota Ativa */}
          <Outlet />

          {/* Modal compulsório de definição de nova senha */}
          {mustChangePassword && <MustChangePasswordModal />}
        </main>
      </div>
    </div>
  );
};
