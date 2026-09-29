import { supabase } from './supabase';
import {
  ProcessServiceProvider,
  ProviderCategoria,
  ProviderPapelProcessual,
  ProviderService,
  PrecisaoData,
  ProviderDebtSummary,
} from '../types/database';

export interface CreateProviderDTO {
  process_id: string;
  party_id?: string | null;
  nome_razao_social: string;
  tipo_pessoa: 'PJ' | 'PF';
  documento?: string | null;
  categoria: ProviderCategoria;
  natureza_vinculo: string;
  vinculo_confirmado?: boolean;
  papel_processual?: ProviderPapelProcessual;
  origem_evidencia?: string | null;
  observacoes?: string | null;
}

export interface CreateServiceDTO {
  process_id: string;
  provider_id: string;
  tipo_servico: string;
  descricao?: string | null;
  periodo_inicio?: string | null;
  periodo_fim?: string | null;
  precisao_data?: PrecisaoData;
  competencia_entrada?: string | null;
  vencimento_fatura?: string | null;
  fonte?: string | null;
}

class ProvidersService {
  /**
   * RF11 — Lista prestadores associados a um processo
   */
  async getProviders(processId: string): Promise<{ data: ProcessServiceProvider[]; error: string | null }> {
    const { data, error } = await supabase
      .from('process_service_providers')
      .select('*')
      .eq('process_id', processId)
      .order('criado_em', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as ProcessServiceProvider[], error: null };
  }

  /**
   * RF11 — Cadastra um novo prestador no processo
   */
  async createProvider(
    dto: CreateProviderDTO,
    userId?: string,
  ): Promise<{ data: ProcessServiceProvider | null; error: string | null }> {
    if (!dto.nome_razao_social || dto.nome_razao_social.trim() === '') {
      return { data: null, error: 'Razão social ou nome do prestador é obrigatório.' };
    }

    // Normalizar documento removendo pontuação
    const docLimpo = dto.documento ? dto.documento.replace(/\D/g, '') : null;

    const { data, error } = await supabase
      .from('process_service_providers')
      .insert({
        ...dto,
        documento: docLimpo,
        vinculo_confirmado: dto.vinculo_confirmado ?? false,
        papel_processual: dto.papel_processual ?? 'AUTOR',
        criado_por: userId ?? null,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as ProcessServiceProvider, error: null };
  }

  /**
   * RF11 — Atualiza prestador (ex: confirmação de vínculo, categoria)
   */
  async updateProvider(
    id: string,
    updates: Partial<ProcessServiceProvider>,
    userId?: string,
  ): Promise<{ data: ProcessServiceProvider | null; error: string | null }> {
    const docLimpo = updates.documento ? updates.documento.replace(/\D/g, '') : updates.documento;

    const { data, error } = await supabase
      .from('process_service_providers')
      .update({
        ...updates,
        documento: docLimpo,
        revisado_por: userId ?? null,
        revisado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as ProcessServiceProvider, error: null };
  }

  /**
   * RF11 — Remove prestador
   */
  async deleteProvider(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('process_service_providers')
      .delete()
      .eq('id', id);

    if (error) return { error: error.message };
    return { error: null };
  }

  /**
   * RF12 — Lista serviços do prestador ou do processo
   */
  async getServices(
    processId: string,
    providerId?: string,
  ): Promise<{ data: ProviderService[]; error: string | null }> {
    let query = supabase
      .from('provider_services')
      .select('*')
      .eq('process_id', processId);

    if (providerId) {
      query = query.eq('provider_id', providerId);
    }

    const { data, error } = await query.order('periodo_inicio', { ascending: true, nullsFirst: false });

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as ProviderService[], error: null };
  }

  /**
   * RF12 — Cria registro de serviço prestado com período e precisão de data
   */
  async createService(
    dto: CreateServiceDTO,
    userId?: string,
  ): Promise<{ data: ProviderService | null; error: string | null }> {
    if (dto.periodo_inicio && dto.periodo_fim && dto.periodo_fim < dto.periodo_inicio) {
      return { data: null, error: 'A data final do período não pode ser anterior à data inicial.' };
    }

    const { data, error } = await supabase
      .from('provider_services')
      .insert({
        ...dto,
        precisao_data: dto.precisao_data ?? 'EXATA',
        criado_por: userId ?? null,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as ProviderService, error: null };
  }

  /**
   * RF12 — Remove um serviço
   */
  async deleteService(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('provider_services')
      .delete()
      .eq('id', id);

    if (error) return { error: error.message };
    return { error: null };
  }

  /**
   * RF13 — Consulta o resumo de dívida por prestador
   */
  async getDebtSummary(processId: string): Promise<{ data: ProviderDebtSummary[]; error: string | null }> {
    const { data, error } = await supabase
      .from('v_provider_debt_summary')
      .select('*')
      .eq('process_id', processId);

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as ProviderDebtSummary[], error: null };
  }
}

export const providersService = new ProvidersService();
