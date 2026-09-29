import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Requisitos.md — RF-01, RF-03, RF-04, RF-05: Validação da responsividade e estrutura da tela de Processos', async (t) => {
  const processesPagePath = path.resolve('src/pages/operation/ProcessesPage.tsx');
  const content = fs.readFileSync(processesPagePath, 'utf8');

  await t.test('RF-04: Apresenta cartões para tablet/celular e tabela para desktop', () => {
    // Mobile/tablet card container
    assert.match(content, /block\s+lg:hidden\s+divide-y\s+divide-slate-100/);
    // Desktop table container
    assert.match(content, /hidden\s+lg:block/);
    assert.match(content, /id="processes-table"/);
  });

  await t.test('RF-01: Não utiliza overflow-x-auto no contêiner da listagem que force rolagem horizontal', () => {
    // Contêiner principal da listagem não deve ter overflow-x-auto
    const tableSection = content.substring(content.indexOf('Tabela Corporativa de Processos'));
    assert.doesNotMatch(tableSection, /<div className="overflow-x-auto">/);
  });

  await t.test('RF-03: Filtros reorganizados com barra principal, painel expansível e contagem de ativos', () => {
    // Botão de alternar filtros avançados
    assert.match(content, /id="toggle-advanced-filters-btn"/);
    assert.match(content, /activeSecondaryFiltersCount/);
    assert.match(content, /showAdvancedFilters/);
  });

  await t.test('RF-03 & Critério 7: Chips de filtros ativos visíveis com remoção individual e limpar tudo', () => {
    assert.match(content, /activeFilters\.map/);
    assert.match(content, /Remover filtro/);
    assert.match(content, /handleClearAllFilters/);
    assert.match(content, />\s*Limpar todos\s*<\/button>/);
  });

  await t.test('RF-04 & RF-05: Cartão exibe rótulos explícitos e destaque para prazo, criticidade e status', () => {
    // Destaque de prazo e criticidade
    assert.match(content, /Prazo:/);
    assert.match(content, /Criticidade:/);
    // Rótulos explícitos de campos
    assert.match(content, />Autor<\/span>/);
    assert.match(content, />Empresa Vinculada<\/span>/);
    assert.match(content, />Responsável<\/span>/);
    // Ação evidente de abrir
    assert.match(content, /Abrir processo/);
  });

  await t.test('RF-06: Quebra de linhas em números de processo longos', () => {
    // break-all para CNJ
    assert.match(content, /break-all/);
  });

  await t.test('RNF-03: Acessibilidade com teclado em cartões e linhas da tabela', () => {
    // tabIndex, role button e handler Enter/Space
    assert.match(content, /tabIndex=\{0\}/);
    assert.match(content, /role="button"/);
    assert.match(content, /event\.key === 'Enter' \|\| event\.key === ' '/);
  });
});
