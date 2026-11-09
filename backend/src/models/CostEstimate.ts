import mongoose, { Document, Schema } from 'mongoose';

export interface IMaterialBreakdown {
  materialId?: mongoose.Types.ObjectId;
  materialName: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  wastagePercentage: number;
  adjustedQuantity: number;
  cost: number;
}

export interface ICostEstimate extends Document {
  rfqId: mongoose.Types.ObjectId;
  estimatorId: mongoose.Types.ObjectId;
  materialBreakdown: IMaterialBreakdown[];
  labourHours: number;
  labourHourlyRate: number;
  labourCost: number;
  machineHours: number;
  machineHourlyRate: number;
  machineName?: string;
  machineId?: mongoose.Types.ObjectId;
  machineCost: number;
  toolingCost: number;
  packagingCost: number;
  transportationCost: number;
  otherCosts: number;
  overheadPercentage: number;
  overheadCost: number;
  totalProductionCost: number;
  orderQuantity: number;
  costPerUnit: number;
  profitMargin: number;
  sellingPricePerUnit: number;
  totalQuotationValue: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MaterialBreakdownSchema = new Schema<IMaterialBreakdown>(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'Material' },
    materialName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true },
    pricePerUnit: { type: Number, required: true, min: 0 },
    wastagePercentage: { type: Number, required: true, default: 0 },
    adjustedQuantity: { type: Number, required: true },
    cost: { type: Number, required: true },
  },
  { _id: false }
);

const CostEstimateSchema = new Schema<ICostEstimate>(
  {
    rfqId: { type: Schema.Types.ObjectId, ref: 'RFQ', required: true },
    estimatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    materialBreakdown: [MaterialBreakdownSchema],
    labourHours: { type: Number, default: 0, min: 0 },
    labourHourlyRate: { type: Number, default: 0, min: 0 },
    labourCost: { type: Number, default: 0 },
    machineHours: { type: Number, default: 0, min: 0 },
    machineHourlyRate: { type: Number, default: 0, min: 0 },
    machineName: String,
    machineId: { type: Schema.Types.ObjectId, ref: 'Machine' },
    machineCost: { type: Number, default: 0 },
    toolingCost: { type: Number, default: 0, min: 0 },
    packagingCost: { type: Number, default: 0, min: 0 },
    transportationCost: { type: Number, default: 0, min: 0 },
    otherCosts: { type: Number, default: 0, min: 0 },
    overheadPercentage: { type: Number, default: 10, min: 0, max: 100 },
    overheadCost: { type: Number, default: 0 },
    totalProductionCost: { type: Number, default: 0 },
    orderQuantity: { type: Number, required: true, min: 1 },
    costPerUnit: { type: Number, default: 0 },
    profitMargin: { type: Number, default: 20, min: 0, max: 99.99 },
    sellingPricePerUnit: { type: Number, default: 0 },
    totalQuotationValue: { type: Number, default: 0 },
    notes: String,
  },
  { timestamps: true }
);

CostEstimateSchema.index({ rfqId: 1 });

export const CostEstimate = mongoose.model<ICostEstimate>('CostEstimate', CostEstimateSchema);
