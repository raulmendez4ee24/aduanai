/**
 * Validación de RFC mexicano (Persona Física + Persona Moral).
 *
 * Detecta RFCs genéricos del SAT (XAXX/XEXX) y patrones de prueba que
 * los auditores aduanales detectan en 5 segundos. Cumple con:
 *   - Persona Física: 13 caracteres (4 letras + 6 dígitos fecha + 3 homoclave)
 *   - Persona Moral:  12 caracteres (3 letras + 6 dígitos fecha + 3 homoclave)
 *   - Validación de mes (1-12) y día (1-31)
 *   - Bloqueo de RFCs genéricos cuando allowGeneric=false
 *   - Bloqueo de patrones de prueba (todos iguales, AAA010101AAA, etc.)
 *   - Warning de homoclave sospechosa (solo letras o solo números)
 */

/** RFCs genéricos del SAT — bloqueados por defecto en operaciones formales. */
export const GENERIC_RFCS: ReadonlySet<string> = new Set([
  'XAXX010101000', // Persona física: extranjero genérico (residencia exterior)
  'XEXX010101000', // Persona moral: extranjero / no identificado
  'AAA010101AAA',  // patrón típico de prueba
  'XXX010101000',  // patrón típico de prueba
]);

/** Patrones que indican uso de prueba y NO operación real. */
const TEST_PATTERNS: readonly RegExp[] = [
  /^(.)\1+$/,        // Todo el mismo carácter
  /^0+$/,            // Solo ceros
  /^9+$/,            // Solo nueves
  /(.)\1{5,}/,       // 6+ caracteres iguales seguidos
];

const MORAL_PATTERN = /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/;
const FISICA_PATTERN = /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/;

export type RFCValidationReason =
  | 'EMPTY'
  | 'INVALID_LENGTH'
  | 'EXPECTED_MORAL'
  | 'EXPECTED_FISICA'
  | 'INVALID_PATTERN_MORAL'
  | 'INVALID_PATTERN_FISICA'
  | 'INVALID_MONTH'
  | 'INVALID_DAY'
  | 'GENERIC_RFC'
  | 'TEST_PATTERN'
  | 'SUSPICIOUS_HOMOCLAVE';

export type RFCType = 'moral' | 'fisica';

export interface RFCValidationOptions {
  /** Permitir RFCs genéricos del SAT (XAXX/XEXX). Default: false. */
  allowGeneric?: boolean;
  /** Forzar tipo de RFC esperado. */
  expectedType?: RFCType;
}

export interface RFCValidationResult {
  valid: boolean;
  reason?: RFCValidationReason;
  warning?: RFCValidationReason;
  message?: string;
  type?: RFCType;
  /** RFC limpio en mayúsculas, listo para almacenar. */
  normalized?: string;
  /** True si el RFC es uno de los genéricos del SAT (informativo). */
  isGeneric?: boolean;
}

const REASON_MESSAGES: Record<RFCValidationReason, string> = {
  EMPTY: 'RFC vacío',
  INVALID_LENGTH: 'El RFC debe tener 12 (Moral) o 13 (Física) caracteres',
  EXPECTED_MORAL: 'Se esperaba un RFC de Persona Moral (12 caracteres)',
  EXPECTED_FISICA: 'Se esperaba un RFC de Persona Física (13 caracteres)',
  INVALID_PATTERN_MORAL: 'Estructura inválida para Persona Moral (debe ser 3 letras + 6 dígitos + 3 alfanuméricos)',
  INVALID_PATTERN_FISICA: 'Estructura inválida para Persona Física (debe ser 4 letras + 6 dígitos + 3 alfanuméricos)',
  INVALID_MONTH: 'El mes en el RFC es inválido (debe ser 01–12)',
  INVALID_DAY: 'El día en el RFC es inválido (debe ser 01–31)',
  GENERIC_RFC: 'RFC genérico del SAT no permitido para operaciones formales',
  TEST_PATTERN: 'El RFC parece de prueba (patrón repetitivo)',
  SUSPICIOUS_HOMOCLAVE: 'Homoclave inusual, verifique',
};

