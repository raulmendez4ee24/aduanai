/**
 * CALENDARIO DE OBLIGACIONES (Operación 2026-08 — módulo nuevo).
 *
 * Tabla `ObligacionCalendario` (Fase 0). Este servicio es el DUEÑO del
 * módulo: CRUD, catálogo base sembrable por tenant/cliente, regeneración de
 * recurrentes al cumplirse, y el job diario que marca vencidas y crea la
 * `Alert` con acción `ver_obligacion`.
 *
 * REGLA DE LA CASA — nada de datos legales inventados: cada obligación del
 * catálogo base declara `cotejo`: 'ok' cuando el fundamento está en el
 * corpus/docs del producto, 'pendiente' cuando la fecha/fundamento se conoce
 * por práctica profesional pero NO está respaldado por fuente oficial en el
 * corpus (el corpus local NO contiene el Decreto IMMEX ni el CFF — cotejado
 * 27-ago-2026 contra `LegalDocument.source`). La UI lo muestra.
 *
 * Idempotencia con el módulo Fiscal (que crea obligaciones de certificación
 * IVA/IEPS): clave natural tenant + clienteId + tipo + fechaLimite (día).
 */

import { prisma } from '../lib/prisma';
import { enLotes } from '../lib/lotes';
import { logger } from '../lib/logger';
import { accionVerObligacion } from './alert-acciones';
import { severidadPorImpacto } from './alert-severity';

export const TIPOS_OBLIGACION = ['REPORTE_ANUAL_SE', 'AVISO_IMMEX', 'PADRON', 'OPINION_32D', 'CERT_IVA_IEPS', 'ANEXO_24', 'ANEXO_30', 'OTRA'] as const;
export type TipoObligacion = (typeof TIPOS_OBLIGACION)[number];
export const RECURRENCIAS = ['ANUAL', 'MENSUAL', 'UNICA'] as const;
export type Recurrencia = (typeof RECURRENCIAS)[number];
export const ESTADOS = ['pendiente', 'en_curso', 'cumplida', 'vencida'] as const;
export type EstadoObligacion = (typeof ESTADOS)[number];

export interface ObligacionBase {
  tipo: TipoObligacion;
  titulo: string;
  descripcion: string;
  fundamento: string;
  /** 'ok' = fundamento en corpus/docs; 'pendiente' = pendiente de fuente oficial. */
  cotejo: 'ok' | 'pendiente';
  recurrencia: Recurrencia;
  consecuencia: string;
  /** Calcula la próxima fecha límite a partir de `desde`. */
  proximaFecha: (desde: Date) => Date;
  /** Si requiere programa IMMEX / certificación (para no sembrar donde no aplica). */
  requiere?: 'IMMEX' | 'CERT_IVA_IEPS';
}

// ── Utilidades de fecha (UTC para que el día no se corra por zona horaria) ──

export const diaUTC = (y: number, m0: number, d: number): Date => new Date(Date.UTC(y, m0, d, 12, 0, 0));

/** Último día hábil (lun-vie) de un mes; no descuenta festivos (se documenta). */
export function ultimoDiaHabilDelMes(y: number, m0: number): Date {
  let d = new Date(Date.UTC(y, m0 + 1, 0, 12));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() - 86400000);
  return d;
}

export function siguienteAnual(desde: Date, mes0: number, calc: (y: number) => Date): Date {
  const y = desde.getUTCFullYear();
  const esteAnio = calc(y);
  return esteAnio > desde ? esteAnio : calc(y + 1);
}

export function siguienteMensual(desde: Date, dia: number): Date {
  const y = desde.getUTCFullYear();
  const m = desde.getUTCMonth();
  const esteMes = diaUTC(y, m, dia);
  return esteMes > desde ? esteMes : diaUTC(y, m + 1, dia);
}

