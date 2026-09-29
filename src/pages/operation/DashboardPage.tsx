import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cpu,
  FileWarning,
  Mail,
  RefreshCw,
  Printer,
  Scale,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { formatProcessNumber } from '../../utils/cnj';
import { formatCurrencyBRL } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';
import {
  DemandClassificationKpiPanel,
  RawProcessClassification,
  CompanyOption,
} from '../../components/dashboard/DemandClassificationKpiPanel';
import { OperationalSegmentKpiPanel } from '../../components/dashboard/OperationalSegmentKpiPanel';

type ExecutiveKpis = {
  processos_ativos: number;
  processos_vermelhos: number;
  processos_amarelos: number;
  aguardando_escritorio: number;
  aguardando_area_interna: number;
  obrigacoes_pendentes: number;
  prazos_criticos: number;
  alto_risco: number;
  valor_envolvido: number;
  exposicao_estimada: number;
  encerrados_mes: number;
  classificacao_pendente: number;
  pendencias_abertas: number;
  pendencias_vencidas: number;
  slas_escritorio_abertos: number;
  slas_escritorio_vencidos: number;
};

type RiskSummary = { categoria: 'VERMELHO' | 'AMARELO' | 'VERDE'; quantidade: number; ordem: number };
type ResponsibilitySummary = { responsabilidade: string; quantidade: number; ordem: number };
type PanelProcess = {
  id: string;
  numero_processo: string | null;
  objeto_demanda: string | null;
  tipo_demanda: string | null;
  comarca: string | null;
  uf: string | null;
  status_operacional: string;
  responsabilidade_atual: string;
  nivel_risco: string;
  proxima_acao: string | null;
  proxima_acao_prazo: string | null;
  updated_at: string;
  semaforo_operacional: 'VERDE' | 'AMARELO' | 'VERMELHO';
  alert_codes: string[] | null;
};

type EmailMetrics = {
  emails_captados_total: number;
  emails_captados_hoje: number;
  emails_captados_7d: number;
  emails_tratados: number;
  emails_pendentes_ia: number;
  emails_excecao: number;
  emails_irrelevantes: number;
};
type OperationalHealth = {
  emails_processados: number;
  emails_pendentes: number;
  excecoes_abertas: number;
  emails_irrelevantes: number;
  chamadas_ia_hoje: number;
};

const EMPTY_KPIS: ExecutiveKpis = {
  processos_ativos: 0,
  processos_vermelhos: 0,
  processos_amarelos: 0,
  aguardando_escritorio: 0,
  aguardando_area_interna: 0,
  obrigacoes_pendentes: 0,
  prazos_criticos: 0,
  alto_risco: 0,
  valor_envolvido: 0,
  exposicao_estimada: 0,
  encerrados_mes: 0,
  classificacao_pendente: 0,
  pendencias_abertas: 0,
  pendencias_vencidas: 0,
  slas_escritorio_abertos: 0,
  slas_escritorio_vencidos: 0,
};

const responsibilityLabel: Record<string, string> = {
  OPERADORA: 'Operadora',
  ESCRITORIO: 'Escritório',
  JUDICIARIO: 'Judiciário',
  TERCEIRO: 'Terceiro',
  SEM_RESPONSAVEL: 'Sem responsável',
};

const alertLabel: Record<string, string> = {
  RISCO_CRITICO: 'Risco crítico',
  RISCO_ALTO: 'Risco alto',
  OBRIGACAO_VENCIDA: 'Obrigação vencida',
  OBRIGACAO_PROXIMA: 'Obrigação próxima',
  PENDENCIA_VENCIDA: 'Pendência vencida',
  PENDENCIA_PROXIMA: 'Pendência próxima',
  PROXIMA_ACAO_VENCIDA: 'Próxima ação vencida',
  PROXIMA_ACAO_PROXIMA: 'Próxima ação próxima',
  SLA_ESCRITORIO_VENCIDO: 'SLA do escritório vencido',
  SLA_ESCRITORIO_PROXIMO: 'SLA do escritório próximo',
  FOLLOWUP_ESCRITORIO_DEVIDO: 'Follow-up devido',
  PARADO_OPERADORA: 'Parado com a Operadora',
  PARADO_ESCRITORIO: 'Parado com o Escritório',
  SEM_RESPONSAVEL: 'Sem responsável',
};

