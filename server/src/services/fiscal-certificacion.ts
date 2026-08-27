/**
 * Fiscal Guardian — "el calendario vivo de la certificación" (Ola 2).
 *
 *  - Semáforo por obligación A/AA/AAA desde CertificationProfile + datos reales.
 *  - Avisos → filas ObligacionCalendario (CERT_IVA_IEPS / AVISO_IMMEX), idempotentes.
 *  - Conciliación crédito fiscal (TaxCredit/CreditUsage) vs Anexo 30 del periodo.
 *  - Simulador "si pierdes la certificación": IVA mensual real a garantizar con TC del sistema.
 *  - Descargo del crédito como flujo (CreditUsage + audit trail) y reporte xlsx.
 *
 * El módulo Calendario (/api/calendario) es de otro agente: aquí solo se CREAN
 * filas con prisma directo, con clienteId del contexto.
 */
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { recordAudit } from './audit-service';
import { applyTaxCreditAtomic } from './fiscal-ledger';
import { getOfficialRate, type OfficialRate } from './exchange-rate';
import {
  evaluarCertificacion, AVISOS, tipoAvisoValido, PLAZO_RENOVACION_DIAS, NOTA_PLAZO_RENOVACION,
  type ContextoCertificacion, type SemaforoCertificacion, type TipoAviso,
} from '../lib/certificacion-iva-ieps';

const DIA = 86_400_000;
const IVA_TASA = 0.16; // Art. 1 LIVA — tasa general

