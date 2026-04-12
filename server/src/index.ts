import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorHandler } from './middlewares/error';
import { classifyRouter } from './routes/classify';
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

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(helmet());

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map(u => u.trim()) : []),
];
app.use(cors({
  origin(origin, callback) {
    // Permitir requests sin origin (mobile apps, curl, etc)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} no permitido por CORS`));
    }
  },
  credentials: true,
}));

app.set('trust proxy', 1); // Para que express-rate-limit lea la IP real detrás de proxy
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/classify', classifyRouter);
app.use('/api/quote', quoteRouter);
app.use('/api/copilot', copilotRouter);
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

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 ADUANAI server running on port ${PORT}`);
});

export default app;
