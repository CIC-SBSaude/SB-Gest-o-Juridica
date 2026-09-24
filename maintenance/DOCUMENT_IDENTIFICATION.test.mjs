import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBankProcessRows, summarizeDocumentIdentification, mergeStoredProcessNumbers } from '../server/services/documentIdentificationService.ts';
const text='Bloqueio Judicial BACENJUD Data limite transf.Nº ProcessoNº ProtocoloTipo naturezaSequencia desbloqueio/transferência 80198772920248050001202600774258010100000 Valor solicitado';
test('separa CNJ e protocolo bancário no layout real',()=>{
  const [r]=extractBankProcessRows(text);
  assert.equal(r.cnj,'8019877-29.2024.8.05.0001');
  assert.equal(r.bankProtocol,'202600774258010100000');
  assert.equal(r.valid,true);
});
test('DV inválido permanece sinalizado para revisão',()=>{
  const [r]=extractBankProcessRows(text.replace('801987729','801987730'));
  assert.equal(r.valid,false);
});
test('sequência sem cabeçalhos comprovados não é dividida',()=>{
  assert.deepEqual(extractBankProcessRows('Bloqueio judicial 80198772920248050001202600774258010100000'),[]);
  assert.deepEqual(extractBankProcessRows(text.replace('Nº ProcessoNº Protocolo','Referência')),[]);
});
test('número deslocado ou truncado não gera janela arbitrária de CNJ',()=>{
  assert.deepEqual(extractBankProcessRows(text.replace('80198772920248050001202600774258010100000','1801987729202480500012026007742580101000000')),[]);
  assert.deepEqual(extractBankProcessRows(text.replace('80198772920248050001202600774258010100000','80198772920248050001')),[]);
});
test('documentos de processos diferentes preservam origem e ambiguidade',()=>{
  const r=summarizeDocumentIdentification([{kind:'ATTACHMENT',source:'a.pdf',text},{kind:'ATTACHMENT',source:'b.pdf',text:text.replace('80198772920248050001','00020717420268260127')}]);
  assert.equal(r.disposition,'SEPARAR_POR_PROCESSO');
  assert.equal(r.documents[1].source,'b.pdf');
  assert.equal(r.documents[1].validCnjs[0],'0002071-74.2026.8.26.0127');
  assert.equal(r.requiresHumanReview,true);
});
test('cabeçalho bancário no corpo não vira evidência de anexo',()=>{
  const r=summarizeDocumentIdentification([{kind:'BODY',source:'corpo',text}]);
  assert.deepEqual(r.validCnjs,[]);
});
test('resumo antigo não é apagado ao recuperar comprovantes',()=>{
  const meta={legal_summary:{process_numbers:['0140121-55.2026.8.05.0001']},ai_evidence_blocks:[{kind:'ATTACHMENT',text}]};
  assert.deepEqual(mergeStoredProcessNumbers(meta),['0140121-55.2026.8.05.0001','8019877-29.2024.8.05.0001']);
  assert.equal(meta.legal_summary.process_numbers.length,1);
});
test('procedimento administrativo tem identificação própria sem virar CNJ',()=>{
  const r=summarizeDocumentIdentification([{kind:'SUBJECT',text:'Procedimento Preparatório nº 06.2026.00000493-9'}]);
  assert.equal(r.disposition,'REVISAR_PROCEDIMENTO_ADMINISTRATIVO');
  assert.deepEqual(r.validCnjs,[]);
});
test('um CNJ válido não apaga outro número inválido',()=>{
  const r=summarizeDocumentIdentification([{kind:'SUMMARY',text:'0140121-55.2026.8.05.0001 8012345-67.2025.8.05.0000'}]);
  assert.equal(r.disposition,'REVISAR_NUMERO_INVALIDO');
  assert.equal(r.invalidCnjs.length,1);
});
