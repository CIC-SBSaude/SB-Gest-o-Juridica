import { supabase } from './supabase';
import { Process, ProcessStatus, Company, Obligation, ProcessParty, ProcessSegment } from '../types/database';
import { sortProcesses, type ProcessSortOption } from '../utils/processSorting';
import { formatUserErrorMessage } from '../utils/errorUtils';

export interface ProcessFilters {
  search?: string;
  status?: ProcessStatus | 'ALL';
  companyId?: string | 'ALL';
  prioridade?: string | 'ALL';
  includeArchived?: boolean;
  sort?: ProcessSortOption;
  segmento?: ProcessSegment | 'ALL';
}

export interface CreateProcessDTO {
  numero_processo?: string | null;
  protocolo_externo?: string | null;
  company_id?: string | null;
  origem?: string | null;
  natureza?: string | null;
  fase_processual?: string | null;
  tutela_atual?: string | null;
  comarca?: string | null;
  municipio?: string | null;
  uf?: string | null;
  situacao_beneficiario?: string | null;
  valor_causa?: number | null;
  tipo_demanda?: string | null;
  subtipo_demanda?: string | null;
  objeto_demanda?: string | null;
  categoria_demanda?: string | null;
  subcategoria_demanda?: string | null;
  natureza_juridica?: string[] | null;
  detalhe_demanda?: string | null;
  classificacao_origem?: 'IA' | 'MANUAL' | 'IA_CONFIRMADA' | null;
  classificacao_atualizada_em?: string | null;
  responsavel_id?: string | null;
  prioridade?: string | null;
  status_atual?: ProcessStatus | string;
  recebido_em?: string | null;
  aberto_em?: string | null;
  concluido_em?: string | null;
  cadastro_incompleto?: boolean;
  pendencias?: string[] | null;
  created_by?: string | null;
}

export interface UpdateProcessDTO extends Partial<CreateProcessDTO> {
  arquivado?: boolean;
  arquivado_em?: string | null;
  updated_by?: string | null;
}

export interface ProcessDependenciesCheck {
  canDelete: boolean;
  totalDependencies: number;
  details: {
    obligations: number;
    documents: number;
    timelineEvents: number;
    parties: number;
    history: number;
    emails: number;
    evidence: number;
  };
}

