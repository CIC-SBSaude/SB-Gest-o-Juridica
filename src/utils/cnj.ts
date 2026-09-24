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
