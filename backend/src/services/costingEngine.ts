/**
 * ForgeQuote Manufacturing Cost Engine — Multi-Volume Edition
 *
 * All formulas documented here. Deterministic pure functions — no DB, no AI.
 * Each quote snapshots the rates it used for full audit traceability.
 *
 * For Company A, Chakan — machined and forged parts for two-wheeler / tractor / Tier-1.
 */

export interface OperationInput {
  sequence: number;
  operationName: string;
  machineType: string;
  cycleTimeMin: number;   // per piece
  setupTimeMin: number;   // per batch (amortized over annual volume)
  hourRateINR: number;    // from rate master snapshot
}

export interface RateInputs {
  materialPricePerKg: number;   // ₹/kg from rate master
  factoryOverheadPct: number;   // % of manufacturing cost
  adminOverheadPct: number;     // % of manufacturing cost
  sellingOverheadPct: number;   // % of manufacturing cost
  freightPerPiece: number;      // ₹/piece (flat or computed from per-kg rate)
  gstPct: number;               // e.g. 18
}

export interface PartInputs {
  grossWeightKg: number;        // input material weight
  netWeightKg: number;          // finished part weight
  scrapRecoveryPct: number;     // % of scrap value recovered (e.g. 85 = 85%)
  operations: OperationInput[];
}

export interface VolumeInputs {
  annualVolume: number;
  marginPct: number;            // target margin percentage
}

export interface OperationCostResult {
  sequence: number;
  operationName: string;
  machineType: string;
  cycleTimeMin: number;
  setupCostPerPiece: number;   // (setupMin / volume) × (rate/60)
  cycleCostPerPiece: number;   // (cycleMin / 60) × rate
  totalCostPerPiece: number;
}

export interface VolumeResult {
  annualVolume: number;
  grossWeightKg: number;
  netWeightKg: number;

  // Material
  materialCostPerPiece: number;      // grossWt × rate
  scrapWeightKg: number;             // grossWt - netWt
  scrapRecoveryPerPiece: number;     // scrapWt × rate × (recovery% / 100)
  netMaterialCostPerPiece: number;   // materialCost - scrapRecovery

  // Routing
  operationCosts: OperationCostResult[];
  totalRoutingCostPerPiece: number;

  // Aggregates
  manufacturingCostPerPiece: number; // netMaterial + totalRouting
  factoryOverheadPerPiece: number;   // mfgCost × factoryPct/100
  adminOverheadPerPiece: number;     // mfgCost × adminPct/100
  sellingOverheadPerPiece: number;   // mfgCost × sellingPct/100
  totalOverheadPerPiece: number;
  freightPerPiece: number;
  totalCostPerPiece: number;         // mfgCost + overhead + freight

  // Pricing
  marginPct: number;
  marginAmountPerPiece: number;      // totalCost × margin% / (1 - margin%)
  sellingPricePerPiece: number;      // totalCost + margin
  gstPerPiece: number;               // sellingPrice × gst%/100
  priceWithGSTPerPiece: number;      // selling + gst

  // Annual figures
  annualValue: number;               // sellingPrice × volume (ex-GST)
  annualValueWithGST: number;
  needsApproval: boolean;            // annualValue > ₹25,00,000
}

export interface ValidationError {
  field: string;
  message: string;
}

const APPROVAL_THRESHOLD_INR = 2_500_000; // ₹25 lakh

/** Round to 2 decimal places */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Validate inputs before calculation */
export function validateCostingInputs(
  part: PartInputs,
  volumes: VolumeInputs[],
  rates: RateInputs
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (part.grossWeightKg <= 0)
    errors.push({ field: 'grossWeightKg', message: 'Gross weight must be > 0' });
  if (part.netWeightKg <= 0)
    errors.push({ field: 'netWeightKg', message: 'Net weight must be > 0' });
  if (part.netWeightKg > part.grossWeightKg)
    errors.push({ field: 'netWeightKg', message: 'Net weight cannot exceed gross weight' });
  if (part.scrapRecoveryPct < 0 || part.scrapRecoveryPct > 100)
    errors.push({ field: 'scrapRecoveryPct', message: 'Scrap recovery must be 0–100%' });
  if (rates.materialPricePerKg <= 0)
    errors.push({ field: 'materialPricePerKg', message: 'Material price must be > 0' });
  if (rates.gstPct < 0 || rates.gstPct > 50)
    errors.push({ field: 'gstPct', message: 'GST % must be 0–50' });
  if (rates.factoryOverheadPct < 0)
    errors.push({ field: 'factoryOverheadPct', message: 'Factory overhead cannot be negative' });
  if (rates.adminOverheadPct < 0)
    errors.push({ field: 'adminOverheadPct', message: 'Admin overhead cannot be negative' });
  if (rates.sellingOverheadPct < 0)
    errors.push({ field: 'sellingOverheadPct', message: 'Selling overhead cannot be negative' });
  if (rates.freightPerPiece < 0)
    errors.push({ field: 'freightPerPiece', message: 'Freight cannot be negative' });

  volumes.forEach((v, i) => {
    if (v.annualVolume <= 0)
      errors.push({ field: `volumes[${i}].annualVolume`, message: 'Volume must be > 0' });
    if (v.marginPct < 0 || v.marginPct >= 100)
      errors.push({ field: `volumes[${i}].marginPct`, message: 'Margin must be 0–99.99%' });
  });

  part.operations.forEach((op, i) => {
    if (op.cycleTimeMin < 0)
      errors.push({ field: `operations[${i}].cycleTimeMin`, message: 'Cycle time cannot be negative' });
    if (op.hourRateINR <= 0)
      errors.push({ field: `operations[${i}].hourRateINR`, message: 'Machine hour rate must be > 0' });
  });

  return errors;
}

