/**
 * Redondeo y escalas numéricas compartidas (cuarta revisión, 27-ago-2026).
 *
 * Dos pecados que la revisión encontró en pantalla:
 *
 * 1. Flotantes crudos en saldos: sumar diez lotes de 45.112 da
 *    `451.1200000000001` en IEEE-754 y restar `1055.18 - 1000` da
 *    `55.180000000000064`; así se pintaban en pantalla. El redondeo
 *    NO se hace al pintar: se hace EN EL ORIGEN (la resta/suma que produce el
 *    saldo), para que el número que viaja por la API y el que se guarda sean
 *    el mismo que el usuario ve. `aDecimales` es el mismo `r6` que ya usaba
 *    `anexo24-peps.ts`, extraído aquí para que cambio-régimen y el PEPS
 *    redondeen idéntico.
 *
 * 2. Porcentajes multiplicados dos veces: `Classification.confidence` ya vive
 *    en escala 0-100 (lo escriben classifier/lote/dictamen) y la bandeja de
 *    Aprobaciones volvía a multiplicar por 100 → "confianza 9800%".
 *    `porcentajeConfianza` es la ÚNICA conversión permitida.
 */

/** Redondea a `decimales` (6 por defecto): 0.1+0.2 → 0.3, no 0.30000000000000004. */
export function aDecimales(n: number, decimales = 6): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimales;
  // El +EPSILON relativo corrige el caso 1.005 → 1.00 de Math.round puro.
  return Math.round((n + Math.sign(n) * Number.EPSILON * Math.abs(n)) * f) / f;
}

/** Suma una lista redondeando el resultado (la suma de 40 lotes no arrastra ruido). */
export function sumaRedondeada(valores: number[], decimales = 6): number {
  return aDecimales(valores.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0), decimales);
}

/**
 * Normaliza una confianza a porcentaje 0-100 para pintar.
 *
 * Escala canónica del producto: 0-100 (`Classification.confidence`). Se tolera
 * la escala 0-1 de filas legacy/fixtures antiguas (`0.88` → 88) porque el
 * clasificador nunca emite "1 de 100": un valor ≤ 1 es una proporción, no un
 * porcentaje. Nada más multiplica: quien pinte confianza usa esto.
 *
 * @returns porcentaje redondeado 0-100, o `null` si no hay dato.
 */
export function porcentajeConfianza(valor: number | null | undefined): number | null {
  if (valor == null || !Number.isFinite(valor)) return null;
  const escalado = valor > 0 && valor <= 1 ? valor * 100 : valor;
  return Math.round(Math.max(0, Math.min(100, escalado)));
}

/** `porcentajeConfianza` ya formateada: "98%" o "—" cuando no hay dato. */
export function formatearConfianza(valor: number | null | undefined): string {
  const p = porcentajeConfianza(valor);
  return p == null ? '—' : `${p}%`;
}

/**
 * Monto con moneda para textos del servidor: "20,000.50 USD".
 * Siempre 2 decimales — un valor en aduana nunca se pinta como "20,000.5".
 * Sin moneda registrada se pinta solo el número (no se supone la divisa).
 */
export function montoConMoneda(monto: number, moneda: string | null | undefined): string {
  const n = Number.isFinite(monto) ? monto : 0;
  const cifra = n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const div = (moneda ?? '').trim();
  return div ? `${cifra} ${div}` : cifra;
}
