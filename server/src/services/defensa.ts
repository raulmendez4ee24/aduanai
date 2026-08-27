/**
 * Paquete de DEFENSA (Ola 3 — Cumplimiento + Auditoría en una vista).
 *
 * Para una clasificación / cotización / operación / simulación de Pre-Glosa /
 * evaluación de riesgo arma, con datos REALES del tenant:
 *   - versiones normativas usadas (Classification.tigieVersion/ligieVersion,
 *     ClassificationConsult, VersionSnapshot activos hoy);
 *   - reglas que corrieron (Pre-Glosa `revision`, Risk `rulesVersion` +
 *     `pesosSnapshot`, GRI/knowledge del clasificador);
 *   - quién aprobó qué y cuándo (approvedById/approvedAt + PermissionAuditLog);
 *   - la bitácora encadenada (AuditLog de la entidad + verificación de cadena);
 *   - certificado de integridad: folio + SHA-256 del paquete + URLs públicas de
 *     verificación. NOM-151: "constancia NOM-151 vía PSC: no integrada".
 */
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { verifyChain } from './audit-service';
import { getActiveVersions, type ActiveVersions } from './traceability';

export const TIPOS_DEFENSA = ['classification', 'quote', 'operation', 'glosa', 'risk'] as const;
export type TipoDefensa = typeof TIPOS_DEFENSA[number];

export const NOM151_LEYENDA = 'constancia NOM-151 vía PSC: no integrada';

export interface PaqueteDefensa {
  entidad: { tipo: TipoDefensa; id: string; resumen: string; fecha: string; clienteId: string | null; fractionCode: string | null };
  versiones: {
    usadas: { tigie: string | null; ligie: string | null; rgce: string | null; acuerdoNoms: string | null; tmec: string | null; consultHash: string | null; consultedAt: string | null };
    vigentesHoy: ActiveVersions;
    snapshots: { type: string; version: string; publishDate: string; effectiveDate: string; source: string | null }[];
    fuente: string;
    desactualizada: boolean | null;
  };
  reglas: { descripcion: string; fuente: string; datos: unknown };
  aprobaciones: {
    status: string | null;
    creadoPor: { id: string; nombre: string; email: string } | null;
    aprobadoPor: { id: string; nombre: string; email: string } | null;
    approvedAt: string | null;
    permisos: { action: string; createdAt: string; targetUserId: string | null; details: unknown }[];
    fuente: string;
  };
  bitacora: {
    eventos: { id: string; action: string; createdAt: string; hash: string; prevHash: string | null; userId: string | null; endpoint: string | null }[];
    cadena: { valid: boolean; brokenAt?: string; checkedCount: number };
    ultimoHash: string | null;
    ultimoHashTenant: string | null;
    fuente: string;
  };
  certificado: {
    folio: string;
    hashPaquete: string;
    emitidoAt: string;
    verifyConsultUrl: string | null;
    verifyAuditUrl: string | null;
    nom151: string;
    sellado: string;
  };
}

