import { RFQ } from '../models/RFQ';
import { Quotation } from '../models/Quotation';
import { format } from 'date-fns';

let rfqCounter: number | null = null;
let quotationCounter: number | null = null;

/**
 * Generate sequential RFQ number: RFQ-2026-0001
 */
export async function generateRFQNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `RFQ-${year}-`;

  if (rfqCounter === null) {
    const last = await RFQ.findOne({ rfqNumber: { $regex: `^${prefix}` } })
      .sort({ rfqNumber: -1 })
      .select('rfqNumber');
    if (last) {
      const num = parseInt(last.rfqNumber.split('-')[2], 10);
      rfqCounter = isNaN(num) ? 0 : num;
    } else {
      rfqCounter = 0;
    }
  }

  rfqCounter++;
  return `${prefix}${String(rfqCounter).padStart(4, '0')}`;
}

/**
 * Generate sequential Quotation number: QT-2026-0001
 */
export async function generateQuotationNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `QT-${year}-`;

  if (quotationCounter === null) {
    const last = await Quotation.findOne({ quotationNumber: { $regex: `^${prefix}` } })
      .sort({ quotationNumber: -1 })
      .select('quotationNumber');
    if (last) {
      const num = parseInt(last.quotationNumber.split('-')[2], 10);
      quotationCounter = isNaN(num) ? 0 : num;
    } else {
      quotationCounter = 0;
    }
  }

  quotationCounter++;
  return `${prefix}${String(quotationCounter).padStart(4, '0')}`;
}

export function resetCounters() {
  rfqCounter = null;
  quotationCounter = null;
}
