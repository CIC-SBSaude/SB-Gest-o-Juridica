/**
 * Configurações operacionais não sensíveis da aplicação.
 *
 * Mantidas no backend de propósito para que o funcionamento não dependa
 * da persistência de Secrets do ambiente de preview/AI Studio.
 * Credenciais e chaves continuam obrigatoriamente fora do código.
 */
export const RUNTIME_CONFIG = Object.freeze({
  // Gemini
  GEMINI_TIMEOUT_MS: 60_000,
  GEMINI_BUDGET_SAFETY_PERCENT: 85,

  // Classificação / IA
  LEGAL_RELEVANCE_THRESHOLD: 55,
  AI_NEED_THRESHOLD: 40,
  AI_MAX_EVIDENCE_CHARS: 9_000,
  AI_MAX_EVIDENCE_BLOCKS: 16,

  // Anexos / OCR
  OCR_ENABLED: true,
  ATTACHMENT_MAX_TEXT_CHARS: 120_000,

  // IMAP (parâmetros técnicos, não credenciais)
  IMAP_PORT: 993,
  IMAP_TLS: true,
} as const);