function sha256(s: string) { return crypto.createHash('sha256').update(s).digest('hex'); }
function stable(v: unknown): string {
  if (v === null || v === undefined || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
}
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Hash reproducible del paquete: todo salvo el propio certificado. */
export function hashPaquete(p: Omit<PaqueteDefensa, 'certificado'>): string {
  return sha256(stable(p));
}

async function usuario(id: string | null | undefined) {
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
  return u ? { id: u.id, nombre: u.name, email: u.email } : null;
}

export async function armarPaqueteDefensa(input: { tenantId: string; tipo: string; id: string; baseUrl: string }): Promise<PaqueteDefensa | null> {
  const { tenantId, id, baseUrl } = input;
  if (!(TIPOS_DEFENSA as readonly string[]).includes(input.tipo)) throw new Error(`tipo inválido: ${input.tipo}`);
  const tipo = input.tipo as TipoDefensa;

  let entidad: PaqueteDefensa['entidad'] | null = null;
  let usadas: PaqueteDefensa['versiones']['usadas'] = { tigie: null, ligie: null, rgce: null, acuerdoNoms: null, tmec: null, consultHash: null, consultedAt: null };
  let reglas: PaqueteDefensa['reglas'] = { descripcion: 'Sin motor de reglas asociado a este tipo', fuente: '—', datos: null };
  let status: string | null = null, approvedAt: Date | null = null, approvedById: string | null = null, userId: string | null = null;
  let entityNames: string[] = [];

  if (tipo === 'classification') {
    const c = await prisma.classification.findFirst({ where: { id, tenantId } });
    if (!c) return null;
    const consult = c.consultHash ? await prisma.classificationConsult.findFirst({ where: { consultHash: c.consultHash, tenantId } }) : null;
    entidad = { tipo, id: c.id, resumen: `${c.fractionCode} — ${c.inputDescription.slice(0, 120)}`, fecha: c.createdAt.toISOString(), clienteId: c.clienteId, fractionCode: c.fractionCode };
    usadas = { tigie: c.tigieVersion ?? consult?.tigieVersion ?? null, ligie: c.ligieVersion ?? consult?.ligieVersion ?? null, rgce: consult?.rgceVersion ?? null, acuerdoNoms: consult?.acuerdoNomsVersion ?? null, tmec: consult?.tmecVersion ?? null, consultHash: c.consultHash, consultedAt: iso(c.consultedAt ?? consult?.consultedAt) };
    reglas = { descripcion: 'Reglas Generales de Interpretación aplicadas, base legal citada y conocimiento que entró al prompt', fuente: 'Classification.griApplied/legalBasis + ClassificationConsult.knowledgeUsed/modelUsed', datos: { griApplied: c.griApplied, legalBasis: c.legalBasis, knowledgeUsed: consult?.knowledgeUsed ?? null, modelUsed: consult?.modelUsed ?? null, modelProvider: consult?.modelProvider ?? null, inputHash: consult?.inputHash ?? null, outputHash: consult?.outputHash ?? null, knowledgeBaseHash: consult?.knowledgeBaseHash ?? null, confidence: c.confidence, feedback: c.feedback } };
    status = c.status; approvedAt = c.approvedAt; approvedById = c.approvedById; userId = c.userId;
    entityNames = ['Classification', 'classification'];
  } else if (tipo === 'quote') {
    const q = await prisma.quote.findFirst({ where: { id, tenantId }, include: { items: { select: { numeroPartida: true, fractionCode: true, countryOfOrigin: true, igiRate: true, ivaRate: true, dtaRate: true, countervailingRate: true, hasAntidumping: true, antidumpingDecree: true } } } });
    if (!q) return null;
    entidad = { tipo, id: q.id, resumen: `${q.name ?? 'Cotización'} — ${q.fractionCode} · ${q.origin} · ${q.customsValue} ${q.currency}`, fecha: q.createdAt.toISOString(), clienteId: q.clienteId, fractionCode: q.fractionCode };
    reglas = { descripcion: 'Tasas aplicadas por partida (IGI/IVA/DTA/cuota compensatoria) y tipo de cambio usado', fuente: 'QuoteItem + Quote.exchangeRate/exchangeRateDate/tcFechaDOF', datos: { partidas: q.items, exchangeRate: q.exchangeRate, exchangeRateDate: iso(q.exchangeRateDate), tcFechaDOF: iso(q.tcFechaDOF), version: q.version, vigenciaHasta: iso(q.vigenciaHasta) } };
    status = q.status; approvedAt = q.approvedAt; approvedById = q.approvedById; userId = q.userId;
    entityNames = ['Quote', 'quote'];
  } else if (tipo === 'operation') {
    const o = await prisma.operation.findFirst({ where: { id, tenantId }, include: { documents: { select: { id: true, type: true, status: true, createdAt: true } } } });
    if (!o) return null;
    entidad = { tipo, id: o.id, resumen: `${o.reference} — ${o.type} · ${o.status}`, fecha: o.createdAt.toISOString(), clienteId: o.clienteId, fractionCode: o.fractionCode };
    reglas = { descripcion: 'Checklist del expediente, glosa documental y retención', fuente: 'Operation.checklist/glosaDocumental/retencionHasta + Document', datos: { checklist: o.checklist, glosaDocumental: o.glosaDocumental, retencionHasta: iso(o.retencionHasta), completeness: o.completeness, documentos: o.documents } };
    status = o.status; userId = o.userId;
    entityNames = ['Operation', 'operation'];
  } else if (tipo === 'glosa') {
    const g = await prisma.glosaSimulation.findFirst({ where: { id, tenantId } });
    if (!g) return null;
    entidad = { tipo, id: g.id, resumen: `Pre-Glosa ${g.fractionCode} · aduana ${g.customsCode} · ${g.regimenCode} · ${g.riskLevel}`, fecha: g.createdAt.toISOString(), clienteId: g.clienteId, fractionCode: g.fractionCode };
    reglas = { descripcion: 'Estado de revisión por dominio (revisado / no_revisado / no_aplica), banderas y recomendaciones', fuente: 'GlosaSimulation.revision/riskFlags/recommendations/exchangeRateUsed', datos: { revision: g.revision, riskFlags: g.riskFlags, recommendations: g.recommendations, exchangeRateUsed: g.exchangeRateUsed, riskScore: g.riskScore, raProbability: g.raProbability, actualOutcome: g.actualOutcome } };
    userId = g.userId;
    entityNames = ['GlosaSimulation', 'glosa', 'Glosa'];
  } else {
    const r = await prisma.riskAssessment.findFirst({ where: { id, tenantId } });
    if (!r) return null;
    entidad = { tipo, id: r.id, resumen: `Risk Scorer ${r.folio ?? r.id.slice(-8)} · banda ${r.banda} · exposición ${r.exposicion}`, fecha: r.createdAt.toISOString(), clienteId: r.clienteId, fractionCode: null };
    reglas = { descripcion: 'Versión de reglas y snapshot de pesos con que se evaluó; detalle por regla y evidencia documental', fuente: 'RiskAssessment.rulesVersion/pesosSnapshot/detalle/evidencia', datos: { rulesVersion: r.rulesVersion, pesosSnapshot: r.pesosSnapshot, detalle: r.detalle, checklist: r.checklist, evidencia: r.evidencia, operationId: r.operationId } };
    userId = r.userId;
    entityNames = ['RiskAssessment', 'risk'];
  }

  const [vigentesHoy, snapshots, creadoPor, aprobadoPor, permisos, eventos, cadena, ultimoTenant] = await Promise.all([
    getActiveVersions(),
    prisma.versionSnapshot.findMany({ where: { active: true }, orderBy: [{ type: 'asc' }, { effectiveDate: 'desc' }], select: { type: true, version: true, publishDate: true, effectiveDate: true, source: true } }),
    usuario(userId),
    usuario(approvedById),
    prisma.permissionAuditLog.findMany({
      where: { tenantId, OR: [{ userId: userId ?? '' }, { targetUserId: userId ?? '' }, ...(approvedById ? [{ userId: approvedById }, { targetUserId: approvedById }] : [])] },
      orderBy: { createdAt: 'desc' }, take: 20, select: { action: true, createdAt: true, targetUserId: true, details: true },
    }),
    prisma.auditLog.findMany({ where: { tenantId, entityId: id, entity: { in: entityNames } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, action: true, createdAt: true, hash: true, prevHash: true, userId: true, endpoint: true } }),
    verifyChain(tenantId),
    prisma.auditLog.findFirst({ where: { tenantId, hash: { not: '' } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { hash: true } }),
  ]);

  const usadasTigie = usadas.tigie;
  const sinCertificado: Omit<PaqueteDefensa, 'certificado'> = {
    entidad: entidad!,
    versiones: {
      usadas,
      vigentesHoy,
      snapshots: snapshots.map(s => ({ type: s.type, version: s.version, publishDate: s.publishDate.toISOString().slice(0, 10), effectiveDate: s.effectiveDate.toISOString().slice(0, 10), source: s.source })),
      fuente: 'Classification.tigieVersion/ligieVersion · ClassificationConsult · VersionSnapshot (activos hoy)',
      desactualizada: usadasTigie ? usadasTigie !== vigentesHoy.tigie : null,
    },
    reglas,
    aprobaciones: {
      status, creadoPor, aprobadoPor, approvedAt: iso(approvedAt),
      permisos: permisos.map(p => ({ action: p.action, createdAt: p.createdAt.toISOString(), targetUserId: p.targetUserId, details: p.details })),
      fuente: 'approvedById/approvedAt de la entidad + PermissionAuditLog del tenant',
    },
    bitacora: {
      eventos: eventos.filter(e => e.hash).map(e => ({ id: e.id, action: e.action, createdAt: e.createdAt.toISOString(), hash: e.hash, prevHash: e.prevHash, userId: e.userId, endpoint: e.endpoint })),
      cadena,
      ultimoHash: eventos.filter(e => e.hash).at(-1)?.hash ?? null,
      ultimoHashTenant: ultimoTenant?.hash ?? null,
      fuente: 'AuditLog (SHA-256 encadenado por tenant, services/audit-service.ts) — verificable en /verify/audit/:hash',
    },
  };

  const hash = hashPaquete(sinCertificado);
  const hoy = new Date();
  const folio = `DEF-${tipo.slice(0, 3).toUpperCase()}-${id.slice(-8).toUpperCase()}-${hoy.toISOString().slice(0, 10).replace(/-/g, '')}`;
  const ultimo = sinCertificado.bitacora.ultimoHash;
  return {
    ...sinCertificado,
    certificado: {
      folio,
      hashPaquete: hash,
      emitidoAt: hoy.toISOString(),
      verifyConsultUrl: usadas.consultHash ? `${baseUrl}/verify/${usadas.consultHash}` : null,
      verifyAuditUrl: ultimo ? `${baseUrl}/verify/audit/${ultimo}` : null,
      nom151: NOM151_LEYENDA,
      sellado: 'Hashes SHA-256 encadenados; anclaje OpenTimestamps/Bitcoin solo en acciones críticas (ver Auditoría). No sustituye una constancia de conservación NOM-151-SCFI.',
    },
  };
}

/** Listado reciente para el selector de la vista Defensa (por cliente cuando aplica). */
/** `clienteId` admite lo que produce `filtroCliente(req)`: id, `{ in }` (alcance restringido) o undefined. */
export async function listarEntidadesDefensa(tenantId: string, tipo: string, clienteId: string | { in: string[] } | undefined, limit = 20) {
  const cli = clienteId ? { clienteId } : {};
  switch (tipo) {
    case 'classification':
      return (await prisma.classification.findMany({ where: { tenantId, ...cli }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, fractionCode: true, inputDescription: true, createdAt: true, status: true } }))
        .map(c => ({ id: c.id, resumen: `${c.fractionCode} — ${c.inputDescription.slice(0, 80)}`, fecha: c.createdAt.toISOString(), status: c.status }));
    case 'quote':
      return (await prisma.quote.findMany({ where: { tenantId, ...cli }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, fractionCode: true, name: true, origin: true, createdAt: true, status: true } }))
        .map(q => ({ id: q.id, resumen: `${q.name ?? 'Cotización'} — ${q.fractionCode} · ${q.origin}`, fecha: q.createdAt.toISOString(), status: q.status }));
    case 'operation':
      return (await prisma.operation.findMany({ where: { tenantId, ...cli }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, reference: true, type: true, createdAt: true, status: true } }))
        .map(o => ({ id: o.id, resumen: `${o.reference} — ${o.type}`, fecha: o.createdAt.toISOString(), status: o.status }));
    case 'glosa':
      return (await prisma.glosaSimulation.findMany({ where: { tenantId, ...cli }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, fractionCode: true, customsCode: true, riskLevel: true, createdAt: true } }))
        .map(g => ({ id: g.id, resumen: `${g.fractionCode} · aduana ${g.customsCode} · ${g.riskLevel}`, fecha: g.createdAt.toISOString(), status: g.riskLevel }));
    case 'risk':
      return (await prisma.riskAssessment.findMany({ where: { tenantId, ...cli }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, folio: true, banda: true, exposicion: true, createdAt: true } }))
        .map(r => ({ id: r.id, resumen: `${r.folio ?? r.id.slice(-8)} · ${r.banda} · exposición ${r.exposicion}`, fecha: r.createdAt.toISOString(), status: r.banda }));
    default:
      throw new Error(`tipo inválido: ${tipo}`);
  }
}
