import { prisma } from '../lib/prisma';
import { getAnthropicClient } from '../lib/anthropic';

// ============================================
// Análisis de decreto con IA
// ============================================

export interface DecreeChange {
  type: 'created' | 'modified' | 'suppressed' | 'nom_update';
  fractionCode: string;
  description?: string;
  field?: string; // "tariffNMF", "description", "nom", etc.
  oldValue?: string | null;
  newValue?: string | null;
  details?: string;
}

export interface DecreeAnalysis {
  decree: string;
  source: string;
  publishDate: string;
  effectiveDate: string;
  summary: string;
  context: string;
  impactedSectors: string[];
  changes: DecreeChange[];
  fractionsCreated: number;
  fractionsModified: number;
  fractionsSuppressed: number;
  nomsUpdated: number;
}

export async function analyzeDecree(decreeText: string): Promise<DecreeAnalysis> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `Eres un experto en legislacion aduanera mexicana, especializado en la TIGIE (Tarifa de la Ley de los Impuestos Generales de Importacion y de Exportacion).

Analiza el decreto del DOF proporcionado y extrae TODOS los cambios a la TIGIE. Identifica:
1. Fracciones arancelarias CREADAS (nuevas)
2. Fracciones MODIFICADAS (cambio de arancel, descripcion, NOM, regulaciones)
3. Fracciones SUPRIMIDAS (eliminadas)
4. Cambios en NOMs o regulaciones aplicables

Para cada fraccion, usa el formato de 8 digitos sin puntos (ej: 84713001).

Responde UNICAMENTE con JSON valido:
{
  "decree": "nombre o referencia del decreto",
  "source": "DOF",
  "publishDate": "YYYY-MM-DD",
  "effectiveDate": "YYYY-MM-DD",
  "summary": "resumen ejecutivo en 2-3 oraciones",
  "context": "por que se hizo este cambio, contexto politico/economico",
  "impactedSectors": ["sector1", "sector2"],
  "changes": [
    {
      "type": "created|modified|suppressed|nom_update",
      "fractionCode": "84713001",
      "description": "descripcion de la fraccion",
      "field": "tariffNMF|description|nom|active",
      "oldValue": "valor anterior o null",
      "newValue": "valor nuevo o null",
      "details": "explicacion del cambio"
    }
  ],
  "fractionsCreated": 0,
  "fractionsModified": 0,
  "fractionsSuppressed": 0,
  "nomsUpdated": 0
}`,
    messages: [{
      role: 'user',
      content: `Analiza este decreto del DOF y extrae los cambios a la TIGIE:\n\n${decreeText}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(jsonStr);
}

// ============================================
// Aplicar cambios a la base de datos
// ============================================

/**
 * Kill switch temporal para mutaciones del catálogo TIGIE.
 * Permanece apagado por defecto hasta que exista ingestión desde fuente oficial
 * verificable y doble aprobación. Se valida también dentro del servicio para
 * que un caller futuro no pueda rodear el guard de la ruta HTTP.
 */
export function isTigieApplyEnabled(): boolean {
  return process.env.TIGIE_APPLY_ENABLED === 'true';
}

export async function applyChanges(updateId: string, userId: string) {
  if (!isTigieApplyEnabled()) {
    throw new Error('TIGIE_APPLY_DISABLED: aplicación de cambios TIGIE deshabilitada');
  }

  const update = await prisma.tIGIEUpdate.findUnique({ where: { id: updateId } });
  if (!update) throw new Error('Update no encontrado');
  if (update.status === 'APPLIED') throw new Error('Ya fue aplicado');

  const changes = update.changes as unknown as DecreeChange[];
  let applied = 0;

  for (const change of changes) {
    try {
      if (change.type === 'created' && change.fractionCode) {
        // Check if fraction already exists
        const existing = await prisma.fraction.findUnique({ where: { code: change.fractionCode } });
        if (!existing) {
          // Find or create subheading
          const subheadingCode = change.fractionCode.substring(0, 6);
          const subheading = await prisma.subheading.findUnique({ where: { code: subheadingCode } });
          if (subheading) {
            const code = change.fractionCode;
            const formatted = `${code.slice(0, 4)}.${code.slice(4, 6)}.${code.slice(6, 8)}`;
            await prisma.fraction.create({
              data: {
                code,
                codeFormatted: formatted,
                description: change.description || 'Nueva fraccion',
                tariffNMF: change.newValue ? parseFloat(change.newValue) : null,
                subheadingId: subheading.id,
              },
            });
            applied++;
          }
        }
      } else if (change.type === 'modified' && change.fractionCode) {
        const fraction = await prisma.fraction.findUnique({ where: { code: change.fractionCode } });
        if (fraction) {
          const data: Record<string, unknown> = {};
          if (change.field === 'tariffNMF' && change.newValue) data.tariffNMF = parseFloat(change.newValue);
          if (change.field === 'tariffTMEC' && change.newValue) data.tariffTMEC = parseFloat(change.newValue);
          if (change.field === 'description' && change.newValue) data.description = change.newValue;
          if (Object.keys(data).length > 0) {
            await prisma.fraction.update({ where: { id: fraction.id }, data });
            applied++;
          }
        }
      } else if (change.type === 'suppressed' && change.fractionCode) {
        const fraction = await prisma.fraction.findUnique({ where: { code: change.fractionCode } });
        if (fraction) {
          await prisma.fraction.update({ where: { id: fraction.id }, data: { active: false } });
          applied++;
        }
      }
    } catch {
      // Log individual errors but continue
    }
  }

  await prisma.tIGIEUpdate.update({
    where: { id: updateId },
    data: { status: 'APPLIED', appliedAt: new Date(), appliedBy: userId },
  });

  return { applied, total: changes.length };
}

// ============================================
// Detectar usuarios afectados
// ============================================

export async function detectAffectedUsers(updateId: string) {
  const update = await prisma.tIGIEUpdate.findUnique({ where: { id: updateId } });
  if (!update) throw new Error('Update no encontrado');

  const changes = update.changes as unknown as DecreeChange[];
  const fractionCodes = changes.map(c => c.fractionCode).filter(Boolean);
  if (fractionCodes.length === 0) return { affected: 0, notifications: [] };

  // Find users who watch these fractions via alerts
  const alerts = await prisma.alert.findMany({
    where: { fractionCodes: { hasSome: fractionCodes } },
    include: { tenant: { include: { users: true } } },
  });

  // Find users with recent classifications using these fractions
  const recentClassifications = await prisma.classification.findMany({
    where: {
      fractionCode: { in: fractionCodes },
      createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
    select: { tenantId: true, userId: true, fractionCode: true },
    distinct: ['tenantId', 'fractionCode'],
  });

  // Find IMMEX imports with these fractions
  const immexImports = await prisma.temporaryImport.findMany({
    where: {
      fractionCode: { in: fractionCodes },
      status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] },
    },
    select: { tenantId: true, userId: true, fractionCode: true },
    distinct: ['tenantId', 'fractionCode'],
  });

  // Deduplicate affected tenant-user-fraction combos
  const seen = new Set<string>();
  const affected: { tenantId: string; userId: string; fractionCode: string; change: DecreeChange }[] = [];

  const addAffected = (tenantId: string, userId: string, fractionCode: string) => {
    const key = `${tenantId}:${userId}:${fractionCode}`;
    if (seen.has(key)) return;
    seen.add(key);
    const change = changes.find(c => c.fractionCode === fractionCode);
    if (change) affected.push({ tenantId, userId, fractionCode, change });
  };

  for (const alert of alerts) {
    for (const code of fractionCodes) {
      if (alert.fractionCodes.includes(code)) {
        for (const user of alert.tenant.users) {
          addAffected(alert.tenantId, user.id, code);
        }
      }
    }
  }

  for (const cls of recentClassifications) {
    addAffected(cls.tenantId, cls.userId, cls.fractionCode);
  }

  for (const imp of immexImports) {
    addAffected(imp.tenantId, imp.userId, imp.fractionCode);
  }

  return { affected: affected.length, notifications: affected };
}

// ============================================
// Enviar notificaciones
// ============================================

export async function sendNotifications(updateId: string) {
  const { affected, notifications } = await detectAffectedUsers(updateId);
  if (affected === 0) return { sent: 0 };

  const update = await prisma.tIGIEUpdate.findUnique({ where: { id: updateId } });
  if (!update) throw new Error('Update no encontrado');

  let sent = 0;
  for (const n of notifications) {
    const changeDesc = n.change.type === 'created' ? 'nueva fraccion creada'
      : n.change.type === 'suppressed' ? 'fraccion suprimida'
      : n.change.type === 'nom_update' ? 'cambio en NOM'
      : `${n.change.field || 'arancel'}: ${n.change.oldValue || '?'} → ${n.change.newValue || '?'}`;

    const message = `Fraccion ${n.fractionCode} afectada por ${update.decree || 'decreto DOF'}. Cambio: ${changeDesc}. Vigencia: ${update.effectiveDate.toLocaleDateString('es-MX')}.`;

    await prisma.updateNotification.create({
      data: {
        updateId,
        tenantId: n.tenantId,
        userId: n.userId,
        fractionCode: n.fractionCode,
        changeType: n.change.type === 'created' ? 'fraction_created'
          : n.change.type === 'suppressed' ? 'fraction_suppressed'
          : n.change.type === 'nom_update' ? 'nom_change'
          : 'arancel_change',
        oldValue: n.change.oldValue || null,
        newValue: n.change.newValue || null,
        message,
        channel: 'app',
        sent: true,
        sentAt: new Date(),
      },
    });
    sent++;
  }

  await prisma.tIGIEUpdate.update({
    where: { id: updateId },
    data: { usersNotified: sent },
  });

  return { sent };
}

// ============================================
// Resumen semanal con IA
// ============================================

export async function generateWeeklyDigest(tenantId: string) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const updates = await prisma.tIGIEUpdate.findMany({
    where: { createdAt: { gte: weekAgo } },
    orderBy: { createdAt: 'desc' },
  });

  const notifications = await prisma.updateNotification.findMany({
    where: { tenantId, createdAt: { gte: weekAgo } },
  });

  if (updates.length === 0) {
    return {
      period: `${weekAgo.toLocaleDateString('es-MX')} - ${new Date().toLocaleDateString('es-MX')}`,
      digest: 'Sin cambios en la TIGIE esta semana.',
      updatesCount: 0,
      affectedFractions: [],
    };
  }

  const client = getAnthropicClient();
  const updatesText = updates.map(u =>
    `- ${u.decree || 'Decreto'} (${u.source}): ${u.summary}. ${u.fractionsCreated} creadas, ${u.fractionsModified} modificadas, ${u.fractionsSuppressed} suprimidas.`
  ).join('\n');

  const affectedFractions = [...new Set(notifications.map(n => n.fractionCode))];
  const affectedText = affectedFractions.length > 0
    ? `Fracciones de tu empresa afectadas: ${affectedFractions.join(', ')}`
    : 'Ninguna de tus fracciones monitoreadas fue afectada.';

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `Genera un resumen semanal de cambios en comercio exterior mexicano. Estilo: conciso, profesional, accionable. En espanol. Maximo 4 parrafos.`,
    messages: [{
      role: 'user',
      content: `Cambios esta semana:\n${updatesText}\n\n${affectedText}`,
    }],
  });

  const digest = response.content[0].type === 'text' ? response.content[0].text : '';

  return {
    period: `${weekAgo.toLocaleDateString('es-MX')} - ${new Date().toLocaleDateString('es-MX')}`,
    digest,
    updatesCount: updates.length,
    affectedFractions,
  };
}

// ============================================
// Changelog
// ============================================

export async function getChangelog(page = 1, limit = 50, chapter?: string) {
  const updates = await prisma.tIGIEUpdate.findMany({
    where: { status: 'APPLIED' },
    orderBy: { effectiveDate: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });

  const entries: {
    fractionCode: string;
    changeType: string;
    field?: string;
    oldValue?: string | null;
    newValue?: string | null;
    decree?: string | null;
    effectiveDate: string;
    details?: string;
  }[] = [];

  for (const u of updates) {
    const changes = u.changes as unknown as DecreeChange[];
    for (const c of changes) {
      if (chapter && !c.fractionCode.startsWith(chapter)) continue;
      entries.push({
        fractionCode: c.fractionCode,
        changeType: c.type,
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
        decree: u.decree,
        effectiveDate: u.effectiveDate.toISOString(),
        details: c.details,
      });
    }
  }

  return entries;
}
