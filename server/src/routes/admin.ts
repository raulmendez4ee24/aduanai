import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error';
import { seedTenantRoles } from '../services/permissions';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  sendDemoInviteEmail,
  sendDemoSummaryEmail,
  sendPilotActivatedEmail,
  sendContractActivatedEmail,
} from '../lib/email';
import {
  loadDemoIntoTenant,
  clearDemoFromTenant,
  resetDemoTenant,
  DEMO_TENANT_ID,
} from '../services/demo-loader';

export const adminRouter = Router();

// All admin routes require auth + ADMIN or SUPERADMIN role
adminRouter.use(authenticate);
adminRouter.use(requireRole('SUPERADMIN'));

// ── Industry product mapping ──────────────────────────────────────────────────

const INDUSTRY_PRODUCTS: Record<string, string[]> = {
  maquiladora: [
    'Arnés de cables para automóvil, cobre con conectores plásticos',
    'Motor eléctrico 12V DC para asiento automotriz',
    'Tablero de instrumentos plástico inyectado para vehículo',
    'Sensor de temperatura NTC para sistema de aire acondicionado automotriz',
    'Tornillos hexagonales de acero inoxidable M8x25mm',
  ],
  importador: [
    'Laptop HP 15 pulgadas, Intel i7, 16GB RAM, SSD 512GB',
    'Zapatos deportivos Nike para hombre, suela de caucho, upper textil',
    'Juego de herramientas manuales Stanley, 150 piezas en maletín',
    'Aceite de oliva extra virgen, botella de vidrio 1 litro, origen España',
    'Cámara de seguridad IP, resolución 4K, visión nocturna, exterior',
  ],
  exportador: [
    'Aguacate Hass fresco, calibre 60, empaque de cartón corrugado',
    'Tequila reposado 100% agave, botella 750ml, 40% alc. vol.',
    'Cerveza artesanal IPA, lata aluminio 355ml, 6.5% alc.',
    'Arnés automotriz con 45 circuitos, conectores Molex',
    'Joyería de plata .925 con incrustaciones de piedra turquesa',
  ],
  agencia_aduanal: [
    'Contenedor de 20 pies con mercancía mixta: textiles y electrónicos',
    'Químico industrial: ácido sulfúrico al 98%, tambores de 200L',
    'Maquinaria CNC: torno horizontal, peso 3,500 kg, marca Haas',
    'Materia prima: pellets de polipropileno virgen, 25 toneladas',
    'Alimento para mascota: croquetas premium, sacos de 20kg',
  ],
  logistica: [
    'Pallet de 48 cajas con electrodomésticos pequeños variados',
    'Rollo de acero galvanizado, 1.2mm espesor, 1,200mm ancho',
    'Contenedor refrigerado con 18 toneladas de carne de res congelada',
    'Carga sobredimensionada: turbina eólica, aspa de 60 metros',
    'Paquetería express: 200 paquetes individuales, documentos y muestras',
  ],
  automotriz: [
    'Motor V6 3.5L gasolina completo para ensamble de vehículo',
    'Transmisión automática de 8 velocidades, reconstruida',
    'Llanta radial 225/65 R17 para SUV, marca Continental',
    'Parabrisas laminado para sedan, con sensor de lluvia integrado',
    'Catalizador con recubrimiento de platino para sistema de escape',
  ],
  alimentos: [
    'Leche en polvo descremada, sacos de 25kg, origen Nueva Zelanda',
    'Salmón del Atlántico congelado, filetes sin piel, cajas 10kg',
    'Almendras peladas crudas, sacos de 22.68kg, origen California',
    'Aceite de palma refinado, tambores de 200 litros, origen Malasia',
    'Suplemento proteico whey isolate, botes de 2lb, sabor chocolate',
  ],
  textil: [
    'Tela de algodón 100%, tejido plano, 150cm ancho, teñida azul marino',
    'Playeras de algodón/poliéster 60/40, estampadas, para hombre talla M',
    'Jeans de mezclilla índigo, 12 onzas, corte recto, para mujer',
    'Hilo de poliéster texturizado, 150 denier, conos de 5kg',
    'Tela no tejida de polipropileno para cubrebocas, rollo 50m',
  ],
  electronica: [
    'Circuito impreso PCB multicapa con componentes SMD soldados',
    'Pantalla LCD 15.6 pulgadas para laptop, resolución Full HD',
    'Batería de litio-ion 5000mAh, 3.7V, para teléfono móvil',
    'Chip microcontrolador ARM Cortex-M4, empaque QFP-64',
    'Cable USB-C a USB-C, 1 metro, carga rápida 100W, nylon trenzado',
  ],
  farmaceutica: [
    'Paracetamol materia prima USP, tambores de 25kg',
    'Jeringa desechable 10ml con aguja 21G, caja de 100 unidades',
    'Equipo de diagnóstico: glucómetro digital con 50 tiras reactivas',
    'Suplemento vitamínico: Vitamina D3 5000 UI, frasco 120 cápsulas',
    'Vendaje elástico autoadherente, rollos 10cm x 4.5m, caja 12 unidades',
  ],
};

