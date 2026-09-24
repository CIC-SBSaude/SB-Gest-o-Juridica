import { supabase } from './supabase';
import { Obligation } from '../types/database';
import { historyService } from './historyService';
import { requestAttentionIndicatorsRefresh } from './attentionIndicatorsService';

export interface CreateObligationDTO {
  process_id: string;
  descricao: string;
  prazo?: string | null;
  status?: string;
  tipo_prazo?: string | null;
  origem_prazo?: string | null;
  evento_gerador?: string | null;
  criticidade?: string | null;
  responsavel_id?: string | null;
  valor_multa_diaria?: number | null;
  valor_multa_limite?: number | null;
  observacoes?: string | null;
  created_by?: string | null;
}

export interface UpdateObligationDTO {
  descricao?: string;
  prazo?: string | null;
  status?: string;
  tipo_prazo?: string | null;
  origem_prazo?: string | null;
  evento_gerador?: string | null;
  criticidade?: string | null;
  responsavel_id?: string | null;
  valor_multa_diaria?: number | null;
  valor_multa_limite?: number | null;
  observacoes?: string | null;
}

export type DeadlineFilterTab = 'ALL' | 'OPEN' | 'OVERDUE' | 'NEXT_48H' | 'COMPLETED';

export interface GetAllObligationsParams {
  filterTab?: DeadlineFilterTab;
  criticality?: string;
  companyId?: string;
  responsavelId?: string;
  search?: string;
}

export interface ObligationsSummaryStats {
  pendentes: number;
  vencendo48h: number;
  vencidos: number;
  cumpridos: number;
  total: number;
}

