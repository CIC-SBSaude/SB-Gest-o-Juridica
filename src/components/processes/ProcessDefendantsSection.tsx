import React, { useEffect, useState, useCallback } from 'react';
import { ProcessDefendant, DefendantPapel } from '../../types/database';
import { defendantsService, CreateDefendantDTO } from '../../services/defendantsService';
import { useAuth } from '../../hooks/useAuth';
import { classifyDefendantGroup, DEFENDANT_GROUP_LABELS } from '../../utils/defendantClassifier';

interface ProcessDefendantsSectionProps {
  processId: string;
  readOnly?: boolean;
}

const PAPEL_LABELS: Record<DefendantPapel, string> = {
  REU: 'Ré principal',
  REU_SOLIDARIO: 'Ré solidária',
  REU_SUBSIDIARIO: 'Ré subsidiária',
  NAO_IDENTIFICADA: 'Ré não identificada',
  OUTRA: 'Outra',
};

const PAPEL_OPTIONS: DefendantPapel[] = [
  'REU',
  'REU_SOLIDARIO',
  'REU_SUBSIDIARIO',
  'NAO_IDENTIFICADA',
  'OUTRA',
];

type FormState = {
  open: boolean;
  nome_livre: string;
  documento_livre: string;
  papel: DefendantPapel;
  evidencia_texto: string;
  evidencia_fonte: 'MANUAL' | 'EMAIL' | 'DOCUMENTO';
  error: string | null;
  saving: boolean;
};

const initialForm: FormState = {
  open: false,
  nome_livre: '',
  documento_livre: '',
  papel: 'REU',
  evidencia_texto: '',
  evidencia_fonte: 'MANUAL',
  error: null,
  saving: false,
};

/**
 * RF02 — Seção de rés do processo.
 * Exibe rés confirmadas e pendentes, separadas de "empresa vinculada" (legado).
 * Permite adicionar nova ré com papel e evidência.
 */
