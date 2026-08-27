/**
 * LECTOR DE PEDIMENTOS — API del lote (Fase 1.3, aprobada 17-jul).
 *
 * POST /api/pedimentos/parse — parseo determinista sin evaluar (dry-run)
 * POST /api/pedimentos/radar — parseo + un RiskAssessment POR OPERACIÓN
 *   (motor reusado TAL CUAL: señales del archivo = 'verificado por sistema:
 *   archivo M'; las no derivables quedan en el tri-estado declarativo que el
 *   llamador puede aportar en `declarado`, compartido para el lote).
 *
 * MÓDULO BETA tras flag: en producción requiere PEDIMENTO_READER_ENABLED=true.
 * Validado contra layout oficial v9.0; validación con archivos reales PENDIENTE.
 * CERO LLM en todo el flujo.
 */
import { Router, type Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { evaluate } from '../services/risk-scorer/engine';
import { buildVerifiedSignals, normalizarOperacion } from '../services/risk-scorer/signals';
import { DEFAULT_WEIGHTS } from '../services/risk-scorer/rules';
import type { Signals } from '../services/risk-scorer/types';
import { parseArchivoM, ArchivoMError } from '../services/pedimento-reader/parser';
import { mapearOperaciones, type OperacionExtraida } from '../services/pedimento-reader/mapper';
import { LAYOUT_VERSION } from '../services/pedimento-reader/layout-v9';
import { declaradoSchema } from './risk';

const router = Router();
router.use(authenticate);

export const AVISO_BETA =
  'BETA — parser validado contra el layout oficial VOCE-SAAI M3 v9.0 (ago-2021); ' +
  'la validación con archivos reales de agencias está PENDIENTE. Ante un archivo ' +
  'que no coincida con el layout, el sistema rechaza completo (fail-closed).';

/** Tope de partidas por lote (guarda de recursos, no de negocio). Configurable
 *  por entorno: RADAR_MAX_PARTIDAS (entero > 0); default 200 (Fase A, Raúl). */
export const DEFAULT_MAX_PARTIDAS_LOTE = 200;
export function maxPartidasLote(): number {
  const n = Number(process.env.RADAR_MAX_PARTIDAS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_PARTIDAS_LOTE;
}

/** Reglas que suman puntos en una partida, con el ORIGEN EFECTIVO de la señal
 *  que emite el motor (verificado | declarado | mixto | no_evaluado). Un factor
 *  declarativo sin respuesta puntúa (noConfirmado) y llega como 'declarado':
 *  la UI reutiliza la misma etiqueta que /risk-scorer, sin tercer término. */
export function reglasActivasDe(factores: { reglas: { id: string; descripcion: string; puntos: number; maxPuntos: number; origenEfectivo: string; origenSenal: string }[] }[]) {
  return factores.flatMap(f => f.reglas.filter(r => r.puntos > 0).map(r => ({
    id: r.id, descripcion: r.descripcion, puntos: r.puntos, maxPuntos: r.maxPuntos, origenEfectivo: r.origenEfectivo ?? r.origenSenal,
  }))).sort((a, b) => b.puntos - a.puntos);
}

function resumenDe(filas: { banda: string; banderas: string[]; pedimento: string; partida: number; hallazgos: { destacado: boolean; codigo: string; mensaje: string }[] }[]) {
  const porBanda: Record<string, number> = {};
  for (const f of filas) porBanda[f.banda] = (porBanda[f.banda] ?? 0) + 1;
  const banderas = [...new Set(filas.flatMap(f => f.banderas))];
  const hallazgosDestacados = filas.flatMap(f => f.hallazgos.filter(h => h.destacado).map(h => ({ pedimento: f.pedimento, partida: f.partida, ...h })));
  return { porBanda, banderas, hallazgosDestacados };
}

function readerHabilitado(): boolean {
  if (process.env.PEDIMENTO_READER_ENABLED === 'true') return true;
  if (process.env.PEDIMENTO_READER_ENABLED === 'false') return false;
  return process.env.NODE_ENV !== 'production'; // beta: apagado por defecto en prod
}

const bodySchema = z.object({
  nombreArchivo: z.string().min(1).max(64),
  contenido: z.string().min(1).max(2_000_000),
  tipoSujeto: z.enum(['agente', 'agencia']).default('agente'),
  declarado: declaradoSchema.default({}),
});

const ORDEN_BANDA: Record<string, number> = { ROJO_CRITICO: 0, ROJO: 1, NARANJA: 2, AMARILLO: 3, VERDE: 4 };

function hallazgosDe(op: OperacionExtraida, signals: Signals): { codigo: string; mensaje: string; destacado: boolean }[] {
  const h: { codigo: string; mensaje: string; destacado: boolean }[] = [];
  const v = signals.verificado;
  // Adición aprobada 17-jul: fracción muerta = señal de máximo valor, no crash.
  if (v.fraccionValida === false) {
    h.push({
      codigo: 'FRACCION_INEXISTENTE', destacado: true,
      mensaje: `El pedimento cita la fracción ${op.partida.fraccion} y NO existe en la TIGIE vigente del catálogo — revisar de inmediato (LA 54: responsabilidad por correcta clasificación).`,
    });
  }
  // Coherencia con el motor (25-ago): el hallazgo destacado solo se emite con
  // lista DISPONIBLE. Con lista vencida/sin ingesta se informa que la señal no
  // se evaluó — nunca se presenta un hit de lista caduca como alerta vigente
  // mientras el score dice "no evaluado".
  if (v.en69B && v.lista69BDisponible === true) {
    h.push({
      codigo: 'LISTADO_69B', destacado: true,
      mensaje: `El RFC del importador aparece como ${v.en69B.situacion} en el listado del Art. 69-B CFF (lista al ${v.en69B.listaAl}).`,
    });
  } else if (v.lista69BDisponible === false) {
    h.push({
      codigo: 'LISTA_69B_NO_EVALUADA', destacado: false,
      mensaje: 'La consulta al listado 69-B no se evaluó: la lista está vencida (>30 días) o sin ingesta. No afecta el score.',
    });
  }
  if (v.cuotaActiva) {
    h.push({
      codigo: 'CUOTA_ACTIVA', destacado: true,
      mensaje: `Cuota compensatoria activa para ${op.partida.fraccion} origen ${v.cuotaActiva.pais}: ${v.cuotaActiva.tasa}.`,
    });
  }
  if (v.nicoExiste === false) h.push({ codigo: 'NICO_INEXISTENTE', destacado: false, mensaje: `El NICO ${op.partida.nico} no existe para la fracción.` });
  if (v.pedimentoFormatoValido === false) h.push({ codigo: 'NUMERO_PEDIMENTO_INVALIDO', destacado: false, mensaje: 'El número de pedimento reconstruido no valida contra el Anexo 22.' });
  if ((v.sectoresRequeridos?.length ?? 0) > 0) h.push({ codigo: 'SECTOR_ANEXO10', destacado: false, mensaje: `La fracción exige padrón sectorial: ${v.sectoresRequeridos!.join(', ')}.` });
  if ((v.nomsRequeridas?.length ?? 0) > 0) h.push({ codigo: 'NOMS_APLICABLES', destacado: false, mensaje: `NOMs aplicables según catálogo: ${v.nomsRequeridas!.join(', ')}.` });
  return h;
}

async function getWeights(): Promise<Record<string, number>> {
  const rows = await prisma.riskFactorWeight.findMany();
  if (rows.length === 0) return DEFAULT_WEIGHTS;
  return Object.fromEntries(rows.map(r => [r.factor, r.peso]));
}

function parseOr422(res: Response, nombre: string, contenido: string) {
  try {
    return parseArchivoM(nombre, contenido);
  } catch (e) {
    if (e instanceof ArchivoMError) {
      res.status(422).json({ status: 'error', message: e.message, detalles: e.detalles.slice(0, 10), layoutVersion: LAYOUT_VERSION });
      return null;
    }
    throw e;
  }
}

router.post('/parse', async (req: AuthRequest, res: Response) => {
  if (!readerHabilitado()) return res.status(403).json({ status: 'error', message: 'Lector de pedimentos deshabilitado (beta — PEDIMENTO_READER_ENABLED)' });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ status: 'error', message: 'Entrada inválida', issues: parsed.error.issues.slice(0, 5) });
  const archivo = parseOr422(res, parsed.data.nombreArchivo, parsed.data.contenido);
  if (!archivo) return;
  const operaciones = archivo.pedimentos.flatMap(p => mapearOperaciones(archivo.archivo, p));
  res.json({
    status: 'ok', beta: true, avisoValidacion: AVISO_BETA, layoutVersion: LAYOUT_VERSION,
    data: {
      archivo: archivo.archivo,
      pedimentosProcesables: archivo.pedimentos.length,
      excluidos: archivo.excluidos,
      registrosIgnorados: archivo.registrosIgnorados,
      advertenciasIntegridad: archivo.advertenciasIntegridad,
      operaciones,
    },
  });
});

