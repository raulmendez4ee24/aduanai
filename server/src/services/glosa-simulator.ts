/**
 * Pre-Glosa — checklist heurístico preventivo de señales de riesgo de
 * Reconocimiento Aduanero (RA). Los índices que produce son heurísticos, no
 * probabilidades calibradas (§11 de la radiografía).
 *
 * El score se construye sumando los pesos de las reglas que se activan
 * sobre los datos del pedimento simulado. Cada regla se ejecuta contra
 * datos reales: precio estimado SAT, antidumping, padrones, NOMs, histórico
 * del importador y patrones de fracción/aduana/origen.
 *
 * FAIL-CLOSED (Frontera Canónica Fase 2, docs/FRONTERA_CANONICA_DESIGN.md §5):
 * cada consulta externa es un DOMINIO declarado. Si una consulta falla, el
 * dominio queda 'no_revisado' con motivo — visible en el resultado, en el
 * reporte y bloqueando la presentación del score como "bajo". Un fallo de DB
 * ya NO puede producir un reporte tranquilizador en silencio.
 */

import { prisma } from '../lib/prisma';
import { ADUANAS, normalizeCustomsCode } from '../lib/anexo22';
import { lookupEstimatedPrice } from './price-validator';
import { checkAntidumpingDuty } from './antidumping';
import { checkRequiredPadrones } from './padron-checker';
import { validateFraction, FRACTION_UNVERIFIED_MESSAGE } from './fraction-validator';
import { esMiembroTMEC } from '../lib/treaties';
import { getOfficialRate, type OfficialRate } from './exchange-rate';
import { logger } from '../lib/logger';
import {
  type DatoLegal,
  datoVerificado,
  datoSinVerificar,
  datoNoRevisado,
} from '../lib/dato-legal';
import { evaluarCruces, type CruceGlosa, type FraccionCatalogo } from './glosa-cruces';

export interface GlosaSimulationInput {
  fractionCode: string;
  fractionDescription?: string;
  productDescription?: string; // descripción del producto en factura
  countryOrigin: string;       // ISO-2 (CN, US, VN…)
  countryProvider: string;     // ISO-2 país de embarque
  customsCode: string;         // MAN, VER, TIJ…
  regimenCode: string;         // A1, A4, F4…

  unitValueUSD: number;
  unitMeasure?: string;
  units?: number;
  weightKg: number;
  totalValueUSD: number;
  totalValueMXN?: number;

  // Banderas declarativas
  declaresAntidumping?: boolean;
  declaresLink?: boolean;       // vinculación comprador-vendedor
  appliesTMEC?: boolean;
  hasTMECCertificate?: boolean;
  declaresNOMs?: boolean;
  hasIVAIEPSCertification?: boolean;

  // Documentación adjunta
  documents?: {
    invoice?: boolean;
    bl?: boolean;
    packingList?: boolean;
    originCertificate?: boolean;
    mve?: boolean;
    permits?: boolean;
    nomCertificates?: boolean;
  };

  // ── Operación 2026-08: datos de partida del archivo M3/Data Stage para los
  // cruces (glosa-cruces.ts). Todos opcionales: sin ellos el cruce queda
  // no_evaluado con motivo, nunca dispara por defecto.
  tratadoDeclarado?: string;        // TMEC | TLCUEM | CPTPP
  exportadorNombre?: string;        // proveedor/exportador de la factura (505.12)
  identificadores?: { codigo: string; complemento1?: string; complemento2?: string }[];
  unidadComercial?: string;         // clave Apéndice 7 o símbolo (551.12)
  unidadTarifa?: string;            // clave Apéndice 7 o símbolo (551.14)
  cantidadUmc?: number;             // 551.11
  cantidadUmt?: number;             // 551.13
  /** Metadatos de partida (multipartida) — no afectan el score. */
  numeroPartida?: number;
  pedimentoId?: string;
}

export interface RiskFlag {
  ruleCode: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  name: string;
  reason: string;
  recommendation: string;
  /** Legacy: texto plano del fundamento. Se conserva para compatibilidad. */
  legalBasis: string | null;
  /** Frontera Canónica: fundamento con procedencia. 'verificado' solo cuando
   *  la regla tiene fuenteNombre/fuenteUrl/fechaCotejo cotejados en DB. */
  fundamento: DatoLegal<string> | null;
  weight: number;
}

// ── Dominios de revisión (fail-closed §5.1) ────────────────────────────────
export const DOMINIOS_GLOSA = [
  'precio_estimado',
  'historico_importador',
  'cuotas_compensatorias',
  'padrones',
  'noms',
  'reclasificacion_historica',
] as const;
export type DominioGlosa = typeof DOMINIOS_GLOSA[number];