export function siguienteFechaRecurrente(fechaLimite: Date, recurrencia: string | null): Date | null {
  if (recurrencia === 'ANUAL') return new Date(Date.UTC(fechaLimite.getUTCFullYear() + 1, fechaLimite.getUTCMonth(), fechaLimite.getUTCDate(), 12));
  if (recurrencia === 'MENSUAL') return new Date(Date.UTC(fechaLimite.getUTCFullYear(), fechaLimite.getUTCMonth() + 1, fechaLimite.getUTCDate(), 12));
  return null;
}

// ── Catálogo base ─────────────────────────────────────────────────────────

export const CATALOGO_BASE: ObligacionBase[] = [
  {
    tipo: 'REPORTE_ANUAL_SE',
    titulo: 'Reporte Anual de Operaciones de Comercio Exterior (SE)',
    descripcion: 'Reporte anual del programa IMMEX ante la Secretaría de Economía sobre ventas totales y exportaciones del ejercicio anterior.',
    fundamento: 'Decreto IMMEX art. 25 (fecha: último día hábil de mayo)',
    cotejo: 'pendiente', // el Decreto IMMEX no está en el corpus local — pendiente de fuente oficial
    recurrencia: 'ANUAL',
    consecuencia: 'Suspensión del programa IMMEX si no se presenta (y cancelación si no se subsana).',
    proximaFecha: desde => siguienteAnual(desde, 4, y => ultimoDiaHabilDelMes(y, 4)),
    requiere: 'IMMEX',
  },
  {
    tipo: 'AVISO_IMMEX',
    titulo: 'Avisos IMMEX: cambios de domicilio, socios y submaquila',
    descripcion: 'Revisión periódica de que todo cambio de domicilio fiscal/planta, socios o accionistas y operaciones de submaquila se avisó a la SE en plazo.',
    fundamento: 'Decreto IMMEX (avisos ante la SE) — no está en el corpus local. Fecha de control interno (día 15), editable.',
    cotejo: 'pendiente',
    recurrencia: 'MENSUAL',
    consecuencia: 'Suspensión del programa; mercancía en domicilios no registrados se considera fuera del régimen.',
    proximaFecha: desde => siguienteMensual(desde, 15),
    requiere: 'IMMEX',
  },
  {
    tipo: 'PADRON',
    titulo: 'Renovación / revisión de padrones (importadores y sectoriales)',
    descripcion: 'Verificar vigencia del Padrón de Importadores y de los padrones sectoriales (Anexo 10 RGCE) y regularizar causales de suspensión.',
    fundamento: 'Regla 1.3.2 RGCE 2026 (Padrón de Importadores); Reglas 1.3.2 a 1.3.7 y Anexo 10 RGCE 2026 (sectoriales). Fecha de control interno (31-ene), editable.',
    cotejo: 'ok',
    recurrencia: 'ANUAL',
    consecuencia: 'Sin padrón vigente no se puede importar; la suspensión del padrón detiene la operación.',
    proximaFecha: desde => siguienteAnual(desde, 0, y => diaUTC(y, 0, 31)),
  },
  {
    tipo: 'OPINION_32D',
    titulo: 'Opinión de cumplimiento (32-D CFF) positiva',
    descripcion: 'Obtener y archivar la opinión de cumplimiento de obligaciones fiscales en sentido positivo (requisito de padrones, certificación y programas).',
    fundamento: 'Art. 32-D CFF (no está en el corpus local); Regla 1.3.2 RGCE 2026 exige opinión positiva para el padrón. Fecha de control interno (día 10), editable.',
    cotejo: 'pendiente', // el CFF no está en el corpus local
    recurrencia: 'MENSUAL',
    consecuencia: 'Opinión negativa = causal de suspensión del padrón y de la certificación IVA/IEPS.',
    proximaFecha: desde => siguienteMensual(desde, 10),
  },
  {
    tipo: 'CERT_IVA_IEPS',
    titulo: 'Certificación IVA/IEPS: aviso anual de renovación',
    descripcion: 'Presentar el aviso de renovación de la certificación en materia de IVA e IEPS (A/AA/AAA) dentro del plazo previo al vencimiento.',
    fundamento: 'Reglas 7.1.1 a 7.1.3 y 7.1.5 RGCE 2026 (certificación IVA/IEPS). Plazo exacto del aviso de renovación: pendiente de cotejo.',
    cotejo: 'pendiente',
    recurrencia: 'ANUAL',
    consecuencia: 'Pérdida del crédito fiscal IVA/IEPS: pago del impuesto en cada importación temporal.',
    proximaFecha: desde => siguienteAnual(desde, 0, y => diaUTC(y, 0, 31)),
    requiere: 'CERT_IVA_IEPS',
  },
  {
    tipo: 'ANEXO_24',
    titulo: 'Anexo 24: control de inventarios al día (cierre mensual)',
    descripcion: 'Cierre mensual del sistema de control de inventarios (descargos, saldos, reportes) conforme al Anexo 24.',
    fundamento: 'Anexo 24 RGCE 2026; Regla 4.3.1 RGCE 2026 (plazos de permanencia). Fecha de control interno (día 5), editable.',
    cotejo: 'ok',
    recurrencia: 'MENSUAL',
    consecuencia: 'Presunción de que la mercancía no retornó: crédito fiscal por contribuciones omitidas + multas.',
    proximaFecha: desde => siguienteMensual(desde, 5),
    requiere: 'IMMEX',
  },
  {
    tipo: 'ANEXO_30',
    titulo: 'Anexo 30: control del crédito fiscal IVA/IEPS (mensual)',
    descripcion: 'Conciliar el Sistema de Control de Cuentas de Créditos y Garantías (Anexo 30) contra las importaciones temporales del mes.',
    fundamento: 'Anexo 30 RGCE 2026; Reglas 7.1.1 a 7.1.3 RGCE 2026. Fecha de control interno (día 5), editable.',
    cotejo: 'ok',
    recurrencia: 'MENSUAL',
    consecuencia: 'Incumplir el Anexo 30 es causal de cancelación de la certificación IVA/IEPS.',
    proximaFecha: desde => siguienteMensual(desde, 5),
    requiere: 'CERT_IVA_IEPS',
  },
];

