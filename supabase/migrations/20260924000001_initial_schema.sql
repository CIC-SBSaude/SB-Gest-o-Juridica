-- ============================================================================
-- SB GESTÃO JURÍDICA - MIGRAÇÃO INICIAL DE ESTRUTURA
-- Gerada a partir do cluster de backup e adaptada para conformidade e segurança.
-- ============================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- 2. TIPOS E ENUMS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.app_role AS ENUM ('ADMIN', 'GESTOR', 'ANALISTA', 'CONSULTA');
  END IF;
END $$;

-- 2.1 SEQUÊNCIAS
CREATE SEQUENCE IF NOT EXISTS public.demand_classification_catalog_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- 3. FUNÇÕES BÁSICAS AUXILIARES
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_company_alias(p_value text) RETURNS text
    LANGUAGE sql
    SET search_path TO 'public' IMMUTABLE
    AS $$
  select btrim(
    regexp_replace(
      upper(
        translate(
          coalesce(p_value, ''),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
          'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'
        )
      ),
      '[^A-Z0-9]+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_company_fields() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.nome := trim(regexp_replace(NEW.nome, '\s+', ' ', 'g'));
  NEW.nome_normalizado := lower(NEW.nome);

  IF NEW.cnpj IS NOT NULL THEN
    NEW.cnpj := regexp_replace(NEW.cnpj, '\D', '', 'g');
    IF NEW.cnpj = '' THEN
      NEW.cnpj := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_aliases_normalize_before_write() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.alias := btrim(new.alias);
  new.alias_normalizado := public.normalize_company_alias(new.alias);
  new.updated_at := now();

  if length(new.alias_normalizado) < 3 then
    raise exception 'Alias inválido após normalização.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

-- 4. TABELAS DO APLICATIVO
CREATE TABLE public.user_profiles (
    id uuid NOT NULL,
    email public.citext NOT NULL,
    display_name text,
    role public.app_role DEFAULT 'CONSULTA'::public.app_role NOT NULL,
    active boolean DEFAULT false NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    username public.citext UNIQUE,
    must_change_password boolean DEFAULT false NOT NULL
);

CREATE TABLE public.ai_model_health (
    model text NOT NULL,
    circuit_open_until timestamp with time zone,
    last_error_code text,
    last_error_message text,
    last_failure_at timestamp with time zone,
    last_success_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_usage_daily (
    usage_date date NOT NULL,
    model text NOT NULL,
    requests_count integer DEFAULT 0 NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    quota_exhausted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_usage_daily_input_tokens_check CHECK ((input_tokens >= 0)),
    CONSTRAINT ai_usage_daily_output_tokens_check CHECK ((output_tokens >= 0)),
    CONSTRAINT ai_usage_daily_requests_count_check CHECK ((requests_count >= 0))
);

CREATE TABLE public.ai_usage_minute (
    minute_bucket timestamp with time zone NOT NULL,
    model text NOT NULL,
    requests_count integer DEFAULT 0 NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.automation_locks (
    lock_name text NOT NULL,
    locked_until timestamp with time zone,
    owner_token text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    nome_normalizado text DEFAULT ''::text NOT NULL,
    cnpj text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT companies_cnpj_format_chk CHECK (((cnpj IS NULL) OR (cnpj ~ '^[0-9]{14}$'::text)))
);

CREATE TABLE public.demand_classification_catalog (
    id bigint NOT NULL,
    category_code text NOT NULL,
    category_label text NOT NULL,
    subcategory_code text NOT NULL,
    subcategory_label text NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_keyword_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pattern text NOT NULL,
    match_scope text DEFAULT 'ANY'::text NOT NULL,
    weight smallint NOT NULL,
    category text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_keyword_rules_weight_check CHECK (((weight >= '-100'::integer) AND (weight <= 100))),
    CONSTRAINT email_keyword_scope_chk CHECK ((match_scope = ANY (ARRAY['SUBJECT'::text, 'BODY'::text, 'ATTACHMENT'::text, 'ANY'::text])))
);

CREATE TABLE public.email_processing_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mailbox text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    fetched_count integer DEFAULT 0 NOT NULL,
    duplicate_count integer DEFAULT 0 NOT NULL,
    ignored_count integer DEFAULT 0 NOT NULL,
    candidate_count integer DEFAULT 0 NOT NULL,
    ai_count integer DEFAULT 0 NOT NULL,
    linked_count integer DEFAULT 0 NOT NULL,
    exception_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'RUNNING'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.email_sender_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pattern public.citext NOT NULL,
    pattern_type text DEFAULT 'EMAIL'::text NOT NULL,
    rule_type text NOT NULL,
    weight smallint NOT NULL,
    label text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_sender_pattern_type_chk CHECK ((pattern_type = ANY (ARRAY['EMAIL'::text, 'DOMAIN'::text]))),
    CONSTRAINT email_sender_rule_type_chk CHECK ((rule_type = ANY (ARRAY['POSITIVA'::text, 'NEGATIVA'::text]))),
    CONSTRAINT email_sender_rules_weight_check CHECK (((weight >= '-100'::integer) AND (weight <= 100)))
);

CREATE TABLE public.email_sync_state (
    mailbox text NOT NULL,
    last_imap_uid bigint,
    last_sync_at timestamp with time zone,
    paused_reason text,
    paused_until timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.legal_nature_catalog (
    code text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.access_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    role public.app_role NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    claimed_by uuid,
    claimed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_account_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    host text NOT NULL,
    port integer DEFAULT 993 NOT NULL,
    secure boolean DEFAULT true NOT NULL,
    mailbox text DEFAULT 'INBOX'::text NOT NULL,
    encrypted_password text NOT NULL,
    active boolean DEFAULT false NOT NULL,
    sync_interval_minutes integer DEFAULT 5 NOT NULL,
    sync_batch_size integer DEFAULT 100 NOT NULL,
    sync_since_days integer DEFAULT 3650 NOT NULL,
    last_connection_at timestamp with time zone,
    last_connection_status text,
    last_error text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_account_config_last_connection_status_check CHECK (((last_connection_status IS NULL) OR (last_connection_status = ANY (ARRAY['SUCCESS'::text, 'FAILED'::text])))),
    CONSTRAINT email_account_config_port_check CHECK (((port >= 1) AND (port <= 65535))),
    CONSTRAINT email_account_config_sync_batch_size_check CHECK (((sync_batch_size >= 1) AND (sync_batch_size <= 500))),
    CONSTRAINT email_account_config_sync_interval_minutes_check CHECK (((sync_interval_minutes >= 1) AND (sync_interval_minutes <= 1440))),
    CONSTRAINT email_account_config_sync_since_days_check CHECK (((sync_since_days >= 1) AND (sync_since_days <= 36500)))
);

CREATE TABLE public.law_firms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    cnpj text,
    email_principal public.citext,
    telefone text,
    responsavel_principal text,
    active boolean DEFAULT true NOT NULL,
    inactive_at timestamp with time zone,
    inactive_by uuid,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT law_firms_nome_check CHECK ((length(TRIM(BOTH FROM nome)) >= 2))
);

CREATE TABLE public.operational_rules_config (
    id smallint DEFAULT 1 NOT NULL,
    deadline_warning_days integer DEFAULT 5 NOT NULL,
    pendency_warning_days integer DEFAULT 3 NOT NULL,
    next_action_warning_days integer DEFAULT 2 NOT NULL,
    law_firm_default_sla_days integer DEFAULT 3 NOT NULL,
    law_firm_warning_days integer DEFAULT 1 NOT NULL,
    law_firm_followup_grace_days integer DEFAULT 1 NOT NULL,
    operator_stale_days integer DEFAULT 3 NOT NULL,
    law_firm_stale_days integer DEFAULT 3 NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operational_rules_nonnegative CHECK (((deadline_warning_days >= 0) AND (pendency_warning_days >= 0) AND (next_action_warning_days >= 0) AND (law_firm_default_sla_days >= 1) AND (law_firm_warning_days >= 0) AND (law_firm_followup_grace_days >= 0) AND (operator_stale_days >= 1) AND (law_firm_stale_days >= 1))),
    CONSTRAINT operational_rules_singleton CHECK ((id = 1))
);

CREATE TABLE public.system_config (
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);

CREATE TABLE public.user_access_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    actor_user_id uuid,
    target_user_id uuid,
    target_email public.citext NOT NULL,
    old_role public.app_role,
    new_role public.app_role,
    old_active boolean,
    new_active boolean,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_access_audit_action_check CHECK ((action = ANY (ARRAY['INVITE_CREATED'::text, 'INVITE_REISSUED'::text, 'INVITE_REVOKED'::text, 'INVITE_CLAIMED'::text, 'ROLE_CHANGED'::text, 'USER_DEACTIVATED'::text, 'USER_REACTIVATED'::text])))
);

CREATE TABLE public.company_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    alias text NOT NULL,
    alias_normalizado text NOT NULL,
    alias_type text DEFAULT 'NOME_ALTERNATIVO'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_aliases_alias_not_blank CHECK ((length(btrim(alias)) >= 3)),
    CONSTRAINT company_aliases_normalized_not_blank CHECK ((length(btrim(alias_normalizado)) >= 3))
);

CREATE TABLE public.processes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero_processo text,
    protocolo_externo text,
    origem text,
    natureza text,
    fase_processual text,
    tutela_atual text,
    company_id uuid,
    municipio text,
    comarca text,
    uf text,
    situacao_beneficiario text,
    valor_causa numeric(14,2),
    tipo_demanda text,
    subtipo_demanda text,
    objeto_demanda text,
    responsavel_id uuid,
    prioridade text,
    status_atual text DEFAULT 'NOVA'::text NOT NULL,
    recebido_em timestamp with time zone,
    aberto_em timestamp with time zone,
    concluido_em timestamp with time zone,
    ultimo_evento_em timestamp with time zone,
    arquivado boolean DEFAULT false NOT NULL,
    arquivado_em timestamp with time zone,
    cadastro_incompleto boolean DEFAULT false NOT NULL,
    pendencias text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    status_operacional text DEFAULT 'RECEBIDO'::text NOT NULL,
    responsabilidade_atual text DEFAULT 'SEM_RESPONSAVEL'::text NOT NULL,
    responsabilidade_desde timestamp with time zone,
    proxima_acao text,
    proxima_acao_responsavel_id uuid,
    proxima_acao_prazo timestamp with time zone,
    nivel_risco text DEFAULT 'NAO_CLASSIFICADO'::text NOT NULL,
    exposicao_estimada numeric(16,2),
    resumo_executivo text,
    nota_executiva text,
    data_entrada_juridico timestamp with time zone,
    data_entrada_juridico_inferida boolean DEFAULT false NOT NULL,
    origem_demanda text,
    origem_demanda_inferida boolean DEFAULT false NOT NULL,
    law_firm_id uuid,
    lawyer_name text,
    lawyer_email public.citext,
    motivo_encerramento text,
    categoria_demanda text,
    subcategoria_demanda text,
    natureza_juridica text[],
    detalhe_demanda text,
    classificacao_origem text,
    classificacao_atualizada_em timestamp with time zone,
    CONSTRAINT processes_classificacao_origem_check CHECK (((classificacao_origem IS NULL) OR (classificacao_origem = ANY (ARRAY['IA'::text, 'MANUAL'::text, 'IA_CONFIRMADA'::text])))),
    CONSTRAINT processes_nivel_risco_check CHECK ((nivel_risco = ANY (ARRAY['NAO_CLASSIFICADO'::text, 'BAIXO'::text, 'MEDIO'::text, 'ALTO'::text, 'CRITICO'::text]))),
    CONSTRAINT processes_responsabilidade_atual_check CHECK ((responsabilidade_atual = ANY (ARRAY['OPERADORA'::text, 'ESCRITORIO'::text, 'JUDICIARIO'::text, 'TERCEIRO'::text, 'SEM_RESPONSAVEL'::text]))),
    CONSTRAINT processes_status_chk CHECK ((status_atual = ANY (ARRAY['NOVA'::text, 'TRIAGEM'::text, 'EM_ANALISE'::text, 'AGUARDANDO_JURIDICO'::text, 'EM_TRATAMENTO'::text, 'AGUARDANDO_TERCEIRO'::text, 'AGUARDANDO_DECISAO'::text, 'CONCLUIDA'::text, 'CANCELADA'::text]))),
    CONSTRAINT processes_status_operacional_check CHECK ((status_operacional = ANY (ARRAY['NAO_CLASSIFICADO'::text, 'RECEBIDO'::text, 'EM_TRIAGEM'::text, 'AGUARDANDO_AREA_INTERNA'::text, 'AGUARDANDO_ESCRITORIO'::text, 'EM_PREPARACAO_ESCRITORIO'::text, 'RESPONDIDO_PROTOCOLADO'::text, 'AGUARDANDO_DECISAO'::text, 'COM_DECISAO'::text, 'EM_RECURSO'::text, 'EM_CUMPRIMENTO'::text, 'SUSPENSO'::text, 'ENCERRADO'::text]))),
    CONSTRAINT processes_uf_chk CHECK (((uf IS NULL) OR (uf ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT processes_valor_causa_check CHECK (((valor_causa IS NULL) OR (valor_causa >= (0)::numeric)))
);

CREATE TABLE public.ai_demand_classification_backfill_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    requested_by uuid,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    retry_after timestamp with time zone,
    last_error text,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_demand_classification_backfill_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'DONE'::text, 'ERROR'::text])))
);

CREATE TABLE public.ai_management_refresh_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    trigger_reason text,
    source_processed_email_id uuid,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    not_before timestamp with time zone DEFAULT (now() + '00:02:00'::interval) NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    locked_at timestamp with time zone,
    locked_by text,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_management_refresh_queue_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT ai_management_refresh_queue_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'DONE'::text, 'ERROR'::text])))
);

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    process_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.company_resolution_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    company_id uuid,
    resolution_method text NOT NULL,
    confidence numeric(5,4) DEFAULT 0 NOT NULL,
    source_value text,
    actor_id uuid,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_resolution_audit_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT company_resolution_audit_resolution_method_check CHECK ((resolution_method = ANY (ARRAY['CNPJ_EXATO'::text, 'NOME_EXATO'::text, 'ALIAS_EXATO'::text, 'CNPJ_AUTO_CADASTRO'::text, 'AGUARDANDO_CONFIRMACAO'::text, 'CONFIRMADO_HUMANO'::text, 'NAO_RESOLVIDO'::text, 'AMBIGUO'::text])))
);

CREATE TABLE public.company_resolution_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    status text DEFAULT 'PENDENTE'::text NOT NULL,
    suggested_name text,
    suggested_name_normalized text,
    suggested_cnpj text,
    confidence numeric(5,4) DEFAULT 0 NOT NULL,
    candidate_names jsonb DEFAULT '[]'::jsonb NOT NULL,
    candidate_cnpjs jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    resolved_company_id uuid,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_resolution_candidates_cnpj_format CHECK (((suggested_cnpj IS NULL) OR (suggested_cnpj ~ '^[0-9]{14}$'::text))),
    CONSTRAINT company_resolution_candidates_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT company_resolution_candidates_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'CONFIRMADO'::text, 'REJEITADO'::text])))
);

CREATE TABLE public.obligations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    descricao text NOT NULL,
    prazo timestamp with time zone,
    status text DEFAULT 'ABERTA'::text NOT NULL,
    tipo_prazo text,
    origem_prazo text,
    evento_gerador text,
    criticidade text,
    responsavel_id uuid,
    valor_multa_diaria numeric(14,2),
    observacoes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    concluido_em timestamp with time zone,
    valor_multa_limite numeric,
    CONSTRAINT obligations_status_chk CHECK ((status = ANY (ARRAY['ABERTA'::text, 'CONCLUIDA'::text, 'CANCELADA'::text, 'SUSPENSA'::text]))),
    CONSTRAINT obligations_valor_multa_diaria_check CHECK (((valor_multa_diaria IS NULL) OR (valor_multa_diaria >= (0)::numeric))),
    CONSTRAINT obligations_valor_multa_limite_check CHECK (((valor_multa_limite IS NULL) OR (valor_multa_limite >= (0)::numeric)))
);

CREATE TABLE public.process_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    original_name text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    size_bytes bigint,
    sha256 text,
    source text,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT process_documents_size_bytes_check CHECK (((size_bytes IS NULL) OR (size_bytes >= 0)))
);

CREATE TABLE public.process_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    campo text NOT NULL,
    valor_anterior text,
    valor_novo text,
    usuario_id uuid,
    origem text NOT NULL,
    data_hora timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.process_operational_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text,
    reason text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'HUMANO'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.process_parties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    nome text NOT NULL,
    tipo text NOT NULL,
    documento text,
    principal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.process_pendencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    type text DEFAULT 'OUTRA'::text NOT NULL,
    description text NOT NULL,
    responsible_type text DEFAULT 'OPERADORA'::text NOT NULL,
    responsible_user_id uuid,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    due_at timestamp with time zone,
    resolved_at timestamp with time zone,
    status text DEFAULT 'ABERTA'::text NOT NULL,
    criticality text DEFAULT 'MEDIA'::text NOT NULL,
    source text DEFAULT 'HUMANO'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT process_pendencies_criticality_check CHECK ((criticality = ANY (ARRAY['BAIXA'::text, 'MEDIA'::text, 'ALTA'::text, 'URGENTE'::text]))),
    CONSTRAINT process_pendencies_description_check CHECK ((length(TRIM(BOTH FROM description)) >= 3)),
    CONSTRAINT process_pendencies_responsible_type_check CHECK ((responsible_type = ANY (ARRAY['OPERADORA'::text, 'ESCRITORIO'::text, 'JUDICIARIO'::text, 'TERCEIRO'::text, 'SEM_RESPONSAVEL'::text]))),
    CONSTRAINT process_pendencies_status_check CHECK ((status = ANY (ARRAY['ABERTA'::text, 'EM_TRATAMENTO'::text, 'RESOLVIDA'::text, 'CANCELADA'::text])))
);

CREATE TABLE public.process_responsibility_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    previous_responsibility text,
    new_responsibility text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    changed_by uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.processed_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mailbox text DEFAULT 'INBOX'::text NOT NULL,
    imap_uid bigint,
    message_id text NOT NULL,
    thread_key text,
    sender_email public.citext,
    sender_name text,
    subject text,
    received_at timestamp with time zone,
    process_id uuid,
    matched_process_number text,
    classification text,
    relevance_score smallint,
    ai_need_score smallint,
    ai_model text,
    ai_confidence numeric(5,4),
    status text DEFAULT 'RECEBIDO'::text NOT NULL,
    content_hash text,
    attachment_count integer DEFAULT 0 NOT NULL,
    analyzed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT processed_emails_ai_confidence_check CHECK (((ai_confidence IS NULL) OR ((ai_confidence >= (0)::numeric) AND (ai_confidence <= (1)::numeric)))),
    CONSTRAINT processed_emails_ai_need_score_check CHECK (((ai_need_score IS NULL) OR ((ai_need_score >= 0) AND (ai_need_score <= 100)))),
    CONSTRAINT processed_emails_attachment_count_check CHECK ((attachment_count >= 0)),
    CONSTRAINT processed_emails_relevance_score_check CHECK (((relevance_score IS NULL) OR ((relevance_score >= 0) AND (relevance_score <= 100))))
);

