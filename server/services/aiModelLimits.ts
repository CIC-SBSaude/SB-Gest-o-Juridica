// Fallback limits. The provider can report a lower per-project limit in 429 details.
const LIMITS: Record<string, { providerRpm: number; providerTpm: number; providerRpd: number }> = {
  'gemini-3-flash-preview': { providerRpm: 15, providerTpm: 250000, providerRpd: 20 },
  'gemini-flash-lite-latest': { providerRpm: 15, providerTpm: 250000, providerRpd: 500 },
  'gemini-3.8-flash': { providerRpm: 5, providerTpm: 250000, providerRpd: 20 },
  'gemini-3.5-flash-lite': { providerRpm: 15, providerTpm: 250000, providerRpd: 500 },
  'gemini-3.5-flash': { providerRpm: 5, providerTpm: 250000, providerRpd: 20 },
};

export function resolveModelLimits(model: string, raw: any = {}) {
  const defaults = LIMITS[model] || { providerRpm: 0, providerTpm: 0, providerRpd: 0 };
  const config = raw.model_limits?.[model] || {};
  const read = (key: string, ceiling: number) => {
    const value = config[key];
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
      ? Math.min(ceiling, Math.floor(Number(value))) : ceiling;
  };
  return {
    providerRpm: read('provider_rpm', defaults.providerRpm),
    providerTpm: read('provider_tpm', defaults.providerTpm),
    providerRpd: read('provider_rpd', defaults.providerRpd),
  };
}
