import React, { useEffect, useMemo, useState } from 'react';
import { Bot, History, Loader2, Settings2, Shield, UserRound } from 'lucide-react';
import { historyService, type UnifiedHistoryEntry, type UnifiedHistoryKind } from '../../services/historyService';
import { formatDateTime } from '../../utils/date';

interface ProcessHistoryTabProps {
  processId: string;
}

type Filter = 'TODOS' | UnifiedHistoryKind;

const FIELD_LABELS: Record<string, string> = {
  status_operacional: 'Status operacional',
  responsabilidade_atual: 'Responsabilidade atual',
  responsabilidade_desde: 'Responsabilidade desde',
  nivel_risco: 'Nível de risco',
  proxima_acao: 'Próxima ação',
  proxima_acao_prazo: 'Prazo da próxima ação',
  exposicao_estimada: 'Exposição estimada',
  resumo_executivo: 'Resumo executivo',
  nota_executiva: 'Nota executiva',
  law_firm_id: 'Escritório jurídico',
  MOTIVO_ATUALIZACAO: 'Motivo da atualização',
};

const humanizeField = (value: string) =>
  FIELD_LABELS[value] ||
  String(value || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

export const ProcessHistoryTab: React.FC<ProcessHistoryTabProps> = ({ processId }) => {
  const [history, setHistory] = useState<UnifiedHistoryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('TODOS');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await historyService.getUnifiedProcessHistory(processId);
      if (err) setError(err);
      else setHistory(data);
      setLoading(false);
    };
    void loadHistory();
  }, [processId]);

  const counts = useMemo(() => ({
    total: history.length,
    processual: history.filter((entry) => entry.kind === 'PROCESSUAL').length,
    operacional: history.filter((entry) => entry.kind === 'OPERACIONAL').length,
  }), [history]);

  const visibleHistory = useMemo(
    () => filter === 'TODOS' ? history : history.filter((entry) => entry.kind === filter),
    [history, filter],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-500" />
            Histórico & Auditoria
          </h4>
          <p className="mt-1 text-[11px] text-slate-500">
            Alterações processuais e operacionais consolidadas em ordem cronológica.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter('TODOS')}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition ${
              filter === 'TODOS'
                ? 'border-slate-300 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Todos {counts.total}
          </button>
          <button
            type="button"
            onClick={() => setFilter('PROCESSUAL')}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition ${
              filter === 'PROCESSUAL'
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Processual {counts.processual}
          </button>
          <button
            type="button"
            onClick={() => setFilter('OPERACIONAL')}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition ${
              filter === 'OPERACIONAL'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Operacional {counts.operacional}
          </button>
        </div>
      </div>

      {visibleHistory.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-sm">
          Nenhuma alteração registrada para este filtro.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleHistory.map((entry) => {
            const operational = entry.kind === 'OPERACIONAL';
            const reasonOnly = entry.field_name === 'MOTIVO_ATUALIZACAO' && entry.reason;
            const fromAi = /GEMINI|IA/i.test(entry.source) || /Sugestão gerencial da IA/i.test(entry.reason || '');

            return (
              <div
                key={entry.id}
                className={`bg-white border rounded-lg p-3 transition-colors ${
                  operational
                    ? 'border-red-100 hover:bg-red-50/20'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        operational
                          ? 'bg-red-50 text-red-700 border-red-100'
                          : 'bg-blue-50 text-blue-700 border-blue-100'
                      }`}
                    >
                      {operational ? <Settings2 className="w-3 h-3" /> : <History className="w-3 h-3" />}
                      {entry.kind}
                    </span>
                    <span className="text-xs font-bold text-slate-800">
                      {humanizeField(entry.field_name)}
                    </span>
                    {fromAi && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                        <Bot className="w-3 h-3" />
                        IA
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] font-medium text-slate-500">
                    {formatDateTime(entry.changed_at)}
                  </span>
                </div>

                {reasonOnly ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <span className="block text-[10px] uppercase font-bold text-amber-800/70 mb-1">
                      Justificativa / Motivo
                    </span>
                    <div className="text-xs text-amber-900 whitespace-pre-wrap">
                      {entry.reason}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mt-3">
                      <div className="bg-red-50/50 border border-red-100 rounded p-2">
                        <span className="block text-[10px] uppercase font-bold text-red-800/70 mb-1">
                          Valor anterior
                        </span>
                        <div className="text-slate-600 font-mono break-all whitespace-pre-wrap max-h-32 overflow-y-auto">
                          {entry.old_value || <span className="italic text-slate-400">Nenhum valor / Vazio</span>}
                        </div>
                      </div>

                      <div className="bg-emerald-50/50 border border-emerald-100 rounded p-2">
                        <span className="block text-[10px] uppercase font-bold text-emerald-800/70 mb-1">
                          Novo valor
                        </span>
                        <div className="text-slate-700 font-mono font-medium break-all whitespace-pre-wrap max-h-32 overflow-y-auto">
                          {entry.new_value || <span className="italic text-slate-400">Removido / Vazio</span>}
                        </div>
                      </div>
                    </div>

                    {entry.reason && (
                      <div className="mt-2 rounded-md bg-amber-50 border border-amber-100 px-2.5 py-2 text-[11px] text-amber-800">
                        <strong>Motivo:</strong> {entry.reason}
                      </div>
                    )}
                  </>
                )}

                <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="w-3 h-3" />
                    Modificado por:
                    <strong className="text-slate-700">
                      {entry.user?.display_name || 'Sistema'}
                    </strong>
                  </span>
                  <span>
                    Origem: <strong className="text-slate-700">{entry.source}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
