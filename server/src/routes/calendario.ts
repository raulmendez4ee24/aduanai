/**
 * /api/calendario — Calendario de obligaciones (Operación 2026-08).
 *
 *   GET    /                    lista (filtros: ?estado, ?desde, ?hasta, ?clienteId / X-Cliente-Id)
 *   GET    /catalogo-base       catálogo sembrable (con marca de cotejo)
 *   GET    /export.xlsx         Excel de la lista
 *   POST   /                    crear
 *   POST   /sembrar-base        siembra idempotente por tenant/cliente
 *   POST   /procesar-vencimientos  corre el job diario para el tenant (admin)
 *   GET    /:id                 detalle (+ evidencia)
 *   PATCH  /:id                 editar
 *   POST   /:id/cumplir         marcar cumplida (evidenciaDocumentId opcional) → regenera recurrente
 *   DELETE /:id
 */
import { Router } from 'express';
import * as XLSX from 'xlsx';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';
import { clienteIdDe, enAlcance, filtroCliente, validarClienteEnAlcance } from '../lib/cliente-contexto';
import {
  CATALOGO_BASE, TIPOS_OBLIGACION, RECURRENCIAS, ESTADOS,
  listarObligaciones, crearObligacion, actualizarObligacion, eliminarObligacion,
  marcarCumplida, sembrarBase, procesarVencimientos, semaforo,
} from '../services/calendario-obligaciones';

export const calendarioRouter = Router();
calendarioRouter.use(authenticate);

const conSemaforo = <T extends { fechaLimite: Date; estado: string }>(o: T) => ({ ...o, semaforo: semaforo(o.fechaLimite, o.estado) });

/** Obligación del tenant que además cae en el alcance de cliente del usuario; null ⇒ 404 (no revela existencia). */
async function obligacionEnAlcance(req: AuthRequest) {
  const o = await prisma.obligacionCalendario.findFirst({ where: { id: String(req.params.id), tenantId: req.tenantId! } });
  return o && enAlcance(req, o.clienteId) ? o : null;
}

calendarioRouter.get('/', requirePermission('calendario', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const desde = typeof req.query.desde === 'string' ? new Date(req.query.desde) : undefined;
    const hasta = typeof req.query.hasta === 'string' ? new Date(req.query.hasta) : undefined;
    const rows = await listarObligaciones(req.tenantId!, {
      ...filtroCliente(req),
      estado: typeof req.query.estado === 'string' ? req.query.estado : undefined,
      desde: desde && !Number.isNaN(desde.getTime()) ? desde : undefined,
      hasta: hasta && !Number.isNaN(hasta.getTime()) ? hasta : undefined,
    });
    const responsables = await prisma.user.findMany({ where: { tenantId: req.tenantId!, active: true }, select: { id: true, name: true, email: true } });
    res.json({ status: 'ok', data: rows.map(conSemaforo), responsables });
  } catch (err) { next(err); }
});

calendarioRouter.get('/catalogo-base', (_req, res) => {
  res.json({
    status: 'ok',
    data: CATALOGO_BASE.map(b => ({ tipo: b.tipo, titulo: b.titulo, descripcion: b.descripcion, fundamento: b.fundamento, cotejo: b.cotejo, recurrencia: b.recurrencia, consecuencia: b.consecuencia, requiere: b.requiere ?? null, proximaFecha: b.proximaFecha(new Date()).toISOString() })),
    tipos: TIPOS_OBLIGACION, recurrencias: RECURRENCIAS, estados: ESTADOS,
  });
});

