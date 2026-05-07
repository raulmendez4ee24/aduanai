/**
 * Endpoints de timestamps:
 *   GET  /verify/timestamp/:hash             — verificación pública (HTML/JSON)
 *   GET  /verify/timestamp/:hash/proof.ots   — descarga del proof binario
 *   GET  /api/admin/timestamps               — listado admin
 *   GET  /api/admin/timestamps/stats         — métricas
 *   POST /api/admin/timestamps/check-pending — fuerza el cron de upgrade
 */

import { Router, type Response, type NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { verifyTimestamp, getProofBytes, checkPendingTimestamps } from '../services/timestamp';

export const verifyTimestampPublicRouter = Router();
export const timestampsAdminRouter = Router();
const adminOnly = [authenticate, requireRole('ADMIN', 'SUPERADMIN')];

const escape = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// ─────────────────────── Verificación pública ───────────────────────

verifyTimestampPublicRouter.get('/:hash', async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    const result = await verifyTimestamp(hash);

    if (req.headers.accept?.includes('application/json')) {
      return res.json({ status: 'ok', data: result });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderVerifyPage(hash, result));
  } catch (err) { next(err); }
});

verifyTimestampPublicRouter.get('/:hash/proof.ots', async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    const buf = await getProofBytes(hash);
    if (!buf) return res.status(404).json({ status: 'error', message: 'Proof no encontrado' });
    res.setHeader('Content-Type', 'application/vnd.opentimestamps.ots');
    res.setHeader('Content-Disposition', `attachment; filename="${hash}.ots"`);
    res.send(buf);
  } catch (err) { next(err); }
});

