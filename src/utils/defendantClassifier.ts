/**
 * Classificação oficial de rés em grupos operacionais:
 * - SB_SAUDE (Saúde Brasil, SB Saúde, etc.)
 * - SAN_MIGUEL (San Miguel, Clínica San Miguel, etc.)
 * - OUTROS (Hub Health e quaisquer outras co-rés preservadas)
 * - INDETERMINADO (sem identificação)
 */

export type DefendantClassificationGroup =
  | 'SB_SAUDE'
  | 'SAN_MIGUEL'
  | 'OUTROS'
  | 'INDETERMINADO';

export const DEFENDANT_GROUP_LABELS: Record<DefendantClassificationGroup, string> = {
  SB_SAUDE: 'SB Saúde',
  SAN_MIGUEL: 'San Miguel',
  OUTROS: 'Outros',
  INDETERMINADO: 'Não identificado',
};

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

function normalize(value: string): string {
  return value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function classifyDefendantGroup(name?: string | null): DefendantClassificationGroup {
  if (!name || !name.trim()) return 'INDETERMINADO';
  const n = normalize(name);

  for (const pat of SB_SAUDE_PATTERNS) {
    if (n.includes(pat)) return 'SB_SAUDE';
  }
  // Palavra isolada "SB"
  if (/\bSB\b/.test(n)) return 'SB_SAUDE';

  for (const pat of SAN_MIGUEL_PATTERNS) {
    if (n.includes(pat)) return 'SAN_MIGUEL';
  }

  return 'OUTROS';
}
