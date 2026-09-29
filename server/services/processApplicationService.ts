import { ENV } from '../config/env';
import { filterExternalProtocols } from './protocolExtractionService';
import type { InterpretationResult } from './legalInterpretationService';
import { enqueueManagementRefreshSafe } from './aiManagementRefreshQueueService';
import { resolveCompanyForProcess } from './companyResolutionService';
import { classifyPartyRole } from './partyClassificationService';
import { ensureProcessOrigin } from './processOriginHelper';

type ProcessApplicationAction = 'CREATED' | 'LINKED' | 'UPDATED' | 'DISTRIBUTED' | 'AMBIGUOUS' | 'SKIPPED';

export interface ProcessApplicationResult {
  action: ProcessApplicationAction;
  processId: string | null;
  matchedProcessNumber: string | null;
  processCreated: boolean;
  processUpdated: boolean;
  timelineCreated: boolean;
  exceptionType: string | null;
  exceptionReason: string | null;
  processIds?: string[];
  processNumbers?: string[];
  routingMode?: 'SINGLE_PROCESS' | 'MULTI_PROCESS_DISTRIBUTION' | 'REVIEW_REQUIRED' | null;
  routingRule?: string | null;
  auxiliaryCnjs?: string[];
  processDistribution?: Record<string, unknown> | null;
}

export function canonicalCnj(value: string): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 20) return null;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

/** Validação oficial do dígito verificador CNJ pelo módulo 97. */
export function isValidCnj(value: string): boolean {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 20 || !/^\d{20}$/.test(digits)) return false;

  // NNNNNNN-DD.AAAA.J.TR.OOOO -> remove DD e calcula 98 - (base00 mod 97)
  const base = `${digits.slice(0, 7)}${digits.slice(9)}`;
  try {
    const remainder = BigInt(`${base}00`) % 97n;
    const expected = String(98n - remainder).padStart(2, '0');
    return digits.slice(7, 9) === expected;
  } catch {
    return false;
  }
}

