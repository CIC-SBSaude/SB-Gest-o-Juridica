import React, { useEffect, useState, useCallback } from 'react';
import { ProcessOrigin } from '../../types/database';
import { originService, OriginService } from '../../services/originService';
import { useAuth } from '../../hooks/useAuth';

interface ProcessOriginCardProps {
  processId: string;
  readOnly?: boolean;
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
 * Permite confirmação e correção manual auditada.
 */
export const ProcessOriginCard: React.FC<ProcessOriginCardProps> = ({
  processId,
  readOnly = false,
}) => {
  const { user } = useAuth();
  const [origin, setOrigin] = useState<ProcessOrigin | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editJustificativa, setEditJustificativa] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrigin = useCallback(async () => {
    setLoading(true);
    const { data } = await originService.getCurrentOrigin(processId);
    setOrigin(data);
    if (data?.data_origem) {
      setEditDate(data.data_origem);
    }
    setLoading(false);
  }, [processId]);

  useEffect(() => {
    loadOrigin();
  }, [loadOrigin]);

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDate) {
      setError('Data de origem é obrigatória.');
      return;
    }
    if (!editJustificativa.trim()) {
      setError('Justificativa é obrigatória para alteração manual.');
      return;
    }

    setSaving(true);
    setError(null);

    const comp = OriginService.deriveCompetencia(editDate);
    const { error: saveErr } = await originService.setOrigin({
      process_id: processId,
      data_origem: editDate,
      competencia_mes: comp?.mes ?? null,
      competencia_ano: comp?.ano ?? null,
      tipo_data: 'DATA_MANUAL',
      confiabilidade: 'MANUAL',
      manual: true,
      justificativa_manual: editJustificativa.trim(),
      definido_por: 'USUARIO',
      definido_por_usuario_id: user?.id ?? null,
    });

    if (saveErr) {
      setError(saveErr);
      setSaving(false);
      return;
    }

    setSaving(false);
    setIsEditing(false);
    await loadOrigin();
  };

  if (loading) {
    return (
      <div className="text-xs text-gray-400 italic py-2">Carregando competência…</div>
    );
  }

  if (!origin && !isEditing) {
    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded border bg-gray-50 border-gray-200 text-gray-500">
            Origem pendente
          </span>
          <span className="text-xs text-gray-400">
            Nenhuma comunicação elegível vinculada ao processo.
          </span>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            + Definir origem
          </button>
        )}
      </div>
    );
  }

  const competencia = origin
    ? OriginService.formatCompetencia(origin.competencia_mes, origin.competencia_ano)
    : 'Pendente';

  const confiabilidadeConfig = origin
    ? (CONFIABILIDADE_CONFIG[origin.confiabilidade] ?? CONFIABILIDADE_CONFIG.PENDENTE)
    : CONFIABILIDADE_CONFIG.PENDENTE;

  return (
    <div className="py-2 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-start gap-4">
          {/* Competência */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Competência</p>
            <span className="text-sm font-semibold text-gray-900">{competencia}</span>
            {origin?.data_origem && (
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
          {origin && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Tipo da data</p>
              <span className="text-xs text-gray-700">
                {TIPO_DATA_LABELS[origin.tipo_data] ?? origin.tipo_data}
              </span>
            </div>
          )}
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {isEditing ? 'Fechar' : 'Editar / Revisar'}
          </button>
        )}
      </div>

      {/* Manual: exibe justificativa */}
      {origin?.manual && origin.justificativa_manual && (
        <div className="w-full">
          <p className="text-xs text-gray-500 mb-0.5">Justificativa (manual)</p>
          <p className="text-xs text-gray-700 italic">{origin.justificativa_manual}</p>
        </div>
      )}

      {/* Aviso quando inferida */}
      {origin?.confiabilidade === 'INFERIDA' && (
        <div className="w-full">
          <p className="text-xs text-amber-600">
            ⚠ Data inferida — não equivale a origem comprovada. Revisar para confirmar.
          </p>
        </div>
      )}

      {/* Aviso quando pendente */}
      {origin?.confiabilidade === 'PENDENTE' && (
        <div className="w-full">
          <p className="text-xs text-gray-400 italic">
            Origem pendente de confirmação. Comunicação sem data confiável.
          </p>
        </div>
      )}

      {/* Formulário de edição manual */}
      {isEditing && !readOnly && (
        <form
          onSubmit={handleSaveManual}
          className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2 text-xs"
        >
          <p className="font-semibold text-gray-800">Definição Manual de Competência</p>
          <div>
            <label className="block text-gray-700 mb-1">Data de origem (base)</label>
            <input
              type="date"
              required
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Justificativa da alteração manual *</label>
            <textarea
              required
              rows={2}
              value={editJustificativa}
              onChange={(e) => setEditJustificativa(e.target.value)}
              placeholder="Descreva o documento ou motivo da data definida"
              className="w-full text-xs border border-gray-300 rounded p-1.5 bg-white resize-none"
            />
          </div>
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-2 py-1 text-gray-600 hover:text-gray-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Gravando…' : 'Salvar competência'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default ProcessOriginCard;

