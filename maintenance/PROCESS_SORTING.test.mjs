import test from 'node:test';
import assert from 'node:assert/strict';
import { sortProcesses } from '../src/utils/processSorting.ts';

function process(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    numero_processo: null,
    prioridade: null,
    valor_causa: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    proxima_obrigacao: null,
    ...overrides,
  };
}

test('prioridade operacional ordena URGENTE, ALTA, MEDIA, BAIXA e sem prioridade', () => {
  const rows = [
    process({ id: 'baixa', prioridade: 'BAIXA' }),
    process({ id: 'sem' }),
    process({ id: 'alta', prioridade: 'ALTA' }),
    process({ id: 'urgente', prioridade: 'URGENTE' }),
    process({ id: 'media', prioridade: 'MEDIA' }),
  ];
  assert.deepEqual(sortProcesses(rows, 'OPERATIONAL_PRIORITY').map((p) => p.id), ['urgente', 'alta', 'media', 'baixa', 'sem']);
});

test('última atualização traz o registro mais recentemente alterado primeiro', () => {
  const rows = [
    process({ id: 'antigo', updated_at: '2026-02-01T10:00:00Z' }),
    process({ id: 'novo', updated_at: '2026-09-16T10:00:00Z' }),
  ];
  assert.deepEqual(sortProcesses(rows, 'LAST_UPDATED').map((p) => p.id), ['novo', 'antigo']);
});

test('mais recentes e mais antigos usam created_at em sentidos opostos', () => {
  const rows = [
    process({ id: 'jan', created_at: '2026-01-01T00:00:00Z' }),
    process({ id: 'set', created_at: '2026-09-01T00:00:00Z' }),
  ];
  assert.deepEqual(sortProcesses(rows, 'NEWEST').map((p) => p.id), ['set', 'jan']);
  assert.deepEqual(sortProcesses(rows, 'OLDEST').map((p) => p.id), ['jan', 'set']);
});

test('valor da causa ordena do maior para o menor e deixa nulos ao final', () => {
  const rows = [
    process({ id: 'sem', valor_causa: null }),
    process({ id: '10', valor_causa: 10000 }),
    process({ id: '50', valor_causa: 50000 }),
  ];
  assert.deepEqual(sortProcesses(rows, 'CASE_VALUE').map((p) => p.id), ['50', '10', 'sem']);
});

test('prazo mais próximo mantém vencidos e futuros em ordem cronológica e deixa sem prazo ao final', () => {
  const rows = [
    process({ id: 'sem' }),
    process({ id: 'futuro2', proxima_obrigacao: { prazo: '2026-10-10T00:00:00Z' } }),
    process({ id: 'vencido', proxima_obrigacao: { prazo: '2026-09-01T00:00:00Z' } }),
    process({ id: 'futuro1', proxima_obrigacao: { prazo: '2026-09-20T00:00:00Z' } }),
  ];
  assert.deepEqual(sortProcesses(rows, 'NEAREST_DEADLINE').map((p) => p.id), ['vencido', 'futuro1', 'futuro2', 'sem']);
});

test('número do processo usa somente os dígitos e mantém registros sem CNJ no final', () => {
  const rows = [
    process({ id: 'b', numero_processo: '0800002-00.2026.8.05.0001' }),
    process({ id: 'sem', numero_processo: null }),
    process({ id: 'a', numero_processo: '0800001-00.2026.8.05.0001' }),
  ];
  assert.deepEqual(sortProcesses(rows, 'PROCESS_NUMBER').map((p) => p.id), ['a', 'b', 'sem']);
});
