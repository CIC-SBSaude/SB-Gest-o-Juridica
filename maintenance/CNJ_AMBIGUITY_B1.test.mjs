import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSubjectDominantB1 } from '../server/services/cnjAmbiguityB1Service.ts';
import { summarizeDocumentIdentification } from '../server/services/documentIdentificationService.ts';

const target = '0000625-68.2024.5.05.0021';
const secondary = '0000762-41.2024.5.05.0024';

function analysis(blocks) {
  return summarizeDocumentIdentification(blocks);
}

test('B1 aceita um CNJ dominante no assunto com secundário apenas no corpo', () => {
  const result = selectSubjectDominantB1(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: `Sentença - Processo ${target}` },
    { source: 'Corpo', kind: 'BODY', text: `Histórico anterior: ${secondary}` },
  ]));
  assert.equal(result.cnj, target);
  assert.equal(result.rule, 'SUBJECT_DOMINANT_AUXILIARY_ONLY');
  assert.deepEqual(result.secondaryCnjs, [secondary]);
});

test('B1 aceita anexo compatível com o CNJ dominante', () => {
  const result = selectSubjectDominantB1(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: target },
    { source: 'guia.pdf', kind: 'ATTACHMENT', text: target },
    { source: 'Corpo', kind: 'BODY', text: secondary },
  ]));
  assert.equal(result.cnj, target);
  assert.deepEqual(result.attachmentCnjs, [target]);
});

test('B1 aceita anexo neutro sem CNJ', () => {
  const result = selectSubjectDominantB1(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: target },
    { source: 'comprovante.pdf', kind: 'ATTACHMENT', text: 'Documento sem número de processo.' },
    { source: 'Resumo', kind: 'SUMMARY', text: secondary },
  ]));
  assert.equal(result.cnj, target);
});

test('B1 rejeita CNJ secundário sustentado por anexo', () => {
  const result = selectSubjectDominantB1(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: target },
    { source: 'outro.pdf', kind: 'ATTACHMENT', text: secondary },
  ]));
  assert.equal(result.cnj, null);
  assert.match(result.reason, /anexo/i);
});

test('B1 rejeita dois CNJs no assunto', () => {
  const result = selectSubjectDominantB1(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: `${target} e ${secondary}` },
  ]));
  assert.equal(result.cnj, null);
  assert.match(result.reason, /exatamente um CNJ/i);
});

test('B1 rejeita CNJ secundário em fonte UNKNOWN', () => {
  const result = selectSubjectDominantB1(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: target },
    { source: 'Trecho', kind: 'UNKNOWN', text: secondary },
  ]));
  assert.equal(result.cnj, null);
  assert.match(result.reason, /fonte não auxiliar/i);
});

test('B1 rejeita CNJ inválido persistido', () => {
  const result = selectSubjectDominantB1(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: target },
    { source: 'Corpo', kind: 'BODY', text: `${secondary} 0000000-00.0000.0.00.0000` },
  ]));
  assert.equal(result.cnj, null);
  assert.match(result.reason, /DV inválido/i);
});

test('B1 não trata exceção com apenas um CNJ como caso B1', () => {
  const result = selectSubjectDominantB1(analysis([
    { source: 'Assunto', kind: 'SUBJECT', text: target },
  ]));
  assert.equal(result.cnj, null);
  assert.match(result.reason, /pelo menos dois CNJs/i);
});
