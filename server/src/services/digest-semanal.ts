/**
 * DIGEST SEMANAL (Operación 2026-08, Ola 2 regulatorio).
 *
 * Resumen por tenant, agrupado por cliente/RFC: alertas nuevas de la semana,
 * importaciones temporales que vencen en ≤30 días y obligaciones del
 * calendario a 30 días. Se envía por email (Resend) y/o WhatsApp (YCloud)
 * según `Tenant.digestSemanalCanal` ('email' | 'whatsapp' | 'ambos').
 *
 * HONESTIDAD DEL CANAL: si el canal elegido no está configurado en el server
 * (sin RESEND_API_KEY / sin YCLOUD_*) o el tenant no tiene destinatarios
 * (emails verificados / teléfonos), el digest NO se pierde: se guarda como
 * `Alert` tipo `weekly_summary` marcada "canal no configurado" y el resultado
 * lo dice. Nunca se promete un envío que no ocurrió.
 *
 * Transportes inyectables para tests (sin red).
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { emailConfigurado, sendDigestSemanalEmail } from '../lib/email';
import { whatsappConfigurado, sendWhatsAppMessage } from './whatsapp';
import { normalizarAccion, rutaDeAccion } from './alert-acciones';

export const CANALES_DIGEST = ['email', 'whatsapp', 'ambos'] as const;
export type CanalDigest = (typeof CANALES_DIGEST)[number];

export interface DigestAlerta {
  id: string;
  type: string;
  severity: string;
  title: string;
  estimatedImpactMXN: number | null;
  dueDate: string | null;
  ruta: string | null;
}
export interface DigestVencimiento {
  id: string;
  pedimento: string;
  fractionCode: string;
  expirationDate: string;
  dias: number;
  saldo: number;
  unit: string;
}
export interface DigestObligacion {
  id: string;
  tipo: string;
  titulo: string;
  fechaLimite: string;
  dias: number;
  estado: string;
}
export interface DigestCliente {
  clienteId: string | null;
  nombre: string; // razón social o "Sin cliente asignado"
  rfc: string | null;
  alertas: DigestAlerta[];
  vencimientos: DigestVencimiento[];
  obligaciones: DigestObligacion[];
}
export interface Digest {
  tenantId: string;
  tenantNombre: string;
  generadoAt: string;
  periodo: { desde: string; hasta: string };
  clientes: DigestCliente[];
  totales: { alertas: number; vencimientos: number; obligaciones: number; impactoMXN: number };
}

const dias = (a: Date, b: Date) => Math.ceil((b.getTime() - a.getTime()) / 86400000);

export async function armarDigest(tenantId: string, ahora = new Date()): Promise<Digest> {
  const desde = new Date(ahora.getTime() - 7 * 86400000);
  const hasta30 = new Date(ahora.getTime() + 30 * 86400000);
  const [tenant, clientes, alertas, temporales, obligaciones] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.cliente.findMany({ where: { tenantId, activo: true }, select: { id: true, razonSocial: true, rfc: true } }),
    prisma.alert.findMany({
      where: { tenantId, createdAt: { gte: desde }, ignored: false, resolvedAt: null, type: { notIn: ['watch', 'weekly_summary'] } },
      orderBy: { createdAt: 'desc' }, take: 200,
    }),
    prisma.temporaryImport.findMany({
      where: { tenantId, status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] }, expirationDate: { lte: hasta30 } },
      orderBy: { expirationDate: 'asc' }, take: 200,
    }),
    prisma.obligacionCalendario.findMany({
      where: { tenantId, estado: { in: ['pendiente', 'en_curso', 'vencida'] }, fechaLimite: { lte: hasta30 } },
      orderBy: { fechaLimite: 'asc' }, take: 200,
    }),
  ]);

  const grupos = new Map<string | null, DigestCliente>();
  const grupo = (clienteId: string | null): DigestCliente => {
    const k = clienteId ?? null;
    if (!grupos.has(k)) {
      const c = k ? clientes.find(x => x.id === k) : null;
      grupos.set(k, { clienteId: k, nombre: c?.razonSocial ?? (k ? `Cliente ${k}` : 'Sin cliente asignado'), rfc: c?.rfc ?? null, alertas: [], vencimientos: [], obligaciones: [] });
    }
    return grupos.get(k)!;
  };

  let impacto = 0;
  for (const a of alertas) {
    const acc = normalizarAccion({ type: a.type, suggestedAction: a.suggestedAction, affectedFraction: a.affectedFraction, affectedOperations: a.affectedOperations });
    grupo(a.clienteId).alertas.push({ id: a.id, type: a.type, severity: a.severity, title: a.title, estimatedImpactMXN: a.estimatedImpactMXN, dueDate: a.dueDate?.toISOString() ?? null, ruta: acc ? rutaDeAccion(acc) : null });
    if (a.estimatedImpactMXN != null) impacto += Math.abs(a.estimatedImpactMXN);
  }
  for (const t of temporales) {
    grupo(t.clienteId).vencimientos.push({ id: t.id, pedimento: t.pedimento, fractionCode: t.fractionCode, expirationDate: t.expirationDate.toISOString(), dias: dias(ahora, t.expirationDate), saldo: Math.max(0, t.quantity - t.quantityDischarged), unit: t.unit });
  }
  for (const o of obligaciones) {
    grupo(o.clienteId).obligaciones.push({ id: o.id, tipo: o.tipo, titulo: o.titulo, fechaLimite: o.fechaLimite.toISOString(), dias: dias(ahora, o.fechaLimite), estado: o.estado });
  }

  // Orden: clientes con nombre primero, "Sin cliente" al final.
  const lista = [...grupos.values()].sort((a, b) => (a.clienteId === null ? 1 : 0) - (b.clienteId === null ? 1 : 0) || a.nombre.localeCompare(b.nombre));
  return {
    tenantId,
    tenantNombre: tenant?.name ?? tenantId,
    generadoAt: ahora.toISOString(),
    periodo: { desde: desde.toISOString().slice(0, 10), hasta: ahora.toISOString().slice(0, 10) },
    clientes: lista,
    totales: { alertas: alertas.length, vencimientos: temporales.length, obligaciones: obligaciones.length, impactoMXN: Math.round(impacto) },
  };
}

/** Texto plano (WhatsApp / registro). */
export function renderDigestTexto(d: Digest): string {
  const f = (iso: string) => iso.slice(0, 10);
  const partes: string[] = [`*ADUANAI — Resumen semanal* (${d.periodo.desde} → ${d.periodo.hasta})`, `${d.tenantNombre}: ${d.totales.alertas} alertas nuevas · ${d.totales.vencimientos} vencimientos ≤30d · ${d.totales.obligaciones} obligaciones ≤30d`];
  if (d.totales.impactoMXN > 0) partes.push(`Exposición estimada en alertas: $${d.totales.impactoMXN.toLocaleString('es-MX')} MXN`);
  for (const c of d.clientes) {
    partes.push(`\n*${c.nombre}*${c.rfc ? ` (${c.rfc})` : ''}`);
    for (const a of c.alertas.slice(0, 5)) partes.push(`• [${a.severity}] ${a.title}`);
    if (c.alertas.length > 5) partes.push(`  … y ${c.alertas.length - 5} alertas más`);
    for (const v of c.vencimientos.slice(0, 5)) partes.push(`• Vence ${f(v.expirationDate)} (${v.dias}d): pedimento ${v.pedimento}, ${v.fractionCode}, saldo ${v.saldo} ${v.unit}`);
    if (c.vencimientos.length > 5) partes.push(`  … y ${c.vencimientos.length - 5} vencimientos más`);
    for (const o of c.obligaciones.slice(0, 5)) partes.push(`• Obligación ${o.estado === 'vencida' ? 'VENCIDA' : `${o.dias}d`}: ${o.titulo} (${f(o.fechaLimite)})`);
    if (c.obligaciones.length > 5) partes.push(`  … y ${c.obligaciones.length - 5} obligaciones más`);
  }
  if (d.clientes.length === 0) partes.push('\nSin novedades esta semana.');
  return partes.join('\n');
}

