import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

const execute = promisify(execFile);
let active = false;

// OCR initialization and native/WASM worker failures stay outside the web server.
export async function recognizeIsolated(content: Buffer, options: {
  timeoutMs?: number; workerPath?: string;
} = {}): Promise<{ text: string; confidence: number }> {
  if (active) throw new Error('OCR_BUSY: processamento de outra imagem em andamento');
  active = true;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(path.join(os.tmpdir(), 'sb-ocr-'));
    const input = path.join(directory, 'image');
    await writeFile(input, content);
    let workerPath = options.workerPath;
    if (!workerPath) {
      workerPath = path.resolve('server/workers/ocrWorker.cjs');
      try { await access(workerPath); }
      catch { workerPath = path.resolve('dist/ocrWorker.cjs'); }
    }
    const { stdout } = await execute(process.execPath, [workerPath, input, directory], {
      timeout: options.timeoutMs ?? 18_000,
      killSignal: 'SIGKILL',
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    const result = JSON.parse(stdout);
    if (typeof result.text !== 'string' || !Number.isFinite(result.confidence)) {
      throw new Error('OCR_INVALID_RESULT');
    }
    return result;
  } catch (error: any) {
    if (error?.killed) throw new Error('OCR_PAGE_TIMEOUT');
    // Do not include child output, which could contain document text.
    throw new Error(`OCR_ERROR: ${error?.code || 'worker indisponível ou resultado inválido'}`);
  } finally {
    try { if (directory) await rm(directory, { recursive: true, force: true }); }
    finally { active = false; }
  }
}
