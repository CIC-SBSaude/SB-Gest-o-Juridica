import React, { useMemo, useState, useEffect } from 'react';
import {
  BrainCircuit,
  Search,
  Loader2,
  Link as LinkIcon,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Scale,
  Sparkles,
  History,
  Workflow,
  UserCheck,
} from 'lucide-react';
import { ProcessedEmail } from '../../types/database';
import { inboxService, InboxFilters } from '../../services/inboxService';
import { EmailDetailsModal } from '../../components/inbox/EmailDetailsModal';
import { LinkProcessModal } from '../../components/inbox/LinkProcessModal';
import { HumanReviewModal } from '../../components/inbox/HumanReviewModal';
import { RecordActionModal } from '../../components/common/RecordActionModal';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';

const eventLabel = (item: ProcessedEmail) => {
  const keywords: string[] = item.metadata?.legal_summary?.keywords || item.metadata?.keywords_found || [];
  const haystack = `${item.subject || ''} ${keywords.join(' ')}`.toLowerCase();
  if (haystack.includes('bloqueio judicial')) return 'Bloqueio judicial';
  if (haystack.includes('liminar')) return 'Liminar';
  if (haystack.includes('tutela')) return 'Tutela de urgência';
  if (haystack.includes('sentença')) return 'Sentença';
  if (haystack.includes('acórdão')) return 'Acórdão';
  if (haystack.includes('decisão')) return 'Decisão judicial';
  if (haystack.includes('intima')) return 'Intimação';
  if (haystack.includes('citação') || haystack.includes('citado')) return 'Citação';
  if (haystack.includes('audiência')) return 'Audiência';
  if (haystack.includes('recurso') || haystack.includes('apelação') || haystack.includes('agravo')) return 'Recurso';
  if (item.classification === 'NÃO JURÍDICO') return 'Conteúdo não jurídico';
  return 'Comunicação jurídica';
};

const actionLabel = (item: ProcessedEmail) => {
  const action = item.metadata?.process_application?.action;
  const excType = item.metadata?.process_application?.exception_type || item.metadata?.semantic_interpretation?.exception_type;
  const excReason = item.metadata?.process_application?.exception_reason || item.metadata?.exception_reason;

  if (item.status === 'EXCECAO') {
    if (excType === 'CNJ_DV_PENDENTE_VALIDACAO') return 'Revisar: validar dígito do CNJ';
    if (excType === 'CNJ_MULTIPLO_AMBIGUO') return 'Revisar: CNJ ambíguo';
    if (excType === 'PROTOCOLO_MULTIPLO_AMBIGUO') return 'Revisar: protocolo ambíguo';
    if (excType === 'IA_BAIXA_CONFIANCA') return 'Revisar: confiança insuficiente';
    if (excType === 'PROCESS_NOT_FOUND') return 'Revisar: processo não encontrado';
    if (excType === 'MISSING_DATA') return 'Revisar: dados faltantes';
    if (excReason) {
      const short = excReason.length > 35 ? `${excReason.substring(0, 32)}...` : excReason;
      return `Revisar: ${short}`;
    }
    return 'Revisar: exceção pendente';
  }

  if (item.status === 'PENDENTE_IA') {
    const aiState = item.metadata?.ai_state;
    if (aiState === 'SKIPPED_BUDGET') return 'Aguardando cota diária da IA';
    if (aiState === 'PAUSED_429') return 'IA pausada por limite de quota';
    if (aiState === 'SKIPPED_NO_KEY') return 'IA ainda não configurada';
    return 'Aguardando interpretação por IA';
  }
  if (item.status === 'IRRELEVANTE') return 'Fora da esteira jurídica';
  if (action === 'PROCESS_LINKED_OR_CREATED') return 'Aplicado à Gestão de Processos';
  if (action === 'PROCESS_LINKED') return 'Vinculado à Gestão de Processos';
  if (item.process_id) return 'Aplicado ao processo';
  return 'Interpretado, aguardando definição';
};

const statusClasses = (status: string) => {
  if (status === 'PENDENTE_IA') return 'bg-indigo-100 text-indigo-700';
  if (status === 'EXCECAO' || status === 'ERRO') return 'bg-red-100 text-red-700';
  if (status === 'IRRELEVANTE') return 'bg-slate-100 text-slate-600';
  if (status === 'PROCESSADO') return 'bg-emerald-100 text-emerald-700';
  return 'bg-amber-100 text-amber-700';
};

