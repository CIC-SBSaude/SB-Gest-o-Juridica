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
}): Promise<{ originCreated: boolean; originId?: string | null }> {
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
    .select('id, data_origem, competencia_mes, competencia_ano, tipo_data, confiabilidade')
    .eq('process_id', processId)
    .eq('is_current', true)
    .maybeSingle();

  if (findError) {
    console.warn('[processOriginHelper] Erro ao consultar origem existente:', findError.message);
  }

  // Se já existe e não temos data explícita nova para refinar, mantém
  if (existing?.id && !explicitDate) {
    return { originCreated: false, originId: existing.id };
  }

  const baseDateStr = explicitDate || receivedAt;
  if (!baseDateStr) {
    return { originCreated: false, originId: existing?.id || null };
  }

  const comp = deriveCompetencia(baseDateStr);
  const dataOrigemIso = baseDateStr.includes('T')
    ? baseDateStr.slice(0, 10)
    : baseDateStr;

  const tipoData = explicitDate ? 'DATA_DECLARADA_EMAIL' : 'DATA_RECEBIMENTO_CAIXA';
  const confiabilidade = explicitDate ? 'COMPROVADA' : 'INFERIDA';

  const newOrigin = {
    process_id: processId,
    data_origem: dataOrigemIso,
    competencia_mes: comp?.mes || null,
    competencia_ano: comp?.ano || null,
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
    return { originCreated: false, originId: existing?.id || null };
  }

  // Se havia registro anterior ativo, encadeia substituição
  if (existing?.id && inserted?.id) {
    await supabase
      .from('process_origin')
      .update({
        is_current: false,
        substituido_por: inserted.id,
      })
      .eq('id', existing.id);
  }

  return { originCreated: true, originId: inserted?.id };
}
