import { ENV } from '../config/env';
import type { InterpretationResult } from './legalInterpretationService';
import { getAiBudgetState } from './aiUsageService';
import { getAiRuntimeConfig } from './aiRuntimeConfigService';
import { isValidCnj, canonicalCnj } from './processApplicationService';
import { parseGeminiJson, buildInvalidJsonRetryInstruction } from './geminiJsonService';
import { generateContentWithAiRouter } from './aiRouterService';

export interface AiExtractedField<T> {
  value: T | null;
  confidence: number;
  evidence?: string | null;
}

export type AiFieldApplicationDecision =
  | 'APLICADO_AUTOMATICAMENTE'
  | 'NAO_APLICADO_CONFIANCA_INSUFICIENTE'
  | 'AGUARDANDO_REVISAO'
  | 'NAO_IDENTIFICADO'
  | 'IGNORADO_CAMPO_PREENCHIDO'
  | 'INVALIDO_DETERMINISTICO';

export interface AiFieldDecisionInfo {
  fieldName: string;
  fieldLabel: string;
  decision: AiFieldApplicationDecision;
  confidence: number;
  threshold: number;
  appliedValue?: unknown;
  reason?: string;
  evidence?: string | null;
}

export interface AiPartyFinding {
  name: string;
  role: string | null;
  confidence: number;
}

export interface AiPartyExtracted {
  name: AiExtractedField<string>;
  role: AiExtractedField<string>;
  roleType?: 'AUTOR' | 'REU' | 'BENEFICIARIO' | 'TERCEIRO' | 'OUTRO' | null;
}

export interface AiMoneyFinding {
  amount: number;
  type: string;
  currency: 'BRL';
  confidence: number;
}

export interface AiMonetaryValues {
  valorCausa: AiExtractedField<number>;
  valorCondenacao: AiExtractedField<number>;
  /** Compatibilidade legada: multa genérica quando o documento não distingue natureza. */
  valorMulta: AiExtractedField<number>;
  valorMultaDiaria: AiExtractedField<number>;
  valorMultaLimite: AiExtractedField<number>;
  outrosValores: Array<{
    amount: AiExtractedField<number>;
    type: string;
    currency: 'BRL';
    context?: string | null;
  }>;
}

export interface AiDeadlineFinding {
  exists: boolean;
  dueDate: string | null;
  termText: string | null;
  startBasis: string | null;
  confidence: number;
}

export interface AiDeadlineStructured {
  exists: boolean;
  confidence: number;
  quantity: AiExtractedField<number>;
  unit: AiExtractedField<'DIAS' | 'HORAS' | 'MESES' | 'ANOS' | 'UTEIS' | string>;
  dueDate: AiExtractedField<string>;
  triggerEvent: AiExtractedField<string>;
  sourceText?: string | null;
}

export interface AiObligationFinding {
  exists: boolean;
  description: string | null;
  dueDate: string | null;
  deadlineText: string | null;
  dailyPenalty: number | null;
  confidence: number;
}

export interface AiObligationStructured {
  exists: boolean;
  confidence: number;
  description: AiExtractedField<string>;
  type: AiExtractedField<string>;
  criticality: AiExtractedField<'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'>;
  dailyPenalty?: AiExtractedField<number>;
}

export interface AiIdentificationStructured {
  numeroProcesso: AiExtractedField<string>;
  protocolo: AiExtractedField<string>;
  comarca: AiExtractedField<string>;
  uf: AiExtractedField<string>;
  orgaoJulgador: AiExtractedField<string>;
  municipio: AiExtractedField<string>;
}

export interface AiClassificationStructured {
  tipoDemanda: AiExtractedField<string>;
  subtipoDemanda: AiExtractedField<string>;
  objetoDemanda: AiExtractedField<string>;
  natureza: AiExtractedField<string>;
  faseProcessual: AiExtractedField<string>;
  tutelaUrgencia: AiExtractedField<string>;
  prioridade: AiExtractedField<'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'>;
  situacaoBeneficiario: AiExtractedField<string>;
  categoriaDemanda: AiExtractedField<string>;
  subcategoriaDemanda: AiExtractedField<string>;
  naturezasJuridicas: AiExtractedField<string[]>;
  detalheDemanda: AiExtractedField<string>;
  suggestedStatus: AiExtractedField<'NOVA' | 'TRIAGEM' | 'EM_ANALISE' | 'EM_TRATAMENTO' | 'AGUARDANDO_TERCEIRO' | 'AGUARDANDO_DECISAO' | 'CONCLUIDA' | 'CANCELADA'>;
}

export const AI_FIELD_THRESHOLDS = {
  PROCESS_NUMBER: 0.95,
  PROCESS_FIELD: 0.92,
  STATUS: 0.97,
  OBLIGATION_EXISTENCE: 0.95,
  OBLIGATION_DESCRIPTION: 0.90,
  OBLIGATION_CRITICALITY: 0.90,
  DEADLINE_EXISTENCE: 0.90,
  DEADLINE_DUE_DATE: 0.85,
  MONETARY_VALUE: 0.90,
  CLASSIFICATION: 0.90,
  TIMELINE: 0.90,
} as const;

