import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('OCR não carrega renderer nativo capaz de abortar o processo', () => {

  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies?.['@embedpdf/pdfium'] !== undefined, true, 'pdfium is required');

  const service = read('server/services/attachmentExtractionService.ts');
  assert.equal(pkg.dependencies?.['@napi-rs/canvas'], undefined);
  assert.equal(pkg.dependencies?.['pdfjs-dist'], undefined);
  assert.doesNotMatch(service, /@napi-rs\/canvas|pdfjs-dist/);
  assert.doesNotMatch(service, /pdftoppm/);
  assert.doesNotMatch(service, /POPPLER/);
});

test('servidor usa a porta 3000 exigida pela infraestrutura', () => {
  const server = read('server.ts');
  assert.match(server, /const PORT = (3000|ENV\.app\.port)/);
});

test('script de testes suporta imports TypeScript no Node 22', () => {
  const pkg = JSON.parse(read('package.json'));

  assert.match(pkg.scripts.test, /--import tsx|--experimental-strip-types/);
});

test('busca de obrigações em lote divide IDs em lotes (evita Bad Request por URL longa)', () => {
  const code = read('src/services/processesService.ts');
  assert.match(code, /CHUNK_SIZE/);
  assert.match(code, /uniqueIds\.slice\(i,\s*i\s*\+\s*CHUNK_SIZE\)/);
});
