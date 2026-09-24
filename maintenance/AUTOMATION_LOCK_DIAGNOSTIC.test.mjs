import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAutomationLockForDiagnostic } from '../server/services/automationLockDiagnosticPolicy.ts';

const NOW = Date.parse('2026-09-16T13:10:00.000Z');

test('lock livre é OK', () => {
  const result = classifyAutomationLockForDiagnostic({ nowMs: NOW });
  assert.equal(result.status, 'LIVRE');
  assert.equal(result.severity, 'OK');
  assert.equal(result.actionable, false);
});

test('lease expirado é recuperável e não gera falso alerta', () => {
  const result = classifyAutomationLockForDiagnostic({
    ownerToken: 'owner',
    lockedUntil: '2026-09-16T13:05:00.000Z',
    updatedAt: '2026-09-16T12:50:00.000Z',
    nowMs: NOW,
  });
  assert.equal(result.status, 'EXPIRADO');
  assert.equal(result.severity, 'OK');
  assert.equal(result.actionable, false);
  assert.match(result.details, /recuperável automaticamente/i);
});

test('owner sem locked_until é inconsistência real', () => {
  const result = classifyAutomationLockForDiagnostic({ ownerToken: 'owner', nowMs: NOW });
  assert.equal(result.status, 'INCONSISTENTE');
  assert.equal(result.severity, 'ALERTA');
  assert.equal(result.actionable, true);
});

test('lease ativo sem heartbeat por mais de 6 minutos pede revisão', () => {
  const result = classifyAutomationLockForDiagnostic({
    ownerToken: 'owner',
    lockedUntil: '2026-09-16T13:20:00.000Z',
    updatedAt: '2026-09-16T13:03:00.000Z',
    nowMs: NOW,
  });
  assert.equal(result.status, 'REVISAR_POSSIVEL_ORFAO');
  assert.equal(result.severity, 'ALERTA');
  assert.equal(result.actionable, true);
});