router.post('/radar', async (req: AuthRequest, res: Response) => {
  if (!readerHabilitado()) return res.status(403).json({ status: 'error', message: 'Lector de pedimentos deshabilitado (beta — PEDIMENTO_READER_ENABLED)' });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ status: 'error', message: 'Entrada inválida', issues: parsed.error.issues.slice(0, 5) });
  const { nombreArchivo, contenido, tipoSujeto, declarado } = parsed.data;

  const archivo = parseOr422(res, nombreArchivo, contenido);
  if (!archivo) return;

  const operaciones = archivo.pedimentos.flatMap(p => mapearOperaciones(archivo.archivo, p));
  const totalPartidas = operaciones.length;
  const limite = maxPartidasLote();
  if (totalPartidas > limite) {
    return res.status(413).json({
      status: 'error',
      message: `El archivo trae ${totalPartidas} partidas y el radar acepta hasta ${limite} por lote. Divide el archivo o carga otro.`,
      limite, partidas: totalPartidas, layoutVersion: LAYOUT_VERSION,
    });
  }
  const weights = await getWeights();

  // Un id por lote: cada assessment lo lleva en input._lote.loteId junto con el
  // snapshot de su fila y la meta del lote, para que GET /radar/:loteId
  // reconstruya la pantalla desde lo persistido (refresh en demo ≠ pantalla vacía).
  const loteId = randomUUID();
  const meta = {
    nombreArchivo, tipoSujeto, layoutVersion: LAYOUT_VERSION,
    archivo: archivo.archivo,
    pedimentosProcesados: archivo.pedimentos.length,
    excluidos: archivo.excluidos,
    registrosIgnorados: archivo.registrosIgnorados,
    advertenciasIntegridad: archivo.advertenciasIntegridad,
  };

  const filas = [];
  for (const opx of operaciones) {
    const op = normalizarOperacion(opx.operacion);
    const verificado = await buildVerifiedSignals(req.tenantId!, op);
    // fechaEvaluacion = hoy, igual que /api/risk/assess: sin ella el motor hace
    // fail-safe (MVE exigible) y el radar contradiría la tarjeta "Criterios
    // actualizados" que lee vigencias.ts en la misma pantalla.
    const signals: Signals = { tipoSujeto, fechaEvaluacion: new Date().toISOString().slice(0, 10), operacion: op, declarado, verificado };
    const resultado = evaluate(signals, weights);
    const fila = {
      pedimento: opx.pedimento.numeroPedimento7,
      numeroPedimento15: opx.pedimento.numeroPedimento15,
      partida: opx.partida.numeroPartida,
      fraccion: opx.partida.fraccion,
      nico: opx.partida.nico,
      descripcion: opx.partida.descripcion.slice(0, 80),
      valorUsd: opx.partida.valorUsd,
      banda: resultado.banda,
      exposicion: resultado.exposicion,
      escudoPct: resultado.escudoPct,
      banderas: resultado.banderas,
      hallazgos: hallazgosDe(opx, signals),
      reglasActivas: reglasActivasDe(resultado.factores),
      origenDatos: opx.origenDatos,
      proveniencia: opx.proveniencia,
    };
    const saved = await prisma.riskAssessment.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.userId!,
        input: JSON.parse(JSON.stringify({
          ...signals,
          _lote: {
            loteId, origen: 'archivo-m', archivo: opx.proveniencia.archivo, layoutVersion: LAYOUT_VERSION,
            pedimento: opx.pedimento.numeroPedimento7, partida: opx.partida.numeroPartida,
            origenDatos: opx.origenDatos, proveniencia: opx.proveniencia,
            fila, meta,
          },
        })),
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
    filas.push({ ...fila, assessmentId: saved.id });
  }

  filas.sort((a, b) => (ORDEN_BANDA[a.banda] ?? 9) - (ORDEN_BANDA[b.banda] ?? 9) || b.exposicion - a.exposicion);
  const { porBanda, banderas: banderasLote, hallazgosDestacados } = resumenDe(filas);

  res.json({
    status: 'ok', beta: true, avisoValidacion: AVISO_BETA, layoutVersion: LAYOUT_VERSION,
    data: {
      loteId,
      archivo: archivo.archivo,
      resumen: {
        pedimentosProcesados: archivo.pedimentos.length,
        operaciones: filas.length,
        porBanda,
        banderas: banderasLote,
        hallazgosDestacados,
        excluidos: archivo.excluidos,
        registrosIgnorados: archivo.registrosIgnorados,
        advertenciasIntegridad: archivo.advertenciasIntegridad,
      },
      radar: filas,
    },
  });
});

