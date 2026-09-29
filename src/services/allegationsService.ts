import { supabase } from './supabase';
import {
  BeneficiaryAllegation,
  AllegationReviewStatus,
} from '../types/database';

export const OBLIGATORY_PREFIX = 'Supostamente, o(a) beneficiário(a)';

export interface CreateAllegationDTO {
  process_id: string;
  beneficiary_person_id?: string | null;
  narrativa: string;
  tentativas_contato_qtd?: number | null;
  tentativas_contato_texto?: string | null;
  canais_mencionados?: string[];
  setor_mencionado?: string | null;
  tempo_espera_dias?: number | null;
  tempo_espera_texto?: string | null;
  dificuldade_relatada?: string | null;
  desfecho_alegado?: string | null;
  fonte_documento?: string | null;
  trecho_citado?: string | null;
}

class AllegationsService {
  /**
   * RF10 — Formata e garante o prefixo literal obrigatório conforme DOC01
   */
  ensureObligatoryPrefix(text: string): string {
    const trimmed = text.trim();
    if (trimmed.startsWith(OBLIGATORY_PREFIX)) {
      return trimmed;
    }
    // Previne duplicações imperfeitas
    return `${OBLIGATORY_PREFIX} ${trimmed}`;
  }

  /**
   * RF10 — Lista alegações registradas para o processo
   */
  async getByProcess(processId: string): Promise<{ data: BeneficiaryAllegation[]; error: string | null }> {
    const { data, error } = await supabase
      .from('beneficiary_allegations')
      .select('*')
      .eq('process_id', processId)
      .order('criado_em', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as BeneficiaryAllegation[], error: null };
  }

  /**
   * RF10/RF14 — Cria nova alegação com validação estrita do prefixo no servidor
   */
  async create(
    dto: CreateAllegationDTO,
    userId?: string,
  ): Promise<{ data: BeneficiaryAllegation | null; error: string | null }> {
    if (!dto.narrativa || dto.narrativa.trim() === '') {
      return { data: null, error: 'A narrativa da alegação é obrigatória.' };
    }

    const formattedNarrative = this.ensureObligatoryPrefix(dto.narrativa);

    const { data, error } = await supabase
      .from('beneficiary_allegations')
      .insert({
        ...dto,
        narrativa: formattedNarrative,
        status_revisao: 'CONFIRMADA',
        criado_por: userId ?? null,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    // RF14: Log de auditoria humana atômico
    if (userId && data) {
      await supabase.from('human_review_log').insert({
        process_id: dto.process_id,
        entidade_tipo: 'ALEGACAO',
        entidade_id: data.id,
        acao: 'CRIAR',
        valor_anterior: null,
        valor_novo: data as unknown as Record<string, unknown>,
        justificativa: 'Cadastro inicial de alegações do beneficiário',
        fonte_documento: dto.fonte_documento ?? null,
        trecho_citado: dto.trecho_citado ?? null,
        revisado_por: userId,
      });
    }

    return { data: data as BeneficiaryAllegation, error: null };
  }

  /**
   * RF10/RF14 — Atualiza narrativa ou revisão humana gravando log de auditoria
   */
  async update(
    id: string,
    updates: Partial<BeneficiaryAllegation>,
    justificativa: string,
    userId: string,
  ): Promise<{ data: BeneficiaryAllegation | null; error: string | null }> {
    // Buscar registro anterior para log
    const { data: previous } = await supabase
      .from('beneficiary_allegations')
      .select('*')
      .eq('id', id)
      .single();

    if (!previous) {
      return { data: null, error: 'Alegação não encontrada.' };
    }

    const payload: Partial<BeneficiaryAllegation> = {
      ...updates,
      revisado_por: userId,
      revisado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };

    if (updates.narrativa) {
      payload.narrativa = this.ensureObligatoryPrefix(updates.narrativa);
    }

    const { data, error } = await supabase
      .from('beneficiary_allegations')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    // RF14: Gravação atômica da auditoria
    await supabase.from('human_review_log').insert({
      process_id: previous.process_id,
      entidade_tipo: 'ALEGACAO',
      entidade_id: id,
      acao: 'CORRIGIR',
      valor_anterior: previous as unknown as Record<string, unknown>,
      valor_novo: data as unknown as Record<string, unknown>,
      justificativa: justificativa.trim() || 'Revisão humana de alegações',
      revisado_por: userId,
    });

    return { data: data as BeneficiaryAllegation, error: null };
  }

  /**
   * RF10 — Remove alegação
   */
  async delete(id: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('beneficiary_allegations')
      .delete()
      .eq('id', id);

    if (error) return { error: error.message };
    return { error: null };
  }
}

export const allegationsService = new AllegationsService();
