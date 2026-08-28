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
import {
  ACCIONES_APROBACION, ACCIONES_DECISION, ACCIONES_RECHAZO, ACCION_SEED_RESTAURADA,
  tipoAprobacionDeDefensa, type TipoAprobacion,
} from './aprobaciones';

export const TIPOS_DEFENSA = ['classification', 'quote', 'operation', 'glosa', 'risk'] as const;
export type TipoDefensa = typeof TIPOS_DEFENSA[number];

export const NOM151_LEYENDA = 'constancia NOM-151 vía PSC: no integrada';

/**
 * Leyendas del bloque de aprobación. La del legado existe porque
 * `Classification.status`/`Quote.status` nacen en `@default("approved")`: un
 * registro histórico puede decir "aprobado" sin que NADIE lo haya aprobado.
 * Decir "sin aprobación registrada" a secas ahí sería tan falso como inventar
 * un aprobador; el texto honesto distingue el legado del hueco real.
 */
export const LEYENDA_APROBACION_LEGADO = 'aprobación anterior al registro de aprobadores (sin dato)';
export const LEYENDA_APROBACION_SEMBRADA = 'registro de demostración: estado sembrado, sin revisión humana';
export const LEYENDA_SIN_FLUJO = 'este tipo no pasa por el flujo de aprobación (la bandeja cubre clasificaciones y cotizaciones)';

export type EstadoAprobacion =
  | 'aprobada'                 // approvedById presente: hay nombre y fecha
  | 'aprobada_sin_aprobador'   // status approved heredado del default del schema
  | 'aprobada_sembrada'        // igual, pero el registro es isDemoData
  | 'pendiente'
  | 'rechazada'
  | 'sin_flujo'                // operación / pre-glosa / risk: no hay aprobación
  | 'desconocido';

export interface PersonaDefensa { id: string; nombre: string; email: string }
export interface PersonaConRol extends PersonaDefensa {
  /** Roles activos del usuario en el tenant al momento de la decisión. */
  rol: string | null;
  rolFuente: string;
}
export interface DecisionAprobacion {
  action: string;
  createdAt: string;
  hash: string;
  prevHash: string | null;
  motivo: string | null;
  ratificacionLegado: boolean;
  por: PersonaConRol | null;
}

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
    /** ¿Este tipo pasa por la bandeja de Aprobaciones? */
    aplica: boolean;
    estado: EstadoAprobacion;
    /** Texto honesto listo para UI y PDF; nunca "sin aprobación registrada" a secas. */
    leyenda: string;
    status: string | null;
    creadoPor: PersonaDefensa | null;
    /** Solo cuando la entidad tiene `approvedById`: un rechazo NO puebla esto. */
    aprobadoPor: PersonaConRol | null;
    approvedAt: string | null;
    motivo: string | null;
    /** Evento encadenado de la última decisión (aprobó / rechazó) con su hash. */
    decision: DecisionAprobacion | null;
    permisos: { action: string; createdAt: string; targetUserId: string | null; details: unknown }[];
    /** Ida y vuelta: ruta de la bandeja y tipo con que se aprueba esta entidad. */
    bandeja: { ruta: string; tipo: TipoAprobacion } | null;
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

async function usuario(id: string | null | undefined): Promise<PersonaDefensa | null> {
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
  return u ? { id: u.id, nombre: u.name, email: u.email } : null;
}

/**
 * Rol vigente del usuario en el tenant AL MOMENTO de la decisión (no el de hoy):
 * `UserTenantRole` acotado por effectiveFrom/effectiveUntil. Si no hay asignación
 * explícita, el permiso vino del rol legacy `User.role` y se dice así — no se
 * afirma un rol que la base no respalda.
 */
async function personaConRol(tenantId: string, id: string | null | undefined, momento: Date | null): Promise<PersonaConRol | null> {
  const base = await usuario(id);
  if (!base) return null;
  const en = momento ?? new Date();
  const asignados = await prisma.userTenantRole.findMany({
    where: {
      tenantId, userId: base.id, active: true,
      effectiveFrom: { lte: en },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: en } }],
    },
    select: { role: { select: { code: true } } },
  });
  const codigos = asignados.map(a => a.role.code);
  if (codigos.length > 0) {
    return { ...base, rol: codigos.sort().join(' + '), rolFuente: 'UserTenantRole vigente al momento de la decisión' };
  }
  const legacy = await prisma.user.findUnique({ where: { id: base.id }, select: { role: true } });
  return { ...base, rol: null, rolFuente: `sin rol explícito en el tenant; permiso por rol legacy User.role=${legacy?.role ?? '—'}` };
}

type EventoAudit = {
  id: string; action: string; createdAt: Date; hash: string; prevHash: string | null;
  userId: string | null; endpoint: string | null; metadata: unknown;
};

const meta = (m: unknown): Record<string, unknown> => (m && typeof m === 'object' && !Array.isArray(m) ? m as Record<string, unknown> : {});
const fechaLegible = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

