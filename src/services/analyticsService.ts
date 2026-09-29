import { supabase } from './supabase';
import {
  ProcessSegment,
  ProcessQualityPendency,
  ProcessCnjDuplicate,
} from '../types/database';

export interface SegmentCoverageItem {
  segmento: string;
  total: number;
  ativos: number;
  com_segmento: number;
  cobertura_pct: number;
}

export interface FinancialAggregates {
  totalProcessos: number;
  totalPedidosConhecidos: number;
  totalSentencasQuantificadas: number;
  qtdSentencasQuantificadas: number;
  qtdSentencasIliquidas: number;
  qtdSentencasNaoMonetarias: number;
  qtdPedidosSemSentenca: number;
  qtdRevisaoPendente: number;
}

export interface QualityPendencySummaryItem {
  campo: string;
  motivo: string;
  total_abertas: number;
  processos_afetados: number;
  alta_prioridade: number;
}

export interface ProviderCategorySummaryItem {
  categoria: string;
  qtd_prestadores: number;
  total_divida: number;
  total_danos: number;
  total_geral: number;
}

class AnalyticsService {
  /**
   * RF17 — Cobertura de classificação por segmento a partir de v_segment_coverage
   */
  async getSegmentCoverage(): Promise<{ data: SegmentCoverageItem[]; error: string | null }> {
    const { data, error } = await supabase
      .from('v_segment_coverage')
      .select('*');

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as SegmentCoverageItem[], error: null };
  }

  /**
   * RF09/RF17 — Agregação financeira estrita (não mistura pedido com sentença) a partir de v_process_financial_highlight
   */
  async getFinancialAggregates(): Promise<{ data: FinancialAggregates | null; error: string | null }> {
    const { data, error } = await supabase
      .from('v_process_financial_highlight')
      .select('*');

    if (error) return { data: null, error: error.message };

    const rows = data || [];
    let totalPedidosConhecidos = 0;
    let totalSentencasQuantificadas = 0;
    let qtdSentencasQuantificadas = 0;
    let qtdSentencasIliquidas = 0;
    let qtdSentencasNaoMonetarias = 0;
    let qtdPedidosSemSentenca = 0;
    let qtdRevisaoPendente = 0;

    for (const r of rows) {
      if (r.valor_pedido_conhecido) {
        totalPedidosConhecidos += Number(r.valor_pedido_conhecido);
      }

      switch (r.destaque_estado) {
        case 'SENTENCA_QUANTIFICADA':
          qtdSentencasQuantificadas++;
          if (r.sentenca_montante !== null) {
            totalSentencasQuantificadas += Number(r.sentenca_montante);
          }
          break;
        case 'SENTENCA_ILIQUIDA':
          qtdSentencasIliquidas++;
          break;
        case 'SENTENCA_NAO_MONETARIA':
          qtdSentencasNaoMonetarias++;
          break;
        case 'PEDIDO_SEM_SENTENCA':
          qtdPedidosSemSentenca++;
          break;
        case 'REVISAO_PENDENTE':
          qtdRevisaoPendente++;
          break;
      }
    }

    return {
      data: {
        totalProcessos: rows.length,
        totalPedidosConhecidos,
        totalSentencasQuantificadas,
        qtdSentencasQuantificadas,
        qtdSentencasIliquidas,
        qtdSentencasNaoMonetarias,
        qtdPedidosSemSentenca,
        qtdRevisaoPendente,
      },
      error: null,
    };
  }

  /**
   * RF15/RF17 — Resumo de pendências de qualidade abertas por campo
   */
  async getQualityPendencySummary(): Promise<{ data: QualityPendencySummaryItem[]; error: string | null }> {
    const { data, error } = await supabase
      .from('v_quality_pendency_summary')
      .select('*');

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as QualityPendencySummaryItem[], error: null };
  }

  /**
   * RF13/RF17 — Resumo de dívidas e danos por categoria de prestador
   */
  async getProviderCategorySummary(): Promise<{ data: ProviderCategorySummaryItem[]; error: string | null }> {
    const { data, error } = await supabase
      .from('v_provider_debt_summary')
      .select('*');

    if (error) return { data: [], error: error.message };

    const grouped: Record<string, ProviderCategorySummaryItem> = {};

    for (const r of data || []) {
      const cat = r.categoria || 'OUTRO';
      if (!grouped[cat]) {
        grouped[cat] = {
          categoria: cat,
          qtd_prestadores: 0,
          total_divida: 0,
          total_danos: 0,
          total_geral: 0,
        };
      }
      grouped[cat].qtd_prestadores += 1;
      grouped[cat].total_divida += Number(r.total_divida_servico || 0);
      grouped[cat].total_danos += Number(r.total_dano_material || 0) + Number(r.total_dano_moral || 0);
      grouped[cat].total_geral += Number(r.total_cumulativo || 0);
    }

    return { data: Object.values(grouped), error: null };
  }

  /**
   * RF18 — Lista duplicatas de CNJ registradas para análise
   */
  async getCnjDuplicates(): Promise<{ data: ProcessCnjDuplicate[]; error: string | null }> {
    const { data, error } = await supabase
      .from('process_cnj_duplicates')
      .select('*')
      .order('criado_em', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as ProcessCnjDuplicate[], error: null };
  }
}

export const analyticsService = new AnalyticsService();
