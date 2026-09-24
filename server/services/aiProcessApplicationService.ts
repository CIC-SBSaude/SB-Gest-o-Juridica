import {
  AiLegalInterpretation,
  AI_FIELD_THRESHOLDS,
  AiFieldDecisionInfo,
  AiExtractedField,
} from './geminiLegalInterpreter';
import { enqueueManagementRefreshSafe } from './aiManagementRefreshQueueService';

function safeDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const time = Date.parse(value.includes('T') ? value : `${value}T12:00:00Z`);
  return Number.isFinite(time) ? value : null;
}


function normalizeForSimilarity(value: string): string[] {
  const stop = new Set(['a','o','as','os','de','da','do','das','dos','e','em','no','na','nos','nas','ao','aos','para','por','com','um','uma','que','se','ser','esta','este','essa','esse','prazo']);
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 3 && !stop.has(t));
}

function semanticTextSimilarity(a: string, b: string): number {
  const aa = new Set(normalizeForSimilarity(a));
  const bb = new Set(normalizeForSimilarity(b));
  if (!aa.size || !bb.size) return 0;
  let intersection = 0;
  for (const token of aa) if (bb.has(token)) intersection += 1;
  const union = new Set([...aa, ...bb]).size;
  return union ? intersection / union : 0;
}

function triggerIsReceiptOfThisCommunication(
  triggerValue: string | null | undefined,
  sourceText: string | null | undefined,
): boolean {
  const normalize = (value: string | null | undefined) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const trigger = normalize(triggerValue);
  const source = normalize(sourceText);
  const sourceExplicit = /(?:contad[oa]s?\s+do\s+)?recebimento\s+(desta|dessa|deste|desse)\s+(comunicacao|email|e-mail|mensagem)/.test(source);
  const triggerExplicit = /recebimento.*(desta|dessa|comunicacao|email|mensagem)/.test(trigger);
  const triggerCanonical = /^(recebimento|recebimento_da_comunicacao|recebimento_desta_comunicacao)$/.test(trigger.replace(/[\s-]+/g, '_'));
  return triggerExplicit || sourceExplicit || (triggerCanonical && sourceExplicit);
}

function addCalendarDeadline(receivedAt: string, quantity: number, unit: string): string | null {
  const start = new Date(receivedAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(quantity) || quantity <= 0) return null;
  const u = String(unit || '').toUpperCase();
  if (u === 'HORAS') { start.setTime(start.getTime() + quantity * 60 * 60 * 1000); return start.toISOString(); }
  if (u === 'UTEIS') return null;
  if (u === 'DIAS') { start.setUTCDate(start.getUTCDate() + quantity); return start.toISOString(); }
  if (u === 'MESES') { start.setUTCMonth(start.getUTCMonth() + quantity); return start.toISOString(); }
  if (u === 'ANOS') { start.setUTCFullYear(start.getUTCFullYear() + quantity); return start.toISOString(); }
  return null;
}

async function appendHistory(
  supabase: any,
  processId: string,
  actorId: string | null,
  changes: Array<{ field: string; before: unknown; after: unknown }>
) {
  if (!changes.length) return;
  const { error } = await supabase.from('process_history').insert(
    changes.map((change) => ({
      process_id: processId,
      campo: change.field,
      valor_anterior: change.before == null ? null : String(change.before),
      valor_novo: change.after == null ? null : String(change.after),
      usuario_id: actorId || null,
      origem: 'GEMINI',
    }))
  );
  if (error) throw new Error(`Falha ao registrar histórico da IA: ${error.message}`);
}

export interface AiApplicationResult {
  processUpdated: boolean;
  timelineCreated: boolean;
  obligationCreated: boolean;
  obligationUpdated: boolean;
  decisions: Record<string, AiFieldDecisionInfo>;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
}

