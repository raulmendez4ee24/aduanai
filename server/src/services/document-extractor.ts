/**
 * Document extractor — clasifica tipo de documento aduanal y extrae
 * campos estructurados con Claude (soporta PDF nativo + visión).
 *
 * Cache por hash SHA-256 del contenido — mismo archivo no se reprocesa.
 */

import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { sinGuardaDeTenant } from '../lib/tenant-guard';
import { getAnthropicClient } from '../lib/anthropic';

export type DocType =
  | 'factura'
  | 'pedimento'
  | 'bl'
  | 'awb'
  | 'packing_list'
  | 'certificado_origen'
  | 'cove'
  | 'mve'
  | 'carta_porte'
  | 'nom'
  | 'otro';

export interface ExtractedFactura {
  numeroFactura?: string;
  fechaFactura?: string;
  vendedor?: { nombre?: string; pais?: string; direccion?: string };
  comprador?: { nombre?: string; rfc?: string };
  items?: { descripcion: string; cantidad: number; precioUnitario: number; total: number; unidad?: string }[];
  incoterm?: string;
  moneda?: string;
  totalFactura?: number;
}

export interface ExtractedPedimento {
  numeroPedimento?: string;
  fechaPedimento?: string;
  aduana?: string;
  patenteAduanal?: string;
  clave?: string;
  regimen?: string;
  rfcImportador?: string;
  fracciones?: { fraccion: string; cantidad?: number; valorAduana?: number; descripcion?: string }[];
  totalGeneral?: number;
  pesoBruto?: number;
  pesoNeto?: number;
  bultos?: number;
}

export interface ExtractedBL {
  numeroEmbarque?: string;
  shipper?: string;
  consignee?: string;
  puertoOrigen?: string;
  puertoDestino?: string;
  fechaEmbarque?: string;
  descripcionMercancia?: string;
  pesoBruto?: number;
  bultos?: number;
}

export interface ExtractionResult {
  docType: DocType;
  confidence: number;       // 0-100
  fields: ExtractedFactura | ExtractedPedimento | ExtractedBL | Record<string, unknown>;
  rawText: string;          // primer ~3000 chars para debug
  errors: string[];
}

const SYSTEM_PROMPT = `Eres un experto en clasificación y extracción de datos de documentos aduanales mexicanos. Recibes un documento (PDF o imagen) y devuelves SIEMPRE un objeto JSON con esta estructura exacta, sin texto adicional:

{
  "docType": "factura" | "pedimento" | "bl" | "awb" | "packing_list" | "certificado_origen" | "cove" | "mve" | "carta_porte" | "nom" | "otro",
  "confidence": <número 0-100>,
  "fields": { ...campos extraídos según el tipo... },
  "rawText": "<primeros ~2000 chars del documento>",
  "errors": [ "..." ]
}

Schemas por tipo:

factura:
  numeroFactura, fechaFactura (ISO YYYY-MM-DD), vendedor: {nombre, pais, direccion},
  comprador: {nombre, rfc}, items: [{descripcion, cantidad, precioUnitario, total, unidad}],
  incoterm, moneda, totalFactura

pedimento:
  numeroPedimento, fechaPedimento, aduana, patenteAduanal, clave, regimen,
  rfcImportador, fracciones: [{fraccion (8 dígitos), cantidad, valorAduana, descripcion}],
  totalGeneral, pesoBruto, pesoNeto, bultos

bl / awb:
  numeroEmbarque, shipper, consignee, puertoOrigen, puertoDestino, fechaEmbarque,
  descripcionMercancia, pesoBruto, bultos

Para otros tipos, extrae los campos clave que detectes. Si NO puedes determinar el tipo o un campo, omite el campo. NUNCA inventes valores.`;

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function isPDF(mimeType: string): boolean {
  return mimeType === 'application/pdf' || mimeType === 'application/x-pdf';
}

/**
 * Llama a Claude para clasificar + extraer datos del documento.
 * Soporta PDF (document block nativo) e imágenes (image block).
 * Para XML/text: convierte a string y manda como texto.
 */
export async function extractDocument(input: {
  fileName: string;
  mimeType: string;
  base64: string;
}): Promise<ExtractionResult> {
  const client = getAnthropicClient();

  // Construir content block según tipo
  type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } };
  const contentBlocks: ContentBlock[] = [];

  if (isPDF(input.mimeType)) {
    contentBlocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: input.base64 },
    });
    contentBlocks.push({ type: 'text', text: `Archivo: ${input.fileName}. Clasifica este documento aduanal y extrae los campos según el schema indicado.` });
  } else if (isImage(input.mimeType)) {
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: input.mimeType, data: input.base64 },
    });
    contentBlocks.push({ type: 'text', text: `Archivo: ${input.fileName}. Clasifica este documento aduanal y extrae los campos.` });
  } else {
    // XML/texto/otro — decodificar y enviar como texto
    let text: string;
    try {
      text = Buffer.from(input.base64, 'base64').toString('utf8').slice(0, 60000);
    } catch {
      text = '[no se pudo decodificar como texto]';
    }
    contentBlocks.push({ type: 'text', text: `Archivo: ${input.fileName} (${input.mimeType}). Contenido:\n\n${text}\n\nClasifica y extrae los campos.` });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contentBlocks as never }],
    });
    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as ExtractionResult;
    return {
      docType: parsed.docType ?? 'otro',
      confidence: parsed.confidence ?? 0,
      fields: parsed.fields ?? {},
      rawText: parsed.rawText?.slice(0, 3000) ?? '',
      errors: parsed.errors ?? [],
    };
  } catch (err) {
    return {
      docType: 'otro',
      confidence: 0,
      fields: {},
      rawText: '',
      errors: [err instanceof Error ? err.message : 'Error de extracción'],
    };
  }
}

