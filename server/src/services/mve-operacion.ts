/**
 * Auto MVE — operación (Ola 2): construcción/guardado de la MVE con el resto
 * del formato E2, plantillas por proveedor, lote y vigencias por proveedor.
 *
 * Honestidad: `estadoTransmision` SOLO puede ser 'lista_para_transmitir' o
 * 'transmitida_por_usuario' (marcada a mano con folio VUCEM + fecha). Ningún
 * camino de código la pone en "transmitida" automáticamente.
 */
import { prisma } from '../lib/prisma';
import { whereCliente, whereIdConAlcance, type AlcanceCliente } from '../lib/cliente-contexto';
import { AppError } from '../middlewares/error';
import {
  CONCEPTOS_INCREMENTABLES, CONCEPTOS_DECREMENTABLES,
  normalizarAjustes, cuadrarValorAduana, planosDesdeConceptos,
  metodoValoracionValido, formaPagoValida, semaforoVigencia, NOTA_VIGENCIA,
  type AjustePorConcepto, type Semaforo,
} from '../lib/mve-e2';
import { extractInvoiceData, generateFormatoE2, type ExtractedInvoice, type ExtrasE2, type LlmTexto } from './auto-mve';

// ────────────────────────────────────────────────────────────────────────────
// Construcción de datos (compartida por POST /, PATCH /:id y el lote)
// ────────────────────────────────────────────────────────────────────────────

export interface CuerpoMVE {
  pedimento?: string | null;
  providerName?: string;
  providerCountry?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  incoterm?: string;
  currency?: string;
  exchangeRate?: number | string | null;
  invoiceValue?: number | string;
  freightValue?: number | string;
  insuranceValue?: number | string;
  otherIncrements?: number | string;
  hasVinculacion?: boolean;
  vinculacionDesc?: string | null;
  vinculacionAfectaPrecio?: boolean | null;
  metodoValoracion?: string | null;
  incrementables?: unknown;
  decrementables?: unknown;
  formaPago?: string | null;
  plazoPagoDias?: number | null;
  paymentTerms?: string | null;
  rfcImportador?: string | null;
  pesoBrutoKg?: number | string | null;
  pesoNetoKg?: number | string | null;
  vigenciaHasta?: string | null;
  plantillaId?: string | null;
}

export interface DatosMVE {
  pedimento: string | null;
  providerName: string;
  providerCountry: string;
  invoiceNumber: string;
  invoiceDate: Date;
  incoterm: string;
  currency: string;
  exchangeRate: number | null;
  invoiceValue: number;
  freightValue: number;
  insuranceValue: number;
  otherIncrements: number;
  customsValue: number;
  hasVinculacion: boolean;
  vinculacionDesc: string | null;
  metodoValoracion: string;
  incrementables: AjustePorConcepto[];
  decrementables: AjustePorConcepto[];
  formaPago: string | null;
  rfcImportador: string | null;
  pesoBrutoKg: number | null;
  vigenciaHasta: Date | null;
  plantillaId: string | null;
  extras: ExtrasE2;
  cuadre: { cuadra: boolean; diferencias: string[]; totalIncrementables: number; totalDecrementables: number };
}