const summaryValues = (item: ProcessedEmail) => {
  const s = item.metadata?.legal_summary || {};
  return [
    ...(s.process_numbers || []).slice(0, 1).map((v: string) => `Processo ${v}`),
    ...(s.party_names || []).slice(0, 1).map((v: string) => v),
    ...(s.monetary_values || []).slice(0, 1).map((v: string) => v),
    ...(s.dates || []).slice(0, 1).map((v: string) => v),
  ].slice(0, 3);
};

export const LegalInboxPage: React.FC = () => {
  const { profile } = useAuth();
  const [items, setItems] = useState<ProcessedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InboxFilters>({});
  const [view, setView] = useState<'queue' | 'history'>('queue');

  const [selectedItem, setSelectedItem] = useState<ProcessedEmail | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [actionItem, setActionItem] = useState<ProcessedEmail | null>(null);

  const [itemToLink, setItemToLink] = useState<ProcessedEmail | null>(null);
  const [isLinkOpen, setIsLinkOpen] = useState(false);

  // Modal de Revisão Humana
  const [itemToReview, setItemToReview] = useState<ProcessedEmail | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  // Confirmação controlada de reanálise com IA (evita window.confirm em preview/iframe)
  const [itemToReanalyze, setItemToReanalyze] = useState<ProcessedEmail | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isTestingImap, setIsTestingImap] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [interpretingId, setInterpretingId] = useState<string | null>(null);
  const [individualMessage, setIndividualMessage] = useState<{ success: boolean; text: string } | null>(null);

  const canEdit = ['ADMIN', 'GESTOR', 'ANALISTA'].includes(profile?.role || '');
  const canSync = ['ADMIN', 'GESTOR'].includes(profile?.role || '');
  const canReanalyze = ['ADMIN', 'GESTOR'].includes(profile?.role || '');

  const loadItems = async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await inboxService.getProcessedEmails(filters);
    if (error) {
      setItems([]);
      setLoadError(error);
    } else {
      setItems(data);
    }
    setLoading(false);
  };

  useEffect(() => { loadItems(); }, [filters]);

  const visibleItems = useMemo(() => items.filter((item) => {
    const actionable = item.status === 'PENDENTE_IA' || item.status === 'EXCECAO' || item.status === 'RECEBIDO' || (item.status === 'PROCESSADO' && !item.process_id);
    return view === 'queue' ? actionable : !actionable;
  }), [items, view]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setFilters((prev) => ({ ...prev, search: String(fd.get('search') || '') || undefined }));
  };

  const getSessionToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Não autenticado. Sessão expirada ou inválida.');
    return session.access_token;
  };

  const handleOpenReview = (item: ProcessedEmail) => {
    setItemToReview(item);
    setIsReviewOpen(true);
  };

  const handleCloseReview = (changed?: boolean) => {
    setIsReviewOpen(false);
    setItemToReview(null);
    if (changed) {
      loadItems();
    }
  };

  const handleInterpretSingle = async (emailId: string, forceReanalysis = false) => {
    if (interpretingId) return;
    setInterpretingId(emailId);
    setIndividualMessage(null);
    try {
      const token = await getSessionToken();
      const res = await fetch(`/api/ai/process/${emailId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ force_reanalysis: forceReanalysis }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Resposta não estruturada da rota de IA (HTTP ${res.status}): ${text.slice(0, 120)}`);
      }

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error?.message || data?.error || 'Falha ao interpretar com IA.');
      }

      setIndividualMessage({
        success: true,
        text: `${forceReanalysis ? 'Reanálise' : 'Interpretação'} concluída com sucesso (${data.result?.eventType || 'Evento identificado'}).`,
      });
      await loadItems();
    } catch (err: any) {
      setIndividualMessage({
        success: false,
        text: err.message || 'Falha inesperada durante a interpretação individual.',
      });
    } finally {
      setInterpretingId(null);
    }
  };

  const handleTestImap = async () => {
    if (isTestingImap || isSyncing) return;
    setIsTestingImap(true);
    setSyncResult(null);
    try {
      const token = await getSessionToken();
      const res = await fetch('/api/imap/test', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Falha ao validar origem IMAP.');
      setSyncResult({ success: true, testOnly: true, message: `Origem IMAP disponível via ${data.loginMethod}. ${data.exists} mensagens na ${data.mailbox}. Leitura somente leitura ativa.` });
    } catch (err: any) {
      setSyncResult({ success: false, testOnly: true, error: err.message });
    } finally { setIsTestingImap(false); }
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const token = await getSessionToken();
      const res = await fetch('/api/imap/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) throw new Error(`Resposta inválida do servidor (HTTP ${res.status}).`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error?.message || data?.error || 'Falha no processamento das comunicações.');
      setSyncResult({ success: true, ...data });
      await loadItems();
    } catch (err: any) {
      setSyncResult({ success: false, error: err.message });
    } finally { setIsSyncing(false); }
  };

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-slate-500" />
            Central de Interpretação Jurídica
          </h1>
          <p className="text-sm text-slate-500 mt-1">Tratamento de comunicações recebidas antes de sua aplicação à Gestão de Processos.</p>
        </div>
        {canSync && (
          <div className="flex items-center gap-2">
            <button onClick={handleTestImap} disabled={isTestingImap || isSyncing} className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-sm font-semibold rounded-lg disabled:opacity-60 cursor-pointer">
              {isTestingImap ? <Loader2 className="w-4 h-4 animate-spin" /> : <Workflow className="w-4 h-4" />}
              {isTestingImap ? 'Testando...' : 'Testar origem IMAP'}
            </button>
            <button onClick={handleSync} disabled={isSyncing || isTestingImap} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg disabled:opacity-60 cursor-pointer">
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Processando...' : 'Processar comunicações'}
            </button>
          </div>
        )}
      </div>

      {syncResult && (
        <div className={`p-4 rounded-xl border ${syncResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'} flex items-start gap-3`}>
          {syncResult.success ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <XCircle className="w-5 h-5 text-red-600 shrink-0" />}
          <div className="flex-1 text-sm">
            <div className={`font-semibold ${syncResult.success ? 'text-emerald-800' : 'text-red-800'}`}>{syncResult.testOnly ? 'Validação da origem' : syncResult.success ? 'Processamento concluído' : 'Falha no processamento'}</div>
            {syncResult.testOnly ? <div className="mt-1 text-emerald-700">{syncResult.message}</div> : syncResult.success ? (
              <div className="mt-1 text-emerald-700 flex flex-wrap gap-4">
                <span>Encontrados: <b>{syncResult.found}</b></span><span>Novos: <b>{syncResult.inserted}</b></span>
                {typeof syncResult.reprocessed === 'number' && <span>Reprocessados: <b>{syncResult.reprocessed}</b></span>}
                {typeof syncResult.processes_created === 'number' && <span>Processos criados: <b>{syncResult.processes_created}</b></span>}
                {typeof syncResult.processes_linked === 'number' && <span>Processos vinculados: <b>{syncResult.processes_linked}</b></span>}
                {typeof syncResult.ai_interpreted === 'number' && <span>Interpretados por IA: <b>{syncResult.ai_interpreted}</b></span>}
                {typeof syncResult.obligations_created === 'number' && <span>Obrigações criadas: <b>{syncResult.obligations_created}</b></span>}
                <span>Erros: <b>{syncResult.errors}</b></span>
              </div>
            ) : <div className="mt-1 text-red-700">{syncResult.error}</div>}
          </div>
          <button onClick={() => setSyncResult(null)} className="cursor-pointer"><XCircle className="w-4 h-4 text-slate-400" /></button>
        </div>
      )}

      {individualMessage && (
        <div className={`p-4 rounded-xl border ${individualMessage.success ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'bg-red-50 border-red-200 text-red-900'} flex items-center justify-between`}>
          <div className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            {individualMessage.text}
          </div>
          <button onClick={() => setIndividualMessage(null)} className="cursor-pointer"><XCircle className="w-4 h-4 opacity-60 hover:opacity-100" /></button>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="inline-flex rounded-lg bg-slate-100 p-1 shrink-0">
            <button onClick={() => setView('queue')} className={`px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer ${view === 'queue' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'}`}><Sparkles className="w-4 h-4 inline mr-1.5" />Em tratamento</button>
            <button onClick={() => setView('history')} className={`px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer ${view === 'history' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'}`}><History className="w-4 h-4 inline mr-1.5" />Histórico</button>
          </div>
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input name="search" placeholder="Buscar por processo, evento ou referência..." className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500 text-xs" />
          </form>
          <select onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value || undefined }))} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium">
            <option value="">Todos os status</option><option value="PENDENTE_IA">Pendente IA</option><option value="EXCECAO">Exceção</option><option value="PROCESSADO">Processado</option><option value="IRRELEVANTE">Irrelevante</option><option value="RECEBIDO">Recebido</option>
          </select>
        </div>
      </div>

      {loadError && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Falha ao carregar a Central de Interpretação: {loadError}</div>}

      {loading ? <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div> : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed 2xl:table-auto text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-3 xl:px-4 py-3 w-[12%] min-w-[86px]">Status</th>
                  <th className="px-3 xl:px-4 py-3 w-[24%] min-w-[150px]">Evento interpretado</th>
                  <th className="hidden md:table-cell px-3 xl:px-4 py-3 w-[22%] min-w-[160px]">Processo</th>
                  <th className="hidden 2xl:table-cell px-3 xl:px-4 py-3 min-w-[190px]">Dados identificados</th>
                  <th className="hidden lg:table-cell px-3 xl:px-4 py-3 w-[16%] min-w-[120px]">Confiança</th>
                  <th className="hidden xl:table-cell px-3 xl:px-4 py-3 min-w-[170px]">Ação da esteira</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {visibleItems.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nenhum item nesta etapa da interpretação.</td></tr> : visibleItems.map((item) => {
                  const values = summaryValues(item);
                  return <tr key={item.id} tabIndex={0} role="button" onClick={(e) => { if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return; setActionItem(item); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActionItem(item); } }} className="cursor-pointer hover:bg-slate-50/80 focus:bg-slate-50 align-top transition-colors outline-none">
                    <td className="px-3 xl:px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusClasses(item.status)}`}>{item.status}</span></td>
                    <td className="px-3 xl:px-4 py-3 min-w-[160px]"><div className="font-semibold text-slate-800">{eventLabel(item)}</div><div className="text-[11px] text-slate-400 mt-1">{item.classification || 'Não classificado'}</div></td>
                    <td className="px-3 xl:px-4 py-3 min-w-[170px]">{item.process_id ? <div><div className="font-mono font-semibold text-slate-700">{item.process?.numero_processo || item.matched_process_number}</div><div className="text-xs text-slate-500 mt-1">{item.process?.status_atual || 'Vinculado'}</div></div> : item.matched_process_number ? <div className="font-mono text-amber-700">{item.matched_process_number}<div className="text-xs font-sans text-amber-600">candidato</div></div> : <span className="text-slate-400">Não identificado</span>}</td>
                    <td className="hidden 2xl:table-cell px-3 xl:px-4 py-3 min-w-[200px]">{values.length ? <div className="flex flex-wrap gap-1.5">{values.map((v) => <span key={v} className="px-2 py-1 bg-slate-100 rounded-md text-xs text-slate-700 max-w-[240px] truncate">{v}</span>)}</div> : <span className="text-slate-400">Sem dado estruturado</span>}</td>
                    <td className="px-3 xl:px-4 py-3"><div className="text-xs text-slate-500">Relevância <b className="text-slate-700">{item.relevance_score ?? '—'}</b></div><div className="text-xs text-slate-500 mt-1">Necessidade IA <b className="text-slate-700">{item.ai_need_score ?? '—'}</b></div></td>
                    <td className="px-3 xl:px-4 py-3 min-w-[180px]"><div className="text-xs font-medium text-slate-700">{actionLabel(item)}</div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}


      <RecordActionModal
        isOpen={Boolean(actionItem)}
        title={actionItem?.subject || '(Sem assunto)'}
        subtitle={actionItem ? `${actionItem.sender_email || 'Remetente não identificado'} · ${eventLabel(actionItem)}` : undefined}
        onClose={() => setActionItem(null)}
        actions={actionItem ? <>
          <button type="button" onClick={() => { setSelectedItem(actionItem); setIsDetailsOpen(true); setActionItem(null); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Detalhes</button>
          {canEdit && actionItem.status === 'EXCECAO' && <button type="button" onClick={() => { handleOpenReview(actionItem); setActionItem(null); }} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700">Revisar</button>}
          {canEdit && actionItem.status === 'PENDENTE_IA' && Number(actionItem.relevance_score || 0) >= 55 && Number(actionItem.ai_need_score || 0) >= 40 && <button type="button" disabled={interpretingId === actionItem.id} onClick={async () => { const id = actionItem.id; setActionItem(null); await handleInterpretSingle(id); }} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">Interpretar com IA</button>}
          {canReanalyze && ['PROCESSADO', 'IRRELEVANTE'].includes(actionItem.status) && <button type="button" onClick={() => { setItemToReanalyze(actionItem); setActionItem(null); }} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Reanalisar IA</button>}
          {canEdit && !actionItem.process_id && actionItem.status !== 'IRRELEVANTE' && actionItem.status !== 'EXCECAO' && <button type="button" onClick={() => { setItemToLink(actionItem); setIsLinkOpen(true); setActionItem(null); }} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Vincular ao processo</button>}
        </> : null}
      >
        {actionItem && <div className="space-y-4 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><div className="text-[11px] font-semibold uppercase text-slate-400">Status</div><div className="mt-1 font-semibold">{actionItem.status}</div></div>
            <div><div className="text-[11px] font-semibold uppercase text-slate-400">Ação da esteira</div><div className="mt-1">{actionLabel(actionItem)}</div></div>
            <div><div className="text-[11px] font-semibold uppercase text-slate-400">Processo</div><div className="mt-1 font-mono">{actionItem.process?.numero_processo || actionItem.matched_process_number || 'Não identificado'}</div></div>
            <div><div className="text-[11px] font-semibold uppercase text-slate-400">Confiança</div><div className="mt-1">Relevância {actionItem.relevance_score ?? '—'} · IA {actionItem.ai_need_score ?? '—'}</div></div>
          </div>
          {summaryValues(actionItem).length > 0 && <div><div className="text-[11px] font-semibold uppercase text-slate-400">Dados identificados</div><div className="mt-2 flex flex-wrap gap-2">{summaryValues(actionItem).map(v => <span key={v} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{v}</span>)}</div></div>}
        </div>}
      </RecordActionModal>

      {itemToReanalyze && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="reanalyze-title">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
              <div>
                <h3 id="reanalyze-title" className="text-base font-bold text-slate-900">Reanalisar com IA</h3>
                <p className="mt-1 text-xs text-slate-500">Uma nova chamada ao Gemini será executada para esta comunicação.</p>
              </div>
              <button
                type="button"
                onClick={() => setItemToReanalyze(null)}
                disabled={interpretingId === itemToReanalyze.id}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Fechar"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
                <div className="font-semibold">O resultado anterior será preservado.</div>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-indigo-800">
                  <li>Haverá novo consumo de tokens da IA.</li>
                  <li>Campos já preenchidos não serão sobrescritos silenciosamente.</li>
                  <li>A reanálise ficará registrada no histórico de auditoria.</li>
                </ul>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
                <div><span className="font-semibold text-slate-800">Assunto:</span> {itemToReanalyze.subject || 'Sem assunto'}</div>
                {(itemToReanalyze.process?.numero_processo || itemToReanalyze.matched_process_number) && (
                  <div className="mt-1"><span className="font-semibold text-slate-800">Processo:</span> {itemToReanalyze.process?.numero_processo || itemToReanalyze.matched_process_number}</div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setItemToReanalyze(null)}
                disabled={interpretingId === itemToReanalyze.id}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const emailId = itemToReanalyze.id;
                  await handleInterpretSingle(emailId, true);
                  setItemToReanalyze(null);
                }}
                disabled={interpretingId === itemToReanalyze.id}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
              >
                {interpretingId === itemToReanalyze.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {interpretingId === itemToReanalyze.id ? 'Reanalisando...' : 'Confirmar reanálise'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedItem && <EmailDetailsModal isOpen={isDetailsOpen} emailId={selectedItem.id} onClose={() => { setIsDetailsOpen(false); setSelectedItem(null); }} />}
      {itemToLink && <LinkProcessModal isOpen={isLinkOpen} email={itemToLink} onClose={(changed) => { setIsLinkOpen(false); setItemToLink(null); if (changed) loadItems(); }} />}
      {itemToReview && <HumanReviewModal isOpen={isReviewOpen} emailId={itemToReview.id} onClose={handleCloseReview} />}
    </div>
  );
};
