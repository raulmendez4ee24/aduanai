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

// RFC validation
// Persona moral: 3 letters + 6 digits + 3 alphanum = 12 chars
// Persona física: 4 letters + 6 digits + 3 alphanum = 13 chars
const RFC_MORAL_REGEX = /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/i;
const RFC_FISICA_REGEX = /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/i;
const RFC_GENERIC = ['XAXX010101000', 'XEXX010101000'];

export function validateRFC(rfc: string): string | null {
  const normalized = rfc.trim().toUpperCase();

  if (RFC_GENERIC.includes(normalized)) {
    return 'RFC genérico no permitido';
  }

  if (RFC_MORAL_REGEX.test(normalized) || RFC_FISICA_REGEX.test(normalized)) {
    return null;
  }

  return 'RFC inválido. Debe ser 12 caracteres (persona moral) o 13 (persona física)';
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
