-- ============================================================================
-- E1 FUNDAÇÃO E CADASTRO — Migração Aditiva
-- Requisitos: RF01, RF02, RF03, RF08, RF15, RF16, RF18
-- Regra: NÃO reescreve tabelas existentes. Apenas ADD COLUMN e CREATE TABLE IF NOT EXISTS.
-- ============================================================================

-- ============================================================================
-- RF01 / RF18 — Segmento e CNJ normalizado na tabela processes
-- ============================================================================

ALTER TABLE public.processes
    ADD COLUMN IF NOT EXISTS segmento TEXT
        CHECK (segmento IN ('ASSISTENCIAL', 'PRESTADOR', 'OUTRO', 'NAO_CLASSIFICADO')),
    ADD COLUMN IF NOT EXISTS segmento_origem TEXT
        CHECK (segmento_origem IN ('MANUAL', 'IA', 'IA_CONFIRMADA'))
        DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS segmento_atualizado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cnj_normalizado TEXT; -- CNJ sem pontuação (apenas dígitos) para busca

COMMENT ON COLUMN public.processes.segmento IS
    'RF01 — ASSISTENCIAL, PRESTADOR, OUTRO ou NAO_CLASSIFICADO. Separado da natureza jurídica.';
COMMENT ON COLUMN public.processes.cnj_normalizado IS
    'RF18 — CNJ em formato normalizado (somente dígitos) para busca sem colisão de pontuação.';

-- Índices para os novos campos em processes
CREATE INDEX IF NOT EXISTS idx_processes_segmento
    ON public.processes(segmento)
    WHERE segmento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_processes_cnj_normalizado
    ON public.processes(cnj_normalizado)
    WHERE cnj_normalizado IS NOT NULL;

-- ============================================================================
-- RF02 — Empresas rés do processo (process_defendants)
-- Separação entre empresa-contrato (company_id legado) e réus processuais
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.process_defendants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT,
    -- Quando ré não identificada ou "outra ré" sem cadastro canônico:
    nome_livre TEXT,
    documento_livre TEXT,
    papel TEXT NOT NULL DEFAULT 'REU'
        CHECK (papel IN ('REU', 'REU_SOLIDARIO', 'REU_SUBSIDIARIO', 'NAO_IDENTIFICADA', 'OUTRA')),
    -- Evidência que confirma esse polo passivo
    evidencia_texto TEXT,
    evidencia_fonte TEXT, -- 'EMAIL', 'DOCUMENTO', 'MANUAL'
    confirmado BOOLEAN NOT NULL DEFAULT FALSE,
    -- Auditoria
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    -- Histórico de correções humanas
    correcao_anterior JSONB, -- snapshot do estado anterior ao corrigir
    correcao_motivo TEXT,
    correcao_em TIMESTAMPTZ,
    correcao_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    -- Garantia: mesma empresa não é ré duas vezes no mesmo processo
    CONSTRAINT uq_process_defendant_company
        UNIQUE (process_id, company_id)
        DEFERRABLE INITIALLY DEFERRED,
    -- Pelo menos um de company_id ou nome_livre deve estar preenchido
    CONSTRAINT chk_defendant_identity
        CHECK (company_id IS NOT NULL OR nome_livre IS NOT NULL)
);

COMMENT ON TABLE public.process_defendants IS
    'RF02 — Empresas rés do processo. Separada de company_id (empresa vinculada/contrato).';

CREATE INDEX IF NOT EXISTS idx_process_defendants_process
    ON public.process_defendants(process_id);
CREATE INDEX IF NOT EXISTS idx_process_defendants_company
    ON public.process_defendants(company_id)
    WHERE company_id IS NOT NULL;

