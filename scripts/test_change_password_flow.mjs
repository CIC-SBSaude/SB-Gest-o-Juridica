import fs from 'fs';

async function main() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  let adminPwd = '';
  for (const line of envContent.split('\n')) {
    if (line.startsWith('BOOTSTRAP_ADMIN_PASSWORD=')) {
      adminPwd = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  // 1. Fazer login
  console.log('1. Efetuando login...');
  const loginRes = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'juridico.sb', password: adminPwd }),
  });
  const loginData = await loginRes.json();
  console.log('Login result:', { ok: loginData.ok, mustChange: loginData.mustChangePassword });
  const token = loginData.session?.access_token;

  // 2. Chamar change-password
  console.log('2. Chamando /api/auth/change-password...');
  const changeRes = await fetch('http://127.0.0.1:3000/api/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword: adminPwd, newPassword: 'NovaSenhaForte@123' }),
  });
  const changeData = await changeRes.json();
  console.log('Change password response:', changeRes.status, changeData);

  // 3. Verificar no banco o que ficou gravado
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    host: '127.0.0.1',
    port: 57322,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  });

  const { rows } = await pool.query("SELECT id, email, username, must_change_password FROM public.user_profiles WHERE username = 'juridico.sb'");
  console.log('3. Estado no banco após change-password:', rows[0]);

  // 4. Testar novo login com a nova senha
  console.log('4. Testando login com a nova senha NovaSenhaForte@123...');
  const login2Res = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'juridico.sb', password: 'NovaSenhaForte@123' }),
  });
  const login2Data = await login2Res.json();
  console.log('Login 2 result:', { ok: login2Data.ok, mustChange: login2Data.mustChangePassword });

  // 5. Restaura a senha para adminPwd
  console.log('5. Restaurando senha no banco para adminPwd...');
  await pool.query("UPDATE auth.users SET encrypted_password = crypt($1, gen_salt('bf', 10)) WHERE email = 'juridico.sb.dev2@gmail.com'", [adminPwd]);
  await pool.query("UPDATE public.user_profiles SET must_change_password = true WHERE email = 'juridico.sb.dev2@gmail.com'");

  await pool.end();
}

main().catch(console.error);