// ── CRUD ─────────────────────────────────────────────────────────────────

export interface EntradaObligacion {
  tipo: string;
  titulo: string;
  descripcion?: string | null;
  fundamento?: string | null;
  fechaLimite: string | Date;
  recurrencia?: string | null;
  responsableUserId?: string | null;
  consecuencia?: string | null;
  clienteId?: string | null;
  estado?: string;
}

export function validarEntrada(e: Partial<EntradaObligacion>): string | null {
  if (!e.tipo || !(TIPOS_OBLIGACION as readonly string[]).includes(e.tipo)) return `tipo inválido (${TIPOS_OBLIGACION.join('|')})`;
  if (!e.titulo || String(e.titulo).trim().length < 3) return 'titulo requerido';
  const f = e.fechaLimite ? new Date(e.fechaLimite) : null;
  if (!f || Number.isNaN(f.getTime())) return 'fechaLimite inválida';
  if (e.recurrencia && !(RECURRENCIAS as readonly string[]).includes(e.recurrencia)) return `recurrencia inválida (${RECURRENCIAS.join('|')})`;
  if (e.estado && !(ESTADOS as readonly string[]).includes(e.estado)) return `estado inválido (${ESTADOS.join('|')})`;
  return null;
}

const inicioDia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const finDia = (d: Date) => new Date(inicioDia(d).getTime() + 86400000 - 1);

/** Existe ya (tenant + cliente + tipo + día)? — clave natural de idempotencia. */
export async function existeObligacion(tenantId: string, clienteId: string | null, tipo: string, fechaLimite: Date): Promise<boolean> {
  const n = await prisma.obligacionCalendario.count({
    where: { tenantId, clienteId, tipo, fechaLimite: { gte: inicioDia(fechaLimite), lte: finDia(fechaLimite) } },
  });
  return n > 0;
}

