import { providerDayKey } from './aiQuotaClock.ts';
type Budget = {
  allowed: boolean; reason: string; effectiveRpm: number; effectiveTpm: number;
  effectiveRpd: number; requestsToday: number; estimatedTokensForNextRequest: number;
};

export class AiAdmissionError extends Error {
  code = 'AI_ADMISSION_DEFERRED';
  reason: string;
  constructor(reason: string) { super(`AI_ADMISSION_DEFERRED: ${reason}`); this.reason = reason; }
}

// One shared gate for all workers in this Node process. Failed attempts and retries
// consume slots too. This is deliberately separate from successful-usage accounting.
export function createAttemptGate(options: {
  now?: () => number; sleep?: (ms: number) => Promise<void>;
} = {}) {
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const states = new Map<string, {
    tail: Promise<void>; pending: number; nextAt: number; day: string;
    attempts: number; recent: Array<{ at: number; tokens: number }>;
  }>();
  return {
    async run<T>(model: string, readBudget: () => Promise<Budget>, invoke: () => Promise<T>): Promise<T> {
      let state = states.get(model);
      if (!state) {
        state = { tail: Promise.resolve(), pending: 0, nextAt: 0, day: '', attempts: 0, recent: [] };
        states.set(model, state);
      }
      if (state.pending >= 4) throw new AiAdmissionError('QUEUE_FULL');
      const queuedAt = now();
      state.pending++;
      const previous = state.tail;
      let release!: () => void;
      state.tail = new Promise<void>(resolve => { release = resolve; });
      try {
        await previous;
        if (now() - queuedAt > 60_000) throw new AiAdmissionError('QUEUE_TIMEOUT');
        let budget = await readBudget();
        if (!budget.allowed) throw new AiAdmissionError(budget.reason);
        const delay = Math.max(0, state.nextAt - now());
        if (delay) await sleep(delay);
        // Another worker may have changed database quota/circuit state while queued.
        budget = await readBudget();
        if (!budget.allowed) throw new AiAdmissionError(budget.reason);
        if (budget.effectiveRpm <= 0 || budget.effectiveRpd <= 0 || budget.effectiveTpm <= 0) {
          throw new AiAdmissionError('MODEL_DISABLED');
        }
        const at = now();
        const day = providerDayKey(new Date(at));
        if (state.day !== day) { state.day = day; state.attempts = budget.requestsToday; }
        state.attempts = Math.max(state.attempts, budget.requestsToday);
        state.recent = state.recent.filter(entry => entry.at > at - 60_000);
        if (state.attempts >= budget.effectiveRpd) throw new AiAdmissionError('RPD_REACHED');
        if (state.recent.length >= budget.effectiveRpm) throw new AiAdmissionError('RPM_REACHED');
        const tokens = Math.max(1, budget.estimatedTokensForNextRequest);
        if (state.recent.reduce((sum, entry) => sum + entry.tokens, 0) + tokens > budget.effectiveTpm) {
          throw new AiAdmissionError('TPM_REACHED');
        }
        state.attempts++;
        state.recent.push({ at, tokens });
        state.nextAt = at + Math.ceil(60_000 / budget.effectiveRpm) + 100;
        return await invoke();
      } finally {
        state.pending--;
        release();
      }
    },
  };
}

export const aiAttemptGate = createAttemptGate();
