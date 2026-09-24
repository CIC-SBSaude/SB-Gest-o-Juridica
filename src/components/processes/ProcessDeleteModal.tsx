import React, { useState, useEffect } from 'react';
import { X, Trash2, AlertTriangle, Loader2, Archive, Ban } from 'lucide-react';
import { Process } from '../../types/database';
import { processesService, ProcessDependenciesCheck } from '../../services/processesService';
import { formatProcessNumber } from '../../utils/cnj';

interface ProcessDeleteModalProps {
  isOpen: boolean;
  process: Process | null;
  onClose: () => void;
  onConfirmDelete: (id: string) => Promise<{ success: boolean; error?: string }>;
  onArchiveAlternative?: (process: Process) => Promise<void>;
  onCancelAlternative?: (process: Process) => Promise<void>;
}

export const ProcessDeleteModal: React.FC<ProcessDeleteModalProps> = ({
  isOpen,
  process: currentProcess,
  onClose,
  onConfirmDelete,
  onArchiveAlternative,
  onCancelAlternative,
}) => {
  const [isChecking, setIsChecking] = useState(true);
  const [depCheck, setDepCheck] = useState<ProcessDependenciesCheck | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function check() {
      if (!currentProcess || !isOpen) return;
      setIsChecking(true);
      setErrorMessage(null);

      const checkResult = await processesService.checkDependencies(currentProcess.id);
      if (isMounted) {
        setDepCheck(checkResult);
        setIsChecking(false);
      }
    }

    check();

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentProcess]);

  if (!isOpen || !currentProcess) return null;

  const handleDelete = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await onConfirmDelete(currentProcess.id);
    setIsSubmitting(false);

    if (!result.success && result.error) {
      setErrorMessage(result.error);
    } else {
      onClose();
    }
  };

  const hasDependencies = depCheck && !depCheck.canDelete;

  return (
    <div
      id="process-delete-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        id="process-delete-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        className="bg-white rounded-xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden flex flex-col"
      >
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between bg-red-50/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center text-red-700 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 id="delete-modal-title" className="text-sm font-bold text-red-950">
                Excluir Processo Judicial
              </h3>
              <p className="text-xs text-red-800/80 font-mono">
                {formatProcessNumber(currentProcess.numero_processo) || 'Sem número CNJ'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              {errorMessage}
            </div>
          )}

          {isChecking ? (
            <div className="py-6 text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-red-600 mx-auto" />
              <p className="text-xs text-slate-500">
                Verificando integridade referencial nas tabelas do Supabase...
              </p>
            </div>
          ) : hasDependencies ? (
            <div className="space-y-4">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-2">
                <strong className="block font-bold">Exclusão Impedida por Integridade Referencial</strong>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  Este processo possui vínculos que impedem a exclusão física no banco de dados. Para preservar a rastreabilidade e histórico legal, você pode arquivar o processo ou alterar o status para CANCELADA.
                </p>
                {depCheck && (
                  <div className="mt-2 pt-2 border-t border-amber-200 text-[11px] space-y-1">
                    {depCheck.details.obligations > 0 && (
                      <div>• Obrigações vinculadas: {depCheck.details.obligations}</div>
                    )}
                    {depCheck.details.documents > 0 && (
                      <div>• Documentos anexados: {depCheck.details.documents}</div>
                    )}
                    {depCheck.details.timelineEvents > 0 && (
                      <div>• Eventos na linha do tempo: {depCheck.details.timelineEvents}</div>
                    )}
                    {depCheck.details.parties > 0 && (
                      <div>• Partes associadas: {depCheck.details.parties}</div>
                    )}
                    {depCheck.details.history > 0 && (
                      <div>• Registros de histórico: {depCheck.details.history}</div>
                    )}
                    {depCheck.details.emails > 0 && (
                      <div>• E-mails processados: {depCheck.details.emails}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Ações Alternativas Recomendadas */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Ações Recomendadas:
                </span>
                {onArchiveAlternative && (
                  <button
                    type="button"
                    onClick={async () => {
                      setIsSubmitting(true);
                      await onArchiveAlternative(currentProcess);
                      setIsSubmitting(false);
                      onClose();
                    }}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5 text-slate-500" />
                    <span>Arquivar Processo (Manter Histórico)</span>
                  </button>
                )}
                {onCancelAlternative && (
                  <button
                    type="button"
                    onClick={async () => {
                      setIsSubmitting(true);
                      await onCancelAlternative(currentProcess);
                      setIsSubmitting(false);
                      onClose();
                    }}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5 text-slate-500" />
                    <span>Alterar Status para Cancelada</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Tem certeza de que deseja excluir o processo <strong className="font-mono text-slate-900">{formatProcessNumber(currentProcess.numero_processo) || currentProcess.id}</strong>?
              </p>
              <p className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed">
                A integridade referencial foi verificada e nenhuma obrigação ou documento está vinculado. Esta ação é irreversível.
              </p>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3.5 border-t border-slate-200/80 bg-slate-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-white text-xs font-semibold text-slate-700 transition cursor-pointer"
          >
            {hasDependencies ? 'Fechar' : 'Cancelar'}
          </button>
          {!hasDependencies && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting || isChecking}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Excluindo...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Definitivamente</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
