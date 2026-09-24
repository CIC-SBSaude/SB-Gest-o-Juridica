import { supabase } from './supabase';
import { ProcessedEmail, EmailException, ProcessEvidence, Process } from '../types/database';
import { historyService } from './historyService';
import { requestAttentionIndicatorsRefresh } from './attentionIndicatorsService';

export interface InboxFilters {
  status?: string;
  sender_email?: string;
  has_process?: boolean;
  has_exception?: boolean;
  search?: string;
}

export interface ExceptionsFilters {
  status?: string;
  exception_type?: string;
}

export interface HumanReviewFieldUpdate {
  field: string;
  previousValue: unknown;
  newValue: unknown;
}

export interface FalseProtocolRepairPreview {
  dryRun: true;
  totalAffected: number;
  selected: number;
  executable: number;
  totalExecutable: number;
  requiresReview: number;
  cases: Array<{ exceptionId: string; subject: string | null; validCnjs: string[]; executable: boolean; reason: string }>;
}

export interface FalseProtocolRepairResult {
  resolved: number;
  requiresReview: number;
  errors: number;
  staleClassificationsRecovered: number;
  results: Array<{
    exceptionId: string;
    status: 'RESOLVED' | 'REVIEW_REQUIRED' | 'ERROR';
    reason?: string;
    processes?: number;
  }>;
}

async function backendHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export interface ResolveHumanReviewParams {
  exceptionId?: string | null;
  processedEmailId: string;
  userId: string;
  resolutionNote: string;
  nextEmailStatus: 'PROCESSADO' | 'IRRELEVANTE' | 'EXCECAO';
  processIdToLink?: string | null;
  processFieldUpdates?: Record<string, unknown>;
  fieldHistoryChanges?: HumanReviewFieldUpdate[];
}

