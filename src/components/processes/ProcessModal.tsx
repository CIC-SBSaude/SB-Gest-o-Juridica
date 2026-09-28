import React, { useState, useEffect } from 'react';
import {
  X,
  Scale,
  Building2,
  AlertCircle,
  Loader2,
  Calendar,
  DollarSign,
  MapPin,
  FileText,
  Check,
} from 'lucide-react';
import { Process, Company, ProcessStatus } from '../../types/database';
import { maskCNJ, formatProcessNumber } from '../../utils/cnj';
import { maskCurrencyBRL, parseCurrencyBRL } from '../../utils/currency';
import { demandCategories, subcategoriesFor, LEGAL_NATURES, categoryLabel, subcategoryLabel } from '../../services/demandClassificationService';

interface ProcessModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  process?: Process | null;
  companies: Company[];
  onClose: () => void;
  onSave: (payload: any) => Promise<{ success: boolean; error?: string }>;
}

const ORIGENS = ['PJe', 'e-SAJ', 'Projudi', 'E-mail', 'Correios', 'Físico', 'Outro'];
const NATUREZAS = ['Cível', 'Consumidor', 'Trabalhista', 'Tributário', 'Regulatório (ANS)', 'Administrativo', 'Outra'];
const FASES = [
  'Inicial',
  'Contestação',
  'Instrução e Provas',
  'Decisão / Sentença',
  'Recursal',
  'Cumprimento de Sentença',
  'Execução',
  'Acordo / Homologação',
];
const TUTELAS = [
  'Sem Tutela',
  'Liminar / Tutela Antecipada Deferida',
  'Liminar Indeferida',
  'Em Apreciação',
  'Tutela Revogada',
];
const PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];
const STATUSES: ProcessStatus[] = [
  'NOVA',
  'TRIAGEM',
  'EM_ANALISE',
  'EM_TRATAMENTO',
  'AGUARDANDO_TERCEIRO',
  'AGUARDANDO_DECISAO',
  'CONCLUIDA',
  'CANCELADA',
];

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const ProcessModal: React.FC<ProcessModalProps> = ({
  isOpen,
  mode,
  process: currentProcess,
  companies,
  onClose,
  onSave,
}) => {
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [protocoloExterno, setProtocoloExterno] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [origem, setOrigem] = useState('PJe');
  const [natureza, setNatureza] = useState('Cível');
  const [faseProcessual, setFaseProcessual] = useState('Inicial');
  const [tutelaAtual, setTutelaAtual] = useState('Sem Tutela');
  const [comarca, setComarca] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [uf, setUf] = useState('SP');
  const [valorCausa, setValorCausa] = useState<string>('');
  const [situacaoBeneficiario, setSituacaoBeneficiario] = useState('Ativo');
  const [tipoDemanda, setTipoDemanda] = useState('');
  const [subtipoDemanda, setSubtipoDemanda] = useState('');
  const [objetoDemanda, setObjetoDemanda] = useState('');
  const [categoriaDemanda, setCategoriaDemanda] = useState('');
  const [subcategoriaDemanda, setSubcategoriaDemanda] = useState('');
  const [naturezasJuridicas, setNaturezasJuridicas] = useState<string[]>([]);
  const [detalheDemanda, setDetalheDemanda] = useState('');
  const [prioridade, setPrioridade] = useState('MEDIA');
  const [statusAtual, setStatusAtual] = useState<ProcessStatus>('NOVA');
  const [recebidoEm, setRecebidoEm] = useState('');
  const [abertoEm, setAbertoEm] = useState('');
  const [cadastroIncompleto, setCadastroIncompleto] = useState(false);
  const [pendenciasText, setPendenciasText] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      if (currentProcess && mode === 'edit') {
        setNumeroProcesso(
          currentProcess.numero_processo
            ? formatProcessNumber(currentProcess.numero_processo)
            : ''
        );
        setProtocoloExterno(currentProcess.protocolo_externo || '');
        setCompanyId(currentProcess.company_id || '');
        setOrigem(currentProcess.origem || 'PJe');
        setNatureza(currentProcess.natureza || 'Cível');
        setFaseProcessual(currentProcess.fase_processual || 'Inicial');
        setTutelaAtual(currentProcess.tutela_atual || 'Sem Tutela');
        setComarca(currentProcess.comarca || '');
        setMunicipio(currentProcess.municipio || '');
        setUf(currentProcess.uf || 'SP');
        setValorCausa(
          currentProcess.valor_causa !== null && currentProcess.valor_causa !== undefined
            ? maskCurrencyBRL(String(Math.round(currentProcess.valor_causa * 100)))
            : ''
        );
        setSituacaoBeneficiario(currentProcess.situacao_beneficiario || 'Ativo');
        setTipoDemanda(currentProcess.tipo_demanda || '');
        setSubtipoDemanda(currentProcess.subtipo_demanda || '');
        setObjetoDemanda(currentProcess.objeto_demanda || '');
        setCategoriaDemanda(currentProcess.categoria_demanda || '');
        setSubcategoriaDemanda(currentProcess.subcategoria_demanda || '');
        setNaturezasJuridicas(currentProcess.natureza_juridica || []);
        setDetalheDemanda(currentProcess.detalhe_demanda || '');
        setPrioridade(currentProcess.prioridade || 'MEDIA');
        setStatusAtual((currentProcess.status_atual as ProcessStatus) || 'NOVA');
        setRecebidoEm(
          currentProcess.recebido_em
            ? new Date(currentProcess.recebido_em).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10)
        );
        setAbertoEm(
          currentProcess.aberto_em
            ? new Date(currentProcess.aberto_em).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10)
        );
        setCadastroIncompleto(currentProcess.cadastro_incompleto || false);
        setPendenciasText(
          currentProcess.pendencias ? currentProcess.pendencias.join('\n') : ''
        );
      } else {
        // Reset para novo cadastro
        setNumeroProcesso('');
        setProtocoloExterno('');
        setCompanyId('');
        setOrigem('PJe');
        setNatureza('Cível');
        setFaseProcessual('Inicial');
        setTutelaAtual('Sem Tutela');
        setComarca('');
        setMunicipio('');
        setUf('SP');
        setValorCausa('');
        setSituacaoBeneficiario('Ativo');
        setTipoDemanda('');
        setSubtipoDemanda('');
        setObjetoDemanda('');
        setCategoriaDemanda('');
        setSubcategoriaDemanda('');
        setNaturezasJuridicas([]);
        setDetalheDemanda('');
        setPrioridade('MEDIA');
        setStatusAtual('NOVA');
        setRecebidoEm(new Date().toISOString().slice(0, 10));
        setAbertoEm(new Date().toISOString().slice(0, 10));
        setCadastroIncompleto(false);
        setPendenciasText('');
      }
    }
  }, [isOpen, mode, currentProcess]);

  if (!isOpen) return null;

  const handleNumeroChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Se o usuário estiver digitando números, auxilia com a máscara CNJ
    if (/^[\d.-]*$/.test(val)) {
      setNumeroProcesso(maskCNJ(val));
    } else {
      setNumeroProcesso(val);
    }
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validações básicas
    const trimmedNumero = numeroProcesso.trim();
    const trimmedObjeto = objetoDemanda.trim();

    if (!trimmedNumero && !protocoloExterno.trim() && !trimmedObjeto) {
      setFormError('Informe ao menos o Número do Processo (CNJ), Protocolo Externo ou Objeto da Demanda.');
      return;
    }

    const parsedValor = parseCurrencyBRL(valorCausa);

    const pendenciasArray = pendenciasText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    setIsSubmitting(true);

    const payload = {
      numero_processo: trimmedNumero || null,
      protocolo_externo: protocoloExterno.trim() || null,
      company_id: companyId || null,
      origem,
      natureza,
      fase_processual: faseProcessual,
      tutela_atual: tutelaAtual,
      comarca: comarca.trim() || null,
      municipio: municipio.trim() || null,
      uf: uf || null,
      valor_causa: parsedValor,
      situacao_beneficiario: situacaoBeneficiario,
      tipo_demanda: categoriaDemanda ? categoryLabel(categoriaDemanda) : (tipoDemanda.trim() || null),
      subtipo_demanda: subcategoriaDemanda ? subcategoryLabel(subcategoriaDemanda) : (subtipoDemanda.trim() || null),
      objeto_demanda: trimmedObjeto || null,
      categoria_demanda: categoriaDemanda || null,
      subcategoria_demanda: subcategoriaDemanda || null,
      natureza_juridica: naturezasJuridicas.length ? naturezasJuridicas : null,
      detalhe_demanda: detalheDemanda.trim() || null,
      classificacao_origem: (categoriaDemanda || subcategoriaDemanda || naturezasJuridicas.length) ? 'MANUAL' : null,
      classificacao_atualizada_em: (categoriaDemanda || subcategoriaDemanda || naturezasJuridicas.length) ? new Date().toISOString() : null,
      prioridade,
      status_atual: statusAtual,
      recebido_em: recebidoEm ? new Date(recebidoEm).toISOString() : null,
      aberto_em: abertoEm ? new Date(abertoEm).toISOString() : null,
      cadastro_incompleto: cadastroIncompleto,
      pendencias: pendenciasArray.length > 0 ? pendenciasArray : null,
    };

    const result = await onSave(payload);
    setIsSubmitting(false);

    if (!result.success && result.error) {
      setFormError(result.error);
    }
  };

  return (
    <div
      id="process-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        id="process-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="process-modal-title"
        className="bg-white rounded-xl shadow-2xl border border-slate-200/80 w-full max-w-3xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
      >
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h3 id="process-modal-title" className="text-base font-bold text-[#0F172A]">
                {mode === 'create' ? 'Novo Processo Judicial' : 'Editar Processo Judicial'}
              </h3>
              <p className="text-xs text-slate-500">
                {mode === 'create'
                  ? 'Preencha os dados processuais para cadastrar na tabela public.processes'
                  : 'Atualize as informações cadastrais e processuais da entidade'}
              </p>
            </div>
          </div>
          <button
            id="process-modal-close-btn"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com Scroll Vertical */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {formError && (
            <div
              id="process-modal-error-box"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{formError}</div>
            </div>
          )}

          {/* Seção 1: Identificação do Processo */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-red-600" />
              <span>Identificação Processual</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              {/* Número do Processo / CNJ */}
              <div>
                <label
                  htmlFor="proc-numero-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                >
                  Número do Processo (CNJ)
                </label>
                <input
                  id="proc-numero-input"
                  type="text"
                  value={numeroProcesso}
                  onChange={handleNumeroChange}
                  placeholder="0000000-00.0000.0.00.0000"
                  disabled={isSubmitting}
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition shadow-2xs"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Permite múltiplos registros com o mesmo CNJ no sistema.
                </span>
              </div>

              {/* Protocolo Externo */}
              <div>
                <label
                  htmlFor="proc-protocolo-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                >
                  Protocolo Externo / Referência
                </label>
                <input
                  id="proc-protocolo-input"
                  type="text"
                  value={protocoloExterno}
                  onChange={(e) => setProtocoloExterno(e.target.value)}
                  placeholder="Ex: PROT-2026-98124"
                  disabled={isSubmitting}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition shadow-2xs"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Número de protocolo gerado pelo tribunal ou e-mail de citação.
                </span>
              </div>
            </div>

            {/* Empresa Vinculada */}
            <div className="mt-4">
              <label
                htmlFor="proc-company-select"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 flex items-center justify-between"
              >
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  Empresa Vinculada (Cliente / Contrato PJ)
                </span>
                <span className="text-[10px] text-slate-400 font-normal uppercase">Opcional / Recomendado</span>
              </label>
              <select
                id="proc-company-select"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                disabled={isSubmitting}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition shadow-2xs"
              >
                <option value="">-- Nenhuma empresa vinculada --</option>
                {companies
                  .filter((c) => c.active || c.id === companyId)
                  .map((comp) => (
                    <option key={comp.id} value={comp.id}>
                      {comp.nome} {comp.cnpj ? `(CNPJ: ${comp.cnpj})` : ''}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Seção 2: Classificação e Esfera */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-red-600" />
              <span>Classificação Jurídica e Tutela</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              {/* Origem */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Origem
                </label>
                <select
                  value={origem}
                  onChange={(e) => setOrigem(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  {ORIGENS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>

              {/* Natureza */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Natureza
                </label>
                <select
                  value={natureza}
                  onChange={(e) => setNatureza(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  {NATUREZAS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              {/* Fase Processual */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Fase Processual
                </label>
                <select
                  value={faseProcessual}
                  onChange={(e) => setFaseProcessual(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  {FASES.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              {/* Tutela Atual */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Tutela de Urgência
                </label>
                <select
                  value={tutelaAtual}
                  onChange={(e) => setTutelaAtual(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  {TUTELAS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Seção 3: Jurisdição e Localização */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-red-600" />
              <span>Jurisdição e Localização</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              {/* Comarca */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Comarca / Foro
                </label>
                <input
                  type="text"
                  value={comarca}
                  onChange={(e) => setComarca(e.target.value)}
                  placeholder="Ex: São Paulo - Central"
                  disabled={isSubmitting}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              {/* Município */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Município
                </label>
                <input
                  type="text"
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value)}
                  placeholder="Ex: São Paulo"
                  disabled={isSubmitting}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              {/* UF */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  UF (Estado)
                </label>
                <select
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  {UFS.map((sigla) => (
                    <option key={sigla} value={sigla}>{sigla}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Seção 4: Valores e Objeto da Demanda */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-red-600" />
              <span>Demanda e Valores</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              {/* Valor da Causa */}
              <div>
                <label
                  htmlFor="process-valor-causa"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                >
                  Valor da Causa (R$)
                </label>
                <input
                  id="process-valor-causa"
                  type="text"
                  inputMode="numeric"
                  value={valorCausa}
                  onChange={(e) => {
                    setValorCausa(maskCurrencyBRL(e.target.value));
                    setFormError(null);
                  }}
                  onKeyDown={(e) => {
                    // Permite teclas de navegação, edição e atalhos (Ctrl/Cmd)
                    if (
                      [
                        'Backspace',
                        'Delete',
                        'Tab',
                        'Escape',
                        'Enter',
                        'ArrowLeft',
                        'ArrowRight',
                        'ArrowUp',
                        'ArrowDown',
                        'Home',
                        'End',
                      ].includes(e.key) ||
                      e.ctrlKey ||
                      e.metaKey
                    ) {
                      return;
                    }
                    // Bloqueia qualquer caractere que não seja número
                    if (!/^\d$/.test(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  placeholder="R$ 0,00"
                  disabled={isSubmitting}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                />
              </div>
              {/* Categoria da Demanda */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Categoria da Demanda</label>
                <select
                  value={categoriaDemanda}
                  onChange={(e) => { setCategoriaDemanda(e.target.value); setSubcategoriaDemanda(''); }}
                  disabled={isSubmitting}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="">Não classificada</option>
                  {demandCategories.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
              </div>

              {/* Subcategoria da Demanda */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Subcategoria</label>
                <select
                  value={subcategoriaDemanda}
                  onChange={(e) => setSubcategoriaDemanda(e.target.value)}
                  disabled={isSubmitting || !categoriaDemanda}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-slate-100"
                >
                  <option value="">Selecione</option>
                  {subcategoriesFor(categoriaDemanda).map(item => <option key={item.subcategoryCode} value={item.subcategoryCode}>{item.subcategoryLabel}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Natureza Jurídica <span className="font-normal normal-case text-slate-400">(pode haver mais de uma)</span></label>
              <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                {LEGAL_NATURES.map(item => {
                  const checked = naturezasJuridicas.includes(item.code);
                  return <label key={item.code} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] cursor-pointer ${checked ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                    <input type="checkbox" checked={checked} disabled={isSubmitting} onChange={() => setNaturezasJuridicas(prev => checked ? prev.filter(v=>v!==item.code) : [...prev,item.code])} />
                    {item.label}
                  </label>;
                })}
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Detalhamento da Classificação</label>
              <input type="text" value={detalheDemanda} onChange={(e)=>setDetalheDemanda(e.target.value)} placeholder="Ex: artroplastia de quadril, medicamento X, cobrança de mensalidades..." disabled={isSubmitting} className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>

            {/* Objeto da Demanda (Resumo) */}
            <div className="mt-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Objeto da Demanda / Resumo dos Pedidos
              </label>
              <textarea
                rows={2}
                value={objetoDemanda}
                onChange={(e) => setObjetoDemanda(e.target.value)}
                placeholder="Descreva sumariamente a tutela pretendida pelo autor ou objeto litigioso..."
                disabled={isSubmitting}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Seção 5: Status e Prioridade Operacional */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-red-600" />
              <span>Status Operacional e Prazos</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
              {/* Status Atual */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Status Atual
                </label>
                <select
                  value={statusAtual}
                  onChange={(e) => setStatusAtual(e.target.value as ProcessStatus)}
                  disabled={isSubmitting}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-[#0F172A] font-semibold focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              {/* Prioridade */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Prioridade
                </label>
                <select
                  value={prioridade}
                  onChange={(e) => setPrioridade(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-[#0F172A] font-semibold focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  {PRIORIDADES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Data de Recebimento */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Recebido em
                </label>
                <input
                  type="date"
                  value={recebidoEm}
                  onChange={(e) => setRecebidoEm(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              {/* Data de Abertura */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Aberto em
                </label>
                <input
                  type="date"
                  value={abertoEm}
                  onChange={(e) => setAbertoEm(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
            </div>

            {/* Pendências e Cadastro Incompleto */}
            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cadastroIncompleto}
                  onChange={(e) => setCadastroIncompleto(e.target.checked)}
                  disabled={isSubmitting}
                  className="rounded text-red-600 focus:ring-red-500 h-4 w-4"
                />
                <span>Marcar como Cadastro Incompleto (requer saneamento de dados)</span>
              </label>

              {cadastroIncompleto && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Pendências a sanear (uma por linha):
                  </label>
                  <textarea
                    rows={2}
                    value={pendenciasText}
                    onChange={(e) => setPendenciasText(e.target.value)}
                    placeholder="Ex: Juntar procuração&#10;Identificar número da apólice&#10;Consultar guia de custas"
                    className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Rodapé de Ações */}
        <div className="px-6 py-3.5 border-t border-slate-200/80 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
          <button
            id="process-modal-cancel-btn"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-white text-xs font-semibold text-slate-700 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            id="process-modal-submit-btn"
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Gravando dados...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>{mode === 'create' ? 'Cadastrar Processo' : 'Salvar Alterações'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
