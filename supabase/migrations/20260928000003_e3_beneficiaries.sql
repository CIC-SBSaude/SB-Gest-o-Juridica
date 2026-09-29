-- ============================================================================
-- Migration: 20260928000003_e3_beneficiaries.sql
-- Entrega: E3 — Beneficiários (RF05, RF06, RF07)
-- Natureza: Totalmente aditiva — não remove nem altera tabelas existentes
-- Roles válidos no sistema: ADMIN, GESTOR, ANALISTA, CONSULTA
-- ============================================================================

-- 1. RF05: Tabela de dados cadastrais de beneficiários (Pessoa Física)
CREATE TABLE IF NOT EXISTS public.beneficiary_persons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_completo TEXT NOT NULL,
    cpf TEXT, -- Normalizado (apenas 11 dígitos numéricos)
    data_nascimento DATE,
    nome_mae TEXT,
    cns TEXT, -- Cartão Nacional de Saúde
    municipio TEXT,
    uf VARCHAR(2),
    codigo_municipio_ibge VARCHAR(7),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bp_cpf ON public.beneficiary_persons(cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bp_nome ON public.beneficiary_persons(nome_completo);

-- 2. RF06: Mapeamento administrável de Regionais (Município/UF -> Regional de Saúde)
CREATE TABLE IF NOT EXISTS public.regional_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    municipio TEXT NOT NULL,
    uf VARCHAR(2) NOT NULL,
    codigo_ibge VARCHAR(7),
    regional_operacional TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_regional_municipio_uf UNIQUE (municipio, uf)
);

CREATE INDEX IF NOT EXISTS idx_rm_uf_municipio ON public.regional_mappings(uf, municipio);

-- 3. RF06/RF07: Inscrições no plano / Carteirinhas e contratos
CREATE TABLE IF NOT EXISTS public.beneficiary_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES public.beneficiary_persons(id) ON DELETE CASCADE,
    numero_carteirinha TEXT NOT NULL,
    plano_codigo TEXT,
    plano_nome TEXT,
    status_inscricao TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status_inscricao IN ('ATIVO', 'CANCELADO', 'SUSPENSO', 'DESCONHECIDO')),
    tipo_contratacao TEXT NOT NULL DEFAULT 'NAO_INFORMADO' CHECK (tipo_contratacao IN ('COLETIVO_EMPRESARIAL', 'COLETIVO_ADESAO', 'INDIVIDUAL_FAMILIAR', 'OUTRO', 'NAO_INFORMADO')),
    contrato_codigo TEXT,
    estipulante_pj_nome TEXT,
    estipulante_pj_cnpj TEXT, -- Limpo (apenas dígitos)
    data_adesao DATE,
    data_cancelamento DATE,
    abrangencia TEXT,
    acomodacao TEXT,
    segmentacao_assistencial TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_be_carteirinha ON public.beneficiary_enrollments(numero_carteirinha);
CREATE INDEX IF NOT EXISTS idx_be_person_id ON public.beneficiary_enrollments(person_id);

-- 4. RF05/RF06/RF07: Vínculo N:N entre Processo e Beneficiários (com snapshot da data do fato)
CREATE TABLE IF NOT EXISTS public.process_beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.beneficiary_persons(id) ON DELETE CASCADE,
    enrollment_id UUID REFERENCES public.beneficiary_enrollments(id) ON DELETE SET NULL,
    papel TEXT NOT NULL DEFAULT 'TITULAR' CHECK (papel IN ('TITULAR', 'DEPENDENTE', 'REPRESENTANTE_LEGAL', 'FALECIDO', 'OUTRO')),
    is_principal BOOLEAN NOT NULL DEFAULT FALSE,
    representa_person_id UUID REFERENCES public.beneficiary_persons(id) ON DELETE SET NULL,
    snapshot_municipio TEXT,
    snapshot_uf VARCHAR(2),
    snapshot_regional TEXT,
    snapshot_idade_na_data INTEGER,
    snapshot_data_referencia DATE,
    fonte_consulta TEXT,
    confirmado BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    revisado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    revisado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pb_process_id ON public.process_beneficiaries(process_id);
CREATE INDEX IF NOT EXISTS idx_pb_person_id ON public.process_beneficiaries(person_id);
CREATE INDEX IF NOT EXISTS idx_pb_principal ON public.process_beneficiaries(process_id) WHERE is_principal = TRUE;

