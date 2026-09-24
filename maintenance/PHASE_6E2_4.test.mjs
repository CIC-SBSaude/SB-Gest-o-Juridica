import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextualCompanyAssociations } from '../server/services/companyResolutionService.ts';

test('separa prestador listado em rede credenciada', () => {
  const [item] = buildContextualCompanyAssociations([], [{
    field: 'cnpj', value: '08.979.072/0003-04', confidence: .91,
    excerpt: 'SAUDE BRASIL LTDA - CNPJ: 28.633.372/0001-74 Rede Credenciada PRONTO ANALISE LTDA ( CNPJ: 08.979.072/0003-04) - Laboratório'
  }]);
  assert.equal(item.classification, 'PROVIDER_DIRECTORY');
});

test('separa prestador pelo formato da listagem quando o título ficou fora do trecho', () => {
  const [item] = buildContextualCompanyAssociations([], [{
    field: 'cnpj', value: '12.181.962/0001-73', confidence: .91,
    excerpt: 'GURI GRUPO DE URGENCIA E RECUPERACAO INFANTIL ( CNPJ: 12.181.962/0001-73) - Clínica CLINICA GURI'
  }]);
  assert.equal(item.classification, 'PROVIDER_DIRECTORY');
});

test('não descarta o CNPJ principal que antecede a lista da rede', () => {
  const [item] = buildContextualCompanyAssociations(['SAUDE BRASIL ASSISTENCIA MEDICA LTDA'], [{
    field: 'cnpj', value: '28.633.372/0001-74', confidence: .91,
    excerpt: 'SAUDE BRASIL ASSISTENCIA MEDICA LTDA - CNPJ: 28.633.372/0001-74 Rede Credenciada PRONTO ANALISE LTDA'
  }]);
  assert.equal(item.classification, 'STRONG_PAIR');
  assert.equal(item.name, 'SAUDE BRASIL ASSISTENCIA MEDICA LTDA');
});

test('reconhece nome e CNPJ no mesmo contexto mesmo com palavras coladas', () => {
  const [item] = buildContextualCompanyAssociations(['HUB HEALTH ADMINISTRADORA DE BENEFICIOS LTDA'], [{
    field: 'cnpj', value: '46.316.638/0001-37', confidence: .91,
    excerpt: 'ESTIPULANTE HUBHEALTH ADMINISTRADORA DE BENEFÍCIOS, inscrita no CNPJ nº 46.316.638/0001-37'
  }]);
  assert.equal(item.classification, 'STRONG_PAIR');
});

test('usa rótulo Empresa como contexto qualificado', () => {
  const [item] = buildContextualCompanyAssociations([], [{
    field: 'cnpj', value: '52.891.503/0001-06', confidence: .76,
    excerpt: 'Dados da conta\nCNPJ 52.891.503/0001-06\nEmpresa SAUDE BRASIL SERVICOS EM SAUDE\nTipo de ordem VALOR'
  }]);
  assert.equal(item.classification, 'STRONG_PAIR');
  assert.equal(item.name, 'SAUDE BRASIL SERVICOS EM SAUDE');
});

test('CNPJ sem nome ou rótulo permanece sem pareamento', () => {
  const [item] = buildContextualCompanyAssociations([], [{
    field: 'cnpj', value: '59.762.887/0001-06', confidence: .91,
    excerpt: 'Pessoa Jurídica de Direito Privado, inscrita no CNPJ: 59.762.887/0001-06'
  }]);
  assert.equal(item.classification, 'UNPAIRED');
});

test('pareia nome e documento do favorecido e expande para a razão social qualificada', () => {
  const [item] = buildContextualCompanyAssociations(['HUB HEALTH ADMINISTRADORA DE BENEFICIOS LTDA Razão Social'], [{
    field: 'cnpj', value: '46.316.638/0001-37', confidence: .91,
    excerpt: 'abatimento:R$ 0,00\nnome Favorecido:HUB HEALTH\ndocumento favorecido:46.316.638/0001-37\ninstituição Favorecido:CCLA DE PERNAMBUCO'
  }]);
  assert.equal(item.classification, 'STRONG_PAIR');
  assert.equal(item.name, 'HUB HEALTH ADMINISTRADORA DE BENEFICIOS LTDA');
});
