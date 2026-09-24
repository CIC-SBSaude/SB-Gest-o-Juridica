import { supabase } from './supabase';
import { Company } from '../types/database';
import { unmaskCNPJ, validateCNPJ, normalizeCompanyName } from '../utils/cnpj';

export interface CompanyFormData {
  nome: string;
  cnpj: string;
  active: boolean;
}


export interface CompanyAlias {
  id: string;
  company_id: string;
  alias: string;
  alias_normalizado: string;
  alias_type: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyWithProcessesCount extends Company {
  linked_processes_count?: number;
}

export interface CompanyResolutionReprocessResult {
  ok: boolean;
  dryRun?: boolean;
  processes?: Array<{ id: string; numero_processo: string }>;
  available?: number;
  remainingEligible?: number;
  scanned: number;
  linked: number;
  unresolved: number;
  ambiguous: number;
  autoCreated?: number;
  pendingConfirmation?: number;
  details: Array<{
    processId: string;
    numeroProcesso?: string | null;
    method: string;
    companyId: string | null;
    candidateId?: string | null;
  }>;
}


export interface CompanyResolutionCandidate {
  id: string;
  process_id: string;
  status: 'PENDENTE' | 'CONFIRMADO' | 'REJEITADO';
  suggested_name: string | null;
  suggested_cnpj: string | null;
  confidence: number;
  candidate_names: string[];
  candidate_cnpjs: string[];
  evidence?: Array<{
    roleAssessments?: Array<{ name: string; processRole: string; roleEvidence: string }>;
    excludedNames?: string[];
    contextualAssociations?: Array<{
      cnpj: string;
      name: string | null;
      classification: 'STRONG_PAIR' | 'UNPAIRED' | 'PROVIDER_DIRECTORY';
      excerpt: string | null;
      confidence: number | null;
      processRole?: string;
      roleEvidence?: string;
    }>;
    sourceEvidence?: Array<{ field?: string; value?: unknown; excerpt?: string | null; confidence?: number | null; source?: string }>;
  }>;
  created_at: string;
  updated_at: string;
  resolved_company_id?: string | null;
  processes?: {
    numero_processo?: string | null;
    objeto_demanda?: string | null;
  } | null;
}

async function getApiAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sessão autenticada não disponível.');
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Service corporativo para gestão e persistência de Empresas na tabela public.companies.
 * Utiliza estritamente a sessão autenticada do usuário Supabase via RLS.
 */
class CompaniesService {
  /**
   * Obtém a lista de empresas com filtro opcional de busca e status ativo/inativo.
   */
  async getCompanies(
    search?: string,
    activeFilter: 'all' | 'active' | 'inactive' = 'all'
  ): Promise<{ data: Company[]; error: string | null }> {
    try {
      let query = supabase
        .from('companies')
        .select('*')
        .order('nome', { ascending: true });

      if (activeFilter === 'active') {
        query = query.eq('active', true);
      } else if (activeFilter === 'inactive') {
        query = query.eq('active', false);
      }

      const { data, error } = await query;

      if (error) {
        return { data: [], error: error.message || 'Erro ao carregar lista de empresas.' };
      }

      let results: Company[] = data || [];

      // Filtro de busca textual: razão social / nome, nome_normalizado e CNPJ (com ou sem máscara)
      if (search && search.trim() !== '') {
        const term = search.trim();
        const termUpper = term.toUpperCase();
        const termNorm = normalizeCompanyName(term);
        const termDigits = unmaskCNPJ(term);

        results = results.filter((comp) => {
          const matchesName = comp.nome?.toUpperCase().includes(termUpper);
          const matchesNorm = comp.nome_normalizado?.toUpperCase().includes(termNorm);
          const matchesCnpj = termDigits && comp.cnpj ? comp.cnpj.includes(termDigits) : false;
          return Boolean(matchesName || matchesNorm || matchesCnpj);
        });
      }

      return { data: results, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao carregar empresas.';
      return { data: [], error: msg };
    }
  }

  /**
   * Obtém uma empresa específica pelo ID.
   */
  async getCompanyById(id: string): Promise<{ data: Company | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        return { data: null, error: error.message };
      }
      return { data, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao consultar empresa.';
      return { data: null, error: msg };
    }
  }

  /**
   * Verifica a quantidade de processos judiciais vinculados à empresa.
   * Utilizado para validar a possibilidade de exclusão sem quebrar integridade.
   */
  async countLinkedProcesses(companyId: string): Promise<{ count: number | null; error: string | null }> {
    try {
      const { count, error } = await supabase
        .from('processes')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId);

      if (error) {
        console.warn('[companiesService] Verificação de processos vinculados:', error.message);
        return { count: null, error: error.message || 'Falha ao verificar processos vinculados.' };
      }
      return { count: count ?? 0, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao verificar processos vinculados.';
      return { count: null, error: message };
    }
  }

