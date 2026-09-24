export type AutomationLockDiagnosticStatus =
  | 'LIVRE'
  | 'ATIVO'
  | 'EXPIRADO'
  | 'REVISAR_POSSIVEL_ORFAO'
  | 'INCONSISTENTE';

export type AutomationLockDiagnosticSeverity = 'OK' | 'ALERTA';

export interface AutomationLockDiagnosticInput {
  ownerToken?: string | null;
  lockedUntil?: string | null;
  updatedAt?: string | null;
  nowMs?: number;
}

export interface AutomationLockDiagnosticResult {
  status: AutomationLockDiagnosticStatus;
  severity: AutomationLockDiagnosticSeverity;
  details: string;
  actionable: boolean;
}

export function classifyAutomationLockForDiagnostic(
  input: AutomationLockDiagnosticInput,
): AutomationLockDiagnosticResult {
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const ownerToken = input.ownerToken || null;

  if (!ownerToken) {
    return {
      status: 'LIVRE',
      severity: 'OK',
      details: 'Lock liberado para novas execuções.',
      actionable: false,
    };
  }

  if (!input.lockedUntil) {
    return {
      status: 'INCONSISTENTE',
      severity: 'ALERTA',
      details: 'Possui owner mas não possui data de expiração (locked_until nulo).',
      actionable: true,
    };
  }

  const lockedUntilMs = Date.parse(input.lockedUntil);
  if (!Number.isFinite(lockedUntilMs)) {
    return {
      status: 'INCONSISTENTE',
      severity: 'ALERTA',
      details: 'Possui owner, mas locked_until não contém uma data válida.',
      actionable: true,
    };
  }

  // Lease expirado não é, por si só, lock órfão. A RPC de aquisição pode sobrescrevê-lo
  // no próximo ciclo. Mantemos o estado visível para auditoria, mas sem criar falso alerta.
  if (lockedUntilMs < nowMs) {
    return {
      status: 'EXPIRADO',
      severity: 'OK',
      details: `Lease expirado em ${new Date(lockedUntilMs).toISOString()}; recuperável automaticamente pelo próximo ciclo.`,
      actionable: false,
    };
  }

  const updatedAtMs = input.updatedAt ? Date.parse(input.updatedAt) : NaN;
  if (Number.isFinite(updatedAtMs) && updatedAtMs < nowMs - 6 * 60 * 1000) {
    return {
      status: 'REVISAR_POSSIVEL_ORFAO',
      severity: 'ALERTA',
      details: 'Lease ainda ativo, mas sem heartbeat há mais de 6 minutos. Possível processo encerrado abruptamente.',
      actionable: true,
    };
  }

  const remainingSec = Math.max(0, Math.round((lockedUntilMs - nowMs) / 1000));
  return {
    status: 'ATIVO',
    severity: 'OK',
    details: `Lock ativo e protegido. Expira em ~${remainingSec}s.`,
    actionable: false,
  };
}
