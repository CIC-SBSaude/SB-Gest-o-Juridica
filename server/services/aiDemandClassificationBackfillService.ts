import { getBackendSupabase } from '../integrations/supabase';
import { ENV } from '../config/env';
import { getAiRuntimeConfig } from './aiRuntimeConfigService';
import { parseGeminiJson, buildInvalidJsonRetryInstruction } from './geminiJsonService';
import { withAutomationLock } from './automationLockService';
import { generateContentWithAiRouter, getAiRouterCapacityState } from './aiRouterService';
import { recoverStaleDemandClassification } from './aiQueueRecoveryService';
import { isTransientSupabaseError } from './supabaseResilienceService';

const BACKFILL_LOCK = 'AI_DEMAND_CLASSIFICATION_BACKFILL';
const BATCH_SIZE = 1;
const MAX_ATTEMPTS = 3;
const RETRY_MINUTES = 15;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function nextRetryIso() {
  return new Date(Date.now() + RETRY_MINUTES * 60_000).toISOString();
}

async function loadCatalogs(supabase: any) {
  const [demand, nature] = await Promise.all([
    supabase.from('demand_classification_catalog')
      .select('category_code,category_label,subcategory_code,subcategory_label')
      .eq('active', true).order('sort_order', { ascending: true }),
    supabase.from('legal_nature_catalog')
      .select('code,label').eq('active', true).order('sort_order', { ascending: true }),
  ]);
  if (demand.error) throw new Error(`Falha ao carregar catálogo de demandas: ${demand.error.message}`);
  if (nature.error) throw new Error(`Falha ao carregar catálogo de natureza jurídica: ${nature.error.message}`);
  return { demand: demand.data || [], nature: nature.data || [] };
}

async function buildProcessEvidence(supabase: any, processId: string) {
  const [processResult, emailsResult, evidenceResult, timelineResult] = await Promise.all([
    supabase.from('processes').select(
      'id,numero_processo,protocolo_externo,natureza,fase_processual,tutela_atual,tipo_demanda,subtipo_demanda,objeto_demanda,resumo_executivo,status_operacional,nivel_risco,categoria_demanda,subcategoria_demanda,natureza_juridica,detalhe_demanda,classificacao_origem'
    ).eq('id', processId).maybeSingle(),
    supabase.from('processed_emails').select('id,subject,received_at,metadata,status')
      .eq('process_id', processId).order('received_at', { ascending: false }).limit(8),
    supabase.from('process_evidence').select('field_name,extracted_value,evidence_excerpt,confidence,source_type')
      .eq('process_id', processId).order('created_at', { ascending: false }).limit(24),
    supabase.from('process_timeline').select('tipo,titulo,descricao,data_hora,origem')
      .eq('process_id', processId).order('data_hora', { ascending: false }).limit(8),
  ]);

  if (processResult.error || !processResult.data) {
    throw new Error(processResult.error?.message || 'Processo não encontrado.');
  }
  for (const [source, result] of [['e-mails', emailsResult], ['evidências', evidenceResult], ['histórico', timelineResult]] as const) {
    if (result.error) throw new Error(`Falha ao carregar ${source}: ${result.error.message}`);
  }

  const emails = (emailsResult.data || []).map((email: any) => ({
    subject: email.subject || null,
    received_at: email.received_at || null,
    status: email.status || null,
    legal_summary: email.metadata?.legal_summary || null,
    ai_evidence_blocks: Array.isArray(email.metadata?.ai_evidence_blocks)
      ? email.metadata.ai_evidence_blocks.slice(0, 8).map((b: any) => ({ source: b.source, text: String(b.text || '').slice(0, 1000) }))
      : [],
  }));

  return {
    process: processResult.data,
    emails,
    evidences: evidenceResult.data || [],
    timeline: timelineResult.data || [],
  };
}

