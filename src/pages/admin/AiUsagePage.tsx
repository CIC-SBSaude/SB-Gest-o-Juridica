import React, { useEffect, useState } from 'react';
import { Cpu, Activity, AlertCircle, RefreshCw, Calendar, Clock, Gauge, ListTodo } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { DemandClassificationBackfillPanel } from '../../components/admin/DemandClassificationBackfillPanel';

export interface AiUsageRecord {
  usage_date: string;
  model: string;
  requests_count: number;
  input_tokens: number;
  output_tokens: number;
  quota_exhausted_at: string | null;
  updated_at: string;
}

const capacityLabel = (status: string) => ({
  DISPONIVEL: 'Disponível',
  QUOTA_PROVEDOR_ESGOTADA: 'Quota diária esgotada',
  LIMITE_DIARIO_LOCAL: 'Limite diário de segurança',
  LIMITE_TEMPORARIO: 'Limite temporário',
  CIRCUITO_ABERTO: 'Circuito aberto',
  ACESSO_NEGADO: 'Acesso negado pelo provedor',
  INDISPONIVEL: 'Indisponível',
}[status] || status);

export const AiUsagePage: React.FC = () => {
  const [usageData, setUsageData] = useState<AiUsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState<any>(null);
  const [checkingAccess, setCheckingAccess] = useState<string | null>(null);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);

  const checkAccess = async (model: string) => {
    if (checkingAccess) return;
    setCheckingAccess(model);
    setAccessMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Entre novamente.');
      const response = await fetch('/api/ai/access-check', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha na verificação de acesso.');
      setAccessMessage(`Acesso confirmado para ${model}.`);
    } catch (err: any) {
      setAccessMessage(err.message || 'Falha na verificação de acesso.');
    } finally {
      await fetchUsageData(true);
      setCheckingAccess(null);
    }
  };

  const fetchUsageData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('ai_usage_daily')
        .select('*')
        .order('usage_date', { ascending: false });

      if (fetchErr) {
        throw new Error(fetchErr.message || 'Erro ao consultar ai_usage_daily');
      }

      setUsageData(data || []);

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const response = await fetch('/api/ai/budget', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Falha ao consultar capacidade da IA.');
        setBudget(await response.json());
      }
    } catch (err: any) {
      console.error('[AiUsagePage] Erro ao carregar métricas:', err);
      setError(err.message || 'Falha ao conectar com a tabela public.ai_usage_daily.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsageData();
    const interval = window.setInterval(() => { void fetchUsageData(true); }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  // Agregações do registro mais recente / hoje
  const latestRecord = usageData.length > 0 ? usageData[0] : null;

  const totalCalls = usageData.reduce((acc, curr) => acc + (curr.requests_count || 0), 0);
  const totalInputTokens = usageData.reduce((acc, curr) => acc + (curr.input_tokens || 0), 0);
  const totalOutputTokens = usageData.reduce((acc, curr) => acc + (curr.output_tokens || 0), 0);
  const totalTokens = totalInputTokens + totalOutputTokens;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-red-600">
            Administração
          </span>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#0F172A]">
            Consumo e Uso da IA (Gemini)
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Monitoramento auditável de chamadas, tokens e cotas registradas em <code className="text-slate-700 font-mono">public.ai_usage_daily</code>.
          </p>
        </div>

        <button
          onClick={() => { void fetchUsageData(); }}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Métricas
        </button>
      </div>

      {/* Alerta de erro se houver */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-xs md:text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Erro de Consulta no Banco de Dados:</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Janela real de quota do provedor */}
      {(budget || latestRecord) && (
        <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3.5 text-xs text-blue-900 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Dia de quota do provedor (Pacific Time):</strong>{' '}
              <code className="font-mono bg-blue-100/80 px-1.5 py-0.5 rounded text-blue-950 font-semibold">
                {budget?.providerDayKey || latestRecord?.usage_date || '-'}
              </code>
            </span>
          </div>
          <span className="text-blue-700 text-3xs sm:text-xs">
            {budget?.nextResetAt
              ? `Próximo reset estimado: ${new Date(budget.nextResetAt).toLocaleString('pt-BR')}`
              : latestRecord ? `Última atualização local: ${new Date(latestRecord.updated_at).toLocaleString('pt-BR')}` : ''}
          </span>
        </div>
      )}

      {/* Cards de Métricas Reais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Chamadas */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Chamadas Registradas (Histórico)</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#0F172A]">
              {loading ? '...' : totalCalls.toLocaleString('pt-BR')}
            </span>
            <span className="text-xs text-slate-400">chamadas concluídas</span>
          </div>
          {latestRecord && (
            <p className="text-3xs text-slate-500 mt-2 pt-2 border-t border-slate-100">
              Registro UTC mais recente ({latestRecord.usage_date}): <strong>{latestRecord.requests_count}</strong> chamada(s)
            </p>
          )}
        </div>

        {/* Tokens Utilizados */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Tokens Utilizados</span>
            <Cpu className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#0F172A]">
              {loading ? '...' : totalTokens.toLocaleString('pt-BR')}
            </span>
            <span className="text-xs text-slate-400">tokens totais</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-3xs text-slate-500">
            <span>Entrada (Prompt): <strong className="text-slate-700">{totalInputTokens.toLocaleString('pt-BR')}</strong></span>
            <span>Saída (Resp.): <strong className="text-slate-700">{totalOutputTokens.toLocaleString('pt-BR')}</strong></span>
          </div>
        </div>

        {/* Custo Estimado */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Custo Estimado</span>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-medium text-3xs rounded-full">Oficial</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-600">Custo não configurado</span>
          </div>
          <p className="text-3xs text-slate-400 mt-2 pt-2 border-t border-slate-100">
            Sem regra de precificação de tokens configurada no projeto.
          </p>
        </div>
      </div>

      {/* Modelos e Status de Quota */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Capacidade por Modelo
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Quota, circuit breaker e uso local são indicadores diferentes. O status abaixo combina os três sem fingir que um circuit breaker expirado significa quota restaurada.
            </p>
          </div>
          {budget && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${budget.routerAllowed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
              {budget.routerAllowed ? 'ROTEADOR COM CAPACIDADE' : 'ROTEADOR SEM CAPACIDADE'}
            </span>
          )}
        </div>

        {accessMessage && <p role="status" className="mb-3 text-sm text-slate-700">{accessMessage}</p>}
        {Array.isArray(budget?.routerModelStates) && budget.routerModelStates.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {budget.routerModelStates.map((state: any) => (
              <div key={state.model} className="rounded-lg border border-slate-200 p-4 bg-slate-50/50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-900">{state.model}</div>
                    <div className={`text-xs font-semibold mt-1 ${state.capacityStatus === 'DISPONIVEL' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {capacityLabel(state.capacityStatus)}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">{state.reason}</span>
                </div>

                {state.capacityStatus === 'ACESSO_NEGADO' && <div className="mt-3 text-xs text-rose-800">
                  <p>Regularize o acesso ao projeto no Google. O reset de quota não remove este bloqueio.</p>
                  <p>A verificação envia apenas uma mensagem de teste e consome uma chamada. Requer perfil ADMIN.</p>
                  <button type="button" disabled={checkingAccess !== null}
                    onClick={() => checkAccess(state.model)}
                    className="mt-2 rounded border border-rose-300 px-3 py-2 font-semibold disabled:opacity-50">
                    {checkingAccess === state.model ? 'Verificando acesso...' : 'Verificar acesso após regularização'}
                  </button>
                </div>}
                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
                  <div className="bg-white rounded border border-slate-200 p-2">
                    <div className="text-slate-400">Chamadas locais no dia</div>
                    <div className="font-bold text-slate-800">{state.requestsToday} / {state.effectiveRpd}</div>
                    <div className="text-[10px] text-slate-400">
                      Limite {state.providerRpdSource === 'PROVIDER_ERROR' ? 'informado pelo Gemini' : 'configurado'}: {state.providerRpd}
                    </div>
                    {state.providerRpdObservedAt && <div className="text-[10px] text-slate-400">Observado em {new Date(state.providerRpdObservedAt).toLocaleString('pt-BR')}</div>}
                  </div>
                  <div className="bg-white rounded border border-slate-200 p-2">
                    <div className="text-slate-400">Tokens locais no dia</div>
                    <div className="font-bold text-slate-800">{Number(state.tokensToday || 0).toLocaleString('pt-BR')}</div>
                    <div className="text-[10px] text-slate-400">Entrada + saída</div>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                  {state.quotaExhaustedAt && <div className="text-amber-700">Quota marcada como esgotada: {new Date(state.quotaExhaustedAt).toLocaleString('pt-BR')}</div>}
                  {state.circuitOpenUntil && new Date(state.circuitOpenUntil).getTime() > Date.now() && <div>Nova tentativa após: {new Date(state.circuitOpenUntil).toLocaleString('pt-BR')}</div>}
                  {state.lastSuccessAt && <div className="text-emerald-700">Último sucesso: {new Date(state.lastSuccessAt).toLocaleString('pt-BR')}</div>}
                  {state.lastFailureAt && <div className={state.capacityStatus === 'DISPONIVEL' ? 'text-slate-500' : 'text-rose-700'}>
                    {state.capacityStatus === 'DISPONIVEL' ? 'Falha anterior (modelo liberado)' : 'Última tentativa falhou'}: {new Date(state.lastFailureAt).toLocaleString('pt-BR')}
                    {state.lastErrorCode === 'UNAVAILABLE' ? ' — Google temporariamente indisponível' : state.lastErrorCode ? ` (${state.lastErrorCode})` : ''}
                  </div>}
                  {state.nextResetAt && <div>Próximo reset estimado: {new Date(state.nextResetAt).toLocaleString('pt-BR')}</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500">Carregando estado individual dos modelos...</div>
        )}

        {budget?.counterDisclaimer && (
          <div className="mt-4 bg-amber-50/70 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-900">
            <strong>Atualização automática a cada 30 segundos.</strong> {budget.counterDisclaimer} O saldo exato do projeto deve ser conferido no Google AI Studio.
          </div>
        )}
      </div>

      {/* Governança operacional */}
      {budget && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Governança Operacional da IA</h3>
              <p className="text-xs text-slate-500 mt-1">
                Primário <strong className="font-mono text-slate-800">{budget.model}</strong> · margem de segurança {budget.safetyPercent}% · fonte {budget.configSource}
                {Array.isArray(budget.routerModels) && budget.routerModels.length > 1 && (
                  <span className="block mt-1 text-[11px] text-slate-500">
                    Fallback: {budget.routerModels.slice(1).join(' → ')}
                  </span>
                )}
              </p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              (budget.routerAllowed ?? budget.allowed) ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              {(budget.routerAllowed ?? budget.allowed) ? 'ROTEADOR ATIVO' : 'TODOS OS MODELOS LIMITADOS'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500"><Calendar className="w-3.5 h-3.5"/>RPD</div>
              <div className="mt-1 font-bold text-slate-900">{budget.requestsToday} / {budget.effectiveRpd}</div>
              <div className="text-3xs text-slate-400">Provedor: {budget.providerRpd}</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500"><Gauge className="w-3.5 h-3.5"/>RPM atual</div>
              <div className="mt-1 font-bold text-slate-900">{budget.requestsCurrentMinute} / {budget.effectiveRpm}</div>
              <div className="text-3xs text-slate-400">Provedor: {budget.providerRpm}/min</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500"><Cpu className="w-3.5 h-3.5"/>TPM atual</div>
              <div className="mt-1 font-bold text-slate-900">{Number(budget.tokensCurrentMinute || 0).toLocaleString('pt-BR')} / {Number(budget.effectiveTpm || 0).toLocaleString('pt-BR')}</div>
              <div className="text-3xs text-slate-400">Provedor: {Number(budget.providerTpm || 0).toLocaleString('pt-BR')}/min</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500"><ListTodo className="w-3.5 h-3.5"/>Fila IA</div>
              <div className="mt-1 font-bold text-slate-900">{budget.queuePending} aguardando</div>
              <div className="text-3xs text-slate-400">PENDENTE_IA</div>
            </div>
          </div>
        </div>
      )}

      <DemandClassificationBackfillPanel />

      {/* Tabela de Histórico Real */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-[#0F172A]">
              Histórico Local Diário de Uso da IA - UTC (<code className="font-mono text-xs">public.ai_usage_daily</code>)
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {usageData.length} registro(s)
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto mb-2" />
            Consultando registros reais de consumo de IA...
          </div>
        ) : usageData.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Nenhum registro encontrado na tabela <code className="font-mono">ai_usage_daily</code>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200/80 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Data (UTC)</th>
                  <th className="py-3 px-4">Modelo</th>
                  <th className="py-3 px-4 text-center">Chamadas</th>
                  <th className="py-3 px-4 text-right">Input Tokens</th>
                  <th className="py-3 px-4 text-right">Output Tokens</th>
                  <th className="py-3 px-4 text-right">Total Tokens</th>
                  <th className="py-3 px-4 text-center">Cota Esgotada?</th>
                  <th className="py-3 px-4 text-right">Atualizado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {usageData.map((row, idx) => {
                  const rowTotalTokens = (row.input_tokens || 0) + (row.output_tokens || 0);
                  return (
                    <tr key={row.usage_date + row.model + idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-[#0F172A]">
                        {row.usage_date}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {row.model}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-[#0F172A]">
                        {row.requests_count}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {row.input_tokens?.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {row.output_tokens?.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {rowTotalTokens.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.quota_exhausted_at ? (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-3xs font-semibold">
                            SIM ({new Date(row.quota_exhausted_at).toLocaleTimeString('pt-BR')})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-3xs">
                            NÃO
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400 font-mono text-3xs">
                        {new Date(row.updated_at).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
