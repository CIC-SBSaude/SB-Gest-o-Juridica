import fs from 'fs';

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

  console.log('--- TESTANDO LOGIN NA APLICAÇÃO ATIVA (porta 3000) ---');

  // Teste 1: Login por username do Admin
  const r1 = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'juridico.sb', password: adminPwd }),
  });
  const j1 = await r1.json();
  console.log('1. Login por username "juridico.sb":', { status: r1.status, ok: j1.ok, user: j1.user?.email, mustChangePassword: j1.mustChangePassword });

  // Teste 2: Login por e-mail do Admin
  const r2 = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'juridico.sb.dev2@gmail.com', password: adminPwd }),
  });
  const j2 = await r2.json();
  console.log('2. Login por e-mail "juridico.sb.dev2@gmail.com":', { status: r2.status, ok: j2.ok, user: j2.user?.email });

  // Teste 3: Login por username de usuário comum (thyago.lustosa)
  const r3 = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'thyago.lustosa', password: usersPwd }),
  });
  const j3 = await r3.json();
  console.log('3. Login por username "thyago.lustosa":', { status: r3.status, ok: j3.ok, user: j3.user?.email });

  // Teste 4: Login por e-mail de usuário comum (thyagolustosa@gmail.com)
  const r4 = await fetch('http://127.0.0.1:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'thyagolustosa@gmail.com', password: usersPwd }),
  });
  const j4 = await r4.json();
  console.log('4. Login por e-mail "thyagolustosa@gmail.com":', { status: r4.status, ok: j4.ok, user: j4.user?.email });
}

main().catch(console.error);
