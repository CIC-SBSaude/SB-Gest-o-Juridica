import { Router, Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware';
import { getBackendSupabase, createAuthVerificationClient } from '../integrations/supabase';

const router = Router();

// Rate limiting in-memory store for login attempts (IP + identifier)
type AttemptRecord = { count: number; firstAttempt: number; lockedUntil?: number };
const loginAttempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const LOCK_MS = 15 * 60 * 1000; // 15 minutos

function getClientIp(req: Request): string {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
}

function checkRateLimit(key: string): { limited: boolean; message?: string } {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record) return { limited: false };

  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingMin = Math.ceil((record.lockedUntil - now) / 60000);
    return { limited: true, message: `Muitas tentativas incorretas. Tente novamente em ${remainingMin} minutos.` };
  }

  if (now - record.firstAttempt > WINDOW_MS) {
    loginAttempts.delete(key);
    return { limited: false };
  }

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCK_MS;
    return { limited: true, message: 'Limite de tentativas excedido. Tente novamente em 15 minutos.' };
  }

  return { limited: false };
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now - record.firstAttempt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count++;
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCK_MS;
    }
  }
}

function clearAttempts(key: string) {
  loginAttempts.delete(key);
}

/**
 * Validação de sessão e autorização no backend
 */
router.get('/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    authorized: true,
    user: req.user,
  });
});

/**
 * Login corporativo por Identificador (username) ou E-mail e Senha
 * Proteção estrita contra enumeração de usuários e força bruta
 */
router.post('/login', async (req: Request, res: Response) => {
  const identifier = String(req.body?.identifier || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const ip = getClientIp(req);
  const rateLimitKey = `${ip}:${identifier}`;

  if (!identifier || !password) {
    return res.status(400).json({
      ok: false,
      error: 'Identificador (login ou e-mail corporativo) e senha são obrigatórios.',
    });
  }

  const limitCheck = checkRateLimit(rateLimitKey);
  if (limitCheck.limited) {
    return res.status(429).json({ ok: false, error: limitCheck.message });
  }

  const supabase = getBackendSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'Serviço de autenticação temporariamente indisponível.' });
  }

  try {
    // 1. Resolver identificador (login ou e-mail)
    let emailToAuth: string | null = null;
    let userProfile: any = null;

    if (identifier.includes('@')) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('email', identifier)
        .maybeSingle();

      if (!error && data) {
        userProfile = data;
        emailToAuth = data.email;
      }
    } else {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('username', identifier)
        .maybeSingle();

      if (!error && data) {
        userProfile = data;
        emailToAuth = data.email;
      }
    }

    // Se usuário não encontrado ou inativo, introduz latência consistente para evitar enumeração temporal
    if (!emailToAuth || !userProfile || userProfile.active !== true) {
      await new Promise(r => setTimeout(r, 200 + Math.random() * 100));
      recordFailedAttempt(rateLimitKey);
      return res.status(401).json({
        ok: false,
        error: 'Credenciais incorretas ou acesso não autorizado.',
      });
    }

    // 2. Autenticação por senha via cliente efêmero sem contaminar o cliente administrativo
    const authVerifier = createAuthVerificationClient();
    if (!authVerifier) {
      return res.status(503).json({ ok: false, error: 'Serviço de autenticação temporariamente indisponível.' });
    }

    const { data: authData, error: authError } = await authVerifier.auth.signInWithPassword({
      email: emailToAuth,
      password: password,
    });

    if (authError || !authData.session) {
      recordFailedAttempt(rateLimitKey);
      return res.status(401).json({
        ok: false,
        error: 'Credenciais incorretas ou acesso não autorizado.',
      });
    }

    // Sucesso - limpa histórico de tentativas
    clearAttempts(rateLimitKey);

    // Atualiza last_login_at
    await supabase
      .from('user_profiles')
      .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', userProfile.id);

    return res.status(200).json({
      ok: true,
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at,
        token_type: authData.session.token_type,
      },
      user: authData.user,
      profile: {
        id: userProfile.id,
        email: userProfile.email,
        display_name: userProfile.display_name,
        username: userProfile.username,
        role: userProfile.role,
        active: userProfile.active,
        must_change_password: Boolean(userProfile.must_change_password),
      },
      mustChangePassword: Boolean(userProfile.must_change_password),
    });
  } catch (err: any) {
    console.error('[AUTH LOGIN ERROR]', err?.message || err);
    return res.status(500).json({
      ok: false,
      error: 'Erro interno ao processar a autenticação.',
    });
  }
});

/**
 * Troca de senha pelo próprio usuário autenticado
 */
router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const userId = req.user!.id;
  const userEmail = req.user!.email;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      ok: false,
      error: 'A nova senha deve ter no mínimo 6 caracteres.',
    });
  }

  const supabase = getBackendSupabase();
  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'Serviço backend indisponível.' });
  }

  try {
    // Se informou senha atual, valida antes de trocar através de cliente efêmero
    if (currentPassword && userEmail) {
      const authVerifier = createAuthVerificationClient();
      if (authVerifier) {
        const { error: checkError } = await authVerifier.auth.signInWithPassword({
          email: userEmail,
          password: currentPassword,
        });
        if (checkError) {
          return res.status(401).json({ ok: false, error: 'Senha atual incorreta.' });
        }
      }
    }

    // Atualiza a senha no Supabase Auth via Admin API (service_role garantido)
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      return res.status(400).json({ ok: false, error: updateError.message });
    }

    // Remove flag must_change_password
    const { error: profileUpdateError } = await supabase
      .from('user_profiles')
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (profileUpdateError) {
      console.error('[AUTH CHANGE PASSWORD] Falha ao atualizar must_change_password:', profileUpdateError.message);
    }

    // Registra na trilha de auditoria
    await supabase
      .from('user_access_audit')
      .insert({
        action: 'ROLE_CHANGED',
        actor_user_id: userId,
        target_user_id: userId,
        target_email: userEmail || 'unknown@opsaudebrasil.com.br',
        old_role: req.user!.role as any,
        new_role: req.user!.role as any,
        old_active: true,
        new_active: true,
        reason: 'Senha alterada pelo próprio usuário',
        metadata: { password_changed: true, updated_at: new Date().toISOString() },
      });

    return res.json({ ok: true, message: 'Senha atualizada com sucesso.' });
  } catch (err: any) {
    console.error('[AUTH CHANGE PASSWORD ERROR]', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Erro ao atualizar a senha.' });
  }
});

/**
 * Solicitação de recuperação de senha (anti-enumeração)
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
  const identifier = String(req.body?.identifier || '').trim().toLowerCase();
  const ip = getClientIp(req);
  const rateLimitKey = `forgot:${ip}`;

  const limitCheck = checkRateLimit(rateLimitKey);
  if (limitCheck.limited) {
    return res.status(429).json({ ok: false, error: limitCheck.message });
  }
  recordFailedAttempt(rateLimitKey);

  const supabase = getBackendSupabase();
  if (supabase && identifier) {
    try {
      let email: string | null = null;
      if (identifier.includes('@')) {
        email = identifier;
      } else {
        const { data } = await supabase
          .from('user_profiles')
          .select('email')
          .eq('username', identifier)
          .eq('active', true)
          .maybeSingle();
        if (data?.email) email = data.email;
      }

      if (email) {
        await supabase.auth.resetPasswordForEmail(email);
      }
    } catch {
      // Ignora erro para não revelar dados
    }
  }

  // Resposta sempre neutra e genérica
  return res.json({
    ok: true,
    message: 'Se o usuário ou e-mail estiver correto e ativo, as instruções foram enviadas.',
  });
});

export default router;
