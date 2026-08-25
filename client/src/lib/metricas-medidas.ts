/**
 * ÚNICA fuente de métricas de desempeño visibles al usuario (misión
 * honestidad comercial, 24-ago-2026).
 *
 * Regla: ningún número de desempeño se hardcodea en páginas o componentes —
 * o sale de aquí con su artefacto reproducible, o no se muestra. El guard
 * anti-afirmaciones (server/src/tests/afirmaciones-comerciales.test.ts)
 * vigila la reincidencia.
 *
 * Artefacto: server/src/tests/medicion-tanda-8544-2026-08-24.json
 * (99 casos internos, temperatura 0, código main b40d8d2; línea base
 * comparable: baseline-v2.2-temp0-2026-07-04.json, mismo resultado top-1).
 * Las duraciones provienen del mismo runner (campo ms por caso) y del rango
 * observado en producción: la radiografía documenta ~45 s a ~2.5 min.
 */
export const METRICAS_CLASIFICADOR = {
  /** Fracción completa (8 dígitos) correcta en el set interno. */
  top1: '61.6%',
  /** Capítulo (2 dígitos) correcto en el set interno. */
  capitulo: '81.8%',
  /** Tamaño del set de medición. */
  casos: 99,
  fechaMedicion: '2026-08-24',
  artefacto: 'medicion-tanda-8544-2026-08-24.json',
  /** Duración típica observada de una clasificación completa. */
  duracionTipica: '1 a 3 minutos',
} as const
