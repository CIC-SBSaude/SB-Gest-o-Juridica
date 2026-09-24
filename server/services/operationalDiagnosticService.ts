import { previewFalseProtocolReview } from './protocolReviewService.ts';
import { previewFalseProtocolRepair } from './falseProtocolRepairService.ts';
export const OPERATIONAL_PATCH_VERSION = 'CONSOLIDADO-6E2-9.1';

// Somente leitura, com falhas por seção: uma tabela indisponível não esconde as demais.
export async function getOperationalDiagnostic(db: any) {
  const checks = [
    ['processos_total', () => db.from('processes').select('id', { count: 'exact', head: true })],
    ['processos_sem_empresa', () => db.from('processes').select('id', { count: 'exact', head: true }).is('company_id', null)],
    ['empresas_total', () => db.from('companies').select('id', { count: 'exact', head: true })],
    ['candidatos_pendentes', () => db.from('company_resolution_candidates').select('id', { count: 'exact', head: true }).eq('status', 'PENDENTE')],
    ...['PENDENTE_IA', 'EXCECAO', 'PROCESSADO', 'IRRELEVANTE'].map(status => [
      `emails_${status}`, () => db.from('processed_emails').select('id', { count: 'exact', head: true }).eq('status', status),
    ] as const),
    ['saude_modelos', () => db.from('ai_model_health').select('model,circuit_open_until,last_error_code,last_error_message,last_failure_at,last_success_at')],
    ['uso_ia', () => db.from('ai_usage_daily').select('model,usage_date,requests_count,input_tokens,output_tokens,quota_exhausted_at').order('usage_date', { ascending: false }).limit(12)],
    ...['ai_management_refresh_queue', 'ai_demand_classification_backfill_queue'].flatMap(table =>
      ['PENDING', 'PROCESSING', 'DONE', 'ERROR'].map(status => [
        `${table}_${status}`, () => db.from(table).select('id', { count: 'exact', head: true }).eq('status', status),
      ] as const)),
    ['erros_fila_gerencial', () => db.from('ai_management_refresh_queue').select('id,status,attempts,last_error,updated_at').eq('status', 'ERROR').limit(20)],
    ['erros_classificacao', () => db.from('ai_demand_classification_backfill_queue').select('id,status,attempts,last_error,updated_at').eq('status', 'ERROR').limit(20)],
    ['excecoes_abertas', () => db.from('email_exceptions').select('id', { count: 'exact', head: true }).neq('status', 'RESOLVIDA')],
    ['amostra_excecoes', () => db.from('email_exceptions').select('id,processed_email_id,exception_type,reason,status').neq('status', 'RESOLVIDA').order('created_at', { ascending: false }).limit(100)],
    ['classificacoes_em_processamento', () => db.from('ai_demand_classification_backfill_queue').select('id,process_id,started_at,updated_at,attempts').eq('status', 'PROCESSING').limit(20)],
    ['previa_protocolos_invalidos', async () => ({ data: await previewFalseProtocolReview(db), error: null })],
    ['previa_reparacao_protocolos', async () => ({ data: await previewFalseProtocolRepair(db), error: null })],
    ['distribuicoes_protocolos', () => db.from('process_timeline').select('id', { count: 'exact', head: true }).eq('origem', 'REPARO_PROTOCOLO_6E2_9')],
  ] as const;
  const sections = await Promise.all(checks.map(async ([name, run]) => {
    try {
      const result = await run();
      return [name, result.error ? { error: result.error.message } : result.count ?? result.data ?? null];
    } catch (error: any) {
      return [name, { error: String(error?.message || error) }];
    }
  }));
  return { version: OPERATIONAL_PATCH_VERSION, generatedAt: new Date().toISOString(), readOnly: true, sections: Object.fromEntries(sections) };
}