function stripMailPrefixes(subject: string) {
  return String(subject || '')
    .replace(/^\s*((re|fw|fwd|enc)\s*:\s*)+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function inferPriority(interpretation: InterpretationResult): 'ALTA' | 'MEDIA' {
  const terms = new Set(interpretation.extractedData.keywordsFound.map((v) => v.toLowerCase()));
  const urgent = [
    'intimação', 'intime-se', 'citação', 'tutela', 'liminar', 'prazo', 'multa',
    'astreinte', 'bloqueio judicial', 'determino', 'cumpra-se', 'mandado'
  ];
  return interpretation.relevanceScore >= 85 || urgent.some((term) => terms.has(term)) ? 'ALTA' : 'MEDIA';
}

function inferPhase(interpretation: InterpretationResult): string | null {
  const terms = new Set(interpretation.extractedData.keywordsFound.map((v) => v.toLowerCase()));
  if (terms.has('sentença')) return 'SENTENÇA';
  if (terms.has('acórdão')) return 'ACÓRDÃO';
  if (terms.has('execução') || terms.has('cumprimento')) return 'CUMPRIMENTO / EXECUÇÃO';
  if (terms.has('recurso') || terms.has('apelação') || terms.has('agravo') || terms.has('embargos')) return 'RECURSAL';
  if (terms.has('citação')) return 'CITAÇÃO';
  return null;
}


async function ensureTimelineEvent(params: {
  supabase: any;
  processId: string;
  emailId: string;
  subject: string;
  receivedAt: string;
  interpretation: InterpretationResult;
  actorId: string | null;
}) {
  const { supabase, processId, emailId, subject, receivedAt, interpretation, actorId } = params;

  const { data: existing } = await supabase
    .from('process_timeline')
    .select('id')
    .eq('process_id', processId)
    .eq('email_id', emailId)
    .eq('tipo', 'EMAIL_INTERPRETADO')
    .limit(1)
    .maybeSingle();

  if (existing?.id) return false;

  const description = [
    'Comunicação jurídica recebida e triada automaticamente pelo motor determinístico.',
    `Classificação: ${interpretation.classification}.`,
    `Relevância: ${interpretation.relevanceScore}/100.`,
    `Necessidade de IA: ${interpretation.aiNeedScore}/100.`,
    subject ? `Assunto: ${stripMailPrefixes(subject)}` : null,
    interpretation.extractedData.partyNames.length ? `Partes identificadas: ${interpretation.extractedData.partyNames.slice(0, 3).join(', ')}.` : null,
    interpretation.extractedData.monetaryValues.length ? `Valores mencionados: ${interpretation.extractedData.monetaryValues.slice(0, 3).join(', ')}.` : null,
    interpretation.extractedData.dates.length ? `Datas mencionadas: ${interpretation.extractedData.dates.slice(0, 3).join(', ')}.` : null,
  ].filter(Boolean).join(' ');

  const { error } = await supabase.from('process_timeline').insert({
    process_id: processId,
    tipo: 'EMAIL_INTERPRETADO',
    titulo: 'Comunicação jurídica triada',
    descricao: description.slice(0, 1500),
    data_hora: receivedAt,
    origem: 'IMAP_DETERMINISTICO',
    usuario_id: actorId || null,
    email_id: emailId,
    automatico: true,
  });

  if (error) throw new Error(`Falha ao registrar timeline automática: ${error.message}`);
  return true;
}

async function ensureProcessParties(params: { supabase: any; processId: string; names: string[]; evidences?: any[] }) {
  const { supabase, processId, names, evidences = [] } = params;
  const normalized = [...new Set(names
    .map((name) => String(name || '').replace(/\s+/g, ' ').trim())
    .filter((name) => name.length >= 5))];
  if (!normalized.length) return;

  const { data: existingRows, error: existingError } = await supabase
    .from('process_parties')
    .select('nome')
    .eq('process_id', processId);
  if (existingError) throw new Error(`Falha ao conferir partes existentes: ${existingError.message}`);

  const existingNames = new Set((existingRows || []).map((row: any) => String(row.nome || '').toLocaleLowerCase('pt-BR').trim()));
  const rows = normalized
    .filter((name) => !existingNames.has(name.toLocaleLowerCase('pt-BR')))
    .map((name, index) => {
      const contexts = evidences.filter(e => e.field_name === 'parte_nome' && String(e.extracted_value || '').toLowerCase() === name.toLowerCase());
      const role = classifyPartyRole(name, contexts);
      return {
        process_id: processId,
        nome: name,
        tipo: role,
        principal: (existingRows || []).length === 0 && index === 0,
      };
    });

  if (!rows.length) return;
  const { error } = await supabase.from('process_parties').insert(rows);
  if (error) throw new Error(`Falha ao registrar partes identificadas: ${error.message}`);
}

async function writeHistory(params: {
  supabase: any;
  processId: string;
  actorId: string | null;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
}) {
  const { supabase, processId, actorId, changes } = params;
  if (changes.length === 0) return;

  const rows = changes.map((change) => ({
    process_id: processId,
    campo: change.field,
    valor_anterior: change.before == null ? null : String(change.before),
    valor_novo: change.after == null ? null : String(change.after),
    usuario_id: actorId || null,
    origem: 'IMAP_DETERMINISTICO',
  }));

  const { error } = await supabase.from('process_history').insert(rows);
  if (error) throw new Error(`Falha ao registrar histórico do processo: ${error.message}`);
}

const LIVE_MULTI_ORIGIN = 'IMAP_DETERMINISTICO_MULTI_PROCESSO';
const LIVE_ROUTING_VERSION = 'CNJ_ROUTING_20260915';

async function applyLiveMultiProcessDistribution(params: {
  supabase: any;
  interpretation: InterpretationResult;
  emailId: string;
  receivedAt: string;
  actorId: string | null;
  baseResult: ProcessApplicationResult;
}): Promise<ProcessApplicationResult> {
  const { supabase, interpretation, emailId, receivedAt, actorId, baseResult } = params;
  const routing = interpretation.processRouting;
  const targetCnjs = Array.from(new Set<string>((routing?.targetCnjs || [])
    .map((cnj: string) => canonicalCnj(cnj))
    .filter((cnj: string | null): cnj is string => Boolean(cnj))));

  if (!routing || routing.mode !== 'MULTI_PROCESS_DISTRIBUTION' || targetCnjs.length < 2) {
    return {
      ...baseResult,
      action: 'AMBIGUOUS',
      exceptionType: 'CNJ_MULTIPLO_AMBIGUO',
      exceptionReason: 'Distribuição multiprocesso sem decisão estrutural B2 válida.',
      routingMode: routing?.mode || 'REVIEW_REQUIRED',
      routingRule: routing?.rule || null,
    };
  }

  const invalidTargets = targetCnjs.filter(cnj => !isValidCnj(cnj));
  if (invalidTargets.length > 0) {
    return {
      ...baseResult,
      action: 'AMBIGUOUS',
      processId: null,
      matchedProcessNumber: null,
      exceptionType: 'CNJ_MULTIPLO_AMBIGUO',
      exceptionReason: `Distribuição B2 contém CNJ inválido (${invalidTargets.join(', ')}). Nenhum vínculo multiprocesso foi aplicado.`,
      routingMode: routing.mode,
      routingRule: routing.rule,
    };
  }

  const { data: processRows, error: processError } = await supabase
    .from('processes')
    .select('id,numero_processo')
    .in('numero_processo', targetCnjs);
  if (processError) throw new Error(`Falha ao validar processos da distribuição multiprocesso: ${processError.message}`);

  const byCnj = new Map<string, any[]>();
  for (const row of processRows || []) {
    const cnj = canonicalCnj(String(row.numero_processo || '')) || String(row.numero_processo || '');
    const rows = byCnj.get(cnj) || [];
    rows.push(row);
    byCnj.set(cnj, rows);
  }

  const inconsistent = targetCnjs
    .map(cnj => ({ cnj, count: (byCnj.get(cnj) || []).length }))
    .filter(item => item.count !== 1);
  if (inconsistent.length > 0) {
    return {
      ...baseResult,
      action: 'AMBIGUOUS',
      processId: null,
      matchedProcessNumber: null,
      exceptionType: 'CNJ_MULTIPLO_AMBIGUO',
      exceptionReason: `Distribuição documental B2 identificada, mas os processos-alvo não possuem correspondência única em processes: ${inconsistent.map(item => `${item.cnj}(${item.count})`).join(', ')}. Nenhum processo foi criado automaticamente.`,
      routingMode: routing.mode,
      routingRule: routing.rule,
      processNumbers: targetCnjs,
      auxiliaryCnjs: routing.auxiliaryCnjs || [],
    };
  }

  const targets = targetCnjs.map(cnj => ({ cnj, processId: byCnj.get(cnj)![0].id }));
  const targetProcessIds = targets.map(item => item.processId);

  const { data: currentEmail, error: emailError } = await supabase
    .from('processed_emails')
    .select('id,process_id')
    .eq('id', emailId)
    .single();
  if (emailError || !currentEmail) {
    throw new Error(`Falha ao validar e-mail antes da distribuição multiprocesso: ${emailError?.message || 'sem retorno'}`);
  }
  if (currentEmail.process_id && !targetProcessIds.includes(currentEmail.process_id)) {
    return {
      ...baseResult,
      action: 'AMBIGUOUS',
      processId: currentEmail.process_id,
      matchedProcessNumber: null,
      exceptionType: 'CNJ_MULTIPLO_AMBIGUO',
      exceptionReason: 'O e-mail já possui process_id incompatível com os processos-alvo da distribuição B2.',
      routingMode: routing.mode,
      routingRule: routing.rule,
      processIds: targetProcessIds,
      processNumbers: targetCnjs,
      auxiliaryCnjs: routing.auxiliaryCnjs || [],
    };
  }

  let timelineCreated = false;
  for (const target of targets) {
    const sourceRefs = routing.sourcesByCnj?.[target.cnj] || [];
    const sourceText = sourceRefs.map(source => `${source.kind}:${source.source}`).join(', ') || 'evidência documental';

    const existingEvidence = await supabase.from('process_evidence')
      .select('id,extracted_value')
      .eq('process_id', target.processId)
      .eq('processed_email_id', emailId)
      .eq('field_name', 'numero_processo_cnj')
      .limit(100);
    if (existingEvidence.error) throw new Error(`Falha ao conferir evidência multiprocesso de ${target.cnj}: ${existingEvidence.error.message}`);
    const evidenceExists = (existingEvidence.data || []).some((row: any) => canonicalCnj(String(row.extracted_value || '')) === target.cnj);
    if (!evidenceExists) {
      const insertedEvidence = await supabase.from('process_evidence').insert({
        process_id: target.processId,
        processed_email_id: emailId,
        field_name: 'numero_processo_cnj',
        extracted_value: target.cnj,
        source_type: sourceRefs.some(source => String(source.kind).toUpperCase() === 'ATTACHMENT') ? 'DOCUMENT' : 'EMAIL',
        extraction_method: 'SYSTEM',
        confidence: 0.99,
        evidence_excerpt: `Roteamento preventivo ${routing.rule}. Fontes: ${sourceText}`.slice(0, 520),
      });
      if (insertedEvidence.error) throw new Error(`Falha ao registrar evidência multiprocesso de ${target.cnj}: ${insertedEvidence.error.message}`);
    }

    const existingTimeline = await supabase.from('process_timeline')
      .select('id')
      .eq('process_id', target.processId)
      .eq('email_id', emailId)
      .eq('tipo', 'EMAIL_INTERPRETADO')
      .eq('origem', LIVE_MULTI_ORIGIN)
      .limit(1)
      .maybeSingle();
    if (existingTimeline.error) throw new Error(`Falha ao conferir timeline multiprocesso de ${target.cnj}: ${existingTimeline.error.message}`);
    if (!existingTimeline.data?.id) {
      const insertedTimeline = await supabase.from('process_timeline').insert({
        process_id: target.processId,
        email_id: emailId,
        tipo: 'EMAIL_INTERPRETADO',
        titulo: 'Distribuição multiprocesso por evidência documental',
        descricao: `CNJ ${target.cnj}. Regra ${routing.rule}. Fontes: ${sourceText}. CNJs auxiliares: ${(routing.auxiliaryCnjs || []).join(', ') || 'nenhum'}. Nenhum processo novo foi criado.`.slice(0, 1500),
        data_hora: receivedAt,
        origem: LIVE_MULTI_ORIGIN,
        usuario_id: actorId || null,
        automatico: true,
      });
      if (insertedTimeline.error) throw new Error(`Falha ao registrar timeline multiprocesso de ${target.cnj}: ${insertedTimeline.error.message}`);
      timelineCreated = true;
    }

    await enqueueManagementRefreshSafe({
      supabase,
      processId: target.processId,
      emailId,
      trigger: 'LEGAL_EMAIL_LINKED',
      changedFields: ['multi_process_distribution'],
    });
  }

  const now = new Date().toISOString();
  const distribution = {
    version: LIVE_ROUTING_VERSION,
    routed_at: now,
    routed_by: actorId,
    mode: 'MULTI_PROCESS',
    rule: routing.rule,
    links: targets.map(target => ({
      process_id: target.processId,
      numero_processo: target.cnj,
      sources: routing.sourcesByCnj?.[target.cnj] || [],
    })),
    ignored_auxiliary_cnjs: routing.auxiliaryCnjs || [],
  };

  return {
    ...baseResult,
    action: 'DISTRIBUTED',
    processId: currentEmail.process_id || null,
    matchedProcessNumber: null,
    processCreated: false,
    processUpdated: false,
    timelineCreated,
    exceptionType: null,
    exceptionReason: null,
    processIds: targetProcessIds,
    processNumbers: targetCnjs,
    routingMode: routing.mode,
    routingRule: routing.rule,
    auxiliaryCnjs: routing.auxiliaryCnjs || [],
    processDistribution: distribution,
  };
}

/**
 * Aplica apenas fatos determinísticos e seguros à Gestão de Processos.
 * Valores monetários e datas extraídas NÃO viram valor_causa/obrigações automaticamente.
 */
export async function applyInterpretationToProcess(params: {
  supabase: any;
  interpretation: InterpretationResult;
  emailId: string;
  subject: string;
  receivedAt: string;
  actorId: string | null;
}): Promise<ProcessApplicationResult> {
  const { supabase, interpretation, emailId, subject, receivedAt, actorId } = params;

  const baseResult: ProcessApplicationResult = {
    action: 'SKIPPED',
    processId: interpretation.processId,
    matchedProcessNumber: interpretation.matchedProcessNumber,
    processCreated: false,
    processUpdated: false,
    timelineCreated: false,
    exceptionType: null,
    exceptionReason: null,
  };

  // Não cria/atualiza gestão processual para conteúdo abaixo do limiar jurídico.
  const relevanceThreshold = ENV.ai.legalRelevanceThreshold;
  if (interpretation.relevanceScore < relevanceThreshold || interpretation.classification === 'NÃO JURÍDICO') {
    return baseResult;
  }

  const distinctCanonicalCnjs: string[] = Array.from(new Set<string>(
    (interpretation.extractedData.cnjs || [])
      .map((value: string) => canonicalCnj(value))
      .filter((value: string | null): value is string => value !== null)
  ));

  const routing = interpretation.processRouting || null;

  // MULTI_PROCESS só é permitido quando o roteador preventivo B2 já separou
  // documentalmente os processos. Esta camada revalida existência/unicidade e
  // jamais cria processo novo em distribuição multiprocesso.
  if (distinctCanonicalCnjs.length > 1 && routing?.mode === 'MULTI_PROCESS_DISTRIBUTION') {
    return applyLiveMultiProcessDistribution({
      supabase,
      interpretation,
      emailId,
      receivedAt,
      actorId,
      baseResult,
    });
  }

  let effectiveCanonicalCnjs = distinctCanonicalCnjs;
  if (distinctCanonicalCnjs.length > 1 && routing?.mode === 'SINGLE_PROCESS') {
    const routedTarget = canonicalCnj(routing.targetCnjs?.[0] || '');
    if (!routedTarget || !distinctCanonicalCnjs.includes(routedTarget)) {
      return {
        ...baseResult,
        action: 'AMBIGUOUS',
        exceptionType: 'CNJ_MULTIPLO_AMBIGUO',
        exceptionReason: 'Roteamento SINGLE_PROCESS inconsistente com os CNJs efetivamente extraídos.',
        routingMode: 'REVIEW_REQUIRED',
        routingRule: routing.rule || null,
      };
    }
    effectiveCanonicalCnjs = [routedTarget];
  } else if (distinctCanonicalCnjs.length > 1) {
    // Compatibilidade segura com registros antigos sem processRouting e com
    // qualquer cenário que o classificador tenha mantido como revisão humana.
    return {
      ...baseResult,
      action: 'AMBIGUOUS',
      exceptionType: 'CNJ_MULTIPLO_AMBIGUO',
      exceptionReason: `Foram identificados ${distinctCanonicalCnjs.length} números de processo distintos no mesmo e-mail (${distinctCanonicalCnjs.join(', ')}). Nenhum vínculo foi aplicado automaticamente.`,
      routingMode: routing?.mode || 'REVIEW_REQUIRED',
      routingRule: routing?.rule || null,
    };
  }

  const rawPrimaryCnj = effectiveCanonicalCnjs[0] || null;
  const primaryCnj = rawPrimaryCnj ? canonicalCnj(rawPrimaryCnj) : null;
  const validProtocols = filterExternalProtocols(interpretation.extractedData.protocols);
  const primaryProtocol = validProtocols.length === 1
    ? validProtocols[0]
    : null;

  let processId = interpretation.processId;
  let matchedProcessNumber = interpretation.matchedProcessNumber;
  let created = false;
  let updated = false;

  // Revalida o CNJ antes de qualquer criação/vínculo automático. Regex sozinho não é suficiente.
  if (!processId && primaryCnj) {
    const cnjDigitValid = isValidCnj(primaryCnj);
    if (!cnjDigitValid) {
      return {
        ...baseResult,
        action: 'AMBIGUOUS',
        processId: null,
        matchedProcessNumber: null,
        exceptionType: 'CNJ_DV_PENDENTE_VALIDACAO',
        exceptionReason: `O processo ${primaryCnj} foi extraído do e-mail, mas o dígito verificador CNJ não passou no módulo 97. Nenhum processo foi criado ou vinculado automaticamente.`,
      };
    }

    const { data: matches, error: matchError } = await supabase
      .from('processes')
      .select('id, numero_processo, protocolo_externo, origem, natureza, fase_processual, company_id, objeto_demanda, prioridade, status_atual, recebido_em, ultimo_evento_em, cadastro_incompleto, pendencias')
      .eq('numero_processo', primaryCnj);

    if (matchError) throw new Error(`Falha ao conferir CNJ na Gestão de Processos: ${matchError.message}`);

    if ((matches || []).length > 1) {
      return {
        ...baseResult,
        action: 'AMBIGUOUS',
        exceptionType: 'CNJ_MULTIPLO_AMBIGUO',
        exceptionReason: `Foram encontrados ${(matches || []).length} processos cadastrados com o mesmo CNJ (${primaryCnj}). Necessária revisão humana.`,
      };
    }

    if ((matches || []).length === 1) {
      processId = matches[0].id;
      matchedProcessNumber = matches[0].numero_processo;
    } else {
      const companyResolution = await resolveCompanyForProcess(supabase, {
        processId: null,
        cnpjs: interpretation.extractedData.cnpjs,
        names: interpretation.extractedData.partyNames,
        actorId,
      });
      const companyId = companyResolution.companyId;
      const inferredPhase = inferPhase(interpretation);
      const priority = inferPriority(interpretation);
      const object = stripMailPrefixes(subject) || null;
      const pendencias = [
        'Revisar classificação jurídica por IA/humano',
        'Confirmar partes do processo',
        'Confirmar tipo/subtipo da demanda',
        interpretation.extractedData.monetaryValues.length > 0 ? 'Classificar significado dos valores monetários extraídos' : null,
        interpretation.extractedData.dates.length > 0 ? 'Classificar significado jurídico das datas/prazos extraídos' : null,
      ].filter(Boolean);

      console.log('[PROCESS APPLY] process create preflight', { actorId, numeroProcesso: primaryCnj });
      const { data: createdProcess, error: createError } = await supabase
        .from('processes')
        .insert({
          numero_processo: primaryCnj,
          protocolo_externo: primaryProtocol,
          origem: 'EMAIL_JURIDICO_IMAP',
          natureza: 'JUDICIAL',
          fase_processual: inferredPhase,
          company_id: companyId,
          objeto_demanda: object,
          prioridade: priority,
          status_atual: 'TRIAGEM',
          recebido_em: receivedAt,
          aberto_em: new Date().toISOString(),
          ultimo_evento_em: receivedAt,
          cadastro_incompleto: true,
          pendencias: pendencias.length > 0 ? pendencias : null,
          created_by: actorId || null,
          updated_by: actorId || null,
        })
        .select('id, numero_processo')
        .single();

      if (createError || !createdProcess) {
        throw new Error(`Falha ao criar processo em TRIAGEM: ${createError?.message || 'sem retorno'}`);
      }

      processId = createdProcess.id;
      matchedProcessNumber = createdProcess.numero_processo;
      created = true;

      // Agora que o processo existe, refaz a resolução para permitir auditoria,
      // autocadastro seguro ou criação de candidato de confirmação.
      if (!companyId) {
        const postCreateResolution = await resolveCompanyForProcess(supabase, {
          processId,
          cnpjs: interpretation.extractedData.cnpjs,
          names: interpretation.extractedData.partyNames,
          actorId,
        });
        if (postCreateResolution.companyId) {
          const { error: companyUpdateError } = await supabase.from('processes').update({
            company_id: postCreateResolution.companyId,
            updated_by: actorId || null,
            updated_at: new Date().toISOString(),
          }).eq('id', processId).is('company_id', null);
          if (companyUpdateError) console.warn('[COMPANY RESOLUTION] falha ao vincular empresa pós-criação:', companyUpdateError.message);
        }
      }
    }
  }

  // Sem CNJ válido, só vincula quando a etapa determinística já encontrou processo único por protocolo.
  if (!processId) return baseResult;

  const { data: currentProcess, error: loadError } = await supabase
    .from('processes')
    .select('id, numero_processo, protocolo_externo, origem, natureza, fase_processual, company_id, objeto_demanda, prioridade, ultimo_evento_em, cadastro_incompleto, pendencias')
    .eq('id', processId)
    .single();

  if (loadError || !currentProcess) {
    throw new Error(`Falha ao carregar processo vinculado: ${loadError?.message || 'sem retorno'}`);
  }

  if (!created) {
    const patch: Record<string, unknown> = {};
    const changes: Array<{ field: string; before: unknown; after: unknown }> = [];

    const setIfEmpty = (field: string, value: unknown) => {
      if (value == null || value === '') return;
      if (currentProcess[field] == null || currentProcess[field] === '') {
        patch[field] = value;
        changes.push({ field, before: currentProcess[field], after: value });
      }
    };

    setIfEmpty('protocolo_externo', primaryProtocol);
    setIfEmpty('origem', 'EMAIL_JURIDICO_IMAP');
    setIfEmpty('natureza', primaryCnj ? 'JUDICIAL' : null);
    setIfEmpty('fase_processual', inferPhase(interpretation));
    setIfEmpty('objeto_demanda', stripMailPrefixes(subject));
    setIfEmpty('prioridade', inferPriority(interpretation));

    if (!currentProcess.company_id) {
      const companyResolution = await resolveCompanyForProcess(supabase, {
        processId: null,
        cnpjs: interpretation.extractedData.cnpjs,
        names: interpretation.extractedData.partyNames,
        actorId,
      });
      const companyId = companyResolution.companyId;
      if (companyId) {
        patch.company_id = companyId;
        changes.push({ field: 'company_id', before: null, after: companyId });
      }
    }

    const previousEvent = currentProcess.ultimo_evento_em ? new Date(currentProcess.ultimo_evento_em).getTime() : 0;
    const incomingEvent = new Date(receivedAt).getTime();
    if (Number.isFinite(incomingEvent) && incomingEvent > previousEvent) {
      patch.ultimo_evento_em = receivedAt;
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_by = actorId || null;
      patch.updated_at = new Date().toISOString();
      console.log('[PROCESS APPLY] process update preflight', {
        processId,
        actorId,
        updatedBy: patch.updated_by,
        fields: Object.keys(patch).filter((key) => key !== 'updated_at'),
      });
      const { error: updateError } = await supabase.from('processes').update(patch).eq('id', processId);
      if (updateError) throw new Error(`Falha ao enriquecer processo existente: ${updateError.message}`);
      updated = true;
      await writeHistory({ supabase, processId, actorId, changes });
    }
  }

  await ensureProcessParties({
    supabase,
    processId,
    names: interpretation.extractedData.partyNames,
    evidences: interpretation.evidences,
  });

  const timelineCreated = await ensureTimelineEvent({
    supabase,
    processId,
    emailId,
    subject,
    receivedAt,
    interpretation,
    actorId,
  });

  await ensureProcessOrigin({
    supabase,
    processId,
    emailId,
    receivedAt,
    actorId,
    definidoPor: 'SISTEMA',
  });


  // Fase 6B.2: shadow queue. Apenas sinaliza o processo para futura
  // atualização gerencial. Nenhuma chamada adicional de IA acontece aqui.
  await enqueueManagementRefreshSafe({
    supabase,
    processId,
    emailId,
    trigger: created
      ? 'PROCESS_CREATED'
      : updated
        ? 'PROCESS_UPDATED'
        : 'LEGAL_EMAIL_LINKED',
    changedFields: created
      ? ['process_created']
      : updated
        ? ['process_updated']
        : [],
  });

  const resolvedMatchedProcessNumber = matchedProcessNumber || currentProcess.numero_processo || primaryProtocol;
  return {
    action: created ? 'CREATED' : updated ? 'UPDATED' : 'LINKED',
    processId,
    matchedProcessNumber: resolvedMatchedProcessNumber,
    processCreated: created,
    processUpdated: updated,
    timelineCreated,
    exceptionType: null,
    exceptionReason: null,
    processIds: processId ? [processId] : [],
    processNumbers: resolvedMatchedProcessNumber ? [resolvedMatchedProcessNumber] : [],
    routingMode: routing?.mode || (primaryCnj ? 'SINGLE_PROCESS' : null),
    routingRule: routing?.rule || (primaryCnj ? 'SINGLE_CNJ' : null),
    auxiliaryCnjs: routing?.auxiliaryCnjs || [],
    processDistribution: null,
  };
}
