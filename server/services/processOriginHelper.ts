export function deriveCompetencia(dataOrigemISO: string): { mes: number; ano: number } | null {
  try {
    const date = new Date(dataOrigemISO);
    if (isNaN(date.getTime())) return null;

    const fmt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      month: 'numeric',
      year: 'numeric',
    });

    const parts = fmt.formatToParts(date);
    const mes = Number(parts.find((p) => p.type === 'month')?.value);
    const ano = Number(parts.find((p) => p.type === 'year')?.value);

    if (!mes || !ano) return null;
    return { mes, ano };
  } catch {
    return null;
  }
}

export async function ensureProcessOrigin(params: {
  supabase: any;
  processId: string;
  emailId?: string | null;
  receivedAt?: string | null;
  actorId?: string | null;
  explicitDate?: string | null;
  definidoPor?: 'SISTEMA' | 'IA' | 'USUARIO';
}): Promise<{ originCreated: boolean; originId?: string | null; reason?: string }> {
  const {
    supabase,
    processId,
    emailId,
    receivedAt,
    actorId,
    explicitDate,
    definidoPor = 'SISTEMA',
  } = params;

  const { data: existing, error: findError } = await supabase
    .from('process_origin')
    .select('id, data_origem, competencia_mes, competencia_ano, tipo_data, confiabilidade, manual, definido_por')
    .eq('process_id', processId)
    .eq('is_current', true)
    .maybeSingle();

  if (findError) {
    console.warn('[processOriginHelper] Erro ao consultar origem existente:', findError.message);
  }

  // 1. Preserva origem manual ou confirmada por usuário humano (Requisitos 3.1 & 4)
  if (existing?.id && (existing.manual || existing.definido_por === 'USUARIO' || existing.confiabilidade === 'MANUAL')) {
    return { originCreated: false, originId: existing.id, reason: 'PRESERVED_HUMAN' };
  }

  // 2. Precedência: data explicitada no e-mail tem maior prioridade que recebimento da caixa.
  // Se já temos data declarada no e-mail comprovada e a chamada atual não traz nova data explícita, preserva
  if (existing?.id && existing.tipo_data === 'DATA_DECLARADA_EMAIL' && !explicitDate) {
    return { originCreated: false, originId: existing.id, reason: 'PRESERVED_EXPLICIT' };
  }

  const baseDateStr = explicitDate || receivedAt;
  if (!baseDateStr) {
    return { originCreated: false, originId: existing?.id || null, reason: 'NO_DATE' };
  }

  const comp = deriveCompetencia(baseDateStr);
  if (!comp) {
    return { originCreated: false, originId: existing?.id || null, reason: 'INVALID_DATE' };
  }

  const dataOrigemIso = baseDateStr.includes('T')
    ? baseDateStr.slice(0, 10)
    : baseDateStr;

  // Idempotência: se a data e competência já são exatamente as mesmas, não recria
  if (
    existing?.id &&
    existing.data_origem === dataOrigemIso &&
    existing.competencia_mes === comp.mes &&
    existing.competencia_ano === comp.ano
  ) {
    return { originCreated: false, originId: existing.id, reason: 'ALREADY_CURRENT' };
  }

  const tipoData = explicitDate ? 'DATA_DECLARADA_EMAIL' : 'DATA_RECEBIMENTO_CAIXA';
  const confiabilidade = explicitDate ? 'COMPROVADA' : 'INFERIDA';

  const newOrigin = {
    process_id: processId,
    data_origem: dataOrigemIso,
    competencia_mes: comp.mes,
    competencia_ano: comp.ano,
    tipo_data: tipoData,
    confiabilidade,
    email_referencia_id: emailId || null,
    manual: false,
    definido_por: definidoPor,
    definido_por_usuario_id: actorId || null,
    is_current: true,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('process_origin')
    .insert(newOrigin)
    .select('id')
    .single();

  if (insertError) {
    console.warn('[processOriginHelper] Erro ao gravar process_origin:', insertError.message);
    return { originCreated: false, originId: existing?.id || null, reason: insertError.message };
  }

  // Desativa registros correntes anteriores mantendo histórico atômico
  if (inserted?.id) {
    await supabase
      .from('process_origin')
      .update({
        is_current: false,
        substituido_por: inserted.id,
      })
      .eq('process_id', processId)
      .eq('is_current', true)
      .neq('id', inserted.id);
  }

  return { originCreated: true, originId: inserted?.id };
}