CREATE TABLE public.ai_management_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid,
    model text NOT NULL,
    prompt_version text DEFAULT '5F-MGMT-V1'::text NOT NULL,
    suggestions jsonb NOT NULL,
    context_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'ATIVA'::text NOT NULL,
    applied_fields text[] DEFAULT '{}'::text[] NOT NULL,
    generated_by uuid,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_by uuid,
    applied_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    generation_source text DEFAULT 'MANUAL'::text NOT NULL,
    queue_id uuid,
    queue_requested_at timestamp with time zone,
    CONSTRAINT ai_management_suggestions_payload_object CHECK ((jsonb_typeof(suggestions) = 'object'::text)),
    CONSTRAINT ai_management_suggestions_status_check CHECK ((status = ANY (ARRAY['ATIVA'::text, 'APLICADA_PARCIAL'::text, 'APLICADA_TOTAL'::text, 'EXPIRADA'::text, 'DESCARTADA'::text]))),
    CONSTRAINT ck_ai_management_suggestions_generation_source CHECK ((generation_source = ANY (ARRAY['MANUAL'::text, 'AUTO'::text])))
);

CREATE TABLE public.email_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    processed_email_id uuid NOT NULL,
    exception_type text NOT NULL,
    reason text NOT NULL,
    sanitized_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'ABERTA'::text NOT NULL,
    assigned_to uuid,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    resolution_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_exceptions_status_chk CHECK ((status = ANY (ARRAY['ABERTA'::text, 'EM_ANALISE'::text, 'RESOLVIDA'::text, 'DESCARTADA'::text])))
);

CREATE TABLE public.process_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    processed_email_id uuid,
    document_id uuid,
    field_name text,
    extracted_value jsonb,
    source_type text NOT NULL,
    extraction_method text NOT NULL,
    confidence numeric(5,4),
    evidence_excerpt text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT process_evidence_confidence_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
    CONSTRAINT process_evidence_method_chk CHECK ((extraction_method = ANY (ARRAY['REGEX'::text, 'PARSER'::text, 'OCR'::text, 'GEMINI'::text, 'MANUAL'::text, 'SYSTEM'::text]))),
    CONSTRAINT process_evidence_source_type_chk CHECK ((source_type = ANY (ARRAY['EMAIL'::text, 'DOCUMENT'::text, 'MANUAL'::text, 'SYSTEM'::text])))
);

CREATE TABLE public.process_law_firm_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    law_firm_id uuid,
    interaction_type text NOT NULL,
    sent_at timestamp with time zone,
    expected_return_at timestamp with time zone,
    received_at timestamp with time zone,
    response_to_interaction_id uuid,
    subject text,
    summary text,
    responsible_user_id uuid,
    source_email_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT process_law_firm_interactions_type_check CHECK ((interaction_type = ANY (ARRAY['ENVIO'::text, 'RETORNO'::text, 'COBRANCA'::text, 'ORIENTACAO'::text, 'OUTRO'::text])))
);

CREATE TABLE public.process_timeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    descricao text NOT NULL,
    data_hora timestamp with time zone DEFAULT now() NOT NULL,
    origem text NOT NULL,
    usuario_id uuid,
    email_id uuid,
    documento_id uuid,
    automatico boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER SEQUENCE public.demand_classification_catalog_id_seq OWNED BY public.demand_classification_catalog.id;
ALTER TABLE ONLY public.demand_classification_catalog ALTER COLUMN id SET DEFAULT nextval('public.demand_classification_catalog_id_seq'::regclass);

-- 5. CHAVES PRIMÁRIAS
ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_demand_classification_backfill_queue
    ADD CONSTRAINT ai_demand_classification_backfill_queue_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_management_refresh_queue
    ADD CONSTRAINT ai_management_refresh_queue_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_management_suggestions
    ADD CONSTRAINT ai_management_suggestions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_model_health
    ADD CONSTRAINT ai_model_health_pkey PRIMARY KEY (model);
ALTER TABLE ONLY public.ai_usage_daily
    ADD CONSTRAINT ai_usage_daily_pkey PRIMARY KEY (usage_date, model);
ALTER TABLE ONLY public.ai_usage_minute
    ADD CONSTRAINT ai_usage_minute_pkey PRIMARY KEY (minute_bucket, model);
ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.automation_locks
    ADD CONSTRAINT automation_locks_pkey PRIMARY KEY (lock_name);
ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.company_aliases
    ADD CONSTRAINT company_aliases_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.company_resolution_audit
    ADD CONSTRAINT company_resolution_audit_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.company_resolution_candidates
    ADD CONSTRAINT company_resolution_candidates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.demand_classification_catalog
    ADD CONSTRAINT demand_classification_catalog_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_account_config
    ADD CONSTRAINT email_account_config_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_exceptions
    ADD CONSTRAINT email_exceptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_keyword_rules
    ADD CONSTRAINT email_keyword_rules_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_processing_runs
    ADD CONSTRAINT email_processing_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_sender_rules
    ADD CONSTRAINT email_sender_rules_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_sync_state
    ADD CONSTRAINT email_sync_state_pkey PRIMARY KEY (mailbox);
ALTER TABLE ONLY public.law_firms
    ADD CONSTRAINT law_firms_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.legal_nature_catalog
    ADD CONSTRAINT legal_nature_catalog_pkey PRIMARY KEY (code);
ALTER TABLE ONLY public.obligations
    ADD CONSTRAINT obligations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.operational_rules_config
    ADD CONSTRAINT operational_rules_config_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.process_documents
    ADD CONSTRAINT process_documents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.process_evidence
    ADD CONSTRAINT process_evidence_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.process_history
    ADD CONSTRAINT process_history_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.process_law_firm_interactions
    ADD CONSTRAINT process_law_firm_interactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.process_operational_history
    ADD CONSTRAINT process_operational_history_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.process_parties
    ADD CONSTRAINT process_parties_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.process_pendencies
    ADD CONSTRAINT process_pendencies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.process_responsibility_history
    ADD CONSTRAINT process_responsibility_history_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.process_timeline
    ADD CONSTRAINT process_timeline_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.processed_emails
    ADD CONSTRAINT processed_emails_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (key);
ALTER TABLE ONLY public.user_access_audit
    ADD CONSTRAINT user_access_audit_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


-- 6. CONSTRAINTS DE UNICIDADE
ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_email_key UNIQUE (email);
ALTER TABLE ONLY public.ai_demand_classification_backfill_queue
    ADD CONSTRAINT ai_demand_classification_backfill_queue_process_id_key UNIQUE (process_id);
ALTER TABLE ONLY public.demand_classification_catalog
    ADD CONSTRAINT demand_classification_catalog_category_code_subcategory_cod_key UNIQUE (category_code, subcategory_code);
ALTER TABLE ONLY public.process_documents
    ADD CONSTRAINT process_documents_storage_path_key UNIQUE (storage_path);
ALTER TABLE ONLY public.processed_emails
    ADD CONSTRAINT processed_emails_message_id_key UNIQUE (message_id);
ALTER TABLE ONLY public.ai_management_refresh_queue
    ADD CONSTRAINT uq_ai_management_refresh_queue_process UNIQUE (process_id);
ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_email_key UNIQUE (email);


