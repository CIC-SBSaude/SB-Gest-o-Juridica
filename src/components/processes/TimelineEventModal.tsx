import React, { useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { ProcessTimelineEvent } from '../../types/database';
import { timelineService, CreateTimelineEventDTO, UpdateTimelineEventDTO } from '../../services/timelineService';
import { useAuth } from '../../hooks/useAuth';

interface TimelineEventModalProps {
  isOpen: boolean;
  processId: string;
  event: ProcessTimelineEvent | null;
  onClose: (changed?: boolean) => void;
}

export const TimelineEventModal: React.FC<TimelineEventModalProps> = ({ isOpen, processId, event, onClose }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tipo, setTipo] = useState(event?.tipo || 'ANDAMENTO');
  const [titulo, setTitulo] = useState(event?.titulo || '');
  const [descricao, setDescricao] = useState(event?.descricao || '');
  
  // Format date to datetime-local expected format (YYYY-MM-DDTHH:mm)
  const defaultDate = event?.data_hora 
    ? new Date(event.data_hora).toISOString().slice(0, 16)
    : new Date().toISOString().slice(0, 16);
  const [dataHora, setDataHora] = useState(defaultDate);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !tipo.trim() || !dataHora) {
      setError('Preencha os campos obrigatórios.');
      return;
    }

    setLoading(true);
    setError(null);

    // Convert local datetime to UTC for storage
    const isoDate = new Date(dataHora).toISOString();

    if (event) {
      const updates: UpdateTimelineEventDTO = {
        tipo,
        titulo,
        descricao,
        data_hora: isoDate,
      };
      const { error: err } = await timelineService.updateTimelineEvent(event.id, updates, event, profile?.id);
      if (err) setError(err);
      else onClose(true);
    } else {
      const createDto: CreateTimelineEventDTO = {
        process_id: processId,
        tipo,
        titulo,
        descricao,
        data_hora: isoDate,
        usuario_id: profile?.id,
        origem: 'MANUAL',
      };
      const { error: err } = await timelineService.createTimelineEvent(createDto);
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
            {event ? 'Editar Evento' : 'Novo Evento'}
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

          <form id="event-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tipo de Evento *
                </label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
                >
                  <option value="ANDAMENTO">Andamento Processual</option>
                  <option value="PUBLICACAO">Publicação</option>
                  <option value="AUDIENCIA">Audiência</option>
                  <option value="DILIGENCIA">Diligência</option>
                  <option value="PETICAO">Petição Protocolada</option>
                  <option value="DECISAO">Decisão / Despacho</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Data/Hora do Evento *
                </label>
                <input
                  type="datetime-local"
                  value={dataHora}
                  onChange={(e) => setDataHora(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Título / Resumo *
              </label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Audiência de Conciliação Designada"
                required
                maxLength={200}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Descrição Detalhada
              </label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Detalhes adicionais sobre este andamento..."
                rows={4}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow resize-none"
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
            form="event-form"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer shadow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Salvar Evento</span>
          </button>
        </div>
      </div>
    </div>
  );
};
