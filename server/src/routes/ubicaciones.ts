/**
 * Ubicaciones IMMEX (planta / submaquila) — CRUD (Ola 1 · anexo24-real).
 * Una submaquila sin folio de aviso ante la SE se registra, pero se marca.
 */
import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';
import { clienteIdDe, validarClienteDelTenant, whereConAlcance } from '../lib/cliente-contexto';
import { recordAudit } from '../services/audit-service';

export const ubicacionesRouter = Router();

const TIPOS = new Set(['PLANTA', 'SUBMAQUILA']);

ubicacionesRouter.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const data = await prisma.ubicacion.findMany({
      where: whereConAlcance(req, { tenantId: req.tenantId! }),
      include: { _count: { select: { temporaryImports: { where: { status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] } } } } } },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    });
    res.json({ status: 'ok', data: data.map(u => ({ ...u, lotesActivos: u._count.temporaryImports, _count: undefined })) });
  } catch (err) { next(err); }
});

ubicacionesRouter.post('/', authenticate, requirePermission('inventory', 'adjust'), async (req: AuthRequest, res, next) => {
  try {
    const b = req.body ?? {};
    const nombre = String(b.nombre ?? '').trim();
    const tipo = String(b.tipo ?? 'PLANTA').toUpperCase();
    if (!nombre) return res.status(400).json({ status: 'error', message: 'nombre es requerido' });
    if (!TIPOS.has(tipo)) return res.status(400).json({ status: 'error', message: 'tipo debe ser PLANTA o SUBMAQUILA' });
    const clienteId = await validarClienteDelTenant(req.tenantId!, clienteIdDe(req));
    const u = await prisma.ubicacion.create({
      data: {
        tenantId: req.tenantId!,
        clienteId,
        nombre,
        tipo,
        domicilio: b.domicilio ? String(b.domicilio) : null,
        rfcTercero: b.rfcTercero ? String(b.rfcTercero).toUpperCase() : null,
        avisoSubmaquila: b.avisoSubmaquila ? String(b.avisoSubmaquila) : null,
      },
    });
    await recordAudit({ tenantId: req.tenantId!, userId: req.userId!, action: 'inventory.ubicacion_crear', entity: 'Ubicacion', entityId: u.id, after: u });
    const avisos = tipo === 'SUBMAQUILA' && !u.avisoSubmaquila ? ['Submaquila sin folio de aviso ante la SE: regístrelo antes de trasladar mercancía.'] : [];
    res.status(201).json({ status: 'ok', data: u, avisos });
  } catch (err) { next(err); }
});

ubicacionesRouter.patch('/:id', authenticate, requirePermission('inventory', 'adjust'), async (req: AuthRequest, res, next) => {
  try {
    const existente = await prisma.ubicacion.findFirst({ where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }) });
    if (!existente) return res.status(404).json({ status: 'error', message: 'Ubicación no encontrada' });
    const b = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (b.nombre !== undefined) data.nombre = String(b.nombre).trim();
    if (b.tipo !== undefined) {
      const t = String(b.tipo).toUpperCase();
      if (!TIPOS.has(t)) return res.status(400).json({ status: 'error', message: 'tipo debe ser PLANTA o SUBMAQUILA' });
      data.tipo = t;
    }
    if (b.domicilio !== undefined) data.domicilio = b.domicilio ? String(b.domicilio) : null;
    if (b.rfcTercero !== undefined) data.rfcTercero = b.rfcTercero ? String(b.rfcTercero).toUpperCase() : null;
    if (b.avisoSubmaquila !== undefined) data.avisoSubmaquila = b.avisoSubmaquila ? String(b.avisoSubmaquila) : null;
    if (b.activo !== undefined) data.activo = !!b.activo;
    const u = await prisma.ubicacion.update({ where: { id: existente.id }, data });
    await recordAudit({ tenantId: req.tenantId!, userId: req.userId!, action: 'inventory.ubicacion_editar', entity: 'Ubicacion', entityId: u.id, before: existente, after: u });
    res.json({ status: 'ok', data: u });
  } catch (err) { next(err); }
});

ubicacionesRouter.delete('/:id', authenticate, requirePermission('inventory', 'adjust'), async (req: AuthRequest, res, next) => {
  try {
    const existente = await prisma.ubicacion.findFirst({ where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }) });
    if (!existente) return res.status(404).json({ status: 'error', message: 'Ubicación no encontrada' });
    const lotes = await prisma.temporaryImport.count({ where: { tenantId: req.tenantId!, ubicacionId: existente.id, status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] } } });
    if (lotes > 0) return res.status(409).json({ status: 'error', message: `La ubicación tiene ${lotes} lote(s) activo(s); trasládelos antes de desactivarla` });
    const u = await prisma.ubicacion.update({ where: { id: existente.id }, data: { activo: false } });
    await recordAudit({ tenantId: req.tenantId!, userId: req.userId!, action: 'inventory.ubicacion_desactivar', entity: 'Ubicacion', entityId: u.id, before: existente, after: u });
    res.json({ status: 'ok', data: u });
  } catch (err) { next(err); }
});
