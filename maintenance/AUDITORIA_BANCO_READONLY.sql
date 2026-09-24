-- ============================================================================
-- SB GESTÃO JURÍDICA - AUDITORIA READ-ONLY DO BANCO
-- Baseline de aplicação: 2026-09-12
--
-- OBJETIVO
--   Comparar o banco real do Supabase com o contrato esperado pela aplicação,
--   medir integridade referencial, filas, locks, RLS, RPCs e saúde operacional.
--
-- SEGURANÇA
--   ESTE ARQUIVO CONTÉM APENAS SELECTs.
--   Não há INSERT, UPDATE, DELETE, ALTER, CREATE, DROP, TRUNCATE ou CALL.
--
-- USO RECOMENDADO
--   1) Execute a SEÇÃO 1 primeiro.
--   2) Se houver objetos críticos AUSENTES, envie o resultado antes de seguir.
--   3) Se a estrutura estiver presente, execute as demais seções.
-- ============================================================================

-- ==========================================================================
-- SEÇÃO 0 - IDENTIFICAÇÃO DO AMBIENTE
-- ==========================================================================
select
  now() as audit_at_utc,
  current_database() as database_name,
  current_user as database_user,
  version() as postgres_version;

-- ==========================================================================
-- SEÇÃO 1 - OBJETOS ESPERADOS PELA APLICAÇÃO
-- ==========================================================================
with expected(kind, object_name, criticality) as (
  values
    -- Tabelas centrais
    ('TABLE','processes','CRITICO'),
    ('TABLE','processed_emails','CRITICO'),
    ('TABLE','process_evidence','CRITICO'),
    ('TABLE','process_timeline','CRITICO'),
    ('TABLE','obligations','CRITICO'),
    ('TABLE','email_processing_runs','CRITICO'),
    ('TABLE','email_exceptions','CRITICO'),
    ('TABLE','user_profiles','CRITICO'),
    ('TABLE','access_invites','CRITICO'),
    ('TABLE','system_config','CRITICO'),
    ('TABLE','email_account_config','CRITICO'),
    ('TABLE','automation_locks','CRITICO'),
    ('TABLE','ai_model_health','CRITICO'),
    ('TABLE','ai_management_refresh_queue','CRITICO'),
    ('TABLE','ai_management_suggestions','CRITICO'),
    ('TABLE','ai_demand_classification_backfill_queue','CRITICO'),

    -- Tabelas funcionais
    ('TABLE','companies','ALTO'),
    ('TABLE','company_aliases','ALTO'),
    ('TABLE','company_resolution_audit','ALTO'),
    ('TABLE','company_resolution_candidates','ALTO'),
    ('TABLE','law_firms','ALTO'),
    ('TABLE','process_pendencies','ALTO'),
    ('TABLE','process_law_firm_interactions','ALTO'),
    ('TABLE','process_operational_history','ALTO'),
    ('TABLE','process_responsibility_history','ALTO'),
    ('TABLE','operational_rules_config','ALTO'),
    ('TABLE','process_parties','ALTO'),
    ('TABLE','process_documents','ALTO'),
    ('TABLE','process_history','ALTO'),
    ('TABLE','email_sender_rules','MEDIO'),
    ('TABLE','email_keyword_rules','MEDIO'),
    ('TABLE','ai_usage_daily','MEDIO'),
    ('TABLE','ai_usage_minute','MEDIO'),
    ('TABLE','demand_classification_catalog','MEDIO'),
    ('TABLE','legal_nature_catalog','MEDIO'),
    ('TABLE','user_access_audit','MEDIO'),

    -- Views usadas pela aplicação/painéis
    ('VIEW','v_process_management','ALTO'),
    ('VIEW','v_process_operational_state','MEDIO'),
    ('VIEW','v_panel_executive_kpis','ALTO'),
    ('VIEW','v_panel_operational_health','ALTO'),
    ('VIEW','v_panel_priority_processes','ALTO'),
    ('VIEW','v_panel_responsibility_summary','ALTO'),
    ('VIEW','v_panel_risk_summary','ALTO'),
    ('VIEW','v_panel_email_metrics','MEDIO'),
    ('VIEW','v_deadline_kpis','MEDIO'),
    ('VIEW','v_dashboard_process_kpis','MEDIO'),
    ('VIEW','v_process_list','MEDIO')
), actual as (
  select
    case c.relkind
      when 'r' then 'TABLE'
      when 'p' then 'TABLE'
      when 'v' then 'VIEW'
      when 'm' then 'VIEW'
      else 'OTHER'
    end as kind,
    c.relname as object_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
)
select
  e.kind,
  e.object_name,
  e.criticality,
  case when a.object_name is null then 'AUSENTE' else 'OK' end as status
