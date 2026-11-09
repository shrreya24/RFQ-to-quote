import mongoose, { Document, Schema } from 'mongoose';

/**
 * Versioned Rate Masters
 * effectiveFrom: when this rate became active
 * effectiveTo: null means currently active
 * Old quotes snapshot rates at time of creation, so history is preserved.
 */

// ── Material Rates ──────────────────────────────────────────────────────────
export interface IMaterialRate extends Document {
  grade: string;          // e.g. "EN8", "40Cr4", "20MnCr5"
  description?: string;
  pricePerKg: number;     // ₹ per kg
  effectiveFrom: Date;
  effectiveTo?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const MaterialRateSchema = new Schema<IMaterialRate>(
  {
    grade: { type: String, required: true, trim: true },
    description: String,
    pricePerKg: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

MaterialRateSchema.index({ grade: 1, effectiveFrom: -1 });
export const MaterialRate = mongoose.model<IMaterialRate>('MaterialRate', MaterialRateSchema);

// ── Machine / Operation Rates ───────────────────────────────────────────────
export interface IMachineRate extends Document {
  machineType: string;    // e.g. "CNC Turning", "VMC", "Grinding", "Hobbing"
  description?: string;
  hourRateINR: number;    // ₹ per hour
  effectiveFrom: Date;
  effectiveTo?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const MachineRateSchema = new Schema<IMachineRate>(
  {
    machineType: { type: String, required: true, trim: true },
    description: String,
    hourRateINR: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

MachineRateSchema.index({ machineType: 1, effectiveFrom: -1 });
export const MachineRate = mongoose.model<IMachineRate>('MachineRate', MachineRateSchema);

// ── Overhead Rates ──────────────────────────────────────────────────────────
export interface IOverheadRate extends Document {
  type: 'factory' | 'admin' | 'selling';
  percentage: number;     // % of manufacturing cost
  effectiveFrom: Date;
  effectiveTo?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const OverheadRateSchema = new Schema<IOverheadRate>(
  {
    type: { type: String, enum: ['factory', 'admin', 'selling'], required: true },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

OverheadRateSchema.index({ type: 1, effectiveFrom: -1 });
export const OverheadRate = mongoose.model<IOverheadRate>('OverheadRate', OverheadRateSchema);

// ── Freight Rates ───────────────────────────────────────────────────────────
export interface IFreightRate extends Document {
  description: string;
  rateType: 'per_kg' | 'fixed';
  rateINR: number;
  effectiveFrom: Date;
  effectiveTo?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const FreightRateSchema = new Schema<IFreightRate>(
  {
    description: { type: String, required: true },
    rateType: { type: String, enum: ['per_kg', 'fixed'], required: true },
    rateINR: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const FreightRate = mongoose.model<IFreightRate>('FreightRate', FreightRateSchema);
