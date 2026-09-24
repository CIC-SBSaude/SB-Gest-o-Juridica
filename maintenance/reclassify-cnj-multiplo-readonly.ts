import 'dotenv/config';
import { getBackendSupabase } from '../server/integrations/supabase.ts';
import { summarizeDocumentIdentification, hasUnambiguousDocumentSeparation } from '../server/services/documentIdentificationService.ts';
import { selectDeterministicSingleCnj } from '../server/services/cnjAmbiguityRepairService.ts';

const db = getBackendSupabase()!;

const OPEN_STATUSES = ['ABERTA', 'PENDENTE'];
const rows: any[] = [];
const pageSize = 500;
for (let from = 0; ; from += pageSize) {
  const { data, error } = await db.from('email_exceptions')
    .select('id,processed_email_id,exception_type,status,updated_at')
    .eq('exception_type', 'CNJ_MULTIPLO_AMBIGUO')
    .in('status', OPEN_STATUSES)
    .order('id', { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`Falha ao consultar exceções: ${error.message}`);
  rows.push(...(data || []));
  if ((data || []).length < pageSize) break;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

async function fetchInChunks(table: string, select: string, field: string, values: string[], chunkSize = 200) {
  const list: any[] = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const { data, error } = await db.from(table).select(select).in(field, chunk);
    if (error) throw new Error(`Falha ao consultar ${table}: ${error.message}`);
    list.push(...(data || []));
  }
  return list;
}

const emailIds = unique<string>(rows.map((r: any) => String(r.processed_email_id || '')).filter(Boolean));
const emails = await fetchInChunks('processed_emails',
  'id,status,process_id,matched_process_number,subject,received_at,metadata,updated_at', 'id', emailIds);
const emailById = new Map(emails.map((e: any) => [e.id, e]));

const evidenceRows = await fetchInChunks('process_evidence',
  'processed_email_id,process_id,field_name,extracted_value,source_type,extraction_method', 'processed_email_id', emailIds);
const timelineRows = await fetchInChunks('process_timeline',
  'email_id,process_id,origem,tipo', 'email_id', emailIds);
const evidenceByEmail = new Map<string, any[]>();
const timelineByEmail = new Map<string, any[]>();
for (const row of evidenceRows) {
  const l = evidenceByEmail.get(row.processed_email_id) || [];
  l.push(row); evidenceByEmail.set(row.processed_email_id, l);
}
for (const row of timelineRows) {
  const l = timelineByEmail.get(row.email_id) || [];
  l.push(row); timelineByEmail.set(row.email_id, l);
}

const prepared = rows.map((row: any) => {
  const email: any = emailById.get(row.processed_email_id);
  const blocks = Array.isArray(email?.metadata?.ai_evidence_blocks) ? email.metadata.ai_evidence_blocks : [];
  const summaryNumbers = Array.isArray(email?.metadata?.legal_summary?.process_numbers) ? email.metadata.legal_summary.process_numbers : [];
  const analysis = summarizeDocumentIdentification([
    { source: 'Assunto', kind: 'SUBJECT', text: email?.subject || '' },
    ...blocks,
    { source: 'Resumo salvo — origem não individualizada', kind: 'SUMMARY', text: summaryNumbers.join('\n') },
  ]);
  const a1Selection = selectDeterministicSingleCnj(analysis);
  const a2Separation = hasUnambiguousDocumentSeparation(analysis);
  return { row, email, analysis, a1Selection, a2Separation };
});

const allCandidateCnjs = unique<string>(prepared.flatMap(p => [
  ...p.analysis.validCnjs,
  ...(p.a1Selection.cnj ? [p.a1Selection.cnj] : []),
  ...p.a2Separation.docCnjs,
]));

const processRows = await fetchInChunks('processes', 'id,numero_processo', 'numero_processo', allCandidateCnjs);
const processesByCnj = new Map<string, any[]>();
for (const pr of processRows) {
  const l = processesByCnj.get(pr.numero_processo) || [];
  l.push(pr);
  processesByCnj.set(pr.numero_processo, l);
}

// Let's check how many fit each raw criterion
let rawA1 = 0;
let rawA2 = 0;
let rawD2 = 0; // invalid CNJs
let rawD3 = 0; // < 1 valid CNJ
let rawE = 0; // body/text only (no attachment, no subject has valid cnj)
let rawC2 = 0; // multi CNJ in same attachment
let rawC3 = 0; // conflicting link/evidence
let rawD1 = 0; // at least 1 valid CNJ not in processes
let rawAllCnjsInProcesses = 0;

for (const p of prepared) {
  if (p.analysis.invalidCnjs.length > 0) rawD2++;
  if (p.analysis.validCnjs.length === 0) rawD3++;

  const hasSubjectCnj = p.analysis.documents.some((d: any) => String(d.kind).toUpperCase() === 'SUBJECT' && (d.validCnjs || []).length > 0);
  const hasAttachmentCnj = p.analysis.documents.some((d: any) => String(d.kind).toUpperCase() === 'ATTACHMENT' && (d.validCnjs || []).length > 0);
  if (!hasSubjectCnj && !hasAttachmentCnj) rawE++;

  const multiInAtt = p.analysis.documents.some((d: any) => String(d.kind).toUpperCase() === 'ATTACHMENT' && (d.validCnjs || []).length > 1);
  if (multiInAtt) rawC2++;

  const missingCnjs = p.analysis.validCnjs.filter(c => (processesByCnj.get(c) || []).length === 0);
  if (missingCnjs.length > 0) rawD1++;
  else rawAllCnjsInProcesses++;

  // C3 check: conflicting existing link / evidence / timeline
  const evList = evidenceByEmail.get(p.row.processed_email_id) || [];
  const tlList = timelineByEmail.get(p.row.processed_email_id) || [];
  const validProcessIds = new Set(p.analysis.validCnjs.flatMap(c => (processesByCnj.get(c) || []).map(pr => pr.id)));
  
  let hasC3Conflict = false;
  if (p.email?.process_id && !validProcessIds.has(p.email.process_id)) hasC3Conflict = true;
  if (evList.some((ev: any) => ev.process_id && !validProcessIds.has(ev.process_id))) hasC3Conflict = true;
  if (tlList.some((tl: any) => tl.process_id && !validProcessIds.has(tl.process_id))) hasC3Conflict = true;
  if (hasC3Conflict) rawC3++;
}

console.log({
  rawD2,
  rawD3,
  rawE,
  rawC2,
  rawC3,
  rawD1,
  rawAllCnjsInProcesses,
});
