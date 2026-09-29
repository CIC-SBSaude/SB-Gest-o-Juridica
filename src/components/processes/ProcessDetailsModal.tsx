import React, { useRef, useState } from 'react';
import {
  X,
  Scale,
  Building2,
  UserRound,
  Calendar,
  DollarSign,
  MapPin,
  FileText,
  Clock,
  Edit3,
  Archive,
  Trash2,
  AlertTriangle,
  FileCode,
  Shield,
  History,
  CheckCircle2,
  FolderOpen,
  Save,
  Loader2,
} from 'lucide-react';
import { Process, ProcessStatus } from '../../types/database';
import { ProcessStatusBadge, ProcessPriorityBadge } from './ProcessStatusBadge';
import { ProcessTimelineTab } from './ProcessTimelineTab';
import { ProcessObligationsTab } from './ProcessObligationsTab';
import { ProcessHistoryTab } from './ProcessHistoryTab';
import { ProcessManagementTab, type ProcessManagementTabHandle } from './ProcessManagementTab';
import { ProcessPendenciesTab } from './ProcessPendenciesTab';
import { ProcessLawFirmTab } from './ProcessLawFirmTab';
import { formatCurrencyBRL } from '../../utils/currency';
import { formatProcessNumber } from '../../utils/cnj';
import { categoryLabel, subcategoryLabel, legalNatureLabel } from '../../services/demandClassificationService';
// E1 — novos componentes
import { ProcessSegmentBadge } from './ProcessSegmentBadge';
import { ProcessDefendantsSection } from './ProcessDefendantsSection';
import { ProcessOriginCard } from './ProcessOriginCard';
// E2 — novos componentes
import { ProcessFinancialSection } from './ProcessFinancialSection';
import { ProcessProvidersSection } from './ProcessProvidersSection';
// E3 — novos componentes
import { ProcessBeneficiariesSection } from './ProcessBeneficiariesSection';
// E5 — novos componentes
import { ProcessAllegationsSection } from './ProcessAllegationsSection';

interface ProcessDetailsModalProps {
  isOpen: boolean;
  process: Process | null;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: (process: Process) => void;
  onChangeStatus: (process: Process) => void;
  onToggleArchive: (process: Process) => void;
  onDelete: (process: Process) => void;
}


