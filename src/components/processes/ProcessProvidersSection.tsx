import React, { useEffect, useState, useCallback } from 'react';
import {
  ProcessServiceProvider,
  ProviderService,
  ProviderDebtSummary,
  ProviderCategoria,
  ProviderPapelProcessual,
  PrecisaoData,
} from '../../types/database';
import {
  providersService,
  CreateProviderDTO,
  CreateServiceDTO,
} from '../../services/providersService';
import { useAuth } from '../../hooks/useAuth';

interface ProcessProvidersSectionProps {
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

const CATEGORIA_LABELS: Record<ProviderCategoria, string> = {
  HOSPITAL: 'Hospital',
  CLINICA: 'Clínica',
  OPME: 'OPME / Órteses e Próteses',
  MEDICO_PJ: 'Médico PJ',
  MANUTENCAO: 'Manutenção / Apoio',
  OUTRO: 'Outro Prestador',
};

const PAPEL_LABELS: Record<ProviderPapelProcessual, string> = {
  AUTOR: 'Autor da Ação',
  CITADO_LOCAL: 'Apenas Citado como Local',
  LITISCONSORTE: 'Litisconsorte',
  TERCEIRO: 'Terceiro Interessado',
  OUTRO: 'Outro Papel',
};

export const ProcessProvidersSection: React.FC<ProcessProvidersSectionProps> = ({
  processId,
  readOnly = false,
}) => {
  const { user } = useAuth();
  const [providers, setProviders] = useState<ProcessServiceProvider[]>([]);
  const [services, setServices] = useState<ProviderService[]>([]);
  const [debtSummaries, setDebtSummaries] = useState<ProviderDebtSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [providerForm, setProviderForm] = useState<{
    nome_razao_social: string;
    tipo_pessoa: 'PJ' | 'PF';
    documento: string;
    categoria: ProviderCategoria;
    natureza_vinculo: string;
    papel_processual: ProviderPapelProcessual;
    vinculo_confirmado: boolean;
    error: string | null;
    saving: boolean;
  }>({
    nome_razao_social: '',
    tipo_pessoa: 'PJ',
    documento: '',
    categoria: 'HOSPITAL',
    natureza_vinculo: 'CONTRATUAL_DIRETO',
    papel_processual: 'AUTOR',
    vinculo_confirmado: false,
    error: null,
    saving: false,
  });

  const [selectedProviderIdForService, setSelectedProviderIdForService] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState<{
    tipo_servico: string;
    descricao: string;
    periodo_inicio: string;
    periodo_fim: string;
    precisao_data: PrecisaoData;
    competencia_entrada: string;
    vencimento_fatura: string;
    error: string | null;
    saving: boolean;
  }>({
    tipo_servico: '',
    descricao: '',
    periodo_inicio: '',
    periodo_fim: '',
    precisao_data: 'EXATA',
    competencia_entrada: '',
    vencimento_fatura: '',
    error: null,
    saving: false,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [pRes, sRes, dRes] = await Promise.all([
      providersService.getProviders(processId),
      providersService.getServices(processId),
      providersService.getDebtSummary(processId),
    ]);
    setProviders(pRes.data);
    setServices(sRes.data);
    setDebtSummaries(dRes.data);
    setLoading(false);
  }, [processId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!providerForm.nome_razao_social.trim()) {
      setProviderForm(f => ({ ...f, error: 'Razão social ou nome é obrigatório.' }));
      return;
    }

    setProviderForm(f => ({ ...f, saving: true, error: null }));

    const dto: CreateProviderDTO = {
      process_id: processId,
      nome_razao_social: providerForm.nome_razao_social.trim(),
      tipo_pessoa: providerForm.tipo_pessoa,
      documento: providerForm.documento.trim() || null,
      categoria: providerForm.categoria,
      natureza_vinculo: providerForm.natureza_vinculo,
      papel_processual: providerForm.papel_processual,
      vinculo_confirmado: providerForm.vinculo_confirmado,
    };

    const { error } = await providersService.createProvider(dto, user.id);
    if (error) {
      setProviderForm(f => ({ ...f, error, saving: false }));
      return;
    }

    setProviderForm({
      nome_razao_social: '',
      tipo_pessoa: 'PJ',
      documento: '',
      categoria: 'HOSPITAL',
      natureza_vinculo: 'CONTRATUAL_DIRETO',
      papel_processual: 'AUTOR',
      vinculo_confirmado: false,
      error: null,
      saving: false,
    });
    setShowAddProvider(false);
    await loadData();
  };

  const handleToggleConfirmVinculo = async (provider: ProcessServiceProvider) => {
    if (!user) return;
    const { error } = await providersService.updateProvider(
      provider.id,
      { vinculo_confirmado: !provider.vinculo_confirmado },
      user.id,
    );
    if (error) {
      alert(`Erro: ${error}`);
      return;
    }
    await loadData();
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProviderIdForService) return;

    if (!serviceForm.tipo_servico.trim()) {
      setServiceForm(f => ({ ...f, error: 'Tipo do serviço é obrigatório.' }));
      return;
    }

    if (serviceForm.periodo_inicio && serviceForm.periodo_fim && serviceForm.periodo_fim < serviceForm.periodo_inicio) {
      setServiceForm(f => ({ ...f, error: 'A data final do período não pode ser anterior à data inicial.' }));
      return;
    }

    setServiceForm(f => ({ ...f, saving: true, error: null }));

    const dto: CreateServiceDTO = {
      process_id: processId,
      provider_id: selectedProviderIdForService,
      tipo_servico: serviceForm.tipo_servico.trim(),
      descricao: serviceForm.descricao.trim() || null,
      periodo_inicio: serviceForm.periodo_inicio || null,
      periodo_fim: serviceForm.periodo_fim || null,
      precisao_data: serviceForm.precisao_data,
      competencia_entrada: serviceForm.competencia_entrada.trim() || null,
      vencimento_fatura: serviceForm.vencimento_fatura || null,
    };

    const { error } = await providersService.createService(dto, user.id);
    if (error) {
      setServiceForm(f => ({ ...f, error, saving: false }));
      return;
    }

    setServiceForm({
      tipo_servico: '',
      descricao: '',
      periodo_inicio: '',
      periodo_fim: '',
      precisao_data: 'EXATA',
      competencia_entrada: '',
      vencimento_fatura: '',
      error: null,
      saving: false,
    });
    setSelectedProviderIdForService(null);
    await loadData();
  };

