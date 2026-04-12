import { prisma } from '../lib/prisma';
import { getAnthropicClient } from '../lib/anthropic';

// ============================================
// Saldos por fracción arancelaria
// ============================================

export async function getInventoryBalances(tenantId: string) {
  const imports = await prisma.temporaryImport.findMany({
    where: { tenantId, status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] } },
    include: { discharges: true },
  });

  const balanceMap = new Map<string, {
    fractionCode: string;
    description: string;
    unit: string;
    totalImported: number;
    totalDischarged: number;
    balance: number;
    totalValueUSD: number;
    earliestExpiration: Date | null;
    daysRemaining: number | null;
    importCount: number;
    activeImports: number;
  }>();

  const now = new Date();

  for (const imp of imports) {
    const existing = balanceMap.get(imp.fractionCode) || {
      fractionCode: imp.fractionCode,
      description: imp.description,
      unit: imp.unit,
      totalImported: 0,
      totalDischarged: 0,
      balance: 0,
      totalValueUSD: 0,
      earliestExpiration: null as Date | null,
      daysRemaining: null as number | null,
      importCount: 0,
      activeImports: 0,
    };

    existing.totalImported += imp.quantity;
    existing.totalDischarged += imp.quantityDischarged;
    existing.balance += (imp.quantity - imp.quantityDischarged);
    existing.totalValueUSD += imp.customsValue;
    existing.importCount++;
    existing.activeImports++;

    if (!existing.earliestExpiration || imp.expirationDate < existing.earliestExpiration) {
      existing.earliestExpiration = imp.expirationDate;
      existing.daysRemaining = Math.ceil(
        (imp.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    balanceMap.set(imp.fractionCode, existing);
  }

  return Array.from(balanceMap.values()).sort((a, b) => {
    if (a.daysRemaining === null) return 1;
    if (b.daysRemaining === null) return -1;
    return a.daysRemaining - b.daysRemaining;
  });
}

// ============================================
// Importaciones próximas a vencer
// ============================================

export async function getExpiringImports(tenantId: string, daysAhead = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  return prisma.temporaryImport.findMany({
    where: {
      tenantId,
      status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] },
      expirationDate: { lte: cutoff },
    },
    include: {
      discharges: {
        select: { id: true, type: true, quantity: true, dischargeDate: true, pedimento: true },
      },
    },
    orderBy: { expirationDate: 'asc' },
  });
}

// ============================================
// Detección de inconsistencias con IA
// ============================================

