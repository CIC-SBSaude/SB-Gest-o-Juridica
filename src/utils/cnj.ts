export function formatProcessNumber(value?: string | null): string {
  if (!value) return '';
  const num = value.replace(/\D/g, '');
  if (num.length !== 20) return value;
  return `${num.substring(0, 7)}-${num.substring(7, 9)}.${num.substring(9, 13)}.${num.substring(13, 14)}.${num.substring(14, 16)}.${num.substring(16, 20)}`;
}

export function unmaskProcessNumber(value: string): string {
  return value.replace(/\D/g, '');
}

export function canonicalCnj(value: string): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 20) return null;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

/** Validação oficial do dígito verificador CNJ pelo módulo 97. */
export function isValidCnj(value: string): boolean {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 20 || !/^\d{20}$/.test(digits)) return false;

  const base = `${digits.slice(0, 7)}${digits.slice(9)}`;
  try {
    const remainder = BigInt(`${base}00`) % 97n;
    const expected = String(98n - remainder).padStart(2, '0');
    return digits.slice(7, 9) === expected;
  } catch {
    return false;
  }
}

export function validateProcessNumber(cnj: string): boolean {
  return isValidCnj(cnj);
}

export function maskCNJ(value: string): string {
  const v = value.replace(/\D/g, '');
  return v
    .replace(/^(\d{7})(\d)/, '$1-$2')
    .replace(/-(\d{2})(\d)/, '-$1.$2')
    .replace(/\.(\d{4})(\d)/, '.$1.$2')
    .replace(/\.(\d{1})(\d)/, '.$1.$2')
    .replace(/\.(\d{2})(\d)/, '.$1.$2')
    .substring(0, 25);
}
export const BRAZILIAN_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export type BrazilianUf = typeof BRAZILIAN_UFS[number];

const ESTADUAL_TR_TO_UF: Record<string, { uf: BrazilianUf; tribunal: string }> = {
  '01': { uf: 'AC', tribunal: 'TJAC' },
  '02': { uf: 'AL', tribunal: 'TJAL' },
  '03': { uf: 'AP', tribunal: 'TJAP' },
  '04': { uf: 'AM', tribunal: 'TJAM' },
  '05': { uf: 'BA', tribunal: 'TJBA' },
  '06': { uf: 'CE', tribunal: 'TJCE' },
  '07': { uf: 'DF', tribunal: 'TJDFT' },
  '08': { uf: 'ES', tribunal: 'TJES' },
  '09': { uf: 'GO', tribunal: 'TJGO' },
  '10': { uf: 'MA', tribunal: 'TJMA' },
  '11': { uf: 'MT', tribunal: 'TJMT' },
  '12': { uf: 'MS', tribunal: 'TJMS' },
  '13': { uf: 'MG', tribunal: 'TJMG' },
  '14': { uf: 'PA', tribunal: 'TJPA' },
  '15': { uf: 'PB', tribunal: 'TJPB' },
  '16': { uf: 'PR', tribunal: 'TJPR' },
  '17': { uf: 'PE', tribunal: 'TJPE' },
  '18': { uf: 'PI', tribunal: 'TJPI' },
  '19': { uf: 'RJ', tribunal: 'TJRJ' },
  '20': { uf: 'RN', tribunal: 'TJRN' },
  '21': { uf: 'RS', tribunal: 'TJRS' },
  '22': { uf: 'RO', tribunal: 'TJRO' },
  '23': { uf: 'RR', tribunal: 'TJRR' },
  '24': { uf: 'SC', tribunal: 'TJSC' },
  '25': { uf: 'SE', tribunal: 'TJSE' },
  '26': { uf: 'SP', tribunal: 'TJSP' },
  '27': { uf: 'TO', tribunal: 'TJTO' },
};

/**
 * Inferência determinística de UF a partir do segmento de tribunal CNJ.
 * Para Justiça Estadual (J=8), o código TR mapeia 1-a-1 com o respectivo estado.
 */
export function inferUfFromCnj(value?: string | null): string | null {
  const info = getUfInfoFromCnj(value);
  return info?.uf ?? null;
}

export function getUfInfoFromCnj(
  value?: string | null
): { uf: BrazilianUf; tribunal: string; confianca: number } | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 20) return null;
  const j = digits.substring(13, 14);
  const tr = digits.substring(14, 16);
  if (j === '8') {
    const item = ESTADUAL_TR_TO_UF[tr];
    if (item) return { ...item, confianca: 1.0 };
  }
  return null;
}
