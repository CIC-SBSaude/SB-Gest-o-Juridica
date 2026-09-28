import { supabase } from './supabase';
import { ProcessOrigin, OriginDataType, OriginConfidence } from '../types/database';

export interface SetOriginDTO {
  process_id: string;
  data_origem?: string | null; // ISO date string
  competencia_mes?: number | null;
  competencia_ano?: number | null;
  tipo_data: OriginDataType;
  confiabilidade: OriginConfidence;
  email_referencia_id?: string | null;
  manual?: boolean;
  justificativa_manual?: string | null;
  definido_por?: 'SISTEMA' | 'USUARIO' | 'IA';
  definido_por_usuario_id?: string | null;
}

class OriginService {
  /**
   * RF03 — Retorna origem atual (is_current=true) de um processo.
   */
  async getCurrentOrigin(processId: string): Promise<{ data: ProcessOrigin | null; error: string | null }> {
    const { data, error } = await supabase
      .from('process_origin')
      .select('*')
      .eq('process_id', processId)
      .eq('is_current', true)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    return { data: data as ProcessOrigin | null, error: null };
  }

  /**
   * RF03 — Lista histórico completo de origens de um processo.
   */
  async getHistory(processId: string): Promise<{ data: ProcessOrigin[]; error: string | null }> {
    const { data, error } = await supabase
      .from('process_origin')
      .select('*')
      .eq('process_id', processId)
      .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as ProcessOrigin[], error: null };
  }

  /**
   * RF03 — Define ou recalcula origem.
   * Marca a anterior como is_current=false e registra substituicao.
   * Data manual exige justificativa.
   * Origem inferida NUNCA aparece como COMPROVADA.
   */
  async setOrigin(dto: SetOriginDTO): Promise<{ data: ProcessOrigin | null; error: string | null }> {
    // Validação: DATA_MANUAL exige justificativa
    if (dto.tipo_data === 'DATA_MANUAL' && !dto.justificativa_manual) {
      return { data: null, error: 'Data manual exige justificativa.' };
    }

    // Validação: inferida não pode ser COMPROVADA
    if (
      dto.confiabilidade === 'COMPROVADA' &&
      dto.tipo_data !== 'DATA_DECLARADA_EMAIL' &&
      dto.tipo_data !== 'DATA_MANUAL'
    ) {
      return {
        data: null,
        error: 'Confiabilidade COMPROVADA exige data declarada no email ou confirmação manual.',
      };
    }

    // Busca origem atual para encadear substituição
    const { data: currentOrigin } = await supabase
      .from('process_origin')
      .select('id')
      .eq('process_id', dto.process_id)
      .eq('is_current', true)
      .maybeSingle();

    // Insere nova origem
    const { data: newOrigin, error: insertError } = await supabase
      .from('process_origin')
      .insert({
        process_id: dto.process_id,
        data_origem: dto.data_origem ?? null,
        competencia_mes: dto.competencia_mes ?? null,
        competencia_ano: dto.competencia_ano ?? null,
        tipo_data: dto.tipo_data,
        confiabilidade: dto.confiabilidade,
        email_referencia_id: dto.email_referencia_id ?? null,
        manual: dto.tipo_data === 'DATA_MANUAL',
        justificativa_manual: dto.justificativa_manual ?? null,
        definido_por: dto.definido_por ?? 'SISTEMA',
        definido_por_usuario_id: dto.definido_por_usuario_id ?? null,
        is_current: true,
      })
      .select()
      .single();

    if (insertError) return { data: null, error: insertError.message };

    // Marca anterior como não-atual e aponta para a nova
    if (currentOrigin) {
      await supabase
        .from('process_origin')
        .update({
          is_current: false,
          substituido_por: newOrigin.id,
        })
        .eq('id', currentOrigin.id);
    }

    return { data: newOrigin as ProcessOrigin, error: null };
  }

  /**
   * RF03 — Recalcula competência (mês/ano) a partir de data_origem no fuso America/Sao_Paulo.
   * Retorna { mes, ano } ou null se data inválida.
   */
  static deriveCompetencia(dataOrigemISO: string): { mes: number; ano: number } | null {
    try {
      // Usa Intl.DateTimeFormat para extrair mês/ano no fuso de negócio
      const date = new Date(dataOrigemISO);
      if (isNaN(date.getTime())) return null;

      const fmt = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        month: 'numeric',
        year: 'numeric',
      });

      const parts = fmt.formatToParts(date);
      const mes = Number(parts.find(p => p.type === 'month')?.value);
      const ano = Number(parts.find(p => p.type === 'year')?.value);

      if (!mes || !ano) return null;
      return { mes, ano };
    } catch {
      return null;
    }
  }

  /**
   * RF03 — Formata competência para exibição (ex: "Mar/2026").
   */
  static formatCompetencia(mes: number | null, ano: number | null): string {
    if (!mes || !ano) return 'Pendente';
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${meses[mes - 1]}/${ano}`;
  }
}

export const originService = new OriginService();
export { OriginService };
