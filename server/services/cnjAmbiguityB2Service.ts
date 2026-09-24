import { summarizeDocumentIdentification } from './documentIdentificationService.ts';

type DocumentIdentification = ReturnType<typeof summarizeDocumentIdentification>;
type EvidenceBlock = { source?: string; kind?: string; text?: string };
type SourceRef = { source: string; kind: string };

export type CnjB2Selection = {
  rule: string | null;
  structuralCandidate: boolean;
  targetCnjs: string[];
  auxiliaryCnjs: string[];
  reason: string;
  sourcesByCnj: Record<string, SourceRef[]>;
};

export type CnjB2Plan = {
  exceptionId: string;
  exceptionUpdatedAt: string;
  emailId: string;
  emailUpdatedAt: string;
  subject: string | null;
  currentProcessId: string | null;
  targetCnjs: string[];
  targetProcessIds: string[];
  auxiliaryCnjs: string[];
  allValidCnjs: string[];
  invalidCnjs: string[];
  rule: string | null;
  structuralCandidate: boolean;
  executable: boolean;
  reason: string;
  sourcesByCnj: Record<string, SourceRef[]>;
  email: any;
};

const OPEN_STATUSES = ['ABERTA', 'PENDENTE'];
const RULE_SEPARATED_ATTACHMENTS = 'B2_SEPARATED_ATTACHMENTS_AUXILIARY_EXTRAS';
const RULE_CONNECTED_REFERENCE = 'B2_CONNECTED_REFERENCE_EXPLICIT';
const REPAIR_ORIGIN_B2 = 'REPARO_CNJ_B2_DISTRIBUICAO_DOCUMENTAL';
const REPAIR_VERSION_B2 = 'CNJ_B2_20260915';

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

function sourceKindsForCnj(analysis: DocumentIdentification, cnj: string) {
  return unique(sourcesForCnj(analysis, cnj).map(source => source.kind));
}

function blockContainsCnj(block: EvidenceBlock, cnj: string) {
  const digits = cnj.replace(/\D/g, '');
  const textDigits = String(block.text || '').replace(/\D/g, '');
  return Boolean(digits && textDigits.includes(digits));
}

type AttachmentGroup = {
  source: string;
  docs: any[];
  contentCnjs: string[];
  sourceCnjs: string[];
  anchorCnj: string | null;
  anchorReason: 'SOURCE_FILENAME' | 'SOLE_CONTENT_CNJ' | null;
  conflict: string | null;
};

function buildAttachmentGroups(analysis: DocumentIdentification): AttachmentGroup[] {
  const allCnjs = unique<string>(analysis.validCnjs as string[]);
  const grouped = new Map<string, { source: string; docs: any[] }>();

  for (const doc of analysis.documents as any[]) {
    if (normalizeKind(doc.kind) !== 'ATTACHMENT') continue;
    const source = String(doc.source || `Trecho ${doc.blockIndex ?? 0}`).trim();
    const key = source.toLocaleLowerCase('pt-BR');
    const current = grouped.get(key) || { source, docs: [] };
    current.docs.push(doc);
    grouped.set(key, current);
  }

  return [...grouped.values()].map(group => {
    const sourceDigits = group.source.replace(/\D/g, '');
    const sourceCnjs = allCnjs.filter(cnj => sourceDigits.includes(cnj.replace(/\D/g, '')));
    const contentCnjs = unique<string>(group.docs.flatMap(doc => (doc.validCnjs || []) as string[]));

    let anchorCnj: string | null = null;
    let anchorReason: AttachmentGroup['anchorReason'] = null;
    let conflict: string | null = null;

    if (sourceCnjs.length > 1) {
      conflict = `O nome do anexo '${group.source}' contém mais de um CNJ válido.`;
    } else if (sourceCnjs.length === 1) {
      anchorCnj = sourceCnjs[0];
      anchorReason = 'SOURCE_FILENAME';
      if (contentCnjs.length > 0 && !contentCnjs.includes(anchorCnj)) {
        conflict = `O anexo '${group.source}' identifica ${anchorCnj} no nome, mas o conteúdo persistido aponta apenas para outro(s) CNJ(s).`;
      }
    } else if (contentCnjs.length === 1) {
      anchorCnj = contentCnjs[0];
      anchorReason = 'SOLE_CONTENT_CNJ';
    } else if (contentCnjs.length > 1) {
      conflict = `O anexo '${group.source}' contém mais de um CNJ (múltiplos CNJs) e não possui CNJ único no nome para identificar o documento.`;
    }

    return {
      source: group.source,
      docs: group.docs,
      contentCnjs,
      sourceCnjs,
      anchorCnj,
      anchorReason,
      conflict,
    };
  });
}

