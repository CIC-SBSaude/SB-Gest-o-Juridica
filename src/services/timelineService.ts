import { supabase } from './supabase';
import { ProcessTimelineEvent } from '../types/database';
import { historyService } from './historyService';

export interface CreateTimelineEventDTO {
  process_id: string;
  tipo: string;
  titulo: string;
  descricao: string;
  data_hora?: string;
  origem?: string;
  usuario_id?: string | null;
  email_id?: string | null;
  documento_id?: string | null;
  automatico?: boolean;
}

export interface UpdateTimelineEventDTO {
  tipo?: string;
  titulo?: string;
  descricao?: string;
  data_hora?: string;
  origem?: string;
}

class TimelineService {
  /**
   * Lista os eventos da linha do tempo de um processo em ordem cronológica decrescente.
   * Não realiza consultas em loop.
   */
  async getTimelineEvents(processId: string): Promise<{ data: ProcessTimelineEvent[]; error: string | null }> {
    try {
      // 1. Tenta consulta com junção do perfil do usuário
      const { data, error } = await supabase
        .from('process_timeline')
        .select(`
          *,
          usuario:user_profiles!usuario_id(id, display_name, email)
        `)
        .eq('process_id', processId)
        .order('data_hora', { ascending: false });

      if (!error && data) {
        return { data: data as ProcessTimelineEvent[], error: null };
      }

      // Fallback sem junção explícita
      console.warn('[timelineService] Tentando busca direta sem junção devido a:', error?.message);
      const fallback = await supabase
        .from('process_timeline')
        .select('*')
        .eq('process_id', processId)
        .order('data_hora', { ascending: false });

      if (fallback.error) {
        return { data: [], error: fallback.error.message || 'Erro ao consultar linha do tempo.' };
      }

      return { data: (fallback.data as ProcessTimelineEvent[]) || [], error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao consultar timeline.';
      return { data: [], error: msg };
    }
  }

  /**
   * Inclui manualmente um evento na linha do tempo.
   * Registra a inclusão no histórico de auditoria (public.process_history) para rastreabilidade completa.
   */
  async createTimelineEvent(
    event: CreateTimelineEventDTO
  ): Promise<{ data: ProcessTimelineEvent | null; error: string | null }> {
    try {
      const payload = {
        process_id: event.process_id,
        tipo: event.tipo.trim().toUpperCase(),
        titulo: event.titulo.trim(),
        descricao: event.descricao.trim(),
        data_hora: event.data_hora || new Date().toISOString(),
        origem: event.origem?.trim() || 'MANUAL',
        usuario_id: event.usuario_id || null,
        email_id: event.email_id || null,
        documento_id: event.documento_id || null,
        automatico: event.automatico ?? false,
      };

      const { data, error } = await supabase
        .from('process_timeline')
        .insert(payload)
        .select(`
          *,
          usuario:user_profiles!usuario_id(id, display_name, email)
        `)
        .single();

      if (error) {
        return { data: null, error: error.message || 'Erro ao registrar evento na linha do tempo.' };
      }

      // Registra a inclusão no histórico do processo
      await historyService.recordHistoryEntry({
        process_id: event.process_id,
        campo: 'timeline_evento_adicionado',
        valor_anterior: null,
        valor_novo: `[${payload.tipo}] ${payload.titulo}`,
        usuario_id: event.usuario_id || null,
        origem: payload.origem,
        data_hora: new Date().toISOString(),
      });

      return { data: data as ProcessTimelineEvent, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar evento na linha do tempo.';
      return { data: null, error: msg };
    }
  }

  /**
   * Atualiza um evento da timeline.
   * Regra estrita: Não permite edição silenciosa; grava sempre a alteração em public.process_history.
   */
  async updateTimelineEvent(
    id: string,
    updates: UpdateTimelineEventDTO,
    currentEvent: ProcessTimelineEvent,
    userId?: string | null
  ): Promise<{ data: ProcessTimelineEvent | null; error: string | null }> {
    try {
      const payload: Record<string, unknown> = {};
      if (updates.tipo !== undefined) payload.tipo = updates.tipo.trim().toUpperCase();
      if (updates.titulo !== undefined) payload.titulo = updates.titulo.trim();
      if (updates.descricao !== undefined) payload.descricao = updates.descricao.trim();
      if (updates.data_hora !== undefined) payload.data_hora = updates.data_hora;
      if (updates.origem !== undefined) payload.origem = updates.origem.trim();

      const { data, error } = await supabase
        .from('process_timeline')
        .update(payload)
        .eq('id', id)
        .select(`
          *,
          usuario:user_profiles!usuario_id(id, display_name, email)
        `)
        .single();

      if (error) {
        return { data: null, error: error.message || 'Erro ao atualizar evento da linha do tempo.' };
      }

      // Rastreabilidade obrigatória em process_history
      const anterior = `[${currentEvent.tipo}] ${currentEvent.titulo}: ${currentEvent.descricao}`;
      const novo = `[${updates.tipo || currentEvent.tipo}] ${updates.titulo || currentEvent.titulo}: ${updates.descricao || currentEvent.descricao}`;

      await historyService.recordHistoryEntry({
        process_id: currentEvent.process_id,
        campo: 'timeline_evento_alterado',
        valor_anterior: anterior,
        valor_novo: novo,
        usuario_id: userId || null,
        origem: 'MANUAL',
        data_hora: new Date().toISOString(),
      });

      return { data: data as ProcessTimelineEvent, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar evento da linha do tempo.';
      return { data: null, error: msg };
    }
  }
}

export const timelineService = new TimelineService();
