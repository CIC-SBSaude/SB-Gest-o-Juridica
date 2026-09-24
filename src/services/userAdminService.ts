import { supabase } from './supabase';
import type { UserRole } from '../types/database';

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sessão não disponível.');
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(await authHeaders()), ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Falha HTTP ${response.status}`);
  return payload as T;
}

export const userAdminService = {
  list: () => api<any>('/api/admin/users'),
  createInvite: (email: string, role: UserRole, reason?: string) => api<any>('/api/admin/users/invites', {
    method: 'POST', body: JSON.stringify({ email, role, reason }),
  }),
  revokeInvite: (inviteId: string, reason?: string) => api<any>(`/api/admin/users/invites/${inviteId}/revoke`, {
    method: 'POST', body: JSON.stringify({ reason }),
  }),
  setRole: (userId: string, role: UserRole, reason?: string) => api<any>(`/api/admin/users/${userId}/role`, {
    method: 'PATCH', body: JSON.stringify({ role, reason }),
  }),
  setActive: (userId: string, active: boolean, reason?: string) => api<any>(`/api/admin/users/${userId}/active`, {
    method: 'PATCH', body: JSON.stringify({ active, reason }),
  }),
};
