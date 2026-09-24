import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoadingScreen } from './components/common/LoadingScreen';
import { LoginPage } from './pages/auth/LoginPage';
import { UnauthorizedPage } from './pages/auth/UnauthorizedPage';
import { AppLayout } from './components/layout/AppLayout';

// Páginas de Operação
import { DashboardPage } from './pages/operation/DashboardPage';
import { ProcessesPage } from './pages/operation/ProcessesPage';
import { DeadlinesPage } from './pages/operation/DeadlinesPage';
import { LegalInboxPage } from './pages/operation/LegalInboxPage';

// Páginas de Cadastros
import { CompaniesPage } from './pages/records/CompaniesPage';

// Páginas de Administração
import { UsersPage } from './pages/admin/UsersPage';
import { EmailRulesPage } from './pages/admin/EmailRulesPage';
import { AiUsagePage } from './pages/admin/AiUsagePage';
import { ExceptionsPage } from './pages/admin/ExceptionsPage';
import { EmailAccountPage } from './pages/admin/EmailAccountPage';
import { TechnicalDiagnosticPage } from './pages/admin/TechnicalDiagnosticPage';

/**
 * Componente que gerencia o fluxo estrito de autenticação e autorização (Item 5 da especificação)
 * Fluxo:
 * Google -> Supabase Auth -> auth.users -> user_profiles -> claim_my_invite() -> active + role -> acesso
 */
const AppRouter: React.FC = () => {
  const { user, isLoading, isAuthorized, profileValidated, profileValidationError } = useAuth();

  if (isLoading || (user && !profileValidated && !profileValidationError)) {
    return <LoadingScreen message="Validando credenciais corporativas SB Saúde..." />;
  }

  return (
    <Routes>
      {/* 1. Rota de Login */}
      <Route
        path="/login"
        element={
          !user ? (
            <LoginPage />
          ) : !isAuthorized ? (
            <Navigate to="/unauthorized" replace />
          ) : (
            <Navigate to="/painel" replace />
          )
        }
      />

      {/* 2. Rota para usuário autenticado sem perfil ativo (active = false) */}
      <Route
        path="/unauthorized"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : isAuthorized ? (
            <Navigate to="/painel" replace />
          ) : (
            <UnauthorizedPage />
          )
        }
      />

      {/* 3. Rotas corporativas protegidas (autenticado com user_profiles.active = true) */}
      <Route
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : !isAuthorized ? (
            <Navigate to="/unauthorized" replace />
          ) : (
            <AppLayout />
          )
        }
      >
        {/* Redirecionamento da raiz para /painel */}
        <Route path="/" element={<Navigate to="/painel" replace />} />

        {/* OPERAÇÃO */}
        <Route path="/painel" element={<DashboardPage />} />
        <Route path="/processos" element={<ProcessesPage />} />
        <Route path="/prazos" element={<DeadlinesPage />} />
        <Route path="/caixa-juridica" element={<LegalInboxPage />} />

        {/* CADASTROS */}
        <Route path="/empresas" element={<CompaniesPage />} />

        {/* ADMINISTRAÇÃO */}
        <Route path="/admin/usuarios" element={<UsersPage />} />
        <Route path="/admin/regras-email" element={<EmailRulesPage />} />
        <Route path="/admin/conta-email" element={<EmailAccountPage />} />
        <Route path="/admin/uso-ia" element={<AiUsagePage />} />
        <Route path="/admin/excecoes" element={<ExceptionsPage />} />
        <Route path="/admin/diagnostico" element={<TechnicalDiagnosticPage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/painel" replace />} />
      </Route>
    </Routes>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
