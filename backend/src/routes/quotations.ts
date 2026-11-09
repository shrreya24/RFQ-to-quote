import { Router, Response, Request } from 'express';
import { z } from 'zod';
import { HistoricalQuote } from '../models/HistoricalQuote';
import { CostingSheet } from '../models/CostingSheet';
import { RFQ } from '../models/RFQ';
import { User } from '../models/User';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { generateQuotePDF } from '../services/pdfService';
import multer from 'multer';
import * as XLSX from 'xlsx';

const router = Router();
router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/quotes/pdf/:rfqId — generate PDF for all approved sheets
router.post('/pdf/:rfqId', authorize('estimator', 'sales_head', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const rfq = await RFQ.findById(req.params.rfqId);
  if (!rfq) { res.status(404).json({ success: false, message: 'RFQ not found' }); return; }

  const sheets = await CostingSheet.find({ rfqId: req.params.rfqId, status: { $in: ['approved', 'submitted'] } }).sort({ partName: 1 });
  if (sheets.length === 0) {
    res.status(400).json({ success: false, message: 'No approved costing sheets found for this RFQ' });
    return;
  }

  const user = await User.findById(req.user!.id);
  if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }

  const pdfBuffer = generateQuotePDF(rfq, sheets, rfq.customer, user);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${rfq.rfqNumber}-quote.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

// POST /api/quotes/import — import historical quotes from Excel
router.post('/import', authorize('admin'), upload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded' }); return; }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  } catch {
    res.status(400).json({ success: false, message: 'Invalid Excel file' });
    return;
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null });

  if (rows.length === 0) {
    res.status(400).json({ success: false, message: 'Excel file is empty' });
    return;
  }

  const toNumber = (val: unknown): number | undefined => {
    if (val === null || val === undefined || val === '') return undefined;
    const n = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(n) ? undefined : n;
  };

  const toStr = (val: unknown): string => val != null ? String(val).trim() : '';

  // Map common column name variations
  const getCol = (row: Record<string, unknown>, ...keys: string[]): unknown => {
    for (const k of keys) {
      const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase().replace(/[\s_-]/g, ''));
      if (found !== undefined && row[found] != null && row[found] !== '') return row[found];
    }
    return null;
  };

  const docs = rows.map(row => {
    const grossWt = toNumber(getCol(row, 'grosswt', 'grossweightkg', 'grossweight', 'inputweight'));
    const material = toStr(getCol(row, 'material', 'materialgrade', 'matgrade'));

    // Build similarity tags for routing suggestions
    const tags: string[] = [];
    if (material) tags.push(material.toLowerCase());
    if (grossWt) {
      if (grossWt < 0.5) tags.push('micro_part');
      else if (grossWt < 2) tags.push('light_part');
      else if (grossWt < 10) tags.push('medium_part');
      else tags.push('heavy_part');
    }
    const op = toStr(getCol(row, 'operation', 'primaryoperation', 'process'));
    if (op) tags.push(op.toLowerCase());

    const volume = toNumber(getCol(row, 'annualvolume', 'volume', 'qty', 'quantity', 'annualqty'));
    if (volume) {
      if (volume > 100000) tags.push('high_volume');
      else if (volume > 10000) tags.push('medium_volume');
      else tags.push('low_volume');
    }

    return {
      rfqNumber: toStr(getCol(row, 'rfqno', 'rfqnumber', 'rfq')),
      customer: toStr(getCol(row, 'customer', 'customername')),
      partName: toStr(getCol(row, 'partname', 'part', 'description')),
      drawingNumber: toStr(getCol(row, 'drawingnumber', 'drwno', 'drawing')),
      materialGrade: material,
      grossWeightKg: grossWt,
      netWeightKg: toNumber(getCol(row, 'netwt', 'netweightkg', 'netweight')),
      annualVolume: volume,
      primaryOperation: op,
      cycleTimeMin: toNumber(getCol(row, 'cycletime', 'cycletimemin', 'ct')),
      machineType: toStr(getCol(row, 'machinetype', 'machine', 'process')),
      hourRateAtTime: toNumber(getCol(row, 'hourrate', 'hourrateINR', 'rate')),
      sellingPricePerPiece: toNumber(getCol(row, 'sellingprice', 'price', 'quotedprice')),
      annualValue: toNumber(getCol(row, 'annualvalue', 'totalvalue')),
      year: toNumber(getCol(row, 'year', 'quoteyear')),
      importedBy: req.user!.id,
      importedAt: new Date(),
      similarityTags: tags,
    };
  }).filter(d => d.rfqNumber || d.partName || d.materialGrade);

  if (docs.length === 0) {
    res.status(400).json({ success: false, message: 'No valid rows found. Check column headers.' });
    return;
  }

  // Upsert to avoid duplicates on re-import (match by rfqNumber + partName)
  let inserted = 0;
  let updated = 0;
  for (const doc of docs) {
    const result = await HistoricalQuote.updateOne(
      { rfqNumber: doc.rfqNumber, partName: doc.partName },
      { $set: doc },
      { upsert: true }
    );
    if (result.upsertedCount > 0) inserted++;
    else updated++;
  }

  res.json({ success: true, message: `Import complete`, inserted, updated, total: docs.length });
}));

// GET /api/quotes/past-quotes — paginated list
router.get('/past-quotes', asyncHandler(async (req: Request, res: Response) => {
  const { q, material, minWt, maxWt, page = '1', limit = '20' } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (q) filter.$text = { $search: q };
  if (material) filter.materialGrade = { $regex: material, $options: 'i' };
  if (minWt || maxWt) {
    const wt: Record<string, number> = {};
    if (minWt) wt.$gte = parseFloat(minWt);
    if (maxWt) wt.$lte = parseFloat(maxWt);
    filter.grossWeightKg = wt;
  }
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));
  const [quotes, total] = await Promise.all([
    HistoricalQuote.find(filter)
      .sort(q ? { score: { $meta: 'textScore' } } : { quotedDate: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    HistoricalQuote.countDocuments(filter),
  ]);
  res.json({ success: true, data: quotes, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
}));

// GET /api/quotes/stats — dashboard numbers
router.get('/stats', asyncHandler(async (_req: Request, res: Response) => {
  const [
    totalRFQs, byStatus, dueThisWeek,
    totalSheets, pendingApproval, approved,
    totalHistorical,
  ] = await Promise.all([
    RFQ.countDocuments(),
    RFQ.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    RFQ.countDocuments({ dueDate: { $lte: new Date(Date.now() + 7 * 24 * 3600000), $gte: new Date() }, status: { $nin: ['won', 'lost', 'sent'] } }),
    CostingSheet.countDocuments(),
    CostingSheet.countDocuments({ status: 'submitted' }),
    CostingSheet.countDocuments({ status: 'approved' }),
    HistoricalQuote.countDocuments(),
  ]);
  res.json({ success: true, stats: { totalRFQs, byStatus, dueThisWeek, totalSheets, pendingApproval, approved, totalHistorical } });
}));

export default router;
