import PDFDocument from 'pdfkit';
import { ICostingSheet, IVolumeResult } from '../models/CostingSheet';
import { IRFQ } from '../models/RFQ';
import { IUser } from '../models/User';
import { format } from 'date-fns';

function r(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function line(doc: PDFKit.PDFDocument, y: number, color = '#E5E7EB') {
  doc.moveTo(40, y).lineTo(555, y).strokeColor(color).stroke();
}

export function generateQuotePDF(
  rfq: IRFQ,
  sheets: ICostingSheet[],
  customer: string,
  preparedBy: IUser
): Buffer {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.on('data', (c: Buffer) => chunks.push(c));

  const dark = '#111827';
  const accent = '#2563EB';
  const gray = '#6B7280';
  const light = '#F9FAFB';

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 100).fill(dark);
  doc.fill('white').fontSize(22).font('Helvetica-Bold').text('Company A', 40, 28);
  doc.fontSize(9).font('Helvetica').fill('#9CA3AF')
    .text('Precision Machined & Forged Components | Chakan, Pune', 40, 54)
    .text('Two-Wheeler • Tractor • Tier-1 Automotive', 40, 66);

  doc.fill('white').fontSize(11).font('Helvetica-Bold')
    .text('PRICE QUOTATION', 380, 32, { align: 'right', width: 135 });
  doc.fill(accent).fontSize(16)
    .text(rfq.rfqNumber, 380, 50, { align: 'right', width: 135 });
  doc.fill('#9CA3AF').fontSize(8).font('Helvetica')
    .text(`Date: ${format(new Date(), 'dd-MMM-yyyy')}`, 380, 74, { align: 'right', width: 135 });

  // ── Quote Meta ──────────────────────────────────────────────────────────────
  doc.y = 116;
  doc.fill(dark).fontSize(10).font('Helvetica-Bold').text('To:', 40, 116);
  doc.fontSize(11).text(customer, 40, 128);
  doc.fontSize(9).fill(gray).font('Helvetica').text(`RFQ Ref: ${rfq.rfqNumber}`, 40, 142)
    .text(`Due Date: ${format(new Date(rfq.dueDate), 'dd-MMM-yyyy')}`, 40, 154);

  doc.fontSize(9).fill(gray).text(`Prepared by: ${preparedBy.name}`, 350, 128)
    .text(`Date: ${format(new Date(), 'dd-MMM-yyyy')}`, 350, 140)
    .text(`Valid for: 30 days`, 350, 152)
    .text(`GST: Applicable as per HSN`, 350, 164);

  line(doc, 178);
  doc.y = 186;

  // ── Per-Part Breakdown ──────────────────────────────────────────────────────
  for (const sheet of sheets) {
    const rfqPart = rfq.parts.find(p => String(p._id) === String(sheet.partId));

    // Part header
    doc.rect(40, doc.y, 515, 22).fill(dark);
    doc.fill('white').fontSize(10).font('Helvetica-Bold')
      .text(`Part: ${sheet.partName}`, 46, doc.y + 6, { width: 300 });
    const snap = sheet.rateSnapshot;
    doc.fill('#9CA3AF').fontSize(8)
      .text(`Material: ${snap.materialGrade}  |  Gross Wt: ${rfqPart?.grossWeightKg ?? '?'} kg  |  Net Wt: ${rfqPart?.netWeightKg ?? '?'} kg`, 46, doc.y + 14);
    doc.y += 24;

    // Volume table header
    const volCount = sheet.volumeResults.length;
    const colW = 515 / (3 + volCount);
    const cols = ['Cost Element', ...sheet.volumeResults.map(v => `${(v.annualVolume / 1000).toFixed(0)}K pa`), 'Remarks'];
    doc.rect(40, doc.y, 515, 18).fill(light);
    cols.forEach((col, i) => {
      doc.fill(dark).fontSize(8).font('Helvetica-Bold')
        .text(col, 40 + i * colW, doc.y + 5, { width: colW, align: i === 0 ? 'left' : 'right' });
    });
    doc.y += 20;

    // Cost rows
    const rows: { label: string; values: (v: IVolumeResult) => string; remark?: string }[] = [
      { label: 'Material Cost/pc', values: v => r(v.materialCostPerPiece) },
      { label: 'Scrap Recovery/pc', values: v => `-${r(v.scrapRecoveryPerPiece)}`, remark: `${rfqPart?.scrapRecoveryPct ?? 85}% recovery` },
      { label: 'Net Material/pc', values: v => r(v.netMaterialCostPerPiece) },
      { label: 'Total Routing/pc', values: v => r(v.totalRoutingCostPerPiece) },
      { label: 'Mfg Cost/pc', values: v => r(v.manufacturingCostPerPiece) },
      { label: `Factory OH (${snap.factoryOverheadPct}%)`, values: v => r(v.factoryOverheadPerPiece) },
      { label: `Admin OH (${snap.adminOverheadPct}%)`, values: v => r(v.adminOverheadPerPiece) },
      { label: `Selling OH (${snap.sellingOverheadPct}%)`, values: v => r(v.sellingOverheadPerPiece) },
      { label: 'Freight/pc', values: v => r(v.freightPerPiece) },
      { label: 'Total Cost/pc', values: v => r(v.totalCostPerPiece) },
      { label: `Margin (${sheet.volumeResults[0]?.marginPct ?? 15}%)`, values: v => r(v.marginAmountPerPiece) },
    ];

    rows.forEach((row, idx) => {
      const bg = idx % 2 === 0 ? 'white' : '#FAFAFA';
      doc.rect(40, doc.y, 515, 16).fill(bg);
      const isBold = ['Net Material/pc', 'Mfg Cost/pc', 'Total Cost/pc'].includes(row.label);
      doc.fill(dark).fontSize(8).font(isBold ? 'Helvetica-Bold' : 'Helvetica')
        .text(row.label, 44, doc.y + 4, { width: colW - 4 });
      sheet.volumeResults.forEach((v, vi) => {
        doc.text(row.values(v), 40 + (vi + 1) * colW, doc.y + 4, { width: colW, align: 'right' });
      });
      if (row.remark) {
        doc.fill(gray).text(row.remark, 40 + (volCount + 1) * colW, doc.y + 4, { width: colW });
      }
      doc.y += 16;
    });

    // Selling price highlight row
    doc.rect(40, doc.y, 515, 22).fill(accent);
    doc.fill('white').fontSize(9).font('Helvetica-Bold')
      .text('SELLING PRICE/pc (ex-GST)', 44, doc.y + 6, { width: colW - 4 });
    sheet.volumeResults.forEach((v, vi) => {
      doc.text(r(v.sellingPricePerPiece), 40 + (vi + 1) * colW, doc.y + 6, { width: colW, align: 'right' });
    });
    doc.y += 24;

    // Annual value
    doc.rect(40, doc.y, 515, 18).fill('#F0F9FF');
    doc.fill('#1E40AF').fontSize(8).font('Helvetica')
      .text('Annual Value (ex-GST)', 44, doc.y + 5, { width: colW - 4 });
    sheet.volumeResults.forEach((v, vi) => {
      const approvalFlag = v.needsApproval ? ' ✓' : '';
      doc.text(r(v.annualValue) + approvalFlag, 40 + (vi + 1) * colW, doc.y + 5, { width: colW, align: 'right' });
    });
    doc.y += 22;

    // Routing detail
    if (rfqPart && rfqPart.routing.length > 0) {
      doc.fill(gray).fontSize(7).font('Helvetica').text('Operations: ' +
        rfqPart.routing.map(op => `${op.operationName} (${op.cycleTimeMin}min @ ₹${sheet.rateSnapshot.operations.find(o => o.machineType === op.machineType)?.hourRateINR ?? '?'}/hr)`).join(' → '),
        44, doc.y + 2);
      doc.y += 14;
    }

    line(doc, doc.y + 4);
    doc.y += 14;

    // Page break if needed
    if (doc.y > 700 && sheets.indexOf(sheet) < sheets.length - 1) {
      doc.addPage();
    }
  }

  // ── Rate Snapshot Note ──────────────────────────────────────────────────────
  doc.y += 10;
  doc.fill(gray).fontSize(7).font('Helvetica')
    .text(`Rate Snapshot: Rates used in this quotation are locked as of ${format(new Date(), 'dd-MMM-yyyy HH:mm')}.`, 40, doc.y)
    .text('These rates are traceable in the ForgeQuote system against each costing sheet.', 40, doc.y + 10)
    .text('✓ indicates annual value > ₹25 lakh (approved by Sales Head)', 40, doc.y + 20);

  // ── Terms ───────────────────────────────────────────────────────────────────
  doc.y += 38;
  line(doc, doc.y);
  doc.y += 6;
  doc.fill(dark).fontSize(9).font('Helvetica-Bold').text('Terms & Conditions', 40, doc.y);
  doc.fontSize(8).fill(gray).font('Helvetica')
    .text('1. Prices are ex-works, Chakan, Pune. GST extra as applicable.', 40, doc.y + 12)
    .text('2. Payment terms: 60 days from date of invoice.', 40, doc.y + 22)
    .text('3. Delivery: As per schedule to be agreed upon purchase order.', 40, doc.y + 32)
    .text('4. Validity: 30 days from date of quotation.', 40, doc.y + 42)
    .text('5. Subject to availability of raw material at quoted rates.', 40, doc.y + 52);

  // ── Footer ──────────────────────────────────────────────────────────────────
  const footerY = doc.page.height - 40;
  line(doc, footerY - 6);
  doc.fill(gray).fontSize(7).text(
    `ForgeQuote | ${rfq.rfqNumber} | Generated: ${format(new Date(), 'dd-MMM-yyyy HH:mm')} | Prepared by: ${preparedBy.name}`,
    40, footerY, { align: 'center', width: 515 }
  );

  doc.end();
  return Buffer.concat(chunks);
}
