-- ============================================================================
-- SB GESTÃO JURÍDICA - ESQUEMA DO BANCO DE DADOS (SUPABASE / POSTGRESQL)
-- Versão do Pipeline: 2.5-gemini-semantic
-- Schema: public
-- ============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABELAS DE AUTENTICAÇÃO, CONTROLE DE ACESSO E CONFIGURAÇÃO
-- ============================================================================

-- Perfis de Usuário (associados ao auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'ANALISTA' CHECK (role IN ('ADMIN', 'ADVOGADO', 'ANALISTA', 'LEITURA')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    invited_by UUID,
    invited_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Convites de Acesso Administrativo
CREATE TABLE IF NOT EXISTS public.access_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'ANALISTA' CHECK (role IN ('ADMIN', 'ADVOGADO', 'ANALISTA', 'LEITURA')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLAIMED', 'REVOKED', 'EXPIRED')),
    token TEXT UNIQUE,
    created_by UUID REFERENCES public.user_profiles(id),
    claimed_by UUID REFERENCES public.user_profiles(id),
    claimed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '7 days'),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Auditoria de Acesso e Ações de Usuários
CREATE TABLE IF NOT EXISTS public.user_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.user_profiles(id),
    target_user_id UUID,
    action TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Configurações Globais do Sistema
CREATE TABLE IF NOT EXISTS public.system_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    description TEXT,
    updated_by UUID REFERENCES public.user_profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Configuração da Conta de E-mail (IMAP)
CREATE TABLE IF NOT EXISTS public.email_account_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 993,
    secure BOOLEAN NOT NULL DEFAULT TRUE,
    encrypted_password TEXT NOT NULL,
    mailbox TEXT NOT NULL DEFAULT 'INBOX',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sync_interval_minutes INTEGER NOT NULL DEFAULT 5,
    sync_batch_size INTEGER NOT NULL DEFAULT 50,
    sync_since_days INTEGER NOT NULL DEFAULT 3650,
    last_connection_status TEXT,
    last_connection_at TIMESTAMPTZ,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Locks de Concorrência Distribuída de Automação
CREATE TABLE IF NOT EXISTS public.automation_locks (
    lock_name TEXT PRIMARY KEY,
    owner_token TEXT NOT NULL,
    locked_until TIMESTAMPTZ NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Saúde dos Modelos de Inteligência Artificial
CREATE TABLE IF NOT EXISTS public.ai_model_health (
    model TEXT PRIMARY KEY,
    circuit_open_until TIMESTAMPTZ,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_error_code TEXT,
    last_error_message TEXT,
    last_failure_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 2. CADASTROS BÁSICOS E VINCULAÇÕES
-- ============================================================================

-- Empresas Vinculadas / Operadoras
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    nome_normalizado TEXT NOT NULL,
    cnpj TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    inactive_at TIMESTAMPTZ,
    inactive_by UUID REFERENCES public.user_profiles(id),
    created_by UUID REFERENCES public.user_profiles(id),
    updated_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Variações e Nomes Fantasia de Empresas
CREATE TABLE IF NOT EXISTS public.company_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    alias_normalizado TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Histórico de Resolução de Empresas
CREATE TABLE IF NOT EXISTS public.company_resolution_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID,
    raw_text TEXT,
    resolved_company_id UUID REFERENCES public.companies(id),
    confidence NUMERIC(5,2),
    resolution_method TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Candidatos a Vinculação de Empresa
CREATE TABLE IF NOT EXISTS public.company_resolution_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID,
    email_id UUID,
    candidate_name TEXT NOT NULL,
    suggested_company_id UUID REFERENCES public.companies(id),
    score NUMERIC(5,2),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Escritórios de Advocacia Terceirizados
CREATE TABLE IF NOT EXISTS public.law_firms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    cnpj TEXT,
    email_principal TEXT,
    telefone TEXT,
    responsavel_principal TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    inactive_at TIMESTAMPTZ,
    inactive_by UUID REFERENCES public.user_profiles(id),
    created_by UUID REFERENCES public.user_profiles(id),
    updated_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Regras Operacionais Configuráveis
CREATE TABLE IF NOT EXISTS public.operational_rules_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Catálogo de Assuntos Materiais da Demanda
CREATE TABLE IF NOT EXISTS public.demand_classification_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria TEXT NOT NULL,
    subcategoria TEXT NOT NULL,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_categoria_subcategoria UNIQUE (categoria, subcategoria)
);

-- Catálogo de Tutelas / Provimentos (Natureza Jurídica)
CREATE TABLE IF NOT EXISTS public.legal_nature_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 3. GESTÃO PROCESSUAL CENTRAL
-- ============================================================================

-- Processos Judiciais e Administrativos
CREATE TABLE IF NOT EXISTS public.processes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_processo TEXT,
    protocolo_externo TEXT,
    origem TEXT,
    natureza TEXT,
    fase_processual TEXT,
    tutela_atual TEXT,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    municipio TEXT,
    comarca TEXT,
    uf VARCHAR(2),
    situacao_beneficiario TEXT,
    valor_causa NUMERIC(15,2),
    tipo_demanda TEXT,
    subtipo_demanda TEXT,
    objeto_demanda TEXT,
    categoria_demanda TEXT,
    subcategoria_demanda TEXT,
    natureza_juridica TEXT[],
    detalhe_demanda TEXT,
    classificacao_origem TEXT DEFAULT 'MANUAL',
    classificacao_atualizada_em TIMESTAMPTZ,
    responsavel_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    prioridade TEXT DEFAULT 'MEDIA' CHECK (prioridade IN ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE')),
    status_atual TEXT NOT NULL DEFAULT 'NOVA' CHECK (status_atual IN (
        'NOVA', 'TRIAGEM', 'EM_ANALISE', 'EM_TRATAMENTO',
        'AGUARDANDO_TERCEIRO', 'AGUARDANDO_DECISAO', 'CONCLUIDA', 'CANCELADA'
    )),
    recebido_em TIMESTAMPTZ,
    aberto_em TIMESTAMPTZ,
    concluido_em TIMESTAMPTZ,
    ultimo_evento_em TIMESTAMPTZ,
    arquivado BOOLEAN NOT NULL DEFAULT FALSE,
    arquivado_em TIMESTAMPTZ,
    cadastro_incompleto BOOLEAN NOT NULL DEFAULT FALSE,
    pendencias TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,

    -- Gestão Gerencial
    status_operacional TEXT NOT NULL DEFAULT 'NAO_CLASSIFICADO' CHECK (status_operacional IN (
        'NAO_CLASSIFICADO', 'RECEBIDO', 'EM_TRIAGEM', 'AGUARDANDO_AREA_INTERNA',
        'AGUARDANDO_ESCRITORIO', 'EM_PREPARACAO_ESCRITORIO', 'RESPONDIDO_PROTOCOLADO',
        'AGUARDANDO_DECISAO', 'COM_DECISAO', 'EM_RECURSO', 'EM_CUMPRIMENTO',
        'SUSPENSO', 'ENCERRADO'
    )),
    responsabilidade_atual TEXT NOT NULL DEFAULT 'SEM_RESPONSAVEL' CHECK (responsabilidade_atual IN (
        'OPERADORA', 'ESCRITORIO', 'JUDICIARIO', 'TERCEIRO', 'SEM_RESPONSAVEL'
    )),
    responsabilidade_desde TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    proxima_acao TEXT,
    proxima_acao_responsavel_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    proxima_acao_prazo TIMESTAMPTZ,
    nivel_risco TEXT NOT NULL DEFAULT 'NAO_CLASSIFICADO' CHECK (nivel_risco IN (
        'NAO_CLASSIFICADO', 'BAIXO', 'MEDIO', 'ALTO', 'CRITICO'
    )),
    exposicao_estimada NUMERIC(15,2),
    resumo_executivo TEXT,
    nota_executiva TEXT,
    data_entrada_juridico TIMESTAMPTZ,
    data_entrada_juridico_inferida BOOLEAN DEFAULT FALSE,
    origem_demanda TEXT,
    origem_demanda_inferida BOOLEAN DEFAULT FALSE,
    law_firm_id UUID REFERENCES public.law_firms(id) ON DELETE SET NULL,
    lawyer_name TEXT,
    lawyer_email TEXT,
    motivo_encerramento TEXT,
    semaforo_operacional TEXT DEFAULT 'VERDE' CHECK (semaforo_operacional IN ('VERDE', 'AMARELO', 'VERMELHO'))
);

-- Partes do Processo (Autores, Réus, etc.)
CREATE TABLE IF NOT EXISTS public.process_parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'AUTOR' CHECK (tipo IN ('AUTOR', 'REU', 'REPRESENTANTE', 'TERCEIRO', 'PARTE_IDENTIFICADA')),
    documento TEXT,
    principal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Documentos Anexados ao Processo
CREATE TABLE IF NOT EXISTS public.process_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    document_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Histórico de Alterações de Campos
CREATE TABLE IF NOT EXISTS public.process_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    campo TEXT NOT NULL,
    valor_anterior TEXT,
    valor_novo TEXT,
    usuario_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    origem TEXT NOT NULL DEFAULT 'SISTEMA',
    data_hora TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Histórico Operacional de Transições de Status
CREATE TABLE IF NOT EXISTS public.process_operational_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    status_anterior TEXT,
    status_novo TEXT NOT NULL,
    motivo TEXT,
    usuario_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    data_hora TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Histórico de Mudança de Responsabilidade
CREATE TABLE IF NOT EXISTS public.process_responsibility_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    responsabilidade_anterior TEXT,
    responsabilidade_nova TEXT NOT NULL,
    motivo TEXT,
    usuario_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    data_hora TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Pendências Operacionais
CREATE TABLE IF NOT EXISTS public.process_pendencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'OUTRA',
    description TEXT NOT NULL,
    responsible_type TEXT NOT NULL DEFAULT 'OPERADORA' CHECK (responsible_type IN ('OPERADORA', 'ESCRITORIO', 'JUDICIARIO', 'TERCEIRO', 'SEM_RESPONSAVEL')),
    responsible_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    due_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA', 'EM_TRATAMENTO', 'RESOLVIDA', 'CANCELADA')),
    criticality TEXT NOT NULL DEFAULT 'MEDIA' CHECK (criticality IN ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE')),
    source TEXT NOT NULL DEFAULT 'MANUAL',
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Interações com Escritórios Terceirizados
CREATE TABLE IF NOT EXISTS public.process_law_firm_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    law_firm_id UUID REFERENCES public.law_firms(id) ON DELETE SET NULL,
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('ENVIO', 'RETORNO', 'COBRANCA', 'ORIENTACAO', 'OUTRO')),
    sent_at TIMESTAMPTZ,
    expected_return_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    response_to_interaction_id UUID REFERENCES public.process_law_firm_interactions(id) ON DELETE SET NULL,
    subject TEXT,
    summary TEXT,
    responsible_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    source_email_id UUID,
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 4. PROCESSAMENTO DE E-MAILS, OCR E EVIDÊNCIAS
-- ============================================================================

-- E-mails Captados e Tratados
CREATE TABLE IF NOT EXISTS public.processed_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox TEXT NOT NULL DEFAULT 'INBOX',
    imap_uid BIGINT,
    message_id TEXT,
    thread_key TEXT,
    sender_email TEXT,
    sender_name TEXT,
    subject TEXT,
    received_at TIMESTAMPTZ,
    process_id UUID REFERENCES public.processes(id) ON DELETE SET NULL,
    matched_process_number TEXT,
    classification TEXT,
    relevance_score NUMERIC(5,2),
    ai_need_score NUMERIC(5,2),
    ai_model TEXT,
    ai_confidence NUMERIC(5,2),
    status TEXT NOT NULL DEFAULT 'PENDENTE_IA' CHECK (status IN (
        'PENDENTE_IA', 'PROCESSADO', 'RELEVANTE', 'IRRELEVANTE',
        'ERRO', 'FALHA_PROCESSAMENTO', 'MANUAL'
    )),
    content_hash TEXT,
    attachment_count INTEGER NOT NULL DEFAULT 0,
    analyzed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Linha do Tempo / Andamentos do Processo
CREATE TABLE IF NOT EXISTS public.process_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    email_id UUID REFERENCES public.processed_emails(id) ON DELETE SET NULL,
    documento_id UUID REFERENCES public.process_documents(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    data_hora TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    origem TEXT NOT NULL DEFAULT 'SISTEMA',
    usuario_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    automatico BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Evidências Fatuais Extraídas por IA ou OCR
CREATE TABLE IF NOT EXISTS public.process_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID REFERENCES public.processes(id) ON DELETE CASCADE,
    processed_email_id UUID REFERENCES public.processed_emails(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.process_documents(id) ON DELETE SET NULL,
    field_name TEXT NOT NULL,
    extracted_value JSONB,
    source_type TEXT,
    extraction_method TEXT,
    confidence NUMERIC(5,2),
    evidence_excerpt TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Obrigações Judiciais e Administrativas de Fazer/Pagar
CREATE TABLE IF NOT EXISTS public.obligations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    descricao TEXT NOT NULL,
    prazo TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN (
        'PENDENTE', 'EM_ANDAMENTO', 'CUMPRIDA', 'CONCLUIDA', 'CANCELADA', 'EXTINTA'
    )),
    tipo_prazo TEXT,
    origem_prazo TEXT,
    evento_gerador TEXT,
    criticidade TEXT DEFAULT 'MEDIA' CHECK (criticidade IN ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE')),
    responsavel_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    valor_multa_diaria NUMERIC(15,2),
    valor_multa_limite NUMERIC(15,2),
    observacoes TEXT,
    concluido_em TIMESTAMPTZ,
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Execuções de Ingestão e Monitoramento de E-mails
CREATE TABLE IF NOT EXISTS public.email_processing_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMPTZ,
    total_emails_read INTEGER NOT NULL DEFAULT 0,
    emails_processed INTEGER NOT NULL DEFAULT 0,
    emails_with_ai INTEGER NOT NULL DEFAULT 0,
    exceptions_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    error_message TEXT
);

-- Exceções de Triagem de E-mails
CREATE TABLE IF NOT EXISTS public.email_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processed_email_id UUID REFERENCES public.processed_emails(id) ON DELETE CASCADE,
    exception_type TEXT NOT NULL,
    reason TEXT NOT NULL,
    sanitized_payload JSONB,
    status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'EM_ANALISE', 'RESOLVIDA', 'IGNORADA')),
    assigned_to UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    resolved_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Regras de Remetente (Filtro Prévio de Triagem)
CREATE TABLE IF NOT EXISTS public.email_sender_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_pattern TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'PROCESSAR' CHECK (action IN ('PROCESSAR', 'IGNORAR', 'REVISAR')),
    priority INTEGER NOT NULL DEFAULT 10,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Regras de Palavras-chave
CREATE TABLE IF NOT EXISTS public.email_keyword_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL,
    category TEXT NOT NULL,
    weight NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 5. CONSUMO DE IA E FILAS DE AUTOMAÇÃO
-- ============================================================================

-- Consumo Diário de Quotas e Tokens de IA
CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
    usage_date DATE NOT NULL,
    model TEXT NOT NULL DEFAULT 'gemini-3.8-flash',
    requests_count INTEGER NOT NULL DEFAULT 0,
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    quota_exhausted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (usage_date, model)
);

-- Taxa de Requisições por Janela de Minuto (Rate Limiting)
CREATE TABLE IF NOT EXISTS public.ai_usage_minute (
    window_minute TIMESTAMPTZ NOT NULL,
    model TEXT NOT NULL,
    requests_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (window_minute, model)
);

-- Fila de Atualização de Sugestões Gerenciais por IA
CREATE TABLE IF NOT EXISTS public.ai_management_refresh_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'ERROR')),
    attempts INTEGER NOT NULL DEFAULT 0,
    not_before TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    last_error TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Sugestões Gerenciais Geradas por IA
