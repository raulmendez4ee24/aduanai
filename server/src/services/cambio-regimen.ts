/**
 * ASISTENTE DE CAMBIOS DE RÉGIMEN Y REGULARIZACIONES (Operación 2026-08).
 *
 * Desde N `TemporaryImport` (saldos no descargados) arma un
 * `CambioRegimenExpediente` con el cálculo de contribuciones POR PARTIDA
 * usando el MOTOR DEL COTIZADOR (`computeQuoteAmounts`, la misma fórmula
 * Ley Aduanera + Art. 27 LIVA que usa /api/quote) sobre el saldo, con el TC
 * del sistema (Banxico FIX vía frontera canónica) o uno inyectado.
 *
 * Tipos (clave de pedimento Anexo 22 Ap. 2):
 *   F4 — cambio de régimen de temporal a definitivo (insumos)
 *   F5 — cambio de régimen de activo fijo (temporal → definitivo)
 *   A3 — regularización de mercancía (extemporánea / no retornada)
 *   RT — retorno de mercancía importada temporalmente (no causa IGI/IVA)
 *
 * HONESTIDAD LEGAL: actualización y recargos (Arts. 17-A y 21 CFF) son
 * campos EDITABLES a cero por defecto — el CFF NO está en el corpus local
 * (cotejado 27-ago-2026), así que el sistema no inventa factores: el
 * profesional captura el monto con su fundamento. El checklist documental es
 * operativo (práctica del despacho), no una lista con fundamento por documento.
 */

import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { computeQuoteAmounts, requireQuotableFraction } from './quoter';
import { tipoCambioMXN } from './frontera-canonica';
import { CLAVES_PEDIMENTO } from '../lib/anexo22';

export const TIPOS_CAMBIO = ['F4', 'F5', 'A3', 'RT'] as const;
export type TipoCambio = (typeof TIPOS_CAMBIO)[number];

export interface DocumentoRequerido { clave: string; label: string; obligatorio: boolean }

export const DOCUMENTOS_REQUERIDOS: Record<TipoCambio, DocumentoRequerido[]> = {
  F4: [
    { clave: 'pedimento_original', label: 'Pedimento de importación temporal (IN) original', obligatorio: true },
    { clave: 'factura', label: 'Factura / CFDI de la mercancía', obligatorio: true },
    { clave: 'saldo_anexo24', label: 'Reporte de saldos del control de inventarios (Anexo 24)', obligatorio: true },
    { clave: 'pago', label: 'Comprobante de pago de contribuciones (línea de captura)', obligatorio: true },
    { clave: 'mve', label: 'Manifestación de valor (si aplica al definitivo)', obligatorio: false },
    { clave: 'noms', label: 'Cumplimiento de NOMs / regulaciones al definitivo', obligatorio: false },
  ],
  F5: [
    { clave: 'pedimento_original', label: 'Pedimento de importación temporal (AF) original', obligatorio: true },
    { clave: 'factura', label: 'Factura del activo fijo', obligatorio: true },
    { clave: 'registro_af', label: 'Registro del activo fijo en el control de inventarios (Anexo 24)', obligatorio: true },
    { clave: 'pago', label: 'Comprobante de pago de contribuciones', obligatorio: true },
    { clave: 'depreciacion', label: 'Soporte de vida útil / depreciación (valor a declarar)', obligatorio: false },
  ],
  A3: [
    { clave: 'pedimento_original', label: 'Pedimento original (si existe)', obligatorio: false },
    { clave: 'factura', label: 'Factura / CFDI', obligatorio: true },
    { clave: 'inventario', label: 'Evidencia de existencia física / inventario', obligatorio: true },
    { clave: 'pago', label: 'Comprobante de pago de contribuciones, actualización y recargos', obligatorio: true },
    { clave: 'escrito', label: 'Escrito libre de regularización (autocorrección)', obligatorio: true },
  ],
  RT: [
    { clave: 'pedimento_original', label: 'Pedimento de importación temporal original', obligatorio: true },
    { clave: 'factura_retorno', label: 'Factura / packing list del retorno', obligatorio: true },
    { clave: 'saldo_anexo24', label: 'Descargo en el control de inventarios (Anexo 24)', obligatorio: true },
    { clave: 'transporte', label: 'Documento de transporte del retorno', obligatorio: false },
  ],
};

