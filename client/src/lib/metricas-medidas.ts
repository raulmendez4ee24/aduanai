/**
 * ÚNICA fuente de métricas de desempeño visibles al usuario (misión
 * honestidad comercial, 24-ago-2026).
 *
 * Regla: ningún número de desempeño se hardcodea en páginas o componentes —
 * o sale de aquí con su artefacto reproducible, o no se muestra. El guard
 * anti-afirmaciones (server/src/tests/afirmaciones-comerciales.test.ts)
 * vigila la reincidencia.
 *
 * Artefactos:
 *  - Precisión: server/src/tests/medicion-tanda-8544-2026-08-24.json
 *    (99 casos internos, temperatura 0, código main b40d8d2; línea base
 *    comparable: baseline-v2.2-temp0-2026-07-04.json, mismo top-1).
 *  - Duración: baseline-v2.2-temp0-2026-07-04.json campo `ms` por caso
 *    (min 41 s, mediana 52 s, máx 112 s en 99 casos) + la radiografía
 *    (docs/COMO_FUNCIONA_ADUANAI.md) que documenta hasta ~2.5 min observados
 *    en producción. "1 a 3 minutos" es la envolvente honesta de ambas fuentes.
 *  - Corpus: conteo directo en producción (tabla legal_documents vía railway
 *    ssh) al corte indicado — si producción cambia, actualizar aquí, no en
 *    las páginas.
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

/**
 * Fallbacks de los contadores públicos — ÚNICA constante (orden 25-ago).
 * Los números vivos llegan de GET /api/stats/public (derivados de filas
 * ACTIVAS en la base); estos valores solo pintan el primer render y declaran
 * su unidad y corte. Si producción cambia, el vivo manda.
 */
export const FALLBACK_STATS = {
  /** Fracciones TIGIE con active=true (8,256 totales − 8544.42.01 retirada). */
  fraccionesActivas: 8255,
  /** legal_documents con isActive=true (1,174 totales − 3 inactivos). */
  documentosLegalesActivos: 1171,
  /** Fuentes maestras distintas (campo source) entre los documentos activos. */
  fuentesLegales: 17,
  corte: '2026-08-25',
} as const
