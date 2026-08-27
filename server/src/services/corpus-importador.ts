/**
 * Pipeline ADMIN de carga de corpus (LegalDocument) y precedentes
 * (LegalPrecedent) — Ola 2, Operación 2026-08.
 *
 * Principio: NUNCA se inventa material legal. Este módulo solo mueve filas
 * que el administrador trae de una fuente oficial, valida que la referencia
 * sea parseable por el matcher de citas (`clavesDeReferencia`), exige
 * `fechaCotejo` + `officialUrl` para marcar una fila como VERIFICADA, dedupea
 * por `contentHash` y genera embeddings con el guard de dimensión existente
 * (`assertCorpusEmbedding`: un fallback hashed de 256 dims tras un 429 de
 * Voyage envenena el corpus 1024 — se rechaza, no se persiste).
 *
 * Formatos: Excel (.xlsx/.xls), CSV o JSON (array de objetos) en base64.
 *
 * Columnas LegalDocument (encabezados en la primera fila):
 *   reference*   "Art. 54 LA" / "Regla 7.1.6 RGCE 2026" (debe obtener clave)
 *   title*       título corto
 *   source*      "Ley_Aduanera" | "RGCE_2026" | "LIVA" | …
 *   content*     texto (verbatim si claseTexto=texto_integro)
 *   type         ley | reglamento | rgce | decreto | resolucion_dof | criterio_sat | tesis_tfja | tratado (default: ley)
 *   claseTexto   texto_integro | resumen (default: resumen)
 *   version      etiqueta de instrumento/versión (p. ej. "RGCE 2026 DOF 30-dic-2025")
 *   fechaCotejo  YYYY-MM-DD  (obligatoria para verificado)
 *   officialUrl  https://…    (obligatoria para verificado)
 *   effectiveDate, publishedDate  YYYY-MM-DD
 *   topics, keywords, fractionRefs   separados por ; o ,
 *
 * Columnas LegalPrecedent:
 *   reference*, title*, type* (TFJA|SCJN|CRITERIO_SAT|CONSULTA_SAT|OMA|RESOLUCION_UPCI),
 *   topic*, summary*, ruling*, reasoning*, yearPublished*,
 *   officialUrl (→ source), fechaCotejo, applicability, fractionCodes, chapterCodes, litigated
 *   Verificado = officialUrl + fechaCotejo + referencia sin placeholder ("XX").
 *   NOTA: LegalPrecedent no tiene columnas fechaCotejo/contentHash (SCHEMA
 *   REQUERIDO en el reporte); la fechaCotejo se conserva en `applicability`
 *   como sufijo "[cotejo YYYY-MM-DD]" hasta que exista la columna.
 */
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { generateEmbedding, assertCorpusEmbedding } from '../lib/embeddings';
import { clavesDeReferencia } from './citas-legales';
import { logger } from '../lib/logger';

export type FilaCruda = Record<string, unknown>;

export interface ResultadoFila {
  indice: number;
  reference: string;
  estado: 'creado' | 'actualizado' | 'duplicado' | 'rechazado';
  verificado: boolean;
  errores: string[];
  avisos: string[];
  id?: string;
}

export interface ResultadoImportacion {
  total: number;
  creados: number;
  actualizados: number;
  duplicados: number;
  rechazados: number;
  verificados: number;
  filas: ResultadoFila[];
}

export const TIPOS_LEGAL_DOC = ['ley', 'reglamento', 'rgce', 'decreto', 'resolucion_dof', 'criterio_sat', 'tesis_tfja', 'tratado'] as const;
export const TIPOS_PRECEDENTE = ['TFJA', 'SCJN', 'CRITERIO_SAT', 'CONSULTA_SAT', 'OMA', 'RESOLUCION_UPCI'] as const;

