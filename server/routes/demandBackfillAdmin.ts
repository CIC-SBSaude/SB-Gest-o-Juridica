import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { enqueueUnclassifiedProcesses, getDemandBackfillStats, runDemandClassificationBackfillWorker } from '../services/aiDemandClassificationBackfillService';

const router = express.Router();

function requireAdmin(req: any, res: any, next: any) {
  if (String(req.user?.role || '').toUpperCase() !== 'ADMIN') return res.status(403).json({ error: 'Apenas ADMIN pode executar classificação retroativa.' });
  next();
}

router.get('/stats', requireAuth, requireAdmin, async (_req, res) => {
  try { res.json(await getDemandBackfillStats()); }
  catch (e: any) { res.status(500).json({ error: e?.message || 'Falha ao consultar classificação retroativa.' }); }
});

router.post('/enqueue', requireAuth, requireAdmin, async (req: any, res) => {
  try {
    const result = await enqueueUnclassifiedProcesses(req.user.id);
    res.json({ ok: true, ...result, stats: await getDemandBackfillStats() });
  } catch (e: any) { res.status(500).json({ error: e?.message || 'Falha ao preparar classificação retroativa.' }); }
});

router.post('/run', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await runDemandClassificationBackfillWorker();
    res.json({ ok: true, acquired: result.acquired, result: result.result || null, stats: await getDemandBackfillStats() });
  } catch (e: any) { res.status(500).json({ error: e?.message || 'Falha ao executar classificação retroativa.' }); }
});

export default router;
