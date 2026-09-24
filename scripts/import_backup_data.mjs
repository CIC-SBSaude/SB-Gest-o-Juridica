import fs from 'node:fs';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';

const dumpPath = path.resolve('db_cluster-23-09-2026@06-15-11.backup/db_cluster-23-09-2026@06-15-11.backup');

// Check or generate local bootstrap secrets
let envLocal = '';
if (fs.existsSync('.env.local')) {
  envLocal = fs.readFileSync('.env.local', 'utf-8');
}

function getOrGenerateSecret(name, length = 16) {
  const match = envLocal.match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (match && match[1].trim()) {
    return match[1].trim().replace(/^["']|["']$/g, '');
  }
  const generated = crypto.randomBytes(length).toString('base64url').slice(0, length);
  envLocal += `\n${name}="${generated}"\n`;
  fs.writeFileSync('.env.local', envLocal.trim() + '\n');
  return generated;
}

const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || getOrGenerateSecret('BOOTSTRAP_ADMIN_PASSWORD');
const usersPassword = process.env.BOOTSTRAP_USERS_PASSWORD || getOrGenerateSecret('BOOTSTRAP_USERS_PASSWORD');

// Username mapping for the 5 user profiles
const USERNAME_MAPPING = {
  '0fd2409d-daeb-434e-8200-3792f8c5c8cc': 'juridico.sb',
  'b5173379-8e7d-410e-b8c0-07348270baa6': 'thyago.lustosa',
  'd6e149f1-81a5-4e86-8d5a-e6ddc074635a': 'douglas.melo',
  '43d1fbac-c49c-44c9-b0b1-74bd959855c5': 'ramon.reis',
  '4be6dfad-bd5b-4183-b75d-0422f2d0cf7f': 'notificacao.saudebrasil'
};

async function runPsql(sqlStreamOrString) {
  return new Promise((resolve, reject) => {
    const psql = spawn('docker', ['exec', '-i', 'supabase_db_projeto-4', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';
    psql.stderr.on('data', chunk => stderr += chunk.toString());
    psql.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`psql failed with exit code ${code}: ${stderr}`));
    });

    if (typeof sqlStreamOrString === 'string') {
      psql.stdin.write(sqlStreamOrString);
      psql.stdin.end();
    } else {
      sqlStreamOrString.pipe(psql.stdin);
    }
  });
}

async function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const psql = spawn('docker', ['exec', '-i', 'supabase_db_projeto-4', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-t', '-A', '-c', sql]);
    let stdout = '';
    let stderr = '';
    psql.stdout.on('data', chunk => stdout += chunk.toString());
    psql.stderr.on('data', chunk => stderr += chunk.toString());
    psql.on('close', code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`psql query failed: ${stderr}`));
    });
  });
}

