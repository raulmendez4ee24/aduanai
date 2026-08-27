import { prisma } from '../lib/prisma';
import { getAnthropicClient } from '../lib/anthropic';

// ============================================
// Estado de cuenta global
// ============================================

export async function getFiscalAccount(tenantId: string) {
  const credits = await prisma.taxCredit.findMany({
    where: { tenantId },
    include: { usages: true },
  });

  let totalGranted = 0;
  let totalUsed = 0;
  let totalPending = 0;
  let totalIVA = 0;
  let totalIEPS = 0;
  let activeCount = 0;
  let expiredCount = 0;

  const byMonth = new Map<string, { granted: number; used: number; balance: number }>();
  const byFraction = new Map<string, { granted: number; used: number; balance: number; count: number }>();

  for (const c of credits) {
    const total = c.ivaAmount + c.iepsAmount;
    const used = c.discharged;
    totalGranted += total;
    totalUsed += used;
    totalPending += c.remaining;
    totalIVA += c.ivaAmount;
    totalIEPS += c.iepsAmount;

    if (c.status === 'ACTIVE' || c.status === 'PARTIALLY_USED') activeCount++;
    if (c.status === 'EXPIRED') expiredCount++;

    // By month
    const monthKey = `${c.creditDate.getFullYear()}-${String(c.creditDate.getMonth() + 1).padStart(2, '0')}`;
    const monthEntry = byMonth.get(monthKey) || { granted: 0, used: 0, balance: 0 };
    monthEntry.granted += total;
    monthEntry.used += used;
    monthEntry.balance += c.remaining;
    byMonth.set(monthKey, monthEntry);

    // By fraction
    const fracEntry = byFraction.get(c.fractionCode) || { granted: 0, used: 0, balance: 0, count: 0 };
    fracEntry.granted += total;
    fracEntry.used += used;
    fracEntry.balance += c.remaining;
    fracEntry.count++;
    byFraction.set(c.fractionCode, fracEntry);
  }

  return {
    totalGranted,
    totalUsed,
    totalPending,
    totalIVA,
    totalIEPS,
    activeCount,
    expiredCount,
    totalCredits: credits.length,
    utilizationRate: totalGranted > 0 ? (totalUsed / totalGranted) * 100 : 0,
    byMonth: Array.from(byMonth.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month)),
    byFraction: Array.from(byFraction.entries())
      .map(([fractionCode, data]) => ({ fractionCode, ...data }))
      .sort((a, b) => b.balance - a.balance),
  };
}

// ============================================
// Dashboard KPIs
// ============================================

export async function getFiscalDashboard(tenantId: string) {
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const [
    activeCredits,
    totalCredits,
    expiringCredits,
    activeGuarantees,
    expiringGuarantees,
    certification,
    account,
  ] = await Promise.all([
    prisma.taxCredit.count({ where: { tenantId, status: { in: ['ACTIVE', 'PARTIALLY_USED'] } } }),
    prisma.taxCredit.count({ where: { tenantId } }),
    prisma.taxCredit.count({
      where: { tenantId, status: { in: ['ACTIVE', 'PARTIALLY_USED'] }, dischargeDeadline: { lte: sixtyDays } },
    }),
    prisma.guarantee.count({ where: { tenantId, status: 'ACTIVE' } }),
    prisma.guarantee.count({
      where: { tenantId, status: 'ACTIVE', expiryDate: { lte: sixtyDays } },
    }),
    prisma.certificationProfile.findUnique({ where: { tenantId } }),
    getFiscalAccount(tenantId),
  ]);

  // Risk score: 0-100 (lower = better)
  let riskScore = 0;
  const riskFactors: string[] = [];

  // Credits expiring soon
  if (expiringCredits > 0) {
    riskScore += Math.min(30, expiringCredits * 10);
    riskFactors.push(`${expiringCredits} creditos vencen en 60 dias`);
  }

  // Guarantees expiring
  if (expiringGuarantees > 0) {
    riskScore += 20;
    riskFactors.push(`${expiringGuarantees} garantias por vencer`);
  }

  // Certification status
  if (certification) {
    if (certification.status === 'AT_RISK') { riskScore += 25; riskFactors.push('Certificacion en riesgo'); }
    if (certification.status === 'SUSPENDED') { riskScore += 40; riskFactors.push('Certificacion suspendida'); }
    if (certification.renewalDeadline && certification.renewalDeadline <= thirtyDays) {
      riskScore += 15; riskFactors.push('Renovacion de certificacion proxima');
    }
  } else {
    riskScore += 10;
    riskFactors.push('Sin perfil de certificacion configurado');
  }

  // Low utilization rate
  if (account.utilizationRate < 50 && account.totalCredits > 5) {
    riskScore += 10;
    riskFactors.push('Tasa de utilizacion de creditos baja');
  }

  return {
    activeCredits,
    totalCredits,
    expiringCredits,
    activeGuarantees,
    expiringGuarantees,
    totalPending: account.totalPending,
    totalGranted: account.totalGranted,
    utilizationRate: account.utilizationRate,
    certificationStatus: certification?.status || 'NOT_CONFIGURED',
    certificationModality: certification?.modality || null,
    riskScore: Math.min(100, riskScore),
    riskFactors,
  };
}

