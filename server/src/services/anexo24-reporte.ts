/**
 * Reporte Anexo 24 en formato de autoridad (Ola 1 · anexo24-real).
 *
 * Secciones: entradas por pedimento-partida, salidas/descargos con pedimento
 * de retorno y constancia, saldos por parte al corte, activo fijo, mermas y
 * desperdicios, submaquila. JSON para la UI/impresión y .xlsx (una hoja por
 * sección) para entregar.
 *
 * HONESTIDAD: el corpus solo tiene un RESUMEN del Anexo 24 RGCE 2026
 * (LegalDocument "Anexo 24 RGCE 2026": "registro electrónico de entradas,
 * salidas, saldos y conciliación"), no el texto íntegro con los apartados y
 * campos mínimos. La estructura de este reporte sigue ese resumen y el
 * conocimiento común del anexo; se etiqueta "estructura pendiente de cotejo
 * contra Anexo 24 vigente" en JSON, en la hoja y en la UI.
 */
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { rangoDePeriodo, calcularSaldosAlCorte, periodoValido, type ResumenCierre } from './anexo24-cierre';
import { mermasEnRango } from './anexo24-bom';
import { esVigenciaPrograma } from '../lib/plazos-immex';
import { AppError } from '../middlewares/error';
import { whereAlcance, type AlcanceCliente } from '../lib/cliente-contexto';

export const ETIQUETA_COTEJO_ANEXO24 =
  'Estructura pendiente de cotejo contra Anexo 24 RGCE vigente (el corpus del sistema solo contiene un resumen del anexo).';

export interface ReporteAnexo24 {
  folio: string;
  periodo: string;
  rango: { inicio: string; fin: string };
  generadoEn: string;
  clienteId: string | null;
  cotejo: { estado: 'pendiente'; etiqueta: string; fuenteRepo: string };
  cierre: { periodo: string; hash: string | null; cerradoAt: string } | null;
  entradas: Array<{
    temporaryImportId: string; pedimento: string; pedimentoPartidaId: string | null; numeroPartida: number | null; clave: string | null; tipo: string;
    fractionCode: string; parteCodigo: string | null; descripcion: string; cantidad: number; unit: string; valorUSD: number; valorMXN: number | null;
    paisOrigen: string | null; fechaEntrada: string; vencimiento: string | null; plazoMeses: number | null; ubicacion: string | null;
  }>;
  salidas: Array<{
    dischargeId: string; fecha: string; tipo: string; pedimentoRetorno: string | null; constanciaTransferencia: string | null;
    pedimentoOrigen: string; fractionCode: string; parteCodigo: string | null; cantidad: number; unit: string; valorUSD: number | null; assemblyId: string | null;
  }>;
  saldos: ResumenCierre['porParte'];
  saldosPorPedimento: ResumenCierre['porPedimento'];
  activoFijo: Array<{
    temporaryImportId: string; pedimento: string; fractionCode: string; parteCodigo: string | null; descripcion: string; cantidad: number; unit: string;
    valorUSD: number; fechaEntrada: string; vidaUtilMeses: number | null; ubicacion: string | null; status: string;
  }>;
  mermas: Awaited<ReturnType<typeof mermasEnRango>>;
  desperdicios: Array<{ dischargeId: string; fecha: string; tipo: string; pedimentoOrigen: string; fractionCode: string; cantidad: number; unit: string; notas: string | null }>;
  submaquila: Array<{
    ubicacionId: string; nombre: string; rfcTercero: string | null; domicilio: string | null; avisoSubmaquila: string | null;
    lotes: Array<{ temporaryImportId: string; pedimento: string; fractionCode: string; parteCodigo: string | null; saldo: number; unit: string }>;
  }>;
  totales: { entradas: number; salidas: number; partesConSaldo: number; saldoTotal: number; activoFijo: number; mermaTotal: number; submaquilaLotes: number };
  hash: string;
}

function folioReporte(tenantId: string, periodo: string, generadoEn: Date): string {
  const h = crypto.createHash('sha256').update(`${tenantId}|${periodo}|${generadoEn.toISOString()}`).digest('hex').slice(0, 8).toUpperCase();
  return `A24-${periodo}-${h}`;
}