export async function crearObligacion(tenantId: string, e: EntradaObligacion) {
  const err = validarEntrada(e);
  if (err) throw new Error(err);
  const fechaLimite = new Date(e.fechaLimite);
  return prisma.obligacionCalendario.create({
    data: {
      tenantId,
      clienteId: e.clienteId ?? null,
      tipo: e.tipo,
      titulo: e.titulo.trim(),
      descripcion: e.descripcion ?? null,
      fundamento: e.fundamento ?? null,
      fechaLimite,
      recurrencia: e.recurrencia ?? 'UNICA',
      responsableUserId: e.responsableUserId ?? null,
      consecuencia: e.consecuencia ?? null,
      estado: e.estado ?? 'pendiente',
    },
  });
}

export interface FiltroLista {
  clienteId?: string | null;
  estado?: string;
  desde?: Date;
  hasta?: Date;
}

export async function listarObligaciones(tenantId: string, f: FiltroLista = {}) {
  return prisma.obligacionCalendario.findMany({
    where: {
      tenantId,
      ...(f.clienteId ? { clienteId: f.clienteId } : {}),
      ...(f.estado ? { estado: f.estado } : {}),
      ...(f.desde || f.hasta ? { fechaLimite: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lte: f.hasta } : {}) } } : {}),
    },
    orderBy: [{ fechaLimite: 'asc' }],
  });
}

/** Semáforo: rojo ≤7 días (o vencida), ámbar ≤30, verde >30, gris cumplida. */
export function semaforo(fechaLimite: Date, estado: string, ahora = new Date()): 'rojo' | 'ambar' | 'verde' | 'gris' {
  if (estado === 'cumplida') return 'gris';
  const dias = Math.ceil((fechaLimite.getTime() - ahora.getTime()) / 86400000);
  if (estado === 'vencida' || dias <= 7) return 'rojo';
  if (dias <= 30) return 'ambar';
  return 'verde';
}

export async function actualizarObligacion(tenantId: string, id: string, cambios: Partial<EntradaObligacion>) {
  const actual = await prisma.obligacionCalendario.findFirst({ where: { id, tenantId } });
  if (!actual) return null;
  const merged = { ...actual, ...cambios, fechaLimite: cambios.fechaLimite ?? actual.fechaLimite } as EntradaObligacion;
  const err = validarEntrada(merged);
  if (err) throw new Error(err);
  return prisma.obligacionCalendario.update({
    where: { id },
    data: {
      ...(cambios.tipo !== undefined ? { tipo: cambios.tipo } : {}),
      ...(cambios.titulo !== undefined ? { titulo: cambios.titulo.trim() } : {}),
      ...(cambios.descripcion !== undefined ? { descripcion: cambios.descripcion } : {}),
      ...(cambios.fundamento !== undefined ? { fundamento: cambios.fundamento } : {}),
      ...(cambios.fechaLimite !== undefined ? { fechaLimite: new Date(cambios.fechaLimite) } : {}),
      ...(cambios.recurrencia !== undefined ? { recurrencia: cambios.recurrencia } : {}),
      ...(cambios.responsableUserId !== undefined ? { responsableUserId: cambios.responsableUserId } : {}),
      ...(cambios.consecuencia !== undefined ? { consecuencia: cambios.consecuencia } : {}),
      ...(cambios.estado !== undefined ? { estado: cambios.estado } : {}),
      ...(cambios.clienteId !== undefined ? { clienteId: cambios.clienteId } : {}),
    },
  });
}

export async function eliminarObligacion(tenantId: string, id: string): Promise<boolean> {
  const { count } = await prisma.obligacionCalendario.deleteMany({ where: { id, tenantId } });
  return count > 0;
}

/**
 * Marca cumplida (con evidencia opcional = Document.id del tenant) y, si es
 * recurrente, crea la siguiente ocurrencia (idempotente por clave natural).
 */
