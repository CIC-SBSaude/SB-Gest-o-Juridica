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

export type AiCapacityStatus =
  | 'DISPONIVEL'
  | 'QUOTA_PROVEDOR_ESGOTADA'
  | 'LIMITE_DIARIO_LOCAL'
  | 'LIMITE_TEMPORARIO'
  | 'CIRCUITO_ABERTO'
  | 'INDISPONIVEL'
  | 'FORA_DO_ROTEADOR';

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