function isAttachmentReferenceOnly(cnj: string, groups: AttachmentGroup[]) {
  const containing = groups.filter(group => group.contentCnjs.includes(cnj));
  if (!containing.length) return true;
  return containing.every(group => Boolean(group.anchorCnj) && group.anchorCnj !== cnj && !group.conflict);
}

function relationMarkerNearCnj(text: string, cnj: string) {
  const marker = /\b(embargos?|principal|cumprimento\s+de\s+senten[cç]a|apens[oa]|conex[oa]|conexo|conexa|incidente|processo\s+origin[aá]rio|a[cç][aã]o\s+principal)\b/i;
  const normalized = String(text || '').replace(/\s+/g, ' ');
  let from = 0;
  while (from < normalized.length) {
    const index = normalized.indexOf(cnj, from);
    if (index < 0) break;
    const window = normalized.slice(Math.max(0, index - 600), Math.min(normalized.length, index + cnj.length + 600));
    if (marker.test(window)) return true;
    from = index + cnj.length;
  }
  return false;
}

function hasExplicitConnectionMarker(blocks: EvidenceBlock[], cnj: string) {
  return blocks.some(block => {
    const kind = normalizeKind(block.kind);
    if (!['BODY', 'TEXT', 'SUMMARY', 'ATTACHMENT'].includes(kind)) return false;
    return blockContainsCnj(block, cnj) && relationMarkerNearCnj(String(block.text || ''), cnj);
  });
}

/**
 * B2 dinâmico e conservador.
 *
 * Regra 1: dois ou mais ANEXOS FÍSICOS individualizados. Blocos/páginas do mesmo PDF
 * são agrupados por source antes da classificação. O CNJ-alvo de cada anexo é, em
 * ordem de força: (a) o CNJ único presente no nome do arquivo; ou (b) o único CNJ
 * existente em todo o conteúdo persistido daquele anexo. Outros CNJs citados dentro
 * do conteúdo de um PDF identificado pelo nome são tratados apenas como referências,
 * nunca como um novo processo-alvo daquele mesmo arquivo.
 *
 * Regra 2: um único processo primário identificado de forma coerente no assunto e no
 * anexo, mais exatamente um segundo CNJ com marcador jurídico explícito de conexão,
 * incidente, embargos, cumprimento etc. O marcador deve estar próximo do CNJ no mesmo
 * bloco de evidência, inclusive quando a relação consta dentro do PDF.
 */
