import React, { useState, useEffect } from 'react';
import {
  X,
  Loader2,
  FileText,
  Link as LinkIcon,
  BrainCircuit,
  Workflow,
  CheckCircle2,
  AlertTriangle,
  Clock,
  DollarSign,
  ShieldAlert,
  Scale,
  Building,
} from 'lucide-react';
import { ProcessedEmail, ProcessEvidence } from '../../types/database';
import { inboxService } from '../../services/inboxService';
import { formatDateTime } from '../../utils/date';

interface EmailDetailsModalProps {
  isOpen: boolean;
  emailId: string;
  onClose: () => void;
}

export const EmailDetailsModal: React.FC<EmailDetailsModalProps> = ({ isOpen, emailId, onClose }) => {
  const [email, setEmail] = useState<ProcessedEmail | null>(null);
  const [evidence, setEvidence] = useState<ProcessEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const loadDetails = async () => {
        setLoading(true);
        setError(null);

        const [emailRes, evidenceRes] = await Promise.all([
          inboxService.getEmailDetails(emailId),
          inboxService.getEmailEvidence(emailId),
        ]);

        if (emailRes.error) setError(emailRes.error);
        else setEmail(emailRes.data);

        if (!evidenceRes.error) setEvidence(evidenceRes.data);

        setLoading(false);
      };

      loadDetails();
    }
  }, [isOpen, emailId]);

  if (!isOpen) return null;

  const semantic = email?.metadata?.semantic_interpretation;
  const ident = semantic?.identification;
  const classification = semantic?.classification;
  const values = semantic?.values;
  const deadlineStruct = semantic?.deadline_structured || semantic?.deadline;
  const obligationStruct = semantic?.obligation_structured || semantic?.obligation;
  const decisions = semantic?.application_decisions;


  const unwrapStructuredValue = (candidate: any): any => {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && 'value' in candidate) {
      return candidate.value;
    }
    return candidate;
  };

  const renderSafeText = (...candidates: any[]): string => {
    for (const candidate of candidates) {
      const value = unwrapStructuredValue(candidate);
      if (value === null || value === undefined || value === '') continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
    }
    return '—';
  };

  const genericPenaltyValue = unwrapStructuredValue(values?.valorMulta);
  const dailyPenaltyField = values?.valorMultaDiaria || obligationStruct?.dailyPenalty;
  const dailyPenaltyValue = unwrapStructuredValue(dailyPenaltyField) ?? semantic?.obligation?.dailyPenalty ?? null;
  const explicitPenaltyCapField = values?.valorMultaLimite;
  const explicitPenaltyCap = unwrapStructuredValue(explicitPenaltyCapField);
  const penaltyCapValue = explicitPenaltyCap ?? ((genericPenaltyValue != null && Number(genericPenaltyValue) !== Number(dailyPenaltyValue)) ? genericPenaltyValue : null);

  // Helper para renderizar badge de confiança discreto por campo
  const renderConfidenceBadge = (confidence: number | undefined | null, threshold = 0.90) => {
    if (confidence === undefined || confidence === null) return null;
    const pct = Math.round(Number(confidence) * 100);
    const isHigh = pct >= Math.round(threshold * 100);

    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium ${
          isHigh ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}
        title={`Confiança: ${pct}% (Mínimo para aplicação segura: ${Math.round(threshold * 100)}%)`}
      >
        {isHigh ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertTriangle className="w-3 h-3 text-amber-500" />}
        {pct}%
      </span>
    );
  };

  // Helper para renderizar decisão de aplicação
  const renderDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'APLICADO_AUTOMATICAMENTE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> Aplicado Automaticamente
          </span>
        );
      case 'NAO_APLICADO_CONFIANCA_INSUFICIENTE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800">
            <AlertTriangle className="w-3 h-3" /> Confiança Insuficiente
          </span>
        );
      case 'AGUARDANDO_REVISAO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-sky-100 text-sky-800">
            <Clock className="w-3 h-3" /> Aguardando Revisão
          </span>
        );
      case 'IGNORADO_CAMPO_PREENCHIDO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-700">
            Campo Já Preenchido
          </span>
        );
      case 'NAO_IDENTIFICADO':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500">
            Não Identificado
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 text-violet-700 rounded-lg">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Detalhes da Interpretação Jurídica</h3>
              <p className="text-xs text-slate-500">Auditoria estruturada com evidências e confiança por campo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
          ) : email ? (
            <>
              {/* Origem técnica e Metadados do E-mail */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Origem técnica</span>
                    <span className="font-semibold text-slate-800 text-sm">{email.sender_name || email.sender_email}</span>
                    {email.sender_name && (
                      <span className="text-xs text-slate-500 ml-1">&lt;{email.sender_email}&gt;</span>
                    )}
                  </div>
                  <div className="sm:text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Data/Hora de Recepção</span>
                    <span className="text-sm font-medium text-slate-700">{formatDateTime(email.received_at)}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Assunto / Referência</span>
                  <span className="font-bold text-slate-800 text-sm">{email.subject || '(Sem Assunto)'}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      email.status === 'PROCESSADO'
                        ? 'bg-emerald-100 text-emerald-800'
                        : email.status === 'PENDENTE_IA'
                        ? 'bg-violet-100 text-violet-800'
                        : email.status === 'EXCECAO'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    Status: {email.status}
                  </span>
                  {email.classification && (
                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                      Motor Determinístico: {email.classification}
                    </span>
                  )}
                  {email.ai_model && (
                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700">
                      Modelo: {email.ai_model}
                    </span>
                  )}
                  {email.attachment_count > 0 && (
                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                      Anexos: {email.attachment_count}
                    </span>
                  )}
                </div>
              </div>

              {/* Vínculo de Processo */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-slate-500" />
                  <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Vínculo com Processo</h4>
                </div>
                <div className="p-4">
                  {email.process_id ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Número do Processo</span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {email.process?.numero_processo || email.matched_process_number}
                        </span>
                      </div>
                      <div className="sm:text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Status Atual</span>
                        <span className="text-xs font-semibold text-slate-700">
                          {email.process?.status_atual || 'Não informado'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 text-sm italic">
                      Esta mensagem ainda não foi associada a nenhum processo cadastrado.
                      {email.matched_process_number && (
                        <span className="block mt-1 font-mono not-italic text-amber-700 font-semibold text-xs">
                          Número identificado: {email.matched_process_number}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* INTERPRETAÇÃO SEMÂNTICA GEMINI COM CONFIANÇA POR CAMPO */}
              {semantic && (
                <div className="border border-violet-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="bg-gradient-to-r from-violet-50 to-slate-50 px-4 py-3 border-b border-violet-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Workflow className="w-4 h-4 text-violet-600" />
                      <h4 className="font-bold text-violet-900 text-sm">Interpretação Semântica Estruturada</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Confiança Geral:</span>
                      <span className="px-2 py-0.5 bg-violet-600 text-white font-mono font-bold text-xs rounded-md">
                        {Math.round(Number(semantic.confidence || 0) * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="p-5 space-y-5 text-sm">
                    {/* Evento e Ação Sugerida */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Evento Jurídico</span>
                        <span className="font-semibold text-slate-800">{semantic.event_type || '—'}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Ação Sugerida</span>
                        <span className="text-slate-800">{renderSafeText(semantic.action_summary, 'Nenhuma ação operacional recomendada.')}</span>
                      </div>
                    </div>

                    {/* 1. Identificação Processual */}
                    <div>
                      <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-slate-500" />
                        Identificação e Foro
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50/60 p-3.5 rounded-lg border border-slate-200/80">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">Número do Processo</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono font-semibold text-slate-800 text-xs">
                              {ident?.numeroProcesso?.value || semantic.process_number || '—'}
                            </span>
                            {renderConfidenceBadge(ident?.numeroProcesso?.confidence, 0.95)}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">Comarca / UF</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-slate-700 text-xs font-medium">
                              {ident?.comarca?.value || semantic.comarca || '—'}
                              {(ident?.uf?.value || semantic.uf) ? ` / ${ident?.uf?.value || semantic.uf}` : ''}
                            </span>
                            {renderConfidenceBadge(ident?.comarca?.confidence, 0.92)}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">Órgão Julgador / Vara</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-slate-700 text-xs font-medium">
                              {ident?.orgaoJulgador?.value || '—'}
                            </span>
                            {renderConfidenceBadge(ident?.orgaoJulgador?.confidence, 0.90)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. Classificação Processual */}
                    <div>
                      <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-slate-500" />
                        Classificação Processual
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/60 p-3.5 rounded-lg border border-slate-200/80">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">Fase Processual</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-semibold text-slate-800 text-xs">
                              {classification?.faseProcessual?.value || semantic.phase || '—'}
                            </span>
                            {renderConfidenceBadge(classification?.faseProcessual?.confidence, 0.92)}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">Tutela de Urgência</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-semibold text-slate-800 text-xs">
                              {classification?.tutelaUrgencia?.value || semantic.tutela || '—'}
                            </span>
                            {renderConfidenceBadge(classification?.tutelaUrgencia?.confidence, 0.92)}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">Natureza</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-slate-700 text-xs font-medium">
                              {classification?.natureza?.value || semantic.nature || '—'}
                            </span>
                            {renderConfidenceBadge(classification?.natureza?.confidence, 0.92)}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">Prioridade</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-slate-700 text-xs font-medium">
                              {classification?.prioridade?.value || semantic.priority || '—'}
                            </span>
                            {renderConfidenceBadge(classification?.prioridade?.confidence, 0.90)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 3. Valores Financeiros */}
                    {(values?.valorCausa?.value !== null || values?.valorMulta?.value !== null || values?.valorMultaDiaria?.value !== null || values?.valorMultaLimite?.value !== null || values?.valorCondenacao?.value !== null || (semantic.money_findings && semantic.money_findings.length > 0)) && (
                      <div>
                        <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                          Valores Financeiros Identificados
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50/60 p-3.5 rounded-lg border border-slate-200/80">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Valor da Causa</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-semibold text-slate-800 text-xs">
                                {values?.valorCausa?.value != null ? `R$ ${Number(values.valorCausa.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                              </span>
                              {renderConfidenceBadge(values?.valorCausa?.confidence, 0.90)}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Multa Diária</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-semibold text-slate-800 text-xs">{dailyPenaltyValue != null ? `R$ ${Number(dailyPenaltyValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</span>
                              {renderConfidenceBadge((dailyPenaltyField as any)?.confidence, 0.90)}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Limite / Teto</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-semibold text-slate-800 text-xs">{penaltyCapValue != null ? `R$ ${Number(penaltyCapValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</span>
                              {renderConfidenceBadge((explicitPenaltyCapField as any)?.confidence ?? values?.valorMulta?.confidence, 0.90)}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Condenação</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-semibold text-slate-800 text-xs">
                                {values?.valorCondenacao?.value != null ? `R$ ${Number(values.valorCondenacao.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                              </span>
                              {renderConfidenceBadge(values?.valorCondenacao?.confidence, 0.90)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 4. Prazo e Obrigação */}
                    {(deadlineStruct?.exists || obligationStruct?.exists) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {deadlineStruct?.exists && (
                          <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-3.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-bold text-amber-900 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-amber-700" /> Prazo Processual
                              </span>
                              {renderConfidenceBadge(deadlineStruct.confidence, 0.90)}
                            </div>
                            <p className="text-xs font-semibold text-amber-950">
                              {renderSafeText(deadlineStruct.dueDate, deadlineStruct.sourceText, deadlineStruct.termText, 'Prazo identificado')}
                            </p>
                            {deadlineStruct.triggerEvent?.value && (
                              <p className="text-[11px] text-amber-800">Termo inicial: {deadlineStruct.triggerEvent.value}</p>
                            )}
                          </div>
                        )}

                        {obligationStruct?.exists && (
                          <div className="bg-red-50/80 border border-red-200 rounded-lg p-3.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-bold text-red-900 flex items-center gap-1">
                                <ShieldAlert className="w-3.5 h-3.5 text-red-700" /> Obrigação de Fazer / Não Fazer
                              </span>
                              {renderConfidenceBadge(obligationStruct.confidence, 0.95)}
                            </div>
                            <p className="text-xs font-semibold text-red-950">
                              {renderSafeText(obligationStruct.description, 'Obrigação jurídica identificada')}
                            </p>
                            {obligationStruct.criticality?.value && (
                              <p className="text-[11px] text-red-800 font-medium">
                                Criticidade: {renderSafeText(obligationStruct.criticality)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 5. Decisões Operacionais de Aplicação */}
                    {decisions && Object.keys(decisions).length > 0 && (
                      <div>
                        <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-2">
                          Decisões de Aplicação Operacional
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {Object.entries(decisions).map(([key, info]: [string, any]) => (
                            <div
                              key={key}
                              className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-2"
                            >
                              <div className="truncate">
                                <span className="font-semibold text-slate-800 text-xs block truncate">
                                  {info.fieldLabel || key}
                                </span>
                                <span className="text-[10px] text-slate-500 truncate block">
                                  {info.reason || 'Avaliado pelo motor de aplicação'}
                                </span>
                              </div>
                              <div className="shrink-0">{renderDecisionBadge(info.decision)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Evidências Estruturadas */}
              {evidence.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Evidências Estruturadas</h4>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {evidence.map((ev) => (
                      <div key={ev.id} className="p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="font-semibold text-slate-800 text-sm">{ev.field_name}</span>
                          <div className="flex items-center gap-2">
                            {ev.confidence !== null && renderConfidenceBadge(ev.confidence)}
                            <span className="text-[10px] font-medium text-slate-400">Via {ev.extraction_method}</span>
                          </div>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded text-xs font-mono text-slate-700 break-words border border-slate-100">
                          {typeof ev.extracted_value === 'string'
                            ? ev.extracted_value
                            : JSON.stringify(ev.extracted_value)}
                        </div>
                        {ev.evidence_excerpt && (
                          <div className="text-xs text-slate-600 italic border-l-2 border-violet-300 pl-2.5 py-0.5 bg-violet-50/40 rounded-r">
                            "{ev.evidence_excerpt}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
