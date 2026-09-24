import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolveCompanyForProcess, looksCorporateName, confirmCompanyResolutionCandidate } from '../server/services/companyResolutionService.ts';

function database(rows = {}) {
  const writes = [];
  return { writes, from(table) {
    let action = 'select';
    const query = {
      select() { return this; }, eq() { return this; }, in() { return this; },
      insert(value) { action = 'insert'; writes.push({ table, action, value }); return this; },
      update(value) { action = 'update'; writes.push({ table, action, value }); return this; },
      single() { return this; }, maybeSingle() { return this; },
      then(resolve) { return Promise.resolve({ data: action === 'select' ? (rows[table] ?? null) : { id: 'candidate' }, error: null }).then(resolve); }
    };
    return query;
  } };
}
const personalNames = ['Isadora Souza', 'MARCOS VINICIUS DE HOLANDA BEZERRA.', 'BENÍCIO CARVALHO BARRETO BRANDÃO', 'ENZO MIGUEL LOPES DE LIMA'];
for (const name of personalNames) test(`CSV: ${name} não entra na fila`, async () => {
  const db = database();
  const result = await resolveCompanyForProcess(db, { processId: 'p', names: [name] });
  assert.equal(result.method, 'NAO_RESOLVIDO');
  assert.ok(!db.writes.some(w => w.table === 'companies' || (w.table === 'company_resolution_candidates' && w.action === 'insert')));
  assert.ok(db.writes.some(w => w.value.status === 'REJEITADO'));
});
test('DOC VIDA permanece para confirmação', async () => {
  const db = database();
  const r = await resolveCompanyForProcess(db, { processId: 'p', names: ['DOC VIDA CONSULTORIOS MEDICOS LTDA'] });
  assert.equal(r.method, 'AGUARDANDO_CONFIRMACAO');
  assert.ok(db.writes.find(w => w.value.status === 'PENDENTE').value.evidence.length);
});
test('nome + CNPJ válido desconectados não autocadastram', async () => {
  const db = database();
  const r = await resolveCompanyForProcess(db, { processId: 'p', names: ['DOC VIDA CONSULTORIOS MEDICOS LTDA', ...personalNames], cnpjs: ['11.222.333/0001-81'] });
  assert.equal(r.method, 'AGUARDANDO_CONFIRMACAO');
  assert.ok(!db.writes.some(w => w.table === 'companies'));
  assert.deepEqual(db.writes.find(w => w.value.status === 'PENDENTE').value.candidate_names, ['DOC VIDA CONSULTORIOS MEDICOS LTDA']);
});
test('CNPJ inválido e pessoa não geram candidato', async () => {
  const r = await resolveCompanyForProcess(database(), { processId: 'p', names: personalNames, cnpjs: ['11.111.111/1111-11', '11222333000182'] });
  assert.equal(r.method, 'NAO_RESOLVIDO');
});
test('CNPJ exato único preserva vínculo', async () => {
  const r = await resolveCompanyForProcess(database({ companies: [{ id:'c', nome:'TESTE LTDA', cnpj:'11222333000181' }] }), { processId:'p', cnpjs:['11222333000181'] });
  assert.equal(r.companyId, 'c');
  assert.equal(r.method, 'CNPJ_EXATO');
});
test('múltiplos CNPJs não escolhem o único cadastro encontrado', async () => {
  const r = await resolveCompanyForProcess(database({ companies: [{ id:'c', nome:'TESTE LTDA', cnpj:'11222333000181' }] }), { processId:'p', cnpjs:['11222333000181', '04252011000110'] });
  assert.equal(r.companyId, null);
  assert.equal(r.method, 'AGUARDANDO_CONFIRMACAO');
});
test('nome exato corporativo preservado', async () => {
  const r = await resolveCompanyForProcess(database({ companies:[{id:'c',nome:'TESTE LTDA'}] }), {processId:'p', names:['Teste Ltda']});
  assert.equal(r.method, 'NOME_EXATO');
});
test('confirmação não converte candidato PF legado em empresa', async () => {
  const db = database({company_resolution_candidates:{id:'x',status:'PENDENTE',suggested_name:'Isadora Souza'}});
  await assert.rejects(confirmCompanyResolutionCandidate(db,{candidateId:'x',actorId:'a'}), /razão social/);
  assert.equal(db.writes.length,0);
});
test('sobrenome Sá não basta para PJ', () => assert.equal(looksCorporateName('MARIA DE SÁ'),false));

function pilot() {
  const source = stripTypeScriptTypes(readFileSync(new URL('../server/routes/companyResolution.ts', import.meta.url), 'utf8'));
  const route = source.slice(source.indexOf("router.post('/reprocess-orphans'"), source.indexOf('export default router;'));
  let handler;
  let processed = 0;
  const query = { select(){return this;}, in(){return this;}, is(){return this;}, order(){return Promise.resolve({data:[{id:'00000000-0000-0000-0000-000000000001'}],error:null});} };
  new Function('router','canManage','getBackendSupabase','resolveOrphanProcessCompany', route)(
    {post(path, fn){handler=fn;}}, req=>req.user.role==='ADMIN', ()=>({from(){return query;}}),
    async()=>{processed++;return {companyId:null,method:'NAO_RESOLVIDO'};}
  );
  return { async call(body, role='ADMIN') {
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    await handler({body,user:{role,id:'actor'}},res);
    return {...res,processed};
  }};
}
const pilotId='00000000-0000-0000-0000-000000000001';
test('piloto: prévia não processa', async()=>{
  const r=await pilot().call({processIds:[pilotId]});
  assert.equal(r.body.dryRun,true); assert.equal(r.processed,0);
});
test('piloto: rejeita chamada antiga, duplicados e mais de dez',async()=>{
  for(const body of [{limit:100},{processIds:[pilotId,pilotId]},{processIds:Array(11).fill(pilotId)},{processIds:['invalid']}]) {
    const r=await pilot().call(body); assert.equal(r.statusCode,400); assert.equal(r.processed,0);
  }
});
test('piloto: exige perfil autorizado',async()=>{
  assert.equal((await pilot().call({processIds:[pilotId],execute:true},'USER')).statusCode,403);
});
test('piloto: execução explícita processa seleção',async()=>{
  const r=await pilot().call({processIds:[pilotId],execute:true});
  assert.equal(r.body.scanned,1); assert.equal(r.processed,1);
});
