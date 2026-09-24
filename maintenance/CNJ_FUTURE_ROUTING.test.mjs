import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decideFutureCnjRouting } from '../server/services/cnjFutureRoutingService.ts';

const cnj1 = '0097757-68.2026.8.05.0001';
const cnj2 = '0098088-50.2026.8.05.0001';
const cnj3 = '0168148-19.2024.8.05.0001';
const b1Target = '0000625-68.2024.5.05.0021';
const b1Secondary = '0000762-41.2024.5.05.0024';

function attachment(filename, text) {
  return { filename, text, status: 'TEXT_EXTRACTED', confidence: 0.99, textLength: text.length, ocrUsed: false };
}

test('Intervenção 3: CNJ único segue SINGLE_PROCESS', () => {
  const decision = decideFutureCnjRouting({
    subject: `Sentença - ${b1Target}`,
    body: '',
    attachments: [],
    extractedCnjs: [b1Target],
  });
  assert.equal(decision?.mode, 'SINGLE_PROCESS');
  assert.deepEqual(decision?.targetCnjs, [b1Target]);
  assert.equal(decision?.rule, 'SINGLE_CNJ');
});

test('Intervenção 3: B1 converte assunto dominante em SINGLE_PROCESS e preserva auxiliar', () => {
  const decision = decideFutureCnjRouting({
    subject: `Sentença desfavorável - Processo ${b1Target}`,
    body: `Histórico de resposta anterior: ${b1Secondary}`,
    attachments: [attachment(`${b1Target}.pdf`, `Sentença do processo ${b1Target}`)],
    extractedCnjs: [b1Target, b1Secondary],
  });
  assert.equal(decision?.mode, 'SINGLE_PROCESS');
  assert.match(decision?.rule || '', /^B1_/);
  assert.deepEqual(decision?.targetCnjs, [b1Target]);
  assert.deepEqual(decision?.auxiliaryCnjs, [b1Secondary]);
});

test('Intervenção 3: B2 separa múltiplos anexos físicos em MULTI_PROCESS_DISTRIBUTION', () => {
  const decision = decideFutureCnjRouting({
    subject: 'CONSULTAS JUDICIAIS DE HOJE - PDPJ E DET',
    body: `Referência administrativa anterior: ${cnj3}`,
    attachments: [
      attachment(`CITAÇÃO - PROCESSO Nº ${cnj1}.pdf`, `Citação do processo ${cnj1}`),
      attachment(`CITAÇÃO - PROCESSO Nº ${cnj2}.pdf`, `Citação do processo ${cnj2}`),
    ],
    extractedCnjs: [cnj1, cnj2, cnj3],
  });
  assert.equal(decision?.mode, 'MULTI_PROCESS_DISTRIBUTION');
  assert.equal(decision?.rule, 'B2_SEPARATED_ATTACHMENTS_AUXILIARY_EXTRAS');
  assert.deepEqual(new Set(decision?.targetCnjs), new Set([cnj1, cnj2]));
  assert.deepEqual(decision?.auxiliaryCnjs, [cnj3]);
});

test('Intervenção 3: CNJ interno do mesmo PDF não vira alvo independente', () => {
  const decision = decideFutureCnjRouting({
    subject: 'CONSULTAS JUDICIAIS DE HOJE',
    body: '',
    attachments: [
      attachment(`CITAÇÃO - PROCESSO Nº ${cnj1}.pdf`, `${cnj1} referência histórica interna ${cnj3}`),
      attachment(`CITAÇÃO - PROCESSO Nº ${cnj2}.pdf`, cnj2),
    ],
    extractedCnjs: [cnj1, cnj2, cnj3],
  });
  assert.equal(decision?.mode, 'MULTI_PROCESS_DISTRIBUTION');
  assert.deepEqual(new Set(decision?.targetCnjs), new Set([cnj1, cnj2]));
  assert.deepEqual(decision?.auxiliaryCnjs, [cnj3]);
});

test('Intervenção 3: dois CNJs em pé de igualdade no assunto permanecem REVIEW_REQUIRED', () => {
  const decision = decideFutureCnjRouting({
    subject: `Processos ${b1Target} / ${b1Secondary}`,
    body: '',
    attachments: [],
    extractedCnjs: [b1Target, b1Secondary],
  });
  assert.equal(decision?.mode, 'REVIEW_REQUIRED');
  assert.equal(decision?.rule, 'CNJ_MULTIPLO_AMBIGUO');
});

test('Intervenção 3: PDF genérico único com múltiplos CNJs permanece REVIEW_REQUIRED', () => {
  const decision = decideFutureCnjRouting({
    subject: 'Documento judicial',
    body: '',
    attachments: [attachment('documento-generico.pdf', `${cnj1} ${cnj2}`)],
    extractedCnjs: [cnj1, cnj2],
  });
  assert.equal(decision?.mode, 'REVIEW_REQUIRED');
});

test('Intervenção 3: CNJ extraído sem rastreabilidade estrutural não é inferido por eliminação', () => {
  const rawOnly = '0001318-78.2025.5.05.0001';
  const decision = decideFutureCnjRouting({
    subject: `Processo ${b1Target}`,
    body: '',
    attachments: [],
    extractedCnjs: [b1Target, rawOnly],
  });
  assert.equal(decision?.mode, 'REVIEW_REQUIRED');
});

test('Intervenção 3: camada de aplicação possui caminho DISTRIBUTED e proíbe criação multiprocesso', () => {
  const source = readFileSync(new URL('../server/services/processApplicationService.ts', import.meta.url), 'utf8');
  assert.match(source, /action:\s*'DISTRIBUTED'/);
  assert.match(source, /Nenhum processo foi criado automaticamente/);
  assert.match(source, /MULTI_PROCESS_DISTRIBUTION/);
  assert.match(source, /processDistribution/);
});
