import crypto from 'node:crypto';
import { getBackendSupabase } from '../integrations/supabase';
import { withSupabaseRetry, isTransientSupabaseError } from './supabaseResilienceService';

const activeOwnedLocks = new Map<string, string>();

async function acquireOrRenewLock(
  supabase: any,
  lockName: string,
  owner: string,
  leaseSeconds: number,
  label: string,
) {
  return withSupabaseRetry<any>(
    () => supabase.rpc('try_acquire_automation_lock', {
      p_lock_name: lockName,
      p_owner_token: owner,
      p_lease_seconds: leaseSeconds,
    }),
    { label, attempts: 3 },
  );
}

export async function withAutomationLock<T>(
  lockName: string,
  leaseSeconds: number,
  fn: () => Promise<T>,
): Promise<{ acquired: boolean; result?: T }> {
  const supabase = getBackendSupabase();
  if (!supabase) throw new Error('Supabase backend não configurado.');

  const owner = crypto.randomUUID();

  const { data, error } = await acquireOrRenewLock(
    supabase,
    lockName,
    owner,
    leaseSeconds,
    `lock.acquire.${lockName}`,
  );

  if (error) {
    if (isTransientSupabaseError(error)) {
      console.warn(`[AUTOMATION LOCK] banco de dados temporariamente inacessível para '${lockName}'; adiando execução: ${error.message}`);
      return { acquired: false };
    }
    throw new Error(`Falha ao adquirir lock ${lockName}: ${error.message}`);
  }

  if (!data) {
    try {
      const { data: lockState, error: queryError } = await supabase
        .from('automation_locks')
        .select('*')
        .eq('lock_name', lockName)
        .maybeSingle();

      if (!queryError && lockState) {
        const lockedUntilStr = lockState.locked_until;
        const lockedUntilMs = new Date(lockedUntilStr).getTime();
        const nowMs = Date.now();
        const secondsUntilExpiry = Math.round((lockedUntilMs - nowMs) / 1000);
        const expired = nowMs > lockedUntilMs;
        const ownerToken = lockState.owner_token || '';
        const maskedOwner = ownerToken.length >= 8 ? `${ownerToken.slice(0, 4)}...${ownerToken.slice(-4)}` : ownerToken;
        const maskedCurrent = owner.length >= 8 ? `${owner.slice(0, 4)}...${owner.slice(-4)}` : owner;

        console.log(`[AUTOMATION LOCK] lock ocupado {\n  lockName: '${lockName}',\n  owner: '${maskedOwner}',\n  lockedUntil: '${lockedUntilStr}',\n  updatedAt: '${lockState.updated_at}',\n  secondsUntilExpiry: ${secondsUntilExpiry},\n  expired: ${expired},\n  currentInstanceToken: '${maskedCurrent}'\n}`);
      }
    } catch (e) {
      // ignore query errors for observability
    }
    return { acquired: false };
  }

  console.log(`[AUTOMATION LOCK] adquirido {\n  lockName: '${lockName}',\n  leaseSeconds: ${leaseSeconds}\n}`);

  activeOwnedLocks.set(lockName, owner);

  // Renova o lease enquanto o trabalho estiver ativo. Isso evita que execuções
  // longas (ex.: lote IMAP com anexos/OCR) ultrapassem o lease e permitam um
  // segundo worker concorrente. O mesmo owner_token torna a renovação idempotente.
  const renewEveryMs = Math.max(30_000, Math.floor(Math.max(30, leaseSeconds) * 1000 / 3));
  let renewing = false;
  const renewTimer = setInterval(() => {
    if (renewing) return;
    renewing = true;
    void acquireOrRenewLock(
      supabase,
      lockName,
      owner,
      leaseSeconds,
      `lock.renew.${lockName}`,
    ).then(({ data: renewed, error: renewError }: any) => {
      if (renewError || !renewed) {
        console.warn('[AUTOMATION LOCK] falha ao renovar lease; execução atual continuará e tentará novamente', {
          lockName,
          error: renewError?.message || (!renewed ? 'lock não renovado' : null),
        });
      }
    }).catch((renewException: any) => {
      console.warn('[AUTOMATION LOCK] exceção ao renovar lease; execução atual continuará', {
        lockName,
        error: renewException?.message || String(renewException),
      });
    }).finally(() => {
      renewing = false;
    });
  }, renewEveryMs);
  renewTimer.unref?.();

  try {
    return { acquired: true, result: await fn() };
  } finally {
    clearInterval(renewTimer);
    try {
      const { error: releaseError } = await withSupabaseRetry<any>(
        () => supabase.rpc('release_automation_lock', {
          p_lock_name: lockName,
          p_owner_token: owner,
        }),
        { label: `lock.release.${lockName}`, attempts: 3 },
      );

      if (releaseError) {
        if (isTransientSupabaseError(releaseError)) {
          console.warn('[AUTOMATION LOCK] falha transitória ao liberar lock; lease expirará automaticamente', {
            lockName,
            error: releaseError.message,
          });
        } else {
          console.error('[AUTOMATION LOCK] falha ao liberar lock; lease expirará automaticamente', {
            lockName,
            error: releaseError.message,
          });
        }
      } else {
        console.log(`[AUTOMATION LOCK] liberado {\n  lockName: '${lockName}'\n}`);
      }
    } catch (releaseException: any) {
      if (isTransientSupabaseError(releaseException)) {
        console.warn('[AUTOMATION LOCK] exceção transitória ao liberar lock; lease expirará automaticamente', {
          lockName,
          error: releaseException?.message || String(releaseException),
        });
      } else {
        console.error('[AUTOMATION LOCK] exceção ao liberar lock; lease expirará automaticamente', {
          lockName,
          error: releaseException?.message || String(releaseException),
        });
      }
    } finally {
      if (activeOwnedLocks.get(lockName) === owner) activeOwnedLocks.delete(lockName);
    }
  }
}

export async function releaseAllOwnedAutomationLocks(reason = 'shutdown') {
  const supabase = getBackendSupabase();
  if (!supabase || activeOwnedLocks.size === 0) return { attempted: 0, released: 0 };

  const snapshot = Array.from(activeOwnedLocks.entries());
  let released = 0;

  console.log('[AUTOMATION LOCK] liberando locks da instância antes do encerramento', {
    reason,
    count: snapshot.length,
    locks: snapshot.map(([lockName]) => lockName),
  });

  for (const [lockName, owner] of snapshot) {
    try {
      const { error } = await withSupabaseRetry<any>(
        () => supabase.rpc('release_automation_lock', {
          p_lock_name: lockName,
          p_owner_token: owner,
        }),
        { label: `lock.shutdown-release.${lockName}`, attempts: 2 },
      );

      if (error) {
        console.warn('[AUTOMATION LOCK] não foi possível liberar lock no encerramento; lease expirará', {
          lockName,
          error: error.message,
        });
        continue;
      } else {
        console.log(`[AUTOMATION LOCK] liberado {\n  lockName: '${lockName}'\n}`);
      }

      released += 1;
      if (activeOwnedLocks.get(lockName) === owner) activeOwnedLocks.delete(lockName);
    } catch (err: any) {
      console.warn('[AUTOMATION LOCK] exceção ao liberar lock no encerramento; lease expirará', {
        lockName,
        error: err?.message || String(err),
      });
    }
  }

  return { attempted: snapshot.length, released };
}
