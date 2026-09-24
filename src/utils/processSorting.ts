import type { Process } from '../types/database';

export type ProcessSortOption =
  | 'OPERATIONAL_PRIORITY'
  | 'PROCESS_NUMBER'
  | 'LAST_UPDATED'
  | 'NEWEST'
  | 'OLDEST'
  | 'CASE_VALUE'
  | 'NEAREST_DEADLINE';

const PRIORITY_RANK: Record<string, number> = {
  URGENTE: 0,
  ALTA: 1,
  MEDIA: 2,
  BAIXA: 3,
};

function validTime(value?: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function compareNullableNumber(a: number | null, b: number | null, ascending: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return ascending ? a - b : b - a;
}

function normalizedProcessNumber(proc: Process): string | null {
  const value = (proc.numero_processo || '').replace(/\D/g, '');
  return value || null;
}

function compareProcessNumber(a: Process, b: Process): number {
  const aNumber = normalizedProcessNumber(a);
  const bNumber = normalizedProcessNumber(b);

  if (!aNumber && !bNumber) return 0;
  if (!aNumber) return 1;
  if (!bNumber) return -1;

  return aNumber.localeCompare(bNumber, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function compareLastUpdated(a: Process, b: Process): number {
  const byUpdated = compareNullableNumber(validTime(a.updated_at), validTime(b.updated_at), false);
  if (byUpdated !== 0) return byUpdated;

  const byCreated = compareNullableNumber(validTime(a.created_at), validTime(b.created_at), false);
  if (byCreated !== 0) return byCreated;

  return compareProcessNumber(a, b);
}

function compareOperationalPriority(a: Process, b: Process): number {
  const aRank = PRIORITY_RANK[(a.prioridade || '').toUpperCase()] ?? 4;
  const bRank = PRIORITY_RANK[(b.prioridade || '').toUpperCase()] ?? 4;

  if (aRank !== bRank) return aRank - bRank;
  return compareLastUpdated(a, b);
}

function compareCaseValue(a: Process, b: Process): number {
  const aValue = Number.isFinite(Number(a.valor_causa)) && a.valor_causa !== null ? Number(a.valor_causa) : null;
  const bValue = Number.isFinite(Number(b.valor_causa)) && b.valor_causa !== null ? Number(b.valor_causa) : null;

  const byValue = compareNullableNumber(aValue, bValue, false);
  if (byValue !== 0) return byValue;
  return compareLastUpdated(a, b);
}

function compareNearestDeadline(a: Process, b: Process): number {
  const aDeadline = validTime(a.proxima_obrigacao?.prazo);
  const bDeadline = validTime(b.proxima_obrigacao?.prazo);

  // Prazos válidos sempre vêm antes dos processos sem prazo.
  // A ordenação cronológica mantém vencidos no topo e, em seguida, os próximos vencimentos.
  const byDeadline = compareNullableNumber(aDeadline, bDeadline, true);
  if (byDeadline !== 0) return byDeadline;
  return compareOperationalPriority(a, b);
}

export function sortProcesses(processes: Process[], option: ProcessSortOption): Process[] {
  const result = [...processes];

  result.sort((a, b) => {
    switch (option) {
      case 'PROCESS_NUMBER': {
        const byNumber = compareProcessNumber(a, b);
        return byNumber !== 0 ? byNumber : compareLastUpdated(a, b);
      }
      case 'LAST_UPDATED':
        return compareLastUpdated(a, b);
      case 'NEWEST': {
        const byCreated = compareNullableNumber(validTime(a.created_at), validTime(b.created_at), false);
        return byCreated !== 0 ? byCreated : compareProcessNumber(a, b);
      }
      case 'OLDEST': {
        const byCreated = compareNullableNumber(validTime(a.created_at), validTime(b.created_at), true);
        return byCreated !== 0 ? byCreated : compareProcessNumber(a, b);
      }
      case 'CASE_VALUE':
        return compareCaseValue(a, b);
      case 'NEAREST_DEADLINE':
        return compareNearestDeadline(a, b);
      case 'OPERATIONAL_PRIORITY':
      default:
        return compareOperationalPriority(a, b);
    }
  });

  return result;
}
