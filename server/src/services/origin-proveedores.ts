/**
 * PORTAL DE CERTIFICADOS DE ORIGEN DE PROVEEDORES (Ola 2, Operación 2026-08).
 *
 * `CertificadoOrigenProveedor` (Fase 0): la agencia pide al proveedor su
 * certificación de origen, el proveedor la sube por un enlace público con
 * token (sin cuenta), y el sistema vigila la vigencia (alertas a 60/30/7 días
 * y al vencer).
 *
 * Seguridad del portal público:
 *   - El token es aleatorio (24 bytes hex) y único; solo abre SU registro.
 *   - La ruta pública se consulta con `sinGuardaDeTenant` UNA vez (por token) y
 *     el resto de escrituras llevan el tenantId del registro.
 *   - Solo se exponen campos no sensibles (nombre del proveedor, producto,
 *     fracción, tratado, estado, vigencia).
 *   - El archivo se guarda como `Document` (base64 → data URI, tope 5 MB).
 *
 * Correo: Resend vía `lib/email.ts`; sin RESEND_API_KEY se guarda la
 * solicitud y se devuelve `correoEnviado: false, motivo: 'canal no configurado'`.
 */

import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { sinGuardaDeTenant } from '../lib/tenant-guard';
import { emailConfigurado, sendEmail } from '../lib/email';
import { severidadPorImpacto } from './alert-severity';
import { accionVerCertificadoProveedor } from './alert-acciones';

export const ESTADOS_CERT = ['solicitado', 'recibido', 'vencido', 'rechazado'] as const;
export type EstadoCert = (typeof ESTADOS_CERT)[number];
export const UMBRALES_VENCIMIENTO_DIAS = [60, 30, 7] as const;
const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024;

export class ProveedorError extends Error {
  constructor(public code: 'NO_ENCONTRADO' | 'DATOS_INVALIDOS' | 'TOKEN_INVALIDO' | 'ARCHIVO_INVALIDO', message: string) { super(message); }
}

export interface EntradaCertProveedor {
  proveedorNombre: string;
  proveedorPais: string;
  proveedorEmail?: string | null;
  productId?: string | null;
  fractionCode?: string | null;
  tratado?: string;
  vigenciaDesde?: string | null;
  vigenciaHasta?: string | null;
  notas?: string | null;
  clienteId?: string | null;
}

const fecha = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T12:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function validarEntrada(e: Partial<EntradaCertProveedor>): string | null {
  if (!e.proveedorNombre || !e.proveedorNombre.trim()) return 'proveedorNombre es obligatorio';
  if (!e.proveedorPais || !e.proveedorPais.trim()) return 'proveedorPais es obligatorio';
  if (e.proveedorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.proveedorEmail)) return 'proveedorEmail inválido';
  if (e.fractionCode && !/^\d{6,8}$/.test(e.fractionCode.replace(/[^0-9]/g, ''))) return 'fractionCode debe tener 6-8 dígitos';
  if (e.vigenciaDesde && !fecha(e.vigenciaDesde)) return 'vigenciaDesde inválida';
  if (e.vigenciaHasta && !fecha(e.vigenciaHasta)) return 'vigenciaHasta inválida';
  if (e.vigenciaDesde && e.vigenciaHasta && fecha(e.vigenciaDesde)!.getTime() > fecha(e.vigenciaHasta)!.getTime()) return 'vigenciaHasta debe ser posterior a vigenciaDesde';
  return null;
}

export async function listar(tenantId: string, filtro: { clienteId?: string | { in: string[] }; estado?: string } = {}) {
  const items = await prisma.certificadoOrigenProveedor.findMany({
    where: { tenantId, ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}), ...(filtro.estado ? { estado: filtro.estado } : {}) },
    orderBy: [{ vigenciaHasta: 'asc' }, { solicitadoAt: 'desc' }],
    take: 500,
  });
  const ahora = Date.now();
  return items.map(c => ({
    ...c,
    diasParaVencer: c.vigenciaHasta ? Math.ceil((c.vigenciaHasta.getTime() - ahora) / 86400000) : null,
    portalPath: c.tokenSolicitud ? `/proveedor/${c.tokenSolicitud}` : null,
  }));
}