export const DESCRIPCION_TIPO: Record<TipoCambio, string> = {
  F4: 'Cambio de régimen de importación temporal a definitiva (insumos).',
  F5: 'Cambio de régimen de importación temporal a definitiva de activo fijo.',
  A3: 'Regularización de mercancía que excedió el plazo o no fue retornada.',
  RT: 'Retorno al extranjero de mercancía importada temporalmente.',
};

export interface PartidaCalculo {
  temporaryImportId: string;
  pedimento: string;
  fractionCode: string;
  description: string;
  unit: string;
  cantidadImportada: number;
  cantidadDescargada: number;
  saldoCantidad: number;
  valorAduanaUSD: number;
  saldoValorUSD: number;
  saldoValorMXN: number;
  tasas: { igiPct: number; dtaPct: number; ivaPct: number; iepsPct: number };
  montos: { igi: number; dta: number; ieps: number; iva: number; total: number };
  notas: string[];
}

export interface CampoEditable { montoMXN: number; editable: true; fundamento: string; cotejo: 'pendiente' | 'ok' }

export interface CalculoExpediente {
  tipo: TipoCambio;
  descripcion: string;
  clavePedimento: { clave: string; descripcion: string } | null;
  tc: { valor: number; fuente: string; fecha: string | null };
  partidas: PartidaCalculo[];
  subtotales: { saldoValorMXN: number; igi: number; dta: number; ieps: number; iva: number; contribuciones: number };
  actualizacion: CampoEditable;
  recargos: CampoEditable;
  total: number;
  documentos: DocumentoRequerido[];
  advertencias: string[];
  calculadoAt: string;
}

