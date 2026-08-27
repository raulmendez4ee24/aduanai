/**
 * PIPELINE DE CARGA UPCI (Ola 2, Operación 2026-08).
 *
 * La tabla `AntidumpingDuty` mezcla resoluciones reales con tasas sembradas
 * (memoria: cotejo contra la lista UPCI pendiente). Este pipeline es el camino
 * honesto para reemplazarlas por datos con fuente:
 *
 *   - Excel/CSV con columnas documentadas (plantilla descargable).
 *   - Validación por fila (fracción 8 dígitos, país ISO-2, tipo/tasa/unidad,
 *     fechas, tasas por exportador "Empresa=tasa; Empresa=tasa").
 *   - Dedupe por (fractionCode, countryOfOrigin, resolutionNumber): si existe
 *     se ACTUALIZA, si no se crea. Duplicados dentro del archivo se rechazan.
 *   - `cotejadoAt` SOLO cuando la fila trae `cotejadoPor` (quién cotejó contra
 *     el DOF) — con `fechaCotejo` opcional (default hoy). Una `fuenteUrl` sola
 *     es "fuente declarada, pendiente de cotejo": una URL no es una revisión
 *     humana (revisión adversarial 27-ago-2026).
 *   - `dryRun` valida sin escribir.
 *
 * NO agrega resoluciones por sí mismo: sin archivo no hay filas nuevas.
 */

import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { normalizeCountry } from './compliance-lookup';
import type { ExportadorTasa } from './antidumping';

export const COLUMNAS_UPCI = [
  'resolutionNumber', 'expedienteUPCI', 'resolutionType', 'fractionCode', 'countryOfOrigin', 'productDesc',
  'rateType', 'rate', 'rateUnit', 'exportadorTasas', 'specificProducer',
  'publishDateDOF', 'effectiveDate', 'expiryDate', 'examenSunsetFecha',
  'status', 'investigationType', 'esAntielusion', 'dofUrl', 'fuenteUrl', 'cotejadoPor', 'fechaCotejo', 'notes',
] as const;

const RATE_TYPES = ['percentage', 'specific_USD_kg', 'specific_USD_unit'];
const STATUSES = ['vigente', 'suspendida', 'revocada', 'en_revision'];
const INV_TYPES = ['elusion', 'examen_vigencia', 'revision', 'nueva'];
const RES_TYPES = ['definitiva', 'provisional', 'preliminar'];