export function selectRelaxedMultiProcessB2(
  analysis: DocumentIdentification,
  rawBlocks: EvidenceBlock[] = [],
): CnjB2Selection {
  const empty = (reason: string): CnjB2Selection => ({
    rule: null,
    structuralCandidate: false,
    targetCnjs: [],
    auxiliaryCnjs: [],
    reason,
    sourcesByCnj: {},
  });

  if (analysis.invalidCnjs.length > 0) {
    return empty('Há CNJ com DV inválido nos trechos persistidos.');
  }

  const all = unique<string>(analysis.validCnjs as string[]);
  if (all.length < 2) {
    return empty('B2 exige pelo menos dois CNJs válidos.');
  }

  const attachmentGroups = buildAttachmentGroups(analysis);
  if (attachmentGroups.length === 0) {
    return empty('B2 exige evidência documental em anexo.');
  }

  const attachmentConflict = attachmentGroups.find(group => group.conflict);
  if (attachmentConflict) {
    return empty(attachmentConflict.conflict!);
  }

  const attachmentAnchors = unique<string>(attachmentGroups
    .map(group => group.anchorCnj)
    .filter((cnj): cnj is string => Boolean(cnj)));
  const subjectCnjs = cnjsForKinds(analysis, ['SUBJECT']);
  const allowedAuxKinds = new Set(['BODY', 'TEXT', 'SUMMARY', 'ATTACHMENT']);

  // B2 clássico: >= 2 documentos físicos com identidades processuais distintas.
  if (attachmentAnchors.length >= 2) {
    const auxiliaryCnjs = all.filter(cnj => !attachmentAnchors.includes(cnj));
    const subjectCompatible = subjectCnjs.every(cnj => attachmentAnchors.includes(cnj));
    if (!subjectCompatible) {
      return empty('O assunto introduz CNJ fora da distribuição documental dos anexos.');
    }

    for (const cnj of auxiliaryCnjs) {
      const kinds = sourceKindsForCnj(analysis, cnj);
      if (!kinds.length || kinds.some(kind => !allowedAuxKinds.has(kind))) {
        return empty(`CNJ auxiliar ${cnj} aparece em fonte não auxiliar (${kinds.join(', ') || 'sem fonte'}).`);
      }
      if (kinds.includes('ATTACHMENT') && !isAttachmentReferenceOnly(cnj, attachmentGroups)) {
        return empty(`CNJ ${cnj} aparece em anexo sem identidade documental distinta e segura.`);
      }
    }

    const sourcesByCnj = Object.fromEntries(all.map(cnj => [cnj, sourcesForCnj(analysis, cnj)]));
    return {
      rule: RULE_SEPARATED_ATTACHMENTS,
      structuralCandidate: true,
      targetCnjs: attachmentAnchors,
      auxiliaryCnjs,
      reason: auxiliaryCnjs.length
        ? 'Anexos físicos individualizados comprovam múltiplos processos; demais CNJs são apenas referências internas ou contexto auxiliar.'
        : 'Anexos físicos individualizados comprovam múltiplos processos sem CNJs concorrentes fora dos documentos-alvo.',
      sourcesByCnj,
    };
  }

  // Sub-regra restrita para processo principal/incidente relacionado.
  if (attachmentAnchors.length === 1 && subjectCnjs.length === 1 && subjectCnjs[0] === attachmentAnchors[0]) {
    const primary = attachmentAnchors[0];
    const auxiliaryCnjs = all.filter(cnj => cnj !== primary);
    if (auxiliaryCnjs.length === 1) {
      const related = auxiliaryCnjs[0];
      const kinds = sourceKindsForCnj(analysis, related);
      const allowedSources = kinds.length > 0 && kinds.every(kind => allowedAuxKinds.has(kind));
      const attachmentSafe = !kinds.includes('ATTACHMENT') || isAttachmentReferenceOnly(related, attachmentGroups);
      if (allowedSources && attachmentSafe && hasExplicitConnectionMarker(rawBlocks, related)) {
        return {
          rule: RULE_CONNECTED_REFERENCE,
          structuralCandidate: true,
          targetCnjs: [primary, related],
          auxiliaryCnjs: [],
          reason: 'Assunto e anexo identificam o processo principal e há um segundo CNJ com relação jurídica explícita de conexão/incidente próxima à própria referência documental.',
          sourcesByCnj: Object.fromEntries(all.map(cnj => [cnj, sourcesForCnj(analysis, cnj)])),
        };
      }
    }
  }

  return empty('O caso não satisfaz as regras estruturais conservadoras B2.');
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

export async function buildB2Plans(db: any, exceptionIds?: string[]): Promise<CnjB2Plan[]> {
  const exceptions = await fetchAllOpenExceptions(db, exceptionIds);
  const emailIds = unique<string>(exceptions.map((row: any) => String(row.processed_email_id || '')).filter(Boolean));
  const emails = await fetchInChunks(db, 'processed_emails',
    'id,status,process_id,matched_process_number,subject,received_at,metadata,updated_at', 'id', emailIds);
  const emailById = new Map(emails.map((email: any) => [email.id, email]));

  const prepared = exceptions.map((row: any) => {
    const email: any = emailById.get(row.processed_email_id);
    const evidenceBlocks = Array.isArray(email?.metadata?.ai_evidence_blocks) ? email.metadata.ai_evidence_blocks : [];
    const summaryNumbers = Array.isArray(email?.metadata?.legal_summary?.process_numbers)
      ? email.metadata.legal_summary.process_numbers
      : [];
    const rawBlocks: EvidenceBlock[] = [
      { source: 'Assunto', kind: 'SUBJECT', text: email?.subject || '' },
      ...evidenceBlocks,
      { source: 'Resumo salvo — origem não individualizada', kind: 'SUMMARY', text: summaryNumbers.join('\n') },
    ];
    const analysis = summarizeDocumentIdentification(rawBlocks);
    const selection = selectRelaxedMultiProcessB2(analysis, rawBlocks);
    return { row, email, analysis, selection };
  });

  // Para não misturar B2 com D1/C2, TODOS os CNJs do caso devem corresponder de forma única a processes.
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
    const structuralCandidate = selection.structuralCandidate;
    const targetProcessIds: string[] = [];
    let executable = false;
    let reason = selection.reason;

    if (!email) {
      reason = 'E-mail processado não encontrado.';
    } else if (!structuralCandidate || !selection.rule) {
      reason = selection.reason;
    } else {
      const nonUnique = analysis.validCnjs
        .map(cnj => ({ cnj, matches: (processesByCnj.get(cnj) || []).length }))
        .filter(item => item.matches !== 1);

      if (nonUnique.length > 0) {
        reason = `Há CNJ da exceção sem correspondência única em processes: ${nonUnique.map(item => `${item.cnj}(${item.matches})`).join(', ')}.`;
      } else {
        targetProcessIds.push(...selection.targetCnjs.map(cnj => processesByCnj.get(cnj)![0].id));
        const targetSet = new Set(targetProcessIds);

        if (email.process_id && !targetSet.has(email.process_id)) {
          reason = 'O e-mail já possui process_id incompatível com os processos-alvo B2.';
        } else if (email.matched_process_number && !selection.targetCnjs.some(cnj => sameCnj(cnj, email.matched_process_number))) {
          reason = 'O e-mail já possui matched_process_number incompatível com os processos-alvo B2.';
        } else {
          const distributionLinks = Array.isArray(email?.metadata?.process_distribution?.links)
            ? email.metadata.process_distribution.links
            : [];
          const conflictingDistribution = distributionLinks.some((link: any) => link?.process_id && !targetSet.has(link.process_id));

          const relatedProcessIds = new Set<string>();
          for (const ev of evidenceByEmail.get(row.processed_email_id) || []) {
            if (ev.process_id) relatedProcessIds.add(ev.process_id);
          }
          for (const tl of timelineByEmail.get(row.processed_email_id) || []) {
            if (tl.process_id) relatedProcessIds.add(tl.process_id);
          }
          const conflictingRelated = [...relatedProcessIds].filter(processId => !targetSet.has(processId));

          if (conflictingDistribution) {
            reason = 'Já existe process_distribution apontando para processo fora dos alvos B2.';
          } else if (conflictingRelated.length > 0) {
            reason = 'Já existem evidências/timeline do e-mail associadas a processo fora dos alvos B2.';
          } else {
            executable = true;
          }
        }
      }
    }

    return {
      exceptionId: row.id,
      exceptionUpdatedAt: row.updated_at,
      emailId: row.processed_email_id,
      emailUpdatedAt: email?.updated_at || '',
      subject: email?.subject || null,
      currentProcessId: email?.process_id || null,
      targetCnjs: selection.targetCnjs,
      targetProcessIds,
      auxiliaryCnjs: selection.auxiliaryCnjs,
      allValidCnjs: analysis.validCnjs,
      invalidCnjs: analysis.invalidCnjs,
      rule: selection.rule,
      structuralCandidate,
      executable,
      reason,
      sourcesByCnj: selection.sourcesByCnj,
      email,
    };
  });
}