/** Plantillas documentadas — las descarga la pantalla admin. */
export const COLUMNAS_LEGAL_DOC = ['reference', 'title', 'source', 'content', 'type', 'claseTexto', 'version', 'fechaCotejo', 'officialUrl', 'effectiveDate', 'publishedDate', 'topics', 'keywords', 'fractionRefs'] as const;
export const COLUMNAS_PRECEDENTE = ['reference', 'title', 'type', 'topic', 'summary', 'ruling', 'reasoning', 'yearPublished', 'officialUrl', 'fechaCotejo', 'applicability', 'fractionCodes', 'chapterCodes', 'litigated'] as const;

/** Material que NO se carga por licencia/fuente: solo plantilla + nota. */
export const MATERIAL_PENDIENTE_LICENCIA = [
  { material: 'Notas Explicativas del Sistema Armonizado', motivo: 'Licencia OMA/SE — pendiente de fuente oficial con permiso de uso.' },
  { material: 'RGCE 2026 íntegras (texto completo)', motivo: 'Carga verbatim por regla desde el DOF; este importador acepta reglas sueltas con fechaCotejo y officialUrl.' },
] as const;

export function hashContenido(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}
function lista(v: unknown): string[] {
  const s = str(v);
  if (!s) return [];
  return s.split(/[;,|]/).map(x => x.trim()).filter(Boolean);
}
function fechaISO(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return isNaN(d.getTime()) ? null : d;
}
function esUrlOficial(u: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(u);
}

/** Excel/CSV/JSON en base64 → filas crudas (encabezados de la primera fila). */
export function parsearArchivoImportacion(base64: string, nombre: string): FilaCruda[] {
  const buf = Buffer.from(base64, 'base64');
  if (/\.json$/i.test(nombre)) {
    const parsed = JSON.parse(buf.toString('utf8')) as unknown;
    const arr = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { filas?: unknown }).filas) ? (parsed as { filas: unknown[] }).filas : null);
    if (!arr) throw new Error('JSON inválido: se espera un array de objetos (o { filas: [...] }).');
    return arr.filter((x): x is FilaCruda => !!x && typeof x === 'object');
  }
  let wb: XLSX.WorkBook;
  try {
    wb = /\.csv$/i.test(nombre)
      ? XLSX.read(buf.toString('utf8'), { type: 'string', raw: false })
      : XLSX.read(buf, { type: 'buffer', cellDates: true });
  } catch {
    throw new Error('No pude leer el archivo. Sube .xlsx, .xls, .csv o .json con encabezados en la primera fila.');
  }
  const hoja = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!hoja) throw new Error('El archivo no tiene hojas.');
  return XLSX.utils.sheet_to_json<FilaCruda>(hoja, { defval: '' });
}

// ── Validación LegalDocument ─────────────────────────────────────────────

export interface FilaLegalDocValidada {
  ok: boolean;
  verificado: boolean;
  errores: string[];
  avisos: string[];
  datos: {
    reference: string; title: string; source: string; content: string; type: string; claseTexto: 'texto_integro' | 'resumen';
    version: string | null; fechaCotejo: Date | null; officialUrl: string | null;
    effectiveDate: Date | null; publishedDate: Date | null;
    topics: string[]; keywords: string[]; fractionRefs: string[];
  };
}

