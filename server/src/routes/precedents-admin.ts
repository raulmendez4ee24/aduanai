/**
 * Admin — carga de precedentes (Ola 2, 27-ago-2026).
 *   POST /api/admin/precedents/importar       { fileName, base64 } | { filas }
 *   GET  /api/admin/precedents/plantilla.xlsx
 *   GET  /api/admin/precedents/estado         conteos honestos (flag, con/sin fuente)
 * Nada se sirve al Clasificador hasta que PRECEDENT_CORPUS_VERIFIED=true.
 */
import { Router, type Response, type NextFunction } from 'express';
import { authenticate, type AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { importarPrecedentes, parsearArchivoImportacion, plantillaXlsx } from '../services/corpus-importador';
import { PRECEDENT_CORPUS_VERIFIED, precedenteTieneFuente } from '../services/precedent-lookup';

export const precedentsAdminRouter = Router();
precedentsAdminRouter.use(authenticate, requireRole('SUPERADMIN'));

precedentsAdminRouter.post('/importar', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body as { fileName?: string; base64?: string; filas?: unknown };
    let filas: Record<string, unknown>[];
    if (Array.isArray(body.filas)) filas = body.filas as Record<string, unknown>[];
    else if (body.base64 && body.fileName) filas = parsearArchivoImportacion(body.base64, body.fileName);
    else return res.status(400).json({ status: 'error', message: 'Envía { fileName, base64 } (xlsx/csv/json) o { filas: [...] }' });
    if (filas.length === 0) return res.status(400).json({ status: 'error', message: 'El archivo no tiene filas' });
    if (filas.length > 500) return res.status(400).json({ status: 'error', message: 'Máximo 500 filas por importación' });
    const r = await importarPrecedentes(filas);
    res.json({
      status: 'ok', data: r,
      aviso: PRECEDENT_CORPUS_VERIFIED ? null : 'PRECEDENT_CORPUS_VERIFIED=false: las filas quedan cargadas pero NO se sirven al Clasificador ni al Copilot hasta cerrar el cotejo TFJA/SAT.',
    });
  } catch (err) {
    if (err instanceof Error && /leer el archivo|JSON inválido|no tiene hojas/.test(err.message)) {
      return res.status(400).json({ status: 'error', message: err.message });
    }
    next(err);
  }
});

precedentsAdminRouter.get('/plantilla.xlsx', (_req: AuthRequest, res: Response) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-precedentes.xlsx"');
  res.send(plantillaXlsx('precedents'));
});

precedentsAdminRouter.get('/estado', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.legalPrecedent.findMany({
      select: { id: true, type: true, reference: true, title: true, source: true, yearPublished: true, isVigente: true, fractionCodes: true, applicability: true },
      orderBy: { yearPublished: 'desc' }, take: 200,
    });
    const conFuente = rows.filter(precedenteTieneFuente).length;
    res.json({
      status: 'ok',
      data: {
        corpusVerificado: PRECEDENT_CORPUS_VERIFIED,
        total: rows.length, conFuente, sinFuente: rows.length - conFuente,
        items: rows.map(r => ({ ...r, tieneFuente: precedenteTieneFuente(r), cotejo: /\[cotejo (\d{4}-\d{2}-\d{2})\]/.exec(r.applicability ?? '')?.[1] ?? null })),
      },
    });
  } catch (err) { next(err); }
});
