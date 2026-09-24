import express from 'express';
import { filterExternalProtocols } from '../services/protocolExtractionService';
import { mergeStoredProcessNumbers } from '../services/documentIdentificationService';
import { getBackendSupabase } from '../integrations/supabase';
import { interpretWithGemini, augmentDeterministicWithAiProcessNumber } from '../services/geminiLegalInterpreter';
import { getAiBudgetState } from '../services/aiUsageService';
import { applyInterpretationToProcess } from '../services/processApplicationService';
import { applyAiInterpretation } from '../services/aiProcessApplicationService';
import type { InterpretationResult } from '../services/legalInterpretationService';
import { requireAuth } from '../middleware/authMiddleware';
import { ENV } from '../config/env';
import { generateManagementSuggestions } from '../services/aiManagementSuggestionService';
import { getAiRuntimeConfig } from '../services/aiRuntimeConfigService';
import { getAiRouterModelChain } from '../services/aiRouterService';
import { classifyAiCapacity } from '../services/aiCapacityStatusService';

const router = express.Router();

router.get('/health', async (_req, res) => {
  const supabase = getBackendSupabase();
  const runtime = supabase ? await getAiRuntimeConfig(supabase).catch(() => null) : null;
  res.json({
    status: 'ok',
    module: 'ai',
    gemini_key_present: Boolean(ENV.gemini.apiKey),
    gemini_model: runtime?.model || ENV.gemini.model || null,
    gemini_model_source: runtime?.source || 'BACKEND_FALLBACK',
    ai_router_enabled: true,
    ai_router_models: getAiRouterModelChain(),
    gemini_timeout_ms_effective: ENV.gemini.timeoutMs,
    gemini_timeout_source: 'BACKEND_FIXED',
    retry_503_attempts: ENV.gemini.retry503Attempts,
    retry_invalid_json_attempts: ENV.gemini.retryInvalidJsonAttempts,
  });
});

router.get('/budget', requireAuth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const supabase = getBackendSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase backend não configurado.' });

    const routerModels = getAiRouterModelChain();
    const [budget, ...routerStates] = await Promise.all([
      getAiBudgetState(supabase),
      ...routerModels.map((model) => getAiBudgetState(supabase, { model })),
    ]);

    const { data: healthRows } = await supabase
      .from('ai_model_health')
      .select('model,circuit_open_until,last_error_code,last_error_message,last_failure_at,last_success_at')
      .in('model', routerModels);
    const healthByModel = new Map((healthRows || []).map((row: any) => [row.model, row]));

    const routerModelStates = routerStates.map((state) => {
      const health: any = healthByModel.get(state.model) || null;
      return {
        model: state.model,
        allowed: state.allowed,
        reason: state.reason,
        capacityStatus: classifyAiCapacity({
          routerEnabled: true,
          allowed: state.allowed,
          budgetReason: state.reason,
          circuitOpenUntil: health?.circuit_open_until || null,
          lastErrorCode: health?.last_error_code || null,
        }),
        requestsToday: state.requestsToday,
        inputTokensToday: state.inputTokensToday,
        outputTokensToday: state.outputTokensToday,
        tokensToday: state.inputTokensToday + state.outputTokensToday,
        requestsCurrentMinute: state.requestsCurrentMinute,
        tokensCurrentMinute: state.tokensCurrentMinute,
        providerRpd: state.providerRpd,
        providerRpdSource: state.providerRpdSource,
        providerRpdObservedAt: state.providerRpdObservedAt,
        providerRpm: state.providerRpm,
        providerTpm: state.providerTpm,
        effectiveRpd: state.effectiveRpd,
        effectiveRpm: state.effectiveRpm,
        effectiveTpm: state.effectiveTpm,
        quotaExhaustedAt: state.quotaExhaustedAt,
        providerDayKey: state.providerDayKey,
        providerDayStart: state.providerDayStart,
        nextResetAt: state.nextResetAt,
        circuitOpenUntil: health?.circuit_open_until || null,
        lastErrorCode: health?.last_error_code || null,
        lastFailureAt: health?.last_failure_at || null,
        lastSuccessAt: health?.last_success_at || null,
      };
    });

    res.json({
      ...budget,
      routerModels,
      routerAllowed: routerModelStates.some((state) => state.capacityStatus === 'DISPONIVEL'),
      routerModelStates,
      counterScope: 'APPLICATION_LOCAL_SUCCESSFUL_CALLS',
      counterDisclaimer: 'Contadores locais registram chamadas concluídas pela aplicação e podem divergir do console do provedor por tentativas rejeitadas ou uso da mesma chave/projeto fora deste fluxo.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Falha ao consultar orçamento de IA.' });
  }
});


