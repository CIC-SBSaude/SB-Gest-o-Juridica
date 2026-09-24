import crypto from 'node:crypto';
import { getBackendSupabase } from '../integrations/supabase';
import { withAutomationLock } from './automationLockService';
import { generateManagementSuggestions } from './aiManagementSuggestionService';
import { getAiRouterCapacityState } from './aiRouterService';
import { isTransientSupabaseError } from './supabaseResilienceService';

type AutomationConfig = {
  enabled: boolean;
  debounceSeconds: number;
  workerBatchSize: number;
  maxAttempts: number;
  ordering: 'NEWEST_FIRST' | 'OLDEST_FIRST';
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getConfig(supabase: any): Promise<AutomationConfig> {
  const { data, error } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'ai_management_automation')
    .maybeSingle();

  if (error) throw new Error(`Falha ao consultar ai_management_automation: ${error.message}`);

  const raw = data?.value || {};
  return {
    enabled: raw.enabled === true,
    debounceSeconds: Math.max(0, Number(raw.debounce_seconds || 120)),
    workerBatchSize: Math.max(1, Math.min(25, Number(raw.worker_batch_size || 5))),
    maxAttempts: Math.max(1, Math.min(10, Number(raw.max_attempts || 3))),
    ordering: raw.ordering === 'OLDEST_FIRST' ? 'OLDEST_FIRST' : 'NEWEST_FIRST',
  };
}

async function recoverStaleItems(supabase: any) {
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('ai_management_refresh_queue')
    .update({
      status: 'PENDING',
      not_before: now,
      locked_at: null,
      locked_by: null,
      last_error: 'STALE_PROCESSING_RECOVERED',
      updated_at: now,
    })
    .eq('status', 'PROCESSING')
    .lt('locked_at', staleBefore);

  if (error) {
    if (isTransientSupabaseError(error)) {
      console.warn('[MGMT WORKER] banco inacessível ao recuperar itens PROCESSING antigos:', error.message);
    } else {
      console.error('[MGMT WORKER] falha ao recuperar itens PROCESSING antigos', {
        error: error.message,
      });
    }
  }
}

async function claimItem(supabase: any, item: any, workerToken: string) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('ai_management_refresh_queue')
    .update({
      status: 'PROCESSING',
      locked_at: now,
      locked_by: workerToken,
      updated_at: now,
    })
    .eq('id', item.id)
    .eq('status', 'PENDING')
    .eq('requested_at', item.requested_at)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Falha ao assumir item ${item.id}: ${error.message}`);
  return data || null;
}

async function finishSuccess(supabase: any, item: any, workerToken: string) {
  const now = new Date().toISOString();

  // Proteção de concorrência:
  // se um novo e-mail renovou a mesma fila durante a chamada Gemini,
  // requested_at mudou e NÃO marcamos esse novo refresh como DONE.
  const { data, error } = await supabase
    .from('ai_management_refresh_queue')
    .update({
      status: 'DONE',
      processed_at: now,
      locked_at: null,
      locked_by: null,
      last_error: null,
      updated_at: now,
    })
    .eq('id', item.id)
    .eq('status', 'PROCESSING')
    .eq('locked_by', workerToken)
    .eq('requested_at', item.requested_at)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Falha ao concluir item ${item.id}: ${error.message}`);

  if (!data) {
    console.log('[MGMT WORKER] refresh renovado durante processamento; novo PENDING preservado', {
      processId: item.process_id,
      queueId: item.id,
    });
    return false;
  }

  return true;
}

