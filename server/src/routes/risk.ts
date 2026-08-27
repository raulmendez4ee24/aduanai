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
import { listaCriterios } from '../services/risk-scorer/criterios';
import type { Signals } from '../services/risk-scorer/types';
import { clienteIdDe, enAlcance, filtroCliente, validarClienteDelTenant, whereConAlcance } from '../lib/cliente-contexto';
import crypto from 'crypto';
import { DISCLAIMER } from '../services/risk-scorer/engine';
import {
  siguienteFolio, aplicarEvidencia, resultadoDesdeFila, idsEvidenciables, construirCartera,
  hashAssessment, renderDictamenHTML, type EvidenciaMap,
} from '../services/risk-scorer/operativo';
import { recordAudit } from '../services/audit-service';

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
  /** Ola 2: expediente 59-V de la operación al que pertenece la evaluación. */
  operationId: z.string().max(40).optional(),
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
  const { tipoSujeto, operacion, declarado, operationId } = parsed.data;
  // Ola 2: clienteId obligatorio cuando hay cliente activo — un id que no es
  // del tenant no se ignora en silencio (antes caía a null).
  const clienteSolicitado = clienteIdDe(req);
  const clienteId = await validarClienteDelTenant(req.tenantId!, clienteSolicitado);
  if (clienteSolicitado && !clienteId) {
    return res.status(400).json({ status: 'error', message: 'El cliente activo no existe o no pertenece a tu empresa' });
  }
  if (operationId) {
    const op = await prisma.operation.findFirst({ where: whereConAlcance(req, { id: operationId, tenantId: req.tenantId! }), select: { id: true } });
    if (!op) return res.status(404).json({ status: 'error', message: 'Operación no encontrada' });
  }
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
      clienteId,
      folio: await siguienteFolio(req.tenantId!),
      operationId: operationId ?? null,
      input: JSON.parse(JSON.stringify(signals)),
      exposicion: resultado.exposicion,
      escudoPct: resultado.escudoPct,
      banda: resultado.banda,
      detalle: JSON.parse(JSON.stringify(resultado.factores)),
      checklist: JSON.parse(JSON.stringify(resultado.checklist)),
      rulesVersion: resultado.rulesVersion,
      pesosSnapshot: weights,
    },
    select: { id: true, folio: true },
  });

  res.json({ status: 'ok', data: { ...resultado, assessmentId: saved.id, folio: saved.folio, clienteId, operationId: operationId ?? null } });
});

// ── Ola 2: historial por cliente (score vivo = último + serie) ──────────
router.get('/clientes/:clienteId/historial', async (req: AuthRequest, res: Response) => {
  const clienteId = String(req.params.clienteId);
  // Revisión C: el clienteId viene del path — debe caer en el alcance del usuario.
  if (!enAlcance(req, clienteId)) return res.status(403).json({ status: 'error', message: 'Cliente fuera de tu alcance' });
  const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, tenantId: req.tenantId! }, select: { id: true, rfc: true, razonSocial: true } });
  if (!cliente) return res.status(404).json({ status: 'error', message: 'Cliente no encontrado' });
  const serie = await prisma.riskAssessment.findMany({
    where: { tenantId: req.tenantId!, clienteId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, folio: true, exposicion: true, escudoPct: true, banda: true, rulesVersion: true, createdAt: true, operationId: true },
    take: 100,
  });
  const vivo = serie[0] ?? null;
  res.json({ status: 'ok', data: { cliente, vivo, serie: [...serie].reverse() } });
});

// ── Ola 2: cartera para el gerente (por cliente, ordenada por exposición) ─
router.get('/cartera', async (req: AuthRequest, res: Response) => {
  const permitidos = (req as AuthRequest & { clienteIdsPermitidos?: string[] | null }).clienteIdsPermitidos;
  const filas = await construirCartera(req.tenantId!, Array.isArray(permitidos) ? permitidos : null);
  res.json({ status: 'ok', data: filas, total: filas.length });
});