function normalizeToken(value: any) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function resolveCatalogCode(rawValue: any, allowedCodes: string[], preferredPosition: 'first' | 'last' = 'first') {
  const normalized = normalizeToken(rawValue);
  if (!normalized) return '';
  if (allowedCodes.includes(normalized)) return normalized;

  const tokens = normalized
    .split(/[\\/>|:;,\n\r\t]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const hits = tokens.filter((token) => allowedCodes.includes(token));
  if (hits.length) return preferredPosition === 'last' ? hits[hits.length - 1] : hits[0];

  const embedded = allowedCodes.filter((code) => {
    const rx = new RegExp(`(^|[^A-Z0-9_])${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9_]|$)`);
    return rx.test(normalized);
  });
  if (embedded.length) return preferredPosition === 'last' ? embedded[embedded.length - 1] : embedded[0];

  return normalized;
}

function validateClassification(raw: any, catalogs: any) {
  const categoryCodes: string[] = Array.from(new Set<string>(catalogs.demand.map((r: any) => String(r.category_code))));
  const subcategoryCodes: string[] = Array.from(new Set<string>(catalogs.demand.map((r: any) => String(r.subcategory_code))));
  const category = resolveCatalogCode(raw?.categoria_demanda, categoryCodes, 'first');
  const subcategory = resolveCatalogCode(raw?.subcategoria_demanda, subcategoryCodes, 'last');
  const allowedPair = catalogs.demand.some((r: any) => r.category_code === category && r.subcategory_code === subcategory);
  if (!allowedPair) {
    throw new Error(
      `CLASSIFICACAO_INVALIDA: combinação ${category}/${subcategory} fora do catálogo. ` +
      `Recebido originalmente: categoria=${JSON.stringify(raw?.categoria_demanda)}, subcategoria=${JSON.stringify(raw?.subcategoria_demanda)}`
    );
  }

  const forbiddenNature = new Set(['COBRANCA']);
  const allowedNature = new Set(catalogs.nature.map((r: any) => r.code).filter((code: string) => !forbiddenNature.has(code)));
  const naturezas = Array.isArray(raw?.natureza_juridica)
    ? [...new Set(raw.natureza_juridica
        .map((x: any) => String(x || '').trim().toUpperCase())
        .filter((x: string) => allowedNature.has(x) && !forbiddenNature.has(x)))]
    : [];

  if (naturezas.length === 0) {
    throw new Error('CLASSIFICACAO_INVALIDA: natureza_juridica obrigatória. Use OUTRA quando nenhuma natureza específica for aplicável.');
  }

  const detalhe = typeof raw?.detalhe_demanda === 'string' && raw.detalhe_demanda.trim()
    ? raw.detalhe_demanda.trim().slice(0, 500)
    : null;
  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence || 0)));

  return { category, subcategory, naturezas, detalhe, confidence };
}