-- ============================================================================
-- Triggers e Regras de Negócio
-- ============================================================================

-- Trigger: garantir que apenas um beneficiário seja marcado como principal por processo
CREATE OR REPLACE FUNCTION public.enforce_single_principal_beneficiary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.is_principal = TRUE THEN
        UPDATE public.process_beneficiaries
        SET is_principal = FALSE,
            atualizado_em = now()
        WHERE process_id = NEW.process_id
          AND id <> NEW.id
          AND is_principal = TRUE;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_principal_beneficiary ON public.process_beneficiaries;
CREATE OR REPLACE TRIGGER trg_single_principal_beneficiary
    BEFORE INSERT OR UPDATE OF is_principal ON public.process_beneficiaries
    FOR EACH ROW
    WHEN (NEW.is_principal = TRUE)
    EXECUTE FUNCTION public.enforce_single_principal_beneficiary();

-- ============================================================================
-- View Analítica: Resumo de beneficiários vinculados ao processo
-- ============================================================================

CREATE OR REPLACE VIEW public.v_process_beneficiaries_summary AS
SELECT
    pb.id AS process_beneficiary_id,
    pb.process_id,
    pb.papel,
    pb.is_principal,
    pb.confirmado,
    pb.snapshot_municipio,
    pb.snapshot_uf,
    pb.snapshot_regional,
    pb.snapshot_idade_na_data,
    pb.snapshot_data_referencia,
    pb.fonte_consulta,
    bp.id AS person_id,
    bp.nome_completo,
    bp.cpf,
    bp.data_nascimento,
    bp.cns,
    be.id AS enrollment_id,
    be.numero_carteirinha,
    be.plano_nome,
    be.tipo_contratacao,
    be.status_inscricao,
    be.estipulante_pj_nome,
    be.estipulante_pj_cnpj
FROM public.process_beneficiaries pb
JOIN public.beneficiary_persons bp ON bp.id = pb.person_id
LEFT JOIN public.beneficiary_enrollments be ON be.id = pb.enrollment_id;

-- ============================================================================
-- RLS (Row Level Security)
-- ============================================================================

ALTER TABLE public.beneficiary_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regional_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficiary_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_beneficiaries ENABLE ROW LEVEL SECURITY;

-- beneficiary_persons
DROP POLICY IF EXISTS "Autenticado lê pessoas beneficiárias" ON public.beneficiary_persons;
CREATE POLICY "Autenticado lê pessoas beneficiárias" ON public.beneficiary_persons
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Analista+ escreve pessoas beneficiárias" ON public.beneficiary_persons;
CREATE POLICY "Analista+ escreve pessoas beneficiárias" ON public.beneficiary_persons
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'GESTOR', 'ANALISTA') AND active = TRUE
        )
    );

-- regional_mappings
DROP POLICY IF EXISTS "Autenticado lê regionais" ON public.regional_mappings;
CREATE POLICY "Autenticado lê regionais" ON public.regional_mappings
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin gerencia regionais" ON public.regional_mappings;
CREATE POLICY "Admin gerencia regionais" ON public.regional_mappings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'ADMIN' AND active = TRUE
        )
    );

-- beneficiary_enrollments
DROP POLICY IF EXISTS "Autenticado lê carteirinhas" ON public.beneficiary_enrollments;
CREATE POLICY "Autenticado lê carteirinhas" ON public.beneficiary_enrollments
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Analista+ escreve carteirinhas" ON public.beneficiary_enrollments;
CREATE POLICY "Analista+ escreve carteirinhas" ON public.beneficiary_enrollments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'GESTOR', 'ANALISTA') AND active = TRUE
        )
    );

-- process_beneficiaries
DROP POLICY IF EXISTS "Autenticado lê vínculos de beneficiários" ON public.process_beneficiaries;
CREATE POLICY "Autenticado lê vínculos de beneficiários" ON public.process_beneficiaries
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Analista+ escreve vínculos de beneficiários" ON public.process_beneficiaries;
CREATE POLICY "Analista+ escreve vínculos de beneficiários" ON public.process_beneficiaries
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'GESTOR', 'ANALISTA') AND active = TRUE
        )
    );