export function validarFilaLegalDoc(f: FilaCruda): FilaLegalDocValidada {
  const errores: string[] = [];
  const avisos: string[] = [];
  const reference = str(f.reference);
  const title = str(f.title);
  const source = str(f.source);
  const content = str(f.content);
  const type = str(f.type) || 'ley';
  const claseTextoRaw = str(f.claseTexto) || 'resumen';
  const officialUrl = str(f.officialUrl) || null;
  const fechaCotejo = fechaISO(f.fechaCotejo);

  if (!reference) errores.push('reference requerida');
  else if (clavesDeReferencia(reference).length === 0) errores.push(`reference "${reference}" no obtiene clave (usa "Art. NN LA", "Regla N.N.N RGCE 2026", "Anexo NN RGCE"…)`);
  if (!title) errores.push('title requerido');
  if (!source) errores.push('source requerida');
  if (!content || content.length < 20) errores.push('content requerido (≥ 20 caracteres)');
  if (!(TIPOS_LEGAL_DOC as readonly string[]).includes(type)) errores.push(`type inválido: ${type}`);
  if (claseTextoRaw !== 'texto_integro' && claseTextoRaw !== 'resumen') errores.push(`claseTexto inválida: ${claseTextoRaw}`);
  if (officialUrl && !esUrlOficial(officialUrl)) errores.push('officialUrl debe ser http(s)');
  if (str(f.fechaCotejo) && !fechaCotejo) errores.push('fechaCotejo debe ser YYYY-MM-DD');

  let verificado = false;
  if (errores.length === 0) {
    if (!fechaCotejo) avisos.push('sin fechaCotejo → se carga como NO verificado');
    if (!officialUrl) avisos.push('sin officialUrl → se carga como NO verificado');
    verificado = !!fechaCotejo && !!officialUrl;
    if (claseTextoRaw === 'texto_integro' && !verificado) avisos.push('texto_integro sin cotejo: el retrieval lo tratará como resumen hasta que se coteje');
  }
  return {
    ok: errores.length === 0, verificado, errores, avisos,
    datos: {
      reference, title, source, content, type,
      claseTexto: verificado && claseTextoRaw === 'texto_integro' ? 'texto_integro' : 'resumen',
      version: str(f.version) || null, fechaCotejo: verificado ? fechaCotejo : null, officialUrl,
      effectiveDate: fechaISO(f.effectiveDate), publishedDate: fechaISO(f.publishedDate),
      topics: lista(f.topics), keywords: lista(f.keywords), fractionRefs: lista(f.fractionRefs).map(x => x.replace(/\D/g, '')).filter(x => x.length === 8),
    },
  };
}

export interface DepsImportacion {
  /** Inyectable en tests: sin proveedor real no hay 1024 dims y el guard rechazaría. */
  embed?: (texto: string) => Promise<number[]>;
  validarDim?: (embedding: number[], ctx: string) => void;
}

export async function importarLegalDocs(filas: FilaCruda[], deps: DepsImportacion = {}): Promise<ResultadoImportacion> {
  const embed = deps.embed ?? ((t: string) => generateEmbedding(t, 'document'));
  const validarDim = deps.validarDim ?? assertCorpusEmbedding;
  const out: ResultadoImportacion = { total: filas.length, creados: 0, actualizados: 0, duplicados: 0, rechazados: 0, verificados: 0, filas: [] };
  const vistosEnLote = new Set<string>();

  for (let i = 0; i < filas.length; i++) {
    const v = validarFilaLegalDoc(filas[i]!);
    const fila: ResultadoFila = { indice: i, reference: v.datos.reference, estado: 'rechazado', verificado: v.verificado, errores: v.errores, avisos: v.avisos };
    if (!v.ok) { out.rechazados++; out.filas.push(fila); continue; }

    const contentHash = hashContenido(v.datos.content);
    const claveLote = `${v.datos.source}|${v.datos.reference}|${contentHash}`;
    if (vistosEnLote.has(claveLote)) { fila.estado = 'duplicado'; fila.avisos.push('duplicado dentro del mismo archivo'); out.duplicados++; out.filas.push(fila); continue; }
    vistosEnLote.add(claveLote);

    try {
      const existente = await prisma.legalDocument.findFirst({
        where: { source: v.datos.source, reference: v.datos.reference },
        select: { id: true, contentHash: true, fechaCotejo: true },
      });
      if (existente && existente.contentHash === contentHash) {
        fila.estado = 'duplicado'; fila.id = existente.id;
        fila.avisos.push('mismo contentHash que el documento existente — sin cambios');
        out.duplicados++; out.filas.push(fila); continue;
      }
      const embedding = await embed(`${v.datos.title}\n${v.datos.reference}\n${v.datos.content}`);
      validarDim(embedding, v.datos.reference); // guard de dims: nunca persistir un fallback
      const data = {
        type: v.datos.type, source: v.datos.source, title: v.datos.title, reference: v.datos.reference,
        content: v.datos.content, officialUrl: v.datos.officialUrl,
        publishedDate: v.datos.publishedDate, effectiveDate: v.datos.effectiveDate,
        claseTexto: v.datos.claseTexto, fechaCotejo: v.datos.fechaCotejo, version: v.datos.version,
        topics: v.datos.topics, keywords: v.datos.keywords, fractionRefs: v.datos.fractionRefs,
        embedding, contentHash, isActive: true,
      };
      const row = existente
        ? await prisma.legalDocument.update({ where: { id: existente.id }, data })
        : await prisma.legalDocument.create({ data });
      fila.id = row.id;
      fila.estado = existente ? 'actualizado' : 'creado';
      if (existente) out.actualizados++; else out.creados++;
      if (v.verificado) out.verificados++;
    } catch (err) {
      fila.estado = 'rechazado';
      fila.errores.push(err instanceof Error ? err.message : String(err));
      out.rechazados++;
      logger.warn('Importación legal-docs: fila rechazada', { action: 'corpus_import_fila', metadata: { reference: v.datos.reference, error: fila.errores } });
    }
    out.filas.push(fila);
  }
  return out;
}