const DEFAULT_PRODUCTS = [
  'Laptop Dell 15 pulgadas, procesador Intel i7, 16GB RAM, SSD 512GB',
  'Zapatos de seguridad industrial, punta de acero, suela antiderrapante',
  'Aceite de motor sintético 5W-30, garrafa de 4 litros',
  'Impresora multifuncional láser color, velocidad 30 ppm',
  'Caja de cartón corrugado doble pared, 60x40x40 cm, para exportación',
];

// ── POST /api/admin/demo/prepare ──────────────────────────────────────────────

adminRouter.post('/demo/prepare', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { leadId } = req.body as { leadId: string };
    if (!leadId) throw new AppError('leadId es requerido', 400);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new AppError('Lead no encontrado', 404);

    // Generate temp credentials
    const tempEmail = `demo-${leadId.slice(0, 8)}@aduanai-demo.com`;
    const tempPassword = crypto.randomBytes(4).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Get products for their industry
    const products = (lead.industry && INDUSTRY_PRODUCTS[lead.industry]) ? INDUSTRY_PRODUCTS[lead.industry] : DEFAULT_PRODUCTS;

    // Create tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: `Demo - ${lead.company || lead.name}`,
        plan: 'STARTER',
      },
    });

    await seedTenantRoles(tenant.id);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: tempEmail,
        password: hashedPassword,
        name: lead.name,
        role: 'ADMIN',
        emailVerified: true,
        status: 'VERIFIED',
        tenantId: tenant.id,
      },
    });

    // Expiry: now + 48 hours
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // Create DemoAccount
    const demoAccount = await prisma.demoAccount.create({
      data: {
        leadId: lead.id,
        tenantId: tenant.id,
        userId: user.id,
        email: tempEmail,
        password: tempPassword,
        expiresAt,
        products,
      },
    });

    // Update lead status
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'demo_scheduled' },
    });

    res.json({
      demoAccount: {
        id: demoAccount.id,
        email: demoAccount.email,
        password: demoAccount.password,
        expiresAt: demoAccount.expiresAt,
        products: demoAccount.products,
      },
      lead: { ...lead, status: 'demo_scheduled' },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/demo/:id/send-invite ──────────────────────────────────────

adminRouter.post('/demo/:id/send-invite', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const demoAccount = await prisma.demoAccount.findUnique({ where: { id: String(req.params.id) } });
    if (!demoAccount) throw new AppError('Cuenta demo no encontrada', 404);

    const lead = await prisma.lead.findUnique({ where: { id: demoAccount.leadId } });
    if (!lead) throw new AppError('Lead no encontrado', 404);

    await sendDemoInviteEmail(lead.email, lead.name, demoAccount.email, demoAccount.password, demoAccount.expiresAt);

    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/demo/:id/complete ─────────────────────────────────────────

adminRouter.post('/demo/:id/complete', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { notes } = req.body as { notes?: string };

    const demoAccount = await prisma.demoAccount.findUnique({ where: { id: String(req.params.id) } });
    if (!demoAccount) throw new AppError('Cuenta demo no encontrada', 404);

    const lead = await prisma.lead.findUnique({ where: { id: demoAccount.leadId } });
    if (!lead) throw new AppError('Lead no encontrado', 404);

    // Get classifications made in the demo tenant
    const classifications = await prisma.classification.findMany({
      where: { tenantId: demoAccount.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    // Update lead status
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'demo_done', ...(notes ? { message: notes } : {}) },
    });

    // Send summary email
    const classificationSummary = classifications.map(c => ({
      description: c.inputDescription,
      fraction: c.fractionCode,
      confidence: Math.round(c.confidence),
    }));

    await sendDemoSummaryEmail(lead.email, lead.name, classificationSummary);

    res.json({ status: 'ok', classifications });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/demos ──────────────────────────────────────────────────────

adminRouter.get('/demos', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const demos = await prisma.demoAccount.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Attach lead info
    const leadIds = [...new Set(demos.map(d => d.leadId))];
    const leads = await prisma.lead.findMany({ where: { id: { in: leadIds } } });
    const leadsMap = Object.fromEntries(leads.map(l => [l.id, l]));

    const result = demos.map(d => ({ ...d, lead: leadsMap[d.leadId] || null }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/admin/demo/:id ────────────────────────────────────────────────

adminRouter.delete('/demo/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const demoAccount = await prisma.demoAccount.findUnique({ where: { id: String(req.params.id) } });
    if (!demoAccount) throw new AppError('Cuenta demo no encontrada', 404);

    // Deactivate demo account record
    await prisma.demoAccount.update({
      where: { id: String(req.params.id) },
      data: { active: false },
    });

    // Deactivate the demo tenant user
    await prisma.user.update({
      where: { id: demoAccount.userId },
      data: { active: false, status: 'SUSPENDED' },
    });

    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// DEMO DATASET — carga / limpieza de datos demo (Maquiladora Ejemplo)
// ════════════════════════════════════════════════════════════════════════════

// ── POST /api/admin/demo-data/load ────────────────────────────────────────────
// Body: { tenantId: string }
adminRouter.post('/demo-data/load', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.body as { tenantId?: string };
    if (!tenantId) throw new AppError('tenantId es requerido', 400);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { users: { where: { role: 'ADMIN' }, take: 1 } },
    });
    if (!tenant) throw new AppError('Tenant no encontrado', 404);

    const adminUser = tenant.users[0];
    if (!adminUser) throw new AppError('El tenant no tiene usuario admin', 400);

    const result = await loadDemoIntoTenant(prisma, tenantId, adminUser.id, { replaceExisting: true });
    res.json({ status: 'ok', data: { tenantId, loaded: result } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/demo-data/clear ───────────────────────────────────────────
// Body: { tenantId: string }
adminRouter.post('/demo-data/clear', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.body as { tenantId?: string };
    if (!tenantId) throw new AppError('tenantId es requerido', 400);

    // El DEMO_TENANT no se puede limpiar sin el reset (que solo SUPERADMIN puede correr)
    if (tenantId === DEMO_TENANT_ID && req.userRole !== 'SUPERADMIN') {
      throw new AppError('Solo SUPERADMIN puede limpiar el tenant demo. Usa reset-demo-tenant.', 403);
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError('Tenant no encontrado', 404);

    const result = await clearDemoFromTenant(prisma, tenantId);
    res.json({ status: 'ok', data: { tenantId, cleared: result } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/demo-data/reset-demo-tenant ───────────────────────────────
// Solo SUPERADMIN: limpia y recarga el demo-tenant con datos frescos
adminRouter.post('/demo-data/reset-demo-tenant', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'SUPERADMIN') {
      throw new AppError('Solo SUPERADMIN puede ejecutar reset-demo-tenant', 403);
    }
    const result = await resetDemoTenant(prisma);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/demo-data/status/:tenantId ─────────────────────────────────
// Devuelve cuántos registros demo hay actualmente en cada categoría
adminRouter.get('/demo-data/status/:tenantId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = String(req.params.tenantId);
    const where = { tenantId, isDemoData: true };
    const [
      imports, discharges, taxCredits, guarantees, certifications,
      classifications, quotes, operations, mves, coves, loadPlans, alerts,
    ] = await Promise.all([
      prisma.temporaryImport.count({ where }),
      prisma.discharge.count({ where }),
      prisma.taxCredit.count({ where }),
      prisma.guarantee.count({ where }),
      prisma.certificationProfile.count({ where }),
      prisma.classification.count({ where }),
      prisma.quote.count({ where }),
      prisma.operation.count({ where }),
      prisma.manifestacionValor.count({ where }),
      prisma.cOVE.count({ where }),
      prisma.loadPlan.count({ where }),
      prisma.alert.count({ where }),
    ]);
    const total = imports + discharges + taxCredits + guarantees + certifications +
                  classifications + quotes + operations + mves + coves + loadPlans + alerts;
    res.json({
      status: 'ok',
      data: {
        tenantId,
        total,
        loaded: total > 0,
        breakdown: {
          imports, discharges, taxCredits, guarantees, certifications,
          classifications, quotes, operations, mves, coves, loadPlans, alerts,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// FASE 4 — PILOTOS
// ════════════════════════════════════════════════════════════════════════════

const PILOT_DAYS = 30;
const PILOT_CLASSIFICATION_LIMIT = 100;
const PILOT_USER_LIMIT = 3;

// ── POST /api/admin/pilots/activate ───────────────────────────────────────────

adminRouter.post('/pilots/activate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { leadId, companyName } = req.body as { leadId: string; companyName?: string };
    if (!leadId) throw new AppError('leadId es requerido', 400);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new AppError('Lead no encontrado', 404);

    const cleanCompany = (companyName || lead.company || lead.name).trim();
    const tempEmail = `${cleanCompany.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}-${leadId.slice(0, 6)}@aduanai.mx`;
    const tempPassword = crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const now = new Date();
    const pilotEndsAt = new Date(now.getTime() + PILOT_DAYS * 86400000);

    const tenant = await prisma.tenant.create({
      data: {
        name: cleanCompany,
        plan: 'PILOT',
        status: 'PILOT',
        rfc: lead.rfc || null,
        pilotStartedAt: now,
        pilotEndsAt,
        classificationLimit: PILOT_CLASSIFICATION_LIMIT,
        userLimit: PILOT_USER_LIMIT,
        lastActivityAt: now,
        healthScore: 60,
        users: {
          create: {
            email: tempEmail,
            password: hashedPassword,
            name: lead.name,
            role: 'ADMIN',
            status: 'VERIFIED',
            emailVerified: true,
            phone: lead.phone || null,
            rfc: lead.rfc || null,
          },
        },
      },
      include: { users: true },
    });

    await seedTenantRoles(tenant.id);

    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'pilot' },
    });

    sendPilotActivatedEmail(
      lead.email,
      lead.name,
      cleanCompany,
      tempEmail,
      tempPassword,
      pilotEndsAt,
      PILOT_CLASSIFICATION_LIMIT,
    ).catch((err) => console.error('[email] sendPilotActivatedEmail error:', err));

    res.status(201).json({
      status: 'ok',
      data: {
        tenant: { id: tenant.id, name: tenant.name, plan: tenant.plan, pilotEndsAt: tenant.pilotEndsAt },
        credentials: { email: tempEmail, password: tempPassword },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/pilots ─────────────────────────────────────────────────────

adminRouter.get('/pilots', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { plan: 'PILOT' },
      orderBy: { pilotEndsAt: 'asc' },
      include: {
        users: { select: { id: true, email: true, name: true, lastLoginAt: true, active: true } },
        _count: { select: { classifications: true, users: true } },
      },
    });

    const now = Date.now();
    const data = tenants.map((t) => {
      const daysLeft = t.pilotEndsAt ? Math.max(0, Math.ceil((t.pilotEndsAt.getTime() - now) / 86400000)) : 0;
      return {
        id: t.id,
        name: t.name,
        status: t.status,
        pilotStartedAt: t.pilotStartedAt,
        pilotEndsAt: t.pilotEndsAt,
        daysLeft,
        classificationsUsed: t._count.classifications,
        classificationLimit: t.classificationLimit,
        usersCount: t._count.users,
        userLimit: t.userLimit,
        lastActivityAt: t.lastActivityAt,
        healthScore: t.healthScore,
        primaryUser: t.users[0] || null,
      };
    });

    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/pilots/:tenantId/extend ───────────────────────────────────

adminRouter.post('/pilots/:tenantId/extend', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { days } = req.body as { days?: number };
    const extraDays = Number(days) || 15;
    const tenant = await prisma.tenant.findUnique({ where: { id: String(req.params.tenantId) } });
    if (!tenant) throw new AppError('Empresa no encontrada', 404);
    if (tenant.plan !== 'PILOT') throw new AppError('La empresa no está en piloto', 400);

    const base = tenant.pilotEndsAt && tenant.pilotEndsAt > new Date() ? tenant.pilotEndsAt : new Date();
    const newEndsAt = new Date(base.getTime() + extraDays * 86400000);

    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        pilotEndsAt: newEndsAt,
        status: 'PILOT',
        active: true,
        pilotExpiredSentAt: null,
      },
    });

    await prisma.user.updateMany({
      where: { tenantId: tenant.id },
      data: { active: true, status: 'VERIFIED' },
    });

    res.json({ status: 'ok', data: { id: updated.id, pilotEndsAt: updated.pilotEndsAt } });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// FASE 5 — PROPUESTAS Y CONTRATOS
// ════════════════════════════════════════════════════════════════════════════

// ── POST /api/admin/proposals ─────────────────────────────────────────────────

adminRouter.post('/proposals', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { tenantId, leadId, plan, monthlyPrice, durationMonths, modules, conditions, supportTier } = req.body as {
      tenantId: string; leadId?: string; plan: string; monthlyPrice: number; durationMonths?: number;
      modules?: string[]; conditions?: string; supportTier?: string;
    };

    if (!tenantId || !plan || typeof monthlyPrice !== 'number') {
      throw new AppError('tenantId, plan y monthlyPrice son requeridos', 400);
    }

    const validPlans = ['PILOT', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'];
    if (!validPlans.includes(plan)) throw new AppError('Plan inválido', 400);

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError('Empresa no encontrada', 404);

    const proposal = await prisma.proposal.create({
      data: {
        tenantId,
        leadId: leadId || null,
        plan: plan as 'PILOT' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' | 'CUSTOM',
        monthlyPrice,
        durationMonths: durationMonths || 12,
        modules: modules || [],
        conditions: conditions || null,
        supportTier: supportTier || 'standard',
        status: 'DRAFT',
        expiresAt: new Date(Date.now() + 15 * 86400000),
      },
    });

    res.status(201).json({ status: 'ok', data: proposal });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/proposals ──────────────────────────────────────────────────

adminRouter.get('/proposals', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { tenantId, status } = req.query as { tenantId?: string; status?: string };
    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;
    const proposals = await prisma.proposal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { tenant: { select: { id: true, name: true } } },
    });
    res.json({ status: 'ok', data: proposals });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/contracts/activate ────────────────────────────────────────

adminRouter.post('/contracts/activate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { tenantId, plan, monthlyPrice, durationMonths, modules, startDate } = req.body as {
      tenantId: string; plan: string; monthlyPrice: number; durationMonths?: number;
      modules?: string[]; startDate?: string;
    };

    if (!tenantId || !plan || typeof monthlyPrice !== 'number') {
      throw new AppError('tenantId, plan y monthlyPrice son requeridos', 400);
    }

    const validPlans = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'];
    if (!validPlans.includes(plan)) throw new AppError('Plan inválido para contrato', 400);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { users: { where: { role: 'ADMIN' }, take: 1 } },
    });
    if (!tenant) throw new AppError('Empresa no encontrada', 404);

    const start = startDate ? new Date(startDate) : new Date();
    const months = durationMonths || 12;
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plan: plan as 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' | 'CUSTOM',
        status: 'ACTIVE',
        active: true,
        contractStartedAt: start,
        contractEndsAt: end,
        monthlyPrice,
        contractModules: modules || [],
        classificationLimit: null,
        userLimit: null,
        pilotExpiredSentAt: null,
      },
    });

    await prisma.user.updateMany({
      where: { tenantId, role: 'ADMIN' },
      data: { active: true, status: 'VERIFIED', onboardingCompleted: false, onboardingStep: 0 },
    });

    // Update lead if any
    const leadFromProposal = await prisma.proposal.findFirst({
      where: { tenantId, leadId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (leadFromProposal?.leadId) {
      await prisma.lead.update({
        where: { id: leadFromProposal.leadId },
        data: { status: 'converted' },
      }).catch(() => {});
    }

    // Mark pending proposals as accepted
    await prisma.proposal.updateMany({
      where: { tenantId, status: { in: ['DRAFT', 'SENT'] } },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    const primaryUser = tenant.users[0];
    if (primaryUser) {
      sendContractActivatedEmail(primaryUser.email, primaryUser.name, updated.name, plan, monthlyPrice, start)
        .catch((err) => console.error('[email] sendContractActivatedEmail error:', err));
    }

    res.json({ status: 'ok', data: updated });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// EMPRESAS (tenants)
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/tenants ────────────────────────────────────────────────────

adminRouter.get('/tenants', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { plan, status, search } = req.query as { plan?: string; status?: string; search?: string };
    const where: Record<string, unknown> = {};
    if (plan) where.plan = plan;
    if (status) where.status = status;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const tenants = await prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { classifications: true, users: true, quotes: true, operations: true } },
      },
    });

    const now = Date.now();
    const data = tenants.map((t) => {
      const pilotDaysLeft = t.pilotEndsAt ? Math.max(0, Math.ceil((t.pilotEndsAt.getTime() - now) / 86400000)) : null;
      const contractDaysLeft = t.contractEndsAt ? Math.ceil((t.contractEndsAt.getTime() - now) / 86400000) : null;
      const daysSinceLastActivity = t.lastActivityAt ? Math.floor((now - t.lastActivityAt.getTime()) / 86400000) : null;
      return {
        id: t.id,
        name: t.name,
        plan: t.plan,
        status: t.status,
        active: t.active,
        rfc: t.rfc,
        monthlyPrice: t.monthlyPrice,
        contractStartedAt: t.contractStartedAt,
        contractEndsAt: t.contractEndsAt,
        contractDaysLeft,
        pilotStartedAt: t.pilotStartedAt,
        pilotEndsAt: t.pilotEndsAt,
        pilotDaysLeft,
        classificationsUsed: t._count.classifications,
        classificationLimit: t.classificationLimit,
        usersCount: t._count.users,
        userLimit: t.userLimit,
        quotesCount: t._count.quotes,
        operationsCount: t._count.operations,
        healthScore: t.healthScore,
        lastActivityAt: t.lastActivityAt,
        daysSinceLastActivity,
        createdAt: t.createdAt,
      };
    });

    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/tenants/:id ────────────────────────────────────────────────

adminRouter.get('/tenants/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: String(req.params.id) },
      include: {
        users: {
          select: { id: true, email: true, name: true, role: true, status: true, active: true, lastLoginAt: true, createdAt: true },
        },
        proposals: { orderBy: { createdAt: 'desc' } },
        _count: { select: { classifications: true, quotes: true, operations: true, temporaryImports: true, manifestaciones: true, loadPlans: true } },
      },
    });
    if (!tenant) throw new AppError('Empresa no encontrada', 404);

    // Module usage breakdown
    const [classifCount, quoteCount, mveCount, tiCount, lpCount, opCount] = await Promise.all([
      prisma.classification.count({ where: { tenantId: tenant.id } }),
      prisma.quote.count({ where: { tenantId: tenant.id } }),
      prisma.manifestacionValor.count({ where: { tenantId: tenant.id } }),
      prisma.temporaryImport.count({ where: { tenantId: tenant.id } }),
      prisma.loadPlan.count({ where: { tenantId: tenant.id } }),
      prisma.operation.count({ where: { tenantId: tenant.id } }),
    ]);

    const moduleUsage = {
      classifier: classifCount,
      quoter: quoteCount,
      mve: mveCount,
      inventory: tiCount,
      logistics: lpCount,
      operations: opCount,
    };

    res.json({ status: 'ok', data: { ...tenant, moduleUsage } });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD ADMIN
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/dashboard ──────────────────────────────────────────────────

adminRouter.get('/dashboard', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const [
      leadsThisMonth,
      leadsByStatus,
      pilotsActive,
      activeTenants,
      contractsExpiringSoon,
      revenueAgg,
    ] = await Promise.all([
      prisma.lead.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.lead.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.tenant.count({ where: { plan: 'PILOT', active: true } }),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.tenant.count({ where: { status: 'ACTIVE', contractEndsAt: { lte: in30Days, gte: now } } }),
      prisma.tenant.aggregate({
        where: { status: 'ACTIVE' },
        _sum: { monthlyPrice: true },
      }),
    ]);

    const pipelineStatusMap: Record<string, number> = {};
    for (const row of leadsByStatus) pipelineStatusMap[row.status] = row._count.id;

    const mrr = revenueAgg._sum.monthlyPrice || 0;

    // Latest leads and pilots (for kanban)
    const [latestLeads, pilotsShort] = await Promise.all([
      prisma.lead.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, name: true, company: true, status: true, score: true, createdAt: true },
      }),
      prisma.tenant.findMany({
        where: { plan: 'PILOT' },
        orderBy: { pilotEndsAt: 'asc' },
        take: 10,
        select: { id: true, name: true, pilotEndsAt: true, healthScore: true },
      }),
    ]);

    res.json({
      status: 'ok',
      data: {
        kpis: {
          leadsThisMonth,
          pilotsActive,
          activeTenants,
          contractsExpiringSoon,
          mrr,
          mrrGoal: Number(process.env.MRR_GOAL_MXN || 100000),
        },
        pipeline: {
          new: pipelineStatusMap['new'] || 0,
          contacted: pipelineStatusMap['contacted'] || 0,
          demoScheduled: pipelineStatusMap['demo_scheduled'] || 0,
          demoDone: pipelineStatusMap['demo_done'] || 0,
          pilot: pipelineStatusMap['pilot'] || 0,
          negotiating: pipelineStatusMap['negotiating'] || 0,
          converted: pipelineStatusMap['converted'] || 0,
          discarded: pipelineStatusMap['discarded'] || 0,
        },
        latestLeads,
        pilots: pilotsShort,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/renewals ───────────────────────────────────────────────────

adminRouter.get('/renewals', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const in60Days = new Date(now.getTime() + 60 * 86400000);

    const tenants = await prisma.tenant.findMany({
      where: {
        status: 'ACTIVE',
        contractEndsAt: { lte: in60Days, gte: now },
      },
      orderBy: { contractEndsAt: 'asc' },
      select: {
        id: true,
        name: true,
        plan: true,
        monthlyPrice: true,
        contractStartedAt: true,
        contractEndsAt: true,
        healthScore: true,
        lastActivityAt: true,
      },
    });

    const data = tenants.map((t) => {
      const daysLeft = t.contractEndsAt ? Math.ceil((t.contractEndsAt.getTime() - now.getTime()) / 86400000) : 0;
      let urgency: 'critical' | 'high' | 'medium' = 'medium';
      if (daysLeft <= 7) urgency = 'critical';
      else if (daysLeft <= 15) urgency = 'high';
      return { ...t, daysLeft, urgency };
    });

    res.json({ status: 'ok', data });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/metrics ────────────────────────────────────────────────────

adminRouter.get('/metrics', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [
      totalClassifications,
      feedbackStats,
      topFractions,
      topTenants,
      recentClassifications,
    ] = await Promise.all([
      prisma.classification.count(),
      prisma.classification.groupBy({ by: ['feedback'], _count: { id: true }, where: { feedback: { not: null } } }),
      prisma.classification.groupBy({
        by: ['fractionCode'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.classification.groupBy({
        by: ['tenantId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.classification.aggregate({ _avg: { confidence: true } }),
    ]);

    const tenantIds = topTenants.map((t) => t.tenantId);
    const tenantsInfo = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, plan: true },
    });
    const tenantMap = Object.fromEntries(tenantsInfo.map((t) => [t.id, t]));

    const feedbackMap: Record<string, number> = {};
    for (const row of feedbackStats) if (row.feedback) feedbackMap[row.feedback] = row._count.id;

    res.json({
      status: 'ok',
      data: {
        totalClassifications,
        avgConfidence: Math.round((recentClassifications._avg.confidence || 0) * 10) / 10,
        feedback: feedbackMap,
        topFractions: topFractions.map((f) => ({ fractionCode: f.fractionCode, count: f._count.id })),
        topTenants: topTenants.map((t) => ({
          tenantId: t.tenantId,
          name: tenantMap[t.tenantId]?.name || 'Desconocido',
          plan: tenantMap[t.tenantId]?.plan || 'UNKNOWN',
          classifications: t._count.id,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// JOB — emails piloto 15/25 días + suspender día 30
// ════════════════════════════════════════════════════════════════════════════

export async function processPilotLifecycle(): Promise<{ reminded15: number; reminded25: number; suspended: number }> {
  const now = new Date();
  let reminded15 = 0;
  let reminded25 = 0;
  let suspended = 0;

  const pilots = await prisma.tenant.findMany({
    where: { plan: 'PILOT', pilotStartedAt: { not: null }, pilotEndsAt: { not: null } },
    include: {
      users: { where: { role: 'ADMIN' }, take: 1 },
      _count: { select: { classifications: true } },
    },
  });

  for (const tenant of pilots) {
    if (!tenant.pilotStartedAt || !tenant.pilotEndsAt) continue;
    const admin = tenant.users[0];
    if (!admin) continue;

    const daysSinceStart = Math.floor((now.getTime() - tenant.pilotStartedAt.getTime()) / 86400000);
    const daysLeft = Math.ceil((tenant.pilotEndsAt.getTime() - now.getTime()) / 86400000);

    // 15-day email
    if (daysSinceStart >= 15 && daysSinceStart < 25 && !tenant.pilot15DaySentAt) {
      const { sendPilot15DayEmail } = await import('../lib/email');
      await sendPilot15DayEmail(
        admin.email, admin.name, tenant.name,
        tenant._count.classifications,
        tenant.classificationLimit || PILOT_CLASSIFICATION_LIMIT,
      ).catch((err) => console.error('[pilot-lifecycle] 15day:', err));
      await prisma.tenant.update({ where: { id: tenant.id }, data: { pilot15DaySentAt: now } });
      reminded15++;
    }

    // 25-day email
    if (daysSinceStart >= 25 && daysLeft > 0 && !tenant.pilot25DaySentAt) {
      const { sendPilot25DayEmail } = await import('../lib/email');
      await sendPilot25DayEmail(
        admin.email, admin.name, tenant.name,
        daysLeft, tenant._count.classifications,
      ).catch((err) => console.error('[pilot-lifecycle] 25day:', err));
      await prisma.tenant.update({ where: { id: tenant.id }, data: { pilot25DaySentAt: now } });
      reminded25++;
    }

    // Suspend after 30 days
    if (daysLeft <= 0 && !tenant.pilotExpiredSentAt) {
      const { sendPilotExpiredEmail } = await import('../lib/email');
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: 'SUSPENDED', active: false, pilotExpiredSentAt: now },
      });
      await prisma.user.updateMany({
        where: { tenantId: tenant.id },
        data: { active: false, status: 'SUSPENDED' },
      });
      await sendPilotExpiredEmail(admin.email, admin.name, tenant.name)
        .catch((err) => console.error('[pilot-lifecycle] expired:', err));
      suspended++;
    }
  }

  return { reminded15, reminded25, suspended };
}

// Expose manual trigger (for cron or admin button)
adminRouter.post('/pilots/process-lifecycle', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await processPilotLifecycle();
    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});
