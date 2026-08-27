import { prisma } from '../lib/prisma';
import { getAnthropicClient } from '../lib/anthropic';
import {
  METODOS_VALORACION, CONCEPTOS_INCREMENTABLES, CONCEPTOS_DECREMENTABLES, FORMAS_PAGO,
  NOTA_CLAVES_E2, NOTA_FORMAS_PAGO, NOTA_TRANSMISION, NOTA_VIGENCIA, LAYOUT_AVISO,
  normalizarAjustes, sumarAjustes, traducirTerminosPago, metodoValoracionValido, formaPagoValida,
  layoutAXml,
  type AjustePorConcepto, type CampoLayout,
} from '../lib/mve-e2';

/** LLM inyectable: (system, user) → texto. Los tests pasan una función falsa. */
export type LlmTexto = (system: string, user: string) => Promise<string>;

async function llmAnthropic(system: string, user: string): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return response.content[0].type === 'text' ? response.content[0].text : '{}';
}

// ============================================
// Extracción automática de factura con IA
// ============================================

export interface ExtractedInvoice {
  providerName: string;
  providerCountry: string;
  providerTaxId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  incoterm: string;
  currency: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    // Sin fractionCode a propósito: MVE es valoración, NO clasificación.
    // Clasificar la fracción es tarea del Clasificador (aterrizado vs catálogo).
  }[];
  subtotal: number;
  freight?: number;
  insurance?: number;
  otherCharges?: number;
  totalValue: number;
  paymentTerms?: string | null;
  notes?: string | null;
  // ── Resto del formato E2 (Ola 2) ──
  /** Forma de pago traducida a la opción del formato (ver FORMAS_PAGO). */
  formaPago?: string | null;
  /** Plazo de pago en días si la factura lo dice ("T/T 30 days" → 30). */
  plazoPagoDias?: number | null;
  /** Clave de METODOS_VALORACION. Sin evidencia en contra = valor de transacción. */
  metodoValoracion?: string | null;
  incrementables?: AjustePorConcepto[];
  decrementables?: AjustePorConcepto[];
  hasVinculacion?: boolean | null;
  vinculacionDesc?: string | null;
  vinculacionAfectaPrecio?: boolean | null;
  pesoBrutoKg?: number | null;
  pesoNetoKg?: number | null;
  /** RFC del importador si aparece en la factura (normalmente viene del cliente activo). */
  rfcImportador?: string | null;
}

/**
 * MVE (Opción A): valoración, NO clasificación. Se queda SOLO con los campos de
 * valor de cada item y descarta cualquier `fractionCode` que un LLM pudiera colar.
 * Fuente de la verdad de fracciones = Clasificador (aterrizado vs catálogo).
 */
export function sanitizeInvoiceItems(items: ExtractedInvoice['items'] | undefined): ExtractedInvoice['items'] {
  return (items ?? []).map((it) => ({
    description: it.description,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    totalPrice: it.totalPrice,
  }));
}