/**
 * "Quién aprobó qué y cuándo" — con la verdad del dato, no con un hueco.
 *
 * El síntoma que reportó la cuarta revisión ("sin aprobación registrada" en
 * registros `approved`) tiene su causa en `status @default("approved")`: los
 * históricos nacen aprobados sin que nadie los apruebe. Aquí se separan los
 * cuatro casos reales (aprobada con nombre / legado sin aprobador / sembrada /
 * pendiente-rechazada) y se adjunta el evento encadenado de la decisión.
 */
async function armarBloqueAprobacion(a: {
  tenantId: string;
  tipo: TipoDefensa;
  status: string | null;
  approvedAt: Date | null;
  approvedById: string | null;
  aprobadoPor: PersonaConRol | null;
  creadoPor: PersonaDefensa | null;
  esSembrado: boolean;
  eventos: EventoAudit[];
  permisos: { action: string; createdAt: string; targetUserId: string | null; details: unknown }[];
}): Promise<PaqueteDefensa['aprobaciones']> {
  const tipoApro = tipoAprobacionDeDefensa(a.tipo);
  const aplica = tipoApro !== null;

  // Última decisión registrada en la bitácora de la entidad (vocabulario actual
  // APPROVAL_GRANTED/APPROVAL_REJECTED y el histórico APPROVE/REJECT).
  const decisiones = a.eventos.filter(e => e.hash && ACCIONES_DECISION.includes(e.action));
  const ultima = decisiones.at(-1) ?? null;
  const restaurada = a.eventos.filter(e => e.hash && e.action === ACCION_SEED_RESTAURADA).at(-1) ?? null;

  let decision: DecisionAprobacion | null = null;
  if (ultima) {
    const m = meta(ultima.metadata);
    decision = {
      action: ultima.action,
      createdAt: ultima.createdAt.toISOString(),
      hash: ultima.hash,
      prevHash: ultima.prevHash,
      motivo: typeof m.motivo === 'string' && m.motivo.trim() ? m.motivo : null,
      ratificacionLegado: m.ratificacionLegado === true,
      por: await personaConRol(a.tenantId, ultima.userId, ultima.createdAt),
    };
  }

  const rechazado = a.status === 'rejected';
  const aprobado = a.status === 'approved';
  let estado: EstadoAprobacion;
  if (!aplica) estado = 'sin_flujo';
  else if (aprobado && a.approvedById) estado = 'aprobada';
  else if (aprobado && a.esSembrado) estado = 'aprobada_sembrada';
  else if (aprobado) estado = 'aprobada_sin_aprobador';
  else if (a.status === 'pending_approval') estado = 'pendiente';
  else if (rechazado) estado = 'rechazada';
  else estado = 'desconocido';

  const quien = a.aprobadoPor;
  const conMotivo = (base: string) => (decision?.motivo ? `${base} — motivo: ${decision.motivo}` : base);
  let leyenda: string;
  switch (estado) {
    case 'sin_flujo':
      leyenda = LEYENDA_SIN_FLUJO;
      break;
    case 'aprobada':
      // `quien` puede ser null si el usuario aprobador ya no existe en la base:
      // se dice con su id, nunca se rellena con un nombre inventado.
      leyenda = conMotivo(
        `Aprobada por ${quien ? `${quien.nombre} <${quien.email}>${quien.rol ? ` (${quien.rol})` : ''}` : `el usuario ${a.approvedById} (baja: ya no está en el directorio)`}`
        + `${a.approvedAt ? ` el ${fechaLegible(a.approvedAt)}` : ''}`
        + `${decision?.ratificacionLegado ? ' — ratificación de un registro legado' : ''}`,
      );
      break;
    case 'aprobada_sembrada':
      leyenda = restaurada
        ? `${LEYENDA_APROBACION_SEMBRADA} (regularizado el ${fechaLegible(restaurada.createdAt)}, evento ${ACCION_SEED_RESTAURADA})`
        : LEYENDA_APROBACION_SEMBRADA;
      break;
    case 'aprobada_sin_aprobador':
      leyenda = LEYENDA_APROBACION_LEGADO;
      break;
    case 'pendiente':
      leyenda = 'Pendiente de aprobación: espera revisión en la bandeja de Aprobaciones.';
      break;
    case 'rechazada':
      leyenda = decision && ACCIONES_RECHAZO.includes(decision.action as (typeof ACCIONES_RECHAZO)[number])
        ? conMotivo(`Rechazada por ${decision.por ? `${decision.por.nombre} <${decision.por.email}>` : 'usuario no identificado'} el ${decision.createdAt.replace('T', ' ').slice(0, 19)} UTC`)
        : 'Rechazada; no hay evento de bitácora ligado a la entidad que lo respalde.';
      break;
    default:
      leyenda = `Estado "${a.status ?? '—'}" fuera del vocabulario del flujo de aprobación.`;
  }

  return {
    aplica,
    estado,
    leyenda,
    status: a.status,
    creadoPor: a.creadoPor,
    // Un rechazo NO marca aprobación: approvedById queda en null y aquí también.
    aprobadoPor: a.approvedById ? quien : null,
    approvedAt: iso(a.approvedAt),
    motivo: decision?.motivo ?? null,
    decision,
    permisos: a.permisos,
    bandeja: tipoApro ? { ruta: '/aprobaciones', tipo: tipoApro } : null,
    fuente: aplica
      ? 'approvedById/approvedAt de la entidad + AuditLog encadenado (APPROVAL_GRANTED/APPROVAL_REJECTED) + UserTenantRole vigente + PermissionAuditLog'
      : 'la entidad no tiene campos de aprobación; se reporta su estado propio',
  };
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
  let esSembrado = false;

  if (tipo === 'classification') {
    const c = await prisma.classification.findFirst({ where: { id, tenantId } });
    if (!c) return null;
    const consult = c.consultHash ? await prisma.classificationConsult.findFirst({ where: { consultHash: c.consultHash, tenantId } }) : null;
    entidad = { tipo, id: c.id, resumen: `${c.fractionCode} — ${c.inputDescription.slice(0, 120)}`, fecha: c.createdAt.toISOString(), clienteId: c.clienteId, fractionCode: c.fractionCode };
    usadas = { tigie: c.tigieVersion ?? consult?.tigieVersion ?? null, ligie: c.ligieVersion ?? consult?.ligieVersion ?? null, rgce: consult?.rgceVersion ?? null, acuerdoNoms: consult?.acuerdoNomsVersion ?? null, tmec: consult?.tmecVersion ?? null, consultHash: c.consultHash, consultedAt: iso(c.consultedAt ?? consult?.consultedAt) };
    reglas = { descripcion: 'Reglas Generales de Interpretación aplicadas, base legal citada y conocimiento que entró al prompt', fuente: 'Classification.griApplied/legalBasis + ClassificationConsult.knowledgeUsed/modelUsed', datos: { griApplied: c.griApplied, legalBasis: c.legalBasis, knowledgeUsed: consult?.knowledgeUsed ?? null, modelUsed: consult?.modelUsed ?? null, modelProvider: consult?.modelProvider ?? null, inputHash: consult?.inputHash ?? null, outputHash: consult?.outputHash ?? null, knowledgeBaseHash: consult?.knowledgeBaseHash ?? null, confidence: c.confidence, feedback: c.feedback } };
    status = c.status; approvedAt = c.approvedAt; approvedById = c.approvedById; userId = c.userId; esSembrado = c.isDemoData;
    entityNames = ['Classification', 'classification'];
  } else if (tipo === 'quote') {
    const q = await prisma.quote.findFirst({ where: { id, tenantId }, include: { items: { select: { numeroPartida: true, fractionCode: true, countryOfOrigin: true, igiRate: true, ivaRate: true, dtaRate: true, countervailingRate: true, hasAntidumping: true, antidumpingDecree: true } } } });
    if (!q) return null;
    entidad = { tipo, id: q.id, resumen: `${q.name ?? 'Cotización'} — ${q.fractionCode} · ${q.origin} · ${q.customsValue} ${q.currency}`, fecha: q.createdAt.toISOString(), clienteId: q.clienteId, fractionCode: q.fractionCode };
    reglas = { descripcion: 'Tasas aplicadas por partida (IGI/IVA/DTA/cuota compensatoria) y tipo de cambio usado', fuente: 'QuoteItem + Quote.exchangeRate/exchangeRateDate/tcFechaDOF', datos: { partidas: q.items, exchangeRate: q.exchangeRate, exchangeRateDate: iso(q.exchangeRateDate), tcFechaDOF: iso(q.tcFechaDOF), version: q.version, vigenciaHasta: iso(q.vigenciaHasta) } };
    status = q.status; approvedAt = q.approvedAt; approvedById = q.approvedById; userId = q.userId; esSembrado = q.isDemoData;
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
    personaConRol(tenantId, approvedById, approvedAt),
    prisma.permissionAuditLog.findMany({
      where: { tenantId, OR: [{ userId: userId ?? '' }, { targetUserId: userId ?? '' }, ...(approvedById ? [{ userId: approvedById }, { targetUserId: approvedById }] : [])] },
      orderBy: { createdAt: 'desc' }, take: 20, select: { action: true, createdAt: true, targetUserId: true, details: true },
    }),
    prisma.auditLog.findMany({ where: { tenantId, entityId: id, entity: { in: entityNames } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, action: true, createdAt: true, hash: true, prevHash: true, userId: true, endpoint: true, metadata: true } }),
    verifyChain(tenantId),
    prisma.auditLog.findFirst({ where: { tenantId, hash: { not: '' } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { hash: true } }),
  ]);

  const aprobacion = await armarBloqueAprobacion({
    tenantId, tipo, status, approvedAt, approvedById, aprobadoPor, creadoPor, esSembrado, eventos,
    permisos: permisos.map(x => ({ action: x.action, createdAt: x.createdAt.toISOString(), targetUserId: x.targetUserId, details: x.details })),
  });

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
    aprobaciones: aprobacion,
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
