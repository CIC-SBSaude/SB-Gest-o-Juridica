export interface GeminiJsonParseResult<T = any> {
  value: T;
  repaired: boolean;
  repairSteps: string[];
}

function stripMarkdownFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractJsonEnvelope(text: string) {
  const source = text.trim();
  const firstObject = source.indexOf('{');
  const firstArray = source.indexOf('[');

  let start = -1;
  let opener = '';
  let closer = '';

  if (firstObject >= 0 && (firstArray < 0 || firstObject < firstArray)) {
    start = firstObject;
    opener = '{';
    closer = '}';
  } else if (firstArray >= 0) {
    start = firstArray;
    opener = '[';
    closer = ']';
  }

  if (start < 0) return source;

  let inString = false;
  let escaped = false;
  let depth = 0;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  // Envelope incompleto: preserva do início do JSON em diante para que
  // o parser produza um erro útil. Não tenta "inventar" fechamento.
  return source.slice(start);
}

function sanitizeOutsideStrings(text: string) {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }

      // JSON não aceita controles crus dentro de strings.
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }

      out += ch;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    // Alguns retornos observados vêm com "\{" ou "\[" fora de strings.
    // Fora de string esse escape nunca é JSON válido, então pode ser removido
    // deterministicamente sem alterar conteúdo textual legítimo.
    if (ch === '\\' && i + 1 < text.length && '{}[],:'.includes(text[i + 1])) {
      continue;
    }

    out += ch;
  }

  return out;
}

function removeTrailingCommas(text: string) {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      if (text[j] === '}' || text[j] === ']') continue;
    }

    out += ch;
  }

  return out;
}

function normalizeUnicode(text: string) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function attemptParse(text: string) {
  return JSON.parse(text);
}

export function parseGeminiJson<T = any>(rawText: string): GeminiJsonParseResult<T> {
  const original = String(rawText || '').trim();
  if (!original) {
    throw Object.assign(new Error('GEMINI_EMPTY_RESPONSE: resposta vazia.'), {
      code: 'GEMINI_EMPTY_RESPONSE',
    });
  }

  try {
    return { value: attemptParse(original) as T, repaired: false, repairSteps: [] };
  } catch (firstError: any) {
    const steps: string[] = [];
    let candidate = original;

    const unicode = normalizeUnicode(candidate);
    if (unicode !== candidate) {
      candidate = unicode;
      steps.push('UNICODE_NORMALIZED');
    }

    const unfenced = stripMarkdownFence(candidate);
    if (unfenced !== candidate) {
      candidate = unfenced;
      steps.push('MARKDOWN_FENCE_REMOVED');
    }

    const envelope = extractJsonEnvelope(candidate);
    if (envelope !== candidate) {
      candidate = envelope;
      steps.push('JSON_ENVELOPE_EXTRACTED');
    }

    const sanitized = sanitizeOutsideStrings(candidate);
    if (sanitized !== candidate) {
      candidate = sanitized;
      steps.push('INVALID_OUTSIDE_STRING_ESCAPES_REMOVED');
    }

    const noTrailingCommas = removeTrailingCommas(candidate);
    if (noTrailingCommas !== candidate) {
      candidate = noTrailingCommas;
      steps.push('TRAILING_COMMAS_REMOVED');
    }

    try {
      return {
        value: attemptParse(candidate) as T,
        repaired: true,
        repairSteps: steps,
      };
    } catch (finalError: any) {
      const error = Object.assign(
        new Error(
          `GEMINI_INVALID_JSON: ${String(finalError?.message || firstError?.message || 'JSON inválido')}`
        ),
        {
          code: 'GEMINI_INVALID_JSON',
          initialParseMessage: String(firstError?.message || ''),
          finalParseMessage: String(finalError?.message || ''),
          repairSteps: steps,
          sample: candidate.slice(0, 500),
        }
      );
      throw error;
    }
  }
}

export function buildInvalidJsonRetryInstruction(params: {
  originalRequest: string;
  parseMessage: string;
}) {
  return `${params.originalRequest}

ATENÇÃO DE FORMATAÇÃO:
A resposta anterior não pôde ser interpretada como JSON válido (${params.parseMessage.slice(0, 180)}).
Gere a resposta NOVAMENTE, do zero.
Retorne APENAS um objeto JSON válido.
Não use markdown, blocos de código, comentários ou texto antes/depois do JSON.
Não use vírgula após o último item.
Não escape chaves, colchetes, vírgulas ou dois-pontos fora de strings.
Garanta aspas duplas em todas as chaves e strings JSON.`;
}
