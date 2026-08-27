import { Router, type Response, type NextFunction } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middlewares/auth';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { sinGuardaDeTenant } from '../lib/tenant-guard';
import {
  analyzeOrigin,
  lookupOriginRule,
  listAgreements,
  consultHashOf,
  ORIGIN_DISCLAIMER,
  type OriginAnalysisInput,
  type RVCMethod,
} from '../services/origin-analyzer';
import {
  createCertificate,
  renderCertificateHTML,
  type CertificateInput,
  type PreferenceCriterion,
  type OriginCountry,
} from '../services/origin-certificate';
import { clienteIdDe, filtroCliente, validarClienteDelTenant, validarClienteEnAlcance, alcanceDe } from '../lib/cliente-contexto';
import { requirePermission } from '../middlewares/requirePermission';
import { adminLimiter } from '../middlewares/rateLimit';
// Ola 2 (origen-cuotas)
import { prellenarCertificado, type TipoCertificador } from '../services/origin-certificate';
import {
  determinarOrigenDesdeBOM, evaluarSaltoArancelario, evaluarDeMinimis, reporteCobertura, importarReglasOrigen, plantillaReglasXlsx,
  CODIGOS_SALTO, type CodigoSalto, type MaterialBOM,
} from '../services/origin-reglas';
import {
  listar as listarCertProv, crear as crearCertProv, actualizar as actualizarCertProv, eliminar as eliminarCertProv,
  solicitar as solicitarCertProv, revocarToken as revocarTokenCertProv, portalVer, portalSubir, procesarVencimientosCertificados, ProveedorError,
  type EntradaCertProveedor, type EstadoCert,
} from '../services/origin-proveedores';

export const originRouter = Router();

// GET /api/origin/agreements — lista de tratados disponibles
originRouter.get('/agreements', authenticate, async (_req, res, next) => {
  try {
    const agreements = await listAgreements();
    res.json({ status: 'ok', data: agreements });
  } catch (err) { next(err); }
});

// GET /api/origin/rule/:fraction?agreement=TMEC
originRouter.get('/rule/:fraction', authenticate, async (req, res, next) => {
  try {
    const fraction = String(req.params.fraction);
    const agreement = String(req.query.agreement ?? 'TMEC');
    const rule = await lookupOriginRule(fraction, agreement);
    res.json({ status: 'ok', data: { rule, disclaimer: ORIGIN_DISCLAIMER } });
  } catch (err) { next(err); }
});

