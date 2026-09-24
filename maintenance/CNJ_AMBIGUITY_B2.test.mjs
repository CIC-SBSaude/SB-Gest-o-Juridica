import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRelaxedMultiProcessB2 } from '../server/services/cnjAmbiguityB2Service.ts';
import { summarizeDocumentIdentification } from '../server/services/documentIdentificationService.ts';

const cnj1 = '0097757-68.2026.8.05.0001';
const cnj2 = '0098088-50.2026.8.05.0001';
const cnj3 = '0168148-19.2024.8.05.0001';
const connected1 = '8131412-31.2022.8.05.0001';
const connected2 = '8034992-61.2022.8.05.0001';

function run(blocks) {
  const analysis = summarizeDocumentIdentification(blocks);
  return selectRelaxedMultiProcessB2(analysis, blocks);
}

test('B2 aceita dois anexos individualizados e CNJ extra apenas no resumo', () => {
  const result = run([
    { source: 'Assunto', kind: 'SUBJECT', text: 'CONSULTAS JUDICIAIS DE HOJE' },
    { source: 'citacao1.pdf', kind: 'ATTACHMENT', text: cnj1 },
    { source: 'citacao2.pdf', kind: 'ATTACHMENT', text: cnj2 },
    { source: 'Resumo', kind: 'SUMMARY', text: cnj3 },
  ]);
  assert.equal(result.structuralCandidate, true);
  assert.equal(result.rule, 'B2_SEPARATED_ATTACHMENTS_AUXILIARY_EXTRAS');
  assert.deepEqual(new Set(result.targetCnjs), new Set([cnj1, cnj2]));
  assert.deepEqual(result.auxiliaryCnjs, [cnj3]);
});

test('B2 aceita CNJ extra somente no BODY com dois anexos unívocos', () => {
  const result = run([
    { source: 'Assunto', kind: 'SUBJECT', text: 'PDPJ e DET' },
    { source: 'doc1.pdf', kind: 'ATTACHMENT', text: cnj1 },
    { source: 'doc2.pdf', kind: 'ATTACHMENT', text: cnj2 },
    { source: 'Corpo', kind: 'BODY', text: `Histórico antigo ${cnj3}` },
  ]);
  assert.equal(result.structuralCandidate, true);
  assert.equal(result.rule, 'B2_SEPARATED_ATTACHMENTS_AUXILIARY_EXTRAS');
});

test('B2 rejeita anexo contendo dois CNJs', () => {
  const result = run([
    { source: 'doc1.pdf', kind: 'ATTACHMENT', text: `${cnj1} ${cnj2}` },
    { source: 'doc2.pdf', kind: 'ATTACHMENT', text: cnj3 },
  ]);
  assert.equal(result.structuralCandidate, false);
  assert.match(result.reason, /mais de um CNJ/i);
});

test('B2 rejeita CNJ concorrente no assunto fora dos anexos', () => {
  const result = run([
    { source: 'Assunto', kind: 'SUBJECT', text: cnj3 },
    { source: 'doc1.pdf', kind: 'ATTACHMENT', text: cnj1 },
    { source: 'doc2.pdf', kind: 'ATTACHMENT', text: cnj2 },
  ]);
  assert.equal(result.structuralCandidate, false);
  assert.match(result.reason, /assunto introduz CNJ/i);
});

test('B2 rejeita CNJ extra em fonte UNKNOWN', () => {
  const result = run([
    { source: 'doc1.pdf', kind: 'ATTACHMENT', text: cnj1 },
    { source: 'doc2.pdf', kind: 'ATTACHMENT', text: cnj2 },
    { source: 'Trecho', kind: 'UNKNOWN', text: cnj3 },
  ]);
  assert.equal(result.structuralCandidate, false);
  assert.match(result.reason, /fonte não auxiliar/i);
});

