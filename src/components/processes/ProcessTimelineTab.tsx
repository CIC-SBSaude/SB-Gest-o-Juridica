import React, { useState, useEffect } from 'react';
import { Clock, Plus, Loader2, Edit3 } from 'lucide-react';
import { ProcessTimelineEvent } from '../../types/database';
import { timelineService } from '../../services/timelineService';
import { formatDateTime } from '../../utils/date';
import { TimelineEventModal } from './TimelineEventModal';

interface ProcessTimelineTabProps {
  processId: string;
  canEdit: boolean;
}

export const ProcessTimelineTab: React.FC<ProcessTimelineTabProps> = ({ processId, canEdit }) => {
  const [events, setEvents] = useState<ProcessTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ProcessTimelineEvent | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await timelineService.getTimelineEvents(processId);
    if (err) setError(err);
    else setEvents(data);
    setLoading(false);
  };

  useEffect(() => {
    loadEvents();
  }, [processId]);

  const handleOpenModal = (event?: ProcessTimelineEvent) => {
    setSelectedEvent(event || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = (changed?: boolean) => {
    setIsModalOpen(false);
    setSelectedEvent(null);
    if (changed) loadEvents();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Clock className="w-4 h-4 text-red-600" />
          Linha do Tempo
        </h4>
        {canEdit && (
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Evento
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-sm">
          Nenhum evento registrado nesta linha do tempo.
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-200 ml-3 space-y-6">
          {events.map((event) => (
            <div key={event.id} className="relative pl-6">
              {/* Timeline marker */}
              <div className="absolute -left-1.5 top-1.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-sm ring-2 ring-slate-100" />
              
              <div className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {event.tipo}
                    </span>
                    <h5 className="font-bold text-slate-800 text-sm mt-1.5">{event.titulo}</h5>
                  </div>
                  {canEdit && !event.automatico && (
                    <button
                      type="button"
                      onClick={() => handleOpenModal(event)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                      title="Editar Evento"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                
                {event.descricao && (
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed mt-2">
                    {event.descricao}
                  </p>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500 font-medium">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDateTime(event.data_hora)}
                  </span>
                  <span>
                    Origem: <strong className="text-slate-700">{event.origem}</strong>
                  </span>
                  {event.usuario?.display_name && (
                    <span>
                      Por: <strong className="text-slate-700">{event.usuario.display_name}</strong>
                    </span>
                  )}
                  {event.automatico && (
                    <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded">
                      REGISTRO AUTOMÁTICO
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <TimelineEventModal
          isOpen={isModalOpen}
          processId={processId}
          event={selectedEvent}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};
