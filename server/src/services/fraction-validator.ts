import { prisma } from '../lib/prisma';

/**
 * FUENTE ÚNICA DE VERDAD para "¿este código de fracción existe y está vigente?".
 *
 * Cualquier módulo que reciba o muestre una fracción de un producto (Inventario,
 * MVE, cotizador, etc.) DEBE validar contra esto — NO inventar, NO confiar en un
 * LLM libre, NO aceptar strings crudos del body sin cotejar contra el catálogo.
 *
 * Falla cerrado (principio del proyecto): si el código no existe o está inactivo
 * en el catálogo `Fraction` (Base Única SNICE / TIGIE vigente), `valid = false` y
 * `description = null`. El caller NO debe mostrar la fracción; debe remitir al
 * catálogo/DOF con `FRACTION_UNVERIFIED_MESSAGE`.
 *
 * Mismo patrón que `resolveSectorsForFraction` (padron-checker.ts): un único
 * resolver contra la tabla canónica en lugar de N derivaciones independientes.
 */

export type FractionValidationReason = 'ok' | 'not_found' | 'inactive' | 'malformed';

export interface FractionValidation {
  valid: boolean;
  /** Código normalizado a 8 dígitos sin puntos (o lo que se pudo limpiar del input). */
  code: string;
  /** Descripción canónica del catálogo — SOLO cuando `valid`; null en caso contrario (falla cerrado). */
  description: string | null;
  reason: FractionValidationReason;
}

/** Mensaje único para fail-closed en UI y salidas. No fabricar datos legales. */
export const FRACTION_UNVERIFIED_MESSAGE =
  'Fracción no verificada en el catálogo TIGIE vigente — consulta el catálogo/DOF oficial.';

/** Normaliza a solo dígitos (quita puntos, espacios, etc.). "7318.15.99" → "73181599". */
export function normalizeFractionCode(input: string | null | undefined): string {
  return (input ?? '').replace(/\D/g, '');
}

/**
 * Valida un único código contra el catálogo. Read-only.
 */
export async function validateFraction(input: string | null | undefined): Promise<FractionValidation> {
  const code = normalizeFractionCode(input);
  if (code.length !== 8) {
    return { valid: false, code, description: null, reason: 'malformed' };
  }
  const fraction = await prisma.fraction.findUnique({
    where: { code },
    select: { description: true, active: true },
  });
  if (!fraction) return { valid: false, code, description: null, reason: 'not_found' };
  if (!fraction.active) return { valid: false, code, description: null, reason: 'inactive' };
  return { valid: true, code, description: fraction.description, reason: 'ok' };
}

/**
 * Versión batch para listas (items de factura MVE, imports de Inventario, etc.).
 * Una sola consulta al catálogo. Devuelve un resultado por input, en orden.
 */
export async function validateFractions(
  inputs: Array<string | null | undefined>,
): Promise<FractionValidation[]> {
  const normalized = inputs.map(normalizeFractionCode);
  const codes8 = [...new Set(normalized.filter((c) => c.length === 8))];
  const found = codes8.length
    ? await prisma.fraction.findMany({
        where: { code: { in: codes8 } },
        select: { code: true, description: true, active: true },
      })
    : [];
  const byCode = new Map(found.map((f) => [f.code, f]));
  return normalized.map((code) => {
    if (code.length !== 8) return { valid: false, code, description: null, reason: 'malformed' as const };
    const f = byCode.get(code);
    if (!f) return { valid: false, code, description: null, reason: 'not_found' as const };
    if (!f.active) return { valid: false, code, description: null, reason: 'inactive' as const };
    return { valid: true, code, description: f.description, reason: 'ok' as const };
  });
}
