import React, { useState, useEffect } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { Obligation } from '../../types/database';
import { obligationsService, CreateObligationDTO, UpdateObligationDTO } from '../../services/obligationsService';
import { authService } from '../../services/authService';
import { useAuth } from '../../hooks/useAuth';

interface ObligationModalProps {
  isOpen: boolean;
  processId: string;
  obligation: Obligation | null;
  onClose: (changed?: boolean) => void;
}

export const ObligationModal: React.FC<ObligationModalProps> = ({ isOpen, processId, obligation, onClose }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<Array<{ id: string; display_name: string | null; email: string }>>([]);

  const [descricao, setDescricao] = useState(obligation?.descricao || '');
  
  // Format datetime-local
  const defaultDate = obligation?.prazo 
    ? new Date(obligation.prazo).toISOString().slice(0, 16)
    : '';
  const [prazo, setPrazo] = useState(defaultDate);
  
  const [criticidade, setCriticidade] = useState(obligation?.criticidade || 'MEDIA');
  const [responsavelId, setResponsavelId] = useState(obligation?.responsavel_id || '');
  const [tipoPrazo, setTipoPrazo] = useState(obligation?.tipo_prazo || '');
  const [valorMulta, setValorMulta] = useState(obligation?.valor_multa_diaria?.toString() || '');
  const [valorMultaLimite, setValorMultaLimite] = useState(obligation?.valor_multa_limite?.toString() || '');
  const [observacoes, setObservacoes] = useState(obligation?.observacoes || '');

  useEffect(() => {
    if (isOpen) {
      authService.getActiveProfiles().then(({ profiles }) => {
        setUsers(profiles);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao.trim()) {
      setError('A descrição da obrigação é obrigatória.');
      return;
    }

    setLoading(true);
    setError(null);

    const isoDate = prazo ? new Date(prazo).toISOString() : null;
    const numMulta = valorMulta ? parseFloat(valorMulta.replace(',', '.')) : null;
    const numMultaLimite = valorMultaLimite ? parseFloat(valorMultaLimite.replace(',', '.')) : null;

    if (obligation) {
      const updates: UpdateObligationDTO = {
        descricao,
        prazo: isoDate,
        criticidade,
        responsavel_id: responsavelId || null,
        tipo_prazo: tipoPrazo || null,
        valor_multa_diaria: numMulta,
        valor_multa_limite: numMultaLimite,
        observacoes: observacoes || null,
      };
      const { error: err } = await obligationsService.updateObligation(obligation.id, updates, obligation, profile?.id);
      if (err) setError(err);
      else onClose(true);
    } else {
      const createDto: CreateObligationDTO = {
        process_id: processId,
        descricao,
        prazo: isoDate,
        criticidade,
        responsavel_id: responsavelId || null,
        tipo_prazo: tipoPrazo || null,
        valor_multa_diaria: numMulta,
        valor_multa_limite: numMultaLimite,
        observacoes: observacoes || null,
        created_by: profile?.id,
      };
      const { error: err } = await obligationsService.createObligation(createDto);
      if (err) setError(err);
      else onClose(true);
    }

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-lg">
            {obligation ? 'Editar Obrigação' : 'Nova Obrigação / Prazo'}
          </h3>
          <button
            type="button"
            onClick={() => onClose()}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
              {error}
            </div>
          )}

          <form id="obligation-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Descrição da Obrigação *
              </label>
              <input
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Apresentar contestação, Cumprir liminar, Pagar custas..."
                required
                maxLength={200}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prazo Limite / Vencimento
                </label>
                <input
                  type="datetime-local"
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Criticidade
                </label>
                <select
                  value={criticidade}
                  onChange={(e) => setCriticidade(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow"
                >
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Responsável
                </label>
                <select
                  value={responsavelId}
                  onChange={(e) => setResponsavelId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow"
                >
                  <option value="">-- Não atribuído --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.display_name || u.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tipo de Prazo
                </label>
                <select
                  value={tipoPrazo}
                  onChange={(e) => setTipoPrazo(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow"
                >
                  <option value="">-- Selecione --</option>
                  <option value="LEGAL">Legal (Previsto em Lei)</option>
                  <option value="JUDICIAL">Judicial (Decisão)</option>
                  <option value="INTERNO">Interno / Administrativo</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Multa Diária (Astreintes)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">R$</span>
                  <input type="number" step="0.01" min="0" value={valorMulta} onChange={(e) => setValorMulta(e.target.value)} placeholder="0,00" className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Limite / Teto da Multa</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">R$</span>
                  <input type="number" step="0.01" min="0" value={valorMultaLimite} onChange={(e) => setValorMultaLimite(e.target.value)} placeholder="0,00" className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Observações
              </label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Detalhes adicionais, base legal, links..."
                rows={3}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow resize-none"
              />
            </div>
          </form>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onClose()}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="obligation-form"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer shadow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Salvar Obrigação</span>
          </button>
        </div>
      </div>
    </div>
  );
};
