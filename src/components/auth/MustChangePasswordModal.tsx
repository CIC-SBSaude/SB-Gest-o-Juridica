import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Lock, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const MustChangePasswordModal: React.FC = () => {
  const { changePassword, signOut, refreshProfile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('A confirmação da senha não confere com a nova senha.');
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await changePassword(currentPassword, newPassword);
      if (ok) {
        setSuccessMsg('Senha atualizada com sucesso! Acessando a plataforma...');
        setTimeout(async () => {
          await refreshProfile();
        }, 700);
      } else {
        setErrorMsg('Não foi possível alterar a senha. Verifique a senha atual ou tente novamente.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro inesperado ao alterar a senha.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF1F2] text-[#E30613]">
            <KeyRound className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-extrabold text-[#17233A]">Troca Obrigatória de Senha</h2>
          <p className="mt-2 text-xs text-[#64748B]">
            Por políticas corporativas de segurança, você deve definir uma nova senha permanente para acessar o sistema.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#E30613]" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#334155] mb-1.5" htmlFor="current-pwd">
              Senha Temporária / Atual
            </label>
            <div className="relative">
              <input
                id="current-pwd"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Informe a senha que usou no login"
                className="w-full rounded-lg border border-[#CBD5E1] px-3.5 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:border-[#E30613] focus:outline-none focus:ring-2 focus:ring-[#E30613]/20"
              />
              <Lock className="absolute right-3 top-2.5 h-4 w-4 text-[#94A3B8]" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#334155] mb-1.5" htmlFor="new-pwd">
              Nova Senha Permanente (mínimo 6 caracteres)
            </label>
            <div className="relative">
              <input
                id="new-pwd"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha segura"
                className="w-full rounded-lg border border-[#CBD5E1] px-3.5 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:border-[#E30613] focus:outline-none focus:ring-2 focus:ring-[#E30613]/20"
              />
              <Lock className="absolute right-3 top-2.5 h-4 w-4 text-[#94A3B8]" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#334155] mb-1.5" htmlFor="confirm-pwd">
              Confirme a Nova Senha
            </label>
            <div className="relative">
              <input
                id="confirm-pwd"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full rounded-lg border border-[#CBD5E1] px-3.5 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:border-[#E30613] focus:outline-none focus:ring-2 focus:ring-[#E30613]/20"
              />
              <Lock className="absolute right-3 top-2.5 h-4 w-4 text-[#94A3B8]" />
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              id="confirm-password-change-btn"
              type="submit"
              disabled={isSubmitting}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#E30613] px-4 py-2.5 text-xs font-bold text-white shadow-[0_4px_12px_rgba(227,6,19,0.25)] transition hover:bg-[#C90010] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Atualizando...' : 'Definir Nova Senha e Acessar'}
            </button>

            <button
              id="cancel-password-change-btn"
              type="button"
              onClick={signOut}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] px-4 py-2 text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC]"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair do sistema
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