const PROMPT_EXTRACCION = `Eres un experto en comercio exterior mexicano especializado en valoracion aduanera y Manifestaciones de Valor (formato E2).

Analiza la factura comercial proporcionada y extrae TODOS los campos necesarios para generar una Manifestacion de Valor Electronica para importacion a Mexico.

Responde UNICAMENTE con un JSON valido con esta estructura exacta:
{
  "providerName": "nombre del proveedor/vendedor",
  "providerCountry": "pais del proveedor (codigo ISO 2 letras)",
  "providerTaxId": "RFC o Tax ID del proveedor si aparece",
  "invoiceNumber": "numero de factura",
  "invoiceDate": "YYYY-MM-DD",
  "incoterm": "FOB/CIF/EXW/FCA/etc",
  "currency": "USD/EUR/CNY/etc",
  "items": [
    { "description": "descripcion del producto", "quantity": 100, "unitPrice": 25.50, "totalPrice": 2550.00 }
  ],
  "subtotal": 2550.00,
  "freight": 500.00,
  "insurance": 50.00,
  "otherCharges": 0,
  "totalValue": 3100.00,
  "paymentTerms": "terminos de pago TEXTUALES tal como aparecen (ej. 'T/T 30 days', 'L/C at sight', 'Net 45')",
  "incrementables": [ { "concepto": "<clave>", "monto": 500.00, "descripcion": "texto de la factura" } ],
  "decrementables": [ { "concepto": "<clave>", "monto": 0, "descripcion": "..." } ],
  "hasVinculacion": false,
  "vinculacionDesc": "indicios de relacion importador-proveedor (misma marca, 'affiliate', 'parent company', 'intercompany') o null",
  "pesoBrutoKg": 1200.5,
  "pesoNetoKg": 1150.0,
  "rfcImportador": "RFC del importador/consignee SOLO si aparece textual en la factura, si no null",
  "notes": "observaciones relevantes"
}

Claves permitidas de incrementables (Art. 65 LA): ${CONCEPTOS_INCREMENTABLES.map((c) => `${c.clave} = ${c.etiqueta}`).join('; ')}.
Claves permitidas de decrementables (Art. 66 LA): ${CONCEPTOS_DECREMENTABLES.map((c) => `${c.clave} = ${c.etiqueta}`).join('; ')}.
Reglas para incrementables/decrementables:
- Cada cargo de la factura que NO sea precio de la mercancia va en UN concepto con su monto exacto (flete = "fletes", seguro = "seguros", packing/embalaje = "gastos_embalaje" o "envases_embalajes", royalties = "regalias", handling/THC = "gastos_conexos").
- NO inventes cargos: si la factura no los desglosa, deja la lista vacia. Los montos deben sumar exactamente lo que dice la factura.
- Los cargos posteriores a la llegada a Mexico (instalacion, flete interno en Mexico) son decrementables, no incrementables.
- freight/insurance/otherCharges deben coincidir con los conceptos "fletes", "seguros" y el resto.

Pesos: extrae peso bruto y neto en kilogramos si aparecen (convierte lb a kg: 1 lb = 0.45359237 kg). Si no aparecen, null.
Vinculacion: hasVinculacion=true SOLO con indicio textual; si no hay indicio, false y vinculacionDesc null.
paymentTerms: copia el texto literal; NO lo traduzcas ni lo omitas.

Si un campo no aparece en la factura, usa null.
NO infieras, adivines ni inventes la fraccion arancelaria de ningun item: la clasificacion es tarea del Clasificador, que la valida contra el catalogo TIGIE vigente. No incluyas ningun campo de fraccion en la respuesta.
Para el pais, infiere del idioma, moneda o direccion si no esta explicito.
Para el incoterm, si no aparece explicitamente, pon "FOB" como default y mencionalo en notes.
Siempre responde con JSON valido, sin markdown ni texto adicional.`;

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;

/**
 * Mapea la salida cruda del LLM a `ExtractedInvoice` con los campos E2:
 * traduce términos de pago, normaliza conceptos, cuadra planos ↔ conceptos.
 * Pura: se prueba sin IA.
 */
