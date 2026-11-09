import mongoose, { Document, Schema } from 'mongoose';

/**
 * Snapshot of the rates used at costing time.
 * This is the "each quote must remember the rates it used" requirement.
 */
export interface IRateSnapshot {
  materialGrade: string;
  materialPricePerKg: number;
  materialRateEffectiveFrom: Date;
  operations: {
    machineType: string;
    hourRateINR: number;
    rateEffectiveFrom: Date;
  }[];
  factoryOverheadPct: number;
  adminOverheadPct: number;
  sellingOverheadPct: number;
  overheadEffectiveFrom: Date;
  freightPerPiece: number;
  gstPct: number;
}

/**
 * Per-volume cost breakdown for one part.
 */
export interface IVolumeResult {
  annualVolume: number;
  // Material
  grossWeightKg: number;
  netWeightKg: number;
  materialCostPerPiece: number;      // gross_wt × rate
  scrapRecoveryPerPiece: number;     // (gross - net) × rate × recovery%
  netMaterialCostPerPiece: number;   // material - scrap recovery

  // Routing (each operation)
  operationCosts: {
    sequence: number;
    operationName: string;
    machineType: string;
    cycleTimeMin: number;
    setupCostPerPiece: number;       // (setupTime / volume) × rate
    cycleCostPerPiece: number;       // (cycleTime / 60) × rate
    totalCostPerPiece: number;
  }[];
  totalRoutingCostPerPiece: number;

  // Aggregates
  manufacturingCostPerPiece: number; // material + routing
  factoryOverheadPerPiece: number;
  adminOverheadPerPiece: number;
  sellingOverheadPerPiece: number;
  totalOverheadPerPiece: number;
  totalCostPerPiece: number;         // mfg + overhead + freight
  freightPerPiece: number;

  // Pricing
  marginPct: number;
  marginAmountPerPiece: number;
  sellingPricePerPiece: number;      // totalCost + margin
  gstPerPiece: number;
  priceWithGSTPerPiece: number;
  annualValue: number;               // selling × volume (ex-GST)
  annualValueWithGST: number;
  needsApproval: boolean;            // annualValue > 25L
}

export interface ICostingSheet extends Document {
  rfqId: mongoose.Types.ObjectId;
  partId: mongoose.Types.ObjectId;   // references part _id inside RFQ.parts
  partName: string;
  rfqNumber: string;
  estimatorId: mongoose.Types.ObjectId;
  version: number;
  rateSnapshot: IRateSnapshot;
  volumeResults: IVolumeResult[];
  marginPct: number;                 // default margin applied to all volumes
  notes?: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OperationCostSchema = new Schema(
  {
    sequence: Number,
    operationName: String,
    machineType: String,
    cycleTimeMin: Number,
    setupCostPerPiece: Number,
    cycleCostPerPiece: Number,
    totalCostPerPiece: Number,
  },
  { _id: false }
);

const VolumeResultSchema = new Schema<IVolumeResult>(
  {
    annualVolume: Number,
    grossWeightKg: Number,
    netWeightKg: Number,
    materialCostPerPiece: Number,
    scrapRecoveryPerPiece: Number,
    netMaterialCostPerPiece: Number,
    operationCosts: [OperationCostSchema],
    totalRoutingCostPerPiece: Number,
    manufacturingCostPerPiece: Number,
    factoryOverheadPerPiece: Number,
    adminOverheadPerPiece: Number,
    sellingOverheadPerPiece: Number,
    totalOverheadPerPiece: Number,
    freightPerPiece: Number,
    totalCostPerPiece: Number,
    marginPct: Number,
    marginAmountPerPiece: Number,
    sellingPricePerPiece: Number,
    gstPerPiece: Number,
    priceWithGSTPerPiece: Number,
    annualValue: Number,
    annualValueWithGST: Number,
    needsApproval: Boolean,
  },
  { _id: false }
);

const RateSnapshotSchema = new Schema<IRateSnapshot>(
  {
    materialGrade: String,
    materialPricePerKg: Number,
    materialRateEffectiveFrom: Date,
    operations: [{
      machineType: String,
      hourRateINR: Number,
      rateEffectiveFrom: Date,
    }],
    factoryOverheadPct: Number,
    adminOverheadPct: Number,
    sellingOverheadPct: Number,
    overheadEffectiveFrom: Date,
    freightPerPiece: Number,
    gstPct: Number,
  },
  { _id: false }
);

const CostingSheetSchema = new Schema<ICostingSheet>(
  {
    rfqId: { type: Schema.Types.ObjectId, ref: 'RFQ', required: true },
    partId: { type: Schema.Types.ObjectId, required: true },
    partName: { type: String, required: true },
    rfqNumber: { type: String, required: true },
    estimatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    version: { type: Number, default: 1 },
    rateSnapshot: RateSnapshotSchema,
    volumeResults: [VolumeResultSchema],
    marginPct: { type: Number, default: 15, min: 0, max: 99 },
    notes: String,
    status: { type: String, enum: ['draft', 'submitted', 'approved', 'rejected'], default: 'draft' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    rejectionNote: String,
  },
  { timestamps: true }
);

CostingSheetSchema.index({ rfqId: 1, partId: 1 });
CostingSheetSchema.index({ status: 1 });

export const CostingSheet = mongoose.model<ICostingSheet>('CostingSheet', CostingSheetSchema);