export interface RevisionGlosa {
  dominios: Record<DominioGlosa, 'revisado' | 'no_revisado' | 'no_aplica'>;
  completa: boolean; // todos 'revisado' | 'no_aplica'
  noRevisados: { dominio: DominioGlosa; motivo: string }[];
  /** Misión cierre 25-ago-2026: una regla cuyo dato de entrada NO fue
   *  capturado (o es insuficiente) queda `no_evaluado` con motivo visible —
   *  JAMÁS dispara por defecto ni finge haberse revisado. Distinto de
   *  `noRevisados` (fallo de consulta externa). */
  reglasNoEvaluadas: { ruleCode: string; motivo: string }[];
}

export interface GlosaSimulationResult {
  simulationId: string;
  riskScore: number;       // 0-100 — calculado SOLO sobre dominios revisados
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Nivel presentable: 'indeterminado' cuando la revisión quedó incompleta.
   *  La UI NO puede pintar verde un 'low' parcial (§5.2). */
  riskLevelPresentacion: 'low' | 'medium' | 'high' | 'critical' | 'indeterminado';
  raProbability: number;   // 0-100
  cotejoProb: number;
  glosaProb: number;
  flags: RiskFlag[];
  recommendations: { priority: 'critical' | 'recommended'; items: string[] }[];
  industryAverage: number | null;
  yourHistory: number | null;
  revision: RevisionGlosa;
  /** TC usado para derivar valueMXN, con procedencia. null solo si el valor
   *  MXN vino declarado por el usuario (entonces no se usó TC del sistema). */
  tipoCambio: DatoLegal<number> | null;
  disclaimer: string;
  /** Operación 2026-08: cruces por partida (origen-tratado, cuota por
   *  exportador, UMC/UMT, precio estimado, identificadores Ap. 8). Cada uno
   *  declara estado evaluado|no_evaluado y fundamento. Los hallazgos de cruce
   *  NO suman al riskScore heurístico (las reglas ponderadas viven en DB);
   *  se agregan en el resumen del pedimento. */
  cruces: CruceGlosa[];
}

/** Fuentes de datos inyectables — SOLO para tests (simular fallos de DB).
 *  En producción siempre se usan las implementaciones reales por default. */
export interface GlosaFuentes {
  precioEstimado: typeof lookupEstimatedPrice;
  cuotas: typeof checkAntidumpingDuty;
  padrones: typeof checkRequiredPadrones;
  historicoValores: (tenantId: string, fractionCode: string) => Promise<number[]>;
  historicoRA: (tenantId: string) => Promise<{ raRate: number; total: number }>;
  nomsRequeridas: (cleanedFraction: string) => Promise<string[]>;
  /** Reclasificaciones REALES del tenant en ventana de 12 meses: total de
   *  clasificaciones de la fracción y cuántas fueron marcadas incorrectas. */
  reclasificaciones: (tenantId: string, fractionCode: string) => Promise<{ total: number; reclasificadas: number }>;
  tipoCambio: () => Promise<OfficialRate>;
  /** Opcional (Operación 2026-08): catálogo de la fracción para los cruces. */
  fraccionCatalogo?: (cleanedFraction: string) => Promise<FraccionCatalogo | null>;
}

// Claves OFICIALES del Apéndice 1 Anexo 22 RGCE 2026 (Fase 4.1, cotejo DOF
// 15-ene-2026): 16 Manzanillo, 43 Veracruz, 40 Tijuana, 24 Nuevo Laredo,
// 51 Lázaro Cárdenas. Antes usaba códigos inventados de 3 letras donde 'ZLO'
// duplicaba Manzanillo bajo la etiqueta errónea "Zaragoza Coahuila".
// normalizeCustomsCode mantiene compatibilidad con registros históricos.
const HIGH_RISK_CUSTOMS = new Set(['16', '43', '40', '24', '51']);
const ASIAN_TRIANGULATION_PROVIDERS = new Set(['VN', 'MY', 'TH', 'KH', 'ID']);
const COMMON_CHINESE_FRACTION_PREFIXES = ['72', '73', '64', '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63', '85', '94', '95'];

// Lenguaje acorde a la radiografía §11 (24-ago): checklist heurístico
// preventivo, NO probabilidades reales ni calibración con la industria.
export const GLOSA_DISCLAIMER = 'Esta Pre-Glosa es un checklist heurístico preventivo: revisa señales disponibles de la operación contra reglas conocidas de riesgo y declara los dominios que no pudieron revisarse. Los índices que reporta son heurísticos, no probabilidades reales de revisión ni predicciones calibradas del SAT. La decisión final del SAT depende de su sistema interno y del personal de reconocimiento. Úsela como herramienta de prevención documental, no como garantía.';

function fractionLikelyChinese(fractionCode: string): boolean {
  const cleaned = fractionCode.replace(/[.\s-]/g, '');
  return COMMON_CHINESE_FRACTION_PREFIXES.some(p => cleaned.startsWith(p));
}

