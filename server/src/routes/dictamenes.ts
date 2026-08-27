/**
 * Dictamen humano (Ola 1, Operación 2026-08): el usuario pide que una persona
 * con permiso `classifier.approve` dictamine la fracción de una clasificación.
 *
 *   POST /api/classify/:id/solicitar-dictamen   { motivo? }  → SolicitudDictamen abierta
 *   GET  /api/dictamenes?estado=abierta|en_revision|dictaminada|rechazada
 *   POST /api/dictamenes/:id/resolver           { fractionCode, nico?, fundamento }
 *        (solo classifier.approve) → dictamen Json, estado dictaminada, y una
 *        Classification nueva APROBADA con la fracción dictaminada (versión
 *        humana del expediente). NO toca Product (Catálogo es de otro módulo).
 *   POST /api/dictamenes/:id/rechazar           { motivo }  (classifier.approve)
 */
import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/requirePermission';
import { prisma } from '../lib/prisma';
import { limpiarFraccion } from '../services/clasificacion-lote';
import { filtroCliente } from '../lib/cliente-contexto';

/** Se monta bajo /api/classify. */
export const solicitarDictamenRouter = Router();
solicitarDictamenRouter.use(authenticate);

/** Se monta bajo /api/dictamenes. */
export const dictamenesRouter = Router();
dictamenesRouter.use(authenticate);

const ESTADOS = ['abierta', 'en_revision', 'dictaminada', 'rechazada'] as const;

solicitarDictamenRouter.post('/:id/solicitar-dictamen', requirePermission('classifier', 'create'), async (req: AuthRequest, res, next) => {
  try {
    const c = await prisma.classification.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId! },
      select: { id: true },
    });
    if (!c) return res.status(404).json({ status: 'error', message: 'Clasificación no encontrada.' });
    const { motivo } = (req.body ?? {}) as { motivo?: string };

    const abierta = await prisma.solicitudDictamen.findFirst({
      where: { tenantId: req.tenantId!, classificationId: c.id, estado: { in: ['abierta', 'en_revision'] } },
    });
    if (abierta) return res.json({ status: 'ok', data: abierta, existente: true });

    const s = await prisma.solicitudDictamen.create({
      data: {
        tenantId: req.tenantId!,
        classificationId: c.id,
        solicitadoPor: req.userId!,
        motivo: typeof motivo === 'string' && motivo.trim() ? motivo.trim().slice(0, 2000) : null,
        estado: 'abierta',
      },
    });
    res.status(201).json({ status: 'ok', data: s, existente: false });
  } catch (err) { next(err); }
});

