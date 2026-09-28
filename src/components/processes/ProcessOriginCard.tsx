import React, { useEffect, useState, useCallback } from 'react';
import { ProcessOrigin } from '../../types/database';
import { originService, OriginService } from '../../services/originService';

interface ProcessOriginCardProps {
  processId: string;
}

const CONFIABILIDADE_CONFIG = {
  COMPROVADA: { label: 'Comprovada', color: 'text-green-700 bg-green-50 border-green-200' },
  MANUAL: { label: 'Manual', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  INFERIDA: { label: 'Inferida', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  PENDENTE: { label: 'Pendente', color: 'text-gray-600 bg-gray-50 border-gray-200' },
};

const TIPO_DATA_LABELS: Record<string, string> = {
  DATA_DECLARADA_EMAIL: 'Data declarada no e-mail',
  DATA_RECEBIMENTO_CAIXA: 'Recebimento na caixa',
  DATA_IMPORTACAO: 'Importação',
  DATA_CADASTRO_JURIDICO: 'Cadastro jurídico',
  DATA_MANUAL: 'Manual',
};

/**
 * RF03 — Card de competência de origem do processo.
 * Exibe: competência, confiabilidade, tipo da data, fonte.
 * Data inferida ou pendente nunca exibe como "comprovada".
 */
export const ProcessOriginCard: React.FC<ProcessOriginCardProps> = ({ processId }) => {
  const [origin, setOrigin] = useState<ProcessOrigin | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrigin = useCallback(async () => {
    setLoading(true);
    const { data } = await originService.getCurrentOrigin(processId);
    setOrigin(data);
    setLoading(false);
  }, [processId]);

  useEffect(() => {
    loadOrigin();
  }, [loadOrigin]);

  if (loading) {
    return (
      <div className="text-xs text-gray-400 italic py-2">Carregando competência…</div>
    );
  }

  if (!origin) {
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="inline-block text-xs font-medium px-2 py-0.5 rounded border bg-gray-50 border-gray-200 text-gray-500">
          Origem pendente
        </span>
        <span className="text-xs text-gray-400">
          Nenhuma comunicação elegível vinculada ao processo.
        </span>
      </div>
    );
  }

  const competencia = OriginService.formatCompetencia(
    origin.competencia_mes,
    origin.competencia_ano,
  );

  const confiabilidadeConfig =
    CONFIABILIDADE_CONFIG[origin.confiabilidade] ?? CONFIABILIDADE_CONFIG.PENDENTE;

  return (
    <div className="flex flex-wrap items-start gap-3 py-2">
      {/* Competência */}
      <div>
        <p className="text-xs text-gray-500 mb-0.5">Competência</p>
        <span className="text-sm font-semibold text-gray-900">{competencia}</span>
        {origin.data_origem && (
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(origin.data_origem + 'T00:00:00-03:00').toLocaleDateString('pt-BR')}
          </p>
        )}
      </div>

      {/* Confiabilidade */}
      <div>
        <p className="text-xs text-gray-500 mb-0.5">Confiabilidade</p>
        <span
          className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${confiabilidadeConfig.color}`}
        >
          {confiabilidadeConfig.label}
        </span>
      </div>

      {/* Tipo da data */}
      <div>
        <p className="text-xs text-gray-500 mb-0.5">Tipo da data</p>
        <span className="text-xs text-gray-700">
          {TIPO_DATA_LABELS[origin.tipo_data] ?? origin.tipo_data}
        </span>
      </div>

      {/* Manual: exibe justificativa */}
      {origin.manual && origin.justificativa_manual && (
        <div className="w-full">
          <p className="text-xs text-gray-500 mb-0.5">Justificativa (manual)</p>
          <p className="text-xs text-gray-700 italic">{origin.justificativa_manual}</p>
        </div>
      )}

      {/* Aviso quando inferida */}
      {origin.confiabilidade === 'INFERIDA' && (
        <div className="w-full">
          <p className="text-xs text-amber-600">
            ⚠ Data inferida — não equivale a origem comprovada. Revisar para confirmar.
          </p>
        </div>
      )}

      {/* Aviso quando pendente */}
      {origin.confiabilidade === 'PENDENTE' && (
        <div className="w-full">
          <p className="text-xs text-gray-400 italic">
            Origem pendente de confirmação. Comunicação sem data confiável.
          </p>
        </div>
      )}
    </div>
  );
};

export default ProcessOriginCard;