// ── Validación LegalPrecedent ────────────────────────────────────────────

export interface FilaPrecedenteValidada {
  ok: boolean;
  verificado: boolean;
  errores: string[];
  avisos: string[];
  datos: {
    reference: string; title: string; type: string; topic: string; summary: string; ruling: string; reasoning: string;
    applicability: string | null; yearPublished: number; officialUrl: string | null; fechaCotejo: Date | null;
    fractionCodes: string[]; chapterCodes: string[]; litigated: boolean;
  };
}

export function validarFilaPrecedente(f: FilaCruda): FilaPrecedenteValidada {
  const errores: string[] = [];
  const avisos: string[] = [];
  const reference = str(f.reference);
  const type = str(f.type).toUpperCase();
  const officialUrl = str(f.officialUrl) || str(f.source) || null;
  const fechaCotejo = fechaISO(f.fechaCotejo);
  const yearPublished = Number(str(f.yearPublished));
  const fractionCodes = lista(f.fractionCodes).map(x => x.replace(/\D/g, '')).filter(x => x.length === 8);
  const chapterCodes = [...new Set([...lista(f.chapterCodes).map(x => x.replace(/\D/g, '').padStart(2, '0')).filter(x => x.length === 2), ...fractionCodes.map(x => x.slice(0, 2))])];

  if (!reference) errores.push('reference requerida');
  else if (/\bXX+\b|\bNN+\b|\?\?/.test(reference)) errores.push(`reference "${reference}" contiene placeholder (XX/NN): no es una referencia real`);
  for (const k of ['title', 'topic', 'summary', 'ruling', 'reasoning'] as const) if (!str(f[k])) errores.push(`${k} requerido`);
  if (!(TIPOS_PRECEDENTE as readonly string[]).includes(type)) errores.push(`type inválido: ${type || '(vacío)'}`);
  if (!Number.isInteger(yearPublished) || yearPublished < 1990 || yearPublished > 2100) errores.push('yearPublished inválido');
  if (officialUrl && !esUrlOficial(officialUrl)) errores.push('officialUrl debe ser http(s)');
  if (str(f.fechaCotejo) && !fechaCotejo) errores.push('fechaCotejo debe ser YYYY-MM-DD');

  let verificado = false;
  if (errores.length === 0) {
    if (!officialUrl) avisos.push('sin officialUrl → NO verificado (no se servirá al Clasificador)');
    if (!fechaCotejo) avisos.push('sin fechaCotejo → NO verificado');
    verificado = !!officialUrl && !!fechaCotejo;
  }
  const litigatedRaw = str(f.litigated).toLowerCase();
  return {
    ok: errores.length === 0, verificado, errores, avisos,
    datos: {
      reference, title: str(f.title), type, topic: str(f.topic), summary: str(f.summary), ruling: str(f.ruling), reasoning: str(f.reasoning),
      applicability: str(f.applicability) || null, yearPublished, officialUrl, fechaCotejo,
      fractionCodes, chapterCodes, litigated: litigatedRaw === 'true' || litigatedRaw === '1' || litigatedRaw === 'sí' || litigatedRaw === 'si',
    },
  };
}