dictamenesRouter.get('/', requirePermission('classifier', 'view'), async (req: AuthRequest, res, next) => {
  try {
    const estado = typeof req.query.estado === 'string' ? req.query.estado : '';
    if (estado && !(ESTADOS as readonly string[]).includes(estado)) {
      return res.status(400).json({ status: 'error', message: `estado debe ser uno de: ${ESTADOS.join(', ')}` });
    }
    // Alcance por cliente: la solicitud cuelga de una Classification con clienteId
    // (sin relación Prisma → se resuelven primero las clasificaciones en alcance).
    const alcance = filtroCliente(req);
    const enAlcance = 'clienteId' in alcance
      ? (await prisma.classification.findMany({ where: { tenantId: req.tenantId!, clienteId: alcance.clienteId }, select: { id: true } })).map(c => c.id)
      : null;
    const solicitudes = await prisma.solicitudDictamen.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(estado ? { estado } : {}),
        ...(enAlcance ? { classificationId: { in: enAlcance } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const ids = solicitudes.map(s => s.classificationId).filter((x): x is string => !!x);
    const clasificaciones = ids.length
      ? await prisma.classification.findMany({
        where: { id: { in: ids }, tenantId: req.tenantId! },
        select: { id: true, inputDescription: true, fractionCode: true, fractionDescription: true, confidence: true, status: true, clienteId: true },
      })
      : [];
    const porId = new Map(clasificaciones.map(c => [c.id, c]));
    const usuarios = await prisma.user.findMany({
      where: { tenantId: req.tenantId!, id: { in: [...new Set(solicitudes.flatMap(s => [s.solicitadoPor, s.asignadoA].filter((x): x is string => !!x)))] } },
      select: { id: true, name: true, email: true },
    });
    const userPorId = new Map(usuarios.map(u => [u.id, u]));
    res.json({
      status: 'ok',
      data: solicitudes.map(s => ({
        ...s,
        clasificacion: s.classificationId ? porId.get(s.classificationId) ?? null : null,
        solicitante: userPorId.get(s.solicitadoPor) ?? null,
      })),
    });
  } catch (err) { next(err); }
});

dictamenesRouter.post('/:id/resolver', requirePermission('classifier', 'approve'), async (req: AuthRequest, res, next) => {
  try {
    const s = await prisma.solicitudDictamen.findFirst({ where: { id: String(req.params.id), tenantId: req.tenantId! } });
    if (!s) return res.status(404).json({ status: 'error', message: 'Solicitud no encontrada.' });
    if (s.estado === 'dictaminada' || s.estado === 'rechazada') {
      return res.status(400).json({ status: 'error', message: `La solicitud ya está ${s.estado}.` });
    }
    const { fractionCode: raw, nico, fundamento } = (req.body ?? {}) as { fractionCode?: string; nico?: string; fundamento?: string };
    const fractionCode = limpiarFraccion(typeof raw === 'string' ? raw : '');
    if (!/^\d{8}$/.test(fractionCode)) {
      return res.status(400).json({ status: 'error', message: 'fractionCode debe tener 8 dígitos (ej. 7318.15.99).' });
    }
    if (typeof fundamento !== 'string' || fundamento.trim().length < 10) {
      return res.status(400).json({ status: 'error', message: 'fundamento requerido (mínimo 10 caracteres): GRI aplicadas, notas de sección/capítulo, criterio.' });
    }
    const enCatalogo = await prisma.fraction.findFirst({ where: { code: fractionCode, active: true }, select: { description: true, nicos: true, nico: true } });
    if (!enCatalogo) {
      return res.status(422).json({ status: 'error', message: `La fracción ${fractionCode} no existe o no está activa en el catálogo TIGIE cargado.` });
    }
    const nicoLimpio = typeof nico === 'string' ? nico.replace(/[^0-9]/g, '').slice(0, 2) : '';
    if (nicoLimpio && enCatalogo.nicos.length > 0 && !enCatalogo.nicos.some(n => n.endsWith(nicoLimpio))) {
      return res.status(422).json({ status: 'error', message: `El NICO ${nicoLimpio} no está entre los NICOs de la fracción (${enCatalogo.nicos.join(', ')}).` });
    }

    const original = s.classificationId
      ? await prisma.classification.findFirst({ where: { id: s.classificationId, tenantId: req.tenantId! } })
      : null;

    const dictamen = {
      fractionCode,
      nico: nicoLimpio || null,
      fundamento: fundamento.trim(),
      dictaminadoPor: req.userId!,
      fecha: new Date().toISOString(),
      classificationOriginalId: original?.id ?? null,
    };

    // Versión humana del expediente: Classification aprobada por quien dictamina.
    const aprobada = await prisma.classification.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.userId!,
        clienteId: original?.clienteId ?? null,
        inputDescription: original?.inputDescription ?? `Dictamen humano ${s.id}`,
        inputContext: original?.inputContext ?? null,
        inputCountryOfOrigin: original?.inputCountryOfOrigin ?? null,
        inputDeclaredValueUSD: original?.inputDeclaredValueUSD ?? null,
        inputUseCase: original?.inputUseCase ?? null,
        inputSector: original?.inputSector ?? null,
        inputImporterType: original?.inputImporterType ?? null,
        fractionCode,
        fractionDescription: enCatalogo.description,
        confidence: 100,
        griApplied: [],
        legalBasis: { origen: 'dictamen_humano', solicitudId: s.id, ...dictamen } as object,
        fullResponse: JSON.stringify({ origen: 'dictamen_humano', solicitudId: s.id, dictamen, nico: dictamen.nico }),
        tigieVersion: original?.tigieVersion ?? null,
        ligieVersion: original?.ligieVersion ?? null,
        status: 'approved',
        approvedAt: new Date(),
        approvedById: req.userId!,
      },
      select: { id: true },
    });

    if (original && limpiarFraccion(original.fractionCode) !== fractionCode) {
      await prisma.classification.update({
        where: { id: original.id },
        data: { feedback: 'incorrect', feedbackNote: `Dictamen humano: ${fractionCode}${dictamen.nico ? ` NICO ${dictamen.nico}` : ''} (solicitud ${s.id})` },
      });
    } else if (original) {
      await prisma.classification.update({ where: { id: original.id }, data: { feedback: 'correct', feedbackNote: `Confirmada por dictamen humano (solicitud ${s.id})` } });
    }

    const actualizada = await prisma.solicitudDictamen.update({
      where: { id: s.id },
      data: {
        estado: 'dictaminada',
        asignadoA: req.userId!,
        resueltaAt: new Date(),
        dictamen: { ...dictamen, classificationAprobadaId: aprobada.id } as object,
      },
    });

    // Filas de lote que apuntaban a la clasificación original: se actualizan.
    if (original) {
      await prisma.classificationBatchRow.updateMany({
        where: { classificationId: original.id, batch: { tenantId: req.tenantId! } },
        data: { fractionCode, classificationId: aprobada.id, revisado: true, semaforo: 'verde', confidence: 100, error: null },
      });
    }

    res.json({ status: 'ok', data: actualizada, classificationId: aprobada.id });
  } catch (err) { next(err); }
});

dictamenesRouter.post('/:id/rechazar', requirePermission('classifier', 'approve'), async (req: AuthRequest, res, next) => {
  try {
    const s = await prisma.solicitudDictamen.findFirst({ where: { id: String(req.params.id), tenantId: req.tenantId! } });
    if (!s) return res.status(404).json({ status: 'error', message: 'Solicitud no encontrada.' });
    if (s.estado === 'dictaminada' || s.estado === 'rechazada') {
      return res.status(400).json({ status: 'error', message: `La solicitud ya está ${s.estado}.` });
    }
    const { motivo } = (req.body ?? {}) as { motivo?: string };
    const actualizada = await prisma.solicitudDictamen.update({
      where: { id: s.id },
      data: {
        estado: 'rechazada',
        asignadoA: req.userId!,
        resueltaAt: new Date(),
        dictamen: { rechazo: true, motivo: typeof motivo === 'string' ? motivo.trim().slice(0, 2000) : null, dictaminadoPor: req.userId!, fecha: new Date().toISOString() } as object,
      },
    });
    res.json({ status: 'ok', data: actualizada });
  } catch (err) { next(err); }
});
