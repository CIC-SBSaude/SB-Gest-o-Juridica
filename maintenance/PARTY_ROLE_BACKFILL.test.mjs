import test from 'node:test';
import assert from 'node:assert/strict';
import { previewPartyRoleBackfillRows } from './party-role-backfill-dry-run.ts';

const baseParty = (overrides = {}) => ({
  id: 'p1', process_id: 'proc1', nome: 'JOAO DA SILVA', tipo: 'PARTE_IDENTIFICADA', principal: false, ...overrides,
});

const ev = (excerpt, overrides = {}) => ({
  process_id: 'proc1', field_name: 'parte_nome', extracted_value: 'JOAO DA SILVA', evidence_excerpt: excerpt,
  source_type: 'ATTACHMENT', confidence: 0.95, ...overrides,
});

test('dry-run propõe AUTOR com evidência explícita', () => {
  const r = previewPartyRoleBackfillRows([baseParty()], [ev('Autor: JOAO DA SILVA')]);
  assert.equal(r.proposedCounts.AUTOR, 1);
  assert.equal(r.wouldChange, 1);
});

test('dry-run propõe REU com evidência explícita', () => {
  const r = previewPartyRoleBackfillRows([baseParty()], [ev('Réu: JOAO DA SILVA')]);
  assert.equal(r.proposedCounts.REU, 1);
});

test('principal=true sem evidência não vira AUTOR', () => {
  const r = previewPartyRoleBackfillRows([baseParty({ principal: true })], []);
  assert.equal(r.proposedCounts.PARTE_IDENTIFICADA, 1);
  assert.equal(r.wouldChange, 0);
});

test('conflito AUTOR/REU permanece PARTE_IDENTIFICADA', () => {
  const r = previewPartyRoleBackfillRows([baseParty()], [ev('Autor: JOAO DA SILVA'), ev('Réu: JOAO DA SILVA')]);
  assert.equal(r.proposedCounts.PARTE_IDENTIFICADA, 1);
  assert.equal(r.wouldChange, 0);
});

test('ignora partes já classificadas', () => {
  const r = previewPartyRoleBackfillRows([baseParty({ tipo: 'AUTOR' })], [ev('Autor: JOAO DA SILVA')]);
  assert.equal(r.eligibleCurrentParteIdentificada, 0);
  assert.equal(r.wouldChange, 0);
});

test('A x B pattern - Left is AUTOR, Right is REU', () => {
  const r1 = previewPartyRoleBackfillRows(
    [baseParty({ nome: 'VANESSA COSTA DE ARAÚJO' })],
    [ev('VANESSA COSTA DE ARAÚJO x SAÚDE BRASIL', { extracted_value: 'VANESSA COSTA DE ARAÚJO' })]
  );
  assert.equal(r1.proposedCounts.AUTOR, 1);

  const r2 = previewPartyRoleBackfillRows(
    [baseParty({ nome: 'SAÚDE BRASIL' })],
    [ev('VANESSA COSTA DE ARAÚJO x SAÚDE BRASIL', { extracted_value: 'SAÚDE BRASIL' })]
  );
  assert.equal(r2.proposedCounts.REU, 1);
});

test('Generic formatting alone keeps PARTE_IDENTIFICADA', () => {
  const r = previewPartyRoleBackfillRows(
    [baseParty({ nome: 'RYAN DE ANDRADE LIMA' })],
    [ev('Proc. 4004720-65.2025.8.26.0001 - RYAN DE ANDRADE LIMA', { extracted_value: 'RYAN DE ANDRADE LIMA' })]
  );
  assert.equal(r.proposedCounts.PARTE_IDENTIFICADA, 1);
});

