import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

function makeMockApp(initialState = {}) {
  const source = stripTypeScriptTypes(readFileSync(new URL('../server/routes/companyResolution.ts', import.meta.url), 'utf8'));
  const route = source.slice(source.indexOf("router.post('/reprocess-orphans'"), source.indexOf('export default router;'));

  const processes = [...(initialState.processes || [])];
  const candidates = [...(initialState.candidates || [])];
  const audits = [...(initialState.audits || [])];
  const processedCalls = [];

  const supabase = {
    from(table) {
      if (table === 'company_resolution_candidates') {
        return {
          select(fields) {
            return {
              eq(col, val) {
                const filtered = candidates.filter(c => c[col] === val);
                return Promise.resolve({ data: filtered, error: null });
              }
            };
          }
        };
      }
      if (table === 'company_resolution_audit') {
        return {
          select(fields) {
            let minCreatedAt = null;
            let orderAscending = true;
            const builder = {
              gte(col, val) {
                if (col === 'created_at') minCreatedAt = val;
                return builder;
              },
              order(col, opts = {}) {
                if (col === 'created_at') orderAscending = opts.ascending !== false;
                return builder;
              },
              then(resolve) {
                let res = [...audits];
                if (minCreatedAt) res = res.filter(a => String(a.created_at || '') >= minCreatedAt);
                res.sort((a, b) => {
                  const av = new Date(a.created_at || 0).getTime();
                  const bv = new Date(b.created_at || 0).getTime();
                  return orderAscending ? av - bv : bv - av;
                });
                resolve({ data: res, error: null });
              }
            };
            return builder;
          }
        };
      }
      if (table === 'processes') {
        return {
          select(fields) {
            let filterInIds = null;
            let filterIsCompanyIdNull = false;
            const builder = {
              in(col, ids) {
                filterInIds = ids;
                return builder;
              },
              is(col, val) {
                if (col === 'company_id' && val === null) {
                  filterIsCompanyIdNull = true;
                }
                return builder;
              },
              order(col, opts) {
                return builder;
              },
              then(resolve) {
                let res = [...processes];
                if (filterInIds) {
                  res = res.filter(p => filterInIds.includes(p.id));
                }
                if (filterIsCompanyIdNull) {
                  res = res.filter(p => p.company_id === null || p.company_id === undefined);
                }
                resolve({ data: res, error: null });
              }
            };
            return builder;
          },
          update(updates) {
            let targetId = null;
            let isCompanyIdNull = false;
            const updateBuilder = {
              eq(col, val) {
                if (col === 'id') targetId = val;
                return updateBuilder;
              },
              is(col, val) {
                if (col === 'company_id' && val === null) isCompanyIdNull = true;
                return updateBuilder;
              },
              select(fields) {
                const target = processes.find(p => p.id === targetId);
                if (target && (!isCompanyIdNull || target.company_id === null || target.company_id === undefined)) {
                  Object.assign(target, updates);
                  return Promise.resolve({ data: [{ id: target.id }], error: null });
                }
                return Promise.resolve({ data: [], error: null });
              }
            };
            return updateBuilder;
          }
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  };

  let handler;
  new Function('router', 'canManage', 'getBackendSupabase', 'resolveOrphanProcessCompany', route)(
    { post(path, fn) { handler = fn; } },
    req => req.user?.role === 'ADMIN' || req.user?.role === 'GESTOR',
    () => supabase,
    async (sb, processId, actorId) => {
      processedCalls.push(processId);
      return { companyId: '00000000-0000-0000-0000-000000000099', method: 'CNPJ_EXATO' };
    }
  );

  return {
    processes,
    candidates,
    processedCalls,
    async call(body, role = 'ADMIN') {
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(val) { this.body = val; return this; }
      };
      await handler({ body, user: { role, id: 'actor-test' } }, res);
      return res;
    }
  };
}

function generateUuid(i) {
  return `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
}

test('1. primeira prévia retorna até 10 processos elegíveis', async () => {
  const processes = Array.from({ length: 15 }, (_, i) => ({
    id: generateUuid(i + 1),
    numero_processo: `PROC-${i + 1}`,
    company_id: null,
    created_at: new Date(2026, 0, i + 1).toISOString(),
  }));
  const app = makeMockApp({ processes });
  const res = await app.call({ execute: false });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.dryRun, true);
  assert.equal(res.body.processes.length, 10);
  assert.equal(res.body.available, 10);
  assert.equal(res.body.remainingEligible, 5);
  assert.equal(res.body.processes[0].id, generateUuid(1));
});

test('2. processo com company_id preenchido não aparece', async () => {
  const processes = [
    { id: generateUuid(1), numero_processo: 'PROC-1', company_id: '00000000-0000-0000-0000-000000000088' },
    { id: generateUuid(2), numero_processo: 'PROC-2', company_id: null },
  ];
  const app = makeMockApp({ processes });
  const res = await app.call({ execute: false });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.processes.length, 1);
  assert.equal(res.body.processes[0].id, generateUuid(2));
  assert.equal(res.body.available, 1);
  assert.equal(res.body.remainingEligible, 0);
});

test('3. processo com candidate PENDENTE não aparece novamente no próximo lote', async () => {
  const processes = [
    { id: generateUuid(1), numero_processo: 'PROC-1', company_id: null, created_at: '2026-01-01T00:00:00Z' },
    { id: generateUuid(2), numero_processo: 'PROC-2', company_id: null, created_at: '2026-01-02T00:00:00Z' },
  ];
  const candidates = [
    { id: generateUuid(101), process_id: generateUuid(1), status: 'PENDENTE' },
  ];
  const app = makeMockApp({ processes, candidates });
  const res = await app.call({ execute: false });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.processes.length, 1);
  assert.equal(res.body.processes[0].id, generateUuid(2));
  assert.equal(res.body.remainingEligible, 0);
});

test('4. após processar lote 1, nova prévia consegue retornar lote diferente', async () => {
  const processes = Array.from({ length: 20 }, (_, i) => ({
    id: generateUuid(i + 1),
    numero_processo: `PROC-${i + 1}`,
    company_id: null,
    created_at: new Date(2026, 0, i + 1).toISOString(),
  }));
  const app = makeMockApp({ processes });

  // Prévia 1
  const prev1 = await app.call({ execute: false });
  assert.equal(prev1.body.processes.length, 10);
  const batch1Ids = prev1.body.processes.map(p => p.id);
  assert.equal(batch1Ids[0], generateUuid(1));

  // Executar lote 1
  const exec1 = await app.call({ processIds: batch1Ids, execute: true });
  assert.equal(exec1.statusCode, 200);
  assert.equal(exec1.body.linked, 10);

  // Prévia 2
  const prev2 = await app.call({ execute: false });
  assert.equal(prev2.statusCode, 200);
  assert.equal(prev2.body.processes.length, 10);
  const batch2Ids = prev2.body.processes.map(p => p.id);
  assert.equal(batch2Ids[0], generateUuid(11));
  assert.equal(prev2.body.remainingEligible, 0);

  // Lotes são mutuamente disjuntos
  for (const id of batch1Ids) {
    assert.equal(batch2Ids.includes(id), false);
  }
});

test('5. execução usa exatamente os IDs da prévia', async () => {
  const processes = [
    { id: generateUuid(1), numero_processo: 'PROC-1', company_id: null },
    { id: generateUuid(2), numero_processo: 'PROC-2', company_id: null },
    { id: generateUuid(3), numero_processo: 'PROC-3', company_id: null },
  ];
  const app = makeMockApp({ processes });
  const preview = await app.call({ execute: false, limit: 2 });
  assert.equal(preview.body.processes.length, 2);
  const previewIds = preview.body.processes.map(p => p.id);

  const exec = await app.call({ processIds: previewIds, execute: true });
  assert.equal(exec.statusCode, 200);
  assert.equal(exec.body.scanned, 2);
  assert.deepEqual(app.processedCalls, previewIds);
});

test('6. processo alterado entre prévia e execução é ignorado com segurança', async () => {
  const p1 = { id: generateUuid(1), numero_processo: 'PROC-1', company_id: null };
  const p2 = { id: generateUuid(2), numero_processo: 'PROC-2', company_id: null };
  const app = makeMockApp({ processes: [p1, p2] });

  const preview = await app.call({ execute: false });
  const previewIds = preview.body.processes.map(p => p.id);

  // Processo 1 é vinculado por outro usuário entre prévia e execução
  p1.company_id = '00000000-0000-0000-0000-000000000099';

  const exec = await app.call({ processIds: previewIds, execute: true });
  assert.equal(exec.statusCode, 200);
  assert.equal(exec.body.scanned, 1);
  assert.equal(exec.body.linked, 1);
  assert.deepEqual(app.processedCalls, [p2.id]);
});

test('7. nenhum processo elegível retorna resposta normal, não erro', async () => {
  const app = makeMockApp({ processes: [] });
  const res = await app.call({ execute: false });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.dryRun, true);
  assert.deepEqual(res.body.processes, []);
  assert.equal(res.body.available, 0);
  assert.equal(res.body.remainingEligible, 0);
});

test('8. limite acima de 10 é reduzido/bloqueado', async () => {
  const app = makeMockApp({ processes: [] });
  const overLimit = await app.call({ execute: false, limit: 100 });
  assert.equal(overLimit.statusCode, 400);

  const negativeLimit = await app.call({ execute: false, limit: 0 });
  assert.equal(negativeLimit.statusCode, 400);

  const processes = Array.from({ length: 10 }, (_, i) => ({
    id: generateUuid(i + 1),
    numero_processo: `PROC-${i + 1}`,
    company_id: null,
  }));
  const appWithProcesses = makeMockApp({ processes });
  const validLimit = await appWithProcesses.call({ execute: false, limit: 3 });
  assert.equal(validLimit.statusCode, 200);
  assert.equal(validLimit.body.processes.length, 3);
});

test('9. usuários sem ADMIN/GESTOR continuam sem permissão', async () => {
  const app = makeMockApp({ processes: [] });
  assert.equal((await app.call({ execute: false }, 'USER')).statusCode, 403);
  assert.equal((await app.call({ execute: false }, 'CONSULTA')).statusCode, 403);
  assert.equal((await app.call({ execute: false }, '')).statusCode, 403);
  assert.equal((await app.call({ execute: false }, 'GESTOR')).statusCode, 200);
  assert.equal((await app.call({ execute: false }, 'ADMIN')).statusCode, 200);
});


test('10. processo NAO_RESOLVIDO recente entra em cooldown e não reaparece', async () => {
  const now = new Date();
  const processes = [
    { id: generateUuid(1), numero_processo: 'PROC-1', company_id: null, created_at: '2026-01-01T00:00:00Z' },
    { id: generateUuid(2), numero_processo: 'PROC-2', company_id: null, created_at: '2026-01-02T00:00:00Z' },
  ];
  const audits = [
    { process_id: generateUuid(1), resolution_method: 'NAO_RESOLVIDO', created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString() },
  ];
  const app = makeMockApp({ processes, audits });
  const res = await app.call({ execute: false });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.processes.map(p => p.id), [generateUuid(2)]);
  assert.equal(res.body.cooldownExcluded, 1);
  assert.equal(res.body.cooldownHours, 24);
});

test('11. NAO_RESOLVIDO com mais de 24h pode voltar a ser elegível', async () => {
  const now = new Date();
  const processes = [
    { id: generateUuid(1), numero_processo: 'PROC-1', company_id: null, created_at: '2026-01-01T00:00:00Z' },
  ];
  const audits = [
    { process_id: generateUuid(1), resolution_method: 'NAO_RESOLVIDO', created_at: new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString() },
  ];
  const app = makeMockApp({ processes, audits });
  const res = await app.call({ execute: false });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.processes.map(p => p.id), [generateUuid(1)]);
  assert.equal(res.body.cooldownExcluded, 0);
});

test('12. somente a última tentativa recente define cooldown', async () => {
  const now = new Date();
  const processes = [
    { id: generateUuid(1), numero_processo: 'PROC-1', company_id: null, created_at: '2026-01-01T00:00:00Z' },
  ];
  const audits = [
    { process_id: generateUuid(1), resolution_method: 'NAO_RESOLVIDO', created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
    { process_id: generateUuid(1), resolution_method: 'AMBIGUO', created_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString() },
  ];
  const app = makeMockApp({ processes, audits });
  const res = await app.call({ execute: false });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.processes.map(p => p.id), [generateUuid(1)]);
  assert.equal(res.body.cooldownExcluded, 0);
});
