/**
 * Expediente electrónico por operación (Ola 2, 27-ago-2026):
 *  - checklist de incisos a)–h) del Art. 59 fr. V LA + piezas del 162 fr. VII
 *    mapeadas a tipos de documento (slots de `getRequiredDocuments` y tipos
 *    detectados por la extracción IA);
 *  - retención 5 años (Art. 30 CFF / Art. 146 LA — cotejo PENDIENTE en el
 *    corpus: se etiqueta, no se afirma);
 *  - paquete de auditoría ZIP (documentos + glosa + checklist + certificado).
 *
 * Los fundamentos del 59-V y 162-VII se reutilizan del Risk Scorer
 * (shield.ts, cotejo 2026-07-04 contra la LA consolidada DOF 19-11-2025).
 * Lo que NO está cotejado lleva `cotejo: 'pendiente'` y así se pinta.
 */
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { crearZip, type EntradaZip } from '../lib/zip';
import { verifyChain } from './audit-service';
import { getRequiredDocuments, calculateCompleteness } from './expediente';
import type { ResultadoGlosaDocumental } from './glosa-documental';

export type Cotejo = 'corpus' | 'pendiente';

export interface FundamentoExpediente {
  articulo: string;
  citaCorta: string;
  fuente: string;
  url: string;
  fechaCotejo: string | null;
  cotejo: Cotejo;
}

const LA_COTEJADA = {
  fuente: 'Ley Aduanera consolidada (Última Reforma DOF 19-11-2025)',
  url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAdua.pdf',
  fechaCotejo: '2026-07-04',
  cotejo: 'corpus' as const,
};

export interface IncisoDef {
  id: string;            // '59V-a' … '59V-h', '162VII-pedimento' …
  inciso: string;        // 'a)' … 'h)' | '162-VII'
  descripcion: string;
  /** Tipos de Document (slot o docType IA) que respaldan el inciso. */
  documentosEsperados: string[];
  /** true = si no hay documento se marca 'no_aplica_declarado' en vez de pendiente cuando el usuario lo indique. */
  condicional?: boolean;
  fundamento: FundamentoExpediente;
}

const F59 = (inciso: string, cita: string): FundamentoExpediente => ({
  articulo: `LA 59-V inciso ${inciso} (adicionado DOF 19-11-2025)`, citaCorta: cita, ...LA_COTEJADA,
});

export const INCISOS_59V: IncisoDef[] = [
  { id: '59V-a', inciso: 'a)', descripcion: 'Garantía en cuenta aduanera (Art. 36-A-I-e) si el valor declarado es inferior al precio estimado', documentosEsperados: ['garantia_cuenta_aduanera', 'cuadro_liquidacion'], condicional: true, fundamento: F59('a)', 'Información y documentación que acredite los recursos empleados para efectuar la operación de comercio exterior.') },
  { id: '59V-b', inciso: 'b)', descripcion: 'Comprobantes fiscales digitales por Internet (CFDI)', documentosEsperados: ['cfdi', 'carta_porte'], fundamento: F59('b)', 'CFDI de la operación.') },
  { id: '59V-c', inciso: 'c)', descripcion: 'Facturas comerciales o documentos equivalentes', documentosEsperados: ['factura_comercial', 'factura', 'cove'], fundamento: F59('c)', 'Facturas comerciales o documentos equivalentes.') },
  { id: '59V-d', inciso: 'd)', descripcion: 'Transferencias electrónicas del pago o cartas de crédito', documentosEsperados: ['comprobante_pago', 'carta_credito'], fundamento: F59('d)', 'Transferencias de pago / cartas de crédito.') },
  { id: '59V-e', inciso: 'e)', descripcion: 'Gastos de transporte, seguros y servicios conexos', documentosEsperados: ['conocimiento_embarque', 'bl', 'awb', 'documento_transporte', 'factura_flete', 'poliza_seguro'], fundamento: F59('e)', 'Transporte, seguros y conexos.') },
  { id: '59V-f', inciso: 'f)', descripcion: 'Contratos y órdenes de compra de la transacción (RLA 81-VII)', documentosEsperados: ['contrato', 'orden_compra', 'po'], fundamento: F59('f)', 'Contratos y órdenes de compra.') },
  { id: '59V-g', inciso: 'g)', descripcion: 'Soporte de incrementables/decrementables (Arts. 65-66 LA)', documentosEsperados: ['soporte_incrementables', 'manifestacion_valor', 'mve', 'hoja_calculo'], fundamento: F59('g)', 'Soporte de incrementables (65-66).') },
  { id: '59V-h', inciso: 'h)', descripcion: 'Otros que demuestren la operación — notas de crédito / descuentos (RLA 81-X)', documentosEsperados: ['nota_credito', 'otro'], condicional: true, fundamento: F59('h)', 'Otros: notas de crédito / descuentos.') },
];

