import { supabase } from './supabase';

export interface AttentionIndicators {
  openExceptions: number;
  urgentDeadlines: number;
}

const CLOSED_OBLIGATION_STATUSES = ['CUMPRIDA', 'CONCLUIDA', 'CANCELADA', 'EXTINTA'];

class AttentionIndicatorsService {
  async getIndicators(): Promise<AttentionIndicators> {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const [
      exceptionsResult,
      overdueResult,
      next48hResult,
    ] = await Promise.all([
      supabase
        .from('email_exceptions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['ABERTA', 'PENDENTE']),

      supabase
        .from('obligations')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', `(${CLOSED_OBLIGATION_STATUSES.map((s) => `"${s}"`).join(',')})`)
        .not('prazo', 'is', null)
        .lt('prazo', now.toISOString()),

      supabase
        .from('obligations')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', `(${CLOSED_OBLIGATION_STATUSES.map((s) => `"${s}"`).join(',')})`)
        .not('prazo', 'is', null)
        .gte('prazo', now.toISOString())
        .lte('prazo', in48h.toISOString()),
    ]);

    if (exceptionsResult.error) {
      console.warn('[ATTENTION INDICATORS] falha ao contar exceções:', exceptionsResult.error.message);
    }
    if (overdueResult.error) {
      console.warn('[ATTENTION INDICATORS] falha ao contar prazos vencidos:', overdueResult.error.message);
    }
    if (next48hResult.error) {
      console.warn('[ATTENTION INDICATORS] falha ao contar prazos em 48h:', next48hResult.error.message);
    }

    return {
      openExceptions: exceptionsResult.error ? 0 : Number(exceptionsResult.count || 0),
      urgentDeadlines:
        (overdueResult.error ? 0 : Number(overdueResult.count || 0)) +
        (next48hResult.error ? 0 : Number(next48hResult.count || 0)),
    };
  }
}

export const attentionIndicatorsService = new AttentionIndicatorsService();

export const ATTENTION_INDICATORS_REFRESH_EVENT = 'sb:attention-indicators-refresh';

export function requestAttentionIndicatorsRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ATTENTION_INDICATORS_REFRESH_EVENT));
  }
}