class ProcessesService {
  /**
   * Lista processos respeitando filtros de busca, status, empresa e arquivamento.
   * Utiliza junção com public.companies para apresentar dados corporativos sem queries em loop.
   */
  async getProcesses(filters?: ProcessFilters): Promise<{ data: Process[]; error: string | null }> {
    try {
      // Monta query base
      let query = supabase
        .from('processes')
        .select(`
          *,
          company:companies(id, nome, nome_normalizado, cnpj, active)
        `)
        .order('created_at', { ascending: false });

      // Filtro por status
      if (filters?.status && filters.status !== 'ALL') {
        query = query.eq('status_atual', filters.status);
      }

      // Filtro por empresa vinculada
      if (filters?.companyId && filters.companyId !== 'ALL') {
        query = query.eq('company_id', filters.companyId);
      }

      // Filtro por prioridade
      if (filters?.prioridade && filters.prioridade !== 'ALL') {
        query = query.eq('prioridade', filters.prioridade);
      }

      // Filtro por segmento (RF01/RF04)
      if (filters?.segmento && filters.segmento !== 'ALL') {
        if (filters.segmento === 'NAO_CLASSIFICADO') {
          query = query.or('segmento.is.null,segmento.eq.NAO_CLASSIFICADO');
        } else {
          query = query.eq('segmento', filters.segmento);
        }
      }

      // Filtro por arquivado (por padrão lista apenas processos ativos)
      if (!filters?.includeArchived) {
        query = query.eq('arquivado', false);
      }

      const { data, error } = await query;

      let result: Process[] = [];

      if (error) {
        // Se a junção falhar por alguma restrição do PostgREST, tenta sem a junção
        // explícita, mas preserva TODOS os filtros. Contingência não pode ampliar
        // silenciosamente o conjunto de dados exibido ao usuário.
        console.warn('[processesService] Tentando busca direta sem junção devido a:', error.message);
        let fallbackQuery = supabase
          .from('processes')
          .select('*')
          .order('created_at', { ascending: false });

        if (filters?.status && filters.status !== 'ALL') {
          fallbackQuery = fallbackQuery.eq('status_atual', filters.status);
        }
        if (filters?.companyId && filters.companyId !== 'ALL') {
          fallbackQuery = fallbackQuery.eq('company_id', filters.companyId);
        }
        if (filters?.prioridade && filters.prioridade !== 'ALL') {
          fallbackQuery = fallbackQuery.eq('prioridade', filters.prioridade);
        }
        if (filters?.segmento && filters.segmento !== 'ALL') {
          if (filters.segmento === 'NAO_CLASSIFICADO') {
            fallbackQuery = fallbackQuery.or('segmento.is.null,segmento.eq.NAO_CLASSIFICADO');
          } else {
            fallbackQuery = fallbackQuery.eq('segmento', filters.segmento);
          }
        }
        if (!filters?.includeArchived) {
          fallbackQuery = fallbackQuery.eq('arquivado', false);
        }

        const fallback = await fallbackQuery;
        if (fallback.error) {
          return { data: [], error: formatUserErrorMessage(fallback.error, 'Erro ao consultar processos.') };
        }
        result = (fallback.data as Process[]) || [];
      } else {
        result = (data as Process[]) || [];
      }

      // Filtro de busca textual abrangente
      if (filters?.search && filters.search.trim() !== '') {
        result = this.filterLocally(result, filters.search);
      }

      // Enriquecimento operacional em lote (sem N+1): obrigação ativa + autores classificados.
      if (result.length > 0) {
        const processIds = result.map((p) => p.id);
        const [obligationsMap, authorsMap] = await Promise.all([
          this.fetchPrimaryObligationsForProcesses(processIds),
          this.fetchAuthorsForProcesses(processIds),
        ]);
        result = result.map((proc) => ({
          ...proc,
          proxima_obrigacao: obligationsMap[proc.id] || null,
          autores: authorsMap[proc.id] || [],
        }));
      }

      // A ordenação é aplicada após o enriquecimento porque "Prazo mais próximo"
      // depende da obrigação operacional selecionada para cada processo.
      result = sortProcesses(result, filters?.sort || 'OPERATIONAL_PRIORITY');

      return { data: result, error: null };
    } catch (err: unknown) {
      return { data: [], error: formatUserErrorMessage(err, 'Erro desconhecido ao carregar processos.') };
    }
  }