from expected e
left join actual a
  on a.kind = e.kind and a.object_name = e.object_name
order by
  case e.criticality when 'CRITICO' then 1 when 'ALTO' then 2 else 3 end,
  e.kind,
  e.object_name;

-- ==========================================================================
-- SEÇÃO 2 - COLUNAS CRÍTICAS ESPERADAS
-- ==========================================================================
with expected(table_name, column_name, criticality) as (
  values
    ('processes','id','CRITICO'),
    ('processes','numero_processo','CRITICO'),
    ('processes','status_atual','CRITICO'),
    ('processes','company_id','ALTO'),
    ('processes','status_operacional','ALTO'),
    ('processes','responsabilidade_atual','ALTO'),
    ('processes','nivel_risco','ALTO'),
    ('processes','updated_at','CRITICO'),

    ('processed_emails','id','CRITICO'),
    ('processed_emails','message_id','CRITICO'),
    ('processed_emails','thread_key','ALTO'),
    ('processed_emails','content_hash','ALTO'),
    ('processed_emails','process_id','CRITICO'),
    ('processed_emails','status','CRITICO'),
    ('processed_emails','imap_uid','CRITICO'),
    ('processed_emails','mailbox','CRITICO'),
    ('processed_emails','received_at','CRITICO'),
    ('processed_emails','updated_at','CRITICO'),

    ('process_evidence','id','CRITICO'),
    ('process_evidence','process_id','CRITICO'),
    ('process_evidence','processed_email_id','CRITICO'),
    ('process_evidence','created_at','ALTO'),

    ('process_timeline','id','CRITICO'),
    ('process_timeline','process_id','CRITICO'),
    ('process_timeline','email_id','ALTO'),
    ('process_timeline','tipo','ALTO'),
    ('process_timeline','data_hora','ALTO'),
    ('process_timeline','created_at','ALTO'),

    ('obligations','id','CRITICO'),
    ('obligations','process_id','CRITICO'),
    ('obligations','prazo','ALTO'),
    ('obligations','status','ALTO'),
    ('obligations','valor_multa_diaria','MEDIO'),
    ('obligations','valor_multa_limite','MEDIO'),

    ('email_processing_runs','id','CRITICO'),
    ('email_processing_runs','started_at','CRITICO'),
    ('email_processing_runs','completed_at','CRITICO'),
    ('email_processing_runs','status','CRITICO'),

    ('automation_locks','lock_name','CRITICO'),
    ('automation_locks','owner_token','CRITICO'),
    ('automation_locks','locked_until','CRITICO'),
    ('automation_locks','updated_at','CRITICO'),

    ('email_account_config','id','CRITICO'),
    ('email_account_config','active','CRITICO'),
    ('email_account_config','email','CRITICO'),
    ('email_account_config','host','CRITICO'),
    ('email_account_config','port','CRITICO'),
    ('email_account_config','secure','CRITICO'),
    ('email_account_config','mailbox','CRITICO'),
    ('email_account_config','sync_interval_minutes','ALTO'),
    ('email_account_config','sync_batch_size','ALTO'),
    ('email_account_config','last_connection_status','MEDIO'),

    ('user_profiles','id','CRITICO'),
    ('user_profiles','email','CRITICO'),
    ('user_profiles','role','CRITICO'),
    ('user_profiles','active','CRITICO'),

    ('ai_model_health','model','CRITICO'),
    ('ai_model_health','circuit_open_until','CRITICO'),
    ('ai_model_health','last_error_code','ALTO'),
    ('ai_model_health','last_failure_at','MEDIO'),
    ('ai_model_health','last_success_at','MEDIO')
)
select
  e.table_name,
  e.column_name,
  e.criticality,
  case when c.column_name is null then 'AUSENTE' else 'OK' end as status,
  c.data_type,
  c.is_nullable
from expected e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = e.table_name
 and c.column_name = e.column_name
order by
  case e.criticality when 'CRITICO' then 1 when 'ALTO' then 2 else 3 end,
  e.table_name,
  e.column_name;

