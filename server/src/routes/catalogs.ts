import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import {
  ADUANAS, REGIMENES, CLAVES_PEDIMENTO, ANEXO22_FUENTE,
  MEDIOS_TRANSPORTE, UNIDADES_MEDIDA, IDENTIFICADORES, REGULACIONES, ANEXO22_APENDICES_PENDIENTES,
} from '../lib/anexo22';

/**
 * Catálogos oficiales del Anexo 22 (fuente única — lib/anexo22.ts).
 * Consumido por el Simulador de Glosa y el Pre-validador (Fase 4.1/4.2).
 */
export const catalogsRouter = Router();

catalogsRouter.get('/anexo22', authenticate, (_req, res) => {
  res.json({
    status: 'ok',
    data: {
      aduanas: ADUANAS, regimenes: REGIMENES, clavesPedimento: CLAVES_PEDIMENTO, fuente: ANEXO22_FUENTE,
      // Operación 2026-08 — pendientes de cotejo verbatim (ver anexo22.ts)
      mediosTransporte: MEDIOS_TRANSPORTE, unidadesMedida: UNIDADES_MEDIDA,
      identificadores: IDENTIFICADORES, regulaciones: REGULACIONES,
      pendientesCotejo: ANEXO22_APENDICES_PENDIENTES,
    },
  });
});