async function classifyProcess(supabase: any, processId: string) {
  const cfg = await getAiRuntimeConfig(supabase);
  const catalogs = await loadCatalogs(supabase);
  const evidence = await buildProcessEvidence(supabase, processId);

  if (['MANUAL', 'IA_CONFIRMADA'].includes(String(evidence.process.classificacao_origem || ''))) {
    return { skipped: true, reason: 'HUMAN_LOCKED', model: cfg.model };
  }
  if (evidence.process.categoria_demanda && evidence.process.subcategoria_demanda) {
    return { skipped: true, reason: 'ALREADY_CLASSIFIED', model: cfg.model };
  }

  const demandOptions = catalogs.demand.map((r: any) => `${r.category_code}/${r.subcategory_code} = ${r.category_label} > ${r.subcategory_label}`).join('\n');
  const natureOptions = catalogs.nature.map((r: any) => `${r.code} = ${r.label}`).join('\n');

  const instruction = `Você classifica processos jurídicos de uma operadora de saúde brasileira.
Sua única tarefa é classificar a DEMANDA. Não altere, sugira nem interprete outros campos do processo.

REGRA CENTRAL — NÃO CONFUNDA ASSUNTO MATERIAL COM NATUREZA JURÍDICA:
1. categoria_demanda/subcategoria_demanda representam O ASSUNTO MATERIAL predominante do conflito.
2. natureza_juridica representa O TIPO DE PROVIMENTO/PEDIDO JURÍDICO, e nunca deve repetir a categoria material.
3. COBRANCA é categoria material e NÃO é natureza jurídica. Para uma ação de cobrança use, conforme o caso, CONDENATORIA, EXECUCAO, DECLARATORIA ou OUTRA.
4. natureza_juridica é obrigatória e deve conter ao menos um código. Se nenhum código específico couber, use OUTRA.

PRIORIDADE DE CLASSIFICAÇÃO DO ASSUNTO MATERIAL:
- ASSISTENCIAL prevalece quando o núcleo da controvérsia for acesso, autorização, cobertura, fornecimento ou continuidade de cuidado em saúde, incluindo cirurgia, exame, internação, medicamento, terapia, home care, OPME, procedimento, urgência/emergência, reembolso ou negativa de cobertura.
- Se cancelamento, carência, exclusão, rescisão ou outra questão contratual estiver sendo discutida apenas porque impede ou condiciona um tratamento/cobertura assistencial concreta, classifique como ASSISTENCIAL e registre a natureza jurídica correspondente. CONTRATUAL só deve prevalecer quando a relação contratual em si for o objeto principal e não houver prestação assistencial específica dominante.
- Dentro de ASSISTENCIAL, prefira a prestação concreta mais específica. Ex.: cirurgia com OPME => CIRURGIA se a cirurgia for o pedido central; use OPME somente quando o próprio material/dispositivo for o núcleo principal da controvérsia.
- COBRANCA prevalece quando o núcleo for dívida, fatura, valor devido, inadimplência, recuperação de crédito ou ressarcimento monetário.
- INDENIZATORIA como categoria material deve ser usada quando a reparação por dano moral/material for o próprio núcleo da demanda e não houver assunto material mais específico predominante. Se o pedido de dano moral acompanhar uma disputa assistencial, contratual ou de cobrança, mantenha a categoria material predominante e inclua INDENIZATORIA apenas em natureza_juridica quando houver pedido indenizatório.
- CONTRATUAL prevalece em cancelamento, reajuste, cobertura contratual abstrata, inclusão/exclusão, rescisão ou carência quando o contrato, por si só, for o objeto principal.
- ADMINISTRATIVO_REGULATORIO, TRABALHISTA e TRIBUTARIO devem ser usados quando esses forem claramente o núcleo material do caso.

REGRAS PARA NATUREZA JURÍDICA:
- OBRIGACAO_FAZER: autorização, restabelecimento, fornecimento, cobertura ou prática de ato.
- OBRIGACAO_NAO_FAZER: impedir suspensão, cobrança, exclusão ou outra conduta.
- INDENIZATORIA: pedido de dano moral/material.
- DECLARATORIA: pedido predominantemente declaratório.
- CONDENATORIA: condenação ao pagamento de quantia ou cumprimento patrimonial, quando não for execução.
- EXECUCAO: execução/cumprimento de obrigação já constituída; não use apenas porque o processo está em fase posterior se a classificação pedida for do objeto material original.
- CAUTELAR ou MANDAMENTAL: somente quando isso estiver evidenciado.
- OUTRA: fallback obrigatório quando nenhuma das anteriores descrever adequadamente o provimento.

EXEMPLOS DE DESEMPATE:
- "Restabelecimento do plano e cobertura de cirurgia com OPME" => ASSISTENCIAL/CIRURGIA + OBRIGACAO_FAZER.
- "Cirurgia negada com pedido de danos morais" => ASSISTENCIAL/CIRURGIA + OBRIGACAO_FAZER + INDENIZATORIA.
- "Ação monitória por serviços prestados e não pagos" => COBRANCA/COBRANCA_DIVIDA + CONDENATORIA.
- "Dano moral por fato autônomo sem pedido assistencial/contratual predominante" => INDENIZATORIA/DANO_MORAL + INDENIZATORIA.

Escolha EXATAMENTE uma combinação categoria/subcategoria do catálogo abaixo. Natureza jurídica pode conter uma ou várias opções do catálogo próprio.
Não invente códigos. Se a evidência for realmente insuficiente para o assunto material, use OUTROS/NAO_CLASSIFICADO, mas ainda preencha natureza_juridica com OUTRA.
Retorne SOMENTE JSON válido, sem markdown, com esta estrutura:
{"categoria_demanda":"CODIGO","subcategoria_demanda":"CODIGO","natureza_juridica":["CODIGO"],"detalhe_demanda":"texto curto ou null","confidence":0.0}

CATÁLOGO DE DEMANDAS:
${demandOptions}

CATÁLOGO DE NATUREZAS JURÍDICAS:
${natureOptions}`;

  const requestText = `${instruction}\n\nEVIDÊNCIAS DO PROCESSO:\n${JSON.stringify(evidence)}`;
  const estimatedTokens = Math.ceil(requestText.length / 4) + 1200;
  let lastParseError: any = null;
  let preferredModel: string | null = null;

  for (let attempt = 1; attempt <= ENV.gemini.retryInvalidJsonAttempts; attempt += 1) {
    const contents = attempt === 1
      ? requestText
      : buildInvalidJsonRetryInstruction({
          originalRequest: requestText,
          parseMessage: String(lastParseError?.message || 'JSON inválido'),
        });

    const routed = await generateContentWithAiRouter({
      supabase,
      contents,
      config: { responseMimeType: 'application/json' },
      estimatedTokens,
      purpose: 'DEMAND_BACKFILL',
      preferredModel,
    });
    preferredModel = routed.model;

    try {
      const parsed = parseGeminiJson<any>(String(routed.response?.text || '').trim());
      const result = validateClassification(parsed.value, catalogs);

      const { data: currentProcess, error: currentProcessError } = await supabase
        .from('processes')
        .select('id,classificacao_origem,categoria_demanda,subcategoria_demanda')
        .eq('id', processId)
        .maybeSingle();

      if (currentProcessError) {
        throw new Error(`Falha ao revalidar classificação retroativa: ${currentProcessError.message}`);
      }
      if (!currentProcess) throw new Error('Processo não localizado antes da gravação retroativa.');
      if (['MANUAL', 'IA_CONFIRMADA'].includes(String(currentProcess.classificacao_origem || ''))) {
        return { skipped: true, reason: 'MANUAL_PROTECTED_DURING_PROCESSING', model: routed.model, confidence: result.confidence };
      }
      if (currentProcess.categoria_demanda && currentProcess.subcategoria_demanda) {
        return { skipped: true, reason: 'ALREADY_CLASSIFIED_DURING_PROCESSING', model: routed.model, confidence: result.confidence };
      }

      const { data: updatedRows, error: updateError } = await supabase
        .from('processes')
        .update({
          categoria_demanda: result.category,
          subcategoria_demanda: result.subcategory,
          natureza_juridica: result.naturezas,
          detalhe_demanda: result.detalhe,
          classificacao_origem: 'IA',
          classificacao_atualizada_em: new Date().toISOString(),
        })
        .eq('id', processId)
        .select('id');

      if (updateError) throw new Error(`Falha ao gravar classificação retroativa: ${updateError.message}`);
      if (!updatedRows || updatedRows.length !== 1) {
        throw new Error('Classificação retroativa não foi gravada no processo.');
      }

      console.log('[DEMAND BACKFILL] classificação gravada', {
        processId,
        category: result.category,
        subcategory: result.subcategory,
        legalNatures: result.naturezas,
        confidence: result.confidence,
        model: routed.model,
      });

      return { skipped: false, model: routed.model, confidence: result.confidence, ...result };
    } catch (parseErr: any) {
      lastParseError = parseErr;
      if (attempt < ENV.gemini.retryInvalidJsonAttempts) {
        if (/CLASSIFICACAO_INVALIDA/i.test(String(parseErr?.message || ''))) {
          console.warn('[DEMAND BACKFILL] classificação fora do catálogo; nova geração estrita', {
            processId,
            model: preferredModel,
            message: String(parseErr?.message || ''),
          });
        }
        await sleep(ENV.gemini.retryInvalidJsonDelayMs);
        continue;
      }
      throw parseErr;
    }
  }

  throw new Error('Classificação retroativa não retornou resultado válido.');
}

