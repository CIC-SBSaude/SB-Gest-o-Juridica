import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProcessRole, resolveOrphanProcessCompany, buildContextualCompanyAssociations } from '../server/services/companyResolutionService.ts';
test('favorecido não se torna parte por presença no cadastro genérico', () => {
  const r = classifyProcessRole('HUB HEALTH LTDA', 'nome Favorecido:HUB HEALTH', [{nome:'HUB HEALTH LTDA',tipo:'PARTE_IDENTIFICADA'}], 'IRINEIA X SAUDE BRASIL LTDA');
  assert.equal(r.processRole, 'FAVORECIDO_FINANCEIRO');
});
test('papel tipado identifica parte sem depender do comprovante', () => {
  assert.equal(classifyProcessRole('TESTE LTDA', '', [{nome:'TESTE LTDA',tipo:'REU'}], '').processRole, 'PARTE_INDICADA');
});
test('resumo exige nome completo sem trocar empresas parecidas', () => {
  assert.equal(classifyProcessRole('SAUDE BRASIL LTDA', '', [], 'MARIA X SAUDE BRASIL LTDA').processRole, 'PARTE_INDICADA');
  assert.equal(classifyProcessRole('SAUDE BRASIL GESTAO LTDA', '', [], 'MARIA X SAUDE BRASIL LTDA').processRole, 'NAO_DETERMINADO');
});
test('abreviação não escolhe a primeira entre duas empresas', () => {
  const [r] = buildContextualCompanyAssociations(['HUB HEALTH ADMINISTRADORA LTDA','HUB HEALTH SERVICOS LTDA'], [{field:'cnpj',value:'46.316.638/0001-37',excerpt:'nome Favorecido:HUB HEALTH\ndocumento favorecido:46.316.638/0001-37'}]);
  assert.equal(r.name,'HUB HEALTH');
});
test('piloto limpa sugestões e não vincula favorecido a empresa existente', async () => {
  const writes=[];
  const rows={process_evidence:[{field_name:'cnpj',extracted_value:'46.316.638/0001-37',confidence:.91,evidence_excerpt:'nome Favorecido:HUB HEALTH\ndocumento favorecido:46.316.638/0001-37'}],process_parties:[{nome:'HUB HEALTH LTDA',tipo:'PARTE_IDENTIFICADA'}],processes:{objeto_demanda:'MARIA X SAUDE BRASIL LTDA'},company_resolution_candidates:{id:'candidate'},companies:[{id:'company',cnpj:'46316638000137'}]};
  const db={from(table){let write=false;return {select(){return this},eq(){return this},order(){return this},limit(){return this},maybeSingle(){return this},single(){return this},update(v){write=true;writes.push({table,value:v});return this},insert(v){write=true;writes.push({table,value:v});return this},then(resolve){return Promise.resolve({data:write?{id:'candidate'}:rows[table],error:null}).then(resolve)}}}};
  const result=await resolveOrphanProcessCompany(db,'process','actor');
  assert.equal(result.companyId,null);
  assert.equal(result.method,'AGUARDANDO_CONFIRMACAO');
  const candidate=writes.find(w=>w.table==='company_resolution_candidates').value;
  assert.equal(candidate.suggested_name,null);
  assert.equal(candidate.suggested_cnpj,null);
  assert.equal(candidate.evidence[0].contextualAssociations[0].processRole,'FAVORECIDO_FINANCEIRO');
  assert.ok(!writes.some(w=>w.table==='companies'||w.table==='processes'));
});
