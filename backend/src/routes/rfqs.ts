import { Router, Response } from 'express';
import { z } from 'zod';
import { RFQ } from '../models/RFQ';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// Generate RFQ number: RFQ-YYMM-NNN
async function genRFQNumber(): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `RFQ-${yy}${mm}-`;
  const last = await RFQ.findOne({ rfqNumber: { $regex: `^${prefix}` } }).sort({ rfqNumber: -1 });
  let seq = 1;
  if (last) {
    const parts = last.rfqNumber.split('-');
    seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

const OperationSchema = z.object({
  sequence: z.number().int().positive(),
  operationName: z.string().min(1),
  machineType: z.string().min(1),
  cycleTimeMin: z.number().min(0),
  setupTimeMin: z.number().min(0).default(0),
});

const PartSchema = z.object({
  partName: z.string().min(1),
  drawingNumber: z.string().optional(),
  materialGrade: z.string().min(1),
  grossWeightKg: z.number().positive(),
  netWeightKg: z.number().positive(),
  scrapRecoveryPct: z.number().min(0).max(100).default(85),
  surfaceArea: z.number().optional(),
  routing: z.array(OperationSchema).default([]),
  costedVolumes: z.array(z.number().positive()).default([]),
  aiExtracted: z.boolean().default(false),
  aiSourceNote: z.string().optional(),
});

const CreateRFQSchema = z.object({
  customer: z.string().min(2),
  receivedDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  parts: z.array(PartSchema).default([]),
  sourceEmail: z.string().optional(),
});

const UpdateRFQSchema = CreateRFQSchema.partial().extend({
  status: z.enum(['new', 'estimating', 'review', 'approved', 'sent', 'won', 'lost']).optional(),
  lostReason: z.string().optional(),
  ownerId: z.string().optional(),
});

// GET /api/rfqs
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, search, sort = '-createdAt', page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { rfqNumber: { $regex: search, $options: 'i' } },
      { customer: { $regex: search, $options: 'i' } },
      { 'parts.partName': { $regex: search, $options: 'i' } },
    ];
  }
  const [rfqs, total] = await Promise.all([
    RFQ.find(filter)
      .populate('ownerId', 'name email')
      .sort(sort)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .select('-sourceEmail -statusHistory'),
    RFQ.countDocuments(filter),
  ]);
  res.json({ success: true, data: rfqs, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
}));

// POST /api/rfqs
router.post('/', authorize('estimator', 'sales_head', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = CreateRFQSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const rfqNumber = await genRFQNumber();
  const rfq = await RFQ.create({
    ...parsed.data,
    rfqNumber,
    receivedDate: new Date(parsed.data.receivedDate),
    dueDate: new Date(parsed.data.dueDate),
    ownerId: req.user!.id,
    createdBy: req.user!.id,
    statusHistory: [{ status: 'new', changedBy: req.user!.id, changedAt: new Date(), note: 'RFQ created' }],
  });
  res.status(201).json({ success: true, rfq });
}));

// GET /api/rfqs/:id
router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const rfq = await RFQ.findById(req.params.id)
    .populate('ownerId', 'name email')
    .populate('createdBy', 'name');
  if (!rfq) { res.status(404).json({ success: false, message: 'RFQ not found' }); return; }
  res.json({ success: true, rfq });
}));

// PATCH /api/rfqs/:id
router.patch('/:id', authorize('estimator', 'sales_head', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = UpdateRFQSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const rfq = await RFQ.findById(req.params.id);
  if (!rfq) { res.status(404).json({ success: false, message: 'RFQ not found' }); return; }

  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.dueDate) updates.dueDate = new Date(parsed.data.dueDate);
  if (parsed.data.receivedDate) updates.receivedDate = new Date(parsed.data.receivedDate);

  // Status change tracking
  if (parsed.data.status && parsed.data.status !== rfq.status) {
    (updates as Record<string, unknown>)['$push'] = {
      statusHistory: { status: parsed.data.status, changedBy: req.user!.id, changedAt: new Date(), note: req.body.statusNote || '' },
    };
    delete updates.status;
    rfq.status = parsed.data.status;
  }

  const updated = await RFQ.findByIdAndUpdate(req.params.id, updates, { new: true }).populate('ownerId', 'name email');
  res.json({ success: true, rfq: updated });
}));

// PATCH /api/rfqs/:id/status
router.patch('/:id/status', authorize('estimator', 'sales_head', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, note, lostReason } = req.body;
  const validStatuses = ['new', 'estimating', 'review', 'approved', 'sent', 'won', 'lost'];
  if (!validStatuses.includes(status)) { res.status(400).json({ success: false, message: 'Invalid status' }); return; }

  const rfq = await RFQ.findById(req.params.id);
  if (!rfq) { res.status(404).json({ success: false, message: 'RFQ not found' }); return; }

  rfq.status = status;
  if (lostReason) rfq.lostReason = lostReason;
  rfq.statusHistory.push({ status, changedBy: req.user!.id as unknown as import('mongoose').Types.ObjectId, changedAt: new Date(), note });
  await rfq.save();
  res.json({ success: true, rfq });
}));

// PATCH /api/rfqs/:id/parts — update/replace parts array
router.patch('/:id/parts', authorize('estimator', 'sales_head', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = z.array(PartSchema).safeParse(req.body.parts);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Invalid parts data', errors: parsed.error.flatten() });
    return;
  }
  const rfq = await RFQ.findByIdAndUpdate(req.params.id, { parts: parsed.data }, { new: true });
  if (!rfq) { res.status(404).json({ success: false, message: 'RFQ not found' }); return; }
  res.json({ success: true, rfq });
}));

// DELETE /api/rfqs/:id
router.delete('/:id', authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  await RFQ.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'RFQ deleted' });
}));

export default router;
