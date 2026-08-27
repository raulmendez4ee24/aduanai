/**
 * Inventario IMMEX — Anexo 24 real (Ola 1, 27-ago-2026). Se monta en
 * `/api/inventory` junto al router legacy (`inventory.ts`): control por
 * pedimento-partida y número de parte, PEPS, BOM con mermas, activo fijo,
 * submaquila, cierre mensual, reporte de autoridad y simulador de exposición.
 */
import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';
import { clienteIdDe, validarClienteDelTenant } from '../lib/cliente-contexto';
import { recordAudit } from '../services/audit-service';
import { altaDesdePedimento, pedimentosParaAlta } from '../services/anexo24-alta';
import { descargarPeps, saldosPorParte } from '../services/anexo24-peps';
import { retornoDesdeBom } from '../services/anexo24-bom';
import { cerrarPeriodo, listarCierres, ultimoPeriodoCerrado, assertPeriodoAbierto } from '../services/anexo24-cierre';
import { generarReporteAnexo24, reporteAnexo24Xlsx } from '../services/anexo24-reporte';
import { calcularExposicion } from '../services/anexo24-exposicion';
import { CATALOGO_PLAZOS_IMMEX, PLAZO_GENERAL_MESES } from '../lib/plazos-immex';

export const anexo24Router = Router();

function fechaDe(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Catálogo de plazos (para UI y auditoría) ──────────────────────────────
anexo24Router.get('/plazos-immex', authenticate, (_req, res) => {
  res.json({ status: 'ok', data: { general: PLAZO_GENERAL_MESES, catalogo: CATALOGO_PLAZOS_IMMEX } });
});

// ── 1. Alta desde pedimento persistido ────────────────────────────────────
anexo24Router.get('/pedimentos-para-alta', authenticate, async (req: AuthRequest, res, next) => {
  try {
    res.json({ status: 'ok', data: await pedimentosParaAlta(req.tenantId!, clienteIdDe(req)) });
  } catch (err) { next(err); }
});

anexo24Router.post('/desde-pedimento/:pedimentoId', authenticate, requirePermission('inventory', 'adjust'), async (req: AuthRequest, res, next) => {
  try {
    const clienteId = await validarClienteDelTenant(req.tenantId!, clienteIdDe(req));
    const b = req.body ?? {};
    const r = await altaDesdePedimento({
      tenantId: req.tenantId!,
      userId: req.userId!,
      pedimentoId: String(req.params.pedimentoId),
      fechaEntrada: fechaDe(b.fechaEntrada),
      clienteId,
      vidaUtilMeses: b.vidaUtilMeses != null && Number.isFinite(Number(b.vidaUtilMeses)) ? Number(b.vidaUtilMeses) : null,
      ubicacionId: typeof b.ubicacionId === 'string' && b.ubicacionId ? b.ubicacionId : null,
      esAnexoIBis: !!b.esAnexoIBis,
      esAnexoITer: !!b.esAnexoITer,
    });
    res.status(r.creadas > 0 ? 201 : 200).json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

// ── Vistas: por parte, por pedimento-partida, activo fijo, submaquila ─────
anexo24Router.get('/partes', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tipo = req.query.tipo === 'ACTIVO_FIJO' ? 'ACTIVO_FIJO' : req.query.tipo === 'INSUMO' ? 'INSUMO' : undefined;
    res.json({ status: 'ok', data: await saldosPorParte(req.tenantId!, { clienteId: clienteIdDe(req), tipo }) });
  } catch (err) { next(err); }
});

anexo24Router.get('/pedimento-partidas', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const clienteId = clienteIdDe(req);
    const soloAbiertas = req.query.abiertas !== 'false';
    const imports = await prisma.temporaryImport.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(soloAbiertas ? { status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] } } : {}),
        ...(clienteId ? { clienteId } : {}),
      },
      include: {
        product: { select: { id: true, productCode: true } },
        ubicacion: { select: { id: true, nombre: true, tipo: true } },
        discharges: { select: { id: true, type: true, quantity: true, dischargeDate: true, pedimento: true, constanciaTransferencia: true, assemblyId: true }, orderBy: { dischargeDate: 'asc' } },
      },
      orderBy: [{ pedimento: 'asc' }, { entryDate: 'asc' }],
      take: 500,
    });
    const partidaIds = imports.map(i => i.pedimentoPartidaId).filter((x): x is string => !!x);
    const partidas = partidaIds.length > 0
      ? await prisma.pedimentoPartida.findMany({ where: { id: { in: partidaIds }, pedimento: { tenantId: req.tenantId! } }, select: { id: true, numeroPartida: true, pedimentoId: true } })
      : [];
    const np = new Map(partidas.map(p => [p.id, p]));
    res.json({
      status: 'ok',
      data: imports.map(i => ({
        ...i,
        saldo: i.quantity - i.quantityDischarged,
        vigenciaPrograma: i.tipo === 'ACTIVO_FIJO',
        expirationDate: i.tipo === 'ACTIVO_FIJO' ? null : i.expirationDate,
        numeroPartida: i.pedimentoPartidaId ? (np.get(i.pedimentoPartidaId)?.numeroPartida ?? null) : null,
        pedimentoId: i.pedimentoPartidaId ? (np.get(i.pedimentoPartidaId)?.pedimentoId ?? null) : null,
      })),
    });
  } catch (err) { next(err); }
});