export async function crear(tenantId: string, e: EntradaCertProveedor) {
  const err = validarEntrada(e);
  if (err) throw new ProveedorError('DATOS_INVALIDOS', err);
  if (e.productId) {
    const p = await prisma.product.findFirst({ where: { id: e.productId, tenantId }, select: { id: true } });
    if (!p) throw new ProveedorError('DATOS_INVALIDOS', 'productId no pertenece al tenant');
  }
  return prisma.certificadoOrigenProveedor.create({
    data: {
      tenantId, clienteId: e.clienteId ?? null,
      proveedorNombre: e.proveedorNombre.trim(), proveedorPais: e.proveedorPais.trim().toUpperCase(),
      proveedorEmail: e.proveedorEmail?.trim() || null, productId: e.productId ?? null,
      fractionCode: e.fractionCode ? e.fractionCode.replace(/[^0-9]/g, '') : null,
      tratado: e.tratado ?? 'TMEC',
      vigenciaDesde: fecha(e.vigenciaDesde), vigenciaHasta: fecha(e.vigenciaHasta),
      estado: fecha(e.vigenciaHasta) && fecha(e.vigenciaHasta)!.getTime() < Date.now() ? 'vencido' : 'solicitado',
      notas: e.notas ?? null,
    },
  });
}

export async function actualizar(tenantId: string, id: string, e: Partial<EntradaCertProveedor> & { estado?: EstadoCert }) {
  const existente = await prisma.certificadoOrigenProveedor.findFirst({ where: { id, tenantId } });
  if (!existente) throw new ProveedorError('NO_ENCONTRADO', 'Certificado no encontrado');
  const merged = { ...existente, ...e, proveedorNombre: e.proveedorNombre ?? existente.proveedorNombre, proveedorPais: e.proveedorPais ?? existente.proveedorPais };
  const err = validarEntrada({ ...merged, vigenciaDesde: e.vigenciaDesde ?? undefined, vigenciaHasta: e.vigenciaHasta ?? undefined, proveedorEmail: e.proveedorEmail ?? undefined, fractionCode: e.fractionCode ?? undefined });
  if (err) throw new ProveedorError('DATOS_INVALIDOS', err);
  if (e.estado && !ESTADOS_CERT.includes(e.estado)) throw new ProveedorError('DATOS_INVALIDOS', 'estado inválido');
  return prisma.certificadoOrigenProveedor.update({
    where: { id },
    data: {
      ...(e.proveedorNombre != null ? { proveedorNombre: e.proveedorNombre.trim() } : {}),
      ...(e.proveedorPais != null ? { proveedorPais: e.proveedorPais.trim().toUpperCase() } : {}),
      ...(e.proveedorEmail !== undefined ? { proveedorEmail: e.proveedorEmail?.trim() || null } : {}),
      ...(e.fractionCode !== undefined ? { fractionCode: e.fractionCode ? e.fractionCode.replace(/[^0-9]/g, '') : null } : {}),
      ...(e.tratado ? { tratado: e.tratado } : {}),
      ...(e.vigenciaDesde !== undefined ? { vigenciaDesde: fecha(e.vigenciaDesde) } : {}),
      ...(e.vigenciaHasta !== undefined ? { vigenciaHasta: fecha(e.vigenciaHasta) } : {}),
      ...(e.notas !== undefined ? { notas: e.notas } : {}),
      ...(e.estado ? { estado: e.estado } : {}),
      ...(e.clienteId !== undefined ? { clienteId: e.clienteId } : {}),
    },
  });
}

export async function eliminar(tenantId: string, id: string): Promise<void> {
  const r = await prisma.certificadoOrigenProveedor.deleteMany({ where: { id, tenantId } });
  if (r.count === 0) throw new ProveedorError('NO_ENCONTRADO', 'Certificado no encontrado');
}

// ── Solicitud al proveedor ────────────────────────────────────────────────

export function generarToken(): string { return crypto.randomBytes(24).toString('hex'); }

export interface ResultadoSolicitud {
  id: string;
  token: string;
  portalPath: string;
  portalUrl: string;
  correoEnviado: boolean;
  motivo: string | null;
}