function num(v: unknown, def = 0): number {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * Regla de cuadre: los CONCEPTOS mandan. Si el cuerpo trae conceptos, los
 * planos (flete/seguro/otros) se derivan de ellos; si no trae conceptos, se
 * construyen desde los planos. Así `customsValue` siempre cuadra con la suma.
 */
export function construirDatosMVE(body: CuerpoMVE, rfcContexto: string | null): DatosMVE {
  if (!body.providerName || !body.providerCountry || !body.invoiceNumber || !body.invoiceDate || body.invoiceValue === undefined) {
    throw new AppError('Campos requeridos: providerName, providerCountry, invoiceNumber, invoiceDate, invoiceValue', 400);
  }
  const invoiceValue = num(body.invoiceValue);
  if (!(invoiceValue > 0)) throw new AppError('invoiceValue debe ser mayor a cero', 400);
  const invoiceDate = new Date(body.invoiceDate);
  if (Number.isNaN(invoiceDate.getTime())) throw new AppError('invoiceDate inválida', 400);

  let incrementables = normalizarAjustes(body.incrementables, CONCEPTOS_INCREMENTABLES);
  const decrementables = normalizarAjustes(body.decrementables, CONCEPTOS_DECREMENTABLES);
  if (incrementables.length === 0) {
    const f = num(body.freightValue); const s = num(body.insuranceValue); const o = num(body.otherIncrements);
    if (f > 0) incrementables.push({ concepto: 'fletes', monto: f, descripcion: null });
    if (s > 0) incrementables.push({ concepto: 'seguros', monto: s, descripcion: null });
    if (o > 0) incrementables.push({ concepto: 'otros', monto: o, descripcion: null });
  }
  incrementables = incrementables.filter((a) => a.monto > 0);
  const planos = planosDesdeConceptos(incrementables);
  const cuadre = cuadrarValorAduana({ invoiceValue, incrementables, decrementables, ...planos });

  if (body.metodoValoracion != null && body.metodoValoracion !== '' && !metodoValoracionValido(body.metodoValoracion)) {
    throw new AppError('metodoValoracion inválido', 400);
  }
  if (body.formaPago != null && body.formaPago !== '' && !formaPagoValida(body.formaPago)) {
    throw new AppError('formaPago inválida', 400);
  }
  const vigencia = body.vigenciaHasta ? new Date(body.vigenciaHasta) : null;
  if (vigencia && Number.isNaN(vigencia.getTime())) throw new AppError('vigenciaHasta inválida', 400);

  const rfcBody = typeof body.rfcImportador === 'string' && body.rfcImportador.trim() ? body.rfcImportador.trim().toUpperCase() : null;
  const hasVinculacion = body.hasVinculacion === true;

  return {
    pedimento: body.pedimento ?? null,
    providerName: String(body.providerName).trim(),
    providerCountry: String(body.providerCountry).trim().toUpperCase(),
    invoiceNumber: String(body.invoiceNumber).trim(),
    invoiceDate,
    incoterm: body.incoterm || 'FOB',
    currency: body.currency || 'USD',
    exchangeRate: body.exchangeRate ? num(body.exchangeRate) : null,
    invoiceValue,
    ...planos,
    customsValue: cuadre.customsValue,
    hasVinculacion,
    vinculacionDesc: hasVinculacion ? (body.vinculacionDesc ?? null) : null,
    metodoValoracion: metodoValoracionValido(body.metodoValoracion) ? body.metodoValoracion : 'valor_transaccion',
    incrementables,
    decrementables,
    formaPago: formaPagoValida(body.formaPago) ? body.formaPago : null,
    rfcImportador: rfcBody ?? rfcContexto,
    pesoBrutoKg: body.pesoBrutoKg != null && body.pesoBrutoKg !== '' ? num(body.pesoBrutoKg) : null,
    vigenciaHasta: vigencia,
    plantillaId: body.plantillaId ?? null,
    extras: {
      vinculacionAfectaPrecio: hasVinculacion ? (body.vinculacionAfectaPrecio ?? null) : false,
      pesoNetoKg: body.pesoNetoKg != null && body.pesoNetoKg !== '' ? num(body.pesoNetoKg) : null,
      plazoPagoDias: body.plazoPagoDias != null ? num(body.plazoPagoDias) : null,
      paymentTerms: body.paymentTerms ?? null,
    },
    cuadre: { cuadra: cuadre.cuadra, diferencias: cuadre.diferencias, totalIncrementables: cuadre.totalIncrementables, totalDecrementables: cuadre.totalDecrementables },
  };
}

/** RFC del importador desde el cliente activo; si no hay, el del tenant. */
export async function rfcDeContexto(tenantId: string, clienteId: string | null): Promise<string | null> {
  if (clienteId) {
    const c = await prisma.cliente.findFirst({ where: { id: clienteId, tenantId }, select: { rfc: true } });
    if (c?.rfc) return c.rfc;
  }
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { rfc: true } });
  return t?.rfc ?? null;
}

export async function crearMVE(tenantId: string, clienteId: string | null, datos: DatosMVE, tenantName?: string) {
  const { extras, cuadre: _cuadre, ...cols } = datos;
  void _cuadre;
  const formatoE2 = generateFormatoE2({ ...cols, estadoTransmision: 'lista_para_transmitir' }, tenantName, extras);
  const mve = await prisma.manifestacionValor.create({
    data: {
      ...cols,
      incrementables: cols.incrementables as object[],
      decrementables: cols.decrementables as object[],
      estadoTransmision: 'lista_para_transmitir',
      formatoE2: formatoE2 as object,
      tenantId,
      clienteId,
    },
  });
  const plantilla = await upsertPlantillaDesdeMVE(tenantId, datos);
  if (plantilla && !mve.plantillaId) {
    await prisma.manifestacionValor.update({ where: { id: mve.id }, data: { plantillaId: plantilla.id } });
    mve.plantillaId = plantilla.id;
  }
  return mve;
}

