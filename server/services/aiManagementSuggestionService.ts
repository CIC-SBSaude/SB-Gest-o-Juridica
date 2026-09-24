import { ENV } from '../config/env';
import { parseGeminiJson, buildInvalidJsonRetryInstruction } from './geminiJsonService';
import { generateContentWithAiRouter } from './aiRouterService';

const STATUS_ALLOWED = new Set([
  'NAO_CLASSIFICADO','RECEBIDO','EM_TRIAGEM','AGUARDANDO_AREA_INTERNA','AGUARDANDO_ESCRITORIO',
  'EM_PREPARACAO_ESCRITORIO','RESPONDIDO_PROTOCOLADO','AGUARDANDO_DECISAO','COM_DECISAO',
  'EM_RECURSO','EM_CUMPRIMENTO','SUSPENSO',
]);
const RESPONSIBILITY_ALLOWED = new Set(['OPERADORA','ESCRITORIO','JUDICIARIO','TERCEIRO','SEM_RESPONSAVEL']);
const RISK_ALLOWED = new Set(['NAO_CLASSIFICADO','BAIXO','MEDIO','ALTO','CRITICO']);

type SuggestionField = {
  value: string | null;
  confidence: number;
  rationale: string;
  basis: string[];
};

export type ManagementSuggestionPayload = {
  resumo_executivo: SuggestionField;
  status_operacional: SuggestionField;
  responsabilidade_atual: SuggestionField;
  nivel_risco: SuggestionField;
  proxima_acao: SuggestionField;
  warnings: string[];
};

const clamp = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
};
const text = (value: unknown, max = 1000) => {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, max) : null;
};
const list = (value: unknown, maxItems = 3, maxChars = 240) => Array.isArray(value)
  ? value.map((x) => text(x, maxChars)).filter(Boolean).slice(0, maxItems) as string[]
  : [];

function normalizeField(raw: any, kind: 'status'|'responsibility'|'risk'|'summary'|'action'): SuggestionField {
  let value = text(raw?.value, kind === 'summary' ? 1600 : kind === 'action' ? 500 : 120);
  if (kind === 'status' && value && !STATUS_ALLOWED.has(value)) value = 'NAO_CLASSIFICADO';
  if (kind === 'responsibility' && value && !RESPONSIBILITY_ALLOWED.has(value)) value = 'SEM_RESPONSAVEL';
  if (kind === 'risk' && value && !RISK_ALLOWED.has(value)) value = 'NAO_CLASSIFICADO';
  return {
    value,
    confidence: clamp(raw?.confidence),
    rationale: text(raw?.rationale, 700) || 'Sem justificativa suficiente.',
    basis: list(raw?.basis),
  };
}

function normalize(raw: any): ManagementSuggestionPayload {
  return {
    resumo_executivo: normalizeField(raw?.resumo_executivo, 'summary'),
    status_operacional: normalizeField(raw?.status_operacional, 'status'),
    responsabilidade_atual: normalizeField(raw?.responsabilidade_atual, 'responsibility'),
    nivel_risco: normalizeField(raw?.nivel_risco, 'risk'),
    proxima_acao: normalizeField(raw?.proxima_acao, 'action'),
    warnings: list(raw?.warnings, 6, 300),
  };
}

