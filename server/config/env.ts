/**
 * FONTE ÚNICA DE CONFIGURAÇÃO DO BACKEND.
 *
 * Governança:
 * 1. Somente este arquivo pode ler process.env no backend.
 * 2. Apenas SEGREDOS/credenciais e o ambiente de execução ficam fora do código.
 * 3. Parâmetros não sensíveis e operacionais ficam explícitos neste arquivo.
 * 4. getSafeConfigReport() nunca devolve segredo em claro.
 *
 * Observação de segurança: variáveis VITE_* pertencem ao bundle do frontend e,
 * por definição do Vite, são públicas. Elas não podem compartilhar o módulo de
 * configuração do servidor, pois isso arriscaria expor SUPABASE_SECRET_KEY.
 */

const rawEnv = (name: string): string => String(process.env[name] ?? '').trim();
const firstEnv = (...names: string[]): { value: string; source: string | null } => {
  for (const name of names) {
    const value = rawEnv(name);
    if (value) return { value, source: `ENV:${name}` };
  }
  return { value: '', source: null };
};

const supabaseUrlEnv = firstEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');

export const ENV = Object.freeze({
  app: Object.freeze({
    // Porta 3000 fixa e mandatória pela infraestrutura de proxy reverso nginx.
    port: 3000,
    pipelineVersion: '2.5-gemini-semantic',
    disableHmr: true,
  }),

  runtime: Object.freeze({
    nodeEnv: rawEnv('NODE_ENV') || 'development',
  }),

  // SUPABASE_SECRET_KEY é obrigatoriamente segredo. A URL é pública e o backend
  // aceita VITE_SUPABASE_URL como fallback para evitar duas URLs divergentes.
  supabase: Object.freeze({
    url: supabaseUrlEnv.value,
    urlSource: supabaseUrlEnv.source,
    secretKey: rawEnv('SUPABASE_SECRET_KEY'),
  }),

  // Configuração não sensível do mailbox fica centralizada aqui. Somente a senha
  // permanece no ambiente. Alterar a conta/host exige mudar um único arquivo.
  imap: Object.freeze({
    host: 'email-ssl.com.br',
    loginUser: 'juridico.dev@opsaudebrasil.com.br',
    loginPassword: rawEnv('IMAP_LOGIN_PASSWORD'),
    mailbox: 'INBOX',
    // Janela longa para permitir drenar o backlog histórico de ~8 mil mensagens.
    // A seleção interna continua NEWEST_FIRST e limita cada execução a syncMax.
    syncSinceDays: 3650,
    syncMax: 100,
    port: 993,
    tls: true,
  }),

  security: Object.freeze({
    // Segredo exclusivo do backend usado para AES-256-GCM das credenciais IMAP salvas no banco.
    emailCredentialsEncryptionKey: rawEnv('EMAIL_CREDENTIALS_ENCRYPTION_KEY'),
  }),

  automation: Object.freeze({
    emailSyncIntervalMinutes: 5,
    aiWorkerIntervalMinutes: 2,
    enabled: true,
  }),

  gemini: Object.freeze({
    apiKey: rawEnv('GEMINI_API_KEY'),
    model: 'gemini-3.5-flash-lite',
    timeoutMs: 120_000,
    retry503Attempts: 2,
    retry503DelayMs: 2_500,
    retryInvalidJsonAttempts: 2,
    retryInvalidJsonDelayMs: 750,
  }),

  ai: Object.freeze({
    // Mantido desligado durante homologação. Na fase de automação, este é o único
    // ponto a ser alterado para habilitar IA automática na sincronização.
    autoProcessEnabled: false,
    legalRelevanceThreshold: 55,
    aiNeedThreshold: 40,
    maxEvidenceChars: 9_000,
    maxEvidenceBlocks: 16,
  }),

  ocr: Object.freeze({
    enabled: true,
    maxImageMb: 8,
    maxImagesPerEmail: 8,
    attachmentMaxTextChars: 120_000,
  }),
});

export type BackendConfigIssue = {
  key: string;
  subsystem: 'CORE' | 'IMAP' | 'GEMINI';
  severity: 'ERROR' | 'WARNING';
  message: string;
};

/**
 * Valida presença sem expor valores. A ausência de Gemini não derruba o servidor
 * inteiro; a ausência do Supabase administrativo é erro de CORE.
 */
export function validateBackendConfig(): BackendConfigIssue[] {
  const issues: BackendConfigIssue[] = [];
  const requireValue = (
    present: boolean,
    key: string,
    subsystem: BackendConfigIssue['subsystem'],
    severity: BackendConfigIssue['severity'],
  ) => {
    if (!present) issues.push({ key, subsystem, severity, message: `${key} não configurado.` });
  };

  requireValue(Boolean(ENV.supabase.url), 'SUPABASE_URL/VITE_SUPABASE_URL', 'CORE', 'ERROR');
  requireValue(Boolean(ENV.supabase.secretKey), 'SUPABASE_SECRET_KEY', 'CORE', 'ERROR');
  requireValue(Boolean(ENV.imap.loginPassword), 'IMAP_LOGIN_PASSWORD', 'IMAP', 'WARNING');
  requireValue(Boolean(ENV.gemini.apiKey), 'GEMINI_API_KEY', 'GEMINI', 'WARNING');
  return issues;
}

