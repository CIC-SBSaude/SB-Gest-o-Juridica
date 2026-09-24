import fs from 'node:fs';
import { ENV } from '../config/env';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Attachment } from 'mailparser';
import pdfParse from 'pdf-parse';
import { recognizeIsolated } from './isolatedOcr';

export type AttachmentExtractionStatus =
  | 'TEXT_EXTRACTED'
  | 'OCR_EXTRACTED'
  | 'NO_TEXT_LAYER'
  | 'OCR_NO_TEXT'
  | 'OCR_SKIPPED_DISABLED'
  | 'OCR_SKIPPED_SIZE'
  | 'OCR_SKIPPED_LIMIT'
  | 'DUPLICATE_REUSED'
  | 'UNSUPPORTED'
  | 'EXTRACTION_ERROR'
  | 'EXTRACTION_TIMEOUT'
  | 'OCR_ERROR';

export interface AttachmentExtractionResult {
  hash: string;
  filename: string;
  mimeType: string;
  status: AttachmentExtractionStatus;
  text: string;
  textLength: number;
  ocrUsed: boolean;
  confidence: number;
  duplicateOf?: string | null;
}

export interface AttachmentProcessingSummary {
  total: number;
  unique: number;
  duplicates: number;
  textExtracted: number;
  ocrExtracted: number;
  noTextLayer: number;
  unsupported: number;
  errors: number;
}

const OCR_ENABLED = ENV.ocr.enabled;
const OCR_MAX_IMAGE_MB = ENV.ocr.maxImageMb;
const OCR_MAX_IMAGES_PER_EMAIL = ENV.ocr.maxImagesPerEmail;
const ATTACHMENT_MAX_TEXT_CHARS = ENV.ocr.attachmentMaxTextChars;
const PDF_OCR_MAX_PAGES = 2;
const PDF_PARSE_MAX_PAGES = 12;
const PDF_TEXT_MIN_CHARS = 120;
const OCR_PAGE_TIMEOUT_MS = 18_000;
const ATTACHMENT_TIMEOUT_MS = 25_000;
const EMAIL_ATTACHMENT_BUDGET_MS = 45_000;
const PDF_TEXT_MIN_QUALITY = 0.68;
const execFileAsync = promisify(execFile);

let pdfRendererUnavailableLogged = false;

type OcrBudget = { used: number; max: number };

type TextQuality = {
  score: number;
  privateUseRatio: number;
  replacementRatio: number;
  readableRatio: number;
  flags: string[];
};

