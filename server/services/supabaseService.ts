import { getBackendSupabase } from '../integrations/supabase';

export const supabaseService = {
  /**
   * Valida a integridade da conexão do backend com o Supabase
   */
  async checkConnection(): Promise<{ connected: boolean; message: string }> {
    const supabase = getBackendSupabase();
    if (!supabase) {
      return {
        connected: false,
        message: 'Variáveis SUPABASE_URL e SUPABASE_SECRET_KEY não preenchidas no backend.',
      };
    }

    try {
      const { error } = await supabase.from('system_config').select('key').limit(1);
      if (error && error.code !== 'PGRST116') {
        return {
          connected: false,
          message: `Conexão estabelecida, mas consulta retornou: ${error.message}`,
        };
      }

      return {
        connected: true,
        message: 'Conexão estrutural com Supabase estabelecida com sucesso.',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao contatar Supabase';
      return { connected: false, message };
    }
  },
};
