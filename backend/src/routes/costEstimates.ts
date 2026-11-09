import { Router, Response } from 'express';
import { z } from 'zod';
import { CostingSheet } from '../models/CostingSheet';
import { RFQ } from '../models/RFQ';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { calculateAllVolumes, PartInputs, VolumeInputs, RateInputs } from '../services/costingEngine';
import { buildRateSnapshot, attachRatesToOperations } from '../services/rateService';

const router = Router();
router.use(authenticate);
router.use(authorize('estimator', 'sales_head', 'admin'));

const VolumeSchema = z.object({
  annualVolume: z.number().positive(),
  marginPct: z.number().min(0).max(99.99).default(15),
});

const CostingInputSchema = z.object({
  rfqId: z.string(),
  partId: z.string(),
  volumes: z.array(VolumeSchema).min(1).max(4),
  notes: z.string().optional(),
  gstPct: z.number().min(0).max(50).default(18),
  // Manual freight override (optional — else from rate master)
  freightOverridePerPiece: z.number().min(0).optional(),
});

// POST /api/costing/calculate — preview without saving
router.post('/calculate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = CostingInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const rfq = await RFQ.findById(parsed.data.rfqId);
  if (!rfq) { res.status(404).json({ success: false, message: 'RFQ not found' }); return; }

  const part = rfq.parts.find(p => String(p._id) === parsed.data.partId);
  if (!part) { res.status(404).json({ success: false, message: 'Part not found in RFQ' }); return; }

  const machineTypes = part.routing.map(op => op.machineType);

  try {
    const { rateSnapshot, rateInputs, operationRates } = await buildRateSnapshot(
      part.materialGrade,
      machineTypes,
      parsed.data.gstPct
    );

    if (parsed.data.freightOverridePerPiece !== undefined) {
      rateInputs.freightPerPiece = parsed.data.freightOverridePerPiece;
      rateSnapshot.freightPerPiece = parsed.data.freightOverridePerPiece;
    }

    const operationInputs = attachRatesToOperations(
      part.routing.map(op => ({
        sequence: op.sequence,
        operationName: op.operationName,
        machineType: op.machineType,
        cycleTimeMin: op.cycleTimeMin,
        setupTimeMin: op.setupTimeMin,
      })),
      operationRates
    );

    const partInputs: PartInputs = {
      grossWeightKg: part.grossWeightKg,
      netWeightKg: part.netWeightKg,
      scrapRecoveryPct: part.scrapRecoveryPct,
      operations: operationInputs,
    };

    const volumeInputs: VolumeInputs[] = parsed.data.volumes.map(v => ({
      annualVolume: v.annualVolume,
      marginPct: v.marginPct,
    }));

    const volumeResults = calculateAllVolumes(partInputs, volumeInputs, rateInputs);

    res.json({ success: true, volumeResults, rateSnapshot });
  } catch (err) {
    const e = err as Error;
    if (e.name === 'RateMissingError') {
      res.status(422).json({ success: false, message: e.message, type: 'rate_missing' });
    } else {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}));

// POST /api/costing — save costing sheet
router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = CostingInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const rfq = await RFQ.findById(parsed.data.rfqId);
  if (!rfq) { res.status(404).json({ success: false, message: 'RFQ not found' }); return; }
  const part = rfq.parts.find(p => String(p._id) === parsed.data.partId);
  if (!part) { res.status(404).json({ success: false, message: 'Part not found' }); return; }

  const machineTypes = part.routing.map(op => op.machineType);

  try {
    const { rateSnapshot, rateInputs, operationRates } = await buildRateSnapshot(
      part.materialGrade, machineTypes, parsed.data.gstPct
    );

    if (parsed.data.freightOverridePerPiece !== undefined) {
      rateInputs.freightPerPiece = parsed.data.freightOverridePerPiece;
      rateSnapshot.freightPerPiece = parsed.data.freightOverridePerPiece;
    }

    const operationInputs = attachRatesToOperations(
      part.routing.map(op => ({
        sequence: op.sequence,
        operationName: op.operationName,
        machineType: op.machineType,
        cycleTimeMin: op.cycleTimeMin,
        setupTimeMin: op.setupTimeMin,
      })),
      operationRates
    );

    const partInputs: PartInputs = {
      grossWeightKg: part.grossWeightKg,
      netWeightKg: part.netWeightKg,
      scrapRecoveryPct: part.scrapRecoveryPct,
      operations: operationInputs,
    };

    const volumeResults = calculateAllVolumes(
      partInputs,
      parsed.data.volumes.map(v => ({ annualVolume: v.annualVolume, marginPct: v.marginPct })),
      rateInputs
    );

    // Version: increment if sheet already exists for this part
    const existing = await CostingSheet.findOne({ rfqId: parsed.data.rfqId, partId: parsed.data.partId })
      .sort({ version: -1 });
    const version = existing ? existing.version + 1 : 1;

    const sheet = await CostingSheet.create({
      rfqId: parsed.data.rfqId,
      partId: parsed.data.partId,
      partName: part.partName,
      rfqNumber: rfq.rfqNumber,
      estimatorId: req.user!.id,
      version,
      rateSnapshot,
      volumeResults,
      marginPct: parsed.data.volumes[0].marginPct,
      notes: parsed.data.notes,
    });

    // Move RFQ to 'estimating' status if still new
    if (rfq.status === 'new') {
      await RFQ.findByIdAndUpdate(parsed.data.rfqId, {
        status: 'estimating',
        $push: { statusHistory: { status: 'estimating', changedBy: req.user!.id, changedAt: new Date(), note: 'Costing started' } },
      });
    }

    res.status(201).json({ success: true, sheet });
  } catch (err) {
    const e = err as Error;
    if (e.name === 'RateMissingError') {
      res.status(422).json({ success: false, message: e.message, type: 'rate_missing' });
    } else {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}));