// ────────────────────────────────────────────────────────────────────────────
// Plantillas por proveedor
// ────────────────────────────────────────────────────────────────────────────

export interface CamposPlantilla {
  providerCountry: string | null;
  incoterm: string;
  currency: string;
  metodoValoracion: string;
  formaPago: string | null;
  plazoPagoDias: number | null;
  hasVinculacion: boolean;
  vinculacionDesc: string | null;
  vinculacionAfectaPrecio: boolean | null;
  /** Conceptos que este proveedor suele traer (sin montos: los montos son por factura). */
  incrementablesTipicos: string[];
  decrementablesTipicos: string[];
}

export function camposEstablesDe(d: Pick<DatosMVE, 'providerCountry' | 'incoterm' | 'currency' | 'metodoValoracion' | 'formaPago' | 'hasVinculacion' | 'vinculacionDesc' | 'incrementables' | 'decrementables' | 'extras'>): CamposPlantilla {
  return {
    providerCountry: d.providerCountry || null,
    incoterm: d.incoterm,
    currency: d.currency,
    metodoValoracion: d.metodoValoracion,
    formaPago: d.formaPago,
    plazoPagoDias: d.extras.plazoPagoDias ?? null,
    hasVinculacion: d.hasVinculacion,
    vinculacionDesc: d.vinculacionDesc,
    vinculacionAfectaPrecio: d.extras.vinculacionAfectaPrecio ?? null,
    incrementablesTipicos: Array.from(new Set(d.incrementables.map((a) => a.concepto))),
    decrementablesTipicos: Array.from(new Set(d.decrementables.map((a) => a.concepto))),
  };
}

export function claveProveedor(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ');
}

export async function upsertPlantillaDesdeMVE(tenantId: string, datos: DatosMVE) {
  const proveedorNombre = claveProveedor(datos.providerName);
  if (!proveedorNombre) return null;
  const campos = camposEstablesDe(datos);
  return prisma.mVEPlantillaProveedor.upsert({
    where: { tenantId_proveedorNombre: { tenantId, proveedorNombre } },
    create: { tenantId, proveedorNombre, proveedorPais: campos.providerCountry, campos: campos as unknown as object, usos: 1 },
    update: { proveedorPais: campos.providerCountry, campos: campos as unknown as object, usos: { increment: 1 } },
  });
}

export interface PlantillaAplicada { id: string; proveedorNombre: string; usos: number; camposAplicados: string[] }

/**
 * Pre-llena lo que la extracción NO trajo con lo estable del proveedor.
 * Nunca pisa un dato que la factura sí dijo (la factura manda sobre la plantilla).
 */
export function aplicarPlantillaAExtraccion(
  extracted: ExtractedInvoice,
  plantilla: { id: string; proveedorNombre: string; usos: number; campos: unknown } | null,
): { extracted: ExtractedInvoice; plantillaAplicada: PlantillaAplicada | null } {
  if (!plantilla) return { extracted, plantillaAplicada: null };
  const c = (plantilla.campos ?? {}) as Partial<CamposPlantilla>;
  const out: ExtractedInvoice = { ...extracted };
  const aplicados: string[] = [];
  if (!out.formaPago && c.formaPago) { out.formaPago = c.formaPago; aplicados.push('formaPago'); }
  if (out.plazoPagoDias == null && c.plazoPagoDias != null) { out.plazoPagoDias = c.plazoPagoDias; aplicados.push('plazoPagoDias'); }
  if ((!out.incoterm || out.incoterm === 'FOB') && c.incoterm && c.incoterm !== out.incoterm && (out.notes ?? '').toLowerCase().includes('incoterm')) {
    // La extracción avisa en notes cuando el FOB fue default: ahí la plantilla manda.
    out.incoterm = c.incoterm; aplicados.push('incoterm');
  }
  if (!out.currency && c.currency) { out.currency = c.currency; aplicados.push('currency'); }
  if (!out.providerCountry && c.providerCountry) { out.providerCountry = c.providerCountry; aplicados.push('providerCountry'); }
  if ((!out.metodoValoracion || out.metodoValoracion === 'valor_transaccion') && c.metodoValoracion && c.metodoValoracion !== out.metodoValoracion) {
    out.metodoValoracion = c.metodoValoracion; aplicados.push('metodoValoracion');
  }
  if (!out.hasVinculacion && c.hasVinculacion) {
    out.hasVinculacion = true; out.vinculacionDesc = c.vinculacionDesc ?? out.vinculacionDesc ?? null;
    out.vinculacionAfectaPrecio = c.vinculacionAfectaPrecio ?? null; aplicados.push('vinculacion');
  }
  if (!out.rfcImportador && (c as Record<string, unknown>).rfcImportador) { /* el RFC viene del cliente activo, no de la plantilla */ }
  return {
    extracted: out,
    plantillaAplicada: { id: plantilla.id, proveedorNombre: plantilla.proveedorNombre, usos: plantilla.usos, camposAplicados: aplicados },
  };
}

