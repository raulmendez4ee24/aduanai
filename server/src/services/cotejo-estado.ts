/**
 * TABLERO DE DEUDA DE COTEJO (Operación 2026-08, prioridad 2).
 *
 * Cuarta revisión: «la deuda de cotejo crece más rápido que el cotejo […] los
 * letreros honestos de "sin dato" son aceptables treinta días; a los seis meses
 * se convierten en la evidencia de que el producto está hueco».
 *
 * Este servicio NO inventa un solo dato legal. Lo que hace es CONTAR la deuda
 * con consultas reales y ponerle fecha: cuántas filas de cada bloque tienen ya
 * su cotejo cerrado, cuántas no, desde cuándo no se mueve la aguja, qué fuente
 * oficial hace falta y qué cargador la cierra. Cada métrica documenta en
 * `consulta` la query exacta que la produce, para que el número sea auditable.
 *
 * Reglas de la casa aplicadas:
 *   - "Cotejada" = atestación humana explícita (cotejadoAt / fechaCotejo /
 *     marcador `cotejadoPor:`). Una URL sola NUNCA cuenta como cotejo.
 *   - Un bloque sin tabla en el esquema (Anexo 21, correlativas LIGIE) no se
 *     disfraza de "0 %": se reporta con `estado: 'sin_estructura'` y el
 *     SCHEMA REQUERIDO en `queFalta`.
 *   - Multi-tenant: toda métrica de operación lleva `tenantId` en el where.
 *     Las métricas de catálogo (cuotas, corpus, reglas) son globales del
 *     producto y se marcan `ambito: 'producto'`.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { whereCliente, type AlcanceCliente } from '../lib/cliente-contexto';
import { MARCADOR_COTEJADO_POR } from './origin-reglas';
import { PRECEDENT_CORPUS_VERIFIED } from './precedent-lookup';
import { TIPO_REG_ANEXO21, TIPO_REG_CORRELATIVA, MATCH_ANEXO21, MATCH_CORRELATIVA, CARGADORES, TIPOS_CARGA } from './cotejo-cargadores';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

/** Días sin movimiento a partir de los cuales la deuda "envejece en silencio". */
export const UMBRAL_ENVEJECIMIENTO_DIAS = 90;

export type BloqueDeuda = 'cuotas' | 'precedentes' | 'corpus' | 'origen' | 'fracciones' | 'operacion';

export type EstadoMetrica =
  | 'cerrada'          // no falta nada
  | 'en_curso'         // hay avance parcial
  | 'sin_empezar'      // la tabla existe y está vacía de cotejo
  | 'sin_estructura'   // no hay dónde guardar el dato (SCHEMA REQUERIDO)
  | 'sin_universo';    // no hay filas que medir (p. ej. tenant nuevo)

export interface Metrica {
  clave: string;
  bloque: BloqueDeuda;
  titulo: string;
  /** 'producto' = catálogo compartido; 'tenant' = datos de la empresa. */
  ambito: 'producto' | 'tenant';
  /** Denominador: filas medidas. */
  universo: number;
  /** Numerador: filas que YA tienen el dato/cotejo cerrado. */
  conDato: number;
  /** universo - conDato. */
  faltan: number;
  /** null cuando el universo es 0 (no se inventa un 100 %). */
  porcentaje: number | null;
  estado: EstadoMetrica;
  /** La consulta que produce el número, en palabras (auditable). */
  consulta: string;
  /** Qué hace falta para cerrarla. */
  queFalta: string;
  /** Fuente oficial de la que sale el dato (DOF / UPCI / SNICE / TFJA / SAT). */
  fuenteOficial: string;
  /** Cargador que la cierra (tipo de plantilla), null si aún no existe. */
  cargador: string | null;
  /** Última atestación de cotejo registrada en el bloque. */
  ultimoMovimiento: string | null;
  /** Desde cuándo existe la deuda (fila pendiente más antigua). */
  desde: string | null;
  /** Días desde `ultimoMovimiento ?? desde`. null si no hay ninguna referencia. */
  diasDeDeuda: number | null;
  /** true = quedan filas pendientes y la aguja no se mueve hace > 90 días. */
  envejecida: boolean;
  /** Cuántas de las fracciones más usadas del historial toca esta métrica. */
  impacto: number;
  /** Aviso extra (p. ej. el switch global que apaga los precedentes). */
  nota?: string;
}

export interface FraccionUso {
  fractionCode: string;
  codeFormatted: string;
  descripcion: string | null;
  /** Clasificaciones del historial real del tenant con esta fracción. */
  usos: number;
  ultimaVez: string | null;
  /** Bloques de la ficha con dato cargado para esta fracción. */
  nico: boolean;
  prosec: boolean;
  prosecCotejada: boolean;
  precioEstimado: boolean;
  precioEstimadoOficial: boolean;
  anexo21: boolean;
  correlativa: boolean;
  cuotas: number;
  cuotasCotejadas: number;
  /** Nombres legibles de lo que falta (ordena el trabajo). */
  faltantes: string[];
  /** En el catálogo de fracciones (si no, la clasificación apunta a algo que no existe). */
  enCatalogo: boolean;
}