async function main() {
  console.log('=== FASE 3: IMPORTAÇÃO CONTROLADA DE DADOS ===');
  console.log('Verificando ambiente de destino...');
  const currentDb = await runQuery('SELECT current_database();');
  if (currentDb !== 'postgres') {
    throw new Error(`Banco inesperado: ${currentDb}`);
  }
  console.log(`Conectado ao PostgreSQL local (database: ${currentDb})`);

  console.log('Lendo dump e extraindo seções COPY...');
  const fileStream = fs.createReadStream(dumpPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const copyBlocks = new Map(); // table -> { header, rows: [] }
  let currentTable = null;

  for await (const line of rl) {
    if (line.startsWith('COPY ')) {
      const match = line.match(/^COPY\s+([^\s(]+)\s*(?:\(([^)]+)\))?\s+FROM stdin;/);
      if (match) {
        currentTable = match[1];
        copyBlocks.set(currentTable, {
          header: line,
          columns: match[2] ? match[2].split(',').map(s => s.trim()) : null,
          rows: []
        });
      }
      continue;
    }

    if (currentTable) {
      if (line === '\\.') {
        currentTable = null;
      } else {
        copyBlocks.get(currentTable).rows.push(line);
      }
    }
  }

  console.log(`Total de blocos COPY carregados: ${copyBlocks.size}`);

  // 1. Desabilitar triggers que geram registros derivados automáticos durante importação histórica
  // (ex: trg_processes_operational_history, trg_processes_responsibility_history, on_auth_user_created)
  console.log('Configurando ambiente para importação com integridade referencial...');
  await runPsql(`
    -- Truncar todas as tabelas public para garantir estado limpo
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;

    DELETE FROM auth.identities;
    DELETE FROM auth.users;

    ALTER TABLE public.processes DISABLE TRIGGER USER;
    ALTER TABLE public.companies DISABLE TRIGGER USER;
    ALTER TABLE public.company_aliases DISABLE TRIGGER USER;
    ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
  `);

  // 2. Importar auth.users e auth.identities
  console.log('Migrando auth.users e gerando auth.identities compatíveis com e-mail/senha...');
  const authUsersBlock = copyBlocks.get('auth.users');
  if (!authUsersBlock) throw new Error('Bloco auth.users não encontrado no backup!');

  // Obter hash bcrypt para adminPassword e usersPassword via pgcrypto
  const adminHash = await runQuery(`SELECT crypt('${adminPassword.replace(/'/g, "''")}', gen_salt('bf', 10));`);
  const userHash = await runQuery(`SELECT crypt('${usersPassword.replace(/'/g, "''")}', gen_salt('bf', 10));`);

  const cols = authUsersBlock.columns;
  const idIdx = cols.indexOf('id');
  const emailIdx = cols.indexOf('email');
  const encPassIdx = cols.indexOf('encrypted_password');
  const emailConfIdx = cols.indexOf('email_confirmed_at');
  const rawAppMetaIdx = cols.indexOf('raw_app_meta_data');
  const rawUserMetaIdx = cols.indexOf('raw_user_meta_data');
  const createdAtIdx = cols.indexOf('created_at');
  const updatedAtIdx = cols.indexOf('updated_at');

  const transformedUsers = [];
  const identitiesSql = [];

  for (const rowStr of authUsersBlock.rows) {
    const fields = rowStr.split('\t');
    const userId = fields[idIdx];
    const email = fields[emailIdx];
    const isPrimaryAdmin = userId === '0fd2409d-daeb-434e-8200-3792f8c5c8cc';

    // Determinar senha criptografada
    let passHash = fields[encPassIdx];
    if (isPrimaryAdmin) {
      passHash = adminHash;
    } else if (passHash === '\\N' || !passHash) {
      passHash = userHash;
    }

    fields[encPassIdx] = passHash;
    // Migrar provedor para email
    fields[rawAppMetaIdx] = '{"provider": "email", "providers": ["email"]}';
    // Limpar tokens transitórios do ambiente antigo
    const tokenCols = [
      'confirmation_token', 'recovery_token', 'email_change_token_new',
      'email_change', 'email_change_token_current', 'reauthentication_token',
      'phone_change', 'phone_change_token'
    ];
    for (const tCol of tokenCols) {
      const idx = cols.indexOf(tCol);
      if (idx !== -1) fields[idx] = '';
    }

    transformedUsers.push(fields.join('\t'));

    // Identidade correspondente em auth.identities
    const identityData = JSON.stringify({ sub: userId, email: email.toLowerCase() }).replace(/'/g, "''");
    identitiesSql.push(`
      INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
      VALUES (gen_random_uuid(), '${userId}', '${userId}', '${identityData}'::jsonb, 'email', now(), now())
      ON CONFLICT (provider_id, provider) DO UPDATE SET identity_data = EXCLUDED.identity_data, updated_at = now();
    `);
  }

  // Executar COPY auth.users
  const userCopyPsql = spawn('docker', ['exec', '-i', 'supabase_db_projeto-4', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  userCopyPsql.stdin.write(authUsersBlock.header + '\n');
  for (const uRow of transformedUsers) {
    userCopyPsql.stdin.write(uRow + '\n');
  }
  userCopyPsql.stdin.write('\\.\n');
  userCopyPsql.stdin.end();

  await new Promise((res, rej) => {
    userCopyPsql.on('close', code => code === 0 ? res() : rej(new Error('Falha no COPY auth.users')));
  });

  // Executar identidades
  await runPsql(identitiesSql.join('\n'));
  console.log(`auth.users e auth.identities restaurados com sucesso (${transformedUsers.length} usuários).`);

  // 3. Importar public.user_profiles com username e must_change_password
  console.log('Restaurando public.user_profiles com logins únicos normalizados...');
  const userProfilesBlock = copyBlocks.get('public.user_profiles');
  const upCols = [...userProfilesBlock.columns, 'username', 'must_change_password'];
  const upHeader = `COPY public.user_profiles (${upCols.join(', ')}) FROM stdin;`;

  const upIdIdx = userProfilesBlock.columns.indexOf('id');
  const transformedProfiles = [];

  for (const rowStr of userProfilesBlock.rows) {
    const fields = rowStr.split('\t');
    const uid = fields[upIdIdx];
    const username = USERNAME_MAPPING[uid] || fields[userProfilesBlock.columns.indexOf('email')].split('@')[0].toLowerCase();
    const mustChange = uid === '0fd2409d-daeb-434e-8200-3792f8c5c8cc' || rowStr.includes('gmail.com');
    fields.push(username);
    fields.push(mustChange ? 't' : 'f');
    transformedProfiles.push(fields.join('\t'));
  }

  const profileCopyPsql = spawn('docker', ['exec', '-i', 'supabase_db_projeto-4', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  profileCopyPsql.stdin.write(upHeader + '\n');
  for (const pRow of transformedProfiles) {
    profileCopyPsql.stdin.write(pRow + '\n');
  }
  profileCopyPsql.stdin.write('\\.\n');
  profileCopyPsql.stdin.end();

  await new Promise((res, rej) => {
    profileCopyPsql.on('close', code => code === 0 ? res() : rej(new Error('Falha no COPY user_profiles')));
  });
  console.log(`public.user_profiles restaurado com sucesso (${transformedProfiles.length} perfis).`);

  // 4. Importar tabelas restantes na ordem topológica
  const topo = JSON.parse(fs.readFileSync('scratch/dependency_matrix.json', 'utf-8')).topologicalOrder;
  const remainingTables = topo.filter(t => t !== 'user_profiles');

  console.log(`Importando ${remainingTables.length} tabelas do aplicativo em ordem de dependência...`);

  for (const table of remainingTables) {
    const blockKey = `public.${table}`;
    const block = copyBlocks.get(blockKey);
    if (!block) {
      console.warn(`Aviso: bloco ${blockKey} não encontrado no dump.`);
      continue;
    }

    if (block.rows.length === 0) {
      continue;
    }

    const copyPsql = spawn('docker', ['exec', '-i', 'supabase_db_projeto-4', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    copyPsql.stdin.write(block.header + '\n');
    for (const r of block.rows) {
      copyPsql.stdin.write(r + '\n');
    }
    copyPsql.stdin.write('\\.\n');
    copyPsql.stdin.end();

    await new Promise((res, rej) => {
      let err = '';
      copyPsql.stderr.on('data', d => err += d.toString());
      copyPsql.on('close', code => {
        if (code === 0) res();
        else rej(new Error(`Falha ao importar tabela ${table}: ${err}`));
      });
    });

    console.log(`  -> ${table}: ${block.rows.length} registros importados.`);
  }

  // 5. Reabilitar triggers e ajustar sequências
  console.log('Reabilitando triggers e sincronizando sequências...');
  await runPsql(`
    ALTER TABLE public.processes ENABLE TRIGGER USER;
    ALTER TABLE public.companies ENABLE TRIGGER USER;
    ALTER TABLE public.company_aliases ENABLE TRIGGER USER;
    ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;

    SELECT setval('public.demand_classification_catalog_id_seq', coalesce((SELECT max(id) FROM public.demand_classification_catalog), 1), true);

    -- Registrar auditoria de bootstrap para o primeiro administrador
    INSERT INTO public.user_access_audit (
      action, actor_user_id, target_user_id, target_email,
      old_role, new_role, old_active, new_active, reason, metadata
    ) VALUES (
      'USER_REACTIVATED',
      '0fd2409d-daeb-434e-8200-3792f8c5c8cc',
      '0fd2409d-daeb-434e-8200-3792f8c5c8cc',
      'juridico.sb.dev2@gmail.com',
      'ADMIN',
      'ADMIN',
      false,
      true,
      'Bootstrap local de primeiro acesso corporativo com senha temporaria',
      '{"bootstrap": true, "environment": "local"}'::jsonb
    );
  `);

  // 6. Verificação de integridade e contagens
  console.log('\n=== RELATÓRIO DE CONTAGENS: ORIGEM vs DESTINO ===');
  const countReport = [];
  const expectedCounts = {
    'auth.users': 7,
    'public.user_profiles': 5,
    'public.processes': 747,
    'public.processed_emails': 8187,
    'public.process_evidence': 88864,
    'public.process_timeline': 7412,
    'public.process_history': 1321,
    'public.process_parties': 1377,
    'public.obligations': 198,
    'public.email_exceptions': 861,
    'public.email_processing_runs': 719,
    'public.access_invites': 5,
    'public.user_access_audit': 15, // 14 originais + 1 do bootstrap
    'public.companies': 14,
    'public.company_aliases': 1,
    'public.company_resolution_audit': 876,
    'public.company_resolution_candidates': 221,
    'public.demand_classification_catalog': 32,
    'public.legal_nature_catalog': 10,
    'public.operational_rules_config': 1,
    'public.system_config': 6,
    'public.automation_locks': 5,
    'public.ai_model_health': 4,
    'public.ai_management_refresh_queue': 745,
    'public.ai_management_suggestions': 737,
    'public.ai_demand_classification_backfill_queue': 418,
    'public.ai_usage_daily': 26,
    'public.ai_usage_minute': 770,
    'public.email_keyword_rules': 13,
    'public.email_account_config': 1,
    'public.email_sync_state': 1
  };

  let allMatch = true;
  for (const [table, expected] of Object.entries(expectedCounts)) {
    const actual = parseInt(await runQuery(`SELECT count(*) FROM ${table};`), 10);
    const status = actual === expected ? 'OK' : 'DIVERGENCIA';
    if (status !== 'OK') allMatch = false;
    countReport.push({ table, expected, actual, status });
    console.log(`  ${table.padEnd(46)} Origem: ${String(expected).padStart(5)} | Destino: ${String(actual).padStart(5)} | Status: ${status}`);
  }

  fs.writeFileSync('scratch/import_count_report.json', JSON.stringify(countReport, null, 2));

  if (!allMatch) {
    throw new Error('Houve divergências na contagem de registros importados!');
  }

  console.log('\nTodas as contagens conferem com 100% de exatidão!');
  console.log('Credenciais temporárias de bootstrap salvas com segurança em .env.local.');
}

main().catch(err => {
  console.error('\nERRO NA IMPORTAÇÃO:', err);
  process.exit(1);
});
