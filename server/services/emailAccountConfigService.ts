import { getBackendSupabase } from '../integrations/supabase';
import { ENV } from '../config/env';
import { decryptEmailPassword, encryptEmailPassword } from './emailCredentialService';
import { isTransientSupabaseError, withSupabaseRetry } from './supabaseResilienceService';

export type ActiveEmailConfig = {
  source: 'DATABASE' | 'ENV_BOOTSTRAP';
  id: string | null;
  email: string;
  host: string;
  port: number;
  secure: boolean;
  mailbox: string;
  password: string;
  syncIntervalMinutes: number;
  syncBatchSize: number;
  syncSinceDays: number;
};



type CachedEmailConfig = { value: ActiveEmailConfig; cachedAt: number };
let activeConfigCache: CachedEmailConfig | null = null;
const ACTIVE_CONFIG_FRESH_MS = 60_000;
const ACTIVE_CONFIG_STALE_FALLBACK_MS = 15 * 60_000;

function cloneEmailConfig(value: ActiveEmailConfig): ActiveEmailConfig {
  return { ...value };
}

function cacheActiveConfig(value: ActiveEmailConfig) {
  if (value.source !== 'DATABASE') return;
  activeConfigCache = { value: cloneEmailConfig(value), cachedAt: Date.now() };
}

function invalidateActiveConfigCache() {
  activeConfigCache = null;
}
export async function getStoredEmailConfig(params?: { requireActive?: boolean }): Promise<ActiveEmailConfig> {
  const supabase = getBackendSupabase();
  if (!supabase) throw new Error('Supabase backend não configurado.');

  const requireActive = params?.requireActive !== false;
  const cacheAgeMs = activeConfigCache ? Date.now() - activeConfigCache.cachedAt : Number.POSITIVE_INFINITY;
  if (requireActive && activeConfigCache && cacheAgeMs <= ACTIVE_CONFIG_FRESH_MS) {
    return cloneEmailConfig(activeConfigCache.value);
  }

  const query = () => supabase
    .from('email_account_config')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let data: any = null;
  let error: any = null;
  try {
    const result: any = await withSupabaseRetry(query, {
      label: 'email_account_config.read',
      attempts: 3,
    });
    data = result.data;
    error = result.error;
  } catch (queryException: any) {
    if (requireActive && activeConfigCache && cacheAgeMs <= ACTIVE_CONFIG_STALE_FALLBACK_MS && isTransientSupabaseError(queryException)) {
      console.warn('[IMAP CONFIG] Supabase temporariamente indisponível; usando última configuração válida em memória', {
        cacheAgeSeconds: Math.round(cacheAgeMs / 1000),
      });
      return cloneEmailConfig(activeConfigCache.value);
    }
    if (isTransientSupabaseError(queryException)) {
      const connErr: any = new Error(`Falha ao consultar configuração IMAP: ${queryException?.message || queryException}`);
      connErr.code = 'DATABASE_CONNECTIVITY_UNAVAILABLE';
      connErr.isTransient = true;
      throw connErr;
    }
    throw queryException;
  }

  if (error && error.code !== '42P01') {
    if (requireActive && activeConfigCache && cacheAgeMs <= ACTIVE_CONFIG_STALE_FALLBACK_MS && isTransientSupabaseError(error)) {
      console.warn('[IMAP CONFIG] consulta falhou após retries; usando última configuração válida em memória', {
        cacheAgeSeconds: Math.round(cacheAgeMs / 1000),
        error: error.message,
      });
      return cloneEmailConfig(activeConfigCache.value);
    }
    if (isTransientSupabaseError(error)) {
      const connErr: any = new Error(`Falha ao consultar configuração IMAP: ${error.message}`);
      connErr.code = 'DATABASE_CONNECTIVITY_UNAVAILABLE';
      connErr.isTransient = true;
      throw connErr;
    }
    throw new Error(`Falha ao consultar configuração IMAP: ${error.message}`);
  }

  if (data) {
    if (params?.requireActive !== false && data.active !== true) {
      const error: any = new Error('Monitoramento da conta de e-mail está desativado no painel administrativo.');
      error.code = 'EMAIL_MONITORING_DISABLED';
      throw error;
    }

    // Se existe uma configuração persistida, ela é soberana mesmo quando inativa.
    // Nunca voltamos silenciosamente ao ENV após o administrador ter cadastrado a conta.
    const password = decryptEmailPassword(data.encrypted_password);
    const resolved: ActiveEmailConfig = {
      source: 'DATABASE',
      id: data.id,
      email: data.email,
      host: data.host,
      port: Number(data.port),
      secure: Boolean(data.secure),
      mailbox: data.mailbox || 'INBOX',
      password,
      syncIntervalMinutes: Number(data.sync_interval_minutes || 5),
      syncBatchSize: Number(data.sync_batch_size || 100),
      syncSinceDays: Number(data.sync_since_days || 3650),
    };
    if (data.active === true) cacheActiveConfig(resolved);
    return resolved;
  }

  if (!ENV.imap.host || !ENV.imap.loginUser || !ENV.imap.loginPassword) {
    throw new Error('Nenhuma configuração IMAP cadastrada no banco e bootstrap ENV incompleto.');
  }

  return {
    source: 'ENV_BOOTSTRAP',
    id: null,
    email: ENV.imap.loginUser,
    host: ENV.imap.host,
    port: ENV.imap.port,
    secure: ENV.imap.tls,
    mailbox: ENV.imap.mailbox,
    password: ENV.imap.loginPassword,
    syncIntervalMinutes: ENV.automation.emailSyncIntervalMinutes,
    syncBatchSize: ENV.imap.syncMax,
    syncSinceDays: ENV.imap.syncSinceDays,
  };
}

