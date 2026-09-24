import { ENV } from '../config/env';
import { extractExternalProtocols } from './protocolExtractionService';
import { extractBankProcessRows } from './documentIdentificationService';
import type { AttachmentExtractionResult } from './attachmentExtractionService';
import { buildRankedEvidence, type RankedEvidenceBlock } from './evidenceRankingService';
import { decideFutureCnjRouting, type CnjRoutingDecision } from './cnjFutureRoutingService';

export interface ExtractedEvidence {
  field_name: string;
  extracted_value: string;
  source_type: 'EMAIL_SUBJECT' | 'EMAIL_BODY' | 'ATTACHMENT';
  extraction_method: 'REGEX' | 'PARSER' | 'OCR' | 'SYSTEM';
  confidence: number;
  evidence_excerpt: string;
}

export interface InterpretationResult {
  classification: 'NÃO JURÍDICO' | 'POSSÍVEL' | 'PROVÁVEL' | 'FORTE';
  relevanceScore: number;
  aiNeedScore: number;
  status: 'PROCESSADO' | 'PENDENTE_IA' | 'EXCECAO' | 'IRRELEVANTE';
  matchedProcessNumber: string | null;
  processId: string | null;
  exceptionType: string | null;
  exceptionReason: string | null;
  evidences: ExtractedEvidence[];
  rankedEvidence: RankedEvidenceBlock[];
  evidenceStats: ReturnType<typeof buildRankedEvidence>['stats'];
  processRouting?: CnjRoutingDecision | null;
  extractedData: {
    cnjs: string[];
    protocols: string[];
    cpfs: string[];
    cnpjs: string[];
    dates: string[];
    monetaryValues: string[];
    partyNames: string[];
    courtMentions: string[];
    keywordsFound: string[];
    attachmentSignals: string[];
  };
}