const txt = (v: unknown) => (v == null ? '' : String(v)).trim();
const fecha = (v: unknown): Date | null | undefined => {
  const s = txt(v);
  if (!s) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) ?? s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  const iso = m[0].includes('/') ? `${m[3]}-${m[2]}-${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** "Empresa A=12.5; Empresa B=7.2 USD/kg" → [{ empresa, tasa, rateUnit? }]. */
export function parsearExportadorTasas(raw: unknown, unidadDefault: string): { lista: ExportadorTasa[]; error: string | null } {
  const s = txt(raw);
  if (!s) return { lista: [], error: null };
  const lista: ExportadorTasa[] = [];
  for (const parte of s.split(/;|\n/).map(p => p.trim()).filter(Boolean)) {
    const m = parte.match(/^(.+?)\s*[=:]\s*([0-9]+(?:[.,][0-9]+)?)\s*(%|USD\/\S+)?$/i);
    if (!m) return { lista: [], error: `exportadorTasas: no se entiende "${parte}" (formato Empresa=tasa[ unidad]; …)` };
    lista.push({ empresa: m[1]!.trim(), tasa: Number(m[2]!.replace(',', '.')), ...(m[3] ? { rateUnit: m[3] } : { rateUnit: unidadDefault }) });
  }
  return { lista, error: null };
}

export interface FilaUPCIValidada {
  fila: number;
  ok: boolean;
  errores: string[];
  cotejo: 'cotejada' | 'pendiente';
  clave: string | null;
  data: {
    resolutionNumber: string; expedienteUPCI: string | null; resolutionType: string; fractionCode: string; countryOfOrigin: string; productDesc: string | null;
    rateType: string; rate: number; rateUnit: string; exportadorTasas: ExportadorTasa[] | null; specificProducer: string | null;
    publishDateDOF: Date | null; effectiveDate: Date | null; expiryDate: Date | null; examenSunsetFecha: Date | null;
    status: string; investigationType: string | null; esAntielusion: boolean; dofUrl: string | null; fuenteUrl: string | null; notes: string | null;
    /** Cotejo explícito: quién cotejó y cuándo. Solo con `cotejadoPor` se fija `cotejadoAt`. */
    cotejadoPor: string | null; fechaCotejo: Date | null;
  } | null;
}

export function validarFilaUPCI(f: Record<string, unknown>, fila: number): FilaUPCIValidada {
  const errores: string[] = [];
  const resolutionNumber = txt(f.resolutionNumber);
  const fractionCode = txt(f.fractionCode).replace(/[^0-9]/g, '');
  const paisRaw = txt(f.countryOfOrigin);
  const countryOfOrigin = paisRaw ? normalizeCountry(paisRaw) : '';
  const rateType = txt(f.rateType) || 'percentage';
  const rateS = txt(f.rate).replace('%', '').replace(',', '.');
  const rate = rateS ? Number(rateS) : NaN;
  const rateUnit = txt(f.rateUnit) || (rateType === 'percentage' ? '%' : rateType === 'specific_USD_kg' ? 'USD/kg' : 'USD/pieza');
  const status = txt(f.status) || 'vigente';
  const investigationType = txt(f.investigationType) || null;
  const resolutionType = txt(f.resolutionType) || 'definitiva';
  const fuenteUrl = txt(f.fuenteUrl) || null;
  const dofUrl = txt(f.dofUrl) || null;
  const cotejadoPor = txt(f.cotejadoPor) || null;
  const fechaCotejo = fecha(f.fechaCotejo);

  if (!resolutionNumber) errores.push('resolutionNumber es obligatorio (clave de dedupe)');
  if (fractionCode.length !== 8) errores.push('fractionCode debe tener 8 dígitos');
  if (!countryOfOrigin || !/^[A-Z]{2}$/.test(countryOfOrigin)) errores.push('countryOfOrigin debe ser ISO-2 (o nombre reconocido)');
  if (!RATE_TYPES.includes(rateType)) errores.push(`rateType inválido (${RATE_TYPES.join('/')})`);
  if (!Number.isFinite(rate) || rate < 0) errores.push('rate debe ser un número ≥ 0');
  if (rateType === 'percentage' && rate > 1000) errores.push('rate en % fuera de rango');
  if (!STATUSES.includes(status)) errores.push(`status inválido (${STATUSES.join('/')})`);
  if (investigationType && !INV_TYPES.includes(investigationType)) errores.push(`investigationType inválido (${INV_TYPES.join('/')})`);
  if (!RES_TYPES.includes(resolutionType)) errores.push(`resolutionType inválido (${RES_TYPES.join('/')})`);
  const fechas: Record<string, Date | null | undefined> = { publishDateDOF: fecha(f.publishDateDOF), effectiveDate: fecha(f.effectiveDate), expiryDate: fecha(f.expiryDate), examenSunsetFecha: fecha(f.examenSunsetFecha) };
  for (const [k, v] of Object.entries(fechas)) if (v === undefined) errores.push(`${k} inválida (AAAA-MM-DD)`);
  if (fechas.effectiveDate && fechas.expiryDate && fechas.effectiveDate.getTime() > fechas.expiryDate.getTime()) errores.push('expiryDate anterior a effectiveDate');
  if (fuenteUrl && !/^https?:\/\//i.test(fuenteUrl)) errores.push('fuenteUrl debe ser http(s)');
  if (dofUrl && !/^https?:\/\//i.test(dofUrl)) errores.push('dofUrl debe ser http(s)');
  const et = parsearExportadorTasas(f.exportadorTasas, rateUnit);
  if (et.error) errores.push(et.error);
  const esAntielusion = /^(1|true|s[ií]|x|yes)$/i.test(txt(f.esAntielusion)) || investigationType === 'elusion';
  if (fechaCotejo === undefined) errores.push('fechaCotejo inválida (AAAA-MM-DD)');
  if (fechaCotejo && !cotejadoPor) errores.push('fechaCotejo requiere cotejadoPor (quién cotejó)');
  if (cotejadoPor && !fuenteUrl) errores.push('cotejadoPor requiere fuenteUrl (contra qué se cotejó)');
  // Cotejada SOLO con atestación explícita (`cotejadoPor`); la URL sola es
  // fuente declarada, no revisión humana.
  const cotejo: 'cotejada' | 'pendiente' = cotejadoPor ? 'cotejada' : 'pendiente';
  if (errores.length > 0) return { fila, ok: false, errores, cotejo, clave: null, data: null };
  return {
    fila, ok: true, errores: [], cotejo, clave: `${fractionCode}|${countryOfOrigin}|${resolutionNumber.toUpperCase()}`,
    data: {
      resolutionNumber, expedienteUPCI: txt(f.expedienteUPCI) || null, resolutionType, fractionCode, countryOfOrigin, productDesc: txt(f.productDesc) || null,
      rateType, rate, rateUnit, exportadorTasas: et.lista.length > 0 ? et.lista : null, specificProducer: txt(f.specificProducer) || null,
      publishDateDOF: fechas.publishDateDOF ?? null, effectiveDate: fechas.effectiveDate ?? null, expiryDate: fechas.expiryDate ?? null, examenSunsetFecha: fechas.examenSunsetFecha ?? null,
      status, investigationType, esAntielusion, dofUrl, fuenteUrl, notes: txt(f.notes) || null,
      cotejadoPor, fechaCotejo: cotejadoPor ? (fechaCotejo ?? null) : null,
    },
  };
}

export function leerFilasUPCI(archivoBase64: string, nombreArchivo?: string): Record<string, unknown>[] {
  const esCsv = /\.csv$/i.test(nombreArchivo ?? '');
  const wb = esCsv
    ? XLSX.read(Buffer.from(archivoBase64, 'base64').toString('utf8'), { type: 'string' })
    : XLSX.read(archivoBase64, { type: 'base64', cellDates: true });
  const hoja = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!hoja) return [];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });
  const alias: Record<string, string> = {
    resolucion: 'resolutionNumber', 'numero de resolucion': 'resolutionNumber', resolutionnumber: 'resolutionNumber',
    expediente: 'expedienteUPCI', 'expediente upci': 'expedienteUPCI', expedienteupci: 'expedienteUPCI',
    'tipo de resolucion': 'resolutionType', resolutiontype: 'resolutionType',
    fraccion: 'fractionCode', 'fraccion arancelaria': 'fractionCode', fractioncode: 'fractionCode',
    pais: 'countryOfOrigin', 'pais de origen': 'countryOfOrigin', 'pais origen': 'countryOfOrigin', countryoforigin: 'countryOfOrigin',
    producto: 'productDesc', descripcion: 'productDesc', productdesc: 'productDesc',
    'tipo de cuota': 'rateType', ratetype: 'rateType', cuota: 'rate', tasa: 'rate', rate: 'rate', unidad: 'rateUnit', rateunit: 'rateUnit',
    'tasas por exportador': 'exportadorTasas', exportadortasas: 'exportadorTasas', exportadores: 'exportadorTasas',
    'productor especifico': 'specificProducer', specificproducer: 'specificProducer',
    'fecha dof': 'publishDateDOF', publishdatedof: 'publishDateDOF', 'vigente desde': 'effectiveDate', effectivedate: 'effectiveDate',
    'vigente hasta': 'expiryDate', expirydate: 'expiryDate', 'examen sunset': 'examenSunsetFecha', examensunsetfecha: 'examenSunsetFecha', sunset: 'examenSunsetFecha',
    estado: 'status', status: 'status', 'tipo de investigacion': 'investigationType', investigationtype: 'investigationType',
    antielusion: 'esAntielusion', esantielusion: 'esAntielusion', 'url dof': 'dofUrl', dofurl: 'dofUrl', fuente: 'fuenteUrl', fuenteurl: 'fuenteUrl', notas: 'notes', notes: 'notes',
    'cotejado por': 'cotejadoPor', cotejadopor: 'cotejadoPor', 'fecha cotejo': 'fechaCotejo', 'fecha de cotejo': 'fechaCotejo', fechacotejo: 'fechaCotejo',
  };
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return filas.map(f => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) out[alias[norm(k)] ?? k] = v;
    return out;
  });
}

export function plantillaUPCIXlsx(): Buffer {
  const ejemplo = {
    resolutionNumber: 'EJEMPLO-BORRAR', expedienteUPCI: 'UPCI-AD-00-0000', resolutionType: 'definitiva', fractionCode: '7318.15.99', countryOfOrigin: 'CN',
    productDesc: 'Ejemplo — borra esta fila antes de importar', rateType: 'specific_USD_kg', rate: 2.07, rateUnit: 'USD/kg',
    exportadorTasas: 'Empresa A Co Ltd=1.25; Empresa B=0.90', specificProducer: '', publishDateDOF: '2024-03-15', effectiveDate: '2024-03-16', expiryDate: '2029-03-15', examenSunsetFecha: '2028-09-15',
    status: 'vigente', investigationType: 'nueva', esAntielusion: '', dofUrl: 'https://www.dof.gob.mx/nota_detalle.php?codigo=…', fuenteUrl: 'https://www.dof.gob.mx/nota_detalle.php?codigo=…', cotejadoPor: '', fechaCotejo: '', notes: '',
  };
  const ws = XLSX.utils.json_to_sheet([ejemplo], { header: [...COLUMNAS_UPCI] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'cuotas');
  const doc = XLSX.utils.aoa_to_sheet([
    ['Columna', 'Obligatoria', 'Valores'],
    ['resolutionNumber', 'sí', 'Número de la resolución (clave de dedupe junto con fracción y país)'],
    ['fractionCode', 'sí', '8 dígitos, con o sin puntos'],
    ['countryOfOrigin', 'sí', 'ISO-2 (CN, VN, US…) o nombre'],
    ['rateType', 'sí', 'percentage | specific_USD_kg | specific_USD_unit'],
    ['rate / rateUnit', 'sí', 'número; unidad % | USD/kg | USD/pieza | USD/par'],
    ['exportadorTasas', 'no', '"Empresa=tasa; Empresa=tasa" (unidad opcional por empresa)'],
    ['publishDateDOF / effectiveDate / expiryDate / examenSunsetFecha', 'no', 'AAAA-MM-DD'],
    ['status', 'no', 'vigente (default) | suspendida | revocada | en_revision'],
    ['investigationType', 'no', 'elusion | examen_vigencia | revision | nueva'],
    ['esAntielusion', 'no', '1/sí cuando la resolución extiende una cuota a un tercer país'],
    ['fuenteUrl', 'no', 'URL http(s) del DOF/SE. Una URL sola = fuente declarada, la resolución sigue "pendiente de cotejo".'],
    ['cotejadoPor', 'no, pero decide el cotejo', 'Nombre/usuario de quien cotejó la fila contra el DOF. Requiere fuenteUrl. CON cotejadoPor → cotejadoAt = fechaCotejo (o hoy). SIN él → "pendiente de cotejo".'],
    ['fechaCotejo', 'no', 'AAAA-MM-DD de la revisión (default: hoy). Requiere cotejadoPor.'],
  ]);
  XLSX.utils.book_append_sheet(wb, doc, 'instrucciones');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export interface ReporteImportUPCI {
  total: number; validas: number; invalidas: number; creadas: number; actualizadas: number; duplicadasEnArchivo: number;
  cotejadas: number; pendientesCotejo: number; dryRun: boolean;
  filas: { fila: number; clave: string | null; ok: boolean; errores: string[]; cotejo: 'cotejada' | 'pendiente'; accion: 'creada' | 'actualizada' | 'rechazada' | 'validada' }[];
}

export async function importarUPCI(d: { archivoBase64: string; nombreArchivo?: string; dryRun?: boolean }, ahora = new Date()): Promise<ReporteImportUPCI> {
  if (!d.archivoBase64) throw new Error('archivoBase64 es obligatorio');
  const filas = leerFilasUPCI(d.archivoBase64, d.nombreArchivo);
  const rep: ReporteImportUPCI = { total: filas.length, validas: 0, invalidas: 0, creadas: 0, actualizadas: 0, duplicadasEnArchivo: 0, cotejadas: 0, pendientesCotejo: 0, dryRun: !!d.dryRun, filas: [] };
  const vistos = new Set<string>();
  for (let i = 0; i < filas.length; i++) {
    const v = validarFilaUPCI(filas[i]!, i + 2);
    if (v.ok && v.clave && vistos.has(v.clave)) { v.ok = false; v.errores.push(`duplicada en el archivo (${v.clave})`); rep.duplicadasEnArchivo++; }
    if (v.clave) vistos.add(v.clave);
    if (!v.ok || !v.data) {
      rep.invalidas++;
      rep.filas.push({ fila: v.fila, clave: v.clave, ok: false, errores: v.errores, cotejo: v.cotejo, accion: 'rechazada' });
      continue;
    }
    rep.validas++;
    if (v.cotejo === 'cotejada') rep.cotejadas++; else rep.pendientesCotejo++;
    if (d.dryRun) { rep.filas.push({ fila: v.fila, clave: v.clave, ok: true, errores: [], cotejo: v.cotejo, accion: 'validada' }); continue; }
    const { cotejadoPor, fechaCotejo, ...columnas } = v.data;
    // cotejadoAt SOLO con atestación explícita; la fuenteUrl se guarda como
    // fuente declarada sin marcar cotejo. Quién cotejó queda en notes.
    const data = {
      ...columnas,
      exportadorTasas: v.data.exportadorTasas as unknown as object | null ?? undefined,
      cotejadoAt: cotejadoPor ? (fechaCotejo ?? ahora) : null,
      notes: cotejadoPor ? [columnas.notes, `cotejadoPor: ${cotejadoPor}`].filter(Boolean).join(' | ') : columnas.notes,
      active: true,
    };
    const existente = await prisma.antidumpingDuty.findFirst({
      where: { fractionCode: v.data.fractionCode, countryOfOrigin: v.data.countryOfOrigin, resolutionNumber: { equals: v.data.resolutionNumber, mode: 'insensitive' } },
      select: { id: true, cotejadoAt: true },
    });
    if (existente) {
      // Sin fuente en la fila NO se borra un cotejo previo.
      await prisma.antidumpingDuty.update({ where: { id: existente.id }, data: { ...data, cotejadoAt: data.cotejadoAt ?? existente.cotejadoAt } });
      rep.actualizadas++;
      rep.filas.push({ fila: v.fila, clave: v.clave, ok: true, errores: [], cotejo: v.cotejo, accion: 'actualizada' });
    } else {
      await prisma.antidumpingDuty.create({ data });
      rep.creadas++;
      rep.filas.push({ fila: v.fila, clave: v.clave, ok: true, errores: [], cotejo: v.cotejo, accion: 'creada' });
    }
  }
  return rep;
}
