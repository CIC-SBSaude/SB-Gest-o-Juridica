import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware';
import { getBackendSupabase } from '../integrations/supabase';

const router = Router();
const ALLOWED_ROLES = new Set(['ADMIN', 'GESTOR', 'ANALISTA', 'CONSULTA']);

function requireAdmin(req: AuthenticatedRequest, res: Response): boolean {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ ok: false, error: 'Apenas ADMIN pode gerenciar usuários e convites.' });
    return false;
  }
  return true;
}

function safeReason(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, 500) : null;
}

function cleanEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

router.use(requireAuth);

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const supabase = getBackendSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase backend não configurado.' });

  const [usersResult, invitesResult, auditResult] = await Promise.all([
    supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('access_invites').select('*').order('created_at', { ascending: false }),
    supabase.from('user_access_audit').select('*').order('created_at', { ascending: false }).limit(100),
  ]);

  const firstError = usersResult.error || invitesResult.error || auditResult.error;
  if (firstError) return res.status(500).json({ ok: false, error: firstError.message });

  const activeAdmins = (usersResult.data || []).filter((user: any) => user.active === true && user.role === 'ADMIN').length;
  return res.json({
    ok: true,
    users: usersResult.data || [],
    invites: invitesResult.data || [],
    audit: auditResult.data || [],
    activeAdmins,
  });
});

router.post('/invites', async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const supabase = getBackendSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase backend não configurado.' });

  const email = cleanEmail(req.body?.email);
  const role = String(req.body?.role || '').toUpperCase();
  const reason = safeReason(req.body?.reason);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
  if (!ALLOWED_ROLES.has(role)) return res.status(400).json({ ok: false, error: 'Perfil inválido.' });

  const { data, error } = await supabase.rpc('admin_create_or_refresh_invite', {
    p_actor_id: req.user!.id,
    p_email: email,
    p_role: role,
    p_reason: reason,
  });
  if (error) return res.status(400).json({ ok: false, error: error.message });
  return res.json({ ok: true, invite: data });
});

router.post('/invites/:inviteId/revoke', async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const supabase = getBackendSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase backend não configurado.' });

  const { data, error } = await supabase.rpc('admin_revoke_invite', {
    p_actor_id: req.user!.id,
    p_invite_id: req.params.inviteId,
    p_reason: safeReason(req.body?.reason),
  });
  if (error) return res.status(400).json({ ok: false, error: error.message });
  return res.json({ ok: true, invite: data });
});

router.patch('/:userId/role', async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const supabase = getBackendSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase backend não configurado.' });

  const role = String(req.body?.role || '').toUpperCase();
  if (!ALLOWED_ROLES.has(role)) return res.status(400).json({ ok: false, error: 'Perfil inválido.' });

  const { data, error } = await supabase.rpc('admin_set_user_role', {
    p_actor_id: req.user!.id,
    p_target_user_id: req.params.userId,
    p_new_role: role,
    p_reason: safeReason(req.body?.reason),
  });
  if (error) return res.status(400).json({ ok: false, error: error.message });
  return res.json({ ok: true, user: data });
});

router.patch('/:userId/active', async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const supabase = getBackendSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase backend não configurado.' });
  if (typeof req.body?.active !== 'boolean') return res.status(400).json({ ok: false, error: 'Status active inválido.' });

  const { data, error } = await supabase.rpc('admin_set_user_active', {
    p_actor_id: req.user!.id,
    p_target_user_id: req.params.userId,
    p_new_active: req.body.active,
    p_reason: safeReason(req.body?.reason),
  });
  if (error) return res.status(400).json({ ok: false, error: error.message });
  return res.json({ ok: true, user: data });
});

export default router;
