import dns from 'dns';

const DISPOSABLE_DOMAINS = [
  'guerrillamail.com', 'tempmail.com', 'mailinator.com', 'yopmail.com',
  'throwaway.email', 'guerrillamail.info', 'grr.la', 'guerrillamail.net',
  'sharklasers.com', 'guerrillamail.de', 'tmail.com', 'temp-mail.org',
  'fakeinbox.com', 'trashmail.com', 'maildrop.cc', 'dispostable.com',
  '10minutemail.com', 'mohmal.com', 'tempail.com', 'burnermail.io',
];

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.includes(domain);
}

export async function hasMXRecords(email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  if (!domain) return false;
  try {
    const records = await dns.promises.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

// Re-export del validador estricto. Se mantiene la firma legacy
// (string|null) para no romper callers existentes; nuevos consumidores
// deben usar `validateRFC` de '../lib/rfc-validator' directamente.
import { validateRFC as validateRFCStrict } from './rfc-validator';

export function validateRFC(rfc: string): string | null {
  const result = validateRFCStrict(rfc, { allowGeneric: false });
  if (!result.valid) return result.message ?? 'RFC inválido';
  return null;
}

export function validatePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) {
    return 'El teléfono debe tener exactamente 10 dígitos';
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Formato de email inválido';
  }
  if (isDisposableEmail(email)) {
    return 'No se permiten correos temporales o desechables';
  }
  return null;
}
