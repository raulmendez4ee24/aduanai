import { Router } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { leadsLimiter } from '../middlewares/rateLimit';
import { sendLeadThankYouEmail } from '../lib/email';

export const leadsRouter = Router();

function calculateLeadScore(lead: {
  email: string;
  company?: string | null;
  rfc?: string | null;
  industry?: string | null;
  monthlyOps?: string | null;
  hasIMMEX?: boolean | null;
  currentSoftware?: string | null;
  problems?: string[];
}): { score: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  let score = 0;

  // Email corporativo (no gmail, hotmail, yahoo, outlook)
  const freeEmailDomains = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'live.com', 'protonmail.com', 'icloud.com'];
  const emailDomain = lead.email.split('@')[1]?.toLowerCase();
  if (emailDomain && !freeEmailDomains.includes(emailDomain)) {
    score += 10;
    breakdown.corporateEmail = 10;
  }

  // RFC válido (12 o 13 chars)
  if (lead.rfc && (lead.rfc.length === 12 || lead.rfc.length === 13)) {
    score += 10;
    breakdown.validRFC = 10;
  }

  // Tiene IMMEX
  if (lead.hasIMMEX === true) {
    score += 30;
    breakdown.hasIMMEX = 30;
  }

  // Operaciones mensuales
  if (lead.monthlyOps) {
    const ops = lead.monthlyOps.toLowerCase();
    if (ops.includes('50') || ops.includes('100') || ops.includes('más de') || ops.includes('+50') || ops.includes('+100')) {
      score += 20;
      breakdown.highVolume = 20;
    } else if (ops.includes('20') || ops.includes('30')) {
      score += 10;
      breakdown.mediumVolume = 10;
    }
  }

  // Usa AJR actualmente
  if (lead.currentSoftware) {
    const sw = lead.currentSoftware.toLowerCase();
    if (sw.includes('ajr') || sw.includes('a.j.r')) {
      score += 25;
      breakdown.usesAJR = 25;
    } else if (sw.includes('excel') || sw.includes('manual')) {
      score += 5;
      breakdown.manualProcess = 5;
    }
  }

  // Giro maquiladora
  if (lead.industry) {
    const ind = lead.industry.toLowerCase();
    if (ind.includes('maquila') || ind.includes('manufactura') || ind.includes('ensamble') || ind.includes('immex')) {
      score += 20;
      breakdown.maquiladora = 20;
    } else if (ind.includes('import') || ind.includes('export') || ind.includes('logist') || ind.includes('aduan')) {
      score += 15;
      breakdown.tradeIndustry = 15;
    }
  }

  // Múltiples problemas seleccionados = más dolor = más likelihood to buy
  if (lead.problems && lead.problems.length >= 3) {
    score += 10;
    breakdown.multipleProblems = 10;
  }

  return { score, breakdown };
}

