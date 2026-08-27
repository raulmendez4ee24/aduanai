/**
 * SEVERIDAD PONDERADA POR MONTO (Operación 2026-08, Ola 2 regulatorio).
 *
 * Problema que resuelve: la severidad se decidía solo por días al vencimiento,
 * de modo que una importación con $387 MXN de saldo salía "crítica" junto a
 * una de $196,000. Aquí la severidad combina el MONTO en riesgo con la
 * URGENCIA, con umbrales explícitos y documentados.
 *
 * Función pura (sin DB ni red) para poder testearla con tabla de casos.
 *
 * UMBRALES (MXN) — `UMBRALES_MONTO`:
 *   ≥ 100,000  → banda "alto"      (una multa/regularización relevante para PyME)
 *   ≥  10,000  → banda "medio"
 *   ≥   1,000  → banda "bajo"
 *   <   1,000  → banda "trivial"   (nunca sube de 'low' salvo urgencia extrema)
 *
 * URGENCIA (días para vencer) — `UMBRALES_DIAS`:
 *   ≤ 0   → vencida
 *   ≤ 7   → inminente
 *   ≤ 30  → próxima
 *   ≤ 90  → lejana
 *   > 90 / sin fecha → sin urgencia
 *
 * MATRIZ (monto × urgencia → severidad):
 *   - Monto ALTO:    vencida/inminente → critical; próxima → high; lejana/sin → high
 *   - Monto MEDIO:   vencida/inminente → high;     próxima → medium; lejana/sin → medium
 *   - Monto BAJO:    vencida/inminente → medium;   próxima → low;    lejana/sin → low
 *   - Monto TRIVIAL: vencida → low; inminente → low; resto → low
 *   - Monto DESCONOCIDO (null): se decide SOLO por urgencia pero con techo 'high'
 *     (no podemos afirmar "crítico" sin cifra): vencida/inminente → high,
 *     próxima → medium, lejana/sin → low.
 *
 * EXCEPCIONES POR TIPO (`TIPOS_SIN_MONTO`): hay alertas cuya gravedad no
 * depende de pesos — pérdida de padrón, decreto de tarifa sin cotejar,
 * obligación legal vencida. Para esos tipos el monto no degrada: se usa la
 * severidad por urgencia sin techo (vencida/inminente → critical).
 */

export type Severidad = 'critical' | 'high' | 'medium' | 'low';

export const UMBRALES_MONTO = {
  alto: 100_000,
  medio: 10_000,
  bajo: 1_000,
} as const;

export const UMBRALES_DIAS = {
  inminente: 7,
  proxima: 30,
  lejana: 90,
} as const;

/** Tipos cuya gravedad es legal/operativa, no monetaria. */
export const TIPOS_SIN_MONTO: readonly string[] = [
  'padron_expiring', 'padron_suspended', 'padron_missing',
  'tarifa_decreto_nuevo', 'obligacion_vencida', 'obligacion_proxima',
];

export type BandaMonto = 'alto' | 'medio' | 'bajo' | 'trivial' | 'desconocido';
export type Urgencia = 'vencida' | 'inminente' | 'proxima' | 'lejana' | 'sin_urgencia';

export function bandaMonto(impactoMXN: number | null | undefined): BandaMonto {
  if (impactoMXN == null || !Number.isFinite(impactoMXN)) return 'desconocido';
  const abs = Math.abs(impactoMXN);
  if (abs >= UMBRALES_MONTO.alto) return 'alto';
  if (abs >= UMBRALES_MONTO.medio) return 'medio';
  if (abs >= UMBRALES_MONTO.bajo) return 'bajo';
  return 'trivial';
}

export function urgenciaPorDias(dias: number | null | undefined): Urgencia {
  if (dias == null || !Number.isFinite(dias)) return 'sin_urgencia';
  if (dias <= 0) return 'vencida';
  if (dias <= UMBRALES_DIAS.inminente) return 'inminente';
  if (dias <= UMBRALES_DIAS.proxima) return 'proxima';
  if (dias <= UMBRALES_DIAS.lejana) return 'lejana';
  return 'sin_urgencia';
}

export interface EntradaSeveridad {
  tipo: string;
  /** Monto en riesgo en MXN (signo irrelevante). null = no estimable. */
  impactoMXN?: number | null;
  /** Días para vencer; ≤0 = ya vencida; null = sin fecha. */
  diasParaVencer?: number | null;
}

export function severidadPorImpacto(e: EntradaSeveridad): Severidad {
  const urgencia = urgenciaPorDias(e.diasParaVencer);
  const urgente = urgencia === 'vencida' || urgencia === 'inminente';

  if (TIPOS_SIN_MONTO.includes(e.tipo)) {
    if (urgente) return 'critical';
    if (urgencia === 'proxima') return 'high';
    if (urgencia === 'lejana') return 'medium';
    return 'medium';
  }

  const banda = bandaMonto(e.impactoMXN);
  switch (banda) {
    case 'alto':
      return urgente ? 'critical' : 'high';
    case 'medio':
      if (urgente) return 'high';
      return 'medium';
    case 'bajo':
      if (urgente) return 'medium';
      return 'low';
    case 'trivial':
      return 'low';
    case 'desconocido':
    default:
      if (urgente) return 'high';
      if (urgencia === 'proxima') return 'medium';
      return 'low';
  }
}

/** Reglas legibles para `GET /api/alerts/severidad/reglas` y la UI. */
export const REGLAS_SEVERIDAD = {
  umbralesMonto: UMBRALES_MONTO,
  umbralesDias: UMBRALES_DIAS,
  tiposSinMonto: TIPOS_SIN_MONTO,
  matriz: [
    { banda: 'alto (≥ $100,000)', vencida_o_inminente: 'critical', proxima: 'high', lejana_o_sin_fecha: 'high' },
    { banda: 'medio (≥ $10,000)', vencida_o_inminente: 'high', proxima: 'medium', lejana_o_sin_fecha: 'medium' },
    { banda: 'bajo (≥ $1,000)', vencida_o_inminente: 'medium', proxima: 'low', lejana_o_sin_fecha: 'low' },
    { banda: 'trivial (< $1,000)', vencida_o_inminente: 'low', proxima: 'low', lejana_o_sin_fecha: 'low' },
    { banda: 'desconocido (sin cifra)', vencida_o_inminente: 'high', proxima: 'medium', lejana_o_sin_fecha: 'low' },
    { banda: 'tipos sin monto (padrón, decreto, obligación)', vencida_o_inminente: 'critical', proxima: 'high', lejana_o_sin_fecha: 'medium' },
  ],
  nota: 'La severidad combina monto en riesgo (MXN) y urgencia (días). Sin cifra no se afirma "crítico".',
} as const;