export async function applyAiInterpretation(params: {
  supabase: any;
  processId: string;
  emailId: string;
  actorId: string | null;
  receivedAt: string;
  ai: AiLegalInterpretation;
  executionMode?: 'MANUAL' | 'AUTOMATIC';
  reanalysis?: boolean;
}): Promise<AiApplicationResult> {
  const { supabase, processId, emailId, actorId, receivedAt, ai, executionMode = 'MANUAL', reanalysis = false } = params;

  const { data: process, error } = await supabase
    .from('processes')
    .select(
      'id, natureza, fase_processual, tutela_atual, municipio, comarca, uf, situacao_beneficiario, tipo_demanda, subtipo_demanda, objeto_demanda, categoria_demanda, subcategoria_demanda, natureza_juridica, detalhe_demanda, classificacao_origem, prioridade, valor_causa, status_atual'
    )
    .eq('id', processId)
    .single();

  if (error || !process) {
    throw new Error(`Falha ao carregar processo para aplicação da IA: ${error?.message || 'sem retorno'}`);
  }

  const patch: Record<string, unknown> = {};
  const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
  const decisions: Record<string, AiFieldDecisionInfo> = {};

  // Função auxiliar para avaliar e registrar decisão por campo
  const evaluateField = <T>(
    dbField: string,
    fieldLabel: string,
    extracted: AiExtractedField<T>,
    threshold: number
  ) => {
    const existingValue = process[dbField];
    const safeExtracted: AiExtractedField<T> = extracted || ({ value: null, confidence: 0, evidence: null } as AiExtractedField<T>);
    const extractedVal = safeExtracted.value;
    const confidence = Number(safeExtracted.confidence || 0);
    const evidence = safeExtracted.evidence || null;

    if (extractedVal === null || extractedVal === undefined || extractedVal === '') {
      decisions[dbField] = {
        fieldName: dbField,
        fieldLabel,
        decision: 'NAO_IDENTIFICADO',
        confidence: 0,
        threshold,
        evidence: null,
        reason: 'Dado não identificado ou inconclusivo no documento.',
      };
      return;
    }

    const existingIsEmptyArray = Array.isArray(existingValue) && existingValue.length === 0;
    if (existingValue != null && existingValue !== '' && !existingIsEmptyArray) {
      decisions[dbField] = {
        fieldName: dbField,
        fieldLabel,
        decision: 'IGNORADO_CAMPO_PREENCHIDO',
        confidence,
        threshold,
        appliedValue: existingValue,
        evidence,
        reason: `Processo já possui '${existingValue}' cadastrado. Preservado para evitar sobrescrita indevida.`,
      };
      return;
    }

    if (confidence < threshold) {
      decisions[dbField] = {
        fieldName: dbField,
        fieldLabel,
        decision: 'NAO_APLICADO_CONFIANCA_INSUFICIENTE',
        confidence,
        threshold,
        appliedValue: extractedVal,
        evidence,
        reason: `Confiança (${Math.round(confidence * 100)}%) abaixo do threshold de segurança (${Math.round(threshold * 100)}%). Mantido para revisão humana.`,
      };
      return;
    }

    // Confiança >= threshold e campo vazio -> aplica
    patch[dbField] = extractedVal;
    changes.push({ field: dbField, before: existingValue, after: extractedVal });
    decisions[dbField] = {
      fieldName: dbField,
      fieldLabel,
      decision: 'APLICADO_AUTOMATICAMENTE',
      confidence,
      threshold,
      appliedValue: extractedVal,
      evidence,
      reason: `Aplicado automaticamente com confiança segura de ${Math.round(confidence * 100)}%.`,
    };
  };

  // Avaliação dos campos de Classificação e Localidade
  evaluateField('natureza', 'Natureza Jurídica', ai.classification.natureza, AI_FIELD_THRESHOLDS.PROCESS_FIELD);
  evaluateField('fase_processual', 'Fase Processual', ai.classification.faseProcessual, AI_FIELD_THRESHOLDS.PROCESS_FIELD);
  evaluateField('tutela_atual', 'Tutela de Urgência', ai.classification.tutelaUrgencia, AI_FIELD_THRESHOLDS.PROCESS_FIELD);
  evaluateField('municipio', 'Município', ai.identification.municipio, AI_FIELD_THRESHOLDS.PROCESS_FIELD);
  evaluateField('comarca', 'Comarca', ai.identification.comarca, AI_FIELD_THRESHOLDS.PROCESS_FIELD);
  evaluateField('uf', 'UF', ai.identification.uf, AI_FIELD_THRESHOLDS.PROCESS_FIELD);
  evaluateField('situacao_beneficiario', 'Situação do Beneficiário', ai.classification.situacaoBeneficiario, AI_FIELD_THRESHOLDS.PROCESS_FIELD);
  const classificationHumanLocked = ['MANUAL','IA_CONFIRMADA'].includes(String(process.classificacao_origem || ''));
  if (!classificationHumanLocked) {
    evaluateField('categoria_demanda', 'Categoria da Demanda', ai.classification.categoriaDemanda, AI_FIELD_THRESHOLDS.CLASSIFICATION);
    evaluateField('subcategoria_demanda', 'Subcategoria da Demanda', ai.classification.subcategoriaDemanda, AI_FIELD_THRESHOLDS.CLASSIFICATION);
    evaluateField('natureza_juridica', 'Natureza Jurídica', ai.classification.naturezasJuridicas, AI_FIELD_THRESHOLDS.CLASSIFICATION);
    evaluateField('detalhe_demanda', 'Detalhamento da Demanda', ai.classification.detalheDemanda, 0.85);
  }
  evaluateField('tipo_demanda', 'Tipo da Demanda', ai.classification.tipoDemanda, AI_FIELD_THRESHOLDS.CLASSIFICATION);
  evaluateField('subtipo_demanda', 'Subtipo da Demanda', ai.classification.subtipoDemanda, AI_FIELD_THRESHOLDS.CLASSIFICATION);
  evaluateField('objeto_demanda', 'Objeto da Demanda', ai.classification.objetoDemanda, AI_FIELD_THRESHOLDS.CLASSIFICATION);
  evaluateField('prioridade', 'Prioridade', ai.classification.prioridade, AI_FIELD_THRESHOLDS.PROCESS_FIELD);

  // Valor da Causa (estritamente diferenciado de multas/condenações)
  evaluateField('valor_causa', 'Valor da Causa', ai.values.valorCausa, AI_FIELD_THRESHOLDS.MONETARY_VALUE);

  // Evolução de Status: apenas a partir de NOVA/TRIAGEM com confiança rigorosa
  const suggestedStatus = ai.classification.suggestedStatus || ({ value: null, confidence: 0, evidence: null } as any);
  if (suggestedStatus.value && ['NOVA', 'TRIAGEM'].includes(String(process.status_atual))) {
    if (suggestedStatus.confidence >= AI_FIELD_THRESHOLDS.STATUS && ai.confidence >= AI_FIELD_THRESHOLDS.STATUS) {
      if (!['NOVA', 'TRIAGEM'].includes(suggestedStatus.value)) {
        patch.status_atual = suggestedStatus.value;
        changes.push({ field: 'status_atual', before: process.status_atual, after: suggestedStatus.value });
        decisions['status_atual'] = {
          fieldName: 'status_atual',
          fieldLabel: 'Status do Processo',
          decision: 'APLICADO_AUTOMATICAMENTE',
          confidence: suggestedStatus.confidence,
          threshold: AI_FIELD_THRESHOLDS.STATUS,
          appliedValue: suggestedStatus.value,
          evidence: suggestedStatus.evidence,
          reason: `Status evoluído de ${process.status_atual} para ${suggestedStatus.value} com confiança ${Math.round(suggestedStatus.confidence * 100)}%.`,
        };
      }
    } else {
      decisions['status_atual'] = {
        fieldName: 'status_atual',
        fieldLabel: 'Status do Processo',
        decision: 'AGUARDANDO_REVISAO',
        confidence: suggestedStatus.confidence,
        threshold: AI_FIELD_THRESHOLDS.STATUS,
        appliedValue: suggestedStatus.value,
        evidence: suggestedStatus.evidence,
        reason: `Status sugerido (${suggestedStatus.value}) requer revisão humana antes da transição.`,
      };
    }
  }

  const structuredClassificationApplied = ['categoria_demanda','subcategoria_demanda','natureza_juridica','detalhe_demanda'].some((field) => Object.prototype.hasOwnProperty.call(patch, field));
  if (structuredClassificationApplied && !classificationHumanLocked) {
    patch.classificacao_origem = 'IA';
    patch.classificacao_atualizada_em = new Date().toISOString();
  }

  // Grava patch no processo se houver alterações
  if (Object.keys(patch).length) {
    patch.updated_by = actorId || null;
    patch.updated_at = new Date().toISOString();
    console.log('[AI APPLY] processes update preflight', {
      processId,
      actorId,
      updatedBy: patch.updated_by,
      fields: Object.keys(patch).filter((key) => key !== 'updated_at'),
    });
    const { error: updateError } = await supabase.from('processes').update(patch).eq('id', processId);
    if (updateError) throw new Error(`Falha ao aplicar interpretação da IA no processo: ${updateError.message}`);
    await appendHistory(supabase, processId, actorId, changes);
  }

  // Linha do tempo (Timeline)
  let timelineCreated = false;
  if (ai.confidence >= AI_FIELD_THRESHOLDS.TIMELINE && (ai.timelineSummary || ai.eventType)) {
    const timelineType = reanalysis ? 'IA_REANALISE' : 'IA_INTERPRETACAO';
    const timelineOrigin = executionMode === 'AUTOMATIC' ? 'GEMINI_AUTOMATICO' : 'GEMINI_MANUAL';
    const { data: existingTimeline } = await supabase
      .from('process_timeline')
      .select('id, tipo')
      .eq('process_id', processId)
      .eq('email_id', emailId)
      .eq('tipo', timelineType)
      .limit(1)
      .maybeSingle();

    if (!existingTimeline?.id) {
      const { error: timelineError } = await supabase.from('process_timeline').insert({
        process_id: processId,
        tipo: timelineType,
        titulo: (ai.timelineTitle || ai.eventType || (reanalysis ? 'Reanálise jurídica por IA' : 'Interpretação jurídica por IA')).slice(0, 180),
        descricao: (ai.timelineSummary || ai.actionSummary || (reanalysis ? 'Comunicação reanalisada semanticamente pela IA.' : 'Comunicação interpretada semanticamente pela IA.')).slice(0, 1600),
        data_hora: new Date().toISOString(),
        origem: timelineOrigin,
        usuario_id: actorId || null,
        email_id: emailId,
        automatico: executionMode === 'AUTOMATIC',
      });
      if (timelineError) throw new Error(`Falha ao registrar timeline da IA: ${timelineError.message}`);
      timelineCreated = true;
    }
  }

  // Obrigação de Fazer / Não Fazer
  let obligationCreated = false;
  let obligationUpdated = false;
  const obStructured = ai.obligationStructured || ({ exists: false, confidence: 0, description: { value: null, confidence: 0, evidence: null }, type: { value: null, confidence: 0, evidence: null }, criticality: { value: null, confidence: 0, evidence: null }, dailyPenalty: { value: null, confidence: 0, evidence: null } } as any);
  const deadStructured = ai.deadlineStructured || ({ exists: false, confidence: 0, quantity: { value: null, confidence: 0, evidence: null }, unit: { value: null, confidence: 0, evidence: null }, dueDate: { value: null, confidence: 0, evidence: null }, triggerEvent: { value: null, confidence: 0, evidence: null }, sourceText: null } as any);
  const explicitDeadline = deadStructured.sourceText || (deadStructured.quantity.value ? `${deadStructured.quantity.value} ${deadStructured.unit.value || 'dias'}` : null);
  let dueDate = deadStructured.dueDate.confidence >= AI_FIELD_THRESHOLDS.DEADLINE_DUE_DATE
    ? safeDate(deadStructured.dueDate.value)
    : null;

  if (!dueDate && deadStructured.exists && deadStructured.confidence >= AI_FIELD_THRESHOLDS.DEADLINE_EXISTENCE &&
      deadStructured.quantity.value != null && deadStructured.quantity.confidence >= AI_FIELD_THRESHOLDS.DEADLINE_DUE_DATE &&
      deadStructured.unit.value && deadStructured.unit.confidence >= AI_FIELD_THRESHOLDS.DEADLINE_DUE_DATE &&
      triggerIsReceiptOfThisCommunication(deadStructured.triggerEvent.value, deadStructured.sourceText)) {
    dueDate = addCalendarDeadline(receivedAt, Number(deadStructured.quantity.value), String(deadStructured.unit.value));
  }

  const canCreateObligation =
    obStructured.exists &&
    obStructured.confidence >= AI_FIELD_THRESHOLDS.OBLIGATION_EXISTENCE &&
    Boolean(obStructured.description.value) &&
    obStructured.description.confidence >= AI_FIELD_THRESHOLDS.OBLIGATION_DESCRIPTION &&
    (Boolean(dueDate) || Boolean(explicitDeadline) || obStructured.dailyPenalty?.value != null);

  if (canCreateObligation && obStructured.description.value) {
    const description = obStructured.description.value.slice(0, 1000);
    const { data: candidateObligations, error: obligationLookupError } = await supabase
      .from('obligations')
      .select('id, descricao, evento_gerador, status, prazo, tipo_prazo, origem_prazo, valor_multa_diaria, valor_multa_limite, observacoes')
      .eq('process_id', processId)
      .in('status', ['ABERTA', 'PENDENTE', 'EM_ANDAMENTO']);
    if (obligationLookupError) throw new Error(`Falha ao verificar obrigações existentes: ${obligationLookupError.message}`);

    const incomingEvent = String(ai.eventType || '').trim().toUpperCase();
    const existingObligation = (candidateObligations || []).find((row: any) => {
      const existingDescription = String(row.descricao || '');
      const similarity = semanticTextSimilarity(description, existingDescription);
      const sameEvent = incomingEvent && String(row.evento_gerador || '').trim().toUpperCase() === incomingEvent;
      return existingDescription.trim().toLowerCase() === description.trim().toLowerCase() || similarity >= 0.72 || (sameEvent && similarity >= 0.55);
    });

    if (!existingObligation?.id) {
      const { error: obligationError } = await supabase.from('obligations').insert({
        process_id: processId,
        descricao: description,
        prazo: dueDate,
        status: 'ABERTA',
        tipo_prazo: dueDate ? 'DATA_CERTA' : 'A_CONFIRMAR',
        origem_prazo: 'GEMINI',
        evento_gerador: ai.eventType || null,
        criticidade: obStructured.criticality.value || ai.priority || 'ALTA',
        valor_multa_diaria: obStructured.dailyPenalty?.value ?? ai.values.valorMultaDiaria.value ?? null,
        valor_multa_limite: ai.values.valorMultaLimite.value ?? null,
        observacoes: explicitDeadline ? `Prazo identificado: ${explicitDeadline}`.slice(0, 1000) : null,
        created_by: actorId || null,
      });

      if (obligationError) throw new Error(`Falha ao criar obrigação interpretada pela IA: ${obligationError.message}`);
      obligationCreated = true;

      decisions['obrigacao'] = {
        fieldName: 'obrigacao',
        fieldLabel: 'Obrigação de Fazer / Não Fazer',
        decision: 'APLICADO_AUTOMATICAMENTE',
        confidence: obStructured.confidence,
        threshold: AI_FIELD_THRESHOLDS.OBLIGATION_EXISTENCE,
        appliedValue: description,
        evidence: obStructured.description.evidence || obStructured.type.evidence || null,
        reason: `Obrigação criada com confiança de existência (${Math.round(obStructured.confidence * 100)}%) e descrição (${Math.round(obStructured.description.confidence * 100)}%).`,
      };
    } else {
      // Deduplicação não significa imobilidade: uma reanálise pode completar campos
      // que estavam vazios, mas nunca sobrescreve prazo/multa já definidos.
      const obligationPatch: Record<string, unknown> = {};
      if (!existingObligation.prazo && dueDate) {
        obligationPatch.prazo = dueDate;
        obligationPatch.tipo_prazo = 'DATA_CERTA';
        obligationPatch.origem_prazo = 'GEMINI';
      }
      const dailyPenalty = obStructured.dailyPenalty?.value ?? ai.values.valorMultaDiaria.value ?? null;
      if (existingObligation.valor_multa_diaria == null && dailyPenalty != null) obligationPatch.valor_multa_diaria = dailyPenalty;
      if (existingObligation.valor_multa_limite == null && ai.values.valorMultaLimite.value != null) obligationPatch.valor_multa_limite = ai.values.valorMultaLimite.value;
      if (!existingObligation.observacoes && explicitDeadline) obligationPatch.observacoes = `Prazo identificado: ${explicitDeadline}`.slice(0, 1000);

      if (Object.keys(obligationPatch).length) {
        obligationPatch.updated_at = new Date().toISOString();
        const { error: enrichError } = await supabase.from('obligations').update(obligationPatch).eq('id', existingObligation.id);
        if (enrichError) throw new Error(`Falha ao completar obrigação equivalente: ${enrichError.message}`);
        obligationUpdated = true;
        decisions['obrigacao'] = {
          fieldName: 'obrigacao',
          fieldLabel: 'Obrigação de Fazer / Não Fazer',
          decision: 'APLICADO_AUTOMATICAMENTE',
          confidence: obStructured.confidence,
          threshold: AI_FIELD_THRESHOLDS.OBLIGATION_EXISTENCE,
          appliedValue: description,
          evidence: obStructured.description.evidence,
          reason: 'Obrigação equivalente preservada e enriquecida somente nos campos antes vazios; duplicação bloqueada.',
        };
      } else {
        decisions['obrigacao'] = {
          fieldName: 'obrigacao',
          fieldLabel: 'Obrigação de Fazer / Não Fazer',
          decision: 'IGNORADO_CAMPO_PREENCHIDO',
          confidence: obStructured.confidence,
          threshold: AI_FIELD_THRESHOLDS.OBLIGATION_EXISTENCE,
          appliedValue: description,
          evidence: obStructured.description.evidence,
          reason: 'Obrigação equivalente já cadastrada; nenhum campo vazio seguro para complementar.',
        };
      }
    }
  } else if (obStructured.exists) {
    decisions['obrigacao'] = {
      fieldName: 'obrigacao',
      fieldLabel: 'Obrigação de Fazer / Não Fazer',
      decision: 'NAO_APLICADO_CONFIANCA_INSUFICIENTE',
      confidence: obStructured.confidence,
      threshold: AI_FIELD_THRESHOLDS.OBLIGATION_EXISTENCE,
      appliedValue: obStructured.description.value,
      evidence: obStructured.description.evidence,
      reason: `Obrigação identificada mas não criada automaticamente devido a dados ou confiança insuficientes (Confiança: ${Math.round(obStructured.confidence * 100)}%).`,
    };
  } else {
    decisions['obrigacao'] = {
      fieldName: 'obrigacao',
      fieldLabel: 'Obrigação de Fazer / Não Fazer',
      decision: 'NAO_IDENTIFICADO',
      confidence: 0,
      threshold: AI_FIELD_THRESHOLDS.OBLIGATION_EXISTENCE,
      evidence: null,
      reason: 'Nenhuma obrigação de cumprimento detectada.',
    };
  }

  // Fase 6B.2: se a IA acrescentou informação relevante, renova o debounce
  // da mesma fila deduplicada por process_id. Continua sem gerar sugestão.
  if (changes.length > 0 || obligationCreated || obligationUpdated || timelineCreated) {
    const changedFields = [
      ...changes.map((change) => change.field),
      ...(obligationCreated ? ['obrigacao_criada'] : []),
      ...(obligationUpdated ? ['obrigacao_atualizada'] : []),
      ...(timelineCreated ? ['timeline_ia'] : []),
    ];

    await enqueueManagementRefreshSafe({
      supabase,
      processId,
      emailId,
      trigger: obligationCreated || obligationUpdated
        ? 'AI_OBLIGATION_CREATED'
        : changes.length > 0
          ? 'AI_PROCESS_UPDATED'
          : 'AI_RELEVANT_EVENT',
      changedFields,
    });
  }

  return {
    processUpdated: Object.keys(patch).length > 0,
    timelineCreated,
    obligationCreated,
    obligationUpdated,
    decisions,
    changes,
  };
}
