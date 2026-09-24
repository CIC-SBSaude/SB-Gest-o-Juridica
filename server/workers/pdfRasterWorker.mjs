import fs from 'node:fs';
import path from 'node:path';
import { init } from '@embedpdf/pdfium';
import { fileURLToPath } from 'node:url';

const MAX_PAGES = parseInt(process.env.PDF_OCR_MAX_PAGES || '2', 10);
const RESOLUTION_MULTIPLIER = 150 / 72;

(async () => {
  const [pdfPath] = process.argv.slice(2);
  if (!pdfPath) {
    console.error('Caminho do PDF não fornecido');
    process.exit(1);
  }

  let pdfData;
  try {
    pdfData = fs.readFileSync(pdfPath);
  } catch (err) {
    console.error(`Falha ao ler PDF: ${err.message}`);
    process.exit(1);
  }

  // Load local WASM
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  let wasmBinary;
  try {
    // Try node_modules relative to worker
    wasmBinary = fs.readFileSync(path.join(__dirname, '../../node_modules/@embedpdf/pdfium/dist/pdfium.wasm'));
  } catch (e) {
    try {
      // Try root node_modules
      wasmBinary = fs.readFileSync(path.resolve(process.cwd(), 'node_modules/@embedpdf/pdfium/dist/pdfium.wasm'));
    } catch (e2) {
      console.error('WASM não encontrado localmente');
      process.exit(1);
    }
  }

  const m = await init({ wasmBinary });
  m.FPDF_InitLibrary();

  let dataPtr;
  let doc;
  const pagesData = [];

  try {
    dataPtr = m.pdfium._malloc(pdfData.length);
    m.pdfium.HEAPU8.set(pdfData, dataPtr);

    doc = m.FPDF_LoadMemDocument(dataPtr, pdfData.length, null);
    if (!doc) {
      throw new Error('Falha ao carregar documento no PDFium');
    }

    const pageCount = m.FPDF_GetPageCount(doc);
    const pagesToRender = Math.min(pageCount, MAX_PAGES);

    for (let i = 0; i < pagesToRender; i++) {
      const page = m.FPDF_LoadPage(doc, i);
      if (!page) continue;

      let bitmap;
      try {
        const width = Math.ceil(m.FPDF_GetPageWidth(page) * RESOLUTION_MULTIPLIER);
        const height = Math.ceil(m.FPDF_GetPageHeight(page) * RESOLUTION_MULTIPLIER);

        const FPDFBitmap_BGRA = 4;
        bitmap = m.FPDFBitmap_CreateEx(width, height, FPDFBitmap_BGRA, 0, 0);
        if (!bitmap) throw new Error('Falha ao criar bitmap');

        m.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xFFFFFFFF);
        
        // FPDF_ANNOT = 0x01
        m.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, 0x01);

        const bufferPtr = m.FPDFBitmap_GetBuffer(bitmap);
        const stride = m.FPDFBitmap_GetStride(bitmap);
        const size = stride * height;

        // Copy bytes before destroying WASM object
        const pixels = Buffer.from(new Uint8Array(m.pdfium.HEAPU8.buffer, bufferPtr, size));

        // Create BMP 32-bit
        const fileSize = 54 + size;
        const bmp = Buffer.alloc(fileSize);

        bmp.write('BM', 0);
        bmp.writeUInt32LE(fileSize, 2);
        bmp.writeUInt32LE(0, 6);
        bmp.writeUInt32LE(54, 10);

        bmp.writeUInt32LE(40, 14); // Header size
        bmp.writeUInt32LE(width, 18);
        bmp.writeInt32LE(-height, 22); // Top-down
        bmp.writeUInt16LE(1, 26);
        bmp.writeUInt16LE(32, 28);
        bmp.writeUInt32LE(0, 30); // BI_RGB
        bmp.writeUInt32LE(size, 34);
        bmp.writeInt32LE(5905, 38); // 150 DPI
        bmp.writeInt32LE(5905, 42);
        bmp.writeUInt32LE(0, 46);
        bmp.writeUInt32LE(0, 50);

        pixels.copy(bmp, 54);
        pagesData.push({ page: i + 1, width, height, data: bmp.toString('base64') });
      } finally {
        if (bitmap) m.FPDFBitmap_Destroy(bitmap);
        m.FPDF_ClosePage(page);
      }
    }
  } finally {
    if (doc) m.FPDF_CloseDocument(doc);
    if (dataPtr) m.pdfium._free(dataPtr);
    m.FPDF_DestroyLibrary();
  }

  process.stdout.write(JSON.stringify(pagesData), () => process.exit(0));
})().catch(err => {
  console.error(`Erro inesperado: ${err.message}`);
  process.exit(1);
});

// Ensure we don't accidentally delete the catch handler's process.exit(1)
