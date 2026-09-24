import { getBackendSupabase } from '../integrations/supabase';
import { filterExternalProtocols } from './protocolExtractionService';
import { mergeStoredProcessNumbers } from './documentIdentificationService';
import { interpretWithGemini, augmentDeterministicWithAiProcessNumber } from './geminiLegalInterpreter';
import { applyInterpretationToProcess } from './processApplicationService';
import { applyAiInterpretation } from './aiProcessApplicationService';
import type { InterpretationResult } from './legalInterpretationService';

export type EmailAiExecutionMode = 'MANUAL' | 'AUTOMATIC';


function extractCnpjsFromStoredEvidence(meta: any): string[] {
  const set = new Set<string>();
  const direct = Array.isArray(meta?.legal_summary?.cnpjs) ? meta.legal_summary.cnpjs : [];
  for (const item of direct) {
    const digits = String(item || '').replace(/\D/g, '');
    if (digits.length === 14) set.add(digits);
  }
  for (const block of Array.isArray(meta?.ai_evidence_blocks) ? meta.ai_evidence_blocks : []) {
    const text = String(block?.text || '');
    for (const match of text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || []) {
      const digits = match.replace(/\D/g, '');
      if (digits.length === 14) set.add(digits);
    }
  }
  return [...set];
}


