type CompanyResolutionMethod =
  | 'CONFIRMADO_HUMANO'
  | 'CNPJ_EXATO'
  | 'NOME_EXATO'
  | 'ALIAS_EXATO'
  | 'CNPJ_AUTO_CADASTRO'
  | 'AGUARDANDO_CONFIRMACAO'
  | 'NAO_RESOLVIDO'
  | 'AMBIGUO';

export interface CompanyResolutionResult {
  companyId: string | null;
  method: CompanyResolutionMethod;
  sourceValue: string | null;
  confidence: number;
  candidates: Array<{ id: string; nome: string }>;
  candidateId?: string | null;
}

function normalizeName(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCnpj(value: unknown): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
}

function validCnpj(value: string): boolean {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const calc = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((acc, digit, i) => acc + Number(digit) * weights[i], 0);
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };
  const d1 = calc(value.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = calc(value.slice(0, 12) + d1, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return value.endsWith(`${d1}${d2}`);
}

export function cleanCorporateName(value: string): string {
  return String(value || '').trim()
    .replace(/(?:\s+(?:raz[aã]o\s+social|CPF)\s*[:.-]?)+$/i, '')
    .replace(/[\s.,;:]+$/, '').trim();
}

export function looksCorporateName(value: string): boolean {
  const n = normalizeName(value);
  return /\b(LTDA|LIMITADA|EIRELI|S A|SOCIEDADE|HOSPITAL|CLINICA|INSTITUTO|ASSOCIACAO|FUNDACAO|OPERADORA)\b/.test(n);
}

type ContextEvidence = {
  field?: string;
  value?: unknown;
  excerpt?: string | null;
  confidence?: number | null;
  source?: string;
};

export type ContextualCompanyAssociation = {
  cnpj: string;
  name: string | null;
  classification: 'STRONG_PAIR' | 'UNPAIRED' | 'PROVIDER_DIRECTORY';
  excerpt: string | null;
  confidence: number | null;
  processRole?: 'PARTE_INDICADA' | 'FAVORECIDO_FINANCEIRO' | 'PRESTADOR' | 'NAO_DETERMINADO';
  roleEvidence?: string;
};

export function classifyProcessRole(name: string | null, excerpt: string, parties: Array<{ nome: string; tipo?: string }>, description: string): { processRole: NonNullable<ContextualCompanyAssociation['processRole']>; roleEvidence: string } {
  const key = normalizeName(cleanCorporateName(name || ''));
  if (!key) return { processRole: 'NAO_DETERMINADO', roleEvidence: 'Nome completo não identificado.' };
  const typed = parties.find(p => normalizeName(cleanCorporateName(p.nome)) === key && /^(AUTOR|AUTORA|REU|RE|REQUERENTE|REQUERIDO|REQUERIDA|EXECUTADO|EXECUTADA|EXEQUENTE)$/.test(normalizeName(p.tipo || '')));
  if (typed) return { processRole: 'PARTE_INDICADA', roleEvidence: `Cadastro de partes: ${typed.tipo} — ${typed.nome}` };
  const text = normalizeName(description);
  // O resumo apenas indica uma parte; não prova responsabilidade nem identidade fiscal.
  if ((` ${text} `).includes(` ${key} `) && /\b(X|VERSUS|AUTOR|AUTORA|REU|REQUERIDO|REQUERIDA|EXECUTADO|EXECUTADA)\b/.test(text)) {
    return { processRole: 'PARTE_INDICADA', roleEvidence: `Indicação no resumo do processo: ${description}` };
  }
  if (/nome\s+favorecido\s*:/i.test(excerpt)) return { processRole: 'FAVORECIDO_FINANCEIRO', roleEvidence: 'Nome identificado em comprovante financeiro; esse papel não comprova participação processual.' };
  return { processRole: 'NAO_DETERMINADO', roleEvidence: 'Não há papel processual explícito nas fontes consultadas.' };
}

function significantTokens(value: string): string[] {
  const ignored = new Set(['A', 'O', 'AS', 'OS', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'LTDA', 'LIMITADA', 'EIRELI', 'SA']);
  return normalizeName(value).split(' ').filter(token => token.length >= 3 && !ignored.has(token));
}

function nameAppearsInContext(name: string, excerpt: string): boolean {
  const normalizedExcerpt = normalizeName(excerpt);
  const compactExcerpt = normalizedExcerpt.replace(/\s/g, '');
  const compactName = normalizeName(cleanCorporateName(name)).replace(/\s/g, '').replace(/(?:LTDA|LIMITADA|EIRELI|SA)$/, '');
  if (compactName.length >= 12 && compactExcerpt.includes(compactName)) return true;
  const tokens = significantTokens(name);
  const words = new Set(normalizedExcerpt.split(' '));
  return tokens.length >= 2 && tokens.every(token => words.has(token));
}

function explicitCompanyLabel(excerpt: string): string | null {
  const normalized = String(excerpt || '').replace(/\r/g, ' ');
  const match = normalized.match(/(?:^|[\n|])\s*(?:\d+\s+)?Empresa\s+([A-ZÀ-Ý][A-ZÀ-Ý0-9 .&'’_-]{4,100}?)(?=\s*(?:\n|Tipo\s+de\s+ordem|$))/i);
  return match?.[1] ? cleanCorporateName(match[1].replace(/\s+/g, ' ')) : null;
}

function explicitFavoredName(excerpt: string, rawCnpj: unknown, names: string[]): string | null {
  const cnpj = String(rawCnpj || '').replace(/\D/g, '');
  const match = String(excerpt || '').match(/nome\s+favorecido\s*:\s*([^\r\n]{3,100})[\s\S]{0,80}?documento\s+favorecido\s*:\s*([\d./-]+)/i);
  if (!match || String(match[2] || '').replace(/\D/g, '') !== cnpj) return null;
  const shortName = cleanCorporateName(match[1].replace(/\s+/g, ' '));
  const shortTokens = significantTokens(shortName);
  const matches = names.filter(looksCorporateName).map(cleanCorporateName).filter(name => {
    const candidateTokens = new Set(significantTokens(cleanCorporateName(name)));
    return shortTokens.length >= 2 && shortTokens.every(token => candidateTokens.has(token));
  });
  const unique = [...new Map(matches.map(name => [normalizeName(name), name])).values()];
  return unique.length === 1 ? unique[0] : shortName;
}

function isProviderDirectoryMention(excerpt: string, rawCnpj: unknown): boolean {
  const text = normalizeName(excerpt);
  const rawText = String(excerpt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const cnpj = String(rawCnpj || '').replace(/\D/g, '');
  const compact = text.replace(/\D/g, '');
  const cnpjIndex = compact.indexOf(cnpj);
  const markerIndex = text.indexOf('REDE CREDENCIADA');
  if (markerIndex >= 0 && cnpjIndex >= 0) {
    const markerDigitsIndex = text.slice(0, markerIndex).replace(/\D/g, '').length;
    if (markerDigitsIndex <= cnpjIndex) return true;
  }
  return [...rawText.matchAll(/\(\s*CNPJ\s*:?\s*([\d./-]+)\s*\)\s*-\s*(?:CLINICA|HOSPITAL|MEDICO|LABORATORIO|COOPERATIVA)/gi)]
    .some(match => match[1].replace(/\D/g, '') === cnpj);
}

export function buildContextualCompanyAssociations(names: string[], evidences: ContextEvidence[]): ContextualCompanyAssociation[] {
  const associations = evidences.filter(e => String(e.field || '').toLowerCase() === 'cnpj').map(e => {
    const cnpj = cleanCnpj(e.value);
    if (!cnpj || !validCnpj(cnpj)) return null;
    const excerpt = String(e.excerpt || '');
    if (isProviderDirectoryMention(excerpt, e.value)) {
      return { cnpj, name: null, classification: 'PROVIDER_DIRECTORY' as const, excerpt: e.excerpt || null, confidence: e.confidence ?? null };
    }
    const mentionedCnpjs = [...new Set((excerpt.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) || []).map(value => value.replace(/\D/g, '')))];
    const matchedNames = [...new Map(names.filter(name => nameAppearsInContext(name, excerpt)).map(name => [normalizeName(cleanCorporateName(name)), cleanCorporateName(name)])).values()];
    // Sem pareamento explícito, múltiplas entidades no trecho exigem revisão.
    const singleContext = mentionedCnpjs.length === 1 && mentionedCnpjs[0] === cnpj;
    const matchedName = explicitFavoredName(excerpt, e.value, names)
      || (singleContext && matchedNames.length === 1 ? matchedNames[0] : null)
      || (singleContext && matchedNames.length === 0 ? explicitCompanyLabel(excerpt) : null);
    return { cnpj, name: matchedName || null, classification: matchedName ? 'STRONG_PAIR' as const : 'UNPAIRED' as const, excerpt: e.excerpt || null, confidence: e.confidence ?? null };
  }).filter((item): item is ContextualCompanyAssociation => Boolean(item));
  return [...new Map(associations.map(item => [
    `${item.classification}|${item.cnpj}|${normalizeName(item.name || '')}`, item
  ])).values()];
}

async function auditResolution(supabase: any, params: {
  processId?: string | null;
  companyId?: string | null;
  method: CompanyResolutionMethod;
  confidence: number;
  sourceValue?: string | null;
  actorId?: string | null;
  details?: Record<string, unknown>;
}) {
  if (!params.processId) return;
  const { error } = await supabase.from('company_resolution_audit').insert({
    process_id: params.processId,
    company_id: params.companyId || null,
    resolution_method: params.method,
    confidence: params.confidence,
    source_value: params.sourceValue || null,
    actor_id: params.actorId || null,
    details: params.details || {},
  });
  if (error) console.warn('[COMPANY RESOLUTION] falha ao auditar:', error.message);
}

async function enqueueCandidate(supabase: any, params: {
  processId?: string | null;
  names: string[];
  cnpjs: string[];
  actorId?: string | null;
  confidence: number;
  evidence: unknown[];
}): Promise<string | null> {
  if (!params.processId || (!params.names.length && !params.cnpjs.length)) return null;
  const requiresRoleReview = params.evidence.some((e:any) => e?.phase === '6E.2.5');
  const suggestedName = !requiresRoleReview && params.names.length === 1 ? params.names[0] : null;
  const suggestedCnpj = !requiresRoleReview && params.cnpjs.length === 1 ? params.cnpjs[0] : null;
  const payload = {
    process_id: params.processId,
    status: 'PENDENTE',
    suggested_name: suggestedName,
    suggested_name_normalized: suggestedName ? normalizeName(suggestedName) : null,
    suggested_cnpj: suggestedCnpj,
    confidence: params.confidence,
    candidate_names: params.names,
    candidate_cnpjs: params.cnpjs,
    evidence: params.evidence,
    created_by: params.actorId || null,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase.from('company_resolution_candidates')
    .select('id').eq('process_id', params.processId).eq('status', 'PENDENTE').maybeSingle();
  const query = existing?.id
    ? supabase.from('company_resolution_candidates').update(payload).eq('id', existing.id).select('id').single()
    : supabase.from('company_resolution_candidates').insert(payload).select('id').single();
  const { data, error } = await query;
  if (error && error.code !== '23505') {
    throw new Error(`Falha ao registrar candidato: ${error.message}`);
  }
  return data?.id || existing?.id || null;
}

export async function resolveCompanyForProcess(supabase: any, params: {
  processId?: string | null;
  cnpjs?: string[];
  names?: string[];
  contextQualifiedNames?: string[];
  contextualAssociations?: ContextualCompanyAssociation[];
  sourceEvidence?: unknown[];
  actorId?: string | null;
}): Promise<CompanyResolutionResult> {
  const cnpjs = [...new Set((params.cnpjs || []).map(cleanCnpj).filter((v): v is string => Boolean(v && validCnpj(v))))];
  const inputNames = [...new Set((params.names || []).map(v => String(v || '').trim()).filter(v => v.length >= 5))];
  // Nomes sem sinal positivo de PJ não são apresentados como empresas.
  // Isso não afirma que sejam PF: a evidência insuficiente fica na auditoria.
  const originalNames = [...new Map(inputNames.filter(looksCorporateName).concat(params.contextQualifiedNames || [])
    .map(cleanCorporateName).map(n => [normalizeName(n), n])).values()];
  const qualification = [{ phase: '6E.2', reason: 'POSITIVE_PJ_SIGNAL_REQUIRED',
    excludedNames: inputNames.filter(n => !looksCorporateName(n)), qualifiedNames: originalNames,
    cnpjs, association: 'UNPROVEN', contextualAssociations: params.contextualAssociations || [],
    autoRegistrationAllowed: false, sourceEvidence: params.sourceEvidence || [] }];
  const names = [...new Set(originalNames.map(normalizeName).filter(v => v.length >= 5))];

  if (cnpjs.length) {
    const { data, error } = await supabase.from('companies').select('id,nome,cnpj').in('cnpj', cnpjs).eq('active', true);
    if (!error) {
      const unique = Array.from(new Map((data || []).map((r:any) => [r.id, r])).values()) as any[];
      if (unique.length === 1 && cnpjs.length === 1) {
        const result = { companyId: unique[0].id, method: 'CNPJ_EXATO' as const, sourceValue: unique[0].cnpj, confidence: 1, candidates: unique.map(r=>({id:r.id,nome:r.nome})) };
        await auditResolution(supabase, { processId: params.processId, companyId: result.companyId, method: result.method, confidence: 1, sourceValue: result.sourceValue, actorId: params.actorId });
        return result;
      }
      if (unique.length > 1) {
        await enqueueCandidate(supabase, { processId: params.processId, names: originalNames, cnpjs, confidence: 0, actorId: params.actorId, evidence: qualification });
        await auditResolution(supabase, { processId: params.processId, method: 'AMBIGUO', confidence: 0, sourceValue: cnpjs.join(','), actorId: params.actorId, details: { candidates: unique.map(r=>r.id) } });
        return { companyId: null, method: 'AMBIGUO', sourceValue: cnpjs.join(','), confidence: 0, candidates: unique.map(r=>({id:r.id,nome:r.nome})) };
      }
    }
  }

  if (names.length && cnpjs.length === 0) {
    const { data, error } = await supabase.from('companies').select('id,nome,nome_normalizado').eq('active', true);
    if (!error) {
      const matched = (data || []).filter((r:any) => names.includes(normalizeName(r.nome_normalizado || r.nome)));
      const unique = Array.from(new Map(matched.map((r:any)=>[r.id,r])).values()) as any[];
      if (unique.length > 1) {
        const candidateId = await enqueueCandidate(supabase, { processId: params.processId, names: originalNames, cnpjs, confidence: 0, actorId: params.actorId, evidence: qualification });
        await auditResolution(supabase, { processId: params.processId, method: 'AMBIGUO', confidence: 0, actorId: params.actorId, details: { phase: '6E.2', qualification } });
        return { companyId: null, method: 'AMBIGUO', sourceValue: null, confidence: 0, candidates: unique.map(r => ({ id: r.id, nome: r.nome })), candidateId };
      }
      if (unique.length === 1) {
        const source = names.find(n => n === normalizeName(unique[0].nome_normalizado || unique[0].nome)) || unique[0].nome;
        await auditResolution(supabase, { processId: params.processId, companyId: unique[0].id, method: 'NOME_EXATO', confidence: .98, sourceValue: source, actorId: params.actorId });
        return { companyId: unique[0].id, method: 'NOME_EXATO', sourceValue: source, confidence: .98, candidates: [{id:unique[0].id,nome:unique[0].nome}] };
      }
    }
  }

  if (names.length && cnpjs.length === 0) {
    const { data, error } = await supabase.from('company_aliases').select('company_id,alias,alias_normalizado,companies!inner(id,nome,active)').in('alias_normalizado', names).eq('active', true);
    if (!error) {
      const activeRows = (data || []).filter((r:any) => r.companies?.active === true);
      const unique = Array.from(new Map(activeRows.map((r:any)=>[r.company_id,r])).values()) as any[];
      if (unique.length === 1) {
        const row:any=unique[0];
        await auditResolution(supabase, { processId: params.processId, companyId: row.company_id, method: 'ALIAS_EXATO', confidence: .97, sourceValue: row.alias, actorId: params.actorId });
        return { companyId: row.company_id, method: 'ALIAS_EXATO', sourceValue: row.alias, confidence: .97, candidates: [{id:row.company_id,nome:row.companies.nome}] };
      }
    }
  }

  // 6E.2: arrays independentes de nomes/CNPJs não comprovam associação.
  // Autocadastro suspenso neste contrato; encaminhar à confirmação humana.

  if (params.processId && (cnpjs.length || originalNames.length)) {
    const confidence = cnpjs.length === 1 && originalNames.length >= 1 ? .75 : .55;
    const candidateId = await enqueueCandidate(supabase, { processId: params.processId, names: originalNames, cnpjs, actorId: params.actorId, confidence, evidence: qualification });
    await auditResolution(supabase, { processId: params.processId, method: 'AGUARDANDO_CONFIRMACAO', confidence, sourceValue: cnpjs[0] || originalNames[0] || null, actorId: params.actorId, details: { phase: '6E.2', qualification } });
    return { companyId: null, method: 'AGUARDANDO_CONFIRMACAO', sourceValue: cnpjs[0] || originalNames[0] || null, confidence, candidates: [], candidateId };
  }

  if (params.processId) {
    const { error } = await supabase.from('company_resolution_candidates')
      .update({ status: 'REJEITADO', evidence: qualification, updated_at: new Date().toISOString() })
      .eq('process_id', params.processId).eq('status', 'PENDENTE');
    if (error) throw new Error('Falha ao retirar candidato sem evidência de PJ: ' + error.message);
  }
  await auditResolution(supabase, { details: { phase: '6E.2', qualification }, processId: params.processId, method: 'NAO_RESOLVIDO', confidence: 0, sourceValue: null, actorId: params.actorId });
  return { companyId: null, method: 'NAO_RESOLVIDO', sourceValue: null, confidence: 0, candidates: [] };
}

export async function resolveOrphanProcessCompany(supabase:any, processId:string, actorId?:string|null) {
  const [{ data: evidences, error: evidenceError }, { data: parties, error: partyError }, { data: process, error: processError }] = await Promise.all([
    supabase.from('process_evidence').select('field_name,extracted_value,confidence,evidence_excerpt').eq('process_id', processId).order('confidence', { ascending: false }).limit(100),
    supabase.from('process_parties').select('nome,tipo').eq('process_id', processId).limit(30),
    supabase.from('processes').select('objeto_demanda').eq('id', processId).maybeSingle(),
  ]);
  if (evidenceError || partyError || processError) throw new Error('Falha ao ler contexto processual: ' + (evidenceError?.message || partyError?.message || processError?.message));
  const names = (parties || []).map((p:any)=>p.nome).filter(Boolean);
  const sourceEvidence = (evidences || []).filter((e:any) => /cnpj|empresa|razao|razão/i.test(String(e.field_name))).map((e:any) => ({
      field: String(e.field_name), value: e.extracted_value, excerpt: e.evidence_excerpt || null,
      confidence: e.confidence, source: 'process_evidence'
    })).concat((parties || []).filter((p:any) => looksCorporateName(p.nome)).map((p:any) => ({
      field: 'Nome da parte processual', value: p.nome, excerpt: null,
      source: 'process_parties', confidence: null
    })));
  const contextualAssociations = buildContextualCompanyAssociations(names, sourceEvidence).map(item => ({ ...item,
    ...(item.classification === 'PROVIDER_DIRECTORY'
      ? { processRole: 'PRESTADOR' as const, roleEvidence: 'Menção em lista de prestadores.' }
      : classifyProcessRole(item.name, item.excerpt || '', parties || [], process?.objeto_demanda || ''))
  }));
  const cnpjs = [...new Set(contextualAssociations.filter(item => item.classification !== 'PROVIDER_DIRECTORY')
    .map(item => item.cnpj))];
  const contextQualifiedNames = contextualAssociations.filter(item => item.classification === 'STRONG_PAIR' && item.name).map(item => item.name as string);
  const qualifiedNames = [...new Map(names.filter(looksCorporateName).concat(contextQualifiedNames.filter(looksCorporateName)).map(cleanCorporateName).map((name:string) => [normalizeName(name), name])).values()] as string[];
  const roleAssessments = qualifiedNames.map(name => ({ name, ...classifyProcessRole(name, contextualAssociations.filter(a => a.name === name).map(a => a.excerpt || '').join('\n'), parties || [], process?.objeto_demanda || '') }));
  const qualification = [{ phase: '6E.2.5', association: 'HUMAN_REVIEW_REQUIRED', autoRegistrationAllowed: false,
    qualifiedNames, cnpjs, contextualAssociations, roleAssessments, sourceEvidence }];
  // Identidade fiscal e papel processual são distintos. O piloto não vincula por mera menção.
  if (qualifiedNames.length || cnpjs.length) {
    const candidateId = await enqueueCandidate(supabase, { processId, names: qualifiedNames, cnpjs, actorId, confidence: 0, evidence: qualification });
    await auditResolution(supabase, { processId, actorId, method: 'AGUARDANDO_CONFIRMACAO', confidence: 0, details: { phase: '6E.2.5', qualification } });
    return { companyId: null, method: 'AGUARDANDO_CONFIRMACAO' as const, sourceValue: null, confidence: 0, candidates: [], candidateId };
  }
  return resolveCompanyForProcess(supabase, { processId, names: [], cnpjs: [], actorId, sourceEvidence });
}

export async function confirmCompanyResolutionCandidate(
  supabase: any,
  params: {
    candidateId: string;
    actorId: string;
    companyId?: string | null;
    name?: string | null;
    cnpj?: string | null;
  }
) {
  const { data: candidate, error: candidateErr } = await supabase
    .from('company_resolution_candidates')
    .select('*')
    .eq('id', params.candidateId)
    .single();

  if (candidateErr || !candidate) {
    throw new Error('Candidato não encontrado.');
  }
  if (candidate.status !== 'PENDENTE') {
    throw new Error(`Candidato já processado com status: ${candidate.status}`);
  }

  let finalCompanyId = params.companyId || null;

  if (finalCompanyId) {
    const { data: company, error } = await supabase.from('companies').select('id').eq('id', finalCompanyId).eq('active', true).single();
    if (error || !company) throw new Error('Empresa ativa não encontrada.');
  }

  if (!finalCompanyId) {
    const rawName = String(params.name || candidate.suggested_name || '').trim();
    const rawCnpj = cleanCnpj(params.cnpj || candidate.suggested_cnpj);

    if ((params.cnpj || candidate.suggested_cnpj) && (!rawCnpj || !validCnpj(rawCnpj))) throw new Error('CNPJ inválido.');
    if (!looksCorporateName(rawName)) throw new Error('Informe uma razão social com evidência de PJ ou selecione uma empresa existente.');
    if (!rawName && !rawCnpj) {
      throw new Error('É necessário vincular a uma empresa existente ou fornecer Razão Social / CNPJ.');
    }

    if (rawCnpj) {
      const { data: existingByCnpj } = await supabase
        .from('companies')
        .select('id,nome,cnpj')
        .eq('cnpj', rawCnpj)
        .maybeSingle();

      if (existingByCnpj?.id) {
        finalCompanyId = existingByCnpj.id;
      }
    }

    if (!finalCompanyId && rawName) {
      const { data: existingByName } = await supabase
        .from('companies')
        .select('id,nome,nome_normalizado')
        .eq('nome_normalizado', normalizeName(rawName))
        .maybeSingle();

      if (existingByName?.id) {
        finalCompanyId = existingByName.id;
      }
    }

    if (!finalCompanyId) {
      if (!rawName) {
        throw new Error('Razão Social obrigatória para cadastrar nova empresa.');
      }
      const { data: created, error: createErr } = await supabase
        .from('companies')
        .insert({
          nome: rawName,
          nome_normalizado: normalizeName(rawName),
          cnpj: rawCnpj || null,
          active: true,
          created_by: params.actorId,
          updated_by: params.actorId,
        })
        .select('id,nome,cnpj')
        .single();

      if (createErr || !created) {
        throw new Error(`Falha ao cadastrar nova empresa: ${createErr?.message || 'Erro desconhecido'}`);
      }
      finalCompanyId = created.id;
    }
  }

  const now = new Date().toISOString();
  const { error: updateCandidateErr } = await supabase
    .from('company_resolution_candidates')
    .update({
      status: 'CONFIRMADO',
      resolved_by: params.actorId,
      resolved_at: now,
      resolved_company_id: finalCompanyId,
      updated_at: now,
    })
    .eq('id', params.candidateId);

  if (updateCandidateErr) {
    throw new Error(`Falha ao atualizar status do candidato: ${updateCandidateErr.message}`);
  }

  if (candidate.process_id) {
    const { error: updateProcessErr } = await supabase
      .from('processes')
      .update({
        company_id: finalCompanyId,
        updated_by: params.actorId,
        updated_at: now,
      })
      .eq('id', candidate.process_id);

    if (updateProcessErr) {
      console.warn('[COMPANY RESOLUTION] falha ao atualizar processo:', updateProcessErr.message);
    }

    await auditResolution(supabase, {
      processId: candidate.process_id,
      companyId: finalCompanyId,
      method: 'CONFIRMADO_HUMANO',
      confidence: 1.0,
      sourceValue: params.candidateId,
      actorId: params.actorId,
      details: { confirmed_via: 'HUMAN_CONFIRMATION', candidateId: params.candidateId },
    });
  }

  return { companyId: finalCompanyId, processId: candidate.process_id };
}

export async function rejectCompanyResolutionCandidate(
  supabase: any,
  params: {
    candidateId: string;
    actorId: string;
  }
) {
  const { data: candidate, error: candidateErr } = await supabase
    .from('company_resolution_candidates')
    .select('*')
    .eq('id', params.candidateId)
    .single();

  if (candidateErr || !candidate) {
    throw new Error('Candidato não encontrado.');
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from('company_resolution_candidates')
    .update({
      status: 'REJEITADO',
      updated_at: now,
    })
    .eq('id', params.candidateId)
    .select('*')
    .single();

  if (updateErr) {
    throw new Error(`Falha ao rejeitar candidato: ${updateErr.message}`);
  }

  if (candidate.process_id) {
    await auditResolution(supabase, {
      processId: candidate.process_id,
      companyId: null,
      method: 'AMBIGUO',
      confidence: 0,
      sourceValue: params.candidateId,
      actorId: params.actorId,
      details: { rejected_via: 'HUMAN_REJECTION', candidateId: params.candidateId },
    });
  }

  return updated;
}
