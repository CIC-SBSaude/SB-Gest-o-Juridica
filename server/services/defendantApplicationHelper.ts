export type DefendantGroup = 'SB_SAUDE' | 'SAN_MIGUEL' | 'OUTROS' | 'INDETERMINADO';

const SB_SAUDE_PATTERNS = [
  'SB SAUDE',
  'SAUDE BRASIL',
  'SANTA BARBARA',
  'OPERADORA SAUDE BRASIL',
];

const SAN_MIGUEL_PATTERNS = [
  'SAN MIGUEL',
  'SAN MIGUEL SAUDE',
  'CLINICA SAN MIGUEL',
];

export function normalizeText(value: string): string {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function classifyDefendantGroup(name?: string | null): DefendantGroup {
  if (!name || !name.trim()) return 'INDETERMINADO';
  const n = normalizeText(name);

  for (const pat of SB_SAUDE_PATTERNS) {
    if (n.includes(pat)) return 'SB_SAUDE';
  }
  if (/\bSB\b/.test(n)) return 'SB_SAUDE';

  for (const pat of SAN_MIGUEL_PATTERNS) {
    if (n.includes(pat)) return 'SAN_MIGUEL';
  }

  return 'OUTROS';
}

export interface CandidateDefendant {
  nome: string;
  documento?: string | null;
  papel?: 'REU' | 'REU_SOLIDARIO' | 'REU_SUBSIDIARIO' | 'NAO_IDENTIFICADA' | 'OUTRA';
  evidenciaTexto?: string | null;
  evidenciaFonte?: 'EMAIL' | 'DOCUMENTO' | 'MANUAL';
  confianca?: number;
}

/**
 * Extrai candidatos a réus a partir de menções em texto ("em face de ...", "contra ...", etc.)
 * Preserva co-rés separadas por "e" ou "," (ex: "Saúde Brasil e Hub Health").
 */
export function extractDefendantsFromText(text: string): CandidateDefendant[] {
  if (!text) return [];
  const results: CandidateDefendant[] = [];

  const patterns = [
    /(?:em\s+face\s+de|contra|ajuizada\s+em\s+face\s+de|movida\s+em\s+face\s+de|demandad[oa]s?|requerid[oa]s?|r[eé]us?)\s*[:\-–—]?\s*([A-ZÀ-Ÿa-zà-ÿ0-9\s.,&'’_-]{4,180})/gi,
  ];

  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const captured = match[1] || '';
      // Limpa pontuações de fim de frase ou conectivos processuais
      const cleanSnippet = captured
        .split(/(?:decorrente|visando|requer|onde|com\s+pedido|distribu[ií]d|valor|\.|$)/i)[0]
        .trim();

      if (!cleanSnippet || cleanSnippet.length < 3) continue;

      // Separa múltiplos réus quando ligados por " e " ou vírgula
      const parts = cleanSnippet
        .split(/\s+(?:e|com)\s+|,\s*/i)
        .map((p) => p.trim())
        .filter((p) => p.length >= 3 && !/^(?:outros?|demais|etc)$/i.test(p));

      for (const part of parts) {
        if (!results.some((r) => normalizeText(r.nome) === normalizeText(part))) {
          results.push({
            nome: part,
            papel: parts.length > 1 ? 'REU_SOLIDARIO' : 'REU',
            evidenciaTexto: match[0].slice(0, 300),
            evidenciaFonte: 'EMAIL',
            confianca: 0.85,
          });
        }
      }
    }
  }

  return results;
}

export async function ensureProcessDefendants(params: {
  supabase: any;
  processId: string;
  candidates: CandidateDefendant[];
  actorId?: string | null;
}): Promise<{ createdCount: number; defendants: any[] }> {
  const { supabase, processId, candidates, actorId } = params;
  if (!candidates || candidates.length === 0) {
    return { createdCount: 0, defendants: [] };
  }

  // 1. Carrega rés já existentes no processo para não duplicar
  const { data: existing, error: loadError } = await supabase
    .from('process_defendants')
    .select('id, nome_livre, company_id, confirmado, papel')
    .eq('process_id', processId);

  if (loadError) {
    console.warn('[defendantApplicationHelper] Erro ao carregar rés existentes:', loadError.message);
    return { createdCount: 0, defendants: [] };
  }

  const existingNorms = new Set(
    (existing || []).map((e: any) => normalizeText(e.nome_livre || ''))
  );

  const isMultiple = (candidates.length + (existing || []).length) > 1;
  const toInsert: any[] = [];

  for (const cand of candidates) {
    const norm = normalizeText(cand.nome);
    if (!norm || norm.length < 3 || existingNorms.has(norm)) {
      continue;
    }

    const group = classifyDefendantGroup(cand.nome);
    const confidence = cand.confianca ?? 0.8;
    // Confirmação automática somente para entidades canônicas comprovadas com alta confiança
    const autoConfirm = confidence >= 0.90 && (group === 'SB_SAUDE' || group === 'SAN_MIGUEL');

    toInsert.push({
      process_id: processId,
      nome_livre: cand.nome.trim(),
      documento_livre: cand.documento || null,
      papel: cand.papel || (isMultiple ? 'REU_SOLIDARIO' : 'REU'),
      evidencia_texto: cand.evidenciaTexto || null,
      evidencia_fonte: cand.evidenciaFonte || 'EMAIL',
      confirmado: autoConfirm,
      created_by: actorId || null,
      updated_by: actorId || null,
    });

    existingNorms.add(norm);
  }

  if (toInsert.length === 0) {
    return { createdCount: 0, defendants: existing || [] };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('process_defendants')
    .insert(toInsert)
    .select();

  if (insertError) {
    console.warn('[defendantApplicationHelper] Erro ao inserir rés estruturadas:', insertError.message);
    return { createdCount: 0, defendants: existing || [] };
  }

  return {
    createdCount: (inserted || []).length,
    defendants: [...(existing || []), ...(inserted || [])],
  };
}