export interface AiLegalInterpretation {
  isLegal: boolean;
  eventType: string;
  confidence: number;

  identification: AiIdentificationStructured;
  classification: AiClassificationStructured;
  partiesStructured: AiPartyExtracted[];
  values: AiMonetaryValues;
  deadlineStructured: AiDeadlineStructured;
  obligationStructured: AiObligationStructured;

  applicationDecisions?: Record<string, AiFieldDecisionInfo>;

  // Campos de compatibilidade plana
  processNumber: string | null;
  processNumberConfidence: number;
  parties: AiPartyFinding[];
  nature: string | null;
  phase: string | null;
  tutela: string | null;
  municipality: string | null;
  comarca: string | null;
  uf: string | null;
  beneficiaryStatus: string | null;
  demandType: string | null;
  demandSubtype: string | null;
  demandObject: string | null;
  priority: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE' | null;
  suggestedStatus: 'NOVA' | 'TRIAGEM' | 'EM_ANALISE' | 'EM_TRATAMENTO' | 'AGUARDANDO_TERCEIRO' | 'AGUARDANDO_DECISAO' | 'CONCLUIDA' | 'CANCELADA' | null;
  moneyFindings: AiMoneyFinding[];
  deadline: AiDeadlineFinding;
  obligation: AiObligationFinding;
  timelineTitle: string;
  timelineSummary: string;
  actionSummary: string;
  warnings: string[];
  allegation?: AiAllegationFinding;
}

export interface AiAllegationFinding {
  narrativa: string | null;
  tentativasContatoQtd: number | null;
  canaisMencionados: string[];
  setorMencionado: string | null;
  tempoEsperaDias: number | null;
  tempoEsperaTexto: string | null;
  dificuldadeRelatada: string | null;
  desfechoAlegado: string | null;
  confidence: number;
}

export interface GeminiInterpretationOutcome {
  state: 'SUCCESS' | 'SKIPPED_NO_KEY' | 'SKIPPED_NO_MODEL' | 'SKIPPED_BUDGET' | 'PAUSED_429' | 'FAILED';
  model: string | null;
  result: AiLegalInterpretation | null;
  error: string | null;
  errorStatus?: number;
  errorCode?: string;
  budget?: { callsToday: number; configuredBudget: number; effectiveLimit: number };
}

export const clampConfidence = (value: unknown): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, Math.round(num * 100) / 100));
};

export const strictBoolean = (value: unknown): boolean =>
  value === true || value === 'true' || value === 1 || value === '1';

export const textOrNull = (value: unknown, maxLen = 500): string | null => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, maxLen);
  }
  return null;
};

export const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
};

export const extractEvidence = (raw: unknown): string | null => {
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim().slice(0, 300);
  }
  return null;
};

function normalizeField<T>(
  raw: any,
  validator: (val: any) => T | null,
  defaultConfidence = 0
): AiExtractedField<T> {
  if (raw === null || raw === undefined) {
    return { value: null, confidence: 0, evidence: null };
  }

  // Se já for um objeto estruturado { value, confidence, evidence }
  if (typeof raw === 'object' && ('value' in raw || 'confidence' in raw)) {
    const value = validator(raw.value);
    const confidence = value !== null ? clampConfidence(raw.confidence ?? defaultConfidence) : 0;
    const evidence = extractEvidence(raw.evidence);
    return { value, confidence, evidence };
  }

  // Se for valor direto primitivo
  const value = validator(raw);
  const confidence = value !== null ? clampConfidence(defaultConfidence || 0.85) : 0;
  return { value, confidence, evidence: null };
}

function evidenceContainsProcessNumber(
  interpretation: InterpretationResult,
  processNumber: string
): boolean {
  const digits = processNumber.replace(/\D/g, '');
  if (digits.length < 19) return false;
  return interpretation.rankedEvidence.some((block) =>
    block.text.replace(/\D/g, '').includes(digits)
  );
}

export function augmentDeterministicWithAiProcessNumber(
  interpretation: InterpretationResult,
  ai: AiLegalInterpretation | null
) {
  if (!ai?.processNumber || ai.processNumberConfidence < AI_FIELD_THRESHOLDS.PROCESS_NUMBER) {
    return interpretation;
  }
  if (!evidenceContainsProcessNumber(interpretation, ai.processNumber)) {
    return interpretation;
  }
  const formatted = canonicalCnj(ai.processNumber);
  if (!formatted || !isValidCnj(formatted)) return interpretation;

  if (!interpretation.extractedData.cnjs.includes(formatted)) {
    interpretation.extractedData.cnjs.unshift(formatted);
  }
  return interpretation;
}

