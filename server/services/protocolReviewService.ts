import { extractExternalProtocols, filterExternalProtocols, isValidExternalProtocol } from './protocolExtractionService.ts';
import { summarizeDocumentIdentification } from './documentIdentificationService.ts';

export function falseProtocolFromReason(reason: unknown): string | null {
  const match = String(reason || '').match(/processos para o protocolo (\S+)\. Necessária revisão humana\./i);
  if (!match || isValidExternalProtocol(match[1])) return null;
  // Escopo do defeito confirmado, sem incluir protocolos desconhecidos de outras origens.
  return /^(?:essoN|edimento|edimentos|essual|essuais|edente)$/i.test(match[1]) ? match[1] : null;
}

export async function previewFalseProtocolReview(db: any) {
  const { data: exceptions, error } = await db.from('email_exceptions')
    .select('id,processed_email_id,reason,status')
    .eq('exception_type', 'PROTOCOLO_MULTIPLO_AMBIGUO').neq('status', 'RESOLVIDA')
    .order('id', { ascending: true }).limit(201);
  if (error) throw new Error(error.message);
  const rows = exceptions || [];
  const affected = rows.slice(0, 200).filter((row: any) => falseProtocolFromReason(row.reason));
  const batch = affected.slice(0, 10);
  const ids = [...new Set(batch.map((row: any) => row.processed_email_id).filter(Boolean))];
  const result = ids.length ? await db.from('processed_emails')
    .select('id,status,process_id,subject,metadata,updated_at').in('id', ids) : { data: [], error: null };
  if (result.error) throw new Error(result.error.message);
  const emails = new Map((result.data || []).map((email: any) => [email.id, email]));
  return {
    readOnly: true, limit: 10, affectedInScan: affected.length, scanTruncated: rows.length > 200,
    warning: 'Prévia baseada em dados e trechos salvos, não em todos os documentos originais. Nenhuma exceção foi encerrada e nenhum vínculo foi alterado.',
    cases: batch.map((row: any) => {
      const email: any = emails.get(row.processed_email_id);
      const blocks = Array.isArray(email?.metadata?.ai_evidence_blocks) ? email.metadata.ai_evidence_blocks : [];
      const text = [email?.subject || '', ...blocks.map((block: any) => String(block?.text || ''))].join('\n');
      return {
        exceptionId: row.id, emailId: row.processed_email_id,
        falseProtocol: falseProtocolFromReason(row.reason),
        emailStatus: email?.status || null, processId: email?.process_id || null,
        updatedAt: email?.updated_at || null,
        protocolsInSavedSummary: filterExternalProtocols(email?.metadata?.legal_summary?.protocols),
        protocolsInAvailableText: [...new Set(extractExternalProtocols(text).map(item => item.value))],
        documentIdentification: summarizeDocumentIdentification([{ source: 'Assunto', kind: 'SUBJECT', text: email?.subject || '' }, ...blocks,
          { source: 'Resumo salvo — origem não individualizada', kind: 'SUMMARY', text: (Array.isArray(email?.metadata?.legal_summary?.process_numbers) ? email.metadata.legal_summary.process_numbers : []).join('\n') }]),
        reviewState: !email ? 'EMAIL_NAO_ENCONTRADO' : email.process_id ? 'PRESERVAR_VINCULO_EXISTENTE' : 'REVISAR_FONTES_ANTES_DE_REPROCESSAR',
      };
    }),
  };
}
