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

export interface AssistencialBeneficiary {
  id: string;
  nome: string;
  cpf: string | null;
  cpf_normalizado?: string | null;
  carteirinha: string | null;
  data_nascimento: string | null;
  empresa: string | null;
  municipio: string | null;
  uf: string | null;
  status: string | null;
  data_inclusao: string | null;
  genero: string | null;
}

export interface UnifiedBeneficiarySearchResult {
  id: string;
  person_id?: string;
  nome_completo: string;
  cpf: string | null;
  data_nascimento: string | null;
  municipio: string | null;
  uf: string | null;
  origem: 'LOCAL' | 'ASSISTENCIAL';
  carteirinha?: string | null;
  empresa?: string | null;
  status_plano?: string | null;
  rawAssistencial?: AssistencialBeneficiary;
  rawLocal?: BeneficiaryPerson;
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
   * RF05 — Busca pessoas por CPF limpo ou nome aproximado na base local
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
   * Busca beneficiários no sistema Gestão Assistencial (192.168.91.103 / gestaoassistencial.sbsaude.com.br)
   */
  async searchAssistencial(query: string): Promise<{ data: AssistencialBeneficiary[]; error: string | null }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const response = await fetch(`/api/assistencial/beneficiaries/search?q=${encodeURIComponent(query.trim())}`, {
        headers,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { data: [], error: json?.error || `HTTP ${response.status}` };
      }
      return { data: Array.isArray(json?.data) ? json.data : [], error: null };
    } catch (err: any) {
      return { data: [], error: err?.message || 'Falha ao buscar no Gestão Assistencial' };
    }
  }

  /**
   * Busca unificada: base local do Jurídico + sistema de Gestão Assistencial
   */
  async searchUnified(query: string): Promise<{ data: UnifiedBeneficiarySearchResult[]; error: string | null }> {
    if (!query.trim()) return { data: [], error: null };

    const [localRes, assistRes] = await Promise.allSettled([
      this.searchPersons(query),
      this.searchAssistencial(query),
    ]);

    const localList: BeneficiaryPerson[] =
      localRes.status === 'fulfilled' && !localRes.value.error ? localRes.value.data : [];
    const assistList: AssistencialBeneficiary[] =
      assistRes.status === 'fulfilled' && !assistRes.value.error ? assistRes.value.data : [];

    const unified: UnifiedBeneficiarySearchResult[] = [];
    const localCpfMap = new Map<string, BeneficiaryPerson>();

    for (const p of localList) {
      const clean = p.cpf ? p.cpf.replace(/\D/g, '') : null;
      if (clean) localCpfMap.set(clean, p);
      unified.push({
        id: p.id,
        person_id: p.id,
        nome_completo: p.nome_completo,
        cpf: p.cpf,
        data_nascimento: p.data_nascimento,
        municipio: p.municipio,
        uf: p.uf,
        origem: 'LOCAL',
        rawLocal: p,
      });
    }

    for (const a of assistList) {
      const clean = a.cpf ? a.cpf.replace(/\D/g, '') : (a.cpf_normalizado || null);
      const existingLocal = clean ? localCpfMap.get(clean) : null;

      if (existingLocal) {
        const found = unified.find(u => u.person_id === existingLocal.id);
        if (found) {
          if (!found.carteirinha && a.carteirinha) found.carteirinha = a.carteirinha;
          if (!found.empresa && a.empresa) found.empresa = a.empresa;
          if (!found.status_plano && a.status) found.status_plano = a.status;
          found.rawAssistencial = a;
        }
      } else {
        unified.push({
          id: a.id,
          nome_completo: a.nome,
          cpf: a.cpf || a.cpf_normalizado || null,
          data_nascimento: a.data_nascimento,
          municipio: a.municipio,
          uf: a.uf,
          origem: 'ASSISTENCIAL',
          carteirinha: a.carteirinha,
          empresa: a.empresa,
          status_plano: a.status,
          rawAssistencial: a,
        });
      }
    }

    return { data: unified, error: null };
  }

  /**
   * Importa e sincroniza dados do Gestão Assistencial para a base do Jurídico
   */
  async importFromAssistencial(
    item: AssistencialBeneficiary,
    userId?: string
  ): Promise<{ person: BeneficiaryPerson | null; enrollment: BeneficiaryEnrollment | null; error: string | null }> {
    const cleanCpf = item.cpf ? item.cpf.replace(/\D/g, '') : (item.cpf_normalizado || null);
    let person: BeneficiaryPerson | null = null;

    if (cleanCpf) {
      const { data } = await supabase
        .from('beneficiary_persons')
        .select('*')
        .eq('cpf', cleanCpf)
        .maybeSingle();
      if (data) person = data as BeneficiaryPerson;
    }

    if (!person) {
      const createRes = await this.createPerson(
        {
          nome_completo: item.nome,
          cpf: cleanCpf,
          data_nascimento: item.data_nascimento || null,
          municipio: item.municipio || null,
          uf: item.uf ? item.uf.trim().substring(0, 2).toUpperCase() : null,
        },
        userId
      );
      if (createRes.error || !createRes.data) {
        return { person: null, enrollment: null, error: createRes.error || 'Erro ao importar pessoa' };
      }
      person = createRes.data;
    }

    let enrollment: BeneficiaryEnrollment | null = null;
    if (item.carteirinha && person) {
      const { data: existingEnrollment } = await supabase
        .from('beneficiary_enrollments')
        .select('*')
        .eq('person_id', person.id)
        .eq('numero_carteirinha', item.carteirinha.trim())
        .maybeSingle();

      if (existingEnrollment) {
        enrollment = existingEnrollment as BeneficiaryEnrollment;
      } else {
        const isAtivo = (item.status || '').toUpperCase() === 'ATIVO';
        const createEnrollRes = await this.createEnrollment(
          {
            person_id: person.id,
            numero_carteirinha: item.carteirinha.trim(),
            estipulante_pj_nome: item.empresa || null,
            status_inscricao: isAtivo ? 'ATIVO' : 'CANCELADO',
            tipo_contratacao: 'COLETIVO_EMPRESARIAL',
            data_adesao: item.data_inclusao || null,
          },
          userId
        );
        if (createEnrollRes.data) {
          enrollment = createEnrollRes.data;
        }
      }
    }

    return { person, enrollment, error: null };
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
