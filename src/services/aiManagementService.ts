import { supabase } from './supabase';

export type AiManagementFieldName =
  | 'resumo_executivo'
  | 'status_operacional'
  | 'responsabilidade_atual'
  | 'nivel_risco'
  | 'proxima_acao';

export type AiManagementFieldSuggestion = {
  value: string | null;
  confidence: number;
  rationale: string;
  basis: string[];
};

export type AiManagementSuggestion = {
  id: string;
  process_id: string | null;
  model: string;
  prompt_version: string;
  suggestions: Record<AiManagementFieldName, AiManagementFieldSuggestion> & { warnings?: string[] };
  status: string;
  applied_fields: string[];
  generated_at: string;
};

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sessão não disponível.');
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(await authHeaders()), ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Falha HTTP ${response.status}`);
  return payload as T;
}

export const aiManagementService = {
  async latest(processId: string): Promise<AiManagementSuggestion | null> {
    const payload = await api<{ suggestion: AiManagementSuggestion | null }>(`/api/ai/management/${processId}/suggestions/latest`);
    return payload.suggestion;
  },

  async generate(processId: string): Promise<AiManagementSuggestion> {
    const payload = await api<{ ok: boolean; suggestion: AiManagementSuggestion }>(`/api/ai/management/${processId}/suggestions`, { method: 'POST' });
    return payload.suggestion;
  },

  async apply(suggestionId: string, fieldName: AiManagementFieldName) {
    const { data, error } = await supabase.rpc('apply_ai_management_suggestion', {
      p_suggestion_id: suggestionId,
      p_field_name: fieldName,
    });
    if (error) throw new Error(error.message || 'Falha ao aplicar sugestão gerencial.');
    return data;
  },
};
