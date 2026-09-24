import { supabase, isSupabaseConfigured } from './supabase';
import { UserProfile } from '../types/auth';

export interface AuthErrorResult {
  message: string;
  code?: string;
  details?: string;
}

export const authService = {
  /**
   * Autenticação corporativa por identificador (login ou e-mail corporativo) e senha
   */
  async signInWithCredentials(identifier: string, password: string): Promise<{
    session: any;
    user: any;
    profile: UserProfile | null;
    mustChangePassword?: boolean;
    error: AuthErrorResult | null;
  }> {
    if (!isSupabaseConfigured()) {
      return {
        session: null,
        user: null,
        profile: null,
        error: {
          message: 'Configuração do Supabase pendente no arquivo .env (VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY)',
          code: 'SUPABASE_NOT_CONFIGURED',
        },
      };
    }

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        return {
          session: null,
          user: null,
          profile: null,
          error: {
            message: data.error || 'Credenciais incorretas ou acesso não autorizado.',
            code: resp.status === 429 ? 'RATE_LIMITED' : 'AUTH_FAILED',
          },
        };
      }

      if (data.session?.access_token && data.session?.refresh_token) {
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (sessionErr) {
          console.warn('[Supabase Auth] Aviso ao sincronizar sessão:', sessionErr.message);
        }
      }

      return {
        session: data.session,
        user: data.user,
        profile: data.profile as UserProfile,
        mustChangePassword: Boolean(data.mustChangePassword),
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na comunicação com o servidor de autenticação';
      return {
        session: null,
        user: null,
        profile: null,
        error: { message },
      };
    }
  },

  /**
   * Atualização de senha pelo usuário autenticado
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error: AuthErrorResult | null }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const resp = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        return {
          success: false,
          error: { message: data.error || 'Erro ao alterar a senha' },
        };
      }

      return { success: true, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao alterar a senha';
      return { success: false, error: { message } };
    }
  },

  /**
   * Solicitação de recuperação de senha com proteção anti-enumeração
   */
  async requestPasswordReset(identifier: string): Promise<{ success: boolean; message: string; error: AuthErrorResult | null }> {
    try {
      const resp = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });

      const data = await resp.json();
      return {
        success: true,
        message: data.message || 'Se a conta estiver cadastrada e ativa, as instruções foram enviadas.',
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao solicitar recuperação de senha';
      return {
        success: false,
        message,
        error: { message },
      };
    }
  },

  /**
   * Encerra a sessão do usuário
   */
  async signOut(): Promise<{ error: AuthErrorResult | null }> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        return { error: { message: error.message } };
      }
      return { error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao realizar logout';
      return { error: { message } };
    }
  },

  /**
   * Executa a função RPC 'claim_my_invite' para associar convite pendente ao usuário
   */
  async claimMyInvite(): Promise<{ data: unknown; error: AuthErrorResult | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: null };
    }

    try {
      const { data, error } = await supabase.rpc('claim_my_invite');
      if (error) {
        // Se a função retornar erro (ex: convite já resgatado ou nenhum convite para este email), registra aviso sem interromper
        console.warn('[Supabase Auth] Aviso da RPC claim_my_invite:', error.message);
        return { data: null, error: { message: error.message, code: error.code } };
      }
      console.log('[Supabase Auth] RPC claim_my_invite executada com sucesso:', data);
      return { data, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao resgatar convite';
      return { data: null, error: { message } };
    }
  },

  /**
   * Carrega o perfil do usuário na tabela user_profiles
   */
  async fetchUserProfile(userId: string, email?: string): Promise<{ profile: UserProfile | null; error: AuthErrorResult | null }> {
    if (!isSupabaseConfigured()) {
      return { profile: null, error: null };
    }

    const delays = [0, 350, 900];
    let lastError: AuthErrorResult | null = null;

    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }

      try {
        // 1. Fonte principal: o id do perfil deve acompanhar o auth.users.id.
        const byId = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (byId.error) {
          lastError = { message: byId.error.message, code: byId.error.code };
          console.warn(`[Supabase Auth] user_profiles por id falhou (tentativa ${attempt + 1}/${delays.length}):`, byId.error.message);
          continue;
        }

        if (byId.data) {
          return { profile: byId.data as UserProfile, error: null };
        }

        // 2. Compatibilidade com perfis legados/vínculos por e-mail.
        if (email) {
          const byEmail = await supabase
            .from('user_profiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();

          if (byEmail.error) {
            lastError = { message: byEmail.error.message, code: byEmail.error.code };
            console.warn(`[Supabase Auth] user_profiles por e-mail falhou (tentativa ${attempt + 1}/${delays.length}):`, byEmail.error.message);
            continue;
          }

          if (byEmail.data) {
            return { profile: byEmail.data as UserProfile, error: null };
          }
        }

        // Não encontrar perfil não é erro técnico. Repetimos por alguns
        // instantes para absorver propagação de trigger/RPC após autenticação.
        lastError = null;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar perfil do usuário';
        lastError = { message };
        console.warn(`[Supabase Auth] falha de transporte ao carregar perfil (tentativa ${attempt + 1}/${delays.length}):`, message);
      }
    }

    return { profile: null, error: lastError };
  },

  /**
   * Lista usuários ativos do sistema para seleção de responsável em processos e obrigações
   */
  async getActiveProfiles(): Promise<{ profiles: Array<{ id: string; display_name: string | null; email: string }>; error: AuthErrorResult | null }> {
    if (!isSupabaseConfigured()) {
      return { profiles: [], error: null };
    }
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, display_name, email')
        .eq('active', true)
        .order('display_name', { ascending: true });

      if (error) {
        return { profiles: [], error: { message: error.message } };
      }
      return { profiles: data || [], error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao listar usuários';
      return { profiles: [], error: { message } };
    }
  },
};
