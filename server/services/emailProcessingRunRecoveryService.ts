import { getBackendSupabase } from '../integrations/supabase';

import { isStaleEmailProcessingRun } from './emailProcessingRunRecoveryPolicy';

export interface StaleRunRecoveryOptions {
  /**
   * Trava de intenção: esta rotina só pode ser chamada de dentro do lock
   * distribuído IMAP_INGESTION. Ela não tenta adquirir o lock por conta própria.
   */
  exclusiveImapLockHeld: true;
  thresholdMinutes?: number;
  actorUserId?: string | null;
  reason?: string;
  now?: Date;
}

export interface StaleRunRecoveryResult {
  cutoff: string;
  found: number;
  recovered: number;
  skippedConcurrent: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Reconcilia RUNNING históricos que ficaram sem finalização após interrupção do
 * processo/container. Deve ser executado SOMENTE quando o chamador já possui o
 * lock distribuído IMAP_INGESTION, imediatamente antes de iniciar um novo run.
 *
 * Não apaga registros, não altera contadores e não tenta inferir sucesso. O run
 * órfão é encerrado como FAILED e recebe metadados explícitos de recuperação.
 */
export async function recoverStaleEmailProcessingRuns(
  options: StaleRunRecoveryOptions,
): Promise<StaleRunRecoveryResult> {
  if (options.exclusiveImapLockHeld !== true) {
    throw new Error('Recuperação de email_processing_runs exige lock exclusivo IMAP_INGESTION.');
  }

  const db = getBackendSupabase();
  if (!db) throw new Error('Supabase backend não configurado.');

  const now = options.now ?? new Date();
  const thresholdMinutes = Math.max(1, options.thresholdMinutes ?? 30);
  const cutoff = new Date(now.getTime() - thresholdMinutes * 60_000).toISOString();

  const { data, error } = await db
    .from('email_processing_runs')
    .select('id, started_at, status, metadata')
    .eq('status', 'RUNNING')
    .lt('started_at', cutoff);

  if (error) {
    throw new Error(`Falha ao localizar runs órfãos de e-mail: ${error.message}`);
  }

  const staleRuns = (data || []).filter((row: any) =>
    isStaleEmailProcessingRun(row, now.getTime(), thresholdMinutes),
  );

  let recovered = 0;
  let skippedConcurrent = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const row of staleRuns as any[]) {
    const id = String(row.id || '');
    if (!id) continue;

    const previousMetadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata
      : {};

    const recoveryMetadata = {
      ...previousMetadata,
      run_recovery: {
        code: 'ORPHANED_RUN_RECOVERY',
        recovered_at: now.toISOString(),
        previous_started_at: row.started_at ?? null,
        threshold_minutes: thresholdMinutes,
        actor_user_id: options.actorUserId ?? null,
        reason: options.reason ?? 'Novo ciclo IMAP adquiriu lock exclusivo; run histórico permaneceu RUNNING sem finalização.',
      },
    };

    const { data: updated, error: updateError } = await db
      .from('email_processing_runs')
      .update({
        status: 'FAILED',
        finished_at: now.toISOString(),
        metadata: recoveryMetadata,
      })
      .eq('id', id)
      .eq('status', 'RUNNING')
      .select('id')
      .maybeSingle();

    if (updateError) {
      errors.push({ id, error: updateError.message });
      continue;
    }

    if (!updated) {
      skippedConcurrent += 1;
      continue;
    }

    recovered += 1;
  }

  return {
    cutoff,
    found: staleRuns.length,
    recovered,
    skippedConcurrent,
    errors,
  };
}
