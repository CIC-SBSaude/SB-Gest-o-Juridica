import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Lock, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('A confirmação não confere com a nova senha.');
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await changePassword(currentPassword, newPassword);
      if (ok) {
        setSuccessMsg('Senha alterada com sucesso!');
        setTimeout(() => {
          onClose();
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setSuccessMsg(null);
        }, 1500);
      } else {
        setErrorMsg('Não foi possível alterar a senha. Verifique a senha atual.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro inesperado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-xl sm:p-7">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF1F2] text-[#E30613]">
              <KeyRound className="h-5 w-5" />
            </div>
            <h2 className="text-base font-bold text-[#17233A]">Alterar Senha</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#E30613]" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-[#334155] mb-1" htmlFor="cp-current">
              Senha Atual
            </label>
            <div className="relative">
              <input
                id="cp-current"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Informe sua senha atual"
                className="w-full rounded-lg border border-[#CBD5E1] px-3.5 py-2 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:border-[#E30613] focus:outline-none focus:ring-2 focus:ring-[#E30613]/20"
              />
              <Lock className="absolute right-3 top-2 h-4 w-4 text-[#94A3B8]" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#334155] mb-1" htmlFor="cp-new">
              Nova Senha (mínimo 6 caracteres)
            </label>
            <div className="relative">
              <input
                id="cp-new"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha"
                className="w-full rounded-lg border border-[#CBD5E1] px-3.5 py-2 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:border-[#E30613] focus:outline-none focus:ring-2 focus:ring-[#E30613]/20"
              />
              <Lock className="absolute right-3 top-2 h-4 w-4 text-[#94A3B8]" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#334155] mb-1" htmlFor="cp-confirm">
              Confirmar Nova Senha
            </label>
            <div className="relative">
              <input
                id="cp-confirm"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full rounded-lg border border-[#CBD5E1] px-3.5 py-2 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:border-[#E30613] focus:outline-none focus:ring-2 focus:ring-[#E30613]/20"
              />
              <Lock className="absolute right-3 top-2 h-4 w-4 text-[#94A3B8]" />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E2E8F0] px-3.5 py-2 text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[#E30613] px-4 py-2 text-xs font-bold text-white shadow-[0_4px_12px_rgba(227,6,19,0.25)] transition hover:bg-[#C90010] disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar Senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