// ── Ola 2: respaldo documental → declarado pasa a verificado (sin tocar pesos) ─
const MAX_EVIDENCIA_BYTES = 3 * 1024 * 1024;
router.post('/:id/factores/:factorId/evidencia', async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  const factorId = String(req.params.factorId);
  const body = (req.body ?? {}) as { fileName?: string; mimeType?: string; base64?: string; nombre?: string };
  if (!body.fileName || !body.mimeType || !body.base64) {
    return res.status(400).json({ status: 'error', message: 'fileName, mimeType y base64 requeridos' });
  }
  const row = await prisma.riskAssessment.findFirst({ where: whereConAlcance(req, { id, tenantId: req.tenantId! }) });
  if (!row) return res.status(404).json({ status: 'error', message: 'Evaluación no encontrada' });
  const base = resultadoDesdeFila(row);
  if (!idsEvidenciables(base).has(factorId)) {
    return res.status(400).json({ status: 'error', message: `factorId "${factorId}" no existe en esta evaluación (usa el id de una regla, de un ítem del escudo o de un factor)` });
  }
  const buf = Buffer.from(body.base64, 'base64');
  if (buf.length === 0) return res.status(400).json({ status: 'error', message: 'Archivo vacío' });
  if (buf.length > MAX_EVIDENCIA_BYTES) return res.status(413).json({ status: 'error', message: 'Evidencia máxima 3 MB' });
  const fileHash = crypto.createHash('sha256').update(buf).digest('hex');
  const doc = await prisma.document.create({
    data: {
      tenantId: req.tenantId!, clienteId: row.clienteId, operationId: row.operationId,
      name: body.nombre?.trim() || `Evidencia ${factorId} · ${row.folio ?? id}`, type: 'evidencia_riesgo', docType: 'evidencia_riesgo',
      status: 'UPLOADED', required: false, fileName: body.fileName, fileSize: buf.length, mimeType: body.mimeType, fileHash,
      fileUrl: `data:${body.mimeType};base64,${body.base64}`,
      notes: `Respaldo documental del Risk Scorer · assessment ${id} · ${factorId}`,
      verifiedAt: new Date(), verifiedBy: req.userId!,
    },
    select: { id: true, name: true },
  });
  const evidencia: EvidenciaMap = { ...((row.evidencia ?? {}) as unknown as EvidenciaMap) };
  const antes = evidencia[factorId] ?? null;
  evidencia[factorId] = { documentId: doc.id, verificadoAt: new Date().toISOString(), verificadoPor: req.userId!, nombre: doc.name };
  const recalculado = aplicarEvidencia(base, evidencia);
  await prisma.riskAssessment.update({
    where: { id },
    data: {
      evidencia: JSON.parse(JSON.stringify(evidencia)),
      detalle: JSON.parse(JSON.stringify(recalculado.factores)),
      checklist: JSON.parse(JSON.stringify(recalculado.checklist)),
    },
  });
  await recordAudit({
    tenantId: req.tenantId!, userId: req.userId!, action: 'risk.evidencia', entity: 'RiskAssessment', entityId: id,
    before: { [factorId]: antes }, after: { [factorId]: evidencia[factorId] },
    endpoint: req.originalUrl, method: req.method,
    metadata: { factorId, documentId: doc.id, fileHash, folio: row.folio },
  });
  res.json({ status: 'ok', data: { documentId: doc.id, factorId, evidencia, resultado: { ...recalculado, assessmentId: id, folio: row.folio } } });
});

// ── Ola 2: dictamen imprimible con folio + hash ─────────────────────────
async function cargarDictamen(req: AuthRequest, tenantId: string, id: string) {
  const row = await prisma.riskAssessment.findFirst({ where: whereConAlcance(req, { id, tenantId }) });
  if (!row) return null;
  const [tenant, cliente, operacion] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    row.clienteId ? prisma.cliente.findFirst({ where: { id: row.clienteId, tenantId }, select: { rfc: true, razonSocial: true } }) : null,
    row.operationId ? prisma.operation.findFirst({ where: { id: row.operationId, tenantId }, select: { reference: true } }) : null,
  ]);
  const evidencia = (row.evidencia ?? {}) as unknown as EvidenciaMap;
  const resultado = aplicarEvidencia(resultadoDesdeFila(row), evidencia);
  const hash = hashAssessment(row);
  const html = renderDictamenHTML({
    folio: row.folio, hash, creado: row.createdAt, tenantNombre: tenant?.name ?? 'ADUANAI', cliente,
    operacionRef: operacion?.reference ?? null, resultado, input: row.input, evidencia, disclaimer: DISCLAIMER,
  });
  return { row, hash, html };
}

