import React, { useEffect, useState } from 'react';
import { Sliders, Plus, Mail, RefreshCw, Trash2, CheckCircle2, AlertCircle, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { ActionDialog } from '../../components/common/ActionDialog';
import { RecordActionModal } from '../../components/common/RecordActionModal';

export interface SenderRuleRecord {
  id: string;
  pattern: string;
  pattern_type: string;
  rule_type: string;
  weight: number;
  label: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KeywordRuleRecord {
  id: string;
  pattern: string;
  match_scope: string;
  weight: number;
  category: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const EmailRulesPage: React.FC = () => {
  const [senderRules, setSenderRules] = useState<SenderRuleRecord[]>([]);
  const [keywordRules, setKeywordRules] = useState<KeywordRuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ruleKind, setRuleKind] = useState<'SENDER' | 'KEYWORD'>('KEYWORD');
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'SENDER' | 'KEYWORD'; rule: SenderRuleRecord | KeywordRuleRecord } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<{ kind: 'SENDER' | 'KEYWORD'; rule: SenderRuleRecord | KeywordRuleRecord } | null>(null);

  // Form Fields - Common
  const [pattern, setPattern] = useState('');
  const [weight, setWeight] = useState(10);
  const [active, setActive] = useState(true);

  // Form Fields - Sender
  const [patternType, setPatternType] = useState('EMAIL');
  const [senderRuleType, setSenderRuleType] = useState('PERMITIDO');
  const [label, setLabel] = useState('');

  // Form Fields - Keyword
  const [matchScope, setMatchScope] = useState('ANY');
  const [category, setCategory] = useState('juridico');

  const fetchRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const [senderRes, keywordRes] = await Promise.all([
        supabase.from('email_sender_rules').select('*').order('created_at', { ascending: false }),
        supabase.from('email_keyword_rules').select('*').order('created_at', { ascending: false })
      ]);

      if (senderRes.error) {
        console.warn('Erro ao carregar email_sender_rules:', senderRes.error.message);
      } else {
        setSenderRules(senderRes.data || []);
      }

      if (keywordRes.error) {
        console.warn('Erro ao carregar email_keyword_rules:', keywordRes.error.message);
        setError(`Erro ao carregar palavras-chave: ${keywordRes.error.message}`);
      } else {
        setKeywordRules(keywordRes.data || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao consultar regras.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleToggleSenderActive = async (rule: SenderRuleRecord) => {
    try {
      const { error: updateErr } = await supabase
        .from('email_sender_rules')
        .update({ active: !rule.active, updated_at: new Date().toISOString() })
        .eq('id', rule.id);

      if (updateErr) throw updateErr;
      setSenderRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r))
      );
      setSuccess(`Regra de remetente "${rule.pattern}" ${!rule.active ? 'ativada' : 'desativada'}.`);
    } catch (err: any) {
      setError(`Erro ao atualizar regra: ${err.message}`);
    }
  };

  const handleToggleKeywordActive = async (rule: KeywordRuleRecord) => {
    try {
      const { error: updateErr } = await supabase
        .from('email_keyword_rules')
        .update({ active: !rule.active, updated_at: new Date().toISOString() })
        .eq('id', rule.id);

      if (updateErr) throw updateErr;
      setKeywordRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r))
      );
      setSuccess(`Palavra-chave "${rule.pattern}" ${!rule.active ? 'ativada' : 'desativada'}.`);
    } catch (err: any) {
      setError(`Erro ao atualizar palavra-chave: ${err.message}`);
    }
  };

  const handleDeleteSenderRule = (rule: SenderRuleRecord) => {
    setDeleteError(null);
    setDeleteTarget({ kind: 'SENDER', rule });
  };

  const handleDeleteKeywordRule = (rule: KeywordRuleRecord) => {
    setDeleteError(null);
    setDeleteTarget({ kind: 'KEYWORD', rule });
  };

  const confirmDeleteRule = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const { kind, rule } = deleteTarget;
    const table = kind === 'SENDER' ? 'email_sender_rules' : 'email_keyword_rules';
    const { error: delErr } = await supabase.from(table).delete().eq('id', rule.id);
    setDeleteBusy(false);
    if (delErr) {
      setDeleteError(delErr.message);
      return;
    }
    if (kind === 'SENDER') {
      setSenderRules((prev) => prev.filter((r) => r.id !== rule.id));
      setSuccess(`Regra "${rule.pattern}" removida com sucesso.`);
    } else {
      setKeywordRules((prev) => prev.filter((r) => r.id !== rule.id));
      setSuccess(`Palavra-chave "${rule.pattern}" removida com sucesso.`);
    }
    setDeleteTarget(null);
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) {
      setError('Por favor, informe o padrão ou termo.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (ruleKind === 'SENDER') {
        const payload = {
          pattern: pattern.trim(),
          pattern_type: patternType,
          rule_type: senderRuleType,
          weight: Number(weight),
          label: label.trim() || null,
          active
        };

        const { data, error: insertErr } = await supabase
          .from('email_sender_rules')
          .insert(payload)
          .select()
          .single();

        if (insertErr) throw insertErr;
        if (data) {
          setSenderRules((prev) => [data, ...prev]);
          setSuccess(`Regra de remetente "${data.pattern}" criada com sucesso.`);
        }
      } else {
        const payload = {
          pattern: pattern.trim(),
          match_scope: matchScope,
          category: category.trim() || 'juridico',
          weight: Number(weight),
          active
        };

        const { data, error: insertErr } = await supabase
          .from('email_keyword_rules')
          .insert(payload)
          .select()
          .single();

        if (insertErr) throw insertErr;
        if (data) {
          setKeywordRules((prev) => [data, ...prev]);
          setSuccess(`Palavra-chave "${data.pattern}" cadastrada com sucesso.`);
        }
      }

      setIsModalOpen(false);
      // Reset form
      setPattern('');
      setLabel('');
      setWeight(10);
    } catch (err: any) {
      setError(`Falha ao salvar regra: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-red-600">
            Administração
          </span>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#0F172A]">
            Regras de Processamento de E-mail
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Configuração determinística sem IA (remetentes, padrões e termos jurídicos).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchRules}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-600' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Regra</span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200/80 text-xs text-red-700 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-xs text-emerald-800 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">{success}</div>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Grid de Regras */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tabela 1: Regras por Remetente */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-red-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Regras de Remetentes (<code className="font-mono text-slate-600">email_sender_rules</code>)
              </h3>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {senderRules.length}
            </span>
          </div>

          <div className="p-0 overflow-x-auto flex-1">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Carregando remetentes...</div>
            ) : senderRules.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                  <Mail className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Nenhuma regra de remetente cadastrada ainda.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="p-3">Padrão / Rótulo</th>
                    <th className="p-3">Tipo / Ação</th>
                    <th className="p-3">Peso</th>
                    <th className="p-3">Status</th>
                    
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {senderRules.map((rule) => (
                    <tr key={rule.id} tabIndex={0} role="button" onClick={() => setSelectedRule({ kind: 'SENDER', rule })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRule({ kind: 'SENDER', rule }); } }} className="cursor-pointer hover:bg-slate-50/80 focus:bg-slate-50 transition-colors outline-none">
                      <td className="p-3 font-medium text-slate-900">
                        <div className="font-mono">{rule.pattern}</div>
                        {rule.label && (
                          <div className="text-[10px] text-slate-400 font-sans mt-0.5">{rule.label}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                          {rule.pattern_type || 'EMAIL'}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">
                        {rule.weight > 0 ? `+${rule.weight}` : rule.weight}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            rule.active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {rule.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Tabela 2: Regras por Palavras-Chave */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-red-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Palavras-Chave (<code className="font-mono text-slate-600">email_keyword_rules</code>)
              </h3>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {keywordRules.length}
            </span>
          </div>

          <div className="p-0 overflow-x-auto flex-1">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Carregando palavras-chave...</div>
            ) : keywordRules.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                  <Sliders className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Nenhuma palavra-chave cadastrada ainda.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="p-3">Termo / Padrão</th>
                    <th className="p-3">Categoria</th>
                    <th className="p-3">Escopo</th>
                    <th className="p-3">Peso</th>
                    <th className="p-3">Status</th>
                    
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {keywordRules.map((rule) => (
                    <tr key={rule.id} tabIndex={0} role="button" onClick={() => setSelectedRule({ kind: 'KEYWORD', rule })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRule({ kind: 'KEYWORD', rule }); } }} className="cursor-pointer hover:bg-slate-50/80 focus:bg-slate-50 transition-colors outline-none">
                      <td className="p-3 font-semibold text-slate-900 font-mono">
                        {rule.pattern}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                            rule.category === 'juridico'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200/60'
                              : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                          }`}
                        >
                          {rule.category || 'juridico'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">
                        {rule.match_scope || 'ANY'}
                      </td>
                      <td className="p-3 font-semibold">
                        <span className={rule.weight > 0 ? 'text-emerald-700' : 'text-red-600'}>
                          {rule.weight > 0 ? `+${rule.weight}` : rule.weight}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            rule.active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {rule.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>


      <RecordActionModal
        isOpen={Boolean(selectedRule)}
        title={selectedRule?.rule.pattern || 'Regra de e-mail'}
        subtitle={selectedRule?.kind === 'SENDER' ? 'Regra de remetente' : 'Regra de palavra-chave'}
        onClose={() => setSelectedRule(null)}
        actions={selectedRule ? <>
          <button
            type="button"
            onClick={async () => {
              if (selectedRule.kind === 'SENDER') await handleToggleSenderActive(selectedRule.rule as SenderRuleRecord);
              else await handleToggleKeywordActive(selectedRule.rule as KeywordRuleRecord);
              setSelectedRule((current) => current ? { ...current, rule: { ...current.rule, active: !current.rule.active } } : current);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {selectedRule.rule.active ? 'Desativar' : 'Ativar'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedRule.kind === 'SENDER') handleDeleteSenderRule(selectedRule.rule as SenderRuleRecord);
              else handleDeleteKeywordRule(selectedRule.rule as KeywordRuleRecord);
              setSelectedRule(null);
            }}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Excluir
          </button>
        </> : null}
      >
        {selectedRule && <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><div className="text-[11px] font-semibold uppercase text-slate-400">Padrão</div><div className="mt-1 break-all font-mono font-semibold">{selectedRule.rule.pattern}</div></div>
          <div><div className="text-[11px] font-semibold uppercase text-slate-400">Status</div><div className="mt-1 font-semibold">{selectedRule.rule.active ? 'Ativa' : 'Inativa'}</div></div>
          <div><div className="text-[11px] font-semibold uppercase text-slate-400">Peso</div><div className="mt-1">{selectedRule.rule.weight}</div></div>
          <div><div className="text-[11px] font-semibold uppercase text-slate-400">Tipo</div><div className="mt-1">{selectedRule.kind === 'SENDER' ? (selectedRule.rule as SenderRuleRecord).pattern_type : (selectedRule.rule as KeywordRuleRecord).match_scope}</div></div>
        </div>}
      </RecordActionModal>

      {/* Modal Nova Regra */}
      <ActionDialog
        isOpen={Boolean(deleteTarget)}
        title={deleteTarget?.kind === 'SENDER' ? 'Excluir regra de remetente' : 'Excluir palavra-chave'}
        message={deleteTarget ? `A regra "${deleteTarget.rule.pattern}" será excluída permanentemente.` : ''}
        confirmLabel="Excluir"
        variant="danger"
        busy={deleteBusy}
        error={deleteError}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={confirmDeleteRule}
      />

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-base font-bold text-[#0F172A]">Cadastrar Nova Regra</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="p-5 space-y-4">
              {/* Seleção do Tipo de Regra */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tipo de Regra
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRuleKind('KEYWORD')}
                    className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                      ruleKind === 'KEYWORD'
                        ? 'border-red-600 bg-red-50 text-red-700 font-semibold'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Palavra-Chave</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuleKind('SENDER')}
                    className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                      ruleKind === 'SENDER'
                        ? 'border-red-600 bg-red-50 text-red-700 font-semibold'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Remetente</span>
                  </button>
                </div>
              </div>

              {/* Campo Padrão / Termo */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {ruleKind === 'SENDER' ? 'Padrão / Domínio / E-mail' : 'Palavra ou Termo'}
                </label>
                <input
                  type="text"
                  required
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder={
                    ruleKind === 'SENDER'
                      ? 'ex: @tjba.jus.br ou intimacao@trf1.jus.br'
                      : 'ex: liminar, tutela, intimação'
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>

              {/* Campos específicos de Remetente */}
              {ruleKind === 'SENDER' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Tipo de Padrão
                      </label>
                      <select
                        value={patternType}
                        onChange={(e) => setPatternType(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
                      >
                        <option value="EMAIL">E-mail Exato</option>
                        <option value="DOMAIN">Domínio</option>
                        <option value="WILDCARD">Coringa (*)</option>
                        <option value="REGEX">Expressão Regular</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Classificação
                      </label>
                      <select
                        value={senderRuleType}
                        onChange={(e) => setSenderRuleType(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
                      >
                        <option value="PERMITIDO">Permitido (Oficial)</option>
                        <option value="BLOQUEADO">Bloqueado</option>
                        <option value="CONFIANCA">Confiança Elevada</option>
                        <option value="SUSPEITO">Suspeito</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Rótulo / Descrição (Opcional)
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="ex: Tribunal de Justiça BA"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                    />
                  </div>
                </>
              )}

              {/* Campos específicos de Palavra-Chave */}
              {ruleKind === 'KEYWORD' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Categoria
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
                    >
                      <option value="juridico">Jurídico (Positivo)</option>
                      <option value="nao_juridico">Não Jurídico (Redutor)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Escopo de Busca
                    </label>
                    <select
                      value={matchScope}
                      onChange={(e) => setMatchScope(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 bg-white"
                    >
                      <option value="ANY">Qualquer Parte</option>
                      <option value="SUBJECT">Somente Assunto</option>
                      <option value="BODY">Somente Corpo</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Peso e Ativo */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Peso na Relevância (+/-)
                  </label>
                  <input
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="rounded border-slate-300 text-red-600 focus:ring-red-600 w-4 h-4"
                    />
                    <span>Ativo imediatamente</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Salvar Regra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
