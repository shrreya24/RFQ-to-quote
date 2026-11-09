import mongoose, { Document, Schema } from 'mongoose';

export type RFQStatus = 'new' | 'estimating' | 'review' | 'approved' | 'sent' | 'won' | 'lost';

export interface IOperation {
  sequence: number;
  operationName: string;    // e.g. "Turning", "Milling", "Grinding"
  machineType: string;      // links to MachineRate.machineType
  cycleTimeMin: number;     // per piece
  setupTimeMin: number;     // per batch (amortized over volume)
}

export interface IPart {
  _id?: mongoose.Types.ObjectId;
  partName: string;
  drawingNumber?: string;
  materialGrade: string;    // links to MaterialRate.grade
  grossWeightKg: number;    // input weight / raw material weight
  netWeightKg: number;      // finished part weight
  scrapRecoveryPct: number; // % of scrap value recovered (e.g. 85%)
  surfaceArea?: number;     // cm² (optional, for coating cost)
  routing: IOperation[];
  costedVolumes: number[];  // e.g. [60000, 120000, 180000]
  aiExtracted?: boolean;    // was this part pre-filled by AI?
  aiSourceNote?: string;    // which past RFQ suggested routing?
}

export interface IStatusHistory {
  status: RFQStatus;
  changedBy: mongoose.Types.ObjectId;
  changedAt: Date;
  note?: string;
}

export interface IRFQ extends Document {
  rfqNumber: string;
  customer: string;
  receivedDate: Date;
  dueDate: Date;
  ownerId: mongoose.Types.ObjectId;
  parts: IPart[];
  status: RFQStatus;
  lostReason?: string;
  sourceEmail?: string;     // original RFQ email text (for AI re-analysis)
  statusHistory: IStatusHistory[];
  aiAnalysisNotes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OperationSchema = new Schema<IOperation>(
  {
    sequence: { type: Number, required: true },
    operationName: { type: String, required: true },
    machineType: { type: String, required: true },
    cycleTimeMin: { type: Number, required: true, min: 0 },
    setupTimeMin: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const PartSchema = new Schema<IPart>(
  {
    partName: { type: String, required: true },
    drawingNumber: String,
    materialGrade: { type: String, required: true },
    grossWeightKg: { type: Number, required: true, min: 0 },
    netWeightKg: { type: Number, required: true, min: 0 },
    scrapRecoveryPct: { type: Number, default: 85, min: 0, max: 100 },
    surfaceArea: Number,
    routing: [OperationSchema],
    costedVolumes: { type: [Number], default: [] },
    aiExtracted: { type: Boolean, default: false },
    aiSourceNote: String,
  }
);

const StatusHistorySchema = new Schema<IStatusHistory>(
  {
    status: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
    note: String,
  },
  { _id: false }
);

const RFQSchema = new Schema<IRFQ>(
  {
    rfqNumber: { type: String, required: true, unique: true },
    customer: { type: String, required: true },
    receivedDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parts: [PartSchema],
    status: {
      type: String,
      enum: ['new', 'estimating', 'review', 'approved', 'sent', 'won', 'lost'],
      default: 'new',
    },
    lostReason: String,
    sourceEmail: String,
    statusHistory: [StatusHistorySchema],
    aiAnalysisNotes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

RFQSchema.index({ status: 1, dueDate: 1 });
RFQSchema.index({ customer: 1 });
RFQSchema.index({ rfqNumber: 1 });
RFQSchema.index({ dueDate: 1 });

export const RFQ = mongoose.model<IRFQ>('RFQ', RFQSchema);