  /**
   * Cadastra uma nova empresa na tabela public.companies.
   * - Valida obrigatoriedade do nome
   * - Normaliza o CNPJ (apenas dígitos) e valida formato/dígitos
   * - Verifica unicidade de CNPJ antes do insert
   * - Gera nome_normalizado
   */
  async createCompany(payload: {
    nome: string;
    cnpj?: string | null;
    active?: boolean;
  }): Promise<{ data: Company | null; error: string | null }> {
    try {
      const cleanNome = payload.nome?.trim();
      if (!cleanNome) {
        return { data: null, error: 'O Nome / Razão Social da empresa é obrigatório.' };
      }

      const normalizedName = normalizeCompanyName(cleanNome);
      const normalizedCnpj = payload.cnpj ? unmaskCNPJ(payload.cnpj) : null;

      if (normalizedCnpj) {
        if (!validateCNPJ(normalizedCnpj)) {
          return { data: null, error: 'O CNPJ informado é inválido perante as regras da Receita Federal.' };
        }

        // Checagem prévia de duplicidade de CNPJ
        const { data: existing } = await supabase
          .from('companies')
          .select('id, nome')
          .eq('cnpj', normalizedCnpj)
          .maybeSingle();

        if (existing) {
          return {
            data: null,
            error: `Já existe uma empresa cadastrada com este CNPJ: "${existing.nome}".`,
          };
        }
      }

      const { data, error } = await supabase
        .from('companies')
        .insert({
          nome: cleanNome,
          nome_normalizado: normalizedName,
          cnpj: normalizedCnpj || null,
          active: payload.active ?? true,
        })
        .select('*')
        .single();

      if (error) {
        if (error.code === '23505') {
          return { data: null, error: 'Violação de unicidade: já existe uma empresa com este Nome ou CNPJ.' };
        }
        return { data: null, error: error.message || 'Falha ao cadastrar empresa.' };
      }

      return { data, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao criar empresa.';
      return { data: null, error: msg };
    }
  }

  /**
   * Atualiza uma empresa existente na tabela public.companies.
   */
  async updateCompany(
    id: string,
    payload: {
      nome: string;
      cnpj?: string | null;
      active?: boolean;
    }
  ): Promise<{ data: Company | null; error: string | null }> {
    try {
      const cleanNome = payload.nome?.trim();
      if (!cleanNome) {
        return { data: null, error: 'O Nome / Razão Social da empresa é obrigatório.' };
      }

      const normalizedName = normalizeCompanyName(cleanNome);
      const normalizedCnpj = payload.cnpj ? unmaskCNPJ(payload.cnpj) : null;

      if (normalizedCnpj) {
        if (!validateCNPJ(normalizedCnpj)) {
          return { data: null, error: 'O CNPJ informado é inválido perante as regras da Receita Federal.' };
        }

        // Checagem de duplicidade excluindo a própria empresa
        const { data: existing } = await supabase
          .from('companies')
          .select('id, nome')
          .eq('cnpj', normalizedCnpj)
          .neq('id', id)
          .maybeSingle();

        if (existing) {
          return {
            data: null,
            error: `Já existe outra empresa cadastrada com este CNPJ: "${existing.nome}".`,
          };
        }
      }

      const { data, error } = await supabase
        .from('companies')
        .update({
          nome: cleanNome,
          nome_normalizado: normalizedName,
          cnpj: normalizedCnpj || null,
          active: payload.active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        if (error.code === '23505') {
          return { data: null, error: 'Violação de unicidade: já existe uma empresa com este CNPJ ou Nome.' };
        }
        return { data: null, error: error.message || 'Falha ao atualizar dados da empresa.' };
      }

      return { data, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao atualizar empresa.';
      return { data: null, error: msg };
    }
  }

  /**
   * Alterna status da empresa entre ativa ou inativa.
   */
  async toggleActive(
    id: string,
    currentActive: boolean
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          active: !currentActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        return { success: false, error: error.message || 'Falha ao alterar status da empresa.' };
      }

      return { success: true, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao alterar status.';
      return { success: false, error: msg };
    }
  }

  /**
   * Exclui uma empresa caso não possua processos vinculados.
   */
  async deleteCompany(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      // 1. Validar impedimento de integridade referencial com processos
      const linkedCheck = await this.countLinkedProcesses(id);
      if (linkedCheck.error || linkedCheck.count === null) {
        return {
          success: false,
          error: 'Não foi possível validar com segurança os vínculos desta empresa. A exclusão foi bloqueada por proteção de integridade; tente novamente ou utilize a opção "Inativar".',
        };
      }
      if (linkedCheck.count > 0) {
        return {
          success: false,
          error: `Não é possível excluir esta empresa pois existem ${linkedCheck.count} processo(s) vinculado(s) a ela. Para manter a rastreabilidade processual, utilize a opção "Inativar".`,
        };
      }

      // 2. Executa exclusão da empresa
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', id);

      if (error) {
        if (error.code === '23503') {
          return {
            success: false,
            error: 'Esta empresa possui registros dependentes em outras tabelas do sistema e não pode ser excluída.',
          };
        }
        return { success: false, error: error.message || 'Falha ao excluir empresa.' };
      }

      return { success: true, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao excluir empresa.';
      return { success: false, error: msg };
    }
  }

  async getAliases(companyId: string): Promise<{ data: CompanyAlias[]; error: string | null }> {
    const { data, error } = await supabase.from('company_aliases').select('*').eq('company_id', companyId).order('alias');
    return { data: (data || []) as CompanyAlias[], error: error?.message || null };
  }

  async addAlias(companyId: string, alias: string): Promise<{ data: CompanyAlias | null; error: string | null }> {
    const clean = alias.trim();
    if (clean.length < 3) return { data: null, error: 'Informe um alias com pelo menos 3 caracteres.' };
    const normalized = normalizeCompanyName(clean)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (normalized.length < 3) {
      return { data: null, error: 'O alias informado não gera um nome normalizado válido.' };
    }
    const { data, error } = await supabase.from('company_aliases').insert({ company_id: companyId, alias: clean, alias_normalizado: normalized, alias_type: 'NOME_ALTERNATIVO', active: true }).select('*').single();
    return { data: data as CompanyAlias | null, error: error?.code === '23505' ? 'Esse nome/alias já está vinculado a uma empresa ativa.' : error?.message || null };
  }

  async getOperationalDiagnostic(): Promise<unknown> {
    const response = await fetch('/api/company-resolution/diagnostic', { headers: await getApiAuthHeaders() });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Falha ao exportar diagnóstico.');
    return payload;
  }

  async removeAlias(aliasId: string): Promise<{ success: boolean; error: string | null }> {
    const { error } = await supabase.from('company_aliases').update({ active: false, updated_at: new Date().toISOString() }).eq('id', aliasId);
    return { success: !error, error: error?.message || null };
  }

  async getResolutionCandidates(status: 'PENDENTE' | 'TODOS' = 'PENDENTE', limit = 200): Promise<{ data: CompanyResolutionCandidate[]; total: number; error: string | null }> {
    try {
      const response = await fetch(`/api/company-resolution/candidates?status=${encodeURIComponent(status)}&limit=${Math.max(1, Math.min(200, limit))}`, {
        headers: await getApiAuthHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return { data: [], total: 0, error: payload?.error || `Falha HTTP ${response.status} ao carregar confirmações.` };
      const data = (payload?.candidates || []) as CompanyResolutionCandidate[];
      return { data, total: Number(payload?.total ?? data.length), error: null };
    } catch (err: unknown) {
      return { data: [], total: 0, error: err instanceof Error ? err.message : 'Falha ao carregar candidatos de empresa.' };
    }
  }

  async confirmResolutionCandidate(candidateId: string, payload: { companyId?: string | null; name?: string | null; cnpj?: string | null }): Promise<{ success: boolean; error: string | null }> {
    try {
      const response = await fetch(`/api/company-resolution/candidates/${candidateId}/confirm`, {
        method: 'POST',
        headers: await getApiAuthHeaders(),
        body: JSON.stringify(payload || {}),
      });
      const data = await response.json().catch(() => ({}));
      return { success: response.ok, error: response.ok ? null : data?.error || `Falha HTTP ${response.status}.` };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Falha ao confirmar empresa.' };
    }
  }

  async rejectResolutionCandidate(candidateId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const response = await fetch(`/api/company-resolution/candidates/${candidateId}/reject`, {
        method: 'POST',
        headers: await getApiAuthHeaders(),
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      return { success: response.ok, error: response.ok ? null : data?.error || `Falha HTTP ${response.status}.` };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Falha ao rejeitar candidato.' };
    }
  }

  /**
   * Ferramenta administrativa de saneamento.
   * Reavalia somente processos sem company_id usando o resolvedor determinístico.
   * Não é parte do fluxo normal de leitura de e-mails.
   */
  async reprocessOrphanCompanyLinks(processIds?: string[], execute = false, limit = 10): Promise<{
    data: CompanyResolutionReprocessResult | null;
    error: string | null;
  }> {
    try {
      const body: Record<string, any> = { execute };
      if (Array.isArray(processIds) && processIds.length > 0) {
        body.processIds = processIds;
      }
      if (!execute && (!processIds || processIds.length === 0)) {
        body.limit = Math.min(10, Math.max(1, limit));
      }

      const response = await fetch('/api/company-resolution/reprocess-orphans', {
        method: 'POST',
        headers: await getApiAuthHeaders(),
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          data: null,
          error: payload?.error || `Falha HTTP ${response.status} ao reprocessar vínculos.`,
        };
      }

      return { data: payload as CompanyResolutionReprocessResult, error: null };
    } catch (err: unknown) {
      return {
        data: null,
        error: err instanceof Error ? err.message : 'Falha ao reprocessar vínculos de empresa.',
      };
    }
  }

}

export const companiesService = new CompaniesService();