export async function solicitar(tenantId: string, id: string, opts: { baseUrl: string; remitente?: string | null }): Promise<ResultadoSolicitud> {
  const c = await prisma.certificadoOrigenProveedor.findFirst({ where: { id, tenantId } });
  if (!c) throw new ProveedorError('NO_ENCONTRADO', 'Certificado no encontrado');
  const token = c.tokenSolicitud ?? generarToken();
  await prisma.certificadoOrigenProveedor.update({
    where: { id },
    data: { tokenSolicitud: token, estado: c.estado === 'recibido' ? 'recibido' : 'solicitado', solicitadoAt: new Date() },
  });
  const portalPath = `/proveedor/${token}`;
  const portalUrl = `${opts.baseUrl.replace(/\/$/, '')}${portalPath}`;
  let correoEnviado = false;
  let motivo: string | null = null;
  if (!c.proveedorEmail) motivo = 'correo no enviado: el proveedor no tiene email capturado';
  else if (!emailConfigurado()) motivo = 'correo no enviado: canal no configurado (RESEND_API_KEY ausente)';
  else {
    try {
      await sendEmail({
        to: c.proveedorEmail,
        subject: `Solicitud de certificación de origen ${c.tratado} — ${c.proveedorNombre}`,
        html: `<p>Estimado proveedor <strong>${c.proveedorNombre}</strong>,</p>
<p>${opts.remitente ?? 'Su cliente'} le solicita la certificación de origen bajo <strong>${c.tratado}</strong>${c.fractionCode ? ` para la mercancía con fracción <strong>${c.fractionCode}</strong>` : ''}.</p>
<p>Súbala en este enlace (sin registro), indicando la vigencia:</p>
<p><a href="${portalUrl}" style="display:inline-block;background:#064e3b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Subir certificación de origen</a></p>
<p style="font-size:12px;color:#666">Si el botón no funciona, copie esta dirección: ${portalUrl}</p>`,
        text: `Solicitud de certificación de origen ${c.tratado}. Súbala en: ${portalUrl}`,
      });
      correoEnviado = true;
    } catch (err) {
      motivo = `correo no enviado: ${err instanceof Error ? err.message : 'error del proveedor de correo'}`;
      logger.warn('Portal proveedores: fallo al enviar solicitud', { action: 'cert_proveedor_email_fail', tenantId, errorMessage: motivo });
    }
  }
  return { id, token, portalPath, portalUrl, correoEnviado, motivo };
}

// ── Portal público por token ──────────────────────────────────────────────

export interface VistaPortal {
  id: string;
  proveedorNombre: string;
  proveedorPais: string;
  fractionCode: string | null;
  tratado: string;
  estado: string;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  recibidoAt: string | null;
  producto: { productCode: string; description: string } | null;
  solicitante: string;
}

async function porToken(token: string) {
  if (!token || !/^[a-f0-9]{48}$/.test(token)) throw new ProveedorError('TOKEN_INVALIDO', 'Enlace inválido o vencido');
  const c = await sinGuardaDeTenant(() => prisma.certificadoOrigenProveedor.findUnique({ where: { tokenSolicitud: token } }));
  if (!c) throw new ProveedorError('TOKEN_INVALIDO', 'Enlace inválido o vencido');
  return c;
}

export async function portalVer(token: string): Promise<VistaPortal> {
  const c = await porToken(token);
  const [producto, tenant] = await Promise.all([
    c.productId ? prisma.product.findFirst({ where: { id: c.productId, tenantId: c.tenantId }, select: { productCode: true, description: true } }) : null,
    prisma.tenant.findUnique({ where: { id: c.tenantId }, select: { name: true } }),
  ]);
  return {
    id: c.id, proveedorNombre: c.proveedorNombre, proveedorPais: c.proveedorPais, fractionCode: c.fractionCode, tratado: c.tratado,
    estado: c.estado, vigenciaDesde: c.vigenciaDesde?.toISOString().slice(0, 10) ?? null, vigenciaHasta: c.vigenciaHasta?.toISOString().slice(0, 10) ?? null,
    recibidoAt: c.recibidoAt?.toISOString() ?? null, producto, solicitante: tenant?.name ?? 'Su cliente',
  };
}

export async function portalSubir(token: string, d: { archivoBase64: string; mimeType?: string; nombreArchivo?: string; vigenciaDesde?: string | null; vigenciaHasta?: string | null; numeroCertificado?: string | null }): Promise<VistaPortal> {
  const c = await porToken(token);
  if (!d.archivoBase64 || typeof d.archivoBase64 !== 'string') throw new ProveedorError('ARCHIVO_INVALIDO', 'archivoBase64 es obligatorio');
  const mime = (d.mimeType ?? 'application/pdf').toLowerCase();
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mime)) throw new ProveedorError('ARCHIVO_INVALIDO', 'Solo PDF, JPG o PNG');
  const buf = Buffer.from(d.archivoBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (buf.length === 0) throw new ProveedorError('ARCHIVO_INVALIDO', 'Archivo vacío');
  if (buf.length > MAX_ARCHIVO_BYTES) throw new ProveedorError('ARCHIVO_INVALIDO', 'Archivo mayor a 5 MB');
  const hasta = fecha(d.vigenciaHasta ?? undefined);
  const desde = fecha(d.vigenciaDesde ?? undefined);
  if (!hasta) throw new ProveedorError('DATOS_INVALIDOS', 'vigenciaHasta es obligatoria (fecha)');
  if (desde && desde.getTime() > hasta.getTime()) throw new ProveedorError('DATOS_INVALIDOS', 'vigenciaHasta debe ser posterior a vigenciaDesde');
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const nombre = (d.nombreArchivo ?? `certificado-origen-${c.proveedorNombre}.pdf`).slice(0, 200);
  const doc = await prisma.document.create({
    data: {
      tenantId: c.tenantId, clienteId: c.clienteId, productId: c.productId,
      name: nombre, type: 'certificado_origen_proveedor', docType: 'certificado_origen_proveedor',
      fileName: nombre, fileSize: buf.length, mimeType: mime, fileHash: hash,
      fileUrl: `data:${mime};base64,${buf.toString('base64')}`,
      status: 'UPLOADED', expiresAt: hasta,
      notes: `Subido por el proveedor vía portal${d.numeroCertificado ? ` · certificado ${d.numeroCertificado}` : ''}`,
    },
  });
  await prisma.certificadoOrigenProveedor.update({
    where: { id: c.id },
    data: { documentId: doc.id, vigenciaDesde: desde ?? c.vigenciaDesde, vigenciaHasta: hasta, estado: hasta.getTime() < Date.now() ? 'vencido' : 'recibido', recibidoAt: new Date(), notas: d.numeroCertificado ? `${c.notas ? c.notas + ' | ' : ''}No. certificado: ${d.numeroCertificado}` : c.notas },
  });
  logger.info('Portal proveedores: certificado recibido', { action: 'cert_proveedor_recibido', tenantId: c.tenantId, metadata: { id: c.id, documentId: doc.id } });
  return portalVer(token);
}