export function getSafeConfigReport() {
  return {
    app: {
      port: { value: ENV.app.port, source: 'HARDCODED_INFRA_3000' },
      pipelineVersion: { value: ENV.app.pipelineVersion, source: 'BACKEND_FIXED' },
      hmrEnabled: { value: !ENV.app.disableHmr, source: 'BACKEND_FIXED' },
    },
    runtime: {
      nodeEnv: { value: ENV.runtime.nodeEnv, source: rawEnv('NODE_ENV') ? 'ENV:NODE_ENV' : 'FALLBACK' },
    },
    supabase: {
      url: { present: Boolean(ENV.supabase.url), source: ENV.supabase.urlSource || 'MISSING' },
      secretKey: { present: Boolean(ENV.supabase.secretKey), source: 'ENV:SUPABASE_SECRET_KEY', sensitive: true },
    },
    imap: {
      host: { value: ENV.imap.host, source: 'BACKEND_FIXED' },
      loginUser: { value: ENV.imap.loginUser, source: 'BACKEND_FIXED' },
      loginPassword: { present: Boolean(ENV.imap.loginPassword), source: 'ENV:IMAP_LOGIN_PASSWORD', sensitive: true },
      mailbox: { value: ENV.imap.mailbox, source: 'BACKEND_FIXED' },
      syncSinceDays: { value: ENV.imap.syncSinceDays, source: 'BACKEND_FIXED' },
      syncMax: { value: ENV.imap.syncMax, source: 'BACKEND_FIXED' },
      port: { value: ENV.imap.port, source: 'BACKEND_FIXED' },
      tls: { value: ENV.imap.tls, source: 'BACKEND_FIXED' },
    },
    gemini: {
      apiKey: { present: Boolean(ENV.gemini.apiKey), source: 'ENV:GEMINI_API_KEY', sensitive: true },
      model: { value: ENV.gemini.model, source: 'BACKEND_FIXED' },
      timeoutMs: { value: ENV.gemini.timeoutMs, source: 'BACKEND_FIXED' },
      retry503Attempts: { value: ENV.gemini.retry503Attempts, source: 'BACKEND_FIXED' },
      retry503DelayMs: { value: ENV.gemini.retry503DelayMs, source: 'BACKEND_FIXED' },
      retryInvalidJsonAttempts: { value: ENV.gemini.retryInvalidJsonAttempts, source: 'BACKEND_FIXED' },
      retryInvalidJsonDelayMs: { value: ENV.gemini.retryInvalidJsonDelayMs, source: 'BACKEND_FIXED' },
    },
    ai: {
      autoProcessEnabled: { value: ENV.ai.autoProcessEnabled, source: 'BACKEND_FIXED' },
      legalRelevanceThreshold: { value: ENV.ai.legalRelevanceThreshold, source: 'BACKEND_FIXED' },
      aiNeedThreshold: { value: ENV.ai.aiNeedThreshold, source: 'BACKEND_FIXED' },
      maxEvidenceChars: { value: ENV.ai.maxEvidenceChars, source: 'BACKEND_FIXED' },
      maxEvidenceBlocks: { value: ENV.ai.maxEvidenceBlocks, source: 'BACKEND_FIXED' },
    },
    ocr: {
      enabled: { value: ENV.ocr.enabled, source: 'BACKEND_FIXED' },
      maxImageMb: { value: ENV.ocr.maxImageMb, source: 'BACKEND_FIXED' },
      maxImagesPerEmail: { value: ENV.ocr.maxImagesPerEmail, source: 'BACKEND_FIXED' },
      attachmentMaxTextChars: { value: ENV.ocr.attachmentMaxTextChars, source: 'BACKEND_FIXED' },
    },
    frontend: {
      source: 'VITE_BUILD_ENV',
      variables: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
      note: 'São públicas e lidas no bundle do frontend. Nunca mover SUPABASE_SECRET_KEY para VITE_*.',
    },
    legacyIgnored: [
      'IMAP_PASSWORD',
      'IMAP_HOST',
      'IMAP_LOGIN_USER',
      'IMAP_MAILBOX',
      'IMAP_SYNC_SINCE_DAYS',
      'IMAP_SYNC_MAX',
      'GEMINI_MODEL',
      'GEMINI_DAILY_REQUEST_BUDGET',
      'GEMINI_TIMEOUT_MS',
      'AI_AUTO_PROCESS_ENABLED',
      'OCR_MAX_IMAGE_MB',
      'OCR_MAX_IMAGES_PER_EMAIL',
      'OCR_ENABLED',
      'ATTACHMENT_MAX_TEXT_CHARS',
      'LEGAL_RELEVANCE_THRESHOLD',
      'AI_NEED_THRESHOLD',
      'AI_MAX_EVIDENCE_CHARS',
      'AI_MAX_EVIDENCE_BLOCKS',
      'DISABLE_HMR',
    ].map((name) => ({ name, presentInRuntime: Boolean(rawEnv(name)), usedByBackend: false })),
  };
}
