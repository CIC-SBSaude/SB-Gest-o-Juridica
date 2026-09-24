import React, { useEffect, useImperativeHandle, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { managementService } from '../../services/managementService';
import type { ProcessManagementSnapshot } from '../../types/database';
import { formatCurrencyBRL, parseCurrencyBRL } from '../../utils/currency';
import { AiManagementSuggestionsCard } from './AiManagementSuggestionsCard';

const STATUSES = [
  'NAO_CLASSIFICADO','RECEBIDO','EM_TRIAGEM','AGUARDANDO_AREA_INTERNA','AGUARDANDO_ESCRITORIO','EM_PREPARACAO_ESCRITORIO',
  'RESPONDIDO_PROTOCOLADO','AGUARDANDO_DECISAO','COM_DECISAO','EM_RECURSO','EM_CUMPRIMENTO','SUSPENSO','ENCERRADO'
];
const RESPONSABILIDADES = ['OPERADORA','ESCRITORIO','JUDICIARIO','TERCEIRO','SEM_RESPONSAVEL'];
const RISCOS = ['NAO_CLASSIFICADO','BAIXO','MEDIO','ALTO','CRITICO'];

const ALERT_LABELS: Record<string,string> = {
  RISCO_CRITICO: 'Risco crítico', RISCO_ALTO: 'Risco alto', OBRIGACAO_VENCIDA: 'Obrigação vencida',
  OBRIGACAO_PROXIMA: 'Obrigação próxima', PENDENCIA_VENCIDA: 'Pendência vencida', PENDENCIA_PROXIMA: 'Pendência próxima',
  PROXIMA_ACAO_VENCIDA: 'Próxima ação vencida', PROXIMA_ACAO_PROXIMA: 'Próxima ação próxima',
  SLA_ESCRITORIO_VENCIDO: 'SLA do escritório vencido', SLA_ESCRITORIO_PROXIMO: 'SLA do escritório próximo',
  FOLLOWUP_ESCRITORIO_DEVIDO: 'Follow-up do escritório devido', PARADO_OPERADORA: 'Parado com a operadora',
  PARADO_ESCRITORIO: 'Parado com o escritório', SEM_RESPONSAVEL: 'Sem responsável atual',
};

function requiredResponsibility(status: string): string | null {
  if (status === 'AGUARDANDO_ESCRITORIO' || status === 'EM_PREPARACAO_ESCRITORIO') return 'ESCRITORIO';
  if (status === 'AGUARDANDO_AREA_INTERNA') return 'OPERADORA';
  if (status === 'AGUARDANDO_DECISAO') return 'JUDICIARIO';
  return null;
}

export interface ProcessManagementTabHandle {
  save: () => Promise<void>;
}

interface ProcessManagementTabProps {
  processId: string;
  canEdit: boolean;
  onSavingChange?: (saving: boolean) => void;
}

export const ProcessManagementTab = React.forwardRef<ProcessManagementTabHandle, ProcessManagementTabProps>(
({ processId, canEdit, onSavingChange }, ref) => {
  const [data, setData] = useState<ProcessManagementSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});

  const load = async () => {
    setLoading(true); setError(null);
    const res = await managementService.getProcessManagement(processId);
    if (res.error) setError(res.error);
    setData(res.data);
    if (res.data) setForm({
      status_operacional: res.data.status_operacional || 'NAO_CLASSIFICADO',
      responsabilidade_atual: res.data.responsabilidade_atual || 'SEM_RESPONSAVEL',
      proxima_acao: res.data.proxima_acao || '',
      proxima_acao_prazo: res.data.proxima_acao_prazo ? new Date(res.data.proxima_acao_prazo).toISOString().slice(0,16) : '',
      nivel_risco: res.data.nivel_risco || 'NAO_CLASSIFICADO',
      exposicao_estimada: res.data.exposicao_estimada != null ? formatCurrencyBRL(res.data.exposicao_estimada) : '',
      resumo_executivo: res.data.resumo_executivo || '',
      nota_executiva: res.data.nota_executiva || '',
    });
    setLoading(false);
  };
  useEffect(() => { load(); }, [processId]);

  const changeStatus = (status: string) => {
    const forced = requiredResponsibility(status);
    setForm((prev:any) => ({ ...prev, status_operacional: status, ...(forced ? { responsabilidade_atual: forced } : {}) }));
  };

  const save = async () => {
    if (!canEdit) return;
    setSaving(true); onSavingChange?.(true); setError(null); setSuccess(null);
    const exposure = parseCurrencyBRL(form.exposicao_estimada);
    const payload: any = {
      status_operacional: form.status_operacional,
      responsabilidade_atual: form.responsabilidade_atual,
      proxima_acao: form.proxima_acao.trim() || null,
      proxima_acao_prazo: form.proxima_acao_prazo ? new Date(form.proxima_acao_prazo).toISOString() : null,
      nivel_risco: form.nivel_risco,
      exposicao_estimada: exposure,
      resumo_executivo: form.resumo_executivo.trim() || null,
      nota_executiva: form.nota_executiva.trim() || null,
    };
    const res = await managementService.updateProcessManagement(processId, payload);
    setSaving(false); onSavingChange?.(false);
    if (res.error) { setError(res.error); return; }
    setSuccess('Gestão operacional atualizada e validada pelas regras centrais.');
    await load();
  };

  useImperativeHandle(ref, () => ({ save }));

  if (loading) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  const traffic = data?.semaforo_operacional || 'VERDE';
  const trafficClass = traffic === 'VERMELHO' ? 'bg-red-50 border-red-200 text-red-700' : traffic === 'VERDE' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700';
  const alerts = data?.alert_codes || [];
  const forcedResponsibility = requiredResponsibility(form.status_operacional || '');

  return <div className="space-y-4">
    {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
    {success && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{success}</div>}

    <div className={`p-4 rounded-xl border ${trafficClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-bold text-sm"><ShieldAlert className="w-4 h-4" /> Semáforo operacional: {traffic}</div>
        <div className="text-xs">{data?.dias_com_responsavel_atual != null ? `${data.dias_com_responsavel_atual} dia(s) com o responsável atual` : 'Responsabilidade ainda sem marco temporal'}</div>
      </div>
      {alerts.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{alerts.map(code => <span key={code} className="px-2 py-1 rounded-md bg-white/70 border border-current/20 text-[11px] font-semibold">{ALERT_LABELS[code] || code}</span>)}</div>}
    </div>

    <AiManagementSuggestionsCard processId={processId} canEdit={canEdit} onApplied={load} />

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <label className="text-xs font-semibold text-slate-600">Status operacional
        <select disabled={!canEdit} value={form.status_operacional || ''} onChange={e=>changeStatus(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-800">
          {STATUSES.map(v=><option key={v}>{v}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-600">Quem está com a bola
        <select
          disabled={!canEdit || !!forcedResponsibility}
          value={form.responsabilidade_atual || ''}
          onChange={e=>setForm({...form,responsabilidade_atual:e.target.value})}
          className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-800 disabled:bg-slate-50 disabled:text-slate-500"
        >
          {RESPONSABILIDADES.map(v=><option key={v}>{v}</option>)}
        </select>
        {forcedResponsibility && (
          <span className="mt-1.5 block text-[11px] font-normal leading-relaxed text-slate-500">
            O status <strong>{form.status_operacional}</strong> fixa a responsabilidade em <strong>{forcedResponsibility}</strong>. Para mudar quem está com a bola, altere primeiro o status operacional.
          </span>
        )}
      </label>
      <label className="text-xs font-semibold text-slate-600">Nível de risco
        <select disabled={!canEdit} value={form.nivel_risco || ''} onChange={e=>setForm({...form,nivel_risco:e.target.value})} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-800">
          {RISCOS.map(v=><option key={v}>{v}</option>)}
        </select>
      </label>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className="text-xs font-semibold text-slate-600">Próxima ação
        <input disabled={!canEdit} value={form.proxima_acao || ''} onChange={e=>setForm({...form,proxima_acao:e.target.value})} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Ex.: cobrar retorno do escritório" />
      </label>
      <label className="text-xs font-semibold text-slate-600">Prazo da próxima ação
        <input type="datetime-local" disabled={!canEdit} value={form.proxima_acao_prazo || ''} onChange={e=>setForm({...form,proxima_acao_prazo:e.target.value})} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" />
      </label>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className="text-xs font-semibold text-slate-600">Exposição estimada
        <input disabled={!canEdit} value={form.exposicao_estimada || ''} onChange={e=>setForm({...form,exposicao_estimada:e.target.value})} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="R$ 0,00" />
      </label>
      <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3">
        <span className="text-slate-500 block">Exposição atual na visão:</span>
        <strong className="text-slate-900">{formatCurrencyBRL(data?.exposicao_estimada ?? null)}</strong>
      </div>
    </div>

    <label className="text-xs font-semibold text-slate-600 block">Resumo executivo
      <textarea disabled={!canEdit} rows={3} value={form.resumo_executivo || ''} onChange={e=>setForm({...form,resumo_executivo:e.target.value})} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Síntese objetiva para gestão/direção" />
    </label>
    <label className="text-xs font-semibold text-slate-600 block">Nota executiva interna
      <textarea disabled={!canEdit} rows={2} value={form.nota_executiva || ''} onChange={e=>setForm({...form,nota_executiva:e.target.value})} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" />
    </label>

  </div>;
});

ProcessManagementTab.displayName = 'ProcessManagementTab';

