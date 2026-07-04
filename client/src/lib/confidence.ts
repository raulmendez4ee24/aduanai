/**
 * 2ª Ola Etapa 2 (F4) — FUENTE ÚNICA del rótulo de "confianza" en toda la UI.
 *
 * La medición oficial del Clasificador v2 (2026-07-03, baseline 38.4% top1)
 * demostró que la confianza auto-reportada del modelo NO separa aciertos de
 * errores (93.3 promedio en aciertos vs 88.6 en errores). Por eso la UI la
 * presenta como auto-estimación, NO como indicador de calidad.
 *
 * Cuando exista la tasa de acierto MEDIDA por categoría, este rótulo evoluciona
 * AQUÍ (un solo lugar) y toda la UI lo hereda.
 */
export const CONFIDENCE_LABEL = 'Auto-estimación del modelo'
export const CONFIDENCE_TOOLTIP =
  'Estimación generada por el propio modelo sobre su clasificación — NO es una tasa de acierto medida. Valida la fracción con tu agente aduanal.'