export const ProcessDefendantsSection: React.FC<ProcessDefendantsSectionProps> = ({
  processId,
  readOnly = false,
}) => {
  const { user } = useAuth();
  const [defendants, setDefendants] = useState<ProcessDefendant[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(initialForm);

  const loadDefendants = useCallback(async () => {
    setLoading(true);
    const { data } = await defendantsService.getByProcess(processId);
    setDefendants(data);
    setLoading(false);
  }, [processId]);

  useEffect(() => {
    loadDefendants();
  }, [loadDefendants]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!form.nome_livre.trim()) {
      setForm(f => ({ ...f, error: 'Nome da ré é obrigatório.' }));
      return;
    }

    setForm(f => ({ ...f, saving: true, error: null }));

    const dto: CreateDefendantDTO = {
      process_id: processId,
      nome_livre: form.nome_livre.trim(),
      documento_livre: form.documento_livre.trim() || null,
      papel: form.papel,
      evidencia_texto: form.evidencia_texto.trim() || null,
      evidencia_fonte: form.evidencia_texto.trim() ? form.evidencia_fonte : null,
      confirmado: false,
    };

    const { error } = await defendantsService.create(dto, user.id);

    if (error) {
      setForm(f => ({ ...f, error, saving: false }));
      return;
    }

    setForm(initialForm);
    await loadDefendants();
  };

  const handleConfirm = async (defendant: ProcessDefendant) => {
    if (!user) return;
    await defendantsService.confirm(
      defendant.id,
      defendant.evidencia_texto || 'Confirmado manualmente pelo operador jurídico.',
      defendant.evidencia_fonte ?? 'MANUAL',
      user.id,
    );
    await loadDefendants();
  };


  const handleRemove = async (defendant: ProcessDefendant) => {
    const { error } = await defendantsService.remove(defendant.id);
    if (error) {
      alert(error);
      return;
    }
    await loadDefendants();
  };

  const confirmed = defendants.filter(d => d.confirmado);
  const pending = defendants.filter(d => !d.confirmado);

  return (
    <section aria-labelledby="defendants-section-title">
      <div className="flex items-center justify-between mb-3">
        <h3
          id="defendants-section-title"
          className="text-sm font-semibold text-gray-900 uppercase tracking-wide"
        >
          Rés
          <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
            (separado da empresa do contrato)
          </span>
        </h3>
        {!readOnly && (
          <button
            type="button"
            id="btn-add-defendant"
            onClick={() => setForm(f => ({ ...f, open: !f.open }))}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            aria-expanded={form.open}
          >
            {form.open ? 'Cancelar' : '+ Adicionar ré'}
          </button>
        )}
      </div>

      {loading && (
        <p className="text-xs text-gray-400 italic">Carregando rés…</p>
      )}

      {!loading && defendants.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          Nenhuma ré cadastrada. Empresa vinculada (legado) permanece separada.
        </p>
      )}

      {/* Rés confirmadas */}
      {confirmed.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1">Confirmadas</p>
          <ul className="space-y-1">
            {confirmed.map(d => (
              <DefendantRow
                key={d.id}
                defendant={d}
                readOnly={readOnly}
                onRemove={handleRemove}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Rés pendentes de confirmação */}
      {pending.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-amber-600 mb-1">Pendentes de confirmação</p>
          <ul className="space-y-1">
            {pending.map(d => (
              <DefendantRow
                key={d.id}
                defendant={d}
                readOnly={readOnly}
                onConfirm={handleConfirm}
                onRemove={handleRemove}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Formulário de adição */}
      {form.open && !readOnly && (
        <form
          onSubmit={handleAddSubmit}
          className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3"
          aria-label="Adicionar ré"
        >
          <div>
            <label
              htmlFor="defendant-nome"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Nome da ré *
            </label>
            <input
              id="defendant-nome"
              type="text"
              required
              value={form.nome_livre}
              onChange={e => setForm(f => ({ ...f, nome_livre: e.target.value }))}
              placeholder="Razão social ou nome"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="defendant-documento"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              CNPJ / CPF (opcional)
            </label>
            <input
              id="defendant-documento"
              type="text"
              value={form.documento_livre}
              onChange={e => setForm(f => ({ ...f, documento_livre: e.target.value }))}
              placeholder="Somente se disponível"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="defendant-papel"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Papel processual
            </label>
            <select
              id="defendant-papel"
              value={form.papel}
              onChange={e => setForm(f => ({ ...f, papel: e.target.value as DefendantPapel }))}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAPEL_OPTIONS.map(p => (
                <option key={p} value={p}>{PAPEL_LABELS[p]}</option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="defendant-evidencia"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Evidência do polo passivo (opcional)
            </label>
            <textarea
              id="defendant-evidencia"
              rows={2}
              value={form.evidencia_texto}
              onChange={e => setForm(f => ({ ...f, evidencia_texto: e.target.value }))}
              placeholder="Trecho ou referência que indica esta empresa como ré"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            {form.evidencia_texto && (
              <div className="mt-1">
                <label className="text-xs text-gray-600 mr-2">Fonte:</label>
                {(['MANUAL', 'EMAIL', 'DOCUMENTO'] as const).map(f => (
                  <label key={f} className="inline-flex items-center mr-3 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="evidencia-fonte"
                      value={f}
                      checked={form.evidencia_fonte === f}
                      onChange={() => setForm(s => ({ ...s, evidencia_fonte: f }))}
                      className="mr-1"
                    />
                    {f === 'MANUAL' ? 'Manual' : f === 'EMAIL' ? 'E-mail' : 'Documento'}
                  </label>
                ))}
              </div>
            )}
          </div>

          {form.error && (
            <p className="text-xs text-red-600" role="alert">{form.error}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setForm(initialForm)}
              className="text-xs text-gray-600 hover:text-gray-800 px-3 py-1.5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={form.saving}
              id="btn-save-defendant"
              className="text-xs bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
            >
              {form.saving ? 'Salvando…' : 'Adicionar ré'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

// ─── Linha individual de ré ───────────────────────────────────────────────────

interface DefendantRowProps {
  defendant: ProcessDefendant;
  readOnly: boolean;
  onConfirm?: (d: ProcessDefendant) => void;
  onRemove?: (d: ProcessDefendant) => void;
}

const DefendantRow: React.FC<DefendantRowProps> = ({
  defendant: d,
  readOnly,
  onConfirm,
  onRemove,
}) => {
  const nome = d.company?.nome ?? d.nome_livre ?? 'Ré sem nome';
  const doc = d.company?.cnpj ?? d.documento_livre;
  const group = classifyDefendantGroup(nome);
  const groupLabel = DEFENDANT_GROUP_LABELS[group];

  const groupBadgeClass =
    group === 'SB_SAUDE'
      ? 'bg-red-50 text-red-700 border-red-200'
      : group === 'SAN_MIGUEL'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-slate-50 text-slate-700 border-slate-200';

  return (
    <li className="p-2 rounded border border-gray-100 bg-white hover:bg-gray-50/80 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{nome}</span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${groupBadgeClass}`}
            >
              {groupLabel}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
            {doc && <span className="font-mono">{doc}</span>}
            <span>•</span>
            <span className="text-gray-600 font-medium">{PAPEL_LABELS[d.papel]}</span>
          </div>

          {d.evidencia_texto && (
            <div className="mt-1.5 p-1.5 rounded bg-gray-50 border border-gray-200 text-xs text-gray-700">
              <span className="font-semibold text-gray-500 text-[11px] block mb-0.5">
                Evidência {d.evidencia_fonte ? `(${d.evidencia_fonte})` : ''}:
              </span>
              <p className="italic text-[11px] leading-relaxed line-clamp-2">
                "{d.evidencia_texto}"
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {d.confirmado ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
              ✓ {d.correcao_por ? 'Confirmada (humano)' : 'Confirmada (IA/sistema)'}
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
              Pendente de revisão
            </span>
          )}

          {!readOnly && (
            <div className="flex items-center gap-2 mt-1">
              {!d.confirmado && onConfirm && (
                <button
                  type="button"
                  onClick={() => onConfirm(d)}
                  className="text-xs text-green-700 hover:text-green-900 font-semibold underline cursor-pointer"
                >
                  Confirmar
                </button>
              )}
              {!d.confirmado && onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(d)}
                  className="text-xs text-red-600 hover:text-red-800 underline cursor-pointer"
                >
                  Remover
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

export default ProcessDefendantsSection;