export async function previewCnjRelaxedB2(db: any) {
  const plans = await buildB2Plans(db);
  const structural = plans.filter(plan => plan.structuralCandidate);
  const executable = structural.filter(plan => plan.executable);
  const blocked = structural.filter(plan => !plan.executable);

  const ruleCounts: Record<string, number> = {};
  for (const plan of structural) {
    const key = plan.rule || 'NONE';
    ruleCounts[key] = (ruleCounts[key] || 0) + 1;
  }

  const rejectionCounts: Record<string, number> = {};
  for (const plan of blocked) {
    rejectionCounts[plan.reason] = (rejectionCounts[plan.reason] || 0) + 1;
  }

  return {
    dryRun: true,
    mode: 'B2_RELAXED_MULTI_PROCESS_READ_ONLY',
    openCnjAmbiguities: plans.length,
    structuralB2: structural.length,
    executableB2: executable.length,
    blockedB2: blocked.length,
    ruleCounts,
    rejectionCounts,
    executable: executable.slice(0, 100).map(({ email, ...plan }) => plan),
    blocked: blocked.slice(0, 100).map(({ email, ...plan }) => plan),
  };
}


async function revalidateB2Plan(db: any, exceptionId: string): Promise<CnjB2Plan | null> {
  const plans = await buildB2Plans(db, [exceptionId]);
  return plans[0] || null;
}

