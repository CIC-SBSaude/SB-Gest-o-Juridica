import React, { useEffect, useState, useCallback } from 'react';
import {
  ProcessDecision,
  ProcessFinancialComponent,
  ProcessFinancialHighlight,
  DecisionTipo,
  DecisionEstadoValor,
  FinancialFase,
  FinancialNatureza,
} from '../../types/database';
import { financialService, CreateDecisionDTO, CreateFinancialComponentDTO } from '../../services/financialService';
import { useAuth } from '../../hooks/useAuth';

interface ProcessFinancialSectionProps {
  processId: string;
  readOnly?: boolean;
}

const formatBRL = (val: number | null | undefined): string => {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
};

const DECISION_TIPO_LABELS: Record<DecisionTipo, string> = {
  SENTENCA: 'Sentença',
  ACORDAO: 'Acórdão',
  DECISAO_INTERLOCUTORIA: 'Decisão Interlocutória',
  TUTELA: 'Tutela de Urgência',
  OUTRO: 'Outra Decisão',
};

const NATUREZA_LABELS: Record<FinancialNatureza, string> = {
  DIVIDA_SERVICO: 'Dívida de Serviço',
  DANO_MATERIAL: 'Dano Material',
  DANO_MORAL: 'Dano Moral',
  MULTA_ASTREINTES: 'Multa / Astreintes',
  HONORARIOS: 'Honorários',
  OUTRO_IDENTIFICADO: 'Outro Identificado',
};