-- 7. CHAVES ESTRANGEIRAS
ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.user_profiles(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ai_demand_classification_backfill_queue
    ADD CONSTRAINT ai_demand_classification_backfill_queue_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_demand_classification_backfill_queue
    ADD CONSTRAINT ai_demand_classification_backfill_queue_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ai_management_refresh_queue
    ADD CONSTRAINT ai_management_refresh_queue_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_management_suggestions
    ADD CONSTRAINT ai_management_suggestions_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ai_management_suggestions
    ADD CONSTRAINT ai_management_suggestions_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ai_management_suggestions
    ADD CONSTRAINT ai_management_suggestions_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ai_management_suggestions
    ADD CONSTRAINT ai_management_suggestions_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.ai_management_refresh_queue(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.company_aliases
    ADD CONSTRAINT company_aliases_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.company_resolution_audit
    ADD CONSTRAINT company_resolution_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.company_resolution_audit
    ADD CONSTRAINT company_resolution_audit_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.company_resolution_audit
    ADD CONSTRAINT company_resolution_audit_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.company_resolution_candidates
    ADD CONSTRAINT company_resolution_candidates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.company_resolution_candidates
    ADD CONSTRAINT company_resolution_candidates_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.company_resolution_candidates
    ADD CONSTRAINT company_resolution_candidates_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.company_resolution_candidates
    ADD CONSTRAINT company_resolution_candidates_resolved_company_id_fkey FOREIGN KEY (resolved_company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.email_account_config
    ADD CONSTRAINT email_account_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.email_account_config
    ADD CONSTRAINT email_account_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.email_exceptions
    ADD CONSTRAINT email_exceptions_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.email_exceptions
    ADD CONSTRAINT email_exceptions_processed_email_id_fkey FOREIGN KEY (processed_email_id) REFERENCES public.processed_emails(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.email_exceptions
    ADD CONSTRAINT email_exceptions_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.law_firms
    ADD CONSTRAINT law_firms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.law_firms
    ADD CONSTRAINT law_firms_inactive_by_fkey FOREIGN KEY (inactive_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.law_firms
    ADD CONSTRAINT law_firms_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.obligations
    ADD CONSTRAINT obligations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.obligations
    ADD CONSTRAINT obligations_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.obligations
    ADD CONSTRAINT obligations_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.operational_rules_config
    ADD CONSTRAINT operational_rules_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_documents
    ADD CONSTRAINT process_documents_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.process_documents
    ADD CONSTRAINT process_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_evidence
    ADD CONSTRAINT process_evidence_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.process_documents(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_evidence
    ADD CONSTRAINT process_evidence_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.process_evidence
    ADD CONSTRAINT process_evidence_processed_email_id_fkey FOREIGN KEY (processed_email_id) REFERENCES public.processed_emails(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_history
    ADD CONSTRAINT process_history_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.process_history
    ADD CONSTRAINT process_history_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_law_firm_interactions
    ADD CONSTRAINT process_law_firm_interactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_law_firm_interactions
    ADD CONSTRAINT process_law_firm_interactions_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_law_firm_interactions
    ADD CONSTRAINT process_law_firm_interactions_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.process_law_firm_interactions
    ADD CONSTRAINT process_law_firm_interactions_response_to_interaction_id_fkey FOREIGN KEY (response_to_interaction_id) REFERENCES public.process_law_firm_interactions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_law_firm_interactions
    ADD CONSTRAINT process_law_firm_interactions_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_law_firm_interactions
    ADD CONSTRAINT process_law_firm_interactions_source_email_id_fkey FOREIGN KEY (source_email_id) REFERENCES public.processed_emails(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_operational_history
    ADD CONSTRAINT process_operational_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_operational_history
    ADD CONSTRAINT process_operational_history_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.process_parties
    ADD CONSTRAINT process_parties_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.process_pendencies
    ADD CONSTRAINT process_pendencies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_pendencies
    ADD CONSTRAINT process_pendencies_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.process_pendencies
    ADD CONSTRAINT process_pendencies_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_responsibility_history
    ADD CONSTRAINT process_responsibility_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_responsibility_history
    ADD CONSTRAINT process_responsibility_history_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.process_timeline
    ADD CONSTRAINT process_timeline_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.process_documents(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_timeline
    ADD CONSTRAINT process_timeline_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.processed_emails(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.process_timeline
    ADD CONSTRAINT process_timeline_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.process_timeline
    ADD CONSTRAINT process_timeline_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.processed_emails
    ADD CONSTRAINT processed_emails_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_demand_catalog_fk FOREIGN KEY (categoria_demanda, subcategoria_demanda) REFERENCES public.demand_classification_catalog(category_code, subcategory_code) NOT VALID;
ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_law_firm_id_fkey FOREIGN KEY (law_firm_id) REFERENCES public.law_firms(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_proxima_acao_responsavel_id_fkey FOREIGN KEY (proxima_acao_responsavel_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.user_access_audit
    ADD CONSTRAINT user_access_audit_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.user_profiles(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.user_access_audit
    ADD CONSTRAINT user_access_audit_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.user_profiles(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- 8. ÍNDICES
CREATE INDEX idx_access_invites_pending ON public.access_invites USING btree (active, claimed_at, expires_at);
CREATE INDEX idx_ai_demand_backfill_retry ON public.ai_demand_classification_backfill_queue USING btree (retry_after) WHERE (status = 'PENDING'::text);
CREATE INDEX idx_ai_demand_backfill_status_requested ON public.ai_demand_classification_backfill_queue USING btree (status, requested_at);
CREATE INDEX idx_ai_mgmt_suggestions_process_generated ON public.ai_management_suggestions USING btree (process_id, generated_at DESC);
CREATE INDEX idx_ai_mgmt_suggestions_status ON public.ai_management_suggestions USING btree (status, generated_at DESC);
CREATE INDEX idx_ai_model_health_circuit ON public.ai_model_health USING btree (circuit_open_until);
CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);
CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at DESC);
CREATE INDEX idx_audit_logs_process ON public.audit_logs USING btree (process_id);
CREATE INDEX idx_companies_nome_normalizado ON public.companies USING btree (nome_normalizado);
CREATE INDEX idx_companies_nome_trgm ON public.companies USING gin (nome public.gin_trgm_ops);
CREATE INDEX idx_company_aliases_company ON public.company_aliases USING btree (company_id, active);
CREATE INDEX idx_company_resolution_audit_process ON public.company_resolution_audit USING btree (process_id, created_at DESC);
CREATE INDEX idx_company_resolution_candidates_company ON public.company_resolution_candidates USING btree (resolved_company_id) WHERE (resolved_company_id IS NOT NULL);
CREATE INDEX idx_company_resolution_candidates_status_created ON public.company_resolution_candidates USING btree (status, created_at DESC);
CREATE INDEX idx_email_exceptions_email ON public.email_exceptions USING btree (processed_email_id);
CREATE INDEX idx_email_exceptions_status ON public.email_exceptions USING btree (status, created_at DESC);
CREATE INDEX idx_history_process_date ON public.process_history USING btree (process_id, data_hora DESC);
CREATE INDEX idx_keyword_rules_active ON public.email_keyword_rules USING btree (active);
CREATE INDEX idx_law_firm_interactions_expected ON public.process_law_firm_interactions USING btree (expected_return_at) WHERE ((received_at IS NULL) AND (expected_return_at IS NOT NULL));
CREATE INDEX idx_law_firm_interactions_open_envio ON public.process_law_firm_interactions USING btree (process_id, expected_return_at) WHERE ((interaction_type = 'ENVIO'::text) AND (received_at IS NULL));
CREATE INDEX idx_law_firm_interactions_process_date ON public.process_law_firm_interactions USING btree (process_id, created_at DESC);
CREATE INDEX idx_law_firm_interactions_response_to ON public.process_law_firm_interactions USING btree (response_to_interaction_id) WHERE (response_to_interaction_id IS NOT NULL);
CREATE INDEX idx_law_firms_active_name ON public.law_firms USING btree (active, nome);
CREATE INDEX idx_obligations_active_deadline ON public.obligations USING btree (prazo) WHERE ((status = ANY (ARRAY['ABERTA'::text, 'PENDENTE'::text, 'EM_ANDAMENTO'::text])) AND (prazo IS NOT NULL));
CREATE INDEX idx_obligations_open_deadline ON public.obligations USING btree (prazo) WHERE ((status = 'ABERTA'::text) AND (prazo IS NOT NULL));
CREATE INDEX idx_obligations_prazo ON public.obligations USING btree (prazo);
CREATE INDEX idx_obligations_process ON public.obligations USING btree (process_id);
CREATE INDEX idx_obligations_responsavel ON public.obligations USING btree (responsavel_id);
CREATE INDEX idx_obligations_status ON public.obligations USING btree (status);
CREATE INDEX idx_pendencies_process_status_due ON public.process_pendencies USING btree (process_id, status, due_at);
CREATE INDEX idx_pendencies_responsible_status ON public.process_pendencies USING btree (responsible_type, status, due_at);
CREATE INDEX idx_process_documents_hash ON public.process_documents USING btree (sha256);
CREATE INDEX idx_process_documents_process ON public.process_documents USING btree (process_id);
CREATE INDEX idx_process_evidence_document ON public.process_evidence USING btree (document_id);
CREATE INDEX idx_process_evidence_email ON public.process_evidence USING btree (processed_email_id);
CREATE INDEX idx_process_evidence_field ON public.process_evidence USING btree (field_name);
CREATE INDEX idx_process_evidence_process ON public.process_evidence USING btree (process_id, created_at DESC);
CREATE INDEX idx_process_operational_history_process_changed ON public.process_operational_history USING btree (process_id, changed_at DESC);
CREATE INDEX idx_process_parties_nome_trgm ON public.process_parties USING gin (nome public.gin_trgm_ops);
CREATE INDEX idx_process_parties_process ON public.process_parties USING btree (process_id);
CREATE INDEX idx_process_parties_process_tipo ON public.process_parties USING btree (process_id, tipo);
CREATE INDEX idx_process_pendencies_open_due ON public.process_pendencies USING btree (process_id, due_at) WHERE (status = ANY (ARRAY['ABERTA'::text, 'EM_TRATAMENTO'::text]));
CREATE INDEX idx_process_responsibility_history_process_changed ON public.process_responsibility_history USING btree (process_id, changed_at DESC);
CREATE INDEX idx_processed_emails_created_at ON public.processed_emails USING btree (created_at DESC);
CREATE INDEX idx_processed_emails_hash ON public.processed_emails USING btree (content_hash);
CREATE INDEX idx_processed_emails_matched_process ON public.processed_emails USING btree (matched_process_number);
CREATE INDEX idx_processed_emails_process ON public.processed_emails USING btree (process_id);
CREATE INDEX idx_processed_emails_received ON public.processed_emails USING btree (received_at DESC);
CREATE INDEX idx_processed_emails_status ON public.processed_emails USING btree (status);
CREATE INDEX idx_processed_emails_status_created_at ON public.processed_emails USING btree (status, created_at DESC);
CREATE INDEX idx_processed_emails_status_received ON public.processed_emails USING btree (status, received_at DESC);
CREATE INDEX idx_processes_active_updated ON public.processes USING btree (updated_at DESC) WHERE (arquivado = false);
CREATE INDEX idx_processes_categoria_demanda ON public.processes USING btree (categoria_demanda) WHERE (arquivado = false);
CREATE INDEX idx_processes_company ON public.processes USING btree (company_id);
CREATE INDEX idx_processes_created ON public.processes USING btree (created_at DESC);
CREATE INDEX idx_processes_law_firm_id ON public.processes USING btree (law_firm_id) WHERE (law_firm_id IS NOT NULL);
CREATE INDEX idx_processes_next_action_due ON public.processes USING btree (proxima_acao_prazo) WHERE ((proxima_acao_prazo IS NOT NULL) AND (arquivado = false));
CREATE INDEX idx_processes_nivel_risco ON public.processes USING btree (nivel_risco) WHERE (arquivado = false);
CREATE INDEX idx_processes_numero_processo ON public.processes USING btree (numero_processo);
CREATE INDEX idx_processes_objeto_trgm ON public.processes USING gin (objeto_demanda public.gin_trgm_ops);
CREATE INDEX idx_processes_operational_status_resp ON public.processes USING btree (status_operacional, responsabilidade_atual) WHERE (arquivado = false);
CREATE INDEX idx_processes_protocolo ON public.processes USING btree (protocolo_externo);
CREATE INDEX idx_processes_proxima_acao_prazo ON public.processes USING btree (proxima_acao_prazo) WHERE ((arquivado = false) AND (proxima_acao_prazo IS NOT NULL));
CREATE INDEX idx_processes_recebido ON public.processes USING btree (recebido_em DESC);
CREATE INDEX idx_processes_responsabilidade_atual ON public.processes USING btree (responsabilidade_atual) WHERE (arquivado = false);
CREATE INDEX idx_processes_responsavel ON public.processes USING btree (responsavel_id);
CREATE INDEX idx_processes_status ON public.processes USING btree (status_atual);
CREATE INDEX idx_processes_status_operacional ON public.processes USING btree (status_operacional) WHERE (arquivado = false);
CREATE INDEX idx_processes_subcategoria_demanda ON public.processes USING btree (subcategoria_demanda) WHERE (arquivado = false);
CREATE INDEX idx_processes_ultimo_evento ON public.processes USING btree (ultimo_evento_em DESC);
CREATE INDEX idx_processing_runs_started ON public.email_processing_runs USING btree (started_at DESC);
CREATE INDEX idx_sender_rules_active ON public.email_sender_rules USING btree (active, rule_type);
CREATE INDEX idx_timeline_process_date ON public.process_timeline USING btree (process_id, data_hora DESC);
CREATE INDEX idx_user_access_audit_created_at ON public.user_access_audit USING btree (created_at DESC);
CREATE INDEX idx_user_access_audit_target_user ON public.user_access_audit USING btree (target_user_id, created_at DESC);
CREATE INDEX ix_ai_management_refresh_queue_process ON public.ai_management_refresh_queue USING btree (process_id);
CREATE INDEX ix_ai_management_refresh_queue_ready ON public.ai_management_refresh_queue USING btree (status, not_before, requested_at DESC);
CREATE INDEX ix_ai_management_suggestions_queue ON public.ai_management_suggestions USING btree (queue_id);
CREATE INDEX ix_ai_usage_minute_model_bucket ON public.ai_usage_minute USING btree (model, minute_bucket DESC);
CREATE INDEX ix_email_account_config_updated ON public.email_account_config USING btree (updated_at DESC);
CREATE UNIQUE INDEX uq_company_aliases_active_normalized ON public.company_aliases USING btree (alias_normalizado) WHERE (active = true);
CREATE UNIQUE INDEX uq_company_resolution_candidates_pending_process ON public.company_resolution_candidates USING btree (process_id) WHERE (status = 'PENDENTE'::text);
CREATE UNIQUE INDEX uq_law_firms_cnpj_digits ON public.law_firms USING btree (regexp_replace(cnpj, '[^0-9]'::text, ''::text, 'g'::text)) WHERE ((cnpj IS NOT NULL) AND (regexp_replace(cnpj, '[^0-9]'::text, ''::text, 'g'::text) <> ''::text));
CREATE UNIQUE INDEX ux_companies_cnpj ON public.companies USING btree (cnpj) WHERE (cnpj IS NOT NULL);
CREATE UNIQUE INDEX ux_email_account_config_single_active ON public.email_account_config USING btree (active) WHERE (active = true);
CREATE UNIQUE INDEX ux_processed_emails_mailbox_uid ON public.processed_emails USING btree (mailbox, imap_uid) WHERE (imap_uid IS NOT NULL);


-- 9. FUNÇÕES DE CONTROLE DE ACESSO (BASE)
CREATE OR REPLACE FUNCTION public.current_app_role() RETURNS public.app_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT role
  FROM public.user_profiles
  WHERE id = auth.uid()
    AND active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_app_user_active() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND active = true
  );
$$;

-- 9.1 FUNÇÕES DE CONTROLE DE ACESSO (REGRAS E PAPÉIS)
CREATE OR REPLACE FUNCTION public.can_manage_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.current_app_role() = 'ADMIN';
$$;

CREATE OR REPLACE FUNCTION public.can_manage_master_data() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.active = true
      and up.role::text in ('ADMIN','GESTOR')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_operational() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.current_app_role() IN ('ADMIN', 'GESTOR', 'ANALISTA');
$$;

CREATE OR REPLACE FUNCTION public.assert_active_admin(p_actor_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.user_profiles
    where id = p_actor_id and active = true and role = 'ADMIN'::public.app_role
  ) then
    raise exception 'Operação permitida apenas para ADMIN ativo.';
  end if;
end;
$$;

-- 9.2 FUNÇÕES DE NEGÓCIO E PROCEDURES (RPC)
CREATE OR REPLACE FUNCTION public.admin_create_or_refresh_invite(p_actor_id uuid, p_email public.citext, p_role public.app_role, p_reason text DEFAULT NULL::text) RETURNS public.access_invites
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email citext := lower(trim(p_email::text))::citext;
  v_existing_profile public.user_profiles%rowtype;
  v_existing_invite public.access_invites%rowtype;
  v_result public.access_invites%rowtype;
  v_action text;
begin
  perform public.assert_active_admin(p_actor_id);
  perform pg_advisory_xact_lock(hashtext('sb_user_admin_guard'));

  if v_email is null or length(v_email::text) < 5 or position('@' in v_email::text) = 0 then
    raise exception 'E-mail inválido.';
  end if;

  select * into v_existing_profile
  from public.user_profiles
  where email = v_email
  limit 1;

  if found and v_existing_profile.active = true then
    raise exception 'Já existe usuário ativo para este e-mail.';
  end if;

  select * into v_existing_invite
  from public.access_invites
  where email = v_email
  for update;

  if found then
    if v_existing_invite.active = true
       and v_existing_invite.claimed_at is null
       and v_existing_invite.revoked_at is null
       and (v_existing_invite.expires_at is null or v_existing_invite.expires_at > now()) then
      raise exception 'Já existe autorização ativa e pendente para este e-mail.';
    end if;

    update public.access_invites
    set role = p_role,
        active = true,
        created_by = p_actor_id,
        claimed_by = null,
        claimed_at = null,
        revoked_at = null,
        revoked_by = null,
        expires_at = now() + interval '7 days',
        created_at = now(),
        updated_at = now()
    where id = v_existing_invite.id
    returning * into v_result;
    v_action := 'INVITE_REISSUED';
  else
    insert into public.access_invites (
      email, role, active, created_by, expires_at
    ) values (
      v_email, p_role, true, p_actor_id, now() + interval '7 days'
    ) returning * into v_result;
    v_action := 'INVITE_CREATED';
  end if;

  insert into public.user_access_audit (
    action, actor_user_id, target_user_id, target_email,
    new_role, reason, metadata
  ) values (
    v_action, p_actor_id, v_existing_profile.id, v_email,
    p_role, nullif(trim(coalesce(p_reason,'')), ''),
    jsonb_build_object('invite_id', v_result.id, 'expires_at', v_result.expires_at)
  );

  return v_result;
end;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_invite(p_actor_id uuid, p_invite_id uuid, p_reason text DEFAULT NULL::text) RETURNS public.access_invites
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_invite public.access_invites%rowtype;
  v_target public.user_profiles%rowtype;
begin
  perform public.assert_active_admin(p_actor_id);
  perform pg_advisory_xact_lock(hashtext('sb_user_admin_guard'));

  select * into v_invite
  from public.access_invites
  where id = p_invite_id
  for update;

  if not found then raise exception 'Convite não encontrado.'; end if;
  if v_invite.claimed_at is not null then raise exception 'Convite já resgatado não pode ser revogado.'; end if;
  if v_invite.active = false then raise exception 'Convite já está inativo.'; end if;

  select * into v_target from public.user_profiles where email = v_invite.email limit 1;

  update public.access_invites
  set active = false,
      revoked_at = now(),
      revoked_by = p_actor_id,
      updated_at = now()
  where id = p_invite_id
  returning * into v_invite;

  insert into public.user_access_audit (
    action, actor_user_id, target_user_id, target_email, old_role, reason,
    metadata
  ) values (
    'INVITE_REVOKED', p_actor_id, v_target.id, v_invite.email, v_invite.role,
    nullif(trim(coalesce(p_reason,'')), ''), jsonb_build_object('invite_id', v_invite.id)
  );

  return v_invite;
end;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_active(p_actor_id uuid, p_target_user_id uuid, p_new_active boolean, p_reason text DEFAULT NULL::text) RETURNS public.user_profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_target public.user_profiles%rowtype;
  v_result public.user_profiles%rowtype;
  v_other_admins integer;
begin
  perform public.assert_active_admin(p_actor_id);
  perform pg_advisory_xact_lock(hashtext('sb_user_admin_guard'));

  if p_target_user_id = p_actor_id then
    raise exception 'Por segurança, o ADMIN não pode alterar o próprio status.';
  end if;

  select * into v_target
  from public.user_profiles
  where id = p_target_user_id
  for update;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if v_target.active = p_new_active then return v_target; end if;

  if v_target.active = true and p_new_active = false and v_target.role = 'ADMIN'::public.app_role then
    select count(*) into v_other_admins
    from public.user_profiles
    where active = true and role = 'ADMIN'::public.app_role and id <> p_target_user_id;
    if v_other_admins < 1 then
      raise exception 'Não é possível inativar o último ADMIN ativo.';
    end if;
  end if;

  update public.user_profiles
  set active = p_new_active, updated_at = now()
  where id = p_target_user_id
  returning * into v_result;

  insert into public.user_access_audit (
    action, actor_user_id, target_user_id, target_email,
    old_role, new_role, old_active, new_active, reason
  ) values (
    case when p_new_active then 'USER_REACTIVATED' else 'USER_DEACTIVATED' end,
    p_actor_id, v_target.id, v_target.email,
    v_target.role, v_target.role, v_target.active, p_new_active,
    nullif(trim(coalesce(p_reason,'')), '')
  );

  return v_result;
end;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_actor_id uuid, p_target_user_id uuid, p_new_role public.app_role, p_reason text DEFAULT NULL::text) RETURNS public.user_profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_target public.user_profiles%rowtype;
  v_result public.user_profiles%rowtype;
  v_other_admins integer;
begin
  perform public.assert_active_admin(p_actor_id);
  perform pg_advisory_xact_lock(hashtext('sb_user_admin_guard'));

  if p_target_user_id = p_actor_id then
    raise exception 'Por segurança, o ADMIN não pode alterar o próprio perfil.';
  end if;

  select * into v_target
  from public.user_profiles
  where id = p_target_user_id
  for update;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if v_target.role = p_new_role then return v_target; end if;

  if v_target.role = 'ADMIN'::public.app_role and v_target.active = true and p_new_role <> 'ADMIN'::public.app_role then
    select count(*) into v_other_admins
    from public.user_profiles
    where active = true and role = 'ADMIN'::public.app_role and id <> p_target_user_id;
    if v_other_admins < 1 then
      raise exception 'Não é possível rebaixar o último ADMIN ativo.';
    end if;
  end if;

  update public.user_profiles
  set role = p_new_role, updated_at = now()
  where id = p_target_user_id
  returning * into v_result;

  insert into public.user_access_audit (
    action, actor_user_id, target_user_id, target_email,
    old_role, new_role, old_active, new_active, reason
  ) values (
    'ROLE_CHANGED', p_actor_id, v_target.id, v_target.email,
    v_target.role, p_new_role, v_target.active, v_target.active,
    nullif(trim(coalesce(p_reason,'')), '')
  );

  return v_result;
end;
$$;

CREATE OR REPLACE FUNCTION public.apply_ai_management_suggestion(p_suggestion_id uuid, p_field_name text) RETURNS public.processes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
declare
  v_suggestion public.ai_management_suggestions;
  v_value jsonb;
  v_text text;
  v_changes jsonb := '{}'::jsonb;
  v_result public.processes;
  v_actor uuid := auth.uid();
  v_current_status text;
  v_applied text[];
begin
  if v_actor is null or not public.can_write_operational() then
    raise exception 'Usuário sem permissão operacional.' using errcode = '42501';
  end if;

  if p_field_name not in ('resumo_executivo','status_operacional','responsabilidade_atual','nivel_risco','proxima_acao') then
    raise exception 'Campo de sugestão não permitido: %', p_field_name using errcode = '22023';
  end if;

  select * into v_suggestion
  from public.ai_management_suggestions
  where id = p_suggestion_id
    and process_id is not null
  for update;

  if v_suggestion.id is null then
    raise exception 'Sugestão gerencial não encontrada.' using errcode = 'P0002';
  end if;

  if v_suggestion.status in ('EXPIRADA','DESCARTADA') then
    raise exception 'Sugestão gerencial não está mais ativa.' using errcode = '22023';
  end if;

  v_value := v_suggestion.suggestions -> p_field_name -> 'value';
  if v_value is null or v_value = 'null'::jsonb then
    raise exception 'A IA não forneceu valor aplicável para este campo.' using errcode = '22023';
  end if;

  v_text := nullif(trim(v_suggestion.suggestions -> p_field_name ->> 'value'), '');
  if v_text is null then
    raise exception 'A IA não forneceu valor textual aplicável para este campo.' using errcode = '22023';
  end if;

  if p_field_name = 'status_operacional' then
    if v_text not in ('NAO_CLASSIFICADO','RECEBIDO','EM_TRIAGEM','AGUARDANDO_AREA_INTERNA','AGUARDANDO_ESCRITORIO',
                      'EM_PREPARACAO_ESCRITORIO','RESPONDIDO_PROTOCOLADO','AGUARDANDO_DECISAO','COM_DECISAO',
                      'EM_RECURSO','EM_CUMPRIMENTO','SUSPENSO') then
      raise exception 'Status operacional sugerido inválido ou não aplicável pela IA.' using errcode = '22023';
    end if;
    v_changes := jsonb_build_object('status_operacional', v_text);
    -- Regra determinística da 5D: alguns estados fixam quem está com a bola.
    if v_text in ('AGUARDANDO_ESCRITORIO','EM_PREPARACAO_ESCRITORIO') then
      v_changes := v_changes || jsonb_build_object('responsabilidade_atual','ESCRITORIO');
    elsif v_text = 'AGUARDANDO_AREA_INTERNA' then
      v_changes := v_changes || jsonb_build_object('responsabilidade_atual','OPERADORA');
    elsif v_text = 'AGUARDANDO_DECISAO' then
      v_changes := v_changes || jsonb_build_object('responsabilidade_atual','JUDICIARIO');
    end if;
  elsif p_field_name = 'responsabilidade_atual' then
    if v_text not in ('OPERADORA','ESCRITORIO','JUDICIARIO','TERCEIRO','SEM_RESPONSAVEL') then
      raise exception 'Responsabilidade sugerida inválida.' using errcode = '22023';
    end if;
    select status_operacional into v_current_status from public.processes where id = v_suggestion.process_id;
    if v_current_status in ('AGUARDANDO_ESCRITORIO','EM_PREPARACAO_ESCRITORIO') and v_text <> 'ESCRITORIO' then
      raise exception 'O status atual exige responsabilidade ESCRITORIO.' using errcode = '22023';
    elsif v_current_status = 'AGUARDANDO_AREA_INTERNA' and v_text <> 'OPERADORA' then
      raise exception 'O status atual exige responsabilidade OPERADORA.' using errcode = '22023';
    elsif v_current_status = 'AGUARDANDO_DECISAO' and v_text <> 'JUDICIARIO' then
      raise exception 'O status atual exige responsabilidade JUDICIARIO.' using errcode = '22023';
    end if;
    v_changes := jsonb_build_object('responsabilidade_atual', v_text);
  elsif p_field_name = 'nivel_risco' then
    if v_text not in ('NAO_CLASSIFICADO','BAIXO','MEDIO','ALTO','CRITICO') then
      raise exception 'Nível de risco sugerido inválido.' using errcode = '22023';
    end if;
    v_changes := jsonb_build_object('nivel_risco', v_text);
  elsif p_field_name = 'resumo_executivo' then
    if length(v_text) < 10 then raise exception 'Resumo executivo sugerido é insuficiente.' using errcode='22023'; end if;
    v_changes := jsonb_build_object('resumo_executivo', left(v_text, 1600));
  elsif p_field_name = 'proxima_acao' then
    if length(v_text) < 3 then raise exception 'Próxima ação sugerida é insuficiente.' using errcode='22023'; end if;
    v_changes := jsonb_build_object('proxima_acao', left(v_text, 500));
  end if;

  -- Mantém auditoria e coerência já homologadas na Fase 5D.
  select * into v_result
  from public.update_process_management(
    v_suggestion.process_id,
    v_changes,
    'Sugestão gerencial da IA confirmada pelo usuário.'
  );

  select array_agg(distinct x order by x) into v_applied
  from unnest(coalesce(v_suggestion.applied_fields,'{}'::text[]) || array[p_field_name]) x;

  update public.ai_management_suggestions
  set applied_fields = coalesce(v_applied,'{}'::text[]),
      applied_by = v_actor,
      applied_at = now(),
      status = case when cardinality(coalesce(v_applied,'{}'::text[])) >= 5 then 'APLICADA_TOTAL' else 'APLICADA_PARCIAL' end
  where id = v_suggestion.id;

  return v_result;
end;
$$;

CREATE OR REPLACE FUNCTION public.audit_process_operational_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
declare
  v_actor uuid := coalesce(new.updated_by, auth.uid());
begin
  if old.status_operacional is distinct from new.status_operacional then
    insert into public.process_operational_history(process_id, field_name, old_value, new_value, changed_by)
    values(new.id, 'status_operacional', old.status_operacional, new.status_operacional, v_actor);
  end if;

  if old.proxima_acao is distinct from new.proxima_acao then
    insert into public.process_operational_history(process_id, field_name, old_value, new_value, changed_by)
    values(new.id, 'proxima_acao', old.proxima_acao, new.proxima_acao, v_actor);
  end if;

  if old.proxima_acao_prazo is distinct from new.proxima_acao_prazo then
    insert into public.process_operational_history(process_id, field_name, old_value, new_value, changed_by)
    values(new.id, 'proxima_acao_prazo', old.proxima_acao_prazo::text, new.proxima_acao_prazo::text, v_actor);
  end if;

  if old.nivel_risco is distinct from new.nivel_risco then
    insert into public.process_operational_history(process_id, field_name, old_value, new_value, changed_by)
    values(new.id, 'nivel_risco', old.nivel_risco, new.nivel_risco, v_actor);
  end if;

  if old.law_firm_id is distinct from new.law_firm_id then
    insert into public.process_operational_history(process_id, field_name, old_value, new_value, changed_by)
    values(new.id, 'law_firm_id', old.law_firm_id::text, new.law_firm_id::text, v_actor);
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.audit_process_responsibility_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
begin
  if old.responsabilidade_atual is distinct from new.responsabilidade_atual then
    insert into public.process_responsibility_history (
      process_id, previous_responsibility, new_responsibility, changed_at, changed_by
    ) values (
      new.id, old.responsabilidade_atual, new.responsabilidade_atual,
      coalesce(new.responsabilidade_desde, now()),
      coalesce(new.updated_by, auth.uid())
    );
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.claim_my_invite() RETURNS public.user_profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_email citext := lower((auth.jwt() ->> 'email'))::citext;
  v_invite public.access_invites%rowtype;
  v_profile public.user_profiles%rowtype;
begin
  if v_uid is null or v_email is null then
    raise exception 'Sessão autenticada com e-mail é obrigatória.';
  end if;

  select * into v_profile from public.user_profiles where id = v_uid;

  if not found then
    insert into public.user_profiles (id, email, display_name, username, role, active)
    values (v_uid, v_email, split_part(v_email::text, '@', 1), split_part(v_email::text, '@', 1), 'CONSULTA', false)
    on conflict (id) do nothing;
  end if;

  select * into v_invite
  from public.access_invites
  where lower(email::text) = lower(v_email::text)
    and active = true
    and claimed_at is null
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.user_profiles
    set role = v_invite.role,
        active = true,
        last_login_at = now(),
        updated_at = now()
    where id = v_uid
    returning * into v_profile;

    update public.access_invites
    set active = false,
        claimed_by = v_uid,
        claimed_at = now(),
        updated_at = now()
    where id = v_invite.id;

    insert into public.user_access_audit (
      action, actor_user_id, target_user_id, target_email,
      new_role, old_active, new_active, metadata
    ) values (
      'INVITE_CLAIMED', v_uid, v_uid, v_email,
      v_invite.role, false, true, jsonb_build_object('invite_id', v_invite.id)
    );
  else
    select * into v_profile from public.user_profiles where id = v_uid;
    if v_profile.active = true then
      update public.user_profiles
      set last_login_at = now(), updated_at = now()
      where id = v_uid
      returning * into v_profile;
    else
      raise exception 'Acesso não autorizado: nenhum convite ativo e pendente para o e-mail %.', v_email;
    end if;
  end if;

  return v_profile;
end;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_ai_management_refresh(p_process_id uuid, p_trigger_reason text DEFAULT NULL::text, p_source_processed_email_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid;
  v_debounce_seconds integer := 120;
begin
  if not exists (
    select 1 from public.processes p where p.id = p_process_id
  ) then
    raise exception 'Processo não encontrado: %', p_process_id;
  end if;

  select greatest(
           0,
           coalesce((value->>'debounce_seconds')::integer, 120)
         )
    into v_debounce_seconds
  from public.system_config
  where key = 'ai_management_automation';

  v_debounce_seconds := coalesce(v_debounce_seconds, 120);

  insert into public.ai_management_refresh_queue (
    process_id,
    status,
    trigger_reason,
    source_processed_email_id,
    requested_at,
    not_before,
    attempts,
    last_error,
    locked_at,
    locked_by,
    processed_at,
    updated_at
  )
  values (
    p_process_id,
    'PENDING',
    nullif(trim(p_trigger_reason), ''),
    p_source_processed_email_id,
    now(),
    now() + make_interval(secs => v_debounce_seconds),
    0,
    null,
    null,
    null,
    null,
    now()
  )
  on conflict (process_id) do update
  set status = 'PENDING',
      trigger_reason = coalesce(nullif(trim(excluded.trigger_reason), ''), public.ai_management_refresh_queue.trigger_reason),
      source_processed_email_id = coalesce(excluded.source_processed_email_id, public.ai_management_refresh_queue.source_processed_email_id),
      requested_at = now(),
      not_before = now() + make_interval(secs => v_debounce_seconds),
      attempts = 0,
      last_error = null,
      locked_at = null,
      locked_by = null,
      processed_at = null,
      updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RAISE EXCEPTION 'A Gestão Jurídica exige autenticação com e-mail.';
  END IF;

  INSERT INTO public.user_profiles (
    id,
    email,
    display_name,
    role,
    active
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(NEW.email, '@', 1)
    ),
    'CONSULTA',
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_ai_usage_daily(p_usage_date date, p_model text, p_input_tokens bigint DEFAULT 0, p_output_tokens bigint DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_usage_date IS NULL THEN
    RAISE EXCEPTION 'p_usage_date e obrigatorio';
  END IF;
  IF NULLIF(BTRIM(p_model), '') IS NULL THEN
    RAISE EXCEPTION 'p_model e obrigatorio';
  END IF;

  INSERT INTO public.ai_usage_daily (
    usage_date,
    model,
    requests_count,
    input_tokens,
    output_tokens,
    updated_at
  ) VALUES (
    p_usage_date,
    BTRIM(p_model),
    1,
    GREATEST(COALESCE(p_input_tokens, 0), 0),
    GREATEST(COALESCE(p_output_tokens, 0), 0),
    now()
  )
  ON CONFLICT (usage_date, model)
  DO UPDATE SET
    requests_count = public.ai_usage_daily.requests_count + 1,
    input_tokens = public.ai_usage_daily.input_tokens + GREATEST(COALESCE(EXCLUDED.input_tokens, 0), 0),
    output_tokens = public.ai_usage_daily.output_tokens + GREATEST(COALESCE(EXCLUDED.output_tokens, 0), 0),
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_ai_usage_rate_window(p_usage_date date, p_minute_bucket timestamp with time zone, p_model text, p_input_tokens bigint DEFAULT 0, p_output_tokens bigint DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.ai_usage_daily (
    usage_date, model, requests_count, input_tokens, output_tokens, updated_at
  )
  values (
    p_usage_date,
    p_model,
    1,
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    now()
  )
  on conflict (usage_date, model) do update
  set requests_count = public.ai_usage_daily.requests_count + 1,
      input_tokens = public.ai_usage_daily.input_tokens + excluded.input_tokens,
      output_tokens = public.ai_usage_daily.output_tokens + excluded.output_tokens,
      updated_at = now();

  insert into public.ai_usage_minute (
    minute_bucket, model, requests_count, input_tokens, output_tokens, updated_at
  )
  values (
    date_trunc('minute', p_minute_bucket),
    p_model,
    1,
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    now()
  )
  on conflict (minute_bucket, model) do update
  set requests_count = public.ai_usage_minute.requests_count + 1,
      input_tokens = public.ai_usage_minute.input_tokens + excluded.input_tokens,
      output_tokens = public.ai_usage_minute.output_tokens + excluded.output_tokens,
      updated_at = now();
end;
$$;

CREATE OR REPLACE FUNCTION public.register_law_firm_interaction(p_process_id uuid, p_law_firm_id uuid, p_interaction_type text, p_expected_return_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_subject text DEFAULT NULL::text, p_summary text DEFAULT NULL::text, p_responsible_user_id uuid DEFAULT NULL::uuid, p_source_email_id uuid DEFAULT NULL::uuid) RETURNS public.process_law_firm_interactions
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_target uuid;
  v_default_sla integer;
  v_expected timestamptz;
  v_row public.process_law_firm_interactions;
begin
  if not public.can_write_operational() then
    raise exception 'Usuário sem permissão operacional.' using errcode = '42501';
  end if;
  if p_interaction_type not in ('ENVIO','RETORNO','COBRANCA','ORIENTACAO','OUTRO') then
    raise exception 'Tipo de interação inválido.' using errcode = '22023';
  end if;

  select law_firm_default_sla_days into v_default_sla
  from public.operational_rules_config where id=1;
  v_default_sla := coalesce(v_default_sla,3);

  -- Localiza o ENVIO ainda aberto. COBRANÇA e RETORNO sempre se vinculam a ele.
  if p_interaction_type in ('COBRANCA','RETORNO') then
    select i.id into v_target
    from public.process_law_firm_interactions i
    where i.process_id = p_process_id
      and (p_law_firm_id is null or i.law_firm_id = p_law_firm_id)
      and i.interaction_type = 'ENVIO'
      and i.received_at is null
    order by coalesce(i.expected_return_at,i.sent_at,i.created_at) asc
    limit 1
    for update;
  end if;

  if p_interaction_type = 'COBRANCA' and v_target is null then
    raise exception 'Não existe ENVIO pendente para registrar cobrança.' using errcode='22023';
  end if;

  if p_interaction_type = 'RETORNO' and v_target is not null then
    update public.process_law_firm_interactions
    set received_at = v_now, updated_at=v_now
    where id = v_target;
  end if;

  if p_interaction_type = 'ENVIO' then
    v_expected := coalesce(p_expected_return_at, v_now + make_interval(days => v_default_sla));
    if v_expected <= v_now then
      raise exception 'Retorno esperado deve ser posterior ao envio.' using errcode='22023';
    end if;
  else
    v_expected := p_expected_return_at;
  end if;

  insert into public.process_law_firm_interactions(
    process_id, law_firm_id, interaction_type, sent_at,
    expected_return_at, received_at, response_to_interaction_id,
    subject, summary, responsible_user_id, source_email_id, created_by
  ) values (
    p_process_id,p_law_firm_id,p_interaction_type,
    case when p_interaction_type='RETORNO' then null else v_now end,
    case when p_interaction_type='ENVIO' then v_expected else null end,
    case when p_interaction_type='RETORNO' then v_now else null end,
    v_target,
    nullif(trim(p_subject),''),nullif(trim(p_summary),''),p_responsible_user_id,p_source_email_id,v_actor
  ) returning * into v_row;

  -- Transições automáticas apenas quando semanticamente inequívocas.
  if p_interaction_type in ('ENVIO','COBRANCA') then
    update public.processes
    set status_operacional='AGUARDANDO_ESCRITORIO', responsabilidade_atual='ESCRITORIO', updated_by=v_actor, updated_at=v_now
    where id=p_process_id and status_operacional <> 'ENCERRADO';
  elsif p_interaction_type='RETORNO' then
    update public.processes
    set status_operacional=case when status_operacional='AGUARDANDO_ESCRITORIO' then 'EM_TRIAGEM' else status_operacional end,
        responsabilidade_atual='OPERADORA', updated_by=v_actor, updated_at=v_now
    where id=p_process_id and status_operacional <> 'ENCERRADO';
  end if;

  return v_row;
end;
$$;

CREATE OR REPLACE FUNCTION public.register_process_pendency(p_process_id uuid, p_description text, p_responsible_type text, p_criticality text DEFAULT 'MEDIA'::text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_type text DEFAULT 'OUTRA'::text, p_responsible_user_id uuid DEFAULT NULL::uuid) RETURNS public.process_pendencies
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth'
    AS $$
declare
  v_row public.process_pendencies;
begin
  if not public.can_write_operational() then
    raise exception 'Usuário sem permissão operacional.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_description,''))) < 3 then
    raise exception 'Descrição da pendência é obrigatória.' using errcode = '22023';
  end if;
  if p_responsible_type not in ('OPERADORA','ESCRITORIO','JUDICIARIO','TERCEIRO','SEM_RESPONSAVEL') then
    raise exception 'Responsável da pendência inválido.' using errcode = '22023';
  end if;
  if p_criticality not in ('BAIXA','MEDIA','ALTA','URGENTE') then
    raise exception 'Criticidade inválida.' using errcode = '22023';
  end if;

  insert into public.process_pendencies(
    process_id,type,description,responsible_type,responsible_user_id,due_at,status,criticality,source,created_by
  ) values (
    p_process_id,coalesce(nullif(trim(p_type),''),'OUTRA'),trim(p_description),p_responsible_type,
    p_responsible_user_id,p_due_at,'ABERTA',p_criticality,'HUMANO',auth.uid()
  ) returning * into v_row;
  return v_row;
end;
$$;

CREATE OR REPLACE FUNCTION public.release_automation_lock(p_lock_name text, p_owner_token text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.automation_locks
  set locked_until = null,
      owner_token = null,
      updated_at = now()
  where lock_name = p_lock_name
    and owner_token = p_owner_token;
$$;

CREATE OR REPLACE FUNCTION public.retry_ai_management_refresh(p_process_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_debounce_seconds integer := 120;
begin
  select greatest(
           0,
           coalesce((value->>'debounce_seconds')::integer, 120)
         )
    into v_debounce_seconds
  from public.system_config
  where key = 'ai_management_automation';

  v_debounce_seconds := coalesce(v_debounce_seconds, 120);

  update public.ai_management_refresh_queue
  set status = 'PENDING',
      requested_at = now(),
      not_before = now() + make_interval(secs => v_debounce_seconds),
      attempts = 0,
      last_error = null,
      locked_at = null,
      locked_by = null,
      processed_at = null,
      updated_at = now()
  where process_id = p_process_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_process_pendency_status(p_pendency_id uuid, p_status text) RETURNS public.process_pendencies
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth'
    AS $$
declare v_row public.process_pendencies;
begin
  if not public.can_write_operational() then
    raise exception 'Usuário sem permissão operacional.' using errcode = '42501';
  end if;
  if p_status not in ('ABERTA','EM_TRATAMENTO','RESOLVIDA','CANCELADA') then
    raise exception 'Status de pendência inválido.' using errcode = '22023';
  end if;

  update public.process_pendencies
  set status = p_status,
      resolved_at = case when p_status='RESOLVIDA' then coalesce(resolved_at,now()) else null end,
      updated_at = now()
  where id = p_pendency_id
  returning * into v_row;

  if v_row.id is null then raise exception 'Pendência não encontrada.' using errcode='P0002'; end if;
  return v_row;
end;
$$;

CREATE OR REPLACE FUNCTION public.set_process_responsibility_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if old.responsabilidade_atual is distinct from new.responsabilidade_atual then
    new.responsabilidade_desde := now();
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.try_acquire_automation_lock(p_lock_name text, p_owner_token text, p_lease_seconds integer DEFAULT 240) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_now timestamptz := now();
begin
  insert into public.automation_locks(lock_name, locked_until, owner_token, updated_at)
  values (
    p_lock_name,
    v_now + make_interval(secs => greatest(30, p_lease_seconds)),
    p_owner_token,
    v_now
  )
  on conflict (lock_name) do update
  set locked_until = excluded.locked_until,
      owner_token = excluded.owner_token,
      updated_at = excluded.updated_at
  where public.automation_locks.locked_until is null
     or public.automation_locks.locked_until < v_now
     or public.automation_locks.owner_token = p_owner_token;

  return exists (
    select 1
    from public.automation_locks
    where lock_name = p_lock_name
      and owner_token = p_owner_token
      and locked_until >= v_now
  );
end;
$$;

CREATE OR REPLACE FUNCTION public.update_process_management(p_process_id uuid, p_changes jsonb, p_reason text DEFAULT NULL::text) RETURNS public.processes
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth'
    AS $$
declare
  v_current public.processes;
  v_result public.processes;
  v_actor uuid := auth.uid();
  v_status text;
  v_resp text;
  v_action text;
  v_action_due timestamptz;
  v_open_obligations integer;
  v_open_pendencies integer;
  v_unknown_keys text[];
begin
  if not public.can_write_operational() then
    raise exception 'Usuário sem permissão operacional.' using errcode = '42501';
  end if;

  select * into v_current
  from public.processes
  where id = p_process_id
  for update;

  if v_current.id is null then
    raise exception 'Processo não encontrado.' using errcode = 'P0002';
  end if;

  select array_agg(k) into v_unknown_keys
  from jsonb_object_keys(coalesce(p_changes, '{}'::jsonb)) k
  where k not in (
    'status_operacional','responsabilidade_atual','proxima_acao','proxima_acao_responsavel_id',
    'proxima_acao_prazo','nivel_risco','exposicao_estimada','resumo_executivo','nota_executiva',
    'law_firm_id','lawyer_name','lawyer_email','motivo_encerramento'
  );

  if v_unknown_keys is not null then
    raise exception 'Campos não permitidos na gestão: %', array_to_string(v_unknown_keys, ', ')
      using errcode = '22023';
  end if;

  v_status := case when p_changes ? 'status_operacional'
    then nullif(p_changes->>'status_operacional','') else v_current.status_operacional end;
  v_resp := case when p_changes ? 'responsabilidade_atual'
    then nullif(p_changes->>'responsabilidade_atual','') else v_current.responsabilidade_atual end;
  v_action := case when p_changes ? 'proxima_acao'
    then nullif(trim(p_changes->>'proxima_acao'),'') else v_current.proxima_acao end;
  v_action_due := case when p_changes ? 'proxima_acao_prazo'
    then nullif(p_changes->>'proxima_acao_prazo','')::timestamptz else v_current.proxima_acao_prazo end;

  if v_action_due is not null and v_action is null then
    raise exception 'Prazo da próxima ação exige uma próxima ação informada.' using errcode = '22023';
  end if;

  -- Coerência mínima, sem impor uma sequência processual artificial.
  if v_status in ('AGUARDANDO_ESCRITORIO','EM_PREPARACAO_ESCRITORIO') and v_resp <> 'ESCRITORIO' then
    raise exception 'Status % exige responsabilidade atual ESCRITORIO.', v_status using errcode = '22023';
  end if;
  if v_status = 'AGUARDANDO_AREA_INTERNA' and v_resp <> 'OPERADORA' then
    raise exception 'AGUARDANDO_AREA_INTERNA exige responsabilidade atual OPERADORA.' using errcode = '22023';
  end if;
  if v_status = 'AGUARDANDO_DECISAO' and v_resp <> 'JUDICIARIO' then
    raise exception 'AGUARDANDO_DECISAO exige responsabilidade atual JUDICIARIO.' using errcode = '22023';
  end if;

  if v_status = 'ENCERRADO' then
    select count(*) into v_open_obligations
    from public.obligations
    where process_id = p_process_id
      and status not in ('CUMPRIDA','CONCLUIDA','CANCELADA','EXTINTA');

    select count(*) into v_open_pendencies
    from public.process_pendencies
    where process_id = p_process_id
      and status in ('ABERTA','EM_TRATAMENTO');

    if v_open_obligations > 0 or v_open_pendencies > 0 then
      raise exception 'Não é possível encerrar processo com % obrigação(ões) e % pendência(s) abertas.', v_open_obligations, v_open_pendencies
        using errcode = '22023';
    end if;
  end if;

  update public.processes p
  set
    status_operacional = case when p_changes ? 'status_operacional' then v_status else p.status_operacional end,
    responsabilidade_atual = case when p_changes ? 'responsabilidade_atual' then v_resp else p.responsabilidade_atual end,
    proxima_acao = case when p_changes ? 'proxima_acao' then v_action else p.proxima_acao end,
    proxima_acao_responsavel_id = case when p_changes ? 'proxima_acao_responsavel_id' then nullif(p_changes->>'proxima_acao_responsavel_id','')::uuid else p.proxima_acao_responsavel_id end,
    proxima_acao_prazo = case when p_changes ? 'proxima_acao_prazo' then v_action_due else p.proxima_acao_prazo end,
    nivel_risco = case when p_changes ? 'nivel_risco' then nullif(p_changes->>'nivel_risco','') else p.nivel_risco end,
    exposicao_estimada = case when p_changes ? 'exposicao_estimada' then nullif(p_changes->>'exposicao_estimada','')::numeric else p.exposicao_estimada end,
    resumo_executivo = case when p_changes ? 'resumo_executivo' then nullif(trim(p_changes->>'resumo_executivo'),'') else p.resumo_executivo end,
    nota_executiva = case when p_changes ? 'nota_executiva' then nullif(trim(p_changes->>'nota_executiva'),'') else p.nota_executiva end,
    law_firm_id = case when p_changes ? 'law_firm_id' then nullif(p_changes->>'law_firm_id','')::uuid else p.law_firm_id end,
    lawyer_name = case when p_changes ? 'lawyer_name' then nullif(trim(p_changes->>'lawyer_name'),'') else p.lawyer_name end,
    lawyer_email = case when p_changes ? 'lawyer_email' then nullif(trim(p_changes->>'lawyer_email'),'')::citext else p.lawyer_email end,
    motivo_encerramento = case when p_changes ? 'motivo_encerramento' then nullif(trim(p_changes->>'motivo_encerramento'),'') else p.motivo_encerramento end,
    concluido_em = case
      when p_changes ? 'status_operacional' and v_status = 'ENCERRADO' and p.status_operacional <> 'ENCERRADO' then now()
      when p_changes ? 'status_operacional' and v_status <> 'ENCERRADO' then null
      else p.concluido_em
    end,
    updated_by = v_actor,
    updated_at = now()
  where p.id = p_process_id
  returning * into v_result;

  if nullif(trim(coalesce(p_reason,'')),'') is not null then
    insert into public.process_operational_history(process_id, field_name, old_value, new_value, reason, changed_by, source)
    values(p_process_id, 'MOTIVO_ATUALIZACAO', null, null, trim(p_reason), v_actor, 'HUMANO');
  end if;

  return v_result;
end;
$$;

-- 10. VIEWS DA APLICAÇÃO
CREATE OR REPLACE VIEW public.v_dashboard_process_kpis WITH (security_invoker='true') AS
 SELECT count(*) FILTER (WHERE ((arquivado = false) AND (status_atual <> ALL (ARRAY['CONCLUIDA'::text, 'CANCELADA'::text])))) AS demandas_ativas,
    count(*) FILTER (WHERE ((arquivado = false) AND (status_atual = ANY (ARRAY['NOVA'::text, 'TRIAGEM'::text])))) AS novas_triagem,
    count(*) FILTER (WHERE ((arquivado = false) AND (upper(COALESCE(tutela_atual, ''::text)) ~~ 'DEFER%'::text))) AS tutelas_deferidas
   FROM public.processes;

CREATE OR REPLACE VIEW public.v_deadline_kpis AS
 SELECT count(*) FILTER (WHERE ((status = ANY (ARRAY['ABERTA'::text, 'PENDENTE'::text, 'EM_ANDAMENTO'::text])) AND (prazo IS NOT NULL) AND (prazo < now()))) AS vencidos,
    count(*) FILTER (WHERE ((status = ANY (ARRAY['ABERTA'::text, 'PENDENTE'::text, 'EM_ANDAMENTO'::text])) AND (prazo >= now()) AND (prazo <= (now() + '48:00:00'::interval)))) AS proximos_48h,
    count(*) FILTER (WHERE ((status = ANY (ARRAY['ABERTA'::text, 'PENDENTE'::text, 'EM_ANDAMENTO'::text])) AND (prazo > (now() + '48:00:00'::interval)))) AS dentro_prazo,
    count(*) FILTER (WHERE (status = ANY (ARRAY['ABERTA'::text, 'PENDENTE'::text, 'EM_ANDAMENTO'::text]))) AS total_controlado
   FROM public.obligations;

CREATE OR REPLACE VIEW public.v_panel_demand_category_summary AS
 WITH base AS (
         SELECT COALESCE(p.categoria_demanda, 'NAO_CLASSIFICADO'::text) AS categoria,
            count(*) AS quantidade
           FROM public.processes p
          WHERE (COALESCE(p.arquivado, false) = false)
          GROUP BY COALESCE(p.categoria_demanda, 'NAO_CLASSIFICADO'::text)
        ), totals AS (
         SELECT sum(base.quantidade) AS total
           FROM base
        )
 SELECT b.categoria,
    COALESCE(c.category_label,
        CASE
            WHEN (b.categoria = 'NAO_CLASSIFICADO'::text) THEN 'Não Classificado'::text
            ELSE initcap(replace(b.categoria, '_'::text, ' '::text))
        END) AS label,
    b.quantidade,
        CASE
            WHEN (t.total > (0)::numeric) THEN round((((b.quantidade)::numeric / t.total) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS percentual
   FROM ((base b
     CROSS JOIN totals t)
     LEFT JOIN ( SELECT DISTINCT demand_classification_catalog.category_code,
            demand_classification_catalog.category_label
           FROM public.demand_classification_catalog) c ON ((c.category_code = b.categoria)))
  ORDER BY b.quantidade DESC, COALESCE(c.category_label,
        CASE
            WHEN (b.categoria = 'NAO_CLASSIFICADO'::text) THEN 'Não Classificado'::text
            ELSE initcap(replace(b.categoria, '_'::text, ' '::text))
        END);

CREATE OR REPLACE VIEW public.v_panel_demand_subcategory_summary AS
 WITH base AS (
         SELECT COALESCE(p.categoria_demanda, 'NAO_CLASSIFICADO'::text) AS categoria,
            COALESCE(p.subcategoria_demanda, 'NAO_CLASSIFICADO'::text) AS subcategoria,
            count(*) AS quantidade
           FROM public.processes p
          WHERE (COALESCE(p.arquivado, false) = false)
          GROUP BY COALESCE(p.categoria_demanda, 'NAO_CLASSIFICADO'::text), COALESCE(p.subcategoria_demanda, 'NAO_CLASSIFICADO'::text)
        ), totals AS (
         SELECT base.categoria,
            sum(base.quantidade) AS total
           FROM base
          GROUP BY base.categoria
        )
 SELECT b.categoria,
    b.subcategoria,
    COALESCE(c.subcategory_label,
        CASE
            WHEN (b.subcategoria = 'NAO_CLASSIFICADO'::text) THEN 'Não Classificado'::text
            ELSE initcap(replace(b.subcategoria, '_'::text, ' '::text))
        END) AS label,
    b.quantidade,
        CASE
            WHEN (t.total > (0)::numeric) THEN round((((b.quantidade)::numeric / t.total) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS percentual
   FROM ((base b
     JOIN totals t USING (categoria))
     LEFT JOIN public.demand_classification_catalog c ON (((c.category_code = b.categoria) AND (c.subcategory_code = b.subcategoria))))
  ORDER BY b.categoria, b.quantidade DESC, COALESCE(c.subcategory_label,
        CASE
            WHEN (b.subcategoria = 'NAO_CLASSIFICADO'::text) THEN 'Não Classificado'::text
            ELSE initcap(replace(b.subcategoria, '_'::text, ' '::text))
        END);

CREATE OR REPLACE VIEW public.v_panel_email_metrics AS
 SELECT count(*) AS emails_captados_total,
    count(*) FILTER (WHERE (created_at >= date_trunc('day'::text, now()))) AS emails_captados_hoje,
    count(*) FILTER (WHERE (created_at >= (now() - '7 days'::interval))) AS emails_captados_7d,
    count(*) FILTER (WHERE (status = ANY (ARRAY['PROCESSADO'::text, 'IRRELEVANTE'::text]))) AS emails_tratados,
    count(*) FILTER (WHERE (status = 'PENDENTE_IA'::text)) AS emails_pendentes_ia,
    count(*) FILTER (WHERE (status = 'EXCECAO'::text)) AS emails_excecao,
    count(*) FILTER (WHERE (status = 'IRRELEVANTE'::text)) AS emails_irrelevantes
   FROM public.processed_emails;

CREATE OR REPLACE VIEW public.v_process_operational_state WITH (security_invoker='true') AS
 SELECT p.id AS process_id,
    p.status_operacional,
    p.responsabilidade_atual,
    p.responsabilidade_desde,
    p.proxima_acao,
    p.proxima_acao_prazo,
    p.nivel_risco,
    cfg.deadline_warning_days,
    cfg.pendency_warning_days,
    cfg.next_action_warning_days,
    cfg.law_firm_warning_days,
    cfg.law_firm_followup_grace_days,
    cfg.operator_stale_days,
    cfg.law_firm_stale_days,
    ob.id AS obligation_id,
    ob.prazo AS obligation_due_at,
    ob.criticidade AS obligation_criticality,
    pend.id AS pendency_id,
    pend.due_at AS pendency_due_at,
    pend.criticality AS pendency_criticality,
    pend.responsible_type AS pendency_responsible_type,
    firm.id AS open_law_firm_request_id,
    firm.expected_return_at AS law_firm_expected_return_at,
    COALESCE(firm.followup_count, 0) AS law_firm_followup_count,
        CASE
            WHEN ((firm.expected_return_at IS NOT NULL) AND (firm.expected_return_at < now())) THEN GREATEST(0, (floor((EXTRACT(epoch FROM (now() - firm.expected_return_at)) / (86400)::numeric)))::integer)
            ELSE 0
        END AS law_firm_days_overdue,
    ((ob.prazo IS NOT NULL) AND (ob.prazo < now())) AS obligation_overdue,
    ((ob.prazo IS NOT NULL) AND (ob.prazo >= now()) AND (ob.prazo <= (now() + make_interval(days => cfg.deadline_warning_days)))) AS obligation_due_soon,
    ((pend.due_at IS NOT NULL) AND (pend.due_at < now())) AS pendency_overdue,
    ((pend.due_at IS NOT NULL) AND (pend.due_at >= now()) AND (pend.due_at <= (now() + make_interval(days => cfg.pendency_warning_days)))) AS pendency_due_soon,
    ((p.proxima_acao_prazo IS NOT NULL) AND (p.proxima_acao_prazo < now())) AS next_action_overdue,
    ((p.proxima_acao_prazo IS NOT NULL) AND (p.proxima_acao_prazo >= now()) AND (p.proxima_acao_prazo <= (now() + make_interval(days => cfg.next_action_warning_days)))) AS next_action_due_soon,
    ((firm.expected_return_at IS NOT NULL) AND (firm.expected_return_at < now())) AS law_firm_sla_overdue,
    ((firm.expected_return_at IS NOT NULL) AND (firm.expected_return_at >= now()) AND (firm.expected_return_at <= (now() + make_interval(days => cfg.law_firm_warning_days)))) AS law_firm_sla_due_soon,
    ((firm.expected_return_at IS NOT NULL) AND ((firm.expected_return_at + make_interval(days => cfg.law_firm_followup_grace_days)) < now())) AS law_firm_followup_due,
    ((p.responsabilidade_atual = 'OPERADORA'::text) AND (p.responsabilidade_desde IS NOT NULL) AND (p.responsabilidade_desde < (now() - make_interval(days => cfg.operator_stale_days))) AND (p.status_operacional <> ALL (ARRAY['NAO_CLASSIFICADO'::text, 'RECEBIDO'::text, 'ENCERRADO'::text, 'SUSPENSO'::text]))) AS operator_stale,
    ((p.responsabilidade_atual = 'ESCRITORIO'::text) AND (p.responsabilidade_desde IS NOT NULL) AND (p.responsabilidade_desde < (now() - make_interval(days => cfg.law_firm_stale_days))) AND (p.status_operacional <> ALL (ARRAY['NAO_CLASSIFICADO'::text, 'ENCERRADO'::text, 'SUSPENSO'::text]))) AS law_firm_stale,
        CASE
            WHEN (p.status_operacional = 'ENCERRADO'::text) THEN 'VERDE'::text
            WHEN ((p.nivel_risco = 'CRITICO'::text) OR ((ob.prazo IS NOT NULL) AND (ob.prazo < now())) OR ((pend.due_at IS NOT NULL) AND (pend.due_at < now())) OR ((p.proxima_acao_prazo IS NOT NULL) AND (p.proxima_acao_prazo < now())) OR ((firm.expected_return_at IS NOT NULL) AND (firm.expected_return_at < now()))) THEN 'VERMELHO'::text
            WHEN ((p.nivel_risco = 'ALTO'::text) OR ((ob.prazo IS NOT NULL) AND (ob.prazo >= now()) AND (ob.prazo <= (now() + make_interval(days => cfg.deadline_warning_days)))) OR ((pend.due_at IS NOT NULL) AND (pend.due_at >= now()) AND (pend.due_at <= (now() + make_interval(days => cfg.pendency_warning_days)))) OR ((p.proxima_acao_prazo IS NOT NULL) AND (p.proxima_acao_prazo >= now()) AND (p.proxima_acao_prazo <= (now() + make_interval(days => cfg.next_action_warning_days)))) OR ((firm.expected_return_at IS NOT NULL) AND (firm.expected_return_at >= now()) AND (firm.expected_return_at <= (now() + make_interval(days => cfg.law_firm_warning_days)))) OR ((p.responsabilidade_atual = 'OPERADORA'::text) AND (p.responsabilidade_desde IS NOT NULL) AND (p.responsabilidade_desde < (now() - make_interval(days => cfg.operator_stale_days))) AND (p.status_operacional <> ALL (ARRAY['NAO_CLASSIFICADO'::text, 'RECEBIDO'::text, 'ENCERRADO'::text, 'SUSPENSO'::text]))) OR ((p.responsabilidade_atual = 'ESCRITORIO'::text) AND (p.responsabilidade_desde IS NOT NULL) AND (p.responsabilidade_desde < (now() - make_interval(days => cfg.law_firm_stale_days))) AND (p.status_operacional <> ALL (ARRAY['NAO_CLASSIFICADO'::text, 'ENCERRADO'::text, 'SUSPENSO'::text]))) OR ((p.responsabilidade_atual = 'SEM_RESPONSAVEL'::text) AND (p.status_operacional <> ALL (ARRAY['NAO_CLASSIFICADO'::text, 'RECEBIDO'::text, 'EM_TRIAGEM'::text, 'ENCERRADO'::text])))) THEN 'AMARELO'::text
            ELSE 'VERDE'::text
        END AS semaforo_operacional,
    array_remove(ARRAY[
        CASE
            WHEN (p.nivel_risco = 'CRITICO'::text) THEN 'RISCO_CRITICO'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (p.nivel_risco = 'ALTO'::text) THEN 'RISCO_ALTO'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((ob.prazo IS NOT NULL) AND (ob.prazo < now())) THEN 'OBRIGACAO_VENCIDA'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((ob.prazo IS NOT NULL) AND (ob.prazo >= now()) AND (ob.prazo <= (now() + make_interval(days => cfg.deadline_warning_days)))) THEN 'OBRIGACAO_PROXIMA'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((pend.due_at IS NOT NULL) AND (pend.due_at < now())) THEN 'PENDENCIA_VENCIDA'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((pend.due_at IS NOT NULL) AND (pend.due_at >= now()) AND (pend.due_at <= (now() + make_interval(days => cfg.pendency_warning_days)))) THEN 'PENDENCIA_PROXIMA'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((p.proxima_acao_prazo IS NOT NULL) AND (p.proxima_acao_prazo < now())) THEN 'PROXIMA_ACAO_VENCIDA'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((p.proxima_acao_prazo IS NOT NULL) AND (p.proxima_acao_prazo >= now()) AND (p.proxima_acao_prazo <= (now() + make_interval(days => cfg.next_action_warning_days)))) THEN 'PROXIMA_ACAO_PROXIMA'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((firm.expected_return_at IS NOT NULL) AND (firm.expected_return_at < now())) THEN 'SLA_ESCRITORIO_VENCIDO'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((firm.expected_return_at IS NOT NULL) AND (firm.expected_return_at >= now()) AND (firm.expected_return_at <= (now() + make_interval(days => cfg.law_firm_warning_days)))) THEN 'SLA_ESCRITORIO_PROXIMO'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((firm.expected_return_at IS NOT NULL) AND ((firm.expected_return_at + make_interval(days => cfg.law_firm_followup_grace_days)) < now())) THEN 'FOLLOWUP_ESCRITORIO_DEVIDO'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((p.responsabilidade_atual = 'OPERADORA'::text) AND (p.responsabilidade_desde IS NOT NULL) AND (p.responsabilidade_desde < (now() - make_interval(days => cfg.operator_stale_days))) AND (p.status_operacional <> ALL (ARRAY['NAO_CLASSIFICADO'::text, 'RECEBIDO'::text, 'ENCERRADO'::text, 'SUSPENSO'::text]))) THEN 'PARADO_OPERADORA'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((p.responsabilidade_atual = 'ESCRITORIO'::text) AND (p.responsabilidade_desde IS NOT NULL) AND (p.responsabilidade_desde < (now() - make_interval(days => cfg.law_firm_stale_days))) AND (p.status_operacional <> ALL (ARRAY['NAO_CLASSIFICADO'::text, 'ENCERRADO'::text, 'SUSPENSO'::text]))) THEN 'PARADO_ESCRITORIO'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((p.responsabilidade_atual = 'SEM_RESPONSAVEL'::text) AND (p.status_operacional <> ALL (ARRAY['NAO_CLASSIFICADO'::text, 'RECEBIDO'::text, 'EM_TRIAGEM'::text, 'ENCERRADO'::text]))) THEN 'SEM_RESPONSAVEL'::text
            ELSE NULL::text
        END], NULL::text) AS alert_codes
   FROM ((((public.processes p
     CROSS JOIN public.operational_rules_config cfg)
     LEFT JOIN LATERAL ( SELECT o.id,
            o.process_id,
            o.descricao,
            o.prazo,
            o.status,
            o.tipo_prazo,
            o.origem_prazo,
            o.evento_gerador,
            o.criticidade,
            o.responsavel_id,
            o.valor_multa_diaria,
            o.observacoes,
            o.created_at,
            o.created_by,
            o.updated_at,
            o.concluido_em,
            o.valor_multa_limite
           FROM public.obligations o
          WHERE ((o.process_id = p.id) AND (o.status <> ALL (ARRAY['CUMPRIDA'::text, 'CONCLUIDA'::text, 'CANCELADA'::text, 'EXTINTA'::text])))
          ORDER BY
                CASE
                    WHEN (o.prazo < now()) THEN 0
                    WHEN (o.prazo IS NOT NULL) THEN 1
                    ELSE 2
                END, o.prazo, o.created_at DESC
         LIMIT 1) ob ON (true))
     LEFT JOIN LATERAL ( SELECT pp.id,
            pp.process_id,
            pp.type,
            pp.description,
            pp.responsible_type,
            pp.responsible_user_id,
            pp.opened_at,
            pp.due_at,
            pp.resolved_at,
            pp.status,
            pp.criticality,
            pp.source,
            pp.created_by,
            pp.created_at,
            pp.updated_at
           FROM public.process_pendencies pp
          WHERE ((pp.process_id = p.id) AND (pp.status = ANY (ARRAY['ABERTA'::text, 'EM_TRATAMENTO'::text])))
          ORDER BY
                CASE
                    WHEN (pp.due_at < now()) THEN 0
                    WHEN (pp.due_at IS NOT NULL) THEN 1
                    ELSE 2
                END,
                CASE pp.criticality
                    WHEN 'URGENTE'::text THEN 0
                    WHEN 'ALTA'::text THEN 1
                    WHEN 'MEDIA'::text THEN 2
                    ELSE 3
                END, pp.due_at, pp.opened_at
         LIMIT 1) pend ON (true))
     LEFT JOIN LATERAL ( SELECT i.id,
            i.sent_at,
            i.expected_return_at,
            ( SELECT (count(*))::integer AS count
                   FROM public.process_law_firm_interactions c
                  WHERE ((c.response_to_interaction_id = i.id) AND (c.interaction_type = 'COBRANCA'::text))) AS followup_count
           FROM public.process_law_firm_interactions i
          WHERE ((i.process_id = p.id) AND (i.interaction_type = 'ENVIO'::text) AND (i.received_at IS NULL))
          ORDER BY i.expected_return_at, i.created_at
         LIMIT 1) firm ON (true));

CREATE OR REPLACE VIEW public.v_panel_executive_kpis WITH (security_invoker='true') AS
 WITH cfg AS (
         SELECT operational_rules_config.id,
            operational_rules_config.deadline_warning_days,
            operational_rules_config.pendency_warning_days,
            operational_rules_config.next_action_warning_days,
            operational_rules_config.law_firm_default_sla_days,
            operational_rules_config.law_firm_warning_days,
            operational_rules_config.law_firm_followup_grace_days,
            operational_rules_config.operator_stale_days,
            operational_rules_config.law_firm_stale_days,
            operational_rules_config.updated_by,
            operational_rules_config.updated_at
           FROM public.operational_rules_config
          WHERE (operational_rules_config.id = 1)
        ), active_processes AS (
         SELECT p.id,
            p.numero_processo,
            p.protocolo_externo,
            p.origem,
            p.natureza,
            p.fase_processual,
            p.tutela_atual,
            p.company_id,
            p.municipio,
            p.comarca,
            p.uf,
            p.situacao_beneficiario,
            p.valor_causa,
            p.tipo_demanda,
            p.subtipo_demanda,
            p.objeto_demanda,
            p.responsavel_id,
            p.prioridade,
            p.status_atual,
            p.recebido_em,
            p.aberto_em,
            p.concluido_em,
            p.ultimo_evento_em,
            p.arquivado,
            p.arquivado_em,
            p.cadastro_incompleto,
            p.pendencias,
            p.created_at,
            p.created_by,
            p.updated_at,
            p.updated_by,
            p.status_operacional,
            p.responsabilidade_atual,
            p.responsabilidade_desde,
            p.proxima_acao,
            p.proxima_acao_responsavel_id,
            p.proxima_acao_prazo,
            p.nivel_risco,
            p.exposicao_estimada,
            p.resumo_executivo,
            p.nota_executiva,
            p.data_entrada_juridico,
            p.data_entrada_juridico_inferida,
            p.origem_demanda,
            p.origem_demanda_inferida,
            p.law_firm_id,
            p.lawyer_name,
            p.lawyer_email,
            p.motivo_encerramento
           FROM public.processes p
          WHERE ((COALESCE(p.arquivado, false) = false) AND (p.status_operacional <> 'ENCERRADO'::text))
        ), active_state AS (
         SELECT st.process_id,
            st.status_operacional,
            st.responsabilidade_atual,
            st.responsabilidade_desde,
            st.proxima_acao,
            st.proxima_acao_prazo,
            st.nivel_risco,
            st.deadline_warning_days,
            st.pendency_warning_days,
            st.next_action_warning_days,
            st.law_firm_warning_days,
            st.law_firm_followup_grace_days,
            st.operator_stale_days,
            st.law_firm_stale_days,
            st.obligation_id,
            st.obligation_due_at,
            st.obligation_criticality,
            st.pendency_id,
            st.pendency_due_at,
            st.pendency_criticality,
            st.pendency_responsible_type,
            st.open_law_firm_request_id,
            st.law_firm_expected_return_at,
            st.law_firm_followup_count,
            st.law_firm_days_overdue,
            st.obligation_overdue,
            st.obligation_due_soon,
            st.pendency_overdue,
            st.pendency_due_soon,
            st.next_action_overdue,
            st.next_action_due_soon,
            st.law_firm_sla_overdue,
            st.law_firm_sla_due_soon,
            st.law_firm_followup_due,
            st.operator_stale,
            st.law_firm_stale,
            st.semaforo_operacional,
            st.alert_codes
           FROM (public.v_process_operational_state st
             JOIN active_processes p ON ((p.id = st.process_id)))
        ), closed_this_month AS (
         SELECT count(DISTINCT h.process_id) AS quantidade
           FROM public.process_operational_history h
          WHERE ((h.field_name = 'status_operacional'::text) AND (h.new_value = 'ENCERRADO'::text) AND (h.changed_at >= date_trunc('month'::text, now())) AND (h.changed_at < (date_trunc('month'::text, now()) + '1 mon'::interval)))
        )
 SELECT ( SELECT count(*) AS count
           FROM active_processes) AS processos_ativos,
    ( SELECT count(*) AS count
           FROM active_state
          WHERE (active_state.semaforo_operacional = 'VERMELHO'::text)) AS processos_vermelhos,
    ( SELECT count(*) AS count
           FROM active_state
          WHERE (active_state.semaforo_operacional = 'AMARELO'::text)) AS processos_amarelos,
    ( SELECT count(*) AS count
           FROM active_processes
          WHERE (active_processes.responsabilidade_atual = 'ESCRITORIO'::text)) AS aguardando_escritorio,
    ( SELECT count(*) AS count
           FROM active_processes
          WHERE (active_processes.status_operacional = 'AGUARDANDO_AREA_INTERNA'::text)) AS aguardando_area_interna,
    ( SELECT count(*) AS count
           FROM (public.obligations o
             JOIN active_processes p ON ((p.id = o.process_id)))
          WHERE (o.status <> ALL (ARRAY['CUMPRIDA'::text, 'CONCLUIDA'::text, 'CANCELADA'::text, 'EXTINTA'::text]))) AS obrigacoes_pendentes,
    ( SELECT count(*) AS count
           FROM ((public.obligations o
             JOIN active_processes p ON ((p.id = o.process_id)))
             CROSS JOIN cfg)
          WHERE ((o.status <> ALL (ARRAY['CUMPRIDA'::text, 'CONCLUIDA'::text, 'CANCELADA'::text, 'EXTINTA'::text])) AND (o.prazo IS NOT NULL) AND (o.prazo <= (now() + make_interval(days => cfg.deadline_warning_days))))) AS prazos_criticos,
    ( SELECT count(*) AS count
           FROM active_processes
          WHERE (active_processes.nivel_risco = ANY (ARRAY['ALTO'::text, 'CRITICO'::text]))) AS alto_risco,
    (COALESCE(( SELECT sum(active_processes.valor_causa) AS sum
           FROM active_processes), (0)::numeric))::numeric(18,2) AS valor_envolvido,
    (COALESCE(( SELECT sum(active_processes.exposicao_estimada) AS sum
           FROM active_processes), (0)::numeric))::numeric(18,2) AS exposicao_estimada,
    ( SELECT closed_this_month.quantidade
           FROM closed_this_month) AS encerrados_mes,
    ( SELECT count(*) AS count
           FROM active_processes
          WHERE ((active_processes.status_operacional = 'NAO_CLASSIFICADO'::text) OR (active_processes.nivel_risco = 'NAO_CLASSIFICADO'::text) OR (active_processes.responsabilidade_atual = 'SEM_RESPONSAVEL'::text))) AS classificacao_pendente,
    ( SELECT count(*) AS count
           FROM (public.process_pendencies pp
             JOIN active_processes p ON ((p.id = pp.process_id)))
          WHERE (pp.status = ANY (ARRAY['ABERTA'::text, 'EM_TRATAMENTO'::text]))) AS pendencias_abertas,
    ( SELECT count(*) AS count
           FROM (public.process_pendencies pp
             JOIN active_processes p ON ((p.id = pp.process_id)))
          WHERE ((pp.status = ANY (ARRAY['ABERTA'::text, 'EM_TRATAMENTO'::text])) AND (pp.due_at IS NOT NULL) AND (pp.due_at < now()))) AS pendencias_vencidas,
    ( SELECT count(*) AS count
           FROM (public.process_law_firm_interactions i
             JOIN active_processes p ON ((p.id = i.process_id)))
          WHERE ((i.interaction_type = 'ENVIO'::text) AND (i.received_at IS NULL))) AS slas_escritorio_abertos,
    ( SELECT count(*) AS count
           FROM (public.process_law_firm_interactions i
             JOIN active_processes p ON ((p.id = i.process_id)))
          WHERE ((i.interaction_type = 'ENVIO'::text) AND (i.received_at IS NULL) AND (i.expected_return_at IS NOT NULL) AND (i.expected_return_at < now()))) AS slas_escritorio_vencidos;

CREATE OR REPLACE VIEW public.v_panel_operational_health WITH (security_invoker='true') AS
 SELECT ( SELECT count(*) AS count
           FROM public.processed_emails
          WHERE (processed_emails.status = 'PROCESSADO'::text)) AS emails_processados,
    ( SELECT count(*) AS count
           FROM public.processed_emails
          WHERE (processed_emails.status = ANY (ARRAY['PENDENTE'::text, 'PENDENTE_IA'::text]))) AS emails_pendentes,
    ( SELECT count(*) AS count
           FROM public.email_exceptions
          WHERE (email_exceptions.status = ANY (ARRAY['ABERTA'::text, 'PENDENTE'::text]))) AS excecoes_abertas,
    ( SELECT count(*) AS count
           FROM public.processed_emails
          WHERE (processed_emails.status = 'IRRELEVANTE'::text)) AS emails_irrelevantes,
    COALESCE(( SELECT sum(ai_usage_daily.requests_count) AS sum
           FROM public.ai_usage_daily
          WHERE (ai_usage_daily.usage_date = CURRENT_DATE)), (0)::bigint) AS chamadas_ia_hoje;

CREATE OR REPLACE VIEW public.v_panel_priority_processes WITH (security_invoker='true') AS
 SELECT p.id,
    p.numero_processo,
    p.objeto_demanda,
    p.tipo_demanda,
    p.comarca,
    p.uf,
    p.status_operacional,
    p.responsabilidade_atual,
    p.nivel_risco,
    p.proxima_acao,
    p.proxima_acao_prazo,
    p.valor_causa,
    p.exposicao_estimada,
    p.updated_at,
    st.semaforo_operacional,
    st.alert_codes,
    st.obligation_due_at,
    st.pendency_due_at,
    st.law_firm_expected_return_at,
    st.law_firm_days_overdue,
        CASE st.semaforo_operacional
            WHEN 'VERMELHO'::text THEN 1
            WHEN 'AMARELO'::text THEN 2
            ELSE 3
        END AS prioridade_ordem,
    LEAST(COALESCE(st.obligation_due_at, 'infinity'::timestamp with time zone), COALESCE(st.pendency_due_at, 'infinity'::timestamp with time zone), COALESCE(p.proxima_acao_prazo, 'infinity'::timestamp with time zone), COALESCE(st.law_firm_expected_return_at, 'infinity'::timestamp with time zone)) AS proximo_marco
   FROM (public.processes p
     JOIN public.v_process_operational_state st ON ((st.process_id = p.id)))
  WHERE ((COALESCE(p.arquivado, false) = false) AND (p.status_operacional <> 'ENCERRADO'::text));

CREATE OR REPLACE VIEW public.v_panel_responsibility_summary WITH (security_invoker='true') AS
 WITH categories(responsabilidade, ordem) AS (
         VALUES ('OPERADORA'::text,1), ('ESCRITORIO'::text,2), ('JUDICIARIO'::text,3), ('TERCEIRO'::text,4), ('SEM_RESPONSAVEL'::text,5)
        )
 SELECT c.responsabilidade,
    count(p.id) AS quantidade,
    c.ordem
   FROM (categories c
     LEFT JOIN public.processes p ON (((p.responsabilidade_atual = c.responsabilidade) AND (COALESCE(p.arquivado, false) = false) AND (p.status_operacional <> 'ENCERRADO'::text))))
  GROUP BY c.responsabilidade, c.ordem
  ORDER BY c.ordem;

CREATE OR REPLACE VIEW public.v_panel_risk_summary WITH (security_invoker='true') AS
 WITH active_state AS (
         SELECT st.process_id,
            st.status_operacional,
            st.responsabilidade_atual,
            st.responsabilidade_desde,
            st.proxima_acao,
            st.proxima_acao_prazo,
            st.nivel_risco,
            st.deadline_warning_days,
            st.pendency_warning_days,
            st.next_action_warning_days,
            st.law_firm_warning_days,
            st.law_firm_followup_grace_days,
            st.operator_stale_days,
            st.law_firm_stale_days,
            st.obligation_id,
            st.obligation_due_at,
            st.obligation_criticality,
            st.pendency_id,
            st.pendency_due_at,
            st.pendency_criticality,
            st.pendency_responsible_type,
            st.open_law_firm_request_id,
            st.law_firm_expected_return_at,
            st.law_firm_followup_count,
            st.law_firm_days_overdue,
            st.obligation_overdue,
            st.obligation_due_soon,
            st.pendency_overdue,
            st.pendency_due_soon,
            st.next_action_overdue,
            st.next_action_due_soon,
            st.law_firm_sla_overdue,
            st.law_firm_sla_due_soon,
            st.law_firm_followup_due,
            st.operator_stale,
            st.law_firm_stale,
            st.semaforo_operacional,
            st.alert_codes
           FROM (public.v_process_operational_state st
             JOIN public.processes p ON ((p.id = st.process_id)))
          WHERE ((COALESCE(p.arquivado, false) = false) AND (p.status_operacional <> 'ENCERRADO'::text))
        ), categories(categoria, ordem) AS (
         VALUES ('VERMELHO'::text,1), ('AMARELO'::text,2), ('VERDE'::text,3)
        )
 SELECT c.categoria,
    count(s.process_id) AS quantidade,
    c.ordem
   FROM (categories c
     LEFT JOIN active_state s ON ((s.semaforo_operacional = c.categoria)))
  GROUP BY c.categoria, c.ordem
  ORDER BY c.ordem;

CREATE OR REPLACE VIEW public.v_process_list AS
 SELECT p.id,
    p.numero_processo,
    p.protocolo_externo,
    p.origem,
    p.natureza,
    p.fase_processual,
    p.tutela_atual,
    p.company_id,
    p.municipio,
    p.comarca,
    p.uf,
    p.situacao_beneficiario,
    p.valor_causa,
    p.tipo_demanda,
    p.subtipo_demanda,
    p.objeto_demanda,
    p.responsavel_id,
    p.prioridade,
    p.status_atual,
    p.recebido_em,
    p.aberto_em,
    p.concluido_em,
    p.ultimo_evento_em,
    p.arquivado,
    p.arquivado_em,
    p.cadastro_incompleto,
    p.pendencias,
    p.created_at,
    p.created_by,
    p.updated_at,
    p.updated_by,
    c.nome AS company_name,
    u.display_name AS responsavel_name,
    ( SELECT pp.nome
           FROM public.process_parties pp
          WHERE (pp.process_id = p.id)
          ORDER BY pp.principal DESC, pp.created_at
         LIMIT 1) AS autor_principal,
    ( SELECT o.prazo
           FROM public.obligations o
          WHERE ((o.process_id = p.id) AND (o.status = ANY (ARRAY['ABERTA'::text, 'PENDENTE'::text, 'EM_ANDAMENTO'::text])) AND (o.prazo IS NOT NULL))
          ORDER BY o.prazo
         LIMIT 1) AS proximo_prazo
   FROM ((public.processes p
     LEFT JOIN public.companies c ON ((c.id = p.company_id)))
     LEFT JOIN public.user_profiles u ON ((u.id = p.responsavel_id)));

CREATE OR REPLACE VIEW public.v_process_management WITH (security_invoker='true') AS
 SELECT p.id,
    p.numero_processo,
    p.protocolo_externo,
    p.status_atual,
    p.status_operacional,
    p.responsabilidade_atual,
    p.responsabilidade_desde,
        CASE
            WHEN (p.responsabilidade_desde IS NULL) THEN NULL::integer
            ELSE (floor((EXTRACT(epoch FROM (now() - p.responsabilidade_desde)) / (86400)::numeric)))::integer
        END AS dias_com_responsavel_atual,
    p.proxima_acao,
    p.proxima_acao_responsavel_id,
    p.proxima_acao_prazo,
    p.nivel_risco,
    p.valor_causa,
    p.exposicao_estimada,
    p.tutela_atual,
    p.fase_processual,
    p.resumo_executivo,
    p.nota_executiva,
    p.data_entrada_juridico,
    p.data_entrada_juridico_inferida,
    p.origem_demanda,
    p.origem_demanda_inferida,
    p.company_id,
    p.law_firm_id,
    lf.nome AS law_firm_nome,
    p.lawyer_name,
    p.lawyer_email,
    p.prioridade,
    p.arquivado,
    p.updated_at,
    st.obligation_id AS obrigacao_critica_id,
    ob.descricao AS obrigacao_critica_descricao,
    st.obligation_due_at AS obrigacao_critica_prazo,
    st.obligation_criticality AS obrigacao_critica_criticidade,
    st.pendency_id AS pendencia_critica_id,
    pend.description AS pendencia_critica_descricao,
    st.pendency_due_at AS pendencia_critica_prazo,
    st.pendency_responsible_type AS pendencia_critica_responsavel,
    st.law_firm_expected_return_at AS escritorio_retorno_esperado,
    firm.sent_at AS escritorio_ultimo_envio,
    st.law_firm_followup_count AS escritorio_followups_abertos,
    st.law_firm_days_overdue AS escritorio_dias_atraso,
    st.law_firm_followup_due AS escritorio_followup_devido,
    st.next_action_overdue AS proxima_acao_vencida,
    st.next_action_due_soon AS proxima_acao_proxima,
    st.operator_stale AS operadora_parada,
    st.law_firm_stale AS escritorio_parado,
    st.alert_codes,
    st.semaforo_operacional
   FROM (((((public.processes p
     JOIN public.v_process_operational_state st ON ((st.process_id = p.id)))
     LEFT JOIN public.law_firms lf ON ((lf.id = p.law_firm_id)))
     LEFT JOIN public.obligations ob ON ((ob.id = st.obligation_id)))
     LEFT JOIN public.process_pendencies pend ON ((pend.id = st.pendency_id)))
     LEFT JOIN public.process_law_firm_interactions firm ON ((firm.id = st.open_law_firm_request_id)));

-- 11. TRIGGERS
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
DROP TRIGGER IF EXISTS trg_access_invites_updated_at ON public.access_invites;
CREATE TRIGGER trg_access_invites_updated_at BEFORE UPDATE ON public.access_invites FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_ai_management_suggestions_updated_at ON public.ai_management_suggestions;
CREATE TRIGGER trg_ai_management_suggestions_updated_at BEFORE UPDATE ON public.ai_management_suggestions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_ai_usage_daily_updated_at ON public.ai_usage_daily;
CREATE TRIGGER trg_ai_usage_daily_updated_at BEFORE UPDATE ON public.ai_usage_daily FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_companies_normalize ON public.companies;
CREATE TRIGGER trg_companies_normalize BEFORE INSERT OR UPDATE OF nome, cnpj ON public.companies FOR EACH ROW EXECUTE FUNCTION public.normalize_company_fields();
DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_company_aliases_normalize ON public.company_aliases;
CREATE TRIGGER trg_company_aliases_normalize BEFORE INSERT OR UPDATE OF alias ON public.company_aliases FOR EACH ROW EXECUTE FUNCTION public.company_aliases_normalize_before_write();
DROP TRIGGER IF EXISTS trg_email_exceptions_updated_at ON public.email_exceptions;
CREATE TRIGGER trg_email_exceptions_updated_at BEFORE UPDATE ON public.email_exceptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_email_keyword_rules_updated_at ON public.email_keyword_rules;
CREATE TRIGGER trg_email_keyword_rules_updated_at BEFORE UPDATE ON public.email_keyword_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_email_sender_rules_updated_at ON public.email_sender_rules;
CREATE TRIGGER trg_email_sender_rules_updated_at BEFORE UPDATE ON public.email_sender_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_email_sync_state_updated_at ON public.email_sync_state;
CREATE TRIGGER trg_email_sync_state_updated_at BEFORE UPDATE ON public.email_sync_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_law_firms_updated_at ON public.law_firms;
CREATE TRIGGER trg_law_firms_updated_at BEFORE UPDATE ON public.law_firms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_obligations_updated_at ON public.obligations;
CREATE TRIGGER trg_obligations_updated_at BEFORE UPDATE ON public.obligations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_process_law_firm_interactions_updated_at ON public.process_law_firm_interactions;
CREATE TRIGGER trg_process_law_firm_interactions_updated_at BEFORE UPDATE ON public.process_law_firm_interactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_process_pendencies_updated_at ON public.process_pendencies;
CREATE TRIGGER trg_process_pendencies_updated_at BEFORE UPDATE ON public.process_pendencies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_processed_emails_updated_at ON public.processed_emails;
CREATE TRIGGER trg_processed_emails_updated_at BEFORE UPDATE ON public.processed_emails FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_processes_operational_history ON public.processes;
CREATE TRIGGER trg_processes_operational_history AFTER UPDATE OF status_operacional, proxima_acao, proxima_acao_prazo, nivel_risco, law_firm_id ON public.processes FOR EACH ROW EXECUTE FUNCTION public.audit_process_operational_changes();
DROP TRIGGER IF EXISTS trg_processes_responsibility_history ON public.processes;
CREATE TRIGGER trg_processes_responsibility_history AFTER UPDATE OF responsabilidade_atual ON public.processes FOR EACH ROW EXECUTE FUNCTION public.audit_process_responsibility_change();
DROP TRIGGER IF EXISTS trg_processes_responsibility_timestamp ON public.processes;
CREATE TRIGGER trg_processes_responsibility_timestamp BEFORE UPDATE OF responsabilidade_atual ON public.processes FOR EACH ROW EXECUTE FUNCTION public.set_process_responsibility_timestamp();
DROP TRIGGER IF EXISTS trg_processes_updated_at ON public.processes;
CREATE TRIGGER trg_processes_updated_at BEFORE UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_system_config_updated_at ON public.system_config;
CREATE TRIGGER trg_system_config_updated_at BEFORE UPDATE ON public.system_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 12. HABILITAÇÃO DE ROW LEVEL SECURITY
ALTER TABLE public.access_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_demand_classification_backfill_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_management_refresh_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_management_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_minute ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_resolution_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_resolution_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_classification_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_account_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_keyword_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_processing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sender_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.law_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_nature_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_rules_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_law_firm_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_operational_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_pendencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_responsibility_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;


-- 13. POLÍTICAS DE ACESSO (RLS)
DROP POLICY IF EXISTS access_invites_admin_all ON public.access_invites;
CREATE POLICY access_invites_admin_all ON public.access_invites TO authenticated USING (public.can_manage_admin()) WITH CHECK (public.can_manage_admin());
DROP POLICY IF EXISTS ai_management_refresh_queue_select_active_user ON public.ai_management_refresh_queue;
CREATE POLICY ai_management_refresh_queue_select_active_user ON public.ai_management_refresh_queue FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true)))));
DROP POLICY IF EXISTS ai_management_suggestions_select ON public.ai_management_suggestions;
CREATE POLICY ai_management_suggestions_select ON public.ai_management_suggestions FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS ai_usage_admin_select ON public.ai_usage_daily;
CREATE POLICY ai_usage_admin_select ON public.ai_usage_daily FOR SELECT TO authenticated USING ((public.current_app_role() = ANY (ARRAY['ADMIN'::public.app_role, 'GESTOR'::public.app_role])));
DROP POLICY IF EXISTS ai_usage_minute_select_active_user ON public.ai_usage_minute;
CREATE POLICY ai_usage_minute_select_active_user ON public.ai_usage_minute FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true)))));
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING ((public.current_app_role() = ANY (ARRAY['ADMIN'::public.app_role, 'GESTOR'::public.app_role])));
DROP POLICY IF EXISTS companies_select ON public.companies;
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS companies_write ON public.companies;
CREATE POLICY companies_write ON public.companies TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS company_aliases_select ON public.company_aliases;
CREATE POLICY company_aliases_select ON public.company_aliases FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS company_aliases_write ON public.company_aliases;
CREATE POLICY company_aliases_write ON public.company_aliases TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS company_resolution_audit_select ON public.company_resolution_audit;
CREATE POLICY company_resolution_audit_select ON public.company_resolution_audit FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS company_resolution_candidates_select ON public.company_resolution_candidates;
CREATE POLICY company_resolution_candidates_select ON public.company_resolution_candidates FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS company_resolution_candidates_write ON public.company_resolution_candidates;
CREATE POLICY company_resolution_candidates_write ON public.company_resolution_candidates TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS demand_classification_catalog_read ON public.demand_classification_catalog;
CREATE POLICY demand_classification_catalog_read ON public.demand_classification_catalog FOR SELECT TO authenticated USING ((active = true));
DROP POLICY IF EXISTS email_account_config_admin_select ON public.email_account_config;
CREATE POLICY email_account_config_admin_select ON public.email_account_config FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.role = 'ADMIN'::public.app_role)))));
DROP POLICY IF EXISTS email_exceptions_select ON public.email_exceptions;
CREATE POLICY email_exceptions_select ON public.email_exceptions FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS email_exceptions_write ON public.email_exceptions;
CREATE POLICY email_exceptions_write ON public.email_exceptions TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS email_sync_admin_select ON public.email_sync_state;
CREATE POLICY email_sync_admin_select ON public.email_sync_state FOR SELECT TO authenticated USING ((public.current_app_role() = ANY (ARRAY['ADMIN'::public.app_role, 'GESTOR'::public.app_role])));
DROP POLICY IF EXISTS keyword_rules_admin_write ON public.email_keyword_rules;
CREATE POLICY keyword_rules_admin_write ON public.email_keyword_rules TO authenticated USING (public.can_manage_admin()) WITH CHECK (public.can_manage_admin());
DROP POLICY IF EXISTS keyword_rules_select ON public.email_keyword_rules;
CREATE POLICY keyword_rules_select ON public.email_keyword_rules FOR SELECT TO authenticated USING ((public.current_app_role() = ANY (ARRAY['ADMIN'::public.app_role, 'GESTOR'::public.app_role])));
DROP POLICY IF EXISTS law_firms_insert ON public.law_firms;
CREATE POLICY law_firms_insert ON public.law_firms FOR INSERT TO authenticated WITH CHECK (public.can_manage_master_data());
DROP POLICY IF EXISTS law_firms_select ON public.law_firms;
CREATE POLICY law_firms_select ON public.law_firms FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS law_firms_update ON public.law_firms;
CREATE POLICY law_firms_update ON public.law_firms FOR UPDATE TO authenticated USING (public.can_manage_master_data()) WITH CHECK (public.can_manage_master_data());
DROP POLICY IF EXISTS legal_nature_catalog_read ON public.legal_nature_catalog;
CREATE POLICY legal_nature_catalog_read ON public.legal_nature_catalog FOR SELECT TO authenticated USING ((active = true));
DROP POLICY IF EXISTS obligations_select ON public.obligations;
CREATE POLICY obligations_select ON public.obligations FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS obligations_write ON public.obligations;
CREATE POLICY obligations_write ON public.obligations TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS operational_rules_select ON public.operational_rules_config;
CREATE POLICY operational_rules_select ON public.operational_rules_config FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS operational_rules_update ON public.operational_rules_config;
CREATE POLICY operational_rules_update ON public.operational_rules_config FOR UPDATE TO authenticated USING (public.can_manage_master_data()) WITH CHECK (public.can_manage_master_data());
DROP POLICY IF EXISTS process_documents_select ON public.process_documents;
CREATE POLICY process_documents_select ON public.process_documents FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS process_documents_write ON public.process_documents;
CREATE POLICY process_documents_write ON public.process_documents TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS process_evidence_select ON public.process_evidence;
CREATE POLICY process_evidence_select ON public.process_evidence FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS process_evidence_write ON public.process_evidence;
CREATE POLICY process_evidence_write ON public.process_evidence TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS process_history_select ON public.process_history;
CREATE POLICY process_history_select ON public.process_history FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS process_history_write ON public.process_history;
CREATE POLICY process_history_write ON public.process_history TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS process_law_firm_interactions_select ON public.process_law_firm_interactions;
CREATE POLICY process_law_firm_interactions_select ON public.process_law_firm_interactions FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS process_law_firm_interactions_write ON public.process_law_firm_interactions;
CREATE POLICY process_law_firm_interactions_write ON public.process_law_firm_interactions TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS process_operational_history_select ON public.process_operational_history;
CREATE POLICY process_operational_history_select ON public.process_operational_history FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS process_parties_select ON public.process_parties;
CREATE POLICY process_parties_select ON public.process_parties FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS process_parties_write ON public.process_parties;
CREATE POLICY process_parties_write ON public.process_parties TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS process_pendencies_select ON public.process_pendencies;
CREATE POLICY process_pendencies_select ON public.process_pendencies FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS process_pendencies_write ON public.process_pendencies;
CREATE POLICY process_pendencies_write ON public.process_pendencies TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS process_responsibility_history_select ON public.process_responsibility_history;
CREATE POLICY process_responsibility_history_select ON public.process_responsibility_history FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS process_timeline_select ON public.process_timeline;
CREATE POLICY process_timeline_select ON public.process_timeline FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS process_timeline_write ON public.process_timeline;
CREATE POLICY process_timeline_write ON public.process_timeline TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS processed_emails_select ON public.processed_emails;
CREATE POLICY processed_emails_select ON public.processed_emails FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS processed_emails_write ON public.processed_emails;
CREATE POLICY processed_emails_write ON public.processed_emails TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS processes_select ON public.processes;
CREATE POLICY processes_select ON public.processes FOR SELECT TO authenticated USING (public.is_app_user_active());
DROP POLICY IF EXISTS processes_write ON public.processes;
CREATE POLICY processes_write ON public.processes TO authenticated USING (public.can_write_operational()) WITH CHECK (public.can_write_operational());
DROP POLICY IF EXISTS processing_runs_admin_select ON public.email_processing_runs;
CREATE POLICY processing_runs_admin_select ON public.email_processing_runs FOR SELECT TO authenticated USING ((public.current_app_role() = ANY (ARRAY['ADMIN'::public.app_role, 'GESTOR'::public.app_role])));
DROP POLICY IF EXISTS sender_rules_admin_write ON public.email_sender_rules;
CREATE POLICY sender_rules_admin_write ON public.email_sender_rules TO authenticated USING (public.can_manage_admin()) WITH CHECK (public.can_manage_admin());
DROP POLICY IF EXISTS sender_rules_select ON public.email_sender_rules;
CREATE POLICY sender_rules_select ON public.email_sender_rules FOR SELECT TO authenticated USING ((public.current_app_role() = ANY (ARRAY['ADMIN'::public.app_role, 'GESTOR'::public.app_role])));
DROP POLICY IF EXISTS system_config_admin ON public.system_config;
CREATE POLICY system_config_admin ON public.system_config TO authenticated USING (public.can_manage_admin()) WITH CHECK (public.can_manage_admin());
DROP POLICY IF EXISTS user_access_audit_admin_select ON public.user_access_audit;
CREATE POLICY user_access_audit_admin_select ON public.user_access_audit FOR SELECT TO authenticated USING (public.can_manage_admin());
DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
CREATE POLICY user_profiles_select ON public.user_profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.is_app_user_active()));


-- 14. PERMISSÕES E GRANTS
GRANT ALL ON FUNCTION public.citextin(cstring) TO postgres;
GRANT ALL ON FUNCTION public.citextin(cstring) TO anon;
GRANT ALL ON FUNCTION public.citextin(cstring) TO authenticated;
GRANT ALL ON FUNCTION public.citextin(cstring) TO service_role;
GRANT ALL ON FUNCTION public.citextout(public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citextout(public.citext) TO anon;
GRANT ALL ON FUNCTION public.citextout(public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citextout(public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citextrecv(internal) TO postgres;
GRANT ALL ON FUNCTION public.citextrecv(internal) TO anon;
GRANT ALL ON FUNCTION public.citextrecv(internal) TO authenticated;
GRANT ALL ON FUNCTION public.citextrecv(internal) TO service_role;
GRANT ALL ON FUNCTION public.citextsend(public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citextsend(public.citext) TO anon;
GRANT ALL ON FUNCTION public.citextsend(public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citextsend(public.citext) TO service_role;
GRANT ALL ON FUNCTION public.gtrgm_in(cstring) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_in(cstring) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_in(cstring) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_in(cstring) TO service_role;
GRANT ALL ON FUNCTION public.gtrgm_out(public.gtrgm) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_out(public.gtrgm) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_out(public.gtrgm) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_out(public.gtrgm) TO service_role;
GRANT ALL ON FUNCTION public.citext(boolean) TO postgres;
GRANT ALL ON FUNCTION public.citext(boolean) TO anon;
GRANT ALL ON FUNCTION public.citext(boolean) TO authenticated;
GRANT ALL ON FUNCTION public.citext(boolean) TO service_role;
GRANT ALL ON FUNCTION public.citext(character) TO postgres;
GRANT ALL ON FUNCTION public.citext(character) TO anon;
GRANT ALL ON FUNCTION public.citext(character) TO authenticated;
GRANT ALL ON FUNCTION public.citext(character) TO service_role;
GRANT ALL ON FUNCTION public.citext(inet) TO postgres;
GRANT ALL ON FUNCTION public.citext(inet) TO anon;
GRANT ALL ON FUNCTION public.citext(inet) TO authenticated;
GRANT ALL ON FUNCTION public.citext(inet) TO service_role;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO postgres;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO anon;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO authenticated;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO service_role;
GRANT ALL ON TABLE public.access_invites TO authenticated;
GRANT ALL ON TABLE public.access_invites TO service_role;
REVOKE ALL ON FUNCTION public.admin_create_or_refresh_invite(p_actor_id uuid, p_email public.citext, p_role public.app_role, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_create_or_refresh_invite(p_actor_id uuid, p_email public.citext, p_role public.app_role, p_reason text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_revoke_invite(p_actor_id uuid, p_invite_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_revoke_invite(p_actor_id uuid, p_invite_id uuid, p_reason text) TO service_role;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.user_profiles TO authenticated;
GRANT ALL ON TABLE public.user_profiles TO service_role;
REVOKE ALL ON FUNCTION public.admin_set_user_active(p_actor_id uuid, p_target_user_id uuid, p_new_active boolean, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_user_active(p_actor_id uuid, p_target_user_id uuid, p_new_active boolean, p_reason text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_set_user_role(p_actor_id uuid, p_target_user_id uuid, p_new_role public.app_role, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_user_role(p_actor_id uuid, p_target_user_id uuid, p_new_role public.app_role, p_reason text) TO service_role;
GRANT ALL ON TABLE public.processes TO authenticated;
GRANT ALL ON TABLE public.processes TO service_role;
REVOKE ALL ON FUNCTION public.apply_ai_management_suggestion(p_suggestion_id uuid, p_field_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_ai_management_suggestion(p_suggestion_id uuid, p_field_name text) TO service_role;
GRANT ALL ON FUNCTION public.apply_ai_management_suggestion(p_suggestion_id uuid, p_field_name text) TO authenticated;
REVOKE ALL ON FUNCTION public.assert_active_admin(p_actor_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_active_admin(p_actor_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.audit_process_operational_changes() TO service_role;
GRANT ALL ON FUNCTION public.audit_process_responsibility_change() TO service_role;
GRANT ALL ON FUNCTION public.can_manage_admin() TO service_role;
REVOKE ALL ON FUNCTION public.can_manage_master_data() FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_manage_master_data() TO service_role;
GRANT ALL ON FUNCTION public.can_manage_master_data() TO authenticated;
GRANT ALL ON FUNCTION public.can_write_operational() TO service_role;
GRANT ALL ON FUNCTION public.citext_cmp(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_cmp(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_cmp(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_cmp(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_eq(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_eq(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_eq(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_eq(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_ge(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_ge(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_ge(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_ge(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_gt(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_gt(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_gt(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_gt(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_hash(public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_hash(public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_hash(public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_hash(public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_hash_extended(public.citext, bigint) TO postgres;
GRANT ALL ON FUNCTION public.citext_hash_extended(public.citext, bigint) TO anon;
GRANT ALL ON FUNCTION public.citext_hash_extended(public.citext, bigint) TO authenticated;
GRANT ALL ON FUNCTION public.citext_hash_extended(public.citext, bigint) TO service_role;
GRANT ALL ON FUNCTION public.citext_larger(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_larger(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_larger(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_larger(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_le(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_le(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_le(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_le(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_lt(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_lt(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_lt(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_lt(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_ne(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_ne(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_ne(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_ne(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_pattern_cmp(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_pattern_cmp(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_pattern_cmp(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_pattern_cmp(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_pattern_ge(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_pattern_ge(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_pattern_ge(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_pattern_ge(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_pattern_gt(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_pattern_gt(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_pattern_gt(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_pattern_gt(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_pattern_le(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_pattern_le(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_pattern_le(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_pattern_le(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_pattern_lt(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_pattern_lt(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_pattern_lt(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_pattern_lt(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.citext_smaller(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.citext_smaller(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.citext_smaller(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.citext_smaller(public.citext, public.citext) TO service_role;
REVOKE ALL ON FUNCTION public.claim_my_invite() FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_my_invite() TO authenticated;
GRANT ALL ON FUNCTION public.claim_my_invite() TO service_role;
GRANT ALL ON FUNCTION public.company_aliases_normalize_before_write() TO service_role;
GRANT ALL ON FUNCTION public.current_app_role() TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_ai_management_refresh(p_process_id uuid, p_trigger_reason text, p_source_processed_email_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enqueue_ai_management_refresh(p_process_id uuid, p_trigger_reason text, p_source_processed_email_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal) TO postgres;
GRANT ALL ON FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal) TO anon;
GRANT ALL ON FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal) TO service_role;
GRANT ALL ON FUNCTION public.gin_extract_value_trgm(text, internal) TO postgres;
GRANT ALL ON FUNCTION public.gin_extract_value_trgm(text, internal) TO anon;
GRANT ALL ON FUNCTION public.gin_extract_value_trgm(text, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gin_extract_value_trgm(text, internal) TO service_role;
GRANT ALL ON FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal) TO postgres;
GRANT ALL ON FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal) TO anon;
GRANT ALL ON FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal) TO service_role;
GRANT ALL ON FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal) TO postgres;
GRANT ALL ON FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal) TO anon;
GRANT ALL ON FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal) TO service_role;
GRANT ALL ON FUNCTION public.gtrgm_compress(internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_compress(internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_compress(internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_compress(internal) TO service_role;
GRANT ALL ON FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal) TO service_role;
GRANT ALL ON FUNCTION public.gtrgm_decompress(internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_decompress(internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_decompress(internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_decompress(internal) TO service_role;
GRANT ALL ON FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal) TO service_role;
GRANT ALL ON FUNCTION public.gtrgm_options(internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_options(internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_options(internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_options(internal) TO service_role;
GRANT ALL ON FUNCTION public.gtrgm_penalty(internal, internal, internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_penalty(internal, internal, internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_penalty(internal, internal, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_penalty(internal, internal, internal) TO service_role;
GRANT ALL ON FUNCTION public.gtrgm_picksplit(internal, internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_picksplit(internal, internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_picksplit(internal, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_picksplit(internal, internal) TO service_role;
GRANT ALL ON FUNCTION public.gtrgm_same(public.gtrgm, public.gtrgm, internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_same(public.gtrgm, public.gtrgm, internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_same(public.gtrgm, public.gtrgm, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_same(public.gtrgm, public.gtrgm, internal) TO service_role;
GRANT ALL ON FUNCTION public.gtrgm_union(internal, internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_union(internal, internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_union(internal, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_union(internal, internal) TO service_role;
GRANT ALL ON FUNCTION public.handle_new_auth_user() TO service_role;
REVOKE ALL ON FUNCTION public.increment_ai_usage_daily(p_usage_date date, p_model text, p_input_tokens bigint, p_output_tokens bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_ai_usage_daily(p_usage_date date, p_model text, p_input_tokens bigint, p_output_tokens bigint) TO service_role;
REVOKE ALL ON FUNCTION public.increment_ai_usage_rate_window(p_usage_date date, p_minute_bucket timestamp with time zone, p_model text, p_input_tokens bigint, p_output_tokens bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_ai_usage_rate_window(p_usage_date date, p_minute_bucket timestamp with time zone, p_model text, p_input_tokens bigint, p_output_tokens bigint) TO service_role;
GRANT ALL ON FUNCTION public.is_app_user_active() TO service_role;
GRANT ALL ON FUNCTION public.normalize_company_alias(p_value text) TO service_role;
GRANT ALL ON FUNCTION public.normalize_company_fields() TO service_role;
GRANT ALL ON FUNCTION public.regexp_match(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.regexp_match(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.regexp_match(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.regexp_match(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.regexp_match(public.citext, public.citext, text) TO postgres;
GRANT ALL ON FUNCTION public.regexp_match(public.citext, public.citext, text) TO anon;
GRANT ALL ON FUNCTION public.regexp_match(public.citext, public.citext, text) TO authenticated;
GRANT ALL ON FUNCTION public.regexp_match(public.citext, public.citext, text) TO service_role;
GRANT ALL ON FUNCTION public.regexp_matches(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.regexp_matches(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.regexp_matches(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.regexp_matches(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.regexp_matches(public.citext, public.citext, text) TO postgres;
GRANT ALL ON FUNCTION public.regexp_matches(public.citext, public.citext, text) TO anon;
GRANT ALL ON FUNCTION public.regexp_matches(public.citext, public.citext, text) TO authenticated;
GRANT ALL ON FUNCTION public.regexp_matches(public.citext, public.citext, text) TO service_role;
GRANT ALL ON FUNCTION public.regexp_replace(public.citext, public.citext, text) TO postgres;
GRANT ALL ON FUNCTION public.regexp_replace(public.citext, public.citext, text) TO anon;
GRANT ALL ON FUNCTION public.regexp_replace(public.citext, public.citext, text) TO authenticated;
GRANT ALL ON FUNCTION public.regexp_replace(public.citext, public.citext, text) TO service_role;
GRANT ALL ON FUNCTION public.regexp_replace(public.citext, public.citext, text, text) TO postgres;
GRANT ALL ON FUNCTION public.regexp_replace(public.citext, public.citext, text, text) TO anon;
GRANT ALL ON FUNCTION public.regexp_replace(public.citext, public.citext, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.regexp_replace(public.citext, public.citext, text, text) TO service_role;
GRANT ALL ON FUNCTION public.regexp_split_to_array(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.regexp_split_to_array(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.regexp_split_to_array(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.regexp_split_to_array(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.regexp_split_to_array(public.citext, public.citext, text) TO postgres;
GRANT ALL ON FUNCTION public.regexp_split_to_array(public.citext, public.citext, text) TO anon;
GRANT ALL ON FUNCTION public.regexp_split_to_array(public.citext, public.citext, text) TO authenticated;
GRANT ALL ON FUNCTION public.regexp_split_to_array(public.citext, public.citext, text) TO service_role;
GRANT ALL ON FUNCTION public.regexp_split_to_table(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.regexp_split_to_table(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.regexp_split_to_table(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.regexp_split_to_table(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.regexp_split_to_table(public.citext, public.citext, text) TO postgres;
GRANT ALL ON FUNCTION public.regexp_split_to_table(public.citext, public.citext, text) TO anon;
GRANT ALL ON FUNCTION public.regexp_split_to_table(public.citext, public.citext, text) TO authenticated;
GRANT ALL ON FUNCTION public.regexp_split_to_table(public.citext, public.citext, text) TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.process_law_firm_interactions TO anon;
GRANT ALL ON TABLE public.process_law_firm_interactions TO authenticated;
GRANT ALL ON TABLE public.process_law_firm_interactions TO service_role;
REVOKE ALL ON FUNCTION public.register_law_firm_interaction(p_process_id uuid, p_law_firm_id uuid, p_interaction_type text, p_expected_return_at timestamp with time zone, p_subject text, p_summary text, p_responsible_user_id uuid, p_source_email_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.register_law_firm_interaction(p_process_id uuid, p_law_firm_id uuid, p_interaction_type text, p_expected_return_at timestamp with time zone, p_subject text, p_summary text, p_responsible_user_id uuid, p_source_email_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.register_law_firm_interaction(p_process_id uuid, p_law_firm_id uuid, p_interaction_type text, p_expected_return_at timestamp with time zone, p_subject text, p_summary text, p_responsible_user_id uuid, p_source_email_id uuid) TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.process_pendencies TO anon;
GRANT ALL ON TABLE public.process_pendencies TO authenticated;
GRANT ALL ON TABLE public.process_pendencies TO service_role;
REVOKE ALL ON FUNCTION public.register_process_pendency(p_process_id uuid, p_description text, p_responsible_type text, p_criticality text, p_due_at timestamp with time zone, p_type text, p_responsible_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.register_process_pendency(p_process_id uuid, p_description text, p_responsible_type text, p_criticality text, p_due_at timestamp with time zone, p_type text, p_responsible_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.register_process_pendency(p_process_id uuid, p_description text, p_responsible_type text, p_criticality text, p_due_at timestamp with time zone, p_type text, p_responsible_user_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.release_automation_lock(p_lock_name text, p_owner_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_automation_lock(p_lock_name text, p_owner_token text) TO service_role;
GRANT ALL ON FUNCTION public.replace(public.citext, public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.replace(public.citext, public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.replace(public.citext, public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.replace(public.citext, public.citext, public.citext) TO service_role;
REVOKE ALL ON FUNCTION public.retry_ai_management_refresh(p_process_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.retry_ai_management_refresh(p_process_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;
GRANT ALL ON FUNCTION public.set_limit(real) TO postgres;
GRANT ALL ON FUNCTION public.set_limit(real) TO anon;
GRANT ALL ON FUNCTION public.set_limit(real) TO authenticated;
GRANT ALL ON FUNCTION public.set_limit(real) TO service_role;
REVOKE ALL ON FUNCTION public.set_process_pendency_status(p_pendency_id uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_process_pendency_status(p_pendency_id uuid, p_status text) TO service_role;
GRANT ALL ON FUNCTION public.set_process_pendency_status(p_pendency_id uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.set_process_responsibility_timestamp() TO service_role;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;
GRANT ALL ON FUNCTION public.show_limit() TO postgres;
GRANT ALL ON FUNCTION public.show_limit() TO anon;
GRANT ALL ON FUNCTION public.show_limit() TO authenticated;
GRANT ALL ON FUNCTION public.show_limit() TO service_role;
GRANT ALL ON FUNCTION public.show_trgm(text) TO postgres;
GRANT ALL ON FUNCTION public.show_trgm(text) TO anon;
GRANT ALL ON FUNCTION public.show_trgm(text) TO authenticated;
GRANT ALL ON FUNCTION public.show_trgm(text) TO service_role;
GRANT ALL ON FUNCTION public.similarity(text, text) TO postgres;
GRANT ALL ON FUNCTION public.similarity(text, text) TO anon;
GRANT ALL ON FUNCTION public.similarity(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.similarity(text, text) TO service_role;
GRANT ALL ON FUNCTION public.similarity_dist(text, text) TO postgres;
GRANT ALL ON FUNCTION public.similarity_dist(text, text) TO anon;
GRANT ALL ON FUNCTION public.similarity_dist(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.similarity_dist(text, text) TO service_role;
GRANT ALL ON FUNCTION public.similarity_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.similarity_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.similarity_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.similarity_op(text, text) TO service_role;
GRANT ALL ON FUNCTION public.split_part(public.citext, public.citext, integer) TO postgres;
GRANT ALL ON FUNCTION public.split_part(public.citext, public.citext, integer) TO anon;
GRANT ALL ON FUNCTION public.split_part(public.citext, public.citext, integer) TO authenticated;
GRANT ALL ON FUNCTION public.split_part(public.citext, public.citext, integer) TO service_role;
GRANT ALL ON FUNCTION public.strict_word_similarity(text, text) TO postgres;
GRANT ALL ON FUNCTION public.strict_word_similarity(text, text) TO anon;
GRANT ALL ON FUNCTION public.strict_word_similarity(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.strict_word_similarity(text, text) TO service_role;
GRANT ALL ON FUNCTION public.strict_word_similarity_commutator_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.strict_word_similarity_commutator_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.strict_word_similarity_commutator_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.strict_word_similarity_commutator_op(text, text) TO service_role;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_commutator_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_commutator_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_commutator_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_commutator_op(text, text) TO service_role;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_op(text, text) TO service_role;
GRANT ALL ON FUNCTION public.strict_word_similarity_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.strict_word_similarity_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.strict_word_similarity_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.strict_word_similarity_op(text, text) TO service_role;
GRANT ALL ON FUNCTION public.strpos(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.strpos(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.strpos(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.strpos(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.texticlike(public.citext, text) TO postgres;
GRANT ALL ON FUNCTION public.texticlike(public.citext, text) TO anon;
GRANT ALL ON FUNCTION public.texticlike(public.citext, text) TO authenticated;
GRANT ALL ON FUNCTION public.texticlike(public.citext, text) TO service_role;
GRANT ALL ON FUNCTION public.texticlike(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.texticlike(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.texticlike(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.texticlike(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.texticnlike(public.citext, text) TO postgres;
GRANT ALL ON FUNCTION public.texticnlike(public.citext, text) TO anon;
GRANT ALL ON FUNCTION public.texticnlike(public.citext, text) TO authenticated;
GRANT ALL ON FUNCTION public.texticnlike(public.citext, text) TO service_role;
GRANT ALL ON FUNCTION public.texticnlike(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.texticnlike(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.texticnlike(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.texticnlike(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.texticregexeq(public.citext, text) TO postgres;
GRANT ALL ON FUNCTION public.texticregexeq(public.citext, text) TO anon;
GRANT ALL ON FUNCTION public.texticregexeq(public.citext, text) TO authenticated;
GRANT ALL ON FUNCTION public.texticregexeq(public.citext, text) TO service_role;
GRANT ALL ON FUNCTION public.texticregexeq(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.texticregexeq(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.texticregexeq(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.texticregexeq(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.texticregexne(public.citext, text) TO postgres;
GRANT ALL ON FUNCTION public.texticregexne(public.citext, text) TO anon;
GRANT ALL ON FUNCTION public.texticregexne(public.citext, text) TO authenticated;
GRANT ALL ON FUNCTION public.texticregexne(public.citext, text) TO service_role;
GRANT ALL ON FUNCTION public.texticregexne(public.citext, public.citext) TO postgres;
GRANT ALL ON FUNCTION public.texticregexne(public.citext, public.citext) TO anon;
GRANT ALL ON FUNCTION public.texticregexne(public.citext, public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.texticregexne(public.citext, public.citext) TO service_role;
GRANT ALL ON FUNCTION public.translate(public.citext, public.citext, text) TO postgres;
GRANT ALL ON FUNCTION public.translate(public.citext, public.citext, text) TO anon;
GRANT ALL ON FUNCTION public.translate(public.citext, public.citext, text) TO authenticated;
GRANT ALL ON FUNCTION public.translate(public.citext, public.citext, text) TO service_role;
REVOKE ALL ON FUNCTION public.try_acquire_automation_lock(p_lock_name text, p_owner_token text, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.try_acquire_automation_lock(p_lock_name text, p_owner_token text, p_lease_seconds integer) TO service_role;
REVOKE ALL ON FUNCTION public.update_process_management(p_process_id uuid, p_changes jsonb, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_process_management(p_process_id uuid, p_changes jsonb, p_reason text) TO service_role;
GRANT ALL ON FUNCTION public.update_process_management(p_process_id uuid, p_changes jsonb, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.word_similarity(text, text) TO postgres;
GRANT ALL ON FUNCTION public.word_similarity(text, text) TO anon;
GRANT ALL ON FUNCTION public.word_similarity(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.word_similarity(text, text) TO service_role;
GRANT ALL ON FUNCTION public.word_similarity_commutator_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.word_similarity_commutator_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.word_similarity_commutator_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.word_similarity_commutator_op(text, text) TO service_role;
GRANT ALL ON FUNCTION public.word_similarity_dist_commutator_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.word_similarity_dist_commutator_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.word_similarity_dist_commutator_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.word_similarity_dist_commutator_op(text, text) TO service_role;
GRANT ALL ON FUNCTION public.word_similarity_dist_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.word_similarity_dist_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.word_similarity_dist_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.word_similarity_dist_op(text, text) TO service_role;
GRANT ALL ON FUNCTION public.word_similarity_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.word_similarity_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.word_similarity_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.word_similarity_op(text, text) TO service_role;
GRANT ALL ON FUNCTION public.max(public.citext) TO postgres;
GRANT ALL ON FUNCTION public.max(public.citext) TO anon;
GRANT ALL ON FUNCTION public.max(public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.max(public.citext) TO service_role;
GRANT ALL ON FUNCTION public.min(public.citext) TO postgres;
GRANT ALL ON FUNCTION public.min(public.citext) TO anon;
GRANT ALL ON FUNCTION public.min(public.citext) TO authenticated;
GRANT ALL ON FUNCTION public.min(public.citext) TO service_role;
GRANT ALL ON TABLE public.ai_demand_classification_backfill_queue TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ai_management_refresh_queue TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ai_management_refresh_queue TO authenticated;
GRANT ALL ON TABLE public.ai_management_refresh_queue TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ai_management_suggestions TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ai_management_suggestions TO authenticated;
GRANT ALL ON TABLE public.ai_management_suggestions TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ai_model_health TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ai_model_health TO authenticated;
GRANT ALL ON TABLE public.ai_model_health TO service_role;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ai_usage_daily TO authenticated;
GRANT ALL ON TABLE public.ai_usage_daily TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ai_usage_minute TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ai_usage_minute TO authenticated;
GRANT ALL ON TABLE public.ai_usage_minute TO service_role;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.automation_locks TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.automation_locks TO authenticated;
GRANT ALL ON TABLE public.automation_locks TO service_role;
GRANT ALL ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.company_aliases TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.company_aliases TO authenticated;
GRANT ALL ON TABLE public.company_aliases TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.company_resolution_audit TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.company_resolution_audit TO authenticated;
GRANT ALL ON TABLE public.company_resolution_audit TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.company_resolution_candidates TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.company_resolution_candidates TO authenticated;
GRANT ALL ON TABLE public.company_resolution_candidates TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.demand_classification_catalog TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.demand_classification_catalog TO authenticated;
GRANT ALL ON TABLE public.demand_classification_catalog TO service_role;
GRANT ALL ON SEQUENCE public.demand_classification_catalog_id_seq TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.email_account_config TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.email_account_config TO authenticated;
GRANT ALL ON TABLE public.email_account_config TO service_role;
GRANT ALL ON TABLE public.email_exceptions TO authenticated;
GRANT ALL ON TABLE public.email_exceptions TO service_role;
GRANT ALL ON TABLE public.email_keyword_rules TO authenticated;
GRANT ALL ON TABLE public.email_keyword_rules TO service_role;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.email_processing_runs TO authenticated;
GRANT ALL ON TABLE public.email_processing_runs TO service_role;
GRANT ALL ON TABLE public.email_sender_rules TO authenticated;
GRANT ALL ON TABLE public.email_sender_rules TO service_role;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.email_sync_state TO authenticated;
GRANT ALL ON TABLE public.email_sync_state TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.law_firms TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.law_firms TO authenticated;
GRANT ALL ON TABLE public.law_firms TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.legal_nature_catalog TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.legal_nature_catalog TO authenticated;
GRANT ALL ON TABLE public.legal_nature_catalog TO service_role;
GRANT ALL ON TABLE public.obligations TO authenticated;
GRANT ALL ON TABLE public.obligations TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.operational_rules_config TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.operational_rules_config TO authenticated;
GRANT ALL ON TABLE public.operational_rules_config TO service_role;
GRANT ALL ON TABLE public.process_documents TO authenticated;
GRANT ALL ON TABLE public.process_documents TO service_role;
GRANT ALL ON TABLE public.process_evidence TO authenticated;
GRANT ALL ON TABLE public.process_evidence TO service_role;
GRANT ALL ON TABLE public.process_history TO authenticated;
GRANT ALL ON TABLE public.process_history TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.process_operational_history TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.process_operational_history TO authenticated;
GRANT ALL ON TABLE public.process_operational_history TO service_role;
GRANT ALL ON TABLE public.process_parties TO authenticated;
GRANT ALL ON TABLE public.process_parties TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.process_responsibility_history TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.process_responsibility_history TO authenticated;
GRANT ALL ON TABLE public.process_responsibility_history TO service_role;
GRANT ALL ON TABLE public.process_timeline TO authenticated;
GRANT ALL ON TABLE public.process_timeline TO service_role;
GRANT ALL ON TABLE public.processed_emails TO authenticated;
GRANT ALL ON TABLE public.processed_emails TO service_role;
GRANT ALL ON TABLE public.system_config TO authenticated;
GRANT ALL ON TABLE public.system_config TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.user_access_audit TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.user_access_audit TO authenticated;
GRANT ALL ON TABLE public.user_access_audit TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_dashboard_process_kpis TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_dashboard_process_kpis TO authenticated;
GRANT ALL ON TABLE public.v_dashboard_process_kpis TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_deadline_kpis TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_deadline_kpis TO authenticated;
GRANT ALL ON TABLE public.v_deadline_kpis TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_demand_category_summary TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_demand_category_summary TO authenticated;
GRANT ALL ON TABLE public.v_panel_demand_category_summary TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_demand_subcategory_summary TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_demand_subcategory_summary TO authenticated;
GRANT ALL ON TABLE public.v_panel_demand_subcategory_summary TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_email_metrics TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_email_metrics TO authenticated;
GRANT ALL ON TABLE public.v_panel_email_metrics TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_process_operational_state TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_process_operational_state TO authenticated;
GRANT ALL ON TABLE public.v_process_operational_state TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_executive_kpis TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_executive_kpis TO authenticated;
GRANT ALL ON TABLE public.v_panel_executive_kpis TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_operational_health TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_operational_health TO authenticated;
GRANT ALL ON TABLE public.v_panel_operational_health TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_priority_processes TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_priority_processes TO authenticated;
GRANT ALL ON TABLE public.v_panel_priority_processes TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_responsibility_summary TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_responsibility_summary TO authenticated;
GRANT ALL ON TABLE public.v_panel_responsibility_summary TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_risk_summary TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_panel_risk_summary TO authenticated;
GRANT ALL ON TABLE public.v_panel_risk_summary TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_process_list TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_process_list TO authenticated;
GRANT ALL ON TABLE public.v_process_list TO service_role;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_process_management TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.v_process_management TO authenticated;
GRANT ALL ON TABLE public.v_process_management TO service_role;


-- 15. STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-documents', 'legal-documents', false)
ON CONFLICT (id) DO NOTHING;
