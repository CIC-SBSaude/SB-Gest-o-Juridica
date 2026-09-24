/**
 * Utilitários centralizados para formatação de data/hora e cálculo de prazos
 */

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export type DeadlineCategory = 'VENCIDA' | 'URGENTE_48H' | 'FUTURA' | 'CONCLUIDA' | 'CANCELADA' | 'SEM_PRAZO';

export interface DeadlineStatusInfo {
  category: DeadlineCategory;
  label: string;
  badgeClass: string;
  hoursRemaining?: number;
  daysRemaining?: number;
}

/**
 * Classifica visual e operacionalmente o prazo de uma obrigação:
 * - Vencidas: prazo < agora (e status não cumprida/cancelada)
 * - Vencendo em até 48h: agora <= prazo <= agora + 48h (e status não cumprida/cancelada)
 * - Futuras: prazo > agora + 48h
 * - Concluídas: status cumprida/concluida
 * - Canceladas: status cancelada
 */
export function getDeadlineStatus(prazo?: string | null, status?: string): DeadlineStatusInfo {
  const normStatus = (status || '').toUpperCase();

  if (normStatus === 'CUMPRIDA' || normStatus === 'CONCLUIDA') {
    return {
      category: 'CONCLUIDA',
      label: 'Cumprida',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }

  if (normStatus === 'CANCELADA') {
    return {
      category: 'CANCELADA',
      label: 'Cancelada',
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200 line-through',
    };
  }

  if (!prazo) {
    return {
      category: 'SEM_PRAZO',
      label: 'Sem prazo fixado',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }

  const targetDate = new Date(prazo);
  if (isNaN(targetDate.getTime())) {
    return {
      category: 'SEM_PRAZO',
      label: 'Data inválida',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }

  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    const absDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
    const absHours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
    const label =
      absDays === 0
        ? `Venceu há ${absHours <= 1 ? '1 hora' : `${absHours}h`}`
        : `Vencida há ${absDays === 1 ? '1 dia' : `${absDays} dias`}`;

    return {
      category: 'VENCIDA',
      label,
      badgeClass: 'bg-red-50 text-red-700 border-red-200 font-bold',
      hoursRemaining: Math.round(diffHours),
      daysRemaining: diffDays,
    };
  }

  if (diffHours <= 48) {
    const hours = Math.ceil(diffHours);
    const label =
      hours <= 1
        ? 'Vence em menos de 1h'
        : hours <= 24
        ? `Vence em ${hours}h`
        : `Vence em ${Math.ceil(diffHours / 24)} dias (urgente)`;

    return {
      category: 'URGENTE_48H',
      label,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 font-semibold',
      hoursRemaining: hours,
      daysRemaining: diffDays,
    };
  }

  return {
    category: 'FUTURA',
    label: `Vence em ${diffDays} dias (${formatDate(prazo)})`,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    hoursRemaining: Math.round(diffHours),
    daysRemaining: diffDays,
  };
}

export interface OperationalDeadlineInfo {
  situation: string;
  badgeClass: string;
  dotColor: string;
  daysDiff: number | null;
  formattedDate: string;
}

/**
 * Retorna a situação operacional derivada e formatação visual para a listagem de processos:
 * - Vencida: vermelho (ex: 'VENCIDA HÁ 8 DIAS', 'VENCIDA HÁ 1 DIA')
 * - Até 3 dias: laranja/vermelho moderado ('VENCE HOJE', 'VENCE AMANHÃ', 'VENCE EM 2 DIAS', 'VENCE EM 3 DIAS')
 * - De 4 a 7 dias: amarelo/atenção ('VENCE EM 4 DIAS' ... 'VENCE EM 7 DIAS')
 * - Acima de 7 dias: neutro ('NO PRAZO')
 * - Sem prazo: cinza/neutro ('SEM PRAZO')
 */
export function getOperationalDeadline(prazo?: string | null): OperationalDeadlineInfo {
  if (!prazo) {
    return {
      situation: 'SEM PRAZO',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      dotColor: 'bg-slate-400',
      daysDiff: null,
      formattedDate: '-',
    };
  }

  const targetDate = new Date(prazo);
  if (isNaN(targetDate.getTime())) {
    return {
      situation: 'DATA INVÁLIDA',
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
      dotColor: 'bg-slate-400',
      daysDiff: null,
      formattedDate: '-',
    };
  }

  // Comparação de dias no fuso local por início de dia
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
  const diffDays = Math.round((startOfTarget - startOfToday) / (1000 * 60 * 60 * 24));

  const hasTime =
    prazo.includes('T') &&
    !prazo.endsWith('T00:00:00Z') &&
    !prazo.endsWith('T00:00:00.000Z') &&
    !prazo.includes('00:00:00');
  const formattedDate = hasTime ? formatDateTime(prazo) : formatDate(prazo);

  // 1. Vencido (diffDays < 0): vermelho
  if (diffDays < 0) {
    const daysOverdue = Math.abs(diffDays);
    const situation = daysOverdue === 1 ? 'VENCIDA HÁ 1 DIA' : `VENCIDA HÁ ${daysOverdue} DIAS`;
    return {
      situation,
      badgeClass: 'bg-red-50 text-red-700 border-red-200/90 font-bold',
      dotColor: 'bg-red-500',
      daysDiff: diffDays,
      formattedDate,
    };
  }

  // 2. Vence Hoje: laranja/vermelho moderado
  if (diffDays === 0) {
    return {
      situation: 'VENCE HOJE',
      badgeClass: 'bg-orange-50 text-orange-800 border-orange-200 font-bold',
      dotColor: 'bg-orange-500',
      daysDiff: 0,
      formattedDate,
    };
  }

  // 3. Vence Amanhã: laranja/vermelho moderado
  if (diffDays === 1) {
    return {
      situation: 'VENCE AMANHÃ',
      badgeClass: 'bg-orange-50 text-orange-800 border-orange-200 font-semibold',
      dotColor: 'bg-orange-500',
      daysDiff: 1,
      formattedDate,
    };
  }

  // 4. Vence em 2 ou 3 dias: laranja/vermelho moderado (até 3 dias)
  if (diffDays <= 3) {
    return {
      situation: `VENCE EM ${diffDays} DIAS`,
      badgeClass: 'bg-orange-50 text-orange-800 border-orange-200 font-semibold',
      dotColor: 'bg-orange-500',
      daysDiff: diffDays,
      formattedDate,
    };
  }

  // 5. De 4 a 7 dias: amarelo/atenção
  if (diffDays <= 7) {
    return {
      situation: `VENCE EM ${diffDays} DIAS`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-medium',
      dotColor: 'bg-amber-500',
      daysDiff: diffDays,
      formattedDate,
    };
  }

  // 6. Acima de 7 dias: neutro
  return {
    situation: 'NO PRAZO',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 font-medium',
    dotColor: 'bg-slate-400',
    daysDiff: diffDays,
    formattedDate,
  };
}

