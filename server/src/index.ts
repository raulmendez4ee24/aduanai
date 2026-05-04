import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

import { errorHandler } from './middlewares/error';
import { generalLimiter, classifyLimiter, copilotLimiter, leadsLimiter } from './middlewares/rateLimit';
import { classifyRouter, classifyVerifyRouter } from './routes/classify';
import { quoteRouter } from './routes/quote';
import { copilotRouter } from './routes/copilot';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { whatsappRouter } from './routes/whatsapp';
import { statsRouter } from './routes/stats';
import { alertsRouter } from './routes/alerts';
import { fractionsRouter } from './routes/fractions';
import { operationsRouter } from './routes/operations';
import { prevalidateRouter } from './routes/prevalidate';
import { analyticsRouter } from './routes/analytics';
import { inventoryRouter } from './routes/inventory';
import { fiscalRouter } from './routes/fiscal';
import { mveRouter } from './routes/mve';
import { logisticsRouter } from './routes/logistics';
import { updaterRouter } from './routes/updater';
import { leadsRouter } from './routes/leads';
import { adminRouter, processPilotLifecycle } from './routes/admin';
import { knowledgeRouter } from './routes/knowledge';
import { roiRouter } from './routes/roi';
import { auditMiddleware } from './middlewares/audit';
import { auditAdminRouter, auditPublicRouter } from './routes/audit';
import { documentsRouter } from './routes/documents';
import { prisma } from './lib/prisma';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security headers ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
      connectSrc: ["'self'", "https://wa.me"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

app.set('trust proxy', 1);
app.use(morgan('short'));

// ── Serve client static files (before CORS so module scripts aren't blocked) ──
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// ── CORS (API only) ──
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map(u => u.trim()) : []),
];
app.use('/api', cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} no permitido por CORS`));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' })); // PDFs en base64 pueden pesar

// ── General rate limit on all API routes ──
app.use('/api', generalLimiter);

// ── Audit middleware (autoregistra mutaciones autenticadas) ──
app.use('/api', auditMiddleware());

// ── Audit verify público (sin auth) ──
app.use('/verify/audit', auditPublicRouter);

// ── Verify pública de clasificación (sin auth) ──
app.use('/verify/classify', classifyVerifyRouter);

// ── Routes ──
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter); // Has its own per-endpoint limiters
app.use('/api/classify', classifyLimiter, classifyRouter);
app.use('/api/quote', classifyLimiter, quoteRouter);
app.use('/api/copilot', copilotLimiter, copilotRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/stats', statsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/fractions', fractionsRouter);
app.use('/api/operations', operationsRouter);
app.use('/api/prevalidate', prevalidateRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/fiscal', fiscalRouter);
app.use('/api/mve', mveRouter);
app.use('/api/logistics', logisticsRouter);
app.use('/api/updater', updaterRouter);
app.use('/api/leads', leadsLimiter, leadsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/roi', roiRouter);
app.use('/api/admin/audit', auditAdminRouter);
app.use('/api/documents', documentsRouter);

// ── SPA fallback ──
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(publicPath, 'index.html'));
});

// ── Error handler ──
app.use(errorHandler);

// ── Cleanup expired blacklisted tokens every hour ──
setInterval(async () => {
  try {
    await prisma.tokenBlacklist.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch { /* silent */ }
}, 3600000);

// ── Process pilot lifecycle (15/25 day emails + 30-day suspend) every 6h ──
setInterval(async () => {
  try {
    const result = await processPilotLifecycle();
    if (result.reminded15 || result.reminded25 || result.suspended) {
      console.log(`[pilot-lifecycle] reminded15=${result.reminded15} reminded25=${result.reminded25} suspended=${result.suspended}`);
    }
  } catch (err) {
    console.error('[pilot-lifecycle] error:', err);
  }
}, 6 * 3600000);

app.listen(PORT, () => {
  console.log(`🚀 ADUANAI server running on port ${PORT}`);
});

export default app;
