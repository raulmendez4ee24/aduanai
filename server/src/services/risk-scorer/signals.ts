/**
 * RISK SCORER — constructor de señales VERIFICADAS (server-side).
 *
 * Orquesta módulos ya cotejados del producto — no re-implementa lógica:
 *  - validateFraction (catálogo Fraction, fail-closed)
 *  - resolveSectorsForFraction (SATPadron, Anexo 10 DOF 14-01-2026)
 *  - AntidumpingDuty (exact-match fracción+país, solo activas)
 *  - validatePedimentoNumero (Anexo 22)
 *  - TemporaryImport (Inventario del tenant)
 *  - Sat69B (ingesta del CSV público del SAT)
 *
 * Todo lo que NO se puede verificar queda null/undefined y las reglas
 * correspondientes no disparan por esa vía (el checklist declarativo cubre).
 */
import { prisma } from '../../lib/prisma';
import type { Prisma } from '@prisma/client';
import { validateFraction, normalizeFractionCode } from '../fraction-validator';
import { resolveSectorsForFraction } from '../padron-checker';
import { validatePedimentoNumero } from '../../lib/anexo22';
import type { OperacionInput, VerificadoSignals } from './types';

/** Antigüedad máxima de la lista 69-B para considerarla verificación plena. */
export const LISTA_69B_MAX_DIAS = 30;

/** Construye el filtro atribuible a la operación para temporales próximos a vencer. */
export function buildTemporalesWhere(
  tenantId: string,
  op: OperacionInput,
  ahora: Date,
): Prisma.TemporaryImportWhereInput | null {
  if (!op.fraccion && !op.numeroPedimento) return null;

  const or: Prisma.TemporaryImportWhereInput[] = [];
  if (op.fraccion) {
    or.push({ fractionCode: normalizeFractionCode(op.fraccion) });
  }
  if (op.numeroPedimento) {
    const digitos = op.numeroPedimento.replace(/\D/g, '');
    const variantes = digitos.length === 15
      ? [digitos, `${digitos.slice(0, 2)} ${digitos.slice(2, 4)} ${digitos.slice(4, 8)} ${digitos.slice(8)}`]
      : [op.numeroPedimento];
    or.push({ pedimento: { in: variantes } });
  }

  return {
    tenantId,
    isDemoData: false,
    expirationDate: { lte: new Date(ahora.getTime() + 30 * 86_400_000) },
    status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED', 'EXPIRED'] },
    OR: or,
  };
}

export async function buildVerifiedSignals(tenantId: string, op: OperacionInput): Promise<VerificadoSignals> {
  const out: VerificadoSignals = {};

  // ── F6: fracción contra el catálogo (sin LLM) ──
  if (op.fraccion) {
    const v = await validateFraction(op.fraccion);
    out.fraccionValida = v.valid;
    out.fraccionClasificadorCoincide = null; // v1: sin invocación al Clasificador (CERO LLM en el cálculo)
    if (v.valid) {
      const f = await prisma.fraction.findUnique({ where: { code: v.code }, select: { nicos: true, noms: true } });
      if (op.nico) {
        out.nicoExiste = (f?.nicos?.length ?? 0) === 0 ? null : f!.nicos.includes(op.nico);
      }
      out.nomsRequeridas = f?.noms ?? [];
      // ── F4: sectores del Anexo 10 requeridos por la fracción ──
      out.sectoresRequeridos = (await resolveSectorsForFraction(v.code)).map(s => s.sectorialCode);
      // ── F3: cuota compensatoria exact-match (fracción + país de origen) ──
      if (op.paisOrigen) {
        const ad = await prisma.antidumpingDuty.findFirst({
          where: { active: true, fractionCode: v.code, countryOfOrigin: op.paisOrigen.toUpperCase() },
          select: { rate: true, rateUnit: true, countryOfOrigin: true },
        });
        out.cuotaActiva = ad ? { tasa: `${ad.rate} ${ad.rateUnit}`, pais: ad.countryOfOrigin } : null;
      }
    }
  }

  // ── F8: formato del número de pedimento (Anexo 22) ──
  if (op.numeroPedimento) {
    out.pedimentoFormatoValido = validatePedimentoNumero(op.numeroPedimento).valid;
  }

  // ── F2: listado 69-B (tabla ingestada del CSV público del SAT) ──
  if (op.importadorRfc) {
    const rfc = op.importadorRfc.trim().toUpperCase();
    const meta = await prisma.sat69B.findFirst({ orderBy: { importedAt: 'desc' }, select: { importedAt: true } });
    if (meta) {
      const dias = (Date.now() - meta.importedAt.getTime()) / 86_400_000;
      out.lista69BDisponible = dias <= LISTA_69B_MAX_DIAS;
      const row = await prisma.sat69B.findUnique({ where: { rfc } });
      out.en69B = row && (row.situacion === 'DEFINITIVO' || row.situacion === 'PRESUNTO')
        ? { situacion: row.situacion, listaAl: meta.importedAt.toISOString().slice(0, 10) }
        : null;
    } else {
      out.lista69BDisponible = false; // sin ingesta: la señal no existe (no se inventa)
    }
  }

  // ── F5: temporales del tenant (Inventario) ──
  const temporalesWhere = buildTemporalesWhere(tenantId, op, new Date());
  out.temporalesPorVencer = temporalesWhere
    ? await prisma.temporaryImport.count({ where: temporalesWhere })
    : undefined;
  // El modelo TemporaryImport no registra domicilio de destino vs registrado:
  // la señal 151-VIII no es derivable en v1 (queda 0 — la regla F5-TMP-01 no dispara por sistema).
  out.temporalesFueraDomicilio = 0;

  // ── F6 agravante: dataset del decreto DOF 29-12-2025 (Fase 1b — aún sin dato estructurado) ──
  out.fraccionEnDecretoTasas = null;

  return out;
}

export function normalizarOperacion(op: OperacionInput): OperacionInput {
  return { ...op, fraccion: op.fraccion ? normalizeFractionCode(op.fraccion) : undefined };
}
