export type { UserRole } from './auth';

// ===== E1 — RF01 Segmento =====
export type ProcessSegment = 'ASSISTENCIAL' | 'PRESTADOR' | 'OUTRO' | 'NAO_CLASSIFICADO';
export type SegmentOrigin = 'MANUAL' | 'IA' | 'IA_CONFIRMADA';

// ===== E1 — RF03 Origem =====
export type OriginConfidence = 'COMPROVADA' | 'INFERIDA' | 'MANUAL' | 'PENDENTE';
export type OriginDataType =
  | 'DATA_DECLARADA_EMAIL'
  | 'DATA_RECEBIMENTO_CAIXA'
  | 'DATA_IMPORTACAO'
  | 'DATA_CADASTRO_JURIDICO'
  | 'DATA_MANUAL';

// ===== E1 — RF02 Rés =====
export type DefendantPapel = 'REU' | 'REU_SOLIDARIO' | 'REU_SUBSIDIARIO' | 'NAO_IDENTIFICADA' | 'OUTRA';

export interface ProcessDefendant {
  id: string;
  process_id: string;
  company_id: string | null;
  nome_livre: string | null;
  documento_livre: string | null;
  papel: DefendantPapel;
  evidencia_texto: string | null;
  evidencia_fonte: 'EMAIL' | 'DOCUMENTO' | 'MANUAL' | null;
  confirmado: boolean;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  correcao_anterior: Record<string, unknown> | null;
  correcao_motivo: string | null;
  correcao_em: string | null;
  correcao_por: string | null;
  // Joined
  company?: {
    id: string;
    nome: string;
    cnpj: string | null;
  } | null;
}

// ===== E1 — RF03 Competência de origem =====
export interface ProcessOrigin {
  id: string;
  process_id: string;
  data_origem: string | null; // DATE as ISO string
  competencia_mes: number | null;
  competencia_ano: number | null;
  tipo_data: OriginDataType;
  confiabilidade: OriginConfidence;
  email_referencia_id: string | null;
  manual: boolean;
  justificativa_manual: string | null;
  definido_por: 'SISTEMA' | 'USUARIO' | 'IA';
  definido_por_usuario_id: string | null;
  is_current: boolean;
  substituido_por: string | null;
  created_at: string;
}

// ===== E1 — RF08 Catálogo assistencial =====
export type AssistentialClass = 'EXAME' | 'CIRURGIA' | 'CONSULTA' | 'INTERNACAO' | 'TERAPIA' | 'OUTRO';

export interface AssistentialCatalogItem {
  id: string;
  classe: AssistentialClass;
  detalhe: string;
  detalhe_normalizado: string;
  sinonimos: string[];
  ativo: boolean;
  codigo_estavel: string | null;
  created_at: string;
  updated_at: string;
}

export type ItemReviewState = 'PENDENTE' | 'ACEITA' | 'CORRIGIDA' | 'REJEITADA';
export type ItemSource = 'MANUAL' | 'IA' | 'IA_CONFIRMADA';

export interface ProcessAssistentialItem {
  id: string;
  process_id: string;
  catalog_id: string | null;
  descricao_livre: string | null;
  predominante: boolean;
  fonte: ItemSource;
  evidencia_id: string | null;
  revisao: ItemReviewState;
  revisado_por: string | null;
  revisado_em: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  catalog?: AssistentialCatalogItem | null;
}

// ===== E1 — RF15 Pendências de qualidade =====
export type QualityPendencyMotivo =
  | 'NAO_INFORMADO'
  | 'NAO_APLICAVEL'
  | 'PENDENTE_CONFIRMACAO'
  | 'ERRO_CONSULTA'
  | 'FORMATO_INVALIDO'
  | 'DADO_SUSPEITO';

export type QualityPendencyState =
  | 'ABERTA'
  | 'EM_TRATAMENTO'
  | 'RESOLVIDA'
  | 'IGNORADA'
  | 'CANCELADA';