/**
 * GET /api/pedimentos/radar/:loteId — reconstruye el radar de un lote YA
 * persistido (cada RiskAssessment del lote lleva input._lote.{loteId, fila,
 * meta}). Misma forma de respuesta que el POST; no re-evalúa nada.
 * Solo el tenant dueño ve su lote (404 para cualquier otro: no se revela
 * existencia). Lotes anteriores a la Fase A (sin loteId) no son direccionables.
 */
/** Estado del módulo para el cliente (gating de nav/palette): el único dato es
 *  si el beta está habilitado en este entorno. Va ANTES de /radar/:loteId. */
router.get('/radar/estado', async (_req: AuthRequest, res: Response) => {
  res.json({ status: 'ok', data: { habilitado: readerHabilitado() } });
});

router.get('/radar/:loteId', async (req: AuthRequest, res: Response) => {
  if (!readerHabilitado()) return res.status(403).json({ status: 'error', message: 'Lector de pedimentos deshabilitado (beta — PEDIMENTO_READER_ENABLED)' });
  const loteId = String(req.params.loteId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(loteId)) return res.status(404).json({ status: 'error', message: 'Lote no encontrado' });

  const rows = await prisma.riskAssessment.findMany({
    where: { tenantId: req.tenantId!, input: { path: ['_lote', 'loteId'], equals: loteId } },
    select: { id: true, input: true, banda: true, exposicion: true, escudoPct: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (rows.length === 0) return res.status(404).json({ status: 'error', message: 'Lote no encontrado' });

  type Lote = { fila?: Record<string, unknown>; meta?: Record<string, unknown> };
  const filas = rows.flatMap(r => {
    const lote = ((r.input as { _lote?: Lote } | null)?._lote) ?? {};
    if (!lote.fila) return [];
    // banda/exposición/escudo salen de las COLUMNAS del assessment (fuente), el
    // resto del snapshot de la fila.
    return [{ ...(lote.fila as object), banda: r.banda, exposicion: r.exposicion, escudoPct: r.escudoPct, assessmentId: r.id } as {
      banda: string; exposicion: number; escudoPct: number; banderas: string[]; pedimento: string; partida: number;
      hallazgos: { destacado: boolean; codigo: string; mensaje: string }[]; assessmentId: string;
    }];
  });
  if (filas.length === 0) return res.status(404).json({ status: 'error', message: 'Lote no encontrado' });
  filas.sort((a, b) => (ORDEN_BANDA[a.banda] ?? 9) - (ORDEN_BANDA[b.banda] ?? 9) || b.exposicion - a.exposicion);

  const meta = (((rows[0]!.input as { _lote?: Lote } | null)?._lote?.meta) ?? {}) as {
    archivo?: unknown; pedimentosProcesados?: number; excluidos?: unknown[]; registrosIgnorados?: Record<string, number>;
    advertenciasIntegridad?: string[]; layoutVersion?: string;
  };
  const { porBanda, banderas, hallazgosDestacados } = resumenDe(filas);

  res.json({
    status: 'ok', beta: true, avisoValidacion: AVISO_BETA, layoutVersion: meta.layoutVersion ?? LAYOUT_VERSION,
    data: {
      loteId,
      persistido: true,
      creadoEn: rows[0]!.createdAt.toISOString(),
      archivo: meta.archivo ?? null,
      resumen: {
        pedimentosProcesados: meta.pedimentosProcesados ?? 0,
        operaciones: filas.length,
        porBanda,
        banderas,
        hallazgosDestacados,
        excluidos: meta.excluidos ?? [],
        registrosIgnorados: meta.registrosIgnorados ?? {},
        advertenciasIntegridad: meta.advertenciasIntegridad ?? [],
      },
      radar: filas,
    },
  });
});

export default router;