-- ============================================================================
-- RF03 — Competência de origem (process_origin)
-- Registra a data de origem do processo com rastreabilidade completa
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.process_origin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    -- A data de origem propriamente dita (em fuso America/Sao_Paulo)
    data_origem DATE,
    competencia_mes INTEGER, -- 1-12
    competencia_ano INTEGER,
    -- Tipo da data usada (D01 — a decidir qual é a "de negócio")
    tipo_data TEXT NOT NULL
        CHECK (tipo_data IN (
            'DATA_DECLARADA_EMAIL',  -- data escrita no corpo/cabeçalho do email
            'DATA_RECEBIMENTO_CAIXA', -- received_at do servidor IMAP
            'DATA_IMPORTACAO',        -- quando o email entrou no sistema
            'DATA_CADASTRO_JURIDICO', -- quando o processo foi criado no sistema
            'DATA_MANUAL'             -- informada manualmente pelo usuário
        )),
    -- Confiabilidade da origem
    confiabilidade TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (confiabilidade IN ('COMPROVADA', 'INFERIDA', 'MANUAL', 'PENDENTE')),
    -- Email que originou esta datação
    email_referencia_id UUID REFERENCES public.processed_emails(id) ON DELETE SET NULL,
    -- Quando manual, quem informou e por quê
    manual BOOLEAN NOT NULL DEFAULT FALSE,
    justificativa_manual TEXT,
    -- Quem fez o cálculo/definição desta origem
    definido_por TEXT NOT NULL DEFAULT 'SISTEMA'
        CHECK (definido_por IN ('SISTEMA', 'USUARIO', 'IA')),
    definido_por_usuario_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    -- Versão/histórico: a última registro com is_current=true é a origem ativa
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    substituido_por UUID REFERENCES public.process_origin(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    -- Garantia de unicidade da origem atual por processo
    CONSTRAINT chk_competencia_mes_range
        CHECK (competencia_mes IS NULL OR (competencia_mes >= 1 AND competencia_mes <= 12)),
    CONSTRAINT chk_competencia_ano_range
        CHECK (competencia_ano IS NULL OR competencia_ano >= 1900)
);

COMMENT ON TABLE public.process_origin IS
    'RF03 — Competência de origem do processo com tipo, confiabilidade e rastreabilidade. '
    'Uma data inferida nunca aparece como comprovada.';

CREATE INDEX IF NOT EXISTS idx_process_origin_process_current
    ON public.process_origin(process_id, is_current)
    WHERE is_current = TRUE;

-- ============================================================================
-- RF08 — Catálogo assistencial controlado (assistential_catalog)
-- Classe + Detalhe com sinônimos e relações válidas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.assistential_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classe TEXT NOT NULL
        CHECK (classe IN ('EXAME', 'CIRURGIA', 'CONSULTA', 'INTERNACAO', 'TERAPIA', 'OUTRO')),
    detalhe TEXT NOT NULL, -- ex: 'Ultrassonografia', 'Endocrinologia', 'Cirurgia de hérnia'
    detalhe_normalizado TEXT NOT NULL,
    sinonimos TEXT[] DEFAULT '{}',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    -- Identificador estável para referências futuras mesmo após rename
    codigo_estavel TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_assistential_class_detail UNIQUE (classe, detalhe_normalizado)
);

COMMENT ON TABLE public.assistential_catalog IS
    'RF08 — Catálogo controlado de classe e detalhe do atendimento. '
    'Desativar item não apaga histórico (ativo=false).';

CREATE INDEX IF NOT EXISTS idx_assistential_catalog_classe
    ON public.assistential_catalog(classe)
    WHERE ativo = TRUE;
CREATE INDEX IF NOT EXISTS idx_assistential_catalog_detalhe
    ON public.assistential_catalog(detalhe_normalizado);

