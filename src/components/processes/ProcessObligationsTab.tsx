import React, { useState, useEffect } from 'react';
import { CheckCircle2, Plus, Loader2, Edit3, CheckSquare, XCircle, AlertCircle } from 'lucide-react';
import { Obligation } from '../../types/database';
import { obligationsService } from '../../services/obligationsService';
import { getDeadlineStatus, formatDateTime } from '../../utils/date';
import { ObligationModal } from './ObligationModal';
import { ActionDialog } from '../common/ActionDialog';

interface ProcessObligationsTabProps {
  processId: string;
  canEdit: boolean;
}

export const ProcessObligationsTab: React.FC<ProcessObligationsTabProps> = ({ processId, canEdit }) => {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedObligation, setSelectedObligation] = useState<Obligation | null>(null);

  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'COMPLETED'>('ALL');

  const [actionDialog, setActionDialog] = useState<{ kind: 'COMPLETE' | 'CANCEL'; obligation: Obligation } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadObligations = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await obligationsService.getObligations(processId, filter);
    if (err) setError(err);
    else setObligations(data);
    setLoading(false);
  };

  useEffect(() => {
    loadObligations();
  }, [processId, filter]);

  const handleOpenModal = (obligation?: Obligation) => {
    setSelectedObligation(obligation || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = (changed?: boolean) => {
    setIsModalOpen(false);
    setSelectedObligation(null);
    if (changed) loadObligations();
  };

  const handleComplete = (obs: Obligation) => {
    setActionError(null);
    setActionDialog({ kind: 'COMPLETE', obligation: obs });
  };

  const handleCancel = (obs: Obligation) => {
    setActionError(null);
    setActionDialog({ kind: 'CANCEL', obligation: obs });
  };

  const handleConfirmAction = async (value?: string) => {
    if (!actionDialog) return;
    setActionBusy(true);
    setActionError(null);
    const { kind, obligation } = actionDialog;
    const result = kind === 'COMPLETE'
      ? await obligationsService.completeObligation(obligation.id, obligation)
      : await obligationsService.cancelObligation(obligation.id, String(value || '').trim(), obligation);
    setActionBusy(false);
    if (!result.success) {
      setActionError(result.error || 'Falha ao atualizar obrigação.');
      return;
    }
    setActionDialog(null);
    await loadObligations();
  };

  if (loading && obligations.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-amber-600" />
          Obrigações e Prazos
        </h4>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="ALL">Todas</option>
            <option value="OPEN">Pendentes / Abertas</option>
            <option value="COMPLETED">Concluídas / Canceladas</option>
          </select>
          {canEdit && (
            <button
              type="button"
              onClick={() => handleOpenModal()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Obrigação
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs">
          {error}
        </div>
      )}

      {obligations.length === 0 && !loading ? (
        <div className="text-center py-8 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-sm">
          Nenhuma obrigação encontrada para o filtro selecionado.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {obligations.map((obs) => {
            const statusInfo = getDeadlineStatus(obs.prazo, obs.status);
            
            return (
              <div key={obs.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="p-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                        {obs.criticidade && obs.criticidade !== 'BAIXA' && (
                          <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[9px] font-bold flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" />
                            {obs.criticidade}
                          </span>
                        )}
                      </div>
                      <h5 className="font-bold text-slate-800 text-sm">{obs.descricao}</h5>
                    </div>

                    {canEdit && obs.status !== 'CUMPRIDA' && obs.status !== 'CANCELADA' && (
                      <div className="flex items-center gap-1 shrink-0 bg-slate-50 p-1 rounded-lg border border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleComplete(obs)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                          title="Marcar como Cumprida"
                        >
                          <CheckSquare className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenModal(obs)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                          title="Editar"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancel(obs)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          title="Cancelar Obrigação"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs">
                    <div>
                      <span className="text-slate-400 block mb-0.5">Prazo / Vencimento:</span>
                      <span className="font-medium text-slate-800">
                        {obs.prazo ? formatDateTime(obs.prazo) : 'Sem data definida'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">Responsável:</span>
                      <span className="font-medium text-slate-800">
                        {obs.responsavel?.display_name || 'Não atribuído'}
                      </span>
                    </div>
                    {obs.valor_multa_diaria && (
                      <div>
                        <span className="text-slate-400 block mb-0.5">Multa Diária (Astreintes):</span>
                        <span className="font-mono text-red-600 font-semibold">
                          R$ {Number(obs.valor_multa_diaria).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    {obs.valor_multa_limite && (
                      <div>
                        <span className="text-slate-400 block mb-0.5">Limite / Teto da Multa:</span>
                        <span className="font-mono text-red-600 font-semibold">
                          R$ {Number(obs.valor_multa_limite).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    {(obs.tipo_prazo || obs.evento_gerador) && (
                      <div>
                        <span className="text-slate-400 block mb-0.5">Tipo / Evento Gerador:</span>
                        <span className="font-medium text-slate-800">
                          {obs.tipo_prazo || 'N/A'} {obs.evento_gerador ? `- ${obs.evento_gerador}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {obs.observacoes && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <span className="text-slate-400 text-[10px] uppercase font-bold block mb-1">Observações</span>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap">{obs.observacoes}</p>
                    </div>
                  )}
                  
                  {obs.status === 'CUMPRIDA' && obs.concluido_em && (
                    <div className="mt-3 p-2 bg-emerald-50 rounded border border-emerald-100 text-xs text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Concluída em <strong>{formatDateTime(obs.concluido_em)}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ActionDialog
        isOpen={Boolean(actionDialog)}
        title={actionDialog?.kind === 'COMPLETE' ? 'Confirmar cumprimento' : 'Cancelar obrigação'}
        message={actionDialog ? `"${actionDialog.obligation.descricao}"` : ''}
        confirmLabel={actionDialog?.kind === 'COMPLETE' ? 'Marcar como cumprida' : 'Cancelar obrigação'}
        variant={actionDialog?.kind === 'COMPLETE' ? 'default' : 'danger'}
        inputLabel={actionDialog?.kind === 'CANCEL' ? 'Motivo do cancelamento' : undefined}
        inputPlaceholder={actionDialog?.kind === 'CANCEL' ? 'Descreva o motivo do cancelamento' : undefined}
        inputRequired={actionDialog?.kind === 'CANCEL'}
        busy={actionBusy}
        error={actionError}
        onClose={() => {
          if (actionBusy) return;
          setActionDialog(null);
          setActionError(null);
        }}
        onConfirm={handleConfirmAction}
      />

      {isModalOpen && (
        <ObligationModal
          isOpen={isModalOpen}
          processId={processId}
          obligation={selectedObligation}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};
