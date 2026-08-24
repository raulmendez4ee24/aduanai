/**
 * Shim: la fuente de verdad vive en src/lib/origin-rules-data.ts (24-ago-2026)
 * para que el arranque del servidor pueda sembrarla si la tabla está vacía
 * (BUG-12: prod tenía origin_rules VACÍA porque ningún deploy corría db:seed).
 * Este archivo conserva la ruta histórica para prisma/seed/index.ts.
 */
export { ORIGIN_RULES, seedOriginRules } from '../../src/lib/origin-rules-data';
