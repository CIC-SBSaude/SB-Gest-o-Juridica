import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAttemptGate } from '../server/services/aiAttemptGate.ts';
import { recognizeIsolated } from '../server/services/isolatedOcr.ts';

const budget = () => ({ allowed: true, reason: 'OK', effectiveRpm: 4,
  effectiveTpm: 1000, effectiveRpd: 19, requestsToday: 0, estimatedTokensForNextRequest: 100 });

test('concurrent attempts are serialized and spaced, including failed retries', async () => {
  let now = Date.UTC(2026, 8, 13), active = 0, peak = 0;
  const times = [];
  const gate = createAttemptGate({ now: () => now, sleep: async ms => { now += ms; } });
  const invoke = async () => {
    times.push(now); peak = Math.max(peak, ++active);
    await Promise.resolve(); active--;
    throw new Error('503');
  };
  await Promise.allSettled(Array.from({ length: 3 }, () => gate.run('flash', async () => budget(), invoke)));
  assert.equal(peak, 1);
  assert.equal(times.length, 3);
  assert.ok(times[1] - times[0] >= 15000);
  assert.ok(times[2] - times[1] >= 15000);
});

test('failed attempts consume daily admission budget without false successful usage', async () => {
  const gate = createAttemptGate({ sleep: async () => {} });
  const read = async () => ({ ...budget(), effectiveRpd: 1 });
  await assert.rejects(gate.run('flash', read, async () => { throw new Error('503'); }), /503/);
  await assert.rejects(gate.run('flash', read, async () => 'unexpected'), /RPD_REACHED/);
  assert.equal(await gate.run('lite', read, async () => 'ok'), 'ok');
});

test('budget is rechecked before dispatch and token reservations block bursts', async () => {
  const gate = createAttemptGate({ sleep: async () => {} });
  let reads = 0, calls = 0;
  await assert.rejects(gate.run('flash', async () => ({ ...budget(),
    allowed: ++reads === 1, reason: 'CIRCUIT_OPEN' }), async () => { calls++; }), /CIRCUIT_OPEN/);
  assert.equal(calls, 0);
  const read = async () => ({ ...budget(), estimatedTokensForNextRequest: 600 });
  await gate.run('lite', read, async () => 'ok');
  await assert.rejects(gate.run('lite', read, async () => 'unexpected'), /TPM_REACHED/);
});

test('OCR child failure and timeout leave server alive and allow the next image', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sb-ocr-test-'));
  const workerPath = path.join(dir, 'fixture.cjs');
  try {
    await writeFile(workerPath, 'process.stdout.write(JSON.stringify({text:"probe",confidence:95}))');
    try { await recognizeIsolated(Buffer.from('image'), { workerPath }); }
    catch (error) {
      if (/EPERM/.test(error.message)) { t.skip('Sandbox blocks child processes; run this integration test after import.'); return; }
      throw error;
    }
    await writeFile(workerPath, 'throw new Error("broken traineddata")');
    await assert.rejects(recognizeIsolated(Buffer.from('image'), { workerPath }), /OCR_ERROR/);
    await writeFile(workerPath, 'setInterval(() => {}, 1000)');
    await assert.rejects(recognizeIsolated(Buffer.from('image'), { workerPath, timeoutMs: 150 }), /OCR_PAGE_TIMEOUT/);
    await writeFile(workerPath, 'process.stdout.write(JSON.stringify({text:"texto reconhecido",confidence:95}))');
    assert.deepEqual(await recognizeIsolated(Buffer.from('image'), { workerPath }),
      { text: 'texto reconhecido', confidence: 95 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
