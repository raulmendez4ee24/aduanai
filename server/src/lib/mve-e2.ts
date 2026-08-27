/**
 * Catálogo puro del "resto del formato E2" (Manifestación de Valor) — Ola 2.
 *
 * Todo lo que está aquí es estructura + fundamento en la Ley Aduanera. Lo que
 * NO podemos respaldar con el formato E2 vigente (claves numéricas del formato,
 * lista oficial de formas de pago, regla de vigencia por proveedor) va marcado
 * con `cotejo: 'pendiente'` y la UI lo muestra como "pendiente de cotejo contra
 * formato E2 vigente". Nada de datos legales inventados.
 *
 * Sin DB ni IA: funciones puras para que los tests no dependan de nada.
 */

export type Cotejo = 'ley' | 'pendiente';

// ────────────────────────────────────────────────────────────────────────────
// Métodos de valoración (Art. 64 y 71 LA)
// ────────────────────────────────────────────────────────────────────────────
export interface MetodoValoracion {
  clave: string;
  etiqueta: string;
  fundamento: string;
  /** Orden de aplicación sucesiva y por exclusión (Art. 71 LA). */
  orden: number;
  /** La clave numérica del formato E2 vigente no está en el repo. */
  cotejo: Cotejo;
}

export const METODOS_VALORACION: MetodoValoracion[] = [
  { clave: 'valor_transaccion', etiqueta: 'Valor de transacción de las mercancías importadas', fundamento: 'Art. 64 LA', orden: 1, cotejo: 'ley' },
  { clave: 'mercancias_identicas', etiqueta: 'Valor de transacción de mercancías idénticas', fundamento: 'Art. 71 fracc. I y 72 LA', orden: 2, cotejo: 'ley' },
  { clave: 'mercancias_similares', etiqueta: 'Valor de transacción de mercancías similares', fundamento: 'Art. 71 fracc. II y 73 LA', orden: 3, cotejo: 'ley' },
  { clave: 'precio_unitario', etiqueta: 'Valor de precio unitario de venta', fundamento: 'Art. 71 fracc. III y 74 LA', orden: 4, cotejo: 'ley' },
  { clave: 'valor_reconstruido', etiqueta: 'Valor reconstruido', fundamento: 'Art. 71 fracc. IV y 77 LA', orden: 5, cotejo: 'ley' },
  { clave: 'ultimo_recurso', etiqueta: 'Último recurso (criterios razonables)', fundamento: 'Art. 71 último párrafo y 78 LA', orden: 6, cotejo: 'ley' },
];

export const NOTA_CLAVES_E2 = 'Etiquetas conforme a la Ley Aduanera; la clave numérica del formato E2 vigente está pendiente de cotejo contra el formato publicado.';

export function metodoValoracionValido(clave: unknown): clave is string {
  return typeof clave === 'string' && METODOS_VALORACION.some((m) => m.clave === clave);
}

// ────────────────────────────────────────────────────────────────────────────
// Incrementables (Art. 65 LA) y decrementables (Art. 66 LA) por concepto
// ────────────────────────────────────────────────────────────────────────────
export interface ConceptoAjuste {
  clave: string;
  etiqueta: string;
  fundamento: string;
  cotejo: Cotejo;
}