export function validateRFC(rfcInput: string | null | undefined, options: RFCValidationOptions = {}): RFCValidationResult {
  if (!rfcInput) return { valid: false, reason: 'EMPTY', message: REASON_MESSAGES.EMPTY };
  const rfc = String(rfcInput).toUpperCase().trim().replace(/\s+/g, '');

  const { allowGeneric = false, expectedType } = options;

  if (rfc.length !== 12 && rfc.length !== 13) {
    return { valid: false, reason: 'INVALID_LENGTH', message: REASON_MESSAGES.INVALID_LENGTH };
  }
  const isMoral = rfc.length === 12;
  const isFisica = rfc.length === 13;
  const type: RFCType = isMoral ? 'moral' : 'fisica';

  if (expectedType === 'moral' && !isMoral) {
    return { valid: false, reason: 'EXPECTED_MORAL', message: REASON_MESSAGES.EXPECTED_MORAL };
  }
  if (expectedType === 'fisica' && !isFisica) {
    return { valid: false, reason: 'EXPECTED_FISICA', message: REASON_MESSAGES.EXPECTED_FISICA };
  }

  if (isMoral && !MORAL_PATTERN.test(rfc)) {
    return { valid: false, reason: 'INVALID_PATTERN_MORAL', message: REASON_MESSAGES.INVALID_PATTERN_MORAL };
  }
  if (isFisica && !FISICA_PATTERN.test(rfc)) {
    return { valid: false, reason: 'INVALID_PATTERN_FISICA', message: REASON_MESSAGES.INVALID_PATTERN_FISICA };
  }

  // Validar fecha embebida (YYMMDD)
  const dateStart = isMoral ? 3 : 4;
  const dateStr = rfc.substring(dateStart, dateStart + 6);
  const month = parseInt(dateStr.substring(2, 4), 10);
  const day = parseInt(dateStr.substring(4, 6), 10);
  if (month < 1 || month > 12) {
    return { valid: false, reason: 'INVALID_MONTH', message: REASON_MESSAGES.INVALID_MONTH };
  }
  if (day < 1 || day > 31) {
    return { valid: false, reason: 'INVALID_DAY', message: REASON_MESSAGES.INVALID_DAY };
  }

  const isGeneric = GENERIC_RFCS.has(rfc);

  if (!allowGeneric && isGeneric) {
    return { valid: false, reason: 'GENERIC_RFC', message: REASON_MESSAGES.GENERIC_RFC, isGeneric: true, normalized: rfc, type };
  }

  for (const pattern of TEST_PATTERNS) {
    if (pattern.test(rfc)) {
      return { valid: false, reason: 'TEST_PATTERN', message: REASON_MESSAGES.TEST_PATTERN, normalized: rfc, type };
    }
  }

  // Homoclave sospechosa: no es bloqueante, pero warning
  const homoclave = rfc.substring(rfc.length - 3);
  if (/^[A-Z]{3}$/.test(homoclave) || /^[0-9]{3}$/.test(homoclave)) {
    return {
      valid: true,
      warning: 'SUSPICIOUS_HOMOCLAVE',
      message: REASON_MESSAGES.SUSPICIOUS_HOMOCLAVE,
      type,
      normalized: rfc,
      isGeneric,
    };
  }

  return { valid: true, type, normalized: rfc, isGeneric };
}

/** Conveniencia: ¿es uno de los RFCs genéricos del SAT? */
export function isGenericRFC(rfc: string | null | undefined): boolean {
  if (!rfc) return false;
  return GENERIC_RFCS.has(String(rfc).toUpperCase().trim());
}

/** Etiqueta legible del estado para UI/logs. */
export function rfcStatusLabel(result: RFCValidationResult): string {
  if (!result.valid) return result.message ?? 'RFC inválido';
  if (result.warning) return `Válido (con observación): ${result.message}`;
  return 'Válido';
}
