/**
 * Utilitário de formatação de mensagens de erro para o frontend.
 * Converte falhas técnicas de rede ou conectividade em avisos objetivos e claros.
 */

export function formatUserErrorMessage(err: unknown, fallbackMessage = 'Erro na operação.'): string {
  if (!err) return fallbackMessage;
  const raw = typeof err === 'string' ? err : (err as any)?.message || String(err);
  if (/fetch\s*failed|failed\s*to\s*fetch|network\s*error|enotfound|econnrefused|econnreset/i.test(raw)) {
    return 'Serviço de dados temporariamente inacessível. Verifique a conexão com o banco de dados.';
  }
  return raw || fallbackMessage;
}
