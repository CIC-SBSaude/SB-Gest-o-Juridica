import React, { useEffect, useState, useCallback } from 'react';
import {
  ProcessBeneficiarySummary,
  BeneficiaryPerson,
  BeneficiaryEnrollment,
  BeneficiaryPapel,
  TipoContratacao,
} from '../../types/database';
import {
  beneficiariesService,
  CreatePersonDTO,
  CreateEnrollmentDTO,
  LinkBeneficiaryDTO,
  UnifiedBeneficiarySearchResult,
} from '../../services/beneficiariesService';
import { useAuth } from '../../hooks/useAuth';

interface ProcessBeneficiariesSectionProps {
  processId: string;
  readOnly?: boolean;
}

const PAPEL_LABELS: Record<BeneficiaryPapel, string> = {
  TITULAR: 'Titular',
  DEPENDENTE: 'Dependente',
  REPRESENTANTE_LEGAL: 'Representante Legal',
  FALECIDO: 'Falecido',
  OUTRO: 'Outro',
};

const TIPO_CONTRATACAO_LABELS: Record<TipoContratacao, string> = {
  COLETIVO_EMPRESARIAL: 'Coletivo Empresarial',
  COLETIVO_ADESAO: 'Coletivo por Adesão',
  INDIVIDUAL_FAMILIAR: 'Individual / Familiar',
  OUTRO: 'Outro',
  NAO_INFORMADO: 'Não informado',
};

const formatCPF = (cpf: string | null | undefined): string => {
  if (!cpf) return '—';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
};

const calculateAge = (dob: string | null | undefined): string => {
  if (!dob) return '';
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? String(age) : '';
};

