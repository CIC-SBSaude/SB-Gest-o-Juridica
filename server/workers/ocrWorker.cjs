const { copyFile } = require('node:fs/promises');
const path = require('node:path');

// Exit only this disposable process on Tesseract initialization errors.
const fail = () => process.exit(1);
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

(async () => {
  const { createWorker } = require('tesseract.js');
  const [input, directory] = process.argv.slice(2);
  for (const language of ['por', 'eng']) {
    const data = require.resolve(`@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`);
    await copyFile(data, path.join(directory, `${language}.traineddata.gz`));
  }
  const worker = await createWorker(['por', 'eng'], 1, {
    langPath: directory,
    gzip: true,
    cacheMethod: 'none',
    logger: () => {},
    errorHandler: fail,
  });
  const result = await worker.recognize(input);
  await worker.terminate();
  process.stdout.write(JSON.stringify({
    text: String(result.data?.text || ''),
    confidence: Number(result.data?.confidence || 0),
  }), () => process.exit(0));
})().catch(fail);
