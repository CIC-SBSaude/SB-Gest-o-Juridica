export function observedDailyRequestQuota(lastErrorMessage: unknown): { limit: number; metric: string } | null {
  if (typeof lastErrorMessage !== 'string' || !lastErrorMessage) return null;

  try {
    const stored = JSON.parse(lastErrorMessage);
    const provider = typeof stored?.message === 'string' ? JSON.parse(stored.message) : stored;
    const details = provider?.error?.details || provider?.details;
    if (!Array.isArray(details)) return null;

    const values = details.flatMap((detail: any) =>
      String(detail?.['@type'] || '').includes('QuotaFailure') && Array.isArray(detail.violations)
        ? detail.violations : []
    ).filter((violation: any) =>
      /PerDay/i.test(String(violation?.quotaId || '')) &&
      /requests/i.test(String(violation?.quotaMetric || ''))
    ).map((violation: any) => ({
      limit: Number(violation?.quotaValue),
      metric: String(violation?.quotaMetric || '').split('/').at(-1) || '',
    })).filter((value: { limit: number; metric: string }) => Number.isFinite(value.limit) && value.limit >= 0);

    return values.length ? values.sort((a: any, b: any) => a.limit - b.limit)[0] : null;
  } catch {
    return null;
  }
}

export function observedDailyRequestLimit(lastErrorMessage: unknown): number | null {
  return observedDailyRequestQuota(lastErrorMessage)?.limit ?? null;
}
