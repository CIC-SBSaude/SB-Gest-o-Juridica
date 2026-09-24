export type UserRole = 'ADMIN' | 'GESTOR' | 'ANALISTA' | 'CONSULTA';

export interface UserProfile {
  id: string;
  user_id?: string;
  email: string;
  display_name?: string | null;
  full_name?: string | null;
  username?: string | null;
  role: UserRole;
  active: boolean;
  must_change_password?: boolean;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccessInvite {
  id: string;
  email: string;
  role: UserRole;
  status: 'pending' | 'accepted' | 'revoked';
  invited_by?: string;
  created_at: string;
  accepted_at?: string | null;
}

export interface AuthState {
  user: {
    id: string;
    email?: string;
    user_metadata?: {
      full_name?: string;
      avatar_url?: string;
      picture?: string;
      name?: string;
    };
  } | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthorized: boolean;
  errorMessage: string | null;
}
