import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import express from 'express';
import healthRoutes from '../server/routes/health.js';
import authRoutes from '../server/routes/auth.js';
import { getBackendSupabase } from '../server/integrations/supabase.js';
import { GoogleGenAI } from '@google/genai';
import { ENV } from '../server/config/env.js';
import tls from 'tls';

// Read .env.local for bootstrap password
let bootstrapPassword = '';
if (fs.existsSync('.env.local')) {
  const content = fs.readFileSync('.env.local', 'utf8');
  for (const line of content.split('\n')) {
    if (line.startsWith('BOOTSTRAP_ADMIN_PASSWORD=') || line.startsWith('LOCAL_ADMIN_BOOTSTRAP_PASSWORD=')) {
      bootstrapPassword = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
      break;
    }
  }
}

const pool = new pg.Pool({
  host: '127.0.0.1',
  port: 57322,
  user: 'postgres',
  password: 'postgres',
  database: 'postgres',
});

async function runVerification() {
  console.log('=== INICIANDO VALIDAÇÃO DO SISTEMA SB GESTÃO JURÍDICA ===\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [OK] ${message}`);
      passedTests++;
    } else {
      console.error(`  [FALHA] ${message}`);
      failedTests++;
    }
  }

  try {
    // 1. BANCO DE DADOS E CONTAGENS
    console.log('1. Verificação de Estrutura do Banco e Contagens:');
    const { rows: tableRows } = await pool.query(`
      SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    assert(parseInt(tableRows[0].count, 10) === 38, `Total de 38 tabelas públicas recriadas (encontradas: ${tableRows[0].count})`);

    const { rows: usersRows } = await pool.query(`SELECT count(*) as count FROM auth.users;`);
    assert(parseInt(usersRows[0].count, 10) === 7, `Total de 7 usuários em auth.users (encontrados: ${usersRows[0].count})`);

    const { rows: profileRows } = await pool.query(`SELECT count(*) as count FROM public.user_profiles;`);
    assert(parseInt(profileRows[0].count, 10) === 5, `Total de 5 perfis em public.user_profiles (encontrados: ${profileRows[0].count})`);

    const { rows: procRows } = await pool.query(`SELECT count(*) as count FROM public.processes;`);
    assert(parseInt(procRows[0].count, 10) === 747, `Total de 747 processos em public.processes (encontrados: ${procRows[0].count})`);

    const { rows: emailRows } = await pool.query(`SELECT count(*) as count FROM public.processed_emails;`);
    assert(parseInt(emailRows[0].count, 10) === 8187, `Total de 8.187 e-mails em public.processed_emails (encontrados: ${emailRows[0].count})`);

    const { rows: evidenceRows } = await pool.query(`SELECT count(*) as count FROM public.process_evidence;`);
    assert(parseInt(evidenceRows[0].count, 10) === 88864, `Total de 88.864 evidências em public.process_evidence (encontradas: ${evidenceRows[0].count})`);

    // 2. INTEGRIDADE REFERENCIAL E RLS
    console.log('\n2. Verificação de RLS e Integridade Referencial:');
    const { rows: rlsRows } = await pool.query(`
      SELECT count(*) as count FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;
    `);
    assert(parseInt(rlsRows[0].count, 10) === 38, `Todas as 38 tabelas públicas com RLS habilitado (encontradas: ${rlsRows[0].count})`);

    const { rows: orphanProfiles } = await pool.query(`
      SELECT count(*) as count FROM public.user_profiles up LEFT JOIN auth.users au ON up.id = au.id WHERE au.id IS NULL;
    `);
    assert(parseInt(orphanProfiles[0].count, 10) === 0, `Nenhum perfil órfão de auth.users (encontrados: ${orphanProfiles[0].count})`);

    // 3. SEGURANÇA DE FUNÇÕES (SEARCH_PATH E CLAIM_MY_INVITE)
    console.log('\n3. Verificação de Funções e RPCs:');
    const { rows: funcRows } = await pool.query(`
      SELECT p.proname, p.prosecdef, pg_get_functiondef(p.oid) as def
      FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'claim_my_invite';
    `);
    assert(funcRows.length > 0 && funcRows[0].prosecdef === true, 'claim_my_invite definida com SECURITY DEFINER');
    assert(funcRows[0].def.includes("search_path TO 'public'"), "claim_my_invite possui SET search_path TO 'public'");

    // 4. TESTES DE AUTENTICAÇÃO E ROTAS BACKEND
    console.log('\n4. Testes de Autenticação Corporativa (anti-enumeração, login, troca de senha):');
    
    // Inicia app Express temporário para os testes das rotas
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api', healthRoutes);
    testApp.use('/api/auth', authRoutes);

    const server = testApp.listen(3099);

    try {
      // Teste 4.1: /api/health
      const healthRes = await fetch('http://127.0.0.1:3099/api/health');
      const healthJson = await healthRes.json();
      assert(healthRes.ok && healthJson.status === 'ok', '/api/health responde 200 OK com status ok');

      // Teste 4.2: Login com credenciais incorretas (senha errada)
      const wrongPwdRes = await fetch('http://127.0.0.1:3099/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'juridico.sb', password: 'senha_incorreta_totalmente_invalida' }),
      });
      const wrongPwdJson = await wrongPwdRes.json();
      assert(wrongPwdRes.status === 401 && wrongPwdJson.error === 'Credenciais incorretas ou acesso não autorizado.', 'Senha incorreta retorna 401 com mensagem genérica segura');

      // Teste 4.3: Login com usuário inexistente (anti-enumeração)
      const nonExistentRes = await fetch('http://127.0.0.1:3099/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'usuario.inexistente.ficticio', password: 'qualquer_senha' }),
      });
      const nonExistentJson = await nonExistentRes.json();
      assert(nonExistentRes.status === 401 && nonExistentJson.error === 'Credenciais incorretas ou acesso não autorizado.', 'Usuário inexistente retorna 401 com a MESMA mensagem genérica (anti-enumeração)');

      // Teste 4.4: Login com usuário inativo (anti-enumeração)
      // No backup, ramon.reis / 43d1fbac-c49c-44c9-b0b1-74bd959855c5 está ativo?
      // Vamos verificar qual usuário está inativo no banco
      const { rows: inactiveUsers } = await pool.query(`SELECT username, email FROM public.user_profiles WHERE active = false;`);
      if (inactiveUsers.length > 0) {
        const inact = inactiveUsers[0];
        const inactRes = await fetch('http://127.0.0.1:3099/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: inact.username, password: 'qualquer_senha' }),
        });
        const inactJson = await inactRes.json();
        assert(inactRes.status === 401 && inactJson.error === 'Credenciais incorretas ou acesso não autorizado.', `Usuário inativo (${inact.username}) é rejeitado com mensagem genérica 401`);
      } else {
        assert(true, 'Nenhum usuário com active=false no banco de teste');
      }

      // Teste 4.5: Login com bootstrap password por LOGIN ÚNICO (username)
      let authSessionToken = '';
      if (bootstrapPassword) {
        const loginUserRes = await fetch('http://127.0.0.1:3099/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: 'juridico.sb', password: bootstrapPassword }),
        });
        const loginUserJson = await loginUserRes.json();
        assert(loginUserRes.ok && loginUserJson.ok === true && loginUserJson.user?.id, 'Login por Identificador (username: juridico.sb) realizado com sucesso');
        assert(loginUserJson.mustChangePassword === true, 'Flag mustChangePassword=true retornado para o usuário bootstrap');
        authSessionToken = loginUserJson.session?.access_token || '';

        // Teste 4.6: Login por E-MAIL CORPORATIVO
        const loginEmailRes = await fetch('http://127.0.0.1:3099/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: 'juridico.sb.dev2@gmail.com', password: bootstrapPassword }),
        });
        const loginEmailJson = await loginEmailRes.json();
        assert(loginEmailRes.ok && loginEmailJson.ok === true, 'Login por E-mail (juridico.sb.dev2@gmail.com) realizado com sucesso');

        // Teste 4.7: Rota protegida sem token -> 401
        const unauthStatusRes = await fetch('http://127.0.0.1:3099/api/auth/status');
        assert(unauthStatusRes.status === 401, 'Acesso sem token em rota protegida (/api/auth/status) bloqueado com 401');

        // Teste 4.8: Rota protegida com token válido -> 200
        if (authSessionToken) {
          const authStatusRes = await fetch('http://127.0.0.1:3099/api/auth/status', {
            headers: { Authorization: `Bearer ${authSessionToken}` },
          });
          const authStatusJson = await authStatusRes.json();
          assert(authStatusRes.ok && authStatusJson.authorized === true, 'Acesso autenticado e autorizado em /api/auth/status com perfil ativo');
        }

        // Teste 4.9: Troca de senha
        if (authSessionToken) {
          const changePwdRes = await fetch('http://127.0.0.1:3099/api/auth/change-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authSessionToken}`,
            },
            body: JSON.stringify({ currentPassword: bootstrapPassword, newPassword: bootstrapPassword + '!' }),
          });
          const changePwdJson = await changePwdRes.json();
          assert(changePwdRes.ok && changePwdJson.ok === true, 'Troca de senha pelo próprio usuário concluída com sucesso');

          // Restaura senha original do bootstrap para idempotência de testes
          await fetch('http://127.0.0.1:3099/api/auth/change-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authSessionToken}`,
            },
            body: JSON.stringify({ currentPassword: bootstrapPassword + '!', newPassword: bootstrapPassword }),
          });
        }
      } else {
        console.warn('  [AVISO] LOCAL_ADMIN_BOOTSTRAP_PASSWORD não encontrado em .env.local');
      }

      // Teste 4.10: Esqueci minha senha (anti-enumeração)
      const forgotRes = await fetch('http://127.0.0.1:3099/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'qualquer_usuario_ou_email' }),
      });
      const forgotJson = await forgotRes.json();
      assert(forgotRes.ok && forgotJson.ok === true, 'Recuperação de senha retorna mensagem neutra anti-enumeração');

    } finally {
      server.close();
    }

    // 5. TESTE DE CONECTIVIDADE IMAP
    console.log('\n5. Verificação da Conta IMAP:');
    const { rows: imapDbRows } = await pool.query(`SELECT * FROM public.email_account_config LIMIT 1;`);
    assert(imapDbRows.length > 0, 'Configuração IMAP persistida em public.email_account_config');
    assert(imapDbRows[0].email === 'juridico.dev@opsaudebrasil.com.br', 'E-mail da captura configurado: juridico.dev@opsaudebrasil.com.br');
    assert(imapDbRows[0].host === 'email-ssl.com.br', 'Servidor IMAP configurado: email-ssl.com.br');
    assert(imapDbRows[0].port === 993 && (imapDbRows[0].secure === true || imapDbRows[0].tls === true), 'Porta 993 com SSL/TLS ativo');
    assert((imapDbRows[0].sync_batch_size === 100 || imapDbRows[0].sync_max === 100) && imapDbRows[0].sync_since_days === 3650, 'Janela de 3650 dias e lote de 100');

    // Conexão socket TLS ao servidor IMAP
    const imapSocketTest = await new Promise((resolve) => {
      const socket = tls.connect(993, 'email-ssl.com.br', { timeout: 8000, rejectUnauthorized: true }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', (err) => {
        resolve(false);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
    assert(imapSocketTest, 'Conectividade TLS com email-ssl.com.br:993 estabelecida com sucesso');

    // 6. TESTE DE DISPONIBILIDADE GEMINI
    console.log('\n6. Verificação do Serviço Gemini:');
    assert(Boolean(ENV.gemini.apiKey), 'Chave GEMINI_API_KEY configurada no backend');
    try {
      const ai = new GoogleGenAI({ apiKey: ENV.gemini.apiKey });
      const resp = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: 'Responda apenas com a palavra CONFIRMADO.',
      });
      const text = resp.text ? resp.text.trim() : '';
      assert(text.includes('CONFIRMADO'), `Chamada de teste ao modelo gemini-3-flash-preview bem-sucedida (Resposta: "${text}")`);
    } catch (err) {
      assert(false, `Falha ao testar Gemini: ${err.message}`);
    }

  } catch (err) {
    console.error('[ERRO GERAL DE VALIDAÇÃO]', err);
    failedTests++;
  } finally {
    await pool.end();
  }

  console.log(`\n=== RESUMO: ${passedTests} testes aprovados, ${failedTests} falhas ===`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

runVerification();