/**
 * Procesa un upload: cache por fileHash, extrae + clasifica + persiste Document.
 * Si ya existe un Document con el mismo hash en este tenant, retorna el cacheado.
 */
export async function processUpload(input: {
  tenantId: string;
  fileName: string;
  mimeType: string;
  base64: string;
}): Promise<{ document: { id: string; docType: string | null; confidence: number | null; extractedData: unknown; fileHash: string }; cached: boolean }> {
  const buf = Buffer.from(input.base64, 'base64');
  const fileHash = sha256(buf);

  // Cache: mismo tenant + mismo hash → reusar
  const existing = await prisma.document.findFirst({
    where: { tenantId: input.tenantId, fileHash, processedAt: { not: null } },
  });
  if (existing) {
    return {
      document: {
        id: existing.id,
        docType: existing.docType,
        confidence: existing.confidence,
        extractedData: existing.extractedData,
        fileHash,
      },
      cached: true,
    };
  }

  // Extraer con IA
  const result = await extractDocument({
    fileName: input.fileName,
    mimeType: input.mimeType,
    base64: input.base64,
  });

  const created = await prisma.document.create({
    data: {
      tenantId: input.tenantId,
      name: input.fileName,
      type: result.docType,
      docType: result.docType,
      confidence: result.confidence,
      extractedData: result.fields as object,
      rawText: result.rawText,
      aiErrors: result.errors.length > 0 ? (result.errors as object) : undefined,
      fileName: input.fileName,
      fileSize: buf.length,
      mimeType: input.mimeType,
      fileHash,
      status: result.errors.length > 0 ? 'REJECTED' : 'UPLOADED',
      processedAt: new Date(),
      // operationId queda null por ahora — auto-link lo intentará
    },
  });

  return {
    document: {
      id: created.id,
      docType: created.docType,
      confidence: created.confidence,
      extractedData: created.extractedData,
      fileHash,
    },
    cached: false,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Auto-link: vincular documentos a operaciones por número de pedimento/factura
// ──────────────────────────────────────────────────────────────────────────

interface ExtractedRefs {
  pedimento?: string;
  factura?: string;
  bl?: string;
}

function extractRefs(doc: { docType: string | null; extractedData: unknown }): ExtractedRefs {
  const fields = (doc.extractedData ?? {}) as Record<string, unknown>;
  const out: ExtractedRefs = {};
  if (doc.docType === 'pedimento') {
    if (typeof fields.numeroPedimento === 'string') out.pedimento = fields.numeroPedimento;
  } else if (doc.docType === 'factura') {
    if (typeof fields.numeroFactura === 'string') out.factura = fields.numeroFactura;
  } else if (doc.docType === 'bl' || doc.docType === 'awb') {
    if (typeof fields.numeroEmbarque === 'string') out.bl = fields.numeroEmbarque;
  } else {
    if (typeof fields.numeroPedimento === 'string') out.pedimento = fields.numeroPedimento;
    if (typeof fields.numeroFactura === 'string') out.factura = fields.numeroFactura;
  }
  return out;
}

/**
 * Intenta vincular un documento a una Operation existente buscando por
 * número de pedimento (Operation.reference) o factura.
 */
export async function autoLinkToOperation(documentId: string): Promise<{ linked: boolean; operationId?: string; reason?: string }> {
  // Servicio interno (post-upload): el id viene del create del propio tenant → cruce deliberado.
  const doc = await sinGuardaDeTenant(() => prisma.document.findUnique({ where: { id: documentId } }));
  if (!doc || !doc.tenantId) return { linked: false, reason: 'documento no encontrado o sin tenant' };
  if (doc.operationId) return { linked: true, operationId: doc.operationId, reason: 'ya vinculado' };

  const refs = extractRefs(doc);
  const candidates: string[] = [refs.pedimento, refs.factura, refs.bl].filter(Boolean) as string[];
  if (candidates.length === 0) return { linked: false, reason: 'sin referencias extraídas' };

  // Buscar Operation por reference que contenga alguna ref
  const op = await prisma.operation.findFirst({
    where: {
      tenantId: doc.tenantId,
      OR: candidates.map(c => ({ reference: { contains: c, mode: 'insensitive' as const } })),
    },
  });

  if (!op) return { linked: false, reason: 'sin Operation match' };

  await prisma.document.update({
    where: { id: doc.id },
    data: { operationId: op.id },
  });
  return { linked: true, operationId: op.id };
}

/**
 * Sugerencia de agrupación: encuentra grupos de documentos con refs en común.
 * Devuelve clusters de documentos que probablemente son de la misma operación.
 */
export async function suggestGroups(tenantId: string): Promise<{ groups: { ref: string; documentIds: string[] }[] }> {
  const docs = await prisma.document.findMany({
    where: { tenantId, operationId: null, processedAt: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const refIndex = new Map<string, string[]>();
  for (const d of docs) {
    const refs = extractRefs(d);
    const allRefs = [refs.pedimento, refs.factura, refs.bl].filter(Boolean) as string[];
    for (const ref of allRefs) {
      const norm = ref.replace(/\s+/g, '').toUpperCase();
      if (!refIndex.has(norm)) refIndex.set(norm, []);
      refIndex.get(norm)!.push(d.id);
    }
  }

  const groups: { ref: string; documentIds: string[] }[] = [];
  for (const [ref, ids] of refIndex.entries()) {
    if (ids.length >= 2) groups.push({ ref, documentIds: Array.from(new Set(ids)) });
  }
  return { groups };
}