export async function buscarPlantilla(tenantId: string, providerName: string | null | undefined) {
  if (!providerName) return null;
  const proveedorNombre = claveProveedor(providerName);
  // Coincidencia exacta y, si no, insensible a mayúsculas.
  return (await prisma.mVEPlantillaProveedor.findFirst({ where: { tenantId, proveedorNombre } }))
    ?? (await prisma.mVEPlantillaProveedor.findFirst({ where: { tenantId, proveedorNombre: { equals: proveedorNombre, mode: 'insensitive' } } }));
}

export async function listarPlantillas(tenantId: string) {
  return prisma.mVEPlantillaProveedor.findMany({ where: { tenantId }, orderBy: [{ usos: 'desc' }, { updatedAt: 'desc' }] });
}

// ────────────────────────────────────────────────────────────────────────────
// Vigencias por proveedor (semáforo)
// ────────────────────────────────────────────────────────────────────────────

export interface VigenciaProveedor {
  proveedor: string;
  pais: string;
  mves: number;
  ultimaMveId: string;
  ultimaFactura: string;
  vigenciaHasta: string | null;
  semaforo: Semaforo;
  diasRestantes: number | null;
  estadoTransmision: string;
}

export async function vigenciasPorProveedor(tenantId: string, alcance: AlcanceCliente, hoy = new Date()): Promise<{ proveedores: VigenciaProveedor[]; nota: string; resumen: Record<Semaforo, number> }> {
  const mves = await prisma.manifestacionValor.findMany({
    where: { tenantId, ...whereCliente(alcance) },
    orderBy: { invoiceDate: 'desc' },
    select: { id: true, providerName: true, providerCountry: true, invoiceNumber: true, vigenciaHasta: true, estadoTransmision: true },
  });
  const porProveedor = new Map<string, VigenciaProveedor>();
  for (const m of mves) {
    const k = claveProveedor(m.providerName).toLowerCase();
    const existente = porProveedor.get(k);
    if (existente) { existente.mves++; continue; }
    const { semaforo, diasRestantes } = semaforoVigencia(m.vigenciaHasta, hoy);
    porProveedor.set(k, {
      proveedor: m.providerName, pais: m.providerCountry, mves: 1, ultimaMveId: m.id, ultimaFactura: m.invoiceNumber,
      vigenciaHasta: m.vigenciaHasta ? m.vigenciaHasta.toISOString().slice(0, 10) : null,
      semaforo, diasRestantes, estadoTransmision: m.estadoTransmision,
    });
  }
  const orden: Record<Semaforo, number> = { rojo: 0, ambar: 1, gris: 2, verde: 3 };
  const proveedores = Array.from(porProveedor.values()).sort((a, b) => orden[a.semaforo] - orden[b.semaforo] || a.proveedor.localeCompare(b.proveedor));
  const resumen: Record<Semaforo, number> = { verde: 0, ambar: 0, rojo: 0, gris: 0 };
  for (const p of proveedores) resumen[p.semaforo]++;
  return { proveedores, nota: NOTA_VIGENCIA, resumen };
}

// ────────────────────────────────────────────────────────────────────────────
// Transmisión honesta
// ────────────────────────────────────────────────────────────────────────────

