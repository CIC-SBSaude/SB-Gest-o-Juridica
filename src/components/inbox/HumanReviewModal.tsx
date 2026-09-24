import React, { useState, useEffect } from 'react';
import {
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  BrainCircuit,
  Search,
  Scale,
  Building,
  Calendar,
  DollarSign,
  FileText,
  Clock,
  ArrowRight,
  ShieldCheck,
  Ban,
  UserCheck,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { ProcessedEmail, EmailException, ProcessEvidence, Process } from '../../types/database';
import { inboxService, HumanReviewFieldUpdate } from '../../services/inboxService';
import { processesService } from '../../services/processesService';
import { formatDateTime } from '../../utils/date';
import { formatProcessNumber, canonicalCnj, isValidCnj } from '../../utils/cnj';
import { useAuth } from '../../hooks/useAuth';

interface HumanReviewModalProps {
  isOpen: boolean;
  emailId?: string | null;
  exceptionId?: string | null;
  onClose: (changed?: boolean) => void;
}

export const HumanReviewModal: React.FC<HumanReviewModalProps> = ({
  isOpen,
  emailId,
  exceptionId,
  onClose,
}) => {
  const { profile } = useAuth();
  const userId = profile?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState<ProcessedEmail | null>(null);
  const [exception, setException] = useState<EmailException | null>(null);
  const [evidence, setEvidence] = useState<ProcessEvidence[]>([]);

  // Estados editáveis para campos do processo e vínculo
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);
  const [searchProcessQuery, setSearchProcessQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Partial<Process>[]>([]);
  const [isSearchingProcess, setIsSearchingProcess] = useState(false);

  // Campos estruturados editáveis para aplicação
  const [formCnj, setFormCnj] = useState('');
  const [formTipoDemanda, setFormTipoDemanda] = useState('');
  const [formComarca, setFormComarca] = useState('');
  const [formUf, setFormUf] = useState('');
  const [formFase, setFormFase] = useState('');
  const [formTutela, setFormTutela] = useState('');
  const [formPrioridade, setFormPrioridade] = useState('');
  const [formValorCausa, setFormValorCausa] = useState<string>('');

  // Decisão e nota humana
  const [resolutionNote, setResolutionNote] = useState('');
  const [actionDecision, setActionDecision] = useState<'APLICAR_PROCESSO' | 'DESCONSIDERAR' | 'MANTER_EXCECAO'>('APLICAR_PROCESSO');

  // Carregar dados
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      let targetEmailId = emailId;
      let targetException: EmailException | null = null;

      // Se passou exceptionId, busca a exceção primeiro
      if (exceptionId) {
        const { data: excList } = await inboxService.getExceptions();
        const found = excList.find((e) => e.id === exceptionId);
        if (found) {
          targetException = found;
          if (!targetEmailId && found.processed_email_id) {
            targetEmailId = found.processed_email_id;
          }
        }
      }

      if (targetEmailId) {
        const [emailRes, evidenceRes, excByEmailRes] = await Promise.all([
          inboxService.getEmailDetails(targetEmailId),
          inboxService.getEmailEvidence(targetEmailId),
          targetException ? Promise.resolve({ data: targetException, error: null }) : inboxService.getExceptionByEmailId(targetEmailId),
        ]);

        let loadedProcess: Process | null = null;

        if (emailRes.error) {
          setError(emailRes.error);
        } else {
          setEmail(emailRes.data);
          // Se tiver process_id vinculado, carrega o processo completo
          if (emailRes.data?.process_id) {
            const { data: procFull } = await processesService.getProcessById(emailRes.data.process_id);
            if (procFull) {
              loadedProcess = procFull;
              setSelectedProcess(procFull);
            }
          }
        }

        if (evidenceRes.data) setEvidence(evidenceRes.data);
        if (excByEmailRes.data) setException(excByEmailRes.data);

        // Preenche formulário a partir dos dados do processo atual ou dos dados interpretados pela IA
        const proc = loadedProcess;
        const sem = emailRes.data?.metadata?.semantic_interpretation;
        const ident = sem?.identification;
        const clas = sem?.classification;
        const vals = sem?.values;

        setFormCnj(proc?.numero_processo || ident?.process_number?.value || emailRes.data?.matched_process_number || '');
        setFormTipoDemanda(proc?.tipo_demanda || clas?.demand_type?.value || '');
        setFormComarca(proc?.comarca || ident?.court_district?.value || '');
        setFormUf(proc?.uf || ident?.state_uf?.value || '');
        setFormFase(proc?.fase_processual || clas?.process_phase?.value || '');
        setFormTutela(proc?.tutela_atual || clas?.urgent_relief?.value || '');
        setFormPrioridade(proc?.prioridade || clas?.priority?.value || '');
        setFormValorCausa(proc?.valor_causa != null ? String(proc.valor_causa) : (vals?.lawsuit_value?.value != null ? String(vals.lawsuit_value.value) : ''));

        // Sugestão de nota inicial
        if (targetException?.reason) {
          setResolutionNote(`Revisado manualmente. Motivo da exceção tratado: ${targetException.reason}`);
        } else {
          setResolutionNote('Revisão humana concluída com validação dos dados identificados.');
        }
      } else {
        setError('E-mail de referência não encontrado para revisão.');
      }

      setLoading(false);
    };

    loadData();
  }, [isOpen, emailId, exceptionId]);

  if (!isOpen) return null;

  const excReason = exception?.reason || email?.metadata?.process_application?.exception_reason || 'Revisão humana necessária.';
  const excType = exception?.exception_type || email?.metadata?.process_application?.exception_type || 'EXCECAO';

  const handleSearchProcesses = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchProcessQuery.trim().length < 2) return;

    setIsSearchingProcess(true);
    const { data } = await inboxService.searchProcessesForLink(searchProcessQuery.trim());
    setSearchResults(data || []);
    setIsSearchingProcess(false);
  };

  const handleSelectProcess = async (proc: Partial<Process>) => {
    if (!proc.id) return;
    const { data: procFull } = await processesService.getProcessById(proc.id);
    if (procFull) {
      setSelectedProcess(procFull);
      setFormCnj(procFull.numero_processo || '');
      if (procFull.tipo_demanda) setFormTipoDemanda(procFull.tipo_demanda);
      if (procFull.comarca) setFormComarca(procFull.comarca);
      if (procFull.uf) setFormUf(procFull.uf);
      if (procFull.fase_processual) setFormFase(procFull.fase_processual);
      if (procFull.tutela_atual) setFormTutela(procFull.tutela_atual);
      if (procFull.prioridade) setFormPrioridade(procFull.prioridade);
      if (procFull.valor_causa != null) setFormValorCausa(String(procFull.valor_causa));
    }
    setSearchResults([]);
    setSearchProcessQuery('');
  };

  const handleUnlinkProcess = () => {
    setSelectedProcess(null);
  };

  const handleSubmitResolution = async () => {
    if (!email) return;
    if (!userId) {
      setError('Usuário não autenticado.');
      return;
    }
    if (!resolutionNote.trim()) {
      setError('Por favor, informe a justificativa/nota da decisão humana.');
      return;
    }

    setSaving(true);
    setError(null);

    // Identificar alterações no processo vinculado
    const targetProcessId = selectedProcess?.id || email.process_id || null;
    const processFieldUpdates: Record<string, unknown> = {};
    const fieldHistoryChanges: HumanReviewFieldUpdate[] = [];

    if (targetProcessId && selectedProcess) {
      const orig = selectedProcess;
      const cleanCnj = formCnj ? canonicalCnj(formCnj) : null;

      if (cleanCnj !== orig.numero_processo && cleanCnj !== undefined) {
        processFieldUpdates.numero_processo = cleanCnj;
        fieldHistoryChanges.push({ field: 'numero_processo', previousValue: orig.numero_processo, newValue: cleanCnj });
      }
      if (formTipoDemanda && formTipoDemanda !== orig.tipo_demanda) {
        processFieldUpdates.tipo_demanda = formTipoDemanda;
        fieldHistoryChanges.push({ field: 'tipo_demanda', previousValue: orig.tipo_demanda, newValue: formTipoDemanda });
      }
      if (formComarca && formComarca !== orig.comarca) {
        processFieldUpdates.comarca = formComarca;
        fieldHistoryChanges.push({ field: 'comarca', previousValue: orig.comarca, newValue: formComarca });
      }
      if (formUf && formUf !== orig.uf) {
        processFieldUpdates.uf = formUf.toUpperCase();
        fieldHistoryChanges.push({ field: 'uf', previousValue: orig.uf, newValue: formUf.toUpperCase() });
      }
      if (formFase && formFase !== orig.fase_processual) {
        processFieldUpdates.fase_processual = formFase;
        fieldHistoryChanges.push({ field: 'fase_processual', previousValue: orig.fase_processual, newValue: formFase });
      }
      if (formTutela && formTutela !== orig.tutela_atual) {
        processFieldUpdates.tutela_atual = formTutela;
        fieldHistoryChanges.push({ field: 'tutela_atual', previousValue: orig.tutela_atual, newValue: formTutela });
      }
      if (formPrioridade && formPrioridade !== orig.prioridade) {
        processFieldUpdates.prioridade = formPrioridade;
        fieldHistoryChanges.push({ field: 'prioridade', previousValue: orig.prioridade, newValue: formPrioridade });
      }
      const parsedValor = formValorCausa ? parseFloat(formValorCausa.replace(/[^\d.,]/g, '').replace(',', '.')) : null;
      if (parsedValor != null && !isNaN(parsedValor) && parsedValor !== orig.valor_causa) {
        processFieldUpdates.valor_causa = parsedValor;
        fieldHistoryChanges.push({ field: 'valor_causa', previousValue: orig.valor_causa, newValue: parsedValor });
      }
    }

    let nextEmailStatus: 'PROCESSADO' | 'IRRELEVANTE' | 'EXCECAO' = 'PROCESSADO';
    if (actionDecision === 'DESCONSIDERAR') {
      nextEmailStatus = 'IRRELEVANTE';
    } else if (actionDecision === 'MANTER_EXCECAO') {
      nextEmailStatus = 'EXCECAO';
    }

    const { success, error: saveErr } = await inboxService.completeHumanReview({
      exceptionId: exception?.id || exceptionId,
      processedEmailId: email.id,
      userId,
      resolutionNote: resolutionNote.trim(),
      nextEmailStatus,
      processIdToLink: targetProcessId,
      processFieldUpdates,
      fieldHistoryChanges,
    });

    if (!success) {
      setError(saveErr || 'Erro ao salvar revisão.');
      setSaving(false);
    } else {
      onClose(true);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-base">Revisão e Decisão Humana</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                  {excType}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Resolução com rastreabilidade auditável na Gestão de Processos
              </p>
            </div>
          </div>
          <button
            onClick={() => onClose(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-600 mx-auto mb-3" />
            <p className="text-xs text-slate-500">Carregando dados da exceção e evidências...</p>
          </div>
        ) : (
          <div className="p-6 overflow-y-auto space-y-6 text-xs">
            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="font-bold">✕</button>
              </div>
            )}

            {/* A. Motivo da Exceção */}
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-900 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Motivo da Exceção / Alerta de Triagem</span>
              </div>
              <p className="text-slate-800 text-xs leading-relaxed font-medium">
                {excReason}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-amber-800/80 pt-1 border-t border-amber-200/60">
                <span>Tipo: <b>{excType}</b></span>
                {exception?.created_at && <span>Registrado em: <b>{formatDateTime(exception.created_at)}</b></span>}
                {exception?.status && <span>Status atual: <b>{exception.status}</b></span>}
              </div>
            </div>

            {/* B. Dados do E-mail e Evidências */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                  E-mail de Origem
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {formatDateTime(email?.received_at)}
                </span>
              </div>
              <div className="font-semibold text-slate-900 text-sm">
                {email?.subject || '(Sem assunto)'}
              </div>
              <div className="text-slate-600 text-[11px]">
                Remetente: <span className="font-mono text-slate-800">{email?.sender_email}</span> {email?.sender_name && `(${email.sender_name})`}
              </div>

              {/* Exibição resumida das evidências extraídas */}
              {evidence.length > 0 && (
                <div className="pt-2 mt-2 border-t border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Evidências Textuais Extraídas ({evidence.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {evidence.map((ev) => (
                      <span
                        key={ev.id}
                        className="px-2 py-1 bg-white border border-slate-200 rounded text-[11px] text-slate-700"
                        title={ev.evidence_excerpt || ''}
                      >
                        <b>{ev.field_name}:</b> {String(ev.extracted_value)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* C. Processo Vinculado & Ação de Vinculação */}
            <div className="p-4 bg-white rounded-xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-slate-700 text-[11px] flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-slate-500" />
                  Processo na Gestão de Processos
                </span>
                {selectedProcess && (
                  <button
                    type="button"
                    onClick={handleUnlinkProcess}
                    className="text-[11px] text-red-600 hover:underline cursor-pointer"
                  >
                    Desvincular / Trocar
                  </button>
                )}
              </div>

              {selectedProcess ? (
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-mono font-bold text-slate-900 text-xs">
                      {formatProcessNumber(selectedProcess.numero_processo) || 'Processo sem número'}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      {selectedProcess.comarca && <span>{selectedProcess.comarca} • </span>}
                      {selectedProcess.tipo_demanda && <span>{selectedProcess.tipo_demanda} • </span>}
                      <span className="font-semibold text-emerald-800">Status: {selectedProcess.status_atual || 'ATIVO'}</span>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px] uppercase">
                    Vinculado
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    Nenhum processo vinculado. Busque um processo existente para vincular esta comunicação ou informe os dados para cadastro.
                  </div>
                  <form onSubmit={handleSearchProcesses} className="flex gap-2">
                    <input
                      type="text"
                      value={searchProcessQuery}
                      onChange={(e) => setSearchProcessQuery(e.target.value)}
                      placeholder="Buscar por CNJ, protocolo ou tipo de demanda..."
                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                    <button
                      type="submit"
                      disabled={isSearchingProcess || searchProcessQuery.trim().length < 2}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      {isSearchingProcess ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Buscar'}
                    </button>
                  </form>

                  {searchResults.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 p-2 rounded-lg bg-slate-50">
                      {searchResults.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleSelectProcess(p)}
                          className="p-2 bg-white rounded border border-slate-200 hover:border-slate-400 cursor-pointer flex items-center justify-between"
                        >
                          <div>
                            <span className="font-mono font-bold text-slate-800">{formatProcessNumber(p.numero_processo)}</span>
                            <span className="text-slate-500 ml-2">({p.tipo_demanda || 'Demanda'})</span>
                          </div>
                          <button type="button" className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-semibold text-[10px]">
                            Selecionar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* D. Campos Estruturados para Revisão e Aplicação */}
            <div className="p-4 bg-white rounded-xl border border-slate-200/80 space-y-3">
              <span className="font-bold uppercase tracking-wider text-slate-700 text-[11px] block">
                Campos do Processo (Confirmar ou Corrigir Antes da Aplicação)
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* CNJ */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Número do Processo (CNJ)
                  </label>
                  <input
                    type="text"
                    value={formCnj}
                    onChange={(e) => setFormCnj(e.target.value)}
                    placeholder="0000000-00.0000.0.00.0000"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                  {formCnj && !isValidCnj(formCnj) && (
                    <span className="text-[10px] text-amber-600 mt-0.5 block">
                      ⚠ Atenção: Dígito verificador CNJ inválido.
                    </span>
                  )}
                </div>

                {/* Tipo de Demanda */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Tipo de Demanda
                  </label>
                  <input
                    type="text"
                    value={formTipoDemanda}
                    onChange={(e) => setFormTipoDemanda(e.target.value)}
                    placeholder="Ex: Cível, Trabalhista, Cobrança..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                {/* Comarca */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Comarca
                  </label>
                  <input
                    type="text"
                    value={formComarca}
                    onChange={(e) => setFormComarca(e.target.value)}
                    placeholder="Ex: Salvador, São Paulo..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                {/* UF */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    UF
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={formUf}
                    onChange={(e) => setFormUf(e.target.value.toUpperCase())}
                    placeholder="BA, SP, RJ..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>

                {/* Fase Processual */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Fase Processual
                  </label>
                  <input
                    type="text"
                    value={formFase}
                    onChange={(e) => setFormFase(e.target.value)}
                    placeholder="Ex: Conhecimento, Execução, Recurso..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                {/* Valor da Causa */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Valor da Causa (R$)
                  </label>
                  <input
                    type="text"
                    value={formValorCausa}
                    onChange={(e) => setFormValorCausa(e.target.value)}
                    placeholder="Ex: 50000.00"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* E. Decisão Humana e Resolução */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-4">
              <span className="font-bold uppercase tracking-wider text-slate-700 text-[11px] block">
                Decisão da Revisão Humana
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setActionDecision('APLICAR_PROCESSO')}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition ${
                    actionDecision === 'APLICAR_PROCESSO'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Aplicar e Concluir</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Aplica os dados corrigidos/confirmados ao processo e finaliza a exceção.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActionDecision('DESCONSIDERAR')}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition ${
                    actionDecision === 'DESCONSIDERAR'
                      ? 'bg-slate-100 border-slate-400 text-slate-900 ring-2 ring-slate-500/20'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <Ban className="w-4 h-4 text-slate-600" />
                    <span>Desconsiderar / Irrelevante</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Marca como irrelevante sem aplicar alterações processuais e encerra a exceção.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActionDecision('MANTER_EXCECAO')}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition ${
                    actionDecision === 'MANTER_EXCECAO'
                      ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-500/20'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>Manter Pendente</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Salva anotações parciais, mas mantém o item na fila de exceções.
                  </p>
                </button>
              </div>

              {/* Justificativa / Nota de Resolução */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Justificativa / Nota da Decisão Humana (Obrigatório)
                </label>
                <textarea
                  rows={3}
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Ex: CNJ confirmado manualmente e vínculo mantido; dados atualizados no processo."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Esta nota será registrada na auditoria de resolução da exceção e no histórico do processo.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Rodapé de Ações */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => onClose(false)}
            disabled={saving}
            className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSubmitResolution}
            disabled={saving || loading}
            className="flex items-center gap-1.5 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>{saving ? 'Gravando Decisão...' : 'Concluir Revisão e Salvar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