export async function detectInconsistencies(tenantId: string) {
  const balances = await getInventoryBalances(tenantId);
  const expiring = await getExpiringImports(tenantId, 60);

  const issues: {
    severity: 'critical' | 'warning' | 'info';
    fractionCode: string;
    message: string;
    detail: string;
    recommendation: string;
  }[] = [];

  const now = new Date();

  // Regla 1: Vencidas
  for (const imp of expiring) {
    const daysLeft = Math.ceil(
      (imp.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    const pendingQty = imp.quantity - imp.quantityDischarged;

    if (daysLeft <= 0 && pendingQty > 0) {
      issues.push({
        severity: 'critical',
        fractionCode: imp.fractionCode,
        message: `Importación temporal VENCIDA con saldo pendiente`,
        detail: `Pedimento ${imp.pedimento}: ${pendingQty} ${imp.unit} sin descargar. Venció hace ${Math.abs(daysLeft)} días.`,
        recommendation: 'Regularizar inmediatamente ante el SAT para evitar multas y embargo precautorio.',
      });
    } else if (daysLeft <= 30 && daysLeft > 0 && pendingQty > 0) {
      issues.push({
        severity: 'critical',
        fractionCode: imp.fractionCode,
        message: `Vence en ${daysLeft} días con saldo pendiente`,
        detail: `Pedimento ${imp.pedimento}: ${pendingQty} ${imp.unit} por descargar. Valor: $${imp.customsValue.toLocaleString()} USD.`,
        recommendation: 'Programar retorno o cambio de régimen antes del vencimiento.',
      });
    } else if (daysLeft <= 60 && daysLeft > 30 && pendingQty > 0) {
      issues.push({
        severity: 'warning',
        fractionCode: imp.fractionCode,
        message: `Vence en ${daysLeft} días`,
        detail: `Pedimento ${imp.pedimento}: ${pendingQty} ${imp.unit} pendientes. Valor: $${imp.customsValue.toLocaleString()} USD.`,
        recommendation: 'Planificar descargo dentro de los próximos 30 días.',
      });
    }
  }

  // Regla 2: Descargos exceden importación
  for (const bal of balances) {
    if (bal.balance < 0) {
      issues.push({
        severity: 'critical',
        fractionCode: bal.fractionCode,
        message: `Descargos exceden importaciones`,
        detail: `Fracción ${bal.fractionCode}: importado ${bal.totalImported} ${bal.unit}, descargado ${bal.totalDischarged} ${bal.unit}. Diferencia: ${Math.abs(bal.balance)} ${bal.unit}.`,
        recommendation: 'Verificar pedimentos de descargo. Posible error de captura o pedimento duplicado.',
      });
    }
  }

  // Regla 3: Importaciones sin ningún descargo después de 6 meses
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const staleImports = await prisma.temporaryImport.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      quantityDischarged: 0,
      entryDate: { lte: sixMonthsAgo },
    },
  });

  for (const imp of staleImports) {
    const monthsOld = Math.floor(
      (now.getTime() - imp.entryDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    issues.push({
      severity: 'warning',
      fractionCode: imp.fractionCode,
      message: `${monthsOld} meses sin movimiento`,
      detail: `Pedimento ${imp.pedimento}: ${imp.quantity} ${imp.unit} importadas hace ${monthsOld} meses sin ningún descargo.`,
      recommendation: 'Verificar si la mercancía sigue en planta o si falta capturar descargos.',
    });
  }

  // Enriquecer con IA si hay issues relevantes
  if (issues.length > 0) {
    try {
      const client = getAnthropicClient();
      const summaryData = issues.slice(0, 20).map(i => `[${i.severity}] ${i.fractionCode}: ${i.message} - ${i.detail}`).join('\n');

      const aiResponse = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: `Eres un experto en comercio exterior mexicano, especialista en programas IMMEX y control de inventarios Anexo 24.
Analiza las inconsistencias detectadas en el inventario de importaciones temporales y genera un resumen ejecutivo con prioridades de acción.
Responde en español, de forma directa y accionable. Formato: párrafo corto con las 3 acciones más urgentes.`,
        messages: [{
          role: 'user',
          content: `Inconsistencias detectadas en inventario IMMEX:\n${summaryData}`,
        }],
      });

      const aiSummary = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '';
      return { issues, aiSummary, total: issues.length };
    } catch {
      return { issues, aiSummary: null, total: issues.length };
    }
  }

  return { issues, aiSummary: null, total: 0 };
}

// ============================================
// Generar reporte Anexo 24
// ============================================

export async function generateAnnex24Report(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  period: string
) {
  const imports = await prisma.temporaryImport.findMany({
    where: {
      tenantId,
      entryDate: { gte: periodStart, lte: periodEnd },
    },
    include: { discharges: true },
    orderBy: { entryDate: 'asc' },
  });

  const discharges = await prisma.discharge.findMany({
    where: {
      tenantId,
      dischargeDate: { gte: periodStart, lte: periodEnd },
    },
    include: { temporaryImport: { select: { pedimento: true, fractionCode: true } } },
    orderBy: { dischargeDate: 'asc' },
  });

  // Agrupar por fracción
  const fractionSummary = new Map<string, {
    fractionCode: string;
    description: string;
    unit: string;
    importedQty: number;
    importedValue: number;
    dischargedQty: number;
    dischargedValue: number;
    balance: number;
    operations: {
      type: 'import' | 'discharge';
      pedimento: string;
      date: string;
      quantity: number;
      value: number;
    }[];
  }>();

  for (const imp of imports) {
    const entry = fractionSummary.get(imp.fractionCode) || {
      fractionCode: imp.fractionCode,
      description: imp.description,
      unit: imp.unit,
      importedQty: 0,
      importedValue: 0,
      dischargedQty: 0,
      dischargedValue: 0,
      balance: 0,
      operations: [],
    };
    entry.importedQty += imp.quantity;
    entry.importedValue += imp.customsValue;
    entry.operations.push({
      type: 'import',
      pedimento: imp.pedimento,
      date: imp.entryDate.toISOString(),
      quantity: imp.quantity,
      value: imp.customsValue,
    });
    fractionSummary.set(imp.fractionCode, entry);
  }

  for (const dis of discharges) {
    const fc = dis.temporaryImport.fractionCode;
    const entry = fractionSummary.get(fc);
    if (entry) {
      entry.dischargedQty += dis.quantity;
      entry.dischargedValue += dis.customsValue || 0;
      entry.operations.push({
        type: 'discharge',
        pedimento: dis.pedimento || 'S/N',
        date: dis.dischargeDate.toISOString(),
        quantity: dis.quantity,
        value: dis.customsValue || 0,
      });
    }
  }

  // Calcular balances
  for (const entry of fractionSummary.values()) {
    entry.balance = entry.importedQty - entry.dischargedQty;
  }

  const reportData = {
    period,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    generatedAt: new Date().toISOString(),
    fractions: Array.from(fractionSummary.values()),
    summary: {
      totalFractions: fractionSummary.size,
      totalImportedQty: Array.from(fractionSummary.values()).reduce((s, f) => s + f.importedQty, 0),
      totalImportedValue: Array.from(fractionSummary.values()).reduce((s, f) => s + f.importedValue, 0),
      totalDischargedQty: Array.from(fractionSummary.values()).reduce((s, f) => s + f.dischargedQty, 0),
      totalDischargedValue: Array.from(fractionSummary.values()).reduce((s, f) => s + f.dischargedValue, 0),
    },
  };

  const report = await prisma.annex24Report.create({
    data: {
      period,
      periodStart,
      periodEnd,
      totalImports: imports.length,
      totalDischarges: discharges.length,
      totalValueUSD: reportData.summary.totalImportedValue,
      reportData: JSON.stringify(reportData),
      status: 'GENERATED',
      tenantId,
    },
  });

  return { report, data: reportData };
}

