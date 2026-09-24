/**
 * Classificação estruturada de partes processuais para Operadora de Saúde Suplementar.
 * 
 * Regras estritas:
 * 1. AUTOR: evidência explícita de papel ativo (Autor, Autora, Requerente, Reclamante, Demandante, Exequente, Impetrante, Polo Ativo, etc.)
 * 2. REU: indicação explícita de papel passivo (Réu, Ré, Requerido, Requerida, Reclamado, Reclamada, Demandado, Executado, Impetrado, Polo Passivo, etc.)
 * 3. REPRESENTANTE: indicação explícita de advogado, procurador, representante legal, patrono ou defensor.
 * 4. TERCEIRO: identificado explicitamente como terceiro, terceiro interessado, assistente ou amicus curiae.
 * 5. PARTE_IDENTIFICADA: fallback obrigatório quando não houver evidência suficiente, houver conflito entre fontes ou for mera menção.
 * 
 * Segurança:
 * - Não inferir AUTOR ou REU apenas pela ordem dos nomes.
 * - Não considerar principal = true como sinônimo de AUTOR.
 */

export type ProcessPartyTipo =
  | 'AUTOR'
  | 'REU'
  | 'TERCEIRO'
  | 'REPRESENTANTE'
  | 'PARTE_IDENTIFICADA';

export const AUTOR_TERMS =
  'polo\\s+ativo|autor(?:a)?|requerente|reclamante|demandante|exequente|impetrante|promovente|embargante';

export const REU_TERMS =
  'polo\\s+passivo|r[eé]u|r[eé]|requerid[oa]|reclamad[oa]|demandad[oa]|executad[oa]|impetrad[oa]|promovid[oa]|embargad[oa]';

export const REPRESENTANTE_TERMS =
  'advogad[oa]|adv\\.?|procurador(?:a)?|representante\\s+legal|patrono|patrona|defensor(?:a)?\\s+p[uú]blic[oa]';

export const TERCEIRO_TERMS =
  'terceir[oa]\\s+interessad[oa]|terceir[oa]|interessad[oa]|assistente(?:\\s+litisconsorcial|\\s+simples)?|amicus\\s+curiae';

const PREFIX_CONNECTOR = '\\s*[:\\-–—]?\\s*(?:d[oa]s?\\s+)?$';
const SUFFIX_CONNECTOR =
  '^[\\s,–—()/-]*(?:[eé]\\s+[oa]\\s+|na\\s+qualidade\\s+de\\s+|na\\s+condi[çc][aã]o\\s+de\\s+|ora\\s+|como\\s+|qualificad[oa]\\s+como\\s+)?';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normaliza o nome da parte removendo pontuações residuais no fim.
 */
