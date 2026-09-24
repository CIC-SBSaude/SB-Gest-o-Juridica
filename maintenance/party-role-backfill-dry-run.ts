import 'dotenv/config';
import { getBackendSupabase } from '../server/integrations/supabase.ts';
import { classifyPartyRole, type ProcessPartyTipo } from '../server/services/partyClassificationService.ts';

type PartyRow = {
  id: string;
  process_id: string;
  nome: string;
  tipo: string | null;
  principal: boolean | null;
};

type EvidenceRow = {
  process_id: string;
  field_name: string | null;
  extracted_value: string | null;
  evidence_excerpt: string | null;
  source_type?: string | null;
  confidence?: number | null;
};

const PAGE_SIZE = 500;
const SAMPLE_LIMIT = 25;
const TARGET_CURRENT_TYPE = 'PARTE_IDENTIFICADA';

function normalize(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
}

function evidenceMatchesParty(evidence: EvidenceRow, partyName: string): boolean {
  const name = normalize(partyName);
  if (!name) return false;

  const extracted = normalize(evidence.extracted_value);
  const excerpt = normalize(evidence.evidence_excerpt);
  const field = normalize(evidence.field_name);

  // Fonte preferencial: evidência explicitamente extraída como parte_nome para a mesma pessoa.
  if (field === 'parte_nome' && extracted === name) return true;

  // Fallback conservador: o trecho precisa mencionar literalmente o nome completo.
  return excerpt.includes(name);
}

export function previewPartyRoleBackfillRows(parties: PartyRow[], evidences: EvidenceRow[]) {
  const evidenceByProcess = new Map<string, EvidenceRow[]>();
  for (const evidence of evidences) {
    const bucket = evidenceByProcess.get(evidence.process_id) || [];
    bucket.push(evidence);
    evidenceByProcess.set(evidence.process_id, bucket);
  }

  const counts: Record<ProcessPartyTipo, number> = {
    AUTOR: 0,
    REU: 0,
    TERCEIRO: 0,
    REPRESENTANTE: 0,
    PARTE_IDENTIFICADA: 0,
  };

  let eligible = 0;
  let wouldChange = 0;
  let noMatchingEvidence = 0;
  const samples: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; proposedType: string }> = [];

  for (const party of parties) {
    if (party.tipo !== TARGET_CURRENT_TYPE) continue;
    eligible += 1;

    const processEvidence = evidenceByProcess.get(party.process_id) || [];
    const matching = processEvidence.filter((e) => evidenceMatchesParty(e, party.nome));
    if (matching.length === 0) noMatchingEvidence += 1;

    const role = classifyPartyRole(
      party.nome,
      matching.map((e) => ({
        evidence_excerpt: e.evidence_excerpt || undefined,
        extracted_value: e.extracted_value || undefined,
      })),
    );

    counts[role] += 1;
    if (role !== TARGET_CURRENT_TYPE) {
      wouldChange += 1;
      updates.push({ id: party.id, proposedType: role });
      if (samples.length < SAMPLE_LIMIT) {
        samples.push({
          partyId: party.id,
          processId: party.process_id,
          nome: party.nome,
          principal: party.principal,
          currentType: party.tipo,
          proposedType: role,
          evidenceCount: matching.length,
          evidenceSamples: matching.slice(0, 3).map((e) => ({
            field_name: e.field_name,
            extracted_value: e.extracted_value,
            evidence_excerpt: e.evidence_excerpt,
            source_type: e.source_type ?? null,
            confidence: e.confidence ?? null,
          })),
        });
      }
    }
  }

  return {
    totalPartiesRead: parties.length,
    eligibleCurrentParteIdentificada: eligible,
    wouldChange,
    wouldRemainParteIdentificada: counts.PARTE_IDENTIFICADA,
    noMatchingEvidence,
    proposedCounts: counts,
    samples,
    updates,
  };
}