export const PIEZAS_162VII: IncisoDef[] = [
  { id: '162VII-pedimento', inciso: '162-VII', descripcion: 'Pedimento con anexos y acuses (archivo electrónico del despacho)', documentosEsperados: ['pedimento', 'pedimento_transito'], fundamento: { articulo: 'LA 162-VII', citaCorta: 'Conservar el original de la manifestación de valor y copia del documento que compruebe el encargo conferido, junto con el pedimento y sus anexos.', ...LA_COTEJADA } },
  { id: '162VII-mve', inciso: '162-VII', descripcion: 'Manifestación de valor original (transmitida)', documentosEsperados: ['manifestacion_valor', 'mve'], fundamento: { articulo: 'LA 162-VII', citaCorta: '…deberá conservar el original de la manifestación de valor…', ...LA_COTEJADA } },
  { id: '162VII-encargo', inciso: '162-VII', descripcion: 'Encargo conferido al agente aduanal (copia)', documentosEsperados: ['encargo_conferido'], fundamento: { articulo: 'LA 162-VII · LA 59-III párr. 2', citaCorta: '…copia del documento que compruebe el encargo que se le hubiere conferido…', ...LA_COTEJADA } },
  { id: '162VII-padron', inciso: '162-VII', descripcion: 'Constancia del padrón de importadores / sectorial', documentosEsperados: ['padron_importadores'], fundamento: { articulo: 'LA 59-IV', citaCorta: 'Inscripción en el Padrón de Importadores y, en su caso, sectorial.', fuente: LA_COTEJADA.fuente, url: LA_COTEJADA.url, fechaCotejo: null, cotejo: 'pendiente' } },
  { id: '162VII-rrna', inciso: '162-VII', descripcion: 'NOMs / permisos previos / certificado de origen (si aplican)', documentosEsperados: ['nom_certificado', 'nom', 'permiso_previo', 'certificado_origen'], condicional: true, fundamento: { articulo: 'LA 36-A', citaCorta: 'Documentos que comprueben el cumplimiento de RRNA y, en su caso, origen.', fuente: LA_COTEJADA.fuente, url: LA_COTEJADA.url, fechaCotejo: null, cotejo: 'pendiente' } },
];

export type EstadoInciso = 'completo' | 'pendiente' | 'no_aplica';

export interface IncisoChecklist {
  id: string;
  inciso: string;
  descripcion: string;
  estado: EstadoInciso;
  documentos: { id: string; name: string; type: string; status: string }[];
  documentosEsperados: string[];
  condicional: boolean;
  fundamento: FundamentoExpediente;
  cotejo: Cotejo;
}

export interface ChecklistExpediente {
  version: 1;
  generadoAt: string;
  incisos59V: IncisoChecklist[];
  piezas162VII: IncisoChecklist[];
  completitud59V: number;      // % incisos aplicables completos
  completitud162VII: number;
  completitudDocumentos: number; // slot-based (calculateCompleteness)
  semaforo: 'verde' | 'ambar' | 'rojo';
  noAplica: string[];           // ids marcados no_aplica por el usuario
}

export interface DocLite { id: string; name: string; type: string; docType?: string | null; status: string }

const cuenta = (d: DocLite) => d.status === 'UPLOADED' || d.status === 'VERIFIED';

