export type ManagementRefreshTrigger =
  | 'PROCESS_CREATED'
  | 'PROCESS_UPDATED'
  | 'LEGAL_EMAIL_LINKED'
  | 'AI_PROCESS_UPDATED'
  | 'AI_OBLIGATION_CREATED'
  | 'AI_RELEVANT_EVENT';

function compactReason(reason: string) {
  return String(reason || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

/**
 * Fase 6B.2 — shadow enqueue.
 *
 * Apenas registra que o processo precisará de nova sugestão gerencial.
 * NÃO chama Gemini e NÃO depende de ai_management_automation.enabled.
 * A flag enabled será usada pelo worker futuro (6B.3).
 *
 * Falha desta fila nunca pode interromper ingestão ou processamento jurídico.
 */
export async function enqueueManagementRefreshSafe(params: {
  supabase: any;
  processId: string | null | undefined;
  emailId?: string | null;
  trigger: ManagementRefreshTrigger;
  changedFields?: string[];
}) {
  const { supabase, processId, emailId, trigger } = params;
  if (!processId) return { queued: false, reason: 'NO_PROCESS' as const };

  const fields = [...new Set((params.changedFields || []).filter(Boolean))].sort();
  const reason = compactReason(fields.length ? `${trigger}: ${fields.join(', ')}` : trigger);

  try {
    const { data, error } = await supabase.rpc('enqueue_ai_management_refresh', {
      p_process_id: processId,
      p_trigger_reason: reason,
      p_source_processed_email_id: emailId || null,
    });

    if (error) {
      console.error('[MGMT REFRESH][SHADOW] falha ao enfileirar', {
        processId,
        emailId: emailId || null,
        trigger,
        fields,
        error: error.message,
      });
      return { queued: false, reason: 'RPC_ERROR' as const, error: error.message };
    }

    console.log('[MGMT REFRESH][SHADOW] processo sinalizado', {
      processId,
      emailId: emailId || null,
      trigger,
      fields,
      queueId: data || null,
    });

    return { queued: true, reason: 'QUEUED' as const, queueId: data || null };
  } catch (error: any) {
    console.error('[MGMT REFRESH][SHADOW] exceção isolada', {
      processId,
      emailId: emailId || null,
      trigger,
      fields,
      error: error?.message || String(error),
    });
    return { queued: false, reason: 'EXCEPTION' as const, error: error?.message || String(error) };
  }
}