export interface TableroCotejo {
  generadoAt: string;
  tenantId: string;
  clienteId: AlcanceCliente;
  umbralDias: number;
  /** Fracciones más usadas del historial REAL del tenant (impacto primero). */
  topFracciones: FraccionUso[];
  metricas: Metrica[];
  resumen: {
    metricas: number;
    cerradas: number;
    conDeuda: number;
    envejecidas: number;
    filasPendientes: number;
    /** % global ponderado por filas (no por métricas). */
    porcentajeGlobal: number | null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers puros
// ─────────────────────────────────────────────────────────────────────────────

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function diasEntre(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

interface EntradaMetrica {
  clave: string;
  bloque: BloqueDeuda;
  titulo: string;
  ambito: 'producto' | 'tenant';
  universo: number;
  conDato: number;
  consulta: string;
  queFalta: string;
  fuenteOficial: string;
  cargador?: string | null;
  ultimoMovimiento?: Date | null;
  desde?: Date | null;
  impacto?: number;
  nota?: string;
  /** El dato no tiene tabla propia en el esquema. */
  sinEstructura?: boolean;
}

/**
 * Arma la métrica y decide su estado y su envejecimiento.
 *
 * Envejecimiento: la referencia temporal es la ÚLTIMA atestación de cotejo del
 * bloque (`ultimoMovimiento`). Si nunca hubo ninguna, se usa la fila pendiente
 * más antigua (`desde`): así una deuda que nació hace seis meses y nadie tocó
 * se marca envejecida, y una tabla recién sembrada no se marca el día 1.
 */
export function construirMetrica(e: EntradaMetrica, ahora: Date): Metrica {
  const universo = Math.max(0, e.universo);
  const conDato = Math.min(Math.max(0, e.conDato), universo);
  const faltan = universo - conDato;
  const porcentaje = universo === 0 ? null : Math.round((conDato / universo) * 1000) / 10;
  const referencia = e.ultimoMovimiento ?? e.desde ?? null;
  const diasDeDeuda = referencia ? Math.max(0, diasEntre(referencia, ahora)) : null;
  const estado: EstadoMetrica = e.sinEstructura
    ? 'sin_estructura'
    : universo === 0
      ? 'sin_universo'
      : faltan === 0
        ? 'cerrada'
        : conDato === 0
          ? 'sin_empezar'
          : 'en_curso';
  const envejecida = faltan > 0 && diasDeDeuda !== null && diasDeDeuda > UMBRAL_ENVEJECIMIENTO_DIAS;
  return {
    clave: e.clave, bloque: e.bloque, titulo: e.titulo, ambito: e.ambito,
    universo, conDato, faltan, porcentaje, estado,
    consulta: e.consulta, queFalta: e.queFalta, fuenteOficial: e.fuenteOficial,
    cargador: e.cargador ?? null,
    ultimoMovimiento: iso(e.ultimoMovimiento), desde: iso(e.desde), diasDeDeuda, envejecida,
    impacto: e.impacto ?? 0,
    ...(e.nota ? { nota: e.nota } : {}),
  };
}

/** Prefijos 2/4/6 dígitos de una fracción (las reglas por prefijo aplican así). */
function prefijos(code: string): string[] {
  return [code.slice(0, 2), code.slice(0, 4), code.slice(0, 6)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Corpus íntegro versionado en el repo (lotes JSON verbatim)
// ─────────────────────────────────────────────────────────────────────────────

export interface LoteCorpusRepo {
  archivo: string;
  documentos: number;
  referencias: string[];
}

/**
 * Lee `prisma/seed/corpus-integro/*.json` — los lotes verbatim con
 * `fechaCotejo` y `officialUrl` que YA están versionados en el repo. Sirve
 * para medir cuántos de esos artículos oficiales todavía NO están en la base
 * (deuda de carga, no de cotejo: el material ya existe y está cotejado).
 */
export function lotesCorpusDelRepo(dir?: string): LoteCorpusRepo[] {
  const base = dir ?? path.resolve(__dirname, '..', '..', 'prisma', 'seed', 'corpus-integro');
  let archivos: string[];
  try {
    archivos = fs.readdirSync(base).filter(f => f.endsWith('.json')).sort();
  } catch {
    return []; // el directorio no viaja en la imagen: se reporta universo 0
  }
  const out: LoteCorpusRepo[] = [];
  for (const archivo of archivos) {
    try {
      const crudo: unknown = JSON.parse(fs.readFileSync(path.join(base, archivo), 'utf8'));
      if (!Array.isArray(crudo)) continue;
      const referencias = crudo
        .map(d => (d && typeof d === 'object' && typeof (d as { reference?: unknown }).reference === 'string'
          ? (d as { reference: string }).reference : null))
        .filter((r): r is string => !!r);
      out.push({ archivo, documentos: crudo.length, referencias });
    } catch {
      // Un lote ilegible no tumba el tablero; simplemente no se cuenta.
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fracciones más usadas del historial REAL
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionesTablero {
  tenantId: string;
  /** Alcance de cliente/RFC (`alcanceDe(req)`). null = todo el tenant. */
  alcance?: AlcanceCliente;
  /** Cuántas fracciones del historial se analizan. */
  top?: number;
  /** Incluir clasificaciones sembradas para demo (default: no). */
  incluirDemo?: boolean;
  ahora?: Date;
}

/**
 * Las N fracciones más usadas del historial REAL del tenant.
 *
 * Consulta: `classification.groupBy({ by: ['fractionCode'], where: { tenantId,
 * isDemoData: false, ...clienteId del alcance }, orderBy: _count desc })`.
 * El tenantId es obligatorio (guard estricto) y el alcance de cliente se
 * aplica cuando el usuario está restringido a uno o varios RFC.
 */
export async function fraccionesMasUsadas(o: OpcionesTablero): Promise<{ fractionCode: string; usos: number; ultimaVez: Date | null }[]> {
  const top = Math.min(Math.max(o.top ?? 20, 1), 200);
  const filas = await prisma.classification.groupBy({
    by: ['fractionCode'],
    where: {
      tenantId: o.tenantId,
      ...(o.incluirDemo ? {} : { isDemoData: false }),
      ...whereCliente(o.alcance ?? null),
    },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _count: { fractionCode: 'desc' } },
    take: top,
  });
  return filas
    .map(f => ({ fractionCode: f.fractionCode, usos: f._count._all, ultimaVez: f._max.createdAt }))
    .filter(f => /^\d{8}$/.test(f.fractionCode.replace(/[^0-9]/g, '')))
    .map(f => ({ ...f, fractionCode: f.fractionCode.replace(/[^0-9]/g, '') }));
}

/** Cobertura por fracción de los bloques de la ficha (PROSEC / 84-A / Anexo 21 / NICO / correlativa / cuotas). */
async function coberturaDeFracciones(
  usos: { fractionCode: string; usos: number; ultimaVez: Date | null }[],
): Promise<FraccionUso[]> {
  const codes = usos.map(u => u.fractionCode);
  if (codes.length === 0) return [];
  const pref = [...new Set(codes.flatMap(prefijos))];

  const [fracciones, prosec, precios, regsAnexo21, cuotas, correlativas] = await Promise.all([
    prisma.fraction.findMany({ where: { code: { in: codes } }, select: { code: true, codeFormatted: true, description: true, nicos: true, nico: true } }),
    prisma.pROSECEligibility.findMany({
      where: { active: true, OR: [{ matchType: 'exact', fractionCode: { in: codes } }, { matchType: 'prefix', fractionCode: { in: pref } }] },
      select: { fractionCode: true, matchType: true, fechaCotejo: true },
    }),
    prisma.estimatedPrice.findMany({ where: { active: true, fractionCode: { in: codes } }, select: { fractionCode: true, source: true } }),
    // Anexo 21 y correlativas viven hoy en FractionRegulation con `type` y
    // `matchType` propios que ningún otro consumidor consulta (ver
    // cotejo-cargadores.ts y el SCHEMA REQUERIDO del reporte).
    prisma.fractionRegulation.findMany({
      where: {
        active: true, type: TIPO_REG_ANEXO21,
        OR: [{ matchType: MATCH_ANEXO21.exact, fractionCode: { in: codes } }, { matchType: MATCH_ANEXO21.prefix, fractionCode: { in: pref } }],
      },
      select: { fractionCode: true, matchType: true },
    }),
    prisma.antidumpingDuty.findMany({ where: { active: true, fractionCode: { in: codes } }, select: { fractionCode: true, cotejadoAt: true } }),
    prisma.fractionRegulation.findMany({
      where: {
        active: true, type: TIPO_REG_CORRELATIVA, matchType: MATCH_CORRELATIVA,
        // Como origen (fractionCode) o como destino (code = "2020>2022:<destino>").
        OR: [{ fractionCode: { in: codes } }, ...codes.map(c => ({ code: { endsWith: `:${c}` } }))],
      },
      select: { fractionCode: true, code: true },
    }),
  ]);

  const porCode = new Map(fracciones.map(f => [f.code, f]));
  const aplica = (fila: { fractionCode: string; matchType: string }, code: string) =>
    fila.matchType === MATCH_ANEXO21.exact || fila.matchType === 'exact'
      ? fila.fractionCode === code
      : code.startsWith(fila.fractionCode);

  const codesConCorrelativa = new Set<string>();
  for (const c of correlativas) {
    codesConCorrelativa.add(c.fractionCode);
    const destino = c.code.split(':')[1];
    if (destino) codesConCorrelativa.add(destino);
  }

  return usos.map(u => {
    const fr = porCode.get(u.fractionCode);
    const ps = prosec.filter(p => aplica(p, u.fractionCode));
    const pe = precios.filter(p => p.fractionCode === u.fractionCode);
    const a21 = regsAnexo21.filter(r => aplica(r, u.fractionCode));
    const cs = cuotas.filter(c => c.fractionCode === u.fractionCode);
    const nico = !!fr && (fr.nicos.length > 0 || !!fr.nico);
    const fila: FraccionUso = {
      fractionCode: u.fractionCode,
      codeFormatted: fr?.codeFormatted ?? u.fractionCode,
      descripcion: fr?.description ?? null,
      usos: u.usos,
      ultimaVez: iso(u.ultimaVez),
      nico,
      prosec: ps.length > 0,
      prosecCotejada: ps.some(p => !!p.fechaCotejo),
      precioEstimado: pe.length > 0,
      precioEstimadoOficial: pe.some(p => p.source === 'DOF' || p.source === 'SAT'),
      anexo21: a21.length > 0,
      correlativa: codesConCorrelativa.has(u.fractionCode),
      cuotas: cs.length,
      cuotasCotejadas: cs.filter(c => !!c.cotejadoAt).length,
      faltantes: [],
      enCatalogo: !!fr,
    };
    if (!fila.enCatalogo) fila.faltantes.push('no está en el catálogo de fracciones');
    if (!fila.nico) fila.faltantes.push('NICO');
    if (!fila.prosec) fila.faltantes.push('PROSEC');
    else if (!fila.prosecCotejada) fila.faltantes.push('PROSEC sin cotejo');
    if (!fila.precioEstimado) fila.faltantes.push('precio estimado (84-A)');
    else if (!fila.precioEstimadoOficial) fila.faltantes.push('precio estimado sin fuente oficial');
    if (!fila.anexo21) fila.faltantes.push('Anexo 21');
    if (!fila.correlativa) fila.faltantes.push('correlativa LIGIE');
    if (fila.cuotas > 0 && fila.cuotasCotejadas === 0) fila.faltantes.push('cuota sin cotejo');
    return fila;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tablero
// ─────────────────────────────────────────────────────────────────────────────

/** Fuente oficial por bloque — el texto que se muestra en la pantalla. */
export const FUENTES = {
  upci: 'DOF — resoluciones UPCI/SE (Unidad de Prácticas Comerciales Internacionales). Listado de cuotas compensatorias vigentes con tasas por exportador.',
  tfja: 'TFJA (tesis y precedentes) y criterios normativos SAT publicados en DOF.',
  dofCorpus: 'Texto verbatim de la fuente oficial: diputados.gob.mx (leyes), sat.gob.mx (RGCE/RMF), dof.gob.mx (decretos).',
  prosec: 'DOF — Decreto PROSEC y sus reformas (tasas por sector y fracción).',
  precios84a: 'DOF — Resoluciones que modifican el Anexo 2 de las RGCE (precios estimados, Art. 84-A Ley Aduanera).',
  anexo21: 'DOF — Anexo 21 de las RGCE (aduanas autorizadas para tramitar el despacho de determinadas mercancías).',
  correlativas: 'SNICE / SE — tablas de correlación LIGIE 2020↔2022↔2025 (y la Base Única vigente).',
  origen: 'DOF (Decreto de promulgación T-MEC, Anexo 4-B) y USITC General Note 11 para el texto en inglés.',
  snice: 'SNICE — Base Única de la LIGIE (NICOs vigentes).',
  interna: 'No requiere fuente externa: es trabajo del despacho (dictaminar, aprobar, fundamentar).',
} as const;

export async function estadoDeCotejo(o: OpcionesTablero): Promise<TableroCotejo> {
  const ahora = o.ahora ?? new Date();
  const alcance = o.alcance ?? null;

  const usos = await fraccionesMasUsadas(o);
  const topFracciones = await coberturaDeFracciones(usos);
  const nTop = topFracciones.length;

  const metricas: Metrica[] = [];
  metricas.push(...(await metricasCuotas(ahora, topFracciones)));
  metricas.push(...(await metricasPrecedentesYCorpus(ahora)));
  metricas.push(...(await metricasOrigen(ahora)));
  metricas.push(...metricasFracciones(ahora, topFracciones));
  metricas.push(...(await metricasCatalogoDeFracciones(ahora, topFracciones)));
  metricas.push(...(await metricasOperacion(ahora, o.tenantId, alcance)));

  // Orden por impacto: primero lo que toca las fracciones más usadas, después
  // el volumen de filas pendientes, después lo que lleva más tiempo parado.
  metricas.sort((a, b) =>
    b.impacto - a.impacto ||
    b.faltan - a.faltan ||
    (b.diasDeDeuda ?? -1) - (a.diasDeDeuda ?? -1) ||
    a.clave.localeCompare(b.clave));

  const filasPendientes = metricas.reduce((s, m) => s + m.faltan, 0);
  const universoTotal = metricas.reduce((s, m) => s + m.universo, 0);
  const conDatoTotal = metricas.reduce((s, m) => s + m.conDato, 0);

  return {
    generadoAt: ahora.toISOString(),
    tenantId: o.tenantId,
    clienteId: alcance,
    umbralDias: UMBRAL_ENVEJECIMIENTO_DIAS,
    topFracciones,
    metricas,
    resumen: {
      metricas: metricas.length,
      cerradas: metricas.filter(m => m.estado === 'cerrada').length,
      conDeuda: metricas.filter(m => m.faltan > 0).length,
      envejecidas: metricas.filter(m => m.envejecida).length,
      filasPendientes,
      porcentajeGlobal: universoTotal === 0 ? null : Math.round((conDatoTotal / universoTotal) * 1000) / 10,
    },
  };
}

// ── Bloque 1: cuotas compensatorias ──────────────────────────────────────────

async function metricasCuotas(ahora: Date, top: FraccionUso[]): Promise<Metrica[]> {
  const where = { active: true };
  const [total, cotejadas, conExportador, antielusion, ultima, masAntigua] = await Promise.all([
    prisma.antidumpingDuty.count({ where }),
    prisma.antidumpingDuty.count({ where: { ...where, cotejadoAt: { not: null } } }),
    prisma.antidumpingDuty.count({ where: { ...where, NOT: { exportadorTasas: { equals: Prisma.DbNull } } } }),
    prisma.antidumpingDuty.count({ where: { ...where, esAntielusion: true } }),
    prisma.antidumpingDuty.aggregate({ where: { ...where, cotejadoAt: { not: null } }, _max: { cotejadoAt: true } }),
    prisma.antidumpingDuty.aggregate({ where: { ...where, cotejadoAt: null }, _min: { createdAt: true } }),
  ]);
  const impacto = top.filter(f => f.cuotas > 0).length;
  const movimiento = ultima._max.cotejadoAt ?? null;
  const desde = masAntigua._min.createdAt ?? null;

  return [
    construirMetrica({
      clave: 'cuotas_cotejadas', bloque: 'cuotas', ambito: 'producto',
      titulo: 'Cuotas compensatorias cotejadas contra el DOF',
      universo: total, conDato: cotejadas, impacto,
      consulta: 'antidumpingDuty.count({ active: true }) vs count({ active: true, cotejadoAt: { not: null } }). cotejadoAt solo lo escribe el importador cuando la fila trae `cotejadoPor` + `fuenteUrl`: una URL sola no cuenta.',
      queFalta: `Cargar el listado UPCI vigente con la plantilla "cuotas-upci" incluyendo cotejadoPor y fuenteUrl por fila. Hoy la tabla se sembró con resoluciones representativas (prisma/seed/antidumping-upci.ts lo dice en su encabezado): mientras no se cotejen, ${total - cotejadas} filas son estructura, no derecho vigente.`,
      fuenteOficial: FUENTES.upci, cargador: 'cuotas-upci',
      ultimoMovimiento: movimiento, desde,
    }, ahora),
    construirMetrica({
      clave: 'cuotas_exportador', bloque: 'cuotas', ambito: 'producto',
      titulo: 'Cuotas con tasas por exportador',
      universo: total, conDato: conExportador, impacto,
      consulta: 'antidumpingDuty.count({ active: true, NOT: { exportadorTasas: { equals: null } } }). exportadorTasas = [{ empresa, tasa, rateUnit }].',
      queFalta: 'Las resoluciones UPCI fijan tasa por productor/exportador identificado y una residual. Sin esa lista el Cotizador y la Pre-Glosa aplican siempre la general y sobrestiman el costo del importador que compra a un exportador con tasa menor. Se carga en la columna `exportadorTasas` de la plantilla (formato "Empresa=tasa; Empresa=tasa").',
      fuenteOficial: FUENTES.upci, cargador: 'cuotas-upci',
      ultimoMovimiento: movimiento, desde,
    }, ahora),
    construirMetrica({
      clave: 'cuotas_antielusion', bloque: 'cuotas', ambito: 'producto',
      titulo: 'Resoluciones de elusión identificadas',
      universo: total, conDato: antielusion, impacto,
      consulta: 'antidumpingDuty.count({ active: true, esAntielusion: true }). El importador marca la bandera cuando investigationType = elusion o la columna esAntielusion viene en 1/sí.',
      queFalta: 'Las resoluciones antielusión extienden una cuota a un tercer país o a una fracción vecina; son las que atrapan al importador que "cambió de origen". Sin ellas la alerta de elusión no tiene contra qué contrastar. Vienen en la misma plantilla de cuotas.',
      fuenteOficial: FUENTES.upci, cargador: 'cuotas-upci',
      ultimoMovimiento: movimiento, desde,
      nota: antielusion === 0 ? 'Ninguna resolución del catálogo está marcada como antielusión: el motor de elusión corre sobre un universo vacío.' : undefined,
    }, ahora),
  ];
}

// ── Bloque 2: precedentes y corpus legal ─────────────────────────────────────

async function metricasPrecedentesYCorpus(ahora: Date): Promise<Metrica[]> {
  const [precTotal, precConFuente, precUltimo, precAntiguo] = await Promise.all([
    prisma.legalPrecedent.count(),
    prisma.legalPrecedent.count({ where: { source: { startsWith: 'http' } } }),
    prisma.legalPrecedent.aggregate({ where: { source: { startsWith: 'http' } }, _max: { updatedAt: true } }),
    prisma.legalPrecedent.aggregate({ where: { OR: [{ source: null }, { NOT: { source: { startsWith: 'http' } } }] }, _min: { createdAt: true } }),
  ]);

  const [docTotal, docIntegro, docCotejo, docUltimo, docAntiguo] = await Promise.all([
    prisma.legalDocument.count({ where: { isActive: true } }),
    prisma.legalDocument.count({ where: { isActive: true, claseTexto: 'texto_integro' } }),
    prisma.legalDocument.count({ where: { isActive: true, fechaCotejo: { not: null } } }),
    prisma.legalDocument.aggregate({ where: { isActive: true, fechaCotejo: { not: null } }, _max: { fechaCotejo: true } }),
    prisma.legalDocument.aggregate({ where: { isActive: true, fechaCotejo: null }, _min: { createdAt: true } }),
  ]);

  // Lotes verbatim ya versionados en el repo pero no necesariamente en la base.
  const lotes = lotesCorpusDelRepo();
  const refsRepo = [...new Set(lotes.flatMap(l => l.referencias))];
  let refsEnBase = 0;
  if (refsRepo.length > 0) {
    // Consulta por bloques para no armar un IN gigante.
    for (let i = 0; i < refsRepo.length; i += 500) {
      refsEnBase += await prisma.legalDocument.count({
        where: { claseTexto: 'texto_integro', reference: { in: refsRepo.slice(i, i + 500) } },
      });
    }
  }

  return [
    construirMetrica({
      clave: 'precedentes_con_fuente', bloque: 'precedentes', ambito: 'producto',
      titulo: 'Precedentes con fuente oficial verificable',
      universo: precTotal, conDato: precConFuente,
      consulta: 'legalPrecedent.count() vs count({ source: { startsWith: "http" } }). `source` debe apuntar al documento del TFJA/SAT/DOF.',
      queFalta: 'Cargar 50 precedentes reales (tesis TFJA, criterios normativos SAT) con `officialUrl` y `fechaCotejo` usando la plantilla "precedentes". Ojo: incluso con fuente, el interruptor PRECEDENT_CORPUS_VERIFIED sigue en false y el Clasificador/Copilot NO citan ningún precedente; hay que subirlo a true con el cotejo cerrado.',
      fuenteOficial: FUENTES.tfja, cargador: 'precedentes',
      ultimoMovimiento: precConFuente > 0 ? precUltimo._max.updatedAt : null,
      desde: precAntiguo._min.createdAt ?? null,
      nota: PRECEDENT_CORPUS_VERIFIED
        ? undefined
        : 'PRECEDENT_CORPUS_VERIFIED = false: aunque haya filas cargadas, el producto sirve 0 precedentes. El interruptor vive en services/precedent-lookup.ts.',
    }, ahora),
    construirMetrica({
      clave: 'corpus_texto_integro', bloque: 'corpus', ambito: 'producto',
      titulo: 'Corpus legal con texto íntegro (no resumen)',
      universo: docTotal, conDato: docIntegro,
      consulta: 'legalDocument.count({ isActive: true }) vs count({ isActive: true, claseTexto: "texto_integro" }). Solo el texto_integro es citable como texto legal; el resumen es síntesis operativa.',
      queFalta: 'Sembrar los lotes verbatim con `npx tsx src/scripts/seed-corpus-integro.ts <lote.json>` (valida referencias, URLs vivas y verbatim antes de escribir) o cargar documentos nuevos con la plantilla "legal-docs".',
      fuenteOficial: FUENTES.dofCorpus, cargador: 'legal-docs',
      ultimoMovimiento: docUltimo._max.fechaCotejo ?? null, desde: docAntiguo._min.createdAt ?? null,
    }, ahora),
    construirMetrica({
      clave: 'corpus_fecha_cotejo', bloque: 'corpus', ambito: 'producto',
      titulo: 'Documentos del corpus con fecha de cotejo',
      universo: docTotal, conDato: docCotejo,
      consulta: 'legalDocument.count({ isActive: true, fechaCotejo: { not: null } }). Sin fechaCotejo no se puede decir contra qué versión de la fuente se comparó el texto.',
      queFalta: 'Cada documento necesita la fecha en que un humano lo comparó contra el PDF oficial. Los resúmenes históricos no la traen: o se re-cotejan o se sustituyen por su texto íntegro.',
      fuenteOficial: FUENTES.dofCorpus, cargador: 'legal-docs',
      ultimoMovimiento: docUltimo._max.fechaCotejo ?? null, desde: docAntiguo._min.createdAt ?? null,
    }, ahora),
    construirMetrica({
      clave: 'corpus_lotes_repo', bloque: 'corpus', ambito: 'producto',
      titulo: 'Artículos verbatim del repo cargados en la base',
      universo: refsRepo.length, conDato: refsEnBase,
      consulta: `Se leen ${lotes.length} lote(s) de prisma/seed/corpus-integro/*.json (${refsRepo.length} referencias únicas, cada una con officialUrl y fechaCotejo) y se cuenta cuántas existen ya como legalDocument con claseTexto = "texto_integro".`,
      queFalta: refsRepo.length === 0
        ? 'No se encontraron lotes JSON en prisma/seed/corpus-integro (¿la imagen no los copia?).'
        : `Este material YA está cotejado y versionado en el repo: no hace falta conseguir nada afuera, solo correr el sembrador por lote (consume embeddings Voyage 1024, aborta sin escribir si el guard falla). Faltan ${refsRepo.length - refsEnBase} artículos: ${lotes.map(l => `${l.archivo} (${l.documentos})`).join(', ')}.`,
      fuenteOficial: 'Ya en el repo — prisma/seed/corpus-integro/*.json (verbatim, con fechaCotejo y URL oficial).',
      cargador: null,
      ultimoMovimiento: docUltimo._max.fechaCotejo ?? null,
      desde: docAntiguo._min.createdAt ?? null,
    }, ahora),
  ];
}

// ── Bloque 3: reglas de origen ───────────────────────────────────────────────

async function metricasOrigen(ahora: Date): Promise<Metrica[]> {
  const reglas = await prisma.originRule.findMany({
    where: { active: true },
    select: { fractionCode: true, agreement: true, notes: true, createdAt: true, updatedAt: true },
  });
  const cotejadas = reglas.filter(r => MARCADOR_COTEJADO_POR.test(r.notes ?? ''));
  const capitulosConRegla = new Set(reglas.filter(r => r.agreement === 'TMEC').map(r => r.fractionCode.slice(0, 2)));
  const ultimo = cotejadas.length > 0
    ? cotejadas.reduce<Date | null>((m, r) => (!m || r.updatedAt > m ? r.updatedAt : m), null)
    : null;
  const desde = reglas.length > 0
    ? reglas.reduce<Date | null>((m, r) => (!m || r.createdAt < m ? r.createdAt : m), null)
    : null;

  return [
    construirMetrica({
      clave: 'origen_reglas_cotejadas', bloque: 'origen', ambito: 'producto',
      titulo: 'Reglas de origen con cotejo atestiguado',
      universo: reglas.length, conDato: cotejadas.length,
      consulta: 'originRule.findMany({ active: true }) y se cuenta cuántas traen el marcador estructurado `cotejadoPor:` en `notes` (OriginRule aún no tiene columna de cotejo — ver SCHEMA REQUERIDO). Una "Fuente: http…" suelta NO cuenta.',
      queFalta: 'Cargar el Anexo 4-B del T-MEC con la plantilla "reglas-origen" incluyendo cotejadoPor y fuente. Sin cotejo, el dictamen de origen se apoya en reglas que nadie contrastó contra el decreto.',
      fuenteOficial: FUENTES.origen, cargador: 'reglas-origen',
      ultimoMovimiento: ultimo, desde,
    }, ahora),
    construirMetrica({
      clave: 'origen_cobertura_capitulos', bloque: 'origen', ambito: 'producto',
      titulo: 'Capítulos de la TIGIE con regla de origen T-MEC cargada',
      universo: 97, conDato: capitulosConRegla.size,
      consulta: 'Capítulos 01-97 vs los distintos `fractionCode.slice(0,2)` de originRule con agreement = "TMEC" y active = true.',
      queFalta: 'El Anexo 4-B cubre los 97 capítulos; hoy solo hay reglas en unos pocos. Para el resto el analizador responde "sin regla cargada" y no puede determinar origen.',
      fuenteOficial: FUENTES.origen, cargador: 'reglas-origen',
      ultimoMovimiento: ultimo, desde,
    }, ahora),
  ];
}

// ── Bloque 4: fracciones más usadas (impacto directo en el trabajo diario) ───

function metricasFracciones(ahora: Date, top: FraccionUso[]): Metrica[] {
  const n = top.length;
  // La referencia temporal de estos bloques es la última vez que se clasificó
  // con esas fracciones: si el equipo las sigue usando y el dato sigue sin
  // cargarse, la deuda está viva.
  const ultimaClasificacion = top.reduce<Date | null>((m, f) => {
    const d = f.ultimaVez ? new Date(f.ultimaVez) : null;
    return d && (!m || d > m) ? d : m;
  }, null);
  const primeraClasificacion = top.reduce<Date | null>((m, f) => {
    const d = f.ultimaVez ? new Date(f.ultimaVez) : null;
    return d && (!m || d < m) ? d : m;
  }, null);

  const base = { bloque: 'fracciones' as const, ambito: 'tenant' as const, universo: n, desde: primeraClasificacion, ultimoMovimiento: null as Date | null };

  return [
    construirMetrica({
      ...base, clave: 'top_nico', titulo: 'Fracciones más usadas con NICO cargado',
      conDato: top.filter(f => f.nico).length, impacto: top.filter(f => !f.nico).length,
      consulta: 'De las N fracciones más usadas del historial del tenant, cuántas tienen `Fraction.nicos` (o `nico`) poblado desde la Base Única del SNICE.',
      queFalta: 'Sin NICO la partida del pedimento se declara a 8 dígitos y la validación de 10 no puede correr. Se completa con scripts/enrich-nicos.ts contra el extracto de la Base Única.',
      fuenteOficial: FUENTES.snice, cargador: null,
    }, ahora),
    construirMetrica({
      ...base, clave: 'top_prosec', titulo: 'Fracciones más usadas con respuesta PROSEC cargada',
      conDato: top.filter(f => f.prosec).length, impacto: top.filter(f => !f.prosec).length,
      consulta: 'De las N fracciones más usadas, cuántas empatan con alguna fila activa de prosec_eligibility (exact sobre la fracción o prefix sobre capítulo/partida/subpartida).',
      queFalta: 'La tabla solo guarda POSITIVOS: hoy el producto no puede distinguir "esta fracción no tiene PROSEC" de "no lo hemos cargado", y en la ficha ambos casos se ven igual. Cargar el Decreto PROSEC por sector con la plantilla "prosec" cierra la duda para las fracciones que sí aplican.',
      fuenteOficial: FUENTES.prosec, cargador: 'prosec',
    }, ahora),
    construirMetrica({
      ...base, clave: 'top_prosec_cotejada', titulo: 'PROSEC de las fracciones más usadas con fecha de cotejo',
      conDato: top.filter(f => f.prosecCotejada).length, impacto: top.filter(f => f.prosec && !f.prosecCotejada).length,
      consulta: 'De las N fracciones más usadas, cuántas tienen al menos una fila PROSEC con `fechaCotejo` no nula (la columna existe en el modelo desde la Frontera Canónica).',
      queFalta: 'Las filas sin fechaCotejo salen en la ficha como "sin cotejo contra DOF". Se cierran re-importando con cotejadoPor + fuenteUrl.',
      fuenteOficial: FUENTES.prosec, cargador: 'prosec',
    }, ahora),
    construirMetrica({
      ...base, clave: 'top_precio_estimado', titulo: 'Fracciones más usadas con precio estimado de fuente oficial',
      conDato: top.filter(f => f.precioEstimadoOficial).length,
      impacto: top.filter(f => !f.precioEstimadoOficial).length,
      consulta: 'De las N fracciones más usadas, cuántas tienen alguna fila activa en estimated_prices con `source` DOF o SAT. Las filas `source = "internal"` NO cuentan: son estimaciones de mercado, no el precio estimado del Art. 84-A.',
      queFalta: 'Cargar las resoluciones vigentes del Anexo 2 de las RGCE con la plantilla "precios-estimados". El importador rechaza `source = internal`: solo entra lo publicado en DOF/SAT.',
      fuenteOficial: FUENTES.precios84a, cargador: 'precios-estimados',
    }, ahora),
    construirMetrica({
      ...base, clave: 'top_anexo21', titulo: 'Fracciones más usadas con Anexo 21 cargado',
      conDato: top.filter(f => f.anexo21).length, impacto: top.filter(f => !f.anexo21).length,
      consulta: `De las N fracciones más usadas, cuántas tienen alguna fila activa de fraction_regulations con type = "${TIPO_REG_ANEXO21}" (aduanas autorizadas). Es el hogar provisional del Anexo 21 mientras no exista tabla propia.`,
      queFalta: 'El Anexo 21 restringe el despacho de ciertas mercancías a aduanas concretas: declarar la aduana equivocada es causal de rechazo. Se carga con la plantilla "anexo21" (valida la clave contra el Apéndice 1 del Anexo 22). SCHEMA REQUERIDO: tabla propia `AduanaAnexo21`.',
      fuenteOficial: FUENTES.anexo21, cargador: 'anexo21',
    }, ahora),
    construirMetrica({
      ...base, clave: 'top_correlativa', titulo: 'Fracciones más usadas con correlativa LIGIE cargada',
      conDato: top.filter(f => f.correlativa).length, impacto: top.filter(f => !f.correlativa).length,
      consulta: `De las N fracciones más usadas, cuántas aparecen (como origen o como destino) en alguna fila de fraction_regulations con type = "${TIPO_REG_CORRELATIVA}". Es el hogar provisional de la tabla de correlación.`,
      queFalta: 'Sin correlativa no se puede seguir una fracción entre versiones de la LIGIE, que es exactamente lo que pide una auditoría de operaciones viejas. Se carga con la plantilla "correlativas". SCHEMA REQUERIDO: tabla propia `CorrelativaLIGIE`.',
      fuenteOficial: FUENTES.correlativas, cargador: 'correlativas',
    }, ahora),
    construirMetrica({
      ...base, clave: 'top_cuota_cotejada', titulo: 'Fracciones más usadas cuya cuota está cotejada',
      universo: top.filter(f => f.cuotas > 0).length,
      conDato: top.filter(f => f.cuotas > 0 && f.cuotasCotejadas > 0).length,
      impacto: top.filter(f => f.cuotas > 0 && f.cuotasCotejadas === 0).length,
      consulta: 'De las fracciones más usadas que tienen al menos una cuota compensatoria activa, cuántas tienen al menos una con cotejadoAt.',
      queFalta: 'Estas son las cuotas que el equipo va a tocar esta semana: son las primeras que hay que cotejar del listado UPCI.',
      fuenteOficial: FUENTES.upci, cargador: 'cuotas-upci',
    }, ahora),
  ];
}

// ── Bloque 4b: catálogo de fracciones a nivel producto ───────────────────────
//
// Estas dos miden el catálogo completo, no solo el top del tenant: son las que
// destapan el material que HOY está en la base con etiqueta de oficial sin
// serlo (precios "internal") o sin cotejo (PROSEC sin fechaCotejo).

async function metricasCatalogoDeFracciones(ahora: Date, top: FraccionUso[]): Promise<Metrica[]> {
  const [preciosTotal, preciosOficiales, precioUltimo, precioAntiguo, prosecTotal, prosecCotejadas, prosecUltimo, prosecAntiguo] = await Promise.all([
    prisma.estimatedPrice.count({ where: { active: true } }),
    prisma.estimatedPrice.count({ where: { active: true, source: { in: ['DOF', 'SAT'] } } }),
    prisma.estimatedPrice.aggregate({ where: { active: true, source: { in: ['DOF', 'SAT'] } }, _max: { publishDate: true } }),
    prisma.estimatedPrice.aggregate({ where: { active: true, NOT: { source: { in: ['DOF', 'SAT'] } } }, _min: { createdAt: true } }),
    prisma.pROSECEligibility.count({ where: { active: true } }),
    prisma.pROSECEligibility.count({ where: { active: true, fechaCotejo: { not: null } } }),
    prisma.pROSECEligibility.aggregate({ where: { active: true, fechaCotejo: { not: null } }, _max: { fechaCotejo: true } }),
    prisma.pROSECEligibility.aggregate({ where: { active: true, fechaCotejo: null }, _min: { createdAt: true } }),
  ]);

  return [
    construirMetrica({
      clave: 'precios_estimados_oficiales', bloque: 'fracciones', ambito: 'producto',
      titulo: 'Precios estimados con publicación oficial (no estimación interna)',
      universo: preciosTotal, conDato: preciosOficiales,
      impacto: top.filter(f => f.precioEstimado && !f.precioEstimadoOficial).length,
      consulta: 'estimatedPrice.count({ active: true }) vs count({ active: true, source in [DOF, SAT] }). El seed histórico (prisma/seed/estimated-prices.ts) marca la mayoría como source = "internal": son precios de mercado documentados, NO el precio estimado del Art. 84-A.',
      queFalta: `${preciosTotal - preciosOficiales} fila(s) son estimación interna con apariencia de dato oficial. O se sustituyen por la resolución del Anexo 2 de las RGCE (plantilla "precios-estimados", que rechaza source = internal) o se retiran del bloque de precios estimados de la ficha.`,
      fuenteOficial: FUENTES.precios84a, cargador: 'precios-estimados',
      ultimoMovimiento: precioUltimo._max.publishDate ?? null,
      desde: precioAntiguo._min.createdAt ?? null,
    }, ahora),
    construirMetrica({
      clave: 'prosec_cotejadas', bloque: 'fracciones', ambito: 'producto',
      titulo: 'Filas PROSEC cotejadas contra el decreto',
      universo: prosecTotal, conDato: prosecCotejadas,
      impacto: top.filter(f => f.prosec && !f.prosecCotejada).length,
      consulta: 'pROSECEligibility.count({ active: true }) vs count({ active: true, fechaCotejo: { not: null } }). La columna fechaCotejo existe desde la Frontera Canónica: sin ella la fila sale como "sin cotejo" en la ficha.',
      queFalta: 'Re-importar las filas con la plantilla "prosec" (cotejadoPor + fuenteUrl obligatorias) contra el Decreto PROSEC vigente y sus reformas.',
      fuenteOficial: FUENTES.prosec, cargador: 'prosec',
      ultimoMovimiento: prosecUltimo._max.fechaCotejo ?? null,
      desde: prosecAntiguo._min.createdAt ?? null,
    }, ahora),
  ];
}

// ── Bloque 5: operación del despacho ─────────────────────────────────────────

async function metricasOperacion(ahora: Date, tenantId: string, alcance: AlcanceCliente): Promise<Metrica[]> {
  const cli = whereCliente(alcance);
  const [
    partesTotal, partesConDictamen, parteAntigua, ultimaVersion,
    clasifTotal, clasifPendientes, clasifPendienteAntigua,
    cotizTotal, cotizPendientes,
    obligTotal, obligConFundamento, obligAntigua,
    dictamenTotal, dictamenResueltos, dictamenUltimo, dictamenAntiguo,
  ] = await Promise.all([
    prisma.product.count({ where: { tenantId, active: true, ...cli } }),
    prisma.product.count({ where: { tenantId, active: true, versionVigente: { gt: 0 }, ...cli } }),
    prisma.product.aggregate({ where: { tenantId, active: true, versionVigente: 0, ...cli }, _min: { createdAt: true } }),
    prisma.productClassificationVersion.aggregate({ where: { product: { tenantId } }, _max: { createdAt: true } }),
    prisma.classification.count({ where: { tenantId, ...cli } }),
    prisma.classification.count({ where: { tenantId, status: 'pending_approval', ...cli } }),
    prisma.classification.aggregate({ where: { tenantId, status: 'pending_approval', ...cli }, _min: { createdAt: true } }),
    prisma.quote.count({ where: { tenantId, ...cli } }),
    prisma.quote.count({ where: { tenantId, status: 'pending_approval', ...cli } }),
    prisma.obligacionCalendario.count({ where: { tenantId, ...cli } }),
    prisma.obligacionCalendario.count({ where: { tenantId, NOT: { fundamento: null }, ...cli } }),
    prisma.obligacionCalendario.aggregate({ where: { tenantId, fundamento: null, ...cli }, _min: { createdAt: true } }),
    prisma.solicitudDictamen.count({ where: { tenantId } }),
    prisma.solicitudDictamen.count({ where: { tenantId, estado: { in: ['dictaminada', 'rechazada'] } } }),
    prisma.solicitudDictamen.aggregate({ where: { tenantId, resueltaAt: { not: null } }, _max: { resueltaAt: true } }),
    prisma.solicitudDictamen.aggregate({ where: { tenantId, estado: { in: ['abierta', 'en_revision'] } }, _min: { createdAt: true } }),
  ]);

  const aprobTotal = clasifTotal + cotizTotal;
  const aprobPendientes = clasifPendientes + cotizPendientes;

  return [
    construirMetrica({
      clave: 'partes_con_dictamen', bloque: 'operacion', ambito: 'tenant',
      titulo: 'Partes del catálogo con dictamen (versión vigente)',
      universo: partesTotal, conDato: partesConDictamen,
      consulta: 'product.count({ tenantId, active: true, …alcance }) vs count({ …, versionVigente: { gt: 0 } }). versionVigente > 0 = la parte tiene al menos una ProductClassificationVersion firmada.',
      queFalta: 'Una parte sin dictamen se reclasifica cada vez que aparece: el catálogo no ahorra trabajo hasta que alguien firma la versión. Se cierra desde /catalogo (promover a catálogo / dictaminar), no requiere fuente externa.',
      fuenteOficial: FUENTES.interna, cargador: null,
      ultimoMovimiento: ultimaVersion._max.createdAt ?? null,
      desde: parteAntigua._min.createdAt ?? null,
    }, ahora),
    construirMetrica({
      clave: 'aprobaciones_resueltas', bloque: 'operacion', ambito: 'tenant',
      titulo: 'Clasificaciones y cotizaciones con aprobación resuelta',
      universo: aprobTotal, conDato: aprobTotal - aprobPendientes,
      consulta: 'classification.count({ tenantId, …alcance }) + quote.count({ … }) vs las que están en status "pending_approval". El flujo SOD deja la fila pendiente hasta que el validador la resuelve.',
      queFalta: `Hay ${aprobPendientes} propuesta(s) esperando firma en /aprobaciones. Una bandeja que no baja es trabajo que el cliente ya pagó y nadie liberó.`,
      fuenteOficial: FUENTES.interna, cargador: null,
      desde: clasifPendienteAntigua._min.createdAt ?? null,
    }, ahora),
    construirMetrica({
      clave: 'obligaciones_con_fundamento', bloque: 'operacion', ambito: 'tenant',
      titulo: 'Obligaciones del calendario con fundamento legal',
      universo: obligTotal, conDato: obligConFundamento,
      consulta: 'obligacionCalendario.count({ tenantId, …alcance }) vs count({ …, NOT: { fundamento: null } }).',
      queFalta: 'Una obligación sin fundamento es un recordatorio, no una obligación: no se puede defender ante la autoridad ni explicar la consecuencia de incumplirla. Se cita el artículo/regla desde /calendario.',
      fuenteOficial: FUENTES.dofCorpus, cargador: null,
      desde: obligAntigua._min.createdAt ?? null,
    }, ahora),
    construirMetrica({
      clave: 'dictamenes_resueltos', bloque: 'operacion', ambito: 'tenant',
      titulo: 'Solicitudes de dictamen humano resueltas',
      universo: dictamenTotal, conDato: dictamenResueltos,
      consulta: 'solicitudDictamen.count({ tenantId }) vs count({ tenantId, estado in [dictaminada, rechazada] }).',
      queFalta: 'Las solicitudes abiertas son las clasificaciones que el equipo marcó como dudosas. Cada una que envejece es un riesgo asumido sin decidir.',
      fuenteOficial: FUENTES.interna, cargador: null,
      ultimoMovimiento: dictamenUltimo._max.resueltaAt ?? null,
      desde: dictamenAntiguo._min.createdAt ?? null,
    }, ahora),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Alerta de deuda envejecida (item 5): que no envejezca en silencio
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoAlertas {
  creadas: number;
  actualizadas: number;
  resueltas: number;
  metricas: string[];
}

export const TIPO_ALERTA_DEUDA = 'cotejo_deuda';
const fingerprintDeuda = (clave: string) => `cotejo:${clave}`;

/**
 * Sincroniza una alerta IN_APP por cada métrica envejecida (> 90 días sin que
 * la aguja se mueva) y resuelve las de las métricas que volvieron a moverse.
 * Idempotente: `@@unique([tenantId, fingerprint])` evita duplicados.
 */
export async function sincronizarAlertasDeDeuda(
  tenantId: string,
  tablero: TableroCotejo,
  ahora = new Date(),
): Promise<ResultadoAlertas> {
  const r: ResultadoAlertas = { creadas: 0, actualizadas: 0, resueltas: 0, metricas: [] };
  const envejecidas = tablero.metricas.filter(m => m.envejecida);

  for (const m of envejecidas) {
    const fingerprint = fingerprintDeuda(m.clave);
    const severity = m.conDato === 0 ? 'high' : 'medium';
    const contenido = [
      `${m.faltan} de ${m.universo} filas siguen sin cotejo (${m.porcentaje ?? 0} % cerrado).`,
      `Sin movimiento desde hace ${m.diasDeDeuda} días (umbral: ${tablero.umbralDias}).`,
      `Fuente oficial necesaria: ${m.fuenteOficial}`,
      `Qué falta: ${m.queFalta}`,
    ].join('\n');
    const data = {
      channel: 'IN_APP' as const,
      type: TIPO_ALERTA_DEUDA,
      title: `Deuda de cotejo sin movimiento: ${m.titulo}`,
      content: contenido,
      severity,
      actionRequired: m.cargador
        ? `Descargar la plantilla "${m.cargador}" y cargar la fuente oficial.`
        : 'Abrir el tablero de cotejo y decidir quién la cierra.',
      suggestedAction: { type: 'abrir_tablero', label: 'Abrir tablero de cotejo', payload: { ruta: '/admin/cotejo', metrica: m.clave, cargador: m.cargador } },
      resolvedAt: null,
      acknowledged: false,
    };
    const existente = await prisma.alert.findFirst({ where: { tenantId, fingerprint }, select: { id: true } });
    if (existente) {
      await prisma.alert.update({ where: { id: existente.id }, data });
      r.actualizadas++;
    } else {
      await prisma.alert.create({ data: { ...data, tenantId, fingerprint, createdAt: ahora } });
      r.creadas++;
    }
    r.metricas.push(m.clave);
  }

  // Las que dejaron de estar envejecidas se cierran (no se borran: queda rastro).
  const vivas = new Set(envejecidas.map(m => fingerprintDeuda(m.clave)));
  const abiertas = await prisma.alert.findMany({
    where: { tenantId, type: TIPO_ALERTA_DEUDA, resolvedAt: null },
    select: { id: true, fingerprint: true },
  });
  for (const a of abiertas) {
    if (a.fingerprint && vivas.has(a.fingerprint)) continue;
    await prisma.alert.update({ where: { id: a.id }, data: { resolvedAt: ahora } });
    r.resueltas++;
  }
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Excel — una hoja por bloque de trabajo
// ─────────────────────────────────────────────────────────────────────────────

export const HOJAS_TABLERO = ['Resumen', 'Metricas', 'Fracciones mas usadas', 'Cargadores'] as const;

export function tableroAXlsx(t: TableroCotejo): Buffer {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
    generado: t.generadoAt,
    metricas: t.resumen.metricas,
    cerradas: t.resumen.cerradas,
    con_deuda: t.resumen.conDeuda,
    envejecidas: t.resumen.envejecidas,
    filas_pendientes: t.resumen.filasPendientes,
    porcentaje_global: t.resumen.porcentajeGlobal,
    umbral_dias: t.umbralDias,
    fracciones_analizadas: t.topFracciones.length,
  }]), HOJAS_TABLERO[0]);

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    t.metricas.length ? t.metricas.map(m => ({
      bloque: m.bloque, clave: m.clave, metrica: m.titulo, ambito: m.ambito, estado: m.estado,
      universo: m.universo, con_dato: m.conDato, faltan: m.faltan, porcentaje: m.porcentaje,
      impacto_fracciones_top: m.impacto,
      dias_de_deuda: m.diasDeDeuda, envejecida: m.envejecida ? 'sí' : 'no',
      ultimo_movimiento: m.ultimoMovimiento?.slice(0, 10) ?? '',
      desde: m.desde?.slice(0, 10) ?? '',
      que_falta: m.queFalta, fuente_oficial: m.fuenteOficial, cargador: m.cargador ?? '',
      consulta: m.consulta, nota: m.nota ?? '',
    })) : [{ nota: 'sin métricas' }]), HOJAS_TABLERO[1]);

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    t.topFracciones.length ? t.topFracciones.map((f, i) => ({
      orden: i + 1, fraccion: f.codeFormatted, descripcion: f.descripcion ?? '',
      usos: f.usos, ultima_vez: f.ultimaVez?.slice(0, 10) ?? '',
      en_catalogo: f.enCatalogo ? 'sí' : 'no',
      nico: f.nico ? 'sí' : 'no',
      prosec: f.prosec ? (f.prosecCotejada ? 'sí (cotejado)' : 'sí (sin cotejo)') : 'no',
      precio_estimado: f.precioEstimado ? (f.precioEstimadoOficial ? 'sí (DOF/SAT)' : 'sí (interno)') : 'no',
      anexo_21: f.anexo21 ? 'sí' : 'no',
      correlativa: f.correlativa ? 'sí' : 'no',
      cuotas: f.cuotas, cuotas_cotejadas: f.cuotasCotejadas,
      falta: f.faltantes.join('; '),
    })) : [{ nota: 'el historial del tenant no tiene clasificaciones reales' }]), HOJAS_TABLERO[2]);

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    TIPOS_CARGA.map(k => {
      const c = CARGADORES[k];
      return {
        cargador: c.tipo, titulo: c.titulo, destino: c.destino, fuente_oficial: c.fuenteOficial,
        clave_dedupe: c.clave, columnas: c.columnas.join(', '), metricas: c.metricas.join(', '),
        schema_requerido: c.schemaRequerido ? 'sí' : 'no',
      };
    })), HOJAS_TABLERO[3]);

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
