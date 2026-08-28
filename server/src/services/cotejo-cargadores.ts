/**
 * CARGADORES DE COTEJO (Operación 2026-08, prioridad 2).
 *
 * Siete plantillas .xlsx y una validación por fila para el material que hoy
 * está "pendiente de fuente oficial". El objetivo NO es tener el dato: es que
 * el día que llegue el PDF del DOF nadie tenga que escribir un script.
 *
 * REGLA DURA DE ESTE MÓDULO — atestación obligatoria:
 *   una fila entra SOLO si trae `cotejadoPor` (quién revisó) y `fuenteUrl`
 *   (contra qué revisó). Sin las dos, la fila se RECHAZA con su motivo; no se
 *   guarda "pendiente de cotejo". La deuda se cierra o no se toca: cargar
 *   filas sin cotejo por estos endpoints solo cambiaría el color del hueco.
 *   (Los importadores generales de cuotas y reglas siguen aceptando filas
 *   pendientes por sus rutas históricas; aquí van por la puerta estricta.)
 *
 * Reutiliza lo que ya existe:
 *   - cuotas UPCI  → services/antidumping-importar (validarFilaUPCI/importarUPCI)
 *   - reglas T-MEC → services/origin-reglas (validarFilaRegla/importarReglasOrigen)
 *   - precedentes  → services/corpus-importador (validarFilaPrecedente/importarPrecedentes)
 * y añade los que faltaban: PROSEC, precios estimados (84-A), Anexo 21 y
 * correlativas LIGIE.
 *
 * SCHEMA REQUERIDO (ver reporte): Anexo 21 y correlativas LIGIE no tienen
 * tabla propia. Mientras tanto viven en `FractionRegulation` con un `type` y
 * un `matchType` propios (`anexo21_exact`/`anexo21_prefix`/`correlativa`) que
 * NINGÚN consumidor existente consulta — compliance-lookup, glosa-simulator,
 * analytics y la ficha filtran por matchType 'exact'/'prefix'. Así el dato se
 * carga y se mide sin alterar la salida de otros módulos.
 */

import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { ADUANAS } from '../lib/anexo22';
import { normalizeCountry } from './compliance-lookup';
import { validarFilaUPCI, plantillaUPCIXlsx, COLUMNAS_UPCI, importarUPCI } from './antidumping-importar';
import { validarFilaRegla, plantillaReglasXlsx, COLUMNAS_REGLAS, importarReglasOrigen } from './origin-reglas';
import { validarFilaPrecedente, plantillaXlsx, COLUMNAS_PRECEDENTE, importarPrecedentes, parsearArchivoImportacion, type FilaCruda } from './corpus-importador';

// ─────────────────────────────────────────────────────────────────────────────
// Hogar provisional de Anexo 21 y correlativas (ver cabecera)
// ─────────────────────────────────────────────────────────────────────────────

