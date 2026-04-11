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

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
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

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 ADUANAI server running on port ${PORT}`);
});

export default app;
