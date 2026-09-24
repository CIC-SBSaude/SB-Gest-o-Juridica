import { supabase } from './supabase';
import type {
  LawFirm,
  LawFirmInteraction,
  ProcessManagementSnapshot,
  ProcessPendency,
} from '../types/database';

const errMsg = (error: any, fallback: string) => error?.message || fallback;

class ManagementService {
  async getProcessManagement(processId: string): Promise<{ data: ProcessManagementSnapshot | null; error: string | null }> {
    const { data, error } = await supabase
      .from('v_process_management')
      .select('*')
      .eq('id', processId)
      .maybeSingle();
    return error
      ? { data: null, error: errMsg(error, 'Erro ao carregar gestão do processo.') }
      : { data: (data as ProcessManagementSnapshot | null) || null, error: null };
  }

  async updateProcessManagement(processId: string, payload: Record<string, unknown>, reason?: string | null) {
    const { data, error } = await supabase.rpc('update_process_management', {
      p_process_id: processId,
      p_changes: payload,
      p_reason: reason?.trim() || null,
    });
    return error ? { data: null, error: errMsg(error, 'Erro ao atualizar gestão do processo.') } : { data, error: null };
  }

  async listPendencies(processId: string): Promise<{ data: ProcessPendency[]; error: string | null }> {
    const { data, error } = await supabase
      .from('process_pendencies')
      .select('*')
      .eq('process_id', processId)
      .order('status', { ascending: true })
      .order('due_at', { ascending: true, nullsFirst: false });
    return error ? { data: [], error: errMsg(error, 'Erro ao carregar pendências.') } : { data: (data as ProcessPendency[]) || [], error: null };
  }

  async createPendency(payload: Partial<ProcessPendency>) {
    const { data, error } = await supabase.rpc('register_process_pendency', {
      p_process_id: payload.process_id,
      p_description: payload.description,
      p_responsible_type: payload.responsible_type,
      p_criticality: payload.criticality ?? 'MEDIA',
      p_due_at: payload.due_at ?? null,
      p_type: payload.type ?? 'OUTRA',
      p_responsible_user_id: payload.responsible_user_id ?? null,
    });
    return error ? { data: null, error: errMsg(error, 'Erro ao criar pendência.') } : { data: data as ProcessPendency, error: null };
  }

  async setPendencyStatus(id: string, status: 'ABERTA' | 'EM_TRATAMENTO' | 'RESOLVIDA' | 'CANCELADA') {
    const { data, error } = await supabase.rpc('set_process_pendency_status', {
      p_pendency_id: id,
      p_status: status,
    });
    return error ? { data: null, error: errMsg(error, 'Erro ao atualizar pendência.') } : { data: data as ProcessPendency, error: null };
  }

  async resolvePendency(id: string) {
    return this.setPendencyStatus(id, 'RESOLVIDA');
  }

  async listLawFirms(): Promise<{ data: LawFirm[]; error: string | null }> {
    const { data, error } = await supabase.from('law_firms').select('*').eq('active', true).order('nome');
    return error ? { data: [], error: errMsg(error, 'Erro ao carregar escritórios.') } : { data: (data as LawFirm[]) || [], error: null };
  }

  async createLawFirm(payload: Pick<LawFirm, 'nome'> & Partial<LawFirm>) {
    const { data, error } = await supabase.from('law_firms').insert(payload).select('*').single();
    return error ? { data: null, error: errMsg(error, 'Erro ao cadastrar escritório.') } : { data: data as LawFirm, error: null };
  }

  async listLawFirmInteractions(processId: string): Promise<{ data: LawFirmInteraction[]; error: string | null }> {
    const { data, error } = await supabase
      .from('process_law_firm_interactions')
      .select('*, law_firm:law_firms(id,nome,cnpj,email_principal,telefone,responsavel_principal,active,created_at,updated_at)')
      .eq('process_id', processId)
      .order('created_at', { ascending: false });
    return error ? { data: [], error: errMsg(error, 'Erro ao carregar interações com escritório.') } : { data: (data as LawFirmInteraction[]) || [], error: null };
  }

  async createLawFirmInteraction(payload: Partial<LawFirmInteraction>) {
    const { data, error } = await supabase.rpc('register_law_firm_interaction', {
      p_process_id: payload.process_id,
      p_law_firm_id: payload.law_firm_id ?? null,
      p_interaction_type: payload.interaction_type,
      p_expected_return_at: payload.expected_return_at ?? null,
      p_subject: payload.subject ?? null,
      p_summary: payload.summary ?? null,
      p_responsible_user_id: payload.responsible_user_id ?? null,
      p_source_email_id: payload.source_email_id ?? null,
    });
    return error ? { data: null, error: errMsg(error, 'Erro ao registrar interação.') } : { data: data as LawFirmInteraction, error: null };
  }
}

export const managementService = new ManagementService();
