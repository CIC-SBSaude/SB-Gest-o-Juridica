import React, { useEffect, useState } from 'react';
import { CheckCircle2, EyeOff, Mail, RefreshCw, Save, Server, ShieldCheck, TestTube2, XCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { emailAccountAdminService } from '../../services/emailAccountAdminService';

const defaults = {
  id: null as string | null,
  email: '',
  host: '',
  port: 993,
  secure: true,
  mailbox: 'INBOX',
  password: '',
  active: false,
  sync_interval_minutes: 5,
  sync_batch_size: 100,
  sync_since_days: 3650,
};

export const EmailAccountPage: React.FC = () => {
  const { profile } = useAuth();
  const isAdmin = String(profile?.role || '').toUpperCase() === 'ADMIN';
  const [form, setForm] = useState(defaults);
  const [source, setSource] = useState('—');
  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [databaseConfigured, setDatabaseConfigured] = useState(false);
  const [lastStatus, setLastStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = await emailAccountAdminService.get();
      setSource(data.source || '—');
      setDatabaseConfigured(Boolean(data.configured && data.account));
      if (data.configured && data.account) {
        const a = data.account;
        setForm({
          id: a.id, email: a.email || '', host: a.host || '', port: Number(a.port || 993),
          secure: a.secure !== false, mailbox: a.mailbox || 'INBOX', password: '',
          active: a.active === true, sync_interval_minutes: Number(a.sync_interval_minutes || 5),
          sync_batch_size: Number(a.sync_batch_size || 100), sync_since_days: Number(a.sync_since_days || 3650),
        });
        setPasswordConfigured(Boolean(a.password_configured));
        setLastStatus({ status: a.last_connection_status, at: a.last_connection_at, error: a.last_error });
      } else if (data.fallback) {
        const f = data.fallback;
        setForm(prev => ({ ...prev, email: f.email || '', host: f.host || '', port: Number(f.port || 993), secure: f.secure !== false, mailbox: f.mailbox || 'INBOX', sync_interval_minutes: Number(f.sync_interval_minutes || 5), sync_batch_size: Number(f.sync_batch_size || 100), sync_since_days: Number(f.sync_since_days || 3650) }));
        setPasswordConfigured(false);
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (isAdmin) void load(); else setLoading(false); }, [isAdmin]);

  if (!isAdmin) return <div className="stat-card text-sm text-red-700">Apenas ADMIN pode gerenciar a conta de e-mail.</div>;
  if (loading) return <div className="stat-card text-sm text-slate-500">Carregando configuração...</div>;

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true); setError(null); setMessage(null);
    try {
      await emailAccountAdminService.save(form);
      setMessage('Configuração salva. A senha permanece protegida e não é devolvida ao navegador.');
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setError(null); setMessage(null);
    try {
      const result = await emailAccountAdminService.test();
      setMessage(`Conexão validada. Caixa ${result.mailbox} com ${result.exists} mensagem(ns). Fonte: ${result.source}.`);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setTesting(false); }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="stat-card xl:col-span-2">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-red-600" />
            <div>
              <h2 className="font-bold text-slate-900">Conta monitorada</h2>
              <p className="text-sm text-slate-500">Fonte ativa: <strong>{source}</strong>. Quando houver configuração ativa no banco, ENV não é usado como fallback silencioso.</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <div className="text-xs font-bold uppercase text-slate-500">Credencial</div>
              <div className="mt-1 text-sm font-semibold text-slate-800">{passwordConfigured ? 'Senha salva no banco' : databaseConfigured ? 'Senha não disponível' : 'Senha ainda não salva no banco'}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500"><EyeOff className="h-3.5 w-3.5" />{passwordConfigured ? 'Nunca é exibida novamente.' : source === 'ENV_BOOTSTRAP' ? 'Existe senha no ENV, mas ela não será copiada automaticamente para o banco.' : 'Informe uma senha para salvar a conta.'}</div>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700">E-mail
            <input value={form.email} onChange={e=>set('email',e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Servidor IMAP
            <input value={form.host} onChange={e=>set('host',e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Porta
            <input type="number" value={form.port} onChange={e=>set('port',Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Pasta
            <input value={form.mailbox} onChange={e=>set('mailbox',e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Nova senha / senha de aplicativo
            <input type="password" value={form.password} onChange={e=>set('password',e.target.value)} placeholder={passwordConfigured ? 'Deixe vazio para manter a atual' : 'Informe a senha para gravar no banco'} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" autoComplete="new-password" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold text-slate-700">Intervalo (min)
              <input type="number" min={1} value={form.sync_interval_minutes} onChange={e=>set('sync_interval_minutes',Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-semibold text-slate-700">Lote
              <input type="number" min={1} max={500} value={form.sync_batch_size} onChange={e=>set('sync_batch_size',Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-5 border-t border-slate-100 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={form.secure} onChange={e=>set('secure',e.target.checked)} /> SSL/TLS
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={form.active} onChange={e=>set('active',e.target.checked)} /> Monitoramento ativo
          </label>
          <span className="text-xs text-slate-500">Janela histórica: {form.sync_since_days} dias. Ingestão e IA priorizam sempre os mais recentes.</span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Save className="h-4 w-4"/>{saving?'Salvando...':'Salvar configuração'}</button>
          <button onClick={test} disabled={testing || !databaseConfigured} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><TestTube2 className="h-4 w-4"/>{testing?'Testando...':'Testar configuração salva'}</button>
          <button onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"><RefreshCw className="h-4 w-4"/>Atualizar</button>
        </div>
      </div>

      {lastStatus && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            {lastStatus.status === 'SUCCESS' ? <CheckCircle2 className="h-4 w-4 text-emerald-600"/> : <XCircle className="h-4 w-4 text-red-600"/>}
            Último teste/conexão: {lastStatus.status || 'Sem teste'}
          </div>
          {lastStatus.at && <div className="mt-1 text-xs text-slate-500">{new Date(lastStatus.at).toLocaleString('pt-BR')}</div>}
          {lastStatus.error && <div className="mt-2 text-xs text-red-700">{lastStatus.error}</div>}
        </div>
      )}
    </div>
  );
};
