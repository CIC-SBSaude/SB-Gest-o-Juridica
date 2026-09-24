import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDeterministicSingleCnj } from '../server/services/cnjAmbiguityRepairService.ts';
import { summarizeDocumentIdentification } from '../server/services/documentIdentificationService.ts';

const cnj1 = '8058951-25.2026.8.05.0000';
const cnj2 = '8007032-06.2026.8.05.0191';

function analysis(blocks) {
  return summarizeDocumentIdentification(blocks);
}

test('A1 aceita exceção obsoleta com um único CNJ válido', () => {
  const result = selectDeterministicSingleCnj(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: `Proc. ${cnj1}` },
  ]));
  assert.equal(result.cnj, cnj1);
  assert.equal(result.rule, 'STALE_SINGLE_CNJ');
});

test('A1 aceita conflito introduzido apenas por SUMMARY', () => {
  const result = selectDeterministicSingleCnj(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: `Proc. ${cnj1}` },
    { source: 'Resumo', kind: 'SUMMARY', text: `${cnj1}\n${cnj2}` },
  ]));
  assert.equal(result.cnj, cnj1);
  assert.equal(result.rule, 'ONLY_NON_SUMMARY_CNJ');
});

test('A1 aceita único CNJ documental quando referências auxiliares não conflitam no assunto', () => {
  const result = selectDeterministicSingleCnj(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: `Proc. ${cnj1}` },
    { source: 'peticao.pdf', kind: 'ATTACHMENT', text: cnj1 },
    { source: 'Corpo', kind: 'BODY', text: `Referência anterior ${cnj2}` },
  ]));
  assert.equal(result.cnj, cnj1);
  assert.equal(result.rule, 'SINGLE_DOCUMENTARY_EVIDENCE');
});

test('A1 rejeita dois CNJs dentro do mesmo documento', () => {
  const result = selectDeterministicSingleCnj(analysis([
    { source: 'peticao.pdf', kind: 'ATTACHMENT', text: `${cnj1} ${cnj2}` },
  ]));
  assert.equal(result.cnj, null);
  assert.match(result.reason, /mesmo anexo/i);
});

test('A1 rejeita conflito entre assunto e único CNJ documental', () => {
  const result = selectDeterministicSingleCnj(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: `Proc. ${cnj2}` },
    { source: 'peticao.pdf', kind: 'ATTACHMENT', text: cnj1 },
  ]));
  assert.equal(result.cnj, null);
});


test('A1 rejeita quando existe CNJ inválido em qualquer trecho persistido', () => {
  const result = selectDeterministicSingleCnj(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: `Proc. ${cnj1}` },
    { source: 'Resumo', kind: 'SUMMARY', text: '0000000-00.0000.0.00.0000' },
  ]));
  assert.equal(result.cnj, null);
  assert.match(result.reason, /DV inválido/i);
});

test('A1 rejeita dois anexos sustentando CNJs distintos', () => {
  const result = selectDeterministicSingleCnj(analysis([
    { source: 'a.pdf', kind: 'ATTACHMENT', text: cnj1 },
    { source: 'b.pdf', kind: 'ATTACHMENT', text: cnj2 },
  ]));
  assert.equal(result.cnj, null);
});

test('A1 mantém assunto quando segundo CNJ existe apenas no SUMMARY', () => {
  const result = selectDeterministicSingleCnj(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: `Processo ${cnj1}` },
    { source: 'Resumo', kind: 'SUMMARY', text: cnj2 },
  ]));
  assert.equal(result.cnj, cnj1);
  assert.ok(['ONLY_NON_SUMMARY_CNJ', 'SUBJECT_OVER_SUMMARY'].includes(result.rule));
});