async function fetchPaged<T>(queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await queryFactory(from, to);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main() {
  const applyMode = process.argv.includes('--apply');

  const db = getBackendSupabase();
  if (!db) {
    console.error('Supabase backend não configurado. SUPABASE_URL/SUPABASE_SECRET_KEY são necessários.');
    process.exit(2);
  }

  const parties = await fetchPaged<PartyRow>((from, to) => {
    console.error(`Fetching parties ${from}-${to}...`);
    return db
      .from('process_parties')
      .select('id,process_id,nome,tipo,principal')
      .order('created_at', { ascending: true })
      .range(from, to);
  });


  const totalProcessPartiesInDatabase = parties.length;
  
  const excludedReasons: Record<string, number> = {
    'ALREADY_CLASSIFIED_AUTOR': 0,
    'ALREADY_CLASSIFIED_REU': 0,
    'ALREADY_CLASSIFIED_REPRESENTANTE': 0,
    'ALREADY_CLASSIFIED_TERCEIRO': 0,
    'OTHER_TYPE': 0,
  };

  const eligibleParties = parties.filter(p => {
    if (p.tipo === TARGET_CURRENT_TYPE) return true;
    const reasonKey = p.tipo ? `ALREADY_CLASSIFIED_${p.tipo}` : 'OTHER_TYPE';
    if (excludedReasons[reasonKey] !== undefined) {
      excludedReasons[reasonKey]++;
    } else {
      excludedReasons['OTHER_TYPE']++;
    }
    return false;
  });

  const processIds = [...new Set(eligibleParties.map((p) => p.process_id).filter(Boolean))];
  const evidences: EvidenceRow[] = [];

  // Evita URLs excessivamente longas no PostgREST.
  const CHUNK = 100;
  console.error(`Fetching evidences for ${processIds.length} processes in chunks of ${CHUNK}...`);
  for (let i = 0; i < processIds.length; i += CHUNK) {
    const ids = processIds.slice(i, i + CHUNK);
    console.error(`Fetching evidences chunk ${i} to ${i + CHUNK}...`);
    const rows = await fetchPaged<EvidenceRow>((from, to) => {
      console.error(`  -> evidences page ${from}-${to}`);
      return db
        .from('process_evidence')
        .select('process_id,field_name,extracted_value,evidence_excerpt,source_type,confidence')
        .in('process_id', ids)
        .order('created_at', { ascending: true })
        .range(from, to);
    });
    evidences.push(...rows);
  }

  const preview = previewPartyRoleBackfillRows(eligibleParties, evidences);
  let writesPerformed = 0;
  let writeErrors = 0;

  if (applyMode) {
    console.error(`\nApplying updates to ${preview.updates.length} parties...`);
    for (const update of preview.updates) {
      const { error } = await db.from('process_parties').update({ tipo: update.proposedType }).eq('id', update.id);
      if (error) {
        console.error(`Failed to update ${update.id}:`, error.message);
        writeErrors++;
      } else {
        writesPerformed++;
      }
    }
  }

  const result = JSON.stringify({
    mode: applyMode ? 'APPLY_PARTY_ROLE_BACKFILL' : 'DRY_RUN_PARTY_ROLE_BACKFILL',
    writesPerformed,
    writeErrors,
    safety: {
      currentTypeFilter: TARGET_CURRENT_TYPE,
      principalUsedAsRoleEvidence: false,
      requiresExplicitRoleEvidence: true,
    },
    coverage: {
      totalProcessPartiesInDatabase,
      totalPartiesRead: eligibleParties.length,
      excludedFromDryRun: totalProcessPartiesInDatabase - eligibleParties.length,
      excludedReasons,
    },
    ...preview,
  }, null, 2);

  import('node:fs').then(fs => {
    fs.writeFileSync('dry-run-output.json', result);
    console.error('Done!');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[PARTY ROLE BACKFILL DRY-RUN] falha:', error?.message || error);
    process.exit(1);
  });
}
