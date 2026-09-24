import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Filter,
  Loader2,
  CheckCircle2,
  UserCheck,
  FileText,
  Scale,
  RefreshCw,
} from 'lucide-react';
import { EmailException, Process } from '../../types/database';
import { inboxService, ExceptionsFilters } from '../../services/inboxService';
import { formatDateTime } from '../../utils/date';
import { formatProcessNumber } from '../../utils/cnj';
import { useAuth } from '../../hooks/useAuth';
import { HumanReviewModal } from '../../components/inbox/HumanReviewModal';
import { EmailDetailsModal } from '../../components/inbox/EmailDetailsModal';
import { ProcessDetailsModal } from '../../components/processes/ProcessDetailsModal';
import { ActionDialog } from '../../components/common/ActionDialog';
import type { FalseProtocolRepairPreview } from '../../services/inboxService';

export const ExceptionsPage: React.FC = () => {
  const { profile } = useAuth();
  const [exceptions, setExceptions] = useState<EmailException[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ExceptionsFilters>({ status: 'ABERTA' });

  // Modais operacionais
  const [selectedExceptionForReview, setSelectedExceptionForReview] = useState<EmailException | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const [selectedEmailIdForDetails, setSelectedEmailIdForDetails] = useState<string | null>(null);
  const [isEmailDetailsOpen, setIsEmailDetailsOpen] = useState(false);

  const [selectedProcessForDetails, setSelectedProcessForDetails] = useState<Process | null>(null);
  const [isProcessDetailsOpen, setIsProcessDetailsOpen] = useState(false);
  const [repairPreview, setRepairPreview] = useState<FalseProtocolRepairPreview | null>(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [repairNotice, setRepairNotice] = useState<string | null>(null);

  const canEdit = profile?.role === 'ADMIN' || profile?.role === 'GESTOR' || profile?.role === 'ANALISTA';
  const canRepair = profile?.role === 'ADMIN' || profile?.role === 'GESTOR';

  const loadExceptions = async () => {
    setLoading(true);
    const { data } = await inboxService.getExceptions(filters);
    setExceptions(data);
    setLoading(false);
  };

  useEffect(() => {
    loadExceptions();
  }, [filters]);

  const handleOpenReview = (exception: EmailException) => {
    setSelectedExceptionForReview(exception);
    setIsReviewOpen(true);
  };

  const handleCloseReview = (changed?: boolean) => {
    setIsReviewOpen(false);
    setSelectedExceptionForReview(null);
    if (changed) {
      loadExceptions();
    }
  };

  const handleOpenEmailDetails = (emailId?: string | null) => {
    if (!emailId) return;
    setSelectedEmailIdForDetails(emailId);
    setIsEmailDetailsOpen(true);
  };

  const handleOpenProcessDetails = (proc: any) => {
    if (!proc) return;
    setSelectedProcessForDetails(proc as Process);
    setIsProcessDetailsOpen(true);
  };

  const prepareRepair = async () => {
    setRepairBusy(true); setRepairError(null); setRepairNotice(null);
    try {
      const preview = await inboxService.previewFalseProtocolRepair();
      if (!preview.executable) {
        setRepairNotice(`Prévia concluída: ${preview.selected} caso(s) analisado(s), mas nenhum pode ser resolvido automaticamente com os dados atuais.`);
      } else setRepairPreview(preview);
    } catch (error: any) { setRepairError(error?.message || 'Falha ao preparar a reparação.'); }
    finally { setRepairBusy(false); }
  };

  const executeRepair = async () => {
    if (!repairPreview) return;
    const ids = repairPreview.cases.filter(item => item.executable).map(item => item.exceptionId);
    setRepairBusy(true); setRepairError(null);
    try {
      const result = await inboxService.executeFalseProtocolRepair(ids);
      setRepairPreview(null);
      const summary = `Reparação concluída: ${result.resolved} resolvida(s), ${result.requiresReview} mantida(s) para revisão e ${result.errors} erro(s). Classificações antigas recuperadas: ${result.staleClassificationsRecovered || 0}.`;
      const failures = (result.results || []).filter(item => item.status === 'ERROR');
      if (failures.length) {
        setRepairNotice(null);
        setRepairError(`${summary} Motivo: ${failures.map(item => item.reason || `Falha no caso ${item.exceptionId}`).join(' | ')}`);
      } else {
        setRepairError(null);
        setRepairNotice(summary);
      }
      await loadExceptions();
    } catch (error: any) { setRepairError(error?.message || 'Falha ao executar a reparação.'); }
    finally { setRepairBusy(false); }
  };

  return (
    <div className="min-w-0 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            Exceções de E-mail
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Fila de triagem, pendências de validação e revisão humana da esteira jurídica.
          </p>
        </div>

        <div className="flex gap-2">
        {canRepair && <button type="button" onClick={prepareRepair} disabled={repairBusy}
          className="inline-flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition">
          {repairBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Reparar falsos protocolos
        </button>}
        <button
          onClick={loadExceptions}
          disabled={loading}
          className="self-start md:self-auto inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg disabled:opacity-50 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Fila</span>
        </button>
        </div>
      </div>

      {(repairError || repairNotice) && <div className={`rounded-lg border px-4 py-3 text-xs ${repairError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{repairError || repairNotice}</div>}

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Status</label>
            <select
              value={filters.status || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value || undefined }))}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-amber-500 outline-none"
            >
              <option value="">Todos os Status</option>
              <option value="ABERTA">Abertas (inclui Pendentes)</option>
              <option value="RESOLVIDA">Resolvidas</option>
              <option value="IGNORADA">Ignoradas</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Tipo de Exceção</label>
            <select
              value={filters.exception_type || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, exception_type: e.target.value || undefined }))}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-amber-500 outline-none"
            >
              <option value="">Todos os Tipos</option>
              <option value="CNJ_DV_PENDENTE_VALIDACAO">CNJ com DV Pendente</option>
              <option value="CNJ_MULTIPLO_AMBIGUO">CNJ Múltiplo / Ambíguo</option>
              <option value="PROTOCOLO_MULTIPLO_AMBIGUO">Protocolo Múltiplo / Ambíguo</option>
              <option value="IA_BAIXA_CONFIANCA">Baixa Confiança da IA</option>
              <option value="PROCESS_NOT_FOUND">Processo Não Encontrado</option>
              <option value="MISSING_DATA">Dados Faltantes</option>
              <option value="ATTACHMENT_ERROR">Erro de Anexo</option>
              <option value="OTHER">Outros</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabela de Exceções */}
      {loading ? (
        <div className="flex items-center justify-center p-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed 2xl:table-auto text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-3 xl:px-4 py-3 w-[12%] min-w-[92px]">Status</th>
                  <th className="px-3 xl:px-4 py-3 w-[20%] min-w-[140px]">Tipo de Exceção</th>
                  <th className="px-3 xl:px-4 py-3 w-[34%] min-w-[220px]">Motivo & Alerta</th>
                  <th className="hidden xl:table-cell px-3 xl:px-4 py-3 min-w-[190px]">E-mail de Origem</th>
                  <th className="hidden md:table-cell px-3 xl:px-4 py-3 w-[22%] min-w-[150px]">Processo Vinculado</th>
                  <th className="hidden lg:table-cell px-3 xl:px-4 py-3 w-[12%] min-w-[105px]">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {exceptions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      Nenhuma exceção encontrada com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  exceptions.map((exc) => {
                    const isResolved = exc.status === 'RESOLVIDA';
                    const isOpenExc = exc.status === 'ABERTA' || exc.status === 'PENDENTE';
                    const proc = exc.email?.process;

                    return (
                      <tr
                        key={exc.id}
                        tabIndex={0}
                        role="button"
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return;
                          if (canEdit) handleOpenReview(exc);
                          else handleOpenEmailDetails(exc.processed_email_id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (canEdit) handleOpenReview(exc);
                            else handleOpenEmailDetails(exc.processed_email_id);
                          }
                        }}
                        className="cursor-pointer hover:bg-slate-50/80 focus:bg-slate-50 transition-colors outline-none"
                      >
                        <td className="px-3 xl:px-4 py-3.5">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isResolved
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : isOpenExc
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {isOpenExc ? 'ABERTA' : exc.status}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 font-semibold text-slate-800">
                          {exc.exception_type}
                        </td>

                        <td className="px-3 xl:px-4 py-3.5">
                          <span className="text-slate-700 block leading-snug" title={exc.reason || ''}>
                            {exc.reason || '-'}
                          </span>
                          {exc.resolution_note && (
                            <span className="text-[10px] text-slate-400 mt-1 block italic leading-tight">
                              Decisão: {exc.resolution_note}
                            </span>
                          )}
                        </td>

                        <td className="hidden xl:table-cell px-3 xl:px-4 py-3.5">
                          {exc.email ? (
                            <div>
                              <button
                                type="button"
                                onClick={() => handleOpenEmailDetails(exc.processed_email_id)}
                                className="font-semibold text-slate-800 hover:text-indigo-600 transition truncate max-w-[220px] block cursor-pointer text-left"
                                title={exc.email.subject || '(Sem assunto)'}
                              >
                                {exc.email.subject || '(Sem assunto)'}
                              </button>
                              <span className="text-[10px] text-slate-400 truncate max-w-[220px] block">
                                {exc.email.sender_email}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">E-mail não carregado</span>
                          )}
                        </td>

                        <td className="hidden md:table-cell px-3 xl:px-4 py-3.5">
                          {proc ? (
                            <button
                              type="button"
                              onClick={() => handleOpenProcessDetails(proc)}
                              className="font-mono font-bold text-slate-800 hover:text-red-600 transition flex items-center gap-1 cursor-pointer"
                            >
                              <Scale className="w-3.5 h-3.5 text-slate-400" />
                              <span>{formatProcessNumber(proc.numero_processo) || 'Processo'}</span>
                            </button>
                          ) : exc.email?.matched_process_number ? (
                            <span className="font-mono text-amber-700">
                              {exc.email.matched_process_number} (candidato)
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Não vinculado</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-slate-500 font-mono text-[11px]">
                          {formatDateTime(exc.created_at)}
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Revisão Humana Completa */}
      {selectedExceptionForReview && (
        <HumanReviewModal
          isOpen={isReviewOpen}
          exceptionId={selectedExceptionForReview.id}
          emailId={selectedExceptionForReview.processed_email_id}
          onClose={handleCloseReview}
        />
      )}

      {/* Modal de Detalhes do E-mail */}
      {selectedEmailIdForDetails && (
        <EmailDetailsModal
          isOpen={isEmailDetailsOpen}
          emailId={selectedEmailIdForDetails}
          onClose={() => {
            setIsEmailDetailsOpen(false);
            setSelectedEmailIdForDetails(null);
          }}
        />
      )}

      {/* Modal de Detalhes do Processo */}
      {selectedProcessForDetails && (
        <ProcessDetailsModal
          isOpen={isProcessDetailsOpen}
          process={selectedProcessForDetails}
          canEdit={canEdit}
          canDelete={false}
          onClose={() => {
            setIsProcessDetailsOpen(false);
            setSelectedProcessForDetails(null);
          }}
          onEdit={() => {}}
          onChangeStatus={() => {}}
          onToggleArchive={() => {}}
          onDelete={() => {}}
        />
      )}
      <ActionDialog isOpen={Boolean(repairPreview)} title="Reparar falsos protocolos — até 10 casos"
        message={repairPreview ? `A prévia encontrou ${repairPreview.totalAffected} caso(s) afetado(s), dos quais ${repairPreview.totalExecutable} estão aptos. Neste lote: ${repairPreview.executable} executável(is) e ${repairPreview.requiresReview} mantido(s) para revisão. Casos executáveis: ${repairPreview.cases.filter(item => item.executable).map(item => `${item.subject || item.exceptionId} → ${item.validCnjs.join(', ')}`).join(' | ') || 'nenhum'}. Nenhuma empresa será criada e nenhum vínculo humano será substituído.` : ''}
        confirmLabel="Executar casos seguros" variant="warning" busy={repairBusy} error={repairError}
        onClose={() => { if (!repairBusy) { setRepairPreview(null); setRepairError(null); } }} onConfirm={executeRepair} />
    </div>
  );
};