/**
 * Calculate manufacturing cost for a single volume.
 *
 * MATERIAL:
 *   materialCost     = grossWt × materialRate
 *   scrapRecovery    = (grossWt − netWt) × materialRate × (scrapRecoveryPct / 100)
 *   netMaterialCost  = materialCost − scrapRecovery
 *
 * ROUTING (per operation):
 *   cycleCost   = (cycleTimeMin / 60) × hourRate
 *   setupCost   = (setupTimeMin / 60 / annualVolume) × hourRate   ← amortized
 *   opCost      = cycleCost + setupCost
 *
 * OVERHEAD:
 *   mfgCost     = netMaterialCost + Σ(opCost)
 *   factoryOH   = mfgCost × factoryPct/100
 *   adminOH     = mfgCost × adminPct/100
 *   sellingOH   = mfgCost × sellingPct/100
 *
 * PRICE:
 *   totalCost   = mfgCost + factoryOH + adminOH + sellingOH + freight
 *   margin      = totalCost × marginPct / (1 − marginPct/100)
 *   selling     = totalCost + margin
 *   gst         = selling × gstPct/100
 *   annualValue = selling × volume  (ex-GST)
 */
export function calculateVolumeResult(
  part: PartInputs,
  volume: VolumeInputs,
  rates: RateInputs
): VolumeResult {
  const { grossWeightKg, netWeightKg, scrapRecoveryPct, operations } = part;
  const { annualVolume, marginPct } = volume;
  const { materialPricePerKg, factoryOverheadPct, adminOverheadPct, sellingOverheadPct, freightPerPiece, gstPct } = rates;

  // ── Material ─────────────────────────────────────────────────────────────
  const materialCostPerPiece = r2(grossWeightKg * materialPricePerKg);
  const scrapWeightKg = r2(grossWeightKg - netWeightKg);
  const scrapRecoveryPerPiece = r2(scrapWeightKg * materialPricePerKg * (scrapRecoveryPct / 100));
  const netMaterialCostPerPiece = r2(materialCostPerPiece - scrapRecoveryPerPiece);

  // ── Routing ──────────────────────────────────────────────────────────────
  const operationCosts: OperationCostResult[] = operations.map(op => {
    const cycleCostPerPiece = r2((op.cycleTimeMin / 60) * op.hourRateINR);
    // Setup time amortized over annual volume
    const setupCostPerPiece = r2((op.setupTimeMin / 60 / annualVolume) * op.hourRateINR);
    return {
      sequence: op.sequence,
      operationName: op.operationName,
      machineType: op.machineType,
      cycleTimeMin: op.cycleTimeMin,
      setupCostPerPiece,
      cycleCostPerPiece,
      totalCostPerPiece: r2(cycleCostPerPiece + setupCostPerPiece),
    };
  });

  const totalRoutingCostPerPiece = r2(operationCosts.reduce((s, op) => s + op.totalCostPerPiece, 0));

  // ── Aggregates ───────────────────────────────────────────────────────────
  const manufacturingCostPerPiece = r2(netMaterialCostPerPiece + totalRoutingCostPerPiece);
  const factoryOverheadPerPiece = r2(manufacturingCostPerPiece * (factoryOverheadPct / 100));
  const adminOverheadPerPiece = r2(manufacturingCostPerPiece * (adminOverheadPct / 100));
  const sellingOverheadPerPiece = r2(manufacturingCostPerPiece * (sellingOverheadPct / 100));
  const totalOverheadPerPiece = r2(factoryOverheadPerPiece + adminOverheadPerPiece + sellingOverheadPerPiece);
  const totalCostPerPiece = r2(manufacturingCostPerPiece + totalOverheadPerPiece + freightPerPiece);

  // ── Pricing ──────────────────────────────────────────────────────────────
  // Using: sellingPrice = totalCost / (1 - margin%/100)
  // This means margin is % of selling price (common manufacturing practice)
  if (marginPct >= 100) throw new Error('Margin cannot be ≥ 100%');
  const sellingPricePerPiece = r2(totalCostPerPiece / (1 - marginPct / 100));
  const marginAmountPerPiece = r2(sellingPricePerPiece - totalCostPerPiece);
  const gstPerPiece = r2(sellingPricePerPiece * (gstPct / 100));
  const priceWithGSTPerPiece = r2(sellingPricePerPiece + gstPerPiece);
  const annualValue = r2(sellingPricePerPiece * annualVolume);
  const annualValueWithGST = r2(priceWithGSTPerPiece * annualVolume);

  return {
    annualVolume,
    grossWeightKg,
    netWeightKg,
    materialCostPerPiece,
    scrapWeightKg,
    scrapRecoveryPerPiece,
    netMaterialCostPerPiece,
    operationCosts,
    totalRoutingCostPerPiece,
    manufacturingCostPerPiece,
    factoryOverheadPerPiece,
    adminOverheadPerPiece,
    sellingOverheadPerPiece,
    totalOverheadPerPiece,
    freightPerPiece,
    totalCostPerPiece,
    marginPct,
    marginAmountPerPiece,
    sellingPricePerPiece,
    gstPerPiece,
    priceWithGSTPerPiece,
    annualValue,
    annualValueWithGST,
    needsApproval: annualValue > APPROVAL_THRESHOLD_INR,
  };
}

/**
 * Calculate all volumes for a part. Throws on validation failure.
 */
export function calculateAllVolumes(
  part: PartInputs,
  volumes: VolumeInputs[],
  rates: RateInputs
): VolumeResult[] {
  const errors = validateCostingInputs(part, volumes, rates);
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join('; ')}`);
  }
  return volumes.map(v => calculateVolumeResult(part, v, rates));
}