function inicioDia(d: Date): Date { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; }
function periodoDe(d: Date): string { return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`; }

// ────────────────────────────────────────────────────────────────────────────
// 6. Semáforo por rubro
// ────────────────────────────────────────────────────────────────────────────

export async function contextoCertificacion(tenantId: string, clienteId: string | null, hoy = new Date()): Promise<ContextoCertificacion> {
  const cli = clienteId ? { clienteId } : {};
  const [perfil, cliente, padrones, primerImport, garantias, garantiasPorVencer, creditosVencidos, anexo30, avisosVencidos, avisosPendientes, movimientos, opinion] = await Promise.all([
    prisma.certificationProfile.findUnique({ where: { tenantId } }),
    clienteId ? prisma.cliente.findFirst({ where: { id: clienteId, tenantId } }) : Promise.resolve(null),
    prisma.tenantPadronStatus.findMany({ where: { tenantId }, include: { padron: { select: { type: true } } } }),
    prisma.temporaryImport.findFirst({ where: { tenantId, ...cli }, orderBy: { entryDate: 'asc' }, select: { entryDate: true } }),
    prisma.guarantee.count({ where: { tenantId, status: 'ACTIVE' } }),
    prisma.guarantee.count({ where: { tenantId, status: 'ACTIVE', expiryDate: { lte: new Date(hoy.getTime() + 30 * DIA) } } }),
    prisma.taxCredit.count({ where: { tenantId, ...cli, status: { in: ['ACTIVE', 'PARTIALLY_USED'] }, dischargeDeadline: { lt: hoy }, remaining: { gt: 0 } } }),
    prisma.annex30Account.findFirst({ where: { tenantId }, orderBy: { period: 'desc' }, select: { period: true } }),
    prisma.obligacionCalendario.count({ where: { tenantId, ...cli, tipo: { in: ['CERT_IVA_IEPS', 'AVISO_IMMEX'] }, estado: { in: ['pendiente', 'en_curso', 'vencida'] }, fechaLimite: { lt: hoy } } }),
    prisma.obligacionCalendario.count({ where: { tenantId, ...cli, tipo: { in: ['CERT_IVA_IEPS', 'AVISO_IMMEX'] }, estado: { in: ['pendiente', 'en_curso'] }, fechaLimite: { gte: hoy } } }),
    prisma.discharge.count({ where: { tenantId } }),
    prisma.obligacionCalendario.findFirst({ where: { tenantId, ...cli, tipo: 'OPINION_32D', estado: 'cumplida' }, orderBy: { cumplidaAt: 'desc' }, select: { cumplidaAt: true, descripcion: true } }),
  ]);

  const general = padrones.find((p) => p.padron.type === 'general');
  let padronImportadores: ContextoCertificacion['padronImportadores'] = 'desconocido';
  if (general) padronImportadores = general.status === 'active' ? 'activo' : general.status === 'not_registered' ? 'no_registrado' : 'suspendido';
  else if (cliente) padronImportadores = cliente.padronImportadores ? 'activo' : 'desconocido';

  const sectoriales = padrones.filter((p) => p.padron.type === 'sectorial');
  const padronesSectoriales = sectoriales.length > 0
    ? { requeridos: sectoriales.length, activos: sectoriales.filter((p) => p.status === 'active').length }
    : cliente && cliente.padronesSectoriales.length > 0 ? { requeridos: cliente.padronesSectoriales.length, activos: cliente.padronesSectoriales.length } : null;

  // Periodo Anexo 30 esperado = trimestre anterior al actual.
  const trimestreAnterior = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 3, 1));

  return {
    hoy,
    perfil: perfil ? { modality: perfil.modality ?? cliente?.certificacionIVAIEPS ?? null, status: perfil.status, issueDate: perfil.issueDate, expiryDate: perfil.expiryDate, renewalDeadline: perfil.renewalDeadline } : (cliente?.certificacionIVAIEPS ? { modality: cliente.certificacionIVAIEPS, status: null, issueDate: null, expiryDate: null, renewalDeadline: null } : null),
    antiguedadAnios: primerImport ? (hoy.getTime() - primerImport.entryDate.getTime()) / (365.25 * DIA) : null,
    padronImportadores,
    padronesSectoriales,
    opinion32D: opinion ? { positiva: !/negativ/i.test(opinion.descripcion ?? ''), fecha: opinion.cumplidaAt } : null,
    garantiasActivas: garantias,
    garantiasPorVencer30d: garantiasPorVencer,
    creditosVencidosSinDescargo: creditosVencidos,
    anexo30UltimoPeriodo: anexo30?.period ?? null,
    anexo30EsperadoPeriodo: periodoDe(trimestreAnterior),
    avisosVencidos,
    avisosPendientes,
    inventarioConMovimientos: movimientos > 0,
  };
}

export async function semaforoCertificacion(tenantId: string, clienteId: string | null, hoy = new Date()): Promise<SemaforoCertificacion & { contexto: Omit<ContextoCertificacion, 'hoy'> }> {
  const ctx = await contextoCertificacion(tenantId, clienteId, hoy);
  const { hoy: _h, ...resto } = ctx; void _h;
  return { ...evaluarCertificacion(ctx), contexto: resto };
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Avisos → ObligacionCalendario (idempotente por tenant + tipo + fecha)
// ────────────────────────────────────────────────────────────────────────────

export interface RegistroAviso {
  tipo: TipoAviso;
  fechaEvento: string;
  descripcion?: string | null;
  clienteId: string | null;
  responsableUserId?: string | null;
}

export async function registrarAviso(tenantId: string, input: RegistroAviso) {
  if (!tipoAvisoValido(input.tipo)) throw new AppError(`tipo de aviso inválido; usa: ${Object.keys(AVISOS).join(', ')}`, 400);
  const def = AVISOS[input.tipo];
  const evento = new Date(input.fechaEvento);
  if (Number.isNaN(evento.getTime())) throw new AppError('fechaEvento inválida', 400);
  const fechaLimite = inicioDia(new Date(evento.getTime() + def.plazoDias * DIA));
  return upsertObligacion(tenantId, {
    clienteId: input.clienteId,
    tipo: def.tipoCalendario,
    titulo: def.titulo,
    descripcion: [input.descripcion, `Evento: ${evento.toISOString().slice(0, 10)}. Plazo de trabajo: ${def.plazoDias} días${def.cotejo === 'pendiente' ? ' (pendiente de cotejo)' : ''}.`].filter(Boolean).join(' '),
    fundamento: def.fundamento,
    fechaLimite,
    recurrencia: 'UNICA',
    consecuencia: def.consecuencia,
    responsableUserId: input.responsableUserId ?? null,
  });
}

async function upsertObligacion(tenantId: string, o: { clienteId: string | null; tipo: string; titulo: string; descripcion: string; fundamento: string; fechaLimite: Date; recurrencia: string; consecuencia: string; responsableUserId: string | null }) {
  const existente = await prisma.obligacionCalendario.findFirst({
    where: { tenantId, tipo: o.tipo, titulo: o.titulo, fechaLimite: o.fechaLimite, ...(o.clienteId ? { clienteId: o.clienteId } : {}) },
  });
  if (existente) return { obligacion: existente, creada: false };
  const creada = await prisma.obligacionCalendario.create({ data: { tenantId, ...o } });
  return { obligacion: creada, creada: true };
}

/** Renovación: CertificationProfile.expiryDate − PLAZO_RENOVACION_DIAS. Idempotente. */
export async function sincronizarRenovacion(tenantId: string, clienteId: string | null) {
  const perfil = await prisma.certificationProfile.findUnique({ where: { tenantId } });
  if (!perfil?.expiryDate) return { obligacion: null, creada: false, motivo: 'Sin expiryDate en el perfil de certificación' };
  const def = AVISOS.renovacion;
  const fechaLimite = inicioDia(new Date(perfil.expiryDate.getTime() - PLAZO_RENOVACION_DIAS * DIA));
  const r = await upsertObligacion(tenantId, {
    clienteId,
    tipo: def.tipoCalendario,
    titulo: def.titulo,
    descripcion: `Registro rubro ${perfil.modality} vence el ${perfil.expiryDate.toISOString().slice(0, 10)}. ${NOTA_PLAZO_RENOVACION}`,
    fundamento: def.fundamento,
    fechaLimite,
    recurrencia: 'ANUAL',
    consecuencia: def.consecuencia,
    responsableUserId: null,
  });
  return { ...r, motivo: null };
}

export async function listarAvisos(tenantId: string, clienteId: string | null) {
  return prisma.obligacionCalendario.findMany({
    where: { tenantId, tipo: { in: ['CERT_IVA_IEPS', 'AVISO_IMMEX'] }, ...(clienteId ? { clienteId } : {}) },
    orderBy: { fechaLimite: 'asc' },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Conciliación crédito fiscal vs Anexo 30
// ────────────────────────────────────────────────────────────────────────────

export interface RangoPeriodo { periodo: string; inicio: Date; fin: Date; etiqueta: string }

export function rangoDePeriodo(periodo: string): RangoPeriodo {
  const p = periodo.trim().toUpperCase();
  let m = p.match(/^(\d{4})-Q([1-4])$/);
  if (m) {
    const y = Number(m[1]); const q = Number(m[2]);
    return { periodo: p, inicio: new Date(Date.UTC(y, (q - 1) * 3, 1)), fin: new Date(Date.UTC(y, q * 3, 1) - 1), etiqueta: `${y} trimestre ${q}` };
  }
  m = p.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]); const mo = Number(m[2]) - 1;
    if (mo < 0 || mo > 11) throw new AppError('periodo inválido', 400);
    return { periodo: p, inicio: new Date(Date.UTC(y, mo, 1)), fin: new Date(Date.UTC(y, mo + 1, 1) - 1), etiqueta: `${y}-${m[2]}` };
  }
  m = p.match(/^(\d{4})$/);
  if (m) {
    const y = Number(m[1]);
    return { periodo: p, inicio: new Date(Date.UTC(y, 0, 1)), fin: new Date(Date.UTC(y + 1, 0, 1) - 1), etiqueta: `${y}` };
  }
  throw new AppError('periodo inválido: usa AAAA-Qn, AAAA-MM o AAAA', 400);
}

export type Bucket = '0-6' | '6-12' | '12-18' | '>18';
export const BUCKETS: Bucket[] = ['0-6', '6-12', '12-18', '>18'];

export function bucketDeAntiguedad(meses: number): Bucket {
  if (meses < 6) return '0-6';
  if (meses < 12) return '6-12';
  if (meses < 18) return '12-18';
  return '>18';
}

export interface CreditoConciliado {
  id: string; pedimento: string; fractionCode: string; creditDate: string; dischargeDeadline: string;
  otorgado: number; descargadoAlCierre: number; saldoAlCierre: number; antiguedadMeses: number; bucket: Bucket; status: string;
}

export interface Conciliacion {
  periodo: RangoPeriodo;
  creditos: {
    otorgadoEnPeriodo: number;
    descargadoEnPeriodo: number;
    saldoAlCierre: number;
    activos: number;
    totalmenteDescargados: number;
    porBucket: Record<Bucket, { creditos: number; saldo: number }>;
    detalle: CreditoConciliado[];
  };
  anexo30: { existe: boolean; period: string | null; totalCredits: number; totalDebits: number; balance: number; ivaDeferred: number } | null;
  diferencias: Array<{ concepto: string; sistema: number; anexo30: number; diferencia: number }>;
  cuadra: boolean | null;
  nota: string;
}

/**
 * Función pura sobre créditos/usos ya cargados: se prueba sin DB.
 * `descargadoAlCierre` y `saldoAlCierre` se reconstruyen con los usos hasta el
 * fin del periodo (no con `remaining` actual), para que la conciliación sea
 * del periodo y no de hoy.
 */
export function conciliar(
  rango: RangoPeriodo,
  creditos: Array<{ id: string; pedimento: string; fractionCode: string; ivaAmount: number; iepsAmount: number; creditDate: Date; dischargeDeadline: Date; status: string; usages: Array<{ ivaApplied: number; iepsApplied: number; usageDate: Date }> }>,
  anexo: { period: string; totalCredits: number; totalDebits: number; balance: number; ivaDeferred: number } | null,
): Conciliacion {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let otorgadoEnPeriodo = 0; let descargadoEnPeriodo = 0; let saldoAlCierre = 0; let activos = 0; let totalmenteDescargados = 0;
  const porBucket: Record<Bucket, { creditos: number; saldo: number }> = { '0-6': { creditos: 0, saldo: 0 }, '6-12': { creditos: 0, saldo: 0 }, '12-18': { creditos: 0, saldo: 0 }, '>18': { creditos: 0, saldo: 0 } };
  const detalle: CreditoConciliado[] = [];
  for (const c of creditos) {
    if (c.creditDate > rango.fin) continue; // aún no existía al cierre
    const otorgado = c.ivaAmount + c.iepsAmount;
    if (c.creditDate >= rango.inicio) otorgadoEnPeriodo += otorgado;
    let descAlCierre = 0;
    for (const u of c.usages) {
      const monto = u.ivaApplied + u.iepsApplied;
      if (u.usageDate <= rango.fin) descAlCierre += monto;
      if (u.usageDate >= rango.inicio && u.usageDate <= rango.fin) descargadoEnPeriodo += monto;
    }
    const saldo = r2(Math.max(0, otorgado - descAlCierre));
    const meses = (rango.fin.getTime() - c.creditDate.getTime()) / (30.4375 * DIA);
    const bucket = bucketDeAntiguedad(meses);
    if (saldo > 0) { activos++; saldoAlCierre += saldo; porBucket[bucket].creditos++; porBucket[bucket].saldo = r2(porBucket[bucket].saldo + saldo); }
    else totalmenteDescargados++;
    detalle.push({ id: c.id, pedimento: c.pedimento, fractionCode: c.fractionCode, creditDate: c.creditDate.toISOString().slice(0, 10), dischargeDeadline: c.dischargeDeadline.toISOString().slice(0, 10), otorgado: r2(otorgado), descargadoAlCierre: r2(descAlCierre), saldoAlCierre: saldo, antiguedadMeses: Math.round(meses * 10) / 10, bucket, status: c.status });
  }
  otorgadoEnPeriodo = r2(otorgadoEnPeriodo); descargadoEnPeriodo = r2(descargadoEnPeriodo); saldoAlCierre = r2(saldoAlCierre);
  const diferencias: Conciliacion['diferencias'] = [];
  if (anexo) {
    const comparar = (concepto: string, sistema: number, a30: number) => { const d = r2(sistema - a30); if (Math.abs(d) > 0.01) diferencias.push({ concepto, sistema, anexo30: a30, diferencia: d }); };
    comparar('Créditos otorgados en el periodo', otorgadoEnPeriodo, anexo.totalCredits);
    comparar('Descargos (cargos) del periodo', descargadoEnPeriodo, anexo.totalDebits);
    comparar('Saldo al cierre', saldoAlCierre, anexo.balance);
  }
  return {
    periodo: rango,
    creditos: { otorgadoEnPeriodo, descargadoEnPeriodo, saldoAlCierre, activos, totalmenteDescargados, porBucket, detalle: detalle.sort((a, b) => b.saldoAlCierre - a.saldoAlCierre) },
    anexo30: anexo ? { existe: true, period: anexo.period, totalCredits: anexo.totalCredits, totalDebits: anexo.totalDebits, balance: anexo.balance, ivaDeferred: anexo.ivaDeferred } : null,
    diferencias,
    cuadra: anexo ? diferencias.length === 0 : null,
    nota: anexo ? 'Comparación contra el estado de cuenta Anexo 30 capturado para el periodo.' : 'Sin estado de cuenta Anexo 30 capturado para este periodo: no hay contra qué conciliar (captura el SCCCyG del periodo).',
  };
}

export async function conciliacionPeriodo(tenantId: string, clienteId: string | null, periodo: string): Promise<Conciliacion> {
  const rango = rangoDePeriodo(periodo);
  const [creditos, anexo] = await Promise.all([
    prisma.taxCredit.findMany({ where: { tenantId, ...(clienteId ? { clienteId } : {}), creditDate: { lte: rango.fin } }, include: { usages: { select: { ivaApplied: true, iepsApplied: true, usageDate: true } } } }),
    prisma.annex30Account.findFirst({ where: { tenantId, period: rango.periodo } }),
  ]);
  return conciliar(rango, creditos, anexo);
}

export function conciliacionAXlsx(c: Conciliacion): Buffer {
  const wb = XLSX.utils.book_new();
  const resumen = [
    { Concepto: 'Periodo', Valor: c.periodo.etiqueta },
    { Concepto: 'Créditos otorgados en el periodo (sistema)', Valor: c.creditos.otorgadoEnPeriodo },
    { Concepto: 'Descargos del periodo (sistema)', Valor: c.creditos.descargadoEnPeriodo },
    { Concepto: 'Saldo al cierre (sistema)', Valor: c.creditos.saldoAlCierre },
    { Concepto: 'Anexo 30 — créditos', Valor: c.anexo30?.totalCredits ?? 'sin captura' },
    { Concepto: 'Anexo 30 — cargos', Valor: c.anexo30?.totalDebits ?? 'sin captura' },
    { Concepto: 'Anexo 30 — saldo', Valor: c.anexo30?.balance ?? 'sin captura' },
    { Concepto: 'Cuadra', Valor: c.cuadra === null ? 'sin Anexo 30' : c.cuadra ? 'SÍ' : 'NO' },
    ...BUCKETS.map((b) => ({ Concepto: `Antigüedad ${b} meses — saldo`, Valor: c.creditos.porBucket[b].saldo })),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(c.diferencias.length ? c.diferencias : [{ concepto: 'Sin diferencias', sistema: '', anexo30: '', diferencia: '' }]), 'Diferencias');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(c.creditos.detalle), 'Créditos');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ────────────────────────────────────────────────────────────────────────────
// 9. Simulador de pérdida de certificación (números reales, TC inyectable)
// ────────────────────────────────────────────────────────────────────────────

export interface SimuladorPerdida {
  base: {
    ultimoMes: { desde: string; hasta: string; importaciones: number; valorAduanaUSD: number };
    promedio3Meses: { desde: string; hasta: string; importaciones: number; valorAduanaUSDMensual: number };
  };
  tipoCambio: { rate: number; source: string; asOf: string; isOfficial: boolean; warning: string | null };
  ivaTasa: number;
  ivaMensualMXN: { ultimoMes: number; promedio3Meses: number };
  iepsMensualMXN: null;
  notaIEPS: string;
  garantia: { pct: number | null; costoMensualMXN: number | null; costoAnualMXN: number | null; nota: string };
  sinDatos: boolean;
  fundamento: string;
}

export function calcularSimulador(args: {
  hoy: Date;
  importaciones: Array<{ entryDate: Date; customsValue: number }>;
  tc: OfficialRate;
  pctGarantia: number | null;
}): SimuladorPerdida {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const hoy = args.hoy;
  const iniUltimo = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1));
  const finUltimo = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1) - 1);
  const ini3 = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 3, 1));
  const ultimo = args.importaciones.filter((i) => i.entryDate >= iniUltimo && i.entryDate <= finUltimo);
  const tres = args.importaciones.filter((i) => i.entryDate >= ini3 && i.entryDate <= finUltimo);
  const valorUltimo = r2(ultimo.reduce((s, i) => s + i.customsValue, 0));
  const valor3Mensual = r2(tres.reduce((s, i) => s + i.customsValue, 0) / 3);
  const ivaUltimo = r2(valorUltimo * IVA_TASA * args.tc.rate);
  const iva3 = r2(valor3Mensual * IVA_TASA * args.tc.rate);
  const pct = args.pctGarantia != null && Number.isFinite(args.pctGarantia) && args.pctGarantia >= 0 ? args.pctGarantia : null;
  return {
    base: {
      ultimoMes: { desde: iniUltimo.toISOString().slice(0, 10), hasta: finUltimo.toISOString().slice(0, 10), importaciones: ultimo.length, valorAduanaUSD: valorUltimo },
      promedio3Meses: { desde: ini3.toISOString().slice(0, 10), hasta: finUltimo.toISOString().slice(0, 10), importaciones: tres.length, valorAduanaUSDMensual: valor3Mensual },
    },
    tipoCambio: { rate: args.tc.rate, source: args.tc.source, asOf: args.tc.asOf.toISOString().slice(0, 10), isOfficial: args.tc.isOfficial, warning: args.tc.warning },
    ivaTasa: IVA_TASA,
    ivaMensualMXN: { ultimoMes: ivaUltimo, promedio3Meses: iva3 },
    iepsMensualMXN: null,
    notaIEPS: 'IEPS no calculado: requiere la categoría IEPS por partida (no está en TemporaryImport). Si tus insumos causan IEPS, súmalo aparte.',
    garantia: {
      pct,
      costoMensualMXN: pct != null ? r2(iva3 * pct / 100) : null,
      costoAnualMXN: pct != null ? r2(iva3 * pct / 100 * 12) : null,
      nota: pct == null
        ? 'Sin tasa de garantía: el costo de la fianza/garantía depende de tu afianzadora y perfil; captura el % anual que te cotizaron para estimarlo. No se inventa una tasa fija.'
        : `Costo estimado con ${pct}% sobre el IVA mensual promedio; parámetro capturado por el usuario, no una tasa oficial.`,
    },
    sinDatos: tres.length === 0,
    fundamento: 'Sin certificación, el IVA de la importación temporal se paga o garantiza (Art. 28-A LIVA a contrario sensu; tasa general Art. 1 LIVA 16%). Valor en aduana × 16% × TC del sistema.',
  };
}

export async function simuladorPerdida(tenantId: string, clienteId: string | null, opts: { pctGarantia?: number | null; tc?: OfficialRate; hoy?: Date } = {}): Promise<SimuladorPerdida> {
  const hoy = opts.hoy ?? new Date();
  const ini3 = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 3, 1));
  const [importaciones, tc] = await Promise.all([
    prisma.temporaryImport.findMany({ where: { tenantId, ...(clienteId ? { clienteId } : {}), entryDate: { gte: ini3 } }, select: { entryDate: true, customsValue: true } }),
    opts.tc ? Promise.resolve(opts.tc) : getOfficialRate(),
  ]);
  return calcularSimulador({ hoy, importaciones, tc, pctGarantia: opts.pctGarantia ?? null });
}

// ────────────────────────────────────────────────────────────────────────────
// 10. Descargo del crédito como flujo (+ audit trail) y reporte xlsx
// ────────────────────────────────────────────────────────────────────────────

export interface DescargoInput {
  creditId: string;
  tenantId: string;
  userId: string | null;
  monto?: number | null;
  ivaApplied?: number | null;
  iepsApplied?: number | null;
  pedimentoDescargo: string;
  fecha: string;
  ip?: string | null;
  userAgent?: string | null;
}

/** Reparte `monto` entre IVA e IEPS disponibles (IVA primero) si no vienen desglosados. */
export function repartirMonto(monto: number, ivaDisponible: number, iepsDisponible: number): { ivaApplied: number; iepsApplied: number } {
  const iva = Math.min(monto, Math.max(0, ivaDisponible));
  const ieps = Math.min(Math.max(0, monto - iva), Math.max(0, iepsDisponible));
  return { ivaApplied: Math.round(iva * 100) / 100, iepsApplied: Math.round(ieps * 100) / 100 };
}

export async function descargarCredito(input: DescargoInput) {
  const credit = await prisma.taxCredit.findFirst({ where: { id: input.creditId, tenantId: input.tenantId }, include: { usages: true } });
  if (!credit) throw new AppError('Crédito no encontrado', 404);
  const fecha = new Date(input.fecha);
  if (Number.isNaN(fecha.getTime())) throw new AppError('fecha inválida', 400);
  if (fecha.getTime() > Date.now() + DIA) throw new AppError('La fecha del descargo no puede ser futura', 400);
  if (!input.pedimentoDescargo || !input.pedimentoDescargo.trim()) throw new AppError('pedimentoDescargo (retorno/cambio de régimen) requerido', 400);

  let ivaApplied = input.ivaApplied != null ? Number(input.ivaApplied) : null;
  let iepsApplied = input.iepsApplied != null ? Number(input.iepsApplied) : null;
  if (ivaApplied == null && iepsApplied == null) {
    const monto = Number(input.monto);
    if (!Number.isFinite(monto) || monto <= 0) throw new AppError('monto debe ser mayor a cero', 400);
    const ivaUsado = credit.usages.reduce((s, u) => s + u.ivaApplied, 0);
    const iepsUsado = credit.usages.reduce((s, u) => s + u.iepsApplied, 0);
    if (monto - credit.remaining > 1e-9) throw new AppError(`Monto excede saldo disponible. Disponible: $${credit.remaining.toLocaleString()} MXN`, 409);
    ({ ivaApplied, iepsApplied } = repartirMonto(monto, credit.ivaAmount - ivaUsado, credit.iepsAmount - iepsUsado));
  }
  ivaApplied = ivaApplied ?? 0; iepsApplied = iepsApplied ?? 0;
  if (!Number.isFinite(ivaApplied) || !Number.isFinite(iepsApplied) || ivaApplied < 0 || iepsApplied < 0) throw new AppError('Montos inválidos', 400);
  if (ivaApplied + iepsApplied <= 0) throw new AppError('El monto total aplicado debe ser mayor a cero', 400);

  const usage = await applyTaxCreditAtomic({ creditId: credit.id, tenantId: input.tenantId, pedimentoDescargo: input.pedimentoDescargo.trim(), ivaApplied, iepsApplied, usageDate: fecha });
  const despues = await prisma.taxCredit.findFirst({ where: { id: credit.id, tenantId: input.tenantId } });
  await recordAudit({
    tenantId: input.tenantId, userId: input.userId, action: 'DESCARGO_CREDITO', entity: 'TaxCredit', entityId: credit.id,
    before: { remaining: credit.remaining, discharged: credit.discharged, status: credit.status },
    after: { remaining: despues?.remaining, discharged: despues?.discharged, status: despues?.status },
    ipAddress: input.ip ?? null, userAgent: input.userAgent ?? null, endpoint: `/api/fiscal/creditos/${credit.id}/descargar`, method: 'POST',
    metadata: { usageId: usage.id, pedimentoDescargo: usage.pedimentoDescargo, ivaApplied, iepsApplied, usageDate: fecha.toISOString().slice(0, 10) },
  });
  return { usage, credito: despues };
}

export async function reporteCreditosXlsx(tenantId: string, clienteId: string | null): Promise<Buffer> {
  const creditos = await prisma.taxCredit.findMany({ where: { tenantId, ...(clienteId ? { clienteId } : {}) }, include: { usages: { orderBy: { usageDate: 'asc' } } }, orderBy: { creditDate: 'asc' } });
  const hoy = new Date();
  const filas = creditos.map((c) => ({
    Pedimento: c.pedimento, Fracción: c.fractionCode, 'Fecha crédito': c.creditDate.toISOString().slice(0, 10), 'Vence descargo': c.dischargeDeadline.toISOString().slice(0, 10),
    'Días para vencer': Math.ceil((c.dischargeDeadline.getTime() - hoy.getTime()) / DIA),
    IVA: c.ivaAmount, IEPS: c.iepsAmount, Otorgado: c.ivaAmount + c.iepsAmount, Descargado: c.discharged, Saldo: c.remaining, Estado: c.status, Descargos: c.usages.length,
    Bucket: bucketDeAntiguedad((hoy.getTime() - c.creditDate.getTime()) / (30.4375 * DIA)),
  }));
  const usos = creditos.flatMap((c) => c.usages.map((u) => ({ 'Crédito pedimento': c.pedimento, 'Pedimento descargo': u.pedimentoDescargo, Fecha: u.usageDate.toISOString().slice(0, 10), IVA: u.ivaApplied, IEPS: u.iepsApplied, Total: u.ivaApplied + u.iepsApplied })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [{ Pedimento: 'Sin créditos registrados' }]), 'Créditos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usos.length ? usos : [{ 'Crédito pedimento': 'Sin descargos' }]), 'Descargos');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
