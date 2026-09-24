import { ENV } from '../config/env';
import crypto from 'node:crypto';
import type { AttachmentExtractionResult } from './attachmentExtractionService';

export type RankedEvidenceKind = 'SUBJECT' | 'BODY' | 'ATTACHMENT';

export interface RankedEvidenceBlock {
  source: string;
  kind: RankedEvidenceKind;
  score: number;
  text: string;
  reason: string[];
}

const MAX_CHARS = ENV.ai.maxEvidenceChars;
const MAX_BLOCKS = ENV.ai.maxEvidenceBlocks;

const ANCHORS: Array<{ regex: RegExp; bonus: number; label: string }> = [
  { regex: /\b(?:defiro|indefiro|determino|decido|senten[çc]a|ac[oó]rd[aã]o)\b/gi, bonus: 70, label: 'decisão' },
  { regex: /\b(?:intim(?:a[çc][aã]o|e-se|ado)|cita[çc][aã]o|cumpra-se|prazo)\b/gi, bonus: 60, label: 'prazo/intimação' },
  { regex: /\b(?:tutela|liminar|bloqueio judicial|astreinte|multa)\b/gi, bonus: 60, label: 'medida urgente/financeira' },
  { regex: /\b(?:\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}|(?:processo|proc\.?|autos?|cnj)\s*(?:n[ºo°.]?\s*)?[:#-]?\s*\d{20})\b/gi, bonus: 55, label: 'CNJ' },
  { regex: /R\$\s?\d[\d.]*,\d{2}/gi, bonus: 40, label: 'valor' },
  { regex: /\b(?:autor|autora|requerente|réu|ré|requerido|benefici[aá]rio)\b/gi, bonus: 30, label: 'parte' },
];

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function blockify(text: string, source: string, kind: RankedEvidenceKind, baseScore: number) {
  const cleaned = normalize(text);
  if (!cleaned) return [] as RankedEvidenceBlock[];

  const size = kind === 'SUBJECT' ? 500 : 900;
  const overlap = 180;
  const blocks: RankedEvidenceBlock[] = [];

  for (let start = 0; start < cleaned.length; start += Math.max(1, size - overlap)) {
    const chunk = cleaned.slice(start, start + size).trim();
    if (chunk.length < 25) continue;

    let score = baseScore;
    const reason: string[] = [];
    for (const anchor of ANCHORS) {
      anchor.regex.lastIndex = 0;
      if (anchor.regex.test(chunk)) {
        score += anchor.bonus;
        reason.push(anchor.label);
      }
    }

    blocks.push({ source, kind, score, text: chunk, reason });
    if (start + size >= cleaned.length) break;
  }

  return blocks;
}

export function buildRankedEvidence(params: {
  subject: string;
  body: string;
  attachments: AttachmentExtractionResult[];
}) {
  const blocks: RankedEvidenceBlock[] = [];
  blocks.push(...blockify(params.subject, 'Assunto do e-mail', 'SUBJECT', 45));
  blocks.push(...blockify(params.body.slice(0, 40_000), 'Corpo do e-mail', 'BODY', 20));

  for (const attachment of params.attachments) {
    if (!attachment.text || attachment.status === 'DUPLICATE_REUSED') continue;
    const extractionBase = attachment.ocrUsed ? 25 : 30;
    const confidenceFactor = Math.max(0.45, Math.min(1, Number(attachment.confidence || 0)));
    const baseScore = Math.max(10, Math.round(extractionBase * confidenceFactor));
    blocks.push(...blockify(attachment.text, attachment.filename || 'Anexo', 'ATTACHMENT', baseScore));
  }

  const dedup = new Map<string, RankedEvidenceBlock>();
  for (const block of blocks) {
    const canonical = block.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (canonical.length < 25) continue;
    const key = crypto.createHash('sha1').update(canonical).digest('hex');
    const previous = dedup.get(key);
    if (!previous || block.score > previous.score) dedup.set(key, block);
  }

  const ranked = Array.from(dedup.values()).sort((a, b) => b.score - a.score);
  const selected: RankedEvidenceBlock[] = [];
  let chars = 0;

  const add = (block: RankedEvidenceBlock) => {
    if (selected.length >= MAX_BLOCKS) return;
    const remaining = MAX_CHARS - chars;
    if (remaining < 150) return;
    const text = block.text.slice(0, remaining);
    selected.push({ ...block, text });
    chars += text.length;
  };

  const subjectBlock = ranked.find((item) => item.kind === 'SUBJECT');
  if (subjectBlock) add(subjectBlock);

  for (const item of ranked.filter((block) => block.kind === 'BODY').slice(0, 2)) add(item);

  const attachmentSources = [...new Set(ranked.filter((block) => block.kind === 'ATTACHMENT').map((block) => block.source))];
  for (const source of attachmentSources) {
    const best = ranked.find((block) => block.kind === 'ATTACHMENT' && block.source === source);
    if (best && best.score >= 45) add(best);
  }

  for (const item of ranked) {
    if (selected.includes(item)) continue;
    add(item);
  }

  return {
    selected,
    stats: {
      totalBlocks: ranked.length,
      selectedBlocks: selected.length,
      selectedChars: chars,
      attachmentBlocks: selected.filter((item) => item.kind === 'ATTACHMENT').length,
      topScore: selected[0]?.score || 0,
    },
  };
}
