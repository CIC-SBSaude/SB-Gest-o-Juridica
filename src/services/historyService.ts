import { supabase } from './supabase';
import { ProcessHistoryEntry } from '../types/database';

export interface CreateHistoryEntryDTO {
  process_id: string;
  campo: string;
  valor_anterior?: string | null;
  valor_novo?: string | null;
  usuario_id?: string | null;
  origem?: string;
  data_hora?: string;
}

export type UnifiedHistoryKind = 'PROCESSUAL' | 'OPERACIONAL';

export interface UnifiedHistoryEntry {
  id: string;
  process_id: string;
  kind: UnifiedHistoryKind;
  field_name: string;
  old_value?: string | null;
  new_value?: string | null;
  reason?: string | null;
  source: string;
  changed_at: string;
  changed_by?: string | null;
  user?: {
    id: string;
    display_name: string | null;
    email: string;
  } | null;
}

class HistoryService {
  /**
   * Histórico cadastral/processual legado.
   */
  async getProcessHistory(processId: string): Promise<{ data: ProcessHistoryEntry[]; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('process_history')
        .select(`
          *,
          usuario:user_profiles!usuario_id(id, display_name, email)
        `)
        .eq('process_id', processId)
        .order('data_hora', { ascending: false });

      if (!error && data) {
        return { data: data as ProcessHistoryEntry[], error: null };
      }

      console.warn('[historyService] Tentando busca direta sem junção devido a:', error?.message);
      const fallback = await supabase
        .from('process_history')
        .select('*')
        .eq('process_id', processId)
        .order('data_hora', { ascending: false });

      if (fallback.error) {
        return { data: [], error: fallback.error.message || 'Erro ao carregar histórico.' };
      }

      return { data: (fallback.data as ProcessHistoryEntry[]) || [], error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao consultar histórico.';
      return { data: [], error: msg };
    }
  }

  /**
   * Consolida as duas trilhas de auditoria:
   * - process_history: alterações cadastrais/processuais;
   * - process_operational_history: alterações gerenciais/operacionais.
   *
   * Nenhuma das duas tabelas é modificada. A consolidação ocorre somente para leitura.
   */
  async getUnifiedProcessHistory(processId: string): Promise<{ data: UnifiedHistoryEntry[]; error: string | null }> {
    try {
      const [processual, operational] = await Promise.all([
        supabase
          .from('process_history')
          .select(`
            id,
            process_id,
            campo,
            valor_anterior,
            valor_novo,
            usuario_id,
            origem,
            data_hora,
            usuario:user_profiles!usuario_id(id, display_name, email)
          `)
          .eq('process_id', processId)
          .order('data_hora', { ascending: false }),
        supabase
          .from('process_operational_history')
          .select(`
            id,
            process_id,
            field_name,
            old_value,
            new_value,
            reason,
            changed_by,
            changed_at,
            source,
            usuario:user_profiles!changed_by(id, display_name, email)
          `)
          .eq('process_id', processId)
          .order('changed_at', { ascending: false }),
      ]);

      if (processual.error) {
        return { data: [], error: `Histórico processual: ${processual.error.message}` };
      }
      if (operational.error) {
        return { data: [], error: `Histórico operacional: ${operational.error.message}` };
      }

      const processualEntries: UnifiedHistoryEntry[] = (processual.data || []).map((entry: any) => ({
        id: `processual:${entry.id}`,
        process_id: entry.process_id,
        kind: 'PROCESSUAL',
        field_name: entry.campo,
        old_value: entry.valor_anterior ?? null,
        new_value: entry.valor_novo ?? null,
        reason: null,
        source: entry.origem || 'MANUAL',
        changed_at: entry.data_hora,
        changed_by: entry.usuario_id ?? null,
        user: entry.usuario ?? null,
      }));

      const operationalEntries: UnifiedHistoryEntry[] = (operational.data || []).map((entry: any) => ({
        id: `operacional:${entry.id}`,
        process_id: entry.process_id,
        kind: 'OPERACIONAL',
        field_name: entry.field_name,
        old_value: entry.old_value ?? null,
        new_value: entry.new_value ?? null,
        reason: entry.reason ?? null,
        source: entry.source || 'HUMANO',
        changed_at: entry.changed_at,
        changed_by: entry.changed_by ?? null,
        user: entry.usuario ?? null,
      }));

      const combined = [...processualEntries, ...operationalEntries]
        .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());

      return { data: combined, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao consolidar histórico.';
      return { data: [], error: msg };
    }
  }

  /**
   * Registra uma nova alteração cadastral/processual.
   */
  async recordHistoryEntry(entry: CreateHistoryEntryDTO): Promise<{ success: boolean; error: string | null }> {
    try {
      const payload = {
        process_id: entry.process_id,
        campo: entry.campo,
        valor_anterior: entry.valor_anterior ?? null,
        valor_novo: entry.valor_novo ?? null,
        usuario_id: entry.usuario_id ?? null,
        origem: entry.origem || 'MANUAL',
        data_hora: entry.data_hora || new Date().toISOString(),
      };

      const { error } = await supabase.from('process_history').insert(payload);

      if (error) {
        console.warn('[historyService] Falha ao gravar histórico de alteração:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao persistir histórico.';
      console.warn('[historyService] Exceção ao gravar histórico:', msg);
      return { success: false, error: msg };
    }
  }
}

export const historyService = new HistoryService();
