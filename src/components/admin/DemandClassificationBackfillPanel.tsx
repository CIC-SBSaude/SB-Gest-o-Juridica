import React, { useEffect, useState } from 'react';
import { ArchiveRestore, Play, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../services/supabase';

type Stats = { unclassified: number; pending: number; processing: number; done: number; error: number; batchSize: number };

async function authFetch(url: string, options?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sessão expirada.');
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(options?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Falha na operação.');
  return data;
}

export const DemandClassificationBackfillPanel: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try { setStats(await authFetch('/api/admin/demand-backfill/stats')); }
    catch (e: any) { setError(e.message); }
  };
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 30000); return () => clearInterval(t); }, []);

  const action = async (kind: 'enqueue' | 'run') => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const data = await authFetch(`/api/admin/demand-backfill/${kind}`, { method: 'POST' });
      setStats(data.stats || null);

      if (kind === 'enqueue') {
        setMessage(`Fila preparada. ${data.discovered ?? 0} processo(s) elegível(is) localizado(s).`);
      } else if (data.acquired === false) {
        setMessage('O worker de classificação retroativa já está em execução. Nenhum novo lote manual foi iniciado; a fila permanece preservada.');
      } else {
        setMessage(
          `Lote executado. ${data.result?.processed ?? 0} processado(s), ` +
          `${data.result?.succeeded ?? 0} classificado(s), ` +
          `${data.result?.skipped ?? 0} ignorado(s), ` +
          `${data.result?.deferred ?? 0} adiado(s), ` +
          `${data.result?.failed ?? 0} com falha.`
        );
      }
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
      <div>
        <div className="flex items-center gap-2"><ArchiveRestore className="w-4 h-4 text-red-600"/><h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Classificação Retroativa de Demandas</h3></div>
        <p className="text-xs text-slate-500 mt-1 max-w-3xl">Classifica processos antigos ainda sem categoria usando somente a nova estrutura de demanda. Não reprocessa o e-mail inteiro e não altera risco, status, valores, prazos, obrigações ou classificações manuais.</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button disabled={busy} onClick={() => void action('enqueue')} className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">Preparar fila</button>
        <button disabled={busy || !stats?.pending} onClick={() => void action('run')} className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"><Play className="w-3.5 h-3.5"/>Processar lote agora</button>
        <button disabled={busy} onClick={() => void refresh()} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`}/></button>
      </div>
    </div>
    {stats && <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
      {[['Não classificados',stats.unclassified],['Na fila',stats.pending],['Processando',stats.processing],['Concluídos',stats.done],['Com erro',stats.error]].map(([label,value]) => <div key={String(label)} className="rounded-lg border border-slate-200 p-3"><div className="text-3xs uppercase text-slate-400 font-semibold">{label}</div><div className="text-xl font-bold text-slate-900 mt-1">{Number(value).toLocaleString('pt-BR')}</div></div>)}
    </div>}
    <div className="mt-3 text-3xs text-slate-400">Lote automático: {stats?.batchSize ?? 3} processo(s) por ciclo. Classificações MANUAL e IA_CONFIRMADA são protegidas.</div>
    {message && <div className="mt-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3"><CheckCircle2 className="w-4 h-4 shrink-0"/>{message}</div>}
    {error && <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3"><AlertCircle className="w-4 h-4 shrink-0"/>{error}</div>}
  </div>;
};
