import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { runTechnicalDiagnostic } from '../services/technicalDiagnosticService';

const router = express.Router();

function requireAdmin(req: any, res: any, next: any) {
  const userRole = String(req.user?.role || '').toUpperCase();
  if (userRole !== 'ADMIN') {
    return res.status(403).json({
      ok: false,
      error: 'Acesso negado. Apenas usuários com perfil ADMIN podem executar o Diagnóstico Técnico.',
    });
  }
  next();
}

/**
 * GET /api/admin/diagnostico
 * Executa auditoria operacional completa, estritamente read-only.
 * Nenhuma alteração é efetuada no banco de dados e nenhum lock é liberado.
 * Chave SUPABASE_SECRET_KEY é mantida estritamente no backend.
 */
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const report = await runTechnicalDiagnostic();
    return res.status(200).json({
      ok: true,
      report,
    });
  } catch (error: any) {
    console.error('[DIAGNOSTICO TECNICO] Falha ao gerar auditoria:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Falha ao executar auditoria do diagnóstico técnico.',
    });
  }
});

export default router;