export function normalizePartyName(name: string): string {
  return String(name || '')
    .replace(/[.,;:!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Avalia evidência de papel para um nome específico dentro de um único texto.
 */
export function classifyPartyRoleInSingleText(name: string, text: string): Set<ProcessPartyTipo> {
  const roles = new Set<ProcessPartyTipo>();
  const cleanName = normalizePartyName(name);
  if (!cleanName || cleanName.length < 3 || !text) {
    return roles;
  }

  const namePattern = cleanName.split(/\s+/).map(escapeRegex).join('\\s+');
  const regex = new RegExp(namePattern, 'gi');

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = regex.lastIndex;
    const before = text.slice(Math.max(0, start - 100), start);
    const after = text.slice(end, Math.min(text.length, end + 100));

    // 1. Prefix checks (e.g. "advogado: CARLOS", "autor: JOÃO")
    // REPRESENTANTE takes precedence over AUTOR prefix in case of "advogado do autor:"
    if (new RegExp(`(?<![a-záéíóúâêôãõç])(?:${REPRESENTANTE_TERMS})${PREFIX_CONNECTOR}`, 'i').test(before)) {
      roles.add('REPRESENTANTE');
    } else if (new RegExp(`(?<![a-záéíóúâêôãõç])(?:${AUTOR_TERMS})${PREFIX_CONNECTOR}`, 'i').test(before)) {
      roles.add('AUTOR');
    } else if (new RegExp(`(?<![a-záéíóúâêôãõç])(?:${REU_TERMS})${PREFIX_CONNECTOR}`, 'i').test(before)) {
      roles.add('REU');
    } else if (new RegExp(`(?<![a-záéíóúâêôãõç])(?:${TERCEIRO_TERMS})${PREFIX_CONNECTOR}`, 'i').test(before)) {
      roles.add('TERCEIRO');
    }

    // 2. Suffix checks (e.g. "JOÃO DA SILVA, autor", "MARIA X, reclamante", "EMPRESA Y, requerida")
    if (new RegExp(`${SUFFIX_CONNECTOR}(?:${REPRESENTANTE_TERMS})(?![a-záéíóúâêôãõç])`, 'i').test(after)) {
      roles.add('REPRESENTANTE');
    } else if (new RegExp(`${SUFFIX_CONNECTOR}(?:${AUTOR_TERMS})(?![a-záéíóúâêôãõç])`, 'i').test(after)) {
      roles.add('AUTOR');
    } else if (new RegExp(`${SUFFIX_CONNECTOR}(?:${REU_TERMS})(?![a-záéíóúâêôãõç])`, 'i').test(after)) {
      roles.add('REU');
    } else if (new RegExp(`${SUFFIX_CONNECTOR}(?:${TERCEIRO_TERMS})(?![a-záéíóúâêôãõç])`, 'i').test(after)) {
      roles.add('TERCEIRO');
    }
  }

  // 3. A x B Pattern check (NOME_A x NOME_B)
  const cleanText = text.replace(/\s+/g, ' ');
  const partyPattern = `[A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ\\s\\.\\-\\'\\&]{3,}[A-ZÀ-Ÿa-zà-ÿ]`;
  
  const leftXRegex = new RegExp(`\\b${namePattern}\\s+[xX]\\s+${partyPattern}\\b`, 'i');
  if (leftXRegex.test(cleanText)) {
    roles.add('AUTOR');
  }

  const rightXRegex = new RegExp(`\\b${partyPattern}\\s+[xX]\\s+${namePattern}\\b`, 'i');
  if (rightXRegex.test(cleanText)) {
    roles.add('REU');
  }

  return roles;
}

/**
 * Classifica a parte em AUTOR, REU, REPRESENTANTE, TERCEIRO ou PARTE_IDENTIFICADA.
 * 
 * Regra de conflito: Se múltiplas evidências indicarem papéis conflitantes
 * (ex.: AUTOR em uma menção e REU em outra), retorna estritamente PARTE_IDENTIFICADA.
 */
export function classifyPartyRole(
  name: string,
  contexts: Array<string | { text?: string; excerpt?: string; evidence_excerpt?: string; extracted_value?: string } | null | undefined>
): ProcessPartyTipo {
  const cleanName = normalizePartyName(name);
  if (!cleanName || cleanName.length < 3) {
    return 'PARTE_IDENTIFICADA';
  }

  const allRoles = new Set<ProcessPartyTipo>();

  for (const item of contexts) {
    if (!item) continue;
    const text = typeof item === 'string'
      ? item
      : [item.text, item.excerpt, item.evidence_excerpt, item.extracted_value].filter(Boolean).join(' ');

    if (!text) continue;
    const textRoles = classifyPartyRoleInSingleText(cleanName, text);
    for (const r of textRoles) {
      allRoles.add(r);
    }
  }

  // Se houver exatamente 1 papel detectado sem conflito, retorna-o
  if (allRoles.size === 1) {
    return [...allRoles][0];
  }

  // Se houver 0 papéis (sem evidência explícita) ou > 1 (conflito de papéis), retorna PARTE_IDENTIFICADA
  return 'PARTE_IDENTIFICADA';
}

export interface ExtractedParty {
  name: string;
  role: ProcessPartyTipo;
  excerpt: string;
  matchedPattern: 'PREFIX' | 'SUFFIX';
}

/**
 * Extrai candidatos a partes e seus papéis diretamente de um bloco de texto.
 * Reconhece tanto menções prefixadas (ex: "Reclamante: Maria") quanto sufixadas ("Maria, reclamante").
 */
export function extractPartiesWithRoles(text: string): ExtractedParty[] {
  if (!text || typeof text !== 'string') return [];
  const results: ExtractedParty[] = [];
  const seen = new Set<string>();

  const ALL_PREFIX_TERMS = `(?:${AUTOR_TERMS}|${REU_TERMS}|${REPRESENTANTE_TERMS}|${TERCEIRO_TERMS}|benefici[aá]ri[oa]|paciente|em\\s+nome\\s+de)`;
  const PREFIX_REGEX = new RegExp(
    `\\b${ALL_PREFIX_TERMS}\\s*[:\\-–—]?\\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'’.-]+(?:\\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'’.-]+){1,7})`,
    'g'
  );

  let match: RegExpExecArray | null;
  while ((match = PREFIX_REGEX.exec(text)) !== null) {
    const rawName = match[1];
    const cleanName = normalizePartyName(rawName);
    if (cleanName.length < 5) continue;
    const key = `${cleanName.toLowerCase()}:PREFIX`;
    if (seen.has(key)) continue;
    seen.add(key);

    const excerptStart = Math.max(0, match.index - 40);
    const excerptEnd = Math.min(text.length, match.index + match[0].length + 40);
    const excerpt = text.slice(excerptStart, excerptEnd).replace(/\s+/g, ' ').trim();

    const role = classifyPartyRole(cleanName, [excerpt]);
    results.push({
      name: cleanName,
      role,
      excerpt,
      matchedPattern: 'PREFIX',
    });
  }

  const ALL_SUFFIX_TERMS = `(?:${AUTOR_TERMS}|${REU_TERMS}|${REPRESENTANTE_TERMS}|${TERCEIRO_TERMS})`;
  const SUFFIX_REGEX = new RegExp(
    `([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'’.-]+(?:\\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'’.-]+){1,7})\\s*[,(–—/-]\\s*(?:[eé]\\s+[oa]\\s+|na\\s+qualidade\\s+de\\s+|na\\s+condi[çc][aã]o\\s+de\\s+|ora\\s+|como\\s+)?(${ALL_SUFFIX_TERMS})\\b`,
    'gi'
  );

  while ((match = SUFFIX_REGEX.exec(text)) !== null) {
    const rawName = match[1];
    const cleanName = normalizePartyName(rawName);
    if (cleanName.length < 5) continue;
    const key = `${cleanName.toLowerCase()}:SUFFIX`;
    if (seen.has(key)) continue;
    seen.add(key);

    const excerptStart = Math.max(0, match.index - 30);
    const excerptEnd = Math.min(text.length, match.index + match[0].length + 30);
    const excerpt = text.slice(excerptStart, excerptEnd).replace(/\s+/g, ' ').trim();

    const role = classifyPartyRole(cleanName, [excerpt]);
    results.push({
      name: cleanName,
      role,
      excerpt,
      matchedPattern: 'SUFFIX',
    });
  }

  return results;
}
