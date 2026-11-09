/**
 * Rate Resolution Service
 * Fetches the effective rate for a given date (defaults to today).
 * Used to build rate snapshots that are frozen into costing sheets.
 */

import { MaterialRate, MachineRate, OverheadRate, FreightRate } from '../models/RateMaster';
import { RateInputs, OperationInput } from './costingEngine';
import { IRateSnapshot } from '../models/CostingSheet';

/**
 * Find the rate effective at a given date.
 * Picks the record where effectiveFrom <= date AND (effectiveTo is null OR effectiveTo > date).
 * If multiple match, pick the most recent effectiveFrom.
 */
async function getMaterialRateAt(grade: string, atDate: Date = new Date()) {
  const rate = await MaterialRate.findOne({
    grade: { $regex: new RegExp(`^${grade.trim()}$`, 'i') },
    effectiveFrom: { $lte: atDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: atDate } }],
  }).sort({ effectiveFrom: -1 });
  return rate;
}

async function getMachineRateAt(machineType: string, atDate: Date = new Date()) {
  const rate = await MachineRate.findOne({
    machineType: { $regex: new RegExp(`^${machineType.trim()}$`, 'i') },
    effectiveFrom: { $lte: atDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: atDate } }],
  }).sort({ effectiveFrom: -1 });
  return rate;
}

async function getOverheadRatesAt(atDate: Date = new Date()) {
  const [factory, admin, selling] = await Promise.all([
    OverheadRate.findOne({ type: 'factory', effectiveFrom: { $lte: atDate }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: atDate } }] }).sort({ effectiveFrom: -1 }),
    OverheadRate.findOne({ type: 'admin', effectiveFrom: { $lte: atDate }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: atDate } }] }).sort({ effectiveFrom: -1 }),
    OverheadRate.findOne({ type: 'selling', effectiveFrom: { $lte: atDate }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: atDate } }] }).sort({ effectiveFrom: -1 }),
  ]);
  return { factory, admin, selling };
}

async function getFreightRateAt(atDate: Date = new Date()) {
  return FreightRate.findOne({
    effectiveFrom: { $lte: atDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: atDate } }],
  }).sort({ effectiveFrom: -1 });
}

export interface ResolvedRates {
  rateInputs: RateInputs;
  operationInputs: (operations: { machineType: string; cycleTimeMin: number; setupTimeMin: number; sequence: number; operationName: string }[]) => Promise<OperationInput[]>;
  snapshot: Omit<IRateSnapshot, 'operations'>;
}

export class RateMissingError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'RateMissingError';
  }
}

/**
 * Build a complete rate snapshot for a part's costing.
 * Throws RateMissingError if any required rate is not found.
 */
export async function buildRateSnapshot(
  materialGrade: string,
  machineTypes: string[],
  gstPct: number = 18,
  atDate: Date = new Date()
): Promise<{
  rateSnapshot: IRateSnapshot;
  rateInputs: RateInputs;
  operationRates: { machineType: string; hourRateINR: number; rateEffectiveFrom: Date }[];
}> {
  // Material
  const matRate = await getMaterialRateAt(materialGrade, atDate);
  if (!matRate) {
    throw new RateMissingError('materialGrade', `No active material rate found for grade "${materialGrade}". Please add it in Rate Masters.`);
  }

  // Overhead
  const { factory, admin, selling } = await getOverheadRatesAt(atDate);
  if (!factory) throw new RateMissingError('factoryOverhead', 'No active factory overhead rate found');
  if (!admin) throw new RateMissingError('adminOverhead', 'No active admin overhead rate found');
  if (!selling) throw new RateMissingError('sellingOverhead', 'No active selling overhead rate found');

  // Freight
  const freight = await getFreightRateAt(atDate);
  const freightPerPiece = freight
    ? (freight.rateType === 'fixed' ? freight.rateINR : freight.rateINR)
    : 0;

  // Machine rates
  const uniqueMachineTypes = [...new Set(machineTypes)];
  const machineRates: { machineType: string; hourRateINR: number; rateEffectiveFrom: Date }[] = [];

  for (const mt of uniqueMachineTypes) {
    const mr = await getMachineRateAt(mt, atDate);
    if (!mr) {
      throw new RateMissingError('machineRate', `No active machine rate found for type "${mt}". Please add it in Rate Masters.`);
    }
    machineRates.push({ machineType: mt, hourRateINR: mr.hourRateINR, rateEffectiveFrom: mr.effectiveFrom });
  }

  const rateInputs: RateInputs = {
    materialPricePerKg: matRate.pricePerKg,
    factoryOverheadPct: factory.percentage,
    adminOverheadPct: admin.percentage,
    sellingOverheadPct: selling.percentage,
    freightPerPiece,
    gstPct,
  };

  const rateSnapshot: IRateSnapshot = {
    materialGrade,
    materialPricePerKg: matRate.pricePerKg,
    materialRateEffectiveFrom: matRate.effectiveFrom,
    operations: machineRates,
    factoryOverheadPct: factory.percentage,
    adminOverheadPct: admin.percentage,
    sellingOverheadPct: selling.percentage,
    overheadEffectiveFrom: factory.effectiveFrom,
    freightPerPiece,
    gstPct,
  };

  return { rateSnapshot, rateInputs, operationRates: machineRates };
}

/**
 * Given routing operations from a part, attach the correct hour rates from snapshot.
 */
export function attachRatesToOperations(
  operations: { sequence: number; operationName: string; machineType: string; cycleTimeMin: number; setupTimeMin: number }[],
  operationRates: { machineType: string; hourRateINR: number }[]
): OperationInput[] {
  return operations.map(op => {
    const rate = operationRates.find(r => r.machineType.toLowerCase() === op.machineType.toLowerCase());
    if (!rate) {
      throw new RateMissingError('machineRate', `No rate found for machine type "${op.machineType}"`);
    }
    return {
      ...op,
      hourRateINR: rate.hourRateINR,
    };
  });
}