export interface Transportes {
  email?: (to: string, digest: Digest) => Promise<void>;
  whatsapp?: (to: string, texto: string) => Promise<void>;
  /** Para tests: fuerza el "configurado" de cada canal. */
  configurado?: { email?: boolean; whatsapp?: boolean };
}

export interface ResultadoEnvio {
  canal: string | null;
  enviado: boolean;
  motivo: string | null;
  email: { intentado: boolean; destinatarios: string[]; error: string | null };
  whatsapp: { intentado: boolean; destinatarios: string[]; error: string | null };
  digest: Digest;
  alertaId: string | null;
}

const semanaISO = (d: Date): string => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil((((t.getTime() - y0.getTime()) / 86400000) + 1) / 7)).padStart(2, '0')}`;
};

/**
 * Envía (o guarda) el digest del tenant. `forzar` ignora el candado de
 * "ya enviado esta semana" (botón "enviar ahora").
 */
export async function enviarDigest(tenantId: string, opts: { ahora?: Date; transportes?: Transportes; forzar?: boolean } = {}): Promise<ResultadoEnvio> {
  const ahora = opts.ahora ?? new Date();
  const tr = opts.transportes ?? {};
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { digestSemanalCanal: true, digestUltimoEnvioAt: true, name: true } });
  const digest = await armarDigest(tenantId, ahora);
  const canal = tenant?.digestSemanalCanal ?? null;
  const res: ResultadoEnvio = {
    canal, enviado: false, motivo: null,
    email: { intentado: false, destinatarios: [], error: null },
    whatsapp: { intentado: false, destinatarios: [], error: null },
    digest, alertaId: null,
  };

  if (!canal || !(CANALES_DIGEST as readonly string[]).includes(canal)) {
    res.motivo = 'canal no configurado';
  } else {
    const quiereEmail = canal === 'email' || canal === 'ambos';
    const quiereWA = canal === 'whatsapp' || canal === 'ambos';
    const usuarios = await prisma.user.findMany({ where: { tenantId, active: true }, select: { email: true, phone: true, emailVerified: true, role: true } });
    const admins = usuarios.filter(u => u.role === 'ADMIN' || u.role === 'SUPERADMIN');
    const base = admins.length > 0 ? admins : usuarios;

    if (quiereEmail) {
      const ok = tr.configurado?.email ?? emailConfigurado();
      const tos = base.filter(u => u.emailVerified).map(u => u.email);
      if (!ok) res.email.error = 'canal no configurado (RESEND_API_KEY ausente)';
      else if (tos.length === 0) res.email.error = 'sin destinatarios con email verificado';
      else {
        res.email.intentado = true;
        try {
          for (const to of tos) await (tr.email ?? sendDigestSemanalEmail)(to, digest);
          res.email.destinatarios = tos;
        } catch (err) { res.email.error = err instanceof Error ? err.message : String(err); }
      }
    }
    if (quiereWA) {
      const ok = tr.configurado?.whatsapp ?? whatsappConfigurado();
      const tos = base.map(u => u.phone).filter((p): p is string => !!p && p.trim().length >= 8);
      if (!ok) res.whatsapp.error = 'canal no configurado (YCLOUD_API_KEY/YCLOUD_FROM_NUMBER ausentes)';
      else if (tos.length === 0) res.whatsapp.error = 'sin destinatarios con teléfono';
      else {
        res.whatsapp.intentado = true;
        try {
          const texto = renderDigestTexto(digest);
          for (const to of tos) await (tr.whatsapp ?? sendWhatsAppMessage)(to, texto);
          res.whatsapp.destinatarios = tos;
        } catch (err) { res.whatsapp.error = err instanceof Error ? err.message : String(err); }
      }
    }
    res.enviado = res.email.destinatarios.length > 0 || res.whatsapp.destinatarios.length > 0;
    if (!res.enviado) res.motivo = [res.email.error, res.whatsapp.error].filter(Boolean).join('; ') || 'sin destinatarios';
  }

  // Registro persistente del digest (siempre), con marca honesta del canal.
  const fingerprint = `digest|${semanaISO(ahora)}${opts.forzar ? `|manual|${ahora.getTime()}` : ''}`;
  const existente = await prisma.alert.findFirst({ where: { tenantId, fingerprint }, select: { id: true } });
  const marca = res.enviado
    ? `Enviado por ${[res.email.destinatarios.length ? 'email' : null, res.whatsapp.destinatarios.length ? 'WhatsApp' : null].filter(Boolean).join(' y ')}.`
    : `No enviado — ${res.motivo}. El resumen queda aquí.`;
  const contenido = `${marca}\n\n${renderDigestTexto(digest).replace(/\*/g, '')}`;
  if (existente) {
    await prisma.alert.update({ where: { id: existente.id }, data: { content: contenido, read: false } });
    res.alertaId = existente.id;
  } else {
    const a = await prisma.alert.create({
      data: {
        tenantId, channel: 'IN_APP', type: 'weekly_summary', severity: 'low',
        title: `Resumen semanal ${digest.periodo.desde} → ${digest.periodo.hasta}${res.enviado ? '' : ' (canal no configurado)'}`,
        content: contenido, fingerprint, impactType: 'risk', sentAt: res.enviado ? ahora : null,
      },
    });
    res.alertaId = a.id;
  }
  if (res.enviado) await prisma.tenant.update({ where: { id: tenantId }, data: { digestUltimoEnvioAt: ahora } });
  logger.info(`Digest semanal tenant ${tenantId}: ${res.enviado ? 'enviado' : `no enviado (${res.motivo})`}`, { action: 'digest_semanal', tenantId, metadata: { canal, enviado: res.enviado, motivo: res.motivo } });
  return res;
}

/** Job semanal: tenants con canal configurado y sin envío en los últimos 6 días. */
export async function enviarDigestsPendientes(ahora = new Date()): Promise<{ tenants: number; enviados: number }> {
  const hace6d = new Date(ahora.getTime() - 6 * 86400000);
  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ['ACTIVE', 'PILOT', 'TRIAL'] }, digestSemanalCanal: { not: null }, OR: [{ digestUltimoEnvioAt: null }, { digestUltimoEnvioAt: { lt: hace6d } }] },
    select: { id: true },
  });
  let enviados = 0;
  for (const t of tenants) {
    const r = await enviarDigest(t.id, { ahora }).catch(() => null);
    if (r?.enviado) enviados++;
  }
  return { tenants: tenants.length, enviados };
}
