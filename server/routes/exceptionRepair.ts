import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { getBackendSupabase } from '../integrations/supabase';
import { executeFalseProtocolRepair, previewFalseProtocolRepair } from '../services/falseProtocolRepairService';
import { recoverStaleDemandClassification } from '../services/aiQueueRecoveryService';

const router = Router();
router.use(requireAuth);
const canManage = (req: AuthenticatedRequest) => ['ADMIN', 'GESTOR'].includes(String(req.user?.role || ''));

router.post('/false-protocols', async (req: AuthenticatedRequest, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Apenas ADMIN ou GESTOR pode reparar exceções.' });
  const db = getBackendSupabase();
  if (!db) return res.status(503).json({ error: 'Supabase backend indisponível.' });
  try {
    if (req.body?.execute !== true) return res.json(await previewFalseProtocolRepair(db));
    const ids = req.body?.exceptionIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 10 || new Set(ids).size !== ids.length
      || ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      return res.status(400).json({ error: 'Envie de 1 a 10 UUIDs únicos obtidos na prévia.' });
    }
    const result = await executeFalseProtocolRepair(db, ids, req.user!.id);
    return res.json({ ...result, staleClassificationsRecovered: await recoverStaleDemandClassification(db) });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || String(error) });
  }
});
export default router;
