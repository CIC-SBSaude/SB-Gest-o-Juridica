import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Shield,
  Loader2,
  Link2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Company } from '../../types/database';
import { companiesService, type CompanyResolutionCandidate } from '../../services/companiesService';
import { maskCNPJ } from '../../utils/cnpj';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ErrorMessage } from '../../components/common/ErrorMessage';
import { CompanyModal } from '../../components/companies/CompanyModal';
import { CompanyDeleteModal } from '../../components/companies/CompanyDeleteModal';
import { ActionDialog } from '../../components/common/ActionDialog';

export const CompaniesPage: React.FC = () => {
  const { profile } = useAuth();

  // Permissões RBAC: ADMIN e GESTOR podem alterar dados. CONSULTA apenas visualiza.
  const userRole = profile?.role;
  const canManageCompanies = userRole === 'ADMIN' || userRole === 'GESTOR';

  // Estados de dados e interface
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Filtros de busca
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Controle de Modais
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view' | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [reprocessPreview, setReprocessPreview] = useState<Array<{ id: string; numero_processo: string }> | null>(null);
  const [remainingEligible, setRemainingEligible] = useState<number | null>(null);
  const [noEligibleRemaining, setNoEligibleRemaining] = useState(false);
  const [reprocessDialogOpen, setReprocessDialogOpen] = useState(false);
  const [isReprocessingLinks, setIsReprocessingLinks] = useState(false);
  const [reprocessError, setReprocessError] = useState<string | null>(null);
  const [resolutionCandidates, setResolutionCandidates] = useState<CompanyResolutionCandidate[]>([]);
  const [resolutionCandidatesTotal, setResolutionCandidatesTotal] = useState(0);
  const [candidateDrafts, setCandidateDrafts] = useState<Record<string, { name: string; cnpj: string; companyId: string }>>({});
  const [candidateBusyId, setCandidateBusyId] = useState<string | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [exportingDiagnostic, setExportingDiagnostic] = useState(false);
  const exportDiagnostic = async () => {
    setExportingDiagnostic(true);
    try {
      const report = await companiesService.getOperationalDiagnostic();
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'SB-diagnostico-operacional.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      setCandidateError(err?.message || 'Falha ao exportar diagnóstico.');
    } finally {
      setExportingDiagnostic(false);
    }
  };

  // Carregamento de empresas
  const fetchCompanies = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await companiesService.getCompanies(searchQuery, statusFilter);

    if (result.error) {
      setError(result.error);
      setCompanies([]);
    } else {
      setCompanies(result.data);
    }
    setIsLoading(false);
  }, [searchQuery, statusFilter]);

  const fetchResolutionCandidates = useCallback(async () => {
    const result = await companiesService.getResolutionCandidates('PENDENTE', 200);
    if (result.error) {
      setCandidateError(result.error);
      return;
    }
    setResolutionCandidates(result.data);
    setResolutionCandidatesTotal(result.total);
    // A resposta atual substitui rascunhos antigos, inclusive sugestões removidas.
    setCandidateDrafts(Object.fromEntries(result.data.map(item => [item.id, {
      name: item.suggested_name || '', cnpj: item.suggested_cnpj || '', companyId: ''
    }])));
  }, []);

  // Carrega ao montar e quando filtros mudam
  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    void fetchResolutionCandidates();
  }, [fetchResolutionCandidates]);

  // Timer para sumir notificação de sucesso
  useEffect(() => {
    if (successNotice) {
      const timer = setTimeout(() => setSuccessNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successNotice]);

  // Salvar criação ou edição
  const handleSaveCompany = async (formData: {
    nome: string;
    cnpj: string;
    active: boolean;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!canManageCompanies) {
      return { success: false, error: 'Seu perfil não possui permissão para cadastrar ou editar empresas.' };
    }

    if (modalMode === 'create') {
      const result = await companiesService.createCompany({
        nome: formData.nome,
        cnpj: formData.cnpj || null,
        active: formData.active,
      });

      if (result.error) {
        return { success: false, error: result.error };
      }

      setSuccessNotice(`Empresa "${result.data?.nome}" cadastrada com sucesso.`);
      setModalMode(null);
      fetchCompanies();
      return { success: true };
    }

    if (modalMode === 'edit' && selectedCompany) {
      const result = await companiesService.updateCompany(selectedCompany.id, {
        nome: formData.nome,
        cnpj: formData.cnpj || null,
        active: formData.active,
      });

      if (result.error) {
        return { success: false, error: result.error };
      }

      setSuccessNotice(`Empresa "${result.data?.nome}" atualizada com sucesso.`);
      setModalMode(null);
      fetchCompanies();
      return { success: true };
    }

    return { success: false, error: 'Operação inválida.' };
  };

  // Alternar ativação / inativação
  const handleToggleActive = async (company: Company) => {
    if (!canManageCompanies) {
      setError('Permissão insuficiente: apenas administradores e gestores podem alterar o status de empresas.');
      return;
    }

    const actionText = company.active ? 'inativada' : 'ativada';
    const result = await companiesService.toggleActive(company.id, company.active);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccessNotice(`Empresa "${company.nome}" foi ${actionText} com sucesso.`);
      fetchCompanies();
    }
  };

  const handleReprocessCompanyLinks = async () => {
    if (!canManageCompanies) {
      setReprocessError('Apenas ADMIN ou GESTOR pode reprocessar vínculos pendentes.');
      return;
    }

    setIsReprocessingLinks(true);
    setReprocessError(null);

    const executing = reprocessPreview !== null && reprocessPreview.length > 0;
    const result = await companiesService.reprocessOrphanCompanyLinks(
      executing ? reprocessPreview.map(p => p.id) : undefined,
      executing
    );

    setIsReprocessingLinks(false);

    if (result.error || !result.data) {
      setReprocessError(result.error || 'Falha ao reprocessar vínculos.');
      return;
    }

    if (!executing) {
      if (!result.data.processes || result.data.processes.length === 0) {
        setNoEligibleRemaining(true);
        setReprocessPreview([]);
        setRemainingEligible(0);
        return;
      }
      setReprocessPreview(result.data.processes);
      setRemainingEligible(typeof result.data.remainingEligible === 'number' ? result.data.remainingEligible : null);
      setNoEligibleRemaining(false);
      return;
    }
    setReprocessPreview(null);
    setRemainingEligible(null);
    setNoEligibleRemaining(false);
    setReprocessDialogOpen(false);
    setSuccessNotice(
      `Reprocessamento concluído: ${result.data.linked} vínculo(s) resolvido(s)` +
      `${result.data.autoCreated ? `, ${result.data.autoCreated} empresa(s) autocadastrada(s)` : ''}, ` +
      `${result.data.pendingConfirmation || 0} aguardando confirmação, ${result.data.ambiguous} conflito(s) entre empresas cadastradas, ` +
      `em ${result.data.scanned} processo(s) analisado(s).`
    );
    await Promise.all([fetchCompanies(), fetchResolutionCandidates()]);
  };

  const handleConfirmCandidate = async (candidate: CompanyResolutionCandidate) => {
    if (!canManageCompanies) return;
    const draft = candidateDrafts[candidate.id] || { name: candidate.suggested_name || '', cnpj: candidate.suggested_cnpj || '', companyId: '' };
    if (!draft.companyId && !draft.name.trim()) {
      setCandidateError('Informe uma empresa existente ou confirme o nome/razão social sugerido.');
      return;
    }
    setCandidateBusyId(candidate.id);
    setCandidateError(null);
    const result = await companiesService.confirmResolutionCandidate(candidate.id, {
      companyId: draft.companyId || null,
      name: draft.companyId ? null : draft.name,
      cnpj: draft.companyId ? null : draft.cnpj || null,
    });
    setCandidateBusyId(null);
    if (!result.success) {
      setCandidateError(result.error || 'Falha ao confirmar empresa.');
      return;
    }
    setSuccessNotice('Empresa confirmada e vinculada ao processo com sucesso.');
    await Promise.all([fetchResolutionCandidates(), fetchCompanies()]);
  };

  const handleRejectCandidate = async (candidate: CompanyResolutionCandidate) => {
    if (!canManageCompanies) return;
    setCandidateBusyId(candidate.id);
    setCandidateError(null);
    const result = await companiesService.rejectResolutionCandidate(candidate.id);
    setCandidateBusyId(null);
    if (!result.success) {
      setCandidateError(result.error || 'Falha ao rejeitar candidato.');
      return;
    }
    setSuccessNotice('Candidato de empresa descartado. O processo permanece sem vínculo automático.');
    await fetchResolutionCandidates();
  };

  // Confirmar exclusão
  const handleConfirmDelete = async (): Promise<{ success: boolean; error?: string }> => {
    if (!companyToDelete) return { success: false, error: 'Nenhuma empresa selecionada.' };
    if (!canManageCompanies) {
      return { success: false, error: 'Seu perfil não possui permissão para excluir empresas.' };
    }

    const result = await companiesService.deleteCompany(companyToDelete.id);

    if (!result.success) {
      return { success: false, error: result.error || 'Falha ao excluir empresa.' };
    }

    setSuccessNotice(`Empresa "${companyToDelete.nome}" foi excluída com sucesso.`);
    setCompanyToDelete(null);
    fetchCompanies();
    return { success: true };
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-red-600">
              Cadastros Corporativos
            </span>
            {!canManageCompanies && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-600">
                <Shield className="w-3 h-3 text-slate-400" />
                Somente Leitura (CONSULTA)
              </span>
            )}
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#0F172A]">
            Empresas do Grupo SB Saúde
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Pessoas jurídicas habilitadas para distribuição e acompanhamento de processos judiciais.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {canManageCompanies && <button type="button" onClick={exportDiagnostic} disabled={exportingDiagnostic}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-50">
            {exportingDiagnostic ? 'Preparando…' : 'Exportar diagnóstico'}
          </button>}
          <button
            id="refresh-companies-btn"
            type="button"
            onClick={fetchCompanies}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-red-600' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          {canManageCompanies && (
            <button
              id="reprocess-company-links-btn"
              type="button"
              onClick={() => {
                setReprocessError(null);
                setReprocessPreview(null);
                setRemainingEligible(null);
                setNoEligibleRemaining(false);
                setReprocessDialogOpen(true);
              }}
              disabled={isReprocessingLinks}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
              title="Reprocessar somente processos ainda sem empresa vinculada"
            >
              {isReprocessingLinks ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
              <span className="hidden md:inline">Reprocessar vínculos pendentes</span>
            </button>
          )}

          {canManageCompanies && (
            <button
              id="new-company-btn"
              type="button"
              onClick={() => {
                setSelectedCompany(null);
                setModalMode('create');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Empresa</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner de Erro Centralizado */}
      {error && (
        <ErrorMessage
          title="Falha na Operação de Empresas"
          message={error}
          onDismiss={() => setError(null)}
          onRetry={fetchCompanies}
        />
      )}

      {/* Banner de Sucesso */}
      {successNotice && (
        <div
          id="company-success-banner"
          className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between shadow-2xs animate-in fade-in"
        >
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {candidateError && (
        <ErrorMessage
          title="Confirmação de Empresa"
          message={candidateError}
          onDismiss={() => setCandidateError(null)}
          onRetry={fetchResolutionCandidates}
        />
      )}

      {resolutionCandidates.length > 0 && (
        <section className="bg-amber-50/70 border border-amber-200 rounded-xl overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-amber-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Empresas aguardando confirmação</h3>
                <p className="text-xs text-slate-600">A automação não encontrou evidência suficiente para cadastrar ou vincular sem revisão humana.</p>
                {resolutionCandidatesTotal > resolutionCandidates.length && (
                  <p className="text-[11px] text-slate-500 mt-0.5">Exibindo {resolutionCandidates.length} de {resolutionCandidatesTotal} pendências.</p>
                )}
              </div>
            </div>
            <span className="shrink-0 inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-amber-600 text-white text-xs font-bold">
              {resolutionCandidatesTotal}
            </span>
          </div>

          <div className="divide-y divide-amber-200/70">
            {resolutionCandidates.map((candidate) => {
              const draft = candidateDrafts[candidate.id] || { name: candidate.suggested_name || '', cnpj: candidate.suggested_cnpj || '', companyId: '' };
              const processNumber = candidate.processes?.numero_processo || 'Processo sem CNJ';
              const associations = (candidate.evidence || []).flatMap(e => e.contextualAssociations || []);
              const strongPairs = associations.filter(item => item.classification === 'STRONG_PAIR');
              const providerMentions = associations.filter(item => item.classification === 'PROVIDER_DIRECTORY');
              const unpairedCnpjs = associations.length
                ? [...new Set(associations.filter(item => item.classification === 'UNPAIRED').map(item => item.cnpj))]
                : (candidate.candidate_cnpjs || []);
              return (
                <div key={candidate.id} className="p-4 bg-white/70">
                  <details className="mb-3 rounded-lg border border-amber-200 p-3 text-xs text-slate-700">
                    <summary className="cursor-pointer font-semibold">Alternativas e evidências para revisão</summary>
                    <p className="mt-2">Os nomes e CNPJs abaixo foram encontrados no processo. A associação entre eles não está comprovada. Confira a documentação antes de preencher e confirmar.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div><strong>Nomes encontrados</strong>
                        <ul className="list-disc pl-4">{(candidate.candidate_names || []).map((name, i) => <li key={i}>{name}</li>)}</ul>
                        {!candidate.candidate_names?.length && <p>Nenhuma razão social qualificada.</p>}
                      </div>
                      <div><strong>CNPJs encontrados — sem pareamento</strong>
                        <ul className="list-disc pl-4">{unpairedCnpjs.map((cnpj) => <li key={cnpj}>{maskCNPJ(cnpj)}</li>)}</ul>
                        {!unpairedCnpjs.length && <p>Nenhum CNPJ sem pareamento.</p>}
                      </div>
                    </div>
                    {strongPairs.length > 0 && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <strong>Pares de identidade encontrados — revisar o papel no processo</strong>
                        <ul className="mt-1 list-disc pl-4">
                          {strongPairs.map((item, i) => <li key={i}>{item.name} — {maskCNPJ(item.cnpj)}<p>{item.roleEvidence || 'Papel processual ainda não avaliado.'}</p></li>)}
                        </ul>
                        <p className="mt-1 text-[11px]">Identificar nome e CNPJ não determina qual empresa deve ser vinculada ao processo.</p>
                      </div>
                    )}
                    {providerMentions.length > 0 && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <strong>Menções separadas como rede credenciada ou prestador</strong>
                        <ul className="mt-1 list-disc pl-4">
                          {[...new Set(providerMentions.map(item => item.cnpj).filter((c): c is string => Boolean(c)))].map((cnpj: string) => <li key={cnpj}>{maskCNPJ(cnpj)}</li>)}
                        </ul>
                        <p className="mt-1 text-[11px]">Esses CNPJs não participam da sugestão de vínculo deste processo.</p>
                      </div>
                    )}
                    {(candidate.evidence || []).flatMap(e => e.roleAssessments || []).map((role, i) => (
                      <div key={`role-${i}`} className="mt-2 border-t border-amber-200 pt-2">
                        <strong>{role.name}: {role.processRole === 'PARTE_INDICADA' ? 'Parte indicada — conferir documentação' : role.processRole === 'FAVORECIDO_FINANCEIRO' ? 'Favorecido financeiro' : 'Papel não determinado'}</strong>
                        <p>{role.roleEvidence}</p>
                      </div>
                    ))}
                    {(candidate.evidence || []).flatMap(e => e.sourceEvidence || []).map((e, i) => (
                      <div key={i} className="mt-2 border-t border-amber-200 pt-2 whitespace-pre-wrap break-words">
                        <strong>{e.field || 'Evidência'}: </strong>{typeof e.value === 'string' ? e.value : JSON.stringify(e.value)}
                        <p>{e.excerpt || (e.source === 'process_parties' ? 'Origem: cadastro de partes processuais. Este registro não contém o trecho do documento original; consulte os documentos do processo.' : 'Trecho de origem não disponível.')}</p>
                      </div>
                    ))}
                    {!(candidate.evidence || []).some(e => e.sourceEvidence?.length) && <p className="mt-2">Trechos não disponíveis neste registro. Reprocesse o piloto para atualizar as evidências.</p>}
                  </details>
                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr_auto] gap-3 items-end">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Processo</div>
                      <div className="text-xs font-semibold text-slate-900 mt-1">{processNumber}</div>
                      {candidate.processes?.objeto_demanda && (
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{candidate.processes.objeto_demanda}</div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="md:col-span-1">
                        <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Empresa existente</label>
                        <select
                          value={draft.companyId}
                          onChange={(e) => setCandidateDrafts((current) => ({ ...current, [candidate.id]: { ...draft, companyId: e.target.value } }))}
                          disabled={!canManageCompanies || candidateBusyId === candidate.id}
                          className="w-full text-xs px-2.5 py-2 border border-slate-300 bg-white rounded-lg"
                        >
                          <option value="">Criar/confirmar nova</option>
                          {companies.filter((c) => c.active).map((company) => (
                            <option key={company.id} value={company.id}>{company.nome}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Nome / Razão Social</label>
                        <input
                          value={draft.name}
                          onChange={(e) => setCandidateDrafts((current) => ({ ...current, [candidate.id]: { ...draft, name: e.target.value } }))}
                          disabled={Boolean(draft.companyId) || !canManageCompanies || candidateBusyId === candidate.id}
                          className="w-full text-xs px-2.5 py-2 border border-slate-300 bg-white rounded-lg disabled:bg-slate-100"
                          placeholder="Confirme ou corrija o nome"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">CNPJ</label>
                        <input
                          value={draft.cnpj}
                          onChange={(e) => setCandidateDrafts((current) => ({ ...current, [candidate.id]: { ...draft, cnpj: e.target.value } }))}
                          disabled={Boolean(draft.companyId) || !canManageCompanies || candidateBusyId === candidate.id}
                          className="w-full text-xs px-2.5 py-2 border border-slate-300 bg-white rounded-lg disabled:bg-slate-100"
                          placeholder="Opcional quando confirmado manualmente"
                        />
                      </div>
                    </div>

                    {canManageCompanies && (
                      <div className="flex items-center gap-2 xl:justify-end">
                        <button
                          type="button"
                          onClick={() => void handleConfirmCandidate(candidate)}
                          disabled={candidateBusyId === candidate.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {candidateBusyId === candidate.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Confirmar e vincular
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRejectCandidate(candidate)}
                          disabled={candidateBusyId === candidate.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Descartar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50">
          {/* Campo de Busca */}
          <div className="relative w-full sm:max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              id="company-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por razão social, nome ou CNPJ..."
              className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Filtro por Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Status:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs shadow-2xs">
              <button
                id="filter-all-btn"
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todas
              </button>
              <button
                id="filter-active-btn"
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                  statusFilter === 'active'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ativas
              </button>
              <button
                id="filter-inactive-btn"
                type="button"
                onClick={() => setStatusFilter('inactive')}
                className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                  statusFilter === 'inactive'
                    ? 'bg-red-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inativas
              </button>
            </div>
          </div>
        </div>

        {/* Tabela Corporativa de Empresas */}
        <div className="overflow-x-auto">
          <table id="companies-table" className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th scope="col" className="py-3 px-3 xl:px-4 w-[48%]">
                  Razão Social / Entidade
                </th>
                <th scope="col" className="py-3 px-3 xl:px-4 w-[24%]">
                  CNPJ
                </th>
                <th scope="col" className="py-3 px-3 xl:px-4 text-center w-[16%]">
                  Status
                </th>
                <th scope="col" className="hidden lg:table-cell py-3 px-3 xl:px-4 w-[12%]">
                  Data de Cadastro
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-red-600" />
                      <span className="text-xs font-medium text-slate-500">
                        Carregando empresas cadastradas no banco de dados...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-[#0F172A]">Nenhuma empresa encontrada</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      {searchQuery
                        ? `Nenhum resultado corresponde à busca "${searchQuery}". Tente outros termos.`
                        : 'Não há empresas registradas com o filtro selecionado.'}
                    </p>
                    {canManageCompanies && !searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCompany(null);
                          setModalMode('create');
                        }}
                        className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer shadow-xs transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Cadastrar Primeira Empresa</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                companies.map((company) => (
                  <tr
                    key={company.id}
                    id={`company-row-${company.id}`}
                    tabIndex={0}
                    role="button"
                    onClick={() => { setSelectedCompany(company); setModalMode('view'); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCompany(company); setModalMode('view'); } }}
                    className="cursor-pointer hover:bg-slate-50/70 focus:bg-slate-50 transition-colors group outline-none"
                  >
                    {/* Coluna: Nome / Razão Social */}
                    <td className="py-3.5 px-3 xl:px-4 font-medium text-[#0F172A] min-w-0">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                            company.active
                              ? 'bg-red-50 text-red-700 border border-red-100'
                              : 'bg-slate-100 text-slate-400 border border-slate-200'
                          }`}
                        >
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-[#0F172A] truncate max-w-md">
                            {company.nome}
                          </div>
                          {company.nome_normalizado && (
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider truncate max-w-md">
                              {company.nome_normalizado}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Coluna: CNPJ */}
                    <td className="py-3.5 px-3 xl:px-4 font-mono text-slate-700 whitespace-nowrap">
                      {company.cnpj ? (
                        maskCNPJ(company.cnpj)
                      ) : (
                        <span className="text-slate-400 italic">Não cadastrado</span>
                      )}
                    </td>

                    {/* Coluna: Status */}
                    <td className="py-3.5 px-3 xl:px-4 text-center whitespace-nowrap">
                      <StatusBadge
                        status={company.active ? 'ATIVA' : 'INATIVA'}
                        type={company.active ? 'success' : 'danger'}
                        label={company.active ? 'Ativa' : 'Inativa'}
                      />
                    </td>

                    {/* Coluna: Data de Criação */}
                    <td className="hidden lg:table-cell py-3.5 px-3 xl:px-4 text-slate-500 whitespace-nowrap">
                      {company.created_at
                        ? new Date(company.created_at).toLocaleDateString('pt-BR')
                        : '-'}
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Tabela com Resumo */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
          <span>
            Total: <strong>{companies.length}</strong> empresa(s) listada(s)
          </span>
          <span className="text-[11px] text-slate-400">
            Fonte de dados única: <code className="font-mono text-slate-600">public.companies</code>
          </span>
        </div>
      </div>

      {/* Modal de Formulário (Criar / Editar / Visualizar) */}
      <CompanyModal
        isOpen={modalMode !== null}
        mode={modalMode || 'view'}
        company={selectedCompany}
        onClose={() => {
          setModalMode(null);
          setSelectedCompany(null);
        }}
        onSave={handleSaveCompany}
        canManage={canManageCompanies}
        onEdit={() => setModalMode('edit')}
        onToggleActive={() => {
          if (!selectedCompany) return;
          void handleToggleActive(selectedCompany);
          setModalMode(null);
          setSelectedCompany(null);
        }}
        onDelete={() => {
          if (!selectedCompany) return;
          setCompanyToDelete(selectedCompany);
          setModalMode(null);
        }}
      />

      {/* Modal de Confirmação de Exclusão */}
      <CompanyDeleteModal
        isOpen={companyToDelete !== null}
        company={companyToDelete}
        onClose={() => setCompanyToDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      <ActionDialog
        isOpen={reprocessDialogOpen}
        title="Reprocessamento de vínculos — até 10 processos"
        message={noEligibleRemaining
          ? "Não há novos processos elegíveis para reprocessamento automático. Os demais vínculos pendentes aguardam confirmação ou revisão manual."
          : (reprocessPreview && reprocessPreview.length > 0
            ? `Prévia concluída. Serão analisados estes ${reprocessPreview.length} processos: ${reprocessPreview.map(p => p.numero_processo).join('; ')}.${remainingEligible !== null && remainingEligible !== undefined ? ` Restantes após este lote: ${remainingEligible}.` : ''} Confirme para executar. O autocadastro permanece bloqueado.`
            : "Consultar o próximo lote de processos sem empresa vinculada que ainda podem ser reprocessados. Esta etapa é somente leitura.")}
        confirmLabel={noEligibleRemaining ? 'Entendido' : (reprocessPreview && reprocessPreview.length > 0 ? "Executar reprocessamento" : "Consultar prévia")}
        cancelLabel={noEligibleRemaining ? 'Fechar' : "Cancelar"}
        busy={isReprocessingLinks}
        error={reprocessError}
        onClose={() => {
          if (isReprocessingLinks) return;
          setReprocessDialogOpen(false);
          setReprocessError(null);
          setReprocessPreview(null);
          setRemainingEligible(null);
          setNoEligibleRemaining(false);
        }}
        onConfirm={noEligibleRemaining ? () => {
          setReprocessDialogOpen(false);
          setNoEligibleRemaining(false);
        } : handleReprocessCompanyLinks}
      />
    </div>
  );
};
