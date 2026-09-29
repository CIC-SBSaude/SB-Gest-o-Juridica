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
  companyId?: string | null;
  papel?: 'REU' | 'REU_SOLIDARIO' | 'REU_SUBSIDIARIO' | 'NAO_IDENTIFICADA' | 'OUTRA';
  evidenciaTexto?: string | null;
  evidenciaFonte?: 'EMAIL' | 'DOCUMENTO' | 'MANUAL';
  confianca?: number;
}

function cleanCnpj(value: unknown): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
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
}): Promise<{ createdCount: number; defendants: any[]; preservedHuman?: boolean }> {
  const { supabase, processId, candidates, actorId } = params;
  if (!candidates || candidates.length === 0) {
    return { createdCount: 0, defendants: [] };
  }

  // 1. Carrega rés já existentes no processo para não duplicar e respeitar histórico humano
  const { data: existing, error: loadError } = await supabase
    .from('process_defendants')
    .select('id, nome_livre, company_id, confirmado, papel, correcao_por')
    .eq('process_id', processId);

  if (loadError) {
    console.warn('[defendantApplicationHelper] Erro ao carregar rés existentes:', loadError.message);
    return { createdCount: 0, defendants: [] };
  }

  const existingNorms = new Set(
    (existing || []).map((e: any) => normalizeText(e.nome_livre || ''))
  );
  const existingCompanyIds = new Set(
    (existing || []).map((e: any) => e.company_id).filter(Boolean)
  );

  const isMultiple = (candidates.length + (existing || []).length) > 1;
  const toInsert: any[] = [];

  for (const cand of candidates) {
    const norm = normalizeText(cand.nome);
    if (!norm || norm.length < 3) continue;

    let matchedCompanyId: string | null = cand.companyId || null;
    const cleanDoc = cleanCnpj(cand.documento);

    // Resolução canônica por CNPJ
    if (!matchedCompanyId && cleanDoc) {
      const { data: comp } = await supabase
        .from('companies')
        .select('id')
        .eq('cnpj', cleanDoc)
        .eq('active', true)
        .maybeSingle();
      if (comp?.id) {
        matchedCompanyId = comp.id;
      }
    }

    // Resolução canônica por nome/alias caso CNPJ não tenha resolvido
    if (!matchedCompanyId) {
      const { data: compByName } = await supabase
        .from('companies')
        .select('id')
        .or(`nome.ilike.${cand.nome.trim()},nome_normalizado.ilike.${norm}`)
        .eq('active', true)
        .maybeSingle();

      if (compByName?.id) {
        matchedCompanyId = compByName.id;
      } else {
        const { data: aliasMatch } = await supabase
          .from('company_aliases')
          .select('company_id')
          .eq('alias_normalizado', norm)
          .eq('active', true)
          .maybeSingle();
        if (aliasMatch?.company_id) {
          matchedCompanyId = aliasMatch.company_id;
        }
      }
    }

    // Idempotência estrita: se já existe pelo company_id ou pelo nome_livre normalizado, não duplica
    if (matchedCompanyId && existingCompanyIds.has(matchedCompanyId)) {
      continue;
    }
    if (existingNorms.has(norm)) {
      continue;
    }

    const group = classifyDefendantGroup(cand.nome);
    const confidence = cand.confianca ?? 0.8;

    // Regra Requisitos.md: Entidade com CNPJ/catalogação inequívoca ou grupo canônico
    // com alta confiança (>= 0.90) é confirmada automaticamente. Demais ficam pendentes de revisão.
    const autoConfirm = Boolean(
      confidence >= 0.90 && (
        matchedCompanyId != null ||
        group === 'SB_SAUDE' ||
        group === 'SAN_MIGUEL'
      )
    );

    toInsert.push({
      process_id: processId,
      company_id: matchedCompanyId,
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
    if (matchedCompanyId) existingCompanyIds.add(matchedCompanyId);
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
