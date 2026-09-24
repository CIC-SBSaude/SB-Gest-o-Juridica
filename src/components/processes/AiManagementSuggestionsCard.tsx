import React, { useEffect, useState } from 'react';
import { Bot, Check, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import {
  aiManagementService,
  type AiManagementFieldName,
  type AiManagementSuggestion,
} from '../../services/aiManagementService';

const FIELD_LABELS: Record<AiManagementFieldName, string> = {
  resumo_executivo: 'Resumo executivo',
  status_operacional: 'Status operacional',
  responsabilidade_atual: 'Quem está com a bola',
  nivel_risco: 'Nível de risco',
  proxima_acao: 'Próxima ação',
};

const FIELDS: AiManagementFieldName[] = [
  'resumo_executivo',
  'status_operacional',
  'responsabilidade_atual',
  'nivel_risco',
  'proxima_acao',
];

function confidenceLabel(value: number) {
  const pct = Math.round((Number(value) || 0) * 100);
  if (pct >= 90) return { pct, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (pct >= 75) return { pct, cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { pct, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
}

export function AiManagementSuggestionsCard({
  processId,
  canEdit,
  onApplied,
}: {
  processId: string;
  canEdit: boolean;
  onApplied: () => Promise<void> | void;
}) {
  const [suggestion, setSuggestion] = useState<AiManagementSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState<AiManagementFieldName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadLatest = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuggestion(await aiManagementService.latest(processId));
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar sugestões da IA.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLatest(); }, [processId]);

  const generate = async () => {
    try {
      setGenerating(true);
      setError(null);
      setSuccess(null);
      const next = await aiManagementService.generate(processId);
      setSuggestion(next);
      setSuccess('Sugestões gerenciais geradas. Revise cada campo antes de aplicar.');
    } catch (e: any) {
      setError(e?.message || 'Falha ao gerar sugestões gerenciais.');
    } finally {
      setGenerating(false);
    }
  };

  const apply = async (field: AiManagementFieldName) => {
    if (!suggestion) return;
    try {
      setApplying(field);
      setError(null);
      setSuccess(null);
      await aiManagementService.apply(suggestion.id, field);
      setSuggestion((prev) => prev ? {
        ...prev,
        applied_fields: Array.from(new Set([...(prev.applied_fields || []), field])),
        status: 'APLICADA_PARCIAL',
      } : prev);
      setSuccess(`${FIELD_LABELS[field]} aplicado após confirmação humana.`);
      await onApplied();
    } catch (e: any) {
      setError(e?.message || 'Falha ao aplicar sugestão.');
    } finally {
      setApplying(null);
    }
  };

  return (
    <section className="rounded-xl border border-red-100 bg-gradient-to-br from-white to-red-50/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-red-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Sparkles className="w-4 h-4 text-red-600" /> Sugestões da IA
          </div>
          <p className="text-[11px] text-slate-500 mt-1">A IA sugere. A decisão e a aplicação continuam humanas.</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : suggestion ? <RefreshCw className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            {suggestion ? 'Gerar nova análise' : 'Gerar sugestões'}
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
        {success && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2"><ShieldCheck className="w-4 h-4" />{success}</div>}

        {loading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : !suggestion ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-500">
            Nenhuma sugestão gerencial gerada para este processo.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span>Modelo: <strong className="text-slate-700">{suggestion.model}</strong></span>
              <span>•</span>
              <span>Gerado em {new Date(suggestion.generated_at).toLocaleString('pt-BR')}</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {FIELDS.map((field) => {
                const item = suggestion.suggestions?.[field];
                if (!item?.value) return null;
                const confidence = confidenceLabel(item.confidence);
                const applied = (suggestion.applied_fields || []).includes(field);
                return (
                  <div key={field} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-800">{FIELD_LABELS[field]}</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${confidence.cls}`}>{confidence.pct}% confiança</span>
                          {applied && <span className="px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-semibold">Aplicado</span>}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-900 whitespace-pre-wrap">{item.value}</div>
                        <div className="mt-2 text-[11px] text-slate-600"><strong>Justificativa:</strong> {item.rationale}</div>
                        {item.basis?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.basis.map((basis, index) => <span key={index} className="px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-[10px] text-slate-600">{basis}</span>)}
                          </div>
                        )}
                      </div>
                      {canEdit && !applied && (
                        <button
                          type="button"
                          onClick={() => apply(field)}
                          disabled={applying !== null}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {applying === field ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Aplicar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {suggestion.suggestions?.warnings?.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">
                <strong>Atenções da IA:</strong> {suggestion.suggestions.warnings.join(' • ')}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