test('B2 aceita processo principal/incidente com marcador explícito de conexão', () => {
  const result = run([
    { source: 'Assunto', kind: 'SUBJECT', text: `SENTENÇA - ${connected1}` },
    { source: 'sentenca.pdf', kind: 'ATTACHMENT', text: connected1 },
    { source: 'Corpo', kind: 'BODY', text: `Embargos vinculados ao processo principal ${connected2}` },
  ]);
  assert.equal(result.structuralCandidate, true);
  assert.equal(result.rule, 'B2_CONNECTED_REFERENCE_EXPLICIT');
  assert.deepEqual(new Set(result.targetCnjs), new Set([connected1, connected2]));
});

test('B2 não aceita segundo CNJ auxiliar sem marcador explícito de conexão', () => {
  const result = run([
    { source: 'Assunto', kind: 'SUBJECT', text: `SENTENÇA - ${connected1}` },
    { source: 'sentenca.pdf', kind: 'ATTACHMENT', text: connected1 },
    { source: 'Corpo', kind: 'BODY', text: `Referência histórica ${connected2}` },
  ]);
  assert.equal(result.structuralCandidate, false);
});

test('B2 rejeita CNJ inválido persistido', () => {
  const result = run([
    { source: 'doc1.pdf', kind: 'ATTACHMENT', text: cnj1 },
    { source: 'doc2.pdf', kind: 'ATTACHMENT', text: cnj2 },
    { source: 'Resumo', kind: 'SUMMARY', text: '0000000-00.0000.0.00.0000' },
  ]);
  assert.equal(result.structuralCandidate, false);
  assert.match(result.reason, /DV inválido/i);
});


test('B2 agrupa páginas do mesmo PDF e não promove CNJ interno a processo-alvo', () => {
  const source1 = `CITAÇÃO - PROCESSO Nº ${cnj1} - JULIANA.pdf`;
  const source2 = `CITAÇÃO - PROCESSO Nº ${cnj2} - JULIANA.pdf`;
  const result = run([
    { source: 'Assunto', kind: 'SUBJECT', text: 'CONSULTAS JUDICIAIS DE HOJE' },
    { source: source1, kind: 'ATTACHMENT', text: `Página 1 - processo ${cnj1}` },
    { source: source1, kind: 'ATTACHMENT', text: `Página 2 - referência histórica ${cnj3}` },
    { source: source2, kind: 'ATTACHMENT', text: `Página 1 - processo ${cnj2}` },
    { source: 'Resumo', kind: 'SUMMARY', text: `${cnj1} ${cnj2} ${cnj3}` },
  ]);
  assert.equal(result.structuralCandidate, true);
  assert.equal(result.rule, 'B2_SEPARATED_ATTACHMENTS_AUXILIARY_EXTRAS');
  assert.deepEqual(new Set(result.targetCnjs), new Set([cnj1, cnj2]));
  assert.deepEqual(result.auxiliaryCnjs, [cnj3]);
});

test('B2 conectado aceita CNJ relacionado dentro do PDF quando há marcador jurídico próximo', () => {
  const source = `SENTENÇA - ${connected1}.pdf`;
  const result = run([
    { source: 'Assunto', kind: 'SUBJECT', text: `SENTENÇA - ${connected1}` },
    { source, kind: 'ATTACHMENT', text: `Processo principal ${connected1}. Embargos vinculados ao processo principal ${connected2}.` },
    { source: 'Resumo', kind: 'SUMMARY', text: `${connected1} ${connected2}` },
  ]);
  assert.equal(result.structuralCandidate, true);
  assert.equal(result.rule, 'B2_CONNECTED_REFERENCE_EXPLICIT');
  assert.deepEqual(new Set(result.targetCnjs), new Set([connected1, connected2]));
});

test('B2 rejeita PDF sem CNJ no nome quando o mesmo arquivo contém múltiplos CNJs', () => {
  const result = run([
    { source: 'documento-generico.pdf', kind: 'ATTACHMENT', text: `${cnj1}` },
    { source: 'documento-generico.pdf', kind: 'ATTACHMENT', text: `${cnj2}` },
  ]);
  assert.equal(result.structuralCandidate, false);
  assert.match(result.reason, /múltiplos CNJs/i);
});
