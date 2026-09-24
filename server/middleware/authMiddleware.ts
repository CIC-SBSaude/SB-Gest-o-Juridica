import { Request, Response, NextFunction } from 'express';
import { getBackendSupabase } from '../integrations/supabase';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[AuthMiddleware] token recebido: false');
    return res.status(401).json({ ok: false, error: 'Token de autenticação não fornecido' });
  }

  console.log('[AuthMiddleware] token recebido: true');
  const token = authHeader.slice('Bearer '.length).trim();
  const supabase = getBackendSupabase();

  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'Serviço Supabase backend não configurado no servidor' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log('[AuthMiddleware] usuário autenticado: false');
      return res.status(401).json({ ok: false, error: 'Sessão inválida ou expirada' });
    }

    // A identidade do usuário vem do JWT validado. A autorização é lida no backend
    // com o cliente administrativo, sem depender de uma chave VITE no servidor.
    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('role, active')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) {
      console.error('[AuthMiddleware] falha ao consultar perfil:', profileErr.message);
      return res.status(500).json({ ok: false, error: 'Falha ao validar perfil de acesso' });
    }

    console.log('[AuthMiddleware] autorização', {
      userId: user.id,
      profileFound: Boolean(profile),
      active: profile?.active === true,
      role: profile?.role || null,
    });

    if (!profile || profile.active !== true) {
      return res.status(403).json({ ok: false, error: 'ACESSO NÃO AUTORIZADO: Perfil inativo ou sem permissão' });
    }

    req.user = { id: user.id, email: user.email, role: profile.role };
    return next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha na verificação de autorização';
    console.error('[AuthMiddleware] erro:', message);
    return res.status(500).json({ ok: false, error: 'Falha na verificação de autorização' });
  }
}
