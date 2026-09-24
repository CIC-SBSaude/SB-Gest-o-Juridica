export function isTransientSupabaseError(error: any): boolean {
  if (!error) return false;

  const status = Number(
    error?.status ??
    error?.statusCode ??
    error?.response?.status ??
    (typeof error?.code === 'number' ? error.code : 0)
  );
  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  const message = String(
    error?.message ||
    error?.details ||
    error?.hint ||
    error?.cause?.message ||
    error || ''
  );

  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if ([
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ERR_NAME_NOT_RESOLVED',
  ].includes(code)) return true;

  return /gateway\s*timeout|timed?\s*out|timeout|fetch\s*failed|connection\s*(reset|refused|closed)|socket\s*hang\s*up|upstream|temporar(?:y|ily)\s+unavailable|bad\s+gateway|service\s+unavailable|enotfound|econnrefused|enetunreach|ehostunreach|network\s*error/i.test(message);
}

export function isConnectivityError(error: any): boolean {
  return isTransientSupabaseError(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withSupabaseRetry<T>(
  operation: () => PromiseLike<T>,
  options: {
    label: string;
    attempts?: number;
    delaysMs?: number[];
  },
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const delays = options.delaysMs?.length ? options.delaysMs : [350, 900, 1800];

  let lastThrown: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result: any = await operation();
      const error = result?.error;
      if (!error || !isTransientSupabaseError(error) || attempt >= attempts) {
        return result as T;
      }

      const delayMs = delays[Math.min(attempt - 1, delays.length - 1)] ?? 1000;
      console.warn('[SUPABASE RESILIENCE] falha transitória; nova tentativa agendada', {
        operation: options.label,
        attempt,
        maxAttempts: attempts,
        delayMs,
        error: String(error?.message || error),
      });
      await sleep(delayMs);
    } catch (error) {
      lastThrown = error;
      if (!isTransientSupabaseError(error) || attempt >= attempts) throw error;

      const delayMs = delays[Math.min(attempt - 1, delays.length - 1)] ?? 1000;
      console.warn('[SUPABASE RESILIENCE] exceção transitória; nova tentativa agendada', {
        operation: options.label,
        attempt,
        maxAttempts: attempts,
        delayMs,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }

  throw lastThrown instanceof Error ? lastThrown : new Error(`Falha transitória em ${options.label}`);
}
