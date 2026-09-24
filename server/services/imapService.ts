import { ENV } from '../config/env';
import { getActiveEmailConfig, recordEmailConnectionResult } from './emailAccountConfigService';
import crypto from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { getBackendSupabase } from '../integrations/supabase';
import { interpretEmailContent } from './legalInterpretationService';
import { extractAttachmentsTransient, releaseAttachmentExtraction } from './attachmentExtractionService';
import { applyInterpretationToProcess } from './processApplicationService';
import { interpretWithGemini, augmentDeterministicWithAiProcessNumber, type GeminiInterpretationOutcome } from './geminiLegalInterpreter';
import { applyAiInterpretation } from './aiProcessApplicationService';

interface SyncSummary {
  found: number;
  inserted: number;
  reprocessed: number;
  duplicates: number;
  errors: number;
  exception_count: number;
  processes_created: number;
  processes_linked: number;
  timeline_created: number;
  ai_interpreted: number;
  obligations_created: number;
  status: 'SUCCESS' | 'FAILED';
  finished_at: string;
}

type ImapLoginMethod = 'LOGIN' | 'AUTH=LOGIN' | 'AUTH=PLAIN' | 'AUTO';

async function baseImapConfig() {
  const cfg = await getActiveEmailConfig();

  console.log('[IMAP CONFIG] runtime efetivo', {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    mailbox: cfg.mailbox,
    userPresent: Boolean(cfg.email),
    userDomain: cfg.email.includes('@') ? cfg.email.split('@').pop() : null,
    passwordPresent: Boolean(cfg.password),
    credentialSource: cfg.source,
    configId: cfg.id,
  });

  return cfg;
}

function safeImapError(error: any) {
  return {
    message: error?.message || 'Falha IMAP',
    responseStatus: error?.responseStatus ?? null,
    responseText: error?.responseText ?? null,
    serverResponseCode: error?.serverResponseCode ?? null,
    authenticationFailed: Boolean(error?.authenticationFailed),
  };
}

async function connectWithMethod(method: ImapLoginMethod) {
  const cfg = await baseImapConfig();
  const auth: any = { user: cfg.email, pass: cfg.password };
  if (method !== 'AUTO') auth.loginMethod = method;

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth,
    logger: false,
  } as any);

  // Previne "Unhandled 'error' event" caso a conexão TLS/socket sofra ECONNRESET ou timeout
  client.on('error', (err: any) => {
    console.warn('[IMAP CLIENT ERROR]', err?.message || err);
  });

  try {
    await client.connect();
    return { client, cfg };
  } catch (error) {
    try { client.close(); } catch {}
    throw error;
  }
}

async function connectImap() {
  const methods: ImapLoginMethod[] = ['LOGIN', 'AUTH=LOGIN', 'AUTH=PLAIN', 'AUTO'];
  const attempts: Array<{ method: ImapLoginMethod; ok: boolean; diagnostic?: ReturnType<typeof safeImapError> }> = [];

  for (const method of methods) {
    try {
      const connection = await connectWithMethod(method);
      console.log('[IMAP AUTH] método aceito:', method);
      await recordEmailConnectionResult(connection.cfg.id, true);
      return { client: connection.client, config: connection.cfg, method, attempts: [...attempts, { method, ok: true }] };
    } catch (error: any) {
      const diagnostic = safeImapError(error);
      attempts.push({ method, ok: false, diagnostic });
      console.warn('[IMAP AUTH] tentativa recusada:', { method, ...diagnostic });
    }
  }

  const cfg = await getActiveEmailConfig().catch(() => null);
  await recordEmailConnectionResult(cfg?.id || null, false, attempts.map(a => `${a.method}: ${a.diagnostic?.message || 'falha'}`).join(' | '));
  const error: any = new Error('Nenhum método de autenticação IMAP foi aceito pelo servidor.');
  error.authAttempts = attempts;
  throw error;
}