function descriptionIsGeneric(desc: string | undefined): boolean {
  if (!desc) return true;
  const trimmed = desc.trim();
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 10) return true;
  const vague = /\b(art[ií]culos?|equipo|accesorios?|partes?|productos?|materiales?|otros?)\b/i;
  return vague.test(trimmed) && wordCount < 15;
}

type ReglaRow = {
  ruleCode: string; category: string; name: string; severity: string; weight: number;
  recommendation: string; legalBasis: string | null;
  fuenteNombre: string | null; fuenteUrl: string | null; fechaCotejo: Date | null;
};

async function loadActiveRules(): Promise<Map<string, ReglaRow>> {
  const rules = await prisma.glosaRiskRule.findMany({ where: { active: true } });
  return new Map(rules.map(r => [r.ruleCode, r as ReglaRow]));
}

/** Fundamento con procedencia: verde solo si la regla tiene cotejo en DB. */
function fundamentoDeRegla(rule: ReglaRow): DatoLegal<string> | null {
  if (!rule.legalBasis) return null;
  if (rule.fuenteNombre && rule.fuenteUrl && rule.fechaCotejo) {
    return datoVerificado(
      rule.legalBasis,
      { nombre: rule.fuenteNombre, url: rule.fuenteUrl, version: null, fechaPublicacion: null },
      rule.fechaCotejo.toISOString(),
      'tabla',
      'manual',
    );
  }
  return datoSinVerificar(rule.legalBasis, 'tabla', 'Cotejo por artículo pendiente para esta regla.');
}

function buildFlag(rule: ReglaRow, reason: string): RiskFlag {
  return {
    ruleCode: rule.ruleCode,
    severity: rule.severity as RiskFlag['severity'],
    category: rule.category,
    name: rule.name,
    reason,
    recommendation: rule.recommendation,
    legalBasis: rule.legalBasis,
    fundamento: fundamentoDeRegla(rule),
    weight: rule.weight,
  };
}

// ── Implementaciones reales de las fuentes (default de GlosaFuentes) ──────

async function historicoValoresReal(tenantId: string, fractionCode: string): Promise<number[]> {
  const history = await prisma.classification.findMany({
    where: { tenantId, fractionCode, inputDeclaredValueUSD: { not: null } },
    select: { inputDeclaredValueUSD: true },
    take: 50,
    orderBy: { createdAt: 'desc' },
  });
  return history.map(h => Number(h.inputDeclaredValueUSD ?? 0)).filter(v => v > 0);
}

async function historicoRAReal(tenantId: string): Promise<{ raRate: number; total: number }> {
  const sims = await prisma.glosaSimulation.findMany({
    where: { tenantId, actualOutcome: { not: null } },
    select: { actualOutcome: true },
    take: 200,
  });
  if (sims.length === 0) return { raRate: 0, total: 0 };
  const raCount = sims.filter(s => s.actualOutcome === 'ra_yes').length;
  return { raRate: Math.round((raCount / sims.length) * 100), total: sims.length };
}

async function nomsRequeridasReal(cleaned: string): Promise<string[]> {
  const noms = await prisma.fractionRegulation.findMany({
    where: {
      active: true,
      type: 'NOM',
      OR: [
        { fractionCode: cleaned, matchType: 'exact' },
        { matchType: 'prefix' },
      ],
    },
    take: 10,
  });
  return noms
    .filter(n => n.matchType === 'exact' ? cleaned === n.fractionCode : cleaned.startsWith(n.fractionCode))
    .map(n => n.code);
}

/** CLA_001 (misión cierre 25-ago-2026): la señal REAL de reclasificación que
 *  existe en la plataforma es el feedback `incorrect` sobre clasificaciones
 *  DEL TENANT, en ventana de 12 meses. La versión anterior contaba TODAS las
 *  clasificaciones de la fracción, de todos los tenants, sin ventana (el
 *  filtro `{ not: undefined }` es inerte en Prisma) — disparaba por volumen
 *  de uso, no por reclasificación. */
async function reclasificacionesReal(tenantId: string, fractionCode: string): Promise<{ total: number; reclasificadas: number }> {
  const desde = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const where = { tenantId, fractionCode, createdAt: { gte: desde } };
  const [total, reclasificadas] = await Promise.all([
    prisma.classification.count({ where }),
    prisma.classification.count({ where: { ...where, feedback: 'incorrect' } }),
  ]);
  return { total, reclasificadas };
}

async function fraccionCatalogoReal(cleaned: string): Promise<FraccionCatalogo | null> {
  const f = await prisma.fraction.findUnique({
    where: { code: cleaned },
    select: { unit: true, tariffNMF: true, tariffTMEC: true, tariffTLCUE: true, tariffCPTPP: true, noms: true },
  });
  return f ?? null;
}

