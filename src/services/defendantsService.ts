import { supabase } from './supabase';
import {
  ProcessDefendant,
  DefendantPapel,
} from '../types/database';

export interface CreateDefendantDTO {
  process_id: string;
  company_id?: string | null;
  nome_livre?: string | null;
  documento_livre?: string | null;
  papel?: DefendantPapel;
  evidencia_texto?: string | null;
  evidencia_fonte?: 'EMAIL' | 'DOCUMENTO' | 'MANUAL' | null;
  confirmado?: boolean;
}

export interface UpdateDefendantDTO {
  papel?: DefendantPapel;
  confirmado?: boolean;
  evidencia_texto?: string | null;
  evidencia_fonte?: 'EMAIL' | 'DOCUMENTO' | 'MANUAL' | null;
  correcao_motivo?: string;
}

class DefendantsService {
  /**
   * RF02 — Lista rés de um processo com empresa canônica vinculada.
   */
  async getByProcess(processId: string): Promise<{ data: ProcessDefendant[]; error: string | null }> {
    const { data, error } = await supabase
      .from('process_defendants')
      .select(`
        *,
        company:companies(id, nome, cnpj)
      `)
      .eq('process_id', processId)
      .order('created_at', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as ProcessDefendant[], error: null };
  }

  /**
   * RF02 — Cria nova ré. Valida que company_id ou nome_livre está preenchido.
   */
  async create(
    dto: CreateDefendantDTO,
    userId: string,
  ): Promise<{ data: ProcessDefendant | null; error: string | null }> {
    if (!dto.company_id && !dto.nome_livre) {
      return { data: null, error: 'Informe empresa canônica ou nome livre da ré.' };
    }

    const { data, error } = await supabase
      .from('process_defendants')
      .insert({
        ...dto,
        confirmado: dto.confirmado ?? false,
        papel: dto.papel ?? 'REU',
        created_by: userId,
        updated_by: userId,
      })
      .select(`*, company:companies(id, nome, cnpj)`)
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as ProcessDefendant, error: null };
  }

  /**
   * RF02 — Confirma ré com evidência. Registra snapshot anterior para auditoria.
   */
  async confirm(
    id: string,
    evidenciaTexto: string,
    evidenciaFonte: 'EMAIL' | 'DOCUMENTO' | 'MANUAL',
    userId: string,
  ): Promise<{ error: string | null }> {
    // Busca estado atual para snapshot
    const { data: current } = await supabase
      .from('process_defendants')
      .select('confirmado, evidencia_texto, evidencia_fonte, papel')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('process_defendants')
      .update({
        confirmado: true,
        evidencia_texto: evidenciaTexto,
        evidencia_fonte: evidenciaFonte,
        updated_by: userId,
        updated_at: new Date().toISOString(),
        correcao_anterior: current ?? null,
        correcao_em: new Date().toISOString(),
        correcao_por: userId,
      })
      .eq('id', id);

    return { error: error?.message ?? null };
  }

  /**
   * RF02 — Atualiza papel ou confirmação com auditoria de correção.
   */
  async update(
    id: string,
    dto: UpdateDefendantDTO,
    userId: string,
  ): Promise<{ error: string | null }> {
    const { data: current } = await supabase
      .from('process_defendants')
      .select('confirmado, papel, evidencia_texto, evidencia_fonte')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('process_defendants')
      .update({
        ...dto,
        updated_by: userId,
        updated_at: new Date().toISOString(),
        correcao_anterior: current ?? null,
        correcao_motivo: dto.correcao_motivo ?? null,
        correcao_em: new Date().toISOString(),
        correcao_por: userId,
      })
      .eq('id', id);

    return { error: error?.message ?? null };
  }

  /**
   * RF02 — Remove ré (somente não confirmada; confirmada exige justificativa).
   */
  async remove(id: string): Promise<{ error: string | null }> {
    const { data: current } = await supabase
      .from('process_defendants')
      .select('confirmado')
      .eq('id', id)
      .single();

    if (current?.confirmado) {
      return { error: 'Ré confirmada não pode ser removida diretamente. Use correção com justificativa.' };
    }

    const { error } = await supabase
      .from('process_defendants')
      .delete()
      .eq('id', id);

    return { error: error?.message ?? null };
  }
}

export const defendantsService = new DefendantsService();
