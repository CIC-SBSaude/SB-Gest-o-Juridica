export function validDocumentCnj(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{20}$/.test(digits)) return false;
  const base = digits.slice(0, 7) + digits.slice(9);
  return digits.slice(7, 9) === String(98n - BigInt(base + '00') % 97n).padStart(2, '0');
}

function formatCnj(d: string) {
  return `${d.slice(0,7)}-${d.slice(7,9)}.${d.slice(9,13)}.${d.slice(13,14)}.${d.slice(14,16)}.${d.slice(16,20)}`;
}

export function extractBankProcessRows(text: string) {
  const normalized = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Layout comprovado nos anexos: cabeçalhos Processo/Protocolo, seguidos da linha numérica.
  // Não procurar janelas de vinte dígitos em sequências arbitrárias.
  if (!/bloqueio|bacenjud|sisbajud/i.test(normalized)) return [];
  const pattern = /N[ºo°.]?\s*Processo\s*N[ºo°.]?\s*Protocolo[^\d]{0,100}(\d{40,41})(?!\d)/gi;
  return [...normalized.matchAll(pattern)].map(match => {
    const processDigits = match[1].slice(0,20);
    return { cnj: formatCnj(processDigits), valid: validDocumentCnj(processDigits), bankProtocol: match[1].slice(20), raw: match[1] };
  });
}