class InboxService {
  async previewFalseProtocolRepair(): Promise<FalseProtocolRepairPreview> {
    const response = await fetch('/api/admin/exception-repair/false-protocols', { method: 'POST', headers: await backendHeaders(), body: '{}' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Falha ao preparar a revisão.');
    return payload as FalseProtocolRepairPreview;
  }

  async executeFalseProtocolRepair(exceptionIds: string[]): Promise<FalseProtocolRepairResult> {
    const response = await fetch('/api/admin/exception-repair/false-protocols', { method: 'POST', headers: await backendHeaders(), body: JSON.stringify({ execute: true, exceptionIds }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Falha ao executar a reparação.');
    return payload;
  }

  async getProcessedEmails(filters?: InboxFilters): Promise<{ data: ProcessedEmail[]; error: string | null }> {
    try {
      let query = supabase
        .from('processed_emails')
        .select(`
          *,
          process:processes(id, numero_processo, protocolo_externo, status_atual)
        `)
        .order('received_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.sender_email) {
        query = query.ilike('sender_email', `%${filters.sender_email}%`);
      }
      if (filters?.has_process === true) {
        query = query.not('process_id', 'is', null);
      } else if (filters?.has_process === false) {
        query = query.is('process_id', null);
      }
      if (filters?.search) {
        const searchTerm = `%${filters.search}%`;
        query = query.or(`subject.ilike.${searchTerm},sender_email.ilike.${searchTerm},sender_name.ilike.${searchTerm},matched_process_number.ilike.${searchTerm}`);
      }

      const { data, error } = await query;
      if (error) return { data: [], error: error.message };

      return { data: (data as ProcessedEmail[]) || [], error: null };
    } catch (err: any) {
      return { data: [], error: err.message };
    }
  }

  async getEmailDetails(id: string): Promise<{ data: ProcessedEmail | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('processed_emails')
        .select(`
          *,
          process:processes(id, numero_processo, protocolo_externo, status_atual, tipo_demanda, comarca, valor_causa)
        `)
        .eq('id', id)
        .single();
        
      if (error) return { data: null, error: error.message };
      return { data: data as ProcessedEmail, error: null };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }

  async getEmailEvidence(emailId: string): Promise<{ data: ProcessEvidence[]; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('process_evidence')
        .select('*')
        .eq('processed_email_id', emailId)
        .order('created_at', { ascending: false });
        
      if (error) return { data: [], error: error.message };
      return { data: data as ProcessEvidence[], error: null };
    } catch (err: any) {
      return { data: [], error: err.message };
    }
  }

  async linkProcess(emailId: string, processId: string | null): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase
        .from('processed_emails')
        .update({ process_id: processId, updated_at: new Date().toISOString() })
        .eq('id', emailId);
        
      if (error) return { success: false, error: error.message };
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async searchProcessesForLink(search: string): Promise<{ data: Partial<Process>[]; error: string | null }> {
    try {
      if (!search || search.length < 2) return { data: [], error: null };
      
      const searchTerm = `%${search}%`;
      const { data, error } = await supabase
        .from('processes')
        .select('id, numero_processo, protocolo_externo, status_atual, tipo_demanda, objeto_demanda, comarca, valor_causa')
        .or(`numero_processo.ilike.${searchTerm},protocolo_externo.ilike.${searchTerm},tipo_demanda.ilike.${searchTerm},objeto_demanda.ilike.${searchTerm}`)
        .limit(20);
        
      if (error) return { data: [], error: error.message };
      return { data, error: null };
    } catch (err: any) {
      return { data: [], error: err.message };
    }
  }

  async getExceptions(filters?: ExceptionsFilters): Promise<{ data: EmailException[]; error: string | null }> {
    try {
      let query = supabase
        .from('email_exceptions')
        .select(`
          *,
          email:processed_emails(
            id,
            subject,
            sender_email,
            sender_name,
            received_at,
            process_id,
            status,
            metadata,
            matched_process_number,
            process:processes(id, numero_processo, protocolo_externo, status_atual, tipo_demanda, comarca)
          ),
          assignee:user_profiles!assigned_to(id, display_name),
          resolver:user_profiles!resolved_by(id, display_name)
        `)
        .order('created_at', { ascending: false });

      // Compatibilidade total: ABERTA inclui registros históricos PENDENTE
      if (filters?.status === 'ABERTA') {
        query = query.in('status', ['ABERTA', 'PENDENTE']);
      } else if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.exception_type) {
        query = query.eq('exception_type', filters.exception_type);
      }

      const { data, error } = await query;
      if (error) return { data: [], error: error.message };

      return { data: (data as any) || [], error: null };
    } catch (err: any) {
      return { data: [], error: err.message };
    }
  }

  async getExceptionByEmailId(emailId: string): Promise<{ data: EmailException | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('email_exceptions')
        .select(`
          *,
          email:processed_emails(
            id,
            subject,
            sender_email,
            sender_name,
            received_at,
            process_id,
            status,
            metadata,
            matched_process_number,
            process:processes(id, numero_processo, protocolo_externo, status_atual, tipo_demanda, comarca)
          ),
          assignee:user_profiles!assigned_to(id, display_name),
          resolver:user_profiles!resolved_by(id, display_name)
        `)
        .eq('processed_email_id', emailId)
        .in('status', ['ABERTA', 'PENDENTE'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return { data: null, error: error.message };
      return { data: data as EmailException | null, error: null };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }

  async resolveException(
    exceptionId: string, 
    userId: string, 
    resolutionNote: string
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase
        .from('email_exceptions')
        .update({ 
          status: 'RESOLVIDA', 
          resolved_by: userId, 
          resolved_at: new Date().toISOString(),
          resolution_note: resolutionNote,
          updated_at: new Date().toISOString()
        })
        .eq('id', exceptionId);
        
      if (error) return { success: false, error: error.message };
      requestAttentionIndicatorsRefresh();
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Executa a resolução completa de uma revisão humana:
   * 1. Atualiza dados do processo (se fornecidos) e grava trilha em process_history
   * 2. Atualiza o vínculo do processo no processed_email
   * 3. Atualiza o status do processed_email (ex: PROCESSADO, IRRELEVANTE)
   * 4. Encerra a exceção (se houver) marcando status = 'RESOLVIDA', resolved_by, resolved_at e resolution_note
   */
  async completeHumanReview(params: ResolveHumanReviewParams): Promise<{ success: boolean; error: string | null }> {
    try {
      const {
        exceptionId,
        processedEmailId,
        userId,
        resolutionNote,
        nextEmailStatus,
        processIdToLink,
        processFieldUpdates,
        fieldHistoryChanges,
      } = params;

      const nowIso = new Date().toISOString();

      // 1. Atualiza campos do processo se houver alterações
      const targetProcessId = processIdToLink;
      if (targetProcessId && processFieldUpdates && Object.keys(processFieldUpdates).length > 0) {
        const { error: procUpdateErr } = await supabase
          .from('processes')
          .update({
            ...processFieldUpdates,
            updated_by: userId,
            updated_at: nowIso,
          })
          .eq('id', targetProcessId);

        if (procUpdateErr) {
          return { success: false, error: `Falha ao atualizar processo: ${procUpdateErr.message}` };
        }
      }

      // 2. Grava histórico rastreável para cada alteração em public.process_history
      if (targetProcessId && fieldHistoryChanges && fieldHistoryChanges.length > 0) {
        for (const change of fieldHistoryChanges) {
          await historyService.recordHistoryEntry({
            process_id: targetProcessId,
            campo: change.field,
            valor_anterior: change.previousValue != null ? String(change.previousValue) : null,
            valor_novo: change.newValue != null ? String(change.newValue) : null,
            usuario_id: userId,
            origem: 'REVISAO_HUMANA',
            data_hora: nowIso,
          });
        }
      }

      // 3. Atualiza processed_emails
      const emailPatch: Record<string, unknown> = {
        status: nextEmailStatus,
        updated_at: nowIso,
      };
      if (processIdToLink !== undefined) {
        emailPatch.process_id = processIdToLink;
      }

      const { error: emailUpdateErr } = await supabase
        .from('processed_emails')
        .update(emailPatch)
        .eq('id', processedEmailId);

      if (emailUpdateErr) {
        return { success: false, error: `Falha ao atualizar e-mail processado: ${emailUpdateErr.message}` };
      }

      // 4. Se houver exceptionId direta ou vinculada ao processed_email_id, encerra como RESOLVIDA
      let targetExcId = exceptionId;
      if (!targetExcId) {
        const { data: excRec } = await supabase
          .from('email_exceptions')
          .select('id')
          .eq('processed_email_id', processedEmailId)
          .in('status', ['ABERTA', 'PENDENTE'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (excRec?.id) {
          targetExcId = excRec.id;
        }
      }

      if (targetExcId) {
        const { error: excErr } = await supabase
          .from('email_exceptions')
          .update({
            status: 'RESOLVIDA',
            resolved_by: userId,
            resolved_at: nowIso,
            resolution_note: resolutionNote || 'Revisão humana concluída.',
            updated_at: nowIso,
          })
          .eq('id', targetExcId);

        if (excErr) {
          return { success: false, error: `Falha ao resolver exceção: ${excErr.message}` };
        }
      }

      requestAttentionIndicatorsRefresh();
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro inesperado durante a revisão humana.' };
    }
  }
}

export const inboxService = new InboxService();