CREATE TABLE IF NOT EXISTS public.ai_management_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    status_operacional_sugerido TEXT,
    responsabilidade_sugerida TEXT,
    nivel_risco_sugerido TEXT,
    proxima_acao_sugerida TEXT,
    prazo_sugerido TIMESTAMPTZ,
    justificativa TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    applied_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Fila de Backfill de Classificação Retroativa de Demandas
CREATE TABLE IF NOT EXISTS public.ai_demand_classification_backfill_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    retry_after TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 6. ÍNDICES DE PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_processes_numero ON public.processes(numero_processo);
CREATE INDEX IF NOT EXISTS idx_processes_status_operacional ON public.processes(status_operacional);
CREATE INDEX IF NOT EXISTS idx_processes_responsabilidade ON public.processes(responsabilidade_atual);
CREATE INDEX IF NOT EXISTS idx_processes_company ON public.processes(company_id);
CREATE INDEX IF NOT EXISTS idx_processes_updated_at ON public.processes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_processes_prioridade ON public.processes(prioridade);
CREATE INDEX IF NOT EXISTS idx_processes_prazo_proxima_acao ON public.processes(proxima_acao_prazo);

CREATE INDEX IF NOT EXISTS idx_processed_emails_status ON public.processed_emails(status);
CREATE INDEX IF NOT EXISTS idx_processed_emails_received ON public.processed_emails(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_processed_emails_process_id ON public.processed_emails(process_id);
CREATE INDEX IF NOT EXISTS idx_processed_emails_uid ON public.processed_emails(mailbox, imap_uid);
CREATE INDEX IF NOT EXISTS idx_processed_emails_msg_id ON public.processed_emails(message_id);

CREATE INDEX IF NOT EXISTS idx_obligations_process_id ON public.obligations(process_id);
CREATE INDEX IF NOT EXISTS idx_obligations_prazo ON public.obligations(prazo);
CREATE INDEX IF NOT EXISTS idx_obligations_status ON public.obligations(status);

CREATE INDEX IF NOT EXISTS idx_process_timeline_process ON public.process_timeline(process_id, data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_process_evidence_process ON public.process_evidence(process_id);
CREATE INDEX IF NOT EXISTS idx_process_parties_process ON public.process_parties(process_id);
CREATE INDEX IF NOT EXISTS idx_process_pendencies_process ON public.process_pendencies(process_id, status);

CREATE INDEX IF NOT EXISTS idx_mgmt_queue_status_date ON public.ai_management_refresh_queue(status, not_before);
CREATE INDEX IF NOT EXISTS idx_backfill_queue_status ON public.ai_demand_classification_backfill_queue(status, retry_after);

-- ============================================================================
-- 7. VIEWS ANALÍTICAS E OPERACIONAIS
-- ============================================================================

-- View Principal de Gestão Processual
CREATE OR REPLACE VIEW public.v_process_management AS
SELECT
    p.id,
    p.numero_processo,
    p.objeto_demanda,
    p.tipo_demanda,
    p.subtipo_demanda,
    p.categoria_demanda,
    p.subcategoria_demanda,
    p.natureza_juridica,
    p.detalhe_demanda,
    p.comarca,
    p.uf,
    p.status_atual,
    p.status_operacional,
    p.responsabilidade_atual,
    p.responsabilidade_desde,
    EXTRACT(DAY FROM (timezone('utc'::text, now()) - COALESCE(p.responsabilidade_desde, p.created_at)))::integer AS dias_com_responsavel_atual,
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
    lf.nome AS law_firm_nome,
    p.lawyer_name,
    p.lawyer_email,
    p.updated_at,
    p.created_at,
    p.semaforo_operacional,
    ob.descricao AS obrigacao_critica_descricao,
    ob.prazo AS obrigacao_critica_prazo,
    pen.description AS pendencia_critica_descricao,
    pen.due_at AS pendencia_critica_prazo,
    lfi.expected_return_at AS escritorio_retorno_esperado,
    CASE
        WHEN lfi.expected_return_at IS NOT NULL AND lfi.expected_return_at < timezone('utc'::text, now())
        THEN EXTRACT(DAY FROM (timezone('utc'::text, now()) - lfi.expected_return_at))::integer
        ELSE 0
    END AS escritorio_dias_atraso,
    (SELECT count(*)::integer FROM public.process_pendencies pp WHERE pp.process_id = p.id AND pp.status IN ('ABERTA', 'EM_TRATAMENTO')) AS escritorio_followups_abertos,
    (lfi.expected_return_at IS NOT NULL AND lfi.expected_return_at < timezone('utc'::text, now())) AS escritorio_followup_devido,
    (p.proxima_acao_prazo IS NOT NULL AND p.proxima_acao_prazo < timezone('utc'::text, now())) AS proxima_acao_vencida,
    (p.proxima_acao_prazo IS NOT NULL AND p.proxima_acao_prazo >= timezone('utc'::text, now()) AND p.proxima_acao_prazo <= timezone('utc'::text, now() + interval '48 hours')) AS proxima_acao_proxima,
    (p.responsabilidade_atual = 'OPERADORA' AND EXTRACT(DAY FROM (timezone('utc'::text, now()) - COALESCE(p.responsabilidade_desde, p.created_at))) > 5) AS operadora_parada,
    (p.responsabilidade_atual = 'ESCRITORIO' AND EXTRACT(DAY FROM (timezone('utc'::text, now()) - COALESCE(p.responsabilidade_desde, p.created_at))) > 7) AS escritorio_parado,
    ARRAY_REMOVE(ARRAY[
        CASE WHEN p.proxima_acao_prazo IS NOT NULL AND p.proxima_acao_prazo < timezone('utc'::text, now()) THEN 'PRAZO_VENCIDO' END,
        CASE WHEN p.nivel_risco = 'CRITICO' THEN 'RISCO_CRITICO' END,
        CASE WHEN ob.prazo IS NOT NULL AND ob.prazo < timezone('utc'::text, now()) THEN 'OBRIGACAO_VENCIDA' END
    ], NULL) AS alert_codes
FROM public.processes p
LEFT JOIN public.law_firms lf ON lf.id = p.law_firm_id
LEFT JOIN LATERAL (
    SELECT o.descricao, o.prazo
    FROM public.obligations o
    WHERE o.process_id = p.id AND o.status IN ('PENDENTE', 'EM_ANDAMENTO')
    ORDER BY o.prazo ASC NULLS LAST
    LIMIT 1
) ob ON true
LEFT JOIN LATERAL (
    SELECT pen_sub.description, pen_sub.due_at
    FROM public.process_pendencies pen_sub
    WHERE pen_sub.process_id = p.id AND pen_sub.status IN ('ABERTA', 'EM_TRATAMENTO')
    ORDER BY pen_sub.due_at ASC NULLS LAST
    LIMIT 1
) pen ON true
LEFT JOIN LATERAL (
    SELECT lfi_sub.expected_return_at
    FROM public.process_law_firm_interactions lfi_sub
    WHERE lfi_sub.process_id = p.id AND lfi_sub.received_at IS NULL
    ORDER BY lfi_sub.expected_return_at ASC NULLS LAST
    LIMIT 1
) lfi ON true;

-- View de KPIs Executivos do Painel
CREATE OR REPLACE VIEW public.v_panel_executive_kpis AS
SELECT
    count(*) FILTER (WHERE arquivado = false AND status_operacional <> 'ENCERRADO')::integer AS processos_ativos,
    count(*) FILTER (WHERE semaforo_operacional = 'VERMELHO' AND arquivado = false AND status_operacional <> 'ENCERRADO')::integer AS processos_vermelhos,
    count(*) FILTER (WHERE semaforo_operacional = 'AMARELO' AND arquivado = false AND status_operacional <> 'ENCERRADO')::integer AS processos_amarelos,
    count(*) FILTER (WHERE responsabilidade_atual = 'ESCRITORIO' AND arquivado = false AND status_operacional <> 'ENCERRADO')::integer AS aguardando_escritorio,
    count(*) FILTER (WHERE responsabilidade_atual = 'OPERADORA' AND arquivado = false AND status_operacional <> 'ENCERRADO')::integer AS aguardando_area_interna,
    (SELECT count(*)::integer FROM public.obligations WHERE status IN ('PENDENTE', 'EM_ANDAMENTO')) AS obrigacoes_pendentes,
    (SELECT count(*)::integer FROM public.obligations WHERE status IN ('PENDENTE', 'EM_ANDAMENTO') AND prazo <= timezone('utc'::text, now() + interval '48 hours')) AS prazos_criticos,
    count(*) FILTER (WHERE nivel_risco IN ('ALTO', 'CRITICO') AND arquivado = false AND status_operacional <> 'ENCERRADO')::integer AS alto_risco,
    COALESCE(sum(valor_causa) FILTER (WHERE arquivado = false AND status_operacional <> 'ENCERRADO'), 0)::numeric(15,2) AS valor_envolvido,
    COALESCE(sum(exposicao_estimada) FILTER (WHERE arquivado = false AND status_operacional <> 'ENCERRADO'), 0)::numeric(15,2) AS exposicao_estimada,
    count(*) FILTER (WHERE status_operacional = 'ENCERRADO' AND updated_at >= date_trunc('month', timezone('utc'::text, now())))::integer AS encerrados_mes,
    count(*) FILTER (WHERE categoria_demanda IS NULL AND arquivado = false AND status_operacional <> 'ENCERRADO')::integer AS classificacao_pendente,
    (SELECT count(*)::integer FROM public.process_pendencies WHERE status IN ('ABERTA', 'EM_TRATAMENTO')) AS pendencias_abertas,
    (SELECT count(*)::integer FROM public.process_pendencies WHERE status IN ('ABERTA', 'EM_TRATAMENTO') AND due_at < timezone('utc'::text, now())) AS pendencias_vencidas,
    (SELECT count(*)::integer FROM public.process_law_firm_interactions WHERE received_at IS NULL AND expected_return_at IS NOT NULL) AS slas_escritorio_abertos,
    (SELECT count(*)::integer FROM public.process_law_firm_interactions WHERE received_at IS NULL AND expected_return_at < timezone('utc'::text, now())) AS slas_escritorio_vencidos
FROM public.processes;

-- View de Distribuição de Risco / Semáforo
CREATE OR REPLACE VIEW public.v_panel_risk_summary AS
SELECT 'VERMELHO' AS categoria, count(*)::integer AS quantidade, 1 AS ordem
FROM public.processes WHERE semaforo_operacional = 'VERMELHO' AND arquivado = false AND status_operacional <> 'ENCERRADO'
UNION ALL
SELECT 'AMARELO', count(*)::integer, 2
FROM public.processes WHERE semaforo_operacional = 'AMARELO' AND arquivado = false AND status_operacional <> 'ENCERRADO'
UNION ALL
SELECT 'VERDE', count(*)::integer, 3
FROM public.processes WHERE semaforo_operacional = 'VERDE' AND arquivado = false AND status_operacional <> 'ENCERRADO';

-- View de Distribuição de Responsabilidade
CREATE OR REPLACE VIEW public.v_panel_responsibility_summary AS
SELECT responsabilidade_atual AS responsabilidade, count(*)::integer AS quantidade,
       CASE responsabilidade_atual
           WHEN 'OPERADORA' THEN 1
           WHEN 'ESCRITORIO' THEN 2
           WHEN 'JUDICIARIO' THEN 3
           WHEN 'TERCEIRO' THEN 4
           ELSE 5
       END AS ordem
FROM public.processes
WHERE arquivado = false AND status_operacional <> 'ENCERRADO'
GROUP BY responsabilidade_atual;

-- View de Processos Prioritários para o Dashboard
CREATE OR REPLACE VIEW public.v_panel_priority_processes AS
SELECT
    id,
    numero_processo,
    objeto_demanda,
    tipo_demanda,
    comarca,
    uf,
    status_operacional,
    responsabilidade_atual,
    nivel_risco,
    proxima_acao,
    proxima_acao_prazo,
    updated_at,
    semaforo_operacional,
    CASE semaforo_operacional WHEN 'VERMELHO' THEN 1 WHEN 'AMARELO' THEN 2 ELSE 3 END AS prioridade_ordem,
    proxima_acao_prazo AS proximo_marco,
    alert_codes
FROM public.v_process_management;

-- View de Métricas de E-mails
CREATE OR REPLACE VIEW public.v_panel_email_metrics AS
SELECT
    count(*)::integer AS emails_captados_total,
    count(*) FILTER (WHERE received_at >= date_trunc('day', timezone('utc'::text, now())))::integer AS emails_captados_hoje,
    count(*) FILTER (WHERE received_at >= (timezone('utc'::text, now()) - interval '7 days'))::integer AS emails_captados_7d,
    count(*) FILTER (WHERE status = 'PROCESSADO')::integer AS emails_tratados,
    count(*) FILTER (WHERE status = 'PENDENTE_IA')::integer AS emails_pendentes_ia,
    (SELECT count(*)::integer FROM public.email_exceptions WHERE status IN ('PENDENTE', 'EM_ANALISE')) AS emails_excecao,
    count(*) FILTER (WHERE status = 'IRRELEVANTE')::integer AS emails_irrelevantes
FROM public.processed_emails;

-- View de Saúde Operacional da Automação
CREATE OR REPLACE VIEW public.v_panel_operational_health AS
SELECT
    count(*) FILTER (WHERE status = 'PROCESSADO')::integer AS emails_processados,
    count(*) FILTER (WHERE status = 'PENDENTE_IA')::integer AS emails_pendentes,
    (SELECT count(*)::integer FROM public.email_exceptions WHERE status IN ('PENDENTE', 'EM_ANALISE')) AS excecoes_abertas,
    count(*) FILTER (WHERE status = 'IRRELEVANTE')::integer AS emails_irrelevantes,
    COALESCE((SELECT requests_count FROM public.ai_usage_daily WHERE usage_date = CURRENT_DATE AND model = 'gemini-3.8-flash'), 0)::integer AS chamadas_ia_hoje
FROM public.processed_emails;

-- View de KPIs de Prazos
CREATE OR REPLACE VIEW public.v_deadline_kpis AS
SELECT
    count(*) FILTER (WHERE status IN ('PENDENTE', 'EM_ANDAMENTO'))::integer AS total_abertas,
    count(*) FILTER (WHERE status IN ('PENDENTE', 'EM_ANDAMENTO') AND prazo < timezone('utc'::text, now()))::integer AS vencidas,
    count(*) FILTER (WHERE status IN ('PENDENTE', 'EM_ANDAMENTO') AND prazo >= timezone('utc'::text, now()) AND prazo <= timezone('utc'::text, now() + interval '48 hours'))::integer AS urgentes_48h,
    count(*) FILTER (WHERE status IN ('CUMPRIDA', 'CONCLUIDA'))::integer AS concluidas
FROM public.obligations;

-- View de Listagem e KPIs de Processos
CREATE OR REPLACE VIEW public.v_dashboard_process_kpis AS
SELECT
    count(*)::integer AS total_processos,
    count(*) FILTER (WHERE arquivado = false)::integer AS ativos,
    count(*) FILTER (WHERE arquivado = true)::integer AS arquivados,
    count(*) FILTER (WHERE prioridade = 'URGENTE')::integer AS urgentes
FROM public.processes;

CREATE OR REPLACE VIEW public.v_process_list AS
SELECT
    p.id,
    p.numero_processo,
    p.protocolo_externo,
    p.objeto_demanda,
    p.tipo_demanda,
    p.categoria_demanda,
    p.subcategoria_demanda,
    p.status_atual,
    p.status_operacional,
    p.responsabilidade_atual,
    p.prioridade,
    p.nivel_risco,
    p.semaforo_operacional,
    p.valor_causa,
    p.uf,
    p.comarca,
    c.nome AS company_nome,
    p.created_at,
    p.updated_at
FROM public.processes p
LEFT JOIN public.companies c ON c.id = p.company_id;

CREATE OR REPLACE VIEW public.v_process_operational_state AS
SELECT
    id,
    numero_processo,
    status_operacional,
    responsabilidade_atual,
    responsabilidade_desde,
    proxima_acao,
    proxima_acao_prazo,
    nivel_risco,
    semaforo_operacional,
    updated_at
FROM public.processes;

-- ============================================================================
-- 8. FUNÇÕES ARMAZENADAS E RPCS (SECURITY DEFINER COM SEARCH_PATH)
-- ============================================================================

-- Aquisição de Lock Distribuído
CREATE OR REPLACE FUNCTION public.try_acquire_automation_lock(
    p_lock_name TEXT,
    p_owner_token TEXT,
    p_lease_seconds INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_locked_until TIMESTAMPTZ := v_now + (p_lease_seconds || ' seconds')::interval;
    v_acquired BOOLEAN := FALSE;
BEGIN
    INSERT INTO public.automation_locks (lock_name, owner_token, locked_until, acquired_at, updated_at)
    VALUES (p_lock_name, p_owner_token, v_locked_until, v_now, v_now)
    ON CONFLICT (lock_name) DO UPDATE
    SET
        owner_token = p_owner_token,
        locked_until = v_locked_until,
        acquired_at = v_now,
        updated_at = v_now
    WHERE automation_locks.locked_until < v_now
       OR automation_locks.owner_token = p_owner_token;

    GET DIAGNOSTICS v_acquired = ROW_COUNT;
    RETURN v_acquired;
END;
$$;

-- Liberação de Lock Distribuído
CREATE OR REPLACE FUNCTION public.release_automation_lock(
    p_lock_name TEXT,
    p_owner_token TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_released BOOLEAN := FALSE;
BEGIN
    DELETE FROM public.automation_locks
    WHERE lock_name = p_lock_name AND owner_token = p_owner_token;

    GET DIAGNOSTICS v_released = ROW_COUNT;
    RETURN v_released;
END;
$$;

-- Resgate de Convite pelo Próprio Usuário Autenticado
CREATE OR REPLACE FUNCTION public.claim_my_invite()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_email TEXT;
    v_invite RECORD;
    v_profile RECORD;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado.';
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'E-mail do usuário não localizado no Auth.';
    END IF;

    -- Procura convite pendente para o e-mail
    SELECT * INTO v_invite
    FROM public.access_invites
    WHERE lower(email) = lower(v_email) AND status = 'PENDING' AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;

    -- Cria ou atualiza perfil
    INSERT INTO public.user_profiles (id, email, display_name, role, active, created_at, updated_at)
    VALUES (
        v_uid,
        v_email,
        split_part(v_email, '@', 1),
        COALESCE(v_invite.role, 'ANALISTA'),
        TRUE,
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        role = COALESCE(v_invite.role, user_profiles.role),
        active = TRUE,
        updated_at = now()
    RETURNING * INTO v_profile;

    IF v_invite.id IS NOT NULL THEN
        UPDATE public.access_invites
        SET status = 'CLAIMED', claimed_by = v_uid, claimed_at = now(), updated_at = now()
        WHERE id = v_invite.id;
    END IF;

    RETURN to_jsonb(v_profile);
END;
$$;

-- Criação ou Renovação de Convite por Administrador
CREATE OR REPLACE FUNCTION public.admin_create_or_refresh_invite(
    p_actor_id UUID,
    p_email TEXT,
    p_role TEXT,
    p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_invite RECORD;
BEGIN
    SELECT role INTO v_actor_role FROM public.user_profiles WHERE id = p_actor_id AND active = true;
    IF v_actor_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Apenas administradores podem criar ou renovar convites.';
    END IF;

    INSERT INTO public.access_invites (email, role, status, created_by, reason, expires_at, updated_at)
    VALUES (lower(trim(p_email)), p_role, 'PENDING', p_actor_id, p_reason, now() + interval '7 days', now())
    ON CONFLICT (email) DO UPDATE
    SET
        role = p_role,
        status = 'PENDING',
        created_by = p_actor_id,
        reason = p_reason,
        expires_at = now() + interval '7 days',
        updated_at = now()
    RETURNING * INTO v_invite;

    INSERT INTO public.user_access_audit (actor_id, target_user_id, action, new_value, reason)
    VALUES (p_actor_id, NULL, 'INVITE_CREATE_OR_REFRESH', to_jsonb(v_invite), p_reason);

    RETURN to_jsonb(v_invite);
END;
$$;

-- Revogação de Convite por Administrador
CREATE OR REPLACE FUNCTION public.admin_revoke_invite(
    p_actor_id UUID,
    p_invite_id UUID,
    p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_invite RECORD;
BEGIN
    SELECT role INTO v_actor_role FROM public.user_profiles WHERE id = p_actor_id AND active = true;
    IF v_actor_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Apenas administradores podem revogar convites.';
    END IF;

    UPDATE public.access_invites
    SET status = 'REVOKED', updated_at = now()
    WHERE id = p_invite_id
    RETURNING * INTO v_invite;

    INSERT INTO public.user_access_audit (actor_id, target_user_id, action, new_value, reason)
    VALUES (p_actor_id, NULL, 'INVITE_REVOKE', to_jsonb(v_invite), p_reason);

    RETURN to_jsonb(v_invite);
END;
$$;

-- Alteração de Papel de Usuário por Administrador
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
    p_actor_id UUID,
    p_target_user_id UUID,
    p_new_role TEXT,
    p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_old_role TEXT;
    v_updated RECORD;
BEGIN
    SELECT role INTO v_actor_role FROM public.user_profiles WHERE id = p_actor_id AND active = true;
    IF v_actor_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Apenas administradores podem alterar perfis de usuário.';
    END IF;

    SELECT role INTO v_old_role FROM public.user_profiles WHERE id = p_target_user_id;

    UPDATE public.user_profiles
    SET role = p_new_role, updated_at = now()
    WHERE id = p_target_user_id
    RETURNING * INTO v_updated;

    INSERT INTO public.user_access_audit (actor_id, target_user_id, action, old_value, new_value, reason)
    VALUES (p_actor_id, p_target_user_id, 'USER_ROLE_CHANGE', jsonb_build_object('role', v_old_role), jsonb_build_object('role', p_new_role), p_reason);

    RETURN to_jsonb(v_updated);
END;
$$;

-- Ativação/Desativação de Usuário por Administrador
CREATE OR REPLACE FUNCTION public.admin_set_user_active(
    p_actor_id UUID,
    p_target_user_id UUID,
    p_new_active BOOLEAN,
    p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_old_active BOOLEAN;
    v_updated RECORD;
BEGIN
    SELECT role INTO v_actor_role FROM public.user_profiles WHERE id = p_actor_id AND active = true;
    IF v_actor_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Apenas administradores podem ativar ou inativar usuários.';
    END IF;

    SELECT active INTO v_old_active FROM public.user_profiles WHERE id = p_target_user_id;

    UPDATE public.user_profiles
    SET active = p_new_active, updated_at = now()
    WHERE id = p_target_user_id
    RETURNING * INTO v_updated;

    INSERT INTO public.user_access_audit (actor_id, target_user_id, action, old_value, new_value, reason)
    VALUES (p_actor_id, p_target_user_id, 'USER_ACTIVE_CHANGE', jsonb_build_object('active', v_old_active), jsonb_build_object('active', p_new_active), p_reason);

    RETURN to_jsonb(v_updated);
END;
$$;

-- Atualização Gerencial de Processo
CREATE OR REPLACE FUNCTION public.update_process_management(
    p_process_id UUID,
    p_changes JSONB,
    p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old RECORD;
    v_new RECORD;
BEGIN
    SELECT * INTO v_old FROM public.processes WHERE id = p_process_id;
    IF v_old.id IS NULL THEN
        RAISE EXCEPTION 'Processo não encontrado.';
    END IF;

    UPDATE public.processes
    SET
        status_operacional = COALESCE(p_changes->>'status_operacional', status_operacional),
        responsabilidade_atual = COALESCE(p_changes->>'responsabilidade_atual', responsabilidade_atual),
        proxima_acao = CASE WHEN p_changes ? 'proxima_acao' THEN p_changes->>'proxima_acao' ELSE proxima_acao END,
        proxima_acao_prazo = CASE WHEN p_changes ? 'proxima_acao_prazo' THEN (p_changes->>'proxima_acao_prazo')::timestamptz ELSE proxima_acao_prazo END,
        nivel_risco = COALESCE(p_changes->>'nivel_risco', nivel_risco),
        exposicao_estimada = CASE WHEN p_changes ? 'exposicao_estimada' THEN (p_changes->>'exposicao_estimada')::numeric ELSE exposicao_estimada END,
        resumo_executivo = CASE WHEN p_changes ? 'resumo_executivo' THEN p_changes->>'resumo_executivo' ELSE resumo_executivo END,
        nota_executiva = CASE WHEN p_changes ? 'nota_executiva' THEN p_changes->>'nota_executiva' ELSE nota_executiva END,
        updated_at = now()
    WHERE id = p_process_id
    RETURNING * INTO v_new;

    RETURN to_jsonb(v_new);
END;
$$;

-- Cadastro de Pendência Operacional
CREATE OR REPLACE FUNCTION public.register_process_pendency(
    p_process_id UUID,
    p_description TEXT,
    p_responsible_type TEXT,
    p_criticality TEXT DEFAULT 'MEDIA',
    p_due_at TIMESTAMPTZ DEFAULT NULL,
    p_type TEXT DEFAULT 'OUTRA',
    p_responsible_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row RECORD;
BEGIN
    INSERT INTO public.process_pendencies (
        process_id, description, responsible_type, criticality,
        due_at, type, responsible_user_id, status, created_at, updated_at
    )
    VALUES (
        p_process_id, p_description, p_responsible_type, p_criticality,
        p_due_at, p_type, p_responsible_user_id, 'ABERTA', now(), now()
    )
    RETURNING * INTO v_row;

    RETURN to_jsonb(v_row);
END;
$$;

-- Alteração de Status de Pendência
CREATE OR REPLACE FUNCTION public.set_process_pendency_status(
    p_pendency_id UUID,
    p_status TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row RECORD;
BEGIN
    UPDATE public.process_pendencies
    SET
        status = p_status,
        resolved_at = CASE WHEN p_status IN ('RESOLVIDA', 'CANCELADA') THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = p_pendency_id
    RETURNING * INTO v_row;

    RETURN to_jsonb(v_row);
END;
$$;

-- Registro de Interação com Escritório
CREATE OR REPLACE FUNCTION public.register_law_firm_interaction(
    p_process_id UUID,
    p_law_firm_id UUID,
    p_interaction_type TEXT,
    p_expected_return_at TIMESTAMPTZ DEFAULT NULL,
    p_subject TEXT DEFAULT NULL,
    p_summary TEXT DEFAULT NULL,
    p_responsible_user_id UUID DEFAULT NULL,
    p_source_email_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row RECORD;
BEGIN
    INSERT INTO public.process_law_firm_interactions (
        process_id, law_firm_id, interaction_type, expected_return_at,
        subject, summary, responsible_user_id, source_email_id, sent_at, created_at, updated_at
    )
    VALUES (
        p_process_id, p_law_firm_id, p_interaction_type, p_expected_return_at,
        p_subject, p_summary, p_responsible_user_id, p_source_email_id, now(), now(), now()
    )
    RETURNING * INTO v_row;

    RETURN to_jsonb(v_row);
END;
$$;

-- Aplicação de Sugestão Gerencial Gerada por IA
CREATE OR REPLACE FUNCTION public.apply_ai_management_suggestion(
    p_suggestion_id UUID,
    p_actor_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sug RECORD;
    v_proc RECORD;
BEGIN
    SELECT * INTO v_sug FROM public.ai_management_suggestions WHERE id = p_suggestion_id;
    IF v_sug.id IS NULL THEN
        RAISE EXCEPTION 'Sugestão não encontrada.';
    END IF;

    UPDATE public.processes
    SET
        status_operacional = COALESCE(v_sug.status_operacional_sugerido, status_operacional),
        responsabilidade_atual = COALESCE(v_sug.responsabilidade_sugerida, responsabilidade_atual),
        nivel_risco = COALESCE(v_sug.nivel_risco_sugerido, nivel_risco),
        proxima_acao = COALESCE(v_sug.proxima_acao_sugerida, proxima_acao),
        proxima_acao_prazo = COALESCE(v_sug.prazo_sugerido, proxima_acao_prazo),
        updated_at = now()
    WHERE id = v_sug.process_id
    RETURNING * INTO v_proc;

    UPDATE public.ai_management_suggestions
    SET status = 'ACCEPTED', applied_by = p_actor_id, applied_at = now()
    WHERE id = p_suggestion_id;

    RETURN to_jsonb(v_proc);
END;
$$;

-- Enfileiramento de Atualização de Sugestões Gerenciais
CREATE OR REPLACE FUNCTION public.enqueue_ai_management_refresh(
    p_process_id UUID,
    p_debounce_seconds INTEGER DEFAULT 120
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_not_before TIMESTAMPTZ := now() + (p_debounce_seconds || ' seconds')::interval;
    v_row RECORD;
BEGIN
    INSERT INTO public.ai_management_refresh_queue (process_id, not_before, status, requested_at, updated_at)
    VALUES (p_process_id, v_not_before, 'PENDING', now(), now())
    RETURNING * INTO v_row;

    RETURN to_jsonb(v_row);
END;
$$;

-- Incremento de Quota e Janela de Minuto do Rate Limiter de IA
CREATE OR REPLACE FUNCTION public.increment_ai_usage_rate_window(
    p_model TEXT,
    p_window_minute TIMESTAMPTZ,
    p_count INTEGER DEFAULT 1
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.ai_usage_minute (window_minute, model, requests_count)
    VALUES (p_window_minute, p_model, p_count)
    ON CONFLICT (window_minute, model) DO UPDATE
    SET requests_count = ai_usage_minute.requests_count + p_count;
END;
$$;

-- Incremento de Quota Diária de IA
CREATE OR REPLACE FUNCTION public.increment_ai_usage_daily(
    p_model TEXT,
    p_usage_date DATE,
    p_requests INTEGER DEFAULT 1,
    p_input_tokens BIGINT DEFAULT 0,
    p_output_tokens BIGINT DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.ai_usage_daily (usage_date, model, requests_count, input_tokens, output_tokens, updated_at)
    VALUES (p_usage_date, p_model, p_requests, p_input_tokens, p_output_tokens, now())
    ON CONFLICT (usage_date, model) DO UPDATE
    SET
        requests_count = ai_usage_daily.requests_count + p_requests,
        input_tokens = ai_usage_daily.input_tokens + p_input_tokens,
        output_tokens = ai_usage_daily.output_tokens + p_output_tokens,
        updated_at = now();
END;
$$;

-- ============================================================================
-- 9. DADOS DE CATÁLOGO / SEED INICIAL
-- ============================================================================

INSERT INTO public.demand_classification_catalog (categoria, subcategoria, descricao)
VALUES
    ('ASSISTENCIAL', 'CIRURGIA', 'Procedimentos cirúrgicos, pré e pós-operatórios'),
    ('ASSISTENCIAL', 'EXAME', 'Exames laboratoriais, de imagem ou especializados'),
    ('ASSISTENCIAL', 'MEDICAMENTO', 'Fornecimento de fármacos, medicamentos de alto custo ou off-label'),
    ('ASSISTENCIAL', 'INTERNACAO', 'Internações hospitalares, leitos clínicos e UTI'),
    ('ASSISTENCIAL', 'HOME_CARE', 'Assistência domiciliar e cuidados multidisciplinares em casa'),
    ('ASSISTENCIAL', 'TERAPIA', 'Terapias especializadas, ABA, fisioterapia, fonoaudiologia'),
    ('ASSISTENCIAL', 'OPME', 'Órteses, próteses e materiais especiais autônomos'),
    ('ASSISTENCIAL', 'OUTRO_ASSISTENCIAL', 'Outras demandas de assistência à saúde'),
    ('CONTRATUAL', 'CANCELAMENTO', 'Discussão sobre cancelamento ou rescisão unilateral de plano'),
    ('CONTRATUAL', 'REAJUSTE', 'Discussão sobre índices de reajuste por faixa etária ou sinistralidade'),
    ('CONTRATUAL', 'PORTABILIDADE', 'Portabilidade de carências e migração contratual'),
    ('CONTRATUAL', 'REDE_CREDENCIADA', 'Alterações ou descredenciamento na rede médica'),
    ('CONTRATUAL', 'OUTRO_CONTRATUAL', 'Outras controvérsias estritamente contratuais'),
    ('INDENIZATORIA', 'DANO_MORAL', 'Indenização exclusivamente pecuniária por abalo moral'),
    ('INDENIZATORIA', 'DANO_MATERIAL', 'Ressarcimento e restituição de valores gastos'),
    ('COBRANCA', 'COBRANCA_DIVIDA', 'Cobrança de mensalidades ou coparticipações inadimplidas'),
    ('NAO_CLASSIFICADO', 'NAO_CLASSIFICADO', 'Demanda pendente de classificação objetiva')
ON CONFLICT (categoria, subcategoria) DO NOTHING;

INSERT INTO public.legal_nature_catalog (codigo, nome, descricao)
VALUES
    ('OBRIGACAO_FAZER', 'Obrigação de Fazer', 'Pedido de autorização, fornecimento ou providência concreta'),
    ('OBRIGACAO_NAO_FAZER', 'Obrigação de Não Fazer', 'Abstenção de cancelamento, cobrança ou negativa'),
    ('INDENIZATORIA', 'Indenizatória', 'Reparação pecuniária por dano moral ou estético'),
    ('CONDENATORIA', 'Condenatória', 'Pagamento de quantia certa, restituição ou condenação'),
    ('DECLARATORIA', 'Declaratória', 'Declaração de validade, nulidade de cláusula ou relação jurídica'),
    ('CONSTITUTIVA', 'Constitutiva', 'Criação, modificação ou extinção de relação jurídica')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.system_config (key, value, description)
VALUES
    ('ai_management_automation', '{"enabled": true, "debounce_seconds": 120, "worker_batch_size": 5, "max_attempts": 3, "ordering": "NEWEST_FIRST"}'::jsonb, 'Controle de automação de sugestões gerenciais por IA')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 10. SEGURANÇA E ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.law_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_pendencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_law_firm_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_management_suggestions ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura para Usuários Autenticados
CREATE POLICY "authenticated_select_processes" ON public.processes FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_select_companies" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_select_law_firms" ON public.law_firms FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_select_parties" ON public.process_parties FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_select_timeline" ON public.process_timeline FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_select_evidence" ON public.process_evidence FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_select_obligations" ON public.obligations FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_select_emails" ON public.processed_emails FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_select_exceptions" ON public.email_exceptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_select_profiles" ON public.user_profiles FOR SELECT TO authenticated USING (true);

-- Permissões de Escrita para Usuários Autenticados
CREATE POLICY "authenticated_modify_processes" ON public.processes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_modify_obligations" ON public.obligations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_modify_timeline" ON public.process_timeline FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_modify_pendencies" ON public.process_pendencies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_modify_interactions" ON public.process_law_firm_interactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Concessão para Service Role (Workers e Automação do Backend)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- Concessão para Usuários Autenticados (Frontend)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO authenticated;