export const CONCEPTOS_INCREMENTABLES: ConceptoAjuste[] = [
  { clave: 'comisiones', etiqueta: 'Comisiones y gastos de corretaje (salvo comisiones de compra)', fundamento: 'Art. 65 fracc. I inciso a) LA', cotejo: 'ley' },
  { clave: 'envases_embalajes', etiqueta: 'Costo de envases o embalajes', fundamento: 'Art. 65 fracc. I inciso b) LA', cotejo: 'ley' },
  { clave: 'gastos_embalaje', etiqueta: 'Gastos de embalaje (mano de obra y materiales)', fundamento: 'Art. 65 fracc. I inciso c) LA', cotejo: 'ley' },
  { clave: 'fletes', etiqueta: 'Fletes hasta el lugar de entrada', fundamento: 'Art. 65 fracc. I inciso d) LA', cotejo: 'ley' },
  { clave: 'seguros', etiqueta: 'Seguros hasta el lugar de entrada', fundamento: 'Art. 65 fracc. I inciso d) LA', cotejo: 'ley' },
  { clave: 'gastos_conexos', etiqueta: 'Gastos conexos (manejo, carga y descarga) hasta el lugar de entrada', fundamento: 'Art. 65 fracc. I inciso d) LA', cotejo: 'ley' },
  { clave: 'bienes_servicios_importador', etiqueta: 'Bienes y servicios suministrados por el importador (materiales, moldes, ingeniería fuera de México)', fundamento: 'Art. 65 fracc. II LA', cotejo: 'ley' },
  { clave: 'regalias', etiqueta: 'Regalías y derechos de licencia', fundamento: 'Art. 65 fracc. III LA', cotejo: 'ley' },
  { clave: 'reversiones', etiqueta: 'Reversiones del producto de la reventa al vendedor', fundamento: 'Art. 65 fracc. IV LA', cotejo: 'ley' },
  { clave: 'otros', etiqueta: 'Otros incrementables (especificar)', fundamento: 'Art. 65 LA', cotejo: 'pendiente' },
];

export const CONCEPTOS_DECREMENTABLES: ConceptoAjuste[] = [
  { clave: 'instalacion_posterior', etiqueta: 'Construcción, instalación, armado, montaje, mantenimiento o asistencia técnica posteriores a la importación', fundamento: 'Art. 66 fracc. I inciso a) LA', cotejo: 'ley' },
  { clave: 'fletes_posteriores', etiqueta: 'Fletes, seguros y gastos conexos posteriores al lugar de entrada', fundamento: 'Art. 66 fracc. I inciso b) LA', cotejo: 'ley' },
  { clave: 'contribuciones', etiqueta: 'Contribuciones y cuotas compensatorias pagadas en México', fundamento: 'Art. 66 fracc. I inciso c) LA', cotejo: 'ley' },
  { clave: 'dividendos', etiqueta: 'Dividendos u otros pagos no relacionados con la mercancía', fundamento: 'Art. 66 fracc. II LA', cotejo: 'ley' },
  { clave: 'intereses', etiqueta: 'Intereses por financiamiento (acuerdo por escrito)', fundamento: 'Art. 66 LA', cotejo: 'pendiente' },
  { clave: 'otros', etiqueta: 'Otros decrementables (especificar)', fundamento: 'Art. 66 LA', cotejo: 'pendiente' },
];

export interface AjustePorConcepto {
  concepto: string;
  monto: number;
  descripcion?: string | null;
}

const EPS = 0.01;

export function normalizarAjustes(raw: unknown, catalogo: ConceptoAjuste[]): AjustePorConcepto[] {
  if (!Array.isArray(raw)) return [];
  const claves = new Set(catalogo.map((c) => c.clave));
  const out: AjustePorConcepto[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const monto = Number(o.monto);
    if (!Number.isFinite(monto) || monto < 0) continue;
    const concepto = typeof o.concepto === 'string' && claves.has(o.concepto) ? o.concepto : 'otros';
    out.push({ concepto, monto: Math.round(monto * 100) / 100, descripcion: typeof o.descripcion === 'string' ? o.descripcion : null });
  }
  return out;
}

export function sumarAjustes(lista: AjustePorConcepto[]): number {
  return Math.round(lista.reduce((s, a) => s + a.monto, 0) * 100) / 100;
}

/**
 * Cuadre del valor en aduana: precio pagado + Σ incrementables − Σ decrementables.
 * Los campos planos históricos (freight/insurance/otherIncrements) deben
 * coincidir con los conceptos correspondientes; si no, se reporta.
 */
