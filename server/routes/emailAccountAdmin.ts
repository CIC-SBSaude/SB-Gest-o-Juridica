import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { getEmailConfigForAdmin, saveEmailConfig, getStoredEmailConfig, recordEmailConnectionResult } from '../services/emailAccountConfigService';
import { ImapFlow } from 'imapflow';

const router = Router();

function adminOnly(req: any, res: any) {
  if (String(req.user?.role || '').toUpperCase() !== 'ADMIN') {
    res.status(403).json({ error: 'Apenas ADMIN pode gerenciar a conta de e-mail.' });
    return false;
  }
  return true;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!adminOnly(req, res)) return;
    res.json(await getEmailConfigForAdmin());
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Falha ao carregar configuração da conta.' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    if (!adminOnly(req, res)) return;
    const body = req.body || {};
    if (!body.email || !body.host) return res.status(400).json({ error: 'E-mail e servidor IMAP são obrigatórios.' });

    const saved = await saveEmailConfig({
      actorId: (req as any).user.id,
      id: body.id || null,
      email: String(body.email),
      host: String(body.host),
      port: Number(body.port || 993),
      secure: body.secure !== false,
      mailbox: String(body.mailbox || 'INBOX'),
      password: body.password ? String(body.password) : null,
      active: body.active === true,
      syncIntervalMinutes: Number(body.sync_interval_minutes || 5),
      syncBatchSize: Number(body.sync_batch_size || 100),
      syncSinceDays: Number(body.sync_since_days || 3650),
    });
    res.json({ ok: true, id: saved.id });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Falha ao salvar configuração da conta.' });
  }
});

router.post('/test', requireAuth, async (req, res) => {
  let client: ImapFlow | null = null;
  let cfgId: string | null = null;
  try {
    if (!adminOnly(req, res)) return;
    const cfg = await getStoredEmailConfig({ requireActive: false });
    cfgId = cfg.id;
    client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.email, pass: cfg.password },
      logger: false,
    });
    client.on('error', (err: any) => {
      console.warn('[IMAP TEST CLIENT ERROR]', err?.message || err);
    });
    await client.connect();
    const mailbox = await client.mailboxOpen(cfg.mailbox, { readOnly: true });
    await recordEmailConnectionResult(cfg.id, true);
    res.json({ ok: true, source: cfg.source, mailbox: mailbox.path, exists: mailbox.exists });
  } catch (error: any) {
    await recordEmailConnectionResult(cfgId, false, error?.message);
    res.status(502).json({ ok: false, error: error?.message || 'Falha ao testar conexão IMAP.' });
  } finally {
    if (client) {
      try { await client.logout().catch(() => undefined); } catch {}
      try { (client as any).close(); } catch {}
    }
  }
});

export default router;