router.get('/:id/dictamen.html', async (req: AuthRequest, res: Response) => {
  const d = await cargarDictamen(req, req.tenantId!, String(req.params.id));
  if (!d) return res.status(404).json({ status: 'error', message: 'Evaluación no encontrada' });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(d.html);
});

// Archiva el dictamen (HTML con folio + hash) como Document del expediente 59-V de la operación.
router.post('/:id/archivar', async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  const body = (req.body ?? {}) as { operationId?: string };
  const d = await cargarDictamen(req, req.tenantId!, id);
  if (!d) return res.status(404).json({ status: 'error', message: 'Evaluación no encontrada' });
  const operationId = body.operationId ?? d.row.operationId;
  if (!operationId) return res.status(400).json({ status: 'error', message: 'operationId requerido: la evaluación no está ligada a una operación' });
  const op = await prisma.operation.findFirst({ where: whereConAlcance(req, { id: operationId, tenantId: req.tenantId! }), select: { id: true, reference: true } });
  if (!op) return res.status(404).json({ status: 'error', message: 'Operación no encontrada' });
  if (!d.row.operationId) await prisma.riskAssessment.update({ where: { id }, data: { operationId: op.id } });
  const buf = Buffer.from(d.html, 'utf8');
  const doc = await prisma.document.create({
    data: {
      tenantId: req.tenantId!, clienteId: d.row.clienteId, operationId: op.id,
      name: `Dictamen Risk Scorer ${d.row.folio ?? id}`, type: 'dictamen_riesgo', docType: 'dictamen_riesgo', status: 'VERIFIED', required: false,
      fileName: `dictamen-${d.row.folio ?? id}.html`, fileSize: buf.length, mimeType: 'text/html', fileHash: d.hash,
      fileUrl: `data:text/html;base64,${buf.toString('base64')}`,
      notes: `Dictamen de exposición ${d.row.folio ?? ''} · hash ${d.hash}`, verifiedAt: new Date(), verifiedBy: req.userId!,
    },
    select: { id: true },
  });
  await recordAudit({
    tenantId: req.tenantId!, userId: req.userId!, action: 'risk.archivar_dictamen', entity: 'Operation', entityId: op.id,
    endpoint: req.originalUrl, method: req.method, metadata: { assessmentId: id, folio: d.row.folio, hash: d.hash, documentId: doc.id },
  });
  res.json({ status: 'ok', data: { documentId: doc.id, operationId: op.id, folio: d.row.folio, hash: d.hash } });
});

router.get('/assessments', async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const take = 20;
  const [rows, total] = await Promise.all([
    prisma.riskAssessment.findMany({
      where: { tenantId: req.tenantId!, ...filtroCliente(req) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, folio: true, clienteId: true, operationId: true, exposicion: true, escudoPct: true, banda: true, rulesVersion: true, createdAt: true },
      skip: (page - 1) * take, take,
    }),
    prisma.riskAssessment.count({ where: { tenantId: req.tenantId!, ...filtroCliente(req) } }),
  ]);
  res.json({ status: 'ok', data: rows, total, page });
});

router.get('/assessments/:id', async (req: AuthRequest, res: Response) => {
  const row = await prisma.riskAssessment.findFirst({
    where: whereConAlcance(req, { id: String(req.params.id), tenantId: req.tenantId! }),
  });
  if (!row) return res.status(404).json({ status: 'error', message: 'Evaluación no encontrada' });
  res.json({ status: 'ok', data: row });
});

router.get('/weights', async (_req: AuthRequest, res: Response) => {
  res.json({ status: 'ok', data: await getWeights(), rulesVersion: RULES_VERSION });
});

// Criterios normativos visibles en producto (panel "regulación en vivo").
router.get('/criterios', async (_req: AuthRequest, res: Response) => {
  res.json({ status: 'ok', data: listaCriterios() });
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