export async function processEmailWithAi(params: {
  emailId: string;
  actorId: string | null;
  executionMode: EmailAiExecutionMode;
  forceReanalysis?: boolean;
}) {
  const supabase = getBackendSupabase();
  if (!supabase) throw Object.assign(new Error('Supabase backend não configurado.'), { status: 503 });

  const { data: emailRecord, error: fetchError } = await supabase
    .from('processed_emails')
    .select('*')
    .eq('id', params.emailId)
    .single();

  if (fetchError || !emailRecord) throw Object.assign(new Error('E-mail processado não encontrado.'), { status: 404 });

  if (!params.forceReanalysis && emailRecord.status !== 'PENDENTE_IA') {
    throw Object.assign(new Error(`Item em status ${emailRecord.status}; não está disponível para fila de IA.`), { status: 409 });
  }

  const meta = emailRecord.metadata || {};
  const deterministic: InterpretationResult = {
    classification: emailRecord.classification || 'POSSÍVEL',
    relevanceScore: emailRecord.relevance_score ?? 0,
    aiNeedScore: emailRecord.ai_need_score ?? 0,
    status: emailRecord.status,
    processId: emailRecord.process_id || null,
    matchedProcessNumber: emailRecord.matched_process_number || null,
    evidences: [],
    extractedData: {
      cnjs: mergeStoredProcessNumbers(meta, emailRecord.matched_process_number),
      protocols: filterExternalProtocols(meta?.legal_summary?.protocols),
      cpfs: [],
      cnpjs: extractCnpjsFromStoredEvidence(meta),
      dates: Array.isArray(meta?.legal_summary?.dates) ? meta.legal_summary.dates : [],
      monetaryValues: Array.isArray(meta?.legal_summary?.monetary_values) ? meta.legal_summary.monetary_values : [],
      partyNames: Array.isArray(meta?.legal_summary?.party_names) ? meta.legal_summary.party_names : [],
      courtMentions: [],
      keywordsFound: Array.isArray(meta?.keywords_found) ? meta.keywords_found : [],
      attachmentSignals: [],
    },
    rankedEvidence: Array.isArray(meta?.ai_evidence_blocks)
      ? meta.ai_evidence_blocks.map((b: any) => ({
          source: b.source || 'METADATA', kind: b.kind || 'TEXT', score: Number(b.score) || 50, text: String(b.text || ''),
        }))
      : [{ source: 'EMAIL_SUBJECT', kind: 'SUBJECT', score: 80, text: emailRecord.subject || '' }],
    evidenceStats: meta?.evidence_stats || { totalBlocks: 1, retainedBlocks: 1, totalEstimatedChars: 100 },
    processRouting: meta?.process_routing || null,
    exceptionType: null,
    exceptionReason: null,
  };

  const receivedAt = emailRecord.received_at || new Date().toISOString();
  const aiOutcome = await interpretWithGemini({
    supabase,
    deterministic,
    subject: emailRecord.subject || '',
    senderEmail: emailRecord.sender_email || '',
    senderName: emailRecord.sender_name || '',
  });

  if (aiOutcome.state === 'PAUSED_429') {
    return { ok: false, paused: true, status: 'PENDENTE_IA', ai_state: 'PAUSED_429', error: aiOutcome.error };
  }
  if (aiOutcome.state !== 'SUCCESS' || !aiOutcome.result) {
    throw Object.assign(new Error(aiOutcome.error || 'Falha ao interpretar com Gemini.'), { status: 502, aiState: aiOutcome.state });
  }

  const ai = aiOutcome.result;
  augmentDeterministicWithAiProcessNumber(deterministic, ai);
  for (const party of ai.partiesStructured || []) {
    const name = party?.name?.value;
    if (name && !deterministic.extractedData.partyNames.includes(name)) deterministic.extractedData.partyNames.push(name);
  }

  let newStatus = 'PROCESSADO';
  if (!ai.isLegal && ai.confidence >= 0.90) newStatus = 'IRRELEVANTE';
  else if (ai.confidence < 0.65) newStatus = 'EXCECAO';

  let finalProcessId = emailRecord.process_id;
  let finalMatchedProcessNumber = emailRecord.matched_process_number || ai.processNumber;
  let processApplication: any = null;
  let aiApplication: any = null;

  if (ai.isLegal && ai.confidence >= 0.65) {
    processApplication = await applyInterpretationToProcess({
      supabase,
      interpretation: deterministic,
      emailId: emailRecord.id,
      subject: emailRecord.subject || '',
      receivedAt,
      actorId: params.actorId,
    });
    finalProcessId = processApplication.processId;
    finalMatchedProcessNumber = processApplication.action === 'DISTRIBUTED'
      ? null
      : (processApplication.matchedProcessNumber || finalMatchedProcessNumber);
    if (processApplication.exceptionType) newStatus = 'EXCECAO';
  }

  if (finalProcessId && processApplication?.action !== 'DISTRIBUTED' && ai.isLegal && ai.confidence >= 0.65) {
    aiApplication = await applyAiInterpretation({
      supabase,
      processId: finalProcessId,
      emailId: emailRecord.id,
      actorId: params.actorId,
      receivedAt,
      ai,
      executionMode: params.executionMode,
      reanalysis: Boolean(params.forceReanalysis),
    });
  }

  if (processApplication?.exceptionType) {
    const { data: existingException } = await supabase
      .from('email_exceptions')
      .select('id')
      .eq('processed_email_id', emailRecord.id)
      .eq('exception_type', processApplication.exceptionType)
      .neq('status', 'RESOLVIDA')
      .limit(1)
      .maybeSingle();
    if (!existingException?.id) {
      await supabase.from('email_exceptions').insert({
        processed_email_id: emailRecord.id,
        exception_type: processApplication.exceptionType,
        reason: processApplication.exceptionReason || 'Revisão humana necessária após interpretação semântica.',
        status: 'ABERTA',
      });
    }
  }

  const semanticSummary = {
    event_type: ai.eventType,
    confidence: ai.confidence,
    identification: ai.identification,
    classification: ai.classification,
    parties_structured: ai.partiesStructured,
    values: ai.values,
    deadline_structured: ai.deadlineStructured,
    obligation_structured: ai.obligationStructured,
    application_decisions: aiApplication?.decisions || {},
    process_number: ai.processNumber,
    parties: ai.parties.slice(0, 8),
    nature: ai.nature,
    phase: ai.phase,
    tutela: ai.tutela,
    municipality: ai.municipality,
    comarca: ai.comarca,
    uf: ai.uf,
    demand_type: ai.demandType,
    demand_subtype: ai.demandSubtype,
    demand_object: ai.demandObject,
    priority: ai.priority,
    suggested_status: ai.suggestedStatus,
    money_findings: ai.moneyFindings.slice(0, 8),
    deadline: ai.deadline,
    obligation: ai.obligation,
    action_summary: ai.actionSummary,
    timeline_summary: ai.timelineSummary,
    timeline_title: ai.timelineTitle,
    warnings: ai.warnings.slice(0, 8),
  };

  const nowIso = new Date().toISOString();
  const updatedMetadata = {
    ...meta,
    ai_state: aiOutcome.state,
    ai_model: aiOutcome.model,
    ai_execution_mode: params.executionMode,
    lifecycle: {
      ...(meta?.lifecycle || {}),
      received_at: emailRecord.received_at || meta?.lifecycle?.received_at || null,
      system_read_at: meta?.lifecycle?.system_read_at || emailRecord.created_at || null,
      processed_at: nowIso,
      ai_analyzed_at: nowIso,
    },
    semantic_interpretation: semanticSummary,
    process_routing: deterministic.processRouting || meta?.process_routing || null,
    ...(processApplication?.processDistribution
      ? { process_distribution: processApplication.processDistribution }
      : (meta?.process_distribution ? { process_distribution: meta.process_distribution } : {})),
    process_application: {
      action: processApplication?.action || (newStatus === 'PROCESSADO' ? 'AI_INTERPRETED_AND_APPLIED' : newStatus),
      mode: processApplication?.routingMode || deterministic.processRouting?.mode || null,
      rule: processApplication?.routingRule || deterministic.processRouting?.rule || null,
      exception_type: processApplication?.exceptionType || null,
      exception_reason: processApplication?.exceptionReason || null,
      process_id: finalProcessId,
      process_number: finalMatchedProcessNumber,
      process_ids: processApplication?.processIds || (finalProcessId ? [finalProcessId] : []),
      process_numbers: processApplication?.processNumbers || (finalMatchedProcessNumber ? [finalMatchedProcessNumber] : []),
      ignored_auxiliary_cnjs: processApplication?.auxiliaryCnjs || deterministic.processRouting?.auxiliaryCnjs || [],
    },
  };

  const { error: updateError } = await supabase.from('processed_emails').update({
    status: newStatus,
    ai_model: aiOutcome.model,
    ai_confidence: ai.confidence,
    process_id: finalProcessId,
    matched_process_number: finalMatchedProcessNumber,
    metadata: updatedMetadata,
    analyzed_at: nowIso,
    updated_at: nowIso,
  }).eq('id', emailRecord.id);
  if (updateError) throw new Error(`Falha ao atualizar e-mail processado: ${updateError.message}`);

  return {
    ok: true,
    paused: false,
    processed_email_id: emailRecord.id,
    status: newStatus,
    confidence: ai.confidence,
    model: aiOutcome.model,
    event_type: ai.eventType,
    action_summary: ai.actionSummary,
    timeline_created: Boolean(processApplication?.timelineCreated || aiApplication?.timelineCreated),
    obligation_created: Boolean(aiApplication?.obligationCreated),
    obligation_updated: Boolean(aiApplication?.obligationUpdated),
    application_decisions: aiApplication?.decisions || {},
  };
}
