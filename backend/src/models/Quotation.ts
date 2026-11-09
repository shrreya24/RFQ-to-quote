import mongoose, { Document, Schema } from 'mongoose';

export type QuotationStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired';

export interface IQuotation extends Document {
  quotationNumber: string;
  rfqId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  estimatorId: mongoose.Types.ObjectId;
  estimateId: mongoose.Types.ObjectId;
  componentName: string;
  componentSpecifications: string;
  orderQuantity: number;
  unitPrice: number;
  totalAmount: number;
  deliveryTimeline: string;
  deliveryTerms?: string;
  paymentTerms: string;
  validityDate: Date;
  termsAndConditions?: string;
  status: QuotationStatus;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectionReason?: string;
  customerResponseAt?: Date;
  customerNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const QuotationSchema = new Schema<IQuotation>(
  {
    quotationNumber: { type: String, required: true, unique: true },
    rfqId: { type: Schema.Types.ObjectId, ref: 'RFQ', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    estimatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    estimateId: { type: Schema.Types.ObjectId, ref: 'CostEstimate', required: true },
    componentName: { type: String, required: true },
    componentSpecifications: { type: String, required: true },
    orderQuantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    deliveryTimeline: { type: String, required: true },
    deliveryTerms: String,
    paymentTerms: { type: String, required: true },
    validityDate: { type: Date, required: true },
    termsAndConditions: String,
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'expired'],
      default: 'draft',
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    rejectionReason: String,
    customerResponseAt: Date,
    customerNote: String,
  },
  { timestamps: true }
);

QuotationSchema.index({ customerId: 1, status: 1 });
QuotationSchema.index({ rfqId: 1 });
QuotationSchema.index({ quotationNumber: 1 });
QuotationSchema.index({ status: 1, createdAt: -1 });

export const Quotation = mongoose.model<IQuotation>('Quotation', QuotationSchema);
