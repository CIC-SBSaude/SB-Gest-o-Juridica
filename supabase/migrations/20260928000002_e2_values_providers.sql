-- ============================================================================
-- Migration: 20260928000002_e2_values_providers.sql
-- Entrega: E2 — Valores e Prestadores (RF09, RF11, RF12, RF13, RF14)
-- Natureza: Totalmente aditiva — não remove nem altera tabelas existentes
-- Roles válidos no sistema: ADMIN, GESTOR, ANALISTA, CONSULTA
-- ============================================================================

-- 1. RF09: Tabela de decisões e sentenças versionadas
CREATE TABLE IF NOT EXISTS public.process_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('SENTENCA', 'ACORDAO', 'DECISAO_INTERLOCUTORIA', 'TUTELA', 'OUTRO')),
    data_decisao DATE,
    estado_valor TEXT NOT NULL CHECK (estado_valor IN ('QUANTIFICADA', 'ILIQUIDA', 'NAO_MONETARIA', 'PENDENTE_REVISAO', 'DESCONHECIDA')),
    montante NUMERIC(15,2), -- Pode ser 0.00; NULL se ilíquida ou não monetária
    moeda TEXT NOT NULL DEFAULT 'BRL',
    is_referencia BOOLEAN NOT NULL DEFAULT FALSE,
    documento_ref TEXT,
    trecho_citado TEXT,
    motivo_escolha TEXT,
    substituida_por_id UUID REFERENCES public.process_decisions(id) ON DELETE SET NULL,
    versao INTEGER NOT NULL DEFAULT 1,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    revisado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    revisado_em TIMESTAMPTZ,
    CONSTRAINT chk_decisions_montante_estado CHECK (
        (estado_valor = 'QUANTIFICADA' AND montante IS NOT NULL) OR
        (estado_valor IN ('ILIQUIDA', 'NAO_MONETARIA') AND montante IS NULL) OR
        (estado_valor IN ('PENDENTE_REVISAO', 'DESCONHECIDA'))
    )
);

CREATE INDEX IF NOT EXISTS idx_process_decisions_process_id ON public.process_decisions(process_id);
CREATE INDEX IF NOT EXISTS idx_process_decisions_referencia ON public.process_decisions(process_id) WHERE is_referencia = TRUE;

-- 2. RF11: Tabela de prestadores vinculados ao processo
CREATE TABLE IF NOT EXISTS public.process_service_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    party_id UUID REFERENCES public.process_parties(id) ON DELETE SET NULL,
    nome_razao_social TEXT NOT NULL,
    tipo_pessoa TEXT NOT NULL CHECK (tipo_pessoa IN ('PJ', 'PF')),
    documento TEXT, -- CNPJ ou CPF limpo (apenas dígitos)
    categoria TEXT NOT NULL CHECK (categoria IN ('HOSPITAL', 'CLINICA', 'OPME', 'MEDICO_PJ', 'MANUTENCAO', 'OUTRO')),
    natureza_vinculo TEXT NOT NULL, -- ex: CONTRATUAL_DIRETO, CREDENCIADO, SUBEMPREITADA, EMERGENCIAL, NAO_CONFIRMADO, OUTRO
    vinculo_confirmado BOOLEAN NOT NULL DEFAULT FALSE,
    papel_processual TEXT NOT NULL DEFAULT 'AUTOR' CHECK (papel_processual IN ('AUTOR', 'CITADO_LOCAL', 'LITISCONSORTE', 'TERCEIRO', 'OUTRO')),
    origem_evidencia TEXT,
    observacoes TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    revisado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    revisado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_psp_process_id ON public.process_service_providers(process_id);
CREATE INDEX IF NOT EXISTS idx_psp_documento ON public.process_service_providers(documento) WHERE documento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_psp_categoria ON public.process_service_providers(categoria);

-- 3. RF12: Tabela de serviços e períodos do prestador
CREATE TABLE IF NOT EXISTS public.provider_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.process_service_providers(id) ON DELETE CASCADE,
    tipo_servico TEXT NOT NULL,
    descricao TEXT,
    periodo_inicio DATE,
    periodo_fim DATE,
    precisao_data TEXT NOT NULL DEFAULT 'EXATA' CHECK (precisao_data IN ('EXATA', 'MENSAL', 'INTERVALO_ABERTO', 'DESCONHECIDA')),
    competencia_entrada TEXT, -- Formato YYYY-MM
    vencimento_fatura DATE,
    fonte TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_provider_services_periodo CHECK (
        periodo_fim IS NULL OR periodo_inicio IS NULL OR periodo_fim >= periodo_inicio
    )
);

CREATE INDEX IF NOT EXISTS idx_pserv_process_id ON public.provider_services(process_id);
CREATE INDEX IF NOT EXISTS idx_pserv_provider_id ON public.provider_services(provider_id);

