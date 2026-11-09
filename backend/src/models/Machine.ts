import mongoose, { Document, Schema } from 'mongoose';

export interface IMachine extends Document {
  name: string;
  hourlyRate: number;
  processType: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MachineSchema = new Schema<IMachine>(
  {
    name: { type: String, required: true, trim: true },
    hourlyRate: { type: Number, required: true, min: 0 },
    processType: { type: String, required: true, trim: true },
    description: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MachineSchema.index({ isActive: 1 });

export const Machine = mongoose.model<IMachine>('Machine', MachineSchema);