function evaluarInciso(def: IncisoDef, docs: DocLite[], noAplica: Set<string>): IncisoChecklist {
  const documentos = docs.filter(d => cuenta(d) && (def.documentosEsperados.includes(d.type) || (d.docType ? def.documentosEsperados.includes(d.docType) : false)))
    .map(d => ({ id: d.id, name: d.name, type: d.docType ?? d.type, status: d.status }));
  const estado: EstadoInciso = documentos.length > 0 ? 'completo' : noAplica.has(def.id) ? 'no_aplica' : 'pendiente';
  return {
    id: def.id, inciso: def.inciso, descripcion: def.descripcion, estado, documentos,
    documentosEsperados: def.documentosEsperados, condicional: def.condicional ?? false,
    fundamento: def.fundamento, cotejo: def.fundamento.cotejo,
  };
}

function pct(items: IncisoChecklist[]): number {
  const aplicables = items.filter(i => i.estado !== 'no_aplica');
  if (aplicables.length === 0) return 100;
  return Math.round((aplicables.filter(i => i.estado === 'completo').length / aplicables.length) * 100);
}

/** Función PURA: checklist a partir de los documentos de la operación. */
export function construirChecklist(operationType: string, docs: DocLite[], noAplica: string[] = [], ahora: Date = new Date()): ChecklistExpediente {
  const na = new Set(noAplica);
  const incisos59V = INCISOS_59V.map(d => evaluarInciso(d, docs, na));
  const piezas162VII = PIEZAS_162VII.map(d => evaluarInciso(d, docs, na));
  const completitud59V = pct(incisos59V);
  const completitud162VII = pct(piezas162VII);
  const completitudDocumentos = calculateCompleteness(getRequiredDocuments(operationType), docs.map(d => ({ type: d.type, status: d.status })));
  const minimo = Math.min(completitud59V, completitud162VII, completitudDocumentos);
  return {
    version: 1, generadoAt: ahora.toISOString(), incisos59V, piezas162VII,
    completitud59V, completitud162VII, completitudDocumentos,
    semaforo: minimo >= 100 ? 'verde' : minimo >= 60 ? 'ambar' : 'rojo',
    noAplica: [...na],
  };
}

// ── Retención 5 años ─────────────────────────────────────────────────────

export const RETENCION_ANIOS = 5;
export const FUNDAMENTO_RETENCION: FundamentoExpediente = {
  articulo: 'Art. 30 CFF · Art. 146 LA',
  citaCorta: 'Conservación de la contabilidad y documentación de comercio exterior durante 5 años (plazo general de caducidad de facultades de comprobación).',
  fuente: 'Código Fiscal de la Federación / Ley Aduanera',
  url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf',
  fechaCotejo: null,
  // Cotejo 27-ago-2026: el Art. 146 LA SÍ está verbatim en
  // prisma/seed/corpus-integro/lote1-ley-aduanera.json, pero regula el amparo
  // de la tenencia/transporte de mercancía extranjera (documentación que la
  // acredita), NO fija el plazo de conservación de 5 años. Ese plazo sale del
  // Art. 30 CFF, que NO está en el corpus → sigue `pendiente`.
  cotejo: 'pendiente',
};

export function calcularRetencionHasta(fechaOperacion: Date): Date {
  const d = new Date(fechaOperacion.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + RETENCION_ANIOS);
  return d;
}

// ── Paquete de auditoría ZIP ─────────────────────────────────────────────

function sha256(b: Buffer): string { return crypto.createHash('sha256').update(b).digest('hex'); }
function nombreSeguro(s: string): string { return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80); }