function renderVerifyPage(hash: string, r: Awaited<ReturnType<typeof verifyTimestamp>>): string {
  const e = escape;
  if (!r.found) {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Timestamp no encontrado</title>
<style>body{font-family:system-ui;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
.card{max-width:600px;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155}
h1{color:#fca5a5;margin:0 0 12px}.hash{font-family:monospace;font-size:11px;background:#0f172a;padding:10px;border-radius:8px;word-break:break-all;color:#94a3b8;border:1px solid #334155}
</style></head><body><div class="card">
<h1>❌ Timestamp no encontrado</h1>
<p>El hash buscado no corresponde a ningún registro anclado en ADUANAI. Puede que:</p>
<ul><li>El hash esté mal copiado</li><li>El registro nunca haya sido anclado</li><li>El registro haya sido modificado (alterando su hash)</li></ul>
<div class="hash">${e(hash)}</div>
</div></body></html>`;
  }

  const statusBadge = {
    pending:   { color: '#f59e0b', label: '⏳ Pendiente', detail: 'Aún no enviado al calendar' },
    submitted: { color: '#0ea5e9', label: '📡 En blockchain (sin confirmar)', detail: 'Hash en calendar OTS, esperando bloque Bitcoin (~10 min - 6h)' },
    confirmed: { color: '#10b981', label: '✅ Confirmado en Bitcoin', detail: 'Anclado permanentemente al blockchain de Bitcoin' },
    verified:  { color: '#10b981', label: '🔒 Verificado independientemente', detail: 'Verificación criptográfica completa' },
    failed:    { color: '#ef4444', label: '⚠ Falló', detail: 'No se pudo enviar al calendar — se reintenta automáticamente' },
  }[r.status ?? 'pending'] ?? { color: '#94a3b8', label: r.status ?? 'desconocido', detail: '' };

  const explorerLink = r.bitcoinBlock
    ? `https://mempool.space/block/${r.bitcoinBlock}`
    : null;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Verificación de timestamp — ADUANAI</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px;min-height:100vh}
  .container{max-width:760px;margin:0 auto}
  .header{text-align:center;margin-bottom:24px}
  .badge{display:inline-block;background:${statusBadge.color};color:#0f172a;padding:6px 16px;border-radius:999px;font-weight:700;font-size:13px}
  h1{font-size:22px;margin:12px 0 4px}.subtitle{color:#94a3b8;font-size:13px}
  .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:20px;margin-bottom:16px}
  .card h2{font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin:0 0 12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:6px 0;border-bottom:1px solid #334155}
  td:first-child{color:#94a3b8;width:40%}
  td:last-child{font-family:monospace;color:#e2e8f0;word-break:break-all}
  .hash{font-family:monospace;font-size:11px;background:#0f172a;padding:10px;border-radius:8px;word-break:break-all;color:#10b981;border:1px solid #334155}
  .download{display:inline-block;background:#10b981;color:#0f172a;text-decoration:none;font-weight:600;padding:8px 16px;border-radius:8px;font-size:13px;margin-right:8px}
  .verify-cmd{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px;font-family:monospace;font-size:11px;color:#10b981;margin-top:8px}
  .footer{text-align:center;color:#64748b;font-size:11px;margin-top:32px}
  a{color:#10b981}
</style></head><body><div class="container">
<div class="header">
  <div class="badge">${e(statusBadge.label)}</div>
  <h1>Verificación de Timestamp</h1>
  <p class="subtitle">${e(statusBadge.detail)}</p>
</div>

<div class="card">
  <h2>Hash anclado (SHA-256)</h2>
  <div class="hash">${e(r.contentHash)}</div>
</div>

${r.bitcoinBlock ? `<div class="card">
  <h2>Anclaje Bitcoin</h2>
  <table>
    <tr><td>Bloque</td><td>#${r.bitcoinBlock.toLocaleString('en-US')}</td></tr>
    ${r.bitcoinTimestamp ? `<tr><td>Timestamp aprox.</td><td>${e(r.bitcoinTimestamp)}</td></tr>` : ''}
    ${explorerLink ? `<tr><td>Explorer</td><td><a href="${e(explorerLink)}" target="_blank">mempool.space →</a></td></tr>` : ''}
  </table>
</div>` : ''}

<div class="card">
  <h2>Información del proof</h2>
  <table>
    <tr><td>Recurso</td><td>${e(r.resourceType ?? '—')}</td></tr>
    <tr><td>Enviado</td><td>${e(r.submittedAt ?? '—')}</td></tr>
    ${r.confirmedAt ? `<tr><td>Confirmado</td><td>${e(r.confirmedAt)}</td></tr>` : ''}
    <tr><td>Calendar OTS</td><td>${e(r.calendarUrl ?? '—')}</td></tr>
    <tr><td>Tamaño del proof</td><td>${(r.proofSizeBytes ?? 0).toLocaleString('en-US')} bytes</td></tr>
    <tr><td>Verificaciones</td><td>${r.verificationCount ?? 0}</td></tr>
  </table>
</div>

<div class="card">
  <h2>Verificación independiente</h2>
  <p>Cualquier persona puede verificar este timestamp <strong>sin confiar en ADUANAI</strong>:</p>
  <p><a href="/verify/timestamp/${e(r.contentHash)}/proof.ots" class="download">📥 Descargar .ots proof</a></p>
  <p style="font-size:12px;color:#94a3b8;margin-top:16px;">Instrucciones:</p>
  <pre class="verify-cmd"># Instala el cliente oficial OpenTimestamps
pip install opentimestamps-client

# Verifica el proof contra el documento original
ots verify documento.txt -f documento.txt.ots</pre>
  <p style="font-size:11px;color:#64748b;margin-top:8px;">El timestamp cumple con principios de NOM-151-SCFI sobre conservación de mensajes de datos y no-repudio criptográfico.</p>
</div>

<p class="footer">ADUANAI · Anclaje vía OpenTimestamps al blockchain Bitcoin</p>
</div></body></html>`;
}

// ─────────────────────── Admin ───────────────────────

timestampsAdminRouter.get('/', adminOnly, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const resourceType = req.query.resourceType ? String(req.query.resourceType) : undefined;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (resourceType) where.resourceType = resourceType;
    const items = await prisma.timestampProof.findMany({
      where, orderBy: { submittedAt: 'desc' }, take: 200,
      select: {
        id: true, resourceType: true, resourceId: true, contentHash: true,
        bitcoinBlock: true, bitcoinTimestamp: true, status: true,
        submittedAt: true, confirmedAt: true, lastCheckedAt: true,
        verificationCount: true, errorMessage: true, calendarUrl: true,
      },
    });
    res.json({ status: 'ok', data: items });
  } catch (err) { next(err); }
});

timestampsAdminRouter.get('/stats', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const total = await prisma.timestampProof.count();
    const byStatus = await prisma.timestampProof.groupBy({
      by: ['status'], _count: { _all: true },
    });
    const lastConfirmed = await prisma.timestampProof.findFirst({
      where: { status: 'confirmed' }, orderBy: { confirmedAt: 'desc' },
      select: { confirmedAt: true, bitcoinBlock: true },
    });
    // Tiempo promedio de confirmación
    const confirmed = await prisma.timestampProof.findMany({
      where: { status: 'confirmed' },
      select: { submittedAt: true, confirmedAt: true },
      take: 100,
    });
    const avgConfirmMin = confirmed.length > 0
      ? Math.round(confirmed.reduce((s, p) => s + ((p.confirmedAt!.getTime() - p.submittedAt.getTime()) / 60000), 0) / confirmed.length)
      : null;

    res.json({
      status: 'ok',
      data: {
        total,
        byStatus: byStatus.map(s => ({ status: s.status, count: s._count._all })),
        lastConfirmed: lastConfirmed
          ? { confirmedAt: lastConfirmed.confirmedAt?.toISOString(), bitcoinBlock: lastConfirmed.bitcoinBlock }
          : null,
        avgConfirmationMinutes: avgConfirmMin,
      },
    });
  } catch (err) { next(err); }
});

timestampsAdminRouter.post('/check-pending', adminOnly, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await checkPendingTimestamps();
    res.json({ status: 'ok', data: result });
  } catch (err) { next(err); }
});
