import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { technicalDiagnosticService } from '../../services/technicalDiagnosticService';
import {
  TechnicalDiagnosticReport,
  ExecutiveIndicator,
  DiagnosticStatus,
} from '../../types/technicalDiagnostic';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Database,
  Lock,
  Cpu,
  Layers,
  Search,
  Check,
  Clock,
  Server,
  Users,
} from 'lucide-react';

export const TechnicalDiagnosticPage: React.FC = () => {
  const { profile } = useAuth();
  const [report, setReport] = useState<TechnicalDiagnosticReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'indicators' | 'schema' | 'locks' | 'ai' | 'integrity' | 'json'>('indicators');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CRITICO' | 'ALERTA' | 'OK'>('ALL');
  const [jsonSearchQuery, setJsonSearchQuery] = useState<string>('');

  const isAdmin = String(profile?.role || '').toUpperCase() === 'ADMIN';

  const fetchDiagnostic = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await technicalDiagnosticService.getDiagnostic();
      setReport(data);
    } catch (err: any) {
      console.error('[DIAGNOSTICO] Falha na consulta:', err);
      setError(err?.message || 'Falha ao executar diagnóstico operacional.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      void fetchDiagnostic();
    }
  }, [isAdmin, fetchDiagnostic]);

  const handleCopyJson = useCallback(() => {
    if (!report) return;
    const jsonStr = JSON.stringify(report, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch((err) => {
      console.error('Falha ao copiar:', err);
    });
  }, [report]);

  const handleExportJson = useCallback(() => {
    if (!report) return;
    const jsonStr = JSON.stringify(report, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date(report.auditAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostico-tecnico-sb-gestao-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [report]);

  const filteredIndicators = useMemo(() => {
    if (!report) return [];
    if (statusFilter === 'ALL') return report.executiveIndicators;
    return report.executiveIndicators.filter((item) => item.status === statusFilter);
  }, [report, statusFilter]);

  if (!isAdmin) {
    return (
      <div id="diagnostic-unauthorized" className="p-8 max-w-4xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-4 shadow-sm">
          <ShieldAlert className="h-8 w-8 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-bold text-amber-900">Acesso Restrito ao Perfil ADMIN</h2>
            <p className="mt-1 text-sm text-amber-800">
              O módulo de <strong>Diagnóstico Técnico</strong> realiza auditoria estrutural e operacional do sistema e é
              estritamente restrito a administradores.
            </p>
            <p className="mt-2 text-xs text-amber-700">
              Seu perfil atual registrado no sistema: <span className="font-semibold">{profile?.role || 'NÃO DEFINIDO'}</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: DiagnosticStatus) => {
    switch (status) {
      case 'OK':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            OK
          </span>
        );
      case 'ALERTA':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            ALERTA
          </span>
        );
      case 'CRITICO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertOctagon className="h-3.5 w-3.5" />
            CRÍTICO
          </span>
        );
      default:
        return null;
    }
  };

  const capacityLabel = (status: string) => ({
    DISPONIVEL: 'Disponível',
    QUOTA_PROVEDOR_ESGOTADA: 'Quota diária esgotada',
    LIMITE_DIARIO_LOCAL: 'Limite diário de segurança',
    LIMITE_TEMPORARIO: 'Limite temporário',
    CIRCUITO_ABERTO: 'Circuito aberto',
    INDISPONIVEL: 'Indisponível',
    FORA_DO_ROTEADOR: 'Fora do roteador',
  }[status] || status);

  const formattedDate = report
    ? new Date(report.auditAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  return (
    <div id="diagnostic-page" className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#E2E8F0] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold tracking-wider uppercase bg-slate-100 text-slate-700 border border-slate-200">
              <ShieldCheck className="h-3 w-3 text-emerald-600" />
              Módulo Administrativo • Read-Only
            </span>
            {report && (
              <span className="text-xs text-slate-500 font-mono">v{report.version}</span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#17233A] mt-1 flex items-center gap-2.5">
            <Activity className="h-7 w-7 text-[#E30613]" />
            Diagnóstico Técnico
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Auditoria operacional, integridade referencial e verificação estrutural do banco de dados.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="btn-refresh-diagnostic"
            type="button"
            onClick={fetchDiagnostic}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium bg-white text-[#17233A] border border-[#CBD5E1] hover:bg-[#F8FAFC] transition shadow-sm disabled:opacity-60"
            title="Atualizar auditoria agora"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-[#E30613]' : 'text-slate-600'}`} />
            {loading ? 'Executando Auditoria...' : 'Atualizar'}
          </button>

          <button
            id="btn-copy-diagnostic-json"
            type="button"
            onClick={handleCopyJson}
            disabled={!report || loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium bg-white text-[#17233A] border border-[#CBD5E1] hover:bg-[#F8FAFC] transition shadow-sm disabled:opacity-60"
            title="Copiar relatório JSON para a área de transferência"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-slate-600" />
                <span>Copiar JSON</span>
              </>
            )}
          </button>

          <button
            id="btn-export-diagnostic-json"
            type="button"
            onClick={handleExportJson}
            disabled={!report || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#E30613] text-white hover:bg-[#D90416] transition shadow-sm disabled:opacity-60"
            title="Baixar arquivo JSON com o diagnóstico completo"
          >
            <Download className="h-4 w-4" />
            <span>Exportar JSON</span>
          </button>
        </div>
      </div>

      {/* Timestamp and execution time notice */}
      {report && (
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>
              Auditoria executada em: <strong className="text-slate-700">{formattedDate}</strong>
            </span>
            <span className="text-slate-300">•</span>
            <span>
              Tempo de execução da consulta: <strong className="text-slate-700">{report.durationMs}ms</strong>
            </span>
          </div>
          <div className="text-[11px] font-medium text-slate-500">
            Consultas exclusivamente <span className="text-slate-700 font-semibold">read-only</span>. Nenhuma alteração no banco.
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 flex items-start gap-3 shadow-sm">
          <AlertOctagon className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-rose-900">Falha na execução do diagnóstico técnico</h3>
            <p className="mt-1 text-sm text-rose-700">{error}</p>
            <button
              onClick={fetchDiagnostic}
              className="mt-3 text-xs font-semibold text-rose-800 underline hover:text-rose-950"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Global Status Banner */}
      {report && (
        <div
          id="diagnostic-global-banner"
          className={`rounded-xl p-5 border shadow-sm transition-all ${
            report.summary.globalStatus === 'OK'
              ? 'bg-emerald-50/70 border-emerald-200'
              : report.summary.globalStatus === 'ALERTA'
              ? 'bg-amber-50/70 border-amber-200'
              : 'bg-rose-50/70 border-rose-200'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div
                className={`p-2.5 rounded-lg shrink-0 ${
                  report.summary.globalStatus === 'OK'
                    ? 'bg-emerald-100 text-emerald-700'
                    : report.summary.globalStatus === 'ALERTA'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {report.summary.globalStatus === 'OK' && <CheckCircle2 className="h-6 w-6" />}
                {report.summary.globalStatus === 'ALERTA' && <AlertTriangle className="h-6 w-6" />}
                {report.summary.globalStatus === 'CRITICO' && <AlertOctagon className="h-6 w-6" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">
                    Status Consolidado:
                  </h2>
                  {getStatusBadge(report.summary.globalStatus)}
                </div>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                  {report.summary.globalStatus === 'OK' &&
                    'Todas as verificações operacionais e estruturais estão em perfeita conformidade.'}
                  {report.summary.globalStatus === 'ALERTA' &&
                    'Sistema operacional com itens que requerem acompanhamento ou tratamento rotineiro.'}
                  {report.summary.globalStatus === 'CRITICO' &&
                    'Foram detectadas anomalias críticas que demandam atenção imediata dos administradores.'}
                </p>
              </div>
            </div>

            {/* Quick Count Badges */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-center shadow-xs">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Conformes</div>
                <div className="text-sm font-bold text-emerald-600">{report.summary.counts.ok} OK</div>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-center shadow-xs">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Alertas</div>
                <div className="text-sm font-bold text-amber-600">{report.summary.counts.alerta} ALERTA</div>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-center shadow-xs">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Críticos</div>
                <div className="text-sm font-bold text-rose-600">{report.summary.counts.critico} CRÍTICO</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Row */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Indicadores Avaliados</span>
              <Activity className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-[#17233A] mt-2">
              {report.summary.totalIndicators}
            </div>
            <div className="text-xs text-slate-500 mt-1">100% inspecionados em tempo real</div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Tabelas & Views</span>
              <Database className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-[#17233A] mt-2">
              {report.schemaIntegrity.presentCount} / {report.schemaIntegrity.totalChecked}
            </div>
            <div className="text-xs text-emerald-600 font-medium mt-1">
              {report.schemaIntegrity.missingCount === 0 ? 'Nenhuma tabela ausente' : `${report.schemaIntegrity.missingCount} tabela(s) ausente(s)`}
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Locks Distribuídos</span>
              <Lock className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-[#17233A] mt-2">
              {report.automationLocks.length} monitorados
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {report.automationLocks.filter((l) => l.status === 'ATIVO').length} ativos • {report.automationLocks.filter((l) => l.status === 'LIVRE').length} livres
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Contas IMAP Ativas</span>
              <Server className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-[#17233A] mt-2">
              {report.emailAccount.activeConfigsCount}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {report.emailAccount.configs[0]?.host || 'Sem host configurado'}
            </div>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="border-b border-[#E2E8F0]">
        <nav className="flex space-x-2 sm:space-x-4 overflow-x-auto pb-px" aria-label="Tabs">
          <button
            id="tab-btn-indicators"
            onClick={() => setActiveTab('indicators')}
            className={`whitespace-nowrap py-3 px-3 border-b-2 text-sm font-semibold transition ${
              activeTab === 'indicators'
                ? 'border-[#E30613] text-[#E30613]'
                : 'border-transparent text-[#64748B] hover:text-[#17233A] hover:border-slate-300'
            }`}
          >
            Indicadores Executivos
            {report && (
              <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-slate-100 text-slate-700">
                {report.executiveIndicators.length}
              </span>
            )}
          </button>

          <button
            id="tab-btn-schema"
            onClick={() => setActiveTab('schema')}
            className={`whitespace-nowrap py-3 px-3 border-b-2 text-sm font-semibold transition ${
              activeTab === 'schema'
                ? 'border-[#E30613] text-[#E30613]'
                : 'border-transparent text-[#64748B] hover:text-[#17233A] hover:border-slate-300'
            }`}
          >
            Tabelas & Views
            {report && (
              <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-slate-100 text-slate-700">
                {report.schemaIntegrity.totalChecked}
              </span>
            )}
          </button>

          <button
            id="tab-btn-locks"
            onClick={() => setActiveTab('locks')}
            className={`whitespace-nowrap py-3 px-3 border-b-2 text-sm font-semibold transition ${
              activeTab === 'locks'
                ? 'border-[#E30613] text-[#E30613]'
                : 'border-transparent text-[#64748B] hover:text-[#17233A] hover:border-slate-300'
            }`}
          >
            Locks de Automação
            {report && (
              <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-slate-100 text-slate-700">
                {report.automationLocks.length}
              </span>
            )}
          </button>

          <button
            id="tab-btn-ai"
            onClick={() => setActiveTab('ai')}
            className={`whitespace-nowrap py-3 px-3 border-b-2 text-sm font-semibold transition ${
              activeTab === 'ai'
                ? 'border-[#E30613] text-[#E30613]'
                : 'border-transparent text-[#64748B] hover:text-[#17233A] hover:border-slate-300'
            }`}
          >
            Saúde de IA & Filas
          </button>

          <button
            id="tab-btn-integrity"
            onClick={() => setActiveTab('integrity')}
            className={`whitespace-nowrap py-3 px-3 border-b-2 text-sm font-semibold transition ${
              activeTab === 'integrity'
                ? 'border-[#E30613] text-[#E30613]'
                : 'border-transparent text-[#64748B] hover:text-[#17233A] hover:border-slate-300'
            }`}
          >
            Integridade & Dados
          </button>

          <button
            id="tab-btn-json"
            onClick={() => setActiveTab('json')}
            className={`whitespace-nowrap py-3 px-3 border-b-2 text-sm font-semibold transition ${
              activeTab === 'json'
                ? 'border-[#E30613] text-[#E30613]'
                : 'border-transparent text-[#64748B] hover:text-[#17233A] hover:border-slate-300'
            }`}
          >
            JSON Estruturado
          </button>
        </nav>
      </div>

      {/* Tab 1: Executive Indicators */}
      {activeTab === 'indicators' && report && (
        <div className="space-y-4">
          {/* Status Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 mr-1">Filtrar status:</span>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todos ({report.summary.totalIndicators})
            </button>
            <button
              onClick={() => setStatusFilter('CRITICO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'CRITICO'
                  ? 'bg-rose-600 text-white'
                  : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
              }`}
            >
              Críticos ({report.summary.counts.critico})
            </button>
            <button
              onClick={() => setStatusFilter('ALERTA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'ALERTA'
                  ? 'bg-amber-600 text-white'
                  : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
              }`}
            >
              Alertas ({report.summary.counts.alerta})
            </button>
            <button
              onClick={() => setStatusFilter('OK')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'OK'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              Conformes ({report.summary.counts.ok})
            </button>
          </div>

          {/* Indicators List */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs divide-y divide-slate-100">
            {filteredIndicators.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                Nenhum indicador encontrado para o filtro selecionado.
              </div>
            ) : (
              filteredIndicators.map((indicator) => (
                <div key={indicator.id} className="p-4 sm:p-5 hover:bg-slate-50/60 transition">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {indicator.category}
                        </span>
                        <h4 className="text-base font-bold text-[#17233A]">{indicator.label}</h4>
                      </div>
                      <p className="text-sm text-slate-600">{indicator.description}</p>
                      {indicator.recommendation && (
                        <div className="mt-2 text-xs text-amber-800 bg-amber-50/80 border border-amber-200/80 px-3 py-1.5 rounded-md flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            <strong>Recomendação:</strong> {indicator.recommendation}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex sm:flex-col items-end sm:items-end justify-between sm:justify-start gap-2 shrink-0">
                      <div>{getStatusBadge(indicator.status)}</div>
                      <div className="text-right text-xs text-slate-500">
                        <div>
                          Valor: <strong className="text-slate-800">{String(indicator.value)}</strong>
                        </div>
                        <div className="text-[11px] text-slate-400">Esperado: {indicator.expected}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Tables & Views Schema */}
      {activeTab === 'schema' && report && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-lg text-xs sm:text-sm flex items-center justify-between">
            <span>
              Verificação estrutural em <strong>{report.schemaIntegrity.totalChecked}</strong> objetos (tabelas e views).
              Todas as checagens foram realizadas via consulta direta segura ao PostgREST.
            </span>
            <span className="font-bold text-blue-800 ml-2">
              {report.schemaIntegrity.presentCount} Presentes • {report.schemaIntegrity.missingCount} Ausentes
            </span>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold text-[#44546A] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Objeto</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Criticidade</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Detalhe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF1F5]">
                  {report.schemaIntegrity.items.map((item) => (
                    <tr key={item.name} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-[#17233A]">
                        {item.name}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[11px]">
                          {item.kind}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                            item.criticality === 'CRITICO'
                              ? 'bg-rose-100 text-rose-800'
                              : item.criticality === 'ALTO'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {item.criticality}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {item.status === 'OK' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                            <AlertOctagon className="h-3.5 w-3.5 text-rose-600" />
                            {item.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">
                        {item.error ? (
                          <span className="text-rose-600 font-mono text-[11px]">{item.error}</span>
                        ) : (
                          <span className="text-slate-400">Objeto operacional acessível</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Automation Locks */}
      {activeTab === 'locks' && report && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>Segurança Operacional:</strong> Esta auditoria apenas lê a tabela{' '}
              <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">automation_locks</code>. Nenhuma liberação forçada ou
              alteração de lock é efetuada automaticamente, garantindo a integridade dos processos em voo.
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold text-[#44546A] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Lock Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Severidade</th>
                    <th className="px-4 py-3">Proprietário (Token)</th>
                    <th className="px-4 py-3">Expiração (UTC)</th>
                    <th className="px-4 py-3">Diagnóstico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF1F5]">
                  {report.automationLocks.map((lock) => (
                    <tr key={lock.lockName} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-[#17233A]">
                        {lock.lockName}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                            lock.status === 'LIVRE'
                              ? 'bg-slate-100 text-slate-700'
                              : lock.status === 'ATIVO'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {lock.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {getStatusBadge(lock.severity)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {lock.ownerTokenMasked ? (
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">
                            {lock.ownerTokenMasked}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Livre (null)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {lock.lockedUntil ? (
                          new Date(lock.lockedUntil).toLocaleTimeString('pt-BR')
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {lock.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: AI Health & Queues */}
      {activeTab === 'ai' && report && (
        <div className="space-y-6">
          {/* AI Model Health */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#17233A] flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-[#E30613]" />
                  Capacidade, Quota e Circuit Breaker dos Modelos Gemini
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  Quota diária e circuit breaker são exibidos separadamente. Contadores representam consumo registrado pela aplicação.
                </p>
              </div>
              <span className="text-xs text-slate-500">Roteador + ai_model_health</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {report.aiModelHealth.map((model) => (
                <div key={model.model} className={`border rounded-lg p-4 space-y-3 ${model.routerEnabled ? 'border-slate-200 bg-slate-50/50' : 'border-slate-100 bg-slate-50/20 opacity-70'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-slate-900">{model.model}</span>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {model.routerEnabled ? 'Modelo ativo no roteador' : 'Registro histórico / fora da cadeia atual'}
                      </div>
                    </div>
                    {getStatusBadge(model.severity)}
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Capacidade atual</div>
                    <div className={`text-xs font-bold mt-0.5 ${model.capacityStatus === 'DISPONIVEL' ? 'text-emerald-700' : model.capacityStatus === 'FORA_DO_ROTEADOR' ? 'text-slate-500' : 'text-amber-700'}`}>
                      {capacityLabel(model.capacityStatus)}
                    </div>
                    {model.budgetReason && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{model.budgetReason}</div>}
                  </div>

                  {model.routerEnabled && (
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded bg-white border border-slate-200 p-2">
                        <div className="text-slate-400">Chamadas registradas</div>
                        <div className="font-bold text-slate-800">{model.requestsToday ?? 0} / {model.effectiveRpd ?? 0}</div>
                        <div className="text-[10px] text-slate-400">Limite provedor: {model.providerRpd ?? 0}</div>
                      </div>
                      <div className="rounded bg-white border border-slate-200 p-2">
                        <div className="text-slate-400">Tokens registrados</div>
                        <div className="font-bold text-slate-800">{Number(model.tokensToday || 0).toLocaleString('pt-BR')}</div>
                        <div className="text-[10px] text-slate-400">Dia de quota atual</div>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-slate-600 space-y-1">
                    <div>
                      Circuito: <strong className={model.circuitStatus === 'FECHADO' ? 'text-emerald-700' : model.circuitStatus === 'ABERTO' ? 'text-rose-700' : 'text-amber-700'}>{model.circuitStatus}</strong>
                    </div>
                    {model.circuitOpenUntil && (
                      <div className="text-slate-500 text-[11px]">Até: {new Date(model.circuitOpenUntil).toLocaleString('pt-BR')}</div>
                    )}
                    {model.quotaExhaustedAt && (
                      <div className="text-amber-700 text-[11px]">Quota marcada como esgotada em: {new Date(model.quotaExhaustedAt).toLocaleString('pt-BR')}</div>
                    )}
                    {model.nextResetAt && model.routerEnabled && (
                      <div className="text-slate-500 text-[11px]">Próximo reset estimado: {new Date(model.nextResetAt).toLocaleString('pt-BR')}</div>
                    )}
                    {model.lastSuccessAt && (
                      <div className="text-emerald-700 text-[11px]">Último sucesso: {new Date(model.lastSuccessAt).toLocaleString('pt-BR')}</div>
                    )}
                    {model.lastFailureAt && (
                      <div className="text-rose-700 text-[11px]">Última falha: {new Date(model.lastFailureAt).toLocaleString('pt-BR')}</div>
                    )}
                    {model.lastErrorCode && (
                      <div className="text-rose-700 font-mono text-[11px] bg-rose-50 p-1.5 rounded border border-rose-100">{model.lastErrorCode}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Queues Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-3">
              <h4 className="text-sm font-bold text-[#17233A] flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600" />
                Fila de Sugestões Gerenciais (ai_management_refresh_queue)
              </h4>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                  <div className="font-bold text-slate-800 text-lg">
                    {report.operationalMetrics.aiQueues.managementRefresh.PENDING || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase">Pendente</div>
                </div>
                <div className="p-2.5 rounded bg-blue-50 border border-blue-200">
                  <div className="font-bold text-blue-700 text-lg">
                    {report.operationalMetrics.aiQueues.managementRefresh.PROCESSING || 0}
                  </div>
                  <div className="text-[10px] text-blue-600 uppercase">Processando</div>
                </div>
                <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200">
                  <div className="font-bold text-emerald-700 text-lg">
                    {report.operationalMetrics.aiQueues.managementRefresh.DONE || 0}
                  </div>
                  <div className="text-[10px] text-emerald-600 uppercase">Concluído</div>
                </div>
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200">
                  <div className="font-bold text-rose-700 text-lg">
                    {report.operationalMetrics.aiQueues.managementRefresh.ERROR || 0}
                  </div>
                  <div className="text-[10px] text-rose-600 uppercase">Erro</div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-3">
              <h4 className="text-sm font-bold text-[#17233A] flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-600" />
                Fila de Classificação Retroativa (ai_demand_classification_backfill_queue)
              </h4>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                  <div className="font-bold text-slate-800 text-lg">
                    {report.operationalMetrics.aiQueues.demandBackfill.PENDING || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase">Pendente</div>
                </div>
                <div className="p-2.5 rounded bg-blue-50 border border-blue-200">
                  <div className="font-bold text-blue-700 text-lg">
                    {report.operationalMetrics.aiQueues.demandBackfill.PROCESSING || 0}
                  </div>
                  <div className="text-[10px] text-blue-600 uppercase">Processando</div>
                </div>
                <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200">
                  <div className="font-bold text-emerald-700 text-lg">
                    {report.operationalMetrics.aiQueues.demandBackfill.DONE || 0}
                  </div>
                  <div className="text-[10px] text-emerald-600 uppercase">Concluído</div>
                </div>
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200">
                  <div className="font-bold text-rose-700 text-lg">
                    {report.operationalMetrics.aiQueues.demandBackfill.ERROR || 0}
                  </div>
                  <div className="text-[10px] text-rose-600 uppercase">Erro</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Integrity & Data */}
      {activeTab === 'integrity' && report && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* CNJ Unicity */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Unicidade CNJ</span>
                {getStatusBadge(report.referentialIntegrity.duplicateCnjs.count === 0 ? 'OK' : 'CRITICO')}
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {report.referentialIntegrity.duplicateCnjs.count} duplicidade(s)
              </div>
              <p className="text-xs text-slate-500">
                Garante que nenhum processo jurídico possua registro clonado no banco.
              </p>
            </div>

            {/* Processes without company */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Processos Sem Empresa</span>
                {getStatusBadge(report.operationalMetrics.processesWithoutCompany === 0 ? 'OK' : 'ALERTA')}
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {report.operationalMetrics.processesWithoutCompany} de {report.operationalMetrics.processesTotal}
              </div>
              <p className="text-xs text-slate-500">
                Processos sem associação formal com a tabela de empresas cadastradas.
              </p>
            </div>

            {/* Processes without timeline */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Processos Sem Timeline</span>
                {getStatusBadge(report.referentialIntegrity.processesWithoutTimeline === 0 ? 'OK' : 'ALERTA')}
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {report.referentialIntegrity.processesWithoutTimeline} registros
              </div>
              <p className="text-xs text-slate-500">
                Processos legados importados sem evento inicial gerado na timeline.
              </p>
            </div>
          </div>

          {/* User profiles breakdown */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#17233A] flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-600" />
                Perfis e Usuários Registrados ({report.userProfiles.totalUsers} total)
              </h4>
              <span className="text-xs text-slate-500">Tabela user_profiles</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(report.userProfiles.byRole).map(([role, data]: [string, { total: number; active: number; inactive: number }]) => (
                <div key={role} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="text-xs font-bold text-slate-700">{role}</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{data.total}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {data.active} ativos • {data.inactive} inativos
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Structured JSON Viewer */}
      {activeTab === 'json' && report && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs space-y-0">
          <div className="bg-[#1E293B] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-white border-b border-slate-700">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-300">diagnostico-operacional-report.json</span>
              <span className="text-[10px] uppercase font-bold bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                Read-Only
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar no JSON..."
                  value={jsonSearchQuery}
                  onChange={(e) => setJsonSearchQuery(e.target.value)}
                  className="bg-slate-800 text-xs text-white pl-8 pr-3 py-1 rounded border border-slate-700 focus:outline-hidden focus:border-slate-500 w-48"
                />
              </div>

              <button
                type="button"
                onClick={handleCopyJson}
                className="inline-flex items-center gap-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1 rounded transition"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 text-xs font-medium bg-[#E30613] hover:bg-[#D90416] text-white px-2.5 py-1 rounded transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exportar</span>
              </button>
            </div>
          </div>

          <div className="p-4 bg-[#0F172A] overflow-x-auto max-h-[600px] overflow-y-auto">
            <pre className="font-mono text-xs text-emerald-400 leading-relaxed select-all">
              {JSON.stringify(report, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
