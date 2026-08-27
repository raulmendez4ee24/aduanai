/**
 * Fiscal Guardian — endpoints Ola 2 ("calendario vivo de la certificación").
 * Se montan sobre el mismo `fiscalRouter` (/api/fiscal) desde routes/fiscal.ts.
 */
import type { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { clienteIdDe, validarClienteDelTenant } from '../lib/cliente-contexto';
import { OBLIGACIONES_CERT, AVISOS } from '../lib/certificacion-iva-ieps';
import {
  semaforoCertificacion, registrarAviso, sincronizarRenovacion, listarAvisos,
  conciliacionPeriodo, conciliacionAXlsx, simuladorPerdida, descargarCredito, reporteCreditosXlsx,
} from '../services/fiscal-certificacion';

export function montarFiscalOla2(fiscalRouter: Router): void {
  // 6. Semáforo por obligación (rubro A/AA/AAA)
  fiscalRouter.get('/certificacion/semaforo', authenticate, async (req: AuthRequest, res, next) => {
    try {
      res.json({ status: 'ok', data: await semaforoCertificacion(req.tenantId!, clienteIdDe(req)) });
    } catch (err) { next(err); }
  });

  fiscalRouter.get('/certificacion/catalogo', authenticate, (_req, res) => {
    res.json({ status: 'ok', data: { obligaciones: OBLIGACIONES_CERT.map(({ evaluar: _e, ...o }) => { void _e; return o; }), avisos: Object.values(AVISOS) } });
  });

  // 7. Avisos → ObligacionCalendario (idempotente por tenant + tipo + fecha)
  fiscalRouter.get('/avisos', authenticate, async (req: AuthRequest, res, next) => {
    try {
      res.json({ status: 'ok', data: await listarAvisos(req.tenantId!, clienteIdDe(req)) });
    } catch (err) { next(err); }
  });

  fiscalRouter.post('/avisos', authenticate, async (req: AuthRequest, res, next) => {
    try {
      const { tipo, fechaEvento, descripcion } = req.body ?? {};
      const clienteId = await validarClienteDelTenant(req.tenantId!, clienteIdDe(req));
      if (tipo === 'renovacion') {
        const r = await sincronizarRenovacion(req.tenantId!, clienteId);
        if (!r.obligacion) return res.status(400).json({ status: 'error', message: r.motivo });
        return res.status(r.creada ? 201 : 200).json({ status: 'ok', data: r.obligacion, creada: r.creada });
      }
      if (!tipo || !fechaEvento) return res.status(400).json({ status: 'error', message: 'tipo y fechaEvento requeridos' });
      const r = await registrarAviso(req.tenantId!, { tipo, fechaEvento: String(fechaEvento), descripcion: descripcion ?? null, clienteId, responsableUserId: req.userId ?? null });
      res.status(r.creada ? 201 : 200).json({ status: 'ok', data: r.obligacion, creada: r.creada });
    } catch (err) { next(err); }
  });

  // 8. Conciliación crédito fiscal vs Anexo 30
  fiscalRouter.get('/conciliacion', authenticate, async (req: AuthRequest, res, next) => {
    try {
      const periodo = String(req.query.periodo || '').trim();
      if (!periodo) return res.status(400).json({ status: 'error', message: 'periodo requerido (AAAA-Qn, AAAA-MM o AAAA)' });
      res.json({ status: 'ok', data: await conciliacionPeriodo(req.tenantId!, clienteIdDe(req), periodo) });
    } catch (err) { next(err); }
  });

  fiscalRouter.get('/conciliacion/export.xlsx', authenticate, async (req: AuthRequest, res, next) => {
    try {
      const periodo = String(req.query.periodo || '').trim();
      if (!periodo) return res.status(400).json({ status: 'error', message: 'periodo requerido' });
      const c = await conciliacionPeriodo(req.tenantId!, clienteIdDe(req), periodo);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="conciliacion-anexo30-${c.periodo.periodo}.xlsx"`);
      res.send(conciliacionAXlsx(c));
    } catch (err) { next(err); }
  });

  // 9. Simulador "si pierdes la certificación" (números reales; % de garantía editable)
  fiscalRouter.get('/simulador-perdida', authenticate, async (req: AuthRequest, res, next) => {
    try {
      const raw = req.query.pctGarantia;
      const pct = raw === undefined || raw === '' ? null : Number(raw);
      if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) return res.status(400).json({ status: 'error', message: 'pctGarantia debe estar entre 0 y 100' });
      res.json({ status: 'ok', data: await simuladorPerdida(req.tenantId!, clienteIdDe(req), { pctGarantia: pct }) });
    } catch (err) { next(err); }
  });

  // 10. Descargo del crédito como flujo (+ audit trail) y reporte
  fiscalRouter.post('/creditos/:id/descargar', authenticate, async (req: AuthRequest, res, next) => {
    try {
      const { monto, ivaApplied, iepsApplied, pedimentoDescargo, fecha } = req.body ?? {};
      if (!pedimentoDescargo || !fecha) return res.status(400).json({ status: 'error', message: 'pedimentoDescargo y fecha requeridos' });
      const r = await descargarCredito({
        creditId: String(req.params.id), tenantId: req.tenantId!, userId: req.userId ?? null,
        monto: monto != null ? Number(monto) : null, ivaApplied: ivaApplied != null ? Number(ivaApplied) : null, iepsApplied: iepsApplied != null ? Number(iepsApplied) : null,
        pedimentoDescargo: String(pedimentoDescargo), fecha: String(fecha), ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null,
      });
      res.status(201).json({ status: 'ok', data: r });
    } catch (err) { next(err); }
  });

  fiscalRouter.get('/creditos/reporte.xlsx', authenticate, async (req: AuthRequest, res, next) => {
    try {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="creditos-fiscales-descargos.xlsx"');
      res.send(await reporteCreditosXlsx(req.tenantId!, clienteIdDe(req)));
    } catch (err) { next(err); }
  });
}
