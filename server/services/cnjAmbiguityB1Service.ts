import { summarizeDocumentIdentification } from './documentIdentificationService.ts';

type DocumentIdentification = ReturnType<typeof summarizeDocumentIdentification>;

type SourceRef = { source: string; kind: string };

export type CnjB1Selection = {
  cnj: string | null;
  rule: string | null;
  reason: string;
  sources: SourceRef[];
  secondaryCnjs: string[];
  attachmentCnjs: string[];
  secondarySourceKinds: Record<string, string[]>;
};

export type CnjB1Plan = {
  exceptionId: string;
  exceptionUpdatedAt: string;
  emailId: string;
  emailUpdatedAt: string;
  subject: string | null;
  targetCnj: string | null;
  targetProcessId: string | null;
  secondaryCnjs: string[];
  allValidCnjs: string[];
  invalidCnjs: string[];
  attachmentCnjs: string[];
  secondarySourceKinds: Record<string, string[]>;
  rule: string | null;
  sources: SourceRef[];
  structuralCandidate: boolean;
  executable: boolean;
  reason: string;
  currentProcessId: string | null;
  email: any;
};

const OPEN_STATUSES = ['ABERTA', 'PENDENTE'];
const B1_RULE = 'SUBJECT_DOMINANT_AUXILIARY_ONLY';
const REPAIR_ORIGIN_B1 = 'REPARO_CNJ_B1_ASSUNTO_DOMINANTE';
const REPAIR_VERSION_B1 = 'CNJ_B1_20260915';

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function normalizeKind(kind: unknown) {
  return String(kind || 'UNKNOWN').toUpperCase();
}

function sameCnj(a: unknown, b: unknown) {
  const left = String(a || '').replace(/\D/g, '');
  const right = String(b || '').replace(/\D/g, '');
  return Boolean(left && right && left === right);
}

function cnjsForKinds(analysis: DocumentIdentification, kinds: string[]) {
  const allowed = new Set(kinds.map(kind => kind.toUpperCase()));
  return unique<string>(analysis.documents
    .filter((doc: any) => allowed.has(normalizeKind(doc.kind)))
    .flatMap((doc: any) => (doc.validCnjs || []) as string[]));
}