-- 4. RF13: Tabela de componentes financeiros discriminados (dívida, danos, multas)
CREATE TABLE IF NOT EXISTS public.process_financial_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES public.process_service_providers(id) ON DELETE SET NULL,
    service_id UUID REFERENCES public.provider_services(id) ON DELETE SET NULL,
    decision_id UUID REFERENCES public.process_decisions(id) ON DELETE SET NULL,
    fase TEXT NOT NULL CHECK (fase IN ('PEDIDO', 'SENTENCA', 'ACORDO', 'OUTRO')),
    natureza TEXT NOT NULL CHECK (natureza IN ('DIVIDA_SERVICO', 'DANO_MATERIAL', 'DANO_MORAL', 'OUTRO_IDENTIFICADO', 'MULTA_ASTREINTES', 'HONORARIOS')),
    valor NUMERIC(15,2) NOT NULL,
    moeda TEXT NOT NULL DEFAULT 'BRL',
    cumulativo BOOLEAN NOT NULL DEFAULT TRUE,
    sobreposto BOOLEAN NOT NULL DEFAULT FALSE,
    status_revisao TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status_revisao IN ('PENDENTE', 'CONFIRMADO', 'DIVERGENTE', 'REJEITADO')),
    fonte TEXT,
    descricao TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    revisado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    revisado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pfc_process_id ON public.process_financial_components(process_id);
CREATE INDEX IF NOT EXISTS idx_pfc_fase ON public.process_financial_components(fase);
CREATE INDEX IF NOT EXISTS idx_pfc_natureza ON public.process_financial_components(natureza);
CREATE INDEX IF NOT EXISTS idx_pfc_provider_id ON public.process_financial_components(provider_id) WHERE provider_id IS NOT NULL;

-- ============================================================================
-- Triggers e Regras de Negócio
-- ============================================================================

-- Trigger: garantir apenas uma decisão com is_referencia = TRUE por processo
CREATE OR REPLACE FUNCTION public.enforce_single_decision_referencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.is_referencia = TRUE THEN
        UPDATE public.process_decisions
        SET is_referencia = FALSE,
            atualizado_em = now()
        WHERE process_id = NEW.process_id
          AND id <> NEW.id
          AND is_referencia = TRUE;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_decision_referencia ON public.process_decisions;
CREATE OR REPLACE TRIGGER trg_single_decision_referencia
    BEFORE INSERT OR UPDATE OF is_referencia ON public.process_decisions
    FOR EACH ROW
    WHEN (NEW.is_referencia = TRUE)
    EXECUTE FUNCTION public.enforce_single_decision_referencia();

-- ============================================================================
-- Views Analíticas (RF09 e RF13)
-- ============================================================================

-- View: Destaque de valores (RF09)
-- "interpretar valor requerido somente se não tiver sentença como regra de destaque,
-- preservando o histórico do pedido"
CREATE OR REPLACE VIEW public.v_process_financial_highlight AS
WITH sentenca_ref AS (
    SELECT DISTINCT ON (process_id)
        id AS decision_id,
        process_id,
        tipo,
        data_decisao,
        estado_valor,
        montante,
        motivo_escolha,
        documento_ref
    FROM public.process_decisions
    WHERE is_referencia = TRUE
    ORDER BY process_id, data_decisao DESC NULLS LAST, criado_em DESC
),
pedidos_calc AS (
    SELECT
        process_id,
        SUM(valor) FILTER (WHERE cumulativo = TRUE AND sobreposto = FALSE) AS total_pedidos_discriminados,
        COUNT(*) AS qtd_itens_pedido
    FROM public.process_financial_components
    WHERE fase = 'PEDIDO'
    GROUP BY process_id
)
SELECT
    p.id AS process_id,
    p.numero_processo,
    p.valor_causa,
    p.exposicao_estimada,
    ped.total_pedidos_discriminados,
    COALESCE(ped.total_pedidos_discriminados, p.valor_causa) AS valor_pedido_conhecido,
    sr.decision_id AS sentenca_referencia_id,
    sr.tipo AS sentenca_tipo,
    sr.data_decisao AS sentenca_data,
    sr.estado_valor AS sentenca_estado_valor,
    sr.montante AS sentenca_montante,
    CASE
        WHEN sr.decision_id IS NOT NULL AND sr.estado_valor = 'QUANTIFICADA' THEN 'SENTENCA_QUANTIFICADA'
        WHEN sr.decision_id IS NOT NULL AND sr.estado_valor = 'ILIQUIDA' THEN 'SENTENCA_ILIQUIDA'
        WHEN sr.decision_id IS NOT NULL AND sr.estado_valor = 'NAO_MONETARIA' THEN 'SENTENCA_NAO_MONETARIA'
        WHEN sr.decision_id IS NOT NULL AND sr.estado_valor = 'PENDENTE_REVISAO' THEN 'REVISAO_PENDENTE'
        WHEN COALESCE(ped.total_pedidos_discriminados, p.valor_causa) IS NOT NULL THEN 'PEDIDO_SEM_SENTENCA'
        ELSE 'SEM_REGISTRO'
    END AS destaque_estado,
    CASE
        WHEN sr.decision_id IS NOT NULL AND sr.estado_valor = 'QUANTIFICADA' THEN 'Valor Sentenciado'
        WHEN sr.decision_id IS NOT NULL AND sr.estado_valor = 'ILIQUIDA' THEN 'Sentença Ilíquida (A apurar)'
        WHEN sr.decision_id IS NOT NULL AND sr.estado_valor = 'NAO_MONETARIA' THEN 'Sentença Não Monetária'
        WHEN sr.decision_id IS NOT NULL AND sr.estado_valor = 'PENDENTE_REVISAO' THEN 'Sentença em Revisão'
        WHEN COALESCE(ped.total_pedidos_discriminados, p.valor_causa) IS NOT NULL THEN 'Valor Requerido'
        ELSE 'Sem Valor Registrado'
    END AS destaque_rotulo,
    CASE
        WHEN sr.decision_id IS NOT NULL AND sr.estado_valor = 'QUANTIFICADA' THEN sr.montante
        WHEN sr.decision_id IS NOT NULL AND sr.estado_valor IN ('ILIQUIDA', 'NAO_MONETARIA', 'PENDENTE_REVISAO') THEN NULL
        ELSE COALESCE(ped.total_pedidos_discriminados, p.valor_causa)
    END AS destaque_valor