export function mapearExtraccionE2(raw: Record<string, unknown>): ExtractedInvoice {
  const items = sanitizeInvoiceItems(raw.items as ExtractedInvoice['items']);
  const paymentTerms = typeof raw.paymentTerms === 'string' && raw.paymentTerms.trim() ? raw.paymentTerms.trim() : null;
  const terminos = traducirTerminosPago(paymentTerms);

  let incrementables = normalizarAjustes(raw.incrementables, CONCEPTOS_INCREMENTABLES);
  const decrementables = normalizarAjustes(raw.decrementables, CONCEPTOS_DECREMENTABLES);

  // Si el modelo no desglosó conceptos pero sí dio planos, los conceptos se derivan de los planos.
  const freight = numOrNull(raw.freight) ?? 0;
  const insurance = numOrNull(raw.insurance) ?? 0;
  const other = numOrNull(raw.otherCharges) ?? 0;
  if (incrementables.length === 0) {
    if (freight > 0) incrementables.push({ concepto: 'fletes', monto: freight, descripcion: 'derivado del campo flete' });
    if (insurance > 0) incrementables.push({ concepto: 'seguros', monto: insurance, descripcion: 'derivado del campo seguro' });
    if (other > 0) incrementables.push({ concepto: 'otros', monto: other, descripcion: 'derivado del campo otros cargos' });
  }
  incrementables = incrementables.filter((a) => a.monto > 0);

  const subtotal = numOrNull(raw.subtotal) ?? items.reduce((s, it) => s + (Number(it.totalPrice) || 0), 0);
  const metodo = metodoValoracionValido(raw.metodoValoracion) ? raw.metodoValoracion : 'valor_transaccion';
  const formaPago = terminos.formaPago ?? (formaPagoValida(raw.formaPago) ? raw.formaPago : null);

  const fletes = sumarAjustes(incrementables.filter((a) => a.concepto === 'fletes'));
  const seguros = sumarAjustes(incrementables.filter((a) => a.concepto === 'seguros'));
  const resto = Math.round((sumarAjustes(incrementables) - fletes - seguros) * 100) / 100;
  const rfcRaw = typeof raw.rfcImportador === 'string' ? raw.rfcImportador.trim().toUpperCase() : '';

  return {
    providerName: String(raw.providerName ?? ''),
    providerCountry: String(raw.providerCountry ?? ''),
    providerTaxId: typeof raw.providerTaxId === 'string' ? raw.providerTaxId : undefined,
    invoiceNumber: String(raw.invoiceNumber ?? ''),
    invoiceDate: String(raw.invoiceDate ?? ''),
    incoterm: String(raw.incoterm ?? 'FOB'),
    currency: String(raw.currency ?? 'USD'),
    items,
    subtotal,
    freight: fletes,
    insurance: seguros,
    otherCharges: resto,
    totalValue: numOrNull(raw.totalValue) ?? Math.round((subtotal + sumarAjustes(incrementables)) * 100) / 100,
    paymentTerms,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    formaPago,
    plazoPagoDias: terminos.plazoDias,
    metodoValoracion: metodo,
    incrementables,
    decrementables,
    hasVinculacion: raw.hasVinculacion === true,
    vinculacionDesc: typeof raw.vinculacionDesc === 'string' && raw.vinculacionDesc.trim() ? raw.vinculacionDesc : null,
    vinculacionAfectaPrecio: raw.vinculacionAfectaPrecio === true ? true : raw.hasVinculacion === true ? null : false,
    pesoBrutoKg: numOrNull(raw.pesoBrutoKg),
    pesoNetoKg: numOrNull(raw.pesoNetoKg),
    rfcImportador: RFC_RE.test(rfcRaw) ? rfcRaw : null,
  };
}

export async function extractInvoiceData(invoiceText: string, llm: LlmTexto = llmAnthropic): Promise<ExtractedInvoice> {
  const text = await llm(PROMPT_EXTRACCION, `Extrae los datos de esta factura comercial:\n\n${invoiceText}`);
  // Parse JSON, handling potential markdown wrapping
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const raw = JSON.parse(jsonStr) as Record<string, unknown>;
  // Falla cerrado: MVE NUNCA emite fracción (sanitizeInvoiceItems dentro del mapeo).
  return mapearExtraccionE2(raw);
}

/** Catálogos para la UI (métodos, conceptos, formas de pago) con sus notas de cotejo. */
export function catalogosE2() {
  return {
    metodosValoracion: METODOS_VALORACION,
    incrementables: CONCEPTOS_INCREMENTABLES,
    decrementables: CONCEPTOS_DECREMENTABLES,
    formasPago: FORMAS_PAGO,
    notas: { claves: NOTA_CLAVES_E2, formasPago: NOTA_FORMAS_PAGO, transmision: NOTA_TRANSMISION, vigencia: NOTA_VIGENCIA, layout: LAYOUT_AVISO },
  };
}

// ============================================
// Generación formato E2
// ============================================

export interface MVEParaFormato {
  providerName: string;
  providerCountry: string;
  invoiceNumber: string;
  invoiceDate: Date;
  incoterm: string;
  currency: string;
  exchangeRate?: number | null;
  invoiceValue: number;
  freightValue: number;
  insuranceValue: number;
  otherIncrements: number;
  customsValue: number;
  hasVinculacion: boolean;
  vinculacionDesc?: string | null;
  // E2 Ola 2
  metodoValoracion?: string | null;
  incrementables?: unknown;
  decrementables?: unknown;
  formaPago?: string | null;
  rfcImportador?: string | null;
  pesoBrutoKg?: number | null;
  pedimento?: string | null;
  estadoTransmision?: string | null;
  vigenciaHasta?: Date | null;
}

function ajustesDe(v: unknown): AjustePorConcepto[] {
  return Array.isArray(v) ? (v as AjustePorConcepto[]) : [];
}

/**
 * `decrementables` guarda la lista de conceptos; los extras del E2 que no
 * tienen columna (afectaPrecio, pesoNeto, plazo de pago) viajan en
 * `incrementables` como objeto `{ lista, extras }`? No: para mantener el Json
 * simple, `incrementables`/`decrementables` son SIEMPRE arrays y los extras
 * viven en `formatoE2.extras` (regenerado en cada guardado).
 */