class ObligationsService {
  /**
   * Obtém as obrigações vinculadas ao processo sem consultas em loop.
   * Ordena por prazo crescente (priorizando os mais próximos e vencidos), depois por created_at.
   */
  async getObligations(
    processId: string,
    filter?: 'ALL' | 'OPEN' | 'COMPLETED'
  ): Promise<{ data: Obligation[]; error: string | null }> {
    try {
      let query = supabase
        .from('obligations')
        .select(`
          *,
          responsavel:user_profiles!responsavel_id(id, display_name, email),
          criador:user_profiles!created_by(id, display_name, email)
        `)
        .eq('process_id', processId)
        .order('prazo', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (filter === 'OPEN') {
        query = query.not('status', 'in', '("CUMPRIDA","CONCLUIDA","CANCELADA")');
      } else if (filter === 'COMPLETED') {
        query = query.in('status', ['CUMPRIDA', 'CONCLUIDA', 'CANCELADA']);
      }

      const { data, error } = await query;

      if (!error && data) {
        return { data: data as Obligation[], error: null };
      }

      // Fallback: se a junção com user_profiles der erro de relacionamento PostgREST
      console.warn('[obligationsService] Tentando busca direta sem junção devido a:', error?.message);
      let fallbackQuery = supabase
        .from('obligations')
        .select('*')
        .eq('process_id', processId)
        .order('prazo', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (filter === 'OPEN') {
        fallbackQuery = fallbackQuery.not('status', 'in', '("CUMPRIDA","CONCLUIDA","CANCELADA")');
      } else if (filter === 'COMPLETED') {
        fallbackQuery = fallbackQuery.in('status', ['CUMPRIDA', 'CONCLUIDA', 'CANCELADA']);
      }

      const fallback = await fallbackQuery;

      if (fallback.error) {
        return { data: [], error: fallback.error.message || 'Erro ao carregar obrigações.' };
      }

      return { data: (fallback.data as Obligation[]) || [], error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao consultar obrigações.';
      return { data: [], error: msg };
    }
  }

  /**
   * Cadastra uma nova obrigação / prazo na tabela public.obligations.
   * Registra a inclusão no histórico do processo.
   */
  async createObligation(dto: CreateObligationDTO): Promise<{ data: Obligation | null; error: string | null }> {
    try {
      const payload = {
        process_id: dto.process_id,
        descricao: dto.descricao.trim(),
        prazo: dto.prazo || null,
        status: dto.status || 'ABERTA',
        tipo_prazo: dto.tipo_prazo || null,
        origem_prazo: dto.origem_prazo || null,
        evento_gerador: dto.evento_gerador?.trim() || null,
        criticidade: dto.criticidade || 'MEDIA',
        responsavel_id: dto.responsavel_id || null,
        valor_multa_diaria: dto.valor_multa_diaria !== undefined && dto.valor_multa_diaria !== null
          ? Number(dto.valor_multa_diaria)
          : null,
        valor_multa_limite: dto.valor_multa_limite !== undefined && dto.valor_multa_limite !== null
          ? Number(dto.valor_multa_limite)
          : null,
        observacoes: dto.observacoes?.trim() || null,
        created_by: dto.created_by || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('obligations')
        .insert(payload)
        .select(`
          *,
          responsavel:user_profiles!responsavel_id(id, display_name, email),
          criador:user_profiles!created_by(id, display_name, email)
        `)
        .single();

      if (error) {
        return { data: null, error: error.message || 'Erro ao criar obrigação.' };
      }

      // Registra no histórico do processo
      await historyService.recordHistoryEntry({
        process_id: dto.process_id,
        campo: 'obrigacao_cadastrada',
        valor_anterior: null,
        valor_novo: `[${payload.status}] ${payload.descricao}${payload.prazo ? ` (Prazo: ${new Date(payload.prazo).toLocaleDateString('pt-BR')})` : ''}`,
        usuario_id: dto.created_by || null,
        origem: 'MANUAL',
        data_hora: new Date().toISOString(),
      });

      requestAttentionIndicatorsRefresh();
      return { data: data as Obligation, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar obrigação.';
      return { data: null, error: msg };
    }
  }

  /**
   * Atualiza dados de uma obrigação.
   * Não permite edição silenciosa; grava a alteração no histórico.
   */
  async updateObligation(
    id: string,
    updates: UpdateObligationDTO,
    current: Obligation,
    userId?: string | null
  ): Promise<{ data: Obligation | null; error: string | null }> {
    try {
      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (updates.descricao !== undefined) payload.descricao = updates.descricao.trim();
      if (updates.prazo !== undefined) payload.prazo = updates.prazo || null;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.tipo_prazo !== undefined) payload.tipo_prazo = updates.tipo_prazo || null;
      if (updates.origem_prazo !== undefined) payload.origem_prazo = updates.origem_prazo || null;
      if (updates.evento_gerador !== undefined) payload.evento_gerador = updates.evento_gerador?.trim() || null;
      if (updates.criticidade !== undefined) payload.criticidade = updates.criticidade || null;
      if (updates.responsavel_id !== undefined) payload.responsavel_id = updates.responsavel_id || null;
      if (updates.valor_multa_diaria !== undefined) {
        payload.valor_multa_diaria = updates.valor_multa_diaria !== null ? Number(updates.valor_multa_diaria) : null;
      }
      if (updates.valor_multa_limite !== undefined) {
        payload.valor_multa_limite = updates.valor_multa_limite !== null ? Number(updates.valor_multa_limite) : null;
      }
      if (updates.observacoes !== undefined) payload.observacoes = updates.observacoes?.trim() || null;

      const { data, error } = await supabase
        .from('obligations')
        .update(payload)
        .eq('id', id)
        .select(`
          *,
          responsavel:user_profiles!responsavel_id(id, display_name, email),
          criador:user_profiles!created_by(id, display_name, email)
        `)
        .single();

      if (error) {
        return { data: null, error: error.message || 'Erro ao atualizar obrigação.' };
      }

      // Grava no histórico
      await historyService.recordHistoryEntry({
        process_id: current.process_id,
        campo: 'obrigacao_atualizada',
        valor_anterior: current.descricao,
        valor_novo: updates.descricao || current.descricao,
        usuario_id: userId || null,
        origem: 'MANUAL',
        data_hora: new Date().toISOString(),
      });

      requestAttentionIndicatorsRefresh();
      return { data: data as Obligation, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar obrigação.';
      return { data: null, error: msg };
    }
  }

  /**
   * Conclui a obrigação, marcando como CUMPRIDA e preenchendo concluido_em.
   */
  async completeObligation(
    id: string,
    current: Obligation,
    userId?: string | null
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('obligations')
        .update({
          status: 'CUMPRIDA',
          concluido_em: now,
          updated_at: now,
        })
        .eq('id', id);

      if (error) {
        return { success: false, error: error.message || 'Erro ao concluir obrigação.' };
      }

      // Registra no histórico do processo
      await historyService.recordHistoryEntry({
        process_id: current.process_id,
        campo: 'obrigacao_cumprida',
        valor_anterior: current.status,
        valor_novo: `CUMPRIDA (${current.descricao})`,
        usuario_id: userId || null,
        origem: 'MANUAL',
        data_hora: now,
      });

      return { success: true, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao concluir obrigação.';
      return { success: false, error: msg };
    }
  }

  /**
   * Cancela a obrigação, informando motivo se desejado.
   */
  async cancelObligation(
    id: string,
    motivo: string,
    current: Obligation,
    userId?: string | null
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const now = new Date().toISOString();
      const updatedObs = current.observacoes
        ? `${current.observacoes}\n[Cancelamento em ${new Date().toLocaleDateString('pt-BR')}]: ${motivo}`
        : `[Cancelamento em ${new Date().toLocaleDateString('pt-BR')}]: ${motivo}`;

      const { error } = await supabase
        .from('obligations')
        .update({
          status: 'CANCELADA',
          observacoes: updatedObs,
          updated_at: now,
        })
        .eq('id', id);

      if (error) {
        return { success: false, error: error.message || 'Erro ao cancelar obrigação.' };
      }

      await historyService.recordHistoryEntry({
        process_id: current.process_id,
        campo: 'obrigacao_cancelada',
        valor_anterior: current.status,
        valor_novo: `CANCELADA: ${current.descricao} (Motivo: ${motivo})`,
        usuario_id: userId || null,
        origem: 'MANUAL',
        data_hora: now,
      });

      return { success: true, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cancelar obrigação.';
      return { success: false, error: msg };
    }
  }

  /**
   * Busca todas as obrigações para a Central de Prazos (DeadlinesPage),
   * realizando a junção segura com processos, empresas e responsáveis sem N+1.
   * Aplica ordenação operacional prioritária:
   * 1. Vencidas (mais antigas no passado);
   * 2. Vencendo hoje / próximas (mais urgentes no futuro);
   * 3. Abertas sem data fixada (A_CONFIRMAR);
   * 4. Concluídas / Canceladas.
   */
  async getAllObligations(
    params?: GetAllObligationsParams
  ): Promise<{ data: Obligation[]; stats: ObligationsSummaryStats; error: string | null }> {
    try {
      let query = supabase
        .from('obligations')
        .select(`
          *,
          responsavel:user_profiles!responsavel_id(id, display_name, email),
          criador:user_profiles!created_by(id, display_name, email),
          process:processes!process_id(
            id,
            numero_processo,
            protocolo_externo,
            comarca,
            uf,
            prioridade,
            status_atual,
            company_id,
            company:companies(id, nome, cnpj, active)
          )
        `);

      // Filtro por criticidade se selecionado
      if (params?.criticality && params.criticality !== 'ALL') {
        query = query.eq('criticidade', params.criticality);
      }

      // Filtro por responsável
      if (params?.responsavelId && params.responsavelId !== 'ALL') {
        query = query.eq('responsavel_id', params.responsavelId);
      }

      const { data, error } = await query;

      let list: Obligation[] = [];

      if (!error && data) {
        list = data as Obligation[];
      } else {
        console.warn('[obligationsService] Tentando busca de contingência de obrigações devido a:', error?.message);
        // Fallback resiliente com processos
        const fallback = await supabase
          .from('obligations')
          .select(`
            *,
            process:processes(
              id,
              numero_processo,
              protocolo_externo,
              comarca,
              uf,
              prioridade,
              status_atual,
              company_id
            )
          `);

        if (fallback.error || !fallback.data) {
          return {
            data: [],
            stats: { pendentes: 0, vencendo48h: 0, vencidos: 0, cumpridos: 0, total: 0 },
            error: fallback.error?.message || error?.message || 'Erro ao carregar prazos e obrigações.',
          };
        }
        list = fallback.data as Obligation[];
      }

      // Filtragem por empresa se especificada
      if (params?.companyId && params.companyId !== 'ALL') {
        list = list.filter((ob) => ob.process?.company_id === params.companyId);
      }

      // Cálculo rigoroso das estatísticas operacionais da base carregada
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const in48hMs = now.getTime() + 48 * 60 * 60 * 1000;

      let pendentesCount = 0;
      let vencendo48hCount = 0;
      let vencidosCount = 0;
      let cumpridosCount = 0;

      for (const ob of list) {
        const normStatus = (ob.status || '').toUpperCase();
        const isClosed = ['CUMPRIDA', 'CONCLUIDA', 'CANCELADA', 'EXTINTA'].includes(normStatus);

        if (isClosed) {
          if (normStatus === 'CUMPRIDA' || normStatus === 'CONCLUIDA') {
            cumpridosCount++;
          }
          continue;
        }

        // É uma obrigação pendente/ativa
        pendentesCount++;

        if (ob.prazo) {
          const targetDate = new Date(ob.prazo);
          if (!isNaN(targetDate.getTime())) {
            const startOfTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
            const targetTime = targetDate.getTime();

            if (startOfTarget < startOfToday) {
              vencidosCount++;
            } else if (targetTime <= in48hMs) {
              vencendo48hCount++;
            }
          }
        }
      }

      const stats: ObligationsSummaryStats = {
        pendentes: pendentesCount,
        vencendo48h: vencendo48hCount,
        vencidos: vencidosCount,
        cumpridos: cumpridosCount,
        total: list.length,
      };

      // Filtro por Tab Operacional
      const tab = params?.filterTab || 'ALL';
      if (tab === 'OPEN') {
        list = list.filter((ob) => !['CUMPRIDA', 'CONCLUIDA', 'CANCELADA', 'EXTINTA'].includes((ob.status || '').toUpperCase()));
      } else if (tab === 'OVERDUE') {
        list = list.filter((ob) => {
          if (['CUMPRIDA', 'CONCLUIDA', 'CANCELADA', 'EXTINTA'].includes((ob.status || '').toUpperCase())) return false;
          if (!ob.prazo) return false;
          const targetDate = new Date(ob.prazo);
          if (isNaN(targetDate.getTime())) return false;
          const startOfTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
          return startOfTarget < startOfToday;
        });
      } else if (tab === 'NEXT_48H') {
        list = list.filter((ob) => {
          if (['CUMPRIDA', 'CONCLUIDA', 'CANCELADA', 'EXTINTA'].includes((ob.status || '').toUpperCase())) return false;
          if (!ob.prazo) return false;
          const targetDate = new Date(ob.prazo);
          if (isNaN(targetDate.getTime())) return false;
          const startOfTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
          const targetTime = targetDate.getTime();
          return startOfTarget >= startOfToday && targetTime <= in48hMs;
        });
      } else if (tab === 'COMPLETED') {
        list = list.filter((ob) => ['CUMPRIDA', 'CONCLUIDA'].includes((ob.status || '').toUpperCase()));
      }

      // Filtro por busca textual (número processo, protocolo, descrição, comarca, empresa)
      if (params?.search && params.search.trim() !== '') {
        const term = params.search.trim().toLowerCase();
        const digits = term.replace(/\D/g, '');

        list = list.filter((ob) => {
          const desc = (ob.descricao || '').toLowerCase();
          const obs = (ob.observacoes || '').toLowerCase();
          const evento = (ob.evento_gerador || '').toLowerCase();
          const procNum = (ob.process?.numero_processo || '').toLowerCase();
          const procDigits = (ob.process?.numero_processo || '').replace(/\D/g, '');
          const prot = (ob.process?.protocolo_externo || '').toLowerCase();
          const comarca = (ob.process?.comarca || '').toLowerCase();
          const compName = (ob.process?.company?.nome || '').toLowerCase();

          const matchesText =
            desc.includes(term) ||
            obs.includes(term) ||
            evento.includes(term) ||
            procNum.includes(term) ||
            prot.includes(term) ||
            comarca.includes(term) ||
            compName.includes(term);

          const matchesDigits = digits.length >= 3 && procDigits.includes(digits);

          return matchesText || matchesDigits;
        });
      }

      // Ordenação prioritária de prazos
      list.sort((a, b) => {
        const aStatus = (a.status || '').toUpperCase();
        const bStatus = (b.status || '').toUpperCase();
        const aClosed = ['CUMPRIDA', 'CONCLUIDA', 'CANCELADA', 'EXTINTA'].includes(aStatus);
        const bClosed = ['CUMPRIDA', 'CONCLUIDA', 'CANCELADA', 'EXTINTA'].includes(bStatus);

        // Abertas antes de Concluídas
        if (aClosed && !bClosed) return 1;
        if (!aClosed && bClosed) return -1;

        const aTime = a.prazo ? new Date(a.prazo).getTime() : null;
        const bTime = b.prazo ? new Date(b.prazo).getTime() : null;
        const aValid = aTime !== null && !isNaN(aTime);
        const bValid = bTime !== null && !isNaN(bTime);

        const aOverdue = aValid && aTime! < now.getTime();
        const bOverdue = bValid && bTime! < now.getTime();

        // 1. Ambas vencidas: a mais antiga no passado (menor timestamp) vem primeiro
        if (aOverdue && bOverdue) return aTime! - bTime!;
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;

        // 2. Ambas futuras com prazo válido: a mais próxima no futuro vem primeiro
        if (aValid && bValid) return aTime! - bTime!;
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;

        // 3. Sem prazo (A_CONFIRMAR) ou concluídas: desempata por created_at mais recente
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      return { data: list, stats, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao consultar central de prazos.';
      return {
        data: [],
        stats: { pendentes: 0, vencendo48h: 0, vencidos: 0, cumpridos: 0, total: 0 },
        error: msg,
      };
    }
  }
}

export const obligationsService = new ObligationsService();
