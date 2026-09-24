import { getBackendSupabase } from '../integrations/supabase';
import { getAiBudgetState } from './aiUsageService';
import { getAiRouterModelChain } from './aiRouterService';
import { classifyAiCapacity, isExpectedQuotaCapacityStatus, type AiCapacityStatus } from './aiCapacityStatusService';
import { classifyAutomationLockForDiagnostic } from './automationLockDiagnosticPolicy';

export type DiagnosticStatus = 'OK' | 'ALERTA' | 'CRITICO';

export interface ExecutiveIndicator {
  id: string;
  label: string;
  category: 'ESTRUTURA' | 'INTEGRIDADE' | 'FILAS' | 'LOCKS' | 'IA' | 'CONTAS' | 'USUARIOS';
  value: any;
  expected: string;
  status: DiagnosticStatus;
  description: string;
  recommendation?: string;
}

export interface TableAuditItem {
  name: string;
  kind: 'TABLE' | 'VIEW';
  criticality: 'CRITICO' | 'ALTO' | 'MEDIO';
  status: 'OK' | 'AUSENTE' | 'ERRO';
  rowCount?: number | null;
  error?: string | null;
}

export interface LockAuditItem {
  lockName: string;
  ownerTokenMasked: string | null;
  lockedUntil: string | null;
  updatedAt: string | null;
  status: 'LIVRE' | 'ATIVO' | 'EXPIRADO' | 'REVISAR_POSSIVEL_ORFAO' | 'INCONSISTENTE';
  severity: DiagnosticStatus;
  details: string;
}

export interface AiModelHealthItem {
  model: string;
  routerEnabled: boolean;
  capacityStatus: AiCapacityStatus;
  budgetReason: string | null;
  circuitStatus: 'FECHADO' | 'ABERTO' | 'EXPIRADO_AGUARDANDO_REUSO' | 'DESCONHECIDO';
  severity: DiagnosticStatus;
  circuitOpenUntil: string | null;
  lastErrorCode: string | null;
  lastErrorMessagePreview: string | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  requestsToday: number | null;
  tokensToday: number | null;
  effectiveRpd: number | null;
  providerRpd: number | null;
  quotaExhaustedAt: string | null;
  nextResetAt: string | null;
}

export interface TechnicalDiagnosticReport {
  version: string;
  auditAt: string;
  durationMs: number;
  readOnly: true;
  summary: {
    globalStatus: DiagnosticStatus;
    totalIndicators: number;
    counts: {
      ok: number;
      alerta: number;
      critico: number;
    };
  };
  executiveIndicators: ExecutiveIndicator[];
  schemaIntegrity: {
    totalChecked: number;
    presentCount: number;
    missingCount: number;
    items: TableAuditItem[];
  };
  operationalMetrics: {
    processesTotal: number;
    processesWithoutCompany: number;
    companiesTotal: number;
    resolutionCandidatesPending: number;
    emailsByStatus: Record<string, number>;
    exceptionsOpen: number;
    aiQueues: {
      managementRefresh: Record<string, number>;
      demandBackfill: Record<string, number>;
    };
  };
  referentialIntegrity: {
    duplicateCnjs: { count: number; duplicates: Array<{ cnj: string; count: number }> };
    processesWithoutTimeline: number;
    staleRunningRuns: number;
  };
  automationLocks: LockAuditItem[];
  aiModelHealth: AiModelHealthItem[];
  emailAccount: {
    activeConfigsCount: number;
    configs: Array<{
      id: string;
      email: string;
      host: string;
      port: number;
      mailbox: string;
      active: boolean;
      lastConnectionStatus: string | null;
      lastConnectionAt: string | null;
    }>;
  };
  userProfiles: {
    totalUsers: number;
    byRole: Record<string, { total: number; active: number; inactive: number }>;
    invalidRolesCount: number;
  };
}