export async function marcarCumplida(tenantId: string, id: string, evidenciaDocumentId?: string | null, cumplidaAt = new Date()) {
  const actual = await prisma.obligacionCalendario.findFirst({ where: { id, tenantId } });
  if (!actual) return null;
  if (evidenciaDocumentId) {
    const doc = await prisma.document.findFirst({ where: { id: evidenciaDocumentId, tenantId }, select: { id: true } });
    if (!doc) throw new Error('La evidencia debe ser un Document de tu empresa');
  }
  const cumplida = await prisma.obligacionCalendario.update({
    where: { id },
    data: { estado: 'cumplida', cumplidaAt, evidenciaDocumentId: evidenciaDocumentId ?? null },
  });
  const siguiente = await regenerarSiguiente(cumplida);
  return { cumplida, siguiente };
}

/** Regenera la siguiente ocurrencia de una recurrente ya cumplida. Idempotente. */
export async function regenerarSiguiente(o: { id: string; tenantId: string; clienteId: string | null; tipo: string; titulo: string; descripcion: string | null; fundamento: string | null; fechaLimite: Date; recurrencia: string | null; responsableUserId: string | null; consecuencia: string | null; isDemoData: boolean }) {
  const prox = siguienteFechaRecurrente(o.fechaLimite, o.recurrencia);
  if (!prox) return null;
  if (await existeObligacion(o.tenantId, o.clienteId, o.tipo, prox)) return null;
  return prisma.obligacionCalendario.create({
    data: {
      tenantId: o.tenantId, clienteId: o.clienteId, tipo: o.tipo, titulo: o.titulo, descripcion: o.descripcion,
      fundamento: o.fundamento, fechaLimite: prox, recurrencia: o.recurrencia, responsableUserId: o.responsableUserId,
      consecuencia: o.consecuencia, estado: 'pendiente', isDemoData: o.isDemoData,
    },
  });
}

// ── Siembra base ─────────────────────────────────────────────────────────

export interface OpcionesSiembra {
  clienteId?: string | null;
  /** Perfil del cliente para no sembrar lo que no aplica. Default: todo. */
  tieneIMMEX?: boolean;
  tieneCertIVAIEPS?: boolean;
  ahora?: Date;
}

/** Siembra el catálogo base. Idempotente: tenant + cliente + tipo + fechaLimite. */
export async function sembrarBase(tenantId: string, opts: OpcionesSiembra = {}): Promise<{ creadas: number; existentes: number; omitidas: string[] }> {
  const ahora = opts.ahora ?? new Date();
  const clienteId = opts.clienteId ?? null;
  let tieneIMMEX = opts.tieneIMMEX;
  let tieneCert = opts.tieneCertIVAIEPS;
  if (clienteId && (tieneIMMEX === undefined || tieneCert === undefined)) {
    const c = await prisma.cliente.findFirst({ where: { id: clienteId, tenantId }, select: { programaIMMEX: true, certificacionIVAIEPS: true } });
    if (tieneIMMEX === undefined) tieneIMMEX = !!c?.programaIMMEX;
    if (tieneCert === undefined) tieneCert = !!c?.certificacionIVAIEPS;
  }
  let creadas = 0, existentes = 0;
  const omitidas: string[] = [];
  for (const b of CATALOGO_BASE) {
    if (b.requiere === 'IMMEX' && tieneIMMEX === false) { omitidas.push(b.tipo); continue; }
    if (b.requiere === 'CERT_IVA_IEPS' && tieneCert === false) { omitidas.push(b.tipo); continue; }
    const fecha = b.proximaFecha(ahora);
    if (await existeObligacion(tenantId, clienteId, b.tipo, fecha)) { existentes++; continue; }
    await prisma.obligacionCalendario.create({
      data: {
        tenantId, clienteId, tipo: b.tipo, titulo: b.titulo, descripcion: b.descripcion,
        fundamento: `${b.fundamento}${b.cotejo === 'pendiente' ? ' [cotejo: pendiente de fuente oficial]' : ''}`,
        fechaLimite: fecha, recurrencia: b.recurrencia, consecuencia: b.consecuencia, estado: 'pendiente',
      },
    });
    creadas++;
  }
  return { creadas, existentes, omitidas };
}

