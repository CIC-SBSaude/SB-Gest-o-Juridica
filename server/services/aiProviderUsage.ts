// Keep existing UTC daily history intact. Minute history reconstructs the actual
// Pacific quota day, including calls made before this patch was installed.
export async function readProviderUsage(supabase: any, model: string, start: string) {
  const models = model === 'gemini-3.5-flash-lite'
    ? [model, 'gemini-flash-lite-latest'] : [model];
  const totals = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    exhausted: false,
    quotaExhaustedAt: null as string | null,
  };
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('ai_usage_minute')
      .select('minute_bucket,model,requests_count,input_tokens,output_tokens')
      .in('model', models).gte('minute_bucket', start)
      .order('minute_bucket').order('model').range(offset, offset + 499);
    if (error) throw new Error(`Falha ao consultar consumo Gemini: ${error.message}`);
    for (const row of data || []) {
      totals.requests += Number(row.requests_count || 0);
      totals.inputTokens += Number(row.input_tokens || 0);
      totals.outputTokens += Number(row.output_tokens || 0);
    }
    if (!data || data.length < 500) break;
  }
  const { data, error } = await supabase.from('ai_usage_daily')
    .select('quota_exhausted_at').in('model', models).gte('quota_exhausted_at', start);
  if (error) throw new Error(`Falha ao consultar bloqueio Gemini: ${error.message}`);
  const exhaustionTimes = (data || [])
    .map((row: any) => row.quota_exhausted_at)
    .filter(Boolean)
    .sort();
  totals.exhausted = exhaustionTimes.length > 0;
  totals.quotaExhaustedAt = exhaustionTimes.length > 0 ? exhaustionTimes[exhaustionTimes.length - 1] : null;
  return totals;
}
