-- ============================================================================
-- Migration: 20260928000004_e5_allegations_review.sql
-- Entrega: E5 — IA Complementar & Alegações do Beneficiário (RF10, RF14)
-- Natureza: Totalmente aditiva — não remove nem altera tabelas existentes
-- Roles válidos no sistema: ADMIN, GESTOR, ANALISTA, CONSULTA
-- ============================================================================

-- 1. RF10: Tabela de dificuldades alegadas pelo beneficiário
CREATE TABLE IF NOT EXISTS public.beneficiary_allegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    beneficiary_person_id UUID REFERENCES public.beneficiary_persons(id) ON DELETE SET NULL,
    narrativa TEXT NOT NULL,
    tentativas_contato_qtd INTEGER,
    tentativas_contato_texto TEXT,
    canais_mencionados TEXT[],
    setor_mencionado TEXT,
    tempo_espera_dias INTEGER,
    tempo_espera_texto TEXT,
    dificuldade_relatada TEXT,
    desfecho_alegado TEXT,
    fonte_documento TEXT,
    trecho_citado TEXT,
    status_revisao TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status_revisao IN ('PENDENTE', 'CONFIRMADA', 'DIVERGENTE', 'REJEITADA')),
    revisao_justificativa TEXT,
    revisado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    revisado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_narrativa_prefixo CHECK (narrativa LIKE 'Supostamente, o(a) beneficiário(a)%')
);

CREATE INDEX IF NOT EXISTS idx_ba_process_id ON public.beneficiary_allegations(process_id);
CREATE INDEX IF NOT EXISTS idx_ba_status ON public.beneficiary_allegations(status_revisao);

-- 2. RF14: Tabela de auditoria atômica de revisão humana
CREATE TABLE IF NOT EXISTS public.human_review_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    entidade_tipo TEXT NOT NULL, -- ex: ALEGACAO, COMPONENTE_FINANCEIRO, DECISAO, REU, PRESTADOR, BENEFICIARIO
    entidade_id UUID NOT NULL,
    acao TEXT NOT NULL CHECK (acao IN ('CRIAR', 'ACEITAR', 'CORRIGIR', 'REJEITAR', 'SUPERAR')),
    valor_anterior JSONB,
    valor_novo JSONB,
    justificativa TEXT,
    fonte_documento TEXT,
    trecho_citado TEXT,
    revisado_por UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hrl_process_id ON public.human_review_log(process_id);
CREATE INDEX IF NOT EXISTS idx_hrl_entidade ON public.human_review_log(entidade_tipo, entidade_id);

-- ============================================================================
-- RLS (Row Level Security)
-- ============================================================================

ALTER TABLE public.beneficiary_allegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_review_log ENABLE ROW LEVEL SECURITY;

-- beneficiary_allegations
DROP POLICY IF EXISTS "Autenticado lê alegações" ON public.beneficiary_allegations;
CREATE POLICY "Autenticado lê alegações" ON public.beneficiary_allegations
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Analista+ escreve alegações" ON public.beneficiary_allegations;
CREATE POLICY "Analista+ escreve alegações" ON public.beneficiary_allegations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'GESTOR', 'ANALISTA') AND active = TRUE
        )
    );

-- human_review_log
DROP POLICY IF EXISTS "Autenticado lê logs de revisão" ON public.human_review_log;
CREATE POLICY "Autenticado lê logs de revisão" ON public.human_review_log
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Analista+ grava logs de revisão" ON public.human_review_log;
CREATE POLICY "Analista+ grava logs de revisão" ON public.human_review_log
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'GESTOR', 'ANALISTA') AND active = TRUE
        )
    );
