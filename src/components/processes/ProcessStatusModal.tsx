import React, { useState } from 'react';
import { X, Clock, Loader2, Check } from 'lucide-react';
import { Process, ProcessStatus } from '../../types/database';
import { STATUS_CONFIG } from './ProcessStatusBadge';
import { formatProcessNumber } from '../../utils/cnj';

interface ProcessStatusModalProps {
  isOpen: boolean;
  process: Process | null;
  onClose: () => void;
  onUpdateStatus: (newStatus: ProcessStatus) => Promise<{ success: boolean; error?: string }>;
}

const AVAILABLE_STATUSES: { status: ProcessStatus; desc: string }[] = [
  { status: 'NOVA', desc: 'Demanda recém-recebida, aguardando início do processamento.' },
  { status: 'TRIAGEM', desc: 'Em análise preliminar de requisitos, comarca e competência.' },
  { status: 'EM_ANALISE', desc: 'Estudo técnico dos pedidos, documentos e viabilidade de defesa.' },
  { status: 'EM_TRATAMENTO', desc: 'Elaboração de peça processual ou cumprimento de determinação.' },
  { status: 'AGUARDANDO_TERCEIRO', desc: 'Depende de informações de área técnica, perito ou parceiro.' },
  { status: 'AGUARDANDO_DECISAO', desc: 'Concluso ao magistrado ou pendente de publicação de decisão.' },
  { status: 'CONCLUIDA', desc: 'Demanda encerrada ou obrigação cumprida integralmente.' },
  { status: 'CANCELADA', desc: 'Demanda cancelada ou extinta sem resolução de mérito.' },
];

export const ProcessStatusModal: React.FC<ProcessStatusModalProps> = ({
  isOpen,
  process: currentProcess,
  onClose,
  onUpdateStatus,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<ProcessStatus>(
    (currentProcess?.status_atual as ProcessStatus) || 'NOVA'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (currentProcess) {
      setSelectedStatus((currentProcess.status_atual as ProcessStatus) || 'NOVA');
      setErrorMessage(null);
    }
  }, [currentProcess, isOpen]);

  if (!isOpen || !currentProcess) return null;

  const handleSubmit = async () => {
    if (selectedStatus === currentProcess.status_atual) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await onUpdateStatus(selectedStatus);
    setIsSubmitting(false);

    if (!result.success && result.error) {
      setErrorMessage(result.error);
    } else {
      onClose();
    }
  };

  return (
    <div
      id="process-status-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        id="process-status-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-modal-title"
        className="bg-white rounded-xl shadow-2xl border border-slate-200/80 w-full max-w-lg overflow-hidden flex flex-col"
      >
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 id="status-modal-title" className="text-sm font-bold text-[#0F172A]">
                Alterar Status do Processo
              </h3>
              <p className="text-xs text-slate-500 font-mono">
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

        {/* Lista de Status com Rádio */}
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              {errorMessage}
            </div>
          )}

          <div className="space-y-2">
            {AVAILABLE_STATUSES.map((item) => {
              const cfg = STATUS_CONFIG[item.status] || {
                label: item.status,
                bg: 'bg-slate-50',
                text: 'text-slate-700',
                border: 'border-slate-200',
                dot: 'bg-slate-400',
              };
              const isSelected = selectedStatus === item.status;

              return (
                <label
                  key={item.status}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? 'border-red-500 bg-red-50/30 shadow-2xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="processStatus"
                    value={item.status}
                    checked={isSelected}
                    onChange={() => setSelectedStatus(item.status)}
                    disabled={isSubmitting}
                    className="mt-1 text-red-600 focus:ring-red-500 h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <span className="text-xs font-bold text-slate-900">{cfg.label}</span>
                      <span className="text-[10px] font-mono text-slate-400 uppercase">({item.status})</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">{item.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3.5 border-t border-slate-200/80 bg-slate-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-white text-xs font-semibold text-slate-700 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Atualizando...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Salvar Status</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