// ── Vencimientos → alertas (job diario) ───────────────────────────────────

export const TIPO_ALERTA_CERT = 'certificado_proveedor_vence';

export async function procesarVencimientosCertificados(tenantId: string, ahora = new Date()): Promise<{ vencidos: number; alertas: number }> {
  const maxDias = Math.max(...UMBRALES_VENCIMIENTO_DIAS);
  const certs = await prisma.certificadoOrigenProveedor.findMany({
    where: { tenantId, estado: { in: ['recibido', 'solicitado'] }, vigenciaHasta: { not: null, lte: new Date(ahora.getTime() + maxDias * 86400000) } },
  });
  let vencidos = 0, alertas = 0;
  for (const c of certs) {
    const dias = Math.ceil((c.vigenciaHasta!.getTime() - ahora.getTime()) / 86400000);
    const vencido = dias <= 0;
    if (vencido) { await prisma.certificadoOrigenProveedor.update({ where: { id: c.id }, data: { estado: 'vencido' } }); vencidos++; }
    const umbral = vencido ? 'vencido' : String([...UMBRALES_VENCIMIENTO_DIAS].sort((a, b) => a - b).find(u => dias <= u) ?? maxDias);
    const fingerprint = `cert_prov|${c.id}|${umbral}`;
    const ya = await prisma.alert.findFirst({ where: { tenantId, fingerprint }, select: { id: true } });
    if (ya) continue;
    const titulo = vencido
      ? `Certificado de origen vencido: ${c.proveedorNombre}`
      : `Certificado de origen de ${c.proveedorNombre} vence en ${dias} día${dias === 1 ? '' : 's'}`;
    await prisma.alert.create({
      data: {
        tenantId, clienteId: c.clienteId, channel: 'IN_APP', type: TIPO_ALERTA_CERT,
        severity: severidadPorImpacto({ tipo: TIPO_ALERTA_CERT, impactoMXN: null, diasParaVencer: dias }),
        title: titulo,
        content: `Certificación ${c.tratado} del proveedor ${c.proveedorNombre} (${c.proveedorPais})${c.fractionCode ? ` para la fracción ${c.fractionCode}` : ''}: vigencia hasta ${c.vigenciaHasta!.toISOString().slice(0, 10)}. Sin certificación vigente no procede el trato arancelario preferencial en las importaciones posteriores; solicita la renovación.`,
        actionRequired: vencido ? 'Solicitar certificación renovada al proveedor' : 'Solicitar renovación antes del vencimiento',
        suggestedAction: accionVerCertificadoProveedor(c.id) as unknown as object,
        affectedFraction: c.fractionCode, dueDate: c.vigenciaHasta, daysToDue: dias, impactType: 'risk', fingerprint,
      },
    });
    alertas++;
  }
  return { vencidos, alertas };
}

export async function procesarVencimientosCertificadosTodos(ahora = new Date()): Promise<{ tenants: number; vencidos: number; alertas: number }> {
  const tenants = await prisma.tenant.findMany({ where: { status: { in: ['ACTIVE', 'PILOT', 'TRIAL'] } }, select: { id: true } });
  let vencidos = 0, alertas = 0;
  for (const t of tenants) {
    const r = await procesarVencimientosCertificados(t.id, ahora).catch(err => {
      logger.error('Portal proveedores: vencimientos fallaron', { action: 'cert_proveedor_vencimientos_fail', tenantId: t.id, errorMessage: err instanceof Error ? err.message : String(err) });
      return { vencidos: 0, alertas: 0 };
    });
    vencidos += r.vencidos; alertas += r.alertas;
  }
  return { tenants: tenants.length, vencidos, alertas };
}
