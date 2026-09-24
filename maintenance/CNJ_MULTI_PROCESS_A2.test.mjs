import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasUnambiguousDocumentSeparation,
  buildPlansA2,
  executeCnjMultiProcessRepair,
} from '../server/services/cnjAmbiguityRepairService.ts';
import { summarizeDocumentIdentification } from '../server/services/documentIdentificationService.ts';

const cnj1 = '8058951-25.2026.8.05.0000';
const cnj2 = '8007032-06.2026.8.05.0191';
const cnj3 = '8001234-52.2026.8.05.0001';

const validActorId = '0fd2409d-daeb-434e-8200-3792f8c5c8cc';

function analysis(blocks) {
  return summarizeDocumentIdentification(blocks);
}

// ----------------------------------------------------
// Testes unitários de hasUnambiguousDocumentSeparation
// ----------------------------------------------------

test('1. hasUnambiguousDocumentSeparation: dois anexos, cada um com um CNJ distinto -> permitido', () => {
  const an = analysis([
    { source: 'doc1.pdf', kind: 'ATTACHMENT', text: `Notificação do processo ${cnj1}` },
    { source: 'doc2.pdf', kind: 'ATTACHMENT', text: `Citação do processo ${cnj2}` },
  ]);
  const sep = hasUnambiguousDocumentSeparation(an);
  assert.equal(sep.separated, true);
  assert.deepEqual(sep.docCnjs.sort(), [cnj1, cnj2].sort());
});

test('2. hasUnambiguousDocumentSeparation: um documento com dois CNJs -> bloqueado', () => {
  const an = analysis([
    { source: 'doc_com_dois.pdf', kind: 'ATTACHMENT', text: `Processos citados: ${cnj1} e ${cnj2}` },
    { source: 'doc_segundo.pdf', kind: 'ATTACHMENT', text: `Processo citado: ${cnj3}` },
  ]);
  const sep = hasUnambiguousDocumentSeparation(an);
  assert.equal(sep.separated, false);
  assert.match(sep.reason, /mais de um CNJ válido/i);
});

test('hasUnambiguousDocumentSeparation: CNJ com DV inválido bloqueia', () => {
  const an = analysis([
    { source: 'doc1.pdf', kind: 'ATTACHMENT', text: cnj1 },
    { source: 'doc2.pdf', kind: 'ATTACHMENT', text: '0000000-00.0000.0.00.0000' },
  ]);
  const sep = hasUnambiguousDocumentSeparation(an);
  assert.equal(sep.separated, false);
  assert.match(sep.reason, /DV inválido/i);
});

test('hasUnambiguousDocumentSeparation: menos de 2 CNJs válidos bloqueia', () => {
  const an = analysis([
    { source: 'doc1.pdf', kind: 'ATTACHMENT', text: cnj1 },
    { source: 'doc2.pdf', kind: 'ATTACHMENT', text: 'Sem processo' },
  ]);
  const sep = hasUnambiguousDocumentSeparation(an);
  assert.equal(sep.separated, false);
  assert.match(sep.reason, /menos de 2/i);
});

// ----------------------------------------------------
// Mock DB para validação de ponta a ponta
// ----------------------------------------------------