const FUENTES_REALES: GlosaFuentes = {
  precioEstimado: lookupEstimatedPrice,
  cuotas: checkAntidumpingDuty,
  padrones: checkRequiredPadrones,
  historicoValores: historicoValoresReal,
  historicoRA: historicoRAReal,
  nomsRequeridas: nomsRequeridasReal,
  reclasificaciones: reclasificacionesReal,
  tipoCambio: getOfficialRate,
  fraccionCatalogo: fraccionCatalogoReal,
};

async function getIndustryAverage(fractionCode: string): Promise<number | null> {
  const prefix = fractionCode.replace(/[.\s-]/g, '').slice(0, 4);
  const sims = await prisma.glosaSimulation.findMany({
    where: { actualOutcome: { not: null }, fractionCode: { startsWith: prefix.slice(0, 4) } },
    select: { actualOutcome: true },
    take: 500,
  });
  if (sims.length < 5) return null;
  const ra = sims.filter(s => s.actualOutcome === 'ra_yes').length;
  return Math.round((ra / sims.length) * 100);
}

export async function simulateGlosa(
  tenantId: string,
  userId: string,
  input: GlosaSimulationInput,
  fuentesOverride: Partial<GlosaFuentes> = {}, // SOLO tests — simular fallos
  clienteId: string | null = null, // Operación 2026-08: cliente/RFC activo
): Promise<GlosaSimulationResult> {
  const fuentes: GlosaFuentes = { ...FUENTES_REALES, ...fuentesOverride };

  // ── Entrada canónica (§5.3): fracción inexistente/inactiva → error explícito.
  // Un score bajo sobre una fracción inexistente es el reporte tranquilizador
  // en su forma más pura.
  const fractionCheck = await validateFraction(input.fractionCode);
  if (!fractionCheck.valid) {
    throw Object.assign(
      new Error(`La fracción "${input.fractionCode}" no existe o no está activa en el catálogo TIGIE vigente (${fractionCheck.reason}). ${FRACTION_UNVERIFIED_MESSAGE}`),
      { status: 400 },
    );
  }

  // Las reglas son el motor completo: sin ellas no hay simulación honesta.
  // Aquí sí se lanza (falla la request), no se degrada.
  const rules = await loadActiveRules();

  const flags: RiskFlag[] = [];
  let riskScore = 0;
  const addFlag = (ruleCode: string, reason: string) => {
    const r = rules.get(ruleCode);
    if (!r) return;
    flags.push(buildFlag(r, reason));
    riskScore += r.weight;
  };
  // Regla sin dato de entrada capturado o suficiente → no_evaluado con motivo.
  // JAMÁS disparo por defecto (misión cierre 25-ago-2026).
  const reglasNoEvaluadas: RevisionGlosa['reglasNoEvaluadas'] = [];
  const noEvaluada = (ruleCode: string, motivo: string) => {
    if (!rules.has(ruleCode)) return;
    reglasNoEvaluadas.push({ ruleCode, motivo });
  };

  // ── Registro fail-closed por dominio (§5.1). Cero catch silenciosos. ──
  const dominios = Object.fromEntries(
    DOMINIOS_GLOSA.map(d => [d, 'revisado']),
  ) as RevisionGlosa['dominios'];
  const noRevisados: RevisionGlosa['noRevisados'] = [];
  async function revisar<T>(dominio: DominioGlosa, fn: () => Promise<T>): Promise<T | null> {
    try {
      const out = await fn();
      dominios[dominio] = 'revisado';
      return out;
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      dominios[dominio] = 'no_revisado';
      noRevisados.push({ dominio, motivo });
      logger.warn(`Pre-Glosa: dominio ${dominio} NO revisado — ${motivo}`, {
        action: 'glosa_dominio_no_revisado',
        entity: 'glosa_simulation',
        tenantId,
        metadata: { dominio, motivo, fractionCode: input.fractionCode },
      });
      return null;
    }
  }

  // ── 1. Precio estimado SAT ── (dominio: precio_estimado)
  const est = await revisar('precio_estimado', () =>
    fuentes.precioEstimado(input.fractionCode, input.countryOrigin));
  if (est) {
    const declared = input.unitValueUSD;
    const estimated = Number(est.estimatedValue ?? 0);
    if (estimated > 0 && declared < estimated) {
      const deltaPct = Math.round(((estimated - declared) / estimated) * 100);
      if (deltaPct >= 30) {
        addFlag('VAL_001', `Valor declarado USD ${declared.toFixed(2)} está ${deltaPct}% por debajo del estimado SAT (USD ${estimated.toFixed(2)}).`);
      }
    }
  }

  // ── 2. Histórico del importador (variación valor + tasa RA propia) ──
  // (dominio: historico_importador — agrupa las dos consultas que afectan score)
  const historico = await revisar('historico_importador', async () => {
    const values = await fuentes.historicoValores(tenantId, input.fractionCode);
    const ra = await fuentes.historicoRA(tenantId);
    return { values, ra };
  });
  if (historico && historico.values.length >= 3) {
    const values = historico.values;
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const deviation = Math.abs((input.unitValueUSD - avg) / avg) * 100;
    if (deviation >= 25) {
      addFlag('VAL_002', `Variación ${Math.round(deviation)}% vs valor histórico promedio (USD ${avg.toFixed(2)}, n=${values.length}).`);
    }
  }

  // ── 3. Vinculación posible no declarada (heurística MVE) ──
  if (input.declaresLink === false) {
    // Si valor está bajo estimado Y no declara vinculación, sospecha
    const valFlag = flags.find(f => f.ruleCode === 'VAL_001');
    if (valFlag) {
      addFlag('VAL_003', 'Valor por debajo del estimado y no se declaró vinculación en MVE — patrón típico de revisión.');
    }
  }

  // ── 4. Triangulación ── (determinista, no consulta)
  if (
    input.countryOrigin !== input.countryProvider &&
    ASIAN_TRIANGULATION_PROVIDERS.has(input.countryProvider) &&
    fractionLikelyChinese(input.fractionCode)
  ) {
    addFlag('ORI_001', `Origen declarado ${input.countryOrigin} pero embarque desde ${input.countryProvider} para fracción típicamente china.`);
  }

  // ── 5. TMEC: membresía + certificado vinculado ── (determinista)
  // La membresía se valida IMPORTANDO la lista del Cotizador (lib/treaties
  // TMEC_PAISES vía esMiembroTMEC), nunca con una copia local. Una preferencia
  // declarada con origen fuera del tratado deja las reglas T-MEC no_evaluado
  // con el motivo visible — no tiene sentido evaluar certificados de una
  // preferencia inaplicable.
  const tmecMiembro = esMiembroTMEC(input.countryOrigin);
  const tmecInaplicable = Boolean(input.appliesTMEC) && !tmecMiembro;
  if (tmecInaplicable) {
    const motivoTMEC = `Se declaró preferencia T-MEC con origen ${input.countryOrigin.toUpperCase()}, que no es parte del tratado (lista del Cotizador). Corrige el origen o retira la preferencia.`;
    noEvaluada('ORI_002', motivoTMEC);
    noEvaluada('DOC_001', motivoTMEC);
  } else if (input.appliesTMEC && input.hasTMECCertificate) {
    if (input.documents?.originCertificate === undefined) {
      // El dato "certificado vinculado al pedimento" no fue capturado: sin él
      // esta regla disparaba SIEMPRE que se marcaran los dos checkboxes T-MEC.
      noEvaluada('ORI_002', 'El formulario no capturó si el certificado de origen está vinculado al pedimento.');
    } else if (!input.documents.originCertificate) {
      addFlag('ORI_002', 'Aplica TMEC pero el certificado de origen no está vinculado al pedimento.');
    }
  }

  // ── 6. Cuota compensatoria activa no declarada ── (dominio: cuotas_compensatorias)
  const cuotas = await revisar('cuotas_compensatorias', () =>
    fuentes.cuotas({ fractionCode: input.fractionCode, countryOfOrigin: input.countryOrigin }));
  if (cuotas && cuotas.length > 0 && !input.declaresAntidumping) {
    const d = cuotas[0]!.duty;
    addFlag('ORI_003', `Cuota compensatoria activa: ${d.resolutionNumber ?? d.expedienteUPCI ?? '—'} (${d.rate} ${d.rateUnit}).`);
  }

  // ── 7. Padrones SAT ── (dominio: padrones)
  const padron = await revisar('padrones', () =>
    fuentes.padrones(tenantId, input.fractionCode));
  if (padron && !padron.canOperate) {
    const missing = padron.blocking.map(b => b.type === 'general' ? 'General' : `Sectorial ${b.sectorialCode}`).join(', ');
    addFlag('PAD_001', `Padrón requerido no inscrito: ${missing}.`);
  }

  // ── 8. TMEC sin certificado ── (determinista; gateado por membresía arriba)
  if (!tmecInaplicable && input.appliesTMEC && !input.hasTMECCertificate) {
    addFlag('DOC_001', 'Se declara preferencia TMEC pero no hay certificado de origen vinculado.');
  }

  // ── 9. NOMs requeridas ── (dominio: noms)
  // FAIL-CLOSED §5.1: la consulta corre SIEMPRE, aunque el usuario declare
  // cumplimiento. La declaración solo suprime la bandera DOC_002 (queda como
  // declarado_usuario) — saltarse la consulta por una declaración era un
  // fail-open disfrazado de optimización.
  const cleaned = input.fractionCode.replace(/[.\s-]/g, '');
  const nomsRequeridas = await revisar('noms', () => fuentes.nomsRequeridas(cleaned));
  if (nomsRequeridas && nomsRequeridas.length > 0 && !input.declaresNOMs) {
    const list = nomsRequeridas.slice(0, 3).join(', ');
    addFlag('DOC_002', `Fracción requiere NOM(s) ${list} pero no se declaró cumplimiento.`);
  }

  // ── 9b. Cruces por partida (Operación 2026-08) ── deterministas sobre lo ya
  // consultado (precio estimado, cuotas) + catálogo de la fracción. Un fallo
  // del catálogo NO tumba la simulación: los cruces que lo necesitan quedan
  // no_evaluado con motivo (nunca se degrada en silencio: se loguea).
  let fraccionCat: FraccionCatalogo | null = null;
  try {
    fraccionCat = await (fuentes.fraccionCatalogo ?? fraccionCatalogoReal)(cleaned);
  } catch (err) {
    logger.warn('Pre-Glosa: catálogo de fracción no disponible para cruces', {
      action: 'glosa_fraccion_catalogo_fail', tenantId,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
  const cruces = evaluarCruces(
    {
      fractionCode: input.fractionCode, countryOrigin: input.countryOrigin, regimenCode: input.regimenCode,
      unitValueUSD: input.unitValueUSD, appliesTMEC: input.appliesTMEC, tratadoDeclarado: input.tratadoDeclarado,
      exportadorNombre: input.exportadorNombre, identificadores: input.identificadores,
      unidadComercial: input.unidadComercial, unidadTarifa: input.unidadTarifa,
      cantidadUmc: input.cantidadUmc, cantidadUmt: input.cantidadUmt, declaresAntidumping: input.declaresAntidumping,
    },
    {
      fraccion: fraccionCat,
      cuotas: dominios.cuotas_compensatorias === 'revisado' ? (cuotas ?? []) : null,
      precioEstimado: dominios.precio_estimado === 'revisado' ? est : undefined,
    },
  );

  // ── 10. Reclasificación histórica REAL ── (dominio: reclasificacion_historica)
  // Señal: clasificaciones DEL TENANT de esta fracción marcadas incorrectas en
  // los últimos 12 meses. Con historial insuficiente (<5) la regla queda
  // no_evaluado — antes disparaba por simple volumen de uso cross-tenant.
  const reclas = await revisar('reclasificacion_historica', () =>
    fuentes.reclasificaciones(tenantId, input.fractionCode));
  if (reclas !== null) {
    if (reclas.total < 5) {
      noEvaluada('CLA_001', `Historial insuficiente: ${reclas.total} clasificaciones de esta fracción para este tenant en 12 meses (mínimo 5 para evaluar reclasificación).`);
    } else if (reclas.reclasificadas / reclas.total >= 0.15) {
      addFlag('CLA_001', `${reclas.reclasificadas} de ${reclas.total} clasificaciones de esta fracción fueron marcadas como incorrectas en los últimos 12 meses (≥15%).`);
    }
  }

  // ── 11. Descripción genérica ── (determinista; exige captura real)
  if (!input.productDescription || !input.productDescription.trim()) {
    // Sin el dato la regla disparaba SIEMPRE — toda simulación de la UI la
    // arrastraba porque el formulario no capturaba la descripción.
    noEvaluada('CLA_002', 'El formulario no capturó la descripción del producto en factura.');
  } else if (descriptionIsGeneric(input.productDescription)) {
    addFlag('CLA_002', `Descripción del producto demasiado breve o genérica ("${input.productDescription.slice(0, 60)}").`);
  }

  // ── 12. Fracción "los demás" .99.99 ── (determinista)
  if (/\.99\.99$/.test(input.fractionCode) || /9999$/.test(cleaned)) {
    addFlag('CLA_003', 'Fracción residual ".99.99" (los demás) — revisada con frecuencia para verificar fracción específica.');
  }

  // ── 13. Importación temporal IMMEX sin certificación IVA-IEPS ──
  // Fase 4.2: antes revisaba la clave A4 llamándola "temporal IMMEX" — A4 es
  // INTRODUCCIÓN A DEPÓSITO FISCAL (Apéndice 2). Las claves temporales IMMEX
  // donde se causa IVA al despacho son IN (insumos) y AF (activo fijo).
  if (['IN', 'AF'].includes(input.regimenCode.toUpperCase()) && !input.hasIVAIEPSCertification) {
    addFlag('REG_001', `Importación temporal IMMEX (clave ${input.regimenCode.toUpperCase()}) sin certificación IVA-IEPS — IVA causado se paga o garantiza en el despacho (Art. 28-A LIVA).`);
  }

  // ── 14. Aduana de alto riesgo ── (determinista sobre catálogo en código)
  const customsClave = normalizeCustomsCode(input.customsCode);
  if (HIGH_RISK_CUSTOMS.has(customsClave)) {
    const aduana = ADUANAS.find(a => a.clave === customsClave);
    addFlag('ADU_001', `Aduana ${customsClave}${aduana ? ` (${aduana.denominacion})` : ''} con tasa histórica alta de RA.`);
  }

  // ── Score ajustado por histórico propio (parte del dominio historico) ──
  const ownHistory = historico?.ra ?? null;
  if (ownHistory && ownHistory.total >= 5 && ownHistory.raRate > 15) {
    riskScore += 10;
  }

  riskScore = Math.max(0, Math.min(100, riskScore));
  const riskLevel: GlosaSimulationResult['riskLevel'] =
    riskScore >= 80 ? 'critical' :
    riskScore >= 60 ? 'high' :
    riskScore >= 30 ? 'medium' : 'low';

  // ── Revisión (§5.2): el gate de presentación se decide en el BACKEND ──
  const revision: RevisionGlosa = {
    dominios,
    completa: noRevisados.length === 0,
    noRevisados,
    reglasNoEvaluadas,
  };
  const riskLevelPresentacion: GlosaSimulationResult['riskLevelPresentacion'] =
    revision.completa ? riskLevel : 'indeterminado';

  // Probabilidades derivadas (heurísticas, no calibradas; heredan la marca
  // parcial vía `revision` — la UI no debe presentarlas sin ese contexto)
  const raProbability = Math.min(95, Math.round(riskScore * 0.85));
  const glosaProb = Math.min(90, Math.round(riskScore * 0.7));
  const cotejoProb = Math.min(98, Math.round(40 + riskScore * 0.4)); // cotejo documental siempre alto

  // Recomendaciones
  const criticalFlags = flags.filter(f => f.severity === 'critical');
  const highFlags = flags.filter(f => f.severity === 'high');
  const recommendations: GlosaSimulationResult['recommendations'] = [];
  if (criticalFlags.length > 0) {
    recommendations.push({
      priority: 'critical',
      items: criticalFlags.map(f => f.recommendation),
    });
  }
  if (highFlags.length > 0 || riskLevel === 'high' || riskLevel === 'critical') {
    recommendations.push({
      priority: 'recommended',
      items: [
        ...highFlags.map(f => f.recommendation),
        ...(riskLevel === 'high' || riskLevel === 'critical'
          ? [
              'Tener documentación completa lista (invoice, BL, packing, COO, MVE).',
              'Considerar otorgar garantía en cuenta aduanera (Anexo 13 RGCE).',
              'Tener especialista en clasificación disponible para responder al ARA.',
            ]
          : []),
      ],
    });
  }

  // industryAverage es informativo (no afecta score); si falla → null y log,
  // sin marcar dominio (no forma parte de la revisión de la operación).
  let industryAverage: number | null = null;
  try {
    industryAverage = await getIndustryAverage(input.fractionCode);
  } catch (err) {
    logger.warn('Pre-Glosa: industryAverage no disponible', {
      action: 'glosa_industry_average_fail',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Valor MXN (§5.4): TC real con procedencia — JAMÁS una constante ──
  // Hoy ninguna regla de score depende del MXN (las reglas operan en USD);
  // por eso un fallo de TC no marca dominio no_revisado: se persiste null y
  // el DatoLegal 'no_revisado' del TC deja el hueco visible, no rellenado.
  let valueMXN: number | null = null;
  let tipoCambio: DatoLegal<number> | null = null;
  if (input.totalValueMXN != null) {
    // MXN declarado por el usuario: no se usó TC del sistema → tipoCambio null.
    // El valor mismo queda registrado como declarado en pedimentoData.
    valueMXN = input.totalValueMXN;
    tipoCambio = null;
  } else {
    try {
      const rate = await fuentes.tipoCambio();
      valueMXN = Math.round(input.totalValueUSD * rate.rate * 100) / 100;
      const fuenteTC = {
        nombre: rate.isOfficial ? 'Banxico FIX (SF43718, DOF)' : `Tipo de cambio (${rate.source})`,
        url: rate.isOfficial ? 'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718' : null,
        version: null,
        fechaPublicacion: rate.asOf.toISOString().slice(0, 10),
      };
      tipoCambio = rate.isOfficial
        ? datoVerificado(rate.rate, fuenteTC, rate.asOf.toISOString(), 'tabla', 'ingesta', rate.warning ?? undefined)
        : datoSinVerificar(rate.rate, 'tabla', rate.warning ?? `Fuente ${rate.source}, no Banxico.`, fuenteTC);
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      tipoCambio = datoNoRevisado(`TC del día no disponible: ${motivo}`);
      valueMXN = null;
      logger.warn('Pre-Glosa: TC no disponible — valueMXN queda null (nunca constante)', {
        action: 'glosa_tc_no_disponible',
        errorMessage: motivo,
      });
    }
  }

  // Persistir
  const created = await prisma.glosaSimulation.create({
    data: {
      tenantId, userId, clienteId,
      pedimentoData: input as unknown as object,
      fractionCode: input.fractionCode,
      countryOrigin: input.countryOrigin,
      countryProvider: input.countryProvider,
      customsCode: input.customsCode,
      regimenCode: input.regimenCode,
      valueUSD: input.totalValueUSD,
      valueMXN,
      exchangeRateUsed: tipoCambio as unknown as object,
      revision: revision as unknown as object,
      weightKg: input.weightKg,
      units: input.units ?? null,
      unitMeasure: input.unitMeasure ?? null,
      riskScore,
      riskLevel,
      raProbability,
      cotejoProb,
      glosaProb,
      riskFlags: flags as unknown as object,
      recommendations: recommendations as unknown as object,
      industryAverage: industryAverage ?? null,
      yourHistory: ownHistory && ownHistory.total >= 5 ? ownHistory.raRate : null,
    },
  });

  return {
    simulationId: created.id,
    riskScore,
    riskLevel,
    riskLevelPresentacion,
    raProbability,
    cotejoProb,
    glosaProb,
    flags,
    recommendations,
    industryAverage,
    yourHistory: ownHistory && ownHistory.total >= 5 ? ownHistory.raRate : null,
    revision,
    tipoCambio,
    disclaimer: GLOSA_DISCLAIMER,
    cruces,
  };
}

export async function recordOutcome(simulationId: string, tenantId: string, outcome: 'ra_yes' | 'ra_no' | 'documental' | 'free', notes?: string): Promise<void> {
  await prisma.glosaSimulation.update({
    where: { id: simulationId, tenantId },
    data: {
      actualOutcome: outcome,
      feedbackAt: new Date(),
      feedbackNotes: notes ?? null,
    },
  });
}

export async function getSimulationStats(): Promise<{
  total: number;
  byLevel: { level: string; count: number }[];
  topRules: { ruleCode: string; name: string; activations: number }[];
  customsRA: { customs: string; ra: number; total: number }[];
  modelCalibration: { predictedAvg: number; actualRA: number; total: number };
}> {
  const total = await prisma.glosaSimulation.count();
  const byLevel = await prisma.glosaSimulation.groupBy({
    by: ['riskLevel'], _count: { _all: true },
  });

  // Top reglas activadas
  const allSims = await prisma.glosaSimulation.findMany({ select: { riskFlags: true }, take: 1000 });
  const ruleCounts = new Map<string, { count: number; name: string }>();
  for (const s of allSims) {
    const fs = (s.riskFlags as unknown as { ruleCode: string; name: string }[]) ?? [];
    for (const f of fs) {
      const cur = ruleCounts.get(f.ruleCode);
      if (cur) cur.count++;
      else ruleCounts.set(f.ruleCode, { count: 1, name: f.name });
    }
  }
  const topRules = Array.from(ruleCounts.entries())
    .map(([ruleCode, v]) => ({ ruleCode, name: v.name, activations: v.count }))
    .sort((a, b) => b.activations - a.activations)
    .slice(0, 10);

  // Aduanas más riesgosas
  const customsGroup = await prisma.glosaSimulation.groupBy({
    by: ['customsCode', 'actualOutcome'], _count: { _all: true },
    where: { actualOutcome: { not: null } },
  });
  const cMap = new Map<string, { ra: number; total: number }>();
  for (const g of customsGroup) {
    const cur = cMap.get(g.customsCode) ?? { ra: 0, total: 0 };
    cur.total += g._count._all;
    if (g.actualOutcome === 'ra_yes') cur.ra += g._count._all;
    cMap.set(g.customsCode, cur);
  }
  const customsRA = Array.from(cMap.entries())
    .map(([customs, v]) => ({ customs, ra: v.ra, total: v.total }))
    .filter(x => x.total >= 3)
    .sort((a, b) => (b.ra / b.total) - (a.ra / a.total))
    .slice(0, 10);

  // Calibración del modelo
  const verified = await prisma.glosaSimulation.findMany({
    where: { actualOutcome: { not: null } },
    select: { raProbability: true, actualOutcome: true },
    take: 500,
  });
  const predAvg = verified.length > 0
    ? Math.round(verified.reduce((s, v) => s + v.raProbability, 0) / verified.length)
    : 0;
  const actualRA = verified.length > 0
    ? Math.round((verified.filter(v => v.actualOutcome === 'ra_yes').length / verified.length) * 100)
    : 0;

  return {
    total,
    byLevel: byLevel.map(l => ({ level: l.riskLevel, count: l._count._all })),
    topRules,
    customsRA,
    modelCalibration: { predictedAvg: predAvg, actualRA, total: verified.length },
  };
}