// ── Job diario: vencidas → alerta ────────────────────────────────────────

/**
 * Marca vencidas las pendientes/en_curso con fechaLimite < ahora y crea una
 * Alert `obligacion_vencida` (fingerprint = obligación) con acción
 * `ver_obligacion`. También avisa `obligacion_proxima` a ≤7 días (una vez).
 */
export async function procesarVencimientos(tenantId: string, ahora = new Date()): Promise<{ vencidas: number; alertas: number }> {
  const pendientes = await prisma.obligacionCalendario.findMany({
    where: { tenantId, estado: { in: ['pendiente', 'en_curso'] }, fechaLimite: { lte: new Date(ahora.getTime() + 7 * 86400000) } },
  });
  let vencidas = 0, alertas = 0;
  for (const o of pendientes) {
    const dias = Math.ceil((o.fechaLimite.getTime() - ahora.getTime()) / 86400000);
    const vencida = o.fechaLimite.getTime() < ahora.getTime();
    if (vencida) {
      await prisma.obligacionCalendario.update({ where: { id: o.id }, data: { estado: 'vencida' } });
      vencidas++;
    }
    const tipo = vencida ? 'obligacion_vencida' : 'obligacion_proxima';
    const fingerprint = `${tipo}|${o.id}`;
    const ya = await prisma.alert.findFirst({ where: { tenantId, fingerprint }, select: { id: true } });
    if (ya) continue;
    await prisma.alert.create({
      data: {
        tenantId,
        clienteId: o.clienteId,
        channel: 'IN_APP',
        type: tipo,
        severity: severidadPorImpacto({ tipo, impactoMXN: null, diasParaVencer: dias }),
        title: vencida ? `Obligación vencida: ${o.titulo}` : `Obligación vence en ${dias} día${dias === 1 ? '' : 's'}: ${o.titulo}`,
        content: `${o.descripcion ?? ''} Fecha límite: ${o.fechaLimite.toISOString().slice(0, 10)}.${o.fundamento ? ` Fundamento: ${o.fundamento}.` : ''}${o.consecuencia ? ` Consecuencia: ${o.consecuencia}` : ''}`.trim(),
        actionRequired: vencida ? 'Regularizar y documentar la evidencia' : 'Preparar evidencia y marcar cumplida',
        suggestedAction: accionVerObligacion(o.id) as unknown as object,
        dueDate: o.fechaLimite,
        daysToDue: dias,
        impactType: 'risk',
        fingerprint,
      },
    });
    alertas++;
  }
  if (vencidas > 0 || alertas > 0) {
    logger.info(`Calendario: tenant ${tenantId} → ${vencidas} vencida(s), ${alertas} alerta(s)`, { action: 'calendario_vencimientos', tenantId, metadata: { vencidas, alertas } });
  }
  return { vencidas, alertas };
}

export async function procesarVencimientosTodos(ahora = new Date()): Promise<{ tenants: number; vencidas: number; alertas: number }> {
  const tenants = await prisma.tenant.findMany({ where: { status: { in: ['ACTIVE', 'PILOT', 'TRIAL'] } }, select: { id: true } });
  let vencidas = 0, alertas = 0;
  // Revisión C: tenants en lotes de 50; un tenant que falla se loguea y no tumba el tick.
  for (const lote of enLotes(tenants)) {
    for (const t of lote) {
      const r = await procesarVencimientos(t.id, ahora).catch(err => {
        logger.error('Calendario: vencimientos fallaron', { action: 'calendario_vencimientos_fail', tenantId: t.id, errorMessage: err instanceof Error ? err.message : String(err) });
        return { vencidas: 0, alertas: 0 };
      });
      vencidas += r.vencidas; alertas += r.alertas;
    }
  }
  return { tenants: tenants.length, vencidas, alertas };
}
