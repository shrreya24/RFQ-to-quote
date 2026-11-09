import mongoose, { Document, Schema } from 'mongoose';

/**
 * HistoricalQuote — imported from Excel or seeded from past company records.
 * Used for:
 *   1. Past quote search (find similar parts)
 *   2. AI routing suggestions (find parts with similar material/weight → suggest routing)
 */
export interface IHistoricalQuote extends Document {
  rfqNumber: string;
  customer: string;
  partName: string;
  drawingNumber?: string;
  materialGrade: string;
  grossWeightKg: number;
  netWeightKg?: number;
  annualVolume: number;
  // Primary routing (simplified — historical data may not have full routing)
  primaryOperation?: string;
  cycleTimeMin?: number;
  machineType?: string;
  hourRateAtTime?: number;
  // Costing snapshot
  sellingPricePerPiece?: number;
  annualValue?: number;
  year?: number;
  quotedDate?: Date;
  // Import metadata
  importedAt: Date;
  importedBy?: mongoose.Types.ObjectId;
  // Computed similarity vector (for fast matching)
  similarityTags: string[];  // e.g. ["EN8", "turning", "light_part", "high_volume"]
}

const HistoricalQuoteSchema = new Schema<IHistoricalQuote>(
  {
    rfqNumber: { type: String, required: true },
    customer: { type: String, required: true },
    partName: { type: String, required: true },
    drawingNumber: String,
    materialGrade: { type: String, required: true },
    grossWeightKg: { type: Number, required: true },
    netWeightKg: Number,
    annualVolume: { type: Number, required: true },
    primaryOperation: String,
    cycleTimeMin: Number,
    machineType: String,
    hourRateAtTime: Number,
    sellingPricePerPiece: Number,
    annualValue: Number,
    year: Number,
    quotedDate: Date,
    importedAt: { type: Date, default: Date.now },
    importedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    similarityTags: [String],
  },
  { timestamps: false }
);

// Text search index for past quote search
HistoricalQuoteSchema.index({ partName: 'text', materialGrade: 'text', customer: 'text', rfqNumber: 'text' });
HistoricalQuoteSchema.index({ materialGrade: 1, grossWeightKg: 1 });
HistoricalQuoteSchema.index({ rfqNumber: 1 });

export const HistoricalQuote = mongoose.model<IHistoricalQuote>('HistoricalQuote', HistoricalQuoteSchema);