/** `alcance`: `filtroCliente(req)` — `{}` todo el tenant; `{ clienteId }` / `{ clienteId: { in } }` solo esos clientes más filas compartidas. */
export async function generarReporteAnexo24(tenantId: string, periodo: string, alcance: AlcanceCliente | null): Promise<ReporteAnexo24> {
  if (!periodoValido(periodo)) throw new AppError(`Periodo inválido "${periodo}"; formato YYYY-MM`, 400);
  const { inicio, fin } = rangoDePeriodo(periodo);
  const generadoEn = new Date();
  const clienteId = typeof alcance?.clienteId === 'string' ? alcance.clienteId : null;
  const filtroCliente = whereAlcance(alcance);

  const [entradasRaw, salidasRaw, saldosCorte, afRaw, mermas, ubicaciones, cierre] = await Promise.all([
    prisma.temporaryImport.findMany({
      where: { tenantId, entryDate: { gte: inicio, lte: fin }, ...filtroCliente },
      include: { product: { select: { productCode: true } }, ubicacion: { select: { nombre: true } } },
      orderBy: [{ entryDate: 'asc' }, { pedimento: 'asc' }],
    }),
    prisma.discharge.findMany({
      where: { tenantId, dischargeDate: { gte: inicio, lte: fin }, ...filtroCliente },
      include: { temporaryImport: { select: { pedimento: true, fractionCode: true, product: { select: { productCode: true } } } } },
      orderBy: [{ dischargeDate: 'asc' }, { id: 'asc' }],
    }),
    calcularSaldosAlCorte(prisma, tenantId, periodo, alcance),
    prisma.temporaryImport.findMany({
      where: { tenantId, tipo: 'ACTIVO_FIJO', entryDate: { lte: fin }, ...filtroCliente },
      include: { product: { select: { productCode: true } }, ubicacion: { select: { nombre: true } } },
      orderBy: [{ entryDate: 'asc' }],
    }),
    mermasEnRango(tenantId, inicio, fin, alcance),
    prisma.ubicacion.findMany({
      where: { tenantId, tipo: 'SUBMAQUILA', ...filtroCliente },
      include: {
        temporaryImports: {
          where: { status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] }, ...filtroCliente },
          select: { id: true, pedimento: true, fractionCode: true, quantity: true, quantityDischarged: true, unit: true, product: { select: { productCode: true } } },
        },
      },
      orderBy: { nombre: 'asc' },
    }),
    prisma.cierrePeriodo.findFirst({ where: { tenantId, periodo }, select: { periodo: true, hash: true, cerradoAt: true } }),
  ]);

  const partidaIds = entradasRaw.map(e => e.pedimentoPartidaId).filter((x): x is string => !!x);
  const partidas = partidaIds.length > 0
    ? await prisma.pedimentoPartida.findMany({ where: { id: { in: partidaIds }, pedimento: { tenantId } }, select: { id: true, numeroPartida: true } })
    : [];
  const numeroPartida = new Map(partidas.map(p => [p.id, p.numeroPartida]));

  const entradas: ReporteAnexo24['entradas'] = entradasRaw.map(e => ({
    temporaryImportId: e.id,
    pedimento: e.pedimento,
    pedimentoPartidaId: e.pedimentoPartidaId,
    numeroPartida: e.pedimentoPartidaId ? (numeroPartida.get(e.pedimentoPartidaId) ?? null) : null,
    clave: e.claveDocumento,
    tipo: e.tipo,
    fractionCode: e.fractionCode,
    parteCodigo: e.product?.productCode ?? null,
    descripcion: e.description,
    cantidad: e.quantity,
    unit: e.unit,
    valorUSD: e.customsValue,
    valorMXN: e.valueMXN,
    paisOrigen: e.originCountry,
    fechaEntrada: e.entryDate.toISOString().slice(0, 10),
    vencimiento: esVigenciaPrograma(e) ? null : e.expirationDate.toISOString().slice(0, 10),
    plazoMeses: esVigenciaPrograma(e) ? null : e.expirationMonths,
    ubicacion: e.ubicacion?.nombre ?? null,
  }));

  const TIPOS_DESPERDICIO = new Set(['WASTE', 'SCRAP', 'DESTRUCTION']);
  const salidas: ReporteAnexo24['salidas'] = salidasRaw.filter(d => !TIPOS_DESPERDICIO.has(d.type)).map(d => ({
    dischargeId: d.id,
    fecha: d.dischargeDate.toISOString().slice(0, 10),
    tipo: d.type,
    pedimentoRetorno: d.pedimento,
    constanciaTransferencia: d.constanciaTransferencia,
    pedimentoOrigen: d.temporaryImport.pedimento,
    fractionCode: d.temporaryImport.fractionCode,
    parteCodigo: d.temporaryImport.product?.productCode ?? null,
    cantidad: d.quantity,
    unit: d.unit,
    valorUSD: d.customsValue,
    assemblyId: d.assemblyId,
  }));
  const desperdicios: ReporteAnexo24['desperdicios'] = salidasRaw.filter(d => TIPOS_DESPERDICIO.has(d.type)).map(d => ({
    dischargeId: d.id,
    fecha: d.dischargeDate.toISOString().slice(0, 10),
    tipo: d.type,
    pedimentoOrigen: d.temporaryImport.pedimento,
    fractionCode: d.temporaryImport.fractionCode,
    cantidad: d.quantity,
    unit: d.unit,
    notas: d.notes,
  }));

  const activoFijo: ReporteAnexo24['activoFijo'] = afRaw.map(a => ({
    temporaryImportId: a.id,
    pedimento: a.pedimento,
    fractionCode: a.fractionCode,
    parteCodigo: a.product?.productCode ?? null,
    descripcion: a.description,
    cantidad: a.quantity,
    unit: a.unit,
    valorUSD: a.customsValue,
    fechaEntrada: a.entryDate.toISOString().slice(0, 10),
    vidaUtilMeses: a.vidaUtilMeses,
    ubicacion: a.ubicacion?.nombre ?? null,
    status: a.status,
  }));

  const submaquila: ReporteAnexo24['submaquila'] = ubicaciones.map(u => ({
    ubicacionId: u.id,
    nombre: u.nombre,
    rfcTercero: u.rfcTercero,
    domicilio: u.domicilio,
    avisoSubmaquila: u.avisoSubmaquila,
    lotes: u.temporaryImports.map(t => ({
      temporaryImportId: t.id, pedimento: t.pedimento, fractionCode: t.fractionCode, parteCodigo: t.product?.productCode ?? null,
      saldo: t.quantity - t.quantityDischarged, unit: t.unit,
    })),
  }));

  const saldos = saldosCorte.porParte.filter(p => p.saldo > 1e-9);
  const cuerpo = {
    entradas, salidas, saldos, saldosPorPedimento: saldosCorte.porPedimento, activoFijo, mermas, desperdicios, submaquila,
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify({ periodo, ...cuerpo })).digest('hex');

  return {
    folio: folioReporte(tenantId, periodo, generadoEn),
    periodo,
    rango: { inicio: inicio.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) },
    generadoEn: generadoEn.toISOString(),
    clienteId,
    cotejo: { estado: 'pendiente', etiqueta: ETIQUETA_COTEJO_ANEXO24, fuenteRepo: 'LegalDocument "Anexo 24 RGCE 2026" (resumen)' },
    cierre: cierre ? { periodo: cierre.periodo, hash: cierre.hash, cerradoAt: cierre.cerradoAt.toISOString() } : null,
    ...cuerpo,
    totales: {
      entradas: entradas.length,
      salidas: salidas.length,
      partesConSaldo: saldos.length,
      saldoTotal: Math.round(saldos.reduce((s, p) => s + p.saldo, 0) * 1e6) / 1e6,
      activoFijo: activoFijo.length,
      mermaTotal: Math.round(mermas.reduce((s, m) => s + m.merma, 0) * 1e6) / 1e6,
      submaquilaLotes: submaquila.reduce((s, u) => s + u.lotes.length, 0),
    },
    hash,
  };
}

