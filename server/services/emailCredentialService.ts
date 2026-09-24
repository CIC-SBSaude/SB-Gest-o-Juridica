import crypto from 'node:crypto';
import { ENV } from '../config/env';

const PREFIX = 'v1';

function keyBuffer() {
  const raw = ENV.security.emailCredentialsEncryptionKey;
  if (!raw) {
    throw new Error('EMAIL_CREDENTIALS_ENCRYPTION_KEY não configurada. A conta de e-mail não pode ser armazenada com segurança.');
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptEmailPassword(plainText: string) {
  if (!plainText) throw new Error('Senha do e-mail obrigatória.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptEmailPassword(payload: string) {
  const [version, ivB64, tagB64, encryptedB64] = String(payload || '').split(':');
  if (version !== PREFIX || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Credencial IMAP criptografada em formato inválido.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}