export interface ExtrasE2 {
  vinculacionAfectaPrecio?: boolean | null;
  pesoNetoKg?: number | null;
  plazoPagoDias?: number | null;
  paymentTerms?: string | null;
  folioVucem?: string | null;
  fechaTransmision?: string | null;
}

export function generateFormatoE2(mve: MVEParaFormato, tenantName?: string, extras: ExtrasE2 = {}) {
  const metodo = METODOS_VALORACION.find((m) => m.clave === (mve.metodoValoracion ?? 'valor_transaccion')) ?? METODOS_VALORACION[0];
  const inc = ajustesDe(mve.incrementables);
  const dec = ajustesDe(mve.decrementables);
  const forma = FORMAS_PAGO.find((f) => f.clave === mve.formaPago) ?? null;
  const etiquetaConcepto = (lista: typeof CONCEPTOS_INCREMENTABLES, clave: string) => lista.find((c) => c.clave === clave)?.etiqueta ?? clave;
  return {
    // Seccion I - Datos del importador
    importador: {
      nombre: tenantName || 'EMPRESA IMMEX',
      rfc: mve.rfcImportador ?? null,
      domicilio: 'Ver registro fiscal',
    },
    // Seccion II - Datos del proveedor/vendedor
    proveedor: {
      nombre: mve.providerName,
      pais: mve.providerCountry,
    },
    // Seccion III - Datos de la factura
    factura: {
      numero: mve.invoiceNumber,
      fecha: mve.invoiceDate.toISOString().split('T')[0],
      incoterm: mve.incoterm,
      moneda: mve.currency,
      tipoCambio: mve.exchangeRate || null,
      formaPago: forma ? { clave: forma.clave, etiqueta: forma.etiqueta, cotejo: forma.cotejo } : null,
      plazoPagoDias: extras.plazoPagoDias ?? null,
      terminosOriginales: extras.paymentTerms ?? null,
      pesoBrutoKg: mve.pesoBrutoKg ?? null,
      pesoNetoKg: extras.pesoNetoKg ?? null,
    },
    // Seccion IV - Metodo de valoracion
    metodoValoracion: {
      clave: metodo.clave,
      orden: metodo.orden,
      descripcion: metodo.etiqueta,
      fundamento: metodo.fundamento,
      notaClaves: NOTA_CLAVES_E2,
    },
    // Seccion V - Determinacion del valor en aduana
    valoracion: {
      valorFactura: mve.invoiceValue,
      flete: mve.freightValue,
      seguro: mve.insuranceValue,
      otrosIncrementables: mve.otherIncrements,
      incrementablesPorConcepto: inc.map((a) => ({ ...a, etiqueta: etiquetaConcepto(CONCEPTOS_INCREMENTABLES, a.concepto) })),
      decrementablesPorConcepto: dec.map((a) => ({ ...a, etiqueta: etiquetaConcepto(CONCEPTOS_DECREMENTABLES, a.concepto) })),
      totalIncrementables: sumarAjustes(inc),
      totalDecrementables: sumarAjustes(dec),
      valorEnAduana: mve.customsValue,
      desglose: {
        A: mve.invoiceValue,
        B: mve.freightValue,
        C: mve.insuranceValue,
        D: mve.otherIncrements,
        E: mve.customsValue, // A + B + C + D − decrementables
      },
    },
    // Seccion VI - Vinculacion
    vinculacion: {
      existeVinculacion: mve.hasVinculacion,
      descripcion: mve.vinculacionDesc || null,
      afectaPrecio: extras.vinculacionAfectaPrecio ?? (mve.hasVinculacion ? null : false),
    },
    // Seccion VII - Declaracion
    declaracion: {
      texto: 'Declaro bajo protesta de decir verdad que los datos asentados en la presente manifestacion de valor son ciertos.',
      fecha: new Date().toISOString().split('T')[0],
    },
    transmision: {
      estado: mve.estadoTransmision ?? 'lista_para_transmitir',
      folioVucem: extras.folioVucem ?? null,
      fechaTransmision: extras.fechaTransmision ?? null,
      nota: NOTA_TRANSMISION,
    },
    extras,
  };
}

// ============================================
// Layout de salida (orden del formato E2) — JSON/XML de trabajo
// ============================================