function bytesDeDocumento(d: { fileUrl: string | null; rawText: string | null; extractedData: unknown; name: string; mimeType: string | null }): { contenido: Buffer; extension: string; origen: 'archivo' | 'extraccion' } {
  const m = d.fileUrl?.match(/^data:([^;]+);base64,(.+)$/s);
  if (m) {
    const mime = m[1]!;
    const ext = mime === 'application/pdf' ? 'pdf' : mime === 'text/html' ? 'html' : mime.startsWith('image/') ? mime.split('/')[1]! : mime === 'application/xml' || mime === 'text/xml' ? 'xml' : 'bin';
    return { contenido: Buffer.from(m[2]!, 'base64'), extension: ext, origen: 'archivo' };
  }
  // Sin archivo almacenado: se empaqueta la extracción (datos + texto), nunca se inventa el binario.
  return { contenido: Buffer.from(JSON.stringify({ nombre: d.name, mimeType: d.mimeType, extractedData: d.extractedData ?? null, rawText: d.rawText ?? null, nota: 'Archivo original no almacenado en ADUANAI; se incluye la extracción.' }, null, 2)), extension: 'extraccion.json', origen: 'extraccion' };
}

export interface CertificadoIntegridad {
  version: 1;
  generadoAt: string;
  operacion: { id: string; reference: string; type: string; status: string; clienteId: string | null; retencionHasta: string | null };
  entradas: { nombre: string; sha256: string; bytes: number; origen?: string }[];
  hashPaquete: string;   // sha256 de la concatenación ordenada de los hashes
  cadenaAuditoria: { valida: boolean; revisadas: number; rotaEn?: string };
  dictamenesRiesgo: { folio: string | null; assessmentId: string }[];
  nota: string;
}

/** Presupuesto del paquete (Parte B): sin tope, N documentos base64 de hasta
 *  50 MB (index.ts body limit) se decodificaban y concatenaban en memoria. */
export const ZIP_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const ZIP_MAX_ARCHIVO_BYTES = 50 * 1024 * 1024;
export const ZIP_MAX_ENTRADAS = 500;

export class PaqueteDemasiadoGrandeError extends Error {
  readonly status = 413;
  constructor(mensaje: string) { super(mensaje); this.name = 'PaqueteDemasiadoGrandeError'; }
}

/** Bytes que ocupará un documento sin decodificarlo (base64 → 3/4). */
function bytesEstimados(d: { fileUrl: string | null; rawText: string | null }): number {
  const m = d.fileUrl?.match(/^data:[^;]+;base64,/);
  if (m) return Math.floor((d.fileUrl!.length - m[0].length) * 3 / 4);
  return (d.rawText?.length ?? 0) + 512;
}

