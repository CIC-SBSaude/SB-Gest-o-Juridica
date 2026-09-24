import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasUnambiguousDocumentSeparation, previewFalseProtocolRepair, executeFalseProtocolRepair } from '../server/services/falseProtocolRepairService.ts';
import { recoverStaleDemandClassification } from '../server/services/aiQueueRecoveryService.ts';

const cnj1='8019877-29.2024.8.05.0001';
const cnj2='0002071-74.2026.8.26.0127';
const reason='Foram encontrados 3 processos para o protocolo essoN. Necessária revisão humana.';
const attachment=(source,cnj)=>({kind:'ATTACHMENT',source,text:cnj});

test('exige separação de um CNJ por documento e cobertura de todos os números',()=>{
  assert.equal(hasUnambiguousDocumentSeparation([{kind:'ATTACHMENT',source:'a.pdf',validCnjs:[cnj1]},{kind:'ATTACHMENT',source:'b.pdf',validCnjs:[cnj2]}],[cnj1,cnj2]),true);
  assert.equal(hasUnambiguousDocumentSeparation([{kind:'ATTACHMENT',source:'a.pdf',validCnjs:[cnj1,cnj2]}],[cnj1,cnj2]),false);
  assert.equal(hasUnambiguousDocumentSeparation([{kind:'SUMMARY',source:'resumo',validCnjs:[cnj1]}],[cnj1]),false);
});

function dbFixture({ emailProcessId=null, duplicateProcess=false, emailUpdate=true, otherExceptions=0 }={}) {
  const writes=[];
  const exception={id:'11111111-1111-4111-8111-111111111111',processed_email_id:'e1',exception_type:'PROTOCOLO_MULTIPLO_AMBIGUO',reason,status:'ABERTA',updated_at:'x1'};
  const email={id:'e1',status:'EXCECAO',process_id:emailProcessId,matched_process_number:null,subject:'Teste',received_at:'2026-09-10T00:00:00Z',updated_at:'x2',metadata:{legal_summary:{process_numbers:[]},ai_evidence_blocks:[attachment('a.pdf',cnj1),attachment('b.pdf',cnj2)]}};
  const processes=[{id:'p1',numero_processo:cnj1},{id:'p2',numero_processo:cnj2},...(duplicateProcess?[{id:'p3',numero_processo:cnj2}]:[])];
  return {writes,from(table){let action='select',payload,filters=[]; const q={
    select(){return this},eq(k,v){filters.push([k,v]);return this},neq(k,v){filters.push(['neq:'+k,v]);return this},in(k,v){filters.push(['in:'+k,v]);return this},order(){return this},limit(){return this},lt(){return this},is(){return this},
    update(v){action='update';payload=v;writes.push({table,action,value:v});return this},insert(v){action='insert';payload=v;writes.push({table,action,value:v});return this},maybeSingle(){return this},
    then(resolve){let data=null,count=null,error=null;
      if(action==='select'&&table==='email_exceptions') data=[exception];
      if(action==='select'&&table==='processed_emails') data=[email];
      if(action==='select'&&table==='processes') data=processes;
      if(action==='select'&&['process_timeline','process_evidence'].includes(table)) data=[];
      if(action==='select'&&table==='email_exceptions'&&filters.some(f=>f[0]==='processed_email_id')) {data=null;count=otherExceptions;}
      if(action==='insert') data={id:'new'};
      if(action==='update'&&table==='processed_emails') data=emailUpdate?{id:'e1'}:null;
      if(action==='update'&&table==='email_exceptions') data={id:exception.id};
      if(action==='update'&&table==='ai_demand_classification_backfill_queue') data=[{id:'stale'}];
      return Promise.resolve({data,error,count}).then(resolve);
    }}; return q;}};
}

test('prévia permite somente processos únicos e documentos separados',async()=>{
  const preview=await previewFalseProtocolRepair(dbFixture());
  assert.equal(preview.selected,1); assert.equal(preview.executable,1); assert.equal(preview.totalExecutable,1);
  assert.deepEqual(preview.cases[0].processMatches.map(x=>x.processId),['p1','p2']);
  const duplicate=await previewFalseProtocolRepair(dbFixture({duplicateProcess:true}));
  assert.equal(duplicate.executable,0); assert.match(duplicate.cases[0].reason,/duplicado/);
});

test('decisão humana incompatível impede execução',async()=>{
  const preview=await previewFalseProtocolRepair(dbFixture({emailProcessId:'human-process'}));
  assert.equal(preview.executable,0); assert.match(preview.cases[0].reason,/decisão humana/);
});

test('execução idempotente grava distribuição antes de encerrar exceção',async()=>{
  const db=dbFixture();
  const result=await executeFalseProtocolRepair(db,[db.from ? '11111111-1111-4111-8111-111111111111' : ''], 'actor');
  assert.equal(result.resolved,1); assert.equal(result.errors,0);
  assert.equal(db.writes.filter(w=>w.table==='process_timeline'&&w.action==='insert').length,2);
  assert.equal(db.writes.filter(w=>w.table==='process_evidence'&&w.action==='insert').length,2);
  assert.ok(db.writes.filter(w=>w.table==='process_evidence'&&w.action==='insert').every(w=>w.value.source_type==='DOCUMENT'));
  const emailIndex=db.writes.findIndex(w=>w.table==='processed_emails'&&w.action==='update');
  const exceptionIndex=db.writes.findIndex(w=>w.table==='email_exceptions'&&w.action==='update');
  assert.ok(emailIndex>=0&&exceptionIndex>emailIndex);
  assert.equal(db.writes[emailIndex].value.process_id,undefined);
  assert.equal(db.writes[emailIndex].value.status,'PROCESSADO');
});

test('mudança concorrente do e-mail mantém exceção aberta',async()=>{
  const db=dbFixture({emailUpdate:false});
  const result=await executeFalseProtocolRepair(db,['11111111-1111-4111-8111-111111111111'],'actor');
  assert.equal(result.errors,1);
  assert.equal(db.writes.some(w=>w.table==='email_exceptions'&&w.action==='update'),false);
});

test('outra exceção aberta impede alteração do status geral do e-mail',async()=>{
  const db=dbFixture({otherExceptions:1});
  await executeFalseProtocolRepair(db,['11111111-1111-4111-8111-111111111111'],'actor');
  const emailWrite=db.writes.find(w=>w.table==='processed_emails'&&w.action==='update');
  assert.equal(emailWrite.value.status,undefined);
});

test('recuperação de item antigo não consome tentativas',async()=>{
  const db=dbFixture(); const recovered=await recoverStaleDemandClassification(db);
  assert.equal(recovered,1);
  const write=db.writes.find(w=>w.table==='ai_demand_classification_backfill_queue');
  assert.equal('attempts' in write.value,false); assert.equal(write.value.status,'PENDING');
  assert.equal(write.value.started_at,null);
});

test('rota exige confirmação explícita, limite dez e perfis de gestão',()=>{
  const source=readFileSync(new URL('../server/routes/exceptionRepair.ts',import.meta.url),'utf8');
  assert.match(source,/req\.body\?\.execute !== true/);
  assert.match(source,/ids\.length > 10/);
  assert.match(source,/ADMIN.*GESTOR/);
  assert.doesNotMatch(source,/ANALISTA/);
});