// POST /api/origin/analyze — calcula RVC + LVC + SA y evalúa cumplimiento
originRouter.post('/analyze', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const body = req.body as Partial<OriginAnalysisInput> & { persist?: boolean };
    if (body.fractionCode == null || body.productValue == null) {
      return res.status(400).json({ status: 'error', message: 'fractionCode y productValue requeridos' });
    }
    if ((body.originatingMaterials == null || body.originatingMaterials.length === 0)
        && body.originatingValue == null && body.nonOriginatingValue == null) {
      return res.status(400).json({ status: 'error', message: 'Se requieren materiales originarios/no-originarios' });
    }

    const input: OriginAnalysisInput = {
      fractionCode: String(body.fractionCode),
      productDescription: body.productDescription,
      agreement: body.agreement ?? 'TMEC',
      productValue: Number(body.productValue),
      originatingMaterials: body.originatingMaterials,
      nonOriginatingMaterials: body.nonOriginatingMaterials,
      originatingValue: body.originatingValue != null ? Number(body.originatingValue) : undefined,
      nonOriginatingValue: body.nonOriginatingValue != null ? Number(body.nonOriginatingValue) : undefined,
      laborCost: body.laborCost != null ? Number(body.laborCost) : undefined,
      highWageLaborCost: body.highWageLaborCost != null ? Number(body.highWageLaborCost) : undefined,
      overheadCost: body.overheadCost != null ? Number(body.overheadCost) : undefined,
      profit: body.profit != null ? Number(body.profit) : undefined,
      packagingCost: body.packagingCost != null ? Number(body.packagingCost) : undefined,
      royalties: body.royalties != null ? Number(body.royalties) : undefined,
      rvcMethod: body.rvcMethod as RVCMethod | undefined,
      totalSteelAluminumValue: body.totalSteelAluminumValue != null ? Number(body.totalSteelAluminumValue) : undefined,
      northAmericanSteelAluminumValue: body.northAmericanSteelAluminumValue != null ? Number(body.northAmericanSteelAluminumValue) : undefined,
    };
    if (input.productValue <= 0) {
      return res.status(400).json({ status: 'error', message: 'productValue debe ser > 0' });
    }

    const result = await analyzeOrigin(input);
    const consultHash = consultHashOf(input, result);

    let analysisId: string | null = null;
    if (body.persist !== false) {
      const created = await prisma.originAnalysis.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.userId!,
          clienteId: await validarClienteDelTenant(req.tenantId!, clienteIdDe(req)),
          fractionCode: input.fractionCode,
          productDescription: input.productDescription,
          agreement: input.agreement!,
          productValue: input.productValue,
          originatingValue: result.totalOriginatingValue,
          nonOriginatingValue: result.totalNonOriginatingValue,
          originatingMaterials: input.originatingMaterials as never,
          nonOriginatingMaterials: input.nonOriginatingMaterials as never,
          laborCost: input.laborCost,
          highWageLaborCost: input.highWageLaborCost,
          overheadCost: input.overheadCost,
          profit: input.profit,
          packagingCost: input.packagingCost,
          royalties: input.royalties,
          rvcMethod: result.rvcMethodApplied,
          totalSteelAluminumValue: input.totalSteelAluminumValue,
          northAmericanSteelAluminumValue: input.northAmericanSteelAluminumValue,
          rvcTransactionValue: result.rvc.transactionValue,
          rvcNetCost: result.rvc.netCost,
          rvcBuildUp: result.rvc.buildUp,
          rvcBuildDown: result.rvc.buildDown,
          rvcCalculated: result.rvc[result.rvcMethodApplied as keyof typeof result.rvc] ?? null,
          tariffShiftCompliance: result.tariffShiftCompliance,
          laborValueContentPct: result.laborValueContentPct,
          lvcCompliance: result.lvcCompliance,
          steelAluminumNAPct: result.steelAluminumNAPct,
          saCompliance: result.saCompliance,
          ruleApplied: result.rule?.ruleType ?? null,
          qualifies: result.qualifies,
          qualifyingMethod: result.qualifyingMethod,
          reason: result.reason,
          reasons: result.reasons,
          recommendations: result.recommendations as never,
          consultHash,
        },
      });
      analysisId = created.id;
    }

    res.json({ status: 'ok', data: { ...result, analysisId, consultHash } });
  } catch (err) { next(err); }
});

