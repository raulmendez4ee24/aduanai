/**
 * Historial de clasificaciones → catálogo (Ola 1, Operación 2026-08).
 * Filtros compartidos por listado/agrupado/export, agrupación por producto
 * (misma descripción normalizada) y "acierto del modelo por capítulo"
 * calculado SOLO del feedback real del usuario — sin feedback no hay métrica.
 */
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { normalizarDescripcion, formatearFraccion } from './catalogo-partes';

export interface FiltrosHistorial {
  search?: string;
  clienteId?: string | null;
  fractionCode?: string;
  capitulo?: string;
  desde?: string;
  hasta?: string;
  confianzaMin?: number;
  confianzaMax?: number;
  feedback?: 'correct' | 'incorrect' | 'partial' | 'sin';
  status?: string;
  /** Ids concretos (el Historial agrupado pide las clasificaciones de un grupo). */
  ids?: string[];
}

export function whereHistorial(tenantId: string, f: FiltrosHistorial): Prisma.ClassificationWhereInput {
  const where: Prisma.ClassificationWhereInput = { tenantId };
  if (f.search) {
    where.OR = [
      { inputDescription: { contains: f.search, mode: 'insensitive' } },
      { fractionCode: { contains: f.search.replace(/[.\-\s]/g, '') } },
    ];
  }
  if (f.clienteId) where.clienteId = f.clienteId;
  const frac = (f.fractionCode ?? '').replace(/[.\-\s]/g, '');
  if (frac) where.fractionCode = { startsWith: frac };
  else if (f.capitulo && /^\d{2}$/.test(f.capitulo)) where.fractionCode = { startsWith: f.capitulo };
  const desde = f.desde ? new Date(f.desde) : null;
  const hasta = f.hasta ? new Date(f.hasta) : null;
  if ((desde && !Number.isNaN(desde.getTime())) || (hasta && !Number.isNaN(hasta.getTime()))) {
    where.createdAt = {};
    if (desde && !Number.isNaN(desde.getTime())) where.createdAt.gte = desde;
    if (hasta && !Number.isNaN(hasta.getTime())) { const h = new Date(hasta); h.setHours(23, 59, 59, 999); where.createdAt.lte = h; }
  }
  if (f.confianzaMin !== undefined || f.confianzaMax !== undefined) {
    where.confidence = {};
    if (f.confianzaMin !== undefined && Number.isFinite(f.confianzaMin)) where.confidence.gte = f.confianzaMin;
    if (f.confianzaMax !== undefined && Number.isFinite(f.confianzaMax)) where.confidence.lte = f.confianzaMax;
  }
  if (f.feedback === 'sin') where.feedback = null;
  else if (f.feedback) where.feedback = f.feedback;
  if (f.status) where.status = f.status;
  if (f.ids && f.ids.length > 0) where.id = { in: f.ids.slice(0, 500) };
  return where;
}

export interface GrupoHistorial {
  clave: string;
  descripcion: string;
  conteo: number;
  fracciones: { fractionCode: string; conteo: number }[];
  fraccionDominante: string;
  consistente: boolean;
  confianzaPromedio: number;
  feedback: { correct: number; incorrect: number; partial: number; sin: number };
  ultimaFecha: Date;
  ids: string[];
  /** Última clasificación con feedback ✓ (la que se puede promover), si hay. */
  promovibleId: string | null;
  enCatalogo: { productId: string; productCode: string; fractionCode: string | null; versionVigente: number } | null;
  clienteId: string | null;
}

const MAX_FILAS_AGRUPACION = 5000;