const EXPECTED_OBJECTS: Array<{ name: string; kind: 'TABLE' | 'VIEW'; criticality: 'CRITICO' | 'ALTO' | 'MEDIO' }> = [
  // Tabelas centrais (CRITICO)
  { name: 'processes', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'processed_emails', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'process_evidence', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'process_timeline', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'obligations', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'email_processing_runs', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'email_exceptions', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'user_profiles', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'access_invites', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'system_config', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'email_account_config', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'automation_locks', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'ai_model_health', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'ai_management_refresh_queue', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'ai_management_suggestions', kind: 'TABLE', criticality: 'CRITICO' },
  { name: 'ai_demand_classification_backfill_queue', kind: 'TABLE', criticality: 'CRITICO' },

  // Tabelas funcionais (ALTO / MEDIO)
  { name: 'companies', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'company_aliases', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'company_resolution_audit', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'company_resolution_candidates', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'law_firms', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'process_pendencies', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'process_law_firm_interactions', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'process_operational_history', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'process_responsibility_history', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'operational_rules_config', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'process_parties', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'process_documents', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'process_history', kind: 'TABLE', criticality: 'ALTO' },
  { name: 'email_sender_rules', kind: 'TABLE', criticality: 'MEDIO' },
  { name: 'email_keyword_rules', kind: 'TABLE', criticality: 'MEDIO' },
  { name: 'ai_usage_daily', kind: 'TABLE', criticality: 'MEDIO' },
  { name: 'ai_usage_minute', kind: 'TABLE', criticality: 'MEDIO' },
  { name: 'demand_classification_catalog', kind: 'TABLE', criticality: 'MEDIO' },
  { name: 'legal_nature_catalog', kind: 'TABLE', criticality: 'MEDIO' },
  { name: 'user_access_audit', kind: 'TABLE', criticality: 'MEDIO' },

  // Views do painel e gestão
  { name: 'v_process_management', kind: 'VIEW', criticality: 'ALTO' },
  { name: 'v_process_operational_state', kind: 'VIEW', criticality: 'MEDIO' },
  { name: 'v_panel_executive_kpis', kind: 'VIEW', criticality: 'ALTO' },
  { name: 'v_panel_operational_health', kind: 'VIEW', criticality: 'ALTO' },
  { name: 'v_panel_priority_processes', kind: 'VIEW', criticality: 'ALTO' },
  { name: 'v_panel_responsibility_summary', kind: 'VIEW', criticality: 'ALTO' },
  { name: 'v_panel_risk_summary', kind: 'VIEW', criticality: 'ALTO' },
  { name: 'v_panel_email_metrics', kind: 'VIEW', criticality: 'MEDIO' },
  { name: 'v_deadline_kpis', kind: 'VIEW', criticality: 'MEDIO' },
  { name: 'v_dashboard_process_kpis', kind: 'VIEW', criticality: 'MEDIO' },
  { name: 'v_process_list', kind: 'VIEW', criticality: 'MEDIO' },
];

function maskToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (token.length <= 8) return '****';
  return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
}

