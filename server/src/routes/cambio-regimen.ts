/**
 * /api/cambio-regimen — Asistente F4/F5/A3/RT (Operación 2026-08).
 *
 *   GET  /tipos                 tipos + checklist documental por tipo
 *   GET  /candidatas            TemporaryImport con saldo del tenant (para seleccionar; ?ids= para prellenar)
 *   POST /calcular              { temporaryImportIds, tipo, tc?, actualizacionMXN?, recargosMXN? } → cálculo (sin persistir)
 *   POST /                      crea el expediente (cálculo + folio)
 *   GET  /                      lista
 *   GET  /:id                   detalle
 *   GET  /:id/imprimible        vista imprimible con folio (print CSS, sin librerías)
 *   PATCH /:id                  estado/notas/actualización/recargos
 */
import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';
import { clienteIdDe, validarClienteDelTenant } from '../lib/cliente-contexto';
import {
  TIPOS_CAMBIO, DOCUMENTOS_REQUERIDOS, DESCRIPCION_TIPO, calcularCambioRegimen, crearExpediente,
  listarExpedientes, obtenerExpediente, actualizarExpediente, type TipoCambio, type CalculoExpediente,
} from '../services/cambio-regimen';

export const cambioRegimenRouter = Router();
cambioRegimenRouter.use(authenticate);

const num = (v: unknown): number | undefined => (v === undefined || v === null || v === '' ? undefined : Number(v));

cambioRegimenRouter.get('/tipos', (_req, res) => {
  res.json({ status: 'ok', data: TIPOS_CAMBIO.map(t => ({ tipo: t, descripcion: DESCRIPCION_TIPO[t], documentos: DOCUMENTOS_REQUERIDOS[t] })) });
});

cambioRegimenRouter.get('/candidatas', async (req: AuthRequest, res, next) => {
  try {
    const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',').map(s => s.trim()).filter(Boolean) : [];
    const clienteId = clienteIdDe(req);
    const rows = await prisma.temporaryImport.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(ids.length > 0 ? { id: { in: ids } } : { status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED', 'EXPIRED'] }, ...(clienteId ? { clienteId } : {}) }),
      },
      orderBy: { expirationDate: 'asc' }, take: 200,
      select: { id: true, pedimento: true, fractionCode: true, description: true, quantity: true, quantityDischarged: true, unit: true, customsValue: true, expirationDate: true, status: true, tipo: true, clienteId: true },
    });
    res.json({ status: 'ok', data: rows.map(r => ({ ...r, saldo: Math.max(0, r.quantity - r.quantityDischarged) })) });
  } catch (err) { next(err); }
});

cambioRegimenRouter.post('/calcular', async (req: AuthRequest, res, next) => {
  try {
    const ids = Array.isArray(req.body?.temporaryImportIds) ? req.body.temporaryImportIds.map(String) : [];
    const calculo = await calcularCambioRegimen(req.tenantId!, ids, {
      tipo: String(req.body?.tipo ?? 'F4') as TipoCambio,
      tc: num(req.body?.tc), tcFuente: req.body?.tc != null ? 'manual' : undefined,
      actualizacionMXN: num(req.body?.actualizacionMXN), recargosMXN: num(req.body?.recargosMXN),
    });
    res.json({ status: 'ok', data: calculo });
  } catch (err) { next(err); }
});

cambioRegimenRouter.post('/', requirePermission('inventory', 'adjust'), async (req: AuthRequest, res, next) => {
  try {
    const ids = Array.isArray(req.body?.temporaryImportIds) ? req.body.temporaryImportIds.map(String) : [];
    const clienteId = await validarClienteDelTenant(req.tenantId!, req.body?.clienteId ?? clienteIdDe(req));
    const exp = await crearExpediente({
      tenantId: req.tenantId!, userId: req.userId!, clienteId, ids,
      opts: {
        tipo: String(req.body?.tipo ?? 'F4') as TipoCambio,
        tc: num(req.body?.tc), tcFuente: req.body?.tc != null ? 'manual' : undefined,
        actualizacionMXN: num(req.body?.actualizacionMXN), recargosMXN: num(req.body?.recargosMXN),
      },
      notas: typeof req.body?.notas === 'string' ? req.body.notas : null,
    });
    res.status(201).json({ status: 'ok', data: exp });
  } catch (err) { next(err); }
});

cambioRegimenRouter.get('/', async (req: AuthRequest, res, next) => {
  try { res.json({ status: 'ok', data: await listarExpedientes(req.tenantId!, clienteIdDe(req)) }); } catch (err) { next(err); }
});

cambioRegimenRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const exp = await obtenerExpediente(req.tenantId!, String(req.params.id));
    if (!exp) return res.status(404).json({ status: 'error', message: 'Expediente no encontrado' });
    res.json({ status: 'ok', data: exp });
  } catch (err) { next(err); }
});

cambioRegimenRouter.patch('/:id', requirePermission('inventory', 'adjust'), async (req: AuthRequest, res, next) => {
  try {
    const exp = await actualizarExpediente(req.tenantId!, String(req.params.id), {
      estado: typeof req.body?.estado === 'string' ? req.body.estado : undefined,
      notas: req.body?.notas === undefined ? undefined : (req.body.notas === null ? null : String(req.body.notas)),
      actualizacionMXN: num(req.body?.actualizacionMXN), recargosMXN: num(req.body?.recargosMXN),
    });
    if (!exp) return res.status(404).json({ status: 'error', message: 'Expediente no encontrado' });
    res.json({ status: 'ok', data: exp });
  } catch (err) { next(err); }
});

const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mxn = (n: number): string => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