const FORMATTED_CNJ_REGEX = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;
const FLEX_FORMATTED_CNJ_CONTEXT_REGEX = /\b(?:processo|proc\.?|autos?|cnj)\s*(?:n[ºo°.]?\s*)?[:#-]?\s*(\d{6,7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/gi;
const RAW_CNJ_CONTEXT_REGEX = /\b(?:processo|proc\.?|autos?|cnj)\s*(?:n[ºo°.]?\s*)?[:#-]?\s*(\d{19,20})\b/gi;

function canonicalizeCnj(value: string, allowLeadingZeroRecovery = false): string | null {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 19 && allowLeadingZeroRecovery) digits = `0${digits}`;
  if (digits.length !== 20) return null;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

function extractCnjCandidates(text: string): Array<{ value: string; raw: string }> {
  const found: Array<{ value: string; raw: string }> = [];
  for (const raw of text.match(FORMATTED_CNJ_REGEX) || []) {
    const value = canonicalizeCnj(raw);
    if (value) found.push({ value, raw });
  }

  FLEX_FORMATTED_CNJ_CONTEXT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FLEX_FORMATTED_CNJ_CONTEXT_REGEX.exec(text)) !== null) {
    const raw = match[1] || '';
    const value = canonicalizeCnj(raw, true);
    if (value) found.push({ value, raw });
  }

  RAW_CNJ_CONTEXT_REGEX.lastIndex = 0;
  while ((match = RAW_CNJ_CONTEXT_REGEX.exec(text)) !== null) {
    const raw = match[1] || '';
    const value = canonicalizeCnj(raw, true);
    if (value) found.push({ value, raw });
  }
  return [...new Map(found.map((item) => [item.value, item])).values()];
}
const CPF_REGEX = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CNPJ_REGEX = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const DATE_REGEX = /\b(?:0?[1-9]|[12]\d|3[01])[\/.-](?:0?[1-9]|1[0-2])[\/.-](?:19|20)\d{2}\b/g;
const MONEY_REGEX = /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/gi;
const PARTY_REGEX = /\b(?:autor(?:a)?|requerente|benefici[aá]ri[oa]|paciente|r[eé]u|requerid[oa]|em\s+nome\s+de)\s*[:\-–]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'’.-]+){1,7})/g;
const COURT_REGEX = /\b(?:\d+ª?\s+vara[^\n,;]{0,80}|ju[ií]zo[^\n,;]{0,80}|comarca\s+de\s+[A-Za-zÀ-ÿ .'-]{2,80})/gi;

const LEGAL_KEYWORDS = [
  'intimação', 'intimado', 'intime-se', 'citação', 'citado', 'tutela', 'liminar',
  'decisão', 'sentença', 'acórdão', 'audiência', 'prazo', 'multa', 'astreinte',
  'obrigação de fazer', 'bloqueio judicial', 'cumprimento', 'recurso', 'apelação',
  'agravo', 'embargos', 'execução', 'mandado', 'defiro', 'indefiro', 'determino',
  'cumpra-se', 'vara', 'juízo', 'comarca'
];

const NEGATIVE_KEYWORDS = [
  'newsletter', 'informativo', 'comunicado geral', 'fatura aberta', 'boleto',
  'propaganda', 'oferta', 'reunião interna', 'agendamento de consulta',
  'agendamento de exame', 'agendamento de fisioterapia'
];

function normalize(value: string) {
  return value
    .replace(/\u0000/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function excerptAround(text: string, needle: string, radius = 180) {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return normalize(text).slice(0, 420);
  return normalize(text.slice(Math.max(0, index - radius), Math.min(text.length, index + needle.length + radius))).slice(0, 520);
}

function extractionMethodForAttachment(attachment: AttachmentExtractionResult): 'PARSER' | 'OCR' {
  return attachment.ocrUsed ? 'OCR' : 'PARSER';
}

function collectRegexEvidence(params: {
  text: string;
  sourceType: 'EMAIL_SUBJECT' | 'EMAIL_BODY' | 'ATTACHMENT';
  extractionMethod: 'REGEX' | 'PARSER' | 'OCR';
  confidence: number;
  evidences: ExtractedEvidence[];
  cnjs: Set<string>;
  protocols: Set<string>;
  cpfs: Set<string>;
  cnpjs: Set<string>;
  dates: Set<string>;
  monetaryValues: Set<string>;
  partyNames: Set<string>;
  courtMentions: Set<string>;
}) {
  const { text, sourceType, extractionMethod, confidence, evidences, cnjs, protocols, cpfs, cnpjs, dates, monetaryValues, partyNames, courtMentions } = params;

  for (const cnjMatch of extractCnjCandidates(text)) {
    cnjs.add(cnjMatch.value);
    evidences.push({
      field_name: 'numero_processo_cnj',
      extracted_value: cnjMatch.value,
      source_type: sourceType,
      extraction_method: sourceType === 'ATTACHMENT' ? extractionMethod : 'REGEX',
      confidence: cnjMatch.raw.includes('-') ? confidence : Math.max(0.88, confidence - 0.04),
      evidence_excerpt: excerptAround(text, cnjMatch.raw),
    });
  }

  if (sourceType === 'ATTACHMENT') {
    for (const row of extractBankProcessRows(text)) {
      // Manter também candidato com DV inválido para o bloqueio/revisão já existente.
      cnjs.add(row.cnj);
      evidences.push({ field_name: 'numero_processo_cnj', extracted_value: row.cnj,
        source_type: sourceType, extraction_method: extractionMethod,
        confidence: row.valid ? Math.min(confidence, 0.91) : 0.4,
        evidence_excerpt: excerptAround(text, row.raw) });
    }
  }

  for (const protocolMatch of extractExternalProtocols(text)) {
    const value = protocolMatch.value;
    protocols.add(value);
    evidences.push({
      field_name: 'protocolo_externo',
      extracted_value: value,
      source_type: sourceType,
      extraction_method: sourceType === 'ATTACHMENT' ? extractionMethod : 'REGEX',
      confidence: Math.max(0.72, confidence - 0.08),
      evidence_excerpt: excerptAround(text, protocolMatch.raw),
    });
  }

  for (const cpf of text.match(CPF_REGEX) || []) {
    cpfs.add(cpf);
    evidences.push({ field_name: 'cpf', extracted_value: cpf, source_type: sourceType, extraction_method: sourceType === 'ATTACHMENT' ? extractionMethod : 'REGEX', confidence: Math.max(0.75, confidence - 0.05), evidence_excerpt: excerptAround(text, cpf) });
  }
  for (const cnpj of text.match(CNPJ_REGEX) || []) {
    cnpjs.add(cnpj);
    evidences.push({ field_name: 'cnpj', extracted_value: cnpj, source_type: sourceType, extraction_method: sourceType === 'ATTACHMENT' ? extractionMethod : 'REGEX', confidence: Math.max(0.75, confidence - 0.05), evidence_excerpt: excerptAround(text, cnpj) });
  }
  for (const date of text.match(DATE_REGEX) || []) {
    dates.add(date);
    evidences.push({ field_name: 'data_mencionada', extracted_value: date, source_type: sourceType, extraction_method: sourceType === 'ATTACHMENT' ? extractionMethod : 'REGEX', confidence: Math.max(0.70, confidence - 0.10), evidence_excerpt: excerptAround(text, date) });
  }
  for (const value of text.match(MONEY_REGEX) || []) {
    monetaryValues.add(value);
    const excerpt = excerptAround(text, value, 120);
    const excerptLower = excerpt.toLowerCase();
    const fieldName = excerptLower.includes('bloqueio') ? 'valor_bloqueio' : excerptLower.includes('multa') || excerptLower.includes('astreinte') ? 'valor_multa' : 'valor_monetario';
    evidences.push({ field_name: fieldName, extracted_value: value, source_type: sourceType, extraction_method: sourceType === 'ATTACHMENT' ? extractionMethod : 'REGEX', confidence: Math.max(0.72, confidence - 0.08), evidence_excerpt: excerpt });
  }

  PARTY_REGEX.lastIndex = 0;
  let partyMatch: RegExpExecArray | null;
  while ((partyMatch = PARTY_REGEX.exec(text)) !== null) {
    const name = normalize(partyMatch[1] || '');
    if (name.length < 5) continue;
    partyNames.add(name);
    evidences.push({ field_name: 'parte_nome', extracted_value: name, source_type: sourceType, extraction_method: sourceType === 'ATTACHMENT' ? extractionMethod : 'PARSER', confidence: Math.max(0.62, confidence - 0.15), evidence_excerpt: excerptAround(text, partyMatch[0]) });
  }

  COURT_REGEX.lastIndex = 0;
  let courtMatch: RegExpExecArray | null;
  while ((courtMatch = COURT_REGEX.exec(text)) !== null) {
    const value = normalize(courtMatch[0] || '');
    if (!value) continue;
    courtMentions.add(value);
    evidences.push({ field_name: 'orgao_judicial', extracted_value: value, source_type: sourceType, extraction_method: sourceType === 'ATTACHMENT' ? extractionMethod : 'PARSER', confidence: Math.max(0.65, confidence - 0.12), evidence_excerpt: excerptAround(text, value) });
  }
}

export async function interpretEmailContent(params: {
  subject: string;
  textBody: string;
  htmlBody?: string;
  senderEmail: string;
  senderName: string;
  attachmentsCount: number;
  attachments?: AttachmentExtractionResult[];
  supabaseClient: any;
}): Promise<InterpretationResult> {
  const {
    subject = '',
    textBody = '',
    senderEmail = '',
    attachmentsCount = 0,
    attachments = [],
    supabaseClient,
  } = params;

  const cleanSubject = normalize(subject);
  const cleanBody = normalize(textBody);
  const attachmentText = attachments.filter((item) => item.text).map((item) => item.text).join('\n\n');
  const fullText = `${cleanSubject}\n${cleanBody}\n${attachmentText}`.toLowerCase();

  const evidences: ExtractedEvidence[] = [];
  const cnjsSet = new Set<string>();
  const protocolsSet = new Set<string>();
  const cpfsSet = new Set<string>();
  const cnpjsSet = new Set<string>();
  const datesSet = new Set<string>();
  const monetaryValuesSet = new Set<string>();
  const partyNamesSet = new Set<string>();
  const courtMentionsSet = new Set<string>();
  const keywordsFound: string[] = [];
  const attachmentSignals: string[] = [];

  collectRegexEvidence({
    text: cleanSubject,
    sourceType: 'EMAIL_SUBJECT',
    extractionMethod: 'REGEX',
    confidence: 0.99,
    evidences,
    cnjs: cnjsSet,
    protocols: protocolsSet,
    cpfs: cpfsSet,
    cnpjs: cnpjsSet,
    dates: datesSet,
    monetaryValues: monetaryValuesSet,
    partyNames: partyNamesSet,
    courtMentions: courtMentionsSet,
  });

  collectRegexEvidence({
    text: cleanBody,
    sourceType: 'EMAIL_BODY',
    extractionMethod: 'REGEX',
    confidence: 0.95,
    evidences,
    cnjs: cnjsSet,
    protocols: protocolsSet,
    cpfs: cpfsSet,
    cnpjs: cnpjsSet,
    dates: datesSet,
    monetaryValues: monetaryValuesSet,
    partyNames: partyNamesSet,
    courtMentions: courtMentionsSet,
  });

  for (const attachment of attachments) {
    if (!attachment.text) continue;
    const method = extractionMethodForAttachment(attachment);
    const baseConfidence = method === 'OCR' ? Math.max(0.55, attachment.confidence) : 0.96;
    collectRegexEvidence({
      text: attachment.text,
      sourceType: 'ATTACHMENT',
      extractionMethod: method,
      confidence: baseConfidence,
      evidences,
      cnjs: cnjsSet,
      protocols: protocolsSet,
      cpfs: cpfsSet,
      cnpjs: cnpjsSet,
      dates: datesSet,
      monetaryValues: monetaryValuesSet,
      partyNames: partyNamesSet,
      courtMentions: courtMentionsSet,
    });

    const attachmentLower = attachment.text.toLowerCase();
    const found = LEGAL_KEYWORDS.filter((keyword) => attachmentLower.includes(keyword));
    if (found.length > 0) {
      attachmentSignals.push(...found);
      evidences.push({
        field_name: 'sinais_juridicos_anexo',
        extracted_value: unique(found).slice(0, 8).join(', '),
        source_type: 'ATTACHMENT',
        extraction_method: method,
        confidence: method === 'OCR' ? Math.max(0.55, attachment.confidence) : 0.92,
        evidence_excerpt: excerptAround(attachment.text, found[0]),
      });
    }
  }

  // Em encaminhamentos jurídicos é comum o nome da parte vir entre parênteses no assunto.
  const subjectParen = cleanSubject.match(/\(([^()]{5,100})\)\s*$/);
  if (subjectParen?.[1] && /[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,}/.test(subjectParen[1])) {
    const candidate = normalize(subjectParen[1]);
    partyNamesSet.add(candidate);
    evidences.push({
      field_name: 'parte_nome',
      extracted_value: candidate,
      source_type: 'EMAIL_SUBJECT',
      extraction_method: 'PARSER',
      confidence: 0.78,
      evidence_excerpt: cleanSubject.slice(0, 240),
    });
  }

  for (const keyword of LEGAL_KEYWORDS) {
    if (fullText.includes(keyword)) keywordsFound.push(keyword);
  }

  const uniqueKeywords = unique(keywordsFound);
  if (uniqueKeywords.length > 0) {
    evidences.push({
      field_name: 'palavras_chave_juridicas',
      extracted_value: uniqueKeywords.slice(0, 10).join(', '),
      source_type: 'EMAIL_BODY',
      extraction_method: 'PARSER',
      confidence: 0.90,
      evidence_excerpt: `Sinais jurídicos identificados: ${uniqueKeywords.slice(0, 10).join(', ')}`,
    });
  }

  const ranked = buildRankedEvidence({ subject: cleanSubject, body: cleanBody, attachments });

  // Score jurídico v2.1: evidências fortes impõem pisos mínimos.
  // Redutores administrativos nunca podem apagar CNJ, ordem judicial ou decisão relevante.
  let relevanceScore = 0;
  const subjectLower = cleanSubject.toLowerCase();
  const bodyLower = cleanBody.toLowerCase();
  const subjectCnjs = extractCnjCandidates(cleanSubject).map((item) => item.value);
  const bodyCnjs = extractCnjCandidates(cleanBody).map((item) => item.value);
  const attachmentCnjs = attachments.flatMap((item) => item.text ? extractCnjCandidates(item.text).map((candidate) => candidate.value) : []);

  const strongLegalTerms = [
    'bloqueio judicial', 'intimação', 'intime-se', 'citação', 'tutela', 'liminar',
    'sentença', 'decisão', 'acórdão', 'obrigação de fazer', 'astreinte',
    'defiro', 'indefiro', 'determino', 'cumpra-se', 'mandado', 'execução'
  ];
  const subjectStrongTerms = strongLegalTerms.filter((term) => subjectLower.includes(term));
  const bodyStrongTerms = strongLegalTerms.filter((term) => bodyLower.includes(term));
  const attachmentStrongTerms = unique(attachmentSignals.filter((term) => strongLegalTerms.includes(term)));
  const hasStrongLegalSignal = subjectStrongTerms.length > 0 || bodyStrongTerms.length > 0 || attachmentStrongTerms.length > 0;
  const hasAnyCnj = subjectCnjs.length > 0 || bodyCnjs.length > 0 || attachmentCnjs.length > 0;

  if (subjectCnjs.length > 0) relevanceScore += 45;
  else if (bodyCnjs.length > 0) relevanceScore += 35;
  else if (attachmentCnjs.length > 0) relevanceScore += 35;

  const urgent = uniqueKeywords.some((keyword) => [
    'intimação', 'intime-se', 'citação', 'tutela', 'liminar', 'sentença',
    'decisão', 'acórdão', 'prazo', 'bloqueio judicial', 'defiro', 'indefiro', 'determino', 'cumpra-se'
  ].includes(keyword));

  if (subjectStrongTerms.length > 0) relevanceScore += 30;
  else if (bodyStrongTerms.length > 0 || attachmentStrongTerms.length > 0) relevanceScore += 20;
  else if (urgent) relevanceScore += 15;

  if (uniqueKeywords.some((keyword) => ['vara', 'juízo', 'comarca'].includes(keyword))) relevanceScore += 10;
  if (attachmentSignals.length > 0) relevanceScore += 15;
  if (senderEmail && /juridic|advog|tribunal|tj|trf|stj|stf/i.test(senderEmail)) relevanceScore += 10;

  // O ranking já consolida sujeito/corpo/anexos. Top scores altos são evidência jurídica real.
  if (ranked.stats.topScore >= 140) relevanceScore += 25;
  else if (ranked.stats.topScore >= 110) relevanceScore += 15;
  else if (ranked.stats.topScore >= 90) relevanceScore += 10;

  // Aplicação de regras administrativas dinâmicas (email_keyword_rules e email_sender_rules) se Supabase disponível
  if (supabaseClient) {
    try {
      const { data: kwRules } = await supabaseClient
        .from('email_keyword_rules')
        .select('pattern, weight, category, match_scope')
        .eq('active', true);

      if (kwRules && kwRules.length > 0) {
        for (const rule of kwRules) {
          if (!rule.pattern) continue;
          const patLower = rule.pattern.toLowerCase();
          if (fullText.includes(patLower)) {
            relevanceScore += Number(rule.weight || 0);
            if (rule.weight > 0 && !keywordsFound.includes(patLower)) {
              keywordsFound.push(patLower);
            }
          }
        }
      }

      const { data: senderRules } = await supabaseClient
        .from('email_sender_rules')
        .select('pattern, pattern_type, weight')
        .eq('active', true);

      if (senderRules && senderRules.length > 0) {
        for (const sRule of senderRules) {
          if (!sRule.pattern) continue;
          const patLower = sRule.pattern.toLowerCase();
          const emailLower = senderEmail.toLowerCase();
          if (emailLower.includes(patLower)) {
            relevanceScore += Number(sRule.weight || 0);
          }
        }
      }
    } catch (ruleErr) {
      console.warn('[legalInterpretationService] Erro ao aplicar regras dinâmicas:', ruleErr);
    }
  }

  const hasNegative = NEGATIVE_KEYWORDS.some((keyword) => fullText.includes(keyword));
  const hardLegalEvidence = hasAnyCnj || hasStrongLegalSignal || ranked.stats.topScore >= 110;
  if (hasNegative && !hardLegalEvidence) relevanceScore -= 40;
  if (!hasAnyCnj && protocolsSet.size === 0 && uniqueKeywords.length === 0 && ranked.stats.topScore < 70) relevanceScore -= 25;

  // Pisos jurídicos: redutores nunca rebaixam uma evidência forte para NÃO JURÍDICO.
  let relevanceFloor = 0;
  if (subjectCnjs.length > 0) relevanceFloor = Math.max(relevanceFloor, 70);
  if (subjectStrongTerms.length > 0) relevanceFloor = Math.max(relevanceFloor, 60);
  if (hasAnyCnj && hasStrongLegalSignal) relevanceFloor = Math.max(relevanceFloor, 80);
  if (ranked.stats.topScore >= 140) relevanceFloor = Math.max(relevanceFloor, 75);
  else if (ranked.stats.topScore >= 110) relevanceFloor = Math.max(relevanceFloor, 60);
  if (attachmentCnjs.length > 0 && attachmentStrongTerms.length > 0) relevanceFloor = Math.max(relevanceFloor, 70);

  relevanceScore = Math.max(relevanceFloor, relevanceScore);
  relevanceScore = Math.max(0, Math.min(100, relevanceScore));

  let aiNeedScore = 0;
  const hasSubstantialAttachment = attachments.some((item) => item.textLength >= 600 && item.confidence >= 0.6 && (item.status === 'TEXT_EXTRACTED' || item.status === 'OCR_EXTRACTED'));
  if (hasSubstantialAttachment && relevanceScore >= 30) aiNeedScore += 40;
  if (cleanBody.length >= 1200 && relevanceScore >= 30) aiNeedScore += 25;
  if (fullText.includes('prazo') || fullText.includes('intimação') || fullText.includes('citação')) aiNeedScore += 20;
  if (fullText.includes('tutela') || fullText.includes('liminar')) aiNeedScore += 20;
  if (monetaryValuesSet.size > 0 || fullText.includes('multa') || fullText.includes('astreinte') || fullText.includes('bloqueio judicial')) aiNeedScore += 15;
  if (ranked.stats.topScore >= 110 && relevanceScore >= 55) aiNeedScore = Math.max(aiNeedScore, 40);
  if (relevanceScore < 30) aiNeedScore = Math.min(aiNeedScore, 20);

  aiNeedScore = Math.max(0, Math.min(100, aiNeedScore));

  let classification: 'NÃO JURÍDICO' | 'POSSÍVEL' | 'PROVÁVEL' | 'FORTE' = 'NÃO JURÍDICO';
  if (relevanceScore >= 75) classification = 'FORTE';
  else if (relevanceScore >= 55) classification = 'PROVÁVEL';
  else if (relevanceScore >= 30) classification = 'POSSÍVEL';

  const cnjs = Array.from(cnjsSet);
  const protocols = Array.from(protocolsSet);

  let matchedProcessNumber: string | null = null;
  let processId: string | null = null;
  let exceptionType: string | null = null;
  let exceptionReason: string | null = null;

  // Intervenção 3: antes de transformar múltiplos CNJs em exceção, reaplica
  // preventivamente as regras B1/B2 já homologadas no saneamento histórico.
  // A decisão estrutural NÃO cria processo; a camada de aplicação revalida o banco.
  const processRouting = decideFutureCnjRouting({
    subject: cleanSubject,
    body: cleanBody,
    attachments,
    extractedCnjs: cnjs,
  });

  if (cnjs.length > 1 && (!processRouting || processRouting.mode === 'REVIEW_REQUIRED')) {
    exceptionType = 'CNJ_MULTIPLO_AMBIGUO';
    exceptionReason = processRouting?.reason
      || `Foram identificados ${cnjs.length} números de processo distintos no mesmo e-mail (${cnjs.join(', ')}). O vínculo deve ser confirmado por revisão humana.`;
    aiNeedScore = Math.max(aiNeedScore, 80);
  }

  const primaryCnjForLookup = processRouting?.mode === 'SINGLE_PROCESS'
    ? processRouting.targetCnjs[0] || null
    : cnjs.length === 1
      ? cnjs[0]
      : null;

  if (!exceptionType && cnjs.length > 0 && primaryCnjForLookup && supabaseClient) {
    const primaryCnj = primaryCnjForLookup;
    const { data: matchedProcs, error: procErr } = await supabaseClient
      .from('processes')
      .select('id, numero_processo')
      .eq('numero_processo', primaryCnj);

    if (!procErr && matchedProcs) {
      if (matchedProcs.length === 1) {
        processId = matchedProcs[0].id;
        matchedProcessNumber = matchedProcs[0].numero_processo;
      } else if (matchedProcs.length > 1) {
        exceptionType = 'CNJ_MULTIPLO_AMBIGUO';
        exceptionReason = `Foram encontrados ${matchedProcs.length} processos cadastrados com o mesmo CNJ (${primaryCnj}). Necessária revisão humana.`;
      }
    }
  } else if (!exceptionType && cnjs.length === 0 && protocols.length === 1 && supabaseClient) {
    const primaryProtocol = protocols[0];
    const { data: matchedProcs, error: protErr } = await supabaseClient
      .from('processes')
      .select('id, numero_processo, protocolo_externo')
      .eq('protocolo_externo', primaryProtocol);

    if (!protErr && matchedProcs && matchedProcs.length === 1) {
      processId = matchedProcs[0].id;
      matchedProcessNumber = matchedProcs[0].numero_processo || primaryProtocol;
    } else if (!protErr && matchedProcs && matchedProcs.length > 1) {
      exceptionType = 'PROTOCOLO_MULTIPLO_AMBIGUO';
      exceptionReason = `Foram encontrados ${matchedProcs.length} processos para o protocolo ${primaryProtocol}. Necessária revisão humana.`;
    }
  }

  if (!exceptionType && cnjs.length === 0 && protocols.length > 1) {
    exceptionType = 'PROTOCOLO_MULTIPLO_AMBIGUO';
    exceptionReason = `Foram identificados ${protocols.length} protocolos externos distintos. O vínculo exige revisão humana.`;
  }

  // Regra deliberada: IA só entra quando a relevância jurídica também atingiu o limiar.
  const relevanceThreshold = ENV.ai.legalRelevanceThreshold;
  const aiNeedThreshold = ENV.ai.aiNeedThreshold;

  let status: 'PROCESSADO' | 'PENDENTE_IA' | 'EXCECAO' | 'IRRELEVANTE' = 'PROCESSADO';
  if (relevanceScore < 30) status = 'IRRELEVANTE';
  else if (exceptionType) status = 'EXCECAO';
  else if (relevanceScore >= relevanceThreshold && aiNeedScore >= aiNeedThreshold) status = 'PENDENTE_IA';

  // Deduplicar evidências por campo+valor+origem, preservando a de maior confiança.
  const evidenceMap = new Map<string, ExtractedEvidence>();
  for (const evidence of evidences) {
    const key = `${evidence.field_name}|${evidence.extracted_value}|${evidence.source_type}`;
    const previous = evidenceMap.get(key);
    if (!previous || evidence.confidence > previous.confidence) evidenceMap.set(key, evidence);
  }

  return {
    classification,
    relevanceScore,
    aiNeedScore,
    status,
    matchedProcessNumber,
    processId,
    exceptionType,
    exceptionReason,
    evidences: Array.from(evidenceMap.values()),
    rankedEvidence: ranked.selected,
    evidenceStats: ranked.stats,
    processRouting,
    extractedData: {
      cnjs,
      protocols,
      cpfs: Array.from(cpfsSet),
      cnpjs: Array.from(cnpjsSet),
      dates: Array.from(datesSet),
      monetaryValues: Array.from(monetaryValuesSet),
      partyNames: Array.from(partyNamesSet),
      courtMentions: Array.from(courtMentionsSet),
      keywordsFound: uniqueKeywords,
      attachmentSignals: unique(attachmentSignals),
    },
  };
}
