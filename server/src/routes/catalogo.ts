/**
 * /api/catalogo — Catálogo maestro de partes (Ola 1, Operación 2026-08).
 * Lógica en services/catalogo-partes.ts; aquí solo HTTP, permisos y tenant.
 *
 * Permisos: módulo `catalogo` (view/create/approve/delete) + `exportData` para
 * Excel. Aprobar una versión = `classifier.approve` (misma SOD que aprobar
 * una clasificación: el que propone no necesariamente dictamina).
 */
import { Router, type NextFunction, type Response } from 'express';
import { authenticate, type AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { getUserPermissions, hasPermission } from '../services/permissions';
import { clienteIdDe, enAlcance, filtroCliente, validarClienteEnAlcance } from '../lib/cliente-contexto';
import {
  CatalogoError, listarPartes, obtenerParte, crearParte, actualizarParte, desactivarParte,
  proponerVersion, aprobarVersion, rechazarVersion, promoverDesdeClasificacion,
  buscarPorDescripcion, exportarPartesXlsx, importarPartes, USOS_DESTINO, FUENTES_VERSION, COLUMNAS_IMPORT,
  dictamenPorCodigo,
} from '../services/catalogo-partes';

export const catalogoRouter = Router();
catalogoRouter.use(authenticate);

function manejar(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof CatalogoError) {
    return res.status(err.http).json({ status: 'error', code: err.codigo, message: err.message });
  }
  next(err);
}

async function puedeAprobar(req: AuthRequest): Promise<boolean> {
  const perms = await getUserPermissions(req.userId!, req.tenantId!, req.userRole);
  return hasPermission(perms, 'classifier', 'approve');
}

function q(req: AuthRequest, k: string): string | undefined {
  const v = req.query[k];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

// GET /api/catalogo — listado con búsqueda, filtros y paginación
catalogoRouter.get('/', requirePermission('catalogo', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const dictamen = q(req, 'dictamen');
    const r = await listarPartes(req.tenantId!, {
      ...filtroCliente(req),
      q: q(req, 'q') ?? q(req, 'search'),
      capitulo: q(req, 'capitulo'),
      dictamen: dictamen === 'con' || dictamen === 'sin' ? dictamen : undefined,
      usoDestino: q(req, 'usoDestino'),
      incluirInactivas: q(req, 'inactivas') === '1',
      page: Number(q(req, 'page') ?? 1),
      limit: Number(q(req, 'limit') ?? 25),
    });
    res.json({ status: 'ok', ...r, catalogos: { usosDestino: USOS_DESTINO, fuentes: FUENTES_VERSION } });
  } catch (err) { manejar(err, res, next); }
});

// GET /api/catalogo/buscar-por-descripcion?q= — el Clasificador consulta antes de correr
catalogoRouter.get('/buscar-por-descripcion', requirePermission('catalogo', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const r = await buscarPorDescripcion(req.tenantId!, q(req, 'q') ?? '', filtroCliente(req).clienteId);
    res.json({ status: 'ok', data: r });
  } catch (err) { manejar(err, res, next); }
});

// GET /api/catalogo/por-codigo/:productCode — fracción VIGENTE + NICO + uso/destino.
// Lo consumen Cotizador (autocompletar fracción desde el número de parte) e
// Inventario (partida con productId). Estado vacío honesto: 404 si la parte no
// existe o cae fuera del alcance; 200 con `tieneDictamen:false` si existe pero
// nadie ha aprobado una versión todavía.
catalogoRouter.get('/por-codigo/:productCode', requirePermission('catalogo', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const d = await dictamenPorCodigo(req.tenantId!, String(req.params.productCode), filtroCliente(req).clienteId);
    if (!d) return res.status(404).json({ status: 'error', code: 'NO_ENCONTRADA', message: `No tienes la parte ${String(req.params.productCode)} en tu catálogo.` });
    if (!enAlcance(req, d.clienteId)) return res.status(404).json({ status: 'error', code: 'NO_ENCONTRADA', message: `No tienes la parte ${String(req.params.productCode)} en tu catálogo.` });
    res.json({
      status: 'ok',
      data: d,
      nota: d.tieneDictamen ? null : 'La parte existe pero todavía no tiene un dictamen aprobado: la fracción hay que capturarla o clasificarla.',
    });
  } catch (err) { manejar(err, res, next); }
});