const MANAGEMENT_AI_ROLES = new Set(['ADMIN', 'GESTOR', 'ANALISTA']);

router.get('/management/:processId/suggestions/latest', requireAuth, async (req, res) => {
  try {
    const supabase = getBackendSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase backend não configurado.' });
    const { data, error } = await supabase
      .from('ai_management_suggestions')
      .select('*')
      .eq('process_id', req.params.processId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ suggestion: data || null });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao consultar sugestões gerenciais.' });
  }
});

router.post('/management/:processId/suggestions', requireAuth, async (req, res) => {
  try {
    const role = String((req as any).user?.role || '').toUpperCase();
    if (!MANAGEMENT_AI_ROLES.has(role)) {
      return res.status(403).json({ error: 'Seu perfil não pode gerar sugestões gerenciais por IA.' });
    }
    const actorId = (req as any).user?.id;
    if (!actorId) return res.status(401).json({ error: 'Usuário não autenticado.' });
    const supabase = getBackendSupabase();
    if (!supabase) return res.status(503).json({ error: 'Supabase backend não configurado.' });
    const suggestion = await generateManagementSuggestions({
      supabase,
      processId: req.params.processId,
      actorId,
    });
    return res.json({ ok: true, suggestion });
  } catch (error: any) {
    const status = Number(error?.status || 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: error?.message || 'Falha ao gerar sugestões gerenciais por IA.',
    });
  }
});

