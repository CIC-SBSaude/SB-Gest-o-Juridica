import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('módulo Diagnóstico Técnico: rota existe e restringe acesso a ADMIN', () => {
  const route = read('server/routes/technicalDiagnosticAdmin.ts');
  assert.match(route, /requireAuth/);
  assert.match(route, /userRole !== 'ADMIN'/);
  assert.match(route, /status\(403\)/);
  assert.match(route, /runTechnicalDiagnostic\(\)/);
});

test('módulo Diagnóstico Técnico: montado no server.ts', () => {
  const server = read('server.ts');
  assert.match(server, /technicalDiagnosticAdminRoutes/);
  assert.match(server, /app\.use\('\/api\/admin\/diagnostico'/);
});

test('módulo Diagnóstico Técnico: consultas estritamente read-only sem alteração ou liberação de lock', () => {
  const service = read('server/services/technicalDiagnosticService.ts');
  // Não executa operações de escrita no banco
  assert.doesNotMatch(service, /\.insert\(/);
  assert.doesNotMatch(service, /\.update\(/);
  assert.doesNotMatch(service, /\.delete\(/);
  assert.doesNotMatch(service, /release_automation_lock/);
  // Usa cliente backend seguro
  assert.match(service, /getBackendSupabase/);
  // Classifica em OK, ALERTA e CRITICO
  assert.match(service, /'OK'/);
  assert.match(service, /'ALERTA'/);
  assert.match(service, /'CRITICO'/);
});

test('módulo Diagnóstico Técnico: interface frontend possui exportação, cópia e exibição de data/hora', () => {
  const page = read('src/pages/admin/TechnicalDiagnosticPage.tsx');
  assert.match(page, /btn-copy-diagnostic-json/);
  assert.match(page, /btn-export-diagnostic-json/);
  assert.match(page, /btn-refresh-diagnostic/);
  assert.match(page, /formattedDate/);
  assert.match(page, /report\.durationMs/);
  assert.match(page, /ADMIN/);
});

test('módulo Diagnóstico Técnico: integrado no menu Sidebar e AppRouter', () => {
  const sidebar = read('src/components/layout/Sidebar.tsx');
  assert.match(sidebar, /nav-diagnostico/);
  assert.match(sidebar, /\/admin\/diagnostico/);

  const app = read('src/App.tsx');
  assert.match(app, /TechnicalDiagnosticPage/);
  assert.match(app, /path="\/admin\/diagnostico"/);
});


test('diagnóstico distingue capacidade, quota e circuit breaker sem tratar company_id/timeline legados como falha absoluta', () => {
  const service = read('server/services/technicalDiagnosticService.ts');
  assert.match(service, /Capacidade do Roteador Gemini/);
  assert.match(service, /routerQuotaOnlyUnavailable/);
  assert.match(service, /company_id pode ser nulo/);
  assert.match(service, /legado pode não possuir evento inicial/);
  assert.doesNotMatch(service, /label: 'Processos sem Empresa Vinculada'[\s\S]{0,250}expected: '0 processos'/);
});

test('tela de IA explicita janela Pacific, estado por modelo e limitação do contador local', () => {
  const page = read('src/pages/admin/AiUsagePage.tsx');
  assert.match(page, /Dia de quota do provedor \(Pacific Time\)/);
  assert.match(page, /Capacidade por Modelo/);
  assert.match(page, /counterDisclaimer/);
  assert.match(page, /quotaExhaustedAt/);
  assert.match(page, /lastSuccessAt/);
});
