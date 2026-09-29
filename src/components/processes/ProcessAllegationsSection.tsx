import React, { useEffect, useState, useCallback } from 'react';
import {
  BeneficiaryAllegation,
  AllegationReviewStatus,
} from '../../types/database';
import {
  allegationsService,
  CreateAllegationDTO,
  OBLIGATORY_PREFIX,
} from '../../services/allegationsService';
import { useAuth } from '../../hooks/useAuth';
import { MessageSquare, PhoneCall, Clock, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';

interface ProcessAllegationsSectionProps {
  processId: string;
  readOnly?: boolean;
}

const COMMON_CHANNELS = ['SAC', 'Ouvidoria', 'WhatsApp', 'E-mail', 'Portal / App', 'Presencial', 'ANS', 'Outro'];

export const ProcessAllegationsSection: React.FC<ProcessAllegationsSectionProps> = ({
  processId,
  readOnly = false,
}) => {
  const { user } = useAuth();
  const [allegations, setAllegations] = useState<BeneficiaryAllegation[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<{
    narrativaCorpo: string;
    tentativas_contato_qtd: string;
    tentativas_contato_texto: string;
    canais_selecionados: string[];
    setor_mencionado: string;
    tempo_espera_dias: string;
    tempo_espera_texto: string;
    dificuldade_relatada: string;
    desfecho_alegado: string;
    fonte_documento: string;
    trecho_citado: string;
    error: string | null;
    saving: boolean;
  }>({
    narrativaCorpo: '',
    tentativas_contato_qtd: '',
    tentativas_contato_texto: '',
    canais_selecionados: [],
    setor_mencionado: '',
    tempo_espera_dias: '',
    tempo_espera_texto: '',
    dificuldade_relatada: '',
    desfecho_alegado: '',
    fonte_documento: '',
    trecho_citado: '',
    error: null,
    saving: false,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await allegationsService.getByProcess(processId);
    setAllegations(data);
    setLoading(false);
  }, [processId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleChannel = (channel: string) => {
    setForm(f => {
      const exists = f.canais_selecionados.includes(channel);
      return {
        ...f,
        canais_selecionados: exists
          ? f.canais_selecionados.filter(c => c !== channel)
          : [...f.canais_selecionados, channel],
      };
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!form.narrativaCorpo.trim()) {
      setForm(f => ({ ...f, error: 'Descreva a alegação do beneficiário.' }));
      return;
    }

    setForm(f => ({ ...f, saving: true, error: null }));

    // Garante que a narrativa comece exatamente com o prefixo
    const narrativaCompleta = `${OBLIGATORY_PREFIX} ${form.narrativaCorpo.trim()}`;

    const dto: CreateAllegationDTO = {
      process_id: processId,
      narrativa: narrativaCompleta,
      tentativas_contato_qtd: form.tentativas_contato_qtd ? parseInt(form.tentativas_contato_qtd, 10) : null,
      tentativas_contato_texto: form.tentativas_contato_texto.trim() || null,
      canais_mencionados: form.canais_selecionados.length > 0 ? form.canais_selecionados : undefined,
      setor_mencionado: form.setor_mencionado.trim() || null,
      tempo_espera_dias: form.tempo_espera_dias ? parseInt(form.tempo_espera_dias, 10) : null,
      tempo_espera_texto: form.tempo_espera_texto.trim() || null,
      dificuldade_relatada: form.dificuldade_relatada.trim() || null,
      desfecho_alegado: form.desfecho_alegado.trim() || null,
      fonte_documento: form.fonte_documento.trim() || null,
      trecho_citado: form.trecho_citado.trim() || null,
    };

    const { error } = await allegationsService.create(dto, user.id);
    if (error) {
      setForm(f => ({ ...f, saving: false, error }));
      return;
    }

    setForm({
      narrativaCorpo: '',
      tentativas_contato_qtd: '',
      tentativas_contato_texto: '',
      canais_selecionados: [],
      setor_mencionado: '',
      tempo_espera_dias: '',
      tempo_espera_texto: '',
      dificuldade_relatada: '',
      desfecho_alegado: '',
      fonte_documento: '',
      trecho_citado: '',
      error: null,
      saving: false,
    });
    setShowAddForm(false);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta alegação?')) return;
    const { error } = await allegationsService.delete(id);
    if (error) {
      alert(`Erro: ${error}`);
      return;
    }
    await loadData();
  };

  if (loading) {
    return <div className="text-xs text-gray-500 py-2">Carregando alegações do beneficiário...</div>;
  }

  return (
    <section className="space-y-4" aria-labelledby="allegations-section-title">
      <div className="border border-gray-200 rounded-lg p-3 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 id="allegations-section-title" className="text-xs font-semibold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-red-600" />
              <span>Dificuldades Alegadas pelo Beneficiário (RF10)</span>
            </h4>
            <p className="text-xs text-gray-500">
              Resumo autônomo com prefixo obrigatório literal conforme DOC01. Descreve alegações atribuídas à fonte sem afirmar veracidade.
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowAddForm(v => !v)}
              className="text-xs bg-white hover:bg-gray-50 text-blue-600 font-medium px-2.5 py-1 border border-blue-300 rounded shadow-sm"
            >
              {showAddForm ? 'Cancelar' : '+ Nova Alegação'}
            </button>
          )}
        </div>

        {/* Formulário de Nova Alegação */}
        {showAddForm && (
          <form onSubmit={handleCreate} className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 mb-4 space-y-3 text-xs">
            <div>
              <label className="block text-gray-700 font-bold mb-1">
                Narrativa da Alegação
                <span className="ml-1 text-[11px] font-normal text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                  Prefixo fixo obrigatório
                </span>
              </label>
              <div className="flex flex-col sm:flex-row rounded border border-gray-300 bg-white overflow-hidden focus-within:ring-1 focus-within:ring-blue-500">
                <span className="bg-gray-100 px-2.5 py-1.5 font-bold text-gray-700 text-xs shrink-0 select-none border-b sm:border-b-0 sm:border-r border-gray-300">
                  {OBLIGATORY_PREFIX}
                </span>
                <textarea
                  rows={2}
                  placeholder="relata ter tentado contato sem sucesso por 3 vezes e aguardado autorização por 10 dias..."
                  value={form.narrativaCorpo}
                  onChange={e => setForm(f => ({ ...f, narrativaCorpo: e.target.value }))}
                  className="w-full p-2 text-xs focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* Canais Mencionados */}
            <div>
              <label className="block text-gray-600 font-medium mb-1">Canais Mencionados</label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_CHANNELS.map(ch => {
                  const active = form.canais_selecionados.includes(ch);
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => handleToggleChannel(ch)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {ch}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-gray-600 font-medium mb-1">Tentativas de Contato</label>
                <div className="grid grid-cols-2 gap-1">
                  <input
                    type="number"
                    placeholder="Qtd exata (ex: 3)"
                    value={form.tentativas_contato_qtd}
                    onChange={e => setForm(f => ({ ...f, tentativas_contato_qtd: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Ou texto (ex: várias)"
                    value={form.tentativas_contato_texto}
                    onChange={e => setForm(f => ({ ...f, tentativas_contato_texto: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Tempo de Espera</label>
                <div className="grid grid-cols-2 gap-1">
                  <input
                    type="number"
                    placeholder="Dias (ex: 10)"
                    value={form.tempo_espera_dias}
                    onChange={e => setForm(f => ({ ...f, tempo_espera_dias: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Ou texto (ex: 2 semanas)"
                    value={form.tempo_espera_texto}
                    onChange={e => setForm(f => ({ ...f, tempo_espera_texto: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Setor Mencionado</label>
                <input
                  type="text"
                  placeholder="Ex: Regulação / Auditoria médica"
                  value={form.setor_mencionado}
                  onChange={e => setForm(f => ({ ...f, setor_mencionado: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-gray-600 font-medium mb-1">Fonte / Documento</label>
                <input
                  type="text"
                  placeholder="Ex: Petição Inicial fls. 12 ou E-mail SAC de 14/03"
                  value={form.fonte_documento}
                  onChange={e => setForm(f => ({ ...f, fonte_documento: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Desfecho Alegado</label>
                <input
                  type="text"
                  placeholder="Ex: Negativa de cobertura por ausência de rede credenciada"
                  value={form.desfecho_alegado}
                  onChange={e => setForm(f => ({ ...f, desfecho_alegado: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>
            </div>

            {form.error && <p className="text-red-600 font-medium">{form.error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={form.saving}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
              >
                {form.saving ? 'Salvando...' : 'Salvar Alegação'}
              </button>
            </div>
          </form>
        )}

        {/* Lista de Alegações */}
        {allegations.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-1">Nenhuma alegação de beneficiário registrada.</p>
        ) : (
          <div className="space-y-3">
            {allegations.map(al => (
              <div key={al.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50/40 text-xs space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="flex-1 space-y-1">
                    <p className="text-gray-900 font-medium leading-relaxed bg-white p-2.5 rounded border border-gray-200">
                      {al.narrativa}
                    </p>
                  </div>

                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handleDelete(al.id)}
                      className="text-gray-400 hover:text-red-600 text-xs px-1 self-end sm:self-start"
                      title="Excluir alegação"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Metadados e Chips de Evidência */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                  {al.canais_mencionados && al.canais_mencionados.length > 0 && (
                    <div className="flex items-center gap-1 bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                      <PhoneCall className="w-3 h-3 text-blue-600" />
                      <span>{al.canais_mencionados.join(', ')}</span>
                    </div>
                  )}

                  {(al.tentativas_contato_qtd || al.tentativas_contato_texto) && (
                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                      Tentativas: {al.tentativas_contato_qtd ? `${al.tentativas_contato_qtd} vezes` : al.tentativas_contato_texto}
                    </span>
                  )}

                  {(al.tempo_espera_dias || al.tempo_espera_texto) && (
                    <div className="flex items-center gap-1 bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span>Espera: {al.tempo_espera_dias ? `${al.tempo_espera_dias} dias` : al.tempo_espera_texto}</span>
                    </div>
                  )}

                  {al.setor_mencionado && (
                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                      Setor: {al.setor_mencionado}
                    </span>
                  )}

                  {al.fonte_documento && (
                    <div className="flex items-center gap-1 text-gray-500 font-mono text-[10px]">
                      <FileText className="w-3 h-3 text-gray-400" />
                      <span>Fonte: {al.fonte_documento}</span>
                    </div>
                  )}

                  <span className="ml-auto text-[10px] bg-green-100 text-green-800 font-semibold px-1.5 py-0.5 rounded">
                    Revisão: {al.status_revisao}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