const statusLabel = (value?: string | null) => (value || 'NAO_CLASSIFICADO').replaceAll('_', ' ');

export const DashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<ExecutiveKpis | null>(null);
  const [riskSummary, setRiskSummary] = useState<RiskSummary[]>([]);
  const [responsibilitySummary, setResponsibilitySummary] = useState<ResponsibilitySummary[]>([]);
  const [priorityProcesses, setPriorityProcesses] = useState<PanelProcess[]>([]);
  const [recentProcesses, setRecentProcesses] = useState<PanelProcess[]>([]);
  const [health, setHealth] = useState<OperationalHealth | null>(null);
  const [emailMetrics, setEmailMetrics] = useState<EmailMetrics | null>(null);
  const [rawProcesses, setRawProcesses] = useState<RawProcessClassification[]>([]);
  const [companiesList, setCompaniesList] = useState<CompanyOption[]>([]);

  const fetchPanelData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        kpiRes,
        riskRes,
        responsibilityRes,
        priorityRes,
        recentRes,
        healthRes,
        emailMetricsRes,
        processesRes,
        companiesRes,
      ] = await Promise.all([
        supabase.from('v_panel_executive_kpis').select('*').maybeSingle(),
        supabase.from('v_panel_risk_summary').select('*').order('ordem'),
        supabase.from('v_panel_responsibility_summary').select('*').order('ordem'),
        supabase
          .from('v_panel_priority_processes')
          .select('*')
          .in('semaforo_operacional', ['VERMELHO', 'AMARELO'])
          .order('prioridade_ordem')
          .order('proximo_marco', { ascending: true, nullsFirst: false })
          .limit(6),
        supabase
          .from('v_panel_priority_processes')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase.from('v_panel_operational_health').select('*').maybeSingle(),
        supabase.from('v_panel_email_metrics').select('*').maybeSingle(),
        supabase
          .from('processes')
          .select('id, categoria_demanda, subcategoria_demanda, tipo_demanda, subtipo_demanda, status_operacional, status_atual, arquivado, company_id, nivel_risco, responsabilidade_atual, created_at')
          .eq('arquivado', false)
          .neq('status_operacional', 'ENCERRADO'),
        supabase
          .from('companies')
          .select('id, nome')
          .eq('active', true)
          .order('nome'),
      ]);

      const failures = [kpiRes, riskRes, responsibilityRes, priorityRes, recentRes, healthRes, emailMetricsRes]
        .map((result: any) => result.error)
        .filter(Boolean);

      if (failures.length) {
        console.error('[PAINEL 5E] falha ao consultar views', failures.map((item: any) => ({ code: item.code, message: item.message })));
        setError('Uma ou mais métricas do Painel não puderam ser carregadas. Dados indisponíveis não serão convertidos em zero.');
      }

      setKpis(kpiRes.error ? null : ((kpiRes.data as ExecutiveKpis | null) ?? EMPTY_KPIS));
      setRiskSummary(riskRes.error ? [] : ((riskRes.data as RiskSummary[]) || []));
      setResponsibilitySummary(responsibilityRes.error ? [] : ((responsibilityRes.data as ResponsibilitySummary[]) || []));
      setPriorityProcesses(priorityRes.error ? [] : ((priorityRes.data as PanelProcess[]) || []));
      setRecentProcesses(recentRes.error ? [] : ((recentRes.data as PanelProcess[]) || []));
      setHealth(healthRes.error ? null : (healthRes.data as OperationalHealth | null));
      setEmailMetrics(emailMetricsRes.error ? null : (emailMetricsRes.data as EmailMetrics | null));
      setRawProcesses((processesRes?.data as RawProcessClassification[]) || []);
      setCompaniesList((companiesRes?.data as CompanyOption[]) || []);
    } catch (err: any) {
      console.error('[PAINEL 5E] erro inesperado', err);
      setError(err?.message || 'Falha inesperada ao carregar o Painel Executivo.');
      setKpis(null);
      setRiskSummary([]);
      setResponsibilitySummary([]);
      setPriorityProcesses([]);
      setRecentProcesses([]);
      setHealth(null);
      setEmailMetrics(null);
      setRawProcesses([]);
      setCompaniesList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPanelData();
  }, []);

  const totalResponsibilities = useMemo(
    () => responsibilitySummary.reduce((sum, row) => sum + Number(row.quantidade || 0), 0),
    [responsibilitySummary],
  );

  const metric = (value: number | null | undefined) => loading ? '...' : value === null || value === undefined ? '—' : Number(value).toLocaleString('pt-BR');
  const money = (value: number | null | undefined) => loading ? '...' : value === null || value === undefined ? '—' : formatCurrencyBRL(Number(value));

  const cards = [
    { label: 'Processos Ativos', value: metric(kpis?.processos_ativos), detail: 'Carteira jurídica atual', icon: Scale, iconClass: 'bg-red-50 text-red-600', link: '/processos' },
    { label: 'Prazos Críticos', value: metric(kpis?.prazos_criticos), detail: 'Vencidos ou dentro da janela crítica', icon: Clock, iconClass: 'bg-amber-50 text-amber-600', link: '/prazos' },
    { label: 'Alto Risco', value: metric(kpis?.alto_risco), detail: 'Risco alto ou crítico', icon: ShieldAlert, iconClass: 'bg-rose-50 text-rose-600', link: '/processos' },
    { label: 'Obrigações Pendentes', value: metric(kpis?.obrigacoes_pendentes), detail: 'Ainda não cumpridas ou encerradas', icon: FileWarning, iconClass: 'bg-orange-50 text-orange-600', link: '/prazos' },
    { label: 'Exceções Abertas', value: metric(health?.excecoes_abertas), detail: 'Pendências que exigem revisão', icon: AlertCircle, iconClass: 'bg-red-50 text-red-600', link: '/admin/excecoes' },
    { label: 'Aguardando IA', value: metric(emailMetrics?.emails_pendentes_ia), detail: 'Backlog de processamento automático', icon: Cpu, iconClass: 'bg-violet-50 text-violet-700', link: '/admin/uso-ia' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-red-600">Painel Executivo</span>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#0F172A]">Visão Geral da Gestão Jurídica</h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">Risco, responsabilidade, prazos e saúde operacional da carteira jurídica.</p>
        </div>
        <div className="flex items-center gap-2 no-print self-start sm:self-auto">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>PDF / Imprimir</span>
          </button>
          <button
            type="button"
            onClick={fetchPanelData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-600' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!!kpis?.classificacao_pendente && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-900">Classificação gerencial pendente</p>
              <p className="text-xs text-amber-800 mt-0.5">{metric(kpis.classificacao_pendente)} processo(s) ainda têm status, risco ou responsabilidade não classificados.</p>
            </div>
          </div>
          <Link to="/processos" className="text-xs font-semibold text-amber-800 hover:underline whitespace-nowrap">Revisar processos →</Link>
        </div>
      )}

      <div className="executive-kpi-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(({ label, value, detail, icon: Icon, iconClass, link }) => (
          <Link key={label} to={link} className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-sm transition flex flex-col justify-between min-h-[126px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconClass}`}><Icon className="w-4 h-4" /></div>
            </div>
            <div className="my-3">
              <div className="text-3xl font-extrabold text-[#0F172A] break-words">{value}</div>
            </div>
            <div className="text-[11px] text-slate-500 border-t border-slate-100 pt-2.5 flex items-center justify-between gap-2">
              <span>{detail}</span><ArrowRight className="w-3 h-3 shrink-0" />
            </div>
          </Link>
        ))}
      </div>

      <div className="executive-secondary-grid grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-3"><span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Aguardando Escritório</span><div className="text-lg font-extrabold text-slate-900 mt-0.5">{metric(kpis?.aguardando_escritorio)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-3"><span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Aguardando Área Interna</span><div className="text-lg font-extrabold text-slate-900 mt-0.5">{metric(kpis?.aguardando_area_interna)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-3"><span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Valor Envolvido</span><div className="text-lg font-extrabold text-slate-900 mt-0.5">{money(kpis?.valor_envolvido)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-3"><span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Encerrados no Mês</span><div className="text-lg font-extrabold text-slate-900 mt-0.5">{metric(kpis?.encerrados_mes)}</div></div>
      </div>

      {/* ========================================================================= */}
      {/* INDICADORES OPERACIONAIS (E-MAILS, RISCO, RESPONSABILIDADE, ALERTAS)       */}
      {/* ========================================================================= */}
      <div className="executive-operational-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-[#0F172A] text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-blue-600" />Fluxo de E-mails</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Captura</span>
          </div>
          <div className="mt-4">
            <div className="rounded-xl bg-blue-50/70 border border-blue-100 p-4">
              <span className="text-[10px] uppercase tracking-wider font-bold text-blue-700">E-mails captados</span>
              <div className="text-3xl font-extrabold text-[#0F172A] mt-1">{metric(emailMetrics?.emails_captados_total)}</div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs"><div><span className="text-slate-500 block">Hoje</span><strong>{metric(emailMetrics?.emails_captados_hoje)}</strong></div><div><span className="text-slate-500 block">Últimos 7 dias</span><strong>{metric(emailMetrics?.emails_captados_7d)}</strong></div></div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
              <div className="rounded-lg bg-emerald-50 p-2.5"><span className="text-emerald-700 block">Tratados</span><strong className="text-base">{metric(emailMetrics?.emails_tratados)}</strong></div>
              <div className="rounded-lg bg-amber-50 p-2.5"><span className="text-amber-700 block">Pendentes IA</span><strong className="text-base">{metric(emailMetrics?.emails_pendentes_ia)}</strong></div>
              <div className="rounded-lg bg-red-50 p-2.5"><span className="text-red-700 block">E-mails em exceção</span><strong className="text-base">{metric(emailMetrics?.emails_excecao)}</strong></div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-[#0F172A] text-sm flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-red-600" />Risco Operacional</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Semáforo</span>
          </div>
          <div className="mt-4 space-y-3">
            {riskSummary.map((row) => {
              const style = row.categoria === 'VERMELHO'
                ? 'bg-red-50 border-red-100 text-red-800'
                : row.categoria === 'AMARELO'
                  ? 'bg-amber-50 border-amber-100 text-amber-800'
                  : 'bg-emerald-50 border-emerald-100 text-emerald-800';
              return <div key={row.categoria} className={`flex items-center justify-between p-3 rounded-lg border ${style}`}><span className="text-xs font-semibold">{row.categoria === 'VERMELHO' ? 'Crítico / atrasado' : row.categoria === 'AMARELO' ? 'Atenção' : 'Sem alerta operacional'}</span><span className="text-lg font-extrabold">{metric(row.quantidade)}</span></div>;
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100 text-xs">
            <div className="rounded-lg bg-slate-50 p-3"><span className="text-slate-500 block">Pendências vencidas</span><strong className="text-lg text-slate-900">{metric(kpis?.pendencias_vencidas)}</strong></div>
            <div className="rounded-lg bg-slate-50 p-3"><span className="text-slate-500 block">SLAs vencidos</span><strong className="text-lg text-slate-900">{metric(kpis?.slas_escritorio_vencidos)}</strong></div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-[#0F172A] text-sm flex items-center gap-2"><Users className="w-4 h-4 text-blue-600" />Quem está com a bola?</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ativos</span>
          </div>
          <div className="mt-4 space-y-3">
            {responsibilitySummary.map((row) => {
              const percentage = totalResponsibilities > 0 ? Math.round((Number(row.quantidade) / totalResponsibilities) * 100) : 0;
              return (
                <div key={row.responsabilidade}>
                  <div className="flex items-center justify-between text-xs mb-1.5"><span className="font-medium text-slate-700">{responsibilityLabel[row.responsabilidade] || statusLabel(row.responsabilidade)}</span><span className="font-bold text-slate-900">{metric(row.quantidade)} <span className="text-[10px] text-slate-400 font-medium">({percentage}%)</span></span></div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-slate-400 rounded-full" style={{ width: `${percentage}%` }} /></div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-slate-500 block">Pendências abertas</span><strong className="text-base">{metric(kpis?.pendencias_abertas)}</strong></div>
            <div><span className="text-slate-500 block">SLAs abertos</span><strong className="text-base">{metric(kpis?.slas_escritorio_abertos)}</strong></div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-[#0F172A] text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" />Atenção Imediata</h3>
            <Link to="/processos" className="text-[11px] font-semibold text-red-600 hover:underline">Ver processos →</Link>
          </div>
          <div className="mt-3 space-y-2.5 max-h-[330px] overflow-y-auto pr-1">
            {loading ? <div className="py-8 text-center text-xs text-slate-400">Carregando alertas...</div> : priorityProcesses.length === 0 ? (
              <div className="py-8 text-center"><CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" /><p className="text-xs font-semibold text-slate-700">Nenhum processo em alerta</p><p className="text-[11px] text-slate-400 mt-1">Sem semáforo vermelho ou amarelo neste momento.</p></div>
            ) : priorityProcesses.map((proc) => (
              <div key={proc.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-slate-900 truncate">{formatProcessNumber(proc.numero_processo) || proc.numero_processo || 'Sem número'}</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${proc.semaforo_operacional === 'VERMELHO' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>{proc.semaforo_operacional}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 truncate">{proc.objeto_demanda || proc.tipo_demanda || 'Demanda sem descrição'}</p>
                <div className="flex flex-wrap gap-1 mt-2">{(proc.alert_codes || []).slice(0, 2).map(code => <span key={code} className="text-[9px] bg-white border border-slate-200 text-slate-600 rounded px-1.5 py-0.5">{alertLabel[code] || statusLabel(code)}</span>)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Indicadores de Segmentação, Valores e Qualidade (RF17) */}
      <OperationalSegmentKpiPanel />

      {/* Perfil material da carteira: importante, porém compacto e sem redundâncias. */}
      <DemandClassificationKpiPanel
        processes={rawProcesses}
        companies={companiesList}
        loading={loading}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden xl:col-span-2">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-[#0F172A] text-sm flex items-center gap-2"><Scale className="w-4 h-4 text-red-600" />Últimos Processos Atualizados</h3>
            <Link to="/processos" className="text-xs text-red-600 font-semibold hover:underline flex items-center gap-1">Ver todos <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead><tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold text-slate-500 uppercase tracking-wider"><th className="py-2.5 px-4">Processo</th><th className="py-2.5 px-4">Demanda</th><th className="py-2.5 px-4 hidden md:table-cell">Responsabilidade</th><th className="py-2.5 px-4">Semáforo</th><th className="py-2.5 px-4 text-right hidden sm:table-cell">Atualização</th></tr></thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loading ? <tr><td colSpan={5} className="py-8 text-center text-slate-400">Carregando processos...</td></tr> : recentProcesses.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-slate-500">Nenhum processo cadastrado.</td></tr> : recentProcesses.map(proc => (
                  <tr key={proc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-[#0F172A] whitespace-nowrap">{formatProcessNumber(proc.numero_processo) || proc.numero_processo || '-'}</td>
                    <td className="py-3 px-4 font-medium truncate max-w-[220px]">{proc.objeto_demanda || proc.tipo_demanda || '-'}</td>
                    <td className="py-3 px-4 hidden md:table-cell text-slate-500">{responsibilityLabel[proc.responsabilidade_atual] || statusLabel(proc.responsabilidade_atual)}</td>
                    <td className="py-3 px-4"><span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold border ${proc.semaforo_operacional === 'VERMELHO' ? 'bg-red-50 border-red-200 text-red-700' : proc.semaforo_operacional === 'AMARELO' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>{proc.semaforo_operacional}</span></td>
                    <td className="py-3 px-4 text-right font-mono text-[11px] text-slate-400 hidden sm:table-cell">{formatDateTime(proc.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-[#0F172A] text-sm flex items-center gap-2"><Cpu className="w-4 h-4 text-slate-600" />Automação</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Resumo técnico</span>
          </div>
          <div className="mt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-purple-50/70 border border-purple-100"><span className="font-medium text-purple-900">Chamadas IA hoje</span><strong className="text-purple-700">{metric(health?.chamadas_ia_hoje)}</strong></div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100"><span className="text-slate-600">Descartados / irrelevantes</span><strong className="text-slate-700">{metric(emailMetrics?.emails_irrelevantes)}</strong></div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-[11px] leading-relaxed text-slate-500">
              Processados, pendentes e e-mails em exceção já aparecem no bloco <strong className="text-slate-700">Fluxo de E-mails</strong>, evitando dupla leitura de métricas com regras diferentes.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
            <Link to="/admin/excecoes" className="text-center py-2 px-2 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Exceções</Link>
            <Link to="/admin/uso-ia" className="text-center py-2 px-2 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Uso da IA</Link>
          </div>
        </section>
      </div>
    </div>
  );
};
