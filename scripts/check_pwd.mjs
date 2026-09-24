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
  for (const line of envContent.split('\n')) {
    if (line.startsWith('BOOTSTRAP_ADMIN_PASSWORD=')) {
      adminPwd = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  const { rows } = await pool.query("SELECT id, email, encrypted_password FROM auth.users WHERE email = 'juridico.sb.dev2@gmail.com'");
  console.log('User in DB:', rows);

  // Check if crypt(adminPwd, encrypted_password) matches
  const testMatch = await pool.query(`SELECT (encrypted_password = crypt($1, encrypted_password)) as matches FROM auth.users WHERE email = 'juridico.sb.dev2@gmail.com'`, [adminPwd]);
  console.log('Password matches DB hash?', testMatch.rows[0]);

  // If not match, let's update with pgcrypto crypt
  if (!testMatch.rows[0]?.matches) {
    console.log('Updating password hash with crypt...');
    await pool.query(`UPDATE auth.users SET encrypted_password = crypt($1, gen_salt('bf', 10)) WHERE email = 'juridico.sb.dev2@gmail.com'`, [adminPwd]);
    const retest = await pool.query(`SELECT (encrypted_password = crypt($1, encrypted_password)) as matches FROM auth.users WHERE email = 'juridico.sb.dev2@gmail.com'`, [adminPwd]);
    console.log('After update, matches?', retest.rows[0]);
  }

  await pool.end();
}

main().catch(console.error);
