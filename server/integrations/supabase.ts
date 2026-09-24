import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ENV } from '../config/env';

const supabaseUrl = ENV.supabase.url;
const supabaseSecretKey = ENV.supabase.secretKey;

let serverSupabaseClient: SupabaseClient | null = null;

/**
 * Retorna o cliente administrativo do Supabase (Service Role)
 * Executado estritamente no servidor Node.js/Express.
 * A chave SUPABASE_SECRET_KEY nunca é enviada ao frontend nem exposta em logs.
 */
export function getBackendSupabase(): SupabaseClient | null {
  if (serverSupabaseClient) {
    return serverSupabaseClient;
  }

  if (!supabaseUrl || !supabaseSecretKey || supabaseSecretKey.includes('your-supabase-service-role-key')) {
    return null;
  }

  serverSupabaseClient = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return serverSupabaseClient;
}

export function isBackendSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
    supabaseSecretKey &&
    !supabaseSecretKey.includes('your-supabase-service-role-key')
  );
}

/**
 * Cria um cliente efêmero não autenticado para verificar senhas de usuários
 * sem poluir ou alterar os headers de autorização do cliente administrativo (service_role).
 */
export function createAuthVerificationClient(): SupabaseClient | null {
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || supabaseSecretKey;
  if (!supabaseUrl || !anonKey) {
    return null;
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
