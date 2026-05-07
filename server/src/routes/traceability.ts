/**
 * Endpoints públicos y administrativos de trazabilidad versional.
 *
 * - GET /verify/:consultHash         (público) — verifica una consulta IA por hash
 * - GET /api/classify/:id/dictamen.html (auth)  — dictamen imprimible con QR
 * - GET /api/admin/compliance-report/:tenantId (admin) — reporte normativo
 */

import { Router } from 'express';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { verifyConsult, getActiveVersions } from '../services/traceability';

export const verifyPublicRouter = Router();
export const dictamenRouter = Router();
export const complianceReportRouter = Router();

// ──────────────────────────────────────────────────────────────────────────
// Verificación pública por consultHash (genérico — para cualquier consulta IA)
// ──────────────────────────────────────────────────────────────────────────

verifyPublicRouter.get('/:hash', async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    const data = await verifyConsult(hash);

    // Si el cliente quiere JSON (Accept: application/json), devolver JSON
    const wantsJSON = req.headers.accept?.includes('application/json');
    if (wantsJSON) {
      return res.json({ status: 'ok', data });
    }

    // Página HTML pública para el SAT/auditor
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderVerifyPage(hash, data));
  } catch (err) { next(err); }
});

function escapeHTML(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderVerifyPage(hash: string, data: Awaited<ReturnType<typeof verifyConsult>>): string {
  const e = escapeHTML;
  if (!data.found) {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Verificación ADUANAI</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
.card{max-width:560px;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155}
h1{font-size:20px;margin:0 0 8px;color:#fca5a5}.hash{font-family:monospace;font-size:11px;background:#0f172a;padding:8px;border-radius:6px;word-break:break-all;color:#94a3b8;border:1px solid #334155}</style></head>
<body><div class="card"><h1>❌ Hash no encontrado</h1>
<p>El consultHash no corresponde a ninguna consulta registrada en ADUANAI. Esto puede significar que la consulta fue alterada o nunca fue emitida por nuestro sistema.</p>
<div class="hash">${e(hash)}</div></div></body></html>`;
  }
  const v = data.versions!;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Consulta verificada — ADUANAI</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px;min-height:100vh}
  .container{max-width:760px;margin:0 auto}
  .header{text-align:center;margin-bottom:24px}
  .badge{display:inline-block;background:#10b981;color:#0f172a;padding:6px 16px;border-radius:999px;font-weight:700;font-size:13px}
  h1{font-size:24px;margin:12px 0 4px}
  .subtitle{color:#94a3b8;font-size:13px}
  .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:20px;margin-bottom:16px}
  .card h2{font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin:0 0 12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:6px 0;border-bottom:1px solid #334155}
  td:first-child{color:#94a3b8;width:40%}
  td:last-child{font-family:monospace;color:#e2e8f0;word-break:break-all}
  .hash-box{font-family:monospace;font-size:11px;background:#0f172a;padding:10px;border-radius:8px;word-break:break-all;border:1px solid #334155;color:#10b981}
  .footer{text-align:center;color:#64748b;font-size:11px;margin-top:32px}
  .privacy{font-size:11px;color:#94a3b8;background:#0f172a;border-left:3px solid #f59e0b;padding:10px 14px;border-radius:4px;margin-top:12px}
</style></head>
<body><div class="container">
<div class="header">
  <div class="badge">✅ CONSULTA VERIFICADA</div>
  <h1>Verificación de Consulta IA — ADUANAI</h1>
  <p class="subtitle">Trazabilidad versional para auditoría SAT</p>
</div>

<div class="card">
  <h2>Hash de Consulta (SHA-256)</h2>
  <div class="hash-box">${e(hash)}</div>
</div>

<div class="card">
  <h2>Fecha y Hora UTC</h2>
  <table><tr><td>Consulta emitida</td><td>${e(data.consultedAt!)}</td></tr></table>
</div>

<div class="card">
  <h2>Versiones Normativas Consultadas</h2>
  <table>
    <tr><td>TIGIE</td><td>${e(v.tigie)}</td></tr>
    <tr><td>LIGIE</td><td>${e(v.ligie)}</td></tr>
    ${v.rgce ? `<tr><td>RGCE</td><td>${e(v.rgce)}</td></tr>` : ''}
    ${v.acuerdoNoms ? `<tr><td>Acuerdo NOMs (Anexo 2.4.1)</td><td>${e(v.acuerdoNoms)}</td></tr>` : ''}
    ${v.tmec ? `<tr><td>T-MEC</td><td>${e(v.tmec)}</td></tr>` : ''}
  </table>
</div>

<div class="card">
  <h2>Modelo de IA</h2>
  <table>
    <tr><td>Modelo</td><td>${e(data.modelUsed!)}</td></tr>
    <tr><td>Proveedor</td><td>${e(data.modelProvider!)}</td></tr>
  </table>
</div>

<div class="card">
  <h2>Hashes de Integridad</h2>
  <table>
    <tr><td>Hash de inputs</td><td>${e(data.inputHash!)}</td></tr>
    <tr><td>Hash de outputs</td><td>${e(data.outputHash!)}</td></tr>
    <tr><td>Hash de knowledge base</td><td>${e(data.knowledgeBaseHash!)}</td></tr>
  </table>
</div>

${data.tenantName ? `<div class="card">
  <h2>Importador (RFC público)</h2>
  <table>
    <tr><td>Razón social</td><td>${e(data.tenantName)}</td></tr>
    ${data.tenantRFC ? `<tr><td>RFC</td><td>${e(data.tenantRFC)}</td></tr>` : ''}
    ${data.fractionCode ? `<tr><td>Fracción declarada</td><td>${e(data.fractionCode)}</td></tr>` : ''}
  </table>
</div>` : ''}

<div class="privacy">
  Esta página NO revela el contenido específico de la consulta del cliente — solo metadatos verificables (versiones normativas, hashes y timestamp). Los inputs y outputs originales permanecen confidenciales para el importador.
</div>

<p class="footer">ADUANAI — Trazabilidad versional · ${new Date().toISOString().slice(0, 10)}</p>
</div></body></html>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Dictamen HTML imprimible con QR de verificación
// ──────────────────────────────────────────────────────────────────────────

dictamenRouter.get('/:id/dictamen.html', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const c = await prisma.classification.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: { tenant: { select: { name: true, rfc: true } } },
    });
    if (!c) return res.status(404).json({ status: 'error', message: 'Clasificación no encontrada' });

    const consult = c.consultHash
      ? await prisma.classificationConsult.findUnique({ where: { consultHash: c.consultHash } })
      : null;

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const verifyUrl = `${baseUrl}/verify/${c.consultHash ?? ''}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(verifyUrl)}`;

    const docHtml = renderDictamen({
      classification: c,
      consult,
      verifyUrl,
      qrUrl,
    });

    // Hash del archivo (SHA-256 del HTML emitido)
    const docHash = crypto.createHash('sha256').update(docHtml).digest('hex');
    const finalHtml = docHtml.replace('__DOCUMENT_HASH__', docHash);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="dictamen.html"');
    res.send(finalHtml);
  } catch (err) { next(err); }
});

interface DictamenInput {
  classification: {
    id: string;
    fractionCode: string;
    fractionDescription: string | null;
    inputDescription: string;
    inputContext: string | null;
    inputCountryOfOrigin: string | null;
    confidence: number;
    consultHash: string | null;
    consultedAt: Date | null;
    tenant: { name: string; rfc: string | null };
  };
  consult: { tigieVersion: string; ligieVersion: string; modelUsed: string; modelProvider: string } | null;
  verifyUrl: string;
  qrUrl: string;
}

function renderDictamen(input: DictamenInput): string {
  const e = escapeHTML;
  const c = input.classification;
  const today = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Dictamen de clasificación arancelaria</title>
<style>
@page { size: letter; margin: 2cm; }
body { font-family: Georgia, "Times New Roman", serif; color: #1f2937; line-height: 1.55; max-width: 720px; margin: 0 auto; padding: 24px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.brand { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; color: #059669; }
.brand-sub { font-size: 11px; color: #6b7280; }
.meta { text-align: right; font-size: 12px; color: #4b5563; }
h1 { font-size: 18px; text-align: center; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 16px; border-bottom: 2px solid #059669; padding-bottom: 8px; }
table.data { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
table.data th { text-align: left; background: #f3f4f6; padding: 8px 10px; border: 1px solid #d1d5db; font-weight: 600; width: 38%; }
table.data td { padding: 8px 10px; border: 1px solid #d1d5db; }
.fraction { background: #ecfdf5; border-left: 4px solid #059669; padding: 14px 18px; margin: 16px 0; }
.fraction .code { font-family: monospace; font-size: 24px; font-weight: 700; color: #064e3b; }
.fraction .desc { font-size: 13px; color: #064e3b; margin-top: 4px; }
.confidence { font-size: 11px; color: #047857; }
.qr-section { display: flex; gap: 16px; align-items: center; padding: 16px; background: #f9fafb; border-radius: 8px; margin-top: 24px; border: 1px solid #e5e7eb; }
.qr-section img { width: 120px; height: 120px; }
.qr-text { font-size: 11px; color: #4b5563; }
.qr-text strong { display: block; font-size: 13px; color: #111827; margin-bottom: 4px; }
.hash-row { font-family: monospace; font-size: 9px; color: #6b7280; word-break: break-all; }
.footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #6b7280; text-align: center; }
.disclaimer { font-size: 11px; color: #92400e; background: #fffbeb; border-left: 3px solid #f59e0b; padding: 10px 14px; margin-top: 24px; border-radius: 4px; }
@media print { body { padding: 0; } button { display: none; } }
</style></head>
<body>
<div class="header">
  <div>
    <div class="brand">ADUANAI</div>
    <div class="brand-sub">Plataforma de comercio exterior con IA</div>
  </div>
  <div class="meta">
    <strong>${e(c.tenant.name)}</strong><br>
    ${c.tenant.rfc ? `RFC: ${e(c.tenant.rfc)}<br>` : ''}
    ${today}
  </div>
</div>

<h1>Dictamen de Clasificación Arancelaria</h1>

<table class="data">
  <tr><th>Producto declarado</th><td>${e(c.inputDescription)}</td></tr>
  ${c.inputContext ? `<tr><th>Contexto</th><td>${e(c.inputContext)}</td></tr>` : ''}
  ${c.inputCountryOfOrigin ? `<tr><th>País de origen</th><td>${e(c.inputCountryOfOrigin)}</td></tr>` : ''}
</table>

<div class="fraction">
  <div class="code">${e(c.fractionCode)}</div>
  <div class="desc">${e(c.fractionDescription ?? '')}</div>
  <div class="confidence">Confianza: ${e(String(Math.round(c.confidence)))}%</div>
</div>

<table class="data">
  <tr><th>Versión TIGIE consultada</th><td>${e(input.consult?.tigieVersion ?? 'N/A')}</td></tr>
  <tr><th>Versión LIGIE consultada</th><td>${e(input.consult?.ligieVersion ?? 'N/A')}</td></tr>
  <tr><th>Modelo IA</th><td>${e(input.consult?.modelUsed ?? 'N/A')} (${e(input.consult?.modelProvider ?? 'N/A')})</td></tr>
  <tr><th>Fecha de consulta UTC</th><td>${e(c.consultedAt?.toISOString() ?? 'N/A')}</td></tr>
</table>

<div class="qr-section">
  <img src="${e(input.qrUrl)}" alt="QR verificación">
  <div class="qr-text">
    <strong>Verificación pública</strong>
    Este dictamen es verificable en cualquier momento escaneando el código QR o visitando:<br>
    <a href="${e(input.verifyUrl)}">${e(input.verifyUrl)}</a>
    <div class="hash-row" style="margin-top:6px;">consultHash: ${e(c.consultHash ?? 'N/A')}</div>
  </div>
</div>

<div class="disclaimer">
  Este dictamen es orientativo y se emite con base en la TIGIE/LIGIE vigentes a la fecha de consulta. La clasificación oficial debe ser validada por un agente aduanal certificado. ADUANAI no asume responsabilidad legal por reclasificaciones derivadas de cambios normativos posteriores a la fecha de emisión.
</div>

<div class="footer">
  Documento verificable · ADUANAI · ${today}<br>
  Hash del documento (SHA-256): <span class="hash-row">__DOCUMENT_HASH__</span>
</div>
</body></html>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Reporte de cumplimiento normativo por tenant
// ──────────────────────────────────────────────────────────────────────────

complianceReportRouter.get('/compliance-report/:tenantId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    if (req.userRole !== 'ADMIN' && req.userRole !== 'SUPERADMIN' && req.tenantId !== req.params.tenantId) {
      return res.status(403).json({ status: 'error', message: 'Acceso denegado' });
    }
    const tenantId = String(req.params.tenantId);
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, rfc: true } });
    if (!tenant) return res.status(404).json({ status: 'error', message: 'Tenant no encontrado' });

    const consults = await prisma.classificationConsult.findMany({
      where: { tenantId },
      orderBy: { consultedAt: 'desc' },
      select: {
        id: true, classificationId: true, tigieVersion: true, ligieVersion: true,
        rgceVersion: true, modelUsed: true, consultHash: true, consultedAt: true,
      },
      take: 1000,
    });

    const active = await getActiveVersions();

    // Agrupar por tigieVersion
    const groups = new Map<string, { version: string; count: number; outdated: boolean; consultIds: string[]; firstAt: string; lastAt: string }>();
    for (const c of consults) {
      const k = c.tigieVersion;
      const g = groups.get(k);
      if (g) {
        g.count++;
        g.consultIds.push(c.id);
        if (c.consultedAt.toISOString() < g.firstAt) g.firstAt = c.consultedAt.toISOString();
        if (c.consultedAt.toISOString() > g.lastAt) g.lastAt = c.consultedAt.toISOString();
      } else {
        groups.set(k, {
          version: k,
          count: 1,
          outdated: k !== active.tigie,
          consultIds: [c.id],
          firstAt: c.consultedAt.toISOString(),
          lastAt: c.consultedAt.toISOString(),
        });
      }
    }
    const breakdown = [...groups.values()].sort((a, b) => b.count - a.count);
    const outdatedCount = breakdown.filter(g => g.outdated).reduce((s, g) => s + g.count, 0);

    const recommendations: string[] = [];
    if (outdatedCount > 0) {
      const outdatedList = breakdown
        .filter(g => g.outdated)
        .map(g => `${g.count} con TIGIE ${g.version}`)
        .join(', ');
      recommendations.push(
        `${outdatedCount} clasificaciones se hicieron con versiones TIGIE no vigentes (${outdatedList}). ` +
        `Considerar re-clasificar contra la versión actual (${active.tigie}) las operaciones que estén próximas a despachar.`,
      );
    }
    if (consults.length === 0) {
      recommendations.push('Sin registros de trazabilidad versional aún. Empieza a clasificar para generar el historial auditable.');
    }

    res.json({
      status: 'ok',
      data: {
        tenant: { name: tenant.name, rfc: tenant.rfc },
        activeVersions: active,
        totals: {
          consults: consults.length,
          outdatedConsults: outdatedCount,
          uniqueTigieVersions: breakdown.length,
        },
        breakdown,
        recommendations,
        recent: consults.slice(0, 20),
      },
    });
  } catch (err) { next(err); }
});
