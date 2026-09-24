export type { UserRole } from './auth';

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
