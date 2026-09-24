import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock,
  Filter,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Search,
  RefreshCw,
  Edit3,
  CheckSquare,
  XCircle,
  Building2,
  Calendar,
  DollarSign,
  User,
  Scale,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Obligation, Company, Process } from '../../types/database';
import {
  obligationsService,
  GetAllObligationsParams,
  ObligationsSummaryStats,
  DeadlineFilterTab,
} from '../../services/obligationsService';
import { companiesService } from '../../services/companiesService';
import { authService } from '../../services/authService';
import { formatDateTime, formatDate, getDeadlineStatus } from '../../utils/date';
import { formatCurrencyBRL } from '../../utils/currency';
import { formatProcessNumber } from '../../utils/cnj';
import { ObligationModal } from '../../components/processes/ObligationModal';
import { ProcessDetailsModal } from '../../components/processes/ProcessDetailsModal';
import { ActionDialog } from '../../components/common/ActionDialog';
import { RecordActionModal } from '../../components/common/RecordActionModal';

export const DeadlinesPage: React.FC = () => {
  const { profile } = useAuth();
  const userRole = profile?.role;
  const canEdit = userRole === 'ADMIN' || userRole === 'GESTOR' || userRole === 'ANALISTA';
  const canDelete = userRole === 'ADMIN' || userRole === 'GESTOR';

  // Estados de dados
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [stats, setStats] = useState<ObligationsSummaryStats>({
    pendentes: 0,
    vencendo48h: 0,
    vencidos: 0,
    cumpridos: 0,
    total: 0,
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; display_name: string | null; email: string }>>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Filtros
  const [filterTab, setFilterTab] = useState<DeadlineFilterTab>('OPEN');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [companyFilter, setCompanyFilter] = useState<string>('ALL');
  const [criticalityFilter, setCriticalityFilter] = useState<string>('ALL');
  const [responsavelFilter, setResponsavelFilter] = useState<string>('ALL');

  // Modais de Edição de Obrigação e Detalhes de Processo
  const [isObligationModalOpen, setIsObligationModalOpen] = useState<boolean>(false);
  const [selectedObligation, setSelectedObligation] = useState<Obligation | null>(null);
  const [selectedProcessIdForModal, setSelectedProcessIdForModal] = useState<string>('');

  const [isProcessDetailsOpen, setIsProcessDetailsOpen] = useState<boolean>(false);
  const [processForDetails, setProcessForDetails] = useState<Process | null>(null);

  const [actionDialog, setActionDialog] = useState<{
    kind: 'COMPLETE' | 'CANCEL';
    obligation: Obligation;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [deadlineAction, setDeadlineAction] = useState<Obligation | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Carrega empresas e usuários para filtros
  useEffect(() => {
    async function loadAuxiliaryData() {
      const [compRes, usersRes] = await Promise.all([
        companiesService.getCompanies(),
        authService.getActiveProfiles(),
      ]);
      if (compRes.data) setCompanies(compRes.data);
      if (usersRes.profiles) setUsers(usersRes.profiles);
    }
    loadAuxiliaryData();
  }, []);

  // Busca prazos com filtros
  const fetchObligations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params: GetAllObligationsParams = {
      filterTab,
      search: searchQuery,
      companyId: companyFilter !== 'ALL' ? companyFilter : undefined,
      criticality: criticalityFilter !== 'ALL' ? criticalityFilter : undefined,
      responsavelId: responsavelFilter !== 'ALL' ? responsavelFilter : undefined,
    };

    const res = await obligationsService.getAllObligations(params);

    if (res.error) {
      setError(res.error);
      setObligations([]);
    } else {
      setObligations(res.data);
      setStats(res.stats);
    }

    setIsLoading(false);
  }, [filterTab, searchQuery, companyFilter, criticalityFilter, responsavelFilter]);

  useEffect(() => {
    fetchObligations();
  }, [fetchObligations]);

  // Temporizador para dispensar notificações de sucesso
  useEffect(() => {
    if (successNotice) {
      const timer = setTimeout(() => setSuccessNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successNotice]);

  // Ações de Obrigação
  const handleOpenEditObligation = (ob: Obligation) => {
    setSelectedObligation(ob);
    setSelectedProcessIdForModal(ob.process_id);
    setIsObligationModalOpen(true);
  };

  const handleCloseObligationModal = (changed?: boolean) => {
    setIsObligationModalOpen(false);
    setSelectedObligation(null);
    setSelectedProcessIdForModal('');
    if (changed) {
      setSuccessNotice('Obrigação atualizada com sucesso!');
      fetchObligations();
    }
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

    const { obligation, kind } = actionDialog;
    const result = kind === 'COMPLETE'
      ? await obligationsService.completeObligation(obligation.id, obligation)
      : await obligationsService.cancelObligation(obligation.id, String(value || '').trim(), obligation);

    setActionBusy(false);
    if (!result.success) {
      setActionError(result.error || 'Falha ao atualizar obrigação.');
      return;
    }

    setSuccessNotice(kind === 'COMPLETE'
      ? 'Obrigação marcada como cumprida!'
      : 'Obrigação cancelada com sucesso!');
    setActionDialog(null);
    await fetchObligations();
  };

  const handleOpenProcessDetails = (proc: Process) => {
    setProcessForDetails(proc);
    setIsProcessDetailsOpen(true);
  };

  // Helper para renderizar badge de criticidade
  const renderCriticalityBadge = (crit?: string | null) => {
    const c = (crit || 'MEDIA').toUpperCase();
    if (c === 'ALTA' || c === 'URGENTE') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-800 border border-red-200">
          Alta
        </span>
      );
    }
    if (c === 'BAIXA') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
          Baixa
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
        Média
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-red-600">
            Operação
          </span>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#0F172A]">
            Controle de Prazos e Obrigações
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Acompanhamento centralizado de providências, audiências, recursos, pagamentos e deveres jurídicos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchObligations()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
            title="Recarregar Fila de Prazos"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Notificação de Sucesso */}
      {successNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Notificação de Erro */}
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-900 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Cards de Resumo Operacional com Ação de Filtro Rápido */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Pendentes */}
        <button
          type="button"
          onClick={() => setFilterTab('OPEN')}
          className={`p-5 rounded-xl border text-left transition cursor-pointer ${
            filterTab === 'OPEN'
              ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20 shadow-xs'
              : 'bg-white border-slate-200/80 hover:bg-slate-50/80 shadow-xs'
          }`}
        >
          <span className="text-xs font-semibold text-slate-500 uppercase">Prazos Pendentes</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#0F172A]">{stats.pendentes}</span>
            <span className="text-xs text-slate-400">em aberto</span>
          </div>
        </button>

        {/* Card 2: Vencendo em 48h */}
        <button
          type="button"
          onClick={() => setFilterTab('NEXT_48H')}
          className={`p-5 rounded-xl border text-left transition cursor-pointer ${
            filterTab === 'NEXT_48H'
              ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-500/20 shadow-xs'
              : 'bg-white border-slate-200/80 hover:bg-slate-50/80 shadow-xs'
          }`}
        >
          <span className="text-xs font-semibold text-amber-700 uppercase">Vencendo em 48h</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600">{stats.vencendo48h}</span>
            <span className="text-xs text-amber-600/70">urgentes</span>
          </div>
        </button>

        {/* Card 3: Vencidos */}
        <button
          type="button"
          onClick={() => setFilterTab('OVERDUE')}
          className={`p-5 rounded-xl border text-left transition cursor-pointer ${
            filterTab === 'OVERDUE'
              ? 'bg-red-50/70 border-red-300 ring-2 ring-red-500/20 shadow-xs'
              : 'bg-white border-slate-200/80 hover:bg-slate-50/80 shadow-xs'
          }`}
        >
          <span className="text-xs font-semibold text-red-600 uppercase">Prazos Vencidos</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-red-600">{stats.vencidos}</span>
            <span className="text-xs text-red-500">requerem atenção</span>
          </div>
        </button>

        {/* Card 4: Cumpridos */}
        <button
          type="button"
          onClick={() => setFilterTab('COMPLETED')}
          className={`p-5 rounded-xl border text-left transition cursor-pointer ${
            filterTab === 'COMPLETED'
              ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs'
              : 'bg-white border-slate-200/80 hover:bg-slate-50/80 shadow-xs'
          }`}
        >
          <span className="text-xs font-semibold text-emerald-700 uppercase">Cumpridos</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700">{stats.cumpridos}</span>
            <span className="text-xs text-slate-400">concluídos</span>
          </div>
        </button>
      </div>

      {/* Painel de Filtros e Busca */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Busca Textual */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por prazo, CNJ, comarca..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition"
            />
          </div>

          {/* Filtro de Empresa */}
          <div>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="ALL">Todas as Empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro de Criticidade */}
          <div>
            <select
              value={criticalityFilter}
              onChange={(e) => setCriticalityFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="ALL">Todas as Criticidades</option>
              <option value="ALTA">Alta / Urgente</option>
              <option value="MEDIA">Média</option>
              <option value="BAIXA">Baixa</option>
            </select>
          </div>

          {/* Filtro de Responsável */}
          <div>
            <select
              value={responsavelFilter}
              onChange={(e) => setResponsavelFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="ALL">Todos os Responsáveis</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name || u.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Abas Rápidas de Status da Fila */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 overflow-x-auto text-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
            Status:
          </span>
          <button
            type="button"
            onClick={() => setFilterTab('OPEN')}
            className={`px-3 py-1 rounded-full font-semibold transition cursor-pointer whitespace-nowrap ${
              filterTab === 'OPEN'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Abertos ({stats.pendentes})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('NEXT_48H')}
            className={`px-3 py-1 rounded-full font-semibold transition cursor-pointer whitespace-nowrap ${
              filterTab === 'NEXT_48H'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60'
            }`}
          >
            Próximos 48h ({stats.vencendo48h})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('OVERDUE')}
            className={`px-3 py-1 rounded-full font-semibold transition cursor-pointer whitespace-nowrap ${
              filterTab === 'OVERDUE'
                ? 'bg-red-600 text-white'
                : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200/60'
            }`}
          >
            Vencidos ({stats.vencidos})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('COMPLETED')}
            className={`px-3 py-1 rounded-full font-semibold transition cursor-pointer whitespace-nowrap ${
              filterTab === 'COMPLETED'
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
            }`}
          >
            Cumpridos ({stats.cumpridos})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-1 rounded-full font-semibold transition cursor-pointer whitespace-nowrap ${
              filterTab === 'ALL'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({stats.total})
          </button>
        </div>
      </div>

      {/* Tabela Real de Prazos e Obrigações */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Fila Operacional de Obrigações
            </h3>
            <span className="text-xs text-slate-400">
              {obligations.length} registro(s) encontrado(s)
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-16 text-center">
            <Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-500">Carregando fila de prazos do Supabase...</p>
          </div>
        ) : obligations.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <CalendarClock className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-[#0F172A]">Nenhum prazo encontrado</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Nenhuma obrigação corresponde aos filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table id="deadlines-table" className="w-full table-fixed 2xl:table-auto text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 xl:px-4 w-[18%] min-w-[138px]">Data Limite / Status</th>
                  <th className="py-3 px-3 xl:px-4 w-[34%] min-w-[220px]">Obrigação / Descrição</th>
                  <th className="hidden md:table-cell py-3 px-3 xl:px-4 w-[25%] min-w-[180px]">Processo Relacionado</th>
                  <th className="hidden xl:table-cell py-3 px-3 xl:px-4 min-w-[130px]">Empresa</th>
                  <th className="hidden lg:table-cell py-3 px-3 xl:px-4 w-[12%] min-w-[86px]">Criticidade</th>
                  <th className="hidden 2xl:table-cell py-3 px-3 xl:px-4 min-w-[120px]">Responsável</th>
                  <th className="hidden xl:table-cell py-3 px-3 xl:px-4 min-w-[105px]">Multa Diária</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {obligations.map((ob) => {
                  const deadlineInfo = getDeadlineStatus(ob.prazo, ob.status);
                  const isClosed = ['CUMPRIDA', 'CONCLUIDA', 'CANCELADA'].includes((ob.status || '').toUpperCase());
                  const respName = ob.responsavel?.display_name || ob.responsavel?.email || 'Não atribuído';

                  return (
                    <tr
                      key={ob.id}
                      tabIndex={0}
                      role="button"
                      onClick={(e) => { if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return; setDeadlineAction(ob); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDeadlineAction(ob); } }}
                      className="cursor-pointer hover:bg-slate-50/70 focus:bg-slate-50 transition-colors group outline-none"
                    >
                      {/* Coluna 1: Data Limite & Status Operacional */}
                      <td className="py-3.5 px-3 xl:px-4">
                        <div className="space-y-1">
                          {ob.prazo ? (
                            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-slate-900">
                              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{formatDateTime(ob.prazo)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">A definir</span>
                          )}
                          <div>
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide border font-bold ${deadlineInfo.badgeClass}`}
                            >
                              {deadlineInfo.label}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Coluna 2: Obrigação e Detalhes */}
                      <td className="py-3.5 px-3 xl:px-4">
                        <div className="max-w-[320px]">
                          <span
                            className={`font-semibold text-slate-800 text-xs block leading-snug ${
                              isClosed ? 'line-through text-slate-400' : ''
                            }`}
                          >
                            {ob.descricao}
                          </span>

                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                            {ob.tipo_prazo && (
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                                {ob.tipo_prazo}
                              </span>
                            )}
                            {ob.evento_gerador && (
                              <span className="text-slate-400 truncate max-w-[200px]" title={ob.evento_gerador}>
                                • {ob.evento_gerador}
                              </span>
                            )}
                          </div>

                          {ob.observacoes && (
                            <p className="text-[10px] text-slate-400 italic mt-0.5 line-clamp-1" title={ob.observacoes}>
                              {ob.observacoes}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Coluna 3: Processo Relacionado */}
                      <td className="hidden md:table-cell py-3.5 px-3 xl:px-4">
                        {ob.process ? (
                          <div>
                            <button
                              type="button"
                              onClick={() => ob.process && handleOpenProcessDetails(ob.process)}
                              className="font-mono font-bold text-slate-900 hover:text-red-600 transition text-xs flex items-center gap-1 group/proc cursor-pointer text-left"
                            >
                              <span>{formatProcessNumber(ob.process.numero_processo) || 'Processo sem número'}</span>
                              <FolderOpen className="w-3 h-3 text-slate-400 group-hover/proc:text-red-600 shrink-0" />
                            </button>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {ob.process.comarca && <span>{ob.process.comarca}</span>}
                              {ob.process.tipo_demanda && <span> • {ob.process.tipo_demanda}</span>}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Processo não carregado</span>
                        )}
                      </td>

                      {/* Coluna 4: Empresa */}
                      <td className="hidden xl:table-cell py-3.5 px-3 xl:px-4">
                        {ob.process?.company ? (
                          <div>
                            <span className="font-semibold text-slate-800 block text-xs">
                              {ob.process.company.nome}
                            </span>
                            {ob.process.company.cnpj && (
                              <span className="font-mono text-[10px] text-slate-400">
                                {ob.process.company.cnpj}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Empresa não vinculada</span>
                        )}
                      </td>

                      {/* Coluna 5: Criticidade */}
                      <td className="hidden lg:table-cell py-3.5 px-3 xl:px-4">{renderCriticalityBadge(ob.criticidade)}</td>

                      {/* Coluna 6: Responsável */}
                      <td className="hidden 2xl:table-cell py-3.5 px-3 xl:px-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700">
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[120px]" title={respName}>
                            {respName}
                          </span>
                        </div>
                      </td>

                      {/* Coluna 7: Multa Diária */}
                      <td className="hidden xl:table-cell py-3.5 px-3 xl:px-4">
                        {ob.valor_multa_diaria && ob.valor_multa_diaria > 0 ? (
                          <div className="text-xs">
                            <span className="font-mono font-bold text-red-600 block">{formatCurrencyBRL(ob.valor_multa_diaria)}/dia</span>
                            {ob.valor_multa_limite && ob.valor_multa_limite > 0 && (
                              <span className="font-mono text-[10px] text-slate-500 block mt-0.5">teto {formatCurrencyBRL(ob.valor_multa_limite)}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ActionDialog
        isOpen={Boolean(actionDialog)}
        title={actionDialog?.kind === 'COMPLETE' ? 'Confirmar cumprimento' : 'Cancelar obrigação'}
        message={actionDialog
          ? `${actionDialog.kind === 'COMPLETE' ? 'Marcar como cumprida' : 'Cancelar'}: "${actionDialog.obligation.descricao}"?`
          : ''}
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

      <RecordActionModal
        isOpen={Boolean(deadlineAction)}
        title={deadlineAction?.descricao || 'Obrigação / Prazo'}
        subtitle={deadlineAction?.process?.numero_processo ? `Processo ${formatProcessNumber(deadlineAction.process.numero_processo)}` : 'Obrigação operacional'}
        onClose={() => setDeadlineAction(null)}
        actions={deadlineAction ? <>
          {deadlineAction.process && <button type="button" onClick={() => { handleOpenProcessDetails(deadlineAction.process as Process); setDeadlineAction(null); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Abrir processo</button>}
          {canEdit && <button type="button" onClick={() => { handleOpenEditObligation(deadlineAction); setDeadlineAction(null); }} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">Editar</button>}
          {canEdit && !['CUMPRIDA','CONCLUIDA','CANCELADA'].includes((deadlineAction.status || '').toUpperCase()) && <button type="button" onClick={() => { handleComplete(deadlineAction); setDeadlineAction(null); }} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Marcar cumprida</button>}
          {canEdit && !['CUMPRIDA','CONCLUIDA','CANCELADA'].includes((deadlineAction.status || '').toUpperCase()) && <button type="button" onClick={() => { handleCancel(deadlineAction); setDeadlineAction(null); }} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">Cancelar</button>}
        </> : null}
      >
        {deadlineAction && <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><div className="text-[11px] font-semibold uppercase text-slate-400">Prazo</div><div className="mt-1 font-semibold">{deadlineAction.prazo ? formatDateTime(deadlineAction.prazo) : 'A definir'}</div></div>
          <div><div className="text-[11px] font-semibold uppercase text-slate-400">Criticidade</div><div className="mt-1">{deadlineAction.criticidade || 'MÉDIA'}</div></div>
          <div><div className="text-[11px] font-semibold uppercase text-slate-400">Responsável</div><div className="mt-1">{deadlineAction.responsavel?.display_name || deadlineAction.responsavel?.email || 'Não atribuído'}</div></div>
          <div><div className="text-[11px] font-semibold uppercase text-slate-400">Status</div><div className="mt-1">{deadlineAction.status || 'PENDENTE'}</div></div>
          <div className="sm:col-span-2"><div className="text-[11px] font-semibold uppercase text-slate-400">Multa</div><div className="mt-1">{deadlineAction.valor_multa_diaria ? `${formatCurrencyBRL(deadlineAction.valor_multa_diaria)}/dia${deadlineAction.valor_multa_limite ? ` · teto ${formatCurrencyBRL(deadlineAction.valor_multa_limite)}` : ''}` : 'Sem multa diária cadastrada'}</div></div>
        </div>}
      </RecordActionModal>

      {/* Modal de Edição de Obrigação */}
      {selectedObligation && (
  


      <ObligationModal
          isOpen={isObligationModalOpen}
          processId={selectedProcessIdForModal}
          obligation={selectedObligation}
          onClose={handleCloseObligationModal}
        />
      )}

      {/* Modal de Detalhes Completos do Processo */}
      {processForDetails && (
        <ProcessDetailsModal
          isOpen={isProcessDetailsOpen}
          process={processForDetails}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={() => {
            setIsProcessDetailsOpen(false);
            setProcessForDetails(null);
          }}
          onEdit={() => {}}
          onChangeStatus={() => {}}
          onToggleArchive={() => {}}
          onDelete={() => {}}
        />
      )}
    </div>
  );
};
