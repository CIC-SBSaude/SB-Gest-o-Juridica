import { supabase } from './supabase';

async function api(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sessão não encontrada.');
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}

export const emailAccountAdminService = {
  get: () => api('/api/admin/email-account'),
  save: (payload: any) => api('/api/admin/email-account', { method: 'PUT', body: JSON.stringify(payload) }),
  test: () => api('/api/admin/email-account/test', { method: 'POST' }),
};