export async function agruparHistorial(tenantId: string, f: FiltrosHistorial, page = 1, limit = 20) {
  const rows = await prisma.classification.findMany({
    where: whereHistorial(tenantId, f),
    orderBy: { createdAt: 'desc' },
    take: MAX_FILAS_AGRUPACION,
    select: { id: true, inputDescription: true, fractionCode: true, confidence: true, feedback: true, createdAt: true, clienteId: true },
  });
  const grupos = new Map<string, GrupoHistorial & { _frac: Map<string, number>; _conf: number }>();
  for (const r of rows) {
    const clave = normalizarDescripcion(r.inputDescription) || r.id;
    let g = grupos.get(clave);
    if (!g) {
      g = {
        clave, descripcion: r.inputDescription.trim(), conteo: 0, fracciones: [], fraccionDominante: '', consistente: true,
        confianzaPromedio: 0, feedback: { correct: 0, incorrect: 0, partial: 0, sin: 0 }, ultimaFecha: r.createdAt,
        ids: [], promovibleId: null, enCatalogo: null, clienteId: r.clienteId, _frac: new Map(), _conf: 0,
      };
      grupos.set(clave, g);
    }
    g.conteo++;
    g.ids.push(r.id);
    g._conf += r.confidence;
    const fc = r.fractionCode.replace(/[.\-\s]/g, '');
    g._frac.set(fc, (g._frac.get(fc) ?? 0) + 1);
    if (r.feedback === 'correct' || r.feedback === 'incorrect' || r.feedback === 'partial') g.feedback[r.feedback]++; else g.feedback.sin++;
    if (r.feedback === 'correct' && !g.promovibleId) g.promovibleId = r.id;
    if (r.createdAt > g.ultimaFecha) g.ultimaFecha = r.createdAt;
  }
  const lista = Array.from(grupos.values()).map(g => {
    const fracciones = Array.from(g._frac.entries()).map(([fractionCode, conteo]) => ({ fractionCode, conteo })).sort((a, b) => b.conteo - a.conteo);
    const { _frac, _conf, ...resto } = g;
    void _frac;
    return { ...resto, fracciones, fraccionDominante: fracciones[0]?.fractionCode ?? '', consistente: fracciones.length <= 1, confianzaPromedio: Math.round(_conf / g.conteo) };
  }).sort((a, b) => b.ultimaFecha.getTime() - a.ultimaFecha.getTime());

  const total = lista.length;
  const pagina = lista.slice((page - 1) * limit, page * limit);

  // Cruce con el catálogo: misma descripción normalizada dentro del tenant.
  if (pagina.length > 0) {
    // Palabras ancla (hasta 6 por grupo, forma normalizada): Postgres `contains`
    // es sensible a acentos, así que con varias palabras basta que UNA coincida
    // tal cual; la igualdad real se decide en JS con la descripción normalizada.
    const palabras = Array.from(new Set(pagina.flatMap(g => g.clave.split(' ').filter(w => w.length >= 4).slice(0, 6))));
    const candidatas = palabras.length === 0 ? [] : await prisma.product.findMany({
      where: { tenantId, active: true, OR: palabras.map(w => ({ description: { contains: w, mode: 'insensitive' as const } })) },
      select: { id: true, productCode: true, description: true, fractionCode: true, versionVigente: true },
      take: 2000,
    });
    const porClave = new Map(candidatas.map(c => [normalizarDescripcion(c.description), c]));
    for (const g of pagina) {
      const c = porClave.get(g.clave);
      if (c) g.enCatalogo = { productId: c.id, productCode: c.productCode, fractionCode: c.fractionCode, versionVigente: c.versionVigente };
    }
  }
  return { data: pagina, pagination: { page, limit, total, filasConsideradas: rows.length, truncado: rows.length >= MAX_FILAS_AGRUPACION } };
}

export async function exportarHistorialXlsx(tenantId: string, f: FiltrosHistorial): Promise<Buffer> {
  const rows = await prisma.classification.findMany({
    where: whereHistorial(tenantId, f), orderBy: { createdAt: 'desc' }, take: 20000,
    select: { id: true, inputDescription: true, fractionCode: true, fractionDescription: true, confidence: true, feedback: true, feedbackNote: true, status: true, createdAt: true, clienteId: true, tigieVersion: true, consultHash: true, inputCountryOfOrigin: true },
  });
  const clientes = await prisma.cliente.findMany({ where: { tenantId }, select: { id: true, razonSocial: true, rfc: true } });
  const cm = new Map(clientes.map(c => [c.id, `${c.razonSocial} (${c.rfc})`]));
  const filas = rows.map(r => ({
    fecha: r.createdAt.toISOString().slice(0, 19).replace('T', ' '),
    descripcion: r.inputDescription,
    fraccion: formatearFraccion(r.fractionCode),
    descripcionFraccion: r.fractionDescription ?? '',
    confianza: Math.round(r.confidence),
    feedback: r.feedback ?? '',
    notaFeedback: r.feedbackNote ?? '',
    estado: r.status,
    cliente: r.clienteId ? cm.get(r.clienteId) ?? r.clienteId : '',
    paisOrigen: r.inputCountryOfOrigin ?? '',
    tigie: r.tigieVersion ?? '',
    hashConsulta: r.consultHash ?? '',
    id: r.id,
  }));
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Historial');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export interface AciertoCapitulo {
  capitulo: string;
  conFeedback: number;
  correct: number;
  incorrect: number;
  partial: number;
  /** correct / conFeedback, en %; null si no hay feedback. */
  acierto: number | null;
  total: number;
}

/** Acierto del modelo por capítulo, calculado del feedback real (nunca de la confianza declarada). */
export async function aciertoPorCapitulo(tenantId: string, f: FiltrosHistorial = {}): Promise<{ capitulos: AciertoCapitulo[]; totales: AciertoCapitulo }> {
  const rows = await prisma.classification.groupBy({
    by: ['fractionCode', 'feedback'],
    where: whereHistorial(tenantId, { ...f, feedback: undefined }),
    _count: { _all: true },
  });
  const map = new Map<string, AciertoCapitulo>();
  const tot: AciertoCapitulo = { capitulo: 'TOTAL', conFeedback: 0, correct: 0, incorrect: 0, partial: 0, acierto: null, total: 0 };
  for (const r of rows) {
    const cap = r.fractionCode.replace(/[.\-\s]/g, '').slice(0, 2) || '??';
    let c = map.get(cap);
    if (!c) { c = { capitulo: cap, conFeedback: 0, correct: 0, incorrect: 0, partial: 0, acierto: null, total: 0 }; map.set(cap, c); }
    const n = r._count._all;
    c.total += n; tot.total += n;
    if (r.feedback === 'correct' || r.feedback === 'incorrect' || r.feedback === 'partial') {
      c[r.feedback] += n; c.conFeedback += n;
      tot[r.feedback] += n; tot.conFeedback += n;
    }
  }
  const cerrar = (c: AciertoCapitulo) => { c.acierto = c.conFeedback > 0 ? Math.round((c.correct / c.conFeedback) * 1000) / 10 : null; return c; };
  const capitulos = Array.from(map.values()).map(cerrar).sort((a, b) => b.total - a.total);
  return { capitulos, totales: cerrar(tot) };
}