export async function importarPrecedentes(filas: FilaCruda[]): Promise<ResultadoImportacion> {
  const out: ResultadoImportacion = { total: filas.length, creados: 0, actualizados: 0, duplicados: 0, rechazados: 0, verificados: 0, filas: [] };
  const vistosEnLote = new Set<string>();
  for (let i = 0; i < filas.length; i++) {
    const v = validarFilaPrecedente(filas[i]!);
    const fila: ResultadoFila = { indice: i, reference: v.datos.reference, estado: 'rechazado', verificado: v.verificado, errores: v.errores, avisos: v.avisos };
    if (!v.ok) { out.rechazados++; out.filas.push(fila); continue; }
    const d = v.datos;
    const contentHash = hashContenido(`${d.summary}\n${d.ruling}\n${d.reasoning}`);
    const claveLote = `${d.type}|${d.reference}`;
    if (vistosEnLote.has(claveLote)) { fila.estado = 'duplicado'; fila.avisos.push('duplicado dentro del mismo archivo'); out.duplicados++; out.filas.push(fila); continue; }
    vistosEnLote.add(claveLote);
    try {
      const existente = await prisma.legalPrecedent.findFirst({ where: { type: d.type, reference: d.reference }, select: { id: true, summary: true, ruling: true, reasoning: true } });
      if (existente && hashContenido(`${existente.summary}\n${existente.ruling}\n${existente.reasoning}`) === contentHash) {
        fila.estado = 'duplicado'; fila.id = existente.id; fila.avisos.push('mismo contenido que el precedente existente');
        out.duplicados++; out.filas.push(fila); continue;
      }
      // Sin columna fechaCotejo en LegalPrecedent (SCHEMA REQUERIDO): se conserva como sufijo trazable.
      const applicability = d.fechaCotejo
        ? `${d.applicability ?? ''}${d.applicability ? ' ' : ''}[cotejo ${d.fechaCotejo.toISOString().slice(0, 10)}]`
        : d.applicability;
      const data = {
        type: d.type, reference: d.reference, title: d.title, topic: d.topic, summary: d.summary, ruling: d.ruling, reasoning: d.reasoning,
        applicability, yearPublished: d.yearPublished, source: d.officialUrl, fractionCodes: d.fractionCodes, chapterCodes: d.chapterCodes,
        litigated: d.litigated, isVigente: true,
      };
      const row = existente
        ? await prisma.legalPrecedent.update({ where: { id: existente.id }, data })
        : await prisma.legalPrecedent.create({ data });
      fila.id = row.id; fila.estado = existente ? 'actualizado' : 'creado';
      if (existente) out.actualizados++; else out.creados++;
      if (v.verificado) out.verificados++;
    } catch (err) {
      fila.estado = 'rechazado'; fila.errores.push(err instanceof Error ? err.message : String(err)); out.rechazados++;
    }
    out.filas.push(fila);
  }
  return out;
}

/** Plantilla xlsx con encabezados documentados (sin datos). */
export function plantillaXlsx(tipo: 'legal-docs' | 'precedents'): Buffer {
  const cols = tipo === 'legal-docs' ? COLUMNAS_LEGAL_DOC : COLUMNAS_PRECEDENTE;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[...cols]]);
  XLSX.utils.book_append_sheet(wb, ws, tipo === 'legal-docs' ? 'legal_docs' : 'precedentes');
  const notas = XLSX.utils.aoa_to_sheet([
    ['Material', 'Estado'],
    ...MATERIAL_PENDIENTE_LICENCIA.map(m => [m.material, `PENDIENTE — ${m.motivo}`]),
    ['Regla de la casa', 'fechaCotejo + officialUrl obligatorios para marcar verificado; reference debe ser parseable ("Art. NN LA", "Regla N.N.N RGCE 2026").'],
  ]);
  XLSX.utils.book_append_sheet(wb, notas, 'pendiente_fuente_oficial');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