export function generateLayoutE2(
  mve: MVEParaFormato & { id: string },
  tenantName?: string,
  extras: ExtrasE2 = {},
): { aviso: string; campos: CampoLayout[]; xml: string; json: Record<string, unknown> } {
  const inc = ajustesDe(mve.incrementables);
  const dec = ajustesDe(mve.decrementables);
  const metodo = METODOS_VALORACION.find((m) => m.clave === (mve.metodoValoracion ?? 'valor_transaccion')) ?? METODOS_VALORACION[0];
  const fecha = mve.invoiceDate.toISOString().split('T')[0];
  const campos: CampoLayout[] = [
    { seccion: 'Importador', campo: 'RFC', valor: mve.rfcImportador ?? null },
    { seccion: 'Importador', campo: 'Nombre', valor: tenantName ?? null },
    { seccion: 'Proveedor', campo: 'Nombre', valor: mve.providerName },
    { seccion: 'Proveedor', campo: 'Pais', valor: mve.providerCountry },
    { seccion: 'Factura', campo: 'Numero', valor: mve.invoiceNumber },
    { seccion: 'Factura', campo: 'Fecha', valor: fecha },
    { seccion: 'Factura', campo: 'Incoterm', valor: mve.incoterm },
    { seccion: 'Factura', campo: 'Moneda', valor: mve.currency },
    { seccion: 'Factura', campo: 'TipoCambio', valor: mve.exchangeRate ?? null },
    { seccion: 'Factura', campo: 'FormaPago', valor: mve.formaPago ?? null },
    { seccion: 'Factura', campo: 'PlazoPagoDias', valor: extras.plazoPagoDias ?? null },
    { seccion: 'Factura', campo: 'PesoBrutoKg', valor: mve.pesoBrutoKg ?? null },
    { seccion: 'Factura', campo: 'PesoNetoKg', valor: extras.pesoNetoKg ?? null },
    { seccion: 'MetodoValoracion', campo: 'Clave', valor: metodo.clave },
    { seccion: 'MetodoValoracion', campo: 'Descripcion', valor: metodo.etiqueta },
    { seccion: 'MetodoValoracion', campo: 'Fundamento', valor: metodo.fundamento },
    { seccion: 'Valoracion', campo: 'PrecioPagado', valor: mve.invoiceValue },
    { seccion: 'Valoracion', campo: 'TotalIncrementables', valor: sumarAjustes(inc) },
    { seccion: 'Valoracion', campo: 'TotalDecrementables', valor: sumarAjustes(dec) },
    { seccion: 'Valoracion', campo: 'ValorEnAduana', valor: mve.customsValue },
    ...inc.map((a) => ({ seccion: 'Incrementables', campo: a.concepto, valor: a.monto })),
    ...dec.map((a) => ({ seccion: 'Decrementables', campo: a.concepto, valor: a.monto })),
    { seccion: 'Vinculacion', campo: 'Existe', valor: mve.hasVinculacion },
    { seccion: 'Vinculacion', campo: 'Descripcion', valor: mve.vinculacionDesc ?? null },
    { seccion: 'Vinculacion', campo: 'AfectaPrecio', valor: extras.vinculacionAfectaPrecio ?? null },
    { seccion: 'Pedimento', campo: 'Numero', valor: mve.pedimento ?? null },
    { seccion: 'Transmision', campo: 'Estado', valor: mve.estadoTransmision ?? 'lista_para_transmitir' },
    { seccion: 'Transmision', campo: 'FolioVucem', valor: extras.folioVucem ?? null },
  ];
  const generadoEn = new Date().toISOString();
  const secciones: Record<string, Record<string, unknown>> = {};
  for (const c of campos) {
    secciones[c.seccion] ??= {};
    // Conceptos repetidos (p. ej. dos "otros") se acumulan.
    const prev = secciones[c.seccion][c.campo];
    secciones[c.seccion][c.campo] = typeof prev === 'number' && typeof c.valor === 'number' ? prev + c.valor : c.valor;
  }
  const json: Record<string, unknown> = { aviso: LAYOUT_AVISO, mveId: mve.id, generadoEn, oficial: false, secciones };
  return { aviso: LAYOUT_AVISO, campos, xml: layoutAXml(campos, { mveId: mve.id, generadoEn }), json };
}

// ============================================
// Validación inteligente con IA
// ============================================