// GET /api/costing?rfqId=&partId=
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { rfqId, partId } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (rfqId) filter.rfqId = rfqId;
  if (partId) filter.partId = partId;

  const sheets = await CostingSheet.find(filter)
    .populate('estimatorId', 'name')
    .sort({ version: -1 });
  res.json({ success: true, data: sheets });
}));

// GET /api/costing/:id
router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const sheet = await CostingSheet.findById(req.params.id)
    .populate('estimatorId', 'name email')
    .populate('approvedBy', 'name');
  if (!sheet) { res.status(404).json({ success: false, message: 'Costing sheet not found' }); return; }
  res.json({ success: true, sheet });
}));

// PATCH /api/costing/:id — update margin/notes and recalculate
router.patch('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const sheet = await CostingSheet.findById(req.params.id);
  if (!sheet) { res.status(404).json({ success: false, message: 'Costing sheet not found' }); return; }
  if (sheet.status !== 'draft') {
    res.status(400).json({ success: false, message: 'Only draft costing sheets can be edited' });
    return;
  }

  // Recalculate with new margins if provided
  if (req.body.volumes) {
    const rfq = await RFQ.findById(sheet.rfqId);
    const part = rfq?.parts.find(p => String(p._id) === String(sheet.partId));
    if (rfq && part) {
      const { rateInputs } = await buildRateSnapshot(
        sheet.rateSnapshot.materialGrade,
        sheet.rateSnapshot.operations.map(o => o.machineType),
        sheet.rateSnapshot.gstPct
      );
      // Reuse snapshotted rates for recalculation (not current rates)
      // This preserves the original rate snapshot
      const frozenRates: RateInputs = {
        materialPricePerKg: sheet.rateSnapshot.materialPricePerKg,
        factoryOverheadPct: sheet.rateSnapshot.factoryOverheadPct,
        adminOverheadPct: sheet.rateSnapshot.adminOverheadPct,
        sellingOverheadPct: sheet.rateSnapshot.sellingOverheadPct,
        freightPerPiece: sheet.rateSnapshot.freightPerPiece,
        gstPct: sheet.rateSnapshot.gstPct,
      };
      const opInputs = attachRatesToOperations(
        part.routing.map(op => ({
          sequence: op.sequence,
          operationName: op.operationName,
          machineType: op.machineType,
          cycleTimeMin: op.cycleTimeMin,
          setupTimeMin: op.setupTimeMin,
        })),
        sheet.rateSnapshot.operations
      );
      const partInputs: PartInputs = {
        grossWeightKg: part.grossWeightKg,
        netWeightKg: part.netWeightKg,
        scrapRecoveryPct: part.scrapRecoveryPct,
        operations: opInputs,
      };
      const newResults = calculateAllVolumes(partInputs, req.body.volumes, frozenRates);
      sheet.volumeResults = newResults as typeof sheet.volumeResults;
      sheet.marginPct = req.body.volumes[0]?.marginPct ?? sheet.marginPct;
    }
  }

  if (req.body.notes !== undefined) sheet.notes = req.body.notes;
  await sheet.save();
  res.json({ success: true, sheet });
}));

// POST /api/costing/:id/submit
router.post('/:id/submit', asyncHandler(async (req: AuthRequest, res: Response) => {
  const sheet = await CostingSheet.findById(req.params.id);
  if (!sheet) { res.status(404).json({ success: false, message: 'Costing sheet not found' }); return; }
  if (sheet.status !== 'draft') {
    res.status(400).json({ success: false, message: 'Already submitted' });
    return;
  }
  sheet.status = 'submitted';
  await sheet.save();

  // Move RFQ to review
  await RFQ.findByIdAndUpdate(sheet.rfqId, {
    status: 'review',
    $push: { statusHistory: { status: 'review', changedBy: req.user!.id, changedAt: new Date(), note: 'Submitted for approval' } },
  });

  res.json({ success: true, sheet });
}));

// POST /api/costing/:id/approve — sales head only
router.post('/:id/approve', authorize('sales_head', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { action, note } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    res.status(400).json({ success: false, message: 'Action must be approve or reject' });
    return;
  }
  const sheet = await CostingSheet.findById(req.params.id);
  if (!sheet) { res.status(404).json({ success: false, message: 'Costing sheet not found' }); return; }
  if (sheet.status !== 'submitted') {
    res.status(400).json({ success: false, message: 'Sheet must be submitted for approval first' });
    return;
  }

  sheet.status = action === 'approve' ? 'approved' : 'rejected';
  sheet.approvedBy = req.user!.id as unknown as import('mongoose').Types.ObjectId;
  sheet.approvedAt = new Date();
  if (action === 'reject') sheet.rejectionNote = note;
  await sheet.save();

  if (action === 'approve') {
    await RFQ.findByIdAndUpdate(sheet.rfqId, {
      status: 'approved',
      $push: { statusHistory: { status: 'approved', changedBy: req.user!.id, changedAt: new Date(), note: 'Costing approved' } },
    });
  } else {
    // Send back to estimating
    await RFQ.findByIdAndUpdate(sheet.rfqId, {
      status: 'estimating',
      $push: { statusHistory: { status: 'estimating', changedBy: req.user!.id, changedAt: new Date(), note: `Rejected: ${note}` } },
    });
  }

  res.json({ success: true, sheet });
}));

export default router;
