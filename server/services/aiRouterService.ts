import { aiAttemptGate, AiAdmissionError } from './aiAttemptGate';
import { GoogleGenAI } from '@google/genai';
import { ENV } from '../config/env';
import { getAiBudgetState, markAiQuotaExhausted, recordAiUsage } from './aiUsageService';

export const AI_MODEL_CHAIN = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
] as const;

const CIRCUIT_MINUTES = 10;
const RETRY_503_DELAYS_MS = [3000, 8000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type AiRouterResult = {
  response: any;
  model: string;
  callsMade: number;
  triedModels: Array<{ model: string; outcome: string }>;
};

function errorStatus(error: any) {
  return Number(error?.status || error?.response?.status || (typeof error?.code === 'number' ? error.code : 0));
}

function errorMessage(error: any) {
  return String(error?.message || error || 'Erro desconhecido');
}

function isTimeout(error: any) {
  const code = String(error?.code || '');
  const message = errorMessage(error);
  return error?.name === 'AbortError' || code === 'GEMINI_TIMEOUT' || /GEMINI_TIMEOUT|timed?\s*out|timeout/i.test(message);
}

function isAvailabilityError(error: any) {
  const status = errorStatus(error);
  const message = errorMessage(error);
  return [502, 503, 504].includes(status) || /UNAVAILABLE|high demand|temporarily unavailable|overloaded/i.test(message);
}

type ProviderLimitClassification = 'DAILY_QUOTA' | 'PROVIDER_QUOTA_EXHAUSTED' | 'RATE_LIMIT' | 'UNKNOWN_429' | null;

function extractFullErrorText(error: any): string {
  const parts: string[] = [];
  if (error?.message) parts.push(String(error.message));
  if (error?.code) parts.push(String(error.code));
  if (error?.status) parts.push(String(error.status));
  if (error?.stack) parts.push(String(error.stack));
  try {
    if (error?.error) parts.push(JSON.stringify(error.error));
  } catch {}
  try {
    if (error?.response?.data) parts.push(JSON.stringify(error.response.data));
  } catch {}
  try {
    if (error?.details) parts.push(JSON.stringify(error.details));
  } catch {}
  try {
    parts.push(JSON.stringify(error));
  } catch {}
  return parts.join(' ');
}

export function hasLimitZeroEvidence(error: any): boolean {
  // 1. Inspeção estruturada no array de details
  const detailsList: any[] = [
    ...(Array.isArray(error?.details) ? error.details : []),
    ...(Array.isArray(error?.error?.details) ? error.error.details : []),
    ...(Array.isArray(error?.response?.data?.error?.details) ? error.response.data.error.details : []),
    ...(Array.isArray(error?.response?.data?.details) ? error.response.data.details : []),
  ];

  for (const detail of detailsList) {
    const isQuotaFailure = detail?.['@type']?.includes('QuotaFailure') || detail?.type?.includes('QuotaFailure');
    const violations = Array.isArray(detail?.violations) ? detail.violations : [];
    for (const v of violations) {
      const metric = String(v?.quotaMetric || v?.metric || '');
      const limit = v?.limit;
      const desc = String(v?.description || '');
      if (limit === 0 || limit === '0' || (limit != null && String(limit).trim() !== '' && Number(limit) === 0) || /limit["']?\s*[:=]\s*"?0(\.0+)?"?\b/i.test(desc)) {
        return true;
      }
      if (metric.includes('free_tier') && (limit === 0 || limit === '0' || (limit != null && String(limit).trim() !== '' && Number(limit) === 0) || /limit["']?\s*[:=]\s*"?0(\.0+)?"?\b/i.test(desc))) {
        return true;
      }
    }
    if (isQuotaFailure) {
      const detailStr = JSON.stringify(detail);
      if (/limit["']?\s*[:=]\s*"?0(\.0+)?"?\b/i.test(detailStr)) {
        return true;
      }
    }
  }

  // 2. Inspeção textual em todo o payload / mensagem
  const fullText = extractFullErrorText(error);

  // Mensagem contendo "limit: 0", "limit = 0", '"limit": 0', '"limit": "0"', 'limit: 0.0'
  if (/limit["']?\s*[:=]\s*"?0(\.0+)?"?\b/i.test(fullText)) {
    return true;
  }

  // QuotaFailure com limit 0
  if (/QuotaFailure/i.test(fullText) && /limit["']?\s*[:=]\s*"?0(\.0+)?"?\b/i.test(fullText)) {
    return true;
  }

  return false;
}

function providerErrorCode(error: any) {
  const candidates = [
    error?.error?.code,
    error?.response?.data?.error?.code,
    error?.response?.data?.code,
    error?.code,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().toLowerCase();
  }

  return '';
}

function providerErrorStatus(error: any) {
  const candidates = [
    error?.error?.status,
    error?.response?.data?.error?.status,
    error?.response?.data?.status,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().toUpperCase();
  }

  return '';
}

export function classifyProviderLimit(error: any): ProviderLimitClassification {
  const status = errorStatus(error);
  const code = providerErrorCode(error);
  const providerStatus = providerErrorStatus(error);
  const fullText = extractFullErrorText(error);

  // 1. Saldo/crédito do projeto esgotado não é rate limit temporário.
  // Enquanto o billing não for regularizado, todos os modelos do mesmo projeto tendem a responder 429.
  if (/prepayment credits are depleted|credits are depleted|manage your project and billing|billing#prepay|insufficient(?:\s+prepaid)?\s+credits|prepaid\s+balance/i.test(fullText)) {
    return 'PROVIDER_QUOTA_EXHAUSTED';
  }

  // Bloqueio até o próximo dia exige evidência explícita de limite diário.
  if (/PerDay|per day|daily quota|requests[_\s-]*per[_\s-]*day|\bRPD\b/i.test(fullText)) {
    return 'DAILY_QUOTA';
  }

  // 2. Somente classificar como RATE_LIMIT quando:
  // - houver retryDelay curto / "retry in Xs" ou códigos temporários
  // - E NÃO houver evidência de limit = 0
  // - E NÃO houver evidência explícita de quota diária/estrutural esgotada.
  if (code === 'rate_limit_exceeded' || code === 'too_many_requests') {
    return 'RATE_LIMIT';
  }

  if (/retryDelay|retry in \d+(\.\d+)?s|retry after/i.test(fullText)) {
    return 'RATE_LIMIT';
  }

  if (/per minute|per second|rate limit|too many requests|\bRPM\b|\bTPM\b/i.test(fullText)) {
    return 'RATE_LIMIT';
  }

  // 3. UNKNOWN_429 continua reservado para 429 sem evidência suficiente para nenhuma das categorias acima.
  if (status === 429 || code === 'quota_exceeded' || providerStatus === 'RESOURCE_EXHAUSTED' || /RESOURCE_EXHAUSTED|quota exceeded/i.test(fullText)) {
    return 'UNKNOWN_429';
  }

  return null;
}

function providerErrorSummary(error: any) {
  return {
    httpStatus: errorStatus(error) || null,
    providerCode: providerErrorCode(error) || null,
    providerStatus: providerErrorStatus(error) || null,
    message: errorMessage(error).slice(0, 1200),
  };
}

function isModelUnavailable(error: any) {
  const status = errorStatus(error);
  const message = errorMessage(error);
  return status === 404 || /model .*not found|model .*not available|unsupported model/i.test(message);
}

function isFatalRequestError(error: any) {
  const status = errorStatus(error);
  return [400, 401, 403].includes(status);
}

async function readHealth(supabase: any, model: string) {
  try {
    const { data, error } = await supabase
      .from('ai_model_health')
      .select('model,circuit_open_until,last_error_code,last_error_message,last_failure_at,last_success_at')
      .eq('model', model)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

async function markModelSuccess(supabase: any, model: string) {
  try {
    const now = new Date().toISOString();
    await supabase.from('ai_model_health').upsert({
      model,
      circuit_open_until: null,
      last_error_code: null,
      last_error_message: null,
      last_success_at: now,
      updated_at: now,
    }, { onConflict: 'model' });
  } catch {
    // Persistência de saúde é auxiliar; nunca derruba a chamada bem-sucedida.
  }
}

async function markModelFailure(supabase: any, model: string, code: string, message: string, openMinutes = CIRCUIT_MINUTES) {
  try {
    const now = new Date();
    const until = new Date(now.getTime() + openMinutes * 60_000).toISOString();
    await supabase.from('ai_model_health').upsert({
      model,
      circuit_open_until: until,
      last_error_code: code,
      last_error_message: message.slice(0, 12000),
      last_failure_at: now.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: 'model' });
  } catch {
    // Best effort. O router continua funcionando mesmo antes da migration da tabela de saúde.
  }
}

function orderedModels(preferredModel?: string | null) {
  const allowed = [...AI_MODEL_CHAIN];
  if (!preferredModel || !allowed.includes(preferredModel as any)) return allowed;
  return [preferredModel, ...allowed.filter((m) => m !== preferredModel)];
}

export function getAiRouterModelChain() {
  return [...AI_MODEL_CHAIN];
}

export async function generateContentWithAiRouter(params: {
  supabase: any;
  contents: any;
  config?: any;
  estimatedTokens?: number;
  purpose?: string;
  preferredModel?: string | null;
  timeoutMs?: number;
}): Promise<AiRouterResult> {
  if (!ENV.gemini.apiKey) {
    throw Object.assign(new Error('GEMINI_API_KEY não configurada.'), { status: 503, code: 'AI_NO_KEY' });
  }

  const timeoutMs = Math.max(1000, Number(params.timeoutMs || ENV.gemini.timeoutMs));
  const ai = new GoogleGenAI({ apiKey: ENV.gemini.apiKey, httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } } });
  const triedModels: AiRouterResult['triedModels'] = [];
  let callsMade = 0;
  let lastError: any = null;

  for (const model of orderedModels(params.preferredModel)) {
    const health = await readHealth(params.supabase, model);
    const openUntil = health?.circuit_open_until ? new Date(health.circuit_open_until).getTime() : 0;
    if (openUntil > Date.now()) {
      triedModels.push({ model, outcome: `CIRCUIT_OPEN_UNTIL_${health.circuit_open_until}` });
      console.warn('[AI ROUTER] modelo temporariamente suspenso', {
        model,
        purpose: params.purpose || 'GENERIC',
        circuitOpenUntil: health.circuit_open_until,
      });
      continue;
    }

    const budget = await getAiBudgetState(params.supabase, {
      estimatedTokensForNextRequest: Math.max(0, Number(params.estimatedTokens || 0)),
      model,
    });

    if (!budget.allowed) {
      triedModels.push({ model, outcome: `BUDGET_${budget.reason}` });
      console.warn('[AI ROUTER] modelo ignorado pela governança', {
        model,
        purpose: params.purpose || 'GENERIC',
        reason: budget.reason,
        rpd: `${budget.requestsToday}/${budget.effectiveRpd}`,
        rpm: `${budget.requestsCurrentMinute}/${budget.effectiveRpm}`,
        tpm: `${budget.tokensCurrentMinute}/${budget.effectiveTpm}`,
      });
      continue;
    }

    const maxAttempts = RETRY_503_DELAYS_MS.length + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        console.log('[AI ROUTER] chamada', {
          model,
          priority: AI_MODEL_CHAIN.indexOf(model as any) + 1,
          purpose: params.purpose || 'GENERIC',
          attempt,
          maxAttempts,
        });

        const response: any = await aiAttemptGate.run(model, async () => {
          const current = await getAiBudgetState(params.supabase, {
            model, estimatedTokensForNextRequest: Math.max(0, Number(params.estimatedTokens || 0)),
          });
          const latestHealth = await readHealth(params.supabase, model);
          if (Date.parse(latestHealth?.circuit_open_until || '') > Date.now()) {
            return { ...current, allowed: false, reason: 'CIRCUIT_OPEN' };
          }
          return current;
        }, async () => {
          callsMade += 1;
          if (params.purpose === 'LEGAL_INTERPRETATION' && attempt === 1 && typeof params.contents === 'string') {
            const interaction = await ai.interactions.create({
              model,
              input: params.contents,
              store: false,
              response_format: { type: 'text', mime_type: 'application/json' },
            }, { timeout: timeoutMs, maxRetries: 0 });
            if (!interaction.output_text?.trim()) {
              throw Object.assign(new Error('Interactions API retornou resposta vazia.'), { status: 503 });
            }
            const usage = interaction.usage || {};
            return {
              text: interaction.output_text || '',
              usageMetadata: {
                promptTokenCount: usage.total_input_tokens || 0,
                candidatesTokenCount: usage.total_output_tokens || 0,
                totalTokenCount: usage.total_tokens || 0,
              },
            };
          }
          return ai.models.generateContent({
            model,
            contents: params.contents,
            config: {
              ...params.config,
              httpOptions: { ...params.config?.httpOptions, timeout: timeoutMs, retryOptions: { attempts: 1 } },
            },
          });
        });

        const usage: any = response?.usageMetadata || {};
        await recordAiUsage({
          supabase: params.supabase,
          model,
          promptTokens: usage.promptTokenCount,
          candidateTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
        });
        await markModelSuccess(params.supabase, model);

        triedModels.push({ model, outcome: 'SUCCESS' });
        console.log('[AI ROUTER] sucesso', {
          model,
          purpose: params.purpose || 'GENERIC',
          api: params.purpose === 'LEGAL_INTERPRETATION' && attempt === 1 ? 'INTERACTIONS' : 'GENERATE_CONTENT',
          fallbackUsed: model !== AI_MODEL_CHAIN[0],
        });

        return { response, model, callsMade, triedModels };
      } catch (error: any) {
        if (error instanceof AiAdmissionError) {
          triedModels.push({ model, outcome: `BUDGET_${error.reason}` });
          break;
        }
        lastError = error;
        const status = errorStatus(error);
        const message = errorMessage(error);

        if (isFatalRequestError(error)) {
          triedModels.push({ model, outcome: `FATAL_${status || 'REQUEST'}` });
          throw error;
        }

        const providerLimit = classifyProviderLimit(error);
        if (providerLimit) {
          const evidence = providerErrorSummary(error);
          const persistDailyBlock = providerLimit === 'DAILY_QUOTA' || providerLimit === 'PROVIDER_QUOTA_EXHAUSTED';

          triedModels.push({ model, outcome: providerLimit });

          if (providerLimit === 'PROVIDER_QUOTA_EXHAUSTED') {
            // Saldo pré-pago é do projeto/API key, não de um modelo isolado.
            // Marcar toda a cadeia evita gastar mais duas chamadas sabendo que o mesmo projeto está sem crédito.
            await Promise.all(AI_MODEL_CHAIN.map(async (chainModel) => {
              await markAiQuotaExhausted(params.supabase, chainModel).catch(() => undefined);
              await markModelFailure(
                params.supabase,
                chainModel,
                providerLimit,
                JSON.stringify({ ...evidence, classification: providerLimit }),
                60
              );
            }));
          } else {
            if (persistDailyBlock) {
              await markAiQuotaExhausted(params.supabase, model).catch(() => undefined);
            }

            // Limites temporários/ambíguos recebem somente circuit breaker curto.
            // Assim a fila se recupera sozinha sem ficar bloqueada até o dia seguinte.
            const openMinutes = persistDailyBlock ? 15 : 5;
            await markModelFailure(
              params.supabase,
              model,
              providerLimit,
              JSON.stringify({ ...evidence, classification: providerLimit }),
              openMinutes
            );
          }

          console.warn('[AI ROUTER] limite do provedor; usando fallback', {
            model,
            purpose: params.purpose || 'GENERIC',
            classification: providerLimit,
            persistedDailyBlock: persistDailyBlock,
            ...evidence,
          });
          break;
        }

        if (isTimeout(error)) {
          triedModels.push({ model, outcome: 'TIMEOUT' });
          await markModelFailure(params.supabase, model, 'TIMEOUT', message);
          console.warn('[AI ROUTER] timeout; usando fallback', {
            model,
            purpose: params.purpose || 'GENERIC',
            timeoutMs,
          });
          break;
        }

        if (isModelUnavailable(error)) {
          triedModels.push({ model, outcome: 'MODEL_UNAVAILABLE' });
          await markModelFailure(params.supabase, model, 'MODEL_UNAVAILABLE', message, 60);
          console.warn('[AI ROUTER] modelo indisponível/não suportado; usando fallback', {
            model,
            purpose: params.purpose || 'GENERIC',
          });
          break;
        }

        if (isAvailabilityError(error)) {
          if (attempt < maxAttempts) {
            const baseDelayMs = RETRY_503_DELAYS_MS[attempt - 1] || RETRY_503_DELAYS_MS[RETRY_503_DELAYS_MS.length - 1];
            const delayMs = baseDelayMs + Math.floor(Math.random() * 1000);
            console.warn('[AI ROUTER] indisponibilidade temporária; nova tentativa no mesmo modelo', {
              model,
              purpose: params.purpose || 'GENERIC',
              attempt,
              nextAttempt: attempt + 1,
              delayMs,
            });
            await sleep(delayMs);
            continue;
          }

          triedModels.push({ model, outcome: 'UNAVAILABLE' });
          await markModelFailure(params.supabase, model, 'UNAVAILABLE', message);
          console.warn('[AI ROUTER] modelo indisponível após retries; usando fallback', {
            model,
            purpose: params.purpose || 'GENERIC',
          });
          break;
        }

        triedModels.push({ model, outcome: `ERROR_${status || 'UNKNOWN'}` });
        throw error;
      }
    }
  }

  const error: any = new Error('AI_ROUTER_EXHAUSTED: nenhum dos modelos configurados conseguiu atender a chamada.');
  error.code = 'AI_ROUTER_EXHAUSTED';
  error.status = 503;
  error.triedModels = triedModels;
  error.cause = lastError;
  throw error;
}

export async function getAiRouterCapacityState(supabase: any) {
  const states: Array<{ model: string; available: boolean; reason: string }> = [];
  if (!ENV.gemini.apiKey) return { available: false, model: null, states: AI_MODEL_CHAIN.map(model => ({ model, available: false, reason: 'AI_NO_KEY' })) };
  for (const model of AI_MODEL_CHAIN) {
    const health = await readHealth(supabase, model);
    const openUntil = health?.circuit_open_until ? new Date(health.circuit_open_until).getTime() : 0;
    if (openUntil > Date.now()) {
      states.push({ model, available: false, reason: 'CIRCUIT_OPEN' });
      continue;
    }
    const budget = await getAiBudgetState(supabase, { model });
    states.push({ model, available: budget.allowed, reason: budget.reason });
    if (budget.allowed) return { available: true, model, states };
  }
  return { available: false, model: null, states };
}
