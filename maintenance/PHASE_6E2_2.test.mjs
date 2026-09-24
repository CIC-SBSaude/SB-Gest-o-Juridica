import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCorporateName } from '../server/services/companyResolutionService.ts';
test('remove somente resíduos finais conhecidos', () => {
 assert.equal(cleanCorporateName('HUB HEALTH LTDA Razão Social'), 'HUB HEALTH LTDA');
 assert.equal(cleanCorporateName('HUB HEALTH LTDA CPF'), 'HUB HEALTH LTDA');
 assert.equal(cleanCorporateName('SAÚDE BRASIL LTDA.'), 'SAÚDE BRASIL LTDA');
 assert.equal(cleanCorporateName('CLINICA CPF SERVICOS LTDA'), 'CLINICA CPF SERVICOS LTDA');
});
