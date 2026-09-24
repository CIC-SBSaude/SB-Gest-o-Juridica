import React, { useState } from 'react';
import { X, Loader2, Link as LinkIcon, Search } from 'lucide-react';
import { ProcessedEmail, Process } from '../../types/database';
import { inboxService } from '../../services/inboxService';

interface LinkProcessModalProps {
  isOpen: boolean;
  email: ProcessedEmail;
  onClose: (changed?: boolean) => void;
}

export const LinkProcessModal: React.FC<LinkProcessModalProps> = ({ isOpen, email, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [search, setSearch] = useState('');
  const [processes, setProcesses] = useState<Partial<Process>[]>([]);
  const [searching, setSearching] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (search.length < 3) return;
    
    setSearching(true);
    const { data, error: err } = await inboxService.searchProcessesForLink(search);
    if (err) setError(err);
    else setProcesses(data);
    setSearching(false);
  };

  const handleLink = async (processId: string | null) => {
    setLoading(true);
    setError(null);
    
    const { success, error: err } = await inboxService.linkProcess(email.id, processId);
    
    if (err) setError(err);
    else onClose(true);
    
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-slate-500" />
            Vincular interpretação ao processo
          </h3>
          <button
            onClick={() => onClose()}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-700">
            Vincular esta interpretação à Gestão de Processos. Referência técnica: <strong>{email.subject || '(sem referência)'}</strong>.
            {email.process_id && (
              <div className="mt-2 text-amber-600 font-medium">
                Esta interpretação já está vinculada. Ao selecionar um novo processo, o vínculo anterior será substituído.
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por processo, protocolo ou demanda..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={search.length < 3 || searching}
              className="px-4 py-2 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
            </button>
          </form>

          <div className="space-y-2 mt-4">
            {processes.map((proc) => (
              <div key={proc.id} className="p-3 border border-slate-200 rounded-lg flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div>
                  <div className="font-mono font-bold text-slate-800 text-sm">{proc.numero_processo}</div>
                  <div className="text-xs text-slate-500 truncate max-w-[250px]">{proc.protocolo_externo || proc.tipo_demanda || proc.objeto_demanda || 'Sem descrição complementar'}</div>
                </div>
                <button
                  onClick={() => handleLink(proc.id!)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
                >
                  Selecionar
                </button>
              </div>
            ))}
            
            {processes.length === 0 && search.length >= 3 && !searching && (
              <div className="text-center text-sm text-slate-500 py-4">Nenhum processo encontrado.</div>
            )}
          </div>

          {email.process_id && (
            <div className="pt-4 border-t border-slate-200 mt-4 text-center">
              <button
                onClick={() => handleLink(null)}
                disabled={loading}
                className="text-sm font-semibold text-red-600 hover:text-red-700 hover:underline"
              >
                Remover vínculo atual
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
