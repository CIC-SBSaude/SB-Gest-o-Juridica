import { supabase } from './supabase';
import { TechnicalDiagnosticReport } from '../types/technicalDiagnostic';

export const technicalDiagnosticService = {
  async getDiagnostic(): Promise<TechnicalDiagnosticReport> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Sessão de usuário não autenticada. Efetue login novamente.');
    }

    const response = await fetch('/api/admin/diagnostico', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || `Erro HTTP ${response.status} ao executar diagnóstico.`);
    }

    if (!payload?.report) {
      throw new Error('Relatório de diagnóstico inválido retornado pelo backend.');
    }

    return payload.report;
  },
};
