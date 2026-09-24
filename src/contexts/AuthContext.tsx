import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { authService } from '../services/authService';
import { UserProfile } from '../types/auth';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  isAuthorized: boolean;
  mustChangePassword: boolean;
  errorMessage: string | null;
  profileValidationError: string | null;
  profileValidated: boolean;
  isConfigured: boolean;
  signInWithCredentials: (identifier: string, password: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  requestPasswordReset: (identifier: string) => Promise<{ success: boolean; message: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  claimInvite: () => Promise<boolean>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileValidationError, setProfileValidationError] = useState<string | null>(null);
  const [profileValidated, setProfileValidated] = useState<boolean>(false);

  // Referências estáveis usadas pelo listener do Supabase.
  // Evitam que eventos recorrentes de SIGNED_IN/TOKEN_REFRESHED (inclusive ao
  // voltar o foco para a aba) usem um snapshot antigo de `profile` e remontem
  // toda a aplicação desnecessariamente.
  const userRef = useRef<User | null>(null);
  const profileRef = useRef<UserProfile | null>(null);
  const signedOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isConfigured = isSupabaseConfigured();

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const loadProfileForUser = useCallback(async (currentUser: User) => {
    setProfileValidationError(null);
    setProfileValidated(false);

    try {
      // 1. Tenta ler o perfil com retry no authService. Falha técnica de leitura
      // não pode ser confundida com usuário inativo/sem convite.
      let { profile: userProfile, error } = await authService.fetchUserProfile(
        currentUser.id,
        currentUser.email
      );

      if (error) {
        const message = `Não foi possível validar seu perfil de acesso: ${error.message}`;
        console.warn('[AuthContext] Falha técnica ao consultar public.user_profiles:', error.message);
        setProfileValidationError(message);
        setProfileValidated(true);

        // Preserva um perfil ativo já conhecido durante oscilações transitórias.
        if (profileRef.current?.active === true && profileRef.current.id === currentUser.id) {
          return profileRef.current;
        }

        return null;
      }

      // 2. Perfil ausente OU inativo pode possuir convite/autorização pendente.
      // Só executamos claim quando a consulta anterior foi tecnicamente válida.
      if (!userProfile || userProfile.active !== true) {
        const claimResult = await authService.claimMyInvite();
        if (claimResult.error) {
          console.warn('[AuthContext] claim_my_invite não concluiu:', claimResult.error.message);
        }

        const retryResult = await authService.fetchUserProfile(currentUser.id, currentUser.email);
        userProfile = retryResult.profile;
        error = retryResult.error;

        if (error) {
          const message = `Sua conta foi autenticada, mas não foi possível confirmar o perfil de acesso: ${error.message}`;
          console.warn('[AuthContext] Falha técnica após claim_my_invite:', error.message);
          setProfileValidationError(message);
          setProfileValidated(true);

          if (profileRef.current?.active === true && profileRef.current.id === currentUser.id) {
            return profileRef.current;
          }

          return null;
        }
      } else {
        // Mantém last_login_at atualizado sem conceder escrita direta do frontend.
        void authService.claimMyInvite();
      }

      setProfile(userProfile);
      profileRef.current = userProfile;
      setProfileValidationError(null);
      setProfileValidated(true);

      // Limpeza de parâmetros residuais da URL do navegador
      if (
        typeof window !== 'undefined' &&
        (window.location.hash.includes('access_token') ||
          window.location.search.includes('code=') ||
          window.location.hash.includes('refresh_token'))
      ) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      return userProfile;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha inesperada ao validar o perfil de acesso';
      console.error('[AuthContext] Falha ao sincronizar perfil após autenticação:', err);
      setProfileValidationError(`Não foi possível validar seu perfil de acesso: ${message}`);
      setProfileValidated(true);

      if (profileRef.current?.active === true && profileRef.current.id === currentUser.id) {
        return profileRef.current;
      }

      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      if (!isConfigured) {
        setIsLoading(false);
        return;
      }

      const fetchSession = async () => {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) {
          throw error;
        }
        if (isMounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
          if (initialSession?.user) {
            await loadProfileForUser(initialSession.user);
          }
        }
      };

      // Timeout defensivo de 8s para evitar loading infinito em ambientes restritos (iframes/cookies desativados)
      const timeoutFallback = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT_IFRAME')), 8000)
      );

      try {
        await Promise.race([fetchSession(), timeoutFallback]);
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Erro ao inicializar sessão do Supabase';
          if (msg !== 'TIMEOUT_IFRAME') {
            setErrorMessage(msg);
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initAuth();

    // Listener para alterações de autenticação.
    // Importante: eventos de SIGNED_IN e TOKEN_REFRESHED podem ocorrer novamente
    // quando a aba recupera foco. Eles não devem ligar o loading global nem
    // desmontar as rotas/modais já abertos.
    if (isConfigured) {
      const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
        if (!isMounted) return;

        // INITIAL_SESSION já é tratado por initAuth()/getSession(). Evita trabalho
        // duplicado durante a inicialização.
        if (event === 'INITIAL_SESSION') return;

        if (event === 'SIGNED_OUT') {
          // Em previews/iframes podem ocorrer eventos transitórios de sessão ao
          // alternar foco. Não derrubamos a navegação imediatamente: aguardamos
          // um curto intervalo e confirmamos se a sessão realmente desapareceu.
          if (signedOutTimerRef.current) {
            clearTimeout(signedOutTimerRef.current);
          }
          signedOutTimerRef.current = setTimeout(() => {
            void supabase.auth.getSession().then(({ data }) => {
              if (!isMounted || data.session) return;
              setSession(null);
              setUser(null);
              setProfile(null);
              setProfileValidationError(null);
              setProfileValidated(false);
              setIsLoading(false);
              userRef.current = null;
              profileRef.current = null;
            });
          }, 700);
          return;
        }

        if (!newSession?.user) return;

        if (signedOutTimerRef.current) {
          clearTimeout(signedOutTimerRef.current);
          signedOutTimerRef.current = null;
        }

        const sameUser = userRef.current?.id === newSession.user.id;
        setSession(newSession);
        setUser(newSession.user);
        userRef.current = newSession.user;

        // TOKEN_REFRESHED não muda autorização corporativa. Atualiza apenas a
        // sessão/token e preserva integralmente a tela atual.
        if (event === 'TOKEN_REFRESHED' && sameUser && profileRef.current) {
          return;
        }

        // SIGNED_IN pode ser disparado novamente ao recuperar o foco. Se o mesmo
        // usuário já possui perfil carregado, não há nada a recarregar.
        if (event === 'SIGNED_IN' && sameUser && profileRef.current) {
          return;
        }

        // Para usuário novo ou perfil ainda ausente, carrega em background sem
        // trocar toda a aplicação pelo LoadingScreen. Isso preserva rota, modal,
        // filtros e estado local durante refresh/reconexões.
        void loadProfileForUser(newSession.user).then((loadedProfile) => {
          if (!isMounted) return;
          profileRef.current = loadedProfile;
        });
      });

      return () => {
        isMounted = false;
        if (signedOutTimerRef.current) {
          clearTimeout(signedOutTimerRef.current);
          signedOutTimerRef.current = null;
        }
        authListener.subscription.unsubscribe();
      };
    }

    return () => {
      isMounted = false;
    };
  }, [isConfigured, loadProfileForUser]);

  const signInWithCredentials = async (identifier: string, password: string): Promise<boolean> => {
    setErrorMessage(null);
    setIsLoading(true);
    const { session: newSession, user: newUser, profile: newProfile, error } = await authService.signInWithCredentials(identifier, password);
    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return false;
    }
    if (newSession && newUser) {
      setSession(newSession);
      setUser(newUser);
      userRef.current = newUser;
      if (newProfile) {
        setProfile(newProfile);
        profileRef.current = newProfile;
        setProfileValidated(true);
      } else {
        await loadProfileForUser(newUser);
      }
    }
    setIsLoading(false);
    return true;
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    setErrorMessage(null);
    setIsLoading(true);
    const { success, error } = await authService.changePassword(currentPassword, newPassword);
    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return false;
    }
    if (profile) {
      const updated = { ...profile, must_change_password: false };
      setProfile(updated);
      profileRef.current = updated;
    }
    setIsLoading(false);
    return success;
  };

  const requestPasswordReset = async (identifier: string): Promise<{ success: boolean; message: string }> => {
    return await authService.requestPasswordReset(identifier);
  };

  const signOut = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    const { error } = await authService.signOut();
    if (error) {
      setErrorMessage(error.message);
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setProfileValidationError(null);
    setProfileValidated(false);
    setIsLoading(false);
  };

  const refreshProfile = async () => {
    if (user) {
      setIsLoading(true);
      await loadProfileForUser(user);
      setIsLoading(false);
    }
  };

  const claimInvite = async (): Promise<boolean> => {
    setIsLoading(true);
    const { error } = await authService.claimMyInvite();
    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return false;
    }
    if (user) {
      await loadProfileForUser(user);
    }
    setIsLoading(false);
    return true;
  };

  const clearError = () => {
    setErrorMessage(null);
  };

  // Determina se o usuário tem autorização ativa
  // Regra do item 5:
  // "Autenticação não significa autorização. Se o usuário autenticar mas user_profiles.active = false -> ACESSO NÃO AUTORIZADO"
  const isAuthorized = Boolean(user && profile && profile.active === true);
  const mustChangePassword = Boolean(profile?.must_change_password);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        isLoading,
        isAuthorized,
        mustChangePassword,
        errorMessage,
        profileValidationError,
        profileValidated,
        isConfigured,
        signInWithCredentials,
        changePassword,
        requestPasswordReset,
        signOut,
        refreshProfile,
        claimInvite,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
