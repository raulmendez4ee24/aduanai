/**
 * RISK SCORER — API (docs/RISK_SCORER_DESIGN.md §6).
 * POST /api/risk/assess · GET /api/risk/assessments · GET /api/risk/assessments/:id
 * GET/PUT /api/risk/weights (PUT solo SUPERADMIN: los pesos son globales, Σ=100 validada)
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { evaluate } from '../services/risk-scorer/engine';
import { buildVerifiedSignals, normalizarOperacion } from '../services/risk-scorer/signals';
import { DEFAULT_WEIGHTS, RULES_VERSION } from '../services/risk-scorer/rules';
import type { Signals } from '../services/risk-scorer/types';

const router = Router();
router.use(authenticate);

const boolish = z.boolean().nullish();
/** Checklist declarativo — compartido con el lector de pedimentos (lote). */
export const declaradoSchema = z.object({
  mveTransmitida: boolish, expedienteKyc: boolish, expediente162VII: boolish,
  controlInterno81A: boolish, encargoConferido: boolish,
  padronImportadoresVigente: boolish,
  padronesActivos: z.array(z.string().max(4)).max(20).optional(),
  evidenciaNoms: boolish, documentoRrnaAmparaMercancia: boolish,
  certOrigen9Elementos: boolish, incrementablesConSoporte: boolish,
  pagoConSoporteBancario: boolish, proveedorLocalizable: boolish,
  causalSuspensionPadron: boolish, vinculacionConCliente: boolish,
  rutaTercerPaisEnsamblador: boolish, pruebaOrigenDistinto: boolish,
  transferenciaDeTemporales: boolish,
  expediente59V: z.object({
    a: boolish, b: boolish, c: boolish, d: boolish,
    e: boolish, f: boolish, g: boolish, h: boolish,
  }).optional(),
  constancia32D: boolish, mveEspejoAgencia: boolish,
});
const assessSchema = z.object({
  tipoSujeto: z.enum(['agente', 'agencia']).default('agente'),
  operacion: z.object({
    fraccion: z.string().max(20).optional(),
    nico: z.string().max(4).optional(),
    valorUnitario: z.number().nonnegative().optional(),
    cantidad: z.number().nonnegative().optional(),
    moneda: z.string().max(8).optional(),
    paisOrigen: z.string().max(3).optional(),
    paisProcedencia: z.string().max(3).optional(),
    regimen: z.string().max(8).optional(),
    clavePedimento: z.string().max(4).optional(),
    numeroPedimento: z.string().max(30).optional(),
    importadorRfc: z.string().max(14).optional(),
    preferenciaArancelaria: z.boolean().optional(),
  }).default({}),
  declarado: declaradoSchema.default({}),
});

async function getWeights(): Promise<Record<string, number>> {
  const rows = await prisma.riskFactorWeight.findMany();
  if (rows.length === 0) return DEFAULT_WEIGHTS;
  return Object.fromEntries(rows.map(r => [r.factor, r.peso]));
}

router.post('/assess', async (req: AuthRequest, res: Response) => {
  const parsed = assessSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', message: 'Entrada inválida', issues: parsed.error.issues.slice(0, 5) });
  }
  const { tipoSujeto, operacion, declarado } = parsed.data;
  const tieneIdentificador = [operacion.fraccion, operacion.importadorRfc, operacion.numeroPedimento]
    .some(valor => typeof valor === 'string' && valor.trim().length > 0);
  if (!tieneIdentificador) {
    return res.status(422).json({
      status: 'error',
      message: 'La evaluación requiere al menos un identificador de la operación (fracción arancelaria, RFC del importador o número de pedimento)',
    });
  }
  const op = normalizarOperacion(operacion);
  const verificado = await buildVerifiedSignals(req.tenantId!, op);
  const signals: Signals = {
    tipoSujeto,
    fechaEvaluacion: new Date().toISOString().slice(0, 10),
    operacion: op,
    declarado,
    verificado,
  };
  const weights = await getWeights();
  const resultado = evaluate(signals, weights);

  const saved = await prisma.riskAssessment.create({
    data: {
      tenantId: req.tenantId!,
      userId: req.userId!,
      input: JSON.parse(JSON.stringify(signals)),
      exposicion: resultado.exposicion,
      escudoPct: resultado.escudoPct,
      banda: resultado.banda,
      detalle: JSON.parse(JSON.stringify(resultado.factores)),
      checklist: JSON.parse(JSON.stringify(resultado.checklist)),
      rulesVersion: resultado.rulesVersion,
      pesosSnapshot: weights,
    },
    select: { id: true },
  });

  res.json({ status: 'ok', data: { ...resultado, assessmentId: saved.id } });
});

router.get('/assessments', async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const take = 20;
  const [rows, total] = await Promise.all([
    prisma.riskAssessment.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      select: { id: true, exposicion: true, escudoPct: true, banda: true, rulesVersion: true, createdAt: true },
      skip: (page - 1) * take, take,
    }),
    prisma.riskAssessment.count({ where: { tenantId: req.tenantId! } }),
  ]);
  res.json({ status: 'ok', data: rows, total, page });
});

router.get('/assessments/:id', async (req: AuthRequest, res: Response) => {
  const row = await prisma.riskAssessment.findFirst({
    where: { id: String(req.params.id), tenantId: req.tenantId! },
  });
  if (!row) return res.status(404).json({ status: 'error', message: 'Evaluación no encontrada' });
  res.json({ status: 'ok', data: row });
});

router.get('/weights', async (_req: AuthRequest, res: Response) => {
  res.json({ status: 'ok', data: await getWeights(), rulesVersion: RULES_VERSION });
});

router.put('/weights', requireRole('SUPERADMIN'), async (req: AuthRequest, res: Response) => {
  const schema = z.record(z.string(), z.number().int().min(0).max(100));
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ status: 'error', message: 'Pesos inválidos' });
  const pesos = parsed.data;
  const factores = Object.keys(DEFAULT_WEIGHTS);
  if (Object.keys(pesos).sort().join(',') !== factores.sort().join(',')) {
    return res.status(400).json({ status: 'error', message: `Se requieren exactamente los factores: ${factores.join(', ')}` });
  }
  const suma = Object.values(pesos).reduce((a, b) => a + b, 0);
  if (suma !== 100) return res.status(400).json({ status: 'error', message: `La suma de pesos debe ser 100 (recibido: ${suma})` });
  for (const [factor, peso] of Object.entries(pesos)) {
    await prisma.riskFactorWeight.upsert({
      where: { factor },
      update: { peso, updatedBy: req.userId! },
      create: { factor, peso, updatedBy: req.userId! },
    });
  }
  res.json({ status: 'ok', data: pesos });
});

export default router;