async function finishFailure(
  supabase: any,
  item: any,
  workerToken: string,
  error: any,
  maxAttempts: number,
) {
  const statusCode = Number(
    error?.status ||
    error?.response?.status ||
    (typeof error?.code === 'number' ? error.code : 0)
  );
  const message = String(error?.message || error || 'Erro desconhecido').slice(0, 1500);
  const routerExhausted = String(error?.code || '') === 'AI_ROUTER_EXHAUSTED' || /AI_ROUTER_EXHAUSTED|nenhum dos modelos configurados/i.test(message);
  const isTemporaryQuota = routerExhausted || statusCode === 429 || /limite seguro|PROVIDER_QUOTA_EXHAUSTED|RPD_REACHED|RPM_REACHED|TPM_REACHED|quota/i.test(message);
  const now = new Date();

  if (isTemporaryQuota) {
    const retryAt = new Date(now.getTime() + (routerExhausted ? 10 * 60_000 : 60_000)).toISOString();

    const { error: updateError } = await supabase
      .from('ai_management_refresh_queue')
      .update({
        status: 'PENDING',
        not_before: retryAt,
        locked_at: null,
        locked_by: null,
        last_error: `WAITING_AI_CAPACITY: ${message}`,
        updated_at: now.toISOString(),
      })
      .eq('id', item.id)
      .eq('status', 'PROCESSING')
      .eq('locked_by', workerToken)
      .eq('requested_at', item.requested_at);

    if (updateError) {
      console.error('[MGMT WORKER] falha ao devolver item por capacidade da IA', {
        queueId: item.id,
        error: updateError.message,
      });
    }

    return { terminal: false, quota: true };
  }

  const attempts = Number(item.attempts || 0) + 1;
  const terminal = attempts >= maxAttempts;
  const delayMinutes = Math.min(30, Math.max(1, 2 ** Math.max(0, attempts - 1)));
  const retryAt = new Date(now.getTime() + delayMinutes * 60_000).toISOString();

  const { error: updateError } = await supabase
    .from('ai_management_refresh_queue')
    .update({
      status: terminal ? 'ERROR' : 'PENDING',
      attempts,
      not_before: terminal ? item.not_before : retryAt,
      locked_at: null,
      locked_by: null,
      last_error: message,
      updated_at: now.toISOString(),
    })
    .eq('id', item.id)
    .eq('status', 'PROCESSING')
    .eq('locked_by', workerToken)
    .eq('requested_at', item.requested_at);

  if (updateError) {
    if (isTransientSupabaseError(updateError)) {
      console.warn('[MGMT WORKER] banco inacessível ao registrar erro do item:', updateError.message);
    } else {
      console.error('[MGMT WORKER] falha ao registrar erro do item', {
        queueId: item.id,
        error: updateError.message,
      });
    }
  }

  return { terminal, quota: false };
}

async function executeWorker() {
  const supabase = getBackendSupabase();
  if (!supabase) throw new Error('Supabase backend não configurado.');

  const config = await getConfig(supabase);
  if (!config.enabled) {
    return {
      enabled: false,
      processed: 0,
      succeeded: 0,
      failed: 0,
      deferred: 0,
    };
  }

  await recoverStaleItems(supabase);

  const capacity = await getAiRouterCapacityState(supabase);
  if (!capacity.available) return { enabled: true, processed: 0, succeeded: 0, failed: 0, deferred: 0, pausedByCapacity: true };

  const nowIso = new Date().toISOString();
  const ascending = config.ordering === 'OLDEST_FIRST';

  const { data: items, error } = await supabase
    .from('ai_management_refresh_queue')
    .select('*')
    .eq('status', 'PENDING')
    .lte('not_before', nowIso)
    .order('requested_at', { ascending })
    .limit(config.workerBatchSize);

  if (error) throw new Error(`Falha ao carregar fila gerencial: ${error.message}`);

  const workerToken = crypto.randomUUID();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let deferred = 0;

  for (const candidate of items || []) {
    const item = await claimItem(supabase, candidate, workerToken);
    if (!item) continue;

    processed += 1;

    console.log('[MGMT WORKER] gerando sugestões', {
      queueId: item.id,
      processId: item.process_id,
      requestedAt: item.requested_at,
      attempts: item.attempts,
    });

    try {
      await generateManagementSuggestions({
        supabase,
        processId: item.process_id,
        actorId: null,
        generationSource: 'AUTO',
        queueId: item.id,
        queueRequestedAt: item.requested_at,
      });

      const finalized = await finishSuccess(supabase, item, workerToken);
      if (finalized) {
        succeeded += 1;
        console.log('[MGMT WORKER] sugestões geradas', {
          queueId: item.id,
          processId: item.process_id,
        });
      }
    } catch (error: any) {
      const result = await finishFailure(
        supabase,
        item,
        workerToken,
        error,
        config.maxAttempts,
      );

      if (result.quota) {
        deferred += 1;
        console.log('[MGMT WORKER] capacidade da IA indisponível; fila preservada', {
          queueId: item.id,
          processId: item.process_id,
          error: error?.message || String(error),
        });

        // Não insistimos no restante do lote quando a governança/fornecedor
        // acabou de dizer que a capacidade está indisponível.
        break;
      }

      failed += 1;
      if (isTransientSupabaseError(error)) {
        console.warn('[MGMT WORKER] falha transitória de banco durante item:', error?.message || error);
        break;
      }
      console.error('[MGMT WORKER] falha isolada', {
        queueId: item.id,
        processId: item.process_id,
        terminal: result.terminal,
        error: error?.message || String(error),
      });
    }

    // Pequeno espaçamento para evitar rajada desnecessária de chamadas.
    await sleep(750);
  }

  return {
    enabled: true,
    processed,
    succeeded,
    failed,
    deferred,
    ordering: config.ordering,
    batchSize: config.workerBatchSize,
  };
}

export async function runManagementSuggestionWorker() {
  return withAutomationLock(
    'AI_MANAGEMENT_SUGGESTIONS',
    900,
    executeWorker,
  );
}
