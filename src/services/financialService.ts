import { supabase } from './supabase';
import {
  ProcessDecision,
  DecisionTipo,
  DecisionEstadoValor,
  ProcessFinancialComponent,
  FinancialFase,
  FinancialNatureza,
  FinancialStatusRevisao,
  ProcessFinancialHighlight,
} from '../types/database';

export interface CreateDecisionDTO {
  process_id: string;
  tipo: DecisionTipo;
  data_decisao?: string | null;
  estado_valor: DecisionEstadoValor;
  montante?: number | null;
  moeda?: string;
  is_referencia?: boolean;
  documento_ref?: string | null;
  trecho_citado?: string | null;
  motivo_escolha?: string | null;
}

export interface CreateFinancialComponentDTO {
  process_id: string;
  provider_id?: string | null;
  service_id?: string | null;
  decision_id?: string | null;
  fase: FinancialFase;
  natureza: FinancialNatureza;
  valor: number;
  moeda?: string;
  cumulativo?: boolean;
  sobreposto?: boolean;
  status_revisao?: FinancialStatusRevisao;
  fonte?: string | null;
  descricao?: string | null;
}

class FinancialService {
  /**
   * RF09 — Lista decisões registradas para o processo ordenadas por data
   */
  async getDecisions(processId: string): Promise<{ data: ProcessDecision[]; error: string | null }> {
    const { data, error } = await supabase
      .from('process_decisions')
      .select('*')
      .eq('process_id', processId)
      .order('data_decisao', { ascending: false, nullsFirst: false })
      .order('criado_em', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as ProcessDecision[], error: null };
  }

  /**
   * RF09 — Cria nova decisão judicial versionada
   */
  async createDecision(
    dto: CreateDecisionDTO,
    userId?: string,
  ): Promise<{ data: ProcessDecision | null; error: string | null }> {
    if (dto.estado_valor === 'QUANTIFICADA' && (dto.montante === null || dto.montante === undefined)) {
      return { data: null, error: 'Decisão quantificada requer o preenchimento do montante.' };
    }
    if (['ILIQUIDA', 'NAO_MONETARIA'].includes(dto.estado_valor)) {
      dto.montante = null;
    }

    const { data, error } = await supabase
      .from('process_decisions')
      .insert({
        ...dto,
        moeda: dto.moeda ?? 'BRL',
        is_referencia: dto.is_referencia ?? false,
        criado_por: userId ?? null,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as ProcessDecision, error: null };
  }

  /**
   * RF09 — Define uma decisão existente como a decisão de referência do processo
   */
  async setAsReference(
    decisionId: string,
    processId: string,
    motivo?: string,
    userId?: string,
  ): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('process_decisions')
      .update({
        is_referencia: true,
        motivo_escolha: motivo ?? 'Definida como referência pelo usuário',
        revisado_por: userId ?? null,
        revisado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', decisionId)
      .eq('process_id', processId);

    if (error) return { error: error.message };
    return { error: null };
  }

  /**
   * RF13 — Lista componentes financeiros discriminados do processo
   */
  async getComponents(processId: string): Promise<{ data: ProcessFinancialComponent[]; error: string | null }> {
    const { data, error } = await supabase
      .from('process_financial_components')
      .select('*')
      .eq('process_id', processId)
      .order('criado_em', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as ProcessFinancialComponent[], error: null };
  }

  /**
   * RF13 — Registra um novo componente financeiro
   */
  async createComponent(
    dto: CreateFinancialComponentDTO,
    userId?: string,
  ): Promise<{ data: ProcessFinancialComponent | null; error: string | null }> {
    if (typeof dto.valor !== 'number' || isNaN(dto.valor)) {
      return { data: null, error: 'Valor financeiro inválido.' };
    }

    const { data, error } = await supabase
      .from('process_financial_components')
      .insert({
        ...dto,
        moeda: dto.moeda ?? 'BRL',
        cumulativo: dto.cumulativo ?? true,
        sobreposto: dto.sobreposto ?? false,
        status_revisao: dto.status_revisao ?? 'PENDENTE',
        criado_por: userId ?? null,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as ProcessFinancialComponent, error: null };
  }

  /**
   * RF13 — Atualiza componente financeiro (revisão humana, sobreposição ou cumulatividade)
   */
  async updateComponent(
    id: string,
    updates: Partial<ProcessFinancialComponent>,
    userId?: string,
  ): Promise<{ data: ProcessFinancialComponent | null; error: string | null }> {
    const { data, error } = await supabase
      .from('process_financial_components')
      .update({
        ...updates,
        revisado_por: userId ?? null,
        revisado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as ProcessFinancialComponent, error: null };
  }

  /**
   * RF13 — Remove um componente financeiro
   */
  async deleteComponent(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('process_financial_components')
      .delete()
      .eq('id', id);

    if (error) return { error: error.message };
    return { error: null };
  }

  /**
   * RF09 — Consulta o destaque de valores calculado da view analítica
   */
  async getHighlight(processId: string): Promise<{ data: ProcessFinancialHighlight | null; error: string | null }> {
    const { data, error } = await supabase
      .from('v_process_financial_highlight')
      .select('*')
      .eq('process_id', processId)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    return { data: data as ProcessFinancialHighlight | null, error: null };
  }
}

export const financialService = new FinancialService();
