/**
 * FRONTERA CANÓNICA · RECONCILIACIÓN DEL CLASIFICADOR (§3)
 *
 * Sustituye — no "compara" — los datos legales puntuales de la respuesta del
 * LLM por los canónicos del productor. El valor del LLM en los campos
 * sustituidos NUNCA llega a la respuesta ni al expediente como dato: si
 * difiere del canon se registra la discrepancia (telemetría/auditoría) y se
 * descarta. Si el canon dice 'no_disponible', el campo sale sin valor — el
 * LLM no rellena (§3.3).
 *
 * PUNTO DE APLICACIÓN: la RUTA (routes/classify.ts), inmediatamente después
 * de classifyProduct(). Nunca dentro del servicio — el bypass del retry de
 * baja confianza (radiografía §3) podría esquivarla. Este módulo es una
 * función que la ruta (y el runner de medición) llaman; no toca el prompt.
 */

import type { ClassificationResult } from './classifier';
import { validateFractions } from './fraction-validator';
import { datosCanonicosFraccion, type DatosCanonicosFraccion } from './frontera-canonica';
import { logger } from '../lib/logger';

export interface DiscrepanciaLLM {
  campo: string;        // 'tariffs.nmf', 'nico', 'regulations.noms', 'alternatives[2].code'…
  valorLLM: unknown;
  valorCanonico: unknown;
  fraccion: string;
}

export interface ReconciliacionClasificador {
  /** El resultado con los campos legales SUSTITUIDOS por los canónicos. */
  resultado: ClassificationResult;
  /** Bloque canónico envuelto en DatoLegal — lo que la UI sella en verde. */
  datosCanonicos: DatosCanonicosFraccion;
  /** Qué dijo el LLM distinto del catálogo. Telemetría, no UI (§3.3). */
  discrepancias: DiscrepanciaLLM[];
}

function iguales(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Reconciliación §3.1: campos sustituidos siempre. El objeto `result` NO se
 * muta: se devuelve una copia reconciliada (el original queda solo para la
 * telemetría de discrepancias).
 */
export async function reconciliarClasificacion(
  result: ClassificationResult,
): Promise<ReconciliacionClasificador> {
  const canon = await datosCanonicosFraccion(result.fraction.code);
  const fraccion = canon.fraccion.valor!.code;
  const discrepancias: DiscrepanciaLLM[] = [];
  const anota = (campo: string, valorLLM: unknown, valorCanonico: unknown) => {
    if (!iguales(valorLLM, valorCanonico)) discrepancias.push({ campo, valorLLM, valorCanonico, fraccion });
  };

  const resultado: ClassificationResult = structuredClone(result);

  // ── fraction.description: canónica INCONDICIONAL (hoy solo pasaba en el
  // fallback del candado; se vuelve regla).
  anota('fraction.description', result.fraction.description, canon.fraccion.valor!.description);
  resultado.fraction.description = canon.fraccion.valor!.description;

  // ── NICO (política §3.1): el del LLM solo sobrevive si existe en la lista
  // canónica. Catálogo sin NICO → el dato NO se muestra como verificado; la
  // sugerencia del LLM queda únicamente en explanation (texto etiquetado).
  const nicosCanon = canon.nico.valor ?? [];
  const nicoLLM = (result.nico ?? '').trim();
  if (canon.nico.estado === 'no_disponible') {
    if (nicoLLM) anota('nico', nicoLLM, null);
    resultado.nico = '';
  } else if (nicoLLM && nicosCanon.includes(nicoLLM)) {
    resultado.nico = nicoLLM; // elección del modelo entre los canónicos
  } else {
    anota('nico', nicoLLM || null, nicosCanon);
    resultado.nico = nicosCanon.length === 1 ? nicosCanon[0]! : '';
  }

  // ── Tarifas: SIEMPRE canon. no_disponible → null, jamás relleno LLM.
  anota('tariffs.nmf', result.tariffs?.nmf ?? null, canon.tarifas.nmf.valor);
  resultado.tariffs.nmf = canon.tarifas.nmf.valor as unknown as number;

  const prefCanon: Record<string, number> = {};
  const prefValor = canon.tarifas.preferenciales.valor;
  if (prefValor) {
    if (prefValor.TMEC != null) prefCanon.TMEC = prefValor.TMEC;
    if (prefValor.TLCUEM != null) prefCanon.TLCUEM = prefValor.TLCUEM;
    if (prefValor.CPTPP != null) prefCanon.CPTPP = prefValor.CPTPP;
  }
  anota('tariffs.preferential', result.tariffs?.preferential ?? {}, prefCanon);
  resultado.tariffs.preferential = prefCanon;

  // ── Regulaciones: SIEMPRE canon (códigos). El texto libre del LLM se
  // descarta; el detalle canónico viaja en datosCanonicos.
  const nomsCanon = (canon.regulaciones.noms.valor ?? []).map(n => n.code);
  anota('regulations.noms', result.regulations?.noms ?? [], nomsCanon);
  resultado.regulations.noms = nomsCanon;

  const rrnaCanon = (canon.regulaciones.rrna.valor ?? []).map(r =>
    r.type === 'permiso_previo' ? `Permiso previo — ${r.authority}: ${r.code}` : r.code);
  anota('regulations.rrna', result.regulations?.rrna ?? [], rrnaCanon);
  resultado.regulations.rrna = rrnaCanon;

  const padron = canon.regulaciones.padronSectorial.valor;
  if (padron) {
    anota('regulations.sectoralRegistry', result.regulations?.sectoralRegistry ?? false, padron.requerido);
    resultado.regulations.sectoralRegistry = padron.requerido;
  }

  // ── Alternativas: cada código debe EXISTIR en el catálogo. Inexistente/
  // inactiva se ELIMINA (era exactamente la clase de dato sin candado);
  // si existe, su descripción se sustituye por la canónica.
  if (resultado.alternatives?.length) {
    const checks = await validateFractions(resultado.alternatives.map(a => a.code));
    const supervivientes: typeof resultado.alternatives = [];
    checks.forEach((chk, i) => {
      const alt = resultado.alternatives[i]!;
      if (!chk.valid) {
        discrepancias.push({ campo: `alternatives[${i}].code`, valorLLM: alt.code, valorCanonico: null, fraccion });
        return;
      }
      const codeFormatted = `${chk.code.slice(0, 4)}.${chk.code.slice(4, 6)}.${chk.code.slice(6, 8)}`;
      if (alt.description !== chk.description) {
        anota(`alternatives[${i}].description`, alt.description, chk.description);
      }
      supervivientes.push({ ...alt, code: codeFormatted, description: chk.description ?? alt.description });
    });
    resultado.alternatives = supervivientes;
  }

  if (discrepancias.length > 0) {
    logger.warn(
      `Clasificador: ${discrepancias.length} discrepancia(s) LLM↔canon en ${fraccion} — canon aplicado`,
      {
        action: 'classifier_canon_discrepancy',
        entity: 'classification',
        metadata: {
          fraccion,
          campos: discrepancias.map(d => d.campo),
        },
      },
    );
  }

  return { resultado, datosCanonicos: canon, discrepancias };
}