// ============================================
// IA — Detección de riesgos
// ============================================

export async function detectFiscalRisks(tenantId: string) {
  const now = new Date();
  const risks: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    message: string;
    detail: string;
    action: string;
  }[] = [];

  // 1. Credits expiring without discharge
  const expiringCredits = await prisma.taxCredit.findMany({
    where: {
      tenantId,
      status: { in: ['ACTIVE', 'PARTIALLY_USED'] },
      dischargeDeadline: { lte: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { dischargeDeadline: 'asc' },
  });

  for (const c of expiringCredits) {
    const daysLeft = Math.ceil((c.dischargeDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) {
      risks.push({
        severity: 'critical',
        category: 'Credito vencido',
        message: `Credito fiscal VENCIDO — Pedimento ${c.pedimento}`,
        detail: `$${c.remaining.toLocaleString()} MXN pendientes de descargar. Fraccion ${c.fractionCode}. Vencio hace ${Math.abs(daysLeft)} dias.`,
        action: 'Regularizar inmediatamente. El SAT puede requerir el pago del IVA/IEPS mas recargos y actualizaciones.',
      });
    } else if (daysLeft <= 30) {
      risks.push({
        severity: 'critical',
        category: 'Vencimiento inminente',
        message: `Credito vence en ${daysLeft} dias — $${c.remaining.toLocaleString()} MXN`,
        detail: `Pedimento ${c.pedimento}, fraccion ${c.fractionCode}. Sin descargo completo.`,
        action: 'Programar descargo urgente o solicitar prorroga si aplica.',
      });
    } else if (daysLeft <= 60) {
      risks.push({
        severity: 'high',
        category: 'Proximo vencimiento',
        message: `Credito vence en ${daysLeft} dias`,
        detail: `Pedimento ${c.pedimento}: $${c.remaining.toLocaleString()} MXN pendientes.`,
        action: 'Planificar descargo en las proximas semanas.',
      });
    } else {
      risks.push({
        severity: 'medium',
        category: 'Vencimiento programado',
        message: `Credito vence en ${daysLeft} dias`,
        detail: `Pedimento ${c.pedimento}: $${c.remaining.toLocaleString()} MXN.`,
        action: 'Monitorear y programar descargo.',
      });
    }
  }

  // 2. Expired guarantees or expiring soon
  const guarantees = await prisma.guarantee.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      expiryDate: { lte: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000) },
    },
  });

  for (const g of guarantees) {
    const daysLeft = Math.ceil((g.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const typeLabel = g.type === 'FIANZA' ? 'Fianza' : g.type === 'CARTA_CREDITO' ? 'Carta de credito' : g.type === 'DEPOSITO' ? 'Deposito' : 'Garantia';

    if (daysLeft <= 0) {
      risks.push({
        severity: 'critical',
        category: 'Garantia vencida',
        message: `${typeLabel} con ${g.institution} VENCIDA`,
        detail: `Monto: $${g.amount.toLocaleString()} MXN. Ref: ${g.referenceNumber || 'S/N'}. Vencio hace ${Math.abs(daysLeft)} dias.`,
        action: 'Renovar inmediatamente — sin garantia vigente se pierde la certificacion IVA/IEPS.',
      });
    } else if (daysLeft <= 15) {
      risks.push({
        severity: 'critical',
        category: 'Garantia por vencer',
        message: `${typeLabel} con ${g.institution} vence en ${daysLeft} dias`,
        detail: `Monto: $${g.amount.toLocaleString()} MXN.`,
        action: 'Iniciar tramite de renovacion de forma urgente.',
      });
    } else if (daysLeft <= 30) {
      risks.push({
        severity: 'high',
        category: 'Garantia por vencer',
        message: `${typeLabel} vence en ${daysLeft} dias`,
        detail: `${g.institution} — $${g.amount.toLocaleString()} MXN.`,
        action: 'Contactar a la institucion para renovacion.',
      });
    } else {
      risks.push({
        severity: 'medium',
        category: 'Garantia por vencer',
        message: `${typeLabel} vence en ${daysLeft} dias`,
        detail: `${g.institution} — $${g.amount.toLocaleString()} MXN.`,
        action: 'Programar renovacion en los proximos 30 dias.',
      });
    }
  }

  // 3. Certification renewal
  const cert = await prisma.certificationProfile.findUnique({ where: { tenantId } });
  if (cert) {
    if (cert.status === 'SUSPENDED') {
      risks.push({
        severity: 'critical',
        category: 'Certificacion',
        message: 'Certificacion IVA/IEPS SUSPENDIDA',
        detail: `Modalidad ${cert.modality}. No. ${cert.certNumber || 'S/N'}.`,
        action: 'Atender requerimientos del SAT y solicitar reactivacion inmediatamente.',
      });
    }
    if (cert.status === 'AT_RISK') {
      risks.push({
        severity: 'high',
        category: 'Certificacion',
        message: 'Certificacion en riesgo',
        detail: `Modalidad ${cert.modality}. Revisar requisitos pendientes.`,
        action: 'Resolver pendientes antes de que el SAT suspenda.',
      });
    }
    if (cert.renewalDeadline) {
      const renewDays = Math.ceil((cert.renewalDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (renewDays <= 30 && renewDays > 0) {
        risks.push({
          severity: 'high',
          category: 'Renovacion',
          message: `Renovacion de certificacion en ${renewDays} dias`,
          detail: `Modalidad ${cert.modality}. Fecha limite: ${cert.renewalDeadline.toLocaleDateString('es-MX')}.`,
          action: 'Preparar documentacion y presentar solicitud de renovacion.',
        });
      }
    }
  }

  // 4. Discrepancies - credits with irregular status
  const irregularCredits = await prisma.taxCredit.count({
    where: { tenantId, status: 'IRREGULAR' },
  });
  if (irregularCredits > 0) {
    risks.push({
      severity: 'high',
      category: 'Discrepancia',
      message: `${irregularCredits} creditos marcados como irregulares`,
      detail: 'Existen creditos con discrepancias entre lo declarado y lo descargado.',
      action: 'Revisar cada credito irregular y corregir antes de la siguiente transmision.',
    });
  }

  // IA summary
  let aiSummary: string | null = null;
  if (risks.length > 0) {
    try {
      const client = getAnthropicClient();
      const riskData = risks.slice(0, 15).map(r => `[${r.severity.toUpperCase()}] ${r.category}: ${r.message} — ${r.detail}`).join('\n');

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: `Eres un experto fiscal en comercio exterior mexicano, especialista en certificacion IVA/IEPS y programas IMMEX.
Analiza los riesgos fiscales detectados y genera un diagnostico ejecutivo con las 3 acciones prioritarias.
Incluye el impacto potencial en pesos si no se atienden.
Responde en espanol, directo y accionable. Maximo 3 parrafos.`,
        messages: [{
          role: 'user',
          content: `Riesgos fiscales detectados:\n${riskData}`,
        }],
      });

      aiSummary = response.content[0].type === 'text' ? response.content[0].text : null;
    } catch {
      // Continue without AI summary
    }
  }

  return {
    risks: risks.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    }),
    aiSummary,
    total: risks.length,
    critical: risks.filter(r => r.severity === 'critical').length,
    high: risks.filter(r => r.severity === 'high').length,
  };
}

// ============================================
// Garantías — monitoreo
// ============================================

export async function getGuaranteeAlerts(tenantId: string) {
  const now = new Date();
  const guarantees = await prisma.guarantee.findMany({
    where: { tenantId },
    orderBy: { expiryDate: 'asc' },
  });

  return guarantees.map(g => {
    const daysLeft = Math.ceil((g.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    let alertLevel: 'ok' | 'warning' | 'danger' | 'expired' = 'ok';
    if (daysLeft <= 0) alertLevel = 'expired';
    else if (daysLeft <= 15) alertLevel = 'danger';
    else if (daysLeft <= 60) alertLevel = 'warning';

    return { ...g, daysLeft, alertLevel };
  });
}