function createMockDb(initialState) {
  const tables = {
    email_exceptions: JSON.parse(JSON.stringify(initialState.email_exceptions || [])),
    processed_emails: JSON.parse(JSON.stringify(initialState.processed_emails || [])),
    processes: JSON.parse(JSON.stringify(initialState.processes || [])),
    process_evidence: JSON.parse(JSON.stringify(initialState.process_evidence || [])),
    process_timeline: JSON.parse(JSON.stringify(initialState.process_timeline || [])),
  };

  return {
    _tables: tables,
    from(tableName) {
      const rows = tables[tableName] || [];
      let currentRows = [...rows];
      let selectedFields = null;
      let countExact = false;
      let headOnly = false;

      let pendingPatch = null;

      const builder = {
        select(fields, options) {
          selectedFields = fields;
          if (options?.count === 'exact') countExact = true;
          if (options?.head) headOnly = true;
          return builder;
        },
        eq(col, val) {
          currentRows = currentRows.filter(r => r[col] === val);
          return builder;
        },
        neq(col, val) {
          currentRows = currentRows.filter(r => r[col] !== val);
          return builder;
        },
        in(col, values) {
          currentRows = currentRows.filter(r => values.includes(r[col]));
          return builder;
        },
        is(col, val) {
          currentRows = currentRows.filter(r => r[col] === val);
          return builder;
        },
        order() {
          return builder;
        },
        range(from, to) {
          currentRows = currentRows.slice(from, to + 1);
          return builder;
        },
        limit(n) {
          currentRows = currentRows.slice(0, n);
          return builder;
        },
        async maybeSingle() {
          if (pendingPatch) {
            for (const row of currentRows) {
              Object.assign(row, pendingPatch);
            }
          }
          if (currentRows.length === 0) return { data: null, error: null };
          return { data: currentRows[0], error: null };
        },
        update(patch) {
          pendingPatch = patch;
          return builder;
        },
        async insert(data) {
          const toInsert = Array.isArray(data) ? data : [data];
          for (const item of toInsert) {
            const row = { id: `id-${Math.random()}`, ...item };
            tables[tableName].push(row);
          }
          return { error: null };
        },
        then(resolve) {
          if (pendingPatch) {
            for (const row of currentRows) {
              Object.assign(row, pendingPatch);
            }
          }
          if (headOnly) {
            resolve({ count: currentRows.length, data: null, error: null });
          } else {
            resolve({
              data: currentRows,
              count: countExact ? currentRows.length : undefined,
              error: null,
            });
          }
        },
      };

      return builder;
    },
  };
}

// ----------------------------------------------------
// Testes dos 8 cenários exigidos
// ----------------------------------------------------

test('1. dois anexos, cada um com um CNJ distinto, ambos existentes -> A2 permitido', async () => {
  const db = createMockDb({
    email_exceptions: [{
      id: 'exc-1',
      processed_email_id: 'mail-1',
      exception_type: 'CNJ_MULTIPLO_AMBIGUO',
      status: 'ABERTA',
      updated_at: '2026-09-14T00:00:00Z',
    }],
    processed_emails: [{
      id: 'mail-1',
      status: 'EXCECAO',
      process_id: null,
      subject: 'Citação Múltipla',
      updated_at: '2026-09-14T00:00:00Z',
      metadata: {
        ai_evidence_blocks: [
          { source: 'doc1.pdf', kind: 'ATTACHMENT', text: `CNJ ${cnj1}` },
          { source: 'doc2.pdf', kind: 'ATTACHMENT', text: `CNJ ${cnj2}` },
        ],
      },
    }],
    processes: [
      { id: 'proc-1', numero_processo: cnj1 },
      { id: 'proc-2', numero_processo: cnj2 },
    ],
  });

  const plans = await buildPlansA2(db);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].executable, true);
  assert.equal(plans[0].targets.length, 2);
  assert.equal(plans[0].rule, 'MULTI_PROCESS_DISTRIBUTION');
});

test('2. um documento com dois CNJs -> bloqueado', async () => {
  const db = createMockDb({
    email_exceptions: [{
      id: 'exc-2',
      processed_email_id: 'mail-2',
      exception_type: 'CNJ_MULTIPLO_AMBIGUO',
      status: 'ABERTA',
      updated_at: '2026-09-14T00:00:00Z',
    }],
    processed_emails: [{
      id: 'mail-2',
      status: 'EXCECAO',
      process_id: null,
      updated_at: '2026-09-14T00:00:00Z',
      metadata: {
        ai_evidence_blocks: [
          { source: 'doc_com_dois.pdf', kind: 'ATTACHMENT', text: `Proc 1: ${cnj1}, Proc 2: ${cnj2}` },
          { source: 'doc_segundo.pdf', kind: 'ATTACHMENT', text: `Proc 3: ${cnj3}` },
        ],
      },
    }],
    processes: [
      { id: 'proc-1', numero_processo: cnj1 },
      { id: 'proc-2', numero_processo: cnj2 },
      { id: 'proc-3', numero_processo: cnj3 },
    ],
  });

  const plans = await buildPlansA2(db);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].executable, false);
  assert.match(plans[0].reason, /contém mais de um CNJ/i);
});