async function ensureB2AuditRows(db: any, plan: CnjB2Plan, actorId: string) {
  const now = new Date().toISOString();

  for (let index = 0; index < plan.targetCnjs.length; index += 1) {
    const cnj = plan.targetCnjs[index];
    const processId = plan.targetProcessIds[index];
    if (!cnj || !processId) continue;

    const sources = plan.sourcesByCnj?.[cnj] || [];
    const sourcesStr = sources.map(source => `${source.kind}:${source.source}`).join(', ') || 'anexo documental';

    const existingEvidence = await db.from('process_evidence').select('id,extracted_value')
      .eq('process_id', processId)
      .eq('processed_email_id', plan.emailId)
      .eq('field_name', 'numero_processo_cnj')
      .limit(100);
    if (existingEvidence.error) throw new Error(`Falha ao conferir evidência B2 de ${cnj}: ${existingEvidence.error.message}`);
    const alreadyRecorded = (existingEvidence.data || []).some((row: any) => sameCnj(row.extracted_value, cnj));
    if (!alreadyRecorded) {
      const evidence = await db.from('process_evidence').insert({
        process_id: processId,
        processed_email_id: plan.emailId,
        field_name: 'numero_processo_cnj',
        extracted_value: cnj,
        source_type: sources.some(source => source.kind === 'ATTACHMENT') ? 'DOCUMENT' : 'EMAIL',
        extraction_method: 'SYSTEM',
        confidence: 0.99,
        evidence_excerpt: `Reparo determinístico B2 (${plan.rule}). Fontes: ${sourcesStr}`.slice(0, 520),
      });
      if (evidence.error) throw new Error(`Falha ao registrar evidência B2 de ${cnj}: ${evidence.error.message}`);
    }

    const existingTimeline = await db.from('process_timeline').select('id')
      .eq('process_id', processId)
      .eq('email_id', plan.emailId)
      .eq('tipo', 'EMAIL_INTERPRETADO')
      .eq('origem', REPAIR_ORIGIN_B2)
      .limit(1)
      .maybeSingle();
    if (existingTimeline.error) throw new Error(`Falha ao conferir timeline B2 de ${cnj}: ${existingTimeline.error.message}`);
    if (!existingTimeline.data?.id) {
      const timeline = await db.from('process_timeline').insert({
        process_id: processId,
        email_id: plan.emailId,
        tipo: 'EMAIL_INTERPRETADO',
        titulo: 'Distribuição multiprocesso por evidência documental B2',
        descricao: `CNJ ${cnj}. Regra ${plan.rule}. Fontes: ${sourcesStr}. CNJs auxiliares ignorados: ${plan.auxiliaryCnjs.join(', ') || 'nenhum'}. Nenhum processo novo foi criado.`.slice(0, 1500),
        data_hora: plan.email?.received_at || now,
        origem: REPAIR_ORIGIN_B2,
        usuario_id: actorId,
        automatico: true,
      });
      if (timeline.error) throw new Error(`Falha ao registrar timeline B2 de ${cnj}: ${timeline.error.message}`);
    }
  }
}

