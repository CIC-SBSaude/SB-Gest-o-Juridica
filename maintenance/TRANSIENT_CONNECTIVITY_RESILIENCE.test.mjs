import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransientSupabaseError } from '../server/services/supabaseResilienceService.ts';
import { formatUserErrorMessage } from '../src/utils/errorUtils.ts';

test('isTransientSupabaseError: identifica erros de conectividade de rede e DNS', () => {
  // TypeError: fetch failed direto
  assert.equal(isTransientSupabaseError(new TypeError('fetch failed')), true);

  // Objeto de erro com mensagem 'TypeError: fetch failed'
  assert.equal(isTransientSupabaseError({ message: 'TypeError: fetch failed' }), true);

  // Erro com causa de DNS
  assert.equal(isTransientSupabaseError({ message: 'fetch failed', cause: { code: 'ENOTFOUND' } }), true);

  // Código de erro direto
  assert.equal(isTransientSupabaseError({ code: 'ENOTFOUND' }), true);
  assert.equal(isTransientSupabaseError({ code: 'ECONNREFUSED' }), true);
  assert.equal(isTransientSupabaseError({ code: 'EHOSTUNREACH' }), true);

  // Status HTTP transitórios
  assert.equal(isTransientSupabaseError({ status: 503 }), true);
  assert.equal(isTransientSupabaseError({ status: 502 }), true);
  assert.equal(isTransientSupabaseError({ status: 429 }), true);

  // Erro com mensagem composta de lock
  assert.equal(
    isTransientSupabaseError(new Error('Falha ao adquirir lock AI_QUEUE_WORKER: TypeError: fetch failed')),
    true
  );

  // Erro com mensagem de consulta de configuração
  assert.equal(
    isTransientSupabaseError(new Error('Falha ao consultar configuração IMAP: TypeError: fetch failed')),
    true
  );
});

test('isTransientSupabaseError: não trata erros de negócio como transitórios', () => {
  assert.equal(isTransientSupabaseError({ code: '23505', message: 'duplicate key value violates unique constraint' }), false);
  assert.equal(isTransientSupabaseError({ message: 'Processo não encontrado.' }), false);
  assert.equal(isTransientSupabaseError(null), false);
  assert.equal(isTransientSupabaseError(undefined), false);
});

test('formatUserErrorMessage: traduz falhas de rede em mensagem clara e amigável ao usuário', () => {
  const rawFetchError = new TypeError('fetch failed');
  const userMsg1 = formatUserErrorMessage(rawFetchError, 'Erro ao carregar.');
  assert.equal(userMsg1, 'Serviço de dados temporariamente inacessível. Verifique a conexão com o banco de dados.');

  const rawNetworkError = { message: 'NetworkError when attempting to fetch resource' };
  const userMsg2 = formatUserErrorMessage(rawNetworkError, 'Erro ao carregar.');
  assert.equal(userMsg2, 'Serviço de dados temporariamente inacessível. Verifique a conexão com o banco de dados.');

  // Mensagem comum é preservada
  const businessError = { message: 'O campo número de processo é obrigatório.' };
  const userMsg3 = formatUserErrorMessage(businessError, 'Erro na operação.');
  assert.equal(userMsg3, 'O campo número de processo é obrigatório.');
});
