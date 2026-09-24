import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { buildContextualCompanyAssociations } from '../server/services/companyResolutionService.ts';
import { getOperationalDiagnostic } from '../server/services/operationalDiagnosticService.ts';

test('CNPJ principal não herda o papel de outro CNPJ listado como clínica', () => {
  const [r] = buildContextualCompanyAssociations([], [{field:'cnpj',value:'28633372000174',excerpt:'CNPJ 28.633.372/0001-74; GURI (CNPJ:12.181.962/0001-73) - Clínica'}]);
  assert.equal(r.classification, 'UNPAIRED');
});
test('duas empresas no trecho não escolhem o primeiro nome', () => {
  const [r] = buildContextualCompanyAssociations(['ALFA SERVICOS LTDA','BETA SERVICOS LTDA'], [{field:'cnpj',value:'28633372000174',excerpt:'ALFA SERVICOS LTDA e BETA SERVICOS LTDA CNPJ 28.633.372/0001-74'}]);
  assert.equal(r.classification, 'UNPAIRED');
});
test('palavras comuns não completam razão social truncada', () => {
  const [r] = buildContextualCompanyAssociations(['SAUDE BRASIL ASSISTENCIA MEDICA LTDA'], [{field:'cnpj',value:'28633372000174',excerpt:'ASSISTENCIA MEDICA LTDA CNPJ 28.633.372/0001-74'}]);
  assert.equal(r.classification, 'UNPAIRED');
});
test('um nome e dois CNPJs não comprovam pareamento', () => {
  const [r] = buildContextualCompanyAssociations(['ALFA SERVICOS LTDA'], [{field:'cnpj',value:'28633372000174',excerpt:'ALFA SERVICOS LTDA CNPJs 28.633.372/0001-74 e 46.316.638/0001-37'}]);
  assert.equal(r.classification, 'UNPAIRED');
});

const source = stripTypeScriptTypes(readFileSync(new URL('../server/services/aiDemandClassificationBackfillService.ts', import.meta.url), 'utf8'));
const evidenceFn = new Function(source.slice(source.indexOf('async function buildProcessEvidence'), source.indexOf('function normalizeToken')) + '; return buildProcessEvidence;')();
test('classificação consulta a tabela existente e não ignora falha de evidência', async () => {
  const seen=[];
  const db={from(table){seen.push(table);return {select(){return this},eq(){return this},order(){return this},limit(){return this},maybeSingle(){return this},then(resolve){return Promise.resolve(table==='process_evidence'?{error:{message:'permission denied'}}:{data:table==='processes'?{id:'p'}:[],error:null}).then(resolve)}}}};
  await assert.rejects(evidenceFn(db,'p'), /evidências: permission denied/);
  assert.ok(seen.includes('process_evidence'));
  assert.ok(!seen.includes('process_evidences'));
});

function worker(db, available, classify) {
  const code=source.slice(source.indexOf('async function runBackfillBatch'), source.indexOf('export async function runDemandClassificationBackfillWorker'));
  return new Function('getBackendSupabase','getAiRouterCapacityState','recoverStaleDemandClassification','classifyProcess','BATCH_SIZE','MAX_ATTEMPTS','nextRetryIso','sleep', code+';return runBackfillBatch;')(
    ()=>db, async()=>({available}), async()=>0, classify, 1, 3, ()=>new Date().toISOString(), async()=>{}
  );
}
test('fila sem capacidade não seleciona nem altera itens', async () => {
  const r=await worker({from(){throw Error('não deveria consultar fila')}},false,()=>{})();
  assert.equal(r.pausedByCapacity,true);
  assert.equal(r.processed,0);
});
test('perda da disputa pelo item não executa classificação', async () => {
  let called=false;
  const db={from(){let update=false;return {select(){return this},eq(){return this},or(){return this},order(){return this},limit(){return this},maybeSingle(){return this},update(){update=true;return this},then(resolve){return Promise.resolve({data:update?null:[{id:'q',process_id:'p'}],error:null}).then(resolve)}}}};
  const r=await worker(db,true,()=>{called=true})();
  assert.equal(called,false); assert.equal(r.processed,0);
});
test('capacidade perdida após claim preserva número de tentativas', async () => {
  const writes=[];
  const db={from(){let update=false;return {select(){return this},eq(){return this},or(){return this},order(){return this},limit(){return this},maybeSingle(){return this},update(v){update=true;writes.push(v);return this},then(resolve){return Promise.resolve({data:update?{id:'q'}:[{id:'q',process_id:'p',attempts:2}],error:null}).then(resolve)}}}};
  const r=await worker(db,true,async()=>{throw Object.assign(Error('sem capacidade'),{code:'AI_ROUTER_EXHAUSTED'})})();
  assert.equal(r.deferred,1);
  assert.equal(writes.at(-1).attempts,2); assert.equal(writes.at(-1).status,'PENDING');
});
test('diagnóstico mantém contagem zero e identifica seção indisponível', async () => {
  const db={from(table){return {select(){return this},eq(){return this},neq(){return this},is(){return this},order(){return this},limit(){return this},then(resolve){return Promise.resolve(table==='ai_model_health'?{error:{message:'indisponível'}}:{count:0,data:null,error:null}).then(resolve)}}}};
  const r=await getOperationalDiagnostic(db);
  assert.equal(r.sections.processos_total,0);
  assert.equal(r.sections.saude_modelos.error,'indisponível');
  assert.equal(r.readOnly,true);
});
