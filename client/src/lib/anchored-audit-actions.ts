/**
 * Acciones que las rutas actuales emiten mediante auditMiddleware y que el
 * backend acepta en shouldAnchor(). El set excluye nombres legacy sin emisor
 * o escrituras directas que no recorren el servicio de auditoría/anclaje.
 */
export const ANCHORED_ACTIONS: ReadonlySet<string> = new Set([
  'CLASSIFY',
  'QUOTE',
  'QUOTE_MULTI',
  'QUOTE_SCENARIOS',
  'PEDIMENTO_VALIDATION',
  'PRE_VALIDATE',
  'GLOSA_SIMULATE',
])
