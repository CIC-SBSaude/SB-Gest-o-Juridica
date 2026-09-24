export async function recoverStaleDemandClassification(db: any) {
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  const now = new Date().toISOString();
  const { data, error } = await db.from('ai_demand_classification_backfill_queue').update({
    status: 'PENDING', retry_after: now, started_at: null,
    last_error: 'STALE_PROCESSING_RECOVERED_6E2_9', updated_at: now,
  }).eq('status', 'PROCESSING').lt('updated_at', staleBefore).select('id');
  if (error) throw new Error(`Falha ao recuperar classificações antigas: ${error.message}`);
  return data?.length || 0;
}