test('3. CNJ válido sem processo -> bloqueado', async () => {
  const db = createMockDb({
    email_exceptions: [{
      id: 'exc-3',
      processed_email_id: 'mail-3',
      exception_type: 'CNJ_MULTIPLO_AMBIGUO',
      status: 'ABERTA',
      updated_at: '2026-09-14T00:00:00Z',
    }],
    processed_emails: [{
      id: 'mail-3',
      status: 'EXCECAO',
      process_id: null,
      updated_at: '2026-09-14T00:00:00Z',
      metadata: {
        ai_evidence_blocks: [
          { source: 'doc1.pdf', kind: 'ATTACHMENT', text: cnj1 },
          { source: 'doc2.pdf', kind: 'ATTACHMENT', text: cnj2 },
        ],
      },
    }],
    processes: [
      { id: 'proc-1', numero_processo: cnj1 }, // cnj2 falta
    ],
  });

  const plans = await buildPlansA2(db);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].executable, false);
  assert.match(plans[0].reason, /sem processo cadastrado/i);
});

test('4. CNJ duplicado em processes -> bloqueado', async () => {
  const db = createMockDb({
    email_exceptions: [{
      id: 'exc-4',
      processed_email_id: 'mail-4',
      exception_type: 'CNJ_MULTIPLO_AMBIGUO',
      status: 'ABERTA',
      updated_at: '2026-09-14T00:00:00Z',
    }],
    processed_emails: [{
      id: 'mail-4',
      status: 'EXCECAO',
      process_id: null,
      updated_at: '2026-09-14T00:00:00Z',
      metadata: {
        ai_evidence_blocks: [
          { source: 'doc1.pdf', kind: 'ATTACHMENT', text: cnj1 },
          { source: 'doc2.pdf', kind: 'ATTACHMENT', text: cnj2 },
        ],
      },
    }],
    processes: [
      { id: 'proc-1a', numero_processo: cnj1 },
      { id: 'proc-1b', numero_processo: cnj1 }, // duplicado
      { id: 'proc-2', numero_processo: cnj2 },
    ],
  });

  const plans = await buildPlansA2(db);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].executable, false);
  assert.match(plans[0].reason, /duplicado.*no cadastro/i);
});

test('5. process_id incompatível existente -> bloqueado', async () => {
  const db = createMockDb({
    email_exceptions: [{
      id: 'exc-5',
      processed_email_id: 'mail-5',
      exception_type: 'CNJ_MULTIPLO_AMBIGUO',
      status: 'ABERTA',
      updated_at: '2026-09-14T00:00:00Z',
    }],
    processed_emails: [{
      id: 'mail-5',
      status: 'EXCECAO',
      process_id: 'proc-incompativel',
      updated_at: '2026-09-14T00:00:00Z',
      metadata: {
        ai_evidence_blocks: [
          { source: 'doc1.pdf', kind: 'ATTACHMENT', text: cnj1 },
          { source: 'doc2.pdf', kind: 'ATTACHMENT', text: cnj2 },
        ],
      },
    }],
    processes: [
      { id: 'proc-1', numero_processo: cnj1 },
      { id: 'proc-2', numero_processo: cnj2 },
    ],
  });

  const plans = await buildPlansA2(db);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].executable, false);
  assert.match(plans[0].reason, /process_id incompatível/i);
});

test('6. process_distribution incompatível -> bloqueado', async () => {
  const db = createMockDb({
    email_exceptions: [{
      id: 'exc-6',
      processed_email_id: 'mail-6',
      exception_type: 'CNJ_MULTIPLO_AMBIGUO',
      status: 'ABERTA',
      updated_at: '2026-09-14T00:00:00Z',
    }],
    processed_emails: [{
      id: 'mail-6',
      status: 'EXCECAO',
      process_id: null,
      updated_at: '2026-09-14T00:00:00Z',
      metadata: {
        ai_evidence_blocks: [
          { source: 'doc1.pdf', kind: 'ATTACHMENT', text: cnj1 },
          { source: 'doc2.pdf', kind: 'ATTACHMENT', text: cnj2 },
        ],
        process_distribution: {
          links: [
            { process_id: 'proc-estranho', numero_processo: cnj3 },
          ],
        },
      },
    }],
    processes: [
      { id: 'proc-1', numero_processo: cnj1 },
      { id: 'proc-2', numero_processo: cnj2 },
    ],
  });

  const plans = await buildPlansA2(db);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].executable, false);
  assert.match(plans[0].reason, /process_distribution apontando para processo fora/i);
});

