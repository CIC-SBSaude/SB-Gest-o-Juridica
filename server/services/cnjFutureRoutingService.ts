import type { AttachmentExtractionResult } from './attachmentExtractionService';
import { summarizeDocumentIdentification, validDocumentCnj } from './documentIdentificationService.ts';
import { selectSubjectDominantB1 } from './cnjAmbiguityB1Service.ts';
import { selectRelaxedMultiProcessB2 } from './cnjAmbiguityB2Service.ts';

export type CnjRoutingMode = 'SINGLE_PROCESS' | 'MULTI_PROCESS_DISTRIBUTION' | 'REVIEW_REQUIRED';
export type CnjRoutingSource = { source: string; kind: string };

export type CnjRoutingDecision = {
  mode: CnjRoutingMode;
  rule: string;
  targetCnjs: string[];
  auxiliaryCnjs: string[];
  reason: string;
  sourcesByCnj: Record<string, CnjRoutingSource[]>;
};

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function canonicalCnj(value: string): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 20) return null;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

function normalizeKind(kind: unknown) {
  return String(kind || 'UNKNOWN').toUpperCase();
}

function sourcesForCnj(analysis: ReturnType<typeof summarizeDocumentIdentification>, cnj: string): CnjRoutingSource[] {
  const seen = new Set<string>();
  const sources: CnjRoutingSource[] = [];
  for (const doc of analysis.documents as any[]) {
    if (!(doc.validCnjs || []).includes(cnj)) continue;
    const item = {
      source: String(doc.source || `Trecho ${doc.blockIndex}`),
      kind: normalizeKind(doc.kind),
    };
    const key = `${item.kind}|${item.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(item);
  }
  return sources;
}

function review(reason: string, allCnjs: string[], sourcesByCnj: Record<string, CnjRoutingSource[]>): CnjRoutingDecision {
  return {
    mode: 'REVIEW_REQUIRED',
    rule: 'CNJ_MULTIPLO_AMBIGUO',
    targetCnjs: [],
    auxiliaryCnjs: allCnjs,
    reason,
    sourcesByCnj,
  };
}

/**
 * Roteamento preventivo de CNJ para NOVOS e-mails.
 *
 * Ordem deliberada:
 *  1. CNJ único => SINGLE_PROCESS.
 *  2. B1: um CNJ dominante no assunto e demais referências auxiliares => SINGLE_PROCESS.
 *  3. B2: documentos físicos individualizados para processos distintos => MULTI_PROCESS_DISTRIBUTION.
 *  4. Qualquer outro cenário => REVIEW_REQUIRED / CNJ_MULTIPLO_AMBIGUO.
 *
 * A decisão é estrutural e não cria processos. A camada de aplicação revalida
 * existência/unicidade na tabela processes antes de qualquer vínculo.
 */
export function decideFutureCnjRouting(params: {
  subject: string;
  body: string;
  attachments?: AttachmentExtractionResult[];
  extractedCnjs?: string[];
}): CnjRoutingDecision | null {
  const attachments = params.attachments || [];
  const rawBlocks: Array<{ source: string; kind: string; text: string }> = [
    { source: 'Assunto do e-mail', kind: 'SUBJECT', text: String(params.subject || '') },
    { source: 'Corpo do e-mail', kind: 'BODY', text: String(params.body || '') },
    ...attachments
      .filter(item => Boolean(item?.text))
      .map(item => ({
        source: String(item.filename || 'Anexo'),
        kind: 'ATTACHMENT',
        text: String(item.text || ''),
      })),
  ];

  const analysis = summarizeDocumentIdentification(rawBlocks);
  const extracted = unique((params.extractedCnjs || [])
    .map(canonicalCnj)
    .filter((cnj): cnj is string => Boolean(cnj)));
  const structural = unique((analysis.validCnjs || []).map(String));
  const allCnjs = unique([...extracted, ...structural]);

  if (allCnjs.length === 0) return null;

  const sourcesByCnj = Object.fromEntries(allCnjs.map(cnj => [cnj, sourcesForCnj(analysis, cnj)]));

  // Um único CNJ continua no fluxo normal já existente. O módulo 97 definitivo
  // ainda é revalidado em processApplicationService antes de criar/vincular.
  if (allCnjs.length === 1) {
    return {
      mode: 'SINGLE_PROCESS',
      rule: 'SINGLE_CNJ',
      targetCnjs: allCnjs,
      auxiliaryCnjs: [],
      reason: 'A demanda contém um único CNJ canônico.',
      sourcesByCnj,
    };
  }

  // Se a extração encontrou um CNJ que não pôde ser rastreado estruturalmente
  // nos blocos documentais, não inferimos papel por eliminação.
  const untracked = allCnjs.filter(cnj => !structural.includes(cnj));
  if (untracked.length > 0) {
    return review(
      `Há CNJ extraído sem rastreabilidade estrutural suficiente nos blocos documentais (${untracked.join(', ')}).`,
      allCnjs,
      sourcesByCnj,
    );
  }

  if (analysis.invalidCnjs.length > 0 || structural.some(cnj => !validDocumentCnj(cnj))) {
    return review('Há CNJ com dígito verificador inválido nos blocos documentais.', allCnjs, sourcesByCnj);
  }

  const b1 = selectSubjectDominantB1(analysis);
  if (b1.cnj && b1.rule) {
    return {
      mode: 'SINGLE_PROCESS',
      rule: `B1_${b1.rule}`,
      targetCnjs: [b1.cnj],
      auxiliaryCnjs: b1.secondaryCnjs,
      reason: b1.reason,
      sourcesByCnj: Object.fromEntries(allCnjs.map(cnj => [cnj, sourcesForCnj(analysis, cnj)])),
    };
  }

  const b2 = selectRelaxedMultiProcessB2(analysis, rawBlocks);
  if (b2.structuralCandidate && b2.rule && b2.targetCnjs.length >= 2) {
    return {
      mode: 'MULTI_PROCESS_DISTRIBUTION',
      rule: b2.rule,
      targetCnjs: b2.targetCnjs,
      auxiliaryCnjs: b2.auxiliaryCnjs,
      reason: b2.reason,
      sourcesByCnj: b2.sourcesByCnj,
    };
  }

  return review(
    `Múltiplos CNJs sem dominância B1 ou separação documental B2 segura. B1: ${b1.reason} B2: ${b2.reason}`,
    allCnjs,
    sourcesByCnj,
  );
}