export async function marcarTransmitidaPorUsuario(tenantId: string, mveId: string, folioVucem: string, fechaTransmision: string, alcance: AlcanceCliente = null) {
  const existing = await prisma.manifestacionValor.findFirst({ where: whereIdConAlcance(alcance, { id: mveId, tenantId }) });
  if (!existing) throw new AppError('MVE no encontrada', 404);
  const folio = folioVucem.trim();
  if (folio.length < 4) throw new AppError('Folio VUCEM requerido (mínimo 4 caracteres)', 400);
  const fecha = new Date(fechaTransmision);
  if (Number.isNaN(fecha.getTime())) throw new AppError('fechaTransmision inválida', 400);
  if (fecha.getTime() > Date.now() + 86_400_000) throw new AppError('La fecha de transmisión no puede ser futura', 400);
  const formato = (existing.formatoE2 ?? {}) as Record<string, unknown>;
  const extras = { ...((formato.extras as ExtrasE2) ?? {}), folioVucem: folio, fechaTransmision: fecha.toISOString().slice(0, 10) };
  const formatoE2 = { ...formato, extras, transmision: { ...((formato.transmision as object) ?? {}), estado: 'transmitida_por_usuario', folioVucem: folio, fechaTransmision: extras.fechaTransmision } };
  return prisma.manifestacionValor.update({
    where: { id: existing.id },
    data: { estadoTransmision: 'transmitida_por_usuario', status: 'TRANSMITTED', transmittedAt: fecha, formatoE2: formatoE2 as object },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Lote: varias facturas → una MVE por factura (síncrono, máx. 20)
// ────────────────────────────────────────────────────────────────────────────

export const LOTE_MAX = 20;

export interface FacturaLote { nombre?: string; contenidoBase64?: string; texto?: string }
export interface ResultadoLote {
  indice: number;
  nombre: string | null;
  ok: boolean;
  mveId?: string;
  proveedor?: string;
  factura?: string;
  customsValue?: number;
  plantillaAplicada?: PlantillaAplicada | null;
  cuadra?: boolean;
  error?: string;
}

function textoDeFactura(f: FacturaLote): string {
  if (f.texto && f.texto.trim().length >= 20) return f.texto;
  if (f.contenidoBase64) {
    const buf = Buffer.from(f.contenidoBase64, 'base64');
    if (buf.subarray(0, 4).toString('latin1') === '%PDF') {
      throw new Error('PDF no soportado en lote: sube el texto de la factura (TXT) o pégalo en la pantalla individual');
    }
    const txt = buf.toString('utf8');
    if (txt.trim().length >= 20) return txt;
  }
  throw new Error('Factura vacía o ilegible (mínimo 20 caracteres de texto)');
}

export async function procesarLote(
  args: { tenantId: string; clienteId: string | null; tenantName?: string; facturas: FacturaLote[]; llm?: LlmTexto },
): Promise<{ total: number; creadas: number; fallidas: number; resultados: ResultadoLote[] }> {
  if (!Array.isArray(args.facturas) || args.facturas.length === 0) throw new AppError('facturas[] requerido', 400);
  if (args.facturas.length > LOTE_MAX) throw new AppError(`Máximo ${LOTE_MAX} facturas por lote`, 400);
  const rfc = await rfcDeContexto(args.tenantId, args.clienteId);
  const resultados: ResultadoLote[] = [];
  // Cola secuencial a propósito: reutiliza el extractor y no satura al proveedor de IA.
  for (let i = 0; i < args.facturas.length; i++) {
    const f = args.facturas[i];
    const nombre = f.nombre ?? null;
    try {
      const texto = textoDeFactura(f);
      const extraido = await extractInvoiceData(texto, args.llm);
      const plantilla = await buscarPlantilla(args.tenantId, extraido.providerName);
      const { extracted, plantillaAplicada } = aplicarPlantillaAExtraccion(extraido, plantilla);
      const datos = construirDatosMVE({
        providerName: extracted.providerName, providerCountry: extracted.providerCountry, invoiceNumber: extracted.invoiceNumber,
        invoiceDate: extracted.invoiceDate, incoterm: extracted.incoterm, currency: extracted.currency,
        invoiceValue: extracted.subtotal, incrementables: extracted.incrementables, decrementables: extracted.decrementables,
        hasVinculacion: extracted.hasVinculacion ?? false, vinculacionDesc: extracted.vinculacionDesc, vinculacionAfectaPrecio: extracted.vinculacionAfectaPrecio,
        metodoValoracion: extracted.metodoValoracion, formaPago: extracted.formaPago, plazoPagoDias: extracted.plazoPagoDias, paymentTerms: extracted.paymentTerms,
        rfcImportador: extracted.rfcImportador, pesoBrutoKg: extracted.pesoBrutoKg, pesoNetoKg: extracted.pesoNetoKg,
        plantillaId: plantillaAplicada?.id ?? null,
      }, rfc);
      const mve = await crearMVE(args.tenantId, args.clienteId, datos, args.tenantName);
      resultados.push({ indice: i, nombre, ok: true, mveId: mve.id, proveedor: mve.providerName, factura: mve.invoiceNumber, customsValue: mve.customsValue, plantillaAplicada, cuadra: datos.cuadre.cuadra });
    } catch (e) {
      resultados.push({ indice: i, nombre, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const creadas = resultados.filter((r) => r.ok).length;
  return { total: resultados.length, creadas, fallidas: resultados.length - creadas, resultados };
}
