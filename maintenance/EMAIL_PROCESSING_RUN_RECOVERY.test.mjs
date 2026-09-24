import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isStaleEmailProcessingRun } from '../server/services/emailProcessingRunRecoveryPolicy.ts';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-16T12:00:00.000Z');

test('run RUNNING acima de 30 minutos é considerado órfão potencial', () => {
  assert.equal(isStaleEmailProcessingRun({
    status: 'RUNNING',
    started_at: '2026-09-16T11:29:00.000Z',
  }, NOW, 30), true);
});

test('run RUNNING recente não é reconciliado', () => {
  assert.equal(isStaleEmailProcessingRun({
    status: 'RUNNING',
    started_at: '2026-09-16T11:31:00.000Z',
  }, NOW, 30), false);
});

test('run já finalizado ou com data inválida nunca é elegível', () => {
  assert.equal(isStaleEmailProcessingRun({
    status: 'SUCCESS',
    started_at: '2026-09-16T10:00:00.000Z',
  }, NOW, 30), false);
  assert.equal(isStaleEmailProcessingRun({
    status: 'RUNNING',
    started_at: 'data-invalida',
  }, NOW, 30), false);
});

test('recuperação exige explicitamente lock exclusivo e usa update otimista RUNNING', () => {
  const code = read('server/services/emailProcessingRunRecoveryService.ts');
  assert.match(code, /exclusiveImapLockHeld:\s*true/);
  assert.match(code, /eq\('status',\s*'RUNNING'\)/);
  assert.match(code, /ORPHANED_RUN_RECOVERY/);
  assert.match(code, /status:\s*'FAILED'/);
});

test('sincronização manual usa o mesmo lock distribuído da automação', () => {
  const route = read('server/routes/imap.ts');
  assert.match(route, /withAutomationLock\('IMAP_INGESTION',\s*300/);
  assert.match(route, /recoverStaleEmailProcessingRuns/);
  assert.match(route, /status\(409\)/);
});

test('scheduler reconcilia runs antigos somente depois de adquirir IMAP_INGESTION', () => {
  const scheduler = read('server/services/automationSchedulerService.ts');
  const lockIndex = scheduler.indexOf("withAutomationLock('IMAP_INGESTION'");
  const recoveryIndex = scheduler.indexOf('recoverStaleEmailProcessingRuns', lockIndex);
  const syncIndex = scheduler.indexOf('imapService.syncEmails(null)', lockIndex);
  assert.ok(lockIndex >= 0);
  assert.ok(recoveryIndex > lockIndex);
  assert.ok(syncIndex > recoveryIndex);
});
