import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as access from '../server/services/aiAccessError.ts';
import { classifyAiCapacity } from '../server/services/aiCapacityStatusService.ts';
import { isTransientSupabaseError } from '../server/services/supabaseResilienceService.ts';

// Exercise the real service implementations with offline provider/database doubles.
function loadService(file, dependencies, exports) {
  const source = stripTypeScriptTypes(readFileSync(new URL(`../server/services/${file}.ts`, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');
  return new Function(...Object.keys(dependencies), `${source};return {${exports.join(',')}};`)(...Object.values(dependencies));
}

test('access check endpoint requires ADMIN, validates model and sends only synthetic input', async () => {
  const handlers = new Map();
  const router = { get() {}, post(path, ...callbacks) { handlers.set(path, callbacks.at(-1)); } };
  const source = stripTypeScriptTypes(readFileSync(new URL('../server/routes/ai.ts', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export default router;?\r?$/gm, '');
  let request;
  new Function('express', 'requireAuth', 'getAiRouterModelChain', 'getBackendSupabase', 'generateContentWithAiRouter', source)(
    { Router: () => router }, () => {}, () => ['gemini-3.5-flash-lite'], () => ({}),
    async params => { request = params; });
  const handler = handlers.get('/access-check');
  const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await handler({ user: { role: 'ANALISTA' }, body: { model: 'gemini-3.5-flash-lite' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(request, undefined);
  await handler({ user: { role: 'ADMIN' }, body: { model: 'untrusted-model' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(request, undefined);
  await handler({ user: { role: 'ADMIN' }, body: { model: 'gemini-3.5-flash-lite', contents: 'MUST NOT BE SENT' } }, res);
  assert.equal(res.body.ok, true);
  assert.equal(request.contents, 'Responda apenas OK.');
  assert.equal(request.accessProbe, true);
});

const denial = () => Object.assign(new Error('403 Your project has been denied access. Please contact support.'),
  { name: 'PermissionDeniedError', status: 403 });

function routerFixture() {
  const rows = new Map();
  let calls = 0;
  let usage = 0;
  let failStorage = false;
  let invoke = async () => { throw denial(); };
  const db = { from(table) {
    assert.equal(table, 'ai_model_health');
    let model;
    const query = { select() { return query; }, eq(_key, value) { model = value; return query; },
      async maybeSingle() { return { data: rows.get(model) || null }; },
      async upsert(row) { if (failStorage) return { error: new Error('offline') };
        rows.set(row.model, { ...rows.get(row.model), ...row }); return { error: null }; } };
    return query;
  } };
  const deps = { ...access, ENV: { gemini: { apiKey: 'synthetic-test-key', timeoutMs: 1000 } },
    GoogleGenAI: class { interactions = { create: async () => { calls++; return invoke(); } };
      models = { generateContent: async () => { calls++; return invoke(); } }; },
    getAiBudgetState: async () => ({ allowed: true, reason: 'OK' }),
    markAiQuotaExhausted: async () => assert.fail('403 must not mark quota exhausted'),
    recordAiUsage: async () => { usage++; },
    AiAdmissionError: class extends Error {},
    aiAttemptGate: { async run(_model, readBudget, action) { await readBudget(); return action(); } },
  };
  return { db, rows, calls: () => calls, usage: () => usage,
    setInvoke: fn => { invoke = fn; }, failStorage: value => { failStorage = value; },
    ...loadService('aiRouterService', deps, ['generateContentWithAiRouter', 'getAiRouterCapacityState', 'readHealth']) };
}

test('recognizes SDK and nested permission errors without a code; 403 is never database retry', () => {
  for (const error of [denial(), { response: { status: 403 } }, { error: { code: 403, status: 'PERMISSION_DENIED' } },
    { status: 'PERMISSION_DENIED' }, { name: 'PermissionDeniedError' }, { status: 401 }]) {
    assert.equal(access.isAiAccessDenied(error), true);
  }
  assert.equal(access.isAiAccessDenied({ status: 429 }), false);
  assert.equal(isTransientSupabaseError({ status: 403, message: 'upstream timeout' }), false);
  assert.equal(isTransientSupabaseError(denial()), false);
  assert.equal(isTransientSupabaseError({ status: 503 }), true);
  assert.equal(isTransientSupabaseError({ code: 'ECONNRESET' }), true);
});

test('project denial makes exactly one call, blocks both models and preserves quota', async () => {
  const f = routerFixture();
  const params = { supabase: f.db, contents: 'synthetic', purpose: 'LEGAL_INTERPRETATION' };
  await assert.rejects(f.generateContentWithAiRouter(params), { status: 403, code: 'AI_ACCESS_DENIED' });
  assert.equal(f.calls(), 1);
  assert.equal(f.usage(), 0);
  assert.equal(f.rows.size, 2);
  for (const row of f.rows.values()) {
    assert.equal(row.last_error_code, 'AI_ACCESS_DENIED');
    assert.equal(row.circuit_open_until, null);
  }
  await assert.rejects(f.generateContentWithAiRouter(params), { code: 'AI_ACCESS_DENIED' });
  assert.equal(f.calls(), 1);
  assert.equal((await f.getAiRouterCapacityState(f.db)).available, false);
});

test('failed probe preserves block; only successful explicit probe clears its model', async () => {
  const f = routerFixture();
  await assert.rejects(f.generateContentWithAiRouter({ supabase: f.db, contents: 'test' }));
  const model = 'gemini-3.5-flash-lite';
  const probe = { supabase: f.db, contents: 'Responda apenas OK.', preferredModel: model, accessProbe: true };
  f.setInvoke(async () => { throw Object.assign(new Error('model not found'), { status: 404 }); });
  await assert.rejects(f.generateContentWithAiRouter(probe));
  assert.equal(f.calls(), 2);
  assert.equal(f.rows.get(model).last_error_code, 'AI_ACCESS_DENIED');
  f.setInvoke(async () => ({ text: 'OK', usageMetadata: { totalTokenCount: 2 } }));
  await f.generateContentWithAiRouter(probe);
  assert.equal(f.rows.get(model).last_error_code, null);
  assert.equal(f.rows.get('gemini-3.5-flash').last_error_code, 'AI_ACCESS_DENIED');
  assert.equal((await f.getAiRouterCapacityState(f.db)).available, true);
});

test('storage failure keeps in-process block and failed recovery does not claim success', async () => {
  const f = routerFixture();
  f.failStorage(true);
  await assert.rejects(f.generateContentWithAiRouter({ supabase: f.db, contents: 'test' }));
  assert.equal((await f.getAiRouterCapacityState(f.db)).available, false);
  await assert.rejects(f.generateContentWithAiRouter({ supabase: f.db, contents: 'test' }));
  assert.equal(f.calls(), 1);
  f.setInvoke(async () => ({ text: 'OK' }));
  await assert.rejects(f.generateContentWithAiRouter({ supabase: f.db, contents: 'OK', accessProbe: true,
    preferredModel: 'gemini-3.5-flash-lite' }), { code: 'AI_ACCESS_RECOVERY_NOT_SAVED' });
  assert.equal((await f.getAiRouterCapacityState(f.db)).available, false);
});

test('access failure has precedence over quota reset, allowed budget and expired circuit', () => {
  assert.equal(classifyAiCapacity({ routerEnabled: true, allowed: true, budgetReason: 'OK',
    lastErrorCode: 'AI_ACCESS_DENIED', circuitOpenUntil: '2020-01-01T00:00:00Z' }), 'ACESSO_NEGADO');
});

test('email processing preserves interpreter status and worker stops without modifying pending email', async () => {
  let updates = 0;
  let processedCalls = 0;
  const record = { id: 'synthetic-email', status: 'PENDENTE_IA', metadata: {} };
  const db = { from(table) { assert.equal(table, 'processed_emails');
    const q = { select() { return q; }, eq() { return q; }, order() { return q; },
      async single() { return { data: record }; }, async limit() { return { data: [record] }; },
      update() { updates++; return q; } }; return q;
  } };
  let providerCalls = 0;
  const { interpretWithGemini } = loadService('geminiLegalInterpreter', {
    ENV: { gemini: { apiKey: 'synthetic-test-key', timeoutMs: 1000, retryInvalidJsonAttempts: 2 } },
    getAiRuntimeConfig: async () => ({ model: 'gemini-3.5-flash-lite' }),
    generateContentWithAiRouter: async () => { providerCalls++; throw access.aiAccessError(denial().message); },
  }, ['interpretWithGemini']);
  const { processEmailWithAi } = loadService('emailAiProcessingService', {
    getBackendSupabase: () => db, filterExternalProtocols: () => [], mergeStoredProcessNumbers: () => [],
    interpretWithGemini,
  }, ['processEmailWithAi']);
  await assert.rejects(processEmailWithAi({ emailId: record.id, actorId: null, executionMode: 'AUTOMATIC' }),
    { status: 403, code: 'AI_ACCESS_DENIED' });
  const { runAiQueueWorker } = loadService('aiQueueWorkerService', {
    getBackendSupabase: () => db, withAutomationLock: async (_name, _ttl, run) => run(),
    getAiRouterCapacityState: async () => ({ available: true, states: [] }),
    processEmailWithAi: async params => { processedCalls++; return processEmailWithAi(params); },
    isTransientSupabaseError, isAiAccessDenied: access.isAiAccessDenied,
  }, ['runAiQueueWorker']);
  const result = await runAiQueueWorker();
  assert.equal(result.pausedByAccess, true);
  assert.equal(result.pausedByQuota, false);
  assert.equal(processedCalls, 1);
  assert.equal(providerCalls, 2); // One per execution, never the two JSON attempts.
  assert.equal(updates, 0);
  assert.equal(record.status, 'PENDENTE_IA');
});
