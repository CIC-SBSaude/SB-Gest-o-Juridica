export interface EmailProcessingRunLike {
  id?: string | null;
  started_at?: string | null;
  status?: string | null;
  metadata?: Record<string, any> | null;
}

export function isStaleEmailProcessingRun(
  run: EmailProcessingRunLike,
  nowMs = Date.now(),
  thresholdMinutes = 30,
): boolean {
  if (run?.status !== 'RUNNING' || !run?.started_at) return false;
  const startedMs = new Date(run.started_at).getTime();
  if (!Number.isFinite(startedMs)) return false;
  const thresholdMs = Math.max(1, thresholdMinutes) * 60_000;
  return startedMs < nowMs - thresholdMs;
}
