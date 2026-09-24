import { summarizeDocumentIdentification } from './documentIdentificationService.ts';
import { falseProtocolFromReason } from './protocolReviewService.ts';

type RepairPlan = {
  exceptionId: string;
  emailId: string;
  subject: string | null;
  validCnjs: string[];
  invalidCnjs: string[];
  disposition: string;
  processMatches: Array<{ cnj: string; processId: string | null; matchCount: number; sources: string[] }>;
  executable: boolean;
  reason: string;
  updatedAt: string;
  email: any;
  documents: any[];
};

function knownFalseProtocol(row: any) {
  return row?.exception_type === 'PROTOCOLO_MULTIPLO_AMBIGUO'
    && ['ABERTA', 'PENDENTE'].includes(String(row?.status || ''))
    && Boolean(falseProtocolFromReason(row?.reason));
}

export function hasUnambiguousDocumentSeparation(documents: any[], validCnjs: string[]) {
  const usable = documents.filter(doc => !['SUBJECT', 'SUMMARY'].includes(String(doc.kind || '')));
  const bySource = new Map<string, Set<string>>();
  for (const doc of usable) {
    const key = String(doc.source || `Trecho ${doc.blockIndex}`);
    const values = bySource.get(key) || new Set<string>();
    for (const cnj of doc.validCnjs || []) values.add(cnj);
    bySource.set(key, values);
  }
  if ([...bySource.values()].some(values => values.size > 1)) return false;
  return validCnjs.every(cnj => [...bySource.values()].some(values => values.has(cnj)));
}

async function loadCandidates(db: any, exceptionIds?: string[]): Promise<any[]> {
  let query = db.from('email_exceptions')
    .select('id,processed_email_id,exception_type,reason,status,updated_at')
    .eq('exception_type', 'PROTOCOLO_MULTIPLO_AMBIGUO')
    .in('status', ['ABERTA', 'PENDENTE']);
  if (exceptionIds?.length) query = query.in('id', exceptionIds);
  const { data, error } = await query.order('id', { ascending: true }).limit(201);
  if (error) throw new Error(`Falha ao consultar exceções: ${error.message}`);
  return (data || []).filter(knownFalseProtocol);
}

async function buildPlans(db: any, exceptionIds?: string[]): Promise<{ totalAffected: number; plans: RepairPlan[] }> {
  const rows = await loadCandidates(db, exceptionIds);
  const selected = rows;
  const emailIds = [...new Set(selected.map((row: any) => row.processed_email_id).filter(Boolean))];
  const emailResult = emailIds.length
    ? await db.from('processed_emails').select('id,status,process_id,matched_process_number,subject,received_at,metadata,updated_at').in('id', emailIds)
    : { data: [], error: null };
  if (emailResult.error) throw new Error(`Falha ao consultar e-mails: ${emailResult.error.message}`);
  const emails = new Map((emailResult.data || []).map((email: any) => [email.id, email]));
  const analyses = selected.map((row: any) => {
    const email: any = emails.get(row.processed_email_id);
    const blocks = Array.isArray(email?.metadata?.ai_evidence_blocks) ? email.metadata.ai_evidence_blocks : [];
    const summaryNumbers = Array.isArray(email?.metadata?.legal_summary?.process_numbers) ? email.metadata.legal_summary.process_numbers : [];
    const analysis = summarizeDocumentIdentification([
      { source: 'Assunto', kind: 'SUBJECT', text: email?.subject || '' }, ...blocks,
      { source: 'Resumo salvo — origem não individualizada', kind: 'SUMMARY', text: summaryNumbers.join('\n') },
    ]);
    return { row, email, analysis };
  });
  const allCnjs = [...new Set(analyses.flatMap(item => item.analysis.validCnjs))];
  const processResult = allCnjs.length
    ? await db.from('processes').select('id,numero_processo').in('numero_processo', allCnjs)
    : { data: [], error: null };
  if (processResult.error) throw new Error(`Falha ao localizar processos: ${processResult.error.message}`);
  const byCnj = new Map<string, any[]>();
  for (const process of processResult.data || []) {
    const list = byCnj.get(process.numero_processo) || [];
    list.push(process); byCnj.set(process.numero_processo, list);
  }
  const plans: RepairPlan[] = analyses.map(({ row, email, analysis }) => {
    const processMatches = analysis.validCnjs.map(cnpj => {
      const matches = byCnj.get(cnpj) || [];
      const sources = analysis.documents.filter((doc: any) => doc.validCnjs.includes(cnpj)).map((doc: any) => doc.source);
      return { cnj: cnpj, processId: matches.length === 1 ? matches[0].id : null, matchCount: matches.length, sources: [...new Set<string>(sources)] };
    });
    const allUnique = processMatches.length > 0 && processMatches.every(item => item.matchCount === 1);
    const separated = hasUnambiguousDocumentSeparation(analysis.documents, analysis.validCnjs);
    const matchedProcessIds = new Set(processMatches.map(item => item.processId).filter(Boolean));
    const existingLinkCompatible = !email?.process_id || matchedProcessIds.has(email.process_id);
    const executable = Boolean(email) && analysis.invalidCnjs.length === 0 && allUnique && separated && existingLinkCompatible;
    const reason = !email ? 'E-mail não encontrado.'
      : analysis.invalidCnjs.length ? 'Existe número com DV inválido.'
      : !analysis.validCnjs.length ? 'Nenhum CNJ válido encontrado nos trechos disponíveis.'
      : processMatches.some(item => item.matchCount === 0) ? 'Há CNJ sem processo cadastrado.'
      : processMatches.some(item => item.matchCount > 1) ? 'Há CNJ duplicado no cadastro de processos.'
      : !separated ? 'Os CNJs não estão separados de forma inequívoca por documento.'
      : !existingLinkCompatible ? 'O e-mail já está vinculado a outro processo; decisão humana preservada.'
      : 'Todos os CNJs válidos possuem processo único cadastrado.';
    return { exceptionId: row.id, emailId: row.processed_email_id, subject: email?.subject || null,
      validCnjs: analysis.validCnjs, invalidCnjs: analysis.invalidCnjs, disposition: analysis.disposition,
      processMatches, executable, reason, updatedAt: row.updated_at, email, documents: analysis.documents };
  });
  return { totalAffected: rows.length, plans };
}