// GET /api/origin/history
originRouter.get('/history', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const items = await prisma.originAnalysis.findMany({
      where: { tenantId: req.tenantId!, ...filtroCliente(req) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

// ─────────────────────── Certificados de origen ───────────────────────

originRouter.post('/certificates', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const body = req.body as Partial<CertificateInput>;
    const required: (keyof CertificateInput)[] = [
      'fractionCode', 'productDescription', 'exporterName',
      'originCountry', 'preferenceCriterion', 'signedBy', 'signedByRole',
    ];
    for (const k of required) {
      if (body[k] == null || (typeof body[k] === 'string' && (body[k] as string).trim() === '')) {
        return res.status(400).json({ status: 'error', message: `Campo requerido: ${k}` });
      }
    }
    if (!['MX', 'US', 'CA'].includes(body.originCountry as string)) {
      return res.status(400).json({ status: 'error', message: 'originCountry debe ser MX, US o CA' });
    }
    if (!['A', 'B', 'C', 'D', 'E'].includes(body.preferenceCriterion as string)) {
      return res.status(400).json({ status: 'error', message: 'preferenceCriterion debe ser A-E' });
    }

    const result = await createCertificate({
      tenantId: req.tenantId!,
      fractionCode: body.fractionCode!,
      productDescription: body.productDescription!,
      exporterName: body.exporterName!,
      exporterAddress: body.exporterAddress,
      exporterTaxId: body.exporterTaxId,
      importerName: body.importerName,
      importerAddress: body.importerAddress,
      importerTaxId: body.importerTaxId,
      producerName: body.producerName,
      producerAddress: body.producerAddress,
      producerTaxId: body.producerTaxId,
      originCountry: body.originCountry as OriginCountry,
      preferenceCriterion: body.preferenceCriterion as PreferenceCriterion,
      blanketPeriodFrom: body.blanketPeriodFrom ? new Date(body.blanketPeriodFrom) : undefined,
      blanketPeriodTo: body.blanketPeriodTo ? new Date(body.blanketPeriodTo) : undefined,
      signedBy: body.signedBy!,
      signedByRole: body.signedByRole!,
      originAnalysisId: body.originAnalysisId,
    });

    res.status(201).json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});

originRouter.get('/certificates', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const items = await prisma.originCertificate.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { signedDate: 'desc' },
      take: 200,
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

originRouter.get('/certificates/:id/pdf', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const cert = await prisma.originCertificate.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
    });
    if (!cert) return res.status(404).json({ status: 'error', message: 'Certificado no encontrado' });
    const verifyUrl = `${req.protocol}://${req.get('host')}/verify/cert/${cert.certificateNumber}`;
    const html = renderCertificateHTML(cert, verifyUrl);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="cert-${cert.certificateNumber}.html"`);
    res.send(html);
  } catch (err) { next(err); }
});

// Verificación pública del certificado por número (sin auth — útil para autoridad aduanera)
export async function verifyCertificate(certNumber: string): Promise<{ found: boolean; cert?: { certificateNumber: string; fractionCode: string; productDescription: string; exporterName: string; originCountry: string; preferenceCriterion: string; signedDate: string; status: string; contentHash: string | null } }> {
  // Verificación PÚBLICA por número de certificado: cross-tenant por diseño.
  const cert = await sinGuardaDeTenant(() => prisma.originCertificate.findUnique({
    where: { certificateNumber: certNumber },
    select: {
      certificateNumber: true, fractionCode: true, productDescription: true,
      exporterName: true, originCountry: true, preferenceCriterion: true,
      signedDate: true, status: true, contentHash: true,
    },
  }));
  if (!cert) return { found: false };
  return {
    found: true,
    cert: { ...cert, signedDate: cert.signedDate.toISOString() },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Ola 2 (origen-cuotas): BOM, de minimis, reglas (importar/cobertura),
// certificado 9 elementos, portal de proveedores.
// ═══════════════════════════════════════════════════════════════════════════

const adminOnly = [authenticate, requireRole('SUPERADMIN')];
const errProveedor = (res: Response, err: unknown, next: NextFunction) => {
  if (err instanceof ProveedorError) {
    const code = err.code === 'NO_ENCONTRADO' || err.code === 'TOKEN_INVALIDO' ? 404 : err.code === 'ESTADO_INVALIDO' ? 409 : 400;
    return res.status(code).json({ status: 'error', code: err.code, message: err.message });
  }
  return next(err);
};

// POST /api/origin/bom/determinar — salto arancelario + de minimis + acumulación + LVC/SA desde el BOM del catálogo
originRouter.post('/bom/determinar', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const b = req.body as { productId?: string; tratado?: string; porcentajeDeMinimis?: number; valorTransaccionUSD?: number; valores?: Record<string, number>; highWageLaborCost?: number; totalSteelAluminumValue?: number; northAmericanSteelAluminumValue?: number };
    if (!b.productId) return res.status(400).json({ status: 'error', message: 'productId requerido' });
    const r = await determinarOrigenDesdeBOM({
      tenantId: req.tenantId!, productId: String(b.productId), tratado: b.tratado,
      porcentajeDeMinimis: b.porcentajeDeMinimis != null ? Number(b.porcentajeDeMinimis) : undefined,
      valorTransaccionUSD: b.valorTransaccionUSD != null ? Number(b.valorTransaccionUSD) : null,
      valores: b.valores && typeof b.valores === 'object' ? b.valores : undefined,
      highWageLaborCost: b.highWageLaborCost != null ? Number(b.highWageLaborCost) : null,
      totalSteelAluminumValue: b.totalSteelAluminumValue != null ? Number(b.totalSteelAluminumValue) : null,
      northAmericanSteelAluminumValue: b.northAmericanSteelAluminumValue != null ? Number(b.northAmericanSteelAluminumValue) : null,
    });
    if (!r) return res.status(404).json({ status: 'error', message: 'Producto no encontrado en el catálogo del tenant' });
    res.json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

// POST /api/origin/salto — evaluación pura (materiales capturados a mano)
originRouter.post('/salto', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const b = req.body as { fraccionFinal?: string; codigo?: string; materiales?: MaterialBOM[]; valorTransaccionUSD?: number; porcentajeDeMinimis?: number };
    if (!b.fraccionFinal || !Array.isArray(b.materiales)) return res.status(400).json({ status: 'error', message: 'fraccionFinal y materiales[] requeridos' });
    const codigo = String(b.codigo ?? 'CTH').toUpperCase() as CodigoSalto;
    if (!CODIGOS_SALTO.includes(codigo)) return res.status(400).json({ status: 'error', message: 'codigo debe ser CC, CTH o CTSH' });
    const salto = evaluarSaltoArancelario({ fraccionFinal: b.fraccionFinal, materiales: b.materiales, codigo });
    const deMinimis = evaluarDeMinimis({ valorTransaccionUSD: b.valorTransaccionUSD, materialesQueNoCumplen: salto.porMaterial.filter(m => m.salto === 'no_cumple').map(m => m.material), porcentajeUmbral: b.porcentajeDeMinimis, fraccionFinal: b.fraccionFinal });
    res.json({ status: 'ok', data: { salto, deMinimis } });
  } catch (err) { next(err); }
});

// GET /api/origin/productos — productos del catálogo con BOM (para elegir en la pestaña BOM)
originRouter.get('/productos', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const q = req.query.q ? String(req.query.q) : '';
    const items = await prisma.product.findMany({
      where: { tenantId: req.tenantId!, active: true, ...filtroCliente(req), ...(q ? { OR: [{ productCode: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {}) },
      select: { id: true, productCode: true, description: true, fractionCode: true, paisOrigen: true, isFinished: true, clienteId: true, _count: { select: { components: true } } },
      orderBy: [{ isFinished: 'desc' }, { productCode: 'asc' }], take: 200,
    });
    res.json({ status: 'ok', data: items.map(i => ({ ...i, componentes: i._count.components })) });
  } catch (err) { next(err); }
});

// GET /api/origin/reglas/cobertura?tratado=TMEC&fracciones=85443001,73181599
originRouter.get('/reglas/cobertura', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tratado = String(req.query.tratado ?? 'TMEC');
    const fracciones = req.query.fracciones ? String(req.query.fracciones).split(',').map(s => s.trim()).filter(Boolean).slice(0, 50) : [];
    res.json({ status: 'ok', data: await reporteCobertura(tratado, fracciones) });
  } catch (err) { next(err); }
});

// GET /api/origin/reglas/plantilla.xlsx
originRouter.get('/reglas/plantilla.xlsx', ...adminOnly, async (_req: AuthRequest, res, next) => {
  try {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-reglas-origen.xlsx"');
    res.send(plantillaReglasXlsx());
  } catch (err) { next(err); }
});

// POST /api/origin/reglas/importar — { archivoBase64, nombreArchivo, dryRun } (SUPERADMIN)
originRouter.post('/reglas/importar', ...adminOnly, async (req: AuthRequest, res, next) => {
  try {
    const b = req.body as { archivoBase64?: string; nombreArchivo?: string; dryRun?: boolean };
    if (!b.archivoBase64) return res.status(400).json({ status: 'error', message: 'archivoBase64 requerido' });
    const rep = await importarReglasOrigen({ archivoBase64: b.archivoBase64, nombreArchivo: b.nombreArchivo, dryRun: !!b.dryRun });
    logger.info(`Reglas de origen importadas: ${rep.creadas} creadas, ${rep.actualizadas} actualizadas, ${rep.invalidas} rechazadas`, { action: 'origin_rules_import', userId: req.userId, metadata: { ...rep, filas: undefined } });
    res.json({ status: 'ok', data: rep });
  } catch (err) { next(err); }
});

// GET /api/origin/certificados/prellenar?analysisId=&productId=&clienteId=&certificadorTipo=
originRouter.get('/certificados/prellenar', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const tipo = req.query.certificadorTipo ? String(req.query.certificadorTipo) : undefined;
    if (tipo && !['exportador', 'productor', 'importador'].includes(tipo)) return res.status(400).json({ status: 'error', message: 'certificadorTipo inválido' });
    const r = await prellenarCertificado({
      tenantId: req.tenantId!, userId: req.userId,
      analysisId: req.query.analysisId ? String(req.query.analysisId) : null,
      productId: req.query.productId ? String(req.query.productId) : null,
      clienteId: req.query.clienteId ? String(req.query.clienteId) : clienteIdDe(req),
      certificadorTipo: tipo as TipoCertificador | undefined,
    });
    res.json({ status: 'ok', data: r });
  } catch (err) { next(err); }
});

// ── Certificados de proveedores ──────────────────────────────────────────

originRouter.get('/proveedores/certificados', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const f = filtroCliente(req);
    const items = await listarCertProv(req.tenantId!, { clienteId: f.clienteId, estado: req.query.estado ? String(req.query.estado) : undefined });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

originRouter.post('/proveedores/certificados', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const b = req.body as EntradaCertProveedor;
    const clienteId = await validarClienteDelTenant(req.tenantId!, b.clienteId ?? clienteIdDe(req));
    const c = await crearCertProv(req.tenantId!, { ...b, clienteId });
    res.status(201).json({ status: 'ok', data: c });
  } catch (err) { errProveedor(res, err, next); }
});

originRouter.patch('/proveedores/certificados/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const b = req.body as Partial<EntradaCertProveedor> & { estado?: EstadoCert };
    // clienteId del body: debe ser del tenant y estar en el alcance del usuario (403/400 si no).
    if (b.clienteId !== undefined && b.clienteId !== null) b.clienteId = await validarClienteEnAlcance(req, req.tenantId!, String(b.clienteId));
    const c = await actualizarCertProv(req.tenantId!, String(req.params.id), b, alcanceDe(req));
    res.json({ status: 'ok', data: c });
  } catch (err) { errProveedor(res, err, next); }
});

originRouter.delete('/proveedores/certificados/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    await eliminarCertProv(req.tenantId!, String(req.params.id), alcanceDe(req));
    res.json({ status: 'ok' });
  } catch (err) { errProveedor(res, err, next); }
});

// POST /api/origin/proveedores/certificados/:id/solicitar — genera token + correo (o dice que no hay canal)
originRouter.post('/proveedores/certificados/:id/solicitar', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { name: true } });
    const r = await solicitarCertProv(req.tenantId!, String(req.params.id), { baseUrl, remitente: tenant?.name }, alcanceDe(req));
    res.json({ status: 'ok', data: r });
  } catch (err) { errProveedor(res, err, next); }
});

// POST /api/origin/proveedores/certificados/:id/revocar-token — invalida el enlace del portal
originRouter.post('/proveedores/certificados/:id/revocar-token', authenticate, async (req: AuthRequest, res, next) => {
  try {
    res.json({ status: 'ok', data: await revocarTokenCertProv(req.tenantId!, String(req.params.id), alcanceDe(req)) });
  } catch (err) { errProveedor(res, err, next); }
});

// POST /api/origin/proveedores/vencimientos/procesar — corre el job para el tenant (manual)
originRouter.post('/proveedores/vencimientos/procesar', authenticate, requirePermission('classifier', 'settings'), adminLimiter, async (req: AuthRequest, res, next) => {
  try { res.json({ status: 'ok', data: await procesarVencimientosCertificados(req.tenantId!) }); } catch (err) { next(err); }
});

// ── Portal PÚBLICO por token (sin auth; rate-limit aplicado al montar) ───
export const originPortalRouter = Router();

originPortalRouter.get('/:token', async (req, res, next) => {
  try { res.json({ status: 'ok', data: await portalVer(String(req.params.token)) }); } catch (err) { errProveedor(res, err, next); }
});

originPortalRouter.post('/:token', async (req, res, next) => {
  try {
    const b = req.body as { archivoBase64?: string; mimeType?: string; nombreArchivo?: string; vigenciaDesde?: string; vigenciaHasta?: string; numeroCertificado?: string };
    const r = await portalSubir(String(req.params.token), { archivoBase64: b.archivoBase64 ?? '', mimeType: b.mimeType, nombreArchivo: b.nombreArchivo, vigenciaDesde: b.vigenciaDesde, vigenciaHasta: b.vigenciaHasta, numeroCertificado: b.numeroCertificado });
    res.json({ status: 'ok', data: r });
  } catch (err) { errProveedor(res, err, next); }
});