FROM public.processes p
LEFT JOIN sentenca_ref sr ON sr.process_id = p.id
LEFT JOIN pedidos_calc ped ON ped.process_id = p.id;

-- View: Resumo financeiro por prestador (RF13)
CREATE OR REPLACE VIEW public.v_provider_debt_summary AS
SELECT
    psp.id AS provider_id,
    psp.process_id,
    psp.nome_razao_social,
    psp.categoria,
    psp.natureza_vinculo,
    psp.vinculo_confirmado,
    COUNT(DISTINCT ps.id)::integer AS qtd_servicos,
    COALESCE(SUM(pfc.valor) FILTER (WHERE pfc.natureza = 'DIVIDA_SERVICO' AND pfc.cumulativo = TRUE AND pfc.sobreposto = FALSE), 0)::numeric(15,2) AS total_divida_servico,
    COALESCE(SUM(pfc.valor) FILTER (WHERE pfc.natureza = 'DANO_MATERIAL' AND pfc.cumulativo = TRUE AND pfc.sobreposto = FALSE), 0)::numeric(15,2) AS total_dano_material,
    COALESCE(SUM(pfc.valor) FILTER (WHERE pfc.natureza = 'DANO_MORAL' AND pfc.cumulativo = TRUE AND pfc.sobreposto = FALSE), 0)::numeric(15,2) AS total_dano_moral,
    COALESCE(SUM(pfc.valor) FILTER (WHERE pfc.cumulativo = TRUE AND pfc.sobreposto = FALSE), 0)::numeric(15,2) AS total_cumulativo,
    BOOL_OR(pfc.sobreposto) AS tem_sobreposicao,
    BOOL_OR(pfc.status_revisao = 'PENDENTE') AS tem_revisao_pendente
FROM public.process_service_providers psp
LEFT JOIN public.provider_services ps ON ps.provider_id = psp.id
LEFT JOIN public.process_financial_components pfc ON pfc.provider_id = psp.id
GROUP BY psp.id, psp.process_id, psp.nome_razao_social, psp.categoria, psp.natureza_vinculo, psp.vinculo_confirmado;

-- ============================================================================
-- RLS (Row Level Security)
-- ============================================================================

ALTER TABLE public.process_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_financial_components ENABLE ROW LEVEL SECURITY;

-- process_decisions
DROP POLICY IF EXISTS "Autenticado lê decisões" ON public.process_decisions;
CREATE POLICY "Autenticado lê decisões" ON public.process_decisions
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Analista+ escreve decisões" ON public.process_decisions;
CREATE POLICY "Analista+ escreve decisões" ON public.process_decisions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'GESTOR', 'ANALISTA') AND active = TRUE
        )
    );

-- process_service_providers
DROP POLICY IF EXISTS "Autenticado lê prestadores" ON public.process_service_providers;
CREATE POLICY "Autenticado lê prestadores" ON public.process_service_providers
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Analista+ escreve prestadores" ON public.process_service_providers;
CREATE POLICY "Analista+ escreve prestadores" ON public.process_service_providers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'GESTOR', 'ANALISTA') AND active = TRUE
        )
    );

-- provider_services
DROP POLICY IF EXISTS "Autenticado lê serviços" ON public.provider_services;
CREATE POLICY "Autenticado lê serviços" ON public.provider_services
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Analista+ escreve serviços" ON public.provider_services;
CREATE POLICY "Analista+ escreve serviços" ON public.provider_services
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'GESTOR', 'ANALISTA') AND active = TRUE
        )
    );

-- process_financial_components
DROP POLICY IF EXISTS "Autenticado lê componentes financeiros" ON public.process_financial_components;
CREATE POLICY "Autenticado lê componentes financeiros" ON public.process_financial_components
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Analista+ escreve componentes financeiros" ON public.process_financial_components;
CREATE POLICY "Analista+ escreve componentes financeiros" ON public.process_financial_components
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'GESTOR', 'ANALISTA') AND active = TRUE
        )
    );
