import React, { useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Lock,
  LockKeyhole,
  Scale,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const LoginPage: React.FC = () => {
  const { signInWithCredentials, requestPasswordReset, isLoading, errorMessage, isConfigured } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Estado do modal/seção "Esqueci minha senha"
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSuccessMessage, setForgotSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier || !password) {
      setLocalError('Informe seu usuário ou e-mail corporativo e sua senha.');
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await signInWithCredentials(cleanIdentifier, password);
      if (!ok) {
        // Erro já definido no AuthContext ou na mensagem de retorno
      }
    } catch (err: any) {
      setLocalError(err.message || 'Erro inesperado ao realizar login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) return;

    setForgotSubmitting(true);
    setForgotSuccessMessage(null);
    try {
      const res = await requestPasswordReset(forgotIdentifier.trim());
      setForgotSuccessMessage(res.message);
    } catch {
      setForgotSuccessMessage('Se a conta estiver cadastrada e ativa, as instruções foram enviadas.');
    } finally {
      setForgotSubmitting(false);
    }
  };

  const displayError = localError || errorMessage;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F7F9FC] font-sans text-[#0F172A]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 bottom-[-12rem] h-[34rem] w-[34rem] rounded-full bg-[#DBEAFE]/35 blur-3xl" />
        <div className="absolute -right-32 top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-[#FEE2E2]/55 blur-3xl" />
      </div>

      <div className="absolute right-6 top-5 z-10 hidden sm:flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white/90 px-4 py-2 text-[11px] font-semibold text-[#475569] shadow-sm backdrop-blur">
        <ShieldCheck className="h-4 w-4 text-[#E30613]" />
        Ambiente Corporativo Seguro
      </div>

      <main className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1180px] grid-cols-1 items-center gap-10 px-5 py-16 lg:grid-cols-[1.08fr_0.92fr] lg:gap-24 lg:px-10">
        <section className="mx-auto w-full max-w-[560px] lg:mx-0">
          <img
            src="/sb-saude-logo.png"
            alt="SB Saúde"
            className="mb-8 h-auto w-[190px] object-contain object-left"
          />

          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#FECACA] bg-[#FFF5F5] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#D90416]">
            <Scale className="h-3.5 w-3.5" />
            Plataforma de Gestão Jurídica
          </div>

          <h1 className="text-[34px] font-extrabold tracking-tight text-[#13233B] sm:text-[42px]">
            <span className="text-[#E30613]">SB</span> Gestão Jurídica
          </h1>
          <p className="mt-4 max-w-[540px] text-[15px] leading-7 text-[#52637A]">
            Plataforma corporativa para centralizar processos, prazos, responsabilidades e informações relevantes da gestão jurídica.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#E2E8F0] bg-white/85 p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)] backdrop-blur">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF1F2] text-[#E30613]">
                <Building2 className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-bold text-[#17233A]">Gestão Jurídica Integrada</h2>
              <p className="mt-2 text-xs leading-5 text-[#64748B]">
                Processos, obrigações, prazos e responsabilidades reunidos em uma visão corporativa única.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E2E8F0] bg-white/85 p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)] backdrop-blur">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF1F2] text-[#E30613]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-bold text-[#17233A]">Controle e Acompanhamento</h2>
              <p className="mt-2 text-xs leading-5 text-[#64748B]">
                Monitoramento de riscos, pendências, escritórios e movimentações relevantes para a tomada de decisão.
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#E2E8F0] bg-white/70 px-4 py-3 text-xs leading-5 text-[#64748B]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#E30613]" />
            <span>Ambiente preparado para gestão jurídica corporativa, controle de prazos, obrigações e acompanhamento executivo.</span>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[430px]">
          <div className="rounded-2xl border border-[#DCE3EC] bg-white p-7 shadow-[0_20px_55px_rgba(15,23,42,0.08)] sm:p-9">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF1F2] text-[#E30613]">
                <LockKeyhole className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-extrabold tracking-tight text-[#17233A]">Acesso Corporativo</h2>
              <p className="mt-1 text-xs text-[#64748B]">Utilize seu login ou e-mail institucional e senha para entrar.</p>
            </div>

            {displayError && (
              <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#E30613]" />
                <span>{displayError}</span>
              </div>
            )}

            {!isConfigured && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                <strong className="block text-amber-900">Conexão Supabase pendente</strong>
                Configure as variáveis públicas do frontend antes da autenticação.
              </div>
            )}

            {!showForgotPassword ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#334155] mb-1.5" htmlFor="login-identifier">
                    Identificador (Login ou E-mail)
                  </label>
                  <div className="relative">
                    <input
                      id="login-identifier"
                      type="text"
                      required
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="ex: juridico.sb ou nome@opsaudebrasil.com.br"
                      className="w-full rounded-lg border border-[#CBD5E1] pl-9 pr-3.5 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:border-[#E30613] focus:outline-none focus:ring-2 focus:ring-[#E30613]/20"
                    />
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-[#94A3B8]" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-[#334155]" htmlFor="login-password">
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotIdentifier(identifier);
                        setShowForgotPassword(true);
                      }}
                      className="text-[11px] font-semibold text-[#E30613] hover:underline"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Digite sua senha de acesso"
                      className="w-full rounded-lg border border-[#CBD5E1] pl-9 pr-10 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:border-[#E30613] focus:outline-none focus:ring-2 focus:ring-[#E30613]/20"
                    />
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#94A3B8]" />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-[#94A3B8] hover:text-[#475569]"
                      aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  id="credentials-login-btn"
                  type="submit"
                  disabled={isLoading || isSubmitting || !isConfigured}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#E30613] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_18px_rgba(227,6,19,0.18)] transition hover:bg-[#C90010] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <KeyRound className="h-4 w-4" />
                  {isLoading || isSubmitting ? 'Autenticando...' : 'Acessar Plataforma'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 leading-5">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <HelpCircle className="h-3.5 w-3.5 text-blue-700" />
                    Recuperação de Senha
                  </div>
                  Informe seu usuário ou e-mail corporativo. Se o usuário estiver ativo, enviaremos as instruções de redefinição.
                </div>

                {forgotSuccessMessage && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{forgotSuccessMessage}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#334155] mb-1.5" htmlFor="forgot-identifier">
                    Identificador (Login ou E-mail)
                  </label>
                  <div className="relative">
                    <input
                      id="forgot-identifier"
                      type="text"
                      required
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      placeholder="ex: juridico.sb ou nome@opsaudebrasil.com.br"
                      className="w-full rounded-lg border border-[#CBD5E1] pl-9 pr-3.5 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:border-[#E30613] focus:outline-none focus:ring-2 focus:ring-[#E30613]/20"
                    />
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-[#94A3B8]" />
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <button
                    id="submit-forgot-pwd-btn"
                    type="submit"
                    disabled={forgotSubmitting}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#E30613] px-4 py-2.5 text-xs font-bold text-white shadow-[0_4px_12px_rgba(227,6,19,0.2)] transition hover:bg-[#C90010] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {forgotSubmitting ? 'Enviando...' : 'Enviar Instruções'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotSuccessMessage(null);
                    }}
                    className="w-full text-center text-xs font-semibold text-[#64748B] hover:text-[#17233A] py-1.5"
                  >
                    Voltar para o login
                  </button>
                </div>
              </form>
            )}

            <div className="my-6 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#94A3B8]">
              <div className="h-px flex-1 bg-[#E8EDF3]" />
              Controle de acesso
              <div className="h-px flex-1 bg-[#E8EDF3]" />
            </div>

            <div className="flex items-start gap-2.5 text-xs leading-5 text-[#64748B]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>O acesso é restrito a colaboradores autorizados da SB Saúde com perfil ativo.</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-[11px] text-[#94A3B8]">
        © {new Date().getFullYear()} SB Saúde Operadora de Saúde. Todos os direitos reservados.
      </footer>
    </div>
  );
};
