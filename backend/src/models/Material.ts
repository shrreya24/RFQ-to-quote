import mongoose, { Document, Schema } from 'mongoose';

export interface IMaterial extends Document {
  name: string;
  grade?: string;
  unit: string;
  pricePerUnit: number;
  wastagePercentage: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MaterialSchema = new Schema<IMaterial>(
  {
    name: { type: String, required: true, trim: true },
    grade: { type: String, trim: true },
    unit: { type: String, required: true, default: 'kg' },
    pricePerUnit: { type: Number, required: true, min: 0 },
    wastagePercentage: { type: Number, required: true, default: 5, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MaterialSchema.index({ isActive: 1 });

export const Material = mongoose.model<IMaterial>('Material', MaterialSchema);