// POST /api/leads — público, sin auth
leadsRouter.post('/', leadsLimiter, async (req, res, next) => {
  try {
    const {
      name,
      company,
      email,
      phone,
      message,
      source,
      rfc,
      industry,
      monthlyOps,
      hasIMMEX,
      currentSoftware,
      problems,
      referralSource,
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ status: 'error', message: 'Nombre y email son requeridos' });
    }

    // phone is only required when source is not demo_classifier
    if (!phone && source !== 'demo_classifier') {
      return res.status(400).json({ status: 'error', message: 'Teléfono es requerido' });
    }

    const { score, breakdown } = calculateLeadScore({
      email,
      company,
      rfc,
      industry,
      monthlyOps,
      hasIMMEX,
      currentSoftware,
      problems,
    });

    const lead = await prisma.lead.create({
      data: {
        name,
        company: company || null,
        email,
        phone: phone || '',
        message: message || null,
        source: source || 'landing',
        rfc: rfc || null,
        industry: industry || null,
        monthlyOps: monthlyOps || null,
        hasIMMEX: hasIMMEX ?? null,
        currentSoftware: currentSoftware || null,
        problems: problems || [],
        referralSource: referralSource || null,
        score,
        scoreBreakdown: JSON.stringify(breakdown),
      },
    });

    // Thank-you email (fire and forget)
    sendLeadThankYouEmail(email, name).catch((err) => {
      console.error('[EMAIL ERROR] Thank-you email failed:', err);
    });

    // WhatsApp notification placeholder
    console.log(`[LEAD NOTIFICATION] Nuevo lead: ${name} de ${company || 'N/A'}, score ${score}. Tel: ${phone}. Email: ${email}`);

    res.status(201).json({ status: 'ok', data: lead });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leads/:id/qualify — SOLO staff interno de ADUANAI (SUPERADMIN).
// Los Lead son la CRM de ventas propia de ADUANAI (sin tenantId); ADMIN es rol
// por-tenant (cliente), así que jamás debe tocar estos datos.
leadsRouter.patch('/:id/qualify', authenticate, requireRole('SUPERADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const id = req.params.id as string;
    const { rfc, industry, monthlyOps, hasIMMEX, currentSoftware, problems, referralSource } = req.body;

    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Lead no encontrado' });
    }

    const merged = {
      email: existing.email,
      company: existing.company,
      rfc: rfc ?? existing.rfc,
      industry: industry ?? existing.industry,
      monthlyOps: monthlyOps ?? existing.monthlyOps,
      hasIMMEX: hasIMMEX ?? existing.hasIMMEX,
      currentSoftware: currentSoftware ?? existing.currentSoftware,
      problems: problems ?? existing.problems,
    };

    const { score, breakdown } = calculateLeadScore(merged);

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        rfc: merged.rfc,
        industry: merged.industry,
        monthlyOps: merged.monthlyOps,
        hasIMMEX: merged.hasIMMEX,
        currentSoftware: merged.currentSoftware,
        problems: merged.problems,
        referralSource: referralSource ?? existing.referralSource,
        score,
        scoreBreakdown: JSON.stringify(breakdown),
      },
    });

    res.json({ status: 'ok', data: lead });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leads/:id/status — SOLO staff interno (SUPERADMIN). Ver nota en qualify.
leadsRouter.patch('/:id/status', authenticate, requireRole('SUPERADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    const validStatuses = ['new', 'contacted', 'demo_scheduled', 'demo_done', 'pilot', 'negotiating', 'converted', 'discarded'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ status: 'error', message: `Estado inválido. Valores válidos: ${validStatuses.join(', ')}` });
    }

    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Lead no encontrado' });
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: { status },
    });

    res.json({ status: 'ok', data: lead });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads — SOLO staff interno (SUPERADMIN): la lista de leads de ventas
// de ADUANAI jamás debe verla un usuario de un tenant cliente.
leadsRouter.get('/', authenticate, requireRole('SUPERADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { status, minScore } = req.query;

    const where: Prisma.LeadWhereInput = {};

    if (status && typeof status === 'string') {
      where.status = status;
    }

    if (minScore !== undefined) {
      const min = parseInt(minScore as string, 10);
      if (!isNaN(min)) {
        where.score = { gte: min };
      }
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    });

    res.json({ status: 'ok', data: leads });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/stats — auth required (must be before /:id)
leadsRouter.get('/stats', authenticate, requireRole('SUPERADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const [total, byStatus, scoreAgg] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.lead.aggregate({ _avg: { score: true } }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of byStatus) {
      statusMap[row.status] = row._count.id;
    }

    const [hotLeads, warmLeads, coldLeads] = await Promise.all([
      prisma.lead.count({ where: { score: { gte: 60 } } }),
      prisma.lead.count({ where: { score: { gte: 30, lt: 60 } } }),
      prisma.lead.count({ where: { score: { lt: 30 } } }),
    ]);

    res.json({
      status: 'ok',
      data: {
        total,
        new: statusMap['new'] || 0,
        contacted: statusMap['contacted'] || 0,
        demoScheduled: statusMap['demo_scheduled'] || 0,
        demoDone: statusMap['demo_done'] || 0,
        pilot: statusMap['pilot'] || 0,
        negotiating: statusMap['negotiating'] || 0,
        converted: statusMap['converted'] || 0,
        discarded: statusMap['discarded'] || 0,
        avgScore: Math.round(scoreAgg._avg.score ?? 0),
        hotLeads,
        warmLeads,
        coldLeads,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/:id — auth required
// GET /api/leads/:id — SOLO staff interno (SUPERADMIN). Antes: cualquier usuario
// autenticado de cualquier tenant leía cualquier lead por id (fuga confirmada).
leadsRouter.get('/:id', authenticate, requireRole('SUPERADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const id = req.params.id as string;

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      return res.status(404).json({ status: 'error', message: 'Lead no encontrado' });
    }

    res.json({ status: 'ok', data: lead });
  } catch (err) {
    next(err);
  }
});
