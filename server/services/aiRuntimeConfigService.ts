import { ENV } from '../config/env';
import { resolveModelLimits } from './aiModelLimits';
import { observedDailyRequestQuota } from './aiProviderQuotaEvidence';

export interface AiRuntimeConfig {
  model: string;
  providerRpd: number;
  providerRpdSource: 'PROVIDER_ERROR' | 'CONFIGURED';
  providerRpdObservedAt: string | null;
  providerRpm: number;
  providerTpm: number;
  safetyPercent: number;
  contextWindowTokens: number;
  effectiveRpd: number;
  effectiveRpm: number;
  effectiveTpm: number;
  source: 'SYSTEM_CONFIG' | 'BACKEND_FALLBACK';
}

const DEFAULTS = {
  model: ENV.gemini.model,
  providerRpd: 20,
  providerRpm: 5,
  providerTpm: 250000,
  safetyPercent: 90,
  contextWindowTokens: 1048576,
};

const positiveInt = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export async function getAiRuntimeConfig(supabase: any, requestedModel?: string): Promise<AiRuntimeConfig> {
  const { data, error } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'ai_engine')
    .maybeSingle();

  if (error) throw new Error(`Falha ao consultar system_config.ai_engine: ${error.message}`);

  const raw: any = data?.value || {};
  const source: AiRuntimeConfig['source'] = data?.value ? 'SYSTEM_CONFIG' : 'BACKEND_FALLBACK';

  const model = String(requestedModel || raw.model || DEFAULTS.model || '').trim();
  if (!model) throw new Error('Modelo Gemini não configurado.');

  const limits = resolveModelLimits(model, raw);
  const { data: health } = await supabase.from('ai_model_health')
    .select('last_error_message,last_failure_at')
    .eq('model', model).maybeSingle();
  const errorQuota = observedDailyRequestQuota(health?.last_error_message);
  const providerRpd = errorQuota?.limit ?? limits.providerRpd;
  const configuredCap = raw.model_limits?.[model]?.provider_rpd;
  const localRpdCap = configuredCap !== undefined && configuredCap !== null && Number.isFinite(Number(configuredCap))
    ? Math.max(0, Math.floor(Number(configuredCap))) : providerRpd;
  const { providerRpm, providerTpm } = limits;
  const safetyPercent = Math.max(10, Math.min(100, positiveInt(raw.safety_percent, DEFAULTS.safetyPercent)));
  const contextWindowTokens = positiveInt(raw.context_window_tokens, DEFAULTS.contextWindowTokens);

  return {
    model,
    providerRpd,
    providerRpdSource: errorQuota ? 'PROVIDER_ERROR' : 'CONFIGURED',
    providerRpdObservedAt: errorQuota ? health?.last_failure_at || null : null,
    providerRpm,
    providerTpm,
    safetyPercent,
    contextWindowTokens,
    effectiveRpd: Math.max(0, Math.floor(Math.min(providerRpd, localRpdCap) * safetyPercent / 100)),
    effectiveRpm: Math.max(0, Math.floor(providerRpm * safetyPercent / 100)),
    effectiveTpm: Math.max(0, Math.floor(providerTpm * safetyPercent / 100)),
    source,
  };
}