-- Itens do catálogo inicial (RF08 — Consulta faltava; Exame e Cirurgia existiam)
INSERT INTO public.assistential_catalog (classe, detalhe, detalhe_normalizado, codigo_estavel, sinonimos)
VALUES
    ('CONSULTA', 'Consulta Médica (Geral)', 'consulta medica geral', 'CONS_GERAL', '{"consulta geral","consulta médica"}'),
    ('CONSULTA', 'Endocrinologia', 'endocrinologia', 'CONS_ENDOCRINOLOGIA', '{"endócrino","endocrin"}'),
    ('CONSULTA', 'Cardiologia', 'cardiologia', 'CONS_CARDIOLOGIA', '{}'),
    ('CONSULTA', 'Ortopedia', 'ortopedia', 'CONS_ORTOPEDIA', '{}'),
    ('CONSULTA', 'Neurologia', 'neurologia', 'CONS_NEUROLOGIA', '{}'),
    ('EXAME', 'Ultrassonografia', 'ultrassonografia', 'EXAM_USG', '{"ultrassom","usg"}'),
    ('EXAME', 'Tomografia Computadorizada', 'tomografia computadorizada', 'EXAM_TC', '{"tomografia","tc","tac"}'),
    ('EXAME', 'Ressonância Magnética', 'ressonancia magnetica', 'EXAM_RM', '{"ressonancia","rm","rmn"}'),
    ('EXAME', 'Hemograma', 'hemograma', 'EXAM_HMG', '{}'),
    ('CIRURGIA', 'Cirurgia de Hérnia', 'cirurgia de hernia', 'CIR_HERNIA', '{"hernia","hérnia"}'),
    ('CIRURGIA', 'Cirurgia Cardíaca', 'cirurgia cardiaca', 'CIR_CARDIACA', '{}'),
    ('CIRURGIA', 'Cirurgia Ortopédica', 'cirurgia ortopedica', 'CIR_ORTOPEDICA', '{}')
ON CONFLICT (classe, detalhe_normalizado) DO NOTHING;

-- ============================================================================
-- RF08 — Itens assistenciais por processo (process_assistential_items)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.process_assistential_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    catalog_id UUID REFERENCES public.assistential_catalog(id) ON DELETE RESTRICT,
    -- Texto livre como complemento (sempre disponível)
    descricao_livre TEXT,
    -- Apenas um item pode ser predominante por processo
    predominante BOOLEAN NOT NULL DEFAULT FALSE,
    -- Rastreabilidade
    fonte TEXT NOT NULL DEFAULT 'MANUAL'
        CHECK (fonte IN ('MANUAL', 'IA', 'IA_CONFIRMADA')),
    evidencia_id UUID REFERENCES public.process_evidence(id) ON DELETE SET NULL,
    -- Revisão humana
    revisao TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (revisao IN ('PENDENTE', 'ACEITA', 'CORRIGIDA', 'REJEITADA')),
    revisado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    revisado_em TIMESTAMPTZ,
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    -- Pelo menos catalog_id ou descricao_livre deve estar preenchido
    CONSTRAINT chk_item_identity
        CHECK (catalog_id IS NOT NULL OR descricao_livre IS NOT NULL)
);

COMMENT ON TABLE public.process_assistential_items IS
    'RF08 — Itens assistenciais do processo. Um processo com 3 itens conta 1 no total de processos '
    'e 3 em indicador explicitamente denominado itens. Apenas um predominante por processo.';

-- Função para garantir apenas um predominante por processo
CREATE OR REPLACE FUNCTION public.enforce_single_predominant_assistential()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.predominante = TRUE THEN
        UPDATE public.process_assistential_items
        SET predominante = FALSE
        WHERE process_id = NEW.process_id
          AND id <> NEW.id
          AND predominante = TRUE;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_single_predominant_assistential
    BEFORE INSERT OR UPDATE ON public.process_assistential_items
    FOR EACH ROW EXECUTE FUNCTION public.enforce_single_predominant_assistential();

CREATE INDEX IF NOT EXISTS idx_process_assistential_items_process
    ON public.process_assistential_items(process_id);
CREATE INDEX IF NOT EXISTS idx_process_assistential_items_catalog
    ON public.process_assistential_items(catalog_id)
    WHERE catalog_id IS NOT NULL;

