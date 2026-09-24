import { Router, Request, Response } from 'express';
import { isBackendSupabaseConfigured } from '../integrations/supabase';
import { supabaseService } from '../services/supabaseService';
import { getSafeConfigReport, validateBackendConfig } from '../config/env';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const isConfigured = isBackendSupabaseConfigured();
  let dbStatus = { connected: false, message: 'Supabase não configurado no backend' };
  if (isConfigured) dbStatus = await supabaseService.checkConnection();

  const configIssues = validateBackendConfig();
  const coreErrors = configIssues.filter((i) => i.severity === 'ERROR');

  res.status(coreErrors.length ? 503 : 200).json({
    status: coreErrors.length ? 'degraded' : 'ok',
    app: 'SB Gestão Jurídica',
    client: 'SB Saúde',
    timestamp: new Date().toISOString(),
    services: {
      backend: 'online',
      supabase_configured: isConfigured,
      database_connection: dbStatus.connected,
      firebase: 'DISABLED_BY_POLICY',
    },
    config_health: {
      issues: configIssues,
      safe_inventory: getSafeConfigReport(),
    },
  });
});

export default router;
