import { providerDayKey, providerDayStart, providerNextReset } from './aiQuotaClock';
import { readProviderUsage } from './aiProviderUsage';
import { getAiRuntimeConfig } from './aiRuntimeConfigService';

export interface AiBudgetState {
  allowed: boolean;
  reason: 'OK' | 'PROVIDER_QUOTA_EXHAUSTED' | 'RPD_REACHED' | 'RPM_REACHED' | 'TPM_REACHED';
  model: string;
  configSource: string;
  safetyPercent: number;
  requestsToday: number;
  inputTokensToday: number;
  outputTokensToday: number;
  requestsCurrentMinute: number;
  inputTokensCurrentMinute: number;
  outputTokensCurrentMinute: number;
  tokensCurrentMinute: number;
  providerRpd: number;
  providerRpdSource: 'PROVIDER_ERROR' | 'CONFIGURED';
  providerRpdObservedAt: string | null;
  providerRpm: number;
  providerTpm: number;
  effectiveRpd: number;
  effectiveRpm: number;
  effectiveTpm: number;
  contextWindowTokens: number;
  queuePending: number;
  estimatedTokensForNextRequest: number;
  providerDayKey: string;
  providerDayStart: string;
  nextResetAt: string;
  quotaExhaustedAt: string | null;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function minuteBucketUtc() {
  const d = new Date();
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

export async function getAiBudgetState(
  supabase: any,
  options?: { estimatedTokensForNextRequest?: number; model?: string }
): Promise<AiBudgetState> {
  const cfg = await getAiRuntimeConfig(supabase, options?.model);
  const estimated = Math.max(0, Number(options?.estimatedTokensForNextRequest || 0));
  const model = String(options?.model || cfg.model || '').trim();

  const now = new Date();
  const start = providerDayStart(now);
  const dayKey = providerDayKey(now);
  const nextResetAt = providerNextReset(now);
  const [providerUsage, minuteResult, queueResult] = await Promise.all([
    readProviderUsage(supabase, model, start),
    supabase
      .from('ai_usage_minute')
      .select('requests_count,input_tokens,output_tokens')
      .eq('minute_bucket', minuteBucketUtc())
      .eq('model', model)
      .maybeSingle(),
    supabase
      .from('processed_emails')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDENTE_IA'),
  ]);

  if (minuteResult.error) throw new Error(`Falha ao consultar uso por minuto da IA: ${minuteResult.error.message}`);
  if (queueResult.error) throw new Error(`Falha ao consultar fila pendente da IA: ${queueResult.error.message}`);

  const requestsToday = providerUsage.requests;
  const inputTokensToday = providerUsage.inputTokens;
  const outputTokensToday = providerUsage.outputTokens;
  const requestsCurrentMinute = Number(minuteResult.data?.requests_count || 0);
  const inputTokensCurrentMinute = Number(minuteResult.data?.input_tokens || 0);
  const outputTokensCurrentMinute = Number(minuteResult.data?.output_tokens || 0);
  const tokensCurrentMinute = inputTokensCurrentMinute + outputTokensCurrentMinute;

  let reason: AiBudgetState['reason'] = 'OK';
  if (providerUsage.exhausted) reason = 'PROVIDER_QUOTA_EXHAUSTED';
  else if (requestsToday >= cfg.effectiveRpd) reason = 'RPD_REACHED';
  else if (requestsCurrentMinute >= cfg.effectiveRpm) reason = 'RPM_REACHED';
  else if (tokensCurrentMinute + estimated > cfg.effectiveTpm) reason = 'TPM_REACHED';

  return {
    allowed: reason === 'OK',
    reason,
    model,
    configSource: cfg.source,
    safetyPercent: cfg.safetyPercent,
    requestsToday,
    inputTokensToday,
    outputTokensToday,
    requestsCurrentMinute,
    inputTokensCurrentMinute,
    outputTokensCurrentMinute,
    tokensCurrentMinute,
    providerRpd: cfg.providerRpd,
    providerRpdSource: cfg.providerRpdSource,
    providerRpdObservedAt: cfg.providerRpdObservedAt,
    providerRpm: cfg.providerRpm,
    providerTpm: cfg.providerTpm,
    effectiveRpd: cfg.effectiveRpd,
    effectiveRpm: cfg.effectiveRpm,
    effectiveTpm: cfg.effectiveTpm,
    contextWindowTokens: cfg.contextWindowTokens,
    queuePending: Number(queueResult.count || 0),
    estimatedTokensForNextRequest: estimated,
    providerDayKey: dayKey,
    providerDayStart: start,
    nextResetAt,
    quotaExhaustedAt: providerUsage.quotaExhaustedAt || null,
  };
}

export async function recordAiUsage(params: {
  supabase: any;
  model?: string;
  promptTokens?: number;
  candidateTokens?: number;
  totalTokens?: number;
}) {
  const { supabase } = params;
  const cfg = await getAiRuntimeConfig(supabase);
  const model = params.model?.trim() || cfg.model;
  const inputTokens = Math.max(0, Number(params.promptTokens || 0));
  const outputTokens = Math.max(0, Number(params.candidateTokens || 0));

  const { error } = await supabase.rpc('increment_ai_usage_rate_window', {
    p_usage_date: todayUtc(),
    p_minute_bucket: new Date().toISOString(),
    p_model: model,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
  });

  if (error) throw new Error(`Falha ao registrar consumo RPD/RPM/TPM da IA: ${error.message}`);
}

export async function markAiQuotaExhausted(supabase: any, modelOverride?: string) {
  const cfg = await getAiRuntimeConfig(supabase);
  const usageDate = todayUtc();
  const model = modelOverride?.trim() || cfg.model;
  const nowIso = new Date().toISOString();

  const { data: existing, error: readError } = await supabase
    .from('ai_usage_daily')
    .select('requests_count')
    .eq('usage_date', usageDate)
    .eq('model', model)
    .maybeSingle();

  if (readError) throw new Error(`Falha ao consultar estado de quota da IA: ${readError.message}`);

  if (existing) {
    const { error } = await supabase
      .from('ai_usage_daily')
      .update({ quota_exhausted_at: nowIso, updated_at: nowIso })
      .eq('usage_date', usageDate)
      .eq('model', model);
    if (error) throw new Error(`Falha ao registrar esgotamento de quota da IA: ${error.message}`);
    return;
  }

  const { error } = await supabase.from('ai_usage_daily').insert({
    usage_date: usageDate,
    model,
    requests_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    quota_exhausted_at: nowIso,
    updated_at: nowIso,
  });
  if (error) throw new Error(`Falha ao registrar esgotamento de quota da IA: ${error.message}`);
}