function normalizeText(value: string) {
  return value
    .replace(/\u0000/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function analyzeTextQuality(value: string): TextQuality {
  const text = normalizeText(value);
  if (!text) {
    return { score: 0, privateUseRatio: 0, replacementRatio: 0, readableRatio: 0, flags: ['EMPTY'] };
  }

  const chars = Array.from(text);
  const total = Math.max(1, chars.length);
  let privateUse = 0;
  let replacements = 0;
  let readable = 0;
  let controls = 0;

  for (const char of chars) {
    const cp = char.codePointAt(0) || 0;
    if ((cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0xf0000 && cp <= 0xffffd) || (cp >= 0x100000 && cp <= 0x10fffd)) {
      privateUse += 1;
    }
    if (char === '\ufffd') replacements += 1;
    if (/^[\p{L}\p{N}\p{P}\p{Z}\p{S}\n]$/u.test(char)) readable += 1;
    if ((cp < 32 && char !== '\n' && char !== '\t') || (cp >= 0x7f && cp <= 0x9f)) controls += 1;
  }

  const privateUseRatio = privateUse / total;
  const replacementRatio = replacements / total;
  const readableRatio = readable / total;
  const controlRatio = controls / total;
  const flags: string[] = [];

  if (text.length < PDF_TEXT_MIN_CHARS) flags.push('SHORT');
  if (privateUseRatio > 0.01) flags.push('PRIVATE_USE');
  if (replacementRatio > 0.003) flags.push('REPLACEMENT_CHARS');
  if (readableRatio < 0.88) flags.push('LOW_READABLE_RATIO');
  if (controlRatio > 0.002) flags.push('CONTROL_CHARS');

  let score = 1;
  if (text.length < PDF_TEXT_MIN_CHARS) score -= 0.2;
  score -= Math.min(0.5, privateUseRatio * 12);
  score -= Math.min(0.35, replacementRatio * 25);
  score -= Math.min(0.25, Math.max(0, 0.94 - readableRatio) * 2.5);
  score -= Math.min(0.2, controlRatio * 30);

  return {
    score: Math.max(0, Math.min(1, score)),
    privateUseRatio,
    replacementRatio,
    readableRatio,
    flags,
  };
}

function shouldFallbackPdfToOcr(text: string, quality: TextQuality) {
  return !text || text.length < PDF_TEXT_MIN_CHARS || quality.score < PDF_TEXT_MIN_QUALITY;
}

function isImageForOcr(filename: string, mimeType: string) {
  const name = filename.toLowerCase();
  return (
    mimeType === 'image/png' ||
    mimeType === 'image/jpeg' ||
    mimeType === 'image/bmp' ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.bmp')
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

async function extractPdfText(content: Buffer) {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const message = String(args[0] ?? '');
    if (/^Warning: (TT:|Ran out of space in font private use area)/i.test(message)) return;
    originalWarn(...args);
  };

  try {
    // Durante a ingestão precisamos de texto suficiente para identificar/vincular a demanda,
    // não de uma transcrição integral de PDFs de dezenas ou centenas de páginas.
    // Limitar páginas evita que um único PDF pesado paralise o lote IMAP.
    const parsed = await pdfParse(content, { max: PDF_PARSE_MAX_PAGES } as any);
    return normalizeText(String(parsed.text || ''));
  } finally {
    console.warn = originalWarn;
  }
}

async function recognizeImageBuffer(content: Buffer) {
  const result = await recognizeIsolated(content, { timeoutMs: OCR_PAGE_TIMEOUT_MS });
  return {
    text: normalizeText(result.text).slice(0, ATTACHMENT_MAX_TEXT_CHARS),
    confidence: Math.max(0, Math.min(1, result.confidence / 100)),
  };
}

async function extractImageText(
  content: Buffer,
  filename: string,
  mimeType: string,
  hash: string,
  budget: OcrBudget
): Promise<AttachmentExtractionResult> {
  if (!OCR_ENABLED) {
    return { hash, filename, mimeType, status: 'OCR_SKIPPED_DISABLED', text: '', textLength: 0, ocrUsed: false, confidence: 0 };
  }

  if (content.length > OCR_MAX_IMAGE_MB * 1024 * 1024) {
    return { hash, filename, mimeType, status: 'OCR_SKIPPED_SIZE', text: '', textLength: 0, ocrUsed: false, confidence: 0 };
  }

  if (budget.used >= budget.max) {
    return { hash, filename, mimeType, status: 'OCR_SKIPPED_LIMIT', text: '', textLength: 0, ocrUsed: false, confidence: 0 };
  }

  budget.used += 1;

  try {
    const result = await recognizeImageBuffer(content);
    return {
      hash,
      filename,
      mimeType,
      status: result.text ? 'OCR_EXTRACTED' : 'OCR_NO_TEXT',
      text: result.text,
      textLength: result.text.length,
      ocrUsed: true,
      confidence: result.confidence,
    };
  } catch (error) {
    console.warn('[OCR] falha transitória em anexo', {
      filename,
      mimeType,
      message: error instanceof Error ? error.message : 'erro desconhecido',
    });
    return { hash, filename, mimeType, status: 'OCR_ERROR', text: '', textLength: 0, ocrUsed: true, confidence: 0 };
  }
}

async function renderPdfPagesWithPdfium(content: Buffer, maxPages: number): Promise<Buffer[]> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sbjur-pdf-ocr-'));
  const inputPath = path.join(tempDir, 'input.pdf');
  try {
    await writeFile(inputPath, content);
    let workerPath = path.resolve('server/workers/pdfRasterWorker.mjs');
    try { await fs.promises.access(workerPath); } catch { workerPath = path.resolve('dist/pdfRasterWorker.mjs'); }
    
    const { stdout } = await execFileAsync(process.execPath, [workerPath, inputPath], {
      timeout: parseInt(process.env.PDF_RENDER_TIMEOUT_MS || '10000', 10),
      killSignal: 'SIGKILL',
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, PDF_OCR_MAX_PAGES: String(maxPages) }
    });
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) throw new Error('Retorno inválido do rasterizador');
    
    parsed.forEach(p => {
      console.log('[PDF RASTER] página rasterizada', {
        page: p.page, width: p.width, height: p.height
      });
    });

    return parsed.map(p => Buffer.from(p.data, 'base64'));
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function renderPdfPagesForOcr(
  content: Buffer,
  maxPages: number
): Promise<{ pages: Buffer[]; renderer: 'PDFIUM_WASM' | 'UNAVAILABLE' }> {
  try {
    console.log('[PDF RASTER] PDFium iniciado', { pagesRequested: maxPages });
    const pages = await renderPdfPagesWithPdfium(content, maxPages);
    return { pages, renderer: 'PDFIUM_WASM' };
  } catch (error: any) {
    console.warn('[PDF RASTER] falha isolada', { message: error instanceof Error ? error.message : 'erro desconhecido' });
    return { pages: [], renderer: 'UNAVAILABLE' };
  }
}

async function fallbackPdfToOcr(
  content: Buffer,
  filename: string,
  budget: OcrBudget
): Promise<{ text: string; confidence: number; pagesProcessed: number } | null> {
  if (!OCR_ENABLED || content.length > OCR_MAX_IMAGE_MB * 1024 * 1024) return null;
  const remaining = budget.max - budget.used;
  if (remaining <= 0) return null;

  const maxPages = Math.min(PDF_OCR_MAX_PAGES, remaining);
  let rendered: { pages: Buffer[]; renderer: 'PDFIUM_WASM' | 'UNAVAILABLE' };

  try {
    rendered = await renderPdfPagesForOcr(content, maxPages);
  } catch (error) {
    console.warn('[PDF OCR] falha ao preparar páginas para fallback', {
      filename,
      message: error instanceof Error ? error.message : 'erro desconhecido',
    });
    return null;
  }

  const pages = rendered.pages;
  if (!pages.length) {
    console.warn('[PDF OCR] nenhuma página rasterizável encontrada para OCR', {
      filename,
      renderer: rendered.renderer,
    });
    return null;
  }

  console.log('[PDF OCR] fallback necessário', { filename, renderer: rendered.renderer, pages: pages.length });

  const chunks: string[] = [];
  const confidences: number[] = [];
  let processed = 0;

  for (const page of pages) {
    if (budget.used >= budget.max) break;
    budget.used += 1;
    processed += 1;
    try {
      const result = await recognizeImageBuffer(page);
      if (result.text) chunks.push(result.text);
      confidences.push(result.confidence);
    } catch (error) {
      console.warn('[PDF OCR] falha OCR em página', {
        filename,
        page: processed,
        message: error instanceof Error ? error.message : 'erro desconhecido',
      });
    }
  }

  const text = normalizeText(chunks.join('\n\n')).slice(0, ATTACHMENT_MAX_TEXT_CHARS);
  const confidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : 0;

  return { text, confidence, pagesProcessed: processed };
}

async function extractPdfAttachment(
  content: Buffer,
  filename: string,
  mimeType: string,
  hash: string,
  budget: OcrBudget
): Promise<AttachmentExtractionResult> {
  let parserText = '';
  let parserQuality = analyzeTextQuality('');

  try {
    parserText = (await extractPdfText(content)).slice(0, ATTACHMENT_MAX_TEXT_CHARS);
    parserQuality = analyzeTextQuality(parserText);
  } catch (error) {
    console.warn('[PDF] parser textual falhou; avaliando fallback OCR', {
      filename,
      message: error instanceof Error ? error.message : 'erro desconhecido',
    });
  }

  const needsOcr = shouldFallbackPdfToOcr(parserText, parserQuality);
  if (needsOcr) {
    const fallback = await fallbackPdfToOcr(content, filename, budget);
    if (fallback?.text) {
      const ocrQuality = analyzeTextQuality(fallback.text);
      const parserClearlyWeak = !parserText || parserText.length < PDF_TEXT_MIN_CHARS || parserQuality.score < 0.6;
      const ocrClearlyBetter = ocrQuality.score >= parserQuality.score + 0.08;

      if (parserClearlyWeak || ocrClearlyBetter) {
        console.log('[PDF OCR] fallback aplicado', {
          filename,
          pagesProcessed: fallback.pagesProcessed,
          parserChars: parserText.length,
          parserQuality: Number(parserQuality.score.toFixed(2)),
          ocrChars: fallback.text.length,
          ocrQuality: Number(ocrQuality.score.toFixed(2)),
        });
        return {
          hash,
          filename,
          mimeType,
          status: 'OCR_EXTRACTED',
          text: fallback.text,
          textLength: fallback.text.length,
          ocrUsed: true,
          confidence: Math.max(0, Math.min(1, fallback.confidence * ocrQuality.score)),
        };
      }
    }
  }

  if (parserText) {
    if (needsOcr) {
      console.warn('[PDF] texto mantido com qualidade reduzida', {
        filename,
        textLength: parserText.length,
        quality: Number(parserQuality.score.toFixed(2)),
        flags: parserQuality.flags,
      });
    }

    return {
      hash,
      filename,
      mimeType,
      status: 'TEXT_EXTRACTED',
      text: parserText,
      textLength: parserText.length,
      ocrUsed: false,
      confidence: parserQuality.score,
    };
  }

  return { hash, filename, mimeType, status: 'NO_TEXT_LAYER', text: '', textLength: 0, ocrUsed: false, confidence: 0 };
}

async function extractSingleAttachment(
  attachment: Attachment,
  hash: string,
  budget: OcrBudget
): Promise<AttachmentExtractionResult> {
  const filename = attachment.filename || 'anexo-sem-nome';
  const mimeType = String(attachment.contentType || 'application/octet-stream').toLowerCase();
  const name = filename.toLowerCase();
  const content = attachment.content;

  try {
    if (mimeType === 'application/pdf' || name.endsWith('.pdf')) {
      return extractPdfAttachment(content, filename, mimeType, hash, budget);
    }

    if (isImageForOcr(filename, mimeType)) {
      return extractImageText(content, filename, mimeType, hash, budget);
    }

    if (mimeType.startsWith('text/') || name.endsWith('.txt')) {
      const text = normalizeText(content.toString('utf8')).slice(0, ATTACHMENT_MAX_TEXT_CHARS);
      return {
        hash,
        filename,
        mimeType,
        status: text ? 'TEXT_EXTRACTED' : 'NO_TEXT_LAYER',
        text,
        textLength: text.length,
        ocrUsed: false,
        confidence: text ? 0.98 : 0,
      };
    }

    return { hash, filename, mimeType, status: 'UNSUPPORTED', text: '', textLength: 0, ocrUsed: false, confidence: 0 };
  } catch (error) {
    console.warn('[ANEXO] falha de extração transitória', {
      filename,
      mimeType,
      message: error instanceof Error ? error.message : 'erro desconhecido',
    });
    return { hash, filename, mimeType, status: 'EXTRACTION_ERROR', text: '', textLength: 0, ocrUsed: false, confidence: 0 };
  }
}

export async function extractAttachmentsTransient(attachments: Attachment[] = []) {
  const results: AttachmentExtractionResult[] = [];
  const byHash = new Map<string, AttachmentExtractionResult>();
  const ocrBudget: OcrBudget = { used: 0, max: OCR_MAX_IMAGES_PER_EMAIL };
  const startedAt = Date.now();

  for (const attachment of attachments) {
    const content = attachment.content;
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const filename = attachment.filename || 'anexo-sem-nome';
    const mimeType = String(attachment.contentType || 'application/octet-stream').toLowerCase();

    const cached = byHash.get(hash);
    if (cached) {
      results.push({
        ...cached,
        filename,
        mimeType,
        status: 'DUPLICATE_REUSED',
        duplicateOf: cached.filename,
      });
      continue;
    }

    if (Date.now() - startedAt >= EMAIL_ATTACHMENT_BUDGET_MS) {
      const timedOut: AttachmentExtractionResult = {
        hash, filename, mimeType, status: 'EXTRACTION_TIMEOUT', text: '', textLength: 0, ocrUsed: false, confidence: 0,
      };
      byHash.set(hash, timedOut);
      results.push(timedOut);
      console.warn('[ANEXO] orçamento de tempo do e-mail atingido; anexo ignorado para não bloquear a ingestão', { filename });
      continue;
    }

    let result: AttachmentExtractionResult;
    const attachmentStartedAt = Date.now();
    try {
      result = await withTimeout(
        extractSingleAttachment(attachment, hash, ocrBudget),
        ATTACHMENT_TIMEOUT_MS,
        'ATTACHMENT_EXTRACTION'
      );
    } catch (error) {
      const timeout = /ATTACHMENT_EXTRACTION_TIMEOUT/.test(error instanceof Error ? error.message : '');
      console.warn(timeout
        ? '[ANEXO] timeout de extração; e-mail seguirá sem bloquear a ingestão'
        : '[ANEXO] falha isolada de extração; e-mail seguirá normalmente', {
        filename,
        mimeType,
        elapsedMs: Date.now() - attachmentStartedAt,
        message: error instanceof Error ? error.message : 'erro desconhecido',
      });
      result = {
        hash, filename, mimeType, status: timeout ? 'EXTRACTION_TIMEOUT' : 'EXTRACTION_ERROR',
        text: '', textLength: 0, ocrUsed: false, confidence: 0,
      };
    }

    byHash.set(hash, result);
    results.push(result);
  }

  const unique = results.filter((item) => item.status !== 'DUPLICATE_REUSED');
  const summary: AttachmentProcessingSummary = {
    total: results.length,
    unique: unique.length,
    duplicates: results.filter((item) => item.status === 'DUPLICATE_REUSED').length,
    textExtracted: unique.filter((item) => item.status === 'TEXT_EXTRACTED').length,
    ocrExtracted: unique.filter((item) => item.status === 'OCR_EXTRACTED').length,
    noTextLayer: unique.filter((item) => item.status === 'NO_TEXT_LAYER' || item.status === 'OCR_NO_TEXT').length,
    unsupported: unique.filter((item) => item.status === 'UNSUPPORTED' || item.status.startsWith('OCR_SKIPPED')).length,
    errors: unique.filter((item) => item.status === 'EXTRACTION_ERROR' || item.status === 'EXTRACTION_TIMEOUT' || item.status === 'OCR_ERROR').length,
  };

  return { results, summary };
}

export function releaseAttachmentExtraction(results: AttachmentExtractionResult[]) {
  for (const item of results) {
    item.text = '';
    item.textLength = 0;
  }
}
