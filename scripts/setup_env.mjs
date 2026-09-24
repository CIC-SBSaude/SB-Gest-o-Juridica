import fs from 'node:fs';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

const statusJson = execSync('npx supabase status -o json', { encoding: 'utf-8' });
const status = JSON.parse(statusJson);

const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;
const apiUrl = status.API_URL || 'http://127.0.0.1:57321';

let encKey = '';
if (fs.existsSync('.env')) {
  const existing = fs.readFileSync('.env', 'utf-8');
  const m = existing.match(/^EMAIL_CREDENTIALS_ENCRYPTION_KEY=(.*)$/m);
  if (m && m[1].trim()) encKey = m[1].trim().replace(/^"|"$/g, '');
}
if (!encKey) {
  encKey = crypto.randomBytes(32).toString('hex');
}

const envContent = `# ============================================================
# SB Gestão Jurídica - CONFIGURAÇÃO LOCAL SUPABASE
# ============================================================

# Supabase frontend (PUBLICAS: entram no bundle Vite)
VITE_SUPABASE_URL="http://192.168.91.103:57321"
VITE_SUPABASE_PUBLISHABLE_KEY="${anonKey}"

# Supabase backend (SEGREDO)
SUPABASE_URL="http://127.0.0.1:57321"
SUPABASE_SECRET_KEY="${serviceKey}"

# IMAP (SEGREDO)
IMAP_LOGIN_PASSWORD=""

# Gemini (SEGREDO)
GEMINI_API_KEY="AQ.Ab8RN6Lri-KgAeigKGQnLwdMQotXHesaQGui26ECOwmMC_J72w"

# Ambiente de execução
NODE_ENV="development"

# Chave exclusiva do backend para criptografar credenciais IMAP salvas no banco
EMAIL_CREDENTIALS_ENCRYPTION_KEY="${encKey}"
`;

fs.writeFileSync('.env', envContent);
console.log('Arquivo .env configurado com sucesso (chaves locais aplicadas).');
