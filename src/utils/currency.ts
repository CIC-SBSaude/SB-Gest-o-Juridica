export function formatCurrencyBRL(value?: number | null): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function maskCurrencyBRL(value: string): string {
  let v = value.replace(/\D/g, '');
  if (v.length === 0) return '';
  v = (Number(v) / 100).toFixed(2);
  v = v.replace('.', ',');
  v = v.replace(/(\d)(\d{3})(\d{3}),/g, '$1.$2.$3,');
  v = v.replace(/(\d)(\d{3}),/g, '$1.$2,');
  return `R$ ${v}`;
}

export function parseCurrencyBRL(value: string): number {
  if (!value) return 0;
  const num = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  return parseFloat(num) || 0;
}