export const ProcessFinancialSection: React.FC<ProcessFinancialSectionProps> = ({
  processId,
  readOnly = false,
}) => {
  const { user } = useAuth();
  const [decisions, setDecisions] = useState<ProcessDecision[]>([]);
  const [components, setComponents] = useState<ProcessFinancialComponent[]>([]);
  const [highlight, setHighlight] = useState<ProcessFinancialHighlight | null>(null);
  const [loading, setLoading] = useState(true);

  // Forms modal/inline states
  const [showAddDecision, setShowAddDecision] = useState(false);
  const [decisionForm, setDecisionForm] = useState<{
    tipo: DecisionTipo;
    data_decisao: string;
    estado_valor: DecisionEstadoValor;
    montante: string;
    is_referencia: boolean;
    motivo_escolha: string;
    error: string | null;
    saving: boolean;
  }>({
    tipo: 'SENTENCA',
    data_decisao: '',
    estado_valor: 'QUANTIFICADA',
    montante: '',
    is_referencia: false,
    motivo_escolha: '',
    error: null,
    saving: false,
  });

  const [showAddComponent, setShowAddComponent] = useState(false);
  const [compForm, setCompForm] = useState<{
    fase: FinancialFase;
    natureza: FinancialNatureza;
    valor: string;
    cumulativo: boolean;
    sobreposto: boolean;
    descricao: string;
    error: string | null;
    saving: boolean;
  }>({
    fase: 'PEDIDO',
    natureza: 'DIVIDA_SERVICO',
    valor: '',
    cumulativo: true,
    sobreposto: false,
    descricao: '',
    error: null,
    saving: false,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [decRes, compRes, highRes] = await Promise.all([
      financialService.getDecisions(processId),
      financialService.getComponents(processId),
      financialService.getHighlight(processId),
    ]);
    setDecisions(decRes.data);
    setComponents(compRes.data);
    setHighlight(highRes.data);
    setLoading(false);
  }, [processId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const montanteNum = decisionForm.montante ? parseFloat(decisionForm.montante.replace(',', '.')) : null;

    if (decisionForm.estado_valor === 'QUANTIFICADA' && (montanteNum === null || isNaN(montanteNum))) {
      setDecisionForm(f => ({ ...f, error: 'Informe um montante válido para decisão quantificada.' }));
      return;
    }

    setDecisionForm(f => ({ ...f, saving: true, error: null }));

    const dto: CreateDecisionDTO = {
      process_id: processId,
      tipo: decisionForm.tipo,
      data_decisao: decisionForm.data_decisao || null,
      estado_valor: decisionForm.estado_valor,
      montante: decisionForm.estado_valor === 'QUANTIFICADA' ? montanteNum : null,
      is_referencia: decisionForm.is_referencia,
      motivo_escolha: decisionForm.motivo_escolha.trim() || null,
    };

    const { error } = await financialService.createDecision(dto, user.id);
    if (error) {
      setDecisionForm(f => ({ ...f, error, saving: false }));
      return;
    }

    setDecisionForm({
      tipo: 'SENTENCA',
      data_decisao: '',
      estado_valor: 'QUANTIFICADA',
      montante: '',
      is_referencia: false,
      motivo_escolha: '',
      error: null,
      saving: false,
    });
    setShowAddDecision(false);
    await loadData();
  };

  const handleSetReference = async (decisionId: string) => {
    if (!user) return;
    const { error } = await financialService.setAsReference(decisionId, processId, undefined, user.id);
    if (error) {
      alert(`Erro: ${error}`);
      return;
    }
    await loadData();
  };

  const handleCreateComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const valorNum = parseFloat(compForm.valor.replace(',', '.'));
    if (isNaN(valorNum) || valorNum < 0) {
      setCompForm(f => ({ ...f, error: 'Informe um valor numérico válido.' }));
      return;
    }

    setCompForm(f => ({ ...f, saving: true, error: null }));

    const dto: CreateFinancialComponentDTO = {
      process_id: processId,
      fase: compForm.fase,
      natureza: compForm.natureza,
      valor: valorNum,
      cumulativo: compForm.cumulativo,
      sobreposto: compForm.sobreposto,
      descricao: compForm.descricao.trim() || null,
      status_revisao: 'CONFIRMADO',
    };

    const { error } = await financialService.createComponent(dto, user.id);
    if (error) {
      setCompForm(f => ({ ...f, error, saving: false }));
      return;
    }

    setCompForm({
      fase: 'PEDIDO',
      natureza: 'DIVIDA_SERVICO',
      valor: '',
      cumulativo: true,
      sobreposto: false,
      descricao: '',
      error: null,
      saving: false,
    });
    setShowAddComponent(false);
    await loadData();
  };

  const handleDeleteComponent = async (id: string) => {
    const { error } = await financialService.deleteComponent(id);
    if (error) {
      alert(`Erro ao remover: ${error}`);
      return;
    }
    await loadData();
  };

  if (loading) {
    return <div className="text-xs text-gray-500 py-2">Carregando dados financeiros...</div>;
  }

  return (
    <section className="space-y-4" aria-labelledby="financial-section-title">
      {/* 1. RF09: Card de Destaque Financeiro */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
              {highlight?.destaque_rotulo ?? 'Destaque Financeiro'}
            </span>
            <div className="text-2xl font-bold text-gray-900 mt-0.5">
              {highlight?.destaque_estado === 'SENTENCA_ILIQUIDA'
                ? 'A apurar (Sentença Ilíquida)'
                : highlight?.destaque_estado === 'SENTENCA_NAO_MONETARIA'
                ? 'Não Monetária'
                : highlight?.destaque_estado === 'REVISAO_PENDENTE'
                ? 'Em Revisão'
                : formatBRL(highlight?.destaque_valor)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {highlight?.destaque_estado === 'SENTENCA_QUANTIFICADA' && (
                <span>
                  Sentença confirmada em {formatDate(highlight.sentenca_data)}. Pedido original mantido no histórico:{' '}
                  <strong>{formatBRL(highlight.valor_pedido_conhecido)}</strong>.
                </span>
              )}
              {highlight?.destaque_estado === 'PEDIDO_SEM_SENTENCA' && (
                <span>Processo sem sentença de referência. Destaque baseado no pedido conhecido.</span>
              )}
              {highlight?.destaque_estado === 'SENTENCA_ILIQUIDA' && (
                <span>Sentença proferida sem valor líquido. Pedido não substitui a condenação a apurar.</span>
              )}
            </p>
          </div>

          <div className="text-right sm:border-l sm:border-blue-200 sm:pl-4 text-xs text-gray-600 space-y-1">
            <div>
              <span className="text-gray-400">Valor da causa: </span>
              <span className="font-medium text-gray-800">{formatBRL(highlight?.valor_causa)}</span>
            </div>
            {highlight?.exposicao_estimada !== null && highlight?.exposicao_estimada !== undefined && (
              <div>
                <span className="text-gray-400">Exposição estimada: </span>
                <span className="font-medium text-amber-700">{formatBRL(highlight.exposicao_estimada)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Decisões e Sentenças (RF09) */}
      <div className="border border-gray-200 rounded-lg p-3 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
              Decisões e Sentenças ({decisions.length})
            </h4>
            <p className="text-xs text-gray-500">
              Sentença de referência define o valor da condenação sem apagar o histórico do pedido.
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowAddDecision(v => !v)}
              className="text-xs bg-white hover:bg-gray-50 text-blue-600 font-medium px-2.5 py-1 border border-blue-300 rounded shadow-sm"
            >
              {showAddDecision ? 'Cancelar' : '+ Nova Decisão'}
            </button>
          )}
        </div>

        {/* Formulário de Nova Decisão */}
        {showAddDecision && (
          <form onSubmit={handleCreateDecision} className="bg-gray-50 p-3 rounded border border-gray-200 mb-3 space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-gray-600 font-medium mb-1">Tipo</label>
                <select
                  value={decisionForm.tipo}
                  onChange={e => setDecisionForm(f => ({ ...f, tipo: e.target.value as DecisionTipo }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  <option value="SENTENCA">Sentença</option>
                  <option value="ACORDAO">Acórdão</option>
                  <option value="DECISAO_INTERLOCUTORIA">Decisão Interlocutória</option>
                  <option value="TUTELA">Tutela de Urgência</option>
                  <option value="OUTRO">Outra</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Data da Decisão</label>
                <input
                  type="date"
                  value={decisionForm.data_decisao}
                  onChange={e => setDecisionForm(f => ({ ...f, data_decisao: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Estado do Valor</label>
                <select
                  value={decisionForm.estado_valor}
                  onChange={e => setDecisionForm(f => ({ ...f, estado_valor: e.target.value as DecisionEstadoValor }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  <option value="QUANTIFICADA">Quantificada (Valor certo)</option>
                  <option value="ILIQUIDA">Ilíquida (A apurar)</option>
                  <option value="NAO_MONETARIA">Sem condenação monetária</option>
                  <option value="PENDENTE_REVISAO">Pendente de Revisão</option>
                  <option value="DESCONHECIDA">Desconhecida</option>
                </select>
              </div>
            </div>

            {decisionForm.estado_valor === 'QUANTIFICADA' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-600 font-medium mb-1">Montante (R$)</label>
                  <input
                    type="text"
                    placeholder="Ex: 8500,00 (aceita 0,00)"
                    value={decisionForm.montante}
                    onChange={e => setDecisionForm(f => ({ ...f, montante: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-1.5 cursor-pointer text-gray-700">
                    <input
                      type="checkbox"
                      checked={decisionForm.is_referencia}
                      onChange={e => setDecisionForm(f => ({ ...f, is_referencia: e.target.checked }))}
                    />
                    <span>Definir como Sentença de Referência Atual</span>
                  </label>
                </div>
              </div>
            )}

            <div>
              <label className="block text-gray-600 font-medium mb-1">Motivo / Fundamentação</label>
              <input
                type="text"
                placeholder="Ex: Sentença de procedência parcial mantida em 1º grau"
                value={decisionForm.motivo_escolha}
                onChange={e => setDecisionForm(f => ({ ...f, motivo_escolha: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
              />
            </div>

            {decisionForm.error && <p className="text-red-600">{decisionForm.error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddDecision(false)}
                className="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={decisionForm.saving}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
              >
                {decisionForm.saving ? 'Salvando...' : 'Salvar Decisão'}
              </button>
            </div>
          </form>
        )}

        {/* Lista de Decisões */}
        {decisions.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-1">Nenhuma decisão ou sentença registrada.</p>
        ) : (
          <div className="space-y-2">
            {decisions.map(d => (
              <div
                key={d.id}
                className={`p-2.5 rounded border text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                  d.is_referencia ? 'border-amber-400 bg-amber-50/40' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{DECISION_TIPO_LABELS[d.tipo]}</span>
                    {d.data_decisao && <span className="text-gray-500">em {formatDate(d.data_decisao)}</span>}
                    {d.is_referencia && (
                      <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-300">
                        ★ REFERÊNCIA
                      </span>
                    )}
                  </div>
                  <div className="text-gray-600">
                    {d.estado_valor === 'QUANTIFICADA' && (
                      <span className="font-bold text-gray-800 text-sm">{formatBRL(d.montante)}</span>
                    )}
                    {d.estado_valor === 'ILIQUIDA' && (
                      <span className="text-amber-700 font-medium">Ilíquida (A apurar)</span>
                    )}
                    {d.estado_valor === 'NAO_MONETARIA' && (
                      <span className="text-gray-600 font-medium">Obrigação não monetária</span>
                    )}
                    {d.estado_valor === 'PENDENTE_REVISAO' && (
                      <span className="text-purple-700 font-medium">Pendente de revisão</span>
                    )}
                    {d.motivo_escolha && <span className="text-gray-500 ml-2">— {d.motivo_escolha}</span>}
                  </div>
                </div>

                {!readOnly && !d.is_referencia && (
                  <button
                    type="button"
                    onClick={() => handleSetReference(d.id)}
                    className="text-[11px] text-amber-700 hover:text-amber-800 hover:underline font-medium self-end sm:self-center"
                  >
                    Tornar referência
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Componentes Financeiros Discriminados (RF13) */}
      <div className="border border-gray-200 rounded-lg p-3 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
              Componentes Financeiros Discriminados ({components.length})
            </h4>
            <p className="text-xs text-gray-500">
              Discriminação de dívida de serviço, danos e multas. Evita sobreposição e dupla contagem.
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowAddComponent(v => !v)}
              className="text-xs bg-white hover:bg-gray-50 text-blue-600 font-medium px-2.5 py-1 border border-blue-300 rounded shadow-sm"
            >
              {showAddComponent ? 'Cancelar' : '+ Novo Componente'}
            </button>
          )}
        </div>

        {/* Formulário de Novo Componente */}
        {showAddComponent && (
          <form onSubmit={handleCreateComponent} className="bg-gray-50 p-3 rounded border border-gray-200 mb-3 space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-gray-600 font-medium mb-1">Fase</label>
                <select
                  value={compForm.fase}
                  onChange={e => setCompForm(f => ({ ...f, fase: e.target.value as FinancialFase }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  <option value="PEDIDO">Pedido Inicial</option>
                  <option value="SENTENCA">Sentença</option>
                  <option value="ACORDO">Acordo</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Natureza</label>
                <select
                  value={compForm.natureza}
                  onChange={e => setCompForm(f => ({ ...f, natureza: e.target.value as FinancialNatureza }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  <option value="DIVIDA_SERVICO">Dívida de Serviço</option>
                  <option value="DANO_MATERIAL">Dano Material</option>
                  <option value="DANO_MORAL">Dano Moral</option>
                  <option value="MULTA_ASTREINTES">Multa / Astreintes</option>
                  <option value="HONORARIOS">Honorários</option>
                  <option value="OUTRO_IDENTIFICADO">Outro</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Valor (R$)</label>
                <input
                  type="text"
                  placeholder="Ex: 50000,00"
                  value={compForm.valor}
                  onChange={e => setCompForm(f => ({ ...f, valor: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-gray-600 font-medium mb-1">Descrição / Origem</label>
                <input
                  type="text"
                  placeholder="Ex: Faturas hospitalares de março a maio/2026"
                  value={compForm.descricao}
                  onChange={e => setCompForm(f => ({ ...f, descricao: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>
              <div className="flex items-center gap-4 pt-5">
                <label className="flex items-center gap-1.5 cursor-pointer text-gray-700">
                  <input
                    type="checkbox"
                    checked={compForm.cumulativo}
                    onChange={e => setCompForm(f => ({ ...f, cumulativo: e.target.checked }))}
                  />
                  <span>Cumulativo na soma</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-gray-700">
                  <input
                    type="checkbox"
                    checked={compForm.sobreposto}
                    onChange={e => setCompForm(f => ({ ...f, sobreposto: e.target.checked }))}
                  />
                  <span>Sobreposto (repetido)</span>
                </label>
              </div>
            </div>

            {compForm.error && <p className="text-red-600">{compForm.error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddComponent(false)}
                className="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={compForm.saving}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
              >
                {compForm.saving ? 'Salvando...' : 'Adicionar Componente'}
              </button>
            </div>
          </form>
        )}

        {/* Tabela de Componentes */}
        {components.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-1">Nenhum componente financeiro discriminado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-1.5 font-medium">Fase</th>
                  <th className="py-1.5 font-medium">Natureza</th>
                  <th className="py-1.5 font-medium">Descrição</th>
                  <th className="py-1.5 font-medium">Cumulativo</th>
                  <th className="py-1.5 font-medium text-right">Valor</th>
                  {!readOnly && <th className="py-1.5 font-medium text-center">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {components.map(c => (
                  <tr key={c.id} className={c.sobreposto ? 'bg-red-50/50 text-gray-400' : 'hover:bg-gray-50'}>
                    <td className="py-1.5 font-medium text-gray-700">{c.fase}</td>
                    <td className="py-1.5 text-gray-800">{NATUREZA_LABELS[c.natureza]}</td>
                    <td className="py-1.5 text-gray-500 truncate max-w-xs">{c.descricao ?? '—'}</td>
                    <td className="py-1.5">
                      {c.sobreposto ? (
                        <span className="text-[10px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-semibold">
                          Sobreposto
                        </span>
                      ) : c.cumulativo ? (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1 py-0.5 rounded font-semibold">
                          Sim
                        </span>
                      ) : (
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1 py-0.5 rounded">Não</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-bold text-gray-900">{formatBRL(c.valor)}</td>
                    {!readOnly && (
                      <td className="py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteComponent(c.id)}
                          className="text-gray-400 hover:text-red-600"
                          title="Remover componente"
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
