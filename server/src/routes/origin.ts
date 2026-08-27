import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
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
import { clienteIdDe, filtroCliente, validarClienteDelTenant } from '../lib/cliente-contexto';

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