export async function runTechnicalDiagnostic(): Promise<TechnicalDiagnosticReport> {
  const startTime = Date.now();
  const db = getBackendSupabase();

  if (!db) {
    throw new Error('Cliente Supabase administrativo indisponível. Verifique SUPABASE_URL e SUPABASE_SECRET_KEY.');
  }

  const now = new Date();
  const nowUtc = now.getTime();

  // 1. Auditoria de tabelas e views (somente leitura com limit(0))
  const schemaResults = await Promise.all(
    EXPECTED_OBJECTS.map(async (obj) => {
      try {
        const { error } = await db.from(obj.name).select().limit(0);
        if (error) {
          const isMissing = error.code === 'PGRST205' || /does not exist|not found/i.test(error.message);
          return {
            name: obj.name,
            kind: obj.kind,
            criticality: obj.criticality,
            status: (isMissing ? 'AUSENTE' : 'ERRO') as 'AUSENTE' | 'ERRO',
            error: error.message,
          };
        }
        return {
          name: obj.name,
          kind: obj.kind,
          criticality: obj.criticality,
          status: 'OK' as const,
          error: null,
        };
      } catch (err: any) {
        return {
          name: obj.name,
          kind: obj.kind,
          criticality: obj.criticality,
          status: 'ERRO' as const,
          error: err?.message || 'Falha de conexão',
        };
      }
    })
  );

  // 2. Coleta de dados operacionais em paralelo seguro
  const [
    processesRes,
    processesNoCompRes,
    companiesRes,
    candidatesRes,
    emailsPendingIaRes,
    emailsExcecaoRes,
    emailsProcessadoRes,
    emailsIrrelevanteRes,
    exceptionsRes,
    runsRes,
    locksRes,
    aiHealthRes,
    emailConfigRes,
    userProfilesRes,
    mgmtQueueRes,
    backfillQueueRes,
    timelineProcessesRes,
  ] = await Promise.all([
    db.from('processes').select('id, numero_processo', { count: 'exact' }),
    db.from('processes').select('id', { count: 'exact', head: true }).is('company_id', null),
    db.from('companies').select('id', { count: 'exact', head: true }),
    db.from('company_resolution_candidates').select('id', { count: 'exact', head: true }).eq('status', 'PENDENTE'),
    db.from('processed_emails').select('id', { count: 'exact', head: true }).eq('status', 'PENDENTE_IA'),
    db.from('processed_emails').select('id', { count: 'exact', head: true }).eq('status', 'EXCECAO'),
    db.from('processed_emails').select('id', { count: 'exact', head: true }).eq('status', 'PROCESSADO'),
    db.from('processed_emails').select('id', { count: 'exact', head: true }).eq('status', 'IRRELEVANTE'),
    db.from('email_exceptions').select('id', { count: 'exact', head: true }).neq('status', 'RESOLVIDA'),
    db.from('email_processing_runs').select('id, started_at, status').eq('status', 'RUNNING'),
    db.from('automation_locks').select('*'),
    db.from('ai_model_health').select('*'),
    db.from('email_account_config').select('*'),
    db.from('user_profiles').select('id, email, role, active'),
    db.from('ai_management_refresh_queue').select('status'),
    db.from('ai_demand_classification_backfill_queue').select('status'),
    db.from('process_timeline').select('process_id'),
  ]);

  // Contagens operacionais
  const processesTotal = processesRes.count ?? (processesRes.data ? processesRes.data.length : 0);
  const processesWithoutCompany = processesNoCompRes.count ?? 0;
  const companiesTotal = companiesRes.count ?? 0;
  const resolutionCandidatesPending = candidatesRes.count ?? 0;
  const exceptionsOpen = exceptionsRes.count ?? 0;

  const emailsByStatus = {
    PENDENTE_IA: emailsPendingIaRes.count ?? 0,
    EXCECAO: emailsExcecaoRes.count ?? 0,
    PROCESSADO: emailsProcessadoRes.count ?? 0,
    IRRELEVANTE: emailsIrrelevanteRes.count ?? 0,
  };

  // Contagem de filas
  const mgmtQueueCounts: Record<string, number> = { PENDING: 0, PROCESSING: 0, DONE: 0, ERROR: 0 };
  (mgmtQueueRes.data || []).forEach((row: any) => {
    const s = row.status || 'OTHER';
    mgmtQueueCounts[s] = (mgmtQueueCounts[s] || 0) + 1;
  });

  const backfillQueueCounts: Record<string, number> = { PENDING: 0, PROCESSING: 0, DONE: 0, ERROR: 0 };
  (backfillQueueRes.data || []).forEach((row: any) => {
    const s = row.status || 'OTHER';
    backfillQueueCounts[s] = (backfillQueueCounts[s] || 0) + 1;
  });

  // Integridade: CNJs duplicados
  const cnjCounts = new Map<string, number>();
  (processesRes.data || []).forEach((p: any) => {
    const cnj = (p.numero_processo || '').trim();
    if (cnj) cnjCounts.set(cnj, (cnjCounts.get(cnj) || 0) + 1);
  });
  const duplicateCnjsList: Array<{ cnj: string; count: number }> = [];
  for (const [cnj, count] of cnjCounts.entries()) {
    if (count > 1) duplicateCnjsList.push({ cnj, count });
  }

  // Integridade: processos sem timeline
  const timelineProcessIds = new Set((timelineProcessesRes.data || []).map((t: any) => t.process_id).filter(Boolean));
  const processesWithoutTimeline = (processesRes.data || []).filter((p: any) => !timelineProcessIds.has(p.id)).length;

  // Integridade: runs em RUNNING há mais de 30 minutos
  const thirtyMinutesAgo = nowUtc - 30 * 60 * 1000;
  const staleRunningRuns = (runsRes.data || []).filter((r: any) => {
    const started = new Date(r.started_at).getTime();
    return started < thirtyMinutesAgo;
  }).length;

  // Auditoria de Locks (somente leitura - nenhuma modificação)
  const lockItems: LockAuditItem[] = (locksRes.data || []).map((lock: any) => {
    const classification = classifyAutomationLockForDiagnostic({
      ownerToken: lock.owner_token,
      lockedUntil: lock.locked_until,
      updatedAt: lock.updated_at,
      nowMs: nowUtc,
    });

    return {
      lockName: lock.lock_name,
      ownerTokenMasked: maskToken(lock.owner_token),
      lockedUntil: lock.locked_until,
      updatedAt: lock.updated_at,
      status: classification.status,
      severity: classification.severity,
      details: classification.details,
    };
  });

  // Saúde e capacidade dos Modelos de IA. O circuit breaker e a quota são conceitos
  // diferentes: um circuito curto pode expirar enquanto a quota diária segue esgotada.
  const routerModels = getAiRouterModelChain();
  const routerBudgetPairs = await Promise.all(
    routerModels.map(async (model) => {
      try {
        return [model, await getAiBudgetState(db, { model })] as const;
      } catch {
        return [model, null] as const;
      }
    })
  );
  const budgetByModel = new Map(routerBudgetPairs);
  const healthByModel = new Map((aiHealthRes.data || []).map((row: any) => [String(row.model), row]));
  const allAiModels = Array.from(new Set([
    ...routerModels,
    ...(aiHealthRes.data || []).map((row: any) => String(row.model)),
  ]));

  const aiHealthItems: AiModelHealthItem[] = allAiModels.map((model) => {
    const item: any = healthByModel.get(model) || {};
    const budget: any = budgetByModel.get(model as any) || null;
    const routerEnabled = routerModels.includes(model as any);
    const circuitUntil = item.circuit_open_until ? new Date(item.circuit_open_until).getTime() : null;
    let circuitStatus: AiModelHealthItem['circuitStatus'] = 'FECHADO';

    if (circuitUntil) {
      circuitStatus = circuitUntil > nowUtc ? 'ABERTO' : 'EXPIRADO_AGUARDANDO_REUSO';
    }

    const capacityStatus = classifyAiCapacity({
      routerEnabled,
      allowed: budget?.allowed ?? null,
      budgetReason: budget?.reason || null,
      circuitOpenUntil: item.circuit_open_until || null,
      lastErrorCode: item.last_error_code || null,
      nowMs: nowUtc,
    });

    let severity: DiagnosticStatus = 'OK';
    if (routerEnabled && capacityStatus !== 'DISPONIVEL') {
      severity = capacityStatus === 'INDISPONIVEL' ? 'CRITICO' : 'ALERTA';
    }

    let msgPreview = item.last_error_message || null;
    if (msgPreview && msgPreview.length > 200) {
      msgPreview = `${msgPreview.substring(0, 197)}...`;
    }

    return {
      model,
      routerEnabled,
      capacityStatus,
      budgetReason: budget?.reason || null,
      circuitStatus,
      severity,
      circuitOpenUntil: item.circuit_open_until || null,
      lastErrorCode: item.last_error_code || null,
      lastErrorMessagePreview: msgPreview,
      lastFailureAt: item.last_failure_at || null,
      lastSuccessAt: item.last_success_at || null,
      requestsToday: budget ? Number(budget.requestsToday || 0) : null,
      tokensToday: budget ? Number(budget.inputTokensToday || 0) + Number(budget.outputTokensToday || 0) : null,
      effectiveRpd: budget ? Number(budget.effectiveRpd || 0) : null,
      providerRpd: budget ? Number(budget.providerRpd || 0) : null,
      quotaExhaustedAt: budget?.quotaExhaustedAt || null,
      nextResetAt: budget?.nextResetAt || null,
    };
  });

  const routerHealthItems = aiHealthItems.filter((item) => item.routerEnabled);
  const routerAvailableCount = routerHealthItems.filter((item) => item.capacityStatus === 'DISPONIVEL').length;
  const routerRecoverableUnavailable = routerHealthItems.length > 0
    && routerAvailableCount === 0
    && routerHealthItems.every((item) =>
      isExpectedQuotaCapacityStatus(item.capacityStatus)
      || item.capacityStatus === 'LIMITE_TEMPORARIO'
      || item.capacityStatus === 'CIRCUITO_ABERTO'
    );
  const routerQuotaOnlyUnavailable = routerHealthItems.length > 0
    && routerAvailableCount === 0
    && routerHealthItems.every((item) => isExpectedQuotaCapacityStatus(item.capacityStatus));
  const latestRouterSuccessMs = Math.max(
    0,
    ...routerHealthItems.map((item) => item.lastSuccessAt ? Date.parse(item.lastSuccessAt) : 0)
  );
  const routerHadRecentSuccess = latestRouterSuccessMs >= nowUtc - 30 * 60 * 1000;

  // Configuração IMAP
  const emailConfigs = (emailConfigRes.data || []).map((c: any) => ({
    id: c.id,
    email: c.email,
    host: c.host,
    port: c.port,
    mailbox: c.mailbox,
    active: Boolean(c.active),
    lastConnectionStatus: c.last_connection_status,
    lastConnectionAt: c.last_connection_at,
  }));
  const activeEmailConfigsCount = emailConfigs.filter((c: any) => c.active).length;

  // Perfis de usuários
  const validRoles = new Set(['ADMIN', 'GESTOR', 'ANALISTA', 'CONSULTA']);
  const userByRole: Record<string, { total: number; active: number; inactive: number }> = {};
  let invalidRolesCount = 0;

  (userProfilesRes.data || []).forEach((u: any) => {
    const role = String(u.role || 'DESCONHECIDO').toUpperCase();
    if (!validRoles.has(role)) invalidRolesCount += 1;
    if (!userByRole[role]) userByRole[role] = { total: 0, active: 0, inactive: 0 };
    userByRole[role].total += 1;
    if (u.active) userByRole[role].active += 1;
    else userByRole[role].inactive += 1;
  });

  // 3. Compilação dos Indicadores Executivos com categorização OK / ALERTA / CRÍTICO
  const executiveIndicators: ExecutiveIndicator[] = [];

  // Indicador: Tabelas Críticas
  const criticalMissing = schemaResults.filter((s) => s.criticality === 'CRITICO' && s.status !== 'OK');
  executiveIndicators.push({
    id: 'tabelas_criticas',
    label: 'Tabelas Críticas do Sistema',
    category: 'ESTRUTURA',
    value: criticalMissing.length === 0 ? 'Todas presentes' : `${criticalMissing.length} ausente(s)`,
    expected: '0 ausentes',
    status: criticalMissing.length === 0 ? 'OK' : 'CRITICO',
    description: criticalMissing.length === 0
      ? 'Todas as tabelas críticas do banco estão presentes e acessíveis.'
      : `Tabelas críticas ausentes: ${criticalMissing.map((m) => m.name).join(', ')}`,
    recommendation: criticalMissing.length > 0 ? 'Executar migrations pendentes no Supabase SQL Editor.' : undefined,
  });

  // Indicador: CNJs Duplicados
  executiveIndicators.push({
    id: 'cnj_duplicados',
    label: 'Unicidade de Número de Processo (CNJ)',
    category: 'INTEGRIDADE',
    value: duplicateCnjsList.length,
    expected: '0 duplicidades',
    status: duplicateCnjsList.length === 0 ? 'OK' : 'CRITICO',
    description: duplicateCnjsList.length === 0
      ? 'Nenhum processo duplicado encontrado na base.'
      : `${duplicateCnjsList.length} número(s) de processo com duplicidade detectada.`,
    recommendation: duplicateCnjsList.length > 0 ? 'Auditar processos duplicados e consolidar registros históricos.' : undefined,
  });

  // Indicador: Contas IMAP Ativas
  executiveIndicators.push({
    id: 'contas_imap_ativas',
    label: 'Contas IMAP Ativas para Ingestão',
    category: 'CONTAS',
    value: activeEmailConfigsCount,
    expected: 'Exatamente 1 conta ativa',
    status: activeEmailConfigsCount === 1 ? 'OK' : activeEmailConfigsCount === 0 ? 'ALERTA' : 'CRITICO',
    description: activeEmailConfigsCount === 1
      ? 'Configuração única de e-mail ativa para sincronização.'
      : activeEmailConfigsCount === 0
      ? 'Nenhuma conta de e-mail está com flag active = true. Monitoramento automático pausado.'
      : 'Mais de uma conta ativa detectada, o que pode causar concorrência de ingestão.',
    recommendation: activeEmailConfigsCount !== 1 ? 'Ajustar as contas na tela de Administração > Conta de E-mail.' : undefined,
  });

  // Indicador: Capacidade real do roteador de IA
  const routerCapacitySeverity: DiagnosticStatus = routerHealthItems.length === 0
    ? 'CRITICO'
    : routerAvailableCount === routerHealthItems.length
    ? 'OK'
    : routerAvailableCount > 0 || routerRecoverableUnavailable
    ? 'ALERTA'
    : 'CRITICO';
  const routerCapacityDetails = routerHealthItems
    .map((item) => `${item.model}: ${item.capacityStatus}`)
    .join(' | ');

  executiveIndicators.push({
    id: 'circuit_breaker_ia',
    label: 'Capacidade do Roteador Gemini',
    category: 'IA',
    value: `${routerAvailableCount}/${routerHealthItems.length} modelo(s) disponível(is)`,
    expected: 'Ao menos 1 modelo disponível; ideal toda a cadeia operacional',
    status: routerCapacitySeverity,
    description: routerAvailableCount === routerHealthItems.length && routerHealthItems.length > 0
      ? `Toda a cadeia configurada está disponível. ${routerCapacityDetails}`
      : routerQuotaOnlyUnavailable
      ? `Sem capacidade por limite diário conhecido do provedor. A fila permanece preservada. ${routerCapacityDetails}`
      : `Capacidade parcial ou indisponível. ${routerCapacityDetails || 'Nenhum modelo configurado no roteador.'}`,
    recommendation: routerCapacitySeverity === 'OK'
      ? undefined
      : routerQuotaOnlyUnavailable
      ? 'Aguardar o próximo reset de quota do provedor. Não é necessário reprocessar manualmente a fila.'
      : 'Revisar o estado individual dos modelos, circuit breaker e último erro do provedor.',
  });

  // Indicador: Exceções Abertas
  executiveIndicators.push({
    id: 'excecoes_abertas',
    label: 'Fila de Exceções Jurídicas Abertas',
    category: 'FILAS',
    value: exceptionsOpen,
    expected: '0 exceções',
    status: exceptionsOpen === 0 ? 'OK' : 'ALERTA',
    description: exceptionsOpen === 0
      ? 'Nenhum e-mail ou processo pendente de tratamento de exceção.'
      : `${exceptionsOpen} exceção(ões) aguardando tratamento operacional na fila.`,
    recommendation: exceptionsOpen > 0 ? 'Acessar Fila de Exceções para tratar os e-mails pendentes.' : undefined,
  });

  // Indicador: E-mails aguardando IA. Backlog por quota conhecida é alerta de capacidade,
  // não falha crítica do sistema. Criticidade só ocorre com capacidade disponível e sem sucesso recente.
  const pendingIa = emailsByStatus.PENDENTE_IA;
  const pendingIaStatus: DiagnosticStatus = pendingIa === 0
    ? 'OK'
    : routerAvailableCount === 0
    ? 'ALERTA'
    : pendingIa >= 25 && !routerHadRecentSuccess
    ? 'CRITICO'
    : 'ALERTA';
  executiveIndicators.push({
    id: 'emails_pendente_ia',
    label: 'E-mails Aguardando Interpretação IA',
    category: 'IA',
    value: pendingIa,
    expected: 'Fila transitória e em escoamento; backlog é aceitável quando a quota do provedor está indisponível',
    status: pendingIaStatus,
    description: pendingIa === 0
      ? 'Nenhum e-mail aguardando interpretação por IA.'
      : routerAvailableCount === 0
      ? `${pendingIa} e-mail(s) preservados em PENDENTE_IA enquanto o roteador está sem capacidade.`
      : routerHadRecentSuccess
      ? `${pendingIa} e-mail(s) aguardando IA; há sucesso recente do roteador, indicando fila em escoamento.`
      : `${pendingIa} e-mail(s) aguardando IA apesar de existir capacidade declarada e sem sucesso recente nos últimos 30 minutos.`,
    recommendation: pendingIaStatus === 'CRITICO'
      ? 'Verificar execução do worker AI_QUEUE_WORKER e logs recentes de processamento.'
      : pendingIa > 0 && routerAvailableCount === 0
      ? 'Aguardar recuperação/reset de quota; a fila foi preservada para retomada automática.'
      : undefined,
  });

  // Indicador: Erros na Fila Gerencial de IA
  const mgmtErrors = mgmtQueueCounts.ERROR || 0;
  executiveIndicators.push({
    id: 'erros_fila_gerencial',
    label: 'Erros na Fila de Sugestões Gerenciais',
    category: 'FILAS',
    value: mgmtErrors,
    expected: '0 erros',
    status: mgmtErrors === 0 ? 'OK' : 'ALERTA',
    description: mgmtErrors === 0
      ? 'Fila de sugestões gerenciais sem falhas registradas.'
      : `${mgmtErrors} processo(s) com erro ao gerar sugestões gerenciais.`,
    recommendation: mgmtErrors > 0 ? 'Revisar erros da fila ou reprocessar itens após restauração da quota.' : undefined,
  });

  // Indicador: Erros na Fila de Backfill de Taxonomia
  const backfillErrors = backfillQueueCounts.ERROR || 0;
  executiveIndicators.push({
    id: 'erros_fila_backfill',
    label: 'Erros na Fila de Classificação Retroativa',
    category: 'FILAS',
    value: backfillErrors,
    expected: '0 erros',
    status: backfillErrors === 0 ? 'OK' : 'ALERTA',
    description: backfillErrors === 0
      ? 'Fila de classificação taxonômica sem erros.'
      : `${backfillErrors} processo(s) falharam na classificação retroativa.`,
  });

  // Indicador: Runs Abandonados (> 30 min em RUNNING)
  executiveIndicators.push({
    id: 'runs_abandonados',
    label: 'Runs de E-mail Potencialmente Órfãos',
    category: 'INTEGRIDADE',
    value: staleRunningRuns,
    expected: '0 runs abandonados',
    status: staleRunningRuns === 0 ? 'OK' : 'ALERTA',
    description: staleRunningRuns === 0
      ? 'Nenhuma execução em status RUNNING há mais de 30 minutos.'
      : `${staleRunningRuns} execução(ões) iniciada(s) há mais de 30 min sem finalização registrada. Esses registros são reconciliados automaticamente como FAILED quando um novo ciclo IMAP obtém o lock exclusivo.`,
  });

  // Indicador: Locks de Automação
  const actionableLockIssues = lockItems.filter((l) => l.status === 'INCONSISTENTE' || l.status === 'REVISAR_POSSIVEL_ORFAO');
  const expiredRecoverableLocks = lockItems.filter((l) => l.status === 'EXPIRADO');
  executiveIndicators.push({
    id: 'locks_automacao',
    label: 'Saúde dos Locks Distribuídos',
    category: 'LOCKS',
    value: actionableLockIssues.length === 0 ? 'Locks íntegros' : `${actionableLockIssues.length} lock(s) a revisar`,
    expected: 'Nenhum lock órfão ou inconsistente',
    status: actionableLockIssues.length === 0 ? 'OK' : 'ALERTA',
    description: actionableLockIssues.length === 0
      ? (expiredRecoverableLocks.length > 0
        ? `Locks íntegros. ${expiredRecoverableLocks.length} lease(s) expirado(s) permanece(m) visível(is), mas são recuperáveis automaticamente pelo próximo ciclo.`
        : 'Todos os locks distribuídos estão livres ou ativos com lease válido.')
      : `Locks com inconsistência ou heartbeat atrasado durante lease ativo: ${actionableLockIssues.map((l) => l.lockName).join(', ')}.`,
    recommendation: actionableLockIssues.length > 0
      ? 'Aguardar o lease quando aplicável e revisar apenas se o mesmo lock continuar ativo sem heartbeat em diagnósticos consecutivos.'
      : undefined,
  });

  // Indicador: Empresa Vinculada. company_id nulo é permitido quando não há relação PJ comprovada.
  executiveIndicators.push({
    id: 'processos_sem_empresa',
    label: 'Cobertura de Empresa Vinculada',
    category: 'INTEGRIDADE',
    value: `${processesWithoutCompany} sem vínculo · ${resolutionCandidatesPending} candidato(s) pendente(s)`,
    expected: 'company_id pode ser nulo; pendências devem refletir apenas vínculos com evidência a revisar',
    status: resolutionCandidatesPending > 0 ? 'ALERTA' : 'OK',
    description: `${processesWithoutCompany} de ${processesTotal} processos não possuem empresa vinculada. Isso não é erro por si só: o vínculo é opcional e depende de relação cliente/contrato PJ comprovada.`,
    recommendation: resolutionCandidatesPending > 0
      ? `Há ${resolutionCandidatesPending} candidato(s) de resolução aguardando confirmação operacional.`
      : undefined,
  });

  // Indicador: Timeline do legado. Ausência de evento histórico anterior ao sistema é informativa, não falha.
  executiveIndicators.push({
    id: 'processos_sem_timeline',
    label: 'Cobertura de Timeline do Legado',
    category: 'INTEGRIDADE',
    value: processesWithoutTimeline,
    expected: 'Timeline obrigatória para eventos acompanhados pelo sistema; legado pode não possuir evento inicial',
    status: 'OK',
    description: `${processesWithoutTimeline} processos não possuem evento de timeline. Para registros legados isso é permitido até que ocorra um evento operacional rastreável no sistema.`,
  });

  // Indicador: Perfis com Papel Inválido
  executiveIndicators.push({
    id: 'papeis_usuarios_invalidos',
    label: 'Conformidade de Perfis de Usuário',
    category: 'USUARIOS',
    value: invalidRolesCount,
    expected: '0 perfis inválidos',
    status: invalidRolesCount === 0 ? 'OK' : 'CRITICO',
    description: invalidRolesCount === 0
      ? 'Todos os usuários possuem perfil regulamentado (ADMIN, GESTOR, ANALISTA, CONSULTA).'
      : `${invalidRolesCount} usuário(s) possuem papel fora do padrão estabelecido.`,
  });

  // Contagem de status
  const counts = {
    ok: executiveIndicators.filter((i) => i.status === 'OK').length,
    alerta: executiveIndicators.filter((i) => i.status === 'ALERTA').length,
    critico: executiveIndicators.filter((i) => i.status === 'CRITICO').length,
  };

  const globalStatus: DiagnosticStatus = counts.critico > 0 ? 'CRITICO' : counts.alerta > 0 ? 'ALERTA' : 'OK';

  const durationMs = Date.now() - startTime;

  return {
    version: '2026.09-diagnostic-readonly-1.1',
    auditAt: now.toISOString(),
    durationMs,
    readOnly: true,
    summary: {
      globalStatus,
      totalIndicators: executiveIndicators.length,
      counts,
    },
    executiveIndicators,
    schemaIntegrity: {
      totalChecked: schemaResults.length,
      presentCount: schemaResults.filter((s) => s.status === 'OK').length,
      missingCount: schemaResults.filter((s) => s.status !== 'OK').length,
      items: schemaResults,
    },
    operationalMetrics: {
      processesTotal,
      processesWithoutCompany,
      companiesTotal,
      resolutionCandidatesPending,
      emailsByStatus,
      exceptionsOpen,
      aiQueues: {
        managementRefresh: mgmtQueueCounts,
        demandBackfill: backfillQueueCounts,
      },
    },
    referentialIntegrity: {
      duplicateCnjs: { count: duplicateCnjsList.length, duplicates: duplicateCnjsList },
      processesWithoutTimeline,
      staleRunningRuns,
    },
    automationLocks: lockItems,
    aiModelHealth: aiHealthItems,
    emailAccount: {
      activeConfigsCount: activeEmailConfigsCount,
      configs: emailConfigs,
    },
    userProfiles: {
      totalUsers: userProfilesRes.data ? userProfilesRes.data.length : 0,
      byRole: userByRole,
      invalidRolesCount,
    },
  };
}