// ── 2. Descargo PEPS ──────────────────────────────────────────────────────
anexo24Router.post('/descargar-peps', authenticate, requirePermission('inventory', 'discharge'), async (req: AuthRequest, res, next) => {
  try {
    const b = req.body ?? {};
    const fecha = fechaDe(b.fecha);
    if (!fecha) return res.status(400).json({ status: 'error', message: 'fecha (ISO) es requerida' });
    if (!b.productId && !b.fractionCode) return res.status(400).json({ status: 'error', message: 'productId o fractionCode es requerido' });
    if (!b.tipo) return res.status(400).json({ status: 'error', message: 'tipo es requerido (RT, V1, F4, venta)' });
    const clienteId = await validarClienteDelTenant(req.tenantId!, clienteIdDe(req));
    const r = await descargarPeps({
      tenantId: req.tenantId!,
      userId: req.userId!,
      productId: b.productId ?? null,
      fractionCode: b.fractionCode ? String(b.fractionCode).replace(/\D/g, '') : null,
      cantidad: Number(b.cantidad),
      tipo: String(b.tipo),
      pedimentoDescargo: b.pedimentoDescargo ?? null,
      constanciaTransferencia: b.constanciaTransferencia ?? null,
      fecha,
      clienteId,
      customsValue: b.customsValue != null ? Number(b.customsValue) : null,
      destinationCountry: b.destinationCountry ?? null,
      buyerName: b.buyerName ?? null,
      taxesPaid: b.taxesPaid != null ? Number(b.taxesPaid) : null,
      notes: b.notes ?? null,
    });
    await recordAudit({
      tenantId: req.tenantId!, userId: req.userId!, action: 'inventory.descargo_peps', entity: 'Discharge',
      entityId: r.descargos[0]?.dischargeId ?? null, after: r,
      metadata: { lotes: r.descargos.length, cantidad: r.cantidad, tipo: r.tipo },
    });
    res.status(201).json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

// ── 3. Retorno desde BOM (con mermas) ─────────────────────────────────────
anexo24Router.post('/retorno-desde-bom', authenticate, requirePermission('inventory', 'discharge'), async (req: AuthRequest, res, next) => {
  try {
    const b = req.body ?? {};
    const fecha = fechaDe(b.fecha);
    if (!fecha) return res.status(400).json({ status: 'error', message: 'fecha (ISO) es requerida' });
    if (!b.productId) return res.status(400).json({ status: 'error', message: 'productId (producto terminado) es requerido' });
    const clienteId = await validarClienteDelTenant(req.tenantId!, clienteIdDe(req));
    const r = await retornoDesdeBom({
      tenantId: req.tenantId!,
      userId: req.userId!,
      productId: String(b.productId),
      cantidad: Number(b.cantidad),
      tipo: b.tipo ? String(b.tipo) : 'RT',
      pedimento: b.pedimento ?? null,
      constanciaTransferencia: b.constanciaTransferencia ?? null,
      fecha,
      referencia: b.referencia ?? null,
      notas: b.notas ?? null,
      clienteId,
    });
    await recordAudit({
      tenantId: req.tenantId!, userId: req.userId!, action: 'inventory.retorno_desde_bom', entity: 'Assembly', entityId: r.assemblyId,
      after: { producto: r.producto.productCode, cantidad: r.cantidad, componentes: r.consumos.length },
      metadata: { assemblyId: r.assemblyId, mermas: r.mermas.totalPorComponente },
    });
    res.status(201).json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

// ── 5. Traslado a ubicación / submaquila ──────────────────────────────────
anexo24Router.post('/imports/:id/traslado', authenticate, requirePermission('inventory', 'adjust'), async (req: AuthRequest, res, next) => {
  try {
    const b = req.body ?? {};
    const imp = await prisma.temporaryImport.findFirst({ where: { id: String(req.params.id), tenantId: req.tenantId! }, include: { ubicacion: true } });
    if (!imp) return res.status(404).json({ status: 'error', message: 'Importación no encontrada' });
    const fecha = fechaDe(b.fecha) ?? new Date();
    await assertPeriodoAbierto(prisma, req.tenantId!, fecha, 'trasladar mercancía');
    const destino = b.ubicacionId ? await prisma.ubicacion.findFirst({ where: { id: String(b.ubicacionId), tenantId: req.tenantId!, activo: true } }) : null;
    if (b.ubicacionId && !destino) return res.status(404).json({ status: 'error', message: 'Ubicación destino no encontrada' });
    const avisos: string[] = [];
    if (destino?.tipo === 'SUBMAQUILA' && !destino.avisoSubmaquila) {
      avisos.push(`La submaquila "${destino.nombre}" no tiene folio de aviso ante la SE registrado: el traslado queda documentado, pero sin aviso la operación no está amparada.`);
    }
    const nota = `[traslado ${fecha.toISOString().slice(0, 10)}] ${imp.ubicacion?.nombre ?? 'planta (sin ubicación)'} → ${destino?.nombre ?? 'planta (sin ubicación)'}${b.notas ? `: ${b.notas}` : ''}`;
    const actualizado = await prisma.temporaryImport.update({
      where: { id: imp.id },
      data: { ubicacionId: destino?.id ?? null, notes: imp.notes ? `${imp.notes}\n${nota}` : nota },
      include: { ubicacion: { select: { id: true, nombre: true, tipo: true, avisoSubmaquila: true } } },
    });
    await recordAudit({
      tenantId: req.tenantId!, userId: req.userId!, action: 'inventory.traslado_ubicacion', entity: 'TemporaryImport', entityId: imp.id,
      before: { ubicacionId: imp.ubicacionId }, after: { ubicacionId: destino?.id ?? null },
      metadata: { destino: destino?.nombre ?? null, tipo: destino?.tipo ?? null, avisoSubmaquila: destino?.avisoSubmaquila ?? null, fecha: fecha.toISOString() },
    });
    res.json({ status: 'ok', data: actualizado, avisos });
  } catch (err) { next(err); }
});

// ── 6. Cierre mensual ─────────────────────────────────────────────────────
anexo24Router.get('/cierres', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const [cierres, ultimo] = await Promise.all([listarCierres(req.tenantId!), ultimoPeriodoCerrado(prisma, req.tenantId!)]);
    res.json({ status: 'ok', data: cierres.map(c => ({ ...c, resumen: undefined, totales: (c.resumen as { totales?: unknown } | null)?.totales ?? null })), ultimoPeriodoCerrado: ultimo?.periodo ?? null });
  } catch (err) { next(err); }
});

anexo24Router.post('/cierres', authenticate, requirePermission('inventory', 'adjust'), async (req: AuthRequest, res, next) => {
  try {
    const periodo = String(req.body?.periodo ?? '');
    const clienteId = await validarClienteDelTenant(req.tenantId!, clienteIdDe(req));
    const r = await cerrarPeriodo({ tenantId: req.tenantId!, userId: req.userId!, periodo, clienteId, notas: req.body?.notas ?? null });
    res.status(201).json({ status: 'ok', data: { cierre: { ...r.cierre, resumen: undefined }, resumen: r.resumen } });
  } catch (err) { next(err); }
});

// ── 7. Reporte Anexo 24 (JSON / xlsx) ─────────────────────────────────────
anexo24Router.get('/anexo24/reporte', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const periodo = String(req.query.periodo ?? '');
    const r = await generarReporteAnexo24(req.tenantId!, periodo, clienteIdDe(req));
    if (req.query.formato === 'xlsx') {
      const buf = reporteAnexo24Xlsx(r);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="anexo24-${periodo}-${r.folio}.xlsx"`);
      return res.send(buf);
    }
    res.json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

// ── 8. Simulador de exposición ────────────────────────────────────────────
anexo24Router.get('/exposicion/:temporaryImportId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    res.json({ status: 'ok', data: await calcularExposicion(req.tenantId!, String(req.params.temporaryImportId)) });
  } catch (err) { next(err); }
});
