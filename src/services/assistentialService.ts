import { supabase } from './supabase';
import {
  AssistentialCatalogItem,
  ProcessAssistentialItem,
  AssistentialClass,
  ItemSource,
  ItemReviewState,
} from '../types/database';

export interface CreateAssistentialItemDTO {
  process_id: string;
  catalog_id?: string | null;
  descricao_livre?: string | null;
  predominante?: boolean;
  fonte?: ItemSource;
}

export interface ReviewAssistentialItemDTO {
  revisao: ItemReviewState;
  revisado_por: string;
}

class AssistentialService {
  /**
   * RF08 — Lista itens do catálogo ativos, opcionalmente filtrados por classe.
   */
  async getCatalog(classe?: AssistentialClass): Promise<{
    data: AssistentialCatalogItem[];
    error: string | null;
  }> {
    let query = supabase
      .from('assistential_catalog')
      .select('*')
      .eq('ativo', true)
      .order('classe', { ascending: true })
      .order('detalhe', { ascending: true });

    if (classe) {
      query = query.eq('classe', classe);
    }

    const { data, error } = await query;
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as AssistentialCatalogItem[], error: null };
  }

  /**
   * RF08 — Lista itens assistenciais de um processo com catálogo.
   */
  async getByProcess(processId: string): Promise<{
    data: ProcessAssistentialItem[];
    error: string | null;
  }> {
    const { data, error } = await supabase
      .from('process_assistential_items')
      .select(`
        *,
        catalog:assistential_catalog(id, classe, detalhe, ativo)
      `)
      .eq('process_id', processId)
      .order('predominante', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as ProcessAssistentialItem[], error: null };
  }

  /**
   * RF08 — Adiciona item assistencial ao processo.
   * Valida: catalog_id ou descricao_livre obrigatório.
   * Valida: combinação classe/detalhe existe e está ativa.
   */
  async addItem(
    dto: CreateAssistentialItemDTO,
    userId: string,
  ): Promise<{ data: ProcessAssistentialItem | null; error: string | null }> {
    if (!dto.catalog_id && !dto.descricao_livre) {
      return { data: null, error: 'Informe item do catálogo ou descrição livre.' };
    }

    const { data, error } = await supabase
      .from('process_assistential_items')
      .insert({
        process_id: dto.process_id,
        catalog_id: dto.catalog_id ?? null,
        descricao_livre: dto.descricao_livre ?? null,
        predominante: dto.predominante ?? false,
        fonte: dto.fonte ?? 'MANUAL',
        revisao: 'PENDENTE',
        created_by: userId,
      })
      .select(`*, catalog:assistential_catalog(id, classe, detalhe, ativo)`)
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as ProcessAssistentialItem, error: null };
  }

  /**
   * RF08 — Marca item como predominante (trigger no banco garante unicidade).
   */
  async setPredominant(
    itemId: string,
    processId: string,
  ): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('process_assistential_items')
      .update({ predominante: true, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('process_id', processId);

    return { error: error?.message ?? null };
  }

  /**
   * RF08 — Aplica revisão humana a um item (protege classificação manual).
   */
  async reviewItem(
    itemId: string,
    dto: ReviewAssistentialItemDTO,
  ): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('process_assistential_items')
      .update({
        revisao: dto.revisao,
        revisado_por: dto.revisado_por,
        revisado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    return { error: error?.message ?? null };
  }

  /**
   * RF08 — Remove item não confirmado. Item com revisão ACEITA não pode ser removido.
   */
  async removeItem(itemId: string): Promise<{ error: string | null }> {
    const { data: current } = await supabase
      .from('process_assistential_items')
      .select('revisao')
      .eq('id', itemId)
      .single();

    if (current?.revisao === 'ACEITA') {
      return { error: 'Item com revisão aceita não pode ser removido diretamente.' };
    }

    const { error } = await supabase
      .from('process_assistential_items')
      .delete()
      .eq('id', itemId);

    return { error: error?.message ?? null };
  }
}

export const assistentialService = new AssistentialService();