/** Nombres de hoja del .xlsx (Excel limita a 31 caracteres). */
export const HOJAS_ANEXO24 = ['Portada', 'Entradas', 'Salidas', 'Saldos por parte', 'Saldos por pedimento', 'Activo fijo', 'Mermas y desperdicios', 'Submaquila'] as const;

export function reporteAnexo24Xlsx(r: ReporteAnexo24): Buffer {
  const wb = XLSX.utils.book_new();
  const portada = [
    ['Reporte Anexo 24 — Sistema de control de inventarios IMMEX'],
    ['Folio', r.folio],
    ['Periodo', r.periodo],
    ['Rango', `${r.rango.inicio} a ${r.rango.fin}`],
    ['Generado', r.generadoEn],
    ['Cierre del periodo', r.cierre ? `Cerrado ${r.cierre.cerradoAt} · hash ${r.cierre.hash ?? ''}` : 'Periodo abierto (sin cierre mensual)'],
    ['Hash del contenido', r.hash],
    ['COTEJO', r.cotejo.etiqueta],
    ['Fuente en el repo', r.cotejo.fuenteRepo],
    [],
    ['Totales'],
    ['Entradas', r.totales.entradas],
    ['Salidas', r.totales.salidas],
    ['Partes con saldo', r.totales.partesConSaldo],
    ['Saldo total', r.totales.saldoTotal],
    ['Activo fijo (lotes)', r.totales.activoFijo],
    ['Merma total', r.totales.mermaTotal],
    ['Lotes en submaquila', r.totales.submaquilaLotes],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(portada), HOJAS_ANEXO24[0]);

  const hoja = <T extends object>(nombre: string, filas: T[], vacio: string) => {
    const ws = filas.length > 0 ? XLSX.utils.json_to_sheet(filas) : XLSX.utils.aoa_to_sheet([[vacio]]);
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  };
  hoja(HOJAS_ANEXO24[1], r.entradas.map(e => ({
    Pedimento: e.pedimento, Partida: e.numeroPartida ?? '', Clave: e.clave ?? '', Tipo: e.tipo, Fraccion: e.fractionCode, Parte: e.parteCodigo ?? '',
    Descripcion: e.descripcion, Cantidad: e.cantidad, Unidad: e.unit, ValorUSD: e.valorUSD, ValorMXN: e.valorMXN ?? '', PaisOrigen: e.paisOrigen ?? '',
    FechaEntrada: e.fechaEntrada, Vencimiento: e.vencimiento ?? 'vigencia del programa', PlazoMeses: e.plazoMeses ?? '', Ubicacion: e.ubicacion ?? '',
  })), 'Sin entradas en el periodo');
  hoja(HOJAS_ANEXO24[2], r.salidas.map(s => ({
    Fecha: s.fecha, Tipo: s.tipo, PedimentoRetorno: s.pedimentoRetorno ?? '', Constancia: s.constanciaTransferencia ?? '', PedimentoOrigen: s.pedimentoOrigen,
    Fraccion: s.fractionCode, Parte: s.parteCodigo ?? '', Cantidad: s.cantidad, Unidad: s.unit, ValorUSD: s.valorUSD ?? '', Ensamble: s.assemblyId ?? '',
  })), 'Sin salidas en el periodo');
  hoja(HOJAS_ANEXO24[3], r.saldos.map(p => ({
    Parte: p.parteCodigo ?? '', Fraccion: p.fractionCode, Descripcion: p.descripcion, Tipo: p.tipo, Unidad: p.unit,
    Importado: p.importado, Descargado: p.descargado, Saldo: p.saldo, Lotes: p.lotes,
  })), 'Sin saldos al corte');
  hoja(HOJAS_ANEXO24[4], r.saldosPorPedimento.map(p => ({
    Pedimento: p.pedimento, PedimentoPartidaId: p.pedimentoPartidaId ?? '', Fraccion: p.fractionCode, Parte: p.parteCodigo ?? '', Tipo: p.tipo, Unidad: p.unit,
    FechaEntrada: p.entryDate, Vencimiento: p.expirationDate ?? 'vigencia del programa', Importado: p.importado, Descargado: p.descargado, Saldo: p.saldo,
  })), 'Sin pedimentos al corte');
  hoja(HOJAS_ANEXO24[5], r.activoFijo.map(a => ({
    Pedimento: a.pedimento, Fraccion: a.fractionCode, Parte: a.parteCodigo ?? '', Descripcion: a.descripcion, Cantidad: a.cantidad, Unidad: a.unit,
    ValorUSD: a.valorUSD, FechaEntrada: a.fechaEntrada, VidaUtilMeses: a.vidaUtilMeses ?? '', Ubicacion: a.ubicacion ?? '', Estado: a.status,
  })), 'Sin activo fijo');
  const mermasFilas = [
    ...r.mermas.map(m => ({
      Origen: 'Merma BOM', Fecha: m.fecha, ProductoTerminado: m.productoTerminado, CantidadTerminado: m.cantidadTerminado, Componente: m.componentCode,
      Fraccion: m.fractionCode ?? '', Unidad: m.unit, Neto: m.quantityRequired, ConMerma: m.quantityWithScrap, Merma: m.merma, Referencia: m.referencia ?? '',
    })),
    ...r.desperdicios.map(d => ({
      Origen: `Descargo ${d.tipo}`, Fecha: d.fecha, ProductoTerminado: '', CantidadTerminado: '', Componente: d.pedimentoOrigen,
      Fraccion: d.fractionCode, Unidad: d.unit, Neto: '', ConMerma: '', Merma: d.cantidad, Referencia: d.notas ?? '',
    })),
  ];
  hoja(HOJAS_ANEXO24[6], mermasFilas, 'Sin mermas ni desperdicios en el periodo');
  hoja(HOJAS_ANEXO24[7], r.submaquila.flatMap(u => u.lotes.length > 0
    ? u.lotes.map(l => ({ Submaquila: u.nombre, RFC: u.rfcTercero ?? '', Aviso: u.avisoSubmaquila ?? 'SIN AVISO', Pedimento: l.pedimento, Fraccion: l.fractionCode, Parte: l.parteCodigo ?? '', Saldo: l.saldo, Unidad: l.unit }))
    : [{ Submaquila: u.nombre, RFC: u.rfcTercero ?? '', Aviso: u.avisoSubmaquila ?? 'SIN AVISO', Pedimento: '', Fraccion: '', Parte: '', Saldo: 0, Unidad: '' }]),
  'Sin submaquila registrada');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
