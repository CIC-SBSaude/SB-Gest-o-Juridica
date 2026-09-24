import React, { useState, useEffect } from 'react';
import { X, Building2, ShieldCheck, Check, AlertCircle, Loader2, Edit3, Power, Trash2, Plus } from 'lucide-react';
import { Company } from '../../types/database';
import { maskCNPJ, unmaskCNPJ, validateCNPJ } from '../../utils/cnpj';
import { StatusBadge } from '../common/StatusBadge';
import { companiesService, type CompanyAlias } from '../../services/companiesService';

interface CompanyModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit' | 'view';
  company?: Company | null;
  initialNome?: string;
  initialCnpj?: string;
  onClose: () => void;
  onSave: (data: { nome: string; cnpj: string; active: boolean }) => Promise<{ success: boolean; error?: string }>;
  canManage?: boolean;
  onEdit?: () => void;
  onToggleActive?: () => void;
  onDelete?: () => void;
}

export const CompanyModal: React.FC<CompanyModalProps> = ({
  isOpen,
  mode,
  company,
  initialNome = '',
  initialCnpj = '',
  onClose,
  onSave,
  canManage = false,
  onEdit,
  onToggleActive,
  onDelete,
}) => {
  const [nome, setNome] = useState('');
  const [cnpjInput, setCnpjInput] = useState('');
  const [active, setActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [aliases, setAliases] = useState<CompanyAlias[]>([]);
  const [aliasInput, setAliasInput] = useState('');
  const [aliasBusy, setAliasBusy] = useState(false);

  // Sincroniza formulário ao abrir ou alterar a empresa selecionada
  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      if (company?.id) { void companiesService.getAliases(company.id).then(r => setAliases(r.data)); } else { setAliases([]); }
      if (company && (mode === 'edit' || mode === 'view')) {
        setNome(company.nome || '');
        setCnpjInput(company.cnpj ? maskCNPJ(company.cnpj) : '');
        setActive(company.active ?? true);
      } else {
        setNome(initialNome || '');
        setCnpjInput(initialCnpj ? maskCNPJ(initialCnpj) : '');
        setActive(true);
      }
    }
  }, [isOpen, mode, company, initialNome, initialCnpj]);

  if (!isOpen) return null;

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const masked = maskCNPJ(rawValue);
    setCnpjInput(masked);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'view') {
      onClose();
      return;
    }

    const trimmedNome = nome.trim();
    if (!trimmedNome) {
      setFormError('Informe a Razão Social ou Nome da Empresa.');
      return;
    }

    const unmasked = unmaskCNPJ(cnpjInput);
    if (unmasked.length > 0) {
      if (unmasked.length !== 14 || !validateCNPJ(unmasked)) {
        setFormError('CNPJ inválido. Digite um número de CNPJ válido com 14 dígitos.');
        return;
      }
    }

    setIsSubmitting(true);
    setFormError(null);

    const result = await onSave({
      nome: trimmedNome,
      cnpj: unmasked,
      active,
    });

    setIsSubmitting(false);
    if (!result.success && result.error) {
      setFormError(result.error);
    }
  };

  const isViewOnly = mode === 'view';
  const modalTitle =
    mode === 'create'
      ? 'Nova Empresa'
      : mode === 'edit'
      ? 'Editar Empresa'
      : 'Detalhes da Empresa';

  const unmaskedForCheck = unmaskCNPJ(cnpjInput);
  const isCnpjFilled = unmaskedForCheck.length > 0;
  const isCnpjValid = isCnpjFilled && validateCNPJ(unmaskedForCheck);
  const isCnpjInvalid = isCnpjFilled && !validateCNPJ(unmaskedForCheck) && unmaskedForCheck.length === 14;

  return (
    <div
      id="company-form-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        id="company-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-modal-title"
        className="bg-white rounded-xl shadow-2xl border border-slate-200/80 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-600">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 id="company-modal-title" className="text-base font-bold text-[#0F172A]">
                {modalTitle}
              </h3>
              <p className="text-xs text-slate-500">
                {isViewOnly
                  ? 'Visualização dos dados cadastrais da empresa'
                  : 'Preencha os dados corporativos da entidade jurídica'}
              </p>
            </div>
          </div>
          <button
            id="company-modal-close-btn"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário / Conteúdo */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {formError && (
            <div
              id="company-modal-error"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{formError}</div>
            </div>
          )}

          {/* Campo: Nome / Razão Social */}
          <div>
            <label
              htmlFor="company-nome-input"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Razão Social / Nome da Empresa <span className="text-red-500">*</span>
            </label>
            {isViewOnly ? (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-[#0F172A]">
                {company?.nome || '-'}
              </div>
            ) : (
              <input
                id="company-nome-input"
                type="text"
                required
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  setFormError(null);
                }}
                placeholder="Ex: SB Saúde Operadora de Planos Ltda"
                disabled={isSubmitting}
                className="w-full text-sm px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition shadow-2xs"
              />
            )}
            {!isViewOnly && (
              <span className="text-[11px] text-slate-400 mt-1 block">
                O identificador de busca normalizado (<code className="font-mono">nome_normalizado</code>) será gerado automaticamente.
              </span>
            )}
          </div>

          {/* Campo: CNPJ */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="company-cnpj-input"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                CNPJ
              </label>
              {!isViewOnly && isCnpjFilled && (
                <span className="text-[11px] font-medium flex items-center gap-1">
                  {isCnpjValid && (
                    <span className="text-emerald-600 flex items-center gap-0.5">
                      <Check className="w-3 h-3" /> Válido
                    </span>
                  )}
                  {isCnpjInvalid && (
                    <span className="text-red-600 flex items-center gap-0.5">
                      <AlertCircle className="w-3 h-3" /> Dígito inválido
                    </span>
                  )}
                </span>
              )}
            </div>

            {isViewOnly ? (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-slate-800">
                {company?.cnpj ? maskCNPJ(company.cnpj) : <span className="text-slate-400 italic">Não informado</span>}
              </div>
            ) : (
              <div className="relative">
                <input
                  id="company-cnpj-input"
                  type="text"
                  maxLength={18}
                  value={cnpjInput}
                  onChange={handleCnpjChange}
                  placeholder="00.000.000/0000-00"
                  disabled={isSubmitting}
                  className={`w-full text-sm px-3.5 py-2.5 font-mono bg-white border rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 transition shadow-2xs ${
                    isCnpjInvalid
                      ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500'
                      : 'border-slate-300 focus:ring-red-500/20 focus:border-red-500'
                  }`}
                />
              </div>
            )}
            {!isViewOnly && (
              <span className="text-[11px] text-slate-400 mt-1 block">
                Aceita digitação com máscara. Armazenado normalizado apenas com 14 números no banco de dados.
              </span>
            )}
          </div>

          {company?.id && (mode === 'view' || mode === 'edit') && (
            <div className="pt-4 border-t border-slate-100">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Nomes alternativos / aliases</label>
              <p className="text-[11px] text-slate-500 mb-2">Usados pelo resolvedor automático quando o CNPJ não estiver disponível no documento.</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {aliases.filter(a=>a.active).length === 0 && <span className="text-xs text-slate-400 italic">Nenhum alias cadastrado.</span>}
                {aliases.filter(a=>a.active).map(alias => (
                  <span key={alias.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs text-slate-700">
                    {alias.alias}
                    {canManage && <button type="button" title="Desativar alias" onClick={async()=>{ setAliasBusy(true); const r=await companiesService.removeAlias(alias.id); setAliasBusy(false); if(r.error) setFormError(r.error); else setAliases(v=>v.map(a=>a.id===alias.id?{...a,active:false}:a)); }} className="text-slate-400 hover:text-red-600">×</button>}
                  </span>
                ))}
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <input value={aliasInput} onChange={e=>setAliasInput(e.target.value)} placeholder="Ex.: SB Saúde, Saúde Brasil..." className="flex-1 text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-red-500" />
                  <button type="button" disabled={aliasBusy || !aliasInput.trim()} onClick={async()=>{ setAliasBusy(true); const r=await companiesService.addAlias(company.id, aliasInput); setAliasBusy(false); if(r.error) setFormError(r.error); else if(r.data){ setAliases(v=>[...v,r.data!]); setAliasInput(''); } }} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"><Plus className="w-3.5 h-3.5"/>Adicionar</button>
                </div>
              )}
            </div>
          )}

          {/* Campo: Status (Ativo / Inativo) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Status Operacional
            </label>
            {isViewOnly ? (
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={company?.active ? 'ATIVA' : 'INATIVA'}
                  type={company?.active ? 'success' : 'danger'}
                  label={company?.active ? 'Ativa' : 'Inativa'}
                />
              </div>
            ) : (
              <div className="flex items-center gap-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    id="company-status-active-radio"
                    type="radio"
                    name="company-status"
                    checked={active === true}
                    onChange={() => setActive(true)}
                    disabled={isSubmitting}
                    className="text-red-600 focus:ring-red-500 h-4 w-4"
                  />
                  <span>Ativa (habilitada para vinculação em processos)</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    id="company-status-inactive-radio"
                    type="radio"
                    name="company-status"
                    checked={active === false}
                    onChange={() => setActive(false)}
                    disabled={isSubmitting}
                    className="text-red-600 focus:ring-red-500 h-4 w-4"
                  />
                  <span>Inativa</span>
                </label>
              </div>
            )}
          </div>

          {/* Dados de auditoria em modo de visualização */}
          {isViewOnly && company && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-[11px] text-slate-500">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="font-medium text-slate-400">ID da Entidade:</span>
                <span className="font-mono text-slate-700">{company.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="font-medium text-slate-400">Nome Normalizado:</span>
                <span className="font-mono text-slate-700">{company.nome_normalizado || '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="font-medium text-slate-400">Cadastrado em:</span>
                <span className="text-slate-700">
                  {company.created_at ? new Date(company.created_at).toLocaleString('pt-BR') : '-'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="font-medium text-slate-400">Última Atualização:</span>
                <span className="text-slate-700">
                  {company.updated_at ? new Date(company.updated_at).toLocaleString('pt-BR') : '-'}
                </span>
              </div>
            </div>
          )}
        </form>

        {/* Rodapé do Modal com Ações */}
        <div className="px-6 py-3.5 border-t border-slate-200/80 bg-slate-50 flex flex-wrap items-center justify-end gap-2.5 shrink-0">
          {isViewOnly && canManage && company && (
            <>
              {onEdit && <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100"><Edit3 className="w-3.5 h-3.5"/>Editar</button>}
              {onToggleActive && <button type="button" onClick={onToggleActive} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100"><Power className="w-3.5 h-3.5"/>{company.active ? 'Inativar' : 'Ativar'}</button>}
              {onDelete && <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100"><Trash2 className="w-3.5 h-3.5"/>Excluir</button>}
            </>
          )}
          <button
            id="company-modal-cancel-btn"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-white text-xs font-semibold text-slate-700 transition cursor-pointer"
          >
            {isViewOnly ? 'Fechar' : 'Cancelar'}
          </button>

          {!isViewOnly && (
            <button
              id="company-modal-submit-btn"
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{mode === 'create' ? 'Salvar Empresa' : 'Salvar Alterações'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
