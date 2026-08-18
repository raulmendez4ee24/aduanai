/**
 * FRONTERA CANÓNICA · EL PRODUCTOR (docs/FRONTERA_CANONICA_DESIGN.md §2)
 *
 * Dada una fracción, devuelve sus datos legales envueltos en DatoLegal<T>
 * desde catálogo/tablas. REGLAS DURAS:
 *
 *  1. Este módulo JAMÁS llama a un LLM. No importa el caso: si el catálogo
 *     no tiene el dato → 'no_disponible'. (Un test verifica los imports.)
 *  2. Fail-closed por campo: si una sub-consulta falla, ese campo sale
 *     'no_revisado' y queda en integridad.camposNoRevisados — el productor
 *     no lanza por un campo (solo si la fracción misma no existe/inactiva).
 *  3. El ESTADO que puede otorgar cada fuente sale del registro de autoridad
 *     (§2.2), que codifica lo que la radiografía documentó: no todo lo que
 *     está en DB está cotejado. `origen: 'catalogo'` NO implica 'verificado'.
 *     Cuando un dataset pendiente se complete (ej. Anexo 2.4.1), se sube el
 *     estado AQUÍ y todos los consumidores suben a la vez.
 */

import { prisma } from '../lib/prisma';
import { validateFraction, FRACTION_UNVERIFIED_MESSAGE } from './fraction-validator';
import { resolveSectorsForFraction } from './padron-checker';
import { getActiveVersions, type ActiveVersions } from './traceability';
import { getOfficialRate } from './exchange-rate';
import { TARIFF_VERSION } from '../lib/tariff-version';
import { logger } from '../lib/logger';
import {
  type DatoLegal,
  type FuenteLegal,
  datoVerificado,
  datoSinVerificar,
  datoNoDisponible,
  datoNoRevisado,
} from '../lib/dato-legal';

// ── Registro de autoridad §2.2: fuentes y notas honestas por campo ────────

const FUENTE_SNICE: FuenteLegal = {
  nombre: 'Base Única SNICE · DOF',
  url: 'https://www.snice.gob.mx',
  version: TARIFF_VERSION.tigie,
  fechaPublicacion: TARIFF_VERSION.publishDate,
};

const FUENTE_ANEXO10: FuenteLegal = {
  nombre: 'Anexo 10 RGCE 2026',
  url: 'https://www.sat.gob.mx/minisitio/PadronImportadoresExportadores/documentos/DOF_20260114_RGCE-2026_Anexo-10_Fraccion-I.pdf',
  version: null,
  fechaPublicacion: '2026-01-14',
};

/** Fecha del extracto Base Única cargado — el "contra qué" del cotejo de catálogo. */
const FECHA_COTEJO_CATALOGO = TARIFF_VERSION.snapshotDate;

const NOTA_TARIFAS =
  'Verificado contra la versión del catálogo cargado; el sellado por fila (mezcla con seeds legacy) sigue pendiente.';
const NOTA_NOMS_FRACTION =
  'Cobertura pendiente de cotejo contra el Anexo 2.4.1 consolidado (Acuerdo NOMs).';
const NOTA_PADRON =
  'Cobertura fina por fracción con aproximaciones documentadas (Anexo 10).';
const NOTA_PREFERENCIALES =
  'null = sin dato en el catálogo cargado; no acredita por sí solo ausencia de preferencia en el tratado.';

// ── Contrato ──────────────────────────────────────────────────────────────

export interface RegulacionCanonica {
  code: string;
  authority: string;
  description: string;
  type: string; // 'NOM' | 'RRNA' | 'permiso_previo' | 'padron_sectorial'
}

export interface DatosCanonicosFraccion {
  fraccion: DatoLegal<{ code: string; codeFormatted: string; description: string; unit: string | null }>;
  nico: DatoLegal<string[]>;
  tarifas: {
    nmf: DatoLegal<number>;
    preferenciales: DatoLegal<{ TMEC: number | null; TLCUEM: number | null; CPTPP: number | null }>;
    ieps: DatoLegal<number>;
  };
  regulaciones: {
    noms: DatoLegal<RegulacionCanonica[]>;
    rrna: DatoLegal<RegulacionCanonica[]>;
    padronSectorial: DatoLegal<{ requerido: boolean; sectores: { codigo: string; nombre: string }[] }>;
  };
  versiones: ActiveVersions;
  integridad: { completo: boolean; camposNoRevisados: string[] };
}