export async function construirPaqueteAuditoria(
  tenantId: string, operationId: string, ahora: Date = new Date(),
  limites: { maxTotalBytes?: number; maxArchivoBytes?: number; maxEntradas?: number } = {},
): Promise<{ zip: Buffer; certificado: CertificadoIntegridad; nombreArchivo: string }> {
  const maxTotal = limites.maxTotalBytes ?? ZIP_MAX_TOTAL_BYTES;
  const maxArchivo = limites.maxArchivoBytes ?? ZIP_MAX_ARCHIVO_BYTES;
  const maxEntradas = limites.maxEntradas ?? ZIP_MAX_ENTRADAS;
  const op = await prisma.operation.findFirst({
    where: { id: operationId, tenantId },
    select: {
      id: true, reference: true, type: true, status: true, fractionCode: true, origin: true, customsValue: true, currency: true,
      operationDate: true, retencionHasta: true, clienteId: true, pedimentoId: true, checklist: true, glosaDocumental: true,
      // Solo las columnas que entran al paquete (nada de embeddings/extras).
      documents: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, fileName: true, type: true, docType: true, status: true, fileHash: true, verifiedAt: true, mimeType: true, fileUrl: true, rawText: true, extractedData: true },
      },
    },
  });
  if (!op) throw new Error('Operación no encontrada');
  const docsConContenido = op.documents.filter(d => d.status === 'UPLOADED' || d.status === 'VERIFIED');
  if (docsConContenido.length > maxEntradas) {
    throw new PaqueteDemasiadoGrandeError(`El paquete tendría ${docsConContenido.length} documentos (máximo ${maxEntradas}); descarga los documentos por separado.`);
  }
  let totalEstimado = 0;
  for (const d of docsConContenido) {
    const b = bytesEstimados(d);
    if (b > maxArchivo) throw new PaqueteDemasiadoGrandeError(`El documento "${d.name}" pesa ~${(b / 1048576).toFixed(1)} MB (máximo ${maxArchivo / 1048576} MB por archivo); descárgalo por separado.`);
    totalEstimado += b;
    if (totalEstimado > maxTotal) throw new PaqueteDemasiadoGrandeError(`El paquete superaría ${maxTotal / 1048576} MB; descarga los documentos por separado.`);
  }
  const checklist = (op.checklist as ChecklistExpediente | null) ?? construirChecklist(op.type, op.documents.map(d => ({ id: d.id, name: d.name, type: d.type, docType: d.docType, status: d.status })), [], ahora);
  const glosa = (op.glosaDocumental as ResultadoGlosaDocumental | null) ?? null;
  const dictamenes = await prisma.riskAssessment.findMany({ where: { tenantId, operationId }, select: { id: true, folio: true }, orderBy: { createdAt: 'asc' } });
  const cadena = await verifyChain(tenantId);

  const entradas: EntradaZip[] = [];
  const usados = new Set<string>();
  const lista: CertificadoIntegridad['entradas'] = [];
  const agregar = (nombre: string, contenido: Buffer | string, origen?: string) => {
    let n = nombre; let k = 2;
    while (usados.has(n)) { n = nombre.replace(/(\.[^.]+)?$/, `-${k++}$1`); }
    usados.add(n);
    const buf = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
    entradas.push({ nombre: n, contenido: buf, fecha: ahora });
    lista.push({ nombre: n, sha256: sha256(buf), bytes: buf.length, ...(origen ? { origen } : {}) });
  };
  for (const d of docsConContenido) {
    const { contenido, extension, origen } = bytesDeDocumento(d);
    agregar(`documentos/${nombreSeguro(d.docType ?? d.type)}-${nombreSeguro(d.fileName ?? d.name).replace(/\.[^.]+$/, '')}.${extension}`, contenido, origen);
  }
  agregar('checklist-59V-162VII.json', JSON.stringify(checklist, null, 2));
  agregar('glosa-documental.json', JSON.stringify(glosa ?? { nota: 'Glosa documental no ejecutada para esta operación.' }, null, 2));
  agregar('operacion.json', JSON.stringify({
    id: op.id, reference: op.reference, type: op.type, status: op.status, fractionCode: op.fractionCode, origin: op.origin, customsValue: op.customsValue, currency: op.currency,
    operationDate: op.operationDate, retencionHasta: op.retencionHasta, retencionFundamento: FUNDAMENTO_RETENCION, clienteId: op.clienteId, pedimentoId: op.pedimentoId,
    documentos: op.documents.map(d => ({ id: d.id, name: d.name, type: d.type, docType: d.docType, status: d.status, fileHash: d.fileHash, verifiedAt: d.verifiedAt })),
  }, null, 2));

  const hashPaquete = sha256(Buffer.from(lista.map(e => e.sha256).sort().join('\n')));
  const certificado: CertificadoIntegridad = {
    version: 1, generadoAt: ahora.toISOString(),
    operacion: { id: op.id, reference: op.reference, type: op.type, status: op.status, clienteId: op.clienteId, retencionHasta: op.retencionHasta?.toISOString() ?? null },
    entradas: lista, hashPaquete,
    cadenaAuditoria: { valida: cadena.valid, revisadas: cadena.checkedCount, ...(cadena.brokenAt ? { rotaEn: cadena.brokenAt } : {}) },
    dictamenesRiesgo: dictamenes.map(d => ({ folio: d.folio, assessmentId: d.id })),
    nota: 'Certificado generado por ADUANAI: cada entrada lleva su SHA-256; hashPaquete = SHA-256 de los hashes ordenados. La cadena de auditoría es la del audit trail del tenant al momento de generar el paquete. No sustituye un sello NOM-151.',
  };
  agregar('certificado-integridad.json', JSON.stringify(certificado, null, 2));
  return { zip: crearZip(entradas, ahora), certificado, nombreArchivo: `paquete-auditoria-${nombreSeguro(op.reference)}.zip` };
}
