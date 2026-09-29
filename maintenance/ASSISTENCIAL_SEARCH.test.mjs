import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

test('assistencial: rota de integração montada no server.ts', () => {
  const server = read('server.ts');
  assert.match(server, /import assistencialRoutes from '\.\/server\/routes\/assistencial'/);
  assert.match(server, /app\.use\('\/api\/assistencial', assistencialRoutes\)/);
});

test('assistencial: config de timeout e endpoint no env.ts', () => {
  const env = read('server/config/env.ts');
  assert.match(env, /assistencial: Object\.freeze\(\{/);
  assert.match(env, /timeoutMs: 4_000/);
});

test('assistencial: rota implementa sanitização de CPF e fallback de nome', () => {
  const route = read('server/routes/assistencial.ts');
  assert.match(route, /targetUrl\.searchParams\.set\(\s*'select'/);
  assert.match(route, /cleaned\.length >= 3/);
  assert.match(route, /cpf_normalizado\.ilike/);
});

test('assistencial: beneficiariesService tem métodos searchUnified e importFromAssistencial', () => {
  const svc = read('src/services/beneficiariesService.ts');
  assert.match(svc, /async searchUnified\(query: string\)/);
  assert.match(svc, /async searchAssistencial\(query: string\)/);
  assert.match(svc, /async importFromAssistencial\(/);
});

test('assistencial: ProcessBeneficiariesSection exibe badges de origem e dados de plano', () => {
  const comp = read('src/components/processes/ProcessBeneficiariesSection.tsx');
  assert.match(comp, /handleSelectUnified/);
  assert.match(comp, /Gestão Assistencial/);
  assert.match(comp, /Jurídico/);
  assert.match(comp, /Cart: \{p\.carteirinha\}/);
});