export interface ProcessQualityPendency {
  id: string;
  process_id: string;
  campo: string;
  motivo: QualityPendencyMotivo;
  descricao: string;
  responsavel_tipo: 'OPERADORA' | 'ESCRITORIO' | 'TI' | 'EXTERNO' | 'NAO_DEFINIDO' | null;
  responsavel_usuario_id: string | null;
  prioridade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
  estado: QualityPendencyState;
  resolucao_descricao: string | null;
  resolvido_por: string | null;
  resolvido_em: string | null;
  origem: 'SISTEMA' | 'USUARIO' | 'IA' | 'VALIDACAO';
  created_at: string;
  updated_at: string;
}

// ===== E1 — RF16 Fila de enriquecimento =====
export type EnrichmentJobType =
  | 'CLASSIFICACAO_SEGMENTO'
  | 'EXTRACAO_REU'
  | 'EXTRACAO_ORIGEM'
  | 'EXTRACAO_BENEFICIARIO'
  | 'EXTRACAO_VALORES'
  | 'EXTRACAO_PRESTADOR'
  | 'EXTRACAO_ALEGACOES'
  | 'VINCULO_DOCUMENTAL';

export type EnrichmentJobState =
  | 'PENDENTE'
  | 'PROCESSANDO'
  | 'CONCLUIDO'
  | 'ERRO'
  | 'QUARENTENA'
  | 'CANCELADO';

export interface EnrichmentJob {
  id: string;
  process_id: string | null;
  email_id: string | null;
  tipo: EnrichmentJobType;
  estado: EnrichmentJobState;
  prioridade: number;
  chave_idempotente: string;
  versao_extrator: string | null;
  tentativas: number;
  max_tentativas: number;
  proximo_em: string;
  locked_at: string | null;
  locked_by: string | null;
  checkpoint: Record<string, unknown>;
  ultimo_erro: string | null;
  ultimo_erro_tipo: 'TRANSITORIO' | 'CONTRATO' | 'AUTORIZACAO' | 'DESCONHECIDO' | null;
  concluido_em: string | null;
  custo_estimado: number | null;
  custo_real: number | null;
  created_at: string;
  updated_at: string;
}

// ===== E1 — RF18 Duplicatas CNJ =====
export type CnjDuplicateState =
  | 'PENDENTE_ANALISE'
  | 'EM_ANALISE'
  | 'ESCLARECIDO'
  | 'CONSOLIDADO';

export interface ProcessCnjDuplicate {
  id: string;
  cnj_normalizado: string;
  process_ids: string[];
  quantidade: number;
  estado: CnjDuplicateState;
  motivo_multiplicidade: string | null;
  processo_canonico_id: string | null;
  analisado_por: string | null;
  analisado_em: string | null;
  created_at: string;
  updated_at: string;
}

export type ProcessStatus =
  | 'NOVA'
  | 'TRIAGEM'
  | 'EM_ANALISE'
  | 'EM_TRATAMENTO'
  | 'AGUARDANDO_TERCEIRO'
  | 'AGUARDANDO_DECISAO'
  | 'CONCLUIDA'
  | 'CANCELADA';

export type ProcessPriority = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';