export function identifyDocuments(blocks: Array<{ source?: string; kind?: string; text?: string }>) {
  return blocks.map((block, index) => {
    const text = String(block.text || '');
    const bankRows = block.kind === 'ATTACHMENT' ? extractBankProcessRows(text) : [];
    const formatted = text.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g) || [];
    const candidates = [...new Set([...formatted, ...bankRows.map(row => row.cnj)])];
    const validCnjs = candidates.filter(validDocumentCnj);
    const invalidCnjs = candidates.filter(cnj => !validDocumentCnj(cnj));
    const administrative = [...text.matchAll(/procedimento\s+preparat[oó]rio\s*(?:n[ºo°.]?\s*)?[:#]?\s*(\d{2}\.\d{4}\.\d{8}-\d)\b/gi)].map(match => match[1]);
    return {
      blockIndex: index, source: block.source || `Trecho ${index + 1}`, kind: block.kind || 'UNKNOWN',
      validCnjs, invalidCnjs, bankRows, administrativeIdentifiers: [...new Set(administrative)],
      review: invalidCnjs.length ? 'NUMERO_INVALIDO_REVISAR' : validCnjs.length > 1 ? 'MULTIPLOS_PROCESSOS_NO_TRECHO' : validCnjs.length === 1 ? 'IDENTIDADE_ENCONTRADA_NAO_VINCULADA' : administrative.length ? 'IDENTIFICADOR_ADMINISTRATIVO' : 'IDENTIFICACAO_INSUFICIENTE',
    };
  });
}

export function summarizeDocumentIdentification(blocks: Array<{ source?: string; kind?: string; text?: string }>) {
  const documents = identifyDocuments(blocks);
  const validCnjs = [...new Set(documents.flatMap(doc => doc.validCnjs))];
  const invalidCnjs = [...new Set(documents.flatMap(doc => doc.invalidCnjs))];
  return { documents, validCnjs, invalidCnjs, requiresHumanReview: true,
    disposition: validCnjs.length > 1 ? 'SEPARAR_POR_PROCESSO' : invalidCnjs.length ? 'REVISAR_NUMERO_INVALIDO' : validCnjs.length === 1 ? 'REVISAR_PROCESSO_IDENTIFICADO' : documents.some(doc => doc.administrativeIdentifiers.length) ? 'REVISAR_PROCEDIMENTO_ADMINISTRATIVO' : 'REVISAR_DOCUMENTOS_ORIGINAIS' };
}

export function mergeStoredProcessNumbers(meta: any, fallback?: string | null): string[] {
  const stored = Array.isArray(meta?.legal_summary?.process_numbers) ? meta.legal_summary.process_numbers : fallback ? [fallback] : [];
  const blocks = Array.isArray(meta?.ai_evidence_blocks) ? meta.ai_evidence_blocks : [];
  const recovered = blocks.filter((block: any) => block?.kind === 'ATTACHMENT')
    .flatMap((block: any) => extractBankProcessRows(String(block.text || '')).map(row => row.cnj));
  return [...new Set<string>([...stored.filter((value: unknown) => typeof value === 'string'), ...recovered])];
}

export type DocumentSeparationResult = {
  separated: boolean;
  docCnjs: string[];
  cnjsByDocument: Record<string, string[]>;
  reason: string;
};

export function hasUnambiguousDocumentSeparation(
  analysis: {
    documents: Array<{ source?: string; kind?: string; validCnjs?: string[]; invalidCnjs?: string[]; blockIndex?: number }>;
    validCnjs: string[];
    invalidCnjs: string[];
  }
): DocumentSeparationResult {
  if (analysis.invalidCnjs.length > 0) {
    return {
      separated: false,
      docCnjs: [],
      cnjsByDocument: {},
      reason: 'Há CNJ com DV inválido nos trechos analisados.',
    };
  }

  if (analysis.validCnjs.length < 2) {
    return {
      separated: false,
      docCnjs: [],
      cnjsByDocument: {},
      reason: 'Menos de 2 CNJs válidos encontrados na demanda.',
    };
  }

  const attachedDocs = analysis.documents.filter(
    doc => String(doc.kind || '').toUpperCase() === 'ATTACHMENT'
  );

  if (attachedDocs.length < 2) {
    return {
      separated: false,
      docCnjs: [],
      cnjsByDocument: {},
      reason: 'Menos de 2 anexos documentais disponíveis para comprovar separação.',
    };
  }

  const cnjsByDocMap = new Map<string, Set<string>>();
  for (const doc of attachedDocs) {
    const src = String(doc.source || `Trecho ${doc.blockIndex ?? 0}`);
    const set = cnjsByDocMap.get(src) || new Set<string>();
    for (const cnj of (doc.validCnjs || [])) {
      set.add(cnj);
    }
    cnjsByDocMap.set(src, set);
  }

  // Cada documento utilizável contém no máximo 1 CNJ válido
  for (const [src, set] of cnjsByDocMap.entries()) {
    if (set.size > 1) {
      return {
        separated: false,
        docCnjs: [],
        cnjsByDocument: Object.fromEntries([...cnjsByDocMap.entries()].map(([k, s]) => [k, [...s]])),
        reason: `Documento '${src}' contém mais de um CNJ válido (${[...set].join(', ')}).`,
      };
    }
  }

  const docCnjs = [...new Set([...cnjsByDocMap.values()].flatMap(s => [...s]))];
  if (docCnjs.length < 2) {
    return {
      separated: false,
      docCnjs,
      cnjsByDocument: Object.fromEntries([...cnjsByDocMap.entries()].map(([k, s]) => [k, [...s]])),
      reason: 'Menos de 2 CNJs distintos encontrados entre os documentos anexos.',
    };
  }

  // Todos os CNJs válidos da demanda devem estar contemplados nos documentos anexos
  const extraCnjs = analysis.validCnjs.filter(c => !docCnjs.includes(c));
  if (extraCnjs.length > 0) {
    return {
      separated: false,
      docCnjs,
      cnjsByDocument: Object.fromEntries([...cnjsByDocMap.entries()].map(([k, s]) => [k, [...s]])),
      reason: `Existem CNJs fora da separação documental: ${extraCnjs.join(', ')}.`,
    };
  }

  return {
    separated: true,
    docCnjs,
    cnjsByDocument: Object.fromEntries([...cnjsByDocMap.entries()].map(([k, s]) => [k, [...s]])),
    reason: 'Documentos individualizados comprovam separação unívoca entre múltiplos CNJs.',
  };
}