export interface OpcionesCalculo {
  tipo: TipoCambio;
  /** TC inyectado (tests / TC histórico). Default: tipoCambioMXN(). */
  tc?: number;
  tcFuente?: string;
  actualizacionMXN?: number;
  recargosMXN?: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Solo las importaciones DEL TENANT; cualquier id ajeno o inexistente → 404 (sin revelar existencia). */
export async function cargarImportaciones(tenantId: string, ids: string[]) {
  const unicos = [...new Set(ids.filter(x => typeof x === 'string' && x.length > 0))];
  if (unicos.length === 0) throw new AppError('Selecciona al menos una importación temporal', 400);
  const rows = await prisma.temporaryImport.findMany({ where: { tenantId, id: { in: unicos } } });
  if (rows.length !== unicos.length) {
    throw new AppError('Alguna importación no existe o no pertenece a tu empresa', 404);
  }
  return rows;
}

export async function calcularCambioRegimen(tenantId: string, ids: string[], opts: OpcionesCalculo): Promise<CalculoExpediente> {
  if (!(TIPOS_CAMBIO as readonly string[]).includes(opts.tipo)) throw new AppError(`Tipo inválido (${TIPOS_CAMBIO.join('|')})`, 400);
  const tipo = opts.tipo;
  const imports = await cargarImportaciones(tenantId, ids);
  const advertencias: string[] = [];

  // TC: inyectado o del sistema (Banxico FIX). Sin TC no se calcula (frontera canónica).
  let tc: CalculoExpediente['tc'];
  if (opts.tc != null) {
    if (!(opts.tc > 0)) throw new AppError('TC inválido', 400);
    tc = { valor: opts.tc, fuente: opts.tcFuente ?? 'manual', fecha: null };
  } else {
    const d = await tipoCambioMXN();
    if (d.valor == null) throw new AppError(`TC del día no disponible: ${d.nota ?? 'sin fuente'}`, 503);
    tc = { valor: d.valor, fuente: d.fuente?.nombre ?? 'sistema', fecha: d.fechaCotejo };
    if (d.estado !== 'verificado') advertencias.push(`TC ${d.estado}: ${d.nota ?? ''}`.trim());
  }

  const codes = [...new Set(imports.map(i => i.fractionCode.replace(/\./g, '')))];
  const fracciones = await prisma.fraction.findMany({ where: { code: { in: codes } }, select: { code: true, active: true, tariffNMF: true, iepsRate: true } });
  const porCode = new Map(fracciones.map(f => [f.code, f]));

  const esRetorno = tipo === 'RT';
  const partidas: PartidaCalculo[] = imports.map(imp => {
    const notas: string[] = [];
    const code = imp.fractionCode.replace(/\./g, '');
    const fx = porCode.get(code) ?? null;
    requireQuotableFraction(fx); // lanza 422 si la fracción no está en catálogo o no tiene NMF
    const saldoCantidad = Math.max(0, imp.quantity - imp.quantityDischarged);
    const proporcion = imp.quantity > 0 ? saldoCantidad / imp.quantity : 0;
    const saldoValorUSD = r2(imp.customsValue * proporcion);
    if (saldoCantidad <= 0) notas.push('Sin saldo pendiente: partida informativa.');
    if (tipo === 'F5' && imp.tipo !== 'ACTIVO_FIJO') notas.push('La importación no está marcada como activo fijo (tipo INSUMO).');
    if (tipo === 'F4' && imp.tipo === 'ACTIVO_FIJO') notas.push('Es activo fijo: el cambio de régimen de AF se documenta como F5.');
    if (tipo === 'A3' && imp.expirationDate.getTime() > Date.now()) notas.push('Aún dentro de plazo: valora F4/RT antes de regularizar.');
    if (imp.status === 'FULLY_DISCHARGED' || imp.status === 'REGULARIZED') notas.push(`Estado ${imp.status}: ya descargada/regularizada.`);

    const tasas = {
      igiPct: esRetorno ? 0 : fx.tariffNMF!,
      dtaPct: esRetorno ? 0 : 0.8,
      ivaPct: esRetorno ? 0 : 16,
      iepsPct: esRetorno ? 0 : (fx.iepsRate ?? 0),
    };
    if (esRetorno) notas.push('Retorno (RT): no causa IGI/IVA sobre la mercancía retornada; el DTA del retorno se determina en el pedimento.');
    const m = computeQuoteAmounts({ valueUSD: saldoValorUSD, exchangeRate: tc.valor, rates: tasas });
    return {
      temporaryImportId: imp.id,
      pedimento: imp.pedimento,
      fractionCode: code,
      description: imp.description,
      unit: imp.unit,
      cantidadImportada: imp.quantity,
      cantidadDescargada: imp.quantityDischarged,
      saldoCantidad,
      valorAduanaUSD: imp.customsValue,
      saldoValorUSD,
      saldoValorMXN: m.valueMXN,
      tasas,
      montos: { igi: m.igi, dta: m.dta, ieps: m.ieps, iva: m.iva, total: m.totalTaxes },
      notas,
    };
  });

  const sum = (f: (p: PartidaCalculo) => number) => r2(partidas.reduce((a, p) => a + f(p), 0));
  const subtotales = {
    saldoValorMXN: sum(p => p.saldoValorMXN),
    igi: sum(p => p.montos.igi),
    dta: sum(p => p.montos.dta),
    ieps: sum(p => p.montos.ieps),
    iva: sum(p => p.montos.iva),
    contribuciones: sum(p => p.montos.total),
  };
  const actualizacion: CampoEditable = {
    montoMXN: r2(Math.max(0, opts.actualizacionMXN ?? 0)), editable: true,
    fundamento: 'Actualización de contribuciones (Art. 17-A CFF) — captura manual: el CFF no está en el corpus local; pendiente de fuente oficial.',
    cotejo: 'pendiente',
  };
  const recargos: CampoEditable = {
    montoMXN: r2(Math.max(0, opts.recargosMXN ?? 0)), editable: true,
    fundamento: 'Recargos por mora (Art. 21 CFF) — captura manual: el CFF no está en el corpus local; pendiente de fuente oficial.',
    cotejo: 'pendiente',
  };
  if ((tipo === 'A3' || tipo === 'F4') && actualizacion.montoMXN === 0 && recargos.montoMXN === 0 && !esRetorno) {
    advertencias.push('Actualización y recargos en $0: captúralos si la operación es extemporánea (Arts. 17-A y 21 CFF).');
  }
  const clave = CLAVES_PEDIMENTO.find(c => c.clave === tipo) ?? null;
  return {
    tipo,
    descripcion: DESCRIPCION_TIPO[tipo],
    clavePedimento: clave ? { clave: clave.clave, descripcion: clave.descripcion } : null,
    tc,
    partidas,
    subtotales,
    actualizacion,
    recargos,
    total: r2(subtotales.contribuciones + actualizacion.montoMXN + recargos.montoMXN),
    documentos: DOCUMENTOS_REQUERIDOS[tipo],
    advertencias,
    calculadoAt: new Date().toISOString(),
  };
}

export const folioDe = (id: string, fecha: Date): string =>
  `CR-${fecha.toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(-6).toUpperCase()}`;

export async function crearExpediente(args: { tenantId: string; userId: string; clienteId: string | null; ids: string[]; opts: OpcionesCalculo; notas?: string | null }) {
  const calculo = await calcularCambioRegimen(args.tenantId, args.ids, args.opts);
  const exp = await prisma.cambioRegimenExpediente.create({
    data: {
      tenantId: args.tenantId, userId: args.userId, clienteId: args.clienteId,
      tipo: args.opts.tipo, temporaryImportIds: calculo.partidas.map(p => p.temporaryImportId),
      calculo: calculo as unknown as object, estado: 'borrador', notas: args.notas ?? null,
    },
  });
  const folio = folioDe(exp.id, exp.createdAt);
  return prisma.cambioRegimenExpediente.update({ where: { id: exp.id }, data: { calculo: { ...calculo, folio } as unknown as object } });
}

/** Alcance por cliente listo para el where: id concreto o `{ in: [...] }` (usuario restringido a varios). */
export type FiltroClienteId = string | { in: string[] } | null | undefined;

/** Temporales con saldo del tenant (para seleccionar). `ids` prellena; el filtro
 *  de cliente aplica SIEMPRE — también con ids — para que un usuario restringido
 *  no cargue partidas de otro cliente pidiéndolas por id. */
export async function listarCandidatas(tenantId: string, f: { ids?: string[]; clienteId?: FiltroClienteId } = {}) {
  const ids = (f.ids ?? []).filter(Boolean);
  const rows = await prisma.temporaryImport.findMany({
    where: {
      tenantId,
      ...(f.clienteId ? { clienteId: f.clienteId } : {}),
      ...(ids.length > 0 ? { id: { in: ids } } : { status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED', 'EXPIRED'] } }),
    },
    orderBy: { expirationDate: 'asc' }, take: 200,
    select: { id: true, pedimento: true, fractionCode: true, description: true, quantity: true, quantityDischarged: true, unit: true, customsValue: true, expirationDate: true, status: true, tipo: true, clienteId: true },
  });
  return rows.map(r => ({ ...r, saldo: Math.max(0, r.quantity - r.quantityDischarged) }));
}

export async function listarExpedientes(tenantId: string, clienteId?: FiltroClienteId) {
  return prisma.cambioRegimenExpediente.findMany({ where: { tenantId, ...(clienteId ? { clienteId } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
}

export async function obtenerExpediente(tenantId: string, id: string) {
  return prisma.cambioRegimenExpediente.findFirst({ where: { id, tenantId } });
}

export const ESTADOS_EXPEDIENTE = ['borrador', 'listo', 'presentado'] as const;

export async function actualizarExpediente(tenantId: string, id: string, data: { estado?: string; notas?: string | null; actualizacionMXN?: number; recargosMXN?: number }) {
  const exp = await obtenerExpediente(tenantId, id);
  if (!exp) return null;
  if (data.estado && !(ESTADOS_EXPEDIENTE as readonly string[]).includes(data.estado)) throw new AppError('Estado inválido', 400);
  let calculo = exp.calculo as unknown as CalculoExpediente & { folio?: string };
  if (data.actualizacionMXN != null || data.recargosMXN != null) {
    const recalculado = await calcularCambioRegimen(tenantId, exp.temporaryImportIds, {
      tipo: exp.tipo as TipoCambio, tc: calculo.tc.valor, tcFuente: calculo.tc.fuente,
      actualizacionMXN: data.actualizacionMXN ?? calculo.actualizacion.montoMXN,
      recargosMXN: data.recargosMXN ?? calculo.recargos.montoMXN,
    });
    calculo = { ...recalculado, folio: calculo.folio };
  }
  return prisma.cambioRegimenExpediente.update({
    where: { id },
    data: { ...(data.estado ? { estado: data.estado } : {}), ...(data.notas !== undefined ? { notas: data.notas } : {}), calculo: calculo as unknown as object },
  });
}
