import pg from 'pg';
import fs from 'fs';

const pool = new pg.Pool({
  host: '127.0.0.1',
  port: 57322,
  user: 'postgres',
  password: 'postgres',
  database: 'postgres',
});

async function main() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  let adminPwd = '';
  let usersPwd = '';
  for (const line of envContent.split('\n')) {
    if (line.startsWith('BOOTSTRAP_ADMIN_PASSWORD=')) {
      adminPwd = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
    if (line.startsWith('BOOTSTRAP_USERS_PASSWORD=')) {
      usersPwd = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  console.log('Testing passwords against DB:');
  const { rows: users } = await pool.query(`
    SELECT u.id, u.email, p.username, p.role, p.active, p.must_change_password
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON u.id = p.id
    ORDER BY u.created_at;
  `);

  for (const u of users) {
    const pwdToTest = u.email === 'juridico.sb.dev2@gmail.com' ? adminPwd : usersPwd;
    const testMatch = await pool.query(
      `SELECT (encrypted_password = crypt($1, encrypted_password)) as matches FROM auth.users WHERE id = $2`,
      [pwdToTest, u.id]
    );
    const matches = testMatch.rows[0]?.matches;
    console.log(`- ${u.username || 'sem username'} (${u.email}): matches=${matches} (active=${u.active})`);

    if (!matches) {
      console.log(`  -> Resetting password to ${u.email === 'juridico.sb.dev2@gmail.com' ? 'adminPwd' : 'usersPwd'}...`);
      await pool.query(
        `UPDATE auth.users SET encrypted_password = crypt($1, gen_salt('bf', 10)) WHERE id = $2`,
        [pwdToTest, u.id]
      );
    }
  }

  console.log('\nRetesting all after reset:');
  for (const u of users) {
    const pwdToTest = u.email === 'juridico.sb.dev2@gmail.com' ? adminPwd : usersPwd;
    const testMatch = await pool.query(
      `SELECT (encrypted_password = crypt($1, encrypted_password)) as matches FROM auth.users WHERE id = $2`,
      [pwdToTest, u.id]
    );
    console.log(`- ${u.username || 'sem username'} (${u.email}): matches=${testMatch.rows[0]?.matches}`);
  }

  await pool.end();
}

main().catch(console.error);