// ============================================
// Estado de cuenta Anexo 30
// ============================================

export async function getAnnex30Account(tenantId: string) {
  // Obtener o crear cuenta del período actual
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const currentPeriod = `${now.getFullYear()}-Q${quarter}`;

  let account = await prisma.annex30Account.findFirst({
    where: { tenantId, period: currentPeriod },
  });

  // Calcular totales de importaciones activas para créditos diferidos
  const activeImports = await prisma.temporaryImport.findMany({
    where: { tenantId, status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] } },
  });

  const totalValue = activeImports.reduce((s, i) => s + i.customsValue, 0);
  // Estimaciones de impuestos diferidos (tasas promedio)
  const igiDeferred = totalValue * 0.05; // ~5% IGI promedio IMMEX
  const dtaDeferred = totalValue * 0.008; // 0.8% DTA
  const ivaDeferred = totalValue * 0.16; // 16% IVA

  // Descargos con impuestos pagados (ventas nacionales, cambios de régimen)
  const paidDischarges = await prisma.discharge.findMany({
    where: {
      tenantId,
      type: { in: ['DOMESTIC_SALE', 'REGIME_CHANGE'] },
      taxesPaid: { not: null },
    },
  });
  const totalDebits = paidDischarges.reduce((s, d) => s + (d.taxesPaid || 0), 0);

  const data = {
    period: currentPeriod,
    totalCredits: igiDeferred + dtaDeferred + ivaDeferred,
    totalGuarantees: 0,
    totalDebits,
    balance: (igiDeferred + dtaDeferred + ivaDeferred) - totalDebits,
    igiDeferred,
    dtaDeferred,
    ivaDeferred,
  };

  if (account) {
    account = await prisma.annex30Account.update({
      where: { id: account.id },
      data,
    });
  } else {
    account = await prisma.annex30Account.create({
      data: { ...data, tenantId },
    });
  }

  return account;
}

// ============================================
// Dashboard stats
// ============================================

export async function getInventoryStats(tenantId: string) {
  const now = new Date();

  const [totalImports, activeImports, totalDischarges, expiringCount] = await Promise.all([
    prisma.temporaryImport.count({ where: { tenantId } }),
    prisma.temporaryImport.count({ where: { tenantId, status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] } } }),
    prisma.discharge.count({ where: { tenantId } }),
    prisma.temporaryImport.count({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] },
        expirationDate: { lte: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const activeImportsList = await prisma.temporaryImport.findMany({
    where: { tenantId, status: { in: ['ACTIVE', 'PARTIALLY_DISCHARGED'] } },
  });

  const totalValueActive = activeImportsList.reduce((s, i) => s + i.customsValue, 0);
  const totalPendingQty = activeImportsList.reduce((s, i) => s + (i.quantity - i.quantityDischarged), 0);

  return {
    totalImports,
    activeImports,
    totalDischarges,
    expiringIn90Days: expiringCount,
    totalValueActive,
    totalPendingQty,
  };
}
