import { Router, Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import { Material } from '../models/Material';
import { Machine } from '../models/Machine';
import { RFQ } from '../models/RFQ';
import { Quotation } from '../models/Quotation';
import { ActivityLog } from '../models/ActivityLog';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(authenticate);
router.use(authorize('admin'));

// ── Analytics ──────────────────────────────────────────────────────────────

// GET /api/admin/analytics
router.get(
  '/analytics',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const [
      totalRFQs,
      pendingRFQs,
      underReviewRFQs,
      totalQuotations,
      activeQuotations,
      approvedQuotations,
      acceptedQuotations,
    ] = await Promise.all([
      RFQ.countDocuments(),
      RFQ.countDocuments({ status: 'submitted' }),
      RFQ.countDocuments({ status: 'under_review' }),
      Quotation.countDocuments(),
      Quotation.countDocuments({ status: { $in: ['pending_approval', 'approved', 'sent'] } }),
      Quotation.countDocuments({ status: 'approved' }),
      Quotation.countDocuments({ status: 'accepted' }),
    ]);

    // Total quotation value from accepted quotations
    const totalValueResult = await Quotation.aggregate([
      { $match: { status: { $in: ['approved', 'sent', 'accepted'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const totalQuotationValue = totalValueResult[0]?.total || 0;

    // Conversion rate
    const conversionRate = totalRFQs > 0 ? (acceptedQuotations / totalRFQs) * 100 : 0;

    // Monthly RFQ trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyRFQs = await RFQ.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Quotation status distribution
    const quotationStatusDist = await Quotation.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // Recent activity
    const recentActivity = await ActivityLog.find()
      .populate('userId', 'name role')
      .sort({ createdAt: -1 })
      .limit(15);

    res.json({
      success: true,
      analytics: {
        totalRFQs,
        pendingRFQs,
        underReviewRFQs,
        totalQuotations,
        activeQuotations,
        approvedQuotations,
        acceptedQuotations,
        totalQuotationValue,
        conversionRate: Math.round(conversionRate * 100) / 100,
        monthlyRFQs,
        quotationStatusDist,
        recentActivity,
      },
    });
  })
);

// ── Users ──────────────────────────────────────────────────────────────────

const CreateUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'estimator', 'customer']),
  companyName: z.string().optional(),
  phone: z.string().optional(),
});

// GET /api/admin/users
router.get(
  '/users',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page = '1', limit = '20', role, search } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const filter: Record<string, unknown> = {};
    if (role) filter.role = role;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];

    const [users, total] = await Promise.all([
      User.find(filter).select('-passwordHash').sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
      User.countDocuments(filter),
    ]);

    res.json({ success: true, data: users, pagination: { page: pageNum, limit: limitNum, total } });
  })
);

// POST /api/admin/users
router.post(
  '/users',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parsed = CreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const existing = await User.findOne({ email: parsed.data.email });
    if (existing) {
      res.status(409).json({ success: false, message: 'User with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await User.create({ ...parsed.data, passwordHash });
    res.status(201).json({ success: true, user: { ...user.toObject(), passwordHash: undefined } });
  })
);

// PATCH /api/admin/users/:id
router.patch(
  '/users/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { isActive, role, name, companyName, phone } = req.body;
    const updates: Record<string, unknown> = {};
    if (isActive !== undefined) updates.isActive = isActive;
    if (role) updates.role = role;
    if (name) updates.name = name;
    if (companyName !== undefined) updates.companyName = companyName;
    if (phone !== undefined) updates.phone = phone;

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-passwordHash');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.json({ success: true, user });
  })
);

// ── Materials ──────────────────────────────────────────────────────────────

const MaterialSchema = z.object({
  name: z.string().min(2),
  grade: z.string().optional(),
  unit: z.string().default('kg'),
  pricePerUnit: z.number().positive(),
  wastagePercentage: z.number().min(0).max(100).default(5),
});

// GET /api/admin/materials
router.get('/materials', asyncHandler(async (_req, res) => {
  const materials = await Material.find({ isActive: true }).sort({ name: 1 });
  res.json({ success: true, data: materials });
}));

// POST /api/admin/materials
router.post('/materials', asyncHandler(async (req, res: Response) => {
  const parsed = MaterialSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const material = await Material.create(parsed.data);
  res.status(201).json({ success: true, material });
}));

// PATCH /api/admin/materials/:id
router.patch('/materials/:id', asyncHandler(async (req, res: Response) => {
  const material = await Material.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!material) { res.status(404).json({ success: false, message: 'Material not found' }); return; }
  res.json({ success: true, material });
}));

// ── Machines ───────────────────────────────────────────────────────────────

const MachineSchema = z.object({
  name: z.string().min(2),
  hourlyRate: z.number().positive(),
  processType: z.string().min(2),
  description: z.string().optional(),
});

// GET /api/admin/machines
router.get('/machines', asyncHandler(async (_req, res) => {
  const machines = await Machine.find({ isActive: true }).sort({ name: 1 });
  res.json({ success: true, data: machines });
}));

// POST /api/admin/machines
router.post('/machines', asyncHandler(async (req, res: Response) => {
  const parsed = MachineSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const machine = await Machine.create(parsed.data);
  res.status(201).json({ success: true, machine });
}));

// PATCH /api/admin/machines/:id
router.patch('/machines/:id', asyncHandler(async (req, res: Response) => {
  const machine = await Machine.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!machine) { res.status(404).json({ success: false, message: 'Machine not found' }); return; }
  res.json({ success: true, machine });
}));

// GET /api/admin/activity-logs
router.get('/activity-logs', asyncHandler(async (_req, res) => {
  const logs = await ActivityLog.find()
    .populate('userId', 'name email role')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ success: true, data: logs });
}));

export default router;