-- ============================================================================
-- RF15 — Pendências de qualidade por campo (process_quality_pendencies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.process_quality_pendencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    -- Campo que originou a pendência
    campo TEXT NOT NULL, -- ex: 'numero_processo', 'segmento', 'reu', 'origem', 'beneficiario', etc.
    -- Motivo categorizado
    motivo TEXT NOT NULL
        CHECK (motivo IN (
            'NAO_INFORMADO',          -- campo vazio/nulo sem justificativa
            'NAO_APLICAVEL',          -- explicitamente não se aplica ao processo
            'PENDENTE_CONFIRMACAO',   -- aguardando revisão humana
            'ERRO_CONSULTA',          -- falha ao buscar dado externo
            'FORMATO_INVALIDO',       -- valor existe mas não passa na validação
            'DADO_SUSPEITO'           -- detectado como possível erro (ex: protocolo com fragmento narrativo)
        )),
    descricao TEXT NOT NULL,
    -- Responsável pela resolução
    responsavel_tipo TEXT
        CHECK (responsavel_tipo IN ('OPERADORA', 'ESCRITORIO', 'TI', 'EXTERNO', 'NAO_DEFINIDO')),
    responsavel_usuario_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    -- Prioridade da pendência
    prioridade TEXT NOT NULL DEFAULT 'MEDIA'
        CHECK (prioridade IN ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE')),
    -- Ciclo de vida
    estado TEXT NOT NULL DEFAULT 'ABERTA'
        CHECK (estado IN ('ABERTA', 'EM_TRATAMENTO', 'RESOLVIDA', 'IGNORADA', 'CANCELADA')),
    resolucao_descricao TEXT,
    resolvido_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    resolvido_em TIMESTAMPTZ,
    -- Origem da pendência
    origem TEXT NOT NULL DEFAULT 'SISTEMA'
        CHECK (origem IN ('SISTEMA', 'USUARIO', 'IA', 'VALIDACAO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.process_quality_pendencies IS
    'RF15 — Pendências de qualidade por campo. Saneamento de um campo encerra apenas sua pendência. '
    'Diferencia NAO_INFORMADO, NAO_APLICAVEL, PENDENTE_CONFIRMACAO e ERRO_CONSULTA.';

CREATE INDEX IF NOT EXISTS idx_quality_pendencies_process
    ON public.process_quality_pendencies(process_id, estado)
    WHERE estado NOT IN ('RESOLVIDA', 'CANCELADA');

CREATE INDEX IF NOT EXISTS idx_quality_pendencies_campo
    ON public.process_quality_pendencies(campo, estado);

-- ============================================================================
-- RF16 — Fila de enriquecimento por tipo (enrichment_jobs)
-- Separar captura, vínculo, extração, sugestão e aplicação
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.enrichment_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID REFERENCES public.processes(id) ON DELETE CASCADE,
    email_id UUID REFERENCES public.processed_emails(id) ON DELETE CASCADE,
    -- Tipo de trabalho — nunca misturar com o backfill de classificação existente
    tipo TEXT NOT NULL
        CHECK (tipo IN (
            'CLASSIFICACAO_SEGMENTO',
            'EXTRACAO_REU',
            'EXTRACAO_ORIGEM',
            'EXTRACAO_BENEFICIARIO',
            'EXTRACAO_VALORES',
            'EXTRACAO_PRESTADOR',
            'EXTRACAO_ALEGACOES',
            'VINCULO_DOCUMENTAL'
        )),
    -- Estado da fila
    estado TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (estado IN ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO', 'QUARENTENA', 'CANCELADO')),
    prioridade INTEGER NOT NULL DEFAULT 5 CHECK (prioridade BETWEEN 1 AND 10),
    -- Idempotência: chave única por fonte + tipo + versão do extrator
    chave_idempotente TEXT NOT NULL,
    versao_extrator TEXT,
    -- Retentativas
    tentativas INTEGER NOT NULL DEFAULT 0,
    max_tentativas INTEGER NOT NULL DEFAULT 3,
    proximo_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    -- Checkpoint para retomada
    checkpoint JSONB DEFAULT '{}'::jsonb,
    -- Resultado
    ultimo_erro TEXT,
    ultimo_erro_tipo TEXT
        CHECK (ultimo_erro_tipo IN ('TRANSITORIO', 'CONTRATO', 'AUTORIZACAO', 'DESCONHECIDO')),
    concluido_em TIMESTAMPTZ,
    -- Custo (desconhecido até tabela de preços ser validada — RF16)
    custo_estimado NUMERIC(10,6),
    custo_real NUMERIC(10,6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_enrichment_idempotente UNIQUE (chave_idempotente),
    -- Ou process_id ou email_id deve estar preenchido
    CONSTRAINT chk_enrichment_target
        CHECK (process_id IS NOT NULL OR email_id IS NOT NULL)
);

COMMENT ON TABLE public.enrichment_jobs IS
    'RF16 — Fila de enriquecimento por tipo. chave_idempotente impede duplicação em reprocessamento. '
    'Erros de contrato/autorização não são retentativas transitórias.';

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_estado_prioridade
    ON public.enrichment_jobs(estado, prioridade DESC, proximo_em)
    WHERE estado IN ('PENDENTE', 'ERRO');

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_process
    ON public.enrichment_jobs(process_id)
    WHERE process_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_chave
    ON public.enrichment_jobs(chave_idempotente);

-- ============================================================================
-- RF18 — Análise de duplicidades por CNJ (process_cnj_duplicates)
-- Registra grupos de processos com mesmo CNJ para triagem
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.process_cnj_duplicates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cnj_normalizado TEXT NOT NULL,
    process_ids UUID[] NOT NULL, -- todos os process_id com esse CNJ
    quantidade INTEGER NOT NULL,
    -- Estado da análise
    estado TEXT NOT NULL DEFAULT 'PENDENTE_ANALISE'
        CHECK (estado IN ('PENDENTE_ANALISE', 'EM_ANALISE', 'ESCLARECIDO', 'CONSOLIDADO')),
    motivo_multiplicidade TEXT, -- após análise: o que explica os múltiplos registros
    processo_canonico_id UUID REFERENCES public.processes(id) ON DELETE SET NULL,
    analisado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    analisado_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_cnj_duplicate_cnj UNIQUE (cnj_normalizado)
);

COMMENT ON TABLE public.process_cnj_duplicates IS
    'RF18 — Análise de possíveis duplicidades por CNJ. Não impõe índice único nem funde casos. '
    'Consolidação futura exige escolha de canônico e auditoria.';

CREATE INDEX IF NOT EXISTS idx_cnj_duplicates_estado
    ON public.process_cnj_duplicates(estado)
    WHERE estado NOT IN ('ESCLARECIDO', 'CONSOLIDADO');

-- ============================================================================
-- RLS — Row Level Security para as novas tabelas
-- Segue padrão das tabelas existentes: autenticado lê, ADMIN/ADVOGADO/ANALISTA escrevem
-- ============================================================================

ALTER TABLE public.process_defendants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_origin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistential_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_assistential_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_quality_pendencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_cnj_duplicates ENABLE ROW LEVEL SECURITY;

-- process_defendants
CREATE POLICY "Autenticado lê rés" ON public.process_defendants
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Analista+ cria rés" ON public.process_defendants
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'ADVOGADO', 'ANALISTA') AND active = TRUE
        )
    );
CREATE POLICY "Analista+ edita rés" ON public.process_defendants
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'ADVOGADO', 'ANALISTA') AND active = TRUE
        )
    );