export async function enqueueUnclassifiedProcesses(actorId: string) {
  const supabase = getBackendSupabase();
  if (!supabase) throw new Error('Supabase backend não configurado.');
  let offset = 0;
  let discovered = 0;
  let queued = 0;
  const pageSize = 500;

  while (true) {
    const { data, error } = await supabase.from('processes')
      .select('id,classificacao_origem,categoria_demanda,subcategoria_demanda')
      .eq('arquivado', false)
      .is('categoria_demanda', null)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Falha ao localizar processos sem classificação: ${error.message}`);
    const rows = data || [];
    const eligible = rows.filter((r: any) => !['MANUAL', 'IA_CONFIRMADA'].includes(String(r.classificacao_origem || '')));
    discovered += eligible.length;
    if (eligible.length) {
      const payload = eligible.map((r: any) => ({ process_id: r.id, status: 'PENDING', requested_by: actorId, requested_at: new Date().toISOString(), retry_after: null, last_error: null }));
      const { error: upsertError } = await supabase.from('ai_demand_classification_backfill_queue').upsert(payload, { onConflict: 'process_id', ignoreDuplicates: true });
      if (upsertError) throw new Error(`Falha ao criar fila retroativa: ${upsertError.message}`);
      queued += eligible.length;
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return { discovered, queued };
}

export async function getDemandBackfillStats() {
  const supabase = getBackendSupabase();
  if (!supabase) throw new Error('Supabase backend não configurado.');
  const [unclassified, pending, processing, done, error] = await Promise.all([
    supabase.from('processes').select('id', { count: 'exact', head: true }).eq('arquivado', false).is('categoria_demanda', null),
    supabase.from('ai_demand_classification_backfill_queue').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('ai_demand_classification_backfill_queue').select('id', { count: 'exact', head: true }).eq('status', 'PROCESSING'),
    supabase.from('ai_demand_classification_backfill_queue').select('id', { count: 'exact', head: true }).eq('status', 'DONE'),
    supabase.from('ai_demand_classification_backfill_queue').select('id', { count: 'exact', head: true }).eq('status', 'ERROR'),
  ]);
  for (const r of [unclassified,pending,processing,done,error]) if (r.error) throw new Error(r.error.message);
  return { unclassified: unclassified.count || 0, pending: pending.count || 0, processing: processing.count || 0, done: done.count || 0, error: error.count || 0, batchSize: BATCH_SIZE };
}

async function runBackfillBatch() {
  const supabase = getBackendSupabase();
  if (!supabase) throw new Error('Supabase backend não configurado.');
  await recoverStaleDemandClassification(supabase);
  const now = new Date();
  const capacity = await getAiRouterCapacityState(supabase);
  if (!capacity.available) return { processed: 0, succeeded: 0, failed: 0, deferred: 0, skipped: 0, batchSize: BATCH_SIZE, pausedByCapacity: true };
  const { data: candidates, error } = await supabase.from('ai_demand_classification_backfill_queue')
    .select('*').eq('status', 'PENDING').or(`retry_after.is.null,retry_after.lte.${now.toISOString()}`).order('requested_at', { ascending: true }).limit(BATCH_SIZE);
  if (error) {
    if (isTransientSupabaseError(error)) {
      console.warn('[BACKFILL WORKER] banco inacessível ao consultar fila retroativa:', error.message);
      return { processed: 0, succeeded: 0, failed: 0, deferred: 0, skipped: 0, batchSize: BATCH_SIZE, pausedByDatabase: true };
    }
    throw new Error(`Falha ao consultar fila retroativa: ${error.message}`);
  }
  const eligible = (candidates || []).filter((r: any) => !r.retry_after || new Date(r.retry_after) <= now).slice(0, BATCH_SIZE);
  let processed = 0, succeeded = 0, failed = 0, deferred = 0, skipped = 0;

  for (const item of eligible) {
    const startedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase.from('ai_demand_classification_backfill_queue')
      .update({ status: 'PROCESSING', started_at: startedAt, updated_at: startedAt }).eq('id', item.id).eq('status', 'PENDING').select('id').maybeSingle();
    if (claimError) { failed += 1; continue; }
    if (!claimed) continue;
    processed += 1;
    try {
      const result: any = await classifyProcess(supabase, item.process_id);
      if (result.skipped) skipped += 1; else succeeded += 1;
      await supabase.from('ai_demand_classification_backfill_queue').update({
        status: 'DONE', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), retry_after: null,
        last_error: result.skipped ? result.reason : null, model: result.model || null,
      }).eq('id', item.id);
    } catch (err: any) {
      const capacity = ['AI_CAPACITY', 'AI_ROUTER_EXHAUSTED'].includes(String(err?.code || ''));
      const attempts = Number(item.attempts || 0) + (capacity ? 0 : 1);
      if (capacity) deferred += 1; else failed += 1;
      await supabase.from('ai_demand_classification_backfill_queue').update({
        status: attempts >= MAX_ATTEMPTS && !capacity ? 'ERROR' : 'PENDING',
        attempts,
        retry_after: capacity || attempts < MAX_ATTEMPTS ? nextRetryIso() : null,
        last_error: String(err?.message || err).slice(0, 700),
        updated_at: new Date().toISOString(),
      }).eq('id', item.id);
      if (capacity) break;
    }
    await sleep(750);
  }
  return { processed, succeeded, failed, deferred, skipped, batchSize: BATCH_SIZE };
}

export async function runDemandClassificationBackfillWorker() {
  return withAutomationLock(BACKFILL_LOCK, 900, runBackfillBatch);
}
