import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Search,
  RefreshCw,
  Filter,
  CheckCircle2,
  AlertCircle,
  Shield,
  Loader2,
  AlertTriangle,
  FolderX,
  Calendar,
  Link2,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Process, ProcessStatus, Company, ProcessSegment } from '../../types/database';
import { processesService, type ProcessFilters } from '../../services/processesService';
import type { ProcessSortOption } from '../../utils/processSorting';
import { companiesService } from '../../services/companiesService';
import { ProcessStatusBadge, ProcessPriorityBadge, STATUS_CONFIG } from '../../components/processes/ProcessStatusBadge';
import { ProcessModal } from '../../components/processes/ProcessModal';
import { CompanyModal } from '../../components/companies/CompanyModal';
import { ProcessDetailsModal } from '../../components/processes/ProcessDetailsModal';
import { ProcessStatusModal } from '../../components/processes/ProcessStatusModal';
import { ProcessDeleteModal } from '../../components/processes/ProcessDeleteModal';
import { formatProcessNumber, BRAZILIAN_UFS, inferUfFromCnj } from '../../utils/cnj';
import { classifyDefendantGroup } from '../../utils/defendantClassifier';
import { getOperationalDeadline } from '../../utils/date';

export const ProcessesPage: React.FC = () => {
  const { profile } = useAuth();

  // Permissões RBAC conforme especificação:
  // - ADMIN e GESTOR podem cadastrar e editar e excluir (se integridade permitir);
  // - ANALISTA pode editar processos e alterar status;
  // - CONSULTA somente leitura.
  const userRole = profile?.role;
  const canCreate = userRole === 'ADMIN' || userRole === 'GESTOR';
  const canEdit = userRole === 'ADMIN' || userRole === 'GESTOR' || userRole === 'ANALISTA';
  const canDelete = userRole === 'ADMIN' || userRole === 'GESTOR';

  // Estados de dados
  const [processes, setProcesses] = useState<Process[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Filtros de busca
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProcessStatus | 'ALL'>('ALL');
  const [companyFilter, setCompanyFilter] = useState<string | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string | 'ALL'>('ALL');
  const [segmentoFilter, setSegmentoFilter] = useState<ProcessSegment | 'ALL'>('ALL');
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [sortOption, setSortOption] = useState<ProcessSortOption>('OPERATIONAL_PRIORITY');

  // Novos filtros de negócio (Réu, Competência 1º e-mail, Região, Classificação Assistencial)
  const [reuFilter, setReuFilter] = useState<'ALL' | 'SB_SAUDE' | 'SAN_MIGUEL' | 'OUTROS' | 'NAO_IDENTIFICADO'>('ALL');

  const [competenciaAnoFilter, setCompetenciaAnoFilter] = useState<number | 'ALL'>('ALL');
  const [competenciaMesFilter, setCompetenciaMesFilter] = useState<number | 'ALL'>('ALL');
  const [ufFilter, setUfFilter] = useState<string | 'ALL'>('ALL');
  const [municipioFilter, setMunicipioFilter] = useState<string>('');
  const [classeFilter, setClasseFilter] = useState<string | 'ALL'>('ALL');
  const [subclasseFilter, setSubclasseFilter] = useState<string>('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Contagem de filtros secundários ativos (para o badge do botão "Filtros avançados")
  const activeSecondaryFiltersCount = useMemo(() => {
    let count = 0;
    if (reuFilter !== 'ALL') count++;
    if (competenciaAnoFilter !== 'ALL') count++;
    if (competenciaMesFilter !== 'ALL') count++;
    if (ufFilter !== 'ALL') count++;
    if (municipioFilter.trim() !== '') count++;
    if (classeFilter !== 'ALL') count++;
    if (subclasseFilter.trim() !== '') count++;
    if (segmentoFilter !== 'ALL') count++;
    if (priorityFilter !== 'ALL') count++;
    if (sortOption !== 'OPERATIONAL_PRIORITY') count++;
    if (includeArchived) count++;
    return count;
  }, [
    reuFilter,
    competenciaAnoFilter,
    competenciaMesFilter,
    ufFilter,
    municipioFilter,
    classeFilter,
    subclasseFilter,
    segmentoFilter,
    priorityFilter,
    sortOption,
    includeArchived,
  ]);

  // Lista de filtros ativos para exibição dos chips com remoção individual (RF-03 & Critério 7)
  const activeFilters = useMemo(() => {
    const list: { key: string; label: string; onClear: () => void }[] = [];

    if (searchQuery.trim()) {
      list.push({
        key: 'search',
        label: `Busca: "${searchQuery.trim()}"`,
        onClear: () => setSearchQuery(''),
      });
    }

    if (statusFilter !== 'ALL') {
      const statusLabel = STATUS_CONFIG[statusFilter]?.label || statusFilter;
      list.push({
        key: 'status',
        label: `Status: ${statusLabel}`,
        onClear: () => setStatusFilter('ALL'),
      });
    }

    if (companyFilter !== 'ALL') {
      const comp = companies.find((c) => c.id === companyFilter);
      list.push({
        key: 'company',
        label: `Empresa: ${comp?.nome || 'Selecionada'}`,
        onClear: () => setCompanyFilter('ALL'),
      });
    }

    if (reuFilter !== 'ALL') {
      const reuLabels: Record<string, string> = {
        SB_SAUDE: 'SB Saúde',
        SAN_MIGUEL: 'San Miguel',
        OUTROS: 'Outros réus',
        NAO_IDENTIFICADO: 'Não identificado',
      };
      list.push({
        key: 'reu',
        label: `Réu: ${reuLabels[reuFilter] || reuFilter}`,
        onClear: () => setReuFilter('ALL'),
      });
    }

    if (competenciaAnoFilter !== 'ALL') {
      list.push({
        key: 'ano',
        label: competenciaAnoFilter === -1 ? 'Ano: Sem data' : `Ano: ${competenciaAnoFilter}`,
        onClear: () => setCompetenciaAnoFilter('ALL'),
      });
    }

    if (competenciaMesFilter !== 'ALL') {
      const meses = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      list.push({
        key: 'mes',
        label: `Mês: ${meses[competenciaMesFilter as number] || competenciaMesFilter}`,
        onClear: () => setCompetenciaMesFilter('ALL'),
      });
    }

    if (ufFilter !== 'ALL') {
      list.push({
        key: 'uf',
        label: ufFilter === 'NAO_INFORMADO' ? 'UF: Não informado' : `UF: ${ufFilter}`,
        onClear: () => setUfFilter('ALL'),
      });
    }

    if (municipioFilter.trim()) {
      list.push({
        key: 'municipio',
        label: `Município: ${municipioFilter.trim()}`,
        onClear: () => setMunicipioFilter(''),
      });
    }

    if (classeFilter !== 'ALL') {
      list.push({
        key: 'classe',
        label: `Classe: ${classeFilter}`,
        onClear: () => setClasseFilter('ALL'),
      });
    }

    if (subclasseFilter.trim()) {
      list.push({
        key: 'subclasse',
        label: `Subclasse: ${subclasseFilter.trim()}`,
        onClear: () => setSubclasseFilter(''),
      });
    }

    if (segmentoFilter !== 'ALL') {
      list.push({
        key: 'segmento',
        label: `Segmento: ${segmentoFilter}`,
        onClear: () => setSegmentoFilter('ALL'),
      });
    }

    if (priorityFilter !== 'ALL') {
      list.push({
        key: 'priority',
        label: `Prioridade: ${priorityFilter}`,
        onClear: () => setPriorityFilter('ALL'),
      });
    }

    if (sortOption !== 'OPERATIONAL_PRIORITY') {
      const sortLabels: Record<ProcessSortOption, string> = {
        OPERATIONAL_PRIORITY: 'Prioridade',
        PROCESS_NUMBER: 'Número CNJ',
        LAST_UPDATED: 'Última atualização',
        NEWEST: 'Mais recentes',
        OLDEST: 'Mais antigos',
        CASE_VALUE: 'Valor da causa',
        NEAREST_DEADLINE: 'Prazo próximo',
      };
      list.push({
        key: 'sort',
        label: `Ordem: ${sortLabels[sortOption] || sortOption}`,
        onClear: () => setSortOption('OPERATIONAL_PRIORITY'),
      });
    }

    if (includeArchived) {
      list.push({
        key: 'archived',
        label: 'Inclui arquivados',
        onClear: () => setIncludeArchived(false),
      });
    }

    return list;
  }, [
    searchQuery,
    statusFilter,
    companyFilter,
    companies,
    reuFilter,
    competenciaAnoFilter,
    competenciaMesFilter,
    ufFilter,
    municipioFilter,
    classeFilter,
    subclasseFilter,
    segmentoFilter,
    priorityFilter,
    sortOption,
    includeArchived,
  ]);

  const handleClearAllFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setCompanyFilter('ALL');
    setPriorityFilter('ALL');
    setSegmentoFilter('ALL');
    setIncludeArchived(false);
    setSortOption('OPERATIONAL_PRIORITY');
    setReuFilter('ALL');
    setCompetenciaAnoFilter('ALL');
    setCompetenciaMesFilter('ALL');
    setUfFilter('ALL');
    setMunicipioFilter('');
    setClasseFilter('ALL');
    setSubclasseFilter('');
  }, []);

  // Estados dos modais
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [processModalMode, setProcessModalMode] = useState<'create' | 'edit'>('create');
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [processForDetails, setProcessForDetails] = useState<Process | null>(null);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [processForStatus, setProcessForStatus] = useState<Process | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [processToDelete, setProcessToDelete] = useState<Process | null>(null);

  // Estados para cadastro e vínculo de empresa
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [companyModalProcess, setCompanyModalProcess] = useState<Process | null>(null);
  const [companyModalInitialNome, setCompanyModalInitialNome] = useState('');
  const [companyModalInitialCnpj, setCompanyModalInitialCnpj] = useState('');

  // Carrega empresas para os seletores
  useEffect(() => {
    async function loadCompanies() {
      const res = await companiesService.getCompanies();
      if (res.data) {
        setCompanies(res.data);
      }
    }
    loadCompanies();
  }, []);

  // Carregamento de processos
  const fetchProcesses = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const filters: ProcessFilters = {
      search: searchQuery,
      status: statusFilter,
      companyId: companyFilter,
      prioridade: priorityFilter,
      segmento: segmentoFilter,
      includeArchived,
      sort: sortOption,
      reu: reuFilter,
      competenciaAno: competenciaAnoFilter,
      competenciaMes: competenciaMesFilter,
      uf: ufFilter,
      municipio: municipioFilter,
      classeAssistencial: classeFilter,
      subclassificacao: subclasseFilter,
    };

    const res = await processesService.getProcesses(filters);

    if (res.error) {
      setError(res.error);
      setProcesses([]);
    } else {
      setProcesses(res.data);
    }

    setIsLoading(false);
  }, [
    searchQuery,
    statusFilter,
    companyFilter,
    priorityFilter,
    segmentoFilter,
    includeArchived,
    sortOption,
    reuFilter,
    competenciaAnoFilter,
    competenciaMesFilter,
    ufFilter,
    municipioFilter,
    classeFilter,
    subclasseFilter,
  ]);

  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  // Temporizador para dispensar notificações de sucesso
  useEffect(() => {
    if (successNotice) {
      const timer = setTimeout(() => setSuccessNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successNotice]);

  // Abertura de Modais
  const handleOpenCreate = () => {
    setSelectedProcess(null);
    setProcessModalMode('create');
    setIsProcessModalOpen(true);
  };

  const handleOpenEdit = (proc: Process) => {
    setSelectedProcess(proc);
    setProcessModalMode('edit');
    setIsProcessModalOpen(true);
  };

  const handleOpenDetails = (proc: Process) => {
    setProcessForDetails(proc);
    setIsDetailsOpen(true);
  };

  const handleOpenStatusModal = (proc: Process) => {
    setProcessForStatus(proc);
    setIsStatusModalOpen(true);
  };

  const handleOpenDeleteModal = (proc: Process) => {
    setProcessToDelete(proc);
    setIsDeleteModalOpen(true);
  };

  // Salvar Criação ou Edição
  const handleSaveProcess = async (payload: any): Promise<{ success: boolean; error?: string }> => {
    if (processModalMode === 'create') {
      const createPayload = {
        ...payload,
        created_by: profile?.id || null,
      };
      const res = await processesService.createProcess(createPayload);
      if (res.error) {
        return { success: false, error: res.error };
      }
      setSuccessNotice('Processo judicial cadastrado com sucesso!');
      setIsProcessModalOpen(false);
      fetchProcesses();
      return { success: true };
    } else if (selectedProcess) {
      const updatePayload = {
        ...payload,
        updated_by: profile?.id || null,
      };
      const res = await processesService.updateProcess(selectedProcess.id, updatePayload);
      if (res.error) {
        return { success: false, error: res.error };
      }
      setSuccessNotice('Processo judicial atualizado com sucesso!');
      setIsProcessModalOpen(false);
      if (processForDetails?.id === selectedProcess.id && res.data) {
        setProcessForDetails(res.data);
      }
      fetchProcesses();
      return { success: true };
    }
    return { success: false, error: 'Operação inválida.' };
  };

  // Alterar Status
  const handleUpdateStatus = async (
    newStatus: ProcessStatus
  ): Promise<{ success: boolean; error?: string }> => {
    if (!processForStatus) return { success: false, error: 'Nenhum processo selecionado.' };

    const res = await processesService.updateStatus(
      processForStatus.id,
      newStatus,
      profile?.id || null
    );

    if (res.error) {
      return { success: false, error: res.error };
    }

    setSuccessNotice(`Status do processo alterado para "${newStatus}" com sucesso!`);
    setIsStatusModalOpen(false);
    if (processForDetails?.id === processForStatus.id) {
      setProcessForDetails({
        ...processForDetails,
        status_atual: newStatus,
      });
    }
    fetchProcesses();
    return { success: true };
  };

  // Alternar Arquivamento
  const handleToggleArchive = async (proc: Process) => {
    const res = await processesService.toggleArchive(
      proc.id,
      proc.arquivado,
      profile?.id || null
    );

    if (res.error) {
      setError(res.error);
    } else {
      const actionLabel = proc.arquivado ? 'desarquivado' : 'arquivado';
      setSuccessNotice(`Processo ${actionLabel} com sucesso!`);
      if (processForDetails?.id === proc.id) {
        setProcessForDetails({
          ...processForDetails,
          arquivado: !proc.arquivado,
        });
      }
      fetchProcesses();
    }
  };

  // Excluir Processo
  const handleConfirmDelete = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const res = await processesService.deleteProcess(id);
    if (res.error) {
      return { success: false, error: res.error };
    }

    setSuccessNotice('Processo excluído com sucesso.');
    setIsDeleteModalOpen(false);
    if (processForDetails?.id === id) {
      setIsDetailsOpen(false);
      setProcessForDetails(null);
    }
    fetchProcesses();
    return { success: true };
  };

  // Alternativas do Modal de Exclusão quando há dependências
  const handleArchiveAlternative = async (proc: Process) => {
    await handleToggleArchive(proc);
  };

  const handleCancelAlternative = async (proc: Process) => {
    const res = await processesService.updateStatus(proc.id, 'CANCELADA', profile?.id || null);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessNotice('Status do processo alterado para CANCELADA com sucesso!');
      fetchProcesses();
    }
  };

  // Abrir modal para Cadastrar e Vincular Empresa
  const handleOpenRegisterCompany = (proc: Process) => {
    setCompanyModalProcess(proc);
    setCompanyModalInitialNome('');
    setCompanyModalInitialCnpj('');
    setIsCompanyModalOpen(true);
  };

  // Salvar Empresa Criada e Vincular Automaticamente ao Processo
  const handleSaveCompanyAndLink = async (data: { nome: string; cnpj: string; active: boolean }): Promise<{ success: boolean; error?: string }> => {
    const res = await companiesService.createCompany(data);
    if (res.error || !res.data) {
      return { success: false, error: res.error || 'Erro ao criar empresa.' };
    }

    const createdCompany = res.data;

    // Atualiza lista de empresas disponíveis
    const compListRes = await companiesService.getCompanies();
    if (compListRes.data) {
      setCompanies(compListRes.data);
    }

    // Se houver um processo em contexto de vínculo, vincula a empresa criada
    if (companyModalProcess) {
      const updateRes = await processesService.updateProcess(companyModalProcess.id, {
        company_id: createdCompany.id,
        updated_by: profile?.id || null,
      });

      if (updateRes.error) {
        return { success: false, error: `Empresa cadastrada, mas houve erro ao vincular ao processo: ${updateRes.error}` };
      }

      setSuccessNotice(`Empresa "${createdCompany.nome}" cadastrada e vinculada ao processo com sucesso!`);
      setIsCompanyModalOpen(false);
      setCompanyModalProcess(null);
      if (processForDetails?.id === companyModalProcess.id && updateRes.data) {
        setProcessForDetails(updateRes.data);
      }
      fetchProcesses();
      return { success: true };
    }

    setSuccessNotice(`Empresa "${createdCompany.nome}" cadastrada com sucesso!`);
    setIsCompanyModalOpen(false);
    return { success: true };
  };

  return (
    <div className="space-y-6">
      {/* Alerta de Perfil Somente Leitura (CONSULTA) */}
      {userRole === 'CONSULTA' && (
        <div
          id="processes-consult-warning"
          className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center gap-2"
        >
          <Shield className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Perfil com permissão <strong>CONSULTA</strong>: acesso restrito à visualização de processos judiciais.
          </span>
        </div>
      )}

      {/* Notificação de Sucesso */}
      {successNotice && (
        <div
          id="processes-success-alert"
          className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4 cursor-pointer text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Alerta de Erro */}
      {error && (
        <div
          id="processes-error-alert"
          className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="block font-bold">Erro na Operação de Processos:</strong>
            <p className="mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={fetchProcesses}
            className="px-2.5 py-1 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700 transition shrink-0 cursor-pointer"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-red-600">
            Operação Jurídica
          </span>
          <div className="flex items-center gap-3 mt-0.5">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#0F172A]">
              Gestão de Processos
            </h2>
            <span
              id="processes-count-badge"
              className="px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-full border border-slate-200"
            >
              {processes.length} {processes.length === 1 ? 'processo' : 'processos'}
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Fonte única de dados integrada à tabela <code className="font-mono text-slate-700">public.processes</code> do Supabase.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="refresh-processes-btn"
            type="button"
            onClick={fetchProcesses}
            disabled={isLoading}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition cursor-pointer shadow-2xs disabled:opacity-50"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-red-600' : ''}`} />
          </button>

          {canCreate && (
            <button
              id="new-process-btn"
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Processo</span>
            </button>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Busca (RF-03) */}
      <div className="bg-white rounded-xl p-3 sm:p-4 border border-slate-200/80 shadow-xs space-y-3">
        {/* Linha principal: busca + status + empresa + alternador de filtros secundários */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-3">
          {/* Busca textual */}
          <div className="relative sm:col-span-2 lg:col-span-5 min-w-0">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              id="processes-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por CNJ, protocolo, comarca ou objeto..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:bg-white transition"
            />
          </div>

          {/* Filtro por Status */}
          <div className="lg:col-span-3 min-w-0">
            <select
              id="processes-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProcessStatus | 'ALL')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-red-500 focus:bg-white transition cursor-pointer truncate"
            >
              <option value="ALL">Todos os Status</option>
              <option value="NOVA">Nova Demanda</option>
              <option value="TRIAGEM">Em Triagem</option>
              <option value="EM_ANALISE">Em Análise</option>
              <option value="EM_TRATAMENTO">Em Tratamento</option>
              <option value="AGUARDANDO_TERCEIRO">Aguardando Terceiro</option>
              <option value="AGUARDANDO_DECISAO">Aguardando Decisão</option>
              <option value="CONCLUIDA">Concluída</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>

          {/* Filtro por Empresa vinculada */}
          <div className="lg:col-span-2 min-w-0">
            <select
              id="processes-company-filter"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-red-500 focus:bg-white transition cursor-pointer truncate"
            >
              <option value="ALL">Todas as empresas</option>
              {companies.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Botão para alternar Filtros Avançados / Secundários */}
          <div className="lg:col-span-2 min-w-0">
            <button
              id="toggle-advanced-filters-btn"
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`w-full inline-flex items-center justify-between px-3 py-2 border rounded-lg text-xs font-semibold transition cursor-pointer ${
                showAdvancedFilters || activeSecondaryFiltersCount > 0
                  ? 'bg-red-50/80 border-red-200 text-red-700 hover:bg-red-100/80'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title="Exibir ou ocultar filtros secundários"
              aria-expanded={showAdvancedFilters}
            >
              <span className="inline-flex items-center gap-1.5 truncate">
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span>Filtros</span>
                {activeSecondaryFiltersCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[10px] font-bold shrink-0">
                    {activeSecondaryFiltersCount}
                  </span>
                )}
              </span>
              {showAdvancedFilters ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-1" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-1" />
              )}
            </button>
          </div>
        </div>

        {/* Painel expansível de filtros secundários (RF-03) */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in">
            {/* Grid de filtros de negócio: 1 col (mobile), 2 cols (sm/md), 4 cols (xl) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 text-xs">
              {/* Réu */}
              <div className="flex flex-col gap-1 min-w-0">
                <label htmlFor="processes-reu-filter" className="font-semibold text-slate-500 text-[11px]">Réu</label>
                <select
                  id="processes-reu-filter"
                  value={reuFilter}
                  onChange={(e) => setReuFilter(e.target.value as any)}
                  className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer min-w-0"
                >
                  <option value="ALL">Todos os Réus</option>
                  <option value="SB_SAUDE">SB Saúde</option>
                  <option value="SAN_MIGUEL">San Miguel</option>
                  <option value="OUTROS">Outros</option>
                  <option value="NAO_IDENTIFICADO">Não identificado</option>
                </select>
              </div>

              {/* Competência */}
              <div className="flex flex-col gap-1 min-w-0">
                <label className="font-semibold text-slate-500 text-[11px] flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                  Competência
                </label>
                <div className="flex gap-1 min-w-0">
                  <select
                    id="processes-ano-filter"
                    value={competenciaAnoFilter}
                    onChange={(e) => setCompetenciaAnoFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                    className="flex-1 min-w-0 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer"
                  >
                    <option value="ALL">Ano</option>
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                    <option value={2024}>2024</option>
                    <option value={2023}>2023</option>
                    <option value={-1}>Sem data</option>
                  </select>
                  <select
                    id="processes-mes-filter"
                    value={competenciaMesFilter}
                    onChange={(e) => setCompetenciaMesFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                    className="flex-1 min-w-0 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer"
                  >
                    <option value="ALL">Mês</option>
                    <option value={1}>Jan</option>
                    <option value={2}>Fev</option>
                    <option value={3}>Mar</option>
                    <option value={4}>Abr</option>
                    <option value={5}>Mai</option>
                    <option value={6}>Jun</option>
                    <option value={7}>Jul</option>
                    <option value={8}>Ago</option>
                    <option value={9}>Set</option>
                    <option value={10}>Out</option>
                    <option value={11}>Nov</option>
                    <option value={12}>Dez</option>
                  </select>
                </div>
              </div>

              {/* Região / UF */}
              <div className="flex flex-col gap-1 min-w-0">
                <label className="font-semibold text-slate-500 text-[11px]">Região / UF</label>
                <div className="flex gap-1 min-w-0">
                  <select
                    id="processes-uf-filter"
                    value={ufFilter}
                    onChange={(e) => setUfFilter(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer"
                  >
                    <option value="ALL">UF: Todas</option>
                    {BRAZILIAN_UFS.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                    <option value="NAO_INFORMADO">Não informado</option>
                  </select>
                  <input
                    type="text"
                    value={municipioFilter}
                    onChange={(e) => setMunicipioFilter(e.target.value)}
                    placeholder="Município"
                    className="flex-1 min-w-0 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* Procedimento / Classe */}
              <div className="flex flex-col gap-1 min-w-0">
                <label htmlFor="processes-classe-filter" className="font-semibold text-slate-500 text-[11px]">Procedimento</label>
                <div className="flex gap-1 min-w-0">
                  <select
                    id="processes-classe-filter"
                    value={classeFilter}
                    onChange={(e) => setClasseFilter(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer"
                  >
                    <option value="ALL">Classe: Todas</option>
                    <option value="CONSULTA">Consulta</option>
                    <option value="EXAME">Exame</option>
                    <option value="CIRURGIA">Cirurgia</option>
                    <option value="INTERNACAO">Internação</option>
                    <option value="TERAPIA">Terapia</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                  <input
                    type="text"
                    value={subclasseFilter}
                    onChange={(e) => setSubclasseFilter(e.target.value)}
                    placeholder="Subclasse"
                    className="flex-1 min-w-0 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
              </div>
            </div>

            {/* Linha de controles secundários: segmento, prioridade, ordenação, arquivados */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-slate-600">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* Segmento */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <label htmlFor="processes-segmento-filter" className="font-semibold text-slate-500 shrink-0">Segmento:</label>
                  <select
                    id="processes-segmento-filter"
                    value={segmentoFilter}
                    onChange={(e) => setSegmentoFilter(e.target.value as ProcessSegment | 'ALL')}
                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer min-w-0"
                  >
                    <option value="ALL">Todos</option>
                    <option value="ASSISTENCIAL">Assistencial</option>
                    <option value="PRESTADOR">Prestador</option>
                    <option value="OUTRO">Outro</option>
                    <option value="NAO_CLASSIFICADO">Não Classificado</option>
                  </select>
                </div>

                {/* Prioridade */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <label className="font-semibold text-slate-500 shrink-0">Prioridade:</label>
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer min-w-0"
                  >
                    <option value="ALL">Todas</option>
                    <option value="URGENTE">Urgente</option>
                    <option value="ALTA">Alta</option>
                    <option value="MEDIA">Média</option>
                    <option value="BAIXA">Baixa</option>
                  </select>
                </div>

                {/* Ordenação */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <label htmlFor="processes-sort-select" className="font-semibold text-slate-500 shrink-0">Ordenar:</label>
                  <select
                    id="processes-sort-select"
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as ProcessSortOption)}
                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 cursor-pointer min-w-0"
                    title="Definir a ordem de exibição dos processos"
                  >
                    <option value="OPERATIONAL_PRIORITY">Prioridade</option>
                    <option value="PROCESS_NUMBER">Número</option>
                    <option value="LAST_UPDATED">Última atualização</option>
                    <option value="NEWEST">Mais recentes</option>
                    <option value="OLDEST">Mais antigos</option>
                    <option value="CASE_VALUE">Valor da causa</option>
                    <option value="NEAREST_DEADLINE">Prazo próximo</option>
                  </select>
                </div>

                {/* Incluir arquivados */}
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none min-w-0">
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(e) => setIncludeArchived(e.target.checked)}
                    className="rounded text-red-600 focus:ring-red-500 h-3.5 w-3.5 shrink-0"
                  />
                  <span className="text-slate-600 whitespace-nowrap">Incluir arquivados</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Chips de filtros ativos com remoção individual e botão de limpar todos (RF-03 & Critério 7) */}
        {activeFilters.length > 0 && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">Filtros ativos:</span>
            {activeFilters.map((f) => (
              <span
                key={f.key}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-medium"
              >
                <span>{f.label}</span>
                <button
                  type="button"
                  onClick={f.onClear}
                  className="p-0.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer"
                  title={`Remover filtro ${f.label}`}
                  aria-label={`Remover filtro ${f.label}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="text-xs text-red-600 hover:text-red-800 font-semibold cursor-pointer underline ml-2 shrink-0"
            >
              Limpar todos
            </button>
          </div>
        )}
      </div>

      {/* Tabela Corporativa de Processos */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Barra de Totalizador Dinâmico */}
        <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">Total de Processos:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 font-extrabold text-xs">
              {processes.length}
            </span>
            {(searchQuery ||
              statusFilter !== 'ALL' ||
              companyFilter !== 'ALL' ||
              priorityFilter !== 'ALL' ||
              segmentoFilter !== 'ALL' ||
              includeArchived ||
              reuFilter !== 'ALL' ||
              competenciaAnoFilter !== 'ALL' ||
              competenciaMesFilter !== 'ALL' ||
              ufFilter !== 'ALL' ||
              municipioFilter.trim() !== '' ||
              classeFilter !== 'ALL' ||
              subclasseFilter.trim() !== '') && (
              <span className="text-[11px] text-slate-500 italic">
                (filtrados pelos critérios selecionados)
              </span>
            )}
          </div>
        </div>
        {isLoading ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-7 h-7 animate-spin text-red-600 mx-auto" />
            <p className="text-xs text-slate-500 font-medium">
              Consultando processos na base de dados Supabase...
            </p>
          </div>
        ) : processes.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <FolderX className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              Nenhum processo judicial encontrado
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery || statusFilter !== 'ALL' || companyFilter !== 'ALL'
                ? 'Nenhum registro corresponde aos filtros selecionados. Tente ajustar os parâmetros de busca.'
                : 'A base de processos está vazia. Comece cadastrando o primeiro processo judicial.'}
            </p>
            {canCreate && !searchQuery && statusFilter === 'ALL' && (
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Cadastrar Primeiro Processo</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Visualização em Cartões (Mobile e Tablet: < lg) — RF-04 e RF-05 */}
            <div className="block lg:hidden divide-y divide-slate-100">
              {processes.map((proc) => {
                const proximaObrigacao = proc.proxima_obrigacao;
                const deadlineInfo = proximaObrigacao ? getOperationalDeadline(proximaObrigacao.prazo) : null;
                const respNome = proximaObrigacao?.responsavel?.display_name || proximaObrigacao?.responsavel?.email;
                const autores = proc.autores || [];
                const autorPrincipal = autores.find((autor) => autor.principal) || autores[0] || null;
                const autoresAdicionais = Math.max(0, autores.length - 1);
                const rawUf = (proc.uf || '').trim().toUpperCase();
                const inferredUf = !rawUf ? inferUfFromCnj(proc.numero_processo) : null;
                const effectiveUf = rawUf || inferredUf;

                return (
                  <div
                    key={proc.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir processo ${formatProcessNumber(proc.numero_processo) || 'sem número CNJ'}`}
                    onClick={() => handleOpenDetails(proc)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleOpenDetails(proc);
                      }
                    }}
                    className="p-3.5 sm:p-4 hover:bg-slate-50/80 focus:bg-slate-50/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-200 transition-colors cursor-pointer space-y-2.5"
                  >
                    {/* Linha 1: CNJ + Badges de Prioridade, Arquivado, UF + Status */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm break-all">
                          {formatProcessNumber(proc.numero_processo) || 'Sem número CNJ'}
                        </span>
                        <ProcessPriorityBadge priority={proc.prioridade} />
                        {proc.arquivado && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-700">
                            Arq
                          </span>
                        )}
                        {effectiveUf && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              inferredUf
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                            title={
                              inferredUf
                                ? `UF ${inferredUf} inferida pelo segmento do CNJ`
                                : `UF ${rawUf} da jurisdição`
                            }
                          >
                            {inferredUf ? `${inferredUf} (inferida)` : rawUf}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0">
                        <ProcessStatusBadge status={proc.status_atual} size="sm" />
                      </div>
                    </div>

                    {/* Tipo de demanda / Protocolo / Cadastro incompleto */}
                    {(proc.tipo_demanda || proc.protocolo_externo || proc.cadastro_incompleto) && (
                      <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                        {proc.tipo_demanda && (
                          <span className="font-medium text-slate-700">
                            {proc.tipo_demanda}
                          </span>
                        )}
                        {proc.protocolo_externo && (
                          <span className="text-slate-400 font-mono">
                            • Prot: {proc.protocolo_externo}
                          </span>
                        )}
                        {proc.cadastro_incompleto && (
                          <span
                            id={`card-process-incompleto-badge-${proc.id}`}
                            className="inline-flex items-center gap-1 text-[9px] text-amber-800/80 font-normal"
                            title="Processo com pendências cadastrais"
                          >
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                            <span>Cadastro incompleto</span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Destaque operacional: Próximo Prazo e Criticidade (RF-05) */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs bg-slate-50/80 px-3 py-2 rounded-lg border border-slate-100">
                      {/* Prazo */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[11px] font-semibold text-slate-500 shrink-0">Prazo:</span>
                        {proximaObrigacao && deadlineInfo ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {proximaObrigacao.prazo && (
                              <span className="font-mono text-slate-900 text-[11px] font-semibold flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                                {deadlineInfo.formattedDate}
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide border font-bold ${deadlineInfo.badgeClass}`}
                            >
                              {deadlineInfo.situation}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-medium text-[11px]">Sem prazo ativo</span>
                        )}
                      </div>

                      {/* Criticidade */}
                      {proximaObrigacao?.criticidade && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-500">Criticidade:</span>
                          {(() => {
                            const crit = proximaObrigacao.criticidade.toUpperCase();
                            if (crit === 'URGENTE') {
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                                  URGENTE
                                </span>
                              );
                            }
                            if (crit === 'ALTA') {
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-50 text-red-700 border border-red-200">
                                  ALTA
                                </span>
                              );
                            }
                            if (crit === 'MEDIA' || crit === 'MÉDIA') {
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                  MÉDIA
                                </span>
                              );
                            }
                            return (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                {proximaObrigacao.criticidade}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Grade de dados secundários: Autor, Empresa/Rés, Responsável (RF-04 & RF-05) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {/* Autor */}
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Autor</span>
                        {autorPrincipal ? (
                          <div>
                            <span className="font-semibold text-slate-800 block truncate" title={autorPrincipal.nome}>
                              {autorPrincipal.nome}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                              {autorPrincipal.documento && (
                                <span className="font-mono">{autorPrincipal.documento}</span>
                              )}
                              {autoresAdicionais > 0 && (
                                <span className="font-semibold text-slate-500">
                                  +{autoresAdicionais} {autoresAdicionais === 1 ? 'autor' : 'autores'}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Não identificado</span>
                        )}
                      </div>

                      {/* Empresa Vinculada */}
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Empresa Vinculada</span>
                        {proc.company ? (
                          <div>
                            <span className="font-semibold text-slate-800 block truncate" title={proc.company.nome}>
                              {proc.company.nome}
                            </span>
                            {proc.company.cnpj && (
                              <span className="font-mono text-[10px] text-slate-400 block">
                                {proc.company.cnpj}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                            <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                            <span>Sem empresa vinculada</span>
                          </span>
                        )}

                        {/* Rés estruturadas se houver */}
                        {proc.defendants && proc.defendants.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="text-[10px] text-slate-400 font-medium">Rés:</span>
                            {proc.defendants.slice(0, 2).map((d) => {
                              const nome = d.company?.nome || d.nome_livre || 'Ré';
                              const grp = classifyDefendantGroup(nome);
                              const isSb = grp === 'SB_SAUDE';
                              const isSm = grp === 'SAN_MIGUEL';
                              return (
                                <span
                                  key={d.id}
                                  className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                                    isSb
                                      ? 'bg-red-50 text-red-700 border-red-200'
                                      : isSm
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : 'bg-slate-50 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {nome}
                                </span>
                              );
                            })}
                            {proc.defendants.length > 2 && (
                              <span className="text-[9px] font-bold text-slate-500">
                                +{proc.defendants.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Responsável */}
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Responsável</span>
                        {proximaObrigacao ? (
                          respNome ? (
                            <span className="font-medium text-slate-800 text-[11px] block truncate" title={respNome}>
                              {respNome}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Não atribuído</span>
                          )
                        ) : (
                          <span className="text-slate-400 font-medium">-</span>
                        )}
                      </div>

                      {/* Fase / Tutela (se existir) */}
                      {(proc.fase_processual || proc.tutela_atual) && (
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Fase / Tutela</span>
                          <span className="text-slate-800 text-[11px] block truncate">
                            {[proc.fase_processual, proc.tutela_atual].filter(Boolean).join(' • ')}
                          </span>
                        </div>
                      )}

                      {/* Obrigação ativa (se existir) */}
                      {proximaObrigacao && (
                        <div className="sm:col-span-2 min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Obrigação</span>
                          <p className="text-slate-800 text-[11px] line-clamp-2 mt-0.5" title={proximaObrigacao.descricao}>
                            {proximaObrigacao.descricao}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Rodapé: Ação de Abrir evidente */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-slate-400">Toque para ver histórico e prazos</span>
                      <span className="inline-flex items-center gap-1 text-red-600 font-semibold group-hover:underline">
                        <span>Abrir processo</span>
                        <span>→</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Visualização em Tabela (Desktop: >= lg) — RF-04 */}
            <div className="hidden lg:block overflow-x-auto">
              <table id="processes-table" className="w-full table-fixed text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3 xl:px-4 w-[32%] xl:w-[26%] 2xl:w-[18%]">Processo / Demanda</th>
                    <th className="hidden lg:table-cell py-3 px-3 xl:px-4 w-[18%] xl:w-[14%] 2xl:w-[12%]">Autor</th>
                    <th className="hidden lg:table-cell py-3 px-3 xl:px-4 w-[20%] xl:w-[15%] 2xl:w-[13%]">Empresa vinculada</th>
                    <th className="hidden 2xl:table-cell py-3 px-3 xl:px-4 2xl:w-[8%]">Fase / Tutela</th>
                    <th className="hidden lg:table-cell py-3 px-3 xl:px-4 w-[16%] xl:w-[13%] 2xl:w-[11%]">Próximo Prazo</th>
                    <th className="hidden 2xl:table-cell py-3 px-3 xl:px-4 2xl:w-[12%]">Obrigação</th>
                    <th className="hidden xl:table-cell py-3 px-3 xl:px-4 xl:w-[9%] 2xl:w-[7%]">Criticidade</th>
                    <th className="hidden xl:table-cell py-3 px-3 xl:px-4 xl:w-[11%] 2xl:w-[8%]">Responsável</th>
                    <th className="py-3 px-3 xl:px-4 w-[14%] xl:w-[12%] 2xl:w-[11%] min-w-[120px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {processes.map((proc) => {
                    const proximaObrigacao = proc.proxima_obrigacao;
                    const deadlineInfo = proximaObrigacao ? getOperationalDeadline(proximaObrigacao.prazo) : null;
                    const respNome = proximaObrigacao?.responsavel?.display_name || proximaObrigacao?.responsavel?.email;
                    const autores = proc.autores || [];
                    const autorPrincipal = autores.find((autor) => autor.principal) || autores[0] || null;
                    const autoresAdicionais = Math.max(0, autores.length - 1);

                    return (
                      <tr
                        key={proc.id}
                        tabIndex={0}
                        role="button"
                        aria-label={`Abrir processo ${formatProcessNumber(proc.numero_processo) || 'sem número CNJ'}`}
                        onClick={() => handleOpenDetails(proc)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleOpenDetails(proc);
                          }
                        }}
                        className="hover:bg-slate-50/80 focus:bg-slate-50/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-200 transition-colors cursor-pointer group"
                        title="Clique para visualizar o processo"
                      >
                        {/* Coluna 1: Processo / Demanda */}
                        <td className="py-3.5 px-3 xl:px-4">
                          <div className="flex items-start gap-2 min-w-0">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono font-bold text-slate-900 text-xs break-all">
                                  {formatProcessNumber(proc.numero_processo) || 'Sem número CNJ'}
                                </span>
                                <ProcessPriorityBadge priority={proc.prioridade} />
                                {proc.arquivado && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-700">
                                    Arq
                                  </span>
                                )}
                                {(() => {
                                  const rawUf = (proc.uf || '').trim().toUpperCase();
                                  const inferredUf = !rawUf ? inferUfFromCnj(proc.numero_processo) : null;
                                  const effectiveUf = rawUf || inferredUf;
                                  if (!effectiveUf) return null;
                                  return (
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        inferredUf
                                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                          : 'bg-slate-100 text-slate-700'
                                      }`}
                                      title={
                                        inferredUf
                                          ? `UF ${inferredUf} inferida pelo segmento do CNJ`
                                          : `UF ${rawUf} da jurisdição`
                                      }
                                    >
                                      {inferredUf ? `${inferredUf} (inferida)` : rawUf}
                                    </span>
                                  );
                                })()}
                              </div>

                              <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                                {proc.tipo_demanda && (
                                  <span className="font-medium text-slate-700">
                                    {proc.tipo_demanda}
                                  </span>
                                )}
                                {proc.protocolo_externo && (
                                  <span className="text-slate-400 font-mono">
                                    • Prot: {proc.protocolo_externo}
                                  </span>
                                )}
                              </div>

                              {proc.cadastro_incompleto && (
                                <span
                                  id={`process-incompleto-badge-${proc.id}`}
                                  className="inline-flex items-center gap-1 text-[9px] text-amber-800/80 font-normal mt-0.5"
                                  title="Processo com pendências cadastrais"
                                >
                                  <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                  <span>Cadastro incompleto</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Coluna 2: Autor */}
                        <td className="hidden lg:table-cell py-3.5 px-3 xl:px-4">
                          {autorPrincipal ? (
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-800 block truncate" title={autorPrincipal.nome}>
                                {autorPrincipal.nome}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {autorPrincipal.documento && (
                                  <span className="font-mono text-[10px] text-slate-400 truncate">
                                    {autorPrincipal.documento}
                                  </span>
                                )}
                                {autoresAdicionais > 0 && (
                                  <span className="text-[10px] font-semibold text-slate-500">
                                    +{autoresAdicionais} {autoresAdicionais === 1 ? 'autor' : 'autores'}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Não identificado</span>
                          )}
                        </td>

                        {/* Coluna 3: Empresa vinculada e Rés */}
                        <td className="hidden lg:table-cell py-3.5 px-3 xl:px-4">
                          {proc.company ? (
                            <div>
                              <span className="font-semibold text-slate-800 block truncate" title={proc.company.nome}>
                                {proc.company.nome}
                              </span>
                              {proc.company.cnpj && (
                                <span className="font-mono text-[11px] text-slate-400 block">
                                  {proc.company.cnpj}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                                <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                                <span>Sem empresa vinculada</span>
                              </span>
                            </div>
                          )}

                          {/* Sinalização explícita de rés estruturadas */}
                          {proc.defendants && proc.defendants.length > 0 && (
                            <div className="mt-1 pt-1 border-t border-slate-100 flex flex-wrap items-center gap-1">
                              <span className="text-[10px] text-slate-400 font-medium">Rés:</span>
                              {proc.defendants.slice(0, 2).map((d) => {
                                const nome = d.company?.nome || d.nome_livre || 'Ré';
                                const grp = classifyDefendantGroup(nome);
                                const isSb = grp === 'SB_SAUDE';
                                const isSm = grp === 'SAN_MIGUEL';
                                return (
                                  <span
                                    key={d.id}
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                      isSb
                                        ? 'bg-red-50 text-red-700 border-red-200'
                                        : isSm
                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                        : 'bg-slate-50 text-slate-700 border-slate-200'
                                    }`}
                                    title={`Ré estruturada: ${nome}`}
                                  >
                                    {nome}
                                  </span>
                                );
                              })}
                              {proc.defendants.length > 2 && (
                                <span className="text-[9px] font-bold text-slate-500">
                                  +{proc.defendants.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Coluna 4: Fase / Tutela */}
                        <td className="hidden 2xl:table-cell py-3.5 px-3 xl:px-4">
                          <div>
                            <span className="font-medium text-slate-800 block text-[11px] truncate">
                              {proc.fase_processual || '-'}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate block">
                              {proc.tutela_atual || '-'}
                            </span>
                          </div>
                        </td>

                        {/* Coluna 5: Próximo Prazo */}
                        <td className="hidden lg:table-cell py-3.5 px-3 xl:px-4">
                          {proximaObrigacao && deadlineInfo ? (
                            <div className="space-y-1">
                              {proximaObrigacao.prazo ? (
                                <div className="flex items-center gap-1 text-slate-900 font-mono text-[11px] font-semibold">
                                  <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{deadlineInfo.formattedDate}</span>
                                </div>
                              ) : null}
                              <div>
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide border ${deadlineInfo.badgeClass}`}
                                >
                                  {deadlineInfo.situation}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-medium">-</span>
                          )}
                        </td>

                        {/* Coluna 6: Obrigação */}
                        <td className="hidden 2xl:table-cell py-3.5 px-3 xl:px-4">
                          {proximaObrigacao ? (
                            <div className="max-w-[280px]">
                              <div
                                className="line-clamp-2 text-slate-800 font-medium text-[11px] leading-snug"
                                title={proximaObrigacao.descricao}
                              >
                                {proximaObrigacao.descricao}
                              </div>
                              {proximaObrigacao.evento_gerador && (
                                <div
                                  className="text-[10px] text-slate-400 truncate mt-0.5"
                                  title={`Evento: ${proximaObrigacao.evento_gerador}`}
                                >
                                  {proximaObrigacao.evento_gerador}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">
                              Sem obrigação ativa
                            </span>
                          )}
                        </td>

                        {/* Coluna 7: Criticidade */}
                        <td className="hidden xl:table-cell py-3.5 px-3 xl:px-4">
                          {proximaObrigacao?.criticidade ? (
                            (() => {
                              const crit = proximaObrigacao.criticidade.toUpperCase();
                              if (crit === 'URGENTE') {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                                    URGENTE
                                  </span>
                                );
                              }
                              if (crit === 'ALTA') {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-50 text-red-700 border border-red-200">
                                    ALTA
                                  </span>
                                );
                              }
                              if (crit === 'MEDIA' || crit === 'MÉDIA') {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                    MÉDIA
                                  </span>
                                );
                              }
                              if (crit === 'BAIXA') {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                    BAIXA
                                  </span>
                                );
                              }
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                  {proximaObrigacao.criticidade}
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-slate-400 font-medium">-</span>
                          )}
                        </td>

                        {/* Coluna 8: Responsável */}
                        <td className="hidden xl:table-cell py-3.5 px-3 xl:px-4">
                          {proximaObrigacao ? (
                            respNome ? (
                              <span
                                className="font-medium text-slate-800 text-[11px] block truncate max-w-[130px]"
                                title={respNome}
                              >
                                {respNome}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">
                                Não atribuído
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400 font-medium">-</span>
                          )}
                        </td>

                        {/* Coluna 9: Status */}
                        <td className="py-3.5 px-3 xl:px-4">
                          <ProcessStatusBadge status={proc.status_atual} size="sm" />
                          <span className="block mt-1 text-[9px] text-slate-400 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity whitespace-nowrap">
                            Clique para abrir
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal de Criação / Edição de Processo */}
      <ProcessModal
        isOpen={isProcessModalOpen}
        mode={processModalMode}
        process={selectedProcess}
        companies={companies}
        onClose={() => {
          setIsProcessModalOpen(false);
          setSelectedProcess(null);
        }}
        onSave={handleSaveProcess}
      />

      {/* Modal de Detalhes Completos do Processo */}
      <ProcessDetailsModal
        isOpen={isDetailsOpen}
        process={processForDetails}
        canEdit={canEdit}
        canDelete={canDelete}
        onClose={() => {
          setIsDetailsOpen(false);
          setProcessForDetails(null);
        }}
        onEdit={(proc) => {
          setIsDetailsOpen(false);
          handleOpenEdit(proc);
        }}
        onChangeStatus={(proc) => {
          handleOpenStatusModal(proc);
        }}
        onToggleArchive={(proc) => {
          handleToggleArchive(proc);
        }}
        onDelete={(proc) => {
          setIsDetailsOpen(false);
          handleOpenDeleteModal(proc);
        }}
      />

      {/* Modal de Alteração Ágil de Status */}
      <ProcessStatusModal
        isOpen={isStatusModalOpen}
        process={processForStatus}
        onClose={() => {
          setIsStatusModalOpen(false);
          setProcessForStatus(null);
        }}
        onUpdateStatus={handleUpdateStatus}
      />

      {/* Modal de Exclusão com Checagem de Integridade Referencial */}
      <ProcessDeleteModal
        isOpen={isDeleteModalOpen}
        process={processToDelete}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setProcessToDelete(null);
        }}
        onConfirmDelete={handleConfirmDelete}
        onArchiveAlternative={handleArchiveAlternative}
        onCancelAlternative={handleCancelAlternative}
      />

      {/* Modal de Cadastro de Empresa e Vínculo */}
      <CompanyModal
        isOpen={isCompanyModalOpen}
        mode="create"
        initialNome={companyModalInitialNome}
        initialCnpj={companyModalInitialCnpj}
        onClose={() => {
          setIsCompanyModalOpen(false);
          setCompanyModalProcess(null);
        }}
        onSave={handleSaveCompanyAndLink}
      />
    </div>
  );
};