  /**
   * Carrega os autores já classificados de um conjunto de processos em lote.
   * Mantém somente tipo=AUTOR e prioriza principal=true para exibição no painel.
   */
  async fetchAuthorsForProcesses(processIds: string[]): Promise<Record<string, ProcessParty[]>> {
    if (!processIds || processIds.length === 0) return {};

    const uniqueIds = Array.from(new Set(processIds.filter((id) => Boolean(id && typeof id === 'string'))));
    if (uniqueIds.length === 0) return {};

    try {
      const CHUNK_SIZE = 80;
      const chunks: string[][] = [];
      for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
        chunks.push(uniqueIds.slice(i, i + CHUNK_SIZE));
      }

      const allAuthors: ProcessParty[] = [];

      await Promise.all(
        chunks.map(async (chunk) => {
          const { data, error } = await supabase
            .from('process_parties')
            .select('id, process_id, nome, tipo, documento, principal, created_at')
            .in('process_id', chunk)
            .eq('tipo', 'AUTOR');

          if (error) {
            console.warn('[processesService] Aviso ao carregar autores em lote:', error.message);
            return;
          }

          if (data && Array.isArray(data)) {
            allAuthors.push(...(data as ProcessParty[]));
          }
        })
      );

      const grouped: Record<string, ProcessParty[]> = {};
      for (const author of allAuthors) {
        if (!grouped[author.process_id]) grouped[author.process_id] = [];
        grouped[author.process_id].push(author);
      }

      for (const authors of Object.values(grouped)) {
        authors.sort((a, b) => {
          if (a.principal !== b.principal) return a.principal ? -1 : 1;
          const aCreated = new Date(a.created_at || 0).getTime();
          const bCreated = new Date(b.created_at || 0).getTime();
          if (aCreated !== bCreated) return aCreated - bCreated;
          return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
        });
      }

      return grouped;
    } catch (err) {
      console.warn('[processesService] Exceção ao buscar autores em lote:', err);
      return {};
    }
  }

  /**
   * Busca as obrigações ativas de um conjunto de processos em uma ÚNICA query (evitando N+1),
   * selecionando a obrigação operacionalmente mais relevante para cada processo:
   * 1. Obrigação vencida (mais antiga no passado / menor prazo);
   * 2. Menor prazo futuro (mais próxima de vencer);
   * 3. Ativa sem prazo definido;
   * 4. Se não houver ativa, retorna null.
   */
  async fetchPrimaryObligationsForProcesses(processIds: string[]): Promise<Record<string, Obligation>> {
    if (!processIds || processIds.length === 0) return {};

    const uniqueIds = Array.from(new Set(processIds.filter((id) => Boolean(id && typeof id === 'string'))));
    if (uniqueIds.length === 0) return {};

    try {
      // Divide em lotes de 80 IDs para evitar ultrapassar o limite de tamanho da URL (HTTP GET) no PostgREST (Bad Request)
      const CHUNK_SIZE = 80;
      const chunks: string[][] = [];
      for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
        chunks.push(uniqueIds.slice(i, i + CHUNK_SIZE));
      }

      const allObligations: Obligation[] = [];

      await Promise.all(
        chunks.map(async (chunk) => {
          // Busca apenas obrigações que não foram concluídas nem canceladas
          let { data, error } = await supabase
            .from('obligations')
            .select(`
              *,
              responsavel:user_profiles!responsavel_id(id, display_name, email)
            `)
            .in('process_id', chunk)
            .not('status', 'in', '("CUMPRIDA","CONCLUIDA","CANCELADA","EXTINTA")');

          // Fallback caso a junção com user_profiles encontre restrição no PostgREST
          if (error) {
            console.warn('[processesService] Tentando busca de obrigações sem junção de perfil devido a:', error.message);
            const fallback = await supabase
              .from('obligations')
              .select('*')
              .in('process_id', chunk)
              .not('status', 'in', '("CUMPRIDA","CONCLUIDA","CANCELADA","EXTINTA")');

            if (fallback.error || !fallback.data) {
              console.warn('[processesService] Aviso ao carregar obrigações em lote:', fallback.error?.message);
              return;
            }
            data = fallback.data;
          }

          if (data && Array.isArray(data)) {
            allObligations.push(...(data as Obligation[]));
          }
        })
      );

      const grouped: Record<string, Obligation[]> = {};
      for (const ob of allObligations) {
        if (!grouped[ob.process_id]) grouped[ob.process_id] = [];
        grouped[ob.process_id].push(ob);
      }

      const result: Record<string, Obligation> = {};
      const nowMs = Date.now();

      for (const [procId, obs] of Object.entries(grouped)) {
        if (!obs || obs.length === 0) continue;

        // Ordenação prioritária:
        // 1. Vencidas: prazo < nowMs (ordenadas pela menor data / mais antiga no passado)
        // 2. Futuras: prazo >= nowMs (ordenadas pela menor data / mais próxima no futuro)
        // 3. Sem prazo definido (prazo nulo ou inválido)
        obs.sort((a, b) => {
          const aTime = a.prazo ? new Date(a.prazo).getTime() : null;
          const bTime = b.prazo ? new Date(b.prazo).getTime() : null;

          const aValid = aTime !== null && !isNaN(aTime);
          const bValid = bTime !== null && !isNaN(bTime);

          const aOverdue = aValid && aTime! < nowMs;
          const bOverdue = bValid && bTime! < nowMs;

          // Ambas vencidas: a mais antiga (menor timestamp) vem primeiro
          if (aOverdue && bOverdue) {
            return aTime! - bTime!;
          }
          if (aOverdue && !bOverdue) return -1;
          if (!aOverdue && bOverdue) return 1;

          // Ambas futuras com prazo válido: a mais próxima (menor timestamp) vem primeiro
          if (aValid && bValid) {
            return aTime! - bTime!;
          }
          if (aValid && !bValid) return -1;
          if (!aValid && bValid) return 1;

          // Ambas sem prazo: desempata por created_at mais recente
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        result[procId] = obs[0];
      }

      return result;
    } catch (err) {
      console.warn('[processesService] Exceção ao buscar obrigações em lote:', err);
      return {};
    }
  }

  /**
   * Filtro textual complementar para suportar busca em campos compostos e normalizados
   */
  private filterLocally(processes: Process[], term: string): Process[] {
    const cleanTerm = term.trim().toLowerCase();
    const rawDigits = term.replace(/\D/g, '');

    return processes.filter((proc) => {
      const numProc = (proc.numero_processo || '').toLowerCase();
      const numDigits = (proc.numero_processo || '').replace(/\D/g, '');
      const prot = (proc.protocolo_externo || '').toLowerCase();
      const obj = (proc.objeto_demanda || '').toLowerCase();
      const tipo = (proc.tipo_demanda || '').toLowerCase();
      const comarca = (proc.comarca || '').toLowerCase();
      const municipio = (proc.municipio || '').toLowerCase();
      const companyName = (proc.company?.nome || '').toLowerCase();

      const matchesText =
        numProc.includes(cleanTerm) ||
        prot.includes(cleanTerm) ||
        obj.includes(cleanTerm) ||
        tipo.includes(cleanTerm) ||
        comarca.includes(cleanTerm) ||
        municipio.includes(cleanTerm) ||
        companyName.includes(cleanTerm);

      const matchesDigits = rawDigits.length >= 3 && numDigits.includes(rawDigits);

      return matchesText || matchesDigits;
    });
  }

  /**
   * Consulta um processo pelo ID com dados da empresa e do responsável
   */
  async getProcessById(id: string): Promise<{ data: Process | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('processes')
        .select(`
          *,
          company:companies(id, nome, nome_normalizado, cnpj, active)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        return { data: null, error: error.message };
      }

      if (data) {
        const [obligationsMap, authorsMap] = await Promise.all([
          this.fetchPrimaryObligationsForProcesses([data.id]),
          this.fetchAuthorsForProcesses([data.id]),
        ]);
        return {
          data: {
            ...data,
            proxima_obrigacao: obligationsMap[data.id] || null,
            autores: authorsMap[data.id] || [],
          },
          error: null,
        };
      }

      return { data: null, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar detalhes do processo.';
      return { data: null, error: msg };
    }
  }

  /**
   * Cadastra um novo processo judicial na tabela public.processes.
   * Regra estrita: numero_processo/CNJ NÃO deve ser tratado como globalmente único.
   * O sistema aceita múltiplos registros com o mesmo CNJ.
   */
  async createProcess(payload: CreateProcessDTO): Promise<{ data: Process | null; error: string | null }> {
    try {
      const cleanNumero = payload.numero_processo?.trim() || null;
      const cleanProtocolo = payload.protocolo_externo?.trim() || null;
      const cleanObjeto = payload.objeto_demanda?.trim() || null;

      const newRecord = {
        numero_processo: cleanNumero,
        protocolo_externo: cleanProtocolo,
        company_id: payload.company_id || null,
        origem: payload.origem?.trim() || null,
        natureza: payload.natureza?.trim() || null,
        fase_processual: payload.fase_processual?.trim() || null,
        tutela_atual: payload.tutela_atual?.trim() || null,
        comarca: payload.comarca?.trim() || null,
        municipio: payload.municipio?.trim() || null,
        uf: payload.uf?.trim()?.toUpperCase() || null,
        situacao_beneficiario: payload.situacao_beneficiario?.trim() || null,
        valor_causa: payload.valor_causa !== undefined && payload.valor_causa !== null ? Number(payload.valor_causa) : null,
        tipo_demanda: payload.tipo_demanda?.trim() || null,
        subtipo_demanda: payload.subtipo_demanda?.trim() || null,
        objeto_demanda: cleanObjeto,
        categoria_demanda: payload.categoria_demanda || null,
        subcategoria_demanda: payload.subcategoria_demanda || null,
        natureza_juridica: payload.natureza_juridica?.length ? payload.natureza_juridica : null,
        detalhe_demanda: payload.detalhe_demanda?.trim() || null,
        classificacao_origem: payload.classificacao_origem || null,
        classificacao_atualizada_em: payload.classificacao_atualizada_em || null,
        responsavel_id: payload.responsavel_id || null,
        prioridade: payload.prioridade || 'MEDIA',
        status_atual: payload.status_atual || 'NOVA',
        recebido_em: payload.recebido_em || new Date().toISOString(),
        aberto_em: payload.aberto_em || new Date().toISOString(),
        concluido_em: payload.concluido_em || null,
        cadastro_incompleto: payload.cadastro_incompleto ?? false,
        pendencias: payload.pendencias && payload.pendencias.length > 0 ? payload.pendencias : null,
        created_by: payload.created_by || null,
        arquivado: false,
      };

      const { data, error } = await supabase
        .from('processes')
        .insert(newRecord)
        .select(`
          *,
          company:companies(id, nome, nome_normalizado, cnpj, active)
        `)
        .single();

      if (error) {
        return { data: null, error: error.message || 'Falha ao cadastrar processo no banco de dados.' };
      }

      const authorsMap = await this.fetchAuthorsForProcesses([data.id]);
      return { data: { ...data, autores: authorsMap[data.id] || [] }, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao salvar processo.';
      return { data: null, error: msg };
    }
  }

  /**
   * Atualiza um processo existente na tabela public.processes
   */
  async updateProcess(id: string, payload: UpdateProcessDTO): Promise<{ data: Process | null; error: string | null }> {
    try {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (payload.numero_processo !== undefined) {
        updateData.numero_processo = payload.numero_processo?.trim() || null;
      }
      if (payload.protocolo_externo !== undefined) {
        updateData.protocolo_externo = payload.protocolo_externo?.trim() || null;
      }
      if (payload.company_id !== undefined) {
        updateData.company_id = payload.company_id || null;
      }
      if (payload.origem !== undefined) updateData.origem = payload.origem?.trim() || null;
      if (payload.natureza !== undefined) updateData.natureza = payload.natureza?.trim() || null;
      if (payload.fase_processual !== undefined) updateData.fase_processual = payload.fase_processual?.trim() || null;
      if (payload.tutela_atual !== undefined) updateData.tutela_atual = payload.tutela_atual?.trim() || null;
      if (payload.comarca !== undefined) updateData.comarca = payload.comarca?.trim() || null;
      if (payload.municipio !== undefined) updateData.municipio = payload.municipio?.trim() || null;
      if (payload.uf !== undefined) updateData.uf = payload.uf?.trim()?.toUpperCase() || null;
      if (payload.situacao_beneficiario !== undefined) {
        updateData.situacao_beneficiario = payload.situacao_beneficiario?.trim() || null;
      }
      if (payload.valor_causa !== undefined) {
        updateData.valor_causa = payload.valor_causa !== null ? Number(payload.valor_causa) : null;
      }
      if (payload.tipo_demanda !== undefined) updateData.tipo_demanda = payload.tipo_demanda?.trim() || null;
      if (payload.subtipo_demanda !== undefined) updateData.subtipo_demanda = payload.subtipo_demanda?.trim() || null;
      if (payload.objeto_demanda !== undefined) updateData.objeto_demanda = payload.objeto_demanda?.trim() || null;
      if (payload.categoria_demanda !== undefined) updateData.categoria_demanda = payload.categoria_demanda || null;
      if (payload.subcategoria_demanda !== undefined) updateData.subcategoria_demanda = payload.subcategoria_demanda || null;
      if (payload.natureza_juridica !== undefined) updateData.natureza_juridica = payload.natureza_juridica?.length ? payload.natureza_juridica : null;
      if (payload.detalhe_demanda !== undefined) updateData.detalhe_demanda = payload.detalhe_demanda?.trim() || null;
      if (payload.classificacao_origem !== undefined) updateData.classificacao_origem = payload.classificacao_origem || null;
      if (payload.classificacao_atualizada_em !== undefined) updateData.classificacao_atualizada_em = payload.classificacao_atualizada_em || null;
      if (payload.responsavel_id !== undefined) updateData.responsavel_id = payload.responsavel_id || null;
      if (payload.prioridade !== undefined) updateData.prioridade = payload.prioridade;
      if (payload.status_atual !== undefined) {
        updateData.status_atual = payload.status_atual;
        if (payload.status_atual === 'CONCLUIDA' && !payload.concluido_em) {
          updateData.concluido_em = new Date().toISOString();
        }
      }
      if (payload.recebido_em !== undefined) updateData.recebido_em = payload.recebido_em;
      if (payload.aberto_em !== undefined) updateData.aberto_em = payload.aberto_em;
      if (payload.concluido_em !== undefined) updateData.concluido_em = payload.concluido_em;
      if (payload.cadastro_incompleto !== undefined) updateData.cadastro_incompleto = payload.cadastro_incompleto;
      if (payload.pendencias !== undefined) updateData.pendencias = payload.pendencias;
      if (payload.arquivado !== undefined) updateData.arquivado = payload.arquivado;
      if (payload.arquivado_em !== undefined) updateData.arquivado_em = payload.arquivado_em;
      if (payload.updated_by !== undefined) updateData.updated_by = payload.updated_by;

      const { data, error } = await supabase
        .from('processes')
        .update(updateData)
        .eq('id', id)
        .select(`
          *,
          company:companies(id, nome, nome_normalizado, cnpj, active)
        `)
        .single();

      if (error) {
        return { data: null, error: error.message || 'Falha ao atualizar processo.' };
      }

      const authorsMap = await this.fetchAuthorsForProcesses([data.id]);
      return { data: { ...data, autores: authorsMap[data.id] || [] }, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao atualizar processo.';
      return { data: null, error: msg };
    }
  }

  /**
   * Altera rapidamente o status de um processo
   */
  async updateStatus(
    id: string,
    newStatus: ProcessStatus | string,
    updatedBy?: string | null
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const updatePayload: Record<string, unknown> = {
        status_atual: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (updatedBy) {
        updatePayload.updated_by = updatedBy;
      }

      if (newStatus === 'CONCLUIDA') {
        updatePayload.concluido_em = new Date().toISOString();
      }

      const { error } = await supabase
        .from('processes')
        .update(updatePayload)
        .eq('id', id);

      if (error) {
        return { success: false, error: error.message || 'Falha ao alterar status do processo.' };
      }

      return { success: true, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar status.';
      return { success: false, error: msg };
    }
  }

  /**
   * Alterna arquivamento do processo
   */
  async toggleArchive(
    id: string,
    currentArchived: boolean,
    updatedBy?: string | null
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const isArchiving = !currentArchived;
      const updatePayload: Record<string, unknown> = {
        arquivado: isArchiving,
        arquivado_em: isArchiving ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      if (updatedBy) {
        updatePayload.updated_by = updatedBy;
      }

      const { error } = await supabase
        .from('processes')
        .update(updatePayload)
        .eq('id', id);

      if (error) {
        return { success: false, error: error.message || 'Falha ao alterar arquivamento.' };
      }

      return { success: true, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar status de arquivamento.';
      return { success: false, error: msg };
    }
  }

  /**
   * Inspeciona dependências com chaves estrangeiras antes de autorizar a exclusão:
   * obligations, process_documents, process_parties, process_history,
   * process_timeline, process_evidence, processed_emails.
   */
  async checkDependencies(processId: string): Promise<ProcessDependenciesCheck> {
    const details = {
      obligations: 0,
      documents: 0,
      timelineEvents: 0,
      parties: 0,
      history: 0,
      emails: 0,
      evidence: 0,
    };

    try {
      const [
        resObligations,
        resDocs,
        resTimeline,
        resParties,
        resHistory,
        resEmails,
        resEvidence,
      ] = await Promise.all([
        supabase.from('obligations').select('id', { count: 'exact', head: true }).eq('process_id', processId),
        supabase.from('process_documents').select('id', { count: 'exact', head: true }).eq('process_id', processId),
        supabase.from('process_timeline').select('id', { count: 'exact', head: true }).eq('process_id', processId),
        supabase.from('process_parties').select('id', { count: 'exact', head: true }).eq('process_id', processId),
        supabase.from('process_history').select('id', { count: 'exact', head: true }).eq('process_id', processId),
        supabase.from('processed_emails').select('id', { count: 'exact', head: true }).eq('process_id', processId),
        supabase.from('process_evidence').select('id', { count: 'exact', head: true }).eq('process_id', processId),
      ]);

      const dependencyResults = [
        ['obligations', resObligations],
        ['documents', resDocs],
        ['timelineEvents', resTimeline],
        ['parties', resParties],
        ['history', resHistory],
        ['emails', resEmails],
        ['evidence', resEvidence],
      ] as const;

      const failedChecks = dependencyResults
        .filter(([, result]) => Boolean(result.error))
        .map(([name, result]) => `${name}: ${result.error?.message || 'falha desconhecida'}`);

      // Falha fechada: se não conseguimos provar que não existem dependências,
      // a exclusão física não é autorizada.
      if (failedChecks.length > 0) {
        console.warn('[processesService] Falha ao verificar dependências:', failedChecks);
        return {
          canDelete: false,
          totalDependencies: -1,
          details,
        };
      }

      details.obligations = resObligations.count ?? 0;
      details.documents = resDocs.count ?? 0;
      details.timelineEvents = resTimeline.count ?? 0;
      details.parties = resParties.count ?? 0;
      details.history = resHistory.count ?? 0;
      details.emails = resEmails.count ?? 0;
      details.evidence = resEvidence.count ?? 0;

      const totalDependencies =
        details.obligations +
        details.documents +
        details.timelineEvents +
        details.parties +
        details.history +
        details.emails +
        details.evidence;

      return {
        canDelete: totalDependencies === 0,
        totalDependencies,
        details,
      };
    } catch (err) {
      console.warn('[processesService] Falha ao verificar dependências:', err);
      return {
        canDelete: false,
        totalDependencies: -1,
        details,
      };
    }
  }

  /**
   * Exclui um processo judicial caso a integridade referencial permita.
   */
  async deleteProcess(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      // 1. Verificação proativa de integridade referencial
      const depCheck = await this.checkDependencies(id);
      if (!depCheck.canDelete) {
        if (depCheck.totalDependencies < 0) {
          return {
            success: false,
            error: 'Não foi possível validar com segurança as dependências deste processo. A exclusão física foi bloqueada por proteção de integridade; tente novamente ou utilize Arquivar.',
          };
        }

        const parts: string[] = [];
        if (depCheck.details.obligations > 0) parts.push(`${depCheck.details.obligations} obrigação(ões)/prazo(s)`);
        if (depCheck.details.documents > 0) parts.push(`${depCheck.details.documents} documento(s)`);
        if (depCheck.details.timelineEvents > 0) parts.push(`${depCheck.details.timelineEvents} evento(s) na timeline`);
        if (depCheck.details.parties > 0) parts.push(`${depCheck.details.parties} parte(s) vinculada(s)`);
        if (depCheck.details.history > 0) parts.push(`${depCheck.details.history} registro(s) de histórico`);
        if (depCheck.details.emails > 0) parts.push(`${depCheck.details.emails} e-mail(s) associado(s)`);

        return {
          success: false,
          error: `Este processo possui vínculos que impedem a exclusão física: ${parts.join(', ')}. Para manter a rastreabilidade jurídica, altere o status para "CANCELADA" ou utilize o recurso "Arquivar".`,
        };
      }

      // 2. Executa exclusão no banco de dados
      const { error } = await supabase
        .from('processes')
        .delete()
        .eq('id', id);

      if (error) {
        if (error.code === '23503') {
          return {
            success: false,
            error: 'Violação de integridade referencial: este processo possui vínculos em outras tabelas do sistema e não pode ser excluído.',
          };
        }
        return { success: false, error: error.message || 'Falha ao excluir processo.' };
      }

      return { success: true, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao excluir processo.';
      return { success: false, error: msg };
    }
  }
}

export const processesService = new ProcessesService();
