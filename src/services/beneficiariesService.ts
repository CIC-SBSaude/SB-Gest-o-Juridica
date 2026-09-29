import { supabase } from './supabase';
import {
  BeneficiaryPerson,
  BeneficiaryEnrollment,
  BeneficiaryPapel,
  ProcessBeneficiary,
  ProcessBeneficiarySummary,
  RegionalMapping,
  TipoContratacao,
  EnrollmentStatus,
} from '../types/database';

export interface CreatePersonDTO {
  nome_completo: string;
  cpf?: string | null;
  data_nascimento?: string | null;
  nome_mae?: string | null;
  cns?: string | null;
  municipio?: string | null;
  uf?: string | null;
  codigo_municipio_ibge?: string | null;
}

export interface CreateEnrollmentDTO {
  person_id: string;
  numero_carteirinha: string;
  plano_codigo?: string | null;
  plano_nome?: string | null;
  status_inscricao?: EnrollmentStatus;
  tipo_contratacao?: TipoContratacao;
  contrato_codigo?: string | null;
  estipulante_pj_nome?: string | null;
  estipulante_pj_cnpj?: string | null;
  data_adesao?: string | null;
  data_cancelamento?: string | null;
  abrangencia?: string | null;
  acomodacao?: string | null;
  segmentacao_assistencial?: string | null;
}

export interface LinkBeneficiaryDTO {
  process_id: string;
  person_id: string;
  enrollment_id?: string | null;
  papel: BeneficiaryPapel;
  is_principal?: boolean;
  representa_person_id?: string | null;
  snapshot_municipio?: string | null;
  snapshot_uf?: string | null;
  snapshot_regional?: string | null;
  snapshot_idade_na_data?: number | null;
  snapshot_data_referencia?: string | null;
  fonte_consulta?: string | null;
  confirmado?: boolean;
}

class BeneficiariesService {
  /**
   * RF05/RF06/RF07 — Lista beneficiários vinculados ao processo com dados cadastrais e do plano
   */
  async getByProcess(processId: string): Promise<{ data: ProcessBeneficiarySummary[]; error: string | null }> {
    const { data, error } = await supabase
      .from('v_process_beneficiaries_summary')
      .select('*')
      .eq('process_id', processId)
      .order('is_principal', { ascending: false })
      .order('nome_completo', { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as ProcessBeneficiarySummary[], error: null };
  }

  /**
   * RF05 — Busca pessoas por CPF limpo ou nome aproximado
   */
  async searchPersons(query: string): Promise<{ data: BeneficiaryPerson[]; error: string | null }> {
    const cleaned = query.replace(/\D/g, '');
    let q = supabase.from('beneficiary_persons').select('*').limit(20);

    if (cleaned.length >= 3) {
      q = q.or(`cpf.ilike.%${cleaned}%,nome_completo.ilike.%${query.trim()}%`);
    } else {
      q = q.ilike('nome_completo', `%${query.trim()}%`);
    }

    const { data, error } = await q;
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as BeneficiaryPerson[], error: null };
  }

  /**
   * RF05 — Cria uma nova pessoa beneficiária
   */
  async createPerson(
    dto: CreatePersonDTO,
    userId?: string,
  ): Promise<{ data: BeneficiaryPerson | null; error: string | null }> {
    const cpfLimpo = dto.cpf ? dto.cpf.replace(/\D/g, '') : null;

    const { data, error } = await supabase
      .from('beneficiary_persons')
      .insert({
        ...dto,
        cpf: cpfLimpo,
        criado_por: userId ?? null,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as BeneficiaryPerson, error: null };
  }

  /**
   * RF06 — Busca carteirinhas de uma pessoa
   */
  async getEnrollmentsByPerson(personId: string): Promise<{ data: BeneficiaryEnrollment[]; error: string | null }> {
    const { data, error } = await supabase
      .from('beneficiary_enrollments')
      .select('*')
      .eq('person_id', personId)
      .order('data_adesao', { ascending: false, nullsFirst: false });

    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as BeneficiaryEnrollment[], error: null };
  }

  /**
   * RF06/RF07 — Cadastra uma carteirinha/contrato para a pessoa
   */
  async createEnrollment(
    dto: CreateEnrollmentDTO,
    userId?: string,
  ): Promise<{ data: BeneficiaryEnrollment | null; error: string | null }> {
    const cnpjLimpo = dto.estipulante_pj_cnpj ? dto.estipulante_pj_cnpj.replace(/\D/g, '') : null;

    const { data, error } = await supabase
      .from('beneficiary_enrollments')
      .insert({
        ...dto,
        estipulante_pj_cnpj: cnpjLimpo,
        criado_por: userId ?? null,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as BeneficiaryEnrollment, error: null };
  }

  /**
   * RF06 — Deriva regional a partir do município e UF cadastrados
   */
  async resolveRegional(municipio: string, uf: string): Promise<string | null> {
    const { data } = await supabase
      .from('regional_mappings')
      .select('regional_operacional')
      .ilike('municipio', municipio.trim())
      .ilike('uf', uf.trim())
      .eq('ativo', true)
      .maybeSingle();

    return data?.regional_operacional ?? null;
  }

  /**
   * RF05/RF06/RF07 — Vincula beneficiário ao processo gravando fotografia/snapshot
   */
  async linkBeneficiary(
    dto: LinkBeneficiaryDTO,
    userId?: string,
  ): Promise<{ data: ProcessBeneficiary | null; error: string | null }> {
    // Resolver regional automaticamente se snapshot de município/uf foi informado
    let regional = dto.snapshot_regional;
    if (!regional && dto.snapshot_municipio && dto.snapshot_uf) {
      regional = await this.resolveRegional(dto.snapshot_municipio, dto.snapshot_uf);
    }

    const { data, error } = await supabase
      .from('process_beneficiaries')
      .insert({
        ...dto,
        snapshot_regional: regional,
        criado_por: userId ?? null,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as ProcessBeneficiary, error: null };
  }

  /**
   * RF05 — Define o beneficiário como principal do processo
   */
  async setPrincipal(
    processBeneficiaryId: string,
    processId: string,
    userId?: string,
  ): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('process_beneficiaries')
      .update({
        is_principal: true,
        revisado_por: userId ?? null,
        revisado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', processBeneficiaryId)
      .eq('process_id', processId);

    if (error) return { error: error.message };
    return { error: null };
  }

  /**
   * RF05 — Confirma vínculo do beneficiário
   */
  async toggleConfirm(
    processBeneficiaryId: string,
    currentConfirmado: boolean,
    userId?: string,
  ): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('process_beneficiaries')
      .update({
        confirmado: !currentConfirmado,
        revisado_por: userId ?? null,
        revisado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', processBeneficiaryId);

    if (error) return { error: error.message };
    return { error: null };
  }

  /**
   * Desvincula beneficiário do processo
   */
  async unlink(processBeneficiaryId: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('process_beneficiaries')
      .delete()
      .eq('id', processBeneficiaryId);

    if (error) return { error: error.message };
    return { error: null };
  }
}

export const beneficiariesService = new BeneficiariesService();