export async function getActiveEmailConfig(): Promise<ActiveEmailConfig> {
  return getStoredEmailConfig({ requireActive: true });
}

export async function getEmailConfigForAdmin() {
  const supabase = getBackendSupabase();
  if (!supabase) throw new Error('Supabase backend não configurado.');
  const { data, error } = await supabase
    .from('email_account_config')
    .select('id,email,host,port,secure,mailbox,active,sync_interval_minutes,sync_batch_size,sync_since_days,last_connection_at,last_connection_status,last_error,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== '42P01') throw new Error(error.message);

  if (!data) {
    return {
      configured: false,
      source: 'ENV_BOOTSTRAP',
      fallback: {
        email: ENV.imap.loginUser || '',
        host: ENV.imap.host || '',
        port: ENV.imap.port,
        secure: ENV.imap.tls,
        mailbox: ENV.imap.mailbox,
        sync_interval_minutes: ENV.automation.emailSyncIntervalMinutes,
        sync_batch_size: ENV.imap.syncMax,
        sync_since_days: ENV.imap.syncSinceDays,
        password_configured: Boolean(ENV.imap.loginPassword),
      },
    };
  }

  return {
    configured: true,
    source: data.active ? 'DATABASE' : 'DATABASE_INACTIVE',
    account: { ...data, password_configured: true },
  };
}

export async function saveEmailConfig(params: {
  actorId: string;
  id?: string | null;
  email: string;
  host: string;
  port: number;
  secure: boolean;
  mailbox: string;
  password?: string | null;
  active: boolean;
  syncIntervalMinutes: number;
  syncBatchSize: number;
  syncSinceDays: number;
}) {
  const supabase = getBackendSupabase();
  if (!supabase) throw new Error('Supabase backend não configurado.');
  invalidateActiveConfigCache();

  let existing: any = null;
  if (params.id) {
    const { data, error } = await supabase.from('email_account_config').select('*').eq('id', params.id).maybeSingle();
    if (error) throw new Error(error.message);
    existing = data;
  } else {
    const { data } = await supabase.from('email_account_config').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    existing = data;
  }

  const encryptedPassword = params.password
    ? encryptEmailPassword(params.password)
    : existing?.encrypted_password;

  if (!encryptedPassword) throw new Error('Informe a senha ou senha de aplicativo da conta.');

  if (params.active) {
    const { error } = await supabase.from('email_account_config').update({ active: false, updated_at: new Date().toISOString(), updated_by: params.actorId }).eq('active', true);
    if (error) throw new Error(error.message);
  }

  const payload = {
    email: params.email.trim(),
    host: params.host.trim(),
    port: params.port,
    secure: params.secure,
    mailbox: params.mailbox.trim() || 'INBOX',
    encrypted_password: encryptedPassword,
    active: params.active,
    sync_interval_minutes: params.syncIntervalMinutes,
    sync_batch_size: params.syncBatchSize,
    sync_since_days: params.syncSinceDays,
    updated_by: params.actorId,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await supabase.from('email_account_config').update(payload).eq('id', existing.id).select('id').single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase.from('email_account_config').insert({ ...payload, created_by: params.actorId }).select('id').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function recordEmailConnectionResult(id: string | null, ok: boolean, errorMessage?: string | null) {
  if (!id) return;
  const supabase = getBackendSupabase();
  if (!supabase) return;

  // Telemetria de conexão é best-effort. Uma oscilação do Supabase nunca deve
  // transformar uma conexão IMAP válida em falha de autenticação nem disparar
  // novas tentativas LOGIN/PLAIN desnecessárias.
  try {
    const { error } = await withSupabaseRetry<any>(
      () => supabase.from('email_account_config').update({
        last_connection_at: new Date().toISOString(),
        last_connection_status: ok ? 'SUCCESS' : 'FAILED',
        last_error: ok ? null : String(errorMessage || 'Falha de conexão').slice(0, 1500),
        updated_at: new Date().toISOString(),
      }).eq('id', id),
      { label: 'email_account_config.connection_status', attempts: 2, delaysMs: [300, 750] },
    );
    if (error) {
      console.warn('[IMAP CONFIG] não foi possível registrar telemetria de conexão', { error: error.message });
    }
  } catch (error) {
    console.warn('[IMAP CONFIG] telemetria de conexão indisponível; conexão IMAP não será invalidada', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