export async function previewFalseProtocolRepair(db: any) {
  const { totalAffected, plans } = await buildPlans(db);
  const batch = [...plans.filter(plan => plan.executable), ...plans.filter(plan => !plan.executable)].slice(0, 10);
  return { dryRun: true, limit: 10, totalAffected, selected: batch.length,
    executable: batch.filter(plan => plan.executable).length,
    requiresReview: batch.filter(plan => !plan.executable).length,
    totalExecutable: plans.filter(plan => plan.executable).length,
    cases: batch.map(({ email, documents, ...plan }) => plan) };
}

async function ensureDistributionRecords(db: any, plan: RepairPlan, actorId: string) {
  const now = new Date().toISOString();
  for (const match of plan.processMatches) {
    if (!match.processId) throw new Error(`Processo não resolvido para ${match.cnj}.`);
    const existingTimeline = await db.from('process_timeline').select('id')
      .eq('process_id', match.processId).eq('email_id', plan.emailId).eq('tipo', 'EMAIL_INTERPRETADO')
      .eq('origem', 'REPARO_PROTOCOLO_6E2_9').limit(1).maybeSingle();
    if (existingTimeline.error) throw new Error(existingTimeline.error.message);
    if (!existingTimeline.data?.id) {
      const timeline = await db.from('process_timeline').insert({ process_id: match.processId, email_id: plan.emailId,
        tipo: 'EMAIL_INTERPRETADO', titulo: 'Documento distribuído após revisão de protocolo',
        descricao: `CNJ ${match.cnj}. Fontes: ${match.sources.join(', ') || 'resumo salvo'}. Distribuição determinística; conteúdo jurídico permanece sujeito à revisão humana.`.slice(0, 1500),
        data_hora: plan.email.received_at || now, origem: 'REPARO_PROTOCOLO_6E2_9', usuario_id: actorId, automatico: false });
      if (timeline.error) throw new Error(`Falha ao registrar histórico de ${match.cnj}: ${timeline.error.message}`);
    }
    const existingEvidence = await db.from('process_evidence').select('id,extracted_value')
      .eq('process_id', match.processId).eq('processed_email_id', plan.emailId)
      .eq('field_name', 'numero_processo_cnj').limit(100);
    if (existingEvidence.error) throw new Error(existingEvidence.error.message);
    const alreadyRecorded = (existingEvidence.data || []).some((row: any) => String(row.extracted_value || '').replace(/\D/g, '') === match.cnj.replace(/\D/g, ''));
    if (!alreadyRecorded) {
      const evidence = await db.from('process_evidence').insert({ process_id: match.processId, processed_email_id: plan.emailId,
        // O banco persiste evidencias de anexos como DOCUMENT. ATTACHMENT e apenas
        // a classificacao interna usada durante a leitura do e-mail.
        field_name: 'numero_processo_cnj', extracted_value: match.cnj, source_type: 'DOCUMENT', extraction_method: 'SYSTEM',
        confidence: 0.91, evidence_excerpt: `Fontes: ${match.sources.join(', ') || 'resumo salvo'}`.slice(0, 520) });
      if (evidence.error) throw new Error(`Falha ao registrar evidência de ${match.cnj}: ${evidence.error.message}`);
    }
  }
  const distribution = { version: '6E2_9', repaired_at: now, repaired_by: actorId,
    exception_id: plan.exceptionId, mode: plan.processMatches.length === 1 ? 'SINGLE_PROCESS' : 'MULTI_PROCESS',
    links: plan.processMatches.map(item => ({ process_id: item.processId, numero_processo: item.cnj, sources: item.sources })) };
  const otherExceptions = await db.from('email_exceptions').select('id', { count: 'exact', head: true })
    .eq('processed_email_id', plan.emailId).in('status', ['ABERTA', 'PENDENTE']).neq('id', plan.exceptionId);
  if (otherExceptions.error) throw new Error(otherExceptions.error.message);
  const emailPatch: any = { metadata: { ...(plan.email.metadata || {}), process_distribution: distribution }, updated_at: now };
  if (plan.processMatches.length === 1 && !plan.email.process_id) {
    emailPatch.process_id = plan.processMatches[0].processId;
    emailPatch.matched_process_number = plan.processMatches[0].cnj;
  }
  if ((otherExceptions.count || 0) === 0) emailPatch.status = 'PROCESSADO';
  const emailUpdate = await db.from('processed_emails').update(emailPatch).eq('id', plan.emailId).eq('updated_at', plan.email.updated_at).select('id').maybeSingle();
  if (emailUpdate.error) throw new Error(`Falha ao atualizar e-mail: ${emailUpdate.error.message}`);
  if (!emailUpdate.data) throw new Error('E-mail mudou após a prévia; gere uma nova prévia.');
  const resolved = await db.from('email_exceptions').update({ status: 'RESOLVIDA', resolved_by: actorId, resolved_at: now,
    resolution_note: `Falso protocolo removido. ${plan.processMatches.length} processo(s) identificado(s) e registrado(s) com origem documental.`, updated_at: now })
    .eq('id', plan.exceptionId).in('status', ['ABERTA', 'PENDENTE']).eq('updated_at', plan.updatedAt).select('id').maybeSingle();
  if (resolved.error) throw new Error(`Falha ao encerrar exceção: ${resolved.error.message}`);
  if (!resolved.data) throw new Error('Exceção mudou após a prévia; os registros criados foram mantidos e a exceção continua para revisão.');
}

export async function executeFalseProtocolRepair(db: any, exceptionIds: string[], actorId: string) {
  const { plans } = await buildPlans(db, exceptionIds);
  if (plans.length !== exceptionIds.length) throw new Error('A seleção contém caso inexistente, alterado ou fora do defeito conhecido.');
  const results: any[] = [];
  for (const plan of plans) {
    if (!plan.executable) { results.push({ exceptionId: plan.exceptionId, status: 'REVIEW_REQUIRED', reason: plan.reason }); continue; }
    try { await ensureDistributionRecords(db, plan, actorId); results.push({ exceptionId: plan.exceptionId, status: 'RESOLVED', processes: plan.processMatches.length }); }
    catch (error: any) {
      const reason = String(error?.message || error);
      console.error('[EXCEPTION REPAIR] falha ao reparar falso protocolo', { exceptionId: plan.exceptionId, emailId: plan.emailId, reason });
      results.push({ exceptionId: plan.exceptionId, status: 'ERROR', reason });
    }
  }
  return { dryRun: false, selected: plans.length, resolved: results.filter(r => r.status === 'RESOLVED').length,
    requiresReview: results.filter(r => r.status === 'REVIEW_REQUIRED').length, errors: results.filter(r => r.status === 'ERROR').length, results };
}