async function loadContext(supabase: any, processId: string) {
  const [processRes, managementRes, partiesRes, obligationsRes, pendenciesRes, interactionsRes, timelineRes, evidenceRes] = await Promise.all([
    supabase.from('processes').select('*').eq('id', processId).maybeSingle(),
    supabase.from('v_process_management').select('*').eq('id', processId).maybeSingle(),
    supabase.from('process_parties').select('name,role,document_number').eq('process_id', processId).limit(12),
    supabase.from('obligations').select('descricao,prazo,status,criticidade,valor_multa_diaria,valor_multa_limite').eq('process_id', processId).order('created_at', { ascending: false }).limit(10),
    supabase.from('process_pendencies').select('description,responsible_type,due_at,status,criticality').eq('process_id', processId).order('created_at', { ascending: false }).limit(10),
    supabase.from('process_law_firm_interactions').select('interaction_type,sent_at,expected_return_at,received_at,subject,summary').eq('process_id', processId).order('created_at', { ascending: false }).limit(8),
    supabase.from('process_timeline').select('tipo,titulo,descricao,data_hora,origem').eq('process_id', processId).order('data_hora', { ascending: false }).limit(8),
    supabase.from('process_evidence').select('field_name,extracted_value,source_type,confidence,evidence_excerpt').eq('process_id', processId).order('created_at', { ascending: false }).limit(12),
  ]);

  if (processRes.error || !processRes.data) throw new Error(processRes.error?.message || 'Processo não encontrado.');

  const p = processRes.data;
  const mgmt = managementRes.data || {};
  const snapshot = {
    process: {
      id: p.id,
      numero_processo: p.numero_processo,
      protocolo_externo: p.protocolo_externo,
      natureza: p.natureza,
      fase_processual: p.fase_processual,
      tutela_atual: p.tutela_atual,
      municipio: p.municipio,
      comarca: p.comarca,
      uf: p.uf,
      situacao_beneficiario: p.situacao_beneficiario,
      valor_causa: p.valor_causa,
      tipo_demanda: p.tipo_demanda,
      subtipo_demanda: p.subtipo_demanda,
      objeto_demanda: text(p.objeto_demanda, 1800),
      prioridade: p.prioridade,
      status_atual: p.status_atual,
      status_operacional: p.status_operacional,
      responsabilidade_atual: p.responsabilidade_atual,
      nivel_risco: p.nivel_risco,
      proxima_acao: text(p.proxima_acao, 500),
      proxima_acao_prazo: p.proxima_acao_prazo,
      resumo_executivo: text(p.resumo_executivo, 1600),
      exposicao_estimada: p.exposicao_estimada,
    },
    operational: {
      semaforo: mgmt.semaforo_operacional || null,
      alert_codes: Array.isArray(mgmt.alert_codes) ? mgmt.alert_codes : [],
      dias_com_responsavel_atual: mgmt.dias_com_responsavel_atual ?? null,
      obrigacao_critica_descricao: text(mgmt.obrigacao_critica_descricao, 500),
      obrigacao_critica_prazo: mgmt.obrigacao_critica_prazo ?? null,
      pendencia_critica_descricao: text(mgmt.pendencia_critica_descricao, 500),
      pendencia_critica_prazo: mgmt.pendencia_critica_prazo ?? null,
      escritorio_retorno_esperado: mgmt.escritorio_retorno_esperado ?? null,
      escritorio_dias_atraso: mgmt.escritorio_dias_atraso ?? null,
      escritorio_followup_devido: mgmt.escritorio_followup_devido ?? false,
    },
    parties: partiesRes.data || [],
    obligations: obligationsRes.data || [],
    pendencies: pendenciesRes.data || [],
    law_firm_interactions: interactionsRes.data || [],
    timeline: (timelineRes.data || []).map((x: any) => ({ ...x, descricao: text(x.descricao, 700) })),
    evidence: (evidenceRes.data || []).map((x: any) => ({
      field_name: x.field_name,
      extracted_value: x.extracted_value,
      source_type: x.source_type,
      confidence: x.confidence,
      evidence_excerpt: text(x.evidence_excerpt, 600),
    })),
  };
  return snapshot;
}