function buildPersistedAiEvidence(interpretation: any) {
  const maxBlocks = ENV.ai.maxEvidenceBlocks;
  const maxChars = ENV.ai.maxEvidenceChars;
  let remaining = maxChars;
  const blocks: any[] = [];

  for (const block of (interpretation.rankedEvidence || []).slice(0, maxBlocks)) {
    if (remaining <= 0) break;
    const raw = String(block?.text || '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const text = raw.slice(0, remaining);
    remaining -= text.length;
    blocks.push({
      source: String(block?.source || '').slice(0, 160),
      kind: block?.kind || 'BODY',
      score: Number(block?.score || 0),
      text,
      reason: Array.isArray(block?.reason) ? block.reason.slice(0, 6) : [],
    });
  }

  return blocks;
}

function addressFromParsed(parsed: Awaited<ReturnType<typeof simpleParser>>) {
  const first = parsed.from?.value?.[0];
  return {
    name: first?.name || '',
    email: first?.address || '',
  };
}


function needsDeterministicReprocessing(row: any): boolean {
  if (!row) return true;
  const previousParserVersion = row?.metadata?.parser_version || null;
  return !row.analyzed_at
    || !row.classification
    || row.relevance_score === null
    || row.ai_need_score === null
    || previousParserVersion !== ENV.app.pipelineVersion;
}

/**
 * Seleciona primeiro e-mails realmente novos/incompletos, em ordem do mais novo
 * para o mais antigo. Evita o antigo problema em que cada sincronização relia
 * sempre os mesmos UIDs mais recentes e nunca avançava pelo backlog.
 */
async function selectCandidateUids(
  supabase: any,
  mailboxName: string,
  uids: number[],
  maxMessages: number,
): Promise<number[]> {
  const ordered = [...uids].map(Number).filter(Number.isFinite).sort((a, b) => b - a);
  if (!ordered.length) return [];

  const existingByUid = new Map<number, any>();
  const chunkSize = 400;

  for (let offset = 0; offset < ordered.length; offset += chunkSize) {
    const chunk = ordered.slice(offset, offset + chunkSize);
    const { data, error } = await supabase
      .from('processed_emails')
      .select('imap_uid, analyzed_at, classification, relevance_score, ai_need_score, metadata')
      .eq('mailbox', mailboxName)
      .in('imap_uid', chunk);

    if (error) {
      console.warn('[IMAP SYNC] pré-filtro por UID indisponível; usando seleção conservadora', {
        message: error.message,
        code: error.code,
      });
      return ordered.slice(0, maxMessages);
    }

    for (const row of data || []) {
      const uid = Number(row.imap_uid);
      if (Number.isFinite(uid)) existingByUid.set(uid, row);
    }
  }

  const selected: number[] = [];
  for (const uid of ordered) {
    const existing = existingByUid.get(uid);
    if (!existing || needsDeterministicReprocessing(existing)) selected.push(uid);
    if (selected.length >= maxMessages) break;
  }
  return selected;
}

export class ImapService {
  async testConnection() {
    const activeConfig = await getActiveEmailConfig();
    const mailboxName = activeConfig.mailbox;
    let client: ImapFlow | null = null;

    try {
      const connection = await connectImap();
      client = connection.client;
      const mailbox = await client.mailboxOpen(mailboxName, { readOnly: true });
      return {
        ok: true,
        mailbox: mailbox.path,
        exists: mailbox.exists,
        readOnly: true,
        loginMethod: connection.method,
        attempts: connection.attempts,
      };
    } catch (error: any) {
      console.error('[IMAP TEST] falha na conexão:', {
        message: error?.message,
        response: error?.response,
        responseStatus: error?.responseStatus,
        responseText: error?.responseText,
        serverResponseCode: error?.serverResponseCode,
        authenticationFailed: error?.authenticationFailed,
        authAttempts: error?.authAttempts ?? null,
      });
      throw error;
    } finally {
      if (client) {
        try { await (client as any).logout().catch(() => undefined); } catch {}
        try { (client as any).close(); } catch {}
      }
    }
  }

  async syncEmails(adminUserId: string | null = null): Promise<SyncSummary> {
    const supabase = getBackendSupabase();
    if (!supabase) throw new Error('Supabase backend não configurado');

    const activeConfig = await getActiveEmailConfig();
    const mailboxName = activeConfig.mailbox;
    const days = activeConfig.syncSinceDays;
    const maxMessages = activeConfig.syncBatchSize;

    const { data: run, error: runError } = await supabase
      .from('email_processing_runs')
      .insert({
        mailbox: mailboxName,
        status: 'RUNNING',
        started_at: new Date().toISOString(),
        metadata: {
          triggered_by: adminUserId,
          sync_mode: 'legacy_imapflow_reference',
          max_per_run: maxMessages,
          since_days: days,
        },
      })
      .select('id')
      .single();

    if (runError || !run) {
      throw new Error(`Não foi possível iniciar o registro da sincronização: ${runError?.message || 'sem retorno'}`);
    }

    const runId = run.id;
    let client: ImapFlow | null = null;
    let scanned = 0;
    let inserted = 0;
    let reprocessed = 0;
    let duplicates = 0;
    let exceptionsCount = 0;
    let processesCreated = 0;
    let processesLinked = 0;
    let timelineCreated = 0;
    let aiInterpreted = 0;
    let obligationsCreated = 0;
    // Fase 6A: ingestão nunca espera Gemini. IA é responsabilidade de worker independente.
    const autoAiEnabled = false;
    let aiPausedForRun = false;
    const failures: Array<{ uid: number; error: string }> = [];

    try {
      const connection = await connectImap();
      client = connection.client;

      // Mesmo comportamento do app antigo: mailbox aberta em modo somente leitura.
      // Assim, a leitura do source não deve persistir alteração de \\Seen.
      await client.mailboxOpen(mailboxName, { readOnly: true });

      const since = new Date();
      since.setDate(since.getDate() - days);

      // Busca a janela e seleciona apenas mensagens novas/incompletas. Isso permite
      // avançar o backlog mais novo -> mais antigo sem reler eternamente o topo da caixa.
      const uids = (await client.search({ since }, { uid: true }) || []).map(Number);
      const foundTotal = uids.length;
      const selected = await selectCandidateUids(supabase, mailboxName, uids, maxMessages);
      scanned = selected.length;

      console.log('[IMAP SYNC] seleção', {
        foundInWindow: foundTotal,
        selectedForProcessing: selected.length,
        maxPerRun: maxMessages,
        order: 'NEWEST_FIRST',
      });

      for (const uid of selected) {
        let msg: any = null;
        let parsed: Awaited<ReturnType<typeof simpleParser>> | null = null;
        let attachmentExtraction: Awaited<ReturnType<typeof extractAttachmentsTransient>> | null = null;
        try {
          msg = await client.fetchOne(uid, { source: true }, { uid: true }) as any;
          if (!msg?.source) continue;

          const rawHash = crypto.createHash('sha256').update(msg.source).digest('hex');
          parsed = await simpleParser(msg.source);
          const messageId = parsed.messageId?.trim() || `sha256:${rawHash}`;

          const { data: existing, error: existingError } = await supabase
            .from('processed_emails')
            .select('id, status, analyzed_at, classification, relevance_score, ai_need_score, ai_model, ai_confidence, metadata, created_at, imap_uid, mailbox')
            .eq('message_id', messageId)
            .maybeSingle();

          if (existingError) {
            throw new Error(`Falha na deduplicação: ${existingError.message}`);
          }

          const currentParserVersion = ENV.app.pipelineVersion;
          const previousParserVersion = (existing as any)?.metadata?.parser_version || null;
          const needsPipelineUpgrade = Boolean(existing && previousParserVersion !== currentParserVersion);

          const isPending = !existing ||
            !existing.analyzed_at ||
            !existing.classification ||
            existing.relevance_score === null ||
            existing.ai_need_score === null ||
            needsPipelineUpgrade;

          if (existing && !isPending) {
            duplicates += 1;
            continue;
          }

          const sender = addressFromParsed(parsed);
          const receivedAt = parsed.date instanceof Date
            ? parsed.date.toISOString()
            : new Date().toISOString();

          // Extrair conteúdo jurídico dos anexos de forma estritamente transitória.
          // PDF textual usa parser; PNG/JPG/JPEG/BMP usam OCR seletivo.
          attachmentExtraction = await extractAttachmentsTransient(parsed.attachments || []);

          // Executar a esteira de interpretação jurídica com assunto, corpo e anexos já extraídos.
          const interpretation = await interpretEmailContent({
            subject: parsed.subject || '',
            textBody: parsed.text || '',
            htmlBody: parsed.html ? String(parsed.html) : undefined,
            senderEmail: sender.email,
            senderName: sender.name,
            attachmentsCount: parsed.attachments?.length || 0,
            attachments: attachmentExtraction.results,
            supabaseClient: supabase,
          });

          if (interpretation.exceptionType) {
            exceptionsCount += 1;
          }

          // A IA só recebe os blocos já selecionados/rankeados pelo motor determinístico.
          // Corpo completo, HTML e anexos brutos não são enviados nem persistidos.
          let aiOutcome: GeminiInterpretationOutcome | null = null;
          if (interpretation.status === 'PENDENTE_IA' && autoAiEnabled && !aiPausedForRun) {
            aiOutcome = await interpretWithGemini({
              supabase,
              deterministic: interpretation,
              subject: parsed.subject || '',
              senderEmail: sender.email,
              senderName: sender.name,
            });

            if (aiOutcome.state === 'PAUSED_429') {
              aiPausedForRun = true;
            }

            if (aiOutcome.state === 'SUCCESS' && aiOutcome.result) {
              aiInterpreted += 1;
              augmentDeterministicWithAiProcessNumber(interpretation, aiOutcome.result);

              if (!aiOutcome.result.isLegal && aiOutcome.result.confidence >= 0.90) {
                interpretation.status = 'IRRELEVANTE';
              } else if (aiOutcome.result.confidence < 0.65) {
                interpretation.status = 'EXCECAO';
                interpretation.exceptionType = interpretation.exceptionType || 'IA_BAIXA_CONFIANCA';
                interpretation.exceptionReason = interpretation.exceptionReason || 'A interpretação semântica não atingiu confiança mínima para aplicação automática.';
                exceptionsCount += 1;
              } else {
                interpretation.status = 'PROCESSADO';
              }
            }
          }

          const semanticSummary = aiOutcome?.result ? {
            event_type: aiOutcome.result.eventType,
            process_number: aiOutcome.result.processNumber,
            parties: aiOutcome.result.parties.slice(0, 8),
            nature: aiOutcome.result.nature,
            phase: aiOutcome.result.phase,
            tutela: aiOutcome.result.tutela,
            municipality: aiOutcome.result.municipality,
            comarca: aiOutcome.result.comarca,
            uf: aiOutcome.result.uf,
            demand_type: aiOutcome.result.demandType,
            demand_subtype: aiOutcome.result.demandSubtype,
            demand_object: aiOutcome.result.demandObject,
            priority: aiOutcome.result.priority,
            suggested_status: aiOutcome.result.suggestedStatus,
            money_findings: aiOutcome.result.moneyFindings.slice(0, 8),
            deadline: aiOutcome.result.deadline,
            obligation: aiOutcome.result.obligation,
            action_summary: aiOutcome.result.actionSummary,
            confidence: aiOutcome.result.confidence,
            warnings: aiOutcome.result.warnings.slice(0, 8),
          } : null;

          let emailId: string | null = null;

          if (!existing) {
            const { data: insertedEmail, error: insertError } = await supabase
              .from('processed_emails')
              .insert({
                mailbox: mailboxName,
                imap_uid: uid,
                message_id: messageId,
                sender_name: sender.name,
                sender_email: sender.email,
                subject: parsed.subject || '',
                received_at: receivedAt,
                attachment_count: parsed.attachments?.length || 0,
                status: interpretation.status,
                classification: interpretation.classification,
                relevance_score: interpretation.relevanceScore,
                ai_need_score: interpretation.aiNeedScore,
                ai_model: aiOutcome?.state === 'SUCCESS' ? aiOutcome.model : null,
                ai_confidence: aiOutcome?.result?.confidence ?? null,
                process_id: interpretation.processId,
                matched_process_number: interpretation.matchedProcessNumber,
                analyzed_at: new Date().toISOString(),
                thread_key: typeof parsed.inReplyTo === 'string' ? parsed.inReplyTo : null,
                metadata: {
                  ingest_mode: 'legal_interpretation_pipeline',
                  lifecycle: {
                    received_at: receivedAt,
                    system_read_at: new Date().toISOString(),
                    processed_at: interpretation.status === 'PENDENTE_IA' ? null : new Date().toISOString(),
                    ai_analyzed_at: aiOutcome?.state === 'SUCCESS' ? new Date().toISOString() : null,
                  },
                  source_sha256: rawHash,
                  keywords_found: interpretation.extractedData.keywordsFound,
                  extraction_summary: attachmentExtraction.summary,
                  evidence_stats: interpretation.evidenceStats,
                  ai_evidence_blocks: buildPersistedAiEvidence(interpretation),
                  process_routing: interpretation.processRouting || null,
                  ai_state: aiOutcome?.state || (interpretation.status === 'PENDENTE_IA' && !autoAiEnabled ? 'QUEUED_FOR_AI' : 'NOT_REQUIRED'),
                  ai_model: aiOutcome?.model || null,
                  semantic_interpretation: semanticSummary,
                  legal_summary: {
                    process_numbers: interpretation.extractedData.cnjs.slice(0, 5),
                    protocols: interpretation.extractedData.protocols.slice(0, 5),
                    cnpjs: interpretation.extractedData.cnpjs.slice(0, 8),
                    party_names: interpretation.extractedData.partyNames.slice(0, 8),
                    monetary_values: interpretation.extractedData.monetaryValues.slice(0, 8),
                    dates: interpretation.extractedData.dates.slice(0, 8),
                    court_mentions: interpretation.extractedData.courtMentions.slice(0, 5),
                    keywords: interpretation.extractedData.keywordsFound.slice(0, 12),
                    attachment_signals: interpretation.extractedData.attachmentSignals.slice(0, 10),
                  },
                  parser_version: ENV.app.pipelineVersion,
                },
              })
              .select('id')
              .single();

            if (insertError) {
              if (insertError.code === '23505') {
                duplicates += 1;
                continue;
              }
              throw new Error(`Falha ao inserir e-mail: ${insertError.message}`);
            }

            emailId = insertedEmail?.id || null;
            inserted += 1;
          } else {
            emailId = existing.id;
            const { error: updateError } = await supabase
              .from('processed_emails')
              .update({
                mailbox: mailboxName,
                imap_uid: uid,
                sender_name: sender.name,
                sender_email: sender.email,
                subject: parsed.subject || '',
                received_at: receivedAt,
                attachment_count: parsed.attachments?.length || 0,
                status: interpretation.status,
                classification: interpretation.classification,
                relevance_score: interpretation.relevanceScore,
                ai_need_score: interpretation.aiNeedScore,
                ai_model: aiOutcome?.state === 'SUCCESS' ? aiOutcome.model : null,
                ai_confidence: aiOutcome?.result?.confidence ?? null,
                process_id: interpretation.processId,
                matched_process_number: interpretation.matchedProcessNumber,
                analyzed_at: new Date().toISOString(),
                thread_key: typeof parsed.inReplyTo === 'string' ? parsed.inReplyTo : null,
                metadata: {
                  ...(existing?.metadata || {}),
                  ingest_mode: 'legal_interpretation_pipeline',
                  lifecycle: {
                    ...(existing?.metadata?.lifecycle || {}),
                    received_at: receivedAt,
                    system_read_at: existing?.metadata?.lifecycle?.system_read_at || existing?.created_at || new Date().toISOString(),
                    processed_at: interpretation.status === 'PENDENTE_IA' ? null : new Date().toISOString(),
                    ai_analyzed_at: aiOutcome?.state === 'SUCCESS' ? new Date().toISOString() : existing?.metadata?.lifecycle?.ai_analyzed_at || null,
                  },
                  source_sha256: rawHash,
                  keywords_found: interpretation.extractedData.keywordsFound,
                  extraction_summary: attachmentExtraction.summary,
                  evidence_stats: interpretation.evidenceStats,
                  ai_evidence_blocks: buildPersistedAiEvidence(interpretation),
                  process_routing: interpretation.processRouting || null,
                  ai_state: aiOutcome?.state || (interpretation.status === 'PENDENTE_IA' && !autoAiEnabled ? 'QUEUED_FOR_AI' : 'NOT_REQUIRED'),
                  ai_model: aiOutcome?.model || null,
                  semantic_interpretation: semanticSummary,
                  legal_summary: {
                    process_numbers: interpretation.extractedData.cnjs.slice(0, 5),
                    protocols: interpretation.extractedData.protocols.slice(0, 5),
                    cnpjs: interpretation.extractedData.cnpjs.slice(0, 8),
                    party_names: interpretation.extractedData.partyNames.slice(0, 8),
                    monetary_values: interpretation.extractedData.monetaryValues.slice(0, 8),
                    dates: interpretation.extractedData.dates.slice(0, 8),
                    court_mentions: interpretation.extractedData.courtMentions.slice(0, 5),
                    keywords: interpretation.extractedData.keywordsFound.slice(0, 12),
                    attachment_signals: interpretation.extractedData.attachmentSignals.slice(0, 10),
                  },
                  parser_version: ENV.app.pipelineVersion,
                },
              })
              .eq('id', emailId);

            if (updateError) {
              throw new Error(`Falha ao atualizar e-mail pendente: ${updateError.message}`);
            }
            reprocessed += 1;
          }

          // Aplicar a interpretação determinística à Gestão de Processos.
          // Só cria processo novo quando há CNJ válido + relevância suficiente.
          // Valores e datas extraídos permanecem como evidência; não viram valor_causa/prazo automaticamente.
          let finalProcessId = interpretation.processId;
          let finalMatchedProcessNumber = interpretation.matchedProcessNumber;
          let processApplicationExceptionType: string | null = null;
          let processApplicationExceptionReason: string | null = null;
          let processApplicationAction: string | null = null;
          let processApplicationResult: any = null;

          if (emailId) {
            const processApplication = await applyInterpretationToProcess({
              supabase,
              interpretation,
              emailId,
              subject: parsed.subject || '',
              receivedAt,
              actorId: adminUserId,
            });

            processApplicationResult = processApplication;
            finalProcessId = processApplication.processId;
            finalMatchedProcessNumber = processApplication.action === 'DISTRIBUTED'
              ? null
              : processApplication.matchedProcessNumber;
            processApplicationExceptionType = processApplication.exceptionType;
            processApplicationExceptionReason = processApplication.exceptionReason;
            processApplicationAction = processApplication.action;

            if (processApplication.processCreated) processesCreated += 1;
            if (processApplication.action === 'DISTRIBUTED') {
              processesLinked += Array.isArray(processApplication.processIds) ? processApplication.processIds.length : 0;
            } else if (processApplication.processId) {
              processesLinked += 1;
            }
            if (processApplication.timelineCreated) timelineCreated += 1;

            if (finalProcessId !== interpretation.processId || finalMatchedProcessNumber !== interpretation.matchedProcessNumber || processApplicationExceptionType) {
              const { error: linkError } = await supabase
                .from('processed_emails')
                .update({
                  process_id: finalProcessId,
                  matched_process_number: finalMatchedProcessNumber,
                  ...(processApplicationExceptionType ? { status: 'EXCECAO' } : {}),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', emailId);

              if (linkError) throw new Error(`Falha ao vincular e-mail ao processo: ${linkError.message}`);
            }
          }

          if (emailId && finalProcessId && processApplicationResult?.action !== 'DISTRIBUTED' && aiOutcome?.state === 'SUCCESS' && aiOutcome.result) {
            const aiApplication = await applyAiInterpretation({
              supabase,
              processId: finalProcessId,
              emailId,
              actorId: adminUserId,
              receivedAt,
              ai: aiOutcome.result,
              executionMode: 'AUTOMATIC',
              reanalysis: false,
            });
            if (aiApplication.timelineCreated) timelineCreated += 1;
            if (aiApplication.obligationCreated) obligationsCreated += 1;
          }

          if (emailId) {
            const applicationAction = processApplicationAction
              || (interpretation.status === 'PENDENTE_IA'
                ? 'AWAITING_AI'
                : interpretation.status === 'EXCECAO'
                  ? 'REVIEW_REQUIRED'
                  : interpretation.status === 'IRRELEVANTE'
                    ? 'DISCARDED_AS_IRRELEVANT'
                    : 'INTERPRETED_NO_PROCESS_ACTION');

            const { error: operationalMetadataError } = await supabase
              .from('processed_emails')
              .update({
                metadata: {
                  ...(existing?.metadata || {}),
                  ingest_mode: 'legal_interpretation_pipeline',
                  lifecycle: {
                    ...(existing?.metadata?.lifecycle || {}),
                    received_at: receivedAt,
                    system_read_at: existing?.metadata?.lifecycle?.system_read_at || existing?.created_at || new Date().toISOString(),
                    processed_at: interpretation.status === 'PENDENTE_IA' ? null : new Date().toISOString(),
                    ai_analyzed_at: aiOutcome?.state === 'SUCCESS' ? new Date().toISOString() : existing?.metadata?.lifecycle?.ai_analyzed_at || null,
                  },
                  source_sha256: rawHash,
                  keywords_found: interpretation.extractedData.keywordsFound,
                  extraction_summary: attachmentExtraction.summary,
                  evidence_stats: interpretation.evidenceStats,
                  ai_evidence_blocks: buildPersistedAiEvidence(interpretation),
                  process_routing: interpretation.processRouting || null,
                  ai_state: aiOutcome?.state || (interpretation.status === 'PENDENTE_IA' && !autoAiEnabled ? 'QUEUED_FOR_AI' : 'NOT_REQUIRED'),
                  ai_model: aiOutcome?.model || null,
                  semantic_interpretation: semanticSummary,
                  legal_summary: {
                    process_numbers: interpretation.extractedData.cnjs.slice(0, 5),
                    protocols: interpretation.extractedData.protocols.slice(0, 5),
                    cnpjs: interpretation.extractedData.cnpjs.slice(0, 8),
                    party_names: interpretation.extractedData.partyNames.slice(0, 8),
                    monetary_values: interpretation.extractedData.monetaryValues.slice(0, 8),
                    dates: interpretation.extractedData.dates.slice(0, 8),
                    court_mentions: interpretation.extractedData.courtMentions.slice(0, 5),
                    keywords: interpretation.extractedData.keywordsFound.slice(0, 12),
                    attachment_signals: interpretation.extractedData.attachmentSignals.slice(0, 10),
                  },
                  ...(processApplicationResult?.processDistribution
                    ? { process_distribution: processApplicationResult.processDistribution }
                    : (existing?.metadata?.process_distribution ? { process_distribution: existing.metadata.process_distribution } : {})),
                  process_application: {
                    action: applicationAction,
                    mode: processApplicationResult?.routingMode || interpretation.processRouting?.mode || null,
                    rule: processApplicationResult?.routingRule || interpretation.processRouting?.rule || null,
                    process_id: finalProcessId,
                    process_number: finalMatchedProcessNumber,
                    process_ids: processApplicationResult?.processIds || (finalProcessId ? [finalProcessId] : []),
                    process_numbers: processApplicationResult?.processNumbers || (finalMatchedProcessNumber ? [finalMatchedProcessNumber] : []),
                    ignored_auxiliary_cnjs: processApplicationResult?.auxiliaryCnjs || interpretation.processRouting?.auxiliaryCnjs || [],
                    has_exception: Boolean(processApplicationExceptionType || interpretation.exceptionType),
                  },
                  parser_version: ENV.app.pipelineVersion,
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', emailId);

            if (operationalMetadataError) {
              throw new Error(`Falha ao atualizar resumo operacional da interpretação: ${operationalMetadataError.message}`);
            }
          }

          if (emailId && finalProcessId && interpretation.evidences.length > 0) {
            // Rastreabilidade append-safe: não depende de DELETE. Evita duplicar exatamente
            // a mesma evidência em reprocessamentos sucessivos.
            const { data: currentEvidence } = await supabase
              .from('process_evidence')
              .select('field_name, extracted_value, source_type')
              .eq('processed_email_id', emailId);

            const existingKeys = new Set((currentEvidence || []).map((item: any) =>
              `${item.field_name}|${String(item.extracted_value)}|${item.source_type}`
            ));

            const evidenceRows = interpretation.evidences
              .map((ev) => ({ ...ev, persistedSourceType: ev.source_type === 'ATTACHMENT' ? 'DOCUMENT' : 'EMAIL' }))
              .filter((ev) => !existingKeys.has(`${ev.field_name}|${String(ev.extracted_value)}|${ev.persistedSourceType}`))
              .map((ev) => ({
                process_id: finalProcessId,
                processed_email_id: emailId,
                field_name: ev.field_name,
                extracted_value: ev.extracted_value,
                source_type: ev.persistedSourceType,
                extraction_method: ev.extraction_method,
                confidence: ev.confidence,
                evidence_excerpt: ev.evidence_excerpt,
              }));

            if (evidenceRows.length > 0) {
              const { error: evidenceError } = await supabase.from('process_evidence').insert(evidenceRows);
              if (evidenceError) throw new Error(`Falha ao registrar evidências: ${evidenceError.message}`);
            }
          }

          if (emailId && finalProcessId && aiOutcome?.state === 'SUCCESS' && aiOutcome.result) {
            const aiEvidenceRows: any[] = [];
            const pushAiEvidence = (field: string, value: unknown, confidence = aiOutcome!.result!.confidence) => {
              if (value == null || value === '' || confidence < 0.70) return;
              aiEvidenceRows.push({
                process_id: finalProcessId,
                processed_email_id: emailId,
                field_name: field,
                extracted_value: value,
                source_type: 'EMAIL',
                extraction_method: 'GEMINI',
                confidence,
                evidence_excerpt: `Interpretação semântica baseada em ${interpretation.rankedEvidence.length} bloco(s) de evidência selecionada(s).`,
              });
            };
            pushAiEvidence('evento_juridico', aiOutcome.result.eventType);
            pushAiEvidence('fase_processual_ia', aiOutcome.result.phase);
            pushAiEvidence('tutela_ia', aiOutcome.result.tutela);
            pushAiEvidence('tipo_demanda_ia', aiOutcome.result.demandType);
            pushAiEvidence('subtipo_demanda_ia', aiOutcome.result.demandSubtype);
            pushAiEvidence('objeto_demanda_ia', aiOutcome.result.demandObject);
            for (const money of aiOutcome.result.moneyFindings.slice(0, 8)) pushAiEvidence(`valor_${money.type.toLowerCase()}`, money.amount, money.confidence);
            if (aiOutcome.result.deadline.exists) pushAiEvidence('prazo_interpretado', aiOutcome.result.deadline.dueDate || aiOutcome.result.deadline.termText, aiOutcome.result.deadline.confidence);
            if (aiOutcome.result.obligation.exists) pushAiEvidence('obrigacao_interpretada', aiOutcome.result.obligation.description, aiOutcome.result.obligation.confidence);

            if (aiEvidenceRows.length) {
              const { data: existingAiEvidence } = await supabase
                .from('process_evidence')
                .select('field_name, extracted_value')
                .eq('processed_email_id', emailId)
                .eq('extraction_method', 'GEMINI');
              const existingAiKeys = new Set((existingAiEvidence || []).map((row: any) => `${row.field_name}|${String(row.extracted_value)}`));
              const newRows = aiEvidenceRows.filter((row) => !existingAiKeys.has(`${row.field_name}|${String(row.extracted_value)}`));
              if (newRows.length) {
                const { error: aiEvidenceError } = await supabase.from('process_evidence').insert(newRows);
                if (aiEvidenceError) throw new Error(`Falha ao registrar evidências semânticas da IA: ${aiEvidenceError.message}`);
              }
            }
          }

          const finalExceptionType = interpretation.exceptionType || processApplicationExceptionType;
          const finalExceptionReason = interpretation.exceptionReason || processApplicationExceptionReason;

          if (emailId && finalExceptionType) {
            exceptionsCount += interpretation.exceptionType ? 0 : 1;
            const { data: existingException } = await supabase
              .from('email_exceptions')
              .select('id')
              .eq('processed_email_id', emailId)
              .eq('exception_type', finalExceptionType)
              .neq('status', 'RESOLVIDA')
              .limit(1)
              .maybeSingle();

            if (!existingException) {
              const { error: exceptionError } = await supabase.from('email_exceptions').insert({
                processed_email_id: emailId,
                exception_type: finalExceptionType,
                reason: finalExceptionReason || 'Necessária revisão humana.',
                status: 'ABERTA',
                sanitized_payload: {
                  cnjs: interpretation.extractedData.cnjs,
                  protocols: interpretation.extractedData.protocols,
                },
              });
              if (exceptionError) throw new Error(`Falha ao registrar exceção: ${exceptionError.message}`);
            }
          }

        } catch (error: any) {
          const errMsg = error instanceof Error ? error.message : String(error || 'Falha desconhecida');
          failures.push({
            uid: Number(uid),
            error: errMsg,
          });
          if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|Connection closed|Socket closed/i.test(errMsg)) {
            console.warn('[IMAP SYNC] Conexão interrompida durante o ciclo de leitura:', errMsg);
            break;
          }
        } finally {
          // Dados de corpo/anexo existem apenas em memória durante a iteração.
          // A limpeza ocorre inclusive quando alguma etapa lança erro.
          if (attachmentExtraction) releaseAttachmentExtraction(attachmentExtraction.results);
          if (parsed?.attachments) {
            for (const attachment of parsed.attachments) {
              try { (attachment as any).content = Buffer.alloc(0); } catch {}
            }
          }
          if (msg) (msg as any).source = null;
          if (parsed) {
            (parsed as any).text = null;
            (parsed as any).html = null;
            (parsed as any).attachments = null;
          }
        }
      }

      const finishedAt = new Date().toISOString();
      const summary: SyncSummary = {
        found: uids.length,
        inserted,
        reprocessed,
        duplicates,
        errors: failures.length,
        exception_count: exceptionsCount,
        processes_created: processesCreated,
        processes_linked: processesLinked,
        timeline_created: timelineCreated,
        ai_interpreted: aiInterpreted,
        obligations_created: obligationsCreated,
        status: 'SUCCESS',
        finished_at: finishedAt,
      };

      const { error: finishError } = await supabase
        .from('email_processing_runs')
        .update({
          fetched_count: scanned,
          duplicate_count: duplicates,
          candidate_count: inserted,
          exception_count: exceptionsCount,
          error_count: failures.length,
          status: 'SUCCESS',
          finished_at: finishedAt,
          metadata: {
            triggered_by: adminUserId,
            sync_mode: 'legal_interpretation_pipeline_reprocess',
            max_per_run: maxMessages,
            since_days: days,
            read_only: true,
            login_method: connection.method,
            found: uids.length,
            inserted,
            reprocessed,
            duplicates,
            processes_created: processesCreated,
            processes_linked: processesLinked,
            timeline_created: timelineCreated,
            ai_interpreted: aiInterpreted,
            obligations_created: obligationsCreated,
            errors: failures.length,
            failures: failures.slice(0, 20),
          },
        })
        .eq('id', runId);

      if (finishError) {
        throw new Error(`Falha ao finalizar registro da sincronização: ${finishError.message}`);
      }

      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha na sincronização IMAP.';

      console.error('[IMAP] falha na sincronização pelo fluxo legado de referência:', error);

      await supabase
        .from('email_processing_runs')
        .update({
          status: 'FAILED',
          finished_at: new Date().toISOString(),
          fetched_count: scanned,
          duplicate_count: duplicates,
          candidate_count: inserted,
          error_count: failures.length + 1,
          metadata: {
            triggered_by: adminUserId,
            sync_mode: 'legacy_imapflow_reference',
            error: message,
            failures: failures.slice(0, 20),
          },
        })
        .eq('id', runId);

      throw new Error(message);
    } finally {
      if (client) {
        try { await (client as any).logout().catch(() => undefined); } catch {}
        try { (client as any).close(); } catch {}
      }
    }
  }
}

export const imapService = new ImapService();
