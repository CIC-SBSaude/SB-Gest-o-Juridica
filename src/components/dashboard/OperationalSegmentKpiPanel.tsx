import React, { useEffect, useState, useCallback } from 'react';
import {
  analyticsService,
  SegmentCoverageItem,
  FinancialAggregates,
  QualityPendencySummaryItem,
  ProviderCategorySummaryItem,
} from '../../services/analyticsService';
import { ShieldCheck, DollarSign, AlertTriangle, Layers, Building2, Copy } from 'lucide-react';

const formatBRL = (val: number | null | undefined): string => {
  if (val === null || val === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

export const OperationalSegmentKpiPanel: React.FC = () => {
  const [coverage, setCoverage] = useState<SegmentCoverageItem[]>([]);
  const [financial, setFinancial] = useState<FinancialAggregates | null>(null);
  const [pendencies, setPendencies] = useState<QualityPendencySummaryItem[]>([]);
  const [providerSummary, setProviderSummary] = useState<ProviderCategorySummaryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [covRes, finRes, penRes, provRes] = await Promise.all([
      analyticsService.getSegmentCoverage(),
      analyticsService.getFinancialAggregates(),
      analyticsService.getQualityPendencySummary(),
      analyticsService.getProviderCategorySummary(),
    ]);
    setCoverage(covRes.data);
    setFinancial(finRes.data);
    setPendencies(penRes.data);
    setProviderSummary(provRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <div className="p-4 text-xs text-gray-500">Carregando indicadores operacionais...</div>;
  }

  // Cálculos de cobertura de segmento
  const totalGeral = coverage.reduce((acc, c) => acc + c.total, 0);
  const totalClassificados = coverage.filter(c => c.segmento !== 'NAO_CLASSIFICADO').reduce((acc, c) => acc + c.total, 0);
  const pctClassificado = totalGeral > 0 ? Math.round((totalClassificados / totalGeral) * 100) : 0;

  const assistencialCount = coverage.find(c => c.segmento === 'ASSISTENCIAL')?.total || 0;
  const prestadorCount = coverage.find(c => c.segmento === 'PRESTADOR')?.total || 0;
  const outroCount = coverage.find(c => c.segmento === 'OUTRO')?.total || 0;
  const naoClassificadoCount = coverage.find(c => c.segmento === 'NAO_CLASSIFICADO')?.total || 0;

  const totalPendenciasAbertas = pendencies.reduce((acc, p) => acc + p.total_abertas, 0);
  const totalAltaPrioridade = pendencies.reduce((acc, p) => acc + p.alta_prioridade, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Layers className="w-4 h-4 text-red-600" />
            <span>Indicadores de Segmentação, Valores e Qualidade (RF17)</span>
          </h3>
          <p className="text-xs text-gray-500">
            Métricas compartilhadas entre listas e painéis, respeitando o modelo aditivo.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Card: Cobertura de Segmentos (RF01, RF17) */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Cobertura de Segmentos
            </span>
            <span className="text-sm font-extrabold text-blue-700">{pctClassificado}%</span>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2 mb-3 overflow-hidden flex">
            <div
              className="bg-blue-600 h-2"
              style={{ width: `${totalGeral > 0 ? (assistencialCount / totalGeral) * 100 : 0}%` }}
              title={`Assistencial: ${assistencialCount}`}
            />
            <div
              className="bg-amber-500 h-2"
              style={{ width: `${totalGeral > 0 ? (prestadorCount / totalGeral) * 100 : 0}%` }}
              title={`Prestador: ${prestadorCount}`}
            />
            <div
              className="bg-purple-500 h-2"
              style={{ width: `${totalGeral > 0 ? (outroCount / totalGeral) * 100 : 0}%` }}
              title={`Outro: ${outroCount}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-blue-50/50 rounded border border-blue-100">
              <span className="text-[10px] text-blue-800 font-semibold block">Assistencial</span>
              <span className="text-sm font-bold text-gray-900">{assistencialCount}</span>
            </div>
            <div className="p-2 bg-amber-50/50 rounded border border-amber-100">
              <span className="text-[10px] text-amber-800 font-semibold block">Prestador</span>
              <span className="text-sm font-bold text-gray-900">{prestadorCount}</span>
            </div>
            <div className="p-2 bg-purple-50/50 rounded border border-purple-100">
              <span className="text-[10px] text-purple-800 font-semibold block">Outro</span>
              <span className="text-sm font-bold text-gray-900">{outroCount}</span>
            </div>
            <div className="p-2 bg-gray-50 rounded border border-gray-200">
              <span className="text-[10px] text-gray-600 font-semibold block">Não classificado</span>
              <span className="text-sm font-bold text-gray-700">{naoClassificadoCount}</span>
            </div>
          </div>
        </div>

        {/* 2. Card: Separação Financeira Estrita (RF09, RF17) */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Separação Pedido vs Sentença
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
              Sem Dupla Contagem
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-2 bg-gray-50 rounded border border-gray-200">
              <span className="text-[10px] text-gray-500 block">Soma de Pedidos Conhecidos (RF09)</span>
              <span className="text-sm font-bold text-gray-900">
                {formatBRL(financial?.totalPedidosConhecidos)}
              </span>
              <span className="text-[10px] text-gray-400 block mt-0.5">
                {financial?.qtdPedidosSemSentenca || 0} processos sem sentença proferida
              </span>
            </div>

            <div className="p-2 bg-emerald-50/50 rounded border border-emerald-200">
              <span className="text-[10px] text-emerald-800 font-semibold block">
                Soma de Sentenças Quantificadas
              </span>
              <span className="text-sm font-bold text-emerald-950">
                {formatBRL(financial?.totalSentencasQuantificadas)}
              </span>
              <span className="text-[10px] text-emerald-700 block mt-0.5">
                {financial?.qtdSentencasQuantificadas || 0} confirmadas | {financial?.qtdSentencasIliquidas || 0} ilíquidas
                {financial?.qtdSentencasNaoMonetarias ? ` | ${financial.qtdSentencasNaoMonetarias} não monetárias` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Card: Qualidade Cadastral & Pendências (RF15, RF17) */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Saneamento Cadastral (RF15)
            </span>
            {totalAltaPrioridade > 0 && (
              <span className="text-[10px] bg-red-100 text-red-800 font-bold px-1.5 py-0.5 rounded">
                {totalAltaPrioridade} Urgentes
              </span>
            )}
          </div>

          <div className="mb-2">
            <span className="text-2xl font-extrabold text-gray-900">{totalPendenciasAbertas}</span>
            <span className="text-xs text-gray-500 ml-1.5">pendências abertas</span>
          </div>

          <div className="space-y-1.5 text-xs max-h-24 overflow-y-auto">
            {pendencies.length === 0 ? (
              <p className="text-gray-400 italic text-[11px]">Nenhuma pendência de qualidade aberta.</p>
            ) : (
              pendencies.slice(0, 3).map((p, idx) => (
                <div key={idx} className="flex justify-between items-center text-[11px] p-1 bg-gray-50 rounded">
                  <span className="font-medium text-gray-700">{p.campo}</span>
                  <span className="font-bold text-gray-900">{p.total_abertas}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