// ── Productor ─────────────────────────────────────────────────────────────

export async function datosCanonicosFraccion(codeInput: string): Promise<DatosCanonicosFraccion> {
  const check = await validateFraction(codeInput);
  if (!check.valid) {
    throw new Error(
      `datosCanonicosFraccion: fracción "${codeInput}" inválida (${check.reason}). ${FRACTION_UNVERIFIED_MESSAGE}`,
    );
  }
  const code = check.code;

  const camposNoRevisados: string[] = [];
  async function campo<T>(nombre: string, fn: () => Promise<DatoLegal<T>>): Promise<DatoLegal<T>> {
    try {
      return await fn();
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      camposNoRevisados.push(nombre);
      logger.warn(`Frontera canónica: campo ${nombre} NO revisado — ${motivo}`, {
        action: 'frontera_campo_no_revisado',
        metadata: { campo: nombre, fraccion: code, motivo },
      });
      return datoNoRevisado<T>(`Consulta fallida (${nombre}): ${motivo}`);
    }
  }

  // Fila del catálogo — si esto falla tras validateFraction OK es un fallo
  // de infraestructura: los campos derivados salen no_revisado, no inventados.
  const row = await prisma.fraction.findUnique({
    where: { code },
    select: {
      codeFormatted: true, description: true, unit: true,
      nico: true, nicos: true,
      tariffNMF: true, tariffTMEC: true, tariffTLCUE: true, tariffCPTPP: true, iepsRate: true,
      noms: true,
    },
  });
  if (!row) {
    // validateFraction acaba de verla; una desaparición aquí es carrera/infra.
    throw new Error(`datosCanonicosFraccion: la fracción ${code} desapareció del catálogo entre validación y lectura.`);
  }

  const fraccion = datoVerificado(
    { code, codeFormatted: row.codeFormatted, description: row.description, unit: row.unit },
    FUENTE_SNICE, FECHA_COTEJO_CATALOGO, 'catalogo', 'ingesta',
  );

  const nicosCanonicos = row.nicos.length > 0 ? row.nicos : (row.nico ? [row.nico] : []);
  const nico = nicosCanonicos.length > 0
    ? datoVerificado(nicosCanonicos, FUENTE_SNICE, FECHA_COTEJO_CATALOGO, 'catalogo', 'ingesta')
    : datoNoDisponible<string[]>('catalogo', FUENTE_SNICE, 'La Base Única no registra NICO para esta fracción.');

  const nmf = row.tariffNMF != null
    ? datoVerificado(row.tariffNMF, FUENTE_SNICE, FECHA_COTEJO_CATALOGO, 'catalogo', 'ingesta', NOTA_TARIFAS)
    : datoNoDisponible<number>('catalogo', FUENTE_SNICE);

  const hayPreferencial = row.tariffTMEC != null || row.tariffTLCUE != null || row.tariffCPTPP != null;
  const preferenciales = hayPreferencial
    ? datoVerificado(
        { TMEC: row.tariffTMEC, TLCUEM: row.tariffTLCUE, CPTPP: row.tariffCPTPP },
        FUENTE_SNICE, FECHA_COTEJO_CATALOGO, 'catalogo', 'ingesta', NOTA_PREFERENCIALES,
      )
    : datoNoDisponible<{ TMEC: number | null; TLCUEM: number | null; CPTPP: number | null }>(
        'catalogo', FUENTE_SNICE, NOTA_PREFERENCIALES,
      );

  const ieps = row.iepsRate != null
    ? datoVerificado(row.iepsRate, FUENTE_SNICE, FECHA_COTEJO_CATALOGO, 'catalogo', 'ingesta', NOTA_TARIFAS)
    : datoNoDisponible<number>('catalogo', FUENTE_SNICE);

  // NOMs: FractionRegulation (tabla curada, por fila) con fallback al campo
  // del catálogo (dataset reconocido como pendiente → sin_verificar SIEMPRE).
  const noms = await campo<RegulacionCanonica[]>('regulaciones.noms', async () => {
    const filas = await regulacionesPara(code, ['NOM']);
    if (filas.length > 0) {
      return datoVerificado(filas, fuenteRegulacion(filas), fechaCotejoRegulacion(filas), 'tabla', 'manual');
    }
    if (row.noms.length > 0) {
      return datoSinVerificar(
        row.noms.map(n => ({ code: n, authority: 'SE', description: '', type: 'NOM' })),
        'catalogo', NOTA_NOMS_FRACTION, FUENTE_SNICE,
      );
    }
    return datoNoDisponible<RegulacionCanonica[]>('tabla', undefined,
      'Sin NOM registrada para esta fracción en las tablas cargadas — no acredita por sí solo que no aplique ninguna.');
  });

  const rrna = await campo<RegulacionCanonica[]>('regulaciones.rrna', async () => {
    const filas = await regulacionesPara(code, ['RRNA', 'permiso_previo']);
    if (filas.length > 0) {
      return datoVerificado(filas, fuenteRegulacion(filas), fechaCotejoRegulacion(filas), 'tabla', 'manual');
    }
    return datoNoDisponible<RegulacionCanonica[]>('tabla', undefined,
      'Sin RRNA/permiso registrado para esta fracción en las tablas cargadas.');
  });

  const padronSectorial = await campo<{ requerido: boolean; sectores: { codigo: string; nombre: string }[] }>(
    'regulaciones.padronSectorial',
    async () => {
      const sectores = await resolveSectorsForFraction(code);
      return datoVerificado(
        { requerido: sectores.length > 0, sectores: sectores.map(s => ({ codigo: s.sectorialCode, nombre: s.sectorialName })) },
        FUENTE_ANEXO10, FECHA_COTEJO_CATALOGO, 'tabla', 'manual', NOTA_PADRON,
      );
    },
  );

  const versiones = await getActiveVersions();

  return {
    fraccion,
    nico,
    tarifas: { nmf, preferenciales, ieps },
    regulaciones: { noms, rrna, padronSectorial },
    versiones,
    integridad: { completo: camposNoRevisados.length === 0, camposNoRevisados },
  };
}

