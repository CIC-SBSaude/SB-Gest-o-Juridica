// Um protocolo externo deve conter dígitos. Texto livre e CNJ pertencem a outros campos.
export function isValidExternalProtocol(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return /^[A-Z0-9][A-Z0-9./-]{3,28}[A-Z0-9]$/i.test(text)
    && /\d/.test(text)
    && text.replace(/\D/g, '').length !== 20;
}

export function filterExternalProtocols(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(isValidExternalProtocol).map(value => value.trim()))];
}

export function extractExternalProtocols(text: string): Array<{ value: string; raw: string }> {
  // A fronteira depois do rótulo impede proc de consumir o início de procedimento/processual.
  const pattern = /(?<![\p{L}\p{N}_])(?:protocolo\b|proc\b\.?|n[ºo.°]?\s*prot\b\.?)\s*[:#]?\s*(?:n(?:[ºo°.]|[úu]mero)\s*[:.]?\s*)?([A-Z0-9][A-Z0-9./-]{3,28}[A-Z0-9])(?![\p{L}\p{N}_/-]|\.[A-Z0-9])/giu;
  return [...String(text || '').matchAll(pattern)]
    .filter(match => isValidExternalProtocol(match[1]))
    .map(match => ({ value: match[1], raw: match[0] }));
}
