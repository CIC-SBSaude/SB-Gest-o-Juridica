import { summarizeDocumentIdentification, hasUnambiguousDocumentSeparation } from './documentIdentificationService.ts';

export { hasUnambiguousDocumentSeparation };

type DocumentIdentification = ReturnType<typeof summarizeDocumentIdentification>;

type SourceRef = { source: string; kind: string };

export type TargetProcessLink = {
  processId: string;
  cnj: string;
  sources: SourceRef[];
};

export type CnjA2Plan = {
  exceptionId: string;
  exceptionUpdatedAt: string;
  emailId: string;
  emailUpdatedAt: string;
  subject: string | null;
  currentProcessId: string | null;
  targets: TargetProcessLink[];
  allValidCnjs: string[];
  invalidCnjs: string[];
  rule: string;
  executable: boolean;
  reason: string;
  email: any;
};

type CnjA1Plan = {
  exceptionId: string;
  exceptionUpdatedAt: string;
  emailId: string;
  emailUpdatedAt: string;
  subject: string | null;
  currentProcessId: string | null;
  targetProcessId: string | null;
  targetCnj: string | null;
  allValidCnjs: string[];
  invalidCnjs: string[];
  rule: string | null;
  sources: SourceRef[];
  executable: boolean;
  reason: string;
  email: any;
};

const OPEN_STATUSES = ['ABERTA', 'PENDENTE'];
const REPAIR_ORIGIN = 'REPARO_CNJ_A1_DETERMINISTICO';
const REPAIR_VERSION = 'CNJ_A1_20260913';
const REPAIR_ORIGIN_A2 = 'REPARO_CNJ_A2_MULTI_PROCESSO';
const REPAIR_VERSION_A2 = 'CNJ_A2_20260914';

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function sameCnj(a: unknown, b: unknown) {
  const left = String(a || '').replace(/\D/g, '');
  const right = String(b || '').replace(/\D/g, '');
  return Boolean(left && right && left === right);
}

function cnjsForKinds(analysis: DocumentIdentification, kinds: string[]) {
  const allowed = new Set(kinds);
  return unique<string>(analysis.documents
    .filter((doc: any) => allowed.has(String(doc.kind || '').toUpperCase()))
    .flatMap((doc: any) => (doc.validCnjs || []) as string[]));
}

function sourcesForCnj(analysis: DocumentIdentification, cnj: string): SourceRef[] {
  const seen = new Set<string>();
  const result: SourceRef[] = [];
  for (const doc of analysis.documents as any[]) {
    if (!(doc.validCnjs || []).includes(cnj)) continue;
    const item = { source: String(doc.source || `Trecho ${doc.blockIndex}`), kind: String(doc.kind || 'UNKNOWN').toUpperCase() };
    const key = `${item.kind}|${item.source}`;
    if (!seen.has(key)) { seen.add(key); result.push(item); }
  }
  return result;
}

/**
 * Resolve apenas o subconjunto A1 comprovadamente unívoco.
 * Não interpreta semântica jurídica: usa somente a origem estrutural dos CNJs.
 */
export function selectDeterministicSingleCnj(analysis: DocumentIdentification): {
  cnj: string | null;
  rule: string | null;
  reason: string;
  sources: SourceRef[];
} {
  if (analysis.invalidCnjs.length > 0) {
    return { cnj: null, rule: null, reason: 'Há CNJ com DV inválido nos trechos disponíveis.', sources: [] };
  }

  const all = unique<string>(analysis.validCnjs as string[]);
  if (all.length === 0) return { cnj: null, rule: null, reason: 'Nenhum CNJ válido disponível.', sources: [] };

  // Exceção obsoleta: após reextração/normalização sobrou um único CNJ válido.
  if (all.length === 1) {
    return { cnj: all[0], rule: 'STALE_SINGLE_CNJ', reason: 'A exceção hoje contém somente um CNJ válido.', sources: sourcesForCnj(analysis, all[0]) };
  }

  const summaryCnjs = cnjsForKinds(analysis, ['SUMMARY']);
  const subjectCnjs = cnjsForKinds(analysis, ['SUBJECT']);
  const attachmentCnjs = cnjsForKinds(analysis, ['ATTACHMENT']);
  const nonSummaryCnjs = unique<string>((analysis.documents as any[])
    .filter(doc => String(doc.kind || '').toUpperCase() !== 'SUMMARY')
    .flatMap(doc => (doc.validCnjs || []) as string[]));

  // Nenhum documento individualizado pode conter mais de um CNJ para A1.
  const multiInAttachment = (analysis.documents as any[])
    .some(doc => String(doc.kind || '').toUpperCase() === 'ATTACHMENT' && (doc.validCnjs || []).length > 1);
  if (multiInAttachment) {
    return { cnj: null, rule: null, reason: 'Há mais de um CNJ no mesmo anexo/documento.', sources: [] };
  }

  // Caso clássico observado no dry-run: o conflito foi introduzido somente pelo SUMMARY.
  if (nonSummaryCnjs.length === 1 && all.some(cnj => cnj !== nonSummaryCnjs[0])
      && all.filter(cnj => cnj !== nonSummaryCnjs[0]).every(cnj => summaryCnjs.includes(cnj))) {
    const cnj = nonSummaryCnjs[0];
    const cnjSources = sourcesForCnj(analysis, cnj);
    if (cnjSources.some(src => src.kind === 'ATTACHMENT' || src.kind === 'SUBJECT')) {
      return { cnj, rule: 'ONLY_NON_SUMMARY_CNJ', reason: 'Um único CNJ é sustentado fora do SUMMARY (com presença em assunto ou anexo); os demais aparecem somente no resumo não individualizado.', sources: cnjSources };
    }
  }

  // Um único CNJ documental, com assunto compatível; demais números aparecem apenas em corpo/resumo auxiliar.
  if (attachmentCnjs.length === 1) {
    const cnj = attachmentCnjs[0];
    const subjectCompatible = subjectCnjs.length === 0 || (subjectCnjs.length === 1 && subjectCnjs[0] === cnj);
    const otherCnjs = all.filter(value => value !== cnj);
    const othersOnlyAuxiliary = otherCnjs.every(other => {
      const kinds = sourcesForCnj(analysis, other).map(src => src.kind);
      return kinds.length > 0 && kinds.every(kind => kind === 'BODY' || kind === 'TEXT' || kind === 'SUMMARY' || kind === 'UNKNOWN');
    });
    if (subjectCompatible && otherCnjs.length > 0 && othersOnlyAuxiliary) {
      return { cnj, rule: 'SINGLE_DOCUMENTARY_EVIDENCE', reason: 'Somente um CNJ possui evidência documental individualizada e o assunto não conflita com ele.', sources: sourcesForCnj(analysis, cnj) };
    }
  }

  // Sem anexo identificador, um único CNJ no assunto pode prevalecer somente quando os demais existem apenas no SUMMARY.
  if (subjectCnjs.length === 1) {
    const cnj = subjectCnjs[0];
    const otherCnjs = all.filter(value => value !== cnj);
    const othersOnlySummary = otherCnjs.length > 0 && otherCnjs.every(other => {
      const kinds = sourcesForCnj(analysis, other).map(src => src.kind);
      return kinds.length > 0 && kinds.every(kind => kind === 'SUMMARY');
    });
    if (othersOnlySummary) {
      return { cnj, rule: 'SUBJECT_OVER_SUMMARY', reason: 'O assunto identifica um único CNJ e os demais existem somente no SUMMARY.', sources: sourcesForCnj(analysis, cnj) };
    }
  }

  return { cnj: null, rule: null, reason: 'O caso ainda contém conflito estrutural entre dois ou mais CNJs.', sources: [] };
}