export interface Company {
  id: string;
  nome: string;
  nome_normalizado: string;
  cnpj: string | null;
  active: boolean;
  inactive_at?: string | null;
  inactive_by?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Process {
  id: string;
  numero_processo: string | null;
  protocolo_externo: string | null;
  origem: string | null;
  natureza: string | null;
  fase_processual: string | null;
  tutela_atual: string | null;
  company_id: string | null;
  municipio: string | null;
  comarca: string | null;
  uf: string | null;
  situacao_beneficiario: string | null;
  valor_causa: number | null;
  tipo_demanda: string | null;
  subtipo_demanda: string | null;
  objeto_demanda: string | null;
  categoria_demanda?: string | null;
  subcategoria_demanda?: string | null;
  natureza_juridica?: string[] | null;
  detalhe_demanda?: string | null;
  classificacao_origem?: 'IA' | 'MANUAL' | 'IA_CONFIRMADA' | string | null;
  classificacao_atualizada_em?: string | null;
  responsavel_id: string | null;
  prioridade: string | null;
  status_atual: ProcessStatus | string;
  recebido_em: string | null;
  aberto_em: string | null;
  concluido_em: string | null;
  ultimo_evento_em: string | null;
  arquivado: boolean;
  arquivado_em: string | null;
  cadastro_incompleto: boolean;
  pendencias: string[] | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;

  // E1 — RF01 Segmento
  segmento?: ProcessSegment | null;
  segmento_origem?: SegmentOrigin | null;
  segmento_atualizado_em?: string | null;

  // E1 — RF18 CNJ normalizado
  cnj_normalizado?: string | null;

  // Gestão gerencial (Fase 5B)
  status_operacional?: OperationalStatus | string;
  responsabilidade_atual?: ResponsibilityType | string;
  responsabilidade_desde?: string | null;
  proxima_acao?: string | null;
  proxima_acao_responsavel_id?: string | null;
  proxima_acao_prazo?: string | null;
  nivel_risco?: RiskLevel | string;
  exposicao_estimada?: number | null;
  resumo_executivo?: string | null;
  nota_executiva?: string | null;
  data_entrada_juridico?: string | null;
  data_entrada_juridico_inferida?: boolean;
  origem_demanda?: string | null;
  origem_demanda_inferida?: boolean;
  law_firm_id?: string | null;
  lawyer_name?: string | null;
  lawyer_email?: string | null;
  motivo_encerramento?: string | null;
  semaforo_operacional?: TrafficLight | string;
  law_firm_nome?: string | null;

  // Joined relationships
  company?: Company | null;
  responsavel?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  proxima_obrigacao?: Obligation | null;
  autores?: ProcessParty[];
  // E1 — rés e itens assistenciais (joined opcionalmente)
  defendants?: ProcessDefendant[];
  assistential_items?: ProcessAssistentialItem[];
  origin?: ProcessOrigin | null;
}

export type ProcessPartyType =
  | 'AUTOR'
  | 'REU'
  | 'REPRESENTANTE'
  | 'TERCEIRO'
  | 'PARTE_IDENTIFICADA'
  | string;

export interface ProcessParty {
  id: string;
  process_id: string;
  nome: string;
  tipo: ProcessPartyType;
  documento: string | null;
  principal: boolean;
  created_at: string;
}

export interface ProcessTimelineEvent {
  id: string;
  process_id: string;
  tipo: string;
  titulo: string;
  descricao: string;
  data_hora: string;
  origem: string;
  usuario_id?: string | null;
  email_id?: string | null;
  documento_id?: string | null;
  automatico: boolean;
  created_at: string;

  // Joined relations
  usuario?: {
    id: string;
    display_name: string | null;
    email: string;
  } | null;
}

export interface ProcessHistoryEntry {
  id: string;
  process_id: string;
  campo: string;
  valor_anterior?: string | null;
  valor_novo?: string | null;
  usuario_id?: string | null;
  origem: string;
  data_hora: string;
  created_at: string;

  // Joined relations
  usuario?: {
    id: string;
    display_name: string | null;
    email: string;
  } | null;
}

export interface Obligation {
  id: string;
  process_id: string;
  descricao: string;
  prazo?: string | null;
  status: string; // 'ABERTA' | 'CUMPRIDA' | 'CANCELADA'
  tipo_prazo?: string | null;
  origem_prazo?: string | null;
  evento_gerador?: string | null;
  criticidade?: string | null; // 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  responsavel_id?: string | null;
  valor_multa_diaria?: number | null;
  valor_multa_limite?: number | null;
  observacoes?: string | null;
  created_at: string;
  created_by?: string | null;
  updated_at: string;
  concluido_em?: string | null;

