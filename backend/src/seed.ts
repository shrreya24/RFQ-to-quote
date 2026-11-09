/**
 * ForgeQuote Seed Script — Company A, Chakan
 * Run: npx ts-node src/seed.ts
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

import { User } from './models/User';
import { MaterialRate, MachineRate, OverheadRate, FreightRate } from './models/RateMaster';
import { RFQ } from './models/RFQ';
import { CostingSheet } from './models/CostingSheet';
import { HistoricalQuote } from './models/HistoricalQuote';
import { calculateVolumeResult } from './services/costingEngine';

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/forgequote');
  console.log('[SEED] Connected');

  await Promise.all([
    User.deleteMany({}), MaterialRate.deleteMany({}), MachineRate.deleteMany({}),
    OverheadRate.deleteMany({}), FreightRate.deleteMany({}),
    RFQ.deleteMany({}), CostingSheet.deleteMany({}), HistoricalQuote.deleteMany({}),
  ]);
  console.log('[SEED] Cleared');

  const h = (pw: string) => bcrypt.hash(pw, 12);
  const d0 = new Date('2024-01-01T00:00:00Z');  // base date for rates
  const d1 = new Date('2025-04-01T00:00:00Z');  // revised rates

  // ── Users ──────────────────────────────────────────────────────────────────
  const [admin, estimator1, estimator2, salesHead] = await Promise.all([
    User.create({ name: 'Vijay Kulkarni', email: 'admin@companya.in', passwordHash: await h('Admin@123'), role: 'admin', isActive: true }),
    User.create({ name: 'Priya Joshi', email: 'estimator@companya.in', passwordHash: await h('Estimator@123'), role: 'estimator', isActive: true }),
    User.create({ name: 'Rahul Patil', email: 'estimator2@companya.in', passwordHash: await h('Estimator@123'), role: 'estimator', isActive: true }),
    User.create({ name: 'Suresh Deshpande', email: 'sales@companya.in', passwordHash: await h('SalesHead@123'), role: 'sales_head', isActive: true }),
  ]);
  console.log('[SEED] 4 users created');

  // ── Rate Masters ───────────────────────────────────────────────────────────
  // Material rates — initial (Jan 2024)
  const matRates2024 = await MaterialRate.insertMany([
    { grade: 'EN8', pricePerKg: 68, effectiveFrom: d0, createdBy: admin._id },
    { grade: 'EN19', pricePerKg: 88, effectiveFrom: d0, createdBy: admin._id },
    { grade: '40Cr4', pricePerKg: 95, effectiveFrom: d0, createdBy: admin._id },
    { grade: '20MnCr5', pricePerKg: 105, effectiveFrom: d0, createdBy: admin._id },
    { grade: 'MS', pricePerKg: 55, effectiveFrom: d0, createdBy: admin._id },
    { grade: 'SS304', pricePerKg: 185, effectiveFrom: d0, createdBy: admin._id },
    { grade: 'C45', pricePerKg: 72, effectiveFrom: d0, createdBy: admin._id },
    { grade: 'EN31', pricePerKg: 112, effectiveFrom: d0, createdBy: admin._id },
  ]);

  // Revised rates (Apr 2025) — close old ones
  for (const old of matRates2024) {
    await MaterialRate.findByIdAndUpdate(old._id, { effectiveTo: d1 });
  }
  await MaterialRate.insertMany([
    { grade: 'EN8', pricePerKg: 75, effectiveFrom: d1, createdBy: admin._id },
    { grade: 'EN19', pricePerKg: 96, effectiveFrom: d1, createdBy: admin._id },
    { grade: '40Cr4', pricePerKg: 108, effectiveFrom: d1, createdBy: admin._id },
    { grade: '20MnCr5', pricePerKg: 118, effectiveFrom: d1, createdBy: admin._id },
    { grade: 'MS', pricePerKg: 62, effectiveFrom: d1, createdBy: admin._id },
    { grade: 'SS304', pricePerKg: 210, effectiveFrom: d1, createdBy: admin._id },
    { grade: 'C45', pricePerKg: 79, effectiveFrom: d1, createdBy: admin._id },
    { grade: 'EN31', pricePerKg: 125, effectiveFrom: d1, createdBy: admin._id },
    { grade: '16MnCr5', pricePerKg: 98, effectiveFrom: d1, createdBy: admin._id },
  ]);

  // Machine rates
  const machRates2024 = await MachineRate.insertMany([
    { machineType: 'CNC Turning', hourRateINR: 780, effectiveFrom: d0, createdBy: admin._id },
    { machineType: 'VMC', hourRateINR: 1100, effectiveFrom: d0, createdBy: admin._id },
    { machineType: 'Hobbing', hourRateINR: 950, effectiveFrom: d0, createdBy: admin._id },
    { machineType: 'Grinding', hourRateINR: 1050, effectiveFrom: d0, createdBy: admin._id },
    { machineType: 'Hydraulic Press', hourRateINR: 1350, effectiveFrom: d0, createdBy: admin._id },
    { machineType: 'HMC', hourRateINR: 1250, effectiveFrom: d0, createdBy: admin._id },
    { machineType: 'Drilling', hourRateINR: 650, effectiveFrom: d0, createdBy: admin._id },
    { machineType: 'Broaching', hourRateINR: 820, effectiveFrom: d0, createdBy: admin._id },
  ]);

  for (const old of machRates2024) {
    await MachineRate.findByIdAndUpdate(old._id, { effectiveTo: d1 });
  }
  await MachineRate.insertMany([
    { machineType: 'CNC Turning', hourRateINR: 850, effectiveFrom: d1, createdBy: admin._id },
    { machineType: 'VMC', hourRateINR: 1200, effectiveFrom: d1, createdBy: admin._id },
    { machineType: 'Hobbing', hourRateINR: 1050, effectiveFrom: d1, createdBy: admin._id },
    { machineType: 'Grinding', hourRateINR: 1150, effectiveFrom: d1, createdBy: admin._id },
    { machineType: 'Hydraulic Press', hourRateINR: 1450, effectiveFrom: d1, createdBy: admin._id },
    { machineType: 'HMC', hourRateINR: 1350, effectiveFrom: d1, createdBy: admin._id },
    { machineType: 'Drilling', hourRateINR: 720, effectiveFrom: d1, createdBy: admin._id },
    { machineType: 'Broaching', hourRateINR: 900, effectiveFrom: d1, createdBy: admin._id },
    { machineType: 'CNC Milling', hourRateINR: 980, effectiveFrom: d1, createdBy: admin._id },
  ]);

  // Overhead rates
  const ohRates2024 = await OverheadRate.insertMany([
    { type: 'factory', percentage: 22, effectiveFrom: d0, createdBy: admin._id },
    { type: 'admin', percentage: 6, effectiveFrom: d0, createdBy: admin._id },
    { type: 'selling', percentage: 4, effectiveFrom: d0, createdBy: admin._id },
  ]);
  for (const old of ohRates2024) {
    await OverheadRate.findByIdAndUpdate(old._id, { effectiveTo: d1 });
  }
  await OverheadRate.insertMany([
    { type: 'factory', percentage: 25, effectiveFrom: d1, createdBy: admin._id },
    { type: 'admin', percentage: 7, effectiveFrom: d1, createdBy: admin._id },
    { type: 'selling', percentage: 5, effectiveFrom: d1, createdBy: admin._id },
  ]);

  const fr2024 = await FreightRate.create({ description: 'Standard truck freight', rateType: 'per_kg', rateINR: 3.5, effectiveFrom: d0, createdBy: admin._id });
  await FreightRate.findByIdAndUpdate(fr2024._id, { effectiveTo: d1 });
  await FreightRate.create({ description: 'Standard truck freight', rateType: 'per_kg', rateINR: 4.2, effectiveFrom: d1, createdBy: admin._id });

  console.log('[SEED] Rate masters created (2 versions each)');

  // ── Historical Quotes (seeded data matching the client's 3 sample rows) ────
  const histQuotes = await HistoricalQuote.insertMany([
    {
      rfqNumber: 'RFQ-2611-014', customer: 'Company B (Two-Wheelers)',
      partName: 'Rear Wheel Spindle', materialGrade: 'EN8',
      grossWeightKg: 0.61, netWeightKg: 0.52, annualVolume: 180000,
      primaryOperation: 'CNC Turning', cycleTimeMin: 3.2, machineType: 'CNC Turning',
      hourRateAtTime: 850, sellingPricePerPiece: 94.50, annualValue: 17010000, year: 2024,
      quotedDate: new Date('2024-11-15'), similarityTags: ['en8', 'cnc turning', 'light_part', 'high_volume'],
    },
    {
      rfqNumber: 'RFQ-2611-019', customer: 'Company C (Tractors)',
      partName: 'Hydraulic Lift Arm', materialGrade: '40Cr4',
      grossWeightKg: 4.60, netWeightKg: 3.95, annualVolume: 24000,
      primaryOperation: 'Hydraulic Press', cycleTimeMin: 11.5, machineType: 'Hydraulic Press',
      hourRateAtTime: 1450, sellingPricePerPiece: 1245, annualValue: 29880000, year: 2024,
      quotedDate: new Date('2024-11-22'), similarityTags: ['40cr4', 'hydraulic press', 'medium_part', 'medium_volume'],
    },
    {
      rfqNumber: 'RFQ-2611-023', customer: 'Company D (Drivetrains)',
      partName: 'Gear Blank', materialGrade: '20MnCr5',
      grossWeightKg: 1.48, netWeightKg: 1.28, annualVolume: 60000,
      primaryOperation: 'CNC Turning', cycleTimeMin: 4.8, machineType: 'CNC Turning',
      hourRateAtTime: 950, sellingPricePerPiece: 285, annualValue: 17100000, year: 2024,
      quotedDate: new Date('2024-12-02'), similarityTags: ['20mncr5', 'cnc turning', 'light_part', 'medium_volume'],
    },
    // Additional historical records for search demo
    { rfqNumber: 'RFQ-2412-001', customer: 'Company B (Two-Wheelers)', partName: 'Brake Cam Shaft', materialGrade: 'EN8', grossWeightKg: 0.38, netWeightKg: 0.32, annualVolume: 240000, primaryOperation: 'CNC Turning', cycleTimeMin: 2.5, machineType: 'CNC Turning', hourRateAtTime: 780, sellingPricePerPiece: 65, annualValue: 15600000, year: 2024, quotedDate: new Date('2024-12-10'), similarityTags: ['en8', 'cnc turning', 'micro_part', 'high_volume'] },
    { rfqNumber: 'RFQ-2409-011', customer: 'Company E (OEM)', partName: 'Pinion Shaft', materialGrade: '20MnCr5', grossWeightKg: 0.92, netWeightKg: 0.78, annualVolume: 120000, primaryOperation: 'CNC Turning', cycleTimeMin: 5.2, machineType: 'CNC Turning', hourRateAtTime: 950, sellingPricePerPiece: 178, annualValue: 21360000, year: 2024, quotedDate: new Date('2024-09-15'), similarityTags: ['20mncr5', 'cnc turning', 'light_part', 'high_volume'] },
    { rfqNumber: 'RFQ-2407-005', customer: 'Company C (Tractors)', partName: 'PTO Shaft', materialGrade: 'EN19', grossWeightKg: 3.2, netWeightKg: 2.7, annualVolume: 36000, primaryOperation: 'CNC Turning', cycleTimeMin: 9.5, machineType: 'CNC Turning', hourRateAtTime: 850, sellingPricePerPiece: 680, annualValue: 24480000, year: 2024, quotedDate: new Date('2024-07-20'), similarityTags: ['en19', 'cnc turning', 'medium_part', 'medium_volume'] },
    { rfqNumber: 'RFQ-2405-018', customer: 'Company F (Commercial)', partName: 'Hub Flange', materialGrade: 'MS', grossWeightKg: 5.8, netWeightKg: 4.9, annualVolume: 18000, primaryOperation: 'HMC', cycleTimeMin: 14.0, machineType: 'HMC', hourRateAtTime: 1250, sellingPricePerPiece: 1850, annualValue: 33300000, year: 2024, quotedDate: new Date('2024-05-10'), similarityTags: ['ms', 'hmc', 'medium_part', 'low_volume'] },
    { rfqNumber: 'RFQ-2403-022', customer: 'Company D (Drivetrains)', partName: 'Ring Gear Blank', materialGrade: '20MnCr5', grossWeightKg: 2.15, netWeightKg: 1.85, annualVolume: 72000, primaryOperation: 'Hobbing', cycleTimeMin: 7.8, machineType: 'Hobbing', hourRateAtTime: 950, sellingPricePerPiece: 425, annualValue: 30600000, year: 2024, quotedDate: new Date('2024-03-18'), similarityTags: ['20mncr5', 'hobbing', 'light_part', 'medium_volume'] },
    { rfqNumber: 'RFQ-2401-007', customer: 'Company G (Tier-1)', partName: 'Bearing Housing', materialGrade: 'EN31', grossWeightKg: 1.6, netWeightKg: 1.35, annualVolume: 48000, primaryOperation: 'VMC', cycleTimeMin: 8.5, machineType: 'VMC', hourRateAtTime: 1100, sellingPricePerPiece: 520, annualValue: 24960000, year: 2024, quotedDate: new Date('2024-01-25'), similarityTags: ['en31', 'vmc', 'light_part', 'medium_volume'] },
    { rfqNumber: 'RFQ-2312-031', customer: 'Company B (Two-Wheelers)', partName: 'Crankshaft', materialGrade: 'EN8', grossWeightKg: 1.25, netWeightKg: 1.05, annualVolume: 300000, primaryOperation: 'CNC Turning', cycleTimeMin: 6.5, machineType: 'CNC Turning', hourRateAtTime: 780, sellingPricePerPiece: 210, annualValue: 63000000, year: 2023, quotedDate: new Date('2023-12-14'), similarityTags: ['en8', 'cnc turning', 'light_part', 'high_volume'] },
  ]);
  console.log(`[SEED] ${histQuotes.length} historical quotes created`);

  // ── Live RFQs ──────────────────────────────────────────────────────────────
  const now = new Date();
  const rfqDocs = await RFQ.insertMany([
    // RFQ 1: The client's sample (RFQ-2611-014 re-opened as a new order)
    {
      rfqNumber: 'RFQ-2611-001',
      customer: 'Company B (Two-Wheelers)',
      receivedDate: new Date(now.getTime() - 3 * 24 * 3600000),
      dueDate: new Date(now.getTime() + 1 * 24 * 3600000), // due tomorrow — urgent!
      ownerId: estimator1._id, createdBy: estimator1._id,
      status: 'estimating',
      parts: [{
        partName: 'Rear Wheel Spindle', drawingNumber: 'DRG-RWS-2026-001',
        materialGrade: 'EN8', grossWeightKg: 0.61, netWeightKg: 0.52, scrapRecoveryPct: 85,
        routing: [
          { sequence: 1, operationName: 'Turning', machineType: 'CNC Turning', cycleTimeMin: 3.2, setupTimeMin: 30 },
          { sequence: 2, operationName: 'Grinding', machineType: 'Grinding', cycleTimeMin: 1.2, setupTimeMin: 20 },
        ],
        costedVolumes: [120000, 180000, 240000],
        aiExtracted: true, aiSourceNote: 'Routing suggested from RFQ-2611-014 (similar EN8 spindle, 0.61 kg)',
      }],
      statusHistory: [
        { status: 'new', changedBy: estimator1._id, changedAt: new Date(now.getTime() - 3 * 24 * 3600000), note: 'Received by email' },
        { status: 'estimating', changedBy: estimator1._id, changedAt: new Date(now.getTime() - 2 * 24 * 3600000), note: 'Costing started' },
      ],
    },
    // RFQ 2: Tractor customer
    {
      rfqNumber: 'RFQ-2611-002',
      customer: 'Company C (Tractors)',
      receivedDate: new Date(now.getTime() - 5 * 24 * 3600000),
      dueDate: new Date(now.getTime() + 3 * 24 * 3600000),
      ownerId: estimator2._id, createdBy: estimator2._id,
      status: 'estimating',
      parts: [
        {
          partName: 'Hydraulic Lift Arm', drawingNumber: 'DRG-HLA-2026-001',
          materialGrade: '40Cr4', grossWeightKg: 4.60, netWeightKg: 3.95, scrapRecoveryPct: 80,
          routing: [
            { sequence: 1, operationName: 'Forging', machineType: 'Hydraulic Press', cycleTimeMin: 11.5, setupTimeMin: 60 },
            { sequence: 2, operationName: 'Turning', machineType: 'CNC Turning', cycleTimeMin: 5.5, setupTimeMin: 30 },
          ],
          costedVolumes: [12000, 24000, 48000],
          aiExtracted: true, aiSourceNote: 'From RFQ-2611-019',
        },
        {
          partName: 'Steering Bracket', drawingNumber: 'DRG-STB-2026-001',
          materialGrade: 'MS', grossWeightKg: 2.1, netWeightKg: 1.8, scrapRecoveryPct: 85,
          routing: [
            { sequence: 1, operationName: 'Milling', machineType: 'VMC', cycleTimeMin: 8.0, setupTimeMin: 45 },
          ],
          costedVolumes: [12000, 24000],
          aiExtracted: false,
        },
      ],
      statusHistory: [
        { status: 'new', changedBy: estimator2._id, changedAt: new Date(now.getTime() - 5 * 24 * 3600000) },
        { status: 'estimating', changedBy: estimator2._id, changedAt: new Date(now.getTime() - 4 * 24 * 3600000) },
      ],
    },
    // RFQ 3: Drivetrain gear blank
    {
      rfqNumber: 'RFQ-2611-003',
      customer: 'Company D (Drivetrains)',
      receivedDate: new Date(now.getTime() - 7 * 24 * 3600000),
      dueDate: new Date(now.getTime() + 5 * 24 * 3600000),
      ownerId: estimator1._id, createdBy: estimator1._id,
      status: 'review',
      parts: [{
        partName: 'Gear Blank', drawingNumber: 'DRG-GB-2026-001',
        materialGrade: '20MnCr5', grossWeightKg: 1.48, netWeightKg: 1.28, scrapRecoveryPct: 85,
        routing: [
          { sequence: 1, operationName: 'Turning', machineType: 'CNC Turning', cycleTimeMin: 4.8, setupTimeMin: 30 },
          { sequence: 2, operationName: 'Hobbing', machineType: 'Hobbing', cycleTimeMin: 6.5, setupTimeMin: 45 },
          { sequence: 3, operationName: 'Grinding', machineType: 'Grinding', cycleTimeMin: 2.8, setupTimeMin: 25 },
        ],
        costedVolumes: [30000, 60000, 90000],
        aiExtracted: true, aiSourceNote: 'From RFQ-2611-023',
      }],
      statusHistory: [
        { status: 'new', changedBy: estimator1._id, changedAt: new Date(now.getTime() - 7 * 24 * 3600000) },
        { status: 'estimating', changedBy: estimator1._id, changedAt: new Date(now.getTime() - 6 * 24 * 3600000) },
        { status: 'review', changedBy: estimator1._id, changedAt: new Date(now.getTime() - 2 * 24 * 3600000), note: 'Submitted for sales head review' },
      ],
    },
    // RFQ 4: Won
    {
      rfqNumber: 'RFQ-2610-008',
      customer: 'Company B (Two-Wheelers)',
      receivedDate: new Date(now.getTime() - 30 * 24 * 3600000),
      dueDate: new Date(now.getTime() - 24 * 24 * 3600000),
      ownerId: estimator1._id, createdBy: estimator1._id,
      status: 'won',
      parts: [{
        partName: 'Brake Cam Shaft', materialGrade: 'EN8',
        grossWeightKg: 0.38, netWeightKg: 0.32, scrapRecoveryPct: 85,
        routing: [{ sequence: 1, operationName: 'Turning', machineType: 'CNC Turning', cycleTimeMin: 2.5, setupTimeMin: 20 }],
        costedVolumes: [240000], aiExtracted: false,
      }],
      statusHistory: [
        { status: 'new', changedBy: estimator1._id, changedAt: new Date(now.getTime() - 30 * 24 * 3600000) },
        { status: 'sent', changedBy: salesHead._id, changedAt: new Date(now.getTime() - 20 * 24 * 3600000) },
        { status: 'won', changedBy: salesHead._id, changedAt: new Date(now.getTime() - 15 * 24 * 3600000), note: 'PO received' },
      ],
    },
    // RFQ 5: Lost
    {
      rfqNumber: 'RFQ-2610-012',
      customer: 'Company G (Tier-1)',
      receivedDate: new Date(now.getTime() - 45 * 24 * 3600000),
      dueDate: new Date(now.getTime() - 38 * 24 * 3600000),
      ownerId: estimator2._id, createdBy: estimator2._id,
      status: 'lost',
      lostReason: 'Price: customer went with cheaper supplier (₹12 per piece lower)',
      parts: [{
        partName: 'Bearing Housing', materialGrade: 'EN31',
        grossWeightKg: 1.6, netWeightKg: 1.35, scrapRecoveryPct: 85,
        routing: [{ sequence: 1, operationName: 'Milling', machineType: 'VMC', cycleTimeMin: 8.5, setupTimeMin: 45 }],
        costedVolumes: [48000], aiExtracted: false,
      }],
      statusHistory: [
        { status: 'new', changedBy: estimator2._id, changedAt: new Date(now.getTime() - 45 * 24 * 3600000) },
        { status: 'sent', changedBy: salesHead._id, changedAt: new Date(now.getTime() - 35 * 24 * 3600000) },
        { status: 'lost', changedBy: salesHead._id, changedAt: new Date(now.getTime() - 25 * 24 * 3600000), note: 'Customer chose competitor' },
      ],
    },
    // RFQ 6: New (just received)
    {
      rfqNumber: 'RFQ-2611-004',
      customer: 'Company E (OEM)',
      receivedDate: now,
      dueDate: new Date(now.getTime() + 4 * 24 * 3600000),
      ownerId: estimator2._id, createdBy: estimator2._id,
      status: 'new',
      parts: [{
        partName: 'Pinion Shaft', materialGrade: '20MnCr5',
        grossWeightKg: 0.92, netWeightKg: 0.78, scrapRecoveryPct: 85,
        routing: [],
        costedVolumes: [60000, 120000],
        aiExtracted: false,
      }],
      statusHistory: [{ status: 'new', changedBy: estimator2._id, changedAt: now }],
    },
  ]);
  console.log(`[SEED] ${rfqDocs.length} RFQs created`);

  // ── Costing Sheet for RFQ-2611-003 (Gear Blank — in review) ────────────────
  const gearBlankRFQ = rfqDocs.find(r => r.rfqNumber === 'RFQ-2611-003')!;
  const gearBlankPart = gearBlankRFQ.parts[0];

  const rateSnapshot = {
    materialGrade: '20MnCr5',
    materialPricePerKg: 118,
    materialRateEffectiveFrom: d1,
    operations: [
      { machineType: 'CNC Turning', hourRateINR: 850, rateEffectiveFrom: d1 },
      { machineType: 'Hobbing', hourRateINR: 1050, rateEffectiveFrom: d1 },
      { machineType: 'Grinding', hourRateINR: 1150, rateEffectiveFrom: d1 },
    ],
    factoryOverheadPct: 25,
    adminOverheadPct: 7,
    sellingOverheadPct: 5,
    overheadEffectiveFrom: d1,
    freightPerPiece: 4.2 * 1.48, // per_kg × gross_wt
    gstPct: 18,
  };

  const computeVol = (vol: number) => calculateVolumeResult(
    {
      grossWeightKg: 1.48, netWeightKg: 1.28, scrapRecoveryPct: 85,
      operations: [
        { sequence: 1, operationName: 'Turning', machineType: 'CNC Turning', cycleTimeMin: 4.8, setupTimeMin: 30, hourRateINR: 850 },
        { sequence: 2, operationName: 'Hobbing', machineType: 'Hobbing', cycleTimeMin: 6.5, setupTimeMin: 45, hourRateINR: 1050 },
        { sequence: 3, operationName: 'Grinding', machineType: 'Grinding', cycleTimeMin: 2.8, setupTimeMin: 25, hourRateINR: 1150 },
      ],
    },
    { annualVolume: vol, marginPct: 15 },
    { materialPricePerKg: 118, factoryOverheadPct: 25, adminOverheadPct: 7, sellingOverheadPct: 5, freightPerPiece: 6.2, gstPct: 18 }
  );

  await CostingSheet.create({
    rfqId: gearBlankRFQ._id,
    partId: gearBlankPart._id,
    partName: gearBlankPart.partName,
    rfqNumber: 'RFQ-2611-003',
    estimatorId: estimator1._id,
    version: 1,
    rateSnapshot,
    volumeResults: [computeVol(30000), computeVol(60000), computeVol(90000)],
    marginPct: 15,
    status: 'submitted',
    notes: 'Hobbing cycle time verified against RFQ-2611-023 (similar gear blank). Setup times estimated.',
  });
  console.log('[SEED] 1 costing sheet created');

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORGEQUOTE — DEMO ACCOUNTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Admin:      admin@companya.in      / Admin@123
Estimator:  estimator@companya.in  / Estimator@123
Estimator2: estimator2@companya.in / Estimator@123
Sales Head: sales@companya.in      / SalesHead@123
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => { console.error('[SEED]', err); process.exit(1); });
