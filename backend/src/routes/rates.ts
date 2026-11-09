import { Router, Response, Request } from 'express';
import { z } from 'zod';
import { MaterialRate, MachineRate, OverheadRate, FreightRate } from '../models/RateMaster';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// ── Helper ─────────────────────────────────────────────────────────────────
/** When adding a new rate, close the previous active one. */
async function closeActiveRate(
  Model: typeof MaterialRate | typeof MachineRate | typeof OverheadRate | typeof FreightRate,
  filter: Record<string, unknown>,
  effectiveFrom: Date
) {
  await Model.updateMany(
    { ...filter, effectiveTo: null, effectiveFrom: { $lt: effectiveFrom } },
    { effectiveTo: effectiveFrom }
  );
}

// ── Material Rates ──────────────────────────────────────────────────────────
const MaterialRateSchema = z.object({
  grade: z.string().min(1),
  description: z.string().optional(),
  pricePerKg: z.number().positive(),
  effectiveFrom: z.string().datetime(),
});

router.get('/materials', asyncHandler(async (_req: Request, res: Response) => {
  const rates = await MaterialRate.find().sort({ grade: 1, effectiveFrom: -1 });
  res.json({ success: true, data: rates });
}));

router.get('/materials/current', asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const rates = await MaterialRate.find({
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: now } }],
  }).sort({ grade: 1 });
  res.json({ success: true, data: rates });
}));

router.post('/materials', authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = MaterialRateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors }); return; }

  const effectiveFrom = new Date(parsed.data.effectiveFrom);
  await closeActiveRate(MaterialRate, { grade: parsed.data.grade }, effectiveFrom);

  const rate = await MaterialRate.create({ ...parsed.data, effectiveFrom, createdBy: req.user!.id });
  res.status(201).json({ success: true, rate });
}));

router.patch('/materials/:id', authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const rate = await MaterialRate.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!rate) { res.status(404).json({ success: false, message: 'Rate not found' }); return; }
  res.json({ success: true, rate });
}));

// ── Machine Rates ───────────────────────────────────────────────────────────
const MachineRateSchema = z.object({
  machineType: z.string().min(1),
  description: z.string().optional(),
  hourRateINR: z.number().positive(),
  effectiveFrom: z.string().datetime(),
});

router.get('/machines', asyncHandler(async (_req: Request, res: Response) => {
  const rates = await MachineRate.find().sort({ machineType: 1, effectiveFrom: -1 });
  res.json({ success: true, data: rates });
}));

router.get('/machines/current', asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const rates = await MachineRate.find({
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: now } }],
  }).sort({ machineType: 1 });
  res.json({ success: true, data: rates });
}));

router.post('/machines', authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = MachineRateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors }); return; }

  const effectiveFrom = new Date(parsed.data.effectiveFrom);
  await closeActiveRate(MachineRate, { machineType: parsed.data.machineType }, effectiveFrom);

  const rate = await MachineRate.create({ ...parsed.data, effectiveFrom, createdBy: req.user!.id });
  res.status(201).json({ success: true, rate });
}));

router.patch('/machines/:id', authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const rate = await MachineRate.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!rate) { res.status(404).json({ success: false, message: 'Rate not found' }); return; }
  res.json({ success: true, rate });
}));

// ── Overhead Rates ──────────────────────────────────────────────────────────
const OverheadRateSchema = z.object({
  type: z.enum(['factory', 'admin', 'selling']),
  percentage: z.number().min(0).max(100),
  effectiveFrom: z.string().datetime(),
});

router.get('/overhead', asyncHandler(async (_req: Request, res: Response) => {
  const rates = await OverheadRate.find().sort({ type: 1, effectiveFrom: -1 });
  res.json({ success: true, data: rates });
}));

router.get('/overhead/current', asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const rates = await OverheadRate.find({
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: now } }],
  });
  res.json({ success: true, data: rates });
}));

router.post('/overhead', authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = OverheadRateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors }); return; }

  const effectiveFrom = new Date(parsed.data.effectiveFrom);
  await closeActiveRate(OverheadRate, { type: parsed.data.type }, effectiveFrom);

  const rate = await OverheadRate.create({ ...parsed.data, effectiveFrom, createdBy: req.user!.id });
  res.status(201).json({ success: true, rate });
}));

// ── Freight Rates ───────────────────────────────────────────────────────────
const FreightRateSchema = z.object({
  description: z.string().min(1),
  rateType: z.enum(['per_kg', 'fixed']),
  rateINR: z.number().min(0),
  effectiveFrom: z.string().datetime(),
});

router.get('/freight', asyncHandler(async (_req: Request, res: Response) => {
  const rates = await FreightRate.find().sort({ effectiveFrom: -1 });
  res.json({ success: true, data: rates });
}));

router.get('/freight/current', asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const rate = await FreightRate.findOne({
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: now } }],
  }).sort({ effectiveFrom: -1 });
  res.json({ success: true, data: rate });
}));

router.post('/freight', authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = FreightRateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors }); return; }

  const effectiveFrom = new Date(parsed.data.effectiveFrom);
  await closeActiveRate(FreightRate, {}, effectiveFrom);

  const rate = await FreightRate.create({ ...parsed.data, effectiveFrom, createdBy: req.user!.id });
  res.status(201).json({ success: true, rate });
}));

export default router;
