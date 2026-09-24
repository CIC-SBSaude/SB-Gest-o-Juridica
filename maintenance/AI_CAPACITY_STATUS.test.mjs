import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAiCapacity, isExpectedQuotaCapacityStatus } from '../server/services/aiCapacityStatusService.ts';

test('capacidade: orçamento permitido resulta em modelo disponível', () => {
  assert.equal(classifyAiCapacity({ routerEnabled: true, allowed: true, budgetReason: 'OK' }), 'DISPONIVEL');
});

test('capacidade: quota diária do provedor prevalece sobre circuit breaker expirado', () => {
  assert.equal(classifyAiCapacity({
    routerEnabled: true,
    allowed: false,
    budgetReason: 'PROVIDER_QUOTA_EXHAUSTED',
    circuitOpenUntil: '2026-09-15T10:00:00Z',
    lastErrorCode: 'DAILY_QUOTA',
    nowMs: Date.parse('2026-09-15T12:00:00Z'),
  }), 'QUOTA_PROVEDOR_ESGOTADA');
});

test('capacidade: RPM/TPM são limites temporários, não quota diária', () => {
  assert.equal(classifyAiCapacity({ routerEnabled: true, allowed: false, budgetReason: 'RPM_REACHED' }), 'LIMITE_TEMPORARIO');
  assert.equal(classifyAiCapacity({ routerEnabled: true, allowed: false, budgetReason: 'TPM_REACHED' }), 'LIMITE_TEMPORARIO');
});

test('capacidade: circuito aberto por erro não-quota permanece distinguível', () => {
  assert.equal(classifyAiCapacity({
    routerEnabled: true,
    allowed: false,
    budgetReason: 'OK',
    circuitOpenUntil: '2026-09-15T13:00:00Z',
    lastErrorCode: 'UNAVAILABLE',
    nowMs: Date.parse('2026-09-15T12:00:00Z'),
  }), 'CIRCUITO_ABERTO');
});

test('capacidade: modelos fora da cadeia são históricos e quota diária é reconhecida como indisponibilidade esperada', () => {
  assert.equal(classifyAiCapacity({ routerEnabled: false, allowed: false }), 'FORA_DO_ROTEADOR');
  assert.equal(isExpectedQuotaCapacityStatus('QUOTA_PROVEDOR_ESGOTADA'), true);
  assert.equal(isExpectedQuotaCapacityStatus('LIMITE_DIARIO_LOCAL'), true);
  assert.equal(isExpectedQuotaCapacityStatus('CIRCUITO_ABERTO'), false);
});