export async function generateManagementSuggestions(params: {
  supabase: any;
  processId: string;
  actorId?: string | null;
  generationSource?: string;
  queueId?: string;
  queueRequestedAt?: string;
}) {
  const { supabase, processId, actorId } = params;
  if (!ENV.gemini.apiKey) throw Object.assign(new Error('GEMINI_API_KEY não configurada.'), { status: 503 });
  const context = await loadContext(supabase, processId);
  const instruction = `Você é um assistente de gestão jurídica interna de uma operadora de saúde brasileira.\n` +
    `Use SOMENTE o contexto estruturado fornecido. Não invente fatos. Não substitua decisão humana.\n` +
    `Sua tarefa é produzir SUGESTÕES GERENCIAIS, não decisões jurídicas.\n\n` +
    `REGRAS OBRIGATÓRIAS:\n` +
    `1. Nunca sugira ENCERRADO. Encerramento é decisão exclusivamente humana.\n` +
    `2. Nunca sugira exposição estimada, responsável nominal, cumprimento de obrigação ou troca de escritório.\n` +
    `3. status_operacional só pode ser um de: ${Array.from(STATUS_ALLOWED).join(', ')}.\n` +
    `4. responsabilidade_atual só pode ser OPERADORA, ESCRITORIO, JUDICIARIO, TERCEIRO ou SEM_RESPONSAVEL.\n` +
    `5. nivel_risco só pode ser NAO_CLASSIFICADO, BAIXO, MEDIO, ALTO ou CRITICO. Se faltarem elementos suficientes, use NAO_CLASSIFICADO.\n` +
    `6. Coerência: AGUARDANDO_ESCRITORIO/EM_PREPARACAO_ESCRITORIO => ESCRITORIO; AGUARDANDO_AREA_INTERNA => OPERADORA; AGUARDANDO_DECISAO => JUDICIARIO.\n` +
    `7. resumo_executivo deve ser objetivo, executivo e factual, em no máximo 700 caracteres.\n` +
    `8. proxima_acao deve ser uma ação operacional concreta, em no máximo 280 caracteres, sem inventar prazo.\n` +
    `9. Para cada campo retorne confidence de 0 a 1, rationale curta e basis com até 3 fatos do contexto.\n\n` +
    `Retorne SOMENTE JSON válido neste formato:\n` + JSON.stringify({
      resumo_executivo: { value: 'texto ou null', confidence: 0.9, rationale: 'por quê', basis: ['fato 1'] },
      status_operacional: { value: 'EM_TRIAGEM', confidence: 0.8, rationale: 'por quê', basis: ['fato 1'] },
      responsabilidade_atual: { value: 'OPERADORA', confidence: 0.8, rationale: 'por quê', basis: ['fato 1'] },
      nivel_risco: { value: 'MEDIO', confidence: 0.75, rationale: 'por quê', basis: ['fato 1'] },
      proxima_acao: { value: 'texto ou null', confidence: 0.8, rationale: 'por quê', basis: ['fato 1'] },
      warnings: ['alerta opcional']
    });

  const requestText = `${instruction}\n\nCONTEXTO ESTRUTURADO:\n${JSON.stringify(context)}`;
  const estimatedTokens = Math.ceil(requestText.length / 4) + 4096;
  let lastInvalidJsonError: any = null;
  let preferredModel: string | null = null;

  for (let attempt = 1; attempt <= ENV.gemini.retryInvalidJsonAttempts; attempt += 1) {
    const contents = attempt === 1
      ? requestText
      : buildInvalidJsonRetryInstruction({
          originalRequest: requestText,
          parseMessage: String(lastInvalidJsonError?.message || 'JSON inválido'),
        });

    const routed = await generateContentWithAiRouter({
      supabase,
      contents,
      config: { responseMimeType: 'application/json' },
      estimatedTokens,
      purpose: 'MANAGEMENT_SUGGESTIONS',
      preferredModel,
    });
    preferredModel = routed.model;

    const rawText = String(routed.response?.text || '').trim();
    let raw: any;

    try {
      const parsed = parseGeminiJson<any>(rawText);
      raw = parsed.value;

      if (parsed.repaired) {
        console.warn('[MGMT WORKER] JSON recuperado deterministicamente sem nova chamada', {
          processId,
          model: routed.model,
          repairSteps: parsed.repairSteps,
        });
      }
    } catch (err: any) {
      lastInvalidJsonError = err;
      if (attempt < ENV.gemini.retryInvalidJsonAttempts) {
        console.warn('[MGMT WORKER] JSON inválido após reparo local; nova geração agendada', {
          processId,
          model: routed.model,
          attempt,
          nextAttempt: attempt + 1,
          repairSteps: err?.repairSteps || [],
        });
        await new Promise((r) => setTimeout(r, ENV.gemini.retryInvalidJsonDelayMs));
        continue;
      }
      throw err;
    }

    const suggestions = normalize(raw);

    await supabase.from('ai_management_suggestions')
      .update({ status: 'EXPIRADA' })
      .eq('process_id', processId)
      .in('status', ['ATIVA','APLICADA_PARCIAL']);

    const { data, error } = await supabase.from('ai_management_suggestions').insert({
      process_id: processId,
      model: routed.model,
      prompt_version: '5F-MGMT-V1',
      suggestions,
      context_snapshot: context,
      status: 'ATIVA',
      generated_by: actorId,
    }).select('*').single();
    if (error) throw new Error(`Falha ao gravar sugestões: ${error.message}`);
    return data;
  }

  throw lastInvalidJsonError || new Error('Não foi possível gerar sugestões gerenciais.');
}
