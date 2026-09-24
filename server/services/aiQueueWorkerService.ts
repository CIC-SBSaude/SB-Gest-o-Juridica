import { getBackendSupabase } from '../integrations/supabase';
import { getAiRouterCapacityState } from './aiRouterService';
import { processEmailWithAi } from './emailAiProcessingService';
import { withAutomationLock } from './automationLockService';
import { isTransientSupabaseError } from './supabaseResilienceService';

export async function runAiQueueWorker() {
  return withAutomationLock('AI_QUEUE_WORKER', 600, async () => {
    const supabase = getBackendSupabase();
    if (!supabase) throw new Error('Supabase backend não configurado.');

    let processed = 0;
    let errors = 0;
    let pausedByQuota = false;

    while (true) {
      const capacity = await getAiRouterCapacityState(supabase);
      if (!capacity.available) {
        pausedByQuota = true;
        console.warn('[AI WORKER] router sem capacidade disponível; fila preservada', { states: capacity.states });
        break;
      }

      const { data: candidates, error } = await supabase
        .from('processed_emails')
        .select('id,received_at,metadata')
        .eq('status', 'PENDENTE_IA')
        .order('received_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        if (isTransientSupabaseError(error)) {
          console.warn('[AI WORKER] banco de dados temporariamente inacessível ao consultar fila:', error.message);
          return { processed, errors, pausedByQuota: false, transientDbError: true };
        }
        throw new Error(`Falha ao consultar fila de IA: ${error.message}`);
      }

      const retryCutoff = Date.now() - 15 * 60_000;
      const next = (candidates || []).find((item: any) => {
        const lastErrorAt = item?.metadata?.ai_worker_last_error_at;
        if (!lastErrorAt) return true;
        const timestamp = new Date(lastErrorAt).getTime();
        return !Number.isFinite(timestamp) || timestamp < retryCutoff;
      });

      if (!next?.id) break;

      try {
        const result = await processEmailWithAi({
          emailId: next.id,
          actorId: null,
          executionMode: 'AUTOMATIC',
          forceReanalysis: false,
        });
        if (result.paused) {
          pausedByQuota = true;
          break;
        }
        processed += 1;
      } catch (err: any) {
        errors += 1;
        if (isTransientSupabaseError(err)) {
          console.warn('[AI WORKER] erro temporário de banco/rede no item; interrompendo ciclo atual', {
            emailId: next.id,
            error: err?.message || String(err),
          });
          break;
        }
        console.error('[AI WORKER] falha isolada', { emailId: next.id, error: err?.message || String(err) });

        // Evita loop apertado no mesmo item e NÃO bloqueia os demais.
        // O item permanece PENDENTE_IA, recebe cooldown no metadata e será
        // elegível novamente em ciclo futuro.
        const { data: row } = await supabase.from('processed_emails').select('metadata').eq('id', next.id).maybeSingle();
        await supabase.from('processed_emails').update({
          metadata: {
            ...(row?.metadata || {}),
            ai_worker_last_error: String(err?.message || err).slice(0, 1500),
            ai_worker_last_error_code: String(err?.code || err?.aiState || 'AI_WORKER_ERROR').slice(0, 120),
            ai_worker_last_error_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }).eq('id', next.id);

        console.warn('[AI WORKER] item mantido PENDENTE_IA com cooldown; fila seguirá para o próximo item', {
          emailId: next.id,
          cooldownMinutes: 15,
        });
        continue;
      }
    }

    return { processed, errors, pausedByQuota };
  });
}