test('7. evidência/timeline já existente e compatível -> idempotente, sem duplicação', async () => {
  const db = createMockDb({
    email_exceptions: [{
      id: 'exc-7',
      processed_email_id: 'mail-7',
      exception_type: 'CNJ_MULTIPLO_AMBIGUO',
      status: 'ABERTA',
      updated_at: '2026-09-14T00:00:00Z',
    }],
    processed_emails: [{
      id: 'mail-7',
      status: 'EXCECAO',
      process_id: null,
      updated_at: '2026-09-14T00:00:00Z',
      metadata: {
        ai_evidence_blocks: [
          { source: 'doc1.pdf', kind: 'ATTACHMENT', text: cnj1 },
          { source: 'doc2.pdf', kind: 'ATTACHMENT', text: cnj2 },
        ],
      },
    }],
    processes: [
      { id: 'proc-1', numero_processo: cnj1 },
      { id: 'proc-2', numero_processo: cnj2 },
    ],
    // Já existe evidência para proc-1
    process_evidence: [
      {
        id: 'ev-prev',
        process_id: 'proc-1',
        processed_email_id: 'mail-7',
        field_name: 'numero_processo_cnj',
        extracted_value: cnj1,
      },
    ],
    // Já existe timeline para proc-1
    process_timeline: [
      {
        id: 'tl-prev',
        process_id: 'proc-1',
        email_id: 'mail-7',
        tipo: 'EMAIL_INTERPRETADO',
        origem: 'REPARO_CNJ_A2_MULTI_PROCESSO',
      },
    ],
  });

  const exec = await executeCnjMultiProcessRepair(db, { actorId: validActorId });
  assert.equal(exec.resolved, 1);

  // Evidências: deve haver exatamente 2 registros (1 pré-existente + 1 novo para proc-2, sem duplicar proc-1)
  const evidencesProc1 = db._tables.process_evidence.filter(r => r.process_id === 'proc-1');
  const evidencesProc2 = db._tables.process_evidence.filter(r => r.process_id === 'proc-2');
  assert.equal(evidencesProc1.length, 1);
  assert.equal(evidencesProc2.length, 1);

  // Timeline: deve haver exatamente 2 registros (1 pré-existente + 1 novo para proc-2, sem duplicar proc-1)
  const timelineProc1 = db._tables.process_timeline.filter(r => r.process_id === 'proc-1');
  const timelineProc2 = db._tables.process_timeline.filter(r => r.process_id === 'proc-2');
  assert.equal(timelineProc1.length, 1);
  assert.equal(timelineProc2.length, 1);
});

test('8. reexecução da rotina -> zero duplicações e zero efeitos indevidos', async () => {
  const db = createMockDb({
    email_exceptions: [{
      id: 'exc-8',
      processed_email_id: 'mail-8',
      exception_type: 'CNJ_MULTIPLO_AMBIGUO',
      status: 'ABERTA',
      updated_at: '2026-09-14T00:00:00Z',
    }],
    processed_emails: [{
      id: 'mail-8',
      status: 'EXCECAO',
      process_id: null,
      updated_at: '2026-09-14T00:00:00Z',
      metadata: {
        ai_evidence_blocks: [
          { source: 'doc1.pdf', kind: 'ATTACHMENT', text: cnj1 },
          { source: 'doc2.pdf', kind: 'ATTACHMENT', text: cnj2 },
        ],
      },
    }],
    processes: [
      { id: 'proc-1', numero_processo: cnj1 },
      { id: 'proc-2', numero_processo: cnj2 },
    ],
  });

  // Primeira execução
  const exec1 = await executeCnjMultiProcessRepair(db, { actorId: validActorId });
  assert.equal(exec1.resolved, 1);
  assert.equal(db._tables.email_exceptions[0].status, 'RESOLVIDA');
  const countEvidences1 = db._tables.process_evidence.length;
  const countTimeline1 = db._tables.process_timeline.length;
  assert.equal(countEvidences1, 2);
  assert.equal(countTimeline1, 2);

  // Segunda execução (reexecução imediata)
  const exec2 = await executeCnjMultiProcessRepair(db, { actorId: validActorId });
  assert.equal(exec2.selected, 0);
  assert.equal(exec2.resolved, 0);

  // Confirma zero duplicações
  assert.equal(db._tables.process_evidence.length, countEvidences1);
  assert.equal(db._tables.process_timeline.length, countTimeline1);
  assert.equal(db._tables.email_exceptions[0].status, 'RESOLVIDA');
});