export function cuadrarValorAduana(input: {
  invoiceValue: number;
  incrementables: AjustePorConcepto[];
  decrementables: AjustePorConcepto[];
  freightValue?: number;
  insuranceValue?: number;
  otherIncrements?: number;
}): { customsValue: number; totalIncrementables: number; totalDecrementables: number; cuadra: boolean; diferencias: string[] } {
  const totalInc = sumarAjustes(input.incrementables);
  const totalDec = sumarAjustes(input.decrementables);
  const customsValue = Math.round((input.invoiceValue + totalInc - totalDec) * 100) / 100;
  const diferencias: string[] = [];
  const porConcepto = (c: string) => sumarAjustes(input.incrementables.filter((a) => a.concepto === c));
  if (input.freightValue !== undefined && Math.abs(porConcepto('fletes') - input.freightValue) > EPS) {
    diferencias.push(`Flete plano (${input.freightValue}) ≠ concepto fletes (${porConcepto('fletes')})`);
  }
  if (input.insuranceValue !== undefined && Math.abs(porConcepto('seguros') - input.insuranceValue) > EPS) {
    diferencias.push(`Seguro plano (${input.insuranceValue}) ≠ concepto seguros (${porConcepto('seguros')})`);
  }
  if (input.otherIncrements !== undefined) {
    const otros = totalInc - porConcepto('fletes') - porConcepto('seguros');
    if (Math.abs(otros - input.otherIncrements) > EPS) {
      diferencias.push(`Otros incrementables planos (${input.otherIncrements}) ≠ resto de conceptos (${Math.round(otros * 100) / 100})`);
    }
  }
  return { customsValue, totalIncrementables: totalInc, totalDecrementables: totalDec, cuadra: diferencias.length === 0, diferencias };
}

/** Deriva los campos planos legacy desde los conceptos (fuente única = conceptos). */
export function planosDesdeConceptos(incrementables: AjustePorConcepto[]): { freightValue: number; insuranceValue: number; otherIncrements: number } {
  const f = sumarAjustes(incrementables.filter((a) => a.concepto === 'fletes'));
  const s = sumarAjustes(incrementables.filter((a) => a.concepto === 'seguros'));
  const o = Math.round((sumarAjustes(incrementables) - f - s) * 100) / 100;
  return { freightValue: f, insuranceValue: s, otherIncrements: o };
}

// ────────────────────────────────────────────────────────────────────────────
// Forma de pago — opciones neutras (lista oficial del E2: pendiente de cotejo)
// ────────────────────────────────────────────────────────────────────────────
export interface FormaPago { clave: string; etiqueta: string; cotejo: Cotejo }

export const FORMAS_PAGO: FormaPago[] = [
  { clave: 'transferencia', etiqueta: 'Transferencia electrónica (T/T, wire)', cotejo: 'pendiente' },
  { clave: 'carta_credito', etiqueta: 'Carta de crédito (L/C)', cotejo: 'pendiente' },
  { clave: 'cheque', etiqueta: 'Cheque', cotejo: 'pendiente' },
  { clave: 'efectivo', etiqueta: 'Efectivo', cotejo: 'pendiente' },
  { clave: 'credito_proveedor', etiqueta: 'Crédito del proveedor (cuenta abierta)', cotejo: 'pendiente' },
  { clave: 'compensacion', etiqueta: 'Compensación / intercompañía', cotejo: 'pendiente' },
  { clave: 'anticipo', etiqueta: 'Pago anticipado', cotejo: 'pendiente' },
  { clave: 'otro', etiqueta: 'Otra (especificar)', cotejo: 'pendiente' },
];
export const NOTA_FORMAS_PAGO = 'Opciones de trabajo; la lista oficial de formas de pago del formato E2 vigente está pendiente de cotejo.';

export function formaPagoValida(clave: unknown): clave is string {
  return typeof clave === 'string' && FORMAS_PAGO.some((f) => f.clave === clave);
}

export interface TerminosPagoTraducidos {
  formaPago: string | null;
  plazoDias: number | null;
  original: string | null;
}

/**
 * Traduce los términos de pago de la factura ("T/T 30 days", "L/C at sight",
 * "Net 45", "100% advance") a la opción del formato + plazo en días.
 */