async function fetchAllOpenExceptions(db: any, exceptionIds?: string[]) {
  if (exceptionIds?.length) {
    const { data, error } = await db.from('email_exceptions')
      .select('id,processed_email_id,exception_type,status,updated_at')
      .eq('exception_type', 'CNJ_MULTIPLO_AMBIGUO')
      .in('status', OPEN_STATUSES)
      .in('id', exceptionIds)
      .order('id', { ascending: true });
    if (error) throw new Error(`Falha ao consultar exceções CNJ: ${error.message}`);
    return data || [];
  }

  const rows: any[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from('email_exceptions')
      .select('id,processed_email_id,exception_type,status,updated_at')
      .eq('exception_type', 'CNJ_MULTIPLO_AMBIGUO')
      .in('status', OPEN_STATUSES)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Falha ao consultar exceções CNJ: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }
  return rows;
}

async function fetchInChunks(db: any, table: string, select: string, field: string, values: string[], chunkSize = 200) {
  const rows: any[] = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const { data, error } = await db.from(table).select(select).in(field, chunk);
    if (error) throw new Error(`Falha ao consultar ${table}: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

async function buildPlans(db: any, exceptionIds?: string[]): Promise<CnjA1Plan[]> {
  const exceptions = await fetchAllOpenExceptions(db, exceptionIds);
  const emailIds = unique<string>(exceptions.map((row: any) => String(row.processed_email_id || '')).filter(Boolean));
  const emails = await fetchInChunks(db, 'processed_emails',
    'id,status,process_id,matched_process_number,subject,received_at,metadata,updated_at', 'id', emailIds);
  const emailById = new Map(emails.map((email: any) => [email.id, email]));

  const prepared = exceptions.map((row: any) => {
    const email: any = emailById.get(row.processed_email_id);
    const blocks = Array.isArray(email?.metadata?.ai_evidence_blocks) ? email.metadata.ai_evidence_blocks : [];
    const summaryNumbers = Array.isArray(email?.metadata?.legal_summary?.process_numbers) ? email.metadata.legal_summary.process_numbers : [];
    const analysis = summarizeDocumentIdentification([
      { source: 'Assunto', kind: 'SUBJECT', text: email?.subject || '' },
      ...blocks,
      { source: 'Resumo salvo — origem não individualizada', kind: 'SUMMARY', text: summaryNumbers.join('\n') },
    ]);
    const selection = selectDeterministicSingleCnj(analysis);
    return { row, email, analysis, selection };
  });

  const allCandidateCnjs = unique<string>(prepared.map(item => item.selection.cnj).filter((value): value is string => Boolean(value)));
  const processRows = await fetchInChunks(db, 'processes', 'id,numero_processo', 'numero_processo', allCandidateCnjs);
  const processesByCnj = new Map<string, any[]>();
  for (const process of processRows) {
    const list = processesByCnj.get(process.numero_processo) || [];
    list.push(process);
    processesByCnj.set(process.numero_processo, list);
  }

  const evidenceRows = await fetchInChunks(db, 'process_evidence',
    'processed_email_id,process_id,field_name,extracted_value,source_type,extraction_method', 'processed_email_id', emailIds);
  const timelineRows = await fetchInChunks(db, 'process_timeline', 'email_id,process_id,origem,tipo', 'email_id', emailIds);
  const evidenceByEmail = new Map<string, any[]>();
  const timelineByEmail = new Map<string, any[]>();
  for (const row of evidenceRows) {
    const list = evidenceByEmail.get(row.processed_email_id) || [];
    list.push(row); evidenceByEmail.set(row.processed_email_id, list);
  }
  for (const row of timelineRows) {
    const list = timelineByEmail.get(row.email_id) || [];
    list.push(row); timelineByEmail.set(row.email_id, list);
  }

  return prepared.map(({ row, email, analysis, selection }) => {
    const matches = selection.cnj ? (processesByCnj.get(selection.cnj) || []) : [];
    const targetProcessId = matches.length === 1 ? matches[0].id : null;
    const existingRelatedProcessIds = new Set<string>();
    for (const ev of evidenceByEmail.get(row.processed_email_id) || []) if (ev.process_id) existingRelatedProcessIds.add(ev.process_id);
    for (const tl of timelineByEmail.get(row.processed_email_id) || []) if (tl.process_id) existingRelatedProcessIds.add(tl.process_id);
    const conflictingRelated = targetProcessId
      ? [...existingRelatedProcessIds].filter(processId => processId !== targetProcessId)
      : [...existingRelatedProcessIds];
    const existingLinkCompatible = Boolean(email) && (!email.process_id || email.process_id === targetProcessId);
    const matchedNumberCompatible = Boolean(email) && (!email.matched_process_number || !selection.cnj || sameCnj(email.matched_process_number, selection.cnj));
    const distributionLinks = Array.isArray(email?.metadata?.process_distribution?.links) ? email.metadata.process_distribution.links : [];
    const conflictingDistribution = targetProcessId
      ? distributionLinks.some((link: any) => link?.process_id && link.process_id !== targetProcessId)
      : distributionLinks.length > 0;

    let reason = selection.reason;
    let executable = false;
    if (!email) reason = 'E-mail processado não encontrado.';
    else if (!selection.cnj) reason = selection.reason;
    else if (matches.length === 0) reason = `CNJ ${selection.cnj} não possui processo cadastrado.`;
    else if (matches.length > 1) reason = `CNJ ${selection.cnj} possui ${matches.length} processos cadastrados; não escolher automaticamente.`;
    else if (!existingLinkCompatible || !matchedNumberCompatible) reason = 'O e-mail já possui vínculo/número operacional incompatível; preservar decisão existente.';
    else if (conflictingDistribution) reason = 'Já existe distribuição processual incompatível no metadata do e-mail; revisão humana necessária.';
    else if (conflictingRelated.length > 0) reason = 'Já existem evidências/timeline deste e-mail associadas a outro processo; revisão humana necessária.';
    else executable = true;

    return {
      exceptionId: row.id,
      exceptionUpdatedAt: row.updated_at,
      emailId: row.processed_email_id,
      emailUpdatedAt: email?.updated_at || '',
      subject: email?.subject || null,
      currentProcessId: email?.process_id || null,
      targetProcessId,
      targetCnj: selection.cnj,
      allValidCnjs: analysis.validCnjs,
      invalidCnjs: analysis.invalidCnjs,
      rule: selection.rule,
      sources: selection.sources,
      executable,
      reason,
      email,
    };
  });
}

export async function previewCnjSingleProcessRepair(db: any) {
  const plans = await buildPlans(db);
  const executable = plans.filter(plan => plan.executable);
  const ruleCounts = Object.fromEntries([...new Set(executable.map(plan => plan.rule || 'UNKNOWN'))]
    .map(rule => [rule, executable.filter(plan => (plan.rule || 'UNKNOWN') === rule).length]));
  return {
    dryRun: true,
    openCnjAmbiguities: plans.length,
    executableA1: executable.length,
    requiresReview: plans.length - executable.length,
    ruleCounts,
    sample: executable.slice(0, 20).map(({ email, ...plan }) => plan),
  };
}

async function revalidatePlan(db: any, exceptionId: string): Promise<CnjA1Plan | null> {
  const plans = await buildPlans(db, [exceptionId]);
  return plans[0] || null;
}

async function ensureAuditRows(db: any, plan: CnjA1Plan, actorId: string | null) {
  if (!plan.targetProcessId || !plan.targetCnj) throw new Error('Plano A1 sem processo/CNJ de destino.');
  const now = new Date().toISOString();
  const sources = plan.sources.map(source => `${source.kind}:${source.source}`).join(', ') || 'fonte estrutural existente';

  const existingEvidence = await db.from('process_evidence').select('id,extracted_value')
    .eq('process_id', plan.targetProcessId)
    .eq('processed_email_id', plan.emailId)
    .eq('field_name', 'numero_processo_cnj')
    .limit(100);
  if (existingEvidence.error) throw new Error(`Falha ao conferir evidência: ${existingEvidence.error.message}`);
  const alreadyRecorded = (existingEvidence.data || []).some((row: any) =>
    String(row.extracted_value || '').replace(/\D/g, '') === plan.targetCnj!.replace(/\D/g, ''));
  if (!alreadyRecorded) {
    const evidence = await db.from('process_evidence').insert({
      process_id: plan.targetProcessId,
      processed_email_id: plan.emailId,
      field_name: 'numero_processo_cnj',
      extracted_value: plan.targetCnj,
      source_type: plan.sources.some(source => source.kind === 'ATTACHMENT') ? 'DOCUMENT' : 'EMAIL',
      extraction_method: 'SYSTEM',
      confidence: 0.99,
      evidence_excerpt: `Reparo determinístico A1 (${plan.rule}). Fontes: ${sources}`.slice(0, 520),
    });
    if (evidence.error) throw new Error(`Falha ao registrar evidência A1: ${evidence.error.message}`);
  }

  const existingTimeline = await db.from('process_timeline').select('id')
    .eq('process_id', plan.targetProcessId)
    .eq('email_id', plan.emailId)
    .eq('tipo', 'EMAIL_INTERPRETADO')
    .eq('origem', REPAIR_ORIGIN)
    .limit(1)
    .maybeSingle();
  if (existingTimeline.error) throw new Error(`Falha ao conferir timeline A1: ${existingTimeline.error.message}`);
  if (!existingTimeline.data?.id) {
    const timeline = await db.from('process_timeline').insert({
      process_id: plan.targetProcessId,
      email_id: plan.emailId,
      tipo: 'EMAIL_INTERPRETADO',
      titulo: 'Vínculo determinístico após saneamento de ambiguidade de CNJ',
      descricao: `CNJ ${plan.targetCnj}. Regra ${plan.rule}. Fontes: ${sources}. Nenhum processo novo foi criado.`.slice(0, 1500),
      data_hora: plan.email?.received_at || now,
      origem: REPAIR_ORIGIN,
      usuario_id: actorId,
      automatico: true,
    });
    if (timeline.error) throw new Error(`Falha ao registrar timeline A1: ${timeline.error.message}`);
  }
}

async function executeOne(db: any, exceptionId: string, actorId: string | null) {
  // Recalcula imediatamente antes de qualquer escrita. O dry-run anterior nunca é tratado como autorização persistente.
  const plan = await revalidatePlan(db, exceptionId);
  if (!plan) return { exceptionId, status: 'SKIPPED_CHANGED_SINCE_PREVIEW', reason: 'Exceção não está mais aberta/disponível.' };
  if (!plan.executable || !plan.targetProcessId || !plan.targetCnj) {
    return { exceptionId, status: 'REVIEW_REQUIRED', reason: plan.reason };
  }

  const now = new Date().toISOString();
  const distribution = {
    version: REPAIR_VERSION,
    repaired_at: now,
    repaired_by: actorId,
    exception_id: plan.exceptionId,
    mode: 'SINGLE_PROCESS',
    rule: plan.rule,
    links: [{ process_id: plan.targetProcessId, numero_processo: plan.targetCnj, sources: plan.sources }],
  };

  const otherExceptions = await db.from('email_exceptions').select('id', { count: 'exact', head: true })
    .eq('processed_email_id', plan.emailId)
    .in('status', OPEN_STATUSES)
    .neq('id', plan.exceptionId);
  if (otherExceptions.error) throw new Error(`Falha ao conferir outras exceções: ${otherExceptions.error.message}`);

  const emailPatch: any = {
    process_id: plan.targetProcessId,
    matched_process_number: plan.targetCnj,
    metadata: {
      ...(plan.email?.metadata || {}),
      process_distribution: distribution,
      process_application: {
        ...(plan.email?.metadata?.process_application || {}),
        action: 'CNJ_AMBIGUITY_A1_REPAIRED',
        process_id: plan.targetProcessId,
        process_number: plan.targetCnj,
        has_exception: (otherExceptions.count || 0) > 0,
      },
    },
    updated_at: now,
  };
  if ((otherExceptions.count || 0) === 0 && String(plan.email?.status || '') === 'EXCECAO') emailPatch.status = 'PROCESSADO';

  let emailUpdate = db.from('processed_emails').update(emailPatch)
    .eq('id', plan.emailId)
    .eq('updated_at', plan.emailUpdatedAt);
  emailUpdate = plan.currentProcessId
    ? emailUpdate.eq('process_id', plan.currentProcessId)
    : emailUpdate.is('process_id', null);
  const emailResult = await emailUpdate.select('id').maybeSingle();
  if (emailResult.error) throw new Error(`Falha ao atualizar e-mail A1: ${emailResult.error.message}`);
  if (!emailResult.data?.id) {
    return { exceptionId, status: 'SKIPPED_CHANGED_SINCE_PREVIEW', reason: 'E-mail mudou durante a revalidação; nenhuma exceção foi encerrada.' };
  }

  // Após o vínculo atomicamente protegido do e-mail, cria rastreabilidade idempotente.
  await ensureAuditRows(db, plan, actorId);

  const resolutionNote = `Ambiguidade CNJ saneada deterministicamente como SINGLE_PROCESS. Regra ${plan.rule}; CNJ ${plan.targetCnj}; processo existente ${plan.targetProcessId}. Nenhum processo foi criado.`;
  const resolved = await db.from('email_exceptions').update({
    status: 'RESOLVIDA',
    resolved_by: actorId,
    resolved_at: now,
    resolution_note: resolutionNote.slice(0, 1500),
    updated_at: now,
  })
    .eq('id', plan.exceptionId)
    .eq('exception_type', 'CNJ_MULTIPLO_AMBIGUO')
    .in('status', OPEN_STATUSES)
    .eq('updated_at', plan.exceptionUpdatedAt)
    .select('id')
    .maybeSingle();
  if (resolved.error) throw new Error(`Falha ao encerrar exceção A1: ${resolved.error.message}`);
  if (!resolved.data?.id) {
    return {
      exceptionId,
      status: 'PARTIAL_EXCEPTION_CHANGED',
      processId: plan.targetProcessId,
      cnj: plan.targetCnj,
      reason: 'O e-mail foi vinculado com segurança, mas a exceção mudou concorrentemente e permaneceu aberta para revisão.',
    };
  }

  return { exceptionId, status: 'RESOLVED', processId: plan.targetProcessId, cnj: plan.targetCnj, rule: plan.rule };
}

export async function executeCnjSingleProcessRepair(db: any, options: {
  actorId: string;
  limit?: number;
}) {
  const actorId = options.actorId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId)) {
    throw new Error('actorId inválido. O modo APPLY exige o UUID do usuário responsável pela manutenção.');
  }
  const initialPlans = await buildPlans(db);
  const ids = initialPlans.filter(plan => plan.executable).map(plan => plan.exceptionId)
    .slice(0, Math.max(1, Math.min(Number(options.limit || 500), 1000)));
  const results: any[] = [];
  for (const id of ids) {
    try {
      results.push(await executeOne(db, id, actorId));
    } catch (error: any) {
      const reason = String(error?.message || error);
      console.error('[CNJ A1 REPAIR] falha isolada', { exceptionId: id, reason });
      results.push({ exceptionId: id, status: 'ERROR', reason });
    }
  }
  return {
    selected: ids.length,
    resolved: results.filter(item => item.status === 'RESOLVED').length,
    changedSincePreview: results.filter(item => item.status === 'SKIPPED_CHANGED_SINCE_PREVIEW').length,
    partialConcurrent: results.filter(item => item.status === 'PARTIAL_EXCEPTION_CHANGED').length,
    requiresReview: results.filter(item => item.status === 'REVIEW_REQUIRED').length,
    errors: results.filter(item => item.status === 'ERROR').length,
    results,
  };
}

export async function buildPlansA2(db: any, exceptionIds?: string[]): Promise<CnjA2Plan[]> {
  const exceptions = await fetchAllOpenExceptions(db, exceptionIds);
  const emailIds = unique<string>(exceptions.map((row: any) => String(row.processed_email_id || '')).filter(Boolean));
  const emails = await fetchInChunks(db, 'processed_emails',
    'id,status,process_id,matched_process_number,subject,received_at,metadata,updated_at', 'id', emailIds);
  const emailById = new Map(emails.map((email: any) => [email.id, email]));

  const prepared = exceptions.map((row: any) => {
    const email: any = emailById.get(row.processed_email_id);
    const blocks = Array.isArray(email?.metadata?.ai_evidence_blocks) ? email.metadata.ai_evidence_blocks : [];
    const summaryNumbers = Array.isArray(email?.metadata?.legal_summary?.process_numbers) ? email.metadata.legal_summary.process_numbers : [];
    const analysis = summarizeDocumentIdentification([
      { source: 'Assunto', kind: 'SUBJECT', text: email?.subject || '' },
      ...blocks,
      { source: 'Resumo salvo — origem não individualizada', kind: 'SUMMARY', text: summaryNumbers.join('\n') },
    ]);
    const separation = hasUnambiguousDocumentSeparation(analysis);
    return { row, email, analysis, separation };
  });

  const allCandidateCnjs = unique<string>(prepared.flatMap(item => item.separation.docCnjs));
  const processRows = await fetchInChunks(db, 'processes', 'id,numero_processo', 'numero_processo', allCandidateCnjs);
  const processesByCnj = new Map<string, any[]>();
  for (const process of processRows) {
    const list = processesByCnj.get(process.numero_processo) || [];
    list.push(process);
    processesByCnj.set(process.numero_processo, list);
  }

  const evidenceRows = await fetchInChunks(db, 'process_evidence',
    'processed_email_id,process_id,field_name,extracted_value,source_type,extraction_method', 'processed_email_id', emailIds);
  const timelineRows = await fetchInChunks(db, 'process_timeline', 'email_id,process_id,origem,tipo', 'email_id', emailIds);
  const evidenceByEmail = new Map<string, any[]>();
  const timelineByEmail = new Map<string, any[]>();
  for (const row of evidenceRows) {
    const list = evidenceByEmail.get(row.processed_email_id) || [];
    list.push(row); evidenceByEmail.set(row.processed_email_id, list);
  }
  for (const row of timelineRows) {
    const list = timelineByEmail.get(row.email_id) || [];
    list.push(row); timelineByEmail.set(row.email_id, list);
  }

  return prepared.map(({ row, email, analysis, separation }) => {
    if (!email) {
      return {
        exceptionId: row.id,
        exceptionUpdatedAt: row.updated_at,
        emailId: row.processed_email_id,
        emailUpdatedAt: '',
        subject: null,
        currentProcessId: null,
        targets: [],
        allValidCnjs: analysis.validCnjs,
        invalidCnjs: analysis.invalidCnjs,
        rule: 'MULTI_PROCESS_DISTRIBUTION',
        executable: false,
        reason: 'E-mail processado não encontrado.',
        email: null,
      };
    }

    if (!separation.separated) {
      return {
        exceptionId: row.id,
        exceptionUpdatedAt: row.updated_at,
        emailId: row.processed_email_id,
        emailUpdatedAt: email.updated_at || '',
        subject: email.subject || null,
        currentProcessId: email.process_id || null,
        targets: [],
        allValidCnjs: analysis.validCnjs,
        invalidCnjs: analysis.invalidCnjs,
        rule: 'MULTI_PROCESS_DISTRIBUTION',
        executable: false,
        reason: separation.reason,
        email,
      };
    }

    // Validações na tabela processes
    const missingCnjs = separation.docCnjs.filter(cnj => (processesByCnj.get(cnj) || []).length === 0);
    const duplicatedCnjs = separation.docCnjs.filter(cnj => (processesByCnj.get(cnj) || []).length > 1);

    if (missingCnjs.length > 0) {
      return {
        exceptionId: row.id,
        exceptionUpdatedAt: row.updated_at,
        emailId: row.processed_email_id,
        emailUpdatedAt: email.updated_at || '',
        subject: email.subject || null,
        currentProcessId: email.process_id || null,
        targets: [],
        allValidCnjs: analysis.validCnjs,
        invalidCnjs: analysis.invalidCnjs,
        rule: 'MULTI_PROCESS_DISTRIBUTION',
        executable: false,
        reason: `CNJ(s) sem processo cadastrado: ${missingCnjs.join(', ')}.`,
        email,
      };
    }

    if (duplicatedCnjs.length > 0) {
      return {
        exceptionId: row.id,
        exceptionUpdatedAt: row.updated_at,
        emailId: row.processed_email_id,
        emailUpdatedAt: email.updated_at || '',
        subject: email.subject || null,
        currentProcessId: email.process_id || null,
        targets: [],
        allValidCnjs: analysis.validCnjs,
        invalidCnjs: analysis.invalidCnjs,
        rule: 'MULTI_PROCESS_DISTRIBUTION',
        executable: false,
        reason: `CNJ(s) duplicado(s) no cadastro: ${duplicatedCnjs.join(', ')}.`,
        email,
      };
    }

    const targets: TargetProcessLink[] = separation.docCnjs.map(cnj => ({
      processId: processesByCnj.get(cnj)![0].id,
      cnj,
      sources: sourcesForCnj(analysis, cnj),
    }));
    const targetProcessIds = new Set(targets.map(t => t.processId));

    // 1. process_id existente no e-mail
    if (email.process_id && !targetProcessIds.has(email.process_id)) {
      return {
        exceptionId: row.id,
        exceptionUpdatedAt: row.updated_at,
        emailId: row.processed_email_id,
        emailUpdatedAt: email.updated_at || '',
        subject: email.subject || null,
        currentProcessId: email.process_id,
        targets,
        allValidCnjs: analysis.validCnjs,
        invalidCnjs: analysis.invalidCnjs,
        rule: 'MULTI_PROCESS_DISTRIBUTION',
        executable: false,
        reason: 'O e-mail possui process_id incompatível com os processos da distribuição multiprocesso.',
        email,
      };
    }

    // 2. matched_process_number existente no e-mail
    if (email.matched_process_number && !separation.docCnjs.some(c => sameCnj(c, email.matched_process_number))) {
      return {
        exceptionId: row.id,
        exceptionUpdatedAt: row.updated_at,
        emailId: row.processed_email_id,
        emailUpdatedAt: email.updated_at || '',
        subject: email.subject || null,
        currentProcessId: email.process_id || null,
        targets,
        allValidCnjs: analysis.validCnjs,
        invalidCnjs: analysis.invalidCnjs,
        rule: 'MULTI_PROCESS_DISTRIBUTION',
        executable: false,
        reason: 'O e-mail possui matched_process_number incompatível com os processos da distribuição multiprocesso.',
        email,
      };
    }

    // 3. process_distribution existente no metadata
    const existingDistLinks = Array.isArray(email?.metadata?.process_distribution?.links)
      ? email.metadata.process_distribution.links
      : [];
    if (existingDistLinks.some((l: any) => l?.process_id && !targetProcessIds.has(l.process_id))) {
      return {
        exceptionId: row.id,
        exceptionUpdatedAt: row.updated_at,
        emailId: row.processed_email_id,
        emailUpdatedAt: email.updated_at || '',
        subject: email.subject || null,
        currentProcessId: email.process_id || null,
        targets,
        allValidCnjs: analysis.validCnjs,
        invalidCnjs: analysis.invalidCnjs,
        rule: 'MULTI_PROCESS_DISTRIBUTION',
        executable: false,
        reason: 'Metadata já contém process_distribution apontando para processo fora da distribuição.',
        email,
      };
    }

    // 4. Evidências / timeline existentes
    const evList = evidenceByEmail.get(row.processed_email_id) || [];
    const tlList = timelineByEmail.get(row.processed_email_id) || [];
    if (evList.some((ev: any) => ev.process_id && !targetProcessIds.has(ev.process_id))) {
      return {
        exceptionId: row.id,
        exceptionUpdatedAt: row.updated_at,
        emailId: row.processed_email_id,
        emailUpdatedAt: email.updated_at || '',
        subject: email.subject || null,
        currentProcessId: email.process_id || null,
        targets,
        allValidCnjs: analysis.validCnjs,
        invalidCnjs: analysis.invalidCnjs,
        rule: 'MULTI_PROCESS_DISTRIBUTION',
        executable: false,
        reason: 'Já existem evidências deste e-mail associadas a processo fora da distribuição.',
        email,
      };
    }
    if (tlList.some((tl: any) => tl.process_id && !targetProcessIds.has(tl.process_id))) {
      return {
        exceptionId: row.id,
        exceptionUpdatedAt: row.updated_at,
        emailId: row.processed_email_id,
        emailUpdatedAt: email.updated_at || '',
        subject: email.subject || null,
        currentProcessId: email.process_id || null,
        targets,
        allValidCnjs: analysis.validCnjs,
        invalidCnjs: analysis.invalidCnjs,
        rule: 'MULTI_PROCESS_DISTRIBUTION',
        executable: false,
        reason: 'Já existe timeline deste e-mail associada a processo fora da distribuição.',
        email,
      };
    }

    return {
      exceptionId: row.id,
      exceptionUpdatedAt: row.updated_at,
      emailId: row.processed_email_id,
      emailUpdatedAt: email.updated_at || '',
      subject: email.subject || null,
      currentProcessId: email.process_id || null,
      targets,
      allValidCnjs: analysis.validCnjs,
      invalidCnjs: analysis.invalidCnjs,
      rule: 'MULTI_PROCESS_DISTRIBUTION',
      executable: true,
      reason: 'Elegível para distribuição multiprocesso determinística A2.',
      email,
    };
  });
}

export async function previewCnjMultiProcessRepair(db: any) {
  const plans = await buildPlansA2(db);
  const executable = plans.filter(plan => plan.executable);
  const processDistributionCounts: Record<number, number> = {};
  for (const plan of executable) {
    const count = plan.targets.length;
    processDistributionCounts[count] = (processDistributionCounts[count] || 0) + 1;
  }
  return {
    dryRun: true,
    openCnjAmbiguities: plans.length,
    executableA2: executable.length,
    requiresReview: plans.length - executable.length,
    processDistributionCounts,
    sample: executable.slice(0, 20).map(({ email, ...plan }) => ({
      ...plan,
      targetProcessIds: plan.targets.map(t => t.processId),
      targetCnjs: plan.targets.map(t => t.cnj),
    })),
  };
}

async function revalidatePlanA2(db: any, exceptionId: string): Promise<CnjA2Plan | null> {
  const plans = await buildPlansA2(db, [exceptionId]);
  return plans[0] || null;
}

async function ensureAuditRowsA2(db: any, plan: CnjA2Plan, actorId: string | null) {
  const now = new Date().toISOString();

  for (const target of plan.targets) {
    const sourcesStr = target.sources.map(s => `${s.kind}:${s.source}`).join(', ') || 'anexo documental';

    // 1. process_evidence idempotente
    const existingEvidence = await db.from('process_evidence').select('id,extracted_value')
      .eq('process_id', target.processId)
      .eq('processed_email_id', plan.emailId)
      .eq('field_name', 'numero_processo_cnj')
      .limit(100);
    if (existingEvidence.error) throw new Error(`Falha ao conferir evidência A2: ${existingEvidence.error.message}`);
    const alreadyRecorded = (existingEvidence.data || []).some((row: any) =>
      String(row.extracted_value || '').replace(/\D/g, '') === target.cnj.replace(/\D/g, ''));
    if (!alreadyRecorded) {
      const evidence = await db.from('process_evidence').insert({
        process_id: target.processId,
        processed_email_id: plan.emailId,
        field_name: 'numero_processo_cnj',
        extracted_value: target.cnj,
        source_type: target.sources.some(s => s.kind === 'ATTACHMENT') ? 'DOCUMENT' : 'EMAIL',
        extraction_method: 'SYSTEM',
        confidence: 0.99,
        evidence_excerpt: `Reparo determinístico A2 (MULTI_PROCESS_DISTRIBUTION). Fontes: ${sourcesStr}`.slice(0, 520),
      });
      if (evidence.error) throw new Error(`Falha ao registrar evidência A2 de ${target.cnj}: ${evidence.error.message}`);
    }

    // 2. process_timeline idempotente
    const existingTimeline = await db.from('process_timeline').select('id')
      .eq('process_id', target.processId)
      .eq('email_id', plan.emailId)
      .eq('tipo', 'EMAIL_INTERPRETADO')
      .eq('origem', REPAIR_ORIGIN_A2)
      .limit(1)
      .maybeSingle();
    if (existingTimeline.error) throw new Error(`Falha ao conferir timeline A2: ${existingTimeline.error.message}`);
    if (!existingTimeline.data?.id) {
      const timeline = await db.from('process_timeline').insert({
        process_id: target.processId,
        email_id: plan.emailId,
        tipo: 'EMAIL_INTERPRETADO',
        titulo: 'Distribuição multiprocesso após saneamento de ambiguidade de CNJ',
        descricao: `CNJ ${target.cnj}. Regra MULTI_PROCESS_DISTRIBUTION. Fontes: ${sourcesStr}. Nenhum processo novo foi criado.`.slice(0, 1500),
        data_hora: plan.email?.received_at || now,
        origem: REPAIR_ORIGIN_A2,
        usuario_id: actorId,
        automatico: true,
      });
      if (timeline.error) throw new Error(`Falha ao registrar timeline A2 de ${target.cnj}: ${timeline.error.message}`);
    }
  }
}

async function executeOneA2(db: any, exceptionId: string, actorId: string | null) {
  const plan = await revalidatePlanA2(db, exceptionId);
  if (!plan) return { exceptionId, status: 'SKIPPED_CHANGED_SINCE_PREVIEW', reason: 'Exceção não está mais aberta/disponível.' };
  if (!plan.executable || plan.targets.length < 2) {
    return { exceptionId, status: 'REVIEW_REQUIRED', reason: plan.reason };
  }

  const now = new Date().toISOString();
  const distribution = {
    version: REPAIR_VERSION_A2,
    repaired_at: now,
    repaired_by: actorId,
    exception_id: plan.exceptionId,
    mode: 'MULTI_PROCESS',
    rule: 'MULTI_PROCESS_DISTRIBUTION',
    links: plan.targets.map(t => ({
      process_id: t.processId,
      numero_processo: t.cnj,
      sources: t.sources.map(s => s.source),
    })),
  };

  const otherExceptions = await db.from('email_exceptions').select('id', { count: 'exact', head: true })
    .eq('processed_email_id', plan.emailId)
    .in('status', OPEN_STATUSES)
    .neq('id', plan.exceptionId);
  if (otherExceptions.error) throw new Error(`Falha ao conferir outras exceções: ${otherExceptions.error.message}`);

  const emailPatch: any = {
    metadata: {
      ...(plan.email?.metadata || {}),
      process_distribution: distribution,
      process_application: {
        ...(plan.email?.metadata?.process_application || {}),
        action: 'CNJ_AMBIGUITY_A2_REPAIRED',
        mode: 'MULTI_PROCESS',
        process_ids: plan.targets.map(t => t.processId),
        process_numbers: plan.targets.map(t => t.cnj),
        has_exception: (otherExceptions.count || 0) > 0,
      },
    },
    updated_at: now,
  };

  // Se processed_emails.process_id estiver null: MANTER null.
  // Se já estiver preenchido: NÃO sobrescrever.
  if (plan.currentProcessId) {
    emailPatch.process_id = plan.currentProcessId;
  }
  if ((otherExceptions.count || 0) === 0 && String(plan.email?.status || '') === 'EXCECAO') {
    emailPatch.status = 'PROCESSADO';
  }

  // 1. Garantir evidências e timeline para cada processo ANTES de fechar a exceção
  await ensureAuditRowsA2(db, plan, actorId);

  // 2. Atualizar e-mail com trava otimista
  let emailUpdate = db.from('processed_emails').update(emailPatch)
    .eq('id', plan.emailId)
    .eq('updated_at', plan.emailUpdatedAt);
  emailUpdate = plan.currentProcessId
    ? emailUpdate.eq('process_id', plan.currentProcessId)
    : emailUpdate.is('process_id', null);
  const emailResult = await emailUpdate.select('id').maybeSingle();
  if (emailResult.error) throw new Error(`Falha ao atualizar e-mail A2: ${emailResult.error.message}`);
  if (!emailResult.data?.id) {
    return { exceptionId, status: 'SKIPPED_CHANGED_SINCE_PREVIEW', reason: 'E-mail mudou durante a revalidação; nenhuma exceção foi encerrada.' };
  }

  // 3. Resolver a exceção
  const resolutionNote = `Ambiguidade CNJ saneada deterministicamente como MULTI_PROCESS_DISTRIBUTION. ${plan.targets.length} processos vinculados (${plan.targets.map(t => t.cnj).join(', ')}). Nenhum processo novo foi criado.`;
  const resolved = await db.from('email_exceptions').update({
    status: 'RESOLVIDA',
    resolved_by: actorId,
    resolved_at: now,
    resolution_note: resolutionNote.slice(0, 1500),
    updated_at: now,
  })
    .eq('id', plan.exceptionId)
    .eq('exception_type', 'CNJ_MULTIPLO_AMBIGUO')
    .in('status', OPEN_STATUSES)
    .eq('updated_at', plan.exceptionUpdatedAt)
    .select('id')
    .maybeSingle();
  if (resolved.error) throw new Error(`Falha ao encerrar exceção A2: ${resolved.error.message}`);
  if (!resolved.data?.id) {
    return {
      exceptionId,
      status: 'PARTIAL_EXCEPTION_CHANGED',
      processCount: plan.targets.length,
      reason: 'A distribuição do e-mail foi registrada com segurança, mas a exceção mudou concorrentemente e permaneceu aberta para revisão.',
    };
  }

  return {
    exceptionId,
    status: 'RESOLVED',
    processCount: plan.targets.length,
    processes: plan.targets.map(t => ({ processId: t.processId, cnj: t.cnj })),
    rule: 'MULTI_PROCESS_DISTRIBUTION',
  };
}

export async function executeCnjMultiProcessRepair(db: any, options: {
  actorId: string;
  limit?: number;
}) {
  const actorId = options.actorId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId)) {
    throw new Error('actorId inválido. O modo APPLY exige o UUID do usuário responsável pela manutenção.');
  }
  const initialPlans = await buildPlansA2(db);
  const ids = initialPlans.filter(plan => plan.executable).map(plan => plan.exceptionId)
    .slice(0, Math.max(1, Math.min(Number(options.limit || 500), 1000)));
  const results: any[] = [];
  for (const id of ids) {
    try {
      results.push(await executeOneA2(db, id, actorId));
    } catch (error: any) {
      const reason = String(error?.message || error);
      console.error('[CNJ A2 REPAIR] falha isolada', { exceptionId: id, reason });
      results.push({ exceptionId: id, status: 'ERROR', reason });
    }
  }
  return {
    selected: ids.length,
    resolved: results.filter(item => item.status === 'RESOLVED').length,
    changedSincePreview: results.filter(item => item.status === 'SKIPPED_CHANGED_SINCE_PREVIEW').length,
    partialConcurrent: results.filter(item => item.status === 'PARTIAL_EXCEPTION_CHANGED').length,
    requiresReview: results.filter(item => item.status === 'REVIEW_REQUIRED').length,
    errors: results.filter(item => item.status === 'ERROR').length,
    results,
  };
}