function sourcesForCnj(analysis: DocumentIdentification, cnj: string): SourceRef[] {
  const seen = new Set<string>();
  const result: SourceRef[] = [];
  for (const doc of analysis.documents as any[]) {
    if (!(doc.validCnjs || []).includes(cnj)) continue;
    const item = {
      source: String(doc.source || `Trecho ${doc.blockIndex}`),
      kind: normalizeKind(doc.kind),
    };
    const key = `${item.kind}|${item.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/**
 * B1: um único CNJ domina o assunto. Todos os anexos são neutros ou compatíveis
 * com esse CNJ. Demais CNJs existem somente em fontes auxiliares do corpo/resumo.
 *
 * Esta função NÃO consulta banco e NÃO escreve dados. A existência/unicidade dos
 * processos e conflitos operacionais são validados separadamente no plano B1.
 */
export function selectSubjectDominantB1(analysis: DocumentIdentification): CnjB1Selection {
  const empty = (reason: string): CnjB1Selection => ({
    cnj: null,
    rule: null,
    reason,
    sources: [],
    secondaryCnjs: [],
    attachmentCnjs: [],
    secondarySourceKinds: {},
  });

  if (analysis.invalidCnjs.length > 0) {
    return empty('Há CNJ com DV inválido nos trechos persistidos.');
  }

  const all = unique<string>(analysis.validCnjs as string[]);
  if (all.length < 2) {
    return empty('B1 exige pelo menos dois CNJs válidos na exceção atual.');
  }

  const subjectCnjs = cnjsForKinds(analysis, ['SUBJECT']);
  if (subjectCnjs.length !== 1) {
    return empty(`O assunto deve conter exatamente um CNJ válido; encontrados ${subjectCnjs.length}.`);
  }

  const target = subjectCnjs[0];
  const secondaryCnjs = all.filter(cnj => cnj !== target);
  if (secondaryCnjs.length === 0) {
    return empty('Não há CNJ secundário para caracterizar B1.');
  }

  const attachmentDocs = (analysis.documents as any[])
    .filter(doc => normalizeKind(doc.kind) === 'ATTACHMENT');

  for (const doc of attachmentDocs) {
    const cnjs = unique<string>((doc.validCnjs || []) as string[]);
    if (cnjs.length > 1) {
      return empty(`O anexo '${String(doc.source || 'sem nome')}' contém mais de um CNJ válido.`);
    }
    if (cnjs.length === 1 && cnjs[0] !== target) {
      return empty(`O anexo '${String(doc.source || 'sem nome')}' sustenta CNJ secundário ${cnjs[0]}.`);
    }
  }

  const allowedSecondaryKinds = new Set(['BODY', 'TEXT', 'SUMMARY']);
  const secondarySourceKinds: Record<string, string[]> = {};
  for (const cnj of secondaryCnjs) {
    const kinds = unique(sourcesForCnj(analysis, cnj).map(source => source.kind));
    secondarySourceKinds[cnj] = kinds;
    if (!kinds.length) {
      return empty(`CNJ secundário ${cnj} não possui fonte rastreável.`);
    }
    if (kinds.some(kind => !allowedSecondaryKinds.has(kind))) {
      return empty(`CNJ secundário ${cnj} aparece em fonte não auxiliar (${kinds.join(', ')}).`);
    }
  }

  const attachmentCnjs = cnjsForKinds(analysis, ['ATTACHMENT']);
  return {
    cnj: target,
    rule: B1_RULE,
    reason: 'Um único CNJ domina o assunto; anexos são neutros/compatíveis e os demais CNJs aparecem somente em corpo/texto/resumo auxiliar.',
    sources: sourcesForCnj(analysis, target),
    secondaryCnjs,
    attachmentCnjs,
    secondarySourceKinds,
  };
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

export async function buildB1Plans(db: any, exceptionIds?: string[]): Promise<CnjB1Plan[]> {
  const exceptions = await fetchAllOpenExceptions(db, exceptionIds);
  const emailIds = unique<string>(exceptions.map((row: any) => String(row.processed_email_id || '')).filter(Boolean));
  const emails = await fetchInChunks(db, 'processed_emails',
    'id,status,process_id,matched_process_number,subject,received_at,metadata,updated_at', 'id', emailIds);
  const emailById = new Map(emails.map((email: any) => [email.id, email]));

  const prepared = exceptions.map((row: any) => {
    const email: any = emailById.get(row.processed_email_id);
    const blocks = Array.isArray(email?.metadata?.ai_evidence_blocks) ? email.metadata.ai_evidence_blocks : [];
    const summaryNumbers = Array.isArray(email?.metadata?.legal_summary?.process_numbers)
      ? email.metadata.legal_summary.process_numbers
      : [];
    const analysis = summarizeDocumentIdentification([
      { source: 'Assunto', kind: 'SUBJECT', text: email?.subject || '' },
      ...blocks,
      { source: 'Resumo salvo — origem não individualizada', kind: 'SUMMARY', text: summaryNumbers.join('\n') },
    ]);
    const selection = selectSubjectDominantB1(analysis);
    return { row, email, analysis, selection };
  });

  const allCnjs = unique<string>(prepared.flatMap(item => item.analysis.validCnjs));
  const processRows = await fetchInChunks(db, 'processes', 'id,numero_processo', 'numero_processo', allCnjs);
  const processesByCnj = new Map<string, any[]>();
  for (const process of processRows) {
    const list = processesByCnj.get(process.numero_processo) || [];
    list.push(process);
    processesByCnj.set(process.numero_processo, list);
  }

  const evidenceRows = await fetchInChunks(db, 'process_evidence',
    'processed_email_id,process_id,field_name,extracted_value,source_type,extraction_method', 'processed_email_id', emailIds);
  const timelineRows = await fetchInChunks(db, 'process_timeline',
    'email_id,process_id,origem,tipo', 'email_id', emailIds);
  const evidenceByEmail = new Map<string, any[]>();
  const timelineByEmail = new Map<string, any[]>();
  for (const row of evidenceRows) {
    const list = evidenceByEmail.get(row.processed_email_id) || [];
    list.push(row);
    evidenceByEmail.set(row.processed_email_id, list);
  }
  for (const row of timelineRows) {
    const list = timelineByEmail.get(row.email_id) || [];
    list.push(row);
    timelineByEmail.set(row.email_id, list);
  }

  return prepared.map(({ row, email, analysis, selection }) => {
    const structuralCandidate = Boolean(selection.cnj);
    const targetMatches = selection.cnj ? (processesByCnj.get(selection.cnj) || []) : [];
    const targetProcessId = targetMatches.length === 1 ? targetMatches[0].id : null;

    let reason = selection.reason;
    let executable = false;

    if (!email) {
      reason = 'E-mail processado não encontrado.';
    } else if (!selection.cnj) {
      reason = selection.reason;
    } else {
      const missingOrDuplicate = analysis.validCnjs
        .map(cnj => ({ cnj, matches: (processesByCnj.get(cnj) || []).length }))
        .filter(item => item.matches !== 1);

      if (targetMatches.length === 0) {
        reason = `CNJ dominante ${selection.cnj} não possui processo cadastrado.`;
      } else if (targetMatches.length > 1) {
        reason = `CNJ dominante ${selection.cnj} possui ${targetMatches.length} processos cadastrados.`;
      } else if (missingOrDuplicate.length > 0) {
        reason = `Há CNJ da exceção sem correspondência única em processes: ${missingOrDuplicate.map(item => `${item.cnj}(${item.matches})`).join(', ')}.`;
      } else if (email.process_id && email.process_id !== targetProcessId) {
        reason = 'O e-mail já possui process_id incompatível com o CNJ dominante.';
      } else if (email.matched_process_number && !sameCnj(email.matched_process_number, selection.cnj)) {
        reason = 'O e-mail já possui matched_process_number incompatível com o CNJ dominante.';
      } else {
        const distributionLinks = Array.isArray(email?.metadata?.process_distribution?.links)
          ? email.metadata.process_distribution.links
          : [];
        const conflictingDistribution = distributionLinks.some((link: any) => link?.process_id && link.process_id !== targetProcessId);

        const relatedProcessIds = new Set<string>();
        for (const ev of evidenceByEmail.get(row.processed_email_id) || []) {
          if (ev.process_id) relatedProcessIds.add(ev.process_id);
        }
        for (const tl of timelineByEmail.get(row.processed_email_id) || []) {
          if (tl.process_id) relatedProcessIds.add(tl.process_id);
        }
        const conflictingRelated = [...relatedProcessIds].filter(processId => processId !== targetProcessId);

        if (conflictingDistribution) {
          reason = 'Já existe process_distribution incompatível com o CNJ dominante.';
        } else if (conflictingRelated.length > 0) {
          reason = 'Já existem evidências/timeline do e-mail vinculadas a outro processo.';
        } else {
          executable = true;
        }
      }
    }

    return {
      exceptionId: row.id,
      exceptionUpdatedAt: row.updated_at,
      emailId: row.processed_email_id,
      emailUpdatedAt: email?.updated_at || '',
      subject: email?.subject || null,
      targetCnj: selection.cnj,
      targetProcessId,
      secondaryCnjs: selection.secondaryCnjs,
      allValidCnjs: analysis.validCnjs,
      invalidCnjs: analysis.invalidCnjs,
      attachmentCnjs: selection.attachmentCnjs,
      secondarySourceKinds: selection.secondarySourceKinds,
      rule: selection.rule,
      sources: selection.sources,
      structuralCandidate,
      executable,
      reason,
      currentProcessId: email?.process_id || null,
      email,
    };
  });
}

export async function previewCnjSubjectDominantB1(db: any) {
  const plans = await buildB1Plans(db);
  const structural = plans.filter(plan => plan.structuralCandidate);
  const executable = structural.filter(plan => plan.executable);
  const blocked = structural.filter(plan => !plan.executable);

  const rejectionCounts: Record<string, number> = {};
  for (const plan of blocked) {
    rejectionCounts[plan.reason] = (rejectionCounts[plan.reason] || 0) + 1;
  }

  return {
    dryRun: true,
    mode: 'B1_SUBJECT_DOMINANT_READ_ONLY',
    rule: B1_RULE,
    openCnjAmbiguities: plans.length,
    structuralB1: structural.length,
    executableB1: executable.length,
    blockedB1: blocked.length,
    rejectionCounts,
    executable: executable.slice(0, 100),
    blocked: blocked.slice(0, 100),
  };
}


async function revalidateB1Plan(db: any, exceptionId: string): Promise<CnjB1Plan | null> {
  const plans = await buildB1Plans(db, [exceptionId]);
  return plans[0] || null;
}

async function ensureB1AuditRows(db: any, plan: CnjB1Plan, actorId: string) {
  if (!plan.targetProcessId || !plan.targetCnj) return;
  const now = new Date().toISOString();
  const sources = plan.sources.map(source => `${source.kind}:${source.source}`).join(', ') || 'assunto do e-mail';

  const existingEvidence = await db.from('process_evidence').select('id,extracted_value')
    .eq('process_id', plan.targetProcessId)
    .eq('processed_email_id', plan.emailId)
    .eq('field_name', 'numero_processo_cnj')
    .limit(100);
  if (existingEvidence.error) throw new Error(`Falha ao conferir evidência B1: ${existingEvidence.error.message}`);
  const alreadyRecorded = (existingEvidence.data || []).some((row: any) => sameCnj(row.extracted_value, plan.targetCnj));
  if (!alreadyRecorded) {
    const evidence = await db.from('process_evidence').insert({
      process_id: plan.targetProcessId,
      processed_email_id: plan.emailId,
      field_name: 'numero_processo_cnj',
      extracted_value: plan.targetCnj,
      source_type: plan.sources.some(source => source.kind === 'ATTACHMENT') ? 'DOCUMENT' : 'EMAIL',
      extraction_method: 'SYSTEM',
      confidence: 0.99,
      evidence_excerpt: `Reparo determinístico B1 (${plan.rule}). Fontes: ${sources}`.slice(0, 520),
    });
    if (evidence.error) throw new Error(`Falha ao registrar evidência B1: ${evidence.error.message}`);
  }

  const existingTimeline = await db.from('process_timeline').select('id')
    .eq('process_id', plan.targetProcessId)
    .eq('email_id', plan.emailId)
    .eq('tipo', 'EMAIL_INTERPRETADO')
    .eq('origem', REPAIR_ORIGIN_B1)
    .limit(1)
    .maybeSingle();
  if (existingTimeline.error) throw new Error(`Falha ao conferir timeline B1: ${existingTimeline.error.message}`);
  if (!existingTimeline.data?.id) {
    const timeline = await db.from('process_timeline').insert({
      process_id: plan.targetProcessId,
      email_id: plan.emailId,
      tipo: 'EMAIL_INTERPRETADO',
      titulo: 'Vínculo determinístico por CNJ dominante no assunto',
      descricao: `CNJ ${plan.targetCnj}. Regra ${plan.rule}. CNJs secundários tratados como referências auxiliares: ${plan.secondaryCnjs.join(', ')}. Nenhum processo novo foi criado.`.slice(0, 1500),
      data_hora: plan.email?.received_at || now,
      origem: REPAIR_ORIGIN_B1,
      usuario_id: actorId,
      automatico: true,
    });
    if (timeline.error) throw new Error(`Falha ao registrar timeline B1: ${timeline.error.message}`);
  }
}

async function executeOneB1(db: any, exceptionId: string, actorId: string) {
  // Revalida imediatamente antes de escrever. O dry-run anterior nunca é autorização persistente.
  const plan = await revalidateB1Plan(db, exceptionId);
  if (!plan) {
    return { exceptionId, status: 'SKIPPED_CHANGED_SINCE_PREVIEW', reason: 'Exceção não está mais aberta/disponível.' };
  }
  if (!plan.executable || !plan.targetProcessId || !plan.targetCnj) {
    return { exceptionId, status: 'REVIEW_REQUIRED', reason: plan.reason };
  }

  const now = new Date().toISOString();
  const distribution = {
    version: REPAIR_VERSION_B1,
    repaired_at: now,
    repaired_by: actorId,
    exception_id: plan.exceptionId,
    mode: 'SINGLE_PROCESS',
    rule: plan.rule,
    dominant_source: 'SUBJECT',
    links: [{
      process_id: plan.targetProcessId,
      numero_processo: plan.targetCnj,
      sources: plan.sources,
    }],
    ignored_auxiliary_cnjs: plan.secondaryCnjs,
  };

  const otherExceptions = await db.from('email_exceptions').select('id', { count: 'exact', head: true })
    .eq('processed_email_id', plan.emailId)
    .in('status', OPEN_STATUSES)
    .neq('id', plan.exceptionId);
  if (otherExceptions.error) throw new Error(`Falha ao conferir outras exceções B1: ${otherExceptions.error.message}`);

  const emailPatch: any = {
    process_id: plan.targetProcessId,
    matched_process_number: plan.targetCnj,
    metadata: {
      ...(plan.email?.metadata || {}),
      process_distribution: distribution,
      process_application: {
        ...(plan.email?.metadata?.process_application || {}),
        action: 'CNJ_AMBIGUITY_B1_REPAIRED',
        process_id: plan.targetProcessId,
        process_number: plan.targetCnj,
        has_exception: (otherExceptions.count || 0) > 0,
      },
    },
    updated_at: now,
  };
  if ((otherExceptions.count || 0) === 0 && String(plan.email?.status || '') === 'EXCECAO') {
    emailPatch.status = 'PROCESSADO';
  }

  let emailUpdate = db.from('processed_emails').update(emailPatch)
    .eq('id', plan.emailId)
    .eq('updated_at', plan.emailUpdatedAt);
  emailUpdate = plan.currentProcessId
    ? emailUpdate.eq('process_id', plan.currentProcessId)
    : emailUpdate.is('process_id', null);
  const emailResult = await emailUpdate.select('id').maybeSingle();
  if (emailResult.error) throw new Error(`Falha ao atualizar e-mail B1: ${emailResult.error.message}`);
  if (!emailResult.data?.id) {
    return { exceptionId, status: 'SKIPPED_CHANGED_SINCE_PREVIEW', reason: 'E-mail mudou durante a revalidação; nenhuma exceção foi encerrada.' };
  }

  await ensureB1AuditRows(db, plan, actorId);

  const resolutionNote = `Ambiguidade CNJ saneada deterministicamente pela regra B1: CNJ dominante ${plan.targetCnj} no assunto; CNJs auxiliares ${plan.secondaryCnjs.join(', ')} restritos a corpo/texto/resumo. Processo existente ${plan.targetProcessId}. Nenhum processo foi criado.`;
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
  if (resolved.error) throw new Error(`Falha ao encerrar exceção B1: ${resolved.error.message}`);
  if (!resolved.data?.id) {
    return {
      exceptionId,
      status: 'PARTIAL_EXCEPTION_CHANGED',
      processId: plan.targetProcessId,
      cnj: plan.targetCnj,
      reason: 'O e-mail foi vinculado com segurança, mas a exceção mudou concorrentemente e permaneceu aberta para revisão.',
    };
  }

  return {
    exceptionId,
    status: 'RESOLVED',
    processId: plan.targetProcessId,
    cnj: plan.targetCnj,
    rule: plan.rule,
  };
}

export async function executeCnjSubjectDominantB1(db: any, options: {
  actorId: string;
  limit?: number;
}) {
  const actorId = options.actorId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId)) {
    throw new Error('actorId inválido. O modo APPLY exige o UUID do usuário responsável pela manutenção.');
  }

  const initialPlans = await buildB1Plans(db);
  const ids = initialPlans
    .filter(plan => plan.executable)
    .map(plan => plan.exceptionId)
    .slice(0, Math.max(1, Math.min(Number(options.limit || 500), 1000)));

  const results: any[] = [];
  for (const id of ids) {
    try {
      results.push(await executeOneB1(db, id, actorId));
    } catch (error: any) {
      const reason = String(error?.message || error);
      console.error('[CNJ B1 REPAIR] falha isolada', { exceptionId: id, reason });
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
