import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import rfqRoutes from './routes/rfqs';
import aiRoutes from './routes/ai';
import costingRoutes from './routes/costEstimates';
import quotationRoutes from './routes/quotations';
import rateRoutes from './routes/rates';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
app.use(limiter);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/rfqs', rfqRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/costing', costingRoutes);
app.use('/api/quotes', quotationRoutes);
app.use('/api/rates', rateRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use((_req, res) => res.status(404).json({ success: false, message: 'Endpoint not found' }));
app.use(errorHandler);

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/forgequote';
  await mongoose.connect(uri);
  console.log('[DB] Connected');
};

const PORT = parseInt(process.env.PORT || '5000', 10);
connectDB()
  .then(() => app.listen(PORT, () => console.log(`[SERVER] Running on http://localhost:${PORT}`)))
  .catch(err => { console.error('[DB] Failed:', err); process.exit(1); });

export default app;
