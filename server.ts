import 'dotenv/config';

process.on('uncaughtException', (err: any) => {
  console.error('[SERVER UNCAUGHT EXCEPTION]', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[SERVER UNHANDLED REJECTION]', reason?.message || reason);
});

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import healthRoutes from './server/routes/health';
import authRoutes from './server/routes/auth';
import imapRoutes from './server/routes/imap';
import aiRoutes from './server/routes/ai';
import usersAdminRoutes from './server/routes/usersAdmin';
import companyResolutionRoutes from './server/routes/companyResolution';
import emailAccountAdminRoutes from './server/routes/emailAccountAdmin';
import demandBackfillAdminRoutes from './server/routes/demandBackfillAdmin';
import exceptionRepairRoutes from './server/routes/exceptionRepair';
import technicalDiagnosticAdminRoutes from './server/routes/technicalDiagnosticAdmin';
import processSanitizationAdminRoutes from './server/routes/processSanitizationAdmin';
import assistencialRoutes from './server/routes/assistencial';
import { startAutomationScheduler, stopAutomationScheduler } from './server/services/automationSchedulerService';
import { releaseAllOwnedAutomationLocks } from './server/services/automationLockService';
import { centralErrorHandler } from './server/middleware/errorHandler';
import { ENV, getSafeConfigReport, validateBackendConfig } from './server/config/env';

async function startServer() {
  const app = express();
  const PORT = ENV.app.port;

  const configIssues = validateBackendConfig();
  console.log('[CONFIG] inventário seguro', getSafeConfigReport());
  if (configIssues.length) console.warn('[CONFIG] pendências detectadas', configIssues);

  app.use(express.json());

  // Rotas de API sempre antes do SPA/Vite.
  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/admin/users', usersAdminRoutes);
  app.use('/api/company-resolution', companyResolutionRoutes);
  app.use('/api/admin/email-account', emailAccountAdminRoutes);
  app.use('/api/admin/demand-backfill', demandBackfillAdminRoutes);
  app.use('/api/admin/exception-repair', exceptionRepairRoutes);
  app.use('/api/admin/diagnostico', technicalDiagnosticAdminRoutes);
  app.use('/api/admin/sanitization', processSanitizationAdminRoutes);
  app.use('/api/assistencial', assistencialRoutes);
  app.use('/api/imap', (req, _res, next) => {
    if (req.path === '/sync' && req.method === 'POST') {
      console.log('[IMAP SYNC] request reached Express', { authorizationHeaderPresent: Boolean(req.headers.authorization) });
    }
    next();
  }, imapRoutes);

  // Nunca devolver index.html para rota /api inexistente.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found', method: req.method, path: req.path });
  });

  if (ENV.runtime.nodeEnv !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // AI Studio preview tem proxy WebSocket instável. HMR desligado evita
        // o erro recorrente "WebSocket closed without opened" sem afetar o build.
        hmr: ENV.app.disableHmr ? false : undefined,
        watch: ENV.app.disableHmr ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.use(centralErrorHandler);

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SB Gestão Jurídica] Servidor ativo em http://0.0.0.0:${PORT}`);
    startAutomationScheduler();
  });

  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('[SERVER] encerramento gracioso iniciado', { signal });
    stopAutomationScheduler();

    const forceExit = setTimeout(() => {
      console.warn('[SERVER] limite de encerramento atingido; finalizando processo.');
      process.exit(0);
    }, 8_000);
    forceExit.unref?.();

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      setTimeout(resolve, 2_500).unref?.();
    });

    try {
      const result = await releaseAllOwnedAutomationLocks(signal);
      console.log('[SERVER] locks da instância tratados no encerramento', result);
    } catch (err: any) {
      console.warn('[SERVER] falha ao liberar locks no encerramento; leases expirarão automaticamente', {
        error: err?.message || String(err),
      });
    }

    clearTimeout(forceExit);
    process.exit(0);
  };

  process.once('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => void gracefulShutdown('SIGINT'));

}

startServer();