cambioRegimenRouter.get('/:id/imprimible', async (req: AuthRequest, res, next) => {
  try {
    const exp = await obtenerExpediente(req.tenantId!, String(req.params.id));
    if (!exp) return res.status(404).json({ status: 'error', message: 'Expediente no encontrado' });
    const c = exp.calculo as unknown as CalculoExpediente & { folio?: string };
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { name: true, rfc: true } });
    const cliente = exp.clienteId ? await prisma.cliente.findFirst({ where: { id: exp.clienteId, tenantId: req.tenantId! }, select: { razonSocial: true, rfc: true } }) : null;
    const filas = c.partidas.map(p => `<tr><td class="mono">${esc(p.pedimento)}</td><td class="mono">${esc(p.fractionCode)}</td><td>${esc(p.description)}</td><td class="num">${p.saldoCantidad} ${esc(p.unit)}</td><td class="num">${mxn(p.saldoValorMXN)}</td><td class="num">${p.tasas.igiPct}% → ${mxn(p.montos.igi)}</td><td class="num">${mxn(p.montos.dta)}</td><td class="num">${mxn(p.montos.ieps)}</td><td class="num">${mxn(p.montos.iva)}</td><td class="num"><strong>${mxn(p.montos.total)}</strong></td></tr>${p.notas.length ? `<tr><td colspan="10" class="nota">${p.notas.map(esc).join(' · ')}</td></tr>` : ''}`).join('');
    const docs = c.documentos.map(d => `<li>☐ ${esc(d.label)}${d.obligatorio ? '' : ' <em>(opcional)</em>'}</li>`).join('');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Expediente ${esc(c.folio ?? exp.id)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px;font-size:12px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:20px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .folio{font-family:Courier New,monospace;font-size:13px} .meta{color:#555;margin:0 0 12px}
  table{width:100%;border-collapse:collapse;margin-top:6px} th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
  th{background:#f3f3f3;font-size:11px} .num{text-align:right;white-space:nowrap} .mono{font-family:Courier New,monospace}
  .nota{color:#7a4b00;background:#fff8e6;font-size:11px} .tot td{font-weight:700;background:#fafafa}
  .aviso{border:1px solid #e6c200;background:#fffbe6;padding:8px 10px;margin:10px 0} ul{margin:4px 0;padding-left:18px}
  .firma{margin-top:40px;display:flex;gap:40px} .firma div{flex:1;border-top:1px solid #333;padding-top:4px;text-align:center}
  @media print{body{margin:12mm} .noprint{display:none}}
</style></head><body>
<div class="noprint" style="margin-bottom:12px"><button onclick="window.print()">Imprimir / guardar PDF</button></div>
<h1>Expediente de ${esc(c.tipo)} — ${esc(c.descripcion)}</h1>
<p class="folio">Folio ${esc(c.folio ?? exp.id)} · estado: ${esc(exp.estado)} · generado ${esc(exp.createdAt.toISOString().slice(0, 10))}</p>
<p class="meta">${esc(tenant?.name)}${tenant?.rfc ? ` (${esc(tenant.rfc)})` : ''}${cliente ? ` · Cliente: ${esc(cliente.razonSocial)} (${esc(cliente.rfc)})` : ''}${c.clavePedimento ? ` · Clave de pedimento ${esc(c.clavePedimento.clave)}: ${esc(c.clavePedimento.descripcion)} (Anexo 22 Ap. 2)` : ''}</p>
<p class="meta">Tipo de cambio ${c.tc.valor} MXN/USD (${esc(c.tc.fuente)}${c.tc.fecha ? `, ${esc(c.tc.fecha.slice(0, 10))}` : ''}). Cálculo con el motor del Cotizador: IGI/DTA/IEPS/IVA sobre el saldo (Art. 27 LIVA para la base del IVA).</p>
<h2>Partidas (${c.partidas.length})</h2>
<table><thead><tr><th>Pedimento</th><th>Fracción</th><th>Descripción</th><th>Saldo</th><th>Valor saldo MXN</th><th>IGI</th><th>DTA</th><th>IEPS</th><th>IVA</th><th>Contribuciones</th></tr></thead>
<tbody>${filas}<tr class="tot"><td colspan="4">Subtotales</td><td class="num">${mxn(c.subtotales.saldoValorMXN)}</td><td class="num">${mxn(c.subtotales.igi)}</td><td class="num">${mxn(c.subtotales.dta)}</td><td class="num">${mxn(c.subtotales.ieps)}</td><td class="num">${mxn(c.subtotales.iva)}</td><td class="num">${mxn(c.subtotales.contribuciones)}</td></tr></tbody></table>
<h2>Accesorios (captura manual)</h2>
<table><tr><td>Actualización</td><td class="num">${mxn(c.actualizacion.montoMXN)}</td><td>${esc(c.actualizacion.fundamento)}</td></tr>
<tr><td>Recargos</td><td class="num">${mxn(c.recargos.montoMXN)}</td><td>${esc(c.recargos.fundamento)}</td></tr>
<tr class="tot"><td>Total a pagar</td><td class="num">${mxn(c.total)}</td><td></td></tr></table>
${c.advertencias.length ? `<div class="aviso"><strong>Advertencias</strong><ul>${c.advertencias.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
<h2>Documentos del expediente (checklist operativo)</h2><ul>${docs}</ul>
${exp.notas ? `<h2>Notas</h2><p>${esc(exp.notas)}</p>` : ''}
<div class="firma"><div>Elaboró</div><div>Revisó (agente / representante legal)</div></div>
<p class="meta" style="margin-top:24px">Documento de trabajo generado por ADUANAI. No sustituye la determinación del pedimento ni la opinión del agente aduanal.</p>
</body></html>`);
  } catch (err) { next(err); }
});