-- ==========================================================================
-- SEÇÃO 3 - RPCs/FUNÇÕES ESPERADAS E SEGURANÇA
-- ==========================================================================
with expected(function_name, criticality) as (
  values
    ('claim_my_invite','CRITICO'),
    ('try_acquire_automation_lock','CRITICO'),
    ('release_automation_lock','CRITICO'),
    ('admin_create_or_refresh_invite','ALTO'),
    ('admin_revoke_invite','ALTO'),
    ('admin_set_user_active','ALTO'),
    ('admin_set_user_role','ALTO'),
    ('update_process_management','ALTO'),
    ('register_process_pendency','ALTO'),
    ('set_process_pendency_status','ALTO'),
    ('register_law_firm_interaction','ALTO'),
    ('apply_ai_management_suggestion','ALTO'),
    ('enqueue_ai_management_refresh','ALTO'),
    ('increment_ai_usage_rate_window','MEDIO'),
    ('increment_ai_usage_daily','MEDIO')
), funcs as (
  select
    p.proname as function_name,
    p.prosecdef as security_definer,
    pg_get_function_identity_arguments(p.oid) as arguments,
    p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select
  e.function_name,
  e.criticality,
  case when f.function_name is null then 'AUSENTE' else 'OK' end as status,
  f.security_definer,
  f.arguments,
  f.proconfig as function_config
from expected e
left join funcs f on f.function_name = e.function_name
order by
  case e.criticality when 'CRITICO' then 1 when 'ALTO' then 2 else 3 end,
  e.function_name,
  f.arguments;

-- Funções SECURITY DEFINER sem search_path explícito merecem revisão.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  case
    when not p.prosecdef then 'N/A'
    when coalesce(array_to_string(p.proconfig, ','),'') ilike '%search_path=%' then 'OK'
    else 'REVISAR_SEARCH_PATH'
  end as audit_status
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname, arguments;

-- ==========================================================================
-- SEÇÃO 4 - RLS, POLICIES E GRANTS
-- ==========================================================================
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p')
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated','service_role')
order by table_name, grantee, privilege_type;

-- ==========================================================================
-- SEÇÃO 5 - ÍNDICES E CONSTRAINTS
-- ==========================================================================
select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
left join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
 and tc.table_schema = ccu.table_schema
where tc.table_schema = 'public'
order by tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position;

-- ==========================================================================
-- SEÇÃO 6 - RESUMO OPERACIONAL / CONTAGENS
-- Execute esta seção somente após confirmar que as tabelas críticas existem.
-- ==========================================================================
select 'processes' as objeto, count(*)::bigint as total from public.processes
union all select 'processed_emails', count(*) from public.processed_emails
union all select 'process_evidence', count(*) from public.process_evidence
union all select 'process_timeline', count(*) from public.process_timeline
union all select 'obligations', count(*) from public.obligations
union all select 'email_exceptions', count(*) from public.email_exceptions
union all select 'email_processing_runs', count(*) from public.email_processing_runs
union all select 'ai_management_suggestions', count(*) from public.ai_management_suggestions
union all select 'ai_management_refresh_queue', count(*) from public.ai_management_refresh_queue
union all select 'ai_demand_classification_backfill_queue', count(*) from public.ai_demand_classification_backfill_queue
union all select 'company_resolution_candidates', count(*) from public.company_resolution_candidates
union all select 'user_profiles', count(*) from public.user_profiles
order by objeto;

-- Status da caixa jurídica
select status, count(*)::bigint as total
from public.processed_emails
group by status
order by total desc, status;

-- Filas de IA/gestão
select 'ai_management_refresh_queue' as fila, status, count(*)::bigint as total
from public.ai_management_refresh_queue
group by status
union all
select 'ai_demand_classification_backfill_queue', status, count(*)
from public.ai_demand_classification_backfill_queue
group by status
order by fila, status;

-- Exceções
select status, count(*)::bigint as total
from public.email_exceptions
group by status
order by total desc, status;

-- ==========================================================================
-- SEÇÃO 7 - INTEGRIDADE REFERENCIAL LÓGICA
-- Retorno esperado para todas as linhas: 0.
-- ==========================================================================
select 'processed_emails.process_id -> processes.id' as check_name, count(*)::bigint as problems
from public.processed_emails pe
left join public.processes p on p.id = pe.process_id
where pe.process_id is not null and p.id is null
union all
select 'process_evidence.process_id -> processes.id', count(*)
from public.process_evidence e
left join public.processes p on p.id = e.process_id
where e.process_id is not null and p.id is null
union all
select 'process_evidence.processed_email_id -> processed_emails.id', count(*)
from public.process_evidence e
left join public.processed_emails pe on pe.id = e.processed_email_id
where e.processed_email_id is not null and pe.id is null
union all
select 'process_timeline.process_id -> processes.id', count(*)
from public.process_timeline t
left join public.processes p on p.id = t.process_id
where t.process_id is not null and p.id is null
union all
select 'process_timeline.email_id -> processed_emails.id', count(*)
from public.process_timeline t
left join public.processed_emails pe on pe.id = t.email_id
where t.email_id is not null and pe.id is null
union all
select 'obligations.process_id -> processes.id', count(*)
from public.obligations o
left join public.processes p on p.id = o.process_id
where o.process_id is not null and p.id is null
union all
select 'process_parties.process_id -> processes.id', count(*)
from public.process_parties x
left join public.processes p on p.id = x.process_id
where x.process_id is not null and p.id is null
union all
select 'process_documents.process_id -> processes.id', count(*)
from public.process_documents x
left join public.processes p on p.id = x.process_id
where x.process_id is not null and p.id is null
union all
select 'process_history.process_id -> processes.id', count(*)
from public.process_history x
left join public.processes p on p.id = x.process_id
where x.process_id is not null and p.id is null
union all
select 'process_pendencies.process_id -> processes.id', count(*)
from public.process_pendencies x
left join public.processes p on p.id = x.process_id
where x.process_id is not null and p.id is null
union all
select 'process_law_firm_interactions.process_id -> processes.id', count(*)
from public.process_law_firm_interactions x
left join public.processes p on p.id = x.process_id
where x.process_id is not null and p.id is null
union all
select 'process_operational_history.process_id -> processes.id', count(*)
from public.process_operational_history x
left join public.processes p on p.id = x.process_id
where x.process_id is not null and p.id is null
union all
select 'ai_management_suggestions.process_id -> processes.id', count(*)
from public.ai_management_suggestions x
left join public.processes p on p.id = x.process_id
where x.process_id is not null and p.id is null
union all
select 'ai_management_refresh_queue.process_id -> processes.id', count(*)
from public.ai_management_refresh_queue x
left join public.processes p on p.id = x.process_id
where x.process_id is not null and p.id is null
union all
select 'ai_demand_classification_backfill_queue.process_id -> processes.id', count(*)
from public.ai_demand_classification_backfill_queue x
left join public.processes p on p.id = x.process_id
where x.process_id is not null and p.id is null
union all
select 'email_exceptions.processed_email_id -> processed_emails.id', count(*)
from public.email_exceptions x
left join public.processed_emails pe on pe.id = x.processed_email_id
where x.processed_email_id is not null and pe.id is null
union all
select 'company_aliases.company_id -> companies.id', count(*)
from public.company_aliases x
left join public.companies c on c.id = x.company_id
where x.company_id is not null and c.id is null
union all
select 'company_resolution_candidates.process_id -> processes.id', count(*)
from public.company_resolution_candidates x
left join public.processes p on p.id = x.process_id
where x.process_id is not null and p.id is null
order by check_name;

-- ==========================================================================
-- SEÇÃO 8 - DUPLICIDADES / COBERTURA DE HISTÓRICO
-- ==========================================================================
-- CNJ duplicado. Esperado: nenhuma linha.
select
  numero_processo,
  count(*)::bigint as total
from public.processes
where nullif(btrim(numero_processo), '') is not null
group by numero_processo
having count(*) > 1
order by total desc, numero_processo;

-- Message-ID duplicado. Pode haver legado; revisar se houver volume relevante.
select
  message_id,
  count(*)::bigint as total
from public.processed_emails
where nullif(btrim(message_id), '') is not null
group by message_id
having count(*) > 1
order by total desc, message_id
limit 100;

-- Processos sem qualquer evento de timeline.
select count(*)::bigint as processes_without_timeline
from public.processes p
where not exists (
  select 1 from public.process_timeline t where t.process_id = p.id
);

-- Processos com e-mail vinculado, porém sem timeline.
select count(*)::bigint as linked_processes_without_timeline
from public.processes p
where exists (
  select 1 from public.processed_emails pe where pe.process_id = p.id
)
and not exists (
  select 1 from public.process_timeline t where t.process_id = p.id
);

-- ==========================================================================
-- SEÇÃO 9 - RUNS, LOCKS E CONFIGURAÇÃO IMAP
-- ==========================================================================
-- Runs RUNNING potencialmente órfãos. Ajuste 30 min se necessário.
select
  id,
  started_at,
  completed_at,
  status,
  now() - started_at as running_for
from public.email_processing_runs
where status = 'RUNNING'
  and started_at < now() - interval '30 minutes'
order by started_at;

-- Estado dos locks. Não altera nada.
select
  lock_name,
  owner_token,
  locked_until,
  updated_at,
  now() as now_utc,
  case
    when owner_token is null then 'LIVRE'
    when locked_until is null then 'INCONSISTENTE_SEM_EXPIRACAO'
    when locked_until < now() then 'EXPIRADO'
    when updated_at < now() - interval '6 minutes' then 'REVISAR_POSSIVEL_ORFAO'
    else 'ATIVO_OU_RECENTE'
  end as diagnostic
from public.automation_locks
order by lock_name;

-- Deve haver no máximo uma configuração ativa.
select
  count(*) filter (where active) as active_configs,
  count(*) as total_configs
from public.email_account_config;

select
  id,
  email,
  host,
  port,
  secure,
  mailbox,
  active,
  sync_interval_minutes,
  sync_batch_size,
  sync_since_days,
  last_connection_at,
  last_connection_status,
  left(coalesce(last_error,''), 250) as last_error_preview,
  updated_at
from public.email_account_config
order by active desc, updated_at desc;

-- ==========================================================================
-- SEÇÃO 10 - IA / CIRCUIT BREAKER / FILAS ENVELHECIDAS
-- ==========================================================================
select
  model,
  circuit_open_until,
  last_error_code,
  left(coalesce(last_error_message,''), 300) as last_error_preview,
  last_failure_at,
  last_success_at,
  updated_at,
  case
    when circuit_open_until is null then 'FECHADO'
    when circuit_open_until > now() then 'ABERTO'
    else 'EXPIRADO_AGUARDANDO_REUSO'
  end as circuit_status
from public.ai_model_health
order by model;

select
  status,
  count(*)::bigint as total,
  min(updated_at) as oldest_updated_at,
  max(updated_at) as newest_updated_at
from public.ai_management_refresh_queue
group by status
order by status;

select
  status,
  count(*)::bigint as total,
  min(updated_at) as oldest_updated_at,
  max(updated_at) as newest_updated_at
from public.ai_demand_classification_backfill_queue
group by status
order by status;

-- PROCESSING antigo nas filas. Esperado: 0 ou quantidade transitória muito baixa.
select 'ai_management_refresh_queue' as fila, count(*)::bigint as stale_processing
from public.ai_management_refresh_queue
where status = 'PROCESSING'
  and updated_at < now() - interval '30 minutes'
union all
select 'ai_demand_classification_backfill_queue', count(*)
from public.ai_demand_classification_backfill_queue
where status = 'PROCESSING'
  and updated_at < now() - interval '30 minutes';

-- ==========================================================================
-- SEÇÃO 11 - USUÁRIOS / PERFIS
-- ==========================================================================
select
  role,
  active,
  count(*)::bigint as total
from public.user_profiles
group by role, active
order by role, active desc;

-- Perfis com role fora do contrato do frontend.
select id, email, role, active, created_at, updated_at
from public.user_profiles
where role not in ('ADMIN','GESTOR','ANALISTA','CONSULTA')
order by updated_at desc;

-- ==========================================================================
-- SEÇÃO 12 - RESUMO EXECUTIVO DE PROBLEMAS CONHECIDOS
-- Cada linha retorna uma quantidade. Zero é saudável, exceto filas pendentes,
-- que podem ser operacionais e não necessariamente defeito.
-- ==========================================================================
select 'processos_sem_timeline' as indicador, count(*)::bigint as total
from public.processes p
where not exists (select 1 from public.process_timeline t where t.process_id = p.id)
union all
select 'runs_running_mais_30min', count(*)
from public.email_processing_runs
where status='RUNNING' and started_at < now() - interval '30 minutes'
union all
select 'email_exceptions_abertas', count(*)
from public.email_exceptions
where status <> 'RESOLVIDA'
union all
select 'emails_pendente_ia', count(*)
from public.processed_emails
where status='PENDENTE_IA'
union all
select 'fila_gerencial_pending', count(*)
from public.ai_management_refresh_queue
where status='PENDING'
union all
select 'fila_backfill_pending', count(*)
from public.ai_demand_classification_backfill_queue
where status='PENDING'
union all
select 'locks_expirados_com_owner', count(*)
from public.automation_locks
where owner_token is not null and locked_until < now()
union all
select 'configs_imap_ativas_acima_de_1', greatest(count(*) filter (where active) - 1, 0)::bigint
from public.email_account_config
union all
select 'cnj_duplicados', count(*)
from (
  select numero_processo
  from public.processes
  where nullif(btrim(numero_processo),'') is not null
  group by numero_processo
  having count(*) > 1
) d
order by indicador;

-- FIM DA AUDITORIA READ-ONLY
