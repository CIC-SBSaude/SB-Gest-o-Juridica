import { ENV } from '../config/env';
import { imapService } from './imapService';
import { runAiQueueWorker } from './aiQueueWorkerService';
import { withAutomationLock } from './automationLockService';
import { getActiveEmailConfig } from './emailAccountConfigService';
import { recoverStaleEmailProcessingRuns } from './emailProcessingRunRecoveryService';
import { isTransientSupabaseError } from './supabaseResilienceService';

let tickTimer: ReturnType<typeof setInterval> | null = null;
let aiTimer: ReturnType<typeof setInterval> | null = null;
const startupTimers: Array<ReturnType<typeof setTimeout>> = [];
let lastIngestionStartedAt = 0;
let ingestionInFlight = false;

function scheduleStartup(fn: () => void, delayMs: number) {
  const timer = setTimeout(fn, delayMs);
  startupTimers.push(timer);
  return timer;
}

async function getAutomaticDatabaseConfig() {
  const cfg = await getActiveEmailConfig();

  // Regra de segurança da Fase 6A:
  // ENV_BOOTSTRAP pode ser usado por ações manuais de contingência,
  // mas NUNCA inicia o pipeline automático.
  if (cfg.source !== 'DATABASE') {
    const error: any = new Error('Automação aguardando configuração ativa salva no banco.');
    error.code = 'AUTOMATION_WAITING_DATABASE_CONFIG';
    throw error;
  }

  return cfg;
}

export function startAutomationScheduler() {
  if (!ENV.automation.enabled) {
    console.log('[AUTOMATION] scheduler desabilitado.');
    return;
  }
  if (tickTimer || aiTimer) return;

  const runSyncIfDue = async () => {
    // Evita que o ticker da própria instância consulte o lock a cada 60s enquanto
    // um lote IMAP já está em execução. O lock distribuído continua protegendo
    // contra outras instâncias.
    if (ingestionInFlight) return;

    ingestionInFlight = true;
    try {
      const cfg = await getAutomaticDatabaseConfig();
      const intervalMs = Math.max(1, cfg.syncIntervalMinutes) * 60_000;
      if (Date.now() - lastIngestionStartedAt < intervalMs) return;

      // Lease de 5 min + heartbeat (~100s): lotes longos continuam protegidos,
      // mas um container morto sem SIGTERM deixa no máximo ~5 min de lock órfão,
      // em vez dos 15 min anteriores.
      const locked = await withAutomationLock('IMAP_INGESTION', 300, async () => {
        lastIngestionStartedAt = Date.now();

        // Com o lock exclusivo adquirido, qualquer RUNNING antigo acima do limiar
        // não pode pertencer a outro ciclo IMAP saudável. Reconcilia antes de abrir
        // o novo run, preservando o histórico em vez de apagar registros.
        const recovery = await recoverStaleEmailProcessingRuns({
          exclusiveImapLockHeld: true,
          thresholdMinutes: 30,
          actorUserId: null,
          reason: 'Reconciliação automática antes de nova ingestão IMAP.',
        });
        if (recovery.recovered > 0 || recovery.errors.length > 0) {
          console.log('[IMAP RUN RECOVERY] reconciliação pré-ingestão', recovery);
        }

        return imapService.syncEmails(null);
      });
      if (!locked.acquired) console.log('[AUTOMATION] ingestão aguardando lock mantido por outra instância.');
    } catch (err: any) {
      if (err?.code === 'EMAIL_MONITORING_DISABLED' || err?.code === 'AUTOMATION_WAITING_DATABASE_CONFIG') return;
      if (
        err?.code === 'DATABASE_CONNECTIVITY_UNAVAILABLE' ||
        err?.isTransient ||
        isTransientSupabaseError(err)
      ) {
        console.warn('[AUTOMATION] ingestão automática pausada (banco temporariamente inacessível):', err?.message || err);
        return;
      }
      console.error('[AUTOMATION] falha na ingestão automática:', err?.message || err);
    } finally {
      ingestionInFlight = false;
    }
  };

  const runAiIfEnabled = async () => {
    try {
      // Fase 6E: a fila de IA é independente do monitoramento IMAP.
      // Pausar a captura de novos e-mails não pode congelar itens PENDENTE_IA já persistidos.
      const result = await runAiQueueWorker();
      if (!result.acquired) console.log('[AUTOMATION] fila IA ignorada: outro worker possui o lock ou banco inacessível.');
    } catch (err: any) {
      if (
        err?.code === 'DATABASE_CONNECTIVITY_UNAVAILABLE' ||
        err?.isTransient ||
        isTransientSupabaseError(err)
      ) {
        console.warn('[AUTOMATION] worker de IA pausado (banco temporariamente inacessível):', err?.message || err);
        return;
      }
      console.error('[AUTOMATION] falha no worker de IA:', err?.message || err);
    }
  };

  scheduleStartup(() => void runSyncIfDue(), 8_000);
  scheduleStartup(() => void runAiIfEnabled(), 20_000);

  // Ticker leve: consulta o intervalo salvo no app sem exigir restart.
  tickTimer = setInterval(() => void runSyncIfDue(), 60_000);
  const workerIntervalMs = Math.max(1, ENV.automation.aiWorkerIntervalMinutes) * 60_000;
  aiTimer = setInterval(() => void runAiIfEnabled(), workerIntervalMs);

  console.log('[AUTOMATION] scheduler iniciado em modo seguro', {
    automaticSourceRequired: 'DATABASE',
    envBootstrapAutomatic: false,
    ingestionOrder: 'NEWEST_FIRST',
    aiEveryMinutes: ENV.automation.aiWorkerIntervalMinutes,
    aiQueueOrder: 'NEWEST_FIRST',
    workersIndependentFromEmailMonitoring: true,
    emailMonitoringControlsOnly: 'IMAP_INGESTION',
  });
}

export function stopAutomationScheduler() {
  while (startupTimers.length) {
    const timer = startupTimers.pop();
    if (timer) clearTimeout(timer);
  }

  if (tickTimer) clearInterval(tickTimer);
  if (aiTimer) clearInterval(aiTimer);

  tickTimer = null;
  aiTimer = null;
  ingestionInFlight = false;

  console.log('[AUTOMATION] scheduler parado para encerramento seguro.');
}