export const ProcessBeneficiariesSection: React.FC<ProcessBeneficiariesSectionProps> = ({
  processId,
  readOnly = false,
}) => {
  const { user } = useAuth();
  const [beneficiaries, setBeneficiaries] = useState<ProcessBeneficiarySummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Form search and creation
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UnifiedBeneficiarySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<BeneficiaryPerson | null>(null);
  const [enrollments, setEnrollments] = useState<BeneficiaryEnrollment[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string>('');

  // Mode: search vs create new person
  const [isCreatingNewPerson, setIsCreatingNewPerson] = useState(false);
  const [newPersonForm, setNewPersonForm] = useState<CreatePersonDTO>({
    nome_completo: '',
    cpf: '',
    data_nascimento: '',
    nome_mae: '',
    municipio: '',
    uf: '',
  });

  // Link details
  const [linkForm, setLinkForm] = useState<{
    papel: BeneficiaryPapel;
    is_principal: boolean;
    snapshot_municipio: string;
    snapshot_uf: string;
    snapshot_idade: string;
    error: string | null;
    saving: boolean;
  }>({
    papel: 'TITULAR',
    is_principal: false,
    snapshot_municipio: '',
    snapshot_uf: '',
    snapshot_idade: '',
    error: null,
    saving: false,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await beneficiariesService.getByProcess(processId);
    setBeneficiaries(data);
    setLoading(false);
  }, [processId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const { data } = await beneficiariesService.searchUnified(searchQuery);
    setSearchResults(data);
    setSearching(false);
  };

  const handleSelectPerson = async (person: BeneficiaryPerson) => {
    setSelectedPerson(person);
    setLinkForm(f => ({
      ...f,
      snapshot_municipio: person.municipio || '',
      snapshot_uf: person.uf || '',
      snapshot_idade: calculateAge(person.data_nascimento),
    }));
    const { data } = await beneficiariesService.getEnrollmentsByPerson(person.id);
    setEnrollments(data);
    if (data.length > 0) {
      setSelectedEnrollmentId(data[0].id);
    }
  };

  const handleSelectUnified = async (item: UnifiedBeneficiarySearchResult) => {
    if (item.origem === 'LOCAL' && item.rawLocal) {
      await handleSelectPerson(item.rawLocal);
      return;
    }

    if (item.origem === 'ASSISTENCIAL' && item.rawAssistencial) {
      setImporting(true);
      const { person, enrollment, error } = await beneficiariesService.importFromAssistencial(
        item.rawAssistencial,
        user?.id
      );
      setImporting(false);

      if (error || !person) {
        alert(error || 'Não foi possível importar dados do beneficiário.');
        return;
      }

      setSelectedPerson(person);
      setLinkForm(f => ({
        ...f,
        snapshot_municipio: person.municipio || '',
        snapshot_uf: person.uf || '',
        snapshot_idade: calculateAge(person.data_nascimento),
      }));

      const { data } = await beneficiariesService.getEnrollmentsByPerson(person.id);
      setEnrollments(data);
      if (enrollment) {
        setSelectedEnrollmentId(enrollment.id);
      } else if (data.length > 0) {
        setSelectedEnrollmentId(data[0].id);
      }
    }
  };

  const handleSetPrincipal = async (id: string) => {
    if (!user) return;
    const { error } = await beneficiariesService.setPrincipal(id, processId, user.id);
    if (error) {
      alert(`Erro: ${error}`);
      return;
    }
    await loadData();
  };

  const handleToggleConfirm = async (b: ProcessBeneficiarySummary) => {
    if (!user) return;
    const { error } = await beneficiariesService.toggleConfirm(b.process_beneficiary_id, b.confirmado, user.id);
    if (error) {
      alert(`Erro: ${error}`);
      return;
    }
    await loadData();
  };

  const handleUnlink = async (id: string) => {
    if (!confirm('Desvincular este beneficiário do processo?')) return;
    const { error } = await beneficiariesService.unlink(id);
    if (error) {
      alert(`Erro: ${error}`);
      return;
    }
    await loadData();
  };

  const handleSubmitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLinkForm(f => ({ ...f, saving: true, error: null }));

    let personId = selectedPerson?.id;

    // Se estiver criando pessoa nova
    if (isCreatingNewPerson) {
      if (!newPersonForm.nome_completo.trim()) {
        setLinkForm(f => ({ ...f, saving: false, error: 'Nome completo é obrigatório.' }));
        return;
      }
      const pRes = await beneficiariesService.createPerson(newPersonForm, user.id);
      if (pRes.error || !pRes.data) {
        setLinkForm(f => ({ ...f, saving: false, error: pRes.error || 'Erro ao cadastrar pessoa.' }));
        return;
      }
      personId = pRes.data.id;
    }

    if (!personId) {
      setLinkForm(f => ({ ...f, saving: false, error: 'Selecione ou cadastre uma pessoa.' }));
      return;
    }

    const dto: LinkBeneficiaryDTO = {
      process_id: processId,
      person_id: personId,
      enrollment_id: selectedEnrollmentId || null,
      papel: linkForm.papel,
      is_principal: beneficiaries.length === 0 ? true : linkForm.is_principal,
      snapshot_municipio: linkForm.snapshot_municipio.trim() || null,
      snapshot_uf: linkForm.snapshot_uf.trim().toUpperCase() || null,
      snapshot_idade_na_data: linkForm.snapshot_idade ? parseInt(linkForm.snapshot_idade, 10) : null,
      confirmado: true,
      fonte_consulta: 'MANUAL',
    };

    const { error } = await beneficiariesService.linkBeneficiary(dto, user.id);
    if (error) {
      setLinkForm(f => ({ ...f, saving: false, error }));
      return;
    }

    setShowAddModal(false);
    setSelectedPerson(null);
    setIsCreatingNewPerson(false);
    setSearchQuery('');
    setSearchResults([]);
    setLinkForm({
      papel: 'TITULAR',
      is_principal: false,
      snapshot_municipio: '',
      snapshot_uf: '',
      snapshot_idade: '',
      error: null,
      saving: false,
    });
    await loadData();
  };

  if (loading) {
    return <div className="text-xs text-gray-500 py-2">Carregando beneficiários...</div>;
  }

  return (
    <section className="space-y-4" aria-labelledby="beneficiaries-section-title">
      <div className="border border-gray-200 rounded-lg p-3 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 id="beneficiaries-section-title" className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
              Beneficiários e Planos ({beneficiaries.length})
            </h4>
            <p className="text-xs text-gray-500">
              Gestão de beneficiários (RF05), dados do plano/carteirinha (RF06, RF07) e fotografia do domicílio na data do fato.
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowAddModal(v => !v)}
              className="text-xs bg-white hover:bg-gray-50 text-blue-600 font-medium px-2.5 py-1 border border-blue-300 rounded shadow-sm"
            >
              {showAddModal ? 'Cancelar' : '+ Vincular Beneficiário'}
            </button>
          )}
        </div>

        {/* Modal / Card para adicionar beneficiário */}
        {showAddModal && (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4 space-y-3 text-xs">
            <div className="flex items-center gap-4 border-b border-gray-200 pb-2">
              <button
                type="button"
                onClick={() => setIsCreatingNewPerson(false)}
                className={`font-semibold pb-1 border-b-2 transition ${
                  !isCreatingNewPerson ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
                }`}
              >
                Buscar Pessoa Existente
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingNewPerson(true)}
                className={`font-semibold pb-1 border-b-2 transition ${
                  isCreatingNewPerson ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
                }`}
              >
                Cadastrar Nova Pessoa
              </button>
            </div>

            {!isCreatingNewPerson ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Digite CPF (apenas números) ou nome completo..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                    className="flex-1 border border-gray-300 rounded px-2.5 py-1.5 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleSearch}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded font-medium hover:bg-blue-700"
                  >
                    Buscar
                  </button>
                </div>

                {searching && (
                  <div className="text-gray-500 text-xs italic py-2 flex items-center justify-center gap-2 bg-white border border-gray-200 rounded">
                    <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                    <span>Buscando no Jurídico e no Gestão Assistencial...</span>
                  </div>
                )}

                {importing && (
                  <div className="text-emerald-700 text-xs italic py-2 flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 rounded">
                    <span className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
                    <span>Importando dados cadastrais do Gestão Assistencial...</span>
                  </div>
                )}

                {!searching && searchResults.length > 0 && (
                  <div className="divide-y divide-gray-200 border border-gray-200 rounded bg-white max-h-56 overflow-y-auto shadow-xs">
                    {searchResults.map(p => {
                      const isSelected = selectedPerson?.id === (p.person_id || p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleSelectUnified(p)}
                          className={`p-2.5 cursor-pointer hover:bg-blue-50/70 flex items-center justify-between transition-colors ${
                            isSelected ? 'bg-blue-50 font-medium ring-1 ring-inset ring-blue-500' : ''
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-900 font-medium">{p.nome_completo}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${
                                  p.origem === 'ASSISTENCIAL'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {p.origem === 'ASSISTENCIAL' ? 'Gestão Assistencial' : 'Jurídico'}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-gray-500 font-mono">
                              <span>CPF: {formatCPF(p.cpf)}</span>
                              {p.carteirinha && (
                                <span className="text-blue-700 bg-blue-50 px-1 rounded font-sans font-medium">
                                  Cart: {p.carteirinha}
                                </span>
                              )}
                              {p.empresa && (
                                <span className="text-slate-600 font-sans truncate max-w-[240px]" title={p.empresa}>
                                  {p.empresa}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-[11px] text-gray-500 shrink-0 ml-2">
                            <div>{p.municipio ? `${p.municipio}/${p.uf || ''}` : 'Sem cidade'}</div>
                            {p.data_nascimento && <div>Nasc: {formatDate(p.data_nascimento)}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!searching && searchQuery.trim().length > 0 && searchResults.length === 0 && (
                  <div className="text-gray-500 text-xs py-3 text-center bg-gray-50 rounded border border-dashed border-gray-200">
                    Nenhum beneficiário encontrado no Jurídico ou Gestão Assistencial para a busca realizada.
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <label className="block text-gray-600 font-medium mb-1">Nome Completo</label>
                  <input
                    type="text"
                    value={newPersonForm.nome_completo}
                    onChange={e => setNewPersonForm(f => ({ ...f, nome_completo: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 font-medium mb-1">CPF</label>
                  <input
                    type="text"
                    placeholder="11 dígitos"
                    value={newPersonForm.cpf ?? ''}
                    onChange={e => setNewPersonForm(f => ({ ...f, cpf: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 font-medium mb-1">Data Nascimento</label>
                  <input
                    type="date"
                    value={newPersonForm.data_nascimento ?? ''}
                    onChange={e => setNewPersonForm(f => ({ ...f, data_nascimento: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 font-medium mb-1">Município Residencial</label>
                  <input
                    type="text"
                    value={newPersonForm.municipio ?? ''}
                    onChange={e => setNewPersonForm(f => ({ ...f, municipio: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 font-medium mb-1">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="Ex: SP"
                    value={newPersonForm.uf ?? ''}
                    onChange={e => setNewPersonForm(f => ({ ...f, uf: e.target.value.toUpperCase() }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                  />
                </div>
              </div>
            )}

            {/* Configurações do Vínculo com o Processo */}
            {(selectedPerson || isCreatingNewPerson) && (
              <form onSubmit={handleSubmitLink} className="pt-3 border-t border-gray-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-gray-600 font-medium mb-1">Papel no Processo</label>
                    <select
                      value={linkForm.papel}
                      onChange={e => setLinkForm(f => ({ ...f, papel: e.target.value as BeneficiaryPapel }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="TITULAR">Titular</option>
                      <option value="DEPENDENTE">Dependente</option>
                      <option value="REPRESENTANTE_LEGAL">Representante Legal</option>
                      <option value="FALECIDO">Falecido</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-600 font-medium mb-1">Carteirinha / Inscrição</label>
                    <select
                      value={selectedEnrollmentId}
                      onChange={e => setSelectedEnrollmentId(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="">Nenhuma / Sem carteirinha vinculada</option>
                      {enrollments.map(en => (
                        <option key={en.id} value={en.id}>
                          {en.numero_carteirinha} — {en.plano_nome ?? 'Plano'} ({en.status_inscricao})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-1.5 cursor-pointer text-gray-700">
                      <input
                        type="checkbox"
                        checked={linkForm.is_principal}
                        onChange={e => setLinkForm(f => ({ ...f, is_principal: e.target.checked }))}
                      />
                      <span>Beneficiário Principal do Processo</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-amber-50/50 p-2.5 rounded border border-amber-200">
                  <div className="sm:col-span-3 text-[11px] font-semibold text-amber-800">
                    Fotografia de Localização na Data do Fato (RF06):
                  </div>
                  <div>
                    <label className="block text-gray-600 font-medium mb-1">Município do Fato</label>
                    <input
                      type="text"
                      placeholder="Ex: Santos"
                      value={linkForm.snapshot_municipio}
                      onChange={e => setLinkForm(f => ({ ...f, snapshot_municipio: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-600 font-medium mb-1">UF do Fato</label>
                    <input
                      type="text"
                      maxLength={2}
                      placeholder="SP"
                      value={linkForm.snapshot_uf}
                      onChange={e => setLinkForm(f => ({ ...f, snapshot_uf: e.target.value.toUpperCase() }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-600 font-medium mb-1">Idade na Data</label>
                    <input
                      type="number"
                      placeholder="Ex: 42"
                      value={linkForm.snapshot_idade}
                      onChange={e => setLinkForm(f => ({ ...f, snapshot_idade: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                    />
                  </div>
                </div>

                {linkForm.error && <p className="text-red-600 font-medium">{linkForm.error}</p>}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={linkForm.saving}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
                  >
                    {linkForm.saving ? 'Vinculando...' : 'Confirmar Vínculo'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Lista de Beneficiários Vinculados */}
        {beneficiaries.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-1">Nenhum beneficiário vinculado a este processo.</p>
        ) : (
          <div className="space-y-3">
            {beneficiaries.map(b => (
              <div
                key={b.process_beneficiary_id}
                className={`p-3 rounded-lg border text-xs ${
                  b.is_principal ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-sm">{b.nome_completo}</span>
                      {b.is_principal && (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-300">
                          ★ PRINCIPAL
                        </span>
                      )}
                      <span className="bg-gray-100 text-gray-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                        {PAPEL_LABELS[b.papel]}
                      </span>
                      {b.confirmado ? (
                        <span className="bg-green-100 text-green-800 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                          ✓ Confirmado
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                          ⚠ Pendente
                        </span>
                      )}
                    </div>

                    <div className="text-gray-500 mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5">
                      <span>CPF: <strong className="font-mono text-gray-700">{formatCPF(b.cpf)}</strong></span>
                      {b.data_nascimento && <span>Nascimento: {formatDate(b.data_nascimento)}</span>}
                      {b.snapshot_idade_na_data && <span>Idade na data: {b.snapshot_idade_na_data} anos</span>}
                    </div>
                  </div>

                  {!readOnly && (
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {!b.is_principal && (
                        <button
                          type="button"
                          onClick={() => handleSetPrincipal(b.process_beneficiary_id)}
                          className="text-[11px] text-blue-600 hover:underline font-medium"
                        >
                          Definir Principal
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleConfirm(b)}
                        className="text-[11px] text-gray-600 hover:underline"
                      >
                        {b.confirmado ? 'Desconfirmar' : 'Confirmar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUnlink(b.process_beneficiary_id)}
                        className="text-gray-400 hover:text-red-600 text-xs px-1"
                        title="Desvincular do processo"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {/* Dados da Carteirinha e Plano (RF06, RF07) */}
                <div className="mt-2.5 pt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-2 bg-gray-50 p-2 rounded">
                  <div>
                    <span className="text-gray-400 block text-[10px]">Carteirinha / Plano</span>
                    <span className="font-semibold text-gray-800">
                      {b.numero_carteirinha ? `${b.numero_carteirinha} (${b.plano_nome ?? 'Plano'})` : 'Não informada'}
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-400 block text-[10px]">Modalidade Contratual</span>
                    <span className="font-medium text-gray-800">
                      {b.tipo_contratacao ? TIPO_CONTRATACAO_LABELS[b.tipo_contratacao] : 'Não informada'}
                    </span>
                    {b.estipulante_pj_nome && (
                      <span className="block text-[10px] text-gray-500 truncate">
                        Estipulante: {b.estipulante_pj_nome}
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-gray-400 block text-[10px]">Localização no Fato & Regional</span>
                    <span className="font-medium text-gray-800">
                      {b.snapshot_municipio ? `${b.snapshot_municipio}/${b.snapshot_uf ?? ''}` : 'Não registrada'}
                    </span>
                    {b.snapshot_regional && (
                      <span className="block text-[10px] text-blue-700 font-semibold">
                        Regional: {b.snapshot_regional}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