-- process_origin
CREATE POLICY "Autenticado lê origens" ON public.process_origin
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Analista+ escreve origens" ON public.process_origin
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'ADVOGADO', 'ANALISTA') AND active = TRUE
        )
    );

-- assistential_catalog
CREATE POLICY "Autenticado lê catálogo" ON public.assistential_catalog
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin gerencia catálogo" ON public.assistential_catalog
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'ADMIN' AND active = TRUE
        )
    );

-- process_assistential_items
CREATE POLICY "Autenticado lê itens" ON public.process_assistential_items
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Analista+ escreve itens" ON public.process_assistential_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'ADVOGADO', 'ANALISTA') AND active = TRUE
        )
    );

-- process_quality_pendencies
CREATE POLICY "Autenticado lê pendências" ON public.process_quality_pendencies
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Sistema e analista escrevem pendências" ON public.process_quality_pendencies
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'ADVOGADO', 'ANALISTA') AND active = TRUE
        )
    );

-- enrichment_jobs (somente backend lê/escreve via service_role; frontend lê via RLS)
CREATE POLICY "Autenticado lê jobs" ON public.enrichment_jobs
    FOR SELECT USING (auth.role() = 'authenticated');

-- process_cnj_duplicates
CREATE POLICY "Autenticado lê duplicatas" ON public.process_cnj_duplicates
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Analista+ gerencia duplicatas" ON public.process_cnj_duplicates
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'ADVOGADO', 'ANALISTA') AND active = TRUE
        )
    );