router.post('/process/:processedEmailId', requireAuth, async (req, res) => {
  try {
    // 1. Rota iniciada
    console.log('[AI PROCESS] 1 - rota iniciada', {
      processedEmailId: req.params.processedEmailId,
    });

    const supabase = getBackendSupabase();
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase backend não configurado.' });
    }
    const emailId = req.params.processedEmailId;

    if (!emailId) {
      return res.status(400).json({ error: 'processedEmailId obrigatório' });
    }

    // 2. Buscando registro
    console.log('[AI PROCESS] 2 - buscando registro');
    const { data: emailRecord, error: fetchError } = await supabase
      .from('processed_emails')
      .select('*')
      .eq('id', emailId)
      .single();

    if (fetchError || !emailRecord) {
      return res.status(404).json({ error: 'E-mail processado não encontrado.' });
    }

    // 3. Registro localizado
    console.log('[AI PROCESS] 3 - registro localizado', {
      status: emailRecord.status,
      relevanceScore: emailRecord.relevance_score,
      aiNeedScore: emailRecord.ai_need_score,
    });


    const forceReanalysis = req.body?.force_reanalysis === true;
    const requestRole = String((req as any).user?.role || '').toUpperCase();

    if (forceReanalysis) {
      if (!['ADMIN', 'GESTOR'].includes(requestRole)) {
        return res.status(403).json({ error: 'Reanálise com IA permitida somente para ADMIN ou GESTOR.' });
      }
    } else if (emailRecord.status !== 'PENDENTE_IA') {
      return res.status(409).json({
        error: `Item em status ${emailRecord.status}. Use a ação de reanálise controlada para uma nova interpretação por IA.`,
      });
    }

    // Reconstrução da interpretação determinística a partir dos metadados existentes
    const meta = emailRecord.metadata || {};
    const deterministicInterpretation: InterpretationResult = {
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
        cnpjs: Array.isArray(meta?.legal_summary?.cnpjs) ? meta.legal_summary.cnpjs : [],
        dates: Array.isArray(meta?.legal_summary?.dates) ? meta.legal_summary.dates : [],
        monetaryValues: Array.isArray(meta?.legal_summary?.monetary_values) ? meta.legal_summary.monetary_values : [],
        partyNames: Array.isArray(meta?.legal_summary?.party_names) ? meta.legal_summary.party_names : [],
        courtMentions: [],
        keywordsFound: Array.isArray(meta?.keywords_found) ? meta.keywords_found : [],
        attachmentSignals: [],
      },
      rankedEvidence: Array.isArray(meta?.ai_evidence_blocks)
        ? meta.ai_evidence_blocks.map((b: any) => ({
            source: b.source || 'METADATA',
            kind: b.kind || 'TEXT',
            score: Number(b.score) || 50,
            text: String(b.text || ''),
          }))
        : [
            {
              source: 'EMAIL_SUBJECT',
              kind: 'SUBJECT',
              score: 80,
              text: emailRecord.subject || '',
            },
          ],
      evidenceStats: meta?.evidence_stats || { totalBlocks: 1, retainedBlocks: 1, totalEstimatedChars: 100 },
      processRouting: meta?.process_routing || null,
      exceptionType: null,
      exceptionReason: null,
    };

    const actorId = (req as any).user?.id;
    if (!actorId) {
      return res.status(401).json({ error: 'Usuário não autenticado ou ID de usuário inválido.' });
    }

    // Diagnóstico cirúrgico de autoria: user_profiles.id é a chave operacional do projeto.
    // Não altera a identidade nem o fluxo; apenas confirma o vínculo imediatamente antes da aplicação.
    const { data: actorProfile, error: actorProfileError } = await supabase
      .from('user_profiles')
      .select('id, role, active')
      .eq('id', actorId)
      .maybeSingle();
    if (actorProfileError) {
      console.error('[AI PROCESS] actor profile lookup failed', {
        actorId,
        message: actorProfileError.message,
      });
    } else {
      console.log('[AI PROCESS] actor preflight', {
        actorId,
        profileFound: Boolean(actorProfile),
        profileId: actorProfile?.id || null,
        active: actorProfile?.active === true,
        role: actorProfile?.role || null,
      });
    }
    if (actorProfileError || !actorProfile?.id) {
      return res.status(500).json({
        ok: false,
        error: `Perfil operacional não encontrado para o usuário autenticado: ${actorProfileError?.message || actorId}`,
      });
    }

    const receivedAt = emailRecord.received_at || new Date().toISOString();

    const aiOutcome = await interpretWithGemini({
      supabase,
      deterministic: deterministicInterpretation,
      subject: emailRecord.subject || '',
      senderEmail: emailRecord.sender_email || '',
      senderName: emailRecord.sender_name || '',
    });

    if (aiOutcome.state === 'PAUSED_429') {
      return res.status(429).json({
        ok: false,
        error: aiOutcome.error || 'Limite de quota Gemini (429) atingido. Mantido PENDENTE_IA.',
        ai_state: 'PAUSED_429',
      });
    }

    if (aiOutcome.state !== 'SUCCESS' || !aiOutcome.result) {
      return res.status(502).json({
        ok: false,
        error: aiOutcome.error || 'Falha ao interpretar com Gemini.',
        ai_state: aiOutcome.state,
      });
    }

    const aiResult = aiOutcome.result;
    augmentDeterministicWithAiProcessNumber(deterministicInterpretation, aiResult);

    // 8. Antes de aplicar resultado
    console.log('[AI PROCESS] 8 - aplicando interpretação');

    let newStatus = 'PROCESSADO';
    if (!aiResult.isLegal && aiResult.confidence >= 0.90) {
      newStatus = 'IRRELEVANTE';
    } else if (aiResult.confidence < 0.65) {
      newStatus = 'EXCECAO';
    }

    let finalProcessId = emailRecord.process_id;
    let finalMatchedProcessNumber = emailRecord.matched_process_number || aiResult.processNumber;
    let timelineCreated = false;
    let obligationCreated = false;
    let obligationUpdated = false;
    let processApplicationAction: string | null = null;
    let processApplicationExceptionType: string | null = null;
    let processApplicationExceptionReason: string | null = null;
    let processApplicationResult: any = null;
    let applicationDecisions: Record<string, any> = {};

    if (aiResult.isLegal && aiResult.confidence >= 0.65) {
      const processApplication = await applyInterpretationToProcess({
        supabase,
        interpretation: deterministicInterpretation,
        emailId: emailRecord.id,
        subject: emailRecord.subject || '',
        receivedAt,
        actorId,
      });
      processApplicationResult = processApplication;
      finalProcessId = processApplication.processId;
      finalMatchedProcessNumber = processApplication.action === 'DISTRIBUTED'
        ? null
        : (processApplication.matchedProcessNumber || finalMatchedProcessNumber);
      processApplicationAction = processApplication.action;
      processApplicationExceptionType = processApplication.exceptionType;
      processApplicationExceptionReason = processApplication.exceptionReason;
      timelineCreated = processApplication.timelineCreated;

      if (processApplicationExceptionType) {
        newStatus = 'EXCECAO';
      }
    }

    if (finalProcessId && processApplicationResult?.action !== 'DISTRIBUTED' && aiResult.isLegal && aiResult.confidence >= 0.65) {
      const aiApplication = await applyAiInterpretation({
        supabase,
        processId: finalProcessId,
        emailId: emailRecord.id,
        actorId,
        receivedAt,
        ai: aiResult,
        executionMode: 'MANUAL',
        reanalysis: forceReanalysis,
      });
      timelineCreated = timelineCreated || aiApplication.timelineCreated;
      obligationCreated = aiApplication.obligationCreated;
      obligationUpdated = aiApplication.obligationUpdated;
      applicationDecisions = aiApplication.decisions;
    }

    if (processApplicationExceptionType) {
      const { data: existingException, error: exceptionLookupError } = await supabase
        .from('email_exceptions')
        .select('id')
        .eq('processed_email_id', emailRecord.id)
        .eq('exception_type', processApplicationExceptionType)
        .neq('status', 'RESOLVIDA')
        .limit(1)
        .maybeSingle();
      if (exceptionLookupError) throw new Error(`Falha ao verificar exceção da aplicação processual: ${exceptionLookupError.message}`);
      if (!existingException?.id) {
        const { error: exceptionInsertError } = await supabase.from('email_exceptions').insert({
          processed_email_id: emailRecord.id,
          exception_type: processApplicationExceptionType,
          reason: processApplicationExceptionReason || 'Revisão humana necessária após interpretação semântica.',
          status: 'ABERTA',
        });
        if (exceptionInsertError) throw new Error(`Falha ao registrar exceção da aplicação processual: ${exceptionInsertError.message}`);
      }
    }

    const semanticSummary = {
      event_type: aiResult.eventType,
      confidence: aiResult.confidence,

      // Estruturas detalhadas com confiança por campo e evidência
      identification: aiResult.identification,
      classification: aiResult.classification,
      parties_structured: aiResult.partiesStructured,
      values: aiResult.values,
      deadline_structured: aiResult.deadlineStructured,
      obligation_structured: aiResult.obligationStructured,

      // Decisões operacionais de aplicação
      application_decisions: applicationDecisions,

      // Compatibilidade com telas e registros das fases anteriores
      process_number: aiResult.processNumber,
      parties: aiResult.parties.slice(0, 8),
      nature: aiResult.nature,
      phase: aiResult.phase,
      tutela: aiResult.tutela,
      municipality: aiResult.municipality,
      comarca: aiResult.comarca,
      uf: aiResult.uf,
      demand_type: aiResult.demandType,
      demand_subtype: aiResult.demandSubtype,
      demand_object: aiResult.demandObject,
      priority: aiResult.priority,
      suggested_status: aiResult.suggestedStatus,
      money_findings: aiResult.moneyFindings.slice(0, 8),
      deadline: aiResult.deadline,
      obligation: aiResult.obligation,
      action_summary: aiResult.actionSummary,
      timeline_summary: aiResult.timelineSummary,
      timeline_title: aiResult.timelineTitle,
      warnings: aiResult.warnings.slice(0, 8),
    };

    const nowIso = new Date().toISOString();
    const previousMetadata = emailRecord.metadata || {};
    const previousSemantic = previousMetadata?.semantic_interpretation || null;
    const priorReanalysisHistory = Array.isArray(previousMetadata?.ai_reanalysis_history)
      ? previousMetadata.ai_reanalysis_history.slice(-9)
      : [];

    const updatedMetadata = {
      ...previousMetadata,
      ai_state: aiOutcome.state,
      ai_model: aiOutcome.model,
      lifecycle: {
        ...(previousMetadata?.lifecycle || {}),
        received_at: emailRecord.received_at || previousMetadata?.lifecycle?.received_at || null,
        system_read_at: previousMetadata?.lifecycle?.system_read_at || emailRecord.created_at || null,
        processed_at: nowIso,
        ai_analyzed_at: nowIso,
      },
      ...(forceReanalysis && previousSemantic ? {
        ai_reanalysis_history: [
          ...priorReanalysisHistory,
          {
            at: nowIso,
            actor_id: actorId,
            ai_model: emailRecord.ai_model || previousMetadata?.ai_model || null,
            ai_confidence: emailRecord.ai_confidence ?? null,
            semantic_interpretation: previousSemantic,
          },
        ],
      } : {}),
      semantic_interpretation: semanticSummary,
      process_routing: deterministicInterpretation.processRouting || previousMetadata?.process_routing || null,
      ...(processApplicationResult?.processDistribution
        ? { process_distribution: processApplicationResult.processDistribution }
        : (previousMetadata?.process_distribution ? { process_distribution: previousMetadata.process_distribution } : {})),
      process_application: {
        action: processApplicationAction || (newStatus === 'PROCESSADO' ? 'AI_INTERPRETED_AND_APPLIED' : newStatus),
        mode: processApplicationResult?.routingMode || deterministicInterpretation.processRouting?.mode || null,
        rule: processApplicationResult?.routingRule || deterministicInterpretation.processRouting?.rule || null,
        exception_type: processApplicationExceptionType,
        exception_reason: processApplicationExceptionReason,
        process_id: finalProcessId,
        process_number: finalMatchedProcessNumber,
        process_ids: processApplicationResult?.processIds || (finalProcessId ? [finalProcessId] : []),
        process_numbers: processApplicationResult?.processNumbers || (finalMatchedProcessNumber ? [finalMatchedProcessNumber] : []),
        ignored_auxiliary_cnjs: processApplicationResult?.auxiliaryCnjs || deterministicInterpretation.processRouting?.auxiliaryCnjs || [],
      },
    };

    const { error: updateError } = await supabase
      .from('processed_emails')
      .update({
        status: newStatus,
        ai_model: aiOutcome.model,
        ai_confidence: aiResult.confidence,
        process_id: finalProcessId,
        matched_process_number: finalMatchedProcessNumber,
        metadata: updatedMetadata,
        analyzed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', emailRecord.id);

    if (updateError) {
      throw new Error(`Falha ao atualizar e-mail processado: ${updateError.message}`);
    }

    if (finalProcessId) {
      const aiEvidenceRows: any[] = [];
      const pushFieldEvidence = (fieldName: string, field: { value: unknown; confidence: number; evidence?: string | null }) => {
        if (field.value == null || field.value === '' || field.confidence < 0.70) return;
        aiEvidenceRows.push({
          process_id: finalProcessId,
          processed_email_id: emailRecord.id,
          field_name: fieldName,
          extracted_value: field.value,
          source_type: 'EMAIL',
          extraction_method: 'GEMINI',
          confidence: field.confidence,
          evidence_excerpt: field.evidence || `Interpretação semântica baseada em blocos de evidência.`,
        });
      };

      pushFieldEvidence('process_number_ia', aiResult.identification.numeroProcesso);
      pushFieldEvidence('fase_processual_ia', aiResult.classification.faseProcessual);
      pushFieldEvidence('tutela_ia', aiResult.classification.tutelaUrgencia);
      pushFieldEvidence('natureza_ia', aiResult.classification.natureza);
      pushFieldEvidence('tipo_demanda_ia', aiResult.classification.tipoDemanda);
      pushFieldEvidence('comarca_ia', aiResult.identification.comarca);
      pushFieldEvidence('uf_ia', aiResult.identification.uf);

      if (aiResult.obligationStructured.exists && aiResult.obligationStructured.description.value) {
        pushFieldEvidence('obrigacao_ia', aiResult.obligationStructured.description);
      }
      if (aiResult.values.valorCausa.value !== null) {
        pushFieldEvidence('valor_causa_ia', aiResult.values.valorCausa);
      }
      if (aiResult.values.valorMultaDiaria.value !== null) pushFieldEvidence('valor_multa_diaria_ia', aiResult.values.valorMultaDiaria);
      if (aiResult.values.valorMultaLimite.value !== null) pushFieldEvidence('valor_multa_limite_ia', aiResult.values.valorMultaLimite);
      if (aiResult.values.valorMulta.value !== null) pushFieldEvidence('valor_multa_ia', aiResult.values.valorMulta);

      if (aiEvidenceRows.length > 0) {
        const { data: existingAiEvidence, error: existingAiError } = await supabase
          .from('process_evidence')
          .select('field_name, extracted_value, extraction_method')
          .eq('processed_email_id', emailRecord.id)
          .eq('extraction_method', 'GEMINI');
        if (existingAiError) throw new Error(`Falha ao conferir evidências semânticas existentes: ${existingAiError.message}`);

        const keys = new Set((existingAiEvidence || []).map((row: any) => `${row.field_name}|${String(row.extracted_value)}`));
        const newRows = aiEvidenceRows.filter((row) => !keys.has(`${row.field_name}|${String(row.extracted_value)}`));
        if (newRows.length) {
          const { error: aiEvidenceError } = await supabase.from('process_evidence').insert(newRows);
          if (aiEvidenceError) throw new Error(`Falha ao inserir evidências semânticas: ${aiEvidenceError.message}`);
        }
      }
    }

    // 9. Ao finalizar
    console.log('[AI PROCESS] 9 - processamento concluído');

    return res.status(200).json({
      ok: true,
      processed_email_id: emailRecord.id,
      status: newStatus,
      confidence: aiResult.confidence,
      model: aiOutcome.model,
      event_type: aiResult.eventType,
      action_summary: aiResult.actionSummary,
      timeline_created: timelineCreated,
      obligation_created: obligationCreated,
      obligation_updated: obligationUpdated,
      application_decisions: applicationDecisions,
    });
  } catch (error: any) {
    console.error('[AI PROCESS] ERRO', {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro interno no processamento da IA',
    });
  }
});

export default router;