export function normalizeResult(
  raw: any,
  deterministicContext?: InterpretationResult
): AiLegalInterpretation {
  const allowedStatuses = new Set([
    'NOVA',
    'TRIAGEM',
    'EM_ANALISE',
    'EM_TRATAMENTO',
    'AGUARDANDO_TERCEIRO',
    'AGUARDANDO_DECISAO',
    'CONCLUIDA',
    'CANCELADA',
  ]);
  const allowedPriorities = new Set(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']);
  const allowedUnits = new Set(['DIAS', 'HORAS', 'MESES', 'ANOS', 'UTEIS']);

  const warnings: string[] = Array.isArray(raw?.warnings)
    ? raw.warnings.map(String).map((v: string) => v.trim()).filter(Boolean).slice(0, 12)
    : [];

  const rawIdent = raw?.identification || raw || {};
  const rawClass = raw?.classification || raw || {};
  const rawValues = raw?.values || {};
  const rawDeadline = raw?.deadline || {};
  const rawObligation = raw?.obligation || {};

  // 1. Identificação Processual
  let rawProcessNumber = textOrNull(rawIdent?.numeroProcesso?.value ?? rawIdent?.numeroProcesso ?? raw?.processNumber);
  let processNumberConfidence = clampConfidence(rawIdent?.numeroProcesso?.confidence ?? raw?.processNumberConfidence);
  let processNumberEvidence = extractEvidence(rawIdent?.numeroProcesso?.evidence ?? raw?.processNumberEvidence);

  let canonicalProcessNumber: string | null = null;
  if (rawProcessNumber) {
    const formatted = canonicalCnj(rawProcessNumber);
    if (formatted && isValidCnj(formatted)) {
      canonicalProcessNumber = formatted;
      // Validação determinística de evidência
      if (deterministicContext && !evidenceContainsProcessNumber(deterministicContext, formatted)) {
        warnings.push(`CNJ ${formatted} não localizado estritamente nos blocos de evidência.`);
        processNumberConfidence = Math.min(processNumberConfidence, 0.40);
      }
    } else {
      warnings.push(`CNJ ${rawProcessNumber} possui dígito verificador ou formato inválido.`);
      processNumberConfidence = Math.min(processNumberConfidence, 0.30);
    }
  }

  const identification: AiIdentificationStructured = {
    numeroProcesso: {
      value: canonicalProcessNumber,
      confidence: canonicalProcessNumber ? processNumberConfidence : 0,
      evidence: processNumberEvidence,
    },
    protocolo: normalizeField(rawIdent?.protocolo ?? raw?.protocol, textOrNull),
    comarca: normalizeField(rawIdent?.comarca ?? raw?.comarca, textOrNull),
    uf: normalizeField(rawIdent?.uf ?? raw?.uf, (v) => {
      const s = textOrNull(v);
      return s ? s.toUpperCase().slice(0, 2) : null;
    }),
    orgaoJulgador: normalizeField(rawIdent?.orgaoJulgador ?? rawIdent?.court ?? raw?.court, textOrNull),
    municipio: normalizeField(rawIdent?.municipio ?? raw?.municipality, textOrNull),
  };

  // 2. Classificação
  const classification: AiClassificationStructured = {
    tipoDemanda: normalizeField(rawClass?.tipoDemanda ?? raw?.demandType, textOrNull),
    subtipoDemanda: normalizeField(rawClass?.subtipoDemanda ?? raw?.demandSubtype, textOrNull),
    objetoDemanda: normalizeField(rawClass?.objetoDemanda ?? raw?.demandObject, textOrNull),
    natureza: normalizeField(rawClass?.natureza ?? raw?.nature, textOrNull),
    faseProcessual: normalizeField(rawClass?.faseProcessual ?? raw?.phase, textOrNull),
    tutelaUrgencia: normalizeField(rawClass?.tutelaUrgencia ?? raw?.tutela, textOrNull),
    prioridade: normalizeField(rawClass?.prioridade ?? raw?.priority, (v) => {
      const s = String(v || '').toUpperCase();
      return allowedPriorities.has(s) ? (s as any) : null;
    }),
    situacaoBeneficiario: normalizeField(rawClass?.situacaoBeneficiario ?? raw?.beneficiaryStatus, textOrNull),
    categoriaDemanda: normalizeField(rawClass?.categoriaDemanda ?? rawClass?.categoria_demanda, textOrNull),
    subcategoriaDemanda: normalizeField(rawClass?.subcategoriaDemanda ?? rawClass?.subcategoria_demanda, textOrNull),
    naturezasJuridicas: normalizeField(rawClass?.naturezasJuridicas ?? rawClass?.naturezaJuridica ?? rawClass?.natureza_juridica, (v) => {
      const arr = Array.isArray(v) ? v : (typeof v === 'string' && v.trim() ? [v] : []);
      const clean = [...new Set(arr.map((x:any) => String(x || '').trim().toUpperCase()).filter(Boolean))];
      return clean.length ? clean : null;
    }),
    detalheDemanda: normalizeField(rawClass?.detalheDemanda ?? rawClass?.detalhe_demanda, textOrNull),
    suggestedStatus: normalizeField(rawClass?.suggestedStatus ?? raw?.suggestedStatus, (v) => {
      const s = String(v || '').toUpperCase();
      return allowedStatuses.has(s) ? (s as any) : null;
    }),
  };

  // 3. Partes
  const partiesStructured: AiPartyExtracted[] = Array.isArray(raw?.parties)
    ? raw.parties.slice(0, 12).map((item: any) => ({
        name: normalizeField(item?.name, textOrNull),
        role: normalizeField(item?.role, textOrNull),
        roleType: ['AUTOR', 'REU', 'BENEFICIARIO', 'TERCEIRO', 'OUTRO'].includes(String(item?.roleType || '').toUpperCase())
          ? (String(item.roleType).toUpperCase() as any)
          : null,
      })).filter((p: AiPartyExtracted) => p.name.value && p.name.value.length >= 3)
    : [];

  const partiesLegacy: AiPartyFinding[] = partiesStructured.map((p) => ({
    name: p.name.value || '',
    role: p.role.value,
    confidence: p.name.confidence,
  }));

  // 4. Valores Financeiros
  const rawMoneyList = Array.isArray(raw?.moneyFindings) ? raw.moneyFindings : [];
  let parsedValorCausa = normalizeField(rawValues?.valorCausa, numberOrNull);
  let parsedValorCondenacao = normalizeField(rawValues?.valorCondenacao, numberOrNull);
  let parsedValorMulta = normalizeField(rawValues?.valorMulta, numberOrNull);
  let parsedValorMultaDiaria = normalizeField(rawValues?.valorMultaDiaria ?? rawObligation?.dailyPenalty, numberOrNull);
  let parsedValorMultaLimite = normalizeField(rawValues?.valorMultaLimite ?? rawValues?.limiteMulta ?? rawValues?.tetoMulta, numberOrNull);

  // Fallback a partir de moneyFindings legado
  if (parsedValorCausa.value === null) {
    const found = rawMoneyList.find((m: any) => String(m?.type || '').toUpperCase() === 'VALOR_CAUSA');
    if (found) parsedValorCausa = { value: numberOrNull(found.amount), confidence: clampConfidence(found.confidence), evidence: extractEvidence(found.evidence) };
  }
  if (parsedValorMultaDiaria.value === null) {
    const found = rawMoneyList.find((m: any) => ['MULTA_DIARIA', 'ASTREINTE_DIARIA'].includes(String(m?.type || '').toUpperCase()));
    if (found) parsedValorMultaDiaria = { value: numberOrNull(found.amount), confidence: clampConfidence(found.confidence), evidence: extractEvidence(found.evidence) };
  }
  if (parsedValorMultaLimite.value === null) {
    const found = rawMoneyList.find((m: any) => ['LIMITE_MULTA', 'TETO_MULTA', 'MULTA_LIMITE'].includes(String(m?.type || '').toUpperCase()));
    if (found) parsedValorMultaLimite = { value: numberOrNull(found.amount), confidence: clampConfidence(found.confidence), evidence: extractEvidence(found.evidence) };
  }
  if (parsedValorMulta.value === null) {
    const found = rawMoneyList.find((m: any) => ['MULTA', 'ASTREINTE', 'BLOQUEIO'].includes(String(m?.type || '').toUpperCase()));
    if (found) parsedValorMulta = { value: numberOrNull(found.amount), confidence: clampConfidence(found.confidence), evidence: extractEvidence(found.evidence) };
  }

  // Para compatibilidade, uma multa genérica só vira diária se não houver teto distinto.
  if (parsedValorMultaDiaria.value === null && parsedValorMulta.value !== null && parsedValorMultaLimite.value === null) {
    parsedValorMultaDiaria = parsedValorMulta;
  }

  const outrosValores = Array.isArray(rawValues?.outrosValores)
    ? rawValues.outrosValores.slice(0, 8).map((item: any) => ({
        amount: normalizeField(item?.amount, numberOrNull),
        type: String(item?.type || 'OUTRO').trim().slice(0, 80),
        currency: 'BRL' as const,
        context: textOrNull(item?.context),
      })).filter((item: any) => item.amount.value !== null)
    : rawMoneyList.map((item: any) => ({
        amount: {
          value: numberOrNull(item?.amount),
          confidence: clampConfidence(item?.confidence),
          evidence: extractEvidence(item?.evidence),
        },
        type: String(item?.type || 'VALOR_MENCIONADO').trim().slice(0, 80),
        currency: 'BRL' as const,
        context: null,
      })).filter((item: any) => item.amount.value !== null);

  const values: AiMonetaryValues = {
    valorCausa: parsedValorCausa,
    valorCondenacao: parsedValorCondenacao,
    valorMulta: parsedValorMulta,
    valorMultaDiaria: parsedValorMultaDiaria,
    valorMultaLimite: parsedValorMultaLimite,
    outrosValores,
  };

  const moneyFindingsLegacy: AiMoneyFinding[] = [
    ...(values.valorCausa.value !== null ? [{ amount: values.valorCausa.value, type: 'VALOR_CAUSA', currency: 'BRL' as const, confidence: values.valorCausa.confidence }] : []),
    ...(values.valorCondenacao.value !== null ? [{ amount: values.valorCondenacao.value, type: 'CONDENACAO', currency: 'BRL' as const, confidence: values.valorCondenacao.confidence }] : []),
    ...(values.valorMultaDiaria.value !== null ? [{ amount: values.valorMultaDiaria.value, type: 'MULTA_DIARIA', currency: 'BRL' as const, confidence: values.valorMultaDiaria.confidence }] : []),
    ...(values.valorMultaLimite.value !== null ? [{ amount: values.valorMultaLimite.value, type: 'LIMITE_MULTA', currency: 'BRL' as const, confidence: values.valorMultaLimite.confidence }] : []),
    ...(values.valorMulta.value !== null && values.valorMulta.value !== values.valorMultaDiaria.value && values.valorMulta.value !== values.valorMultaLimite.value ? [{ amount: values.valorMulta.value, type: 'MULTA', currency: 'BRL' as const, confidence: values.valorMulta.confidence }] : []),
    ...values.outrosValores.map((ov) => ({ amount: ov.amount.value || 0, type: ov.type, currency: 'BRL' as const, confidence: ov.amount.confidence })),
  ];

  // 5. Prazo Processual Estruturado
  const deadlineExists = strictBoolean(rawDeadline?.exists);
  const deadlineConfidence = clampConfidence(rawDeadline?.confidence);
  const deadlineStructured: AiDeadlineStructured = {
    exists: deadlineExists,
    confidence: deadlineConfidence,
    quantity: normalizeField(rawDeadline?.quantity, numberOrNull),
    unit: normalizeField(rawDeadline?.unit, (v) => {
      const s = String(v || '').toUpperCase();
      return allowedUnits.has(s) ? s : 'DIAS';
    }),
    dueDate: normalizeField(rawDeadline?.dueDate, (v) => {
      const s = textOrNull(v);
      if (!s) return null;
      // Validação de formato de data YYYY-MM-DD ou ISO
      if (/^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(Date.parse(s))) {
        return s;
      }
      return null;
    }),
    triggerEvent: normalizeField(rawDeadline?.triggerEvent ?? rawDeadline?.startBasis, textOrNull),
    sourceText: textOrNull(rawDeadline?.sourceText ?? rawDeadline?.termText),
  };

  const deadlineLegacy: AiDeadlineFinding = {
    exists: deadlineStructured.exists,
    dueDate: deadlineStructured.dueDate.value,
    termText: deadlineStructured.sourceText || (deadlineStructured.quantity.value ? `${deadlineStructured.quantity.value} ${deadlineStructured.unit.value || 'dias'}` : null),
    startBasis: deadlineStructured.triggerEvent.value,
    confidence: deadlineStructured.confidence,
  };

  // 6. Obrigação Estruturada
  const obligationExists = strictBoolean(rawObligation?.exists);
  const obligationConfidence = clampConfidence(rawObligation?.confidence);
  const obligationStructured: AiObligationStructured = {
    exists: obligationExists,
    confidence: obligationConfidence,
    description: normalizeField(rawObligation?.description, textOrNull, obligationConfidence),
    type: normalizeField(rawObligation?.type, textOrNull, obligationConfidence),
    criticality: normalizeField(rawObligation?.criticality ?? rawObligation?.criticidade, (v) => {
      const s = String(v || '').toUpperCase();
      return allowedPriorities.has(s) ? (s as any) : 'ALTA';
    }),
    dailyPenalty: normalizeField(rawObligation?.dailyPenalty ?? rawValues?.valorMultaDiaria, numberOrNull),
  };

  const obligationLegacy: AiObligationFinding = {
    exists: obligationStructured.exists,
    description: obligationStructured.description.value,
    dueDate: deadlineStructured.dueDate.value,
    deadlineText: deadlineLegacy.termText,
    dailyPenalty: obligationStructured.dailyPenalty?.value ?? null,
    confidence: obligationStructured.confidence,
  };

  // 7. Resumo Geral & Metadados
  const confidence = clampConfidence(raw?.confidence);
  const isLegal = strictBoolean(raw?.isLegal ?? true);
  const eventType = String(raw?.eventType || 'COMUNICACAO_JURIDICA').trim().slice(0, 100);
  const timelineTitle = String(raw?.timelineTitle || eventType).trim().slice(0, 180);
  const timelineSummary = String(raw?.timelineSummary || '').trim().slice(0, 1600);
  const actionSummary = String(raw?.actionSummary || '').trim().slice(0, 1000);

  // 8. Alegações do Beneficiário (RF10)
  const rawAllegation = raw?.allegation || raw?.alegacao || raw?.dificuldadesBeneficiario;
  let allegationFinding: AiAllegationFinding | undefined = undefined;
  if (rawAllegation && typeof rawAllegation === 'object') {
    let rawNarrativa = textOrNull(rawAllegation.narrativa ?? rawAllegation.resumoDificuldades, 1000);
    if (rawNarrativa) {
      if (!rawNarrativa.startsWith('Supostamente, o(a) beneficiário(a)')) {
        rawNarrativa = `Supostamente, o(a) beneficiário(a) ${rawNarrativa.replace(/^o\(a\)\s+beneficiário\(a\)\s+/i, '')}`.trim();
      }
    }
    const canais = Array.isArray(rawAllegation.canaisMencionados)
      ? rawAllegation.canaisMencionados.map((c: any) => String(c || '').trim()).filter(Boolean)
      : [];

    allegationFinding = {
      narrativa: rawNarrativa,
      tentativasContatoQtd: numberOrNull(rawAllegation.tentativasContatoQtd),
      canaisMencionados: canais,
      setorMencionado: textOrNull(rawAllegation.setorMencionado, 150),
      tempoEsperaDias: numberOrNull(rawAllegation.tempoEsperaDias),
      tempoEsperaTexto: textOrNull(rawAllegation.tempoEsperaTexto, 150),
      dificuldadeRelatada: textOrNull(rawAllegation.dificuldadeRelatada, 300),
      desfechoAlegado: textOrNull(rawAllegation.desfechoAlegado, 300),
      confidence: clampConfidence(rawAllegation.confidence ?? 0.85),
    };
  }

  return {
    isLegal,
    eventType,
    confidence,

    identification,
    classification,
    partiesStructured,
    values,
    deadlineStructured,
    obligationStructured,

    // Compatibilidade plana
    processNumber: identification.numeroProcesso.value,
    processNumberConfidence: identification.numeroProcesso.confidence,
    parties: partiesLegacy,
    nature: classification.natureza.value,
    phase: classification.faseProcessual.value,
    tutela: classification.tutelaUrgencia.value,
    municipality: identification.municipio.value,
    comarca: identification.comarca.value,
    uf: identification.uf.value,
    beneficiaryStatus: classification.situacaoBeneficiario.value,
    demandType: classification.tipoDemanda.value,
    demandSubtype: classification.subtipoDemanda.value,
    demandObject: classification.objetoDemanda.value,
    priority: classification.prioridade.value,
    suggestedStatus: classification.suggestedStatus.value,
    moneyFindings: moneyFindingsLegacy,
    deadline: deadlineLegacy,
    obligation: obligationLegacy,
    timelineTitle,
    timelineSummary,
    actionSummary,
    warnings,
    allegation: allegationFinding,
  };
}

export async function interpretWithGemini(params: {
  supabase: any;
  deterministic: InterpretationResult;
  subject: string;
  senderEmail: string;
  senderName: string;
}): Promise<GeminiInterpretationOutcome> {
  const apiKey = ENV.gemini.apiKey;
  if (!apiKey) return { state: 'SKIPPED_NO_KEY', model: null, result: null, error: 'GEMINI_API_KEY não configurada.' };

  const runtimeConfig = await getAiRuntimeConfig(params.supabase);
  let model = runtimeConfig.model;
  if (!model) return { state: 'SKIPPED_NO_MODEL', model: null, result: null, error: 'Modelo Gemini não configurado.' };

  const payload = {
    source: {
      subject: params.subject.slice(0, 800),
      senderEmail: params.senderEmail,
      senderName: params.senderName,
    },
    deterministic: {
      classification: params.deterministic.classification,
      relevanceScore: params.deterministic.relevanceScore,
      aiNeedScore: params.deterministic.aiNeedScore,
      processNumbers: params.deterministic.extractedData.cnjs.slice(0, 6),
      protocols: params.deterministic.extractedData.protocols.slice(0, 6),
      partyNames: params.deterministic.extractedData.partyNames.slice(0, 12),
      dates: params.deterministic.extractedData.dates.slice(0, 12),
      monetaryValues: params.deterministic.extractedData.monetaryValues.slice(0, 12),
      courtMentions: params.deterministic.extractedData.courtMentions.slice(0, 8),
      keywords: params.deterministic.extractedData.keywordsFound.slice(0, 20),
    },
    evidence: params.deterministic.rankedEvidence.map((block, index) => ({
      index: index + 1,
      source: block.source,
      kind: block.kind,
      score: block.score,
      text: block.text,
    })),
  };

  const instruction = `Você é um interpretador jurídico estruturado de alta precisão para uma operadora de saúde brasileira.\n\n` +
    `DIRETRIZES FUNDAMENTAIS:\n` +
    `1. Use SOMENTE as evidências textuais fornecidas. Nunca invente fatos ou números.\n` +
    `2. Retorne confiança INDIVIDUAL (entre 0.00 e 1.00) e uma evidência curta (trecho exato) para CADA campo relevante.\n` +
    `3. VALORES FINANCEIROS: Diferencie estritamente valorCausa, valorCondenacao, valorMultaDiaria e valorMultaLimite. Se o texto disser "multa diária de R$ 1.000, limitada a R$ 20.000", valorMultaDiaria=1000 e valorMultaLimite=20000. O teto jamais pode ser tratado como multa diária. valorMulta é apenas compatibilidade genérica. Nunca converta multa em valor da causa.\n` +
    `4. PRAZO vs DATA: Confiança na existência do prazo (exists) é SEPARADA da confiança da data limite final calculada (dueDate). Se houver prazo em dias mas sem data final determinável, dueDate deve ser null.\n` +
    `5. OBRIGAÇÃO: Confiança na obrigação de fazer/não fazer (exists) é SEPARADA da existência de prazos normais. Só marque exists: true se houver determinação/obrigação de cumprimento explícita.\n` +
    `6. CNJ: Só informe numeroProcesso se estiver presente nas evidências e válido no padrão CNJ (20 dígitos).\n` +
    `7. DIFICULDADES DO BENEFICIÁRIO (RF10): Se houver relato de dificuldades enfrentadas pelo beneficiário (tentativas de contato telefônico, setores envolvidos, tempo de espera), extraia no objeto "allegation". OBRIGATÓRIO: A narrativa DEVE começar com o prefixo exato "Supostamente, o(a) beneficiário(a)" (ex: "Supostamente, o(a) beneficiário(a) realizou 3 ligações para o SAC aguardando 15 dias sem retorno...").\n\n` +
    `Retorne SOMENTE JSON válido estruturado exatamente no seguinte formato:\n` +
    JSON.stringify({
      isLegal: true,
      eventType: 'INTIMACAO|CITACAO|DECISAO_LIMINAR|SENTENCA|DESPACHO|ACORDAO|AUDIENCIA|OUTRO',
      confidence: 0.95,
      identification: {
        numeroProcesso: { value: '0000000-00.0000.0.00.0000', confidence: 0.99, evidence: 'trecho' },
        protocolo: { value: null, confidence: 0.0, evidence: null },
        comarca: { value: 'Comarca', confidence: 0.90, evidence: 'trecho' },
        uf: { value: 'SP', confidence: 0.95, evidence: 'trecho' },
        orgaoJulgador: { value: 'Vara / Tribunal', confidence: 0.85, evidence: 'trecho' },
        municipio: { value: 'Município', confidence: 0.85, evidence: 'trecho' }
      },
      classification: {
        tipoDemanda: { value: 'OBRIGACAO_DE_FAZER|RESSARCIMENTO|INDENIZATORIA|OUTRO', confidence: 0.90, evidence: 'trecho' },
        subtipoDemanda: { value: null, confidence: 0.0, evidence: null },
        objetoDemanda: { value: 'Ex: Medicamento / Cirurgia', confidence: 0.85, evidence: 'trecho' },
        natureza: { value: 'CIVEL|CONSUMIDOR|TRABALHISTA|REGULATORIO', confidence: 0.90, evidence: 'trecho' },
        faseProcessual: { value: 'INICIAL|LIMINAR|INSTRUCAO|SENTENCA|RECURSAL|CUMPRIMENTO_SENTENCA', confidence: 0.90, evidence: 'trecho' },
        tutelaUrgencia: { value: 'DEFERIDA|INDEFERIDA|REVOGADA|NAO_APLICAVEL', confidence: 0.90, evidence: 'trecho' },
        prioridade: { value: 'BAIXA|MEDIA|ALTA|URGENTE', confidence: 0.90, evidence: 'trecho' },
        situacaoBeneficiario: { value: null, confidence: 0.0, evidence: null },
        suggestedStatus: { value: 'TRIAGEM|EM_ANALISE|EM_TRATAMENTO', confidence: 0.90, evidence: 'trecho' }
      },
      parties: [
        {
          name: { value: 'Nome da Parte', confidence: 0.95, evidence: 'trecho' },
          role: { value: 'Autor / Requerente', confidence: 0.90, evidence: 'trecho' },
          roleType: 'AUTOR'
        }
      ],
      values: {
        valorCausa: { value: null, confidence: 0.0, evidence: null },
        valorCondenacao: { value: null, confidence: 0.0, evidence: null },
        valorMulta: { value: null, confidence: 0.0, evidence: null },
        valorMultaDiaria: { value: null, confidence: 0.0, evidence: null },
        valorMultaLimite: { value: null, confidence: 0.0, evidence: null },
        outrosValores: [
          { amount: { value: 1000, confidence: 0.85, evidence: 'trecho' }, type: 'MULTA_DIARIA', currency: 'BRL', context: 'astreinte' }
        ]
      },
      deadline: {
        exists: false,
        confidence: 0.0,
        quantity: { value: null, confidence: 0.0, evidence: null },
        unit: { value: 'DIAS', confidence: 0.0, evidence: null },
        dueDate: { value: null, confidence: 0.0, evidence: null },
        triggerEvent: { value: null, confidence: 0.0, evidence: null },
        sourceText: null
      },
      obligation: {
        exists: false,
        confidence: 0.0,
        description: { value: null, confidence: 0.0, evidence: null },
        type: { value: null, confidence: 0.0, evidence: null },
        criticality: { value: 'ALTA', confidence: 0.0, evidence: null },
        dailyPenalty: { value: null, confidence: 0.0, evidence: null }
      },
      allegation: {
        narrativa: 'Supostamente, o(a) beneficiário(a) tentou contato...',
        tentativasContatoQtd: null,
        canaisMencionados: [],
        setorMencionado: null,
        tempoEsperaDias: null,
        tempoEsperaTexto: null,
        dificuldadeRelatada: null,
        desfechoAlegado: null,
        confidence: 0.0
      },
      timelineTitle: 'Título sucinto do evento',
      timelineSummary: 'Resumo factual e objetivo dos fatos e determinações',
      actionSummary: 'Ação operacional recomendada',
      warnings: []
    });

  try {
    const requestText = `${instruction}\n\nDADOS PARA INTERPRETAÇÃO:\n${JSON.stringify(payload)}`;
    const estimatedTokens = Math.ceil(requestText.length / 4) + 4096;
    const timeoutMs = ENV.gemini.timeoutMs;

    console.log('[AI PROCESS] 4 - governança delegada ao AI Router');
    console.log('[GEMINI] configuração', {
      primaryModel: model,
      apiKeyPresent: Boolean(apiKey),
      timeoutMs,
    });
    console.log('[GEMINI] iniciando chamada', {
      evidenceBlocks: payload.evidence.length,
      approximateChars: requestText.length,
    });
    console.log('[AI PROCESS] 6 - chamando AI Router');

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let raw: any;
    let result: AiLegalInterpretation | null = null;
    let lastInvalidJsonError: any = null;
    let preferredModel: string | null = null;
    let routerCallsMade = 0;

    for (let attempt = 1; attempt <= ENV.gemini.retryInvalidJsonAttempts; attempt += 1) {
      const contents = attempt === 1
        ? requestText
        : buildInvalidJsonRetryInstruction({
            originalRequest: requestText,
            parseMessage: String(lastInvalidJsonError?.message || 'JSON inválido'),
          });

      console.log('[GEMINI] tentativa de conteúdo estruturado', {
        attempt,
        maxAttempts: ENV.gemini.retryInvalidJsonAttempts,
        preferredModel,
      });

      const routed = await generateContentWithAiRouter({
        supabase: params.supabase,
        contents,
        config: { responseMimeType: 'application/json' },
        estimatedTokens,
        purpose: 'LEGAL_INTERPRETATION',
        preferredModel,
        timeoutMs,
      });

      model = routed.model;
      preferredModel = routed.model;
      routerCallsMade += routed.callsMade;

      console.log('[GEMINI] resposta recebida via router', {
        model,
        triedModels: routed.triedModels,
      });
      console.log('[AI PROCESS] 7 - IA respondeu');

      const text = String(routed.response?.text || '').trim();
      if (!text) throw Object.assign(new Error('Gemini retornou resposta vazia.'), { code: 'GEMINI_EMPTY_RESPONSE' });

      try {
        const parsed = parseGeminiJson<any>(text);
        raw = parsed.value;

        if (parsed.repaired) {
          console.warn('[GEMINI] JSON recuperado deterministicamente sem nova chamada', {
            attempt,
            model,
            repairSteps: parsed.repairSteps,
          });
        }
      } catch (parseError: any) {
        lastInvalidJsonError = parseError;
        const message = String(parseError?.message || 'JSON inválido retornado pelo Gemini.');

        if (attempt < ENV.gemini.retryInvalidJsonAttempts) {
          console.warn('[GEMINI] JSON inválido após reparo local; nova geração agendada', {
            attempt,
            nextAttempt: attempt + 1,
            model,
            delayMs: ENV.gemini.retryInvalidJsonDelayMs,
            repairSteps: parseError?.repairSteps || [],
            message: message.slice(0, 220),
          });
          await sleep(ENV.gemini.retryInvalidJsonDelayMs);
          continue;
        }
        throw parseError;
      }

      result = normalizeResult(raw, params.deterministic);
      break;
    }

    if (!result) throw new Error('Gemini não retornou interpretação válida após as tentativas configuradas.');

    const budget = await getAiBudgetState(params.supabase, { model }).catch(() => null);

    return {
      state: 'SUCCESS',
      model,
      result,
      error: null,
      budget: budget ? {
        callsToday: budget.requestsToday,
        configuredBudget: budget.providerRpd,
        effectiveLimit: budget.effectiveRpd,
      } : undefined,
    };
  } catch (error: any) {
    const rawCode = error?.code;
    const status = Number(error?.status || error?.response?.status || (typeof rawCode === 'number' ? rawCode : 0));
    const message = String(error?.message || 'Falha desconhecida na interpretação Gemini.').slice(0, 500);
    console.error('[GEMINI] falha', {
      name: error?.name,
      message,
      status: status || undefined,
      code: rawCode,
    });
    return { state: 'FAILED', model, result: null, error: message,
      errorStatus: status || undefined,
      errorCode: typeof rawCode === 'string' ? rawCode : undefined };
  }
}
