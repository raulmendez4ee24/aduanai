/**
 * /api/clientes — CRUD de clientes (RFC operados por el tenant), resumen,
 * import Excel, backfill y alcance por cliente de usuarios.
 * Operación 2026-08, Ola 1 (multi-cliente y roles).
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { getUserPermissions, hasPermission } from '../services/permissions';
import {
  listarClientes, obtenerCliente, crearCliente, actualizarCliente, desactivarCliente,
  resumenClientes, importarClientesExcel, backfillClienteDelTenant, asegurarClienteDemo,
  asignarClientesAUsuario,
} from '../services/clientes';

export const clientesRouter = Router();
clientesRouter.use(authenticate);

// Listado: todo usuario autenticado con `clientes.view` (CLIENTE_CONSULTA no
// tiene view pero sí necesita SU lista para el selector → se le devuelve
// acotada a su restricción sin exigir el permiso).
clientesRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const perms = await getUserPermissions(req.userId!, req.tenantId!, req.userRole);
    const puedeVer = hasPermission(perms, 'clientes', 'view');
    const permitidos = req.clienteIdsPermitidos ?? null;
    if (!puedeVer && permitidos === null) {
      return res.status(403).json({ status: 'error', message: 'No tienes permiso para ver clientes' });
    }
    const incluirInactivos = req.query.incluirInactivos === 'true';
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    let items = await listarClientes(req.tenantId!, { incluirInactivos, q });
    if (permitidos) items = items.filter(c => permitidos.includes(c.id));
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

// Alcance del usuario actual (para el selector y la UI): null = todos.
clientesRouter.get('/alcance', async (req: AuthRequest, res) => {
  res.json({ status: 'ok', data: { clienteIds: req.clienteIdsPermitidos ?? null } });
});

clientesRouter.get('/resumen', requirePermission('clientes', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const data = await resumenClientes(req.tenantId!, req.clienteIdsPermitidos ?? null);
    res.json({ status: 'ok', data });
  } catch (err) { next(err); }
});

clientesRouter.post('/', requirePermission('clientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const c = await crearCliente(req.tenantId!, req.body);
    res.status(201).json({ status: 'ok', data: c });
  } catch (err) { next(err); }
});

const importSchema = z.object({ base64: z.string().min(1) }).strict();
clientesRouter.post('/import', requirePermission('clientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const { base64 } = importSchema.parse(req.body);
    const r = await importarClientesExcel(req.tenantId!, base64);
    res.json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

// Backfill: SOLO TENANT_ADMIN (feature settings). Acotado al tenant del actor.
clientesRouter.post('/backfill', requirePermission('clientes', 'settings'), async (req: AuthRequest, res, next) => {
  try {
    const clienteId = typeof req.body?.clienteId === 'string' ? req.body.clienteId : undefined;
    const r = await backfillClienteDelTenant(req.tenantId!, clienteId);
    res.json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

clientesRouter.post('/asegurar-propio', requirePermission('clientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const r = await asegurarClienteDemo(req.tenantId!);
    res.json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

// Alcance por cliente de un usuario: { clienteIds: string[] | null }.
const alcanceSchema = z.object({ clienteIds: z.array(z.string().min(1)).max(500).nullable() }).strict();
clientesRouter.put('/usuarios/:userId/alcance', requirePermission('clientes', 'settings'), async (req: AuthRequest, res, next) => {
  try {
    const { clienteIds } = alcanceSchema.parse(req.body);
    const r = await asignarClientesAUsuario(req.tenantId!, String(req.params.userId), clienteIds, req.userId!);
    res.json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

clientesRouter.get('/usuarios/:userId/alcance', requirePermission('clientes', 'settings'), async (req: AuthRequest, res, next) => {
  try {
    const { resolverClientesPermitidos } = await import('../middlewares/clienteScope');
    const ids = await resolverClientesPermitidos(String(req.params.userId), req.tenantId!);
    res.json({ status: 'ok', data: { clienteIds: ids } });
  } catch (err) { next(err); }
});

clientesRouter.get('/:id', requirePermission('clientes', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    if (req.clienteIdsPermitidos && !req.clienteIdsPermitidos.includes(id)) {
      return res.status(404).json({ status: 'error', message: 'Cliente no encontrado' });
    }
    const c = await obtenerCliente(req.tenantId!, id);
    if (!c) return res.status(404).json({ status: 'error', message: 'Cliente no encontrado' });
    res.json({ status: 'ok', data: c });
  } catch (err) { next(err); }
});

clientesRouter.patch('/:id', requirePermission('clientes', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const c = await actualizarCliente(req.tenantId!, String(req.params.id), req.body);
    res.json({ status: 'ok', data: c });
  } catch (err) { next(err); }
});

clientesRouter.delete('/:id', requirePermission('clientes', 'delete'), async (req: AuthRequest, res, next) => {
  try {
    await desactivarCliente(req.tenantId!, String(req.params.id));
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});