const ProcessDetailsModal: React.FC<ProcessDetailsModalProps> = ({
  isOpen,
  process: currentProcess,
  canEdit,
  canDelete,
  onClose,
  onEdit,
  onChangeStatus,
  onToggleArchive,
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState<
    | 'visao-geral'
    | 'beneficiarios'
    | 'alegacoes'
    | 'financeiro'
    | 'prestadores'
    | 'gestao'
    | 'timeline'
    | 'obrigacoes'
    | 'pendencias'
    | 'escritorio'
    | 'documentos'
    | 'auditoria'
  >('visao-geral');
  const managementRef = useRef<ProcessManagementTabHandle>(null);
  const [managementSaving, setManagementSaving] = useState(false);

  if (!isOpen || !currentProcess) return null;

  const autores = currentProcess.autores || [];
  const autorPrincipal = autores.find((autor) => autor.principal) || autores[0] || null;
  const autoresAdicionais = Math.max(0, autores.length - 1);

  const tabs = [
    { id: 'visao-geral', label: 'Visão Geral' },
    { id: 'beneficiarios', label: 'Beneficiários & Planos' },
    { id: 'alegacoes', label: 'Alegações do Beneficiário' },
    { id: 'financeiro', label: 'Valores & Sentenças' },
    { id: 'prestadores', label: 'Prestadores & Serviços' },
    { id: 'gestao', label: 'Gestão Operacional' },
    { id: 'timeline', label: 'Andamentos & Timeline' },
    { id: 'obrigacoes', label: 'Obrigações e Prazos' },
    { id: 'pendencias', label: 'Pendências' },
    { id: 'escritorio', label: 'Escritório Jurídico' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'auditoria', label: 'Histórico & Auditoria' },
  ] as const;

  return (
    <div
      id="process-details-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-3 lg:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="process-details-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="process-details-title"
        className="bg-white sm:rounded-xl shadow-2xl border border-slate-200/80 w-full sm:w-[96vw] max-w-[1480px] overflow-hidden flex flex-col my-auto h-[100dvh] sm:h-auto sm:max-h-[94vh]"
      >
        {/* Cabeçalho do Processo com Status e Ações Rápidas */}
        <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/80 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id="process-details-title" className="text-base md:text-lg font-bold text-[#0F172A] font-mono">
                    {formatProcessNumber(currentProcess.numero_processo) || 'Sem número CNJ'}
                  </h3>
                  <ProcessStatusBadge status={currentProcess.status_atual} size="sm" />
                  <ProcessPriorityBadge priority={currentProcess.prioridade} />
                  {/* E1 — RF01: badge de segmento */}
                  <ProcessSegmentBadge segmento={currentProcess.segmento} size="sm" />
                  {currentProcess.arquivado && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                      Arquivado
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                  {autorPrincipal ? (
                    <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                      <UserRound className="w-3.5 h-3.5 text-slate-400" />
                      <span>Autor: {autorPrincipal.nome}{autoresAdicionais > 0 ? ` +${autoresAdicionais}` : ''}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-400 italic">
                      <UserRound className="w-3.5 h-3.5" />
                      Autor não identificado
                    </span>
                  )}
                  {currentProcess.company ? (
                    <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      Empresa vinculada: {currentProcess.company.nome}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Sem empresa vinculada</span>
                  )}
                  {currentProcess.comarca && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {currentProcess.comarca} {currentProcess.uf ? ` - ${currentProcess.uf}` : ''}
                    </span>
                  )}
                  {currentProcess.protocolo_externo && (
                    <span className="font-mono text-slate-500">
                      Prot: {currentProcess.protocolo_externo}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Ações Rápidas no Cabeçalho */}
            <div className="flex items-center gap-1.5 self-end sm:self-center">
              {canEdit && (
                <>
                  <button
                    id="details-change-status-btn"
                    type="button"
                    onClick={() => onChangeStatus(currentProcess)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
                    title="Alterar Status Operacional"
                  >
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Status</span>
                  </button>

                  <button
                    id="details-edit-btn"
                    type="button"
                    onClick={() => onEdit(currentProcess)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-blue-600 transition cursor-pointer shadow-2xs"
                    title="Editar Processo"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>

                  <button
                    id="details-archive-btn"
                    type="button"
                    onClick={() => onToggleArchive(currentProcess)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
                    title={currentProcess.arquivado ? 'Desarquivar Processo' : 'Arquivar Processo'}
                  >
                    <Archive className="w-3.5 h-3.5 text-slate-500" />
                    <span>{currentProcess.arquivado ? 'Desarquivar' : 'Arquivar'}</span>
                  </button>
                </>
              )}

              {canDelete && (
                <button
                  id="details-delete-btn"
                  type="button"
                  onClick={() => onDelete(currentProcess)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 transition cursor-pointer"
                  title="Excluir Processo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                id="details-close-btn"
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                aria-label="Fechar Detalhes"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Abas Estruturais do Processo */}
        <div className="border-b border-slate-200 bg-white px-3 sm:px-5 lg:px-6 flex overflow-x-auto overscroll-x-contain shrink-0 scrollbar-thin">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-4 text-xs font-semibold whitespace-nowrap border-b-2 transition cursor-pointer ${
                activeTab === tab.id
                  ? 'border-red-600 text-red-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Conteúdo da Aba Selecionada com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ABA 1: VISÃO GERAL */}
          {activeTab === 'visao-geral' && (
            <div className="space-y-6">
              {/* Alerta de Cadastro Incompleto se houver */}
              {currentProcess.cadastro_incompleto && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold block">Atenção: Cadastro Incompleto</strong>
                    <p className="mt-0.5">
                      Este processo possui pendências cadastrais a serem saneadas pela equipe jurídica.
                    </p>
                    {currentProcess.pendencias && currentProcess.pendencias.length > 0 && (
                      <ul className="list-disc list-inside mt-2 space-y-0.5 font-medium">
                        {currentProcess.pendencias.map((pend, i) => (
                          <li key={i}>{pend}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Grid 1: Informações Principais da Causa */}
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-red-600" />
                  <span>Dados da Causa e Demanda</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">Valor da Causa:</span>
                    <span className="font-bold text-slate-900 text-sm font-mono">
                      {formatCurrencyBRL(currentProcess.valor_causa)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Tipo de Demanda:</span>
                    <span className="font-semibold text-slate-800">
                      {currentProcess.categoria_demanda ? categoryLabel(currentProcess.categoria_demanda) : (currentProcess.tipo_demanda || 'Não informado')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Subtipo da Demanda:</span>
                    <span className="font-semibold text-slate-800">
                      {currentProcess.subcategoria_demanda ? subcategoryLabel(currentProcess.subcategoria_demanda) : (currentProcess.subtipo_demanda || '-')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Natureza Jurídica:</span>
                    <span className="font-semibold text-slate-800">
                      {currentProcess.natureza_juridica?.length ? currentProcess.natureza_juridica.map(legalNatureLabel).join(' + ') : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Ramo / Natureza:</span>
                    <span className="font-semibold text-slate-800">
                      {currentProcess.natureza || 'Cível'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Fase Processual:</span>
                    <span className="font-semibold text-slate-800">
                      {currentProcess.fase_processual || 'Inicial'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Tutela de Urgência:</span>
                    <span className="font-semibold text-slate-800">
                      {currentProcess.tutela_atual || 'Sem Tutela'}
                    </span>
                  </div>
                </div>

                {currentProcess.detalhe_demanda && (
                  <div className="mt-4 pt-3 border-t border-slate-200/60">
                    <span className="text-slate-400 block font-medium text-xs mb-1">Detalhamento da Classificação:</span>
                    <p className="text-xs text-slate-700">{currentProcess.detalhe_demanda}</p>
                  </div>
                )}
                {/* Objeto da Demanda */}
                {currentProcess.objeto_demanda && (
                  <div className="mt-4 pt-3 border-t border-slate-200/60">
                    <span className="text-slate-400 block font-medium text-xs mb-1">
                      Objeto / Resumo dos Pedidos:
                    </span>
                    <p className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200/80 leading-relaxed whitespace-pre-wrap">
                      {currentProcess.objeto_demanda}
                    </p>
                  </div>
                )}
              </div>

              {/* Grid 2: Partes, vínculo, origem e jurisdição */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Autor, empresa vinculada e origem */}
                <div className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-red-600" />
                    <span>Partes e Vínculo</span>
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between gap-3 py-1 border-b border-slate-100">
                      <span className="text-slate-500 shrink-0">Autor:</span>
                      <div className="text-right min-w-0">
                        <span className="font-semibold text-slate-800 block">
                          {autorPrincipal?.nome || 'Não identificado'}
                        </span>
                        {autorPrincipal?.documento && (
                          <span className="font-mono text-[10px] text-slate-400 block">
                            {autorPrincipal.documento}
                          </span>
                        )}
                        {autoresAdicionais > 0 && (
                          <span className="text-[10px] text-slate-500 block">
                            +{autoresAdicionais} {autoresAdicionais === 1 ? 'outro autor' : 'outros autores'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Empresa Vinculada:</span>
                      <span className="font-semibold text-slate-800 text-right">
                        {currentProcess.company?.nome || 'Nenhuma (Avulso)'}
                      </span>
                    </div>
                    {currentProcess.company?.cnpj && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">CNPJ da Empresa:</span>
                        <span className="font-mono text-slate-700">
                          {currentProcess.company.cnpj}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Canal / Origem:</span>
                      <span className="font-medium text-slate-800">
                        {currentProcess.origem || 'PJe'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Situação do Beneficiário:</span>
                      <span className="font-medium text-slate-800">
                        {currentProcess.situacao_beneficiario || 'Não informado'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Localização e Jurisdição */}
                <div className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-red-600" />
                    <span>Jurisdição e Foro</span>
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Comarca:</span>
                      <span className="font-semibold text-slate-800">
                        {currentProcess.comarca || 'Não informada'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Município:</span>
                      <span className="font-medium text-slate-800">
                        {currentProcess.municipio || 'Não informado'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">UF (Estado):</span>
                      <span className="font-bold text-slate-800">{currentProcess.uf || '-'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Protocolo Externo:</span>
                      <span className="font-mono text-slate-700">
                        {currentProcess.protocolo_externo || '-'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* E1 — RF02: Seção de Rés (separada da empresa do contrato) */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-4">
                <ProcessDefendantsSection
                  processId={currentProcess.id}
                  readOnly={!canEdit}
                />
              </div>

              {/* E1 — RF03: Competência de Origem */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-red-600" />
                  <span>Competência de Origem</span>
                </h4>
                <ProcessOriginCard processId={currentProcess.id} />
              </div>

              {/* Grid 3: Datas do Fluxo Processual */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-red-600" />
                  <span>Cronologia Processual</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">Recebido em:</span>
                    <span className="font-semibold text-slate-800">
                      {currentProcess.recebido_em
                        ? new Date(currentProcess.recebido_em).toLocaleDateString('pt-BR')
                        : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Aberto em:</span>
                    <span className="font-semibold text-slate-800">
                      {currentProcess.aberto_em
                        ? new Date(currentProcess.aberto_em).toLocaleDateString('pt-BR')
                        : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Concluído em:</span>
                    <span className="font-semibold text-slate-800">
                      {currentProcess.concluido_em
                        ? new Date(currentProcess.concluido_em).toLocaleDateString('pt-BR')
                        : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Último Evento em:</span>
                    <span className="font-semibold text-slate-800">
                      {currentProcess.ultimo_evento_em
                        ? new Date(currentProcess.ultimo_evento_em).toLocaleDateString('pt-BR')
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* E3 — ABA BENEFICIÁRIOS E PLANOS (RF05, RF06, RF07) */}
          {activeTab === 'beneficiarios' && (
            <ProcessBeneficiariesSection processId={currentProcess.id} readOnly={!canEdit} />
          )}

          {/* E5 — ABA ALEGAÇÕES DO BENEFICIÁRIO (RF10) */}
          {activeTab === 'alegacoes' && (
            <ProcessAllegationsSection processId={currentProcess.id} readOnly={!canEdit} />
          )}

          {/* E2 — ABA VALORES E SENTENÇAS (RF09, RF13) */}
          {activeTab === 'financeiro' && (
            <ProcessFinancialSection processId={currentProcess.id} readOnly={!canEdit} />
          )}

          {/* E2 — ABA PRESTADORES E SERVIÇOS (RF11, RF12) */}
          {activeTab === 'prestadores' && (
            <ProcessProvidersSection processId={currentProcess.id} readOnly={!canEdit} />
          )}

          {/* GESTÃO OPERACIONAL */}
          {activeTab === 'gestao' && (
            <ProcessManagementTab
              ref={managementRef}
              processId={currentProcess.id}
              canEdit={canEdit}
              onSavingChange={setManagementSaving}
            />
          )}

          {/* TIMELINE / ANDAMENTOS */}
          {activeTab === 'timeline' && (
            <ProcessTimelineTab processId={currentProcess.id} canEdit={canEdit} />
          )}

          {/* OBRIGAÇÕES E PRAZOS */}
          {activeTab === 'obrigacoes' && (
            <ProcessObligationsTab processId={currentProcess.id} canEdit={canEdit} />
          )}

          {/* PENDÊNCIAS */}
          {activeTab === 'pendencias' && (
            <ProcessPendenciesTab processId={currentProcess.id} canEdit={canEdit} />
          )}

          {/* ESCRITÓRIO JURÍDICO */}
          {activeTab === 'escritorio' && (
            <ProcessLawFirmTab processId={currentProcess.id} canEdit={canEdit} />
          )}

          {/* DOCUMENTOS (Preparada) */}
          {activeTab === 'documentos' && (
            <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-slate-200/80 p-6">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <FolderOpen className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-[#0F172A]">Documentos e Peças Processuais</h4>
              <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
                Nenhum documento anexado ainda na tabela <code className="font-mono text-slate-700">public.process_documents</code>. Petições iniciais, contestações, decisões e comprovantes de cumprimento serão centralizados aqui.
              </p>
            </div>
          )}

          {/* ABA 5: HISTÓRICO E AUDITORIA */}
          {activeTab === 'auditoria' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200/80 p-5 space-y-4 text-xs">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-red-600" />
                  <span>Metadados e Rastreabilidade da Tabela public.processes</span>
                </h4>
                <div className="space-y-2 divide-y divide-slate-100 text-slate-600">
                  <div className="flex justify-between py-1.5">
                    <span className="font-medium text-slate-400">ID Único (UUID):</span>
                    <span className="font-mono text-slate-800">{currentProcess.id}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="font-medium text-slate-400">Data de Criação (created_at):</span>
                    <span className="text-slate-800">
                      {currentProcess.created_at
                        ? new Date(currentProcess.created_at).toLocaleString('pt-BR')
                        : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="font-medium text-slate-400">Última Atualização (updated_at):</span>
                    <span className="text-slate-800">
                      {currentProcess.updated_at
                        ? new Date(currentProcess.updated_at).toLocaleString('pt-BR')
                        : '-'}
                    </span>
                  </div>
                  {currentProcess.created_by && (
                    <div className="flex justify-between py-1.5">
                      <span className="font-medium text-slate-400">Criado por (created_by):</span>
                      <span className="font-mono text-slate-800">{currentProcess.created_by}</span>
                    </div>
                  )}
                  {currentProcess.updated_by && (
                    <div className="flex justify-between py-1.5">
                      <span className="font-medium text-slate-400">Atualizado por (updated_by):</span>
                      <span className="font-mono text-slate-800">{currentProcess.updated_by}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1.5">
                    <span className="font-medium text-slate-400">Status de Arquivamento:</span>
                    <span className="font-semibold text-slate-800">
                      {currentProcess.arquivado
                        ? `Arquivado em ${
                            currentProcess.arquivado_em
                              ? new Date(currentProcess.arquivado_em).toLocaleString('pt-BR')
                              : 'data não registrada'
                          }`
                        : 'Não arquivado (Ativo)'}
                    </span>
                  </div>
                </div>
              </div>
              
              <ProcessHistoryTab processId={currentProcess.id} />
            </div>
          )}
        </div>

        {/* Rodapé fixo do modal. Na Gestão Operacional, Salvar fica aqui para não sobrepor o conteúdo. */}
        <div className="px-6 py-3.5 border-t border-slate-200/80 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
          {activeTab === 'gestao' && canEdit && (
            <button
              id="process-management-save-btn"
              type="button"
              onClick={() => managementRef.current?.save()}
              disabled={managementSaving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
            >
              {managementSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar gestão
            </button>
          )}
          <button
            id="process-details-bottom-close-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-white text-xs font-semibold text-slate-700 transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export { ProcessDetailsModal };