  // Joined relations
  responsavel?: {
    id: string;
    display_name: string | null;
    email: string;
  } | null;
  criador?: {
    id: string;
    display_name: string | null;
    email: string;
  } | null;
  process?: Process | null;
}

export interface ProcessDocument {
  id: string;
  process_id: string;
  file_name: string;
  storage_path: string;
  file_size?: number;
  mime_type?: string;
  document_type?: string;
  created_at: string;
}







export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  table_name?: string;
  record_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

export interface EmailSenderRule {
  id: string;
  sender_pattern: string;
  action: 'PROCESSAR' | 'IGNORAR' | 'REVISAR';
  priority: number;
  active: boolean;
  created_at: string;
}

export interface EmailKeywordRule {
  id: string;
  keyword: string;
  category: string;
  weight: number;
  active: boolean;
  created_at: string;
}

export interface EmailSyncState {
  id: string;
  last_synced_uid: number;
  last_sync_timestamp: string;
  status: 'IDLE' | 'SYNCING' | 'ERROR';
  error_message?: string;
}

export interface EmailProcessingRun {
  id: string;
  started_at: string;
  completed_at?: string;
  total_emails_read: number;
  emails_processed: number;
  emails_with_ai: number;
  exceptions_count: number;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
}

export interface AiUsageDaily {
  usage_date: string;
  model?: string | null;
  requests_count: number;
  input_tokens: number;
  output_tokens: number;
  quota_exhausted_at?: string | null;
  updated_at?: string | null;
}

export interface SystemConfig {
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}








export interface ProcessedEmail {
  id: string;
  mailbox?: string | null;
  imap_uid?: number | null;
  message_id?: string | null;
  thread_key?: string | null;
  sender_email?: string | null;
  sender_name?: string | null;
  subject?: string | null;
  received_at?: string | null;
  process_id?: string | null;
  matched_process_number?: string | null;
  classification?: string | null;
  relevance_score?: number | null;
  ai_need_score?: number | null;
  ai_model?: string | null;
  ai_confidence?: number | null;
  status: string;
  content_hash?: string | null;
  attachment_count: number;
  analyzed_at?: string | null;
  metadata?: any | null;
  created_at: string;
  updated_at: string;
  
  // Joined relation
  process?: {
    id: string;
    numero_processo: string | null;
    protocolo_externo: string | null;
    status_atual: string | null;
  } | null;
}

export interface EmailException {
  id: string;
  processed_email_id?: string | null;
  exception_type?: string | null;
  reason?: string | null;
  sanitized_payload?: any | null;
  status: string;
  assigned_to?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  created_at: string;
  updated_at: string;
  
