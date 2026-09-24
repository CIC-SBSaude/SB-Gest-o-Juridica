import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await copyFile('server/workers/ocrWorker.cjs', 'dist/ocrWorker.cjs');

await copyFile('server/workers/pdfRasterWorker.mjs', 'dist/pdfRasterWorker.mjs');