-- ============================================================================
-- Função: popular cnj_normalizado a partir de numero_processo existente
-- Remove todos os caracteres não numéricos
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalize_cnj(p_numero TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT regexp_replace(COALESCE(p_numero, ''), '[^0-9]', '', 'g');
$$;

-- Trigger para manter cnj_normalizado atualizado automaticamente
CREATE OR REPLACE FUNCTION public.sync_cnj_normalizado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.cnj_normalizado := public.normalize_cnj(NEW.numero_processo);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_sync_cnj_normalizado
    BEFORE INSERT OR UPDATE OF numero_processo ON public.processes
    FOR EACH ROW EXECUTE FUNCTION public.sync_cnj_normalizado();

-- Preencher cnj_normalizado nos registros existentes
UPDATE public.processes
SET cnj_normalizado = public.normalize_cnj(numero_processo)
WHERE numero_processo IS NOT NULL AND cnj_normalizado IS NULL;

-- ============================================================================
-- View analítica: resumo de segmentos e cobertura (RF17)
-- ============================================================================

CREATE OR REPLACE VIEW public.v_segment_coverage AS
SELECT
    COALESCE(segmento, 'NAO_CLASSIFICADO') AS segmento,
    COUNT(*)::integer AS total,
    COUNT(*) FILTER (WHERE arquivado = FALSE AND status_operacional <> 'ENCERRADO')::integer AS ativos,
    COUNT(*) FILTER (WHERE segmento IS NOT NULL)::integer AS com_segmento,
    ROUND(
        COUNT(*) FILTER (WHERE segmento IS NOT NULL)::numeric
        / NULLIF(COUNT(*)::numeric, 0) * 100,
        1
    ) AS cobertura_pct
FROM public.processes
GROUP BY COALESCE(segmento, 'NAO_CLASSIFICADO');

-- View analítica: resumo de rés por processo (RF02/RF17)
CREATE OR REPLACE VIEW public.v_defendant_summary AS
SELECT
    pd.process_id,
    COUNT(*)::integer AS total_reus,
    COUNT(*) FILTER (WHERE pd.confirmado = TRUE)::integer AS reus_confirmados,
    ARRAY_AGG(c.nome ORDER BY c.nome) FILTER (WHERE c.nome IS NOT NULL) AS nomes_empresas,
    ARRAY_AGG(pd.nome_livre ORDER BY pd.nome_livre) FILTER (WHERE pd.nome_livre IS NOT NULL) AS nomes_livres,
    BOOL_OR(pd.confirmado) AS tem_reu_confirmado
FROM public.process_defendants pd
LEFT JOIN public.companies c ON c.id = pd.company_id
GROUP BY pd.process_id;

-- View analítica: pendências de qualidade abertas (RF15/RF17)
CREATE OR REPLACE VIEW public.v_quality_pendency_summary AS
SELECT
    campo,
    motivo,
    COUNT(*)::integer AS total_abertas,
    COUNT(DISTINCT process_id)::integer AS processos_afetados,
    COUNT(*) FILTER (WHERE prioridade IN ('ALTA', 'URGENTE'))::integer AS alta_prioridade
FROM public.process_quality_pendencies
WHERE estado IN ('ABERTA', 'EM_TRATAMENTO')
GROUP BY campo, motivo
ORDER BY processos_afetados DESC;