async function executeOneB2(db: any, exceptionId: string, actorId: string) {
  // O estado é reavaliado imediatamente antes da escrita. O preview não é uma autorização persistente.
  const plan = await revalidateB2Plan(db, exceptionId);
  if (!plan) {
    return { exceptionId, status: 'SKIPPED_CHANGED_SINCE_PREVIEW', reason: 'Exceção não está mais aberta/disponível.' };
  }
  if (!plan.executable || !plan.rule || plan.targetCnjs.length < 2 || plan.targetProcessIds.length !== plan.targetCnjs.length) {
    return { exceptionId, status: 'REVIEW_REQUIRED', reason: plan.reason };
  }

  const now = new Date().toISOString();
  const distribution = {
    version: REPAIR_VERSION_B2,
    repaired_at: now,
    repaired_by: actorId,
    exception_id: plan.exceptionId,
    mode: 'MULTI_PROCESS',
    rule: plan.rule,
    links: plan.targetCnjs.map((cnj, index) => ({
      process_id: plan.targetProcessIds[index],
      numero_processo: cnj,
      sources: (plan.sourcesByCnj?.[cnj] || []).map(source => ({
        source: source.source,
        kind: source.kind,
      })),
    })),
    ignored_auxiliary_cnjs: plan.auxiliaryCnjs,
  };

  const otherExceptions = await db.from('email_exceptions').select('id', { count: 'exact', head: true })
    .eq('processed_email_id', plan.emailId)
    .in('status', OPEN_STATUSES)
    .neq('id', plan.exceptionId);
  if (otherExceptions.error) throw new Error(`Falha ao conferir outras exceções B2: ${otherExceptions.error.message}`);

  const emailPatch: any = {
    metadata: {
      ...(plan.email?.metadata || {}),
      process_distribution: distribution,
      process_application: {
        ...(plan.email?.metadata?.process_application || {}),
        action: 'CNJ_AMBIGUITY_B2_REPAIRED',
        mode: 'MULTI_PROCESS',
        rule: plan.rule,
        process_ids: plan.targetProcessIds,
        process_numbers: plan.targetCnjs,
        ignored_auxiliary_cnjs: plan.auxiliaryCnjs,
        has_exception: (otherExceptions.count || 0) > 0,
      },
    },
    updated_at: now,
  };

  // B2 é multiprocesso: não escolhe arbitrariamente um processo principal.
  // Se process_id já aponta para um dos alvos, preserva. Se está null, continua null.
  if (plan.currentProcessId) {
    emailPatch.process_id = plan.currentProcessId;
  }
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
  if (emailResult.error) throw new Error(`Falha ao atualizar e-mail B2: ${emailResult.error.message}`);
  if (!emailResult.data?.id) {
    return { exceptionId, status: 'SKIPPED_CHANGED_SINCE_PREVIEW', reason: 'E-mail mudou durante a revalidação; nenhuma exceção foi encerrada.' };
  }

  await ensureB2AuditRows(db, plan, actorId);

  const resolutionNote = `Ambiguidade CNJ saneada deterministicamente pela regra B2 ${plan.rule}. ${plan.targetCnjs.length} processos-alvo vinculados (${plan.targetCnjs.join(', ')}). CNJs auxiliares ignorados: ${plan.auxiliaryCnjs.join(', ') || 'nenhum'}. Nenhum processo novo foi criado.`;
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
  if (resolved.error) throw new Error(`Falha ao encerrar exceção B2: ${resolved.error.message}`);
  if (!resolved.data?.id) {
    return {
      exceptionId,
      status: 'PARTIAL_EXCEPTION_CHANGED',
      processCount: plan.targetCnjs.length,
      reason: 'A distribuição B2 foi registrada com segurança, mas a exceção mudou concorrentemente e permaneceu aberta para revisão.',
    };
  }

  return {
    exceptionId,
    status: 'RESOLVED',
    processCount: plan.targetCnjs.length,
    processes: plan.targetCnjs.map((cnj, index) => ({ processId: plan.targetProcessIds[index], cnj })),
    auxiliaryCnjs: plan.auxiliaryCnjs,
    rule: plan.rule,
  };
}

export async function executeCnjRelaxedB2(db: any, options: {
  actorId: string;
  limit?: number;
}) {
  const actorId = options.actorId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId)) {
    throw new Error('actorId inválido. O modo APPLY exige o UUID do usuário responsável pela manutenção.');
  }

  const initialPlans = await buildB2Plans(db);
  const ids = initialPlans
    .filter(plan => plan.executable)
    .map(plan => plan.exceptionId)
    .slice(0, Math.max(1, Math.min(Number(options.limit || 500), 1000)));

  const results: any[] = [];
  for (const id of ids) {
    try {
      results.push(await executeOneB2(db, id, actorId));
    } catch (error: any) {
      const reason = String(error?.message || error);
      console.error('[CNJ B2 REPAIR] falha isolada', { exceptionId: id, reason });
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