export function traducirTerminosPago(raw: string | null | undefined): TerminosPagoTraducidos {
  const original = raw && raw.trim() ? raw.trim() : null;
  if (!original) return { formaPago: null, plazoDias: null, original: null };
  const t = original.toLowerCase();
  let formaPago: string | null = null;
  if (/\bt\s*\/?\s*t\b|telegraphic|wire|transferencia|swift|bank transfer|remesa/.test(t)) formaPago = 'transferencia';
  else if (/\bl\s*\/?\s*c\b|letter of credit|carta de cr[eé]dito|documentary credit/.test(t)) formaPago = 'carta_credito';
  else if (/cheque|check\b/.test(t)) formaPago = 'cheque';
  else if (/cash|efectivo/.test(t)) formaPago = 'efectivo';
  else if (/advance|prepa|anticipo|in advance|upfront/.test(t)) formaPago = 'anticipo';
  else if (/open account|cuenta abierta|net\s*\d+|cr[eé]dito/.test(t)) formaPago = 'credito_proveedor';
  else if (/compensaci|intercompany|netting/.test(t)) formaPago = 'compensacion';

  let plazoDias: number | null = null;
  const m = t.match(/(\d{1,3})\s*(d[ií]as|days?|dd)\b/) ?? t.match(/\bnet\s*(\d{1,3})\b/);
  if (m) plazoDias = Number(m[1]);
  else if (/at sight|a la vista|prepaid|advance|anticipo/.test(t)) plazoDias = 0;
  return { formaPago, plazoDias, original };
}

// ────────────────────────────────────────────────────────────────────────────
// Estado de transmisión honesto y vigencia con semáforo
// ────────────────────────────────────────────────────────────────────────────
export const ESTADOS_TRANSMISION = ['lista_para_transmitir', 'transmitida_por_usuario'] as const;
export type EstadoTransmision = typeof ESTADOS_TRANSMISION[number];

export const NOTA_TRANSMISION = 'ADUANAI no transmite a VUCEM. "Transmitida" solo se marca manualmente con folio VUCEM y fecha.';

export function estadoTransmisionValido(v: unknown): v is EstadoTransmision {
  return typeof v === 'string' && (ESTADOS_TRANSMISION as readonly string[]).includes(v);
}

export type Semaforo = 'verde' | 'ambar' | 'rojo' | 'gris';

export const NOTA_VIGENCIA = 'La regla de vigencia de la MVE por proveedor/operación no está respaldada en el repo: la fecha es editable y queda "pendiente de cotejo".';

/** Verde > 30 días; ámbar ≤ 30; rojo vencida; gris sin fecha capturada. */
export function semaforoVigencia(vigenciaHasta: Date | string | null | undefined, hoy: Date = new Date()): { semaforo: Semaforo; diasRestantes: number | null } {
  if (!vigenciaHasta) return { semaforo: 'gris', diasRestantes: null };
  const v = typeof vigenciaHasta === 'string' ? new Date(vigenciaHasta) : vigenciaHasta;
  if (Number.isNaN(v.getTime())) return { semaforo: 'gris', diasRestantes: null };
  const dias = Math.ceil((v.getTime() - hoy.getTime()) / 86_400_000);
  if (dias < 0) return { semaforo: 'rojo', diasRestantes: dias };
  if (dias <= 30) return { semaforo: 'ambar', diasRestantes: dias };
  return { semaforo: 'verde', diasRestantes: dias };
}

// ────────────────────────────────────────────────────────────────────────────
// Layout de salida (orden de trabajo del formato E2)
// ────────────────────────────────────────────────────────────────────────────
export const LAYOUT_AVISO = 'Layout de trabajo generado por ADUANAI con los campos en el orden del formato E2 — NO es el XSD oficial de VUCEM. Cotejar contra el formato vigente antes de transmitir.';

export interface CampoLayout { seccion: string; campo: string; valor: string | number | boolean | null }

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function layoutAXml(campos: CampoLayout[], meta: { mveId: string; generadoEn: string }): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', `<!-- ${LAYOUT_AVISO} -->`, `<ManifestacionValorLayoutTrabajo id="${xmlEscape(meta.mveId)}" generadoEn="${meta.generadoEn}" oficial="false">`];
  let seccionAbierta: string | null = null;
  for (const c of campos) {
    if (c.seccion !== seccionAbierta) {
      if (seccionAbierta) lines.push(`  </${seccionAbierta}>`);
      lines.push(`  <${c.seccion}>`);
      seccionAbierta = c.seccion;
    }
    const v = c.valor === null || c.valor === undefined ? '' : String(c.valor);
    lines.push(`    <${c.campo}>${xmlEscape(v)}</${c.campo}>`);
  }
  if (seccionAbierta) lines.push(`  </${seccionAbierta}>`);
  lines.push('</ManifestacionValorLayoutTrabajo>');
  return lines.join('\n');
}
