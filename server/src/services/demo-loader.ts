/**
 * Demo loader: materializa fixtures de DemoData en registros reales por tenant
 * y los borra cuando se limpia. Cada registro creado lleva isDemoData=true
 * para borrado quirúrgico.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { buildDemoDataset, DemoDataset } from './demo-fixtures';

export const DEMO_TENANT_ID = 'demo-tenant';

// ──────────────────────────────────────────────────────────────────────────
// Seeding fixtures into DemoData table
// ──────────────────────────────────────────────────────────────────────────

/**
 * Vuelca el dataset construido a la tabla DemoData (una fila por categoría).
 * Idempotente: borra y reescribe.
 */
export async function seedDemoFixtures(prisma: PrismaClient | Prisma.TransactionClient): Promise<void> {
  const dataset = buildDemoDataset();

  await prisma.demoData.deleteMany({});

  const rows: { category: string; data: unknown }[] = [
    { category: 'company', data: dataset.company },
    { category: 'inventory', data: dataset.inventory },
    { category: 'discharges', data: dataset.discharges },
    { category: 'fiscal', data: dataset.fiscal },
    { category: 'guarantees', data: dataset.guarantees },
    { category: 'certification', data: dataset.certification },
    { category: 'classifications', data: dataset.classifications },
    { category: 'quotes', data: dataset.quotes },
    { category: 'operations', data: dataset.operations },
    { category: 'mve', data: dataset.mve },
    { category: 'coves', data: dataset.coves },
    { category: 'logistics', data: dataset.logistics },
    { category: 'alerts', data: dataset.alerts },
    { category: 'products', data: dataset.products },
    { category: 'bom', data: dataset.bom },
    { category: 'assemblies', data: dataset.assemblies },
  ];

  for (const row of rows) {
    await prisma.demoData.create({
      data: {
        category: row.category,
        data: row.data as Prisma.InputJsonValue,
        active: true,
      },
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Loading demo data into a tenant
// ──────────────────────────────────────────────────────────────────────────

interface LoadOptions {
  /** Si true, borra demo data existente antes de cargar. Default: true */
  replaceExisting?: boolean;
  /** Sector industrial — overridea descripciones y fracciones con el catálogo del perfil. */
  profileCode?: string;
}

export interface LoadResult {
  imports: number;
  discharges: number;
  taxCredits: number;
  guarantees: number;
  certification: number;
  classifications: number;
  quotes: number;
  operations: number;
  mves: number;
  coves: number;
  loadPlans: number;
  alerts: number;
  products: number;
  bom: number;
  assemblies: number;
}

/**
 * Lee DemoData (o reconstruye si está vacía) y crea registros reales bajo el tenant.
 * Necesita un userId existente del tenant para los modelos que tienen userId required.
 */
export async function loadDemoIntoTenant(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  opts: LoadOptions = {},
): Promise<LoadResult> {
  const replaceExisting = opts.replaceExisting !== false;

  if (replaceExisting) {
    await clearDemoFromTenant(prisma, tenantId);
  }

  const dataset = await readOrBuildDataset(prisma);

  const result: LoadResult = {
    imports: 0, discharges: 0, taxCredits: 0, guarantees: 0, certification: 0,
    classifications: 0, quotes: 0, operations: 0, mves: 0, coves: 0,
    loadPlans: 0, alerts: 0, products: 0, bom: 0, assemblies: 0,
  };

  // 1) Temporary Imports — recoger IDs por índice
  const importIdByIndex = new Map<number, string>();
  for (const imp of dataset.inventory) {
    const created = await prisma.temporaryImport.create({
      data: {
        pedimento: imp.pedimento,
        fractionCode: imp.fractionCode,
        description: imp.description,
        quantity: imp.quantity,
        unit: imp.unit,
        customsValue: imp.customsValue,
        valueMXN: imp.valueMXN,
        supplier: imp.supplier,
        originCountry: imp.originCountry,
        entryDate: new Date(imp.entryDate),
        expirationDate: new Date(imp.expirationDate),
        expirationMonths: imp.expirationMonths,
        quantityDischarged: imp.quantityDischarged,
        status: imp.status,
        notes: imp.notes,
        isDemoData: true,
        tenantId,
        userId,
      },
    });
    importIdByIndex.set(imp.index, created.id);
    result.imports++;
  }

  // 2) Discharges — link por importIndex
  for (const dis of dataset.discharges) {
    const importId = importIdByIndex.get(dis.importIndex);
    if (!importId) continue;
    await prisma.discharge.create({
      data: {
        type: dis.type,
        pedimento: dis.pedimento,
        quantity: dis.quantity,
        unit: dis.unit,
        customsValue: dis.customsValue,
        dischargeDate: new Date(dis.dischargeDate),
        destinationCountry: dis.destinationCountry,
        buyerName: dis.buyerName,
        taxesPaid: dis.taxesPaid,
        notes: dis.notes,
        isDemoData: true,
        temporaryImportId: importId,
        tenantId,
        userId,
      },
    });
    result.discharges++;
  }

  // 3) Tax Credits
  for (const tc of dataset.fiscal) {
    await prisma.taxCredit.create({
      data: {
        pedimento: tc.pedimento,
        fractionCode: tc.fractionCode,
        ivaAmount: tc.ivaAmount,
        iepsAmount: tc.iepsAmount,
        creditDate: new Date(tc.creditDate),
        status: tc.status,
        dischargeDeadline: new Date(tc.dischargeDeadline),
        discharged: tc.discharged,
        remaining: tc.remaining,
        notes: tc.notes,
        isDemoData: true,
        tenantId,
      },
    });
    result.taxCredits++;
  }

  // 4) Guarantees
  for (const g of dataset.guarantees) {
    await prisma.guarantee.create({
      data: {
        type: g.type,
        amount: g.amount,
        institution: g.institution,
        referenceNumber: g.referenceNumber,
        issueDate: new Date(g.issueDate),
        expiryDate: new Date(g.expiryDate),
        status: g.status,
        notes: g.notes,
        isDemoData: true,
        tenantId,
      },
    });
    result.guarantees++;
  }

  // 5) Certification
  if (dataset.certification) {
    const c = dataset.certification;
    await prisma.certificationProfile.upsert({
      where: { tenantId },
      update: {
        modality: c.modality,
        certNumber: c.certNumber,
        issueDate: new Date(c.issueDate),
        expiryDate: new Date(c.expiryDate),
        renewalDeadline: new Date(c.renewalDeadline),
        status: c.status,
        notes: c.notes,
        isDemoData: true,
      },
      create: {
        tenantId,
        modality: c.modality,
        certNumber: c.certNumber,
        issueDate: new Date(c.issueDate),
        expiryDate: new Date(c.expiryDate),
        renewalDeadline: new Date(c.renewalDeadline),
        status: c.status,
        notes: c.notes,
        isDemoData: true,
      },
    });
    result.certification = 1;
  }

  // 6) Classifications
  for (const cl of dataset.classifications) {
    await prisma.classification.create({
      data: {
        inputDescription: cl.inputDescription,
        inputContext: cl.inputContext,
        fractionCode: cl.fractionCode,
        fractionDescription: cl.fractionDescription,
        confidence: cl.confidence,
        griApplied: cl.griApplied,
        feedback: cl.feedback,
        createdAt: new Date(cl.createdAt),
        isDemoData: true,
        tenantId,
        userId,
      },
    });
    result.classifications++;
  }

  // 7) Quotes
  for (const q of dataset.quotes) {
    await prisma.quote.create({
      data: {
        fractionCode: q.fractionCode,
        customsValue: q.customsValue,
        origin: q.origin,
        incoterm: q.incoterm,
        currency: q.currency,
        result: q.result,
        createdAt: new Date(q.createdAt),
        isDemoData: true,
        tenantId,
        userId,
      },
    });
    result.quotes++;
  }

  // 8) Operations + documents (cascada al borrar la operación)
  for (const op of dataset.operations) {
    await prisma.operation.create({
      data: {
        reference: op.reference,
        type: op.type,
        status: op.status,
        fractionCode: op.fractionCode,
        description: op.description,
        origin: op.origin,
        destination: op.destination,
        customsValue: op.customsValue,
        currency: op.currency,
        customsBroker: op.customsBroker,
        completeness: op.completeness,
        notes: op.notes,
        operationDate: new Date(op.operationDate),
        isDemoData: true,
        tenantId,
        userId,
        documents: {
          create: op.documents.map(d => ({
            name: d.name,
            type: d.type,
            status: d.status,
            required: d.required,
            fileName: d.fileName,
          })),
        },
      },
    });
    result.operations++;
  }

  // 9) MVE + COVE
  const mveIdByIndex = new Map<number, string>();
  for (const mve of dataset.mve) {
    const created = await prisma.manifestacionValor.create({
      data: {
        pedimento: mve.pedimento,
        providerName: mve.providerName,
        providerCountry: mve.providerCountry,
        invoiceNumber: mve.invoiceNumber,
        invoiceDate: new Date(mve.invoiceDate),
        incoterm: mve.incoterm,
        currency: mve.currency,
        exchangeRate: mve.exchangeRate,
        invoiceValue: mve.invoiceValue,
        freightValue: mve.freightValue,
        insuranceValue: mve.insuranceValue,
        otherIncrements: mve.otherIncrements,
        customsValue: mve.customsValue,
        hasVinculacion: mve.hasVinculacion,
        vinculacionDesc: mve.vinculacionDesc,
        status: mve.status,
        riskLevel: mve.riskLevel,
        signedAt: mve.signedAt ? new Date(mve.signedAt) : null,
        transmittedAt: mve.transmittedAt ? new Date(mve.transmittedAt) : null,
        createdAt: new Date(mve.createdAt),
        isDemoData: true,
        tenantId,
      },
    });
    mveIdByIndex.set(mve.index, created.id);
    result.mves++;
  }
  for (const cove of dataset.coves) {
    const mveId = mveIdByIndex.get(cove.mveIndex);
    if (!mveId) continue;
    await prisma.cOVE.create({
      data: {
        eDocument: cove.eDocument,
        invoiceNumber: cove.invoiceNumber,
        providerTaxId: cove.providerTaxId,
        value: cove.value,
        currency: cove.currency,
        validated: cove.validated,
        validationDate: cove.validationDate ? new Date(cove.validationDate) : null,
        isDemoData: true,
        mveId,
        tenantId,
      },
    });
    result.coves++;
  }

  // 10) Load Plans + items (cascade)
  for (const lp of dataset.logistics) {
    await prisma.loadPlan.create({
      data: {
        name: lp.name,
        containerType: lp.containerType,
        containerLength: lp.containerLength,
        containerWidth: lp.containerWidth,
        containerHeight: lp.containerHeight,
        maxWeight: lp.maxWeight,
        totalItems: lp.totalItems,
        totalVolume: lp.totalVolume,
        totalWeight: lp.totalWeight,
        volumeUsed: lp.volumeUsed,
        weightUsed: lp.weightUsed,
        status: lp.status,
        createdAt: new Date(lp.createdAt),
        isDemoData: true,
        tenantId,
        items: {
          create: lp.items.map(i => ({
            description: i.description,
            quantity: i.quantity,
            length: i.length,
            width: i.width,
            height: i.height,
            weight: i.weight,
            stackable: i.stackable,
            fragile: i.fragile,
          })),
        },
      },
    });
    result.loadPlans++;
  }

  // 11) Alerts inteligentes — generadas a partir de los datos reales del tenant
  //    (imports/credits/guarantees ya cargados arriba). Reemplaza el viejo
  //    fixture de plantillas genéricas con cálculo de impacto específico.

  // 12) Products + BOM + Assemblies (BOM consume del inventario IMMEX FIFO)
  if (dataset.products?.length) {
    const productIdByCode = new Map<string, string>();
    for (const p of dataset.products) {
      const created = await prisma.product.create({
        data: {
          tenantId,
          productCode: p.productCode,
          description: p.description,
          fractionCode: p.fractionCode,
          unit: p.unit,
          isFinished: p.isFinished,
          isDemoData: true,
        },
      });
      productIdByCode.set(p.productCode, created.id);
      result.products++;
    }

    if (dataset.bom?.length) {
      for (const line of dataset.bom) {
        const productId = productIdByCode.get(line.productCode);
        const componentId = productIdByCode.get(line.componentCode);
        if (!productId || !componentId) continue;
        await prisma.productComponent.create({
          data: {
            productId,
            componentId,
            quantity: line.quantity,
            unit: line.unit,
            scrapPercent: line.scrapPercent,
          },
        });
        result.bom++;
      }
    }

    if (dataset.assemblies?.length) {
      const { recordAssembly } = await import('./bom-service');
      for (const asm of dataset.assemblies) {
        const productId = productIdByCode.get(asm.productCode);
        if (!productId) continue;
        try {
          await recordAssembly({
            tenantId,
            productId,
            quantity: asm.quantity,
            assemblyDate: new Date(asm.assemblyDate),
            reference: asm.reference,
            notes: asm.notes,
            isDemoData: true,
          });
          result.assemblies++;
        } catch {
          // En demo: si no hay inventario suficiente, skip silencioso
        }
      }
    }
  }

  // Si hay profileCode, sobreescribe descripciones/fracciones de imports y clasificaciones
  // recientes con productos del catálogo del perfil, para que el demo sea temático.
  if (opts.profileCode) {
    try {
      const profile = await prisma.demoProfile.findUnique({ where: { industryCode: opts.profileCode } });
      if (profile) {
        const catalog = (profile.productCatalog as { sku: string; description: string; fraction: string }[]) ?? [];
        if (catalog.length > 0) {
          // Update imports recientes (últimos 50)
          const imports = await prisma.temporaryImport.findMany({
            where: { tenantId, isDemoData: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: { id: true },
          });
          for (let i = 0; i < imports.length; i++) {
            const item = catalog[i % catalog.length]!;
            await prisma.temporaryImport.update({
              where: { id: imports[i]!.id },
              data: { description: item.description, fractionCode: item.fraction },
            });
          }
          // Update classifications recientes (top 30)
          const classes = await prisma.classification.findMany({
            where: { tenantId, isDemoData: true },
            orderBy: { createdAt: 'desc' },
            take: 30,
            select: { id: true },
          });
          for (let i = 0; i < classes.length; i++) {
            const item = catalog[i % catalog.length]!;
            await prisma.classification.update({
              where: { id: classes[i]!.id },
              data: { inputDescription: item.description, fractionCode: item.fraction },
            });
          }
          // Update quotes recientes (top 20)
          const quotes = await prisma.quote.findMany({
            where: { tenantId, isDemoData: true },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { id: true },
          });
          for (let i = 0; i < quotes.length; i++) {
            const item = catalog[i % catalog.length]!;
            await prisma.quote.update({
              where: { id: quotes[i]!.id },
              data: { fractionCode: item.fraction },
            });
          }
        }
      }
    } catch (e) {
      console.warn('[demo-loader] No se pudo aplicar profile override:', e instanceof Error ? e.message : e);
    }
  }

  // Regenera alertas inteligentes ahora que imports/credits/guarantees están cargados
  try {
    const { regenerateAlerts } = await import('./alert-generator');
    const alertResult = await regenerateAlerts(tenantId, true);
    result.alerts = alertResult.inserted + alertResult.updated;
  } catch (e) {
    console.warn('[demo-loader] No se pudieron regenerar alertas inteligentes:', e instanceof Error ? e.message : e);
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────
// Cleaning demo data from a tenant
// ──────────────────────────────────────────────────────────────────────────

export interface ClearResult {
  imports: number;
  discharges: number;
  taxCredits: number;
  creditUsages: number;
  guarantees: number;
  certification: number;
  classifications: number;
  quotes: number;
  operations: number;
  mves: number;
  coves: number;
  loadPlans: number;
  alerts: number;
  products: number;
  assemblies: number;
}

/**
 * Borra todos los registros con isDemoData=true del tenant.
 * Orden importa por las FK sin cascade (Discharge→TemporaryImport, COVE→MVE,
 * CreditUsage→TaxCredit). Operation→Document y LoadPlan→LoadItem sí cascadean.
 */
export async function clearDemoFromTenant(prisma: PrismaClient, tenantId: string): Promise<ClearResult> {
  const where = { tenantId, isDemoData: true };

  // Assemblies y AssemblyConsumption primero (cascade en consumptions)
  const assemblies = await prisma.assembly.deleteMany({ where });
  // ProductComponent: la relación `component` NO cascadea, hay que borrar manualmente
  // las componentes que apuntan a productos demo del tenant.
  const demoProductIds = (await prisma.product.findMany({
    where, select: { id: true },
  })).map(p => p.id);
  if (demoProductIds.length > 0) {
    await prisma.productComponent.deleteMany({
      where: { OR: [{ productId: { in: demoProductIds } }, { componentId: { in: demoProductIds } }] },
    });
  }
  const products = await prisma.product.deleteMany({ where });

  const discharges = await prisma.discharge.deleteMany({ where });
  const imports = await prisma.temporaryImport.deleteMany({ where });

  const creditUsages = await prisma.creditUsage.deleteMany({ where });
  const taxCredits = await prisma.taxCredit.deleteMany({ where });

  const coves = await prisma.cOVE.deleteMany({ where });
  const mves = await prisma.manifestacionValor.deleteMany({ where });

  const operations = await prisma.operation.deleteMany({ where });
  const loadPlans = await prisma.loadPlan.deleteMany({ where });

  const classifications = await prisma.classification.deleteMany({ where });
  const quotes = await prisma.quote.deleteMany({ where });
  const guarantees = await prisma.guarantee.deleteMany({ where });
  const alerts = await prisma.alert.deleteMany({ where });

  // CertificationProfile es 1:1 con tenant, solo borra si era demo
  const cert = await prisma.certificationProfile.deleteMany({ where });

  return {
    imports: imports.count,
    discharges: discharges.count,
    taxCredits: taxCredits.count,
    creditUsages: creditUsages.count,
    guarantees: guarantees.count,
    certification: cert.count,
    classifications: classifications.count,
    quotes: quotes.count,
    operations: operations.count,
    mves: mves.count,
    coves: coves.count,
    loadPlans: loadPlans.count,
    alerts: alerts.count,
    products: products.count,
    assemblies: assemblies.count,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Reset DEMO_TENANT (limpia y recarga)
// ──────────────────────────────────────────────────────────────────────────

export async function resetDemoTenant(prisma: PrismaClient): Promise<{ tenantId: string; loaded: LoadResult }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: DEMO_TENANT_ID },
    include: { users: { where: { role: 'ADMIN' }, take: 1 } },
  });
  if (!tenant) {
    throw new Error(`Tenant ${DEMO_TENANT_ID} no existe. Corre 'npm run db:seed' primero.`);
  }
  const adminUser = tenant.users[0];
  if (!adminUser) {
    throw new Error(`Tenant ${DEMO_TENANT_ID} no tiene usuario admin.`);
  }

  await clearDemoFromTenant(prisma, DEMO_TENANT_ID);
  const loaded = await loadDemoIntoTenant(prisma, DEMO_TENANT_ID, adminUser.id, { replaceExisting: false });
  return { tenantId: DEMO_TENANT_ID, loaded };
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

async function readOrBuildDataset(prisma: PrismaClient | Prisma.TransactionClient): Promise<DemoDataset> {
  const rows = await prisma.demoData.findMany({ where: { active: true } });
  if (rows.length === 0) {
    return buildDemoDataset();
  }
  const byCat = new Map<string, unknown>(rows.map(r => [r.category, r.data as unknown]));
  const get = <T>(key: string, fallback: T): T => (byCat.get(key) as T | undefined) ?? fallback;
  return {
    company: get('company', buildDemoDataset().company),
    inventory: get<DemoDataset['inventory']>('inventory', []),
    discharges: get<DemoDataset['discharges']>('discharges', []),
    fiscal: get<DemoDataset['fiscal']>('fiscal', []),
    guarantees: get<DemoDataset['guarantees']>('guarantees', []),
    certification: get<DemoDataset['certification'] | null>('certification', null) as DemoDataset['certification'],
    classifications: get<DemoDataset['classifications']>('classifications', []),
    quotes: get<DemoDataset['quotes']>('quotes', []),
    operations: get<DemoDataset['operations']>('operations', []),
    mve: get<DemoDataset['mve']>('mve', []),
    coves: get<DemoDataset['coves']>('coves', []),
    logistics: get<DemoDataset['logistics']>('logistics', []),
    alerts: get<DemoDataset['alerts']>('alerts', []),
    products: get<DemoDataset['products']>('products', []),
    bom: get<DemoDataset['bom']>('bom', []),
    assemblies: get<DemoDataset['assemblies']>('assemblies', []),
  };
}