  // Joined relations
  email?: ProcessedEmail | null;
  assignee?: { id: string; display_name: string | null } | null;
  resolver?: { id: string; display_name: string | null } | null;
}

export interface ProcessEvidence {
  id: string;
  process_id?: string | null;
  processed_email_id?: string | null;
  document_id?: string | null;
  field_name?: string | null;
  extracted_value?: any | null;
  source_type?: string | null;
  extraction_method?: string | null;
  confidence?: number | null;
  evidence_excerpt?: string | null;
  created_at: string;
}

// ===== FASE 5B: GESTÃO JURÍDICA GERENCIAL =====
export type OperationalStatus =
  | 'NAO_CLASSIFICADO'
  | 'RECEBIDO'
  | 'EM_TRIAGEM'
  | 'AGUARDANDO_AREA_INTERNA'
  | 'AGUARDANDO_ESCRITORIO'
  | 'EM_PREPARACAO_ESCRITORIO'
  | 'RESPONDIDO_PROTOCOLADO'
  | 'AGUARDANDO_DECISAO'
  | 'COM_DECISAO'
  | 'EM_RECURSO'
  | 'EM_CUMPRIMENTO'
  | 'SUSPENSO'
  | 'ENCERRADO';

export type ResponsibilityType = 'OPERADORA' | 'ESCRITORIO' | 'JUDICIARIO' | 'TERCEIRO' | 'SEM_RESPONSAVEL';
export type RiskLevel = 'NAO_CLASSIFICADO' | 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';
export type TrafficLight = 'VERDE' | 'AMARELO' | 'VERMELHO';

export interface LawFirm {
  id: string;
  nome: string;
  cnpj?: string | null;
  email_principal?: string | null;
  telefone?: string | null;
  responsavel_principal?: string | null;
  active: boolean;
  inactive_at?: string | null;
  inactive_by?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessPendency {
  id: string;
  process_id: string;
  type: string;
  description: string;
  responsible_type: ResponsibilityType;
  responsible_user_id?: string | null;
  opened_at: string;
  due_at?: string | null;
  resolved_at?: string | null;
  status: 'ABERTA' | 'EM_TRATAMENTO' | 'RESOLVIDA' | 'CANCELADA' | string;
  criticality: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE' | string;
  source: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LawFirmInteraction {
  id: string;
  process_id: string;
  law_firm_id?: string | null;
  interaction_type: 'ENVIO' | 'RETORNO' | 'COBRANCA' | 'ORIENTACAO' | 'OUTRO' | string;
  sent_at?: string | null;
  expected_return_at?: string | null;
  received_at?: string | null;
  response_to_interaction_id?: string | null;
  subject?: string | null;
  summary?: string | null;
  responsible_user_id?: string | null;
  source_email_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  law_firm?: LawFirm | null;
}

export interface ProcessManagementSnapshot {
  id: string;
  numero_processo?: string | null;
  status_operacional: OperationalStatus | string;
  responsabilidade_atual: ResponsibilityType | string;
  responsabilidade_desde?: string | null;
  dias_com_responsavel_atual?: number | null;
  proxima_acao?: string | null;
  proxima_acao_responsavel_id?: string | null;
  proxima_acao_prazo?: string | null;
  nivel_risco: RiskLevel | string;
  exposicao_estimada?: number | null;
  resumo_executivo?: string | null;
  nota_executiva?: string | null;
  data_entrada_juridico?: string | null;
  data_entrada_juridico_inferida?: boolean;
  origem_demanda?: string | null;
  origem_demanda_inferida?: boolean;
  law_firm_id?: string | null;
  law_firm_nome?: string | null;
  lawyer_name?: string | null;
  lawyer_email?: string | null;
  semaforo_operacional?: TrafficLight | string;
  obrigacao_critica_descricao?: string | null;
  obrigacao_critica_prazo?: string | null;
  pendencia_critica_descricao?: string | null;
  pendencia_critica_prazo?: string | null;
  escritorio_retorno_esperado?: string | null;
  escritorio_dias_atraso?: number | null;
  escritorio_followups_abertos?: number | null;
  escritorio_followup_devido?: boolean;
  proxima_acao_vencida?: boolean;
  proxima_acao_proxima?: boolean;
  operadora_parada?: boolean;
  escritorio_parado?: boolean;
  alert_codes?: string[] | null;
}

// ============================================================================
// E2 — RF09, RF11, RF12, RF13: Valores, Decisões e Prestadores
// ============================================================================

export type DecisionTipo = 'SENTENCA' | 'ACORDAO' | 'DECISAO_INTERLOCUTORIA' | 'TUTELA' | 'OUTRO';

export type DecisionEstadoValor =
  | 'QUANTIFICADA'
  | 'ILIQUIDA'
  | 'NAO_MONETARIA'
  | 'PENDENTE_REVISAO'
  | 'DESCONHECIDA';

export interface ProcessDecision {
  id: string;
  process_id: string;
  tipo: DecisionTipo;
  data_decisao: string | null;
  estado_valor: DecisionEstadoValor;
  montante: number | null;
  moeda: string;
  is_referencia: boolean;
  documento_ref: string | null;
  trecho_citado: string | null;
  motivo_escolha: string | null;
  substituida_por_id: string | null;
  versao: number;
  is_current: boolean;
  criado_em: string;
  atualizado_em: string;
  criado_por: string | null;
  revisado_por: string | null;
  revisado_em: string | null;
}

export type ProviderCategoria =
  | 'HOSPITAL'
  | 'CLINICA'
  | 'OPME'
  | 'MEDICO_PJ'
  | 'MANUTENCAO'
  | 'OUTRO';

export type ProviderPapelProcessual =
  | 'AUTOR'
  | 'CITADO_LOCAL'
  | 'LITISCONSORTE'
  | 'TERCEIRO'
  | 'OUTRO';

export interface ProcessServiceProvider {
  id: string;
  process_id: string;
  party_id: string | null;
  nome_razao_social: string;
  tipo_pessoa: 'PJ' | 'PF';
  documento: string | null;
  categoria: ProviderCategoria;
  natureza_vinculo: string;
  vinculo_confirmado: boolean;
  papel_processual: ProviderPapelProcessual;
  origem_evidencia: string | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
  criado_por: string | null;
  revisado_por: string | null;
  revisado_em: string | null;
}

export type PrecisaoData = 'EXATA' | 'MENSAL' | 'INTERVALO_ABERTO' | 'DESCONHECIDA';

export interface ProviderService {
  id: string;
  process_id: string;
  provider_id: string;
  tipo_servico: string;
  descricao: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  precisao_data: PrecisaoData;
  competencia_entrada: string | null;
  vencimento_fatura: string | null;
  fonte: string | null;
  criado_em: string;
  atualizado_em: string;
  criado_por: string | null;
}

export type FinancialFase = 'PEDIDO' | 'SENTENCA' | 'ACORDO' | 'OUTRO';

export type FinancialNatureza =
  | 'DIVIDA_SERVICO'
  | 'DANO_MATERIAL'
  | 'DANO_MORAL'
  | 'OUTRO_IDENTIFICADO'
  | 'MULTA_ASTREINTES'
  | 'HONORARIOS';

export type FinancialStatusRevisao = 'PENDENTE' | 'CONFIRMADO' | 'DIVERGENTE' | 'REJEITADO';

export interface ProcessFinancialComponent {
  id: string;
  process_id: string;
  provider_id: string | null;
  service_id: string | null;
  decision_id: string | null;
  fase: FinancialFase;
  natureza: FinancialNatureza;
  valor: number;
  moeda: string;
  cumulativo: boolean;
  sobreposto: boolean;
  status_revisao: FinancialStatusRevisao;
  fonte: string | null;
  descricao: string | null;
  criado_em: string;
  atualizado_em: string;
  criado_por: string | null;
  revisado_por: string | null;
  revisado_em: string | null;
}

export interface ProcessFinancialHighlight {
  process_id: string;
  numero_processo: string | null;
  valor_causa: number | null;
  exposicao_estimada: number | null;
  total_pedidos_discriminados: number | null;
  valor_pedido_conhecido: number | null;
  sentenca_referencia_id: string | null;
  sentenca_tipo: DecisionTipo | null;
  sentenca_data: string | null;
  sentenca_estado_valor: DecisionEstadoValor | null;
  sentenca_montante: number | null;
  destaque_estado:
    | 'SENTENCA_QUANTIFICADA'
    | 'PEDIDO_SEM_SENTENCA'
    | 'SENTENCA_ILIQUIDA'
    | 'SENTENCA_NAO_MONETARIA'
    | 'REVISAO_PENDENTE'
    | 'SEM_REGISTRO';
  destaque_rotulo: string;
  destaque_valor: number | null;
}

export interface ProviderDebtSummary {
  provider_id: string;
  process_id: string;
  nome_razao_social: string;
  categoria: ProviderCategoria;
  natureza_vinculo: string;
  vinculo_confirmado: boolean;
  qtd_servicos: number;
  total_divida_servico: number;
  total_dano_material: number;
  total_dano_moral: number;
  total_cumulativo: number;
  tem_sobreposicao: boolean;
  tem_revisao_pendente: boolean;
}

// ============================================================================
// E3 — RF05, RF06, RF07: Beneficiários, Planos e Localização
// ============================================================================

export interface BeneficiaryPerson {
  id: string;
  nome_completo: string;
  cpf: string | null;
  data_nascimento: string | null;
  nome_mae: string | null;
  cns: string | null;
  municipio: string | null;
  uf: string | null;
  codigo_municipio_ibge: string | null;
  criado_em: string;
  atualizado_em: string;
  criado_por: string | null;
}

export type EnrollmentStatus = 'ATIVO' | 'CANCELADO' | 'SUSPENSO' | 'DESCONHECIDO';

export type TipoContratacao =
  | 'COLETIVO_EMPRESARIAL'
  | 'COLETIVO_ADESAO'
  | 'INDIVIDUAL_FAMILIAR'
  | 'OUTRO'
  | 'NAO_INFORMADO';

export interface BeneficiaryEnrollment {
  id: string;
  person_id: string;
  numero_carteirinha: string;
  plano_codigo: string | null;
  plano_nome: string | null;
  status_inscricao: EnrollmentStatus;
  tipo_contratacao: TipoContratacao;
  contrato_codigo: string | null;
  estipulante_pj_nome: string | null;
  estipulante_pj_cnpj: string | null;
  data_adesao: string | null;
  data_cancelamento: string | null;
  abrangencia: string | null;
  acomodacao: string | null;
  segmentacao_assistencial: string | null;
  criado_em: string;
  atualizado_em: string;
  criado_por: string | null;
}

export interface RegionalMapping {
  id: string;
  municipio: string;
  uf: string;
  codigo_ibge: string | null;
  regional_operacional: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export type BeneficiaryPapel =
  | 'TITULAR'
  | 'DEPENDENTE'
  | 'REPRESENTANTE_LEGAL'
  | 'FALECIDO'
  | 'OUTRO';

export interface ProcessBeneficiary {
  id: string;
  process_id: string;
  person_id: string;
  enrollment_id: string | null;
  papel: BeneficiaryPapel;
  is_principal: boolean;
  representa_person_id: string | null;
  snapshot_municipio: string | null;
  snapshot_uf: string | null;
  snapshot_regional: string | null;
  snapshot_idade_na_data: number | null;
  snapshot_data_referencia: string | null;
  fonte_consulta: string | null;
  confirmado: boolean;
  criado_em: string;
  atualizado_em: string;
  criado_por: string | null;
  revisado_por: string | null;
  revisado_em: string | null;
}

export interface ProcessBeneficiarySummary {
  process_beneficiary_id: string;
  process_id: string;
  papel: BeneficiaryPapel;
  is_principal: boolean;
  confirmado: boolean;
  snapshot_municipio: string | null;
  snapshot_uf: string | null;
  snapshot_regional: string | null;
  snapshot_idade_na_data: number | null;
  snapshot_data_referencia: string | null;
  fonte_consulta: string | null;
  person_id: string;
  nome_completo: string;
  cpf: string | null;
  data_nascimento: string | null;
  cns: string | null;
  enrollment_id: string | null;
  numero_carteirinha: string | null;
  plano_nome: string | null;
  tipo_contratacao: TipoContratacao | null;
  status_inscricao: EnrollmentStatus | null;
  estipulante_pj_nome: string | null;
  estipulante_pj_cnpj: string | null;
}
