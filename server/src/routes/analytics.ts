/**
 * Analytics real (Ola 3).
 *   GET /api/analytics?days=90|&desde=&hasta=[&clienteId=]  → tres preguntas (ahorro/riesgo/equipo)
 *   GET /api/analytics/export.xlsx (mismos filtros)          → Excel con una hoja por bloque
 * El cliente activo llega por X-Cliente-Id o ?clienteId= (filtroCliente).
 */
import { Router } from 'express';
import * as XLSX from 'xlsx';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { clienteIdDe } from '../lib/cliente-contexto';
import { AppError } from '../middlewares/error';
import { calcularAnalytics, type AnalyticsReal } from '../services/analytics';

export const analyticsRouter = Router();

function periodoDe(req: AuthRequest): { desde: Date; hasta: Date } {
  const hasta = req.query.hasta ? new Date(String(req.query.hasta)) : new Date();
  const days = Math.min(3650, Math.max(1, Number(req.query.days) || 90));
  const desde = req.query.desde ? new Date(String(req.query.desde)) : new Date(hasta.getTime() - days * 86400000);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) throw new AppError('Periodo inválido (desde/hasta ISO)', 400);
  return { desde, hasta };
}

analyticsRouter.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { desde, hasta } = periodoDe(req);
    const data = await calcularAnalytics({ tenantId: req.tenantId!, clienteId: clienteIdDe(req) ?? undefined, desde, hasta });
    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});

function hojas(a: AnalyticsReal): Record<string, Record<string, unknown>[]> {
  const lin = (l: AnalyticsReal['ahorro']['tmecNoAplicado']['lineas'][number]) => ({
    origen: l.origen, id: l.id, fecha: l.fecha.slice(0, 10), fraccion: l.fractionCode, pais: l.pais, valorUSD: l.valorUSD,
    tasaAplicada: l.tasaAplicada, tasaGeneral: l.tasaGeneral, tasaPreferencial: l.tasaPreferencial, ahorroUSD: l.ahorroUSD, detalle: l.detalle,
  });
  return {
    Resumen: [
      { concepto: 'Periodo', valor: `${a.filtro.desde.slice(0, 10)} → ${a.filtro.hasta.slice(0, 10)}`, formula: '' },
      { concepto: 'Cliente', valor: a.filtro.clienteId ?? '(todos)', formula: '' },
      { concepto: 'Clasificaciones (total, = Historial)', valor: a.totales.clasificaciones, formula: a.totales.formula },
      { concepto: 'Cotizaciones (total)', valor: a.totales.cotizaciones, formula: a.totales.formula },
      { concepto: 'Clasificaciones en periodo', valor: a.totales.clasificacionesPeriodo, formula: '' },
      { concepto: 'Cotizaciones en periodo', valor: a.totales.cotizacionesPeriodo, formula: '' },
      { concepto: 'Ahorro T-MEC no aplicado (USD)', valor: a.ahorro.tmecNoAplicado.totalUSD, formula: a.ahorro.tmecNoAplicado.formula },
      { concepto: 'Partidas sin tasa en catálogo (no suman)', valor: a.ahorro.tmecNoAplicado.sinTasa, formula: '' },
      { concepto: 'PROSEC no usado (USD)', valor: a.ahorro.prosecNoUsado.totalUSD, formula: a.ahorro.prosecNoUsado.formula },
      { concepto: 'Ahorro aplicado (USD)', valor: a.ahorro.aplicado.totalUSD, formula: a.ahorro.aplicado.formula },
      { concepto: 'Evaluaciones Risk Scorer', valor: a.riesgo.riskScorer.evaluaciones, formula: '' },
    ],
    'TMEC no aplicado': a.ahorro.tmecNoAplicado.lineas.map(lin),
    'PROSEC no usado': a.ahorro.prosecNoUsado.lineas.map(l => ({ ...lin(l), sector: l.sector, cotejadoDOF: l.cotejado ? 'sí' : 'no' })),
    'Ahorro aplicado': a.ahorro.aplicado.lineas.map(lin),
    'Fracciones sensibles': a.riesgo.fraccionesSensibles.map(s => ({ fraccion: s.fractionCode, apariciones: s.apariciones, valorUSD: s.valorUSD, cuotasCompensatorias: s.cuotaCompensatoria.count, paisesCuota: s.cuotaCompensatoria.paises.join(', '), nomObligatoria: s.nomObligatoria.join(', '), precioEstimado: s.precioEstimado ? 'sí' : 'no', anexo10: s.anexo10 ?? '' })),
    Aduanas: a.riesgo.aduanas.map(x => ({ aduana: x.customsCode, simulaciones: x.simulaciones, raPromedio: x.raPromedio, riesgoPromedio: x.riesgoPromedio, nivelAlto: x.nivelAlto })),
    Equipo: a.equipo.porUsuario.map(u => ({ usuario: u.nombre, email: u.email, clasificaciones: u.clasificaciones, validadas: u.validadas, correctas: u.correctas, pctValidado: u.pctValidado, pctCorrecto: u.pctCorrecto, tiempoMedioSeg: u.tiempoMedioSeg, jobs: u.jobs })),
  };
}

analyticsRouter.get('/export.xlsx', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { desde, hasta } = periodoDe(req);
    const data = await calcularAnalytics({ tenantId: req.tenantId!, clienteId: clienteIdDe(req) ?? undefined, desde, hasta });
    const wb = XLSX.utils.book_new();
    for (const [nombre, filas] of Object.entries(hojas(data))) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [{ nota: 'sin datos en el periodo' }]), nombre.slice(0, 31));
    }
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="analytics-${data.filtro.desde.slice(0, 10)}-${data.filtro.hasta.slice(0, 10)}.xlsx"`);
    res.send(buf);
  } catch (err) {
    next(err);
  }
});
