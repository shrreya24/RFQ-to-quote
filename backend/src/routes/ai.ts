import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { extractRFQFromText, suggestRoutings } from '../services/geminiService';
import { HistoricalQuote } from '../models/HistoricalQuote';

const router = Router();
router.use(authenticate);
router.use(authorize('estimator', 'sales_head', 'admin'));

// POST /api/ai/extract — extract RFQ data from email/Excel text
router.post('/extract', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length < 10) {
    res.status(400).json({ success: false, message: 'Text must be at least 10 characters' });
    return;
  }
  const result = await extractRFQFromText(text.trim());
  res.json({ success: true, ...result });
}));

// POST /api/ai/suggest-routings — get routing suggestions for a part
router.post('/suggest-routings', asyncHandler(async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    materialGrade: z.string().min(1),
    grossWeightKg: z.number().positive(),
    primaryOperation: z.string().optional(),
    topK: z.number().int().min(1).max(10).default(3),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const suggestions = await suggestRoutings(
    parsed.data.materialGrade,
    parsed.data.grossWeightKg,
    parsed.data.primaryOperation,
    parsed.data.topK
  );
  res.json({ success: true, suggestions });
}));

// GET /api/ai/past-quotes/search — full-text search of historical quotes
router.get('/past-quotes/search', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { q, material, minWt, maxWt, page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));
  const filter: Record<string, unknown> = {};

  if (q) {
    filter.$text = { $search: q };
  }
  if (material) {
    filter.materialGrade = { $regex: material, $options: 'i' };
  }
  if (minWt || maxWt) {
    const wt: Record<string, number> = {};
    if (minWt) wt.$gte = parseFloat(minWt);
    if (maxWt) wt.$lte = parseFloat(maxWt);
    filter.grossWeightKg = wt;
  }

  const [quotes, total] = await Promise.all([
    HistoricalQuote.find(filter)
      .sort(q ? { score: { $meta: 'textScore' } } : { quotedDate: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    HistoricalQuote.countDocuments(filter),
  ]);

  res.json({ success: true, data: quotes, pagination: { page: pageNum, limit: limitNum, total } });
}));

export default router;