export const TIPO_REG_ANEXO21 = 'aduana_anexo21';
export const TIPO_REG_CORRELATIVA = 'correlativa_ligie';
export const MATCH_ANEXO21 = { exact: 'anexo21_exact', prefix: 'anexo21_prefix' } as const;
export const MATCH_CORRELATIVA = 'correlativa';
/** Versiones de la LIGIE que acepta el cargador de correlativas. */
export const VERSIONES_LIGIE = ['2020', '2022', '2025', '2026'] as const;
export const TIPOS_CORRELATIVA = ['uno_a_uno', 'desdoblada', 'fusionada', 'creada', 'suprimida'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos comunes
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_CARGA = [
  'cuotas-upci', 'precedentes', 'prosec', 'precios-estimados', 'anexo21', 'correlativas', 'reglas-origen',
] as const;
export type TipoCarga = (typeof TIPOS_CARGA)[number];

export function esTipoCarga(s: string): s is TipoCarga {
  return (TIPOS_CARGA as readonly string[]).includes(s);
}

export interface DefCargador {
  tipo: TipoCarga;
  titulo: string;
  /** Tabla destino (o su hogar provisional). */
  destino: string;
  fuenteOficial: string;
  columnas: readonly string[];
  /** Clave de deduplicación por fila. */
  clave: string;
  /** Métricas del tablero que esta carga mueve. */
  metricas: string[];
  /** true = el destino aún no tiene tabla propia. */
  schemaRequerido: string | null;
}

export const CARGADORES: Record<TipoCarga, DefCargador> = {
  'cuotas-upci': {
    tipo: 'cuotas-upci',
    titulo: 'Cuotas compensatorias (listado UPCI)',
    destino: 'antidumping_duties',
    fuenteOficial: 'DOF — resoluciones UPCI/SE con tasas por exportador y vigencias.',
    columnas: COLUMNAS_UPCI,
    clave: 'fractionCode + countryOfOrigin + resolutionNumber',
    metricas: ['cuotas_cotejadas', 'cuotas_exportador', 'cuotas_antielusion', 'top_cuota_cotejada'],
    schemaRequerido: null,
  },
  precedentes: {
    tipo: 'precedentes',
    titulo: 'Precedentes (TFJA / SCJN / criterios SAT)',
    destino: 'legal_precedents',
    fuenteOficial: 'TFJA (tesis y precedentes) y criterios normativos SAT publicados en DOF.',
    columnas: COLUMNAS_PRECEDENTE,
    clave: 'type + reference',
    metricas: ['precedentes_con_fuente'],
    schemaRequerido: 'LegalPrecedent no tiene columnas de cotejo; la fecha se guarda como sufijo "[cotejo AAAA-MM-DD]" en applicability.\n\nmodel LegalPrecedent {\n  // …\n  fechaCotejo DateTime?\n  cotejadoPor String?\n}',
  },
  prosec: {
    tipo: 'prosec',
    titulo: 'PROSEC por fracción y sector',
    destino: 'prosec_eligibility',
    fuenteOficial: 'DOF — Decreto PROSEC y sus reformas (tasa preferencial por sector).',
    columnas: ['fractionCode', 'matchType', 'sector', 'prosecRate', 'effectiveDate', 'expiryDate', 'decree', 'conditions', 'notes', 'fuenteUrl', 'cotejadoPor', 'fechaCotejo'],
    clave: 'fractionCode + matchType + sector',
    metricas: ['top_prosec', 'top_prosec_cotejada'],
    schemaRequerido: null,
  },
  'precios-estimados': {
    tipo: 'precios-estimados',
    titulo: 'Precios estimados (Art. 84-A LA, Anexo 2 RGCE)',
    destino: 'estimated_prices',
    fuenteOficial: 'DOF — Resoluciones que modifican el Anexo 2 de las RGCE.',
    columnas: ['fractionCode', 'countryOfOrigin', 'estimatedValue', 'unit', 'source', 'decree', 'publishDate', 'effectiveDate', 'expiryDate', 'notes', 'fuenteUrl', 'cotejadoPor', 'fechaCotejo'],
    clave: 'fractionCode + countryOfOrigin + decree',
    metricas: ['top_precio_estimado'],
    schemaRequerido: null,
  },
  anexo21: {
    tipo: 'anexo21',
    titulo: 'Aduanas autorizadas (Anexo 21 RGCE)',
    destino: `fraction_regulations (type='${TIPO_REG_ANEXO21}') — hogar provisional`,
    fuenteOficial: 'DOF — Anexo 21 de las RGCE (aduanas autorizadas para el despacho de determinadas mercancías).',
    columnas: ['fractionCode', 'matchType', 'aduanaClave', 'mercancia', 'required', 'notas', 'fuenteUrl', 'cotejadoPor', 'fechaCotejo'],
    clave: 'fractionCode + matchType + aduanaClave',
    metricas: ['top_anexo21'],
    schemaRequerido: 'model AduanaAnexo21 {\n  id           String   @id @default(cuid())\n  fractionCode String   // 8 dígitos o prefijo\n  matchType    String   @default("exact") // "exact" | "prefix"\n  aduanaClave  String   // Apéndice 1 Anexo 22\n  mercancia    String\n  obligatoria  Boolean  @default(true)\n  fuenteUrl    String?\n  cotejadoPor  String?\n  fechaCotejo  DateTime?\n  active       Boolean  @default(true)\n  createdAt    DateTime @default(now())\n  updatedAt    DateTime @updatedAt\n\n  @@unique([fractionCode, matchType, aduanaClave])\n  @@index([fractionCode, active])\n  @@map("aduanas_anexo21")\n}',
  },
  correlativas: {
    tipo: 'correlativas',
    titulo: 'Correlativas LIGIE 2020↔2022↔2025',
    destino: `fraction_regulations (type='${TIPO_REG_CORRELATIVA}') — hogar provisional`,
    fuenteOficial: 'SNICE / SE — tablas de correlación entre versiones de la LIGIE.',
    columnas: ['origenCode', 'origenVersion', 'destinoCode', 'destinoVersion', 'tipo', 'nota', 'fuenteUrl', 'cotejadoPor', 'fechaCotejo'],
    clave: 'origenCode + origenVersion + destinoVersion + destinoCode',
    metricas: ['top_correlativa'],
    schemaRequerido: 'model CorrelativaLIGIE {\n  id             String   @id @default(cuid())\n  origenCode     String?  // 8 dígitos (null cuando tipo = "creada")\n  origenVersion  String   // "2020" | "2022" | "2025" | "2026"\n  destinoCode    String?  // 8 dígitos (null cuando tipo = "suprimida")\n  destinoVersion String\n  tipo           String   // uno_a_uno | desdoblada | fusionada | creada | suprimida\n  nota           String?\n  fuenteUrl      String?\n  cotejadoPor    String?\n  fechaCotejo    DateTime?\n  createdAt      DateTime @default(now())\n\n  @@unique([origenCode, origenVersion, destinoCode, destinoVersion])\n  @@index([origenCode])\n  @@index([destinoCode])\n  @@map("correlativas_ligie")\n}',
  },
  'reglas-origen': {
    tipo: 'reglas-origen',
    titulo: 'Reglas específicas de origen (Anexo 4-B T-MEC)',
    destino: 'origin_rules',
    fuenteOficial: 'DOF (Decreto de promulgación T-MEC, Anexo 4-B) / USITC General Note 11.',
    columnas: COLUMNAS_REGLAS,
    clave: 'fractionCode + matchType + agreement',
    metricas: ['origen_reglas_cotejadas', 'origen_cobertura_capitulos'],
    schemaRequerido: 'OriginRule no tiene columnas de cotejo; el marcador vive en `notes`.\n\nmodel OriginRule {\n  // …\n  fuenteUrl   String?\n  cotejadoPor String?\n  fechaCotejo DateTime?\n}',
  },
};

export interface FilaCargaValidada {
  fila: number;
  ok: boolean;
  errores: string[];
  /** Clave de dedupe (null si la fila no llegó a formarse). */
  clave: string | null;
  atestacion: { cotejadoPor: string; fuenteUrl: string; fechaCotejo: Date } | null;
}

export interface ReporteCarga {
  tipo: TipoCarga;
  total: number;
  aceptadas: number;
  rechazadas: number;
  creadas: number;
  actualizadas: number;
  duplicadasEnArchivo: number;
  dryRun: boolean;
  /** Aviso cuando el destino es provisional. */
  schemaRequerido: string | null;
  filas: { fila: number; clave: string | null; ok: boolean; errores: string[]; accion: 'creada' | 'actualizada' | 'rechazada' | 'validada' }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de parseo
// ─────────────────────────────────────────────────────────────────────────────

const txt = (v: unknown): string => (v == null ? '' : String(v)).trim();
const limpiarFraccion = (v: unknown): string => txt(v).replace(/[^0-9]/g, '');

function numero(v: unknown): number | null {
  const s = txt(v).replace('%', '').replace(/,/g, '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** AAAA-MM-DD o DD/MM/AAAA o Date de Excel. `undefined` = formato inválido. */
export function fechaDe(v: unknown): Date | null | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  const s = txt(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) ?? s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  const iso = m[0].includes('/') ? `${m[3]}-${m[2]}-${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const booleano = (v: unknown): boolean => /^(1|true|s[ií]|x|yes)$/i.test(txt(v));

/**
 * Atestación de cotejo — la puerta estricta de este módulo.
 * Devuelve null y acumula errores cuando falta cualquiera de las dos piezas.
 */
export function validarAtestacion(f: Record<string, unknown>, errores: string[], ahora = new Date()):
  { cotejadoPor: string; fuenteUrl: string; fechaCotejo: Date } | null {
  const cotejadoPor = txt(f.cotejadoPor);
  const fuenteUrl = txt(f.fuenteUrl) || txt(f.officialUrl) || txt(f.fuente);
  const fechaRaw = fechaDe(f.fechaCotejo);
  if (!cotejadoPor) errores.push('cotejadoPor es obligatorio: quién cotejó la fila contra la fuente oficial');
  else if (cotejadoPor.length < 3) errores.push('cotejadoPor demasiado corto: escribe el nombre o usuario de quien cotejó');
  if (!fuenteUrl) errores.push('fuenteUrl es obligatoria: la URL oficial (DOF/SAT/SE/TFJA) contra la que se cotejó');
  else if (!/^https?:\/\/\S+$/i.test(fuenteUrl)) errores.push('fuenteUrl debe ser una URL http(s)');
  if (fechaRaw === undefined) errores.push('fechaCotejo inválida (AAAA-MM-DD)');
  const fechaCotejo = fechaRaw ?? ahora;
  if (fechaRaw && fechaRaw.getTime() > ahora.getTime() + 86_400_000) errores.push('fechaCotejo no puede estar en el futuro');
  if (errores.length > 0) return null;
  return { cotejadoPor, fuenteUrl, fechaCotejo };
}

/** Nota trazable que se guarda en columnas de texto libre (mismo marcador que origin-reglas). */
export function notaDeCotejo(a: { cotejadoPor: string; fuenteUrl: string; fechaCotejo: Date }, base?: string | null): string {
  return [base || null, `Fuente: ${a.fuenteUrl}`, `cotejadoPor: ${a.cotejadoPor} (${a.fechaCotejo.toISOString().slice(0, 10)})`]
    .filter(Boolean).join(' | ');
}

/** Encabezados en español → nombre canónico de columna. */
const ALIAS: Record<string, string> = {
  fraccion: 'fractionCode', 'fraccion arancelaria': 'fractionCode', fractioncode: 'fractionCode',
  tipo: 'matchType', matchtype: 'matchType', sector: 'sector', tasa: 'prosecRate', prosecrate: 'prosecRate',
  'vigente desde': 'effectiveDate', effectivedate: 'effectiveDate', 'vigente hasta': 'expiryDate', expirydate: 'expiryDate',
  decreto: 'decree', decree: 'decree', condiciones: 'conditions', notas: 'notas', notes: 'notes',
  pais: 'countryOfOrigin', 'pais de origen': 'countryOfOrigin', countryoforigin: 'countryOfOrigin',
  'precio estimado': 'estimatedValue', estimatedvalue: 'estimatedValue', valor: 'estimatedValue',
  unidad: 'unit', unit: 'unit', 'fecha dof': 'publishDate', publishdate: 'publishDate', fuente: 'fuenteUrl',
  'url dof': 'fuenteUrl', fuenteurl: 'fuenteUrl', url: 'fuenteUrl', officialurl: 'officialUrl',
  'cotejado por': 'cotejadoPor', cotejadopor: 'cotejadoPor', 'fecha cotejo': 'fechaCotejo', 'fecha de cotejo': 'fechaCotejo', fechacotejo: 'fechaCotejo',
  aduana: 'aduanaClave', 'clave aduana': 'aduanaClave', 'clave de aduana': 'aduanaClave', aduanaclave: 'aduanaClave',
  mercancia: 'mercancia', obligatoria: 'required', required: 'required',
  'fraccion origen': 'origenCode', origencode: 'origenCode', 'version origen': 'origenVersion', origenversion: 'origenVersion',
  'fraccion destino': 'destinoCode', destinocode: 'destinoCode', 'version destino': 'destinoVersion', destinoversion: 'destinoVersion',
  'tipo de correlacion': 'tipoCorrelativa', tipocorrelativa: 'tipoCorrelativa', nota: 'nota',
};

const normalizarEncabezado = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Lee xlsx/csv/json en base64 y normaliza encabezados. */
export function leerFilasCarga(archivoBase64: string, nombreArchivo = 'carga.xlsx'): FilaCruda[] {
  const filas = parsearArchivoImportacion(archivoBase64, nombreArchivo);
  return filas.map(f => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) {
      const canon = ALIAS[normalizarEncabezado(k)] ?? k;
      // El alias 'tipo' choca entre plantillas: en correlativas es el tipo de
      // correlación, no el matchType.
      out[canon] = v;
      if (canon === 'matchType' && !('tipoCorrelativa' in f)) out.tipoCorrelativa = v;
    }
    return out;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación por fila, por tipo
// ─────────────────────────────────────────────────────────────────────────────

const CLAVES_ADUANA = new Set(ADUANAS.map(a => a.clave));

export function validarFilaCarga(tipo: TipoCarga, f: Record<string, unknown>, fila: number, ahora = new Date()): FilaCargaValidada {
  const errores: string[] = [];
  const atestacion = validarAtestacion(f, errores, ahora);
  let clave: string | null = null;

  switch (tipo) {
    case 'cuotas-upci': {
      // Se delega la validación de negocio al importador existente y aquí solo
      // se endurece el cotejo (esa ruta acepta filas "pendiente").
      const v = validarFilaUPCI(f, fila);
      errores.push(...v.errores);
      clave = v.clave;
      break;
    }
    case 'reglas-origen': {
      const v = validarFilaRegla({ ...f, fuente: txt(f.fuenteUrl) || txt(f.fuente) }, fila);
      errores.push(...v.errores);
      clave = v.data ? `${v.data.fractionCode}|${v.data.matchType}|${v.data.agreement}` : null;
      break;
    }
    case 'precedentes': {
      const v = validarFilaPrecedente({ ...f, officialUrl: txt(f.fuenteUrl) || txt(f.officialUrl) });
      errores.push(...v.errores);
      clave = v.datos.reference ? `${v.datos.type}|${v.datos.reference}` : null;
      break;
    }
    case 'prosec': {
      const code = limpiarFraccion(f.fractionCode);
      const matchType = (txt(f.matchType).toLowerCase() || (code.length === 8 ? 'exact' : 'prefix'));
      const sector = txt(f.sector);
      const tasa = numero(f.prosecRate);
      const efectiva = fechaDe(f.effectiveDate);
      const expira = fechaDe(f.expiryDate);
      if (![2, 4, 6, 8].includes(code.length)) errores.push('fractionCode debe tener 2, 4, 6 u 8 dígitos');
      if (!['exact', 'prefix'].includes(matchType)) errores.push('matchType debe ser exact o prefix');
      if (matchType === 'exact' && code.length !== 8) errores.push('matchType exact exige 8 dígitos');
      if (!sector) errores.push('sector es obligatorio (sector del Decreto PROSEC)');
      if (tasa === null) errores.push('prosecRate es obligatoria');
      else if (Number.isNaN(tasa) || tasa < 0 || tasa > 100) errores.push('prosecRate debe ser un porcentaje 0-100');
      if (efectiva === undefined) errores.push('effectiveDate inválida (AAAA-MM-DD)');
      else if (efectiva === null) errores.push('effectiveDate es obligatoria (fecha de entrada en vigor del decreto)');
      if (expira === undefined) errores.push('expiryDate inválida (AAAA-MM-DD)');
      if (efectiva && expira && efectiva.getTime() > expira.getTime()) errores.push('expiryDate anterior a effectiveDate');
      clave = `${code}|${matchType}|${sector.toLowerCase()}`;
      break;
    }
    case 'precios-estimados': {
      const code = limpiarFraccion(f.fractionCode);
      const paisRaw = txt(f.countryOfOrigin);
      const pais = paisRaw ? normalizeCountry(paisRaw) : '';
      const valor = numero(f.estimatedValue);
      const unidad = txt(f.unit);
      const fuente = (txt(f.source) || 'DOF').toUpperCase();
      const publica = fechaDe(f.publishDate);
      const efectiva = fechaDe(f.effectiveDate);
      const expira = fechaDe(f.expiryDate);
      const decreto = txt(f.decree);
      if (code.length !== 8) errores.push('fractionCode debe tener 8 dígitos');
      if (paisRaw && !/^[A-Z]{2}$/.test(pais)) errores.push('countryOfOrigin debe ser ISO-2 (o nombre reconocido); vacío = cualquier origen');
      if (valor === null) errores.push('estimatedValue es obligatorio');
      else if (Number.isNaN(valor) || valor <= 0) errores.push('estimatedValue debe ser un número > 0');
      if (!/^USD\/\S+$/i.test(unidad)) errores.push('unit debe ser USD/<unidad> (USD/kg, USD/pieza, USD/par, USD/m, USD/litro…)');
      if (!['DOF', 'SAT'].includes(fuente)) errores.push('source debe ser DOF o SAT: este cargador NO admite estimaciones internas (Art. 84-A exige publicación oficial)');
      if (!decreto) errores.push('decree es obligatorio (resolución del DOF que publica el precio estimado)');
      if (publica === undefined) errores.push('publishDate inválida (AAAA-MM-DD)');
      else if (publica === null) errores.push('publishDate es obligatoria (fecha de publicación en DOF)');
      if (efectiva === undefined) errores.push('effectiveDate inválida (AAAA-MM-DD)');
      if (expira === undefined) errores.push('expiryDate inválida (AAAA-MM-DD)');
      clave = `${code}|${pais || '*'}|${decreto.toLowerCase()}`;
      break;
    }
    case 'anexo21': {
      const code = limpiarFraccion(f.fractionCode);
      const matchType = (txt(f.matchType).toLowerCase() || (code.length === 8 ? 'exact' : 'prefix'));
      const aduana = txt(f.aduanaClave).padStart(2, '0');
      const mercancia = txt(f.mercancia);
      if (![2, 4, 6, 8].includes(code.length)) errores.push('fractionCode debe tener 2, 4, 6 u 8 dígitos');
      if (!['exact', 'prefix'].includes(matchType)) errores.push('matchType debe ser exact o prefix');
      if (matchType === 'exact' && code.length !== 8) errores.push('matchType exact exige 8 dígitos');
      if (!/^\d{2}$/.test(aduana)) errores.push('aduanaClave debe ser la clave de 2 dígitos del Apéndice 1 (Anexo 22)');
      else if (!CLAVES_ADUANA.has(aduana)) errores.push(`aduanaClave "${aduana}" no está en el Apéndice 1 del Anexo 22 cargado en el producto (lib/anexo22.ts)`);
      if (!mercancia) errores.push('mercancia es obligatoria (qué mercancía queda restringida a esa aduana)');
      clave = `${code}|${matchType}|${aduana}`;
      break;
    }
    case 'correlativas': {
      const origen = limpiarFraccion(f.origenCode);
      const destino = limpiarFraccion(f.destinoCode);
      const vOrigen = txt(f.origenVersion);
      const vDestino = txt(f.destinoVersion);
      const t = txt(f.tipoCorrelativa).toLowerCase().replace(/[\s-]+/g, '_');
      if (!(TIPOS_CORRELATIVA as readonly string[]).includes(t)) errores.push(`tipo inválido (${TIPOS_CORRELATIVA.join(' | ')})`);
      if (!(VERSIONES_LIGIE as readonly string[]).includes(vOrigen)) errores.push(`origenVersion inválida (${VERSIONES_LIGIE.join(' | ')})`);
      if (!(VERSIONES_LIGIE as readonly string[]).includes(vDestino)) errores.push(`destinoVersion inválida (${VERSIONES_LIGIE.join(' | ')})`);
      if (vOrigen && vOrigen === vDestino) errores.push('origenVersion y destinoVersion no pueden ser la misma');
      if (t !== 'creada' && origen.length !== 8) errores.push('origenCode debe tener 8 dígitos (solo tipo "creada" puede omitirlo)');
      if (t !== 'suprimida' && destino.length !== 8) errores.push('destinoCode debe tener 8 dígitos (solo tipo "suprimida" puede omitirlo)');
      const ancla = origen || destino;
      clave = `${ancla}|${vOrigen}|${vDestino}|${destino || '-'}`;
      break;
    }
  }

  const ok = errores.length === 0 && !!atestacion;
  return { fila, ok, errores, clave, atestacion };
}

// ─────────────────────────────────────────────────────────────────────────────
// Plantillas
// ─────────────────────────────────────────────────────────────────────────────

function hojaInstrucciones(def: DefCargador, extra: string[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([
    ['Cargador', def.titulo],
    ['Destino', def.destino],
    ['Fuente oficial', def.fuenteOficial],
    ['Clave de dedupe', def.clave],
    ['Métricas del tablero que mueve', def.metricas.join(', ')],
    [],
    ['REGLA DURA', 'Una fila SIN cotejadoPor y fuenteUrl se RECHAZA. No se guarda "pendiente de cotejo": este cargador existe para cerrar deuda, no para moverla de lugar.'],
    ['cotejadoPor', 'Nombre o usuario de quien comparó la fila contra la fuente oficial. Obligatoria.'],
    ['fuenteUrl', 'URL http(s) del documento oficial cotejado (DOF/SAT/SE/TFJA/SNICE). Obligatoria.'],
    ['fechaCotejo', 'AAAA-MM-DD de la revisión (default: hoy). No puede estar en el futuro.'],
    [],
    ['Columna', 'Regla'],
    ...extra,
    ...(def.schemaRequerido ? [[], ['SCHEMA REQUERIDO', def.schemaRequerido]] : []),
  ]);
}

/** Plantilla .xlsx con la hoja de datos vacía + hoja de instrucciones. */
export function plantillaCargaXlsx(tipo: TipoCarga): Buffer {
  const def = CARGADORES[tipo];
  // Las tres primeras reutilizan la plantilla que ya existe, con una hoja extra
  // que documenta la puerta estricta de este módulo.
  if (tipo === 'cuotas-upci' || tipo === 'reglas-origen' || tipo === 'precedentes') {
    const buf = tipo === 'cuotas-upci' ? plantillaUPCIXlsx() : tipo === 'reglas-origen' ? plantillaReglasXlsx() : plantillaXlsx('precedents');
    const wb = XLSX.read(buf, { type: 'buffer' });
    XLSX.utils.book_append_sheet(wb, hojaInstrucciones(def, [
      ['(todas)', 'Además de las reglas de la plantilla original, por esta ruta cotejadoPor y fuenteUrl son OBLIGATORIAS.'],
    ]), 'cotejo_estricto');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  const reglas: Record<Exclude<TipoCarga, 'cuotas-upci' | 'reglas-origen' | 'precedentes'>, string[][]> = {
    prosec: [
      ['fractionCode', '2, 4, 6 u 8 dígitos (con o sin puntos)'],
      ['matchType', 'exact (8 dígitos) | prefix (capítulo/partida/subpartida). Default por longitud.'],
      ['sector', 'Sector del Decreto PROSEC tal como lo nombra el decreto. Obligatorio.'],
      ['prosecRate', 'Tasa preferencial en % (0-100). Obligatoria.'],
      ['effectiveDate', 'AAAA-MM-DD de entrada en vigor. Obligatoria.'],
      ['expiryDate', 'AAAA-MM-DD o vacío si no expira.'],
      ['decree', 'Referencia del DOF (p. ej. "DOF 24-dic-2025, reforma al Decreto PROSEC").'],
    ],
    'precios-estimados': [
      ['fractionCode', '8 dígitos'],
      ['countryOfOrigin', 'ISO-2 o nombre; vacío = aplica a cualquier origen'],
      ['estimatedValue', 'Número > 0'],
      ['unit', 'USD/kg | USD/pieza | USD/par | USD/m | USD/litro …'],
      ['source', 'DOF | SAT. Se RECHAZA "internal": el Art. 84-A exige precio publicado.'],
      ['decree', 'Resolución del DOF que publica el precio estimado. Obligatoria.'],
      ['publishDate / effectiveDate / expiryDate', 'AAAA-MM-DD (publishDate obligatoria)'],
    ],
    anexo21: [
      ['fractionCode', '2, 4, 6 u 8 dígitos'],
      ['matchType', 'exact | prefix'],
      ['aduanaClave', 'Clave de 2 dígitos del Apéndice 1 del Anexo 22. Se valida contra el catálogo del producto.'],
      ['mercancia', 'Qué mercancía queda restringida a esa aduana. Obligatoria.'],
      ['required', '1/sí = despacho obligatorio por esa aduana; vacío = autorizada entre varias'],
    ],
    correlativas: [
      ['origenCode / destinoCode', '8 dígitos. origenCode solo puede faltar en tipo "creada"; destinoCode solo en "suprimida".'],
      ['origenVersion / destinoVersion', VERSIONES_LIGIE.join(' | ')],
      ['tipo', TIPOS_CORRELATIVA.join(' | ')],
      ['nota', 'Texto libre de la tabla de correlación'],
    ],
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...def.columnas]]), tipo.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, hojaInstrucciones(def, reglas[tipo as keyof typeof reglas]), 'instrucciones');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Importación
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionesCarga {
  archivoBase64: string;
  nombreArchivo?: string;
  dryRun?: boolean;
  ahora?: Date;
}

/** Reempaqueta filas ya aceptadas en un xlsx base64 para delegarlas a un importador existente. */
function aBase64Xlsx(filas: FilaCruda[]): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'filas');
  return (XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64');
}

export async function importarCarga(tipo: TipoCarga, o: OpcionesCarga): Promise<ReporteCarga> {
  if (!o.archivoBase64) throw new Error('archivoBase64 es obligatorio');
  const ahora = o.ahora ?? new Date();
  const def = CARGADORES[tipo];
  const filas = leerFilasCarga(o.archivoBase64, o.nombreArchivo);
  const rep: ReporteCarga = {
    tipo, total: filas.length, aceptadas: 0, rechazadas: 0, creadas: 0, actualizadas: 0,
    duplicadasEnArchivo: 0, dryRun: !!o.dryRun, schemaRequerido: def.schemaRequerido, filas: [],
  };
  if (filas.length === 0) return rep;
  if (filas.length > 2000) throw new Error('Máximo 2000 filas por archivo');

  const vistos = new Set<string>();
  const aceptadas: { indice: number; fila: number; datos: FilaCruda; v: FilaCargaValidada }[] = [];

  for (let i = 0; i < filas.length; i++) {
    const nFila = i + 2; // 1 = encabezados
    const v = validarFilaCarga(tipo, filas[i]!, nFila, ahora);
    if (v.ok && v.clave) {
      if (vistos.has(v.clave)) {
        v.ok = false;
        v.errores.push(`duplicada dentro del archivo (${v.clave})`);
        rep.duplicadasEnArchivo++;
      }
      vistos.add(v.clave);
    }
    if (!v.ok) {
      rep.rechazadas++;
      rep.filas.push({ fila: nFila, clave: v.clave, ok: false, errores: v.errores, accion: 'rechazada' });
      continue;
    }
    rep.aceptadas++;
    aceptadas.push({ indice: i, fila: nFila, datos: filas[i]!, v });
  }

  if (o.dryRun || aceptadas.length === 0) {
    for (const a of aceptadas) rep.filas.push({ fila: a.fila, clave: a.v.clave, ok: true, errores: [], accion: 'validada' });
    ordenar(rep);
    return rep;
  }

  // ── Delegación a los importadores existentes ──
  if (tipo === 'cuotas-upci' || tipo === 'reglas-origen') {
    const base64 = aBase64Xlsx(aceptadas.map(a => a.datos));
    const r = tipo === 'cuotas-upci'
      ? await importarUPCI({ archivoBase64: base64, nombreArchivo: 'aceptadas.xlsx' })
      : await importarReglasOrigen({ archivoBase64: base64, nombreArchivo: 'aceptadas.xlsx' });
    r.filas.forEach((fr, idx) => {
      const a = aceptadas[idx];
      const accion = fr.accion === 'rechazada' ? 'rechazada' : fr.accion;
      if (accion === 'creada') rep.creadas++;
      else if (accion === 'actualizada') rep.actualizadas++;
      else if (accion === 'rechazada') { rep.rechazadas++; rep.aceptadas--; }
      rep.filas.push({ fila: a?.fila ?? fr.fila, clave: a?.v.clave ?? null, ok: accion !== 'rechazada', errores: fr.errores, accion });
    });
    ordenar(rep);
    return rep;
  }

  if (tipo === 'precedentes') {
    const r = await importarPrecedentes(aceptadas.map(a => ({ ...a.datos, officialUrl: a.v.atestacion!.fuenteUrl, fechaCotejo: a.v.atestacion!.fechaCotejo.toISOString().slice(0, 10) })));
    r.filas.forEach((fr, idx) => {
      const a = aceptadas[idx];
      const accion = fr.estado === 'creado' ? 'creada' : fr.estado === 'actualizado' ? 'actualizada' : fr.estado === 'duplicado' ? 'validada' : 'rechazada';
      if (accion === 'creada') rep.creadas++;
      else if (accion === 'actualizada') rep.actualizadas++;
      else if (accion === 'rechazada') { rep.rechazadas++; rep.aceptadas--; }
      rep.filas.push({ fila: a?.fila ?? fr.indice + 2, clave: a?.v.clave ?? null, ok: accion !== 'rechazada', errores: fr.errores, accion });
    });
    ordenar(rep);
    return rep;
  }

  // ── Escritura propia ──
  for (const a of aceptadas) {
    const at = a.v.atestacion!;
    const f = a.datos;
    let creada = false;
    if (tipo === 'prosec') {
      const code = limpiarFraccion(f.fractionCode);
      const matchType = txt(f.matchType).toLowerCase() || (code.length === 8 ? 'exact' : 'prefix');
      const sector = txt(f.sector);
      const data = {
        fractionCode: code, matchType, sector,
        prosecRate: numero(f.prosecRate)!,
        conditions: txt(f.conditions) ? { texto: txt(f.conditions) } : undefined,
        effectiveDate: fechaDe(f.effectiveDate)!,
        expiryDate: fechaDe(f.expiryDate) ?? null,
        decree: txt(f.decree) || null,
        fechaCotejo: at.fechaCotejo,
        notes: notaDeCotejo(at, txt(f.notes) || txt(f.notas) || null),
        active: true,
      };
      const ex = await prisma.pROSECEligibility.findFirst({ where: { fractionCode: code, matchType, sector }, select: { id: true } });
      if (ex) await prisma.pROSECEligibility.update({ where: { id: ex.id }, data });
      else { await prisma.pROSECEligibility.create({ data }); creada = true; }
    } else if (tipo === 'precios-estimados') {
      const code = limpiarFraccion(f.fractionCode);
      const paisRaw = txt(f.countryOfOrigin);
      const pais = paisRaw ? normalizeCountry(paisRaw) : null;
      const decreto = txt(f.decree);
      const publica = fechaDe(f.publishDate)!;
      const data = {
        fractionCode: code, countryOfOrigin: pais,
        estimatedValue: numero(f.estimatedValue)!,
        unit: txt(f.unit),
        decree: decreto,
        publishDate: publica,
        effectiveDate: fechaDe(f.effectiveDate) ?? publica,
        expiryDate: fechaDe(f.expiryDate) ?? null,
        source: (txt(f.source) || 'DOF').toUpperCase(),
        notes: notaDeCotejo(at, txt(f.notes) || txt(f.notas) || null),
        active: true,
      };
      const ex = await prisma.estimatedPrice.findFirst({ where: { fractionCode: code, countryOfOrigin: pais, decree: decreto }, select: { id: true } });
      if (ex) await prisma.estimatedPrice.update({ where: { id: ex.id }, data });
      else { await prisma.estimatedPrice.create({ data }); creada = true; }
    } else if (tipo === 'anexo21') {
      const code = limpiarFraccion(f.fractionCode);
      const esExacta = (txt(f.matchType).toLowerCase() || (code.length === 8 ? 'exact' : 'prefix')) === 'exact';
      const matchType = esExacta ? MATCH_ANEXO21.exact : MATCH_ANEXO21.prefix;
      const aduana = txt(f.aduanaClave).padStart(2, '0');
      const denominacion = ADUANAS.find(x => x.clave === aduana)?.denominacion ?? '';
      const data = {
        fractionCode: code, matchType, type: TIPO_REG_ANEXO21, authority: 'SAT',
        code: aduana,
        description: `Aduana ${aduana}${denominacion ? ` — ${denominacion}` : ''}: ${txt(f.mercancia)} | ${notaDeCotejo(at, txt(f.notas) || null)}`,
        required: booleano(f.required),
        active: true,
      };
      const ex = await prisma.fractionRegulation.findFirst({ where: { fractionCode: code, matchType, type: TIPO_REG_ANEXO21, code: aduana }, select: { id: true } });
      if (ex) await prisma.fractionRegulation.update({ where: { id: ex.id }, data });
      else { await prisma.fractionRegulation.create({ data }); creada = true; }
    } else if (tipo === 'correlativas') {
      const origen = limpiarFraccion(f.origenCode);
      const destino = limpiarFraccion(f.destinoCode);
      const vOrigen = txt(f.origenVersion);
      const vDestino = txt(f.destinoVersion);
      const t = txt(f.tipoCorrelativa).toLowerCase().replace(/[\s-]+/g, '_');
      const ancla = origen || destino;
      // `code` es machine-parseable: "2020>2022:<destino>" permite buscar la
      // fracción tanto por origen (fractionCode) como por destino (endsWith).
      const codeCol = `${vOrigen}>${vDestino}:${destino}`;
      const data = {
        fractionCode: ancla, matchType: MATCH_CORRELATIVA, type: TIPO_REG_CORRELATIVA, authority: 'SE/SNICE',
        code: codeCol,
        description: `LIGIE ${vOrigen} ${origen || '(nueva)'} → LIGIE ${vDestino} ${destino || '(suprimida)'} · ${t}${txt(f.nota) ? ` · ${txt(f.nota)}` : ''} | ${notaDeCotejo(at)}`,
        required: false,
        active: true,
      };
      const ex = await prisma.fractionRegulation.findFirst({ where: { fractionCode: ancla, matchType: MATCH_CORRELATIVA, type: TIPO_REG_CORRELATIVA, code: codeCol }, select: { id: true } });
      if (ex) await prisma.fractionRegulation.update({ where: { id: ex.id }, data });
      else { await prisma.fractionRegulation.create({ data }); creada = true; }
    }
    if (creada) rep.creadas++; else rep.actualizadas++;
    rep.filas.push({ fila: a.fila, clave: a.v.clave, ok: true, errores: [], accion: creada ? 'creada' : 'actualizada' });
  }

  ordenar(rep);
  return rep;
}

function ordenar(rep: ReporteCarga): void {
  rep.filas.sort((a, b) => a.fila - b.fila);
}
