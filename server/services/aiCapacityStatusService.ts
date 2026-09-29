export type AiCapacityStatus =
  | 'ACESSO_NEGADO'
  | 'DISPONIVEL'
  | 'QUOTA_PROVEDOR_ESGOTADA'
  | 'LIMITE_DIARIO_LOCAL'
  | 'LIMITE_TEMPORARIO'
  | 'CIRCUITO_ABERTO'
  | 'INDISPONIVEL'
  | 'FORA_DO_ROTEADOR';

export interface AiCapacityInput {
  routerEnabled: boolean;
  allowed?: boolean | null;
  budgetReason?: string | null;
  circuitOpenUntil?: string | null;
  lastErrorCode?: string | null;
  nowMs?: number;
}

export function classifyAiCapacity(input: AiCapacityInput): AiCapacityStatus {
  if (!input.routerEnabled) return 'FORA_DO_ROTEADOR';

  const reason = String(input.budgetReason || '').toUpperCase();
  const lastError = String(input.lastErrorCode || '').toUpperCase();
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const circuitOpen = Boolean(input.circuitOpenUntil && Date.parse(input.circuitOpenUntil) > nowMs);

  // Permission failures do not expire with a quota reset or a short circuit.
  if (lastError === 'AI_ACCESS_DENIED' || reason === 'AI_ACCESS_DENIED') return 'ACESSO_NEGADO';

  // O orçamento diário tem precedência sobre o circuit breaker curto. Um circuito pode
  // expirar após 15 minutos, mas a quota diária continua indisponível até o reset do provedor.
  if (reason === 'PROVIDER_QUOTA_EXHAUSTED') return 'QUOTA_PROVEDOR_ESGOTADA';
  if (reason === 'RPD_REACHED') return 'LIMITE_DIARIO_LOCAL';
  if (reason === 'RPM_REACHED' || reason === 'TPM_REACHED') return 'LIMITE_TEMPORARIO';

  if (circuitOpen) {
    if (lastError === 'DAILY_QUOTA' || lastError === 'PROVIDER_QUOTA_EXHAUSTED') {
      return 'QUOTA_PROVEDOR_ESGOTADA';
    }
    if (lastError === 'RATE_LIMIT' || lastError === 'UNKNOWN_429') {
      return 'LIMITE_TEMPORARIO';
    }
    return 'CIRCUITO_ABERTO';
  }

  if (input.allowed === true) return 'DISPONIVEL';
  return 'INDISPONIVEL';
}

export function isExpectedQuotaCapacityStatus(status: AiCapacityStatus) {
  return status === 'QUOTA_PROVEDOR_ESGOTADA' || status === 'LIMITE_DIARIO_LOCAL';
}
