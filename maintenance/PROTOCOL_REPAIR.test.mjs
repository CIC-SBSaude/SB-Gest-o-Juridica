import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { extractExternalProtocols, filterExternalProtocols } from '../server/services/protocolExtractionService.ts';
import { falseProtocolFromReason, previewFalseProtocolReview } from '../server/services/protocolReviewService.ts';

test('palavras que produziram as 29 exceções não geram protocolos', () => {
  for (const text of ['procedimento', 'procedimentos', 'processual', 'processuais', 'procedente', 'processoN', 'ProcessoNº 12345']) {
    assert.deepEqual(extractExternalProtocols(text), [], text);
  }
});
test('rótulos explícitos aceitam identificadores numéricos e alfanuméricos', () => {
  for (const [text,value] of [['Protocolo: 12345.','12345'],['Proc.12345','12345'],['protocolo nº ABC-12345/2026','ABC-12345/2026'],['Nº prot. 12345','12345'],['Protocolo número 98765','98765']]) {
    assert.deepEqual(extractExternalProtocols(text).map(r=>r.value),[value],text);
  }
});
test('texto sem dígitos, CNJ e identificador longo não viram protocolo', () => {
  for (const text of ['protocolo pendente','Proc. 0014515-30.2025.8.17.2810','Protocolo: '+ '1'.repeat(31)]) {
    assert.deepEqual(extractExternalProtocols(text),[],text);
  }
});
test('reanálise filtra resíduos legados sem modificar a entrada', () => {
  const input=['essoN','edimentos',null,12345,' 12345 ','12345','00145153020258172810'];
  assert.deepEqual(filterExternalProtocols(input),['12345']);
  assert.equal(input[4],' 12345 ');
});
test('escopo da revisão exige o defeito conhecido', () => {
  const reason=p=>`Foram encontrados 3 processos para o protocolo ${p}. Necessária revisão humana.`;
  assert.equal(falseProtocolFromReason(reason('essoN')),'essoN');
  assert.equal(falseProtocolFromReason(reason('ABC12345')),null);
  assert.equal(falseProtocolFromReason(reason('outrotexto')),null);
});
test('prévia limita dez casos, preserva vínculos e não grava dados', async () => {
  const exceptions=Array.from({length:29},(_,i)=>({id:String(i),processed_email_id:'e'+i,reason:'Foram encontrados 3 processos para o protocolo essoN. Necessária revisão humana.'}));
  let selected=[];
  const db={from(table){return {select(){return this},eq(){return this},neq(){return this},order(){return this},limit(){return this},in(k,ids){selected=ids;return this},then(resolve){return Promise.resolve({data:table==='email_exceptions'?exceptions:selected.map(id=>({id,status:'EXCECAO',process_id:id==='e0'?'existing':null,subject:'protocolo 12345',metadata:{legal_summary:{protocols:['essoN']}}})),error:null}).then(resolve)}}}};
  const result=await previewFalseProtocolReview(db);
  assert.equal(result.affectedInScan,29); assert.equal(result.cases.length,10);
  assert.equal(result.cases[0].reviewState,'PRESERVAR_VINCULO_EXISTENTE');
  assert.deepEqual(result.cases[0].protocolsInAvailableText,['12345']);
  assert.deepEqual(result.cases[0].protocolsInSavedSummary,[]);
  assert.equal(result.readOnly,true);
});
test('prévia comunica falha de consulta em vez de indicar zero casos', async () => {
  const db={from(){return {select(){return this},eq(){return this},neq(){return this},order(){return this},limit(){return Promise.resolve({error:{message:'permission denied'}})}}}};
  await assert.rejects(previewFalseProtocolReview(db),/permission denied/);
});
test('ambiguidade CNJ não faz busca por protocolo e dois protocolos não escolhem primeiro', async () => {
  const source=stripTypeScriptTypes(readFileSync(new URL('../server/services/legalInterpretationService.ts',import.meta.url),'utf8'));
  const part=source.slice(source.indexOf('  if (!exceptionType && cnjs.length > 0'),source.indexOf('  // Regra deliberada: IA'));
  const run=new Function('cnjs','protocols','exceptionType','supabaseClient',`return (async()=>{let processId=null,matchedProcessNumber=null,exceptionReason=null;${part};return {exceptionType,processId};})()`);
  const db={from(){throw Error('não deve consultar')}};
  assert.equal((await run(['cnj1','cnj2'],['12345'],'CNJ_MULTIPLO_AMBIGUO',db)).exceptionType,'CNJ_MULTIPLO_AMBIGUO');
  assert.equal((await run([],['12345','67890'],null,db)).exceptionType,'PROTOCOLO_MULTIPLO_AMBIGUO');
});