  const handleDeleteService = async (id: string) => {
    const { error } = await providersService.deleteService(id);
    if (error) {
      alert(`Erro: ${error}`);
      return;
    }
    await loadData();
  };

  if (loading) {
    return <div className="text-xs text-gray-500 py-2">Carregando dados de prestadores...</div>;
  }

  return (
    <section className="space-y-4" aria-labelledby="providers-section-title">
      <div className="border border-gray-200 rounded-lg p-3 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 id="providers-section-title" className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
              Prestadores e Serviços Vinculados ({providers.length})
            </h4>
            <p className="text-xs text-gray-500">
              Controle de vínculo não-CLT, escopo temporal e dívidas discriminadas por prestador (RF11, RF12, RF13).
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowAddProvider(v => !v)}
              className="text-xs bg-white hover:bg-gray-50 text-blue-600 font-medium px-2.5 py-1 border border-blue-300 rounded shadow-sm"
            >
              {showAddProvider ? 'Cancelar' : '+ Novo Prestador'}
            </button>
          )}
        </div>

        {/* Formulário Novo Prestador */}
        {showAddProvider && (
          <form onSubmit={handleCreateProvider} className="bg-gray-50 p-3 rounded border border-gray-200 mb-4 space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <label className="block text-gray-600 font-medium mb-1">Razão Social / Nome</label>
                <input
                  type="text"
                  placeholder="Ex: Hospital Samaritano Ltda"
                  value={providerForm.nome_razao_social}
                  onChange={e => setProviderForm(f => ({ ...f, nome_razao_social: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Tipo de Pessoa</label>
                <select
                  value={providerForm.tipo_pessoa}
                  onChange={e => setProviderForm(f => ({ ...f, tipo_pessoa: e.target.value as 'PJ' | 'PF' }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  <option value="PJ">Pessoa Jurídica (PJ)</option>
                  <option value="PF">Pessoa Física (Não CLT)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-gray-600 font-medium mb-1">Documento (CNPJ / CPF)</label>
                <input
                  type="text"
                  placeholder="Apenas números"
                  value={providerForm.documento}
                  onChange={e => setProviderForm(f => ({ ...f, documento: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Categoria</label>
                <select
                  value={providerForm.categoria}
                  onChange={e => setProviderForm(f => ({ ...f, categoria: e.target.value as ProviderCategoria }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  <option value="HOSPITAL">Hospital</option>
                  <option value="CLINICA">Clínica</option>
                  <option value="OPME">OPME</option>
                  <option value="MEDICO_PJ">Médico PJ</option>
                  <option value="MANUTENCAO">Manutenção / Apoio</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Papel no Processo</label>
                <select
                  value={providerForm.papel_processual}
                  onChange={e => setProviderForm(f => ({ ...f, papel_processual: e.target.value as ProviderPapelProcessual }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  <option value="AUTOR">Autor da Ação</option>
                  <option value="CITADO_LOCAL">Apenas Citado como Local</option>
                  <option value="LITISCONSORTE">Litisconsorte</option>
                  <option value="TERCEIRO">Terceiro</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer text-gray-700">
                <input
                  type="checkbox"
                  checked={providerForm.vinculo_confirmado}
                  onChange={e => setProviderForm(f => ({ ...f, vinculo_confirmado: e.target.checked }))}
                />
                <span>Vínculo comprovado por evidência contratual / processual</span>
              </label>
            </div>

            {providerForm.error && <p className="text-red-600">{providerForm.error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddProvider(false)}
                className="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={providerForm.saving}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
              >
                {providerForm.saving ? 'Salvando...' : 'Cadastrar Prestador'}
              </button>
            </div>
          </form>
        )}

        {/* Modal/Box de Adicionar Serviço */}
        {selectedProviderIdForService && (
          <form onSubmit={handleCreateService} className="bg-amber-50/50 p-3 rounded border border-amber-300 mb-4 space-y-2 text-xs">
            <h5 className="font-semibold text-gray-800">
              Adicionar Serviço Prestado — {providers.find(p => p.id === selectedProviderIdForService)?.nome_razao_social}
            </h5>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-gray-600 font-medium mb-1">Tipo de Serviço</label>
                <input
                  type="text"
                  placeholder="Ex: Internação UTI / Procedimento Cirúrgico"
                  value={serviceForm.tipo_servico}
                  onChange={e => setServiceForm(f => ({ ...f, tipo_servico: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Período Início</label>
                <input
                  type="date"
                  value={serviceForm.periodo_inicio}
                  onChange={e => setServiceForm(f => ({ ...f, periodo_inicio: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Período Fim</label>
                <input
                  type="date"
                  value={serviceForm.periodo_fim}
                  onChange={e => setServiceForm(f => ({ ...f, periodo_fim: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-gray-600 font-medium mb-1">Precisão da Data</label>
                <select
                  value={serviceForm.precisao_data}
                  onChange={e => setServiceForm(f => ({ ...f, precisao_data: e.target.value as PrecisaoData }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  <option value="EXATA">Data Exata (dias confirmados)</option>
                  <option value="MENSAL">Mensal (ex: Março/2026)</option>
                  <option value="INTERVALO_ABERTO">Intervalo Aberto</option>
                  <option value="DESCONHECIDA">Desconhecida</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Competência Entrada</label>
                <input
                  type="text"
                  placeholder="Ex: 2026-07"
                  value={serviceForm.competencia_entrada}
                  onChange={e => setServiceForm(f => ({ ...f, competencia_entrada: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-medium mb-1">Descrição Detalhada</label>
                <input
                  type="text"
                  placeholder="Ex: Paciente internado conforme guia de internação"
                  value={serviceForm.descricao}
                  onChange={e => setServiceForm(f => ({ ...f, descricao: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white"
                />
              </div>
            </div>

            {serviceForm.error && <p className="text-red-600">{serviceForm.error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSelectedProviderIdForService(null)}
                className="px-3 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={serviceForm.saving}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
              >
                {serviceForm.saving ? 'Salvando...' : 'Salvar Serviço'}
              </button>
            </div>
          </form>
        )}

        {/* Lista de Prestadores */}
        {providers.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-1">Nenhum prestador cadastrado no processo.</p>
        ) : (
          <div className="space-y-4">
            {providers.map(p => {
              const pServices = services.filter(s => s.provider_id === p.id);
              const pSummary = debtSummaries.find(d => d.provider_id === p.id);

              return (
                <div key={p.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 text-sm">{p.nome_razao_social}</span>
                        <span className="bg-gray-200 text-gray-700 text-[10px] font-medium px-1.5 py-0.5 rounded">
                          {p.tipo_pessoa}
                        </span>
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                          {CATEGORIA_LABELS[p.categoria]}
                        </span>
                        {p.vinculo_confirmado ? (
                          <span className="bg-green-100 text-green-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                            ✓ Vínculo Confirmado
                          </span>
                        ) : (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                            ⚠ Vínculo Pendente
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Papel: <strong>{PAPEL_LABELS[p.papel_processual]}</strong>
                        {p.documento && <span className="ml-2 font-mono">Doc: {p.documento}</span>}
                      </div>
                    </div>

                    {!readOnly && (
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleToggleConfirmVinculo(p)}
                          className="text-xs text-gray-600 hover:text-blue-600 hover:underline"
                        >
                          {p.vinculo_confirmado ? 'Desmarcar confirmação' : 'Confirmar Vínculo'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedProviderIdForService(p.id)}
                          className="text-xs bg-white hover:bg-gray-100 text-gray-800 font-medium px-2 py-1 border border-gray-300 rounded shadow-xs"
                        >
                          + Serviço
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Resumo de Dívida / Indenizações deste prestador (RF13) */}
                  {pSummary && (pSummary.total_cumulativo > 0 || pSummary.total_divida_servico > 0) && (
                    <div className="bg-white p-2 rounded border border-gray-200 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <span className="text-gray-400 block text-[10px]">Dívida Serviço</span>
                        <span className="font-bold text-gray-800">{formatBRL(pSummary.total_divida_servico)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Dano Material</span>
                        <span className="font-bold text-gray-800">{formatBRL(pSummary.total_dano_material)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Dano Moral</span>
                        <span className="font-bold text-gray-800">{formatBRL(pSummary.total_dano_moral)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Total Cumulativo</span>
                        <span className="font-bold text-blue-700">{formatBRL(pSummary.total_cumulativo)}</span>
                      </div>
                    </div>
                  )}

                  {/* Lista de Serviços do Prestador (RF12) */}
                  <div>
                    <h5 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
                      Serviços e Períodos ({pServices.length})
                    </h5>
                    {pServices.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Nenhum serviço registrado para este prestador.</p>
                    ) : (
                      <div className="divide-y divide-gray-200 bg-white rounded border border-gray-200">
                        {pServices.map(s => (
                          <div key={s.id} className="p-2 text-xs flex items-center justify-between gap-2">
                            <div>
                              <div className="font-medium text-gray-900">{s.tipo_servico}</div>
                              <div className="text-gray-500 text-[11px]">
                                Período: {formatDate(s.periodo_inicio)} até {formatDate(s.periodo_fim)}{' '}
                                {s.precisao_data !== 'EXATA' && `(${s.precisao_data})`}
                                {s.competencia_entrada && ` | Competência: ${s.competencia_entrada}`}
                              </div>
                            </div>
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => handleDeleteService(s.id)}
                                className="text-gray-400 hover:text-red-600 text-xs px-1"
                                title="Remover serviço"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