export async function validateMVE(mveId: string, tenantId: string) {
  const mve = await prisma.manifestacionValor.findFirst({
    where: { id: mveId, tenantId },
  });
  if (!mve) throw new Error('MVE no encontrada');

  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `Eres un auditor aduanero mexicano experto en valoracion aduanera (Art. 64-78 Ley Aduanera) y Manifestaciones de Valor.

Analiza la Manifestacion de Valor proporcionada y detecta:
1. SUBVALUACION: valores sospechosamente bajos para el tipo de mercancia
2. INCREMENTABLES FALTANTES: si el incoterm es FOB/EXW/FCA, DEBE haber flete. Si es FOB/FCA, revisa seguro.
3. VINCULACION NO DECLARADA: busca indicios de relacion entre importador y proveedor
4. INCONSISTENCIAS: moneda, fechas, valores que no cuadran
5. RIESGOS DE AUDITORIA: patrones que la autoridad cuestiona

Responde UNICAMENTE con JSON valido:
{
  "riskLevel": "LOW|MEDIUM|HIGH",
  "warnings": [
    {
      "severity": "critical|high|medium|low",
      "category": "subvaluacion|incrementables|vinculacion|inconsistencia|auditoria",
      "message": "descripcion del problema",
      "recommendation": "accion recomendada"
    }
  ],
  "summary": "resumen ejecutivo en 2-3 oraciones"
}`,
    messages: [{
      role: 'user',
      content: `Valida esta Manifestacion de Valor:
- Proveedor: ${mve.providerName} (${mve.providerCountry})
- Factura: ${mve.invoiceNumber} del ${mve.invoiceDate.toISOString().split('T')[0]}
- Incoterm: ${mve.incoterm}
- Moneda: ${mve.currency}
- Metodo de valoracion: ${mve.metodoValoracion ?? 'valor_transaccion'}
- Forma de pago: ${mve.formaPago ?? 'no capturada'}
- Valor factura: $${mve.invoiceValue.toLocaleString()} ${mve.currency}
- Flete: $${mve.freightValue.toLocaleString()}
- Seguro: $${mve.insuranceValue.toLocaleString()}
- Otros incrementables: $${mve.otherIncrements.toLocaleString()}
- Incrementables por concepto: ${JSON.stringify(mve.incrementables ?? [])}
- Decrementables por concepto: ${JSON.stringify(mve.decrementables ?? [])}
- Valor en aduana: $${mve.customsValue.toLocaleString()}
- Vinculacion: ${mve.hasVinculacion ? 'SI - ' + (mve.vinculacionDesc || '') : 'NO'}
- Pedimento: ${mve.pedimento || 'No asignado'}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const validation = JSON.parse(jsonStr);

  // Update MVE with validation results
  await prisma.manifestacionValor.update({
    where: { id: mveId },
    data: {
      aiValidation: validation,
      riskLevel: validation.riskLevel || 'MEDIUM',
      status: 'VALIDATED',
    },
  });

  return validation;
}

// ============================================
// Dashboard KPIs
// ============================================

export async function getMVEDashboard(tenantId: string, clienteId?: string | null) {
  const base = { tenantId, ...(clienteId ? { clienteId } : {}) };
  const [total, draft, validated, signed, transmitted] = await Promise.all([
    prisma.manifestacionValor.count({ where: base }),
    prisma.manifestacionValor.count({ where: { ...base, status: 'DRAFT' } }),
    prisma.manifestacionValor.count({ where: { ...base, status: 'VALIDATED' } }),
    prisma.manifestacionValor.count({ where: { ...base, status: 'SIGNED' } }),
    prisma.manifestacionValor.count({ where: { ...base, estadoTransmision: 'transmitida_por_usuario' } }),
  ]);

  const mves = await prisma.manifestacionValor.findMany({
    where: base,
    select: { customsValue: true, riskLevel: true, currency: true },
  });

  const totalValueUSD = mves.reduce((s, m) => s + m.customsValue, 0);
  const riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const m of mves) {
    if (m.riskLevel && m.riskLevel in riskCounts) {
      riskCounts[m.riskLevel as keyof typeof riskCounts]++;
    }
  }

  const avgRisk = total > 0
    ? Math.round(((riskCounts.HIGH * 100 + riskCounts.MEDIUM * 50 + riskCounts.LOW * 10) / Math.max(1, riskCounts.HIGH + riskCounts.MEDIUM + riskCounts.LOW)))
    : 0;

  return {
    total,
    draft,
    validated,
    signed,
    transmitted,
    pendingAction: draft + validated,
    totalValueUSD,
    riskCounts,
    avgRiskScore: avgRisk,
  };
}

// ============================================
// Generar E2 como texto para PDF
// ============================================

export function generateE2Text(mve: {
  providerName: string;
  providerCountry: string;
  invoiceNumber: string;
  invoiceDate: Date;
  incoterm: string;
  currency: string;
  invoiceValue: number;
  freightValue: number;
  insuranceValue: number;
  otherIncrements: number;
  customsValue: number;
  hasVinculacion: boolean;
  pedimento?: string | null;
  formatoE2?: unknown;
  metodoValoracion?: string | null;
  formaPago?: string | null;
  rfcImportador?: string | null;
  pesoBrutoKg?: number | null;
  incrementables?: unknown;
  decrementables?: unknown;
  estadoTransmision?: string | null;
}) {
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const metodo = METODOS_VALORACION.find((m) => m.clave === (mve.metodoValoracion ?? 'valor_transaccion')) ?? METODOS_VALORACION[0];
  const inc = ajustesDe(mve.incrementables);
  const dec = ajustesDe(mve.decrementables);
  const forma = FORMAS_PAGO.find((f) => f.clave === mve.formaPago);
  const lines = [
    '═══════════════════════════════════════════════════════',
    '       MANIFESTACION DE VALOR — FORMATO E2',
    '       (Art. 59 fraccion III, Ley Aduanera)',
    '═══════════════════════════════════════════════════════',
    '',
    `Pedimento: ${mve.pedimento || 'PENDIENTE'}`,
    `RFC importador: ${mve.rfcImportador || 'PENDIENTE'}`,
    `Fecha: ${new Date().toLocaleDateString('es-MX')}`,
    '',
    '─── I. PROVEEDOR/VENDEDOR ───',
    `Nombre: ${mve.providerName}`,
    `Pais: ${mve.providerCountry}`,
    '',
    '─── II. DATOS DE LA FACTURA ───',
    `Numero: ${mve.invoiceNumber}`,
    `Fecha: ${mve.invoiceDate.toLocaleDateString('es-MX')}`,
    `Incoterm: ${mve.incoterm}`,
    `Moneda: ${mve.currency}`,
    `Forma de pago: ${forma ? forma.etiqueta : 'no capturada'}`,
    `Peso bruto: ${mve.pesoBrutoKg != null ? `${mve.pesoBrutoKg} kg` : 'no capturado'}`,
    '',
    '─── III. METODO DE VALORACION ───',
    `${metodo.orden}. ${metodo.etiqueta} (${metodo.fundamento})`,
    '',
    '─── IV. DETERMINACION DEL VALOR EN ADUANA ───',
    `A) Precio pagado o por pagar:  ${money(mve.invoiceValue)}`,
    ...inc.map((a) => `   + ${(CONCEPTOS_INCREMENTABLES.find((c) => c.clave === a.concepto)?.etiqueta ?? a.concepto).slice(0, 44).padEnd(44)} ${money(a.monto)}`),
    ...dec.map((a) => `   − ${(CONCEPTOS_DECREMENTABLES.find((c) => c.clave === a.concepto)?.etiqueta ?? a.concepto).slice(0, 44).padEnd(44)} ${money(a.monto)}`),
    `B) Flete:                   ${money(mve.freightValue)}`,
    `C) Seguro:                  ${money(mve.insuranceValue)}`,
    `D) Otros incrementables:    ${money(mve.otherIncrements)}`,
    '                            ────────────',
    `E) VALOR EN ADUANA:         ${money(mve.customsValue)} ${mve.currency}`,
    '',
    '─── V. VINCULACION ───',
    `Existe vinculacion: ${mve.hasVinculacion ? 'SI' : 'NO'}`,
    '',
    '─── ESTADO ───',
    `Transmision: ${mve.estadoTransmision === 'transmitida_por_usuario' ? 'transmitida por el usuario (folio en expediente)' : 'lista para transmitir — NO transmitida por ADUANAI'}`,
    '',
    '─── DECLARACION ───',
    'Declaro bajo protesta de decir verdad que los datos',
    'asentados son ciertos y verificables.',
    '',
    '═══════════════════════════════════════════════════════',
    '  Generado por ADUANAI — Auto MVE con IA',
    '═══════════════════════════════════════════════════════',
  ];

  return lines.join('\n');
}