// GET /api/catalogo/export.xlsx
catalogoRouter.get('/export.xlsx', requirePermission('catalogo', 'exportData'), async (req: AuthRequest, res, next) => {
  try {
    const dictamen = q(req, 'dictamen');
    const buf = await exportarPartesXlsx(req.tenantId!, {
      ...filtroCliente(req), q: q(req, 'q'), capitulo: q(req, 'capitulo'),
      dictamen: dictamen === 'con' || dictamen === 'sin' ? dictamen : undefined, usoDestino: q(req, 'usoDestino'),
    });
    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="catalogo-partes-${fecha}.xlsx"`);
    res.send(buf);
  } catch (err) { manejar(err, res, next); }
});

// GET /api/catalogo/plantilla-import — columnas esperadas (la UI las muestra)
catalogoRouter.get('/plantilla-import', requirePermission('catalogo', 'view'), (_req, res) => {
  res.json({ status: 'ok', columnas: COLUMNAS_IMPORT, obligatorias: ['productCode', 'description'], usosDestino: USOS_DESTINO });
});

// POST /api/catalogo/import — Excel/CSV en base64
catalogoRouter.post('/import', requirePermission('catalogo', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const { archivoBase64, nombreArchivo, clienteId } = (req.body ?? {}) as { archivoBase64?: string; nombreArchivo?: string; clienteId?: string | null };
    if (typeof archivoBase64 !== 'string' || archivoBase64.length === 0) {
      return res.status(400).json({ status: 'error', message: 'archivoBase64 es obligatorio' });
    }
    // El body JSON global es de 5 MB (index.ts): un archivo mayor a ~3.5 MB ya no llega aquí.
    if (archivoBase64.length > 5 * 1024 * 1024) {
      return res.status(413).json({ status: 'error', message: 'Archivo demasiado grande (máximo ~3.5 MB)' });
    }
    const rep = await importarPartes(req.tenantId!, req.userId!, {
      archivoBase64, nombreArchivo: typeof nombreArchivo === 'string' ? nombreArchivo : undefined,
      clienteId: await validarClienteEnAlcance(req, req.tenantId!, clienteId ?? clienteIdDe(req)),
    }, { puedeAprobar: await puedeAprobar(req), ip: req.ip ?? null });
    res.json({ status: 'ok', data: rep });
  } catch (err) { manejar(err, res, next); }
});

// POST /api/catalogo/promover — desde una Classification del Historial
catalogoRouter.post('/promover', requirePermission('catalogo', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const { classificationId, productCode, clienteId, unit, usoDestino, justificacion } = (req.body ?? {}) as Record<string, string | null | undefined>;
    if (!classificationId) return res.status(400).json({ status: 'error', message: 'classificationId es obligatorio' });
    const r = await promoverDesdeClasificacion(req.tenantId!, req.userId!, String(classificationId), {
      productCode, clienteId: await validarClienteEnAlcance(req, req.tenantId!, clienteId ?? clienteIdDe(req)), unit, usoDestino, justificacion,
    }, { puedeAprobar: await puedeAprobar(req), ip: req.ip ?? null });
    res.status(r.creada ? 201 : 200).json({ status: 'ok', data: r });
  } catch (err) { manejar(err, res, next); }
});

// POST /api/catalogo — crear parte
catalogoRouter.post('/', requirePermission('catalogo', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const p = await crearParte(req.tenantId!, req.userId!, {
      productCode: String(b.productCode ?? ''), description: String(b.description ?? ''),
      unit: typeof b.unit === 'string' ? b.unit : undefined,
      clienteId: await validarClienteEnAlcance(req, req.tenantId!, typeof b.clienteId === 'string' ? b.clienteId : clienteIdDe(req)),
      usoDestino: typeof b.usoDestino === 'string' ? b.usoDestino : null,
      paisOrigen: typeof b.paisOrigen === 'string' ? b.paisOrigen : null,
      noms: b.noms,
      fractionCode: typeof b.fractionCode === 'string' ? b.fractionCode : null,
      nico: typeof b.nico === 'string' ? b.nico : null,
      justificacion: typeof b.justificacion === 'string' ? b.justificacion : null,
    }, { puedeAprobar: await puedeAprobar(req), ip: req.ip ?? null });
    res.status(201).json({ status: 'ok', data: await obtenerParte(req.tenantId!, p.id) });
  } catch (err) { manejar(err, res, next); }
});

// GET /api/catalogo/:id — ficha con historial de versiones
/** La parte existe en el tenant Y cae en el alcance de cliente del usuario; si no, 404 (no revela existencia). */
async function parteEnAlcance(req: AuthRequest, id: string) {
  const p = await obtenerParte(req.tenantId!, id);
  if (!enAlcance(req, p.clienteId)) throw new CatalogoError('NO_ENCONTRADA', 'Parte no encontrada');
  return p;
}

catalogoRouter.get('/:id', requirePermission('catalogo', 'view'), async (req: AuthRequest, res, next) => {
  try {
    res.json({ status: 'ok', data: await parteEnAlcance(req, String(req.params.id)) });
  } catch (err) { manejar(err, res, next); }
});

// PATCH /api/catalogo/:id — datos de la parte (la fracción va por versiones)
catalogoRouter.patch('/:id', requirePermission('catalogo', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const cambios: Parameters<typeof actualizarParte>[3] = {};
    for (const k of ['description', 'unit', 'usoDestino', 'paisOrigen', 'clienteId'] as const) {
      if (k in b) (cambios as Record<string, unknown>)[k] = b[k] === null ? null : String(b[k]);
    }
    if ('noms' in b) cambios.noms = b.noms;
    if (typeof b.active === 'boolean') cambios.active = b.active;
    await parteEnAlcance(req, String(req.params.id));
    if (typeof cambios.clienteId === 'string') cambios.clienteId = await validarClienteEnAlcance(req, req.tenantId!, cambios.clienteId);
    await actualizarParte(req.tenantId!, req.userId!, String(req.params.id), cambios, req.ip ?? null);
    res.json({ status: 'ok', data: await obtenerParte(req.tenantId!, String(req.params.id)) });
  } catch (err) { manejar(err, res, next); }
});

// DELETE /api/catalogo/:id — baja lógica (conserva expediente)
catalogoRouter.delete('/:id', requirePermission('catalogo', 'delete'), async (req: AuthRequest, res, next) => {
  try {
    await parteEnAlcance(req, String(req.params.id));
    await desactivarParte(req.tenantId!, req.userId!, String(req.params.id), req.ip ?? null);
    res.json({ status: 'ok' });
  } catch (err) { manejar(err, res, next); }
});

// POST /api/catalogo/:id/versiones — proponer nueva versión de clasificación
catalogoRouter.post('/:id/versiones', requirePermission('catalogo', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.fractionCode !== 'string') return res.status(400).json({ status: 'error', message: 'fractionCode es obligatorio' });
    const fuente = typeof b.fuente === 'string' ? b.fuente : 'manual';
    if (!(FUENTES_VERSION as readonly string[]).includes(fuente)) {
      return res.status(400).json({ status: 'error', message: `fuente inválida (válidas: ${FUENTES_VERSION.join(', ')})` });
    }
    await parteEnAlcance(req, String(req.params.id));
    const v = await proponerVersion(req.tenantId!, req.userId!, String(req.params.id), {
      fractionCode: b.fractionCode,
      nico: b.nico === undefined ? undefined : (b.nico === null ? null : String(b.nico)),
      justificacion: typeof b.justificacion === 'string' ? b.justificacion : null,
      fuente, classificationId: typeof b.classificationId === 'string' ? b.classificationId : null,
      tigieVersion: typeof b.tigieVersion === 'string' ? b.tigieVersion : null,
    }, req.ip ?? null);
    // `aprobar: true` en el body aprueba en el acto SOLO si el usuario tiene classifier.approve.
    const aprobada = b.aprobar === true && (await puedeAprobar(req))
      ? await aprobarVersion(req.tenantId!, req.userId!, String(req.params.id), v.version, req.ip ?? null)
      : null;
    res.status(201).json({ status: 'ok', data: { version: aprobada ?? v, parte: await obtenerParte(req.tenantId!, String(req.params.id)) } });
  } catch (err) { manejar(err, res, next); }
});

// POST /api/catalogo/:id/versiones/:v/aprobar — vigente, reemplaza la anterior
catalogoRouter.post('/:id/versiones/:v/aprobar', requirePermission('classifier', 'approve'), async (req: AuthRequest, res, next) => {
  try {
    const version = Number(req.params.v);
    if (!Number.isInteger(version) || version < 1) return res.status(400).json({ status: 'error', message: 'Versión inválida' });
    await parteEnAlcance(req, String(req.params.id));
    const v = await aprobarVersion(req.tenantId!, req.userId!, String(req.params.id), version, req.ip ?? null);
    res.json({ status: 'ok', data: { version: v, parte: await obtenerParte(req.tenantId!, String(req.params.id)) } });
  } catch (err) { manejar(err, res, next); }
});

// POST /api/catalogo/:id/versiones/:v/rechazar
catalogoRouter.post('/:id/versiones/:v/rechazar', requirePermission('classifier', 'approve'), async (req: AuthRequest, res, next) => {
  try {
    const version = Number(req.params.v);
    if (!Number.isInteger(version) || version < 1) return res.status(400).json({ status: 'error', message: 'Versión inválida' });
    const motivo = typeof (req.body ?? {}).motivo === 'string' ? String(req.body.motivo) : null;
    await parteEnAlcance(req, String(req.params.id));
    const v = await rechazarVersion(req.tenantId!, req.userId!, String(req.params.id), version, motivo, req.ip ?? null);
    res.json({ status: 'ok', data: { version: v, parte: await obtenerParte(req.tenantId!, String(req.params.id)) } });
  } catch (err) { manejar(err, res, next); }
});
