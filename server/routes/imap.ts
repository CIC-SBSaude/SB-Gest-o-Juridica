import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { imapService } from '../services/imapService';
import { withAutomationLock } from '../services/automationLockService';
import { recoverStaleEmailProcessingRuns } from '../services/emailProcessingRunRecoveryService';

const router = Router();


router.post('/test', requireAuth, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'ADMIN' && userRole !== 'GESTOR') {
      return res.status(403).json({ ok: false, error: 'Acesso negado. Apenas ADMIN ou GESTOR podem testar a conexão IMAP.' });
    }

    const result = await imapService.testConnection();
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('IMAP Test Route Error:', error);
    return res.status(502).json({
      ok: false,
      error: error?.message || 'Falha ao conectar ao IMAP.',
      diagnostic: {
        responseStatus: error?.responseStatus ?? null,
        responseText: error?.responseText ?? null,
        serverResponseCode: error?.serverResponseCode ?? null,
        executedCommand: error?.executedCommand ?? null,
        authenticationFailed: Boolean(error?.authenticationFailed),
        authAttempts: error?.authAttempts ?? null,
      },
    });
  }
});

router.post('/sync', requireAuth, async (req, res) => {
  try {
    // Only ADMIN or GESTOR can trigger this
    // req.user is guaranteed by requireAuth
    const userRole = (req as any).user?.role;
    
    console.log(`[IMAP Route] user_id: ${(req as any).user?.id}, role analisada: ${userRole}`);
    
    if (userRole !== 'ADMIN' && userRole !== 'GESTOR') {
      console.log('[IMAP Route] decisão final de autorização: BLOQUEADO (403)');
      return res.status(403).json({ ok: false, error: 'Acesso negado. Apenas ADMIN ou GESTOR podem sincronizar emails.' });
    }
    
    console.log('[IMAP Route] decisão final de autorização: PERMITIDO, solicitando lock exclusivo...');

    // A sincronização manual passa pela mesma trava distribuída da automação.
    // Isso elimina concorrência manual x scheduler e permite reconciliar RUNNING
    // históricos com segurança antes de iniciar um novo ciclo.
    const locked = await withAutomationLock('IMAP_INGESTION', 300, async () => {
      const recovery = await recoverStaleEmailProcessingRuns({
        exclusiveImapLockHeld: true,
        thresholdMinutes: 30,
        actorUserId: (req as any).user.id,
        reason: 'Reconciliação automática antes de sincronização IMAP manual.',
      });
      const summary = await imapService.syncEmails((req as any).user.id);
      return { summary, recovery };
    });

    if (!locked.acquired || !locked.result) {
      return res.status(409).json({
        ok: false,
        error: 'Já existe uma sincronização IMAP em andamento. Aguarde o ciclo atual terminar.',
      });
    }

    const { summary, recovery } = locked.result;
    return res.status(200).json({ 
      ok: true, 
      found: summary.found,
      inserted: summary.inserted,
      reprocessed: summary.reprocessed,
      duplicates: summary.duplicates,
      processes_created: summary.processes_created,
      processes_linked: summary.processes_linked,
      timeline_created: summary.timeline_created,
      ai_interpreted: summary.ai_interpreted,
      obligations_created: summary.obligations_created,
      errors: summary.errors + summary.exception_count,
      recovered_orphan_runs: recovery.recovered,
    });
  } catch (error: any) {
    console.error('IMAP Sync Route Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Erro inesperado na sincronização' });
  }
});

export default router;