async function regulacionesPara(code: string, tipos: string[]): Promise<RegulacionCanonica[]> {
  const filas = await prisma.fractionRegulation.findMany({
    where: {
      active: true,
      type: { in: tipos },
      OR: [
        { fractionCode: code, matchType: 'exact' },
        { matchType: 'prefix' },
      ],
    },
  });
  return filas
    .filter(f => f.matchType === 'exact' ? f.fractionCode === code : code.startsWith(f.fractionCode))
    .map(f => ({ code: f.code, authority: f.authority, description: f.description, type: f.type }));
}

function fuenteRegulacion(filas: RegulacionCanonica[]): FuenteLegal {
  const autoridades = [...new Set(filas.map(f => f.authority))].join(', ');
  return { nombre: `Regulaciones por fracción (${autoridades})`, url: null, version: null, fechaPublicacion: null };
}

function fechaCotejoRegulacion(_filas: RegulacionCanonica[]): string {
  // La tabla es curada manualmente; el cotejo declarado es el del snapshot de
  // catálogo con el que se sembró. Cuando la tabla gane fechaCotejo por fila,
  // se usa esa (mismo camino que GlosaRiskRule).
  return FECHA_COTEJO_CATALOGO;
}

// ── Tipo de cambio con procedencia (§2.1) ─────────────────────────────────
// Envuelve el servicio único de TC. Los consumidores que hoy tengan un TC
// constante (17, 18, el que sea) DEBEN migrar aquí; el test anti-reincidencia
// de la frontera falla si reaparece un literal.
export async function tipoCambioMXN(): Promise<DatoLegal<number>> {
  try {
    const rate = await getOfficialRate();
    const fuente: FuenteLegal = {
      nombre: rate.isOfficial ? 'Banxico FIX (SF43718, DOF)' : `Tipo de cambio (${rate.source})`,
      url: rate.isOfficial ? 'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718' : null,
      version: null,
      fechaPublicacion: rate.asOf.toISOString().slice(0, 10),
    };
    return rate.isOfficial
      ? datoVerificado(rate.rate, fuente, rate.asOf.toISOString(), 'tabla', 'ingesta', rate.warning ?? undefined)
      : datoSinVerificar(rate.rate, 'tabla', rate.warning ?? `Fuente ${rate.source}, no Banxico.`, fuente);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    return datoNoRevisado<number>(`TC del día no disponible: ${motivo}`);
  }
}
