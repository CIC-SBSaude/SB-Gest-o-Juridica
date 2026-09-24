import React, { useState } from 'react';
import { AlertTriangle, X, Loader2, ShieldAlert } from 'lucide-react';
import { Company } from '../../types/database';
import { maskCNPJ } from '../../utils/cnpj';

interface CompanyDeleteModalProps {
  isOpen: boolean;
  company: Company | null;
  onClose: () => void;
  onConfirm: () => Promise<{ success: boolean; error?: string }>;
}

export const CompanyDeleteModal: React.FC<CompanyDeleteModalProps> = ({
  isOpen,
  company,
  onClose,
  onConfirm,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !company) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    setErrorMessage(null);

    const result = await onConfirm();
    setIsDeleting(false);

    if (!result.success && result.error) {
      setErrorMessage(result.error);
    }
  };

  return (
    <div
      id="company-delete-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
    >
      <div
        id="company-delete-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        className="bg-white rounded-xl shadow-2xl border border-red-200 w-full max-w-md overflow-hidden flex flex-col"
      >
        <div className="px-6 py-4 border-b border-red-100 flex items-center justify-between bg-red-50/50 shrink-0">
          <div className="flex items-center gap-2 text-red-700">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <h3 id="delete-modal-title" className="text-base font-bold text-red-900">
              Confirmar Exclusão
            </h3>
          </div>
          <button
            id="company-delete-close-btn"
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-700 font-medium">
                Tem certeza que deseja excluir esta empresa do sistema?
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1 mt-2">
                <div className="font-bold text-[#0F172A]">{company.nome}</div>
                {company.cnpj && (
                  <div className="text-slate-500 font-mono">CNPJ: {maskCNPJ(company.cnpj)}</div>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Esta ação removerá permanentemente a empresa da tabela <code className="font-mono text-slate-700">public.companies</code>. Se existirem processos vinculados, o banco de dados impedirá a exclusão por segurança da rastreabilidade processual.
          </p>

          {errorMessage && (
            <div
              id="company-delete-error"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 leading-relaxed"
            >
              {errorMessage}
            </div>
          )}
        </div>

        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
          <button
            id="company-delete-cancel-btn"
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-white text-xs font-semibold text-slate-700 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            id="company-delete-confirm-btn"
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Verificando e Excluindo...</span>
              </>
            ) : (
              <span>Confirmar Exclusão</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