calendarioRouter.get('/export.xlsx', requirePermission('calendario', 'generateReport'), async (req: AuthRequest, res, next) => {
  try {
    const rows = await listarObligaciones(req.tenantId!, { ...filtroCliente(req) });
    const filas = rows.map(o => ({
      Tipo: o.tipo, Título: o.titulo, 'Fecha límite': o.fechaLimite.toISOString().slice(0, 10), Estado: o.estado,
      Semáforo: semaforo(o.fechaLimite, o.estado), Recurrencia: o.recurrencia ?? '', Fundamento: o.fundamento ?? '',
      Consecuencia: o.consecuencia ?? '', Cliente: o.clienteId ?? '', Responsable: o.responsableUserId ?? '',
      'Cumplida el': o.cumplidaAt ? o.cumplidaAt.toISOString().slice(0, 10) : '', Evidencia: o.evidenciaDocumentId ?? '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Obligaciones');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="calendario-obligaciones-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buf);
  } catch (err) { next(err); }
});

calendarioRouter.post('/', requirePermission('calendario', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const clienteId = await validarClienteEnAlcance(req, req.tenantId!, req.body?.clienteId ?? clienteIdDe(req));
    const o = await crearObligacion(req.tenantId!, { ...req.body, clienteId });
    res.status(201).json({ status: 'ok', data: conSemaforo(o) });
  } catch (err) {
    if (err instanceof Error && !('statusCode' in err)) return res.status(400).json({ status: 'error', message: err.message });
    next(err);
  }
});

calendarioRouter.post('/sembrar-base', requirePermission('calendario', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const clienteId = await validarClienteEnAlcance(req, req.tenantId!, req.body?.clienteId ?? clienteIdDe(req));
    const r = await sembrarBase(req.tenantId!, {
      clienteId,
      tieneIMMEX: typeof req.body?.tieneIMMEX === 'boolean' ? req.body.tieneIMMEX : undefined,
      tieneCertIVAIEPS: typeof req.body?.tieneCertIVAIEPS === 'boolean' ? req.body.tieneCertIVAIEPS : undefined,
    });
    res.json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

calendarioRouter.post('/procesar-vencimientos', requirePermission('calendario', 'create'), async (req: AuthRequest, res, next) => {
  try { res.json({ status: 'ok', data: await procesarVencimientos(req.tenantId!) }); } catch (err) { next(err); }
});

calendarioRouter.get('/:id', requirePermission('calendario', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const o = await obligacionEnAlcance(req);
    if (!o) return res.status(404).json({ status: 'error', message: 'Obligación no encontrada' });
    const evidencia = o.evidenciaDocumentId
      ? await prisma.document.findFirst({ where: { id: o.evidenciaDocumentId, tenantId: req.tenantId! }, select: { id: true, name: true, fileName: true, fileUrl: true, createdAt: true } })
      : null;
    const responsable = o.responsableUserId
      ? await prisma.user.findFirst({ where: { id: o.responsableUserId, tenantId: req.tenantId! }, select: { id: true, name: true, email: true } })
      : null;
    res.json({ status: 'ok', data: { ...conSemaforo(o), evidencia, responsable } });
  } catch (err) { next(err); }
});

calendarioRouter.patch('/:id', requirePermission('calendario', 'create'), async (req: AuthRequest, res, next) => {
  try {
    if (!(await obligacionEnAlcance(req))) return res.status(404).json({ status: 'error', message: 'Obligación no encontrada' });
    const body = { ...req.body };
    if (body.clienteId !== undefined) body.clienteId = await validarClienteEnAlcance(req, req.tenantId!, body.clienteId);
    const o = await actualizarObligacion(req.tenantId!, String(req.params.id), body);
    if (!o) return res.status(404).json({ status: 'error', message: 'Obligación no encontrada' });
    res.json({ status: 'ok', data: conSemaforo(o) });
  } catch (err) {
    if (err instanceof Error && !('statusCode' in err)) return res.status(400).json({ status: 'error', message: err.message });
    next(err);
  }
});

calendarioRouter.post('/:id/cumplir', requirePermission('calendario', 'approve'), async (req: AuthRequest, res, next) => {
  try {
    if (!(await obligacionEnAlcance(req))) return res.status(404).json({ status: 'error', message: 'Obligación no encontrada' });
    const r = await marcarCumplida(req.tenantId!, String(req.params.id), req.body?.evidenciaDocumentId ?? null);
    if (!r) return res.status(404).json({ status: 'error', message: 'Obligación no encontrada' });
    res.json({ status: 'ok', data: { cumplida: conSemaforo(r.cumplida), siguiente: r.siguiente ? conSemaforo(r.siguiente) : null } });
  } catch (err) {
    if (err instanceof Error && !('statusCode' in err)) return res.status(400).json({ status: 'error', message: err.message });
    next(err);
  }
});

calendarioRouter.delete('/:id', requirePermission('calendario', 'delete'), async (req: AuthRequest, res, next) => {
  try {
    if (!(await obligacionEnAlcance(req))) return res.status(404).json({ status: 'error', message: 'Obligación no encontrada' });
    const ok = await eliminarObligacion(req.tenantId!, String(req.params.id));
    if (!ok) return res.status(404).json({ status: 'error', message: 'Obligación no encontrada' });
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});
