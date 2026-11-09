import { calculateAllVolumes, calculateVolumeResult, validateCostingInputs, PartInputs, VolumeInputs, RateInputs } from './costingEngine';

// ── Sample data from the real client brief ──────────────────────────────────
const en8SpindlePart: PartInputs = {
  grossWeightKg: 0.61,
  netWeightKg: 0.52,
  scrapRecoveryPct: 85,
  operations: [
    { sequence: 1, operationName: 'Turning', machineType: 'CNC Turning', cycleTimeMin: 3.2, setupTimeMin: 30, hourRateINR: 850 },
  ],
};

const en8Rates: RateInputs = {
  materialPricePerKg: 75,       // EN8 approx rate
  factoryOverheadPct: 25,
  adminOverheadPct: 8,
  sellingOverheadPct: 5,
  freightPerPiece: 1.5,
  gstPct: 18,
};

const volume180k: VolumeInputs = { annualVolume: 180000, marginPct: 15 };
const volume120k: VolumeInputs = { annualVolume: 120000, marginPct: 15 };

describe('CostingEngine — Real Client Data', () => {
  describe('EN8 Rear Wheel Spindle (RFQ-2611-014)', () => {
    it('should calculate material cost correctly', () => {
      const result = calculateVolumeResult(en8SpindlePart, volume180k, en8Rates);
      // grossWt × rate = 0.61 × 75 = 45.75
      expect(result.materialCostPerPiece).toBe(45.75);
    });

    it('should calculate scrap recovery correctly', () => {
      const result = calculateVolumeResult(en8SpindlePart, volume180k, en8Rates);
      // scrapWt = 0.61 - 0.52 = 0.09 kg
      expect(result.scrapWeightKg).toBe(0.09);
      // scrapRecovery = 0.09 × 75 × 0.85 = 5.7375
      expect(result.scrapRecoveryPerPiece).toBeCloseTo(5.74, 1);
      // netMaterial = 45.75 - 5.74 = 40.01
      expect(result.netMaterialCostPerPiece).toBeCloseTo(40.01, 0);
    });

    it('should amortize setup time over annual volume', () => {
      const result = calculateVolumeResult(en8SpindlePart, volume180k, en8Rates);
      // setupCost = (30 / 60 / 180000) × 850 = 0.000078 per piece ≈ 0
      expect(result.operationCosts[0].setupCostPerPiece).toBeCloseTo(0, 2);
    });

    it('should amortize setup cost differently across volumes', () => {
      const r180k = calculateVolumeResult(en8SpindlePart, volume180k, en8Rates);
      const r120k = calculateVolumeResult(en8SpindlePart, volume120k, en8Rates);
      // Higher volume = lower setup cost per piece
      expect(r180k.operationCosts[0].setupCostPerPiece).toBeLessThan(
        r120k.operationCosts[0].setupCostPerPiece
      );
    });

    it('should calculate cycle cost correctly', () => {
      const result = calculateVolumeResult(en8SpindlePart, volume180k, en8Rates);
      // cycleCost = (3.2 / 60) × 850 = 45.33
      expect(result.operationCosts[0].cycleCostPerPiece).toBeCloseTo(45.33, 1);
    });

    it('should calculate overhead on manufacturing cost', () => {
      const result = calculateVolumeResult(en8SpindlePart, volume180k, en8Rates);
      const expectedFactory = result.manufacturingCostPerPiece * 0.25;
      const expectedAdmin = result.manufacturingCostPerPiece * 0.08;
      expect(result.factoryOverheadPerPiece).toBeCloseTo(expectedFactory, 1);
      expect(result.adminOverheadPerPiece).toBeCloseTo(expectedAdmin, 1);
    });

    it('should trigger approval for high annual value', () => {
      // At 180k volume with ~₹98/piece selling → annualValue ≈ 1.76 crore > 25L
      const result = calculateVolumeResult(en8SpindlePart, volume180k, en8Rates);
      expect(result.needsApproval).toBe(true);
    });

    it('should include freight in total cost', () => {
      const result = calculateVolumeResult(en8SpindlePart, volume180k, en8Rates);
      expect(result.freightPerPiece).toBe(1.5);
      expect(result.totalCostPerPiece).toBe(
        result.manufacturingCostPerPiece + result.totalOverheadPerPiece + result.freightPerPiece
      );
    });

    it('selling price = totalCost / (1 - margin%/100)', () => {
      const result = calculateVolumeResult(en8SpindlePart, volume180k, en8Rates);
      const expected = result.totalCostPerPiece / (1 - 0.15);
      expect(result.sellingPricePerPiece).toBeCloseTo(expected, 1);
    });

    it('annualValue = sellingPrice × volume', () => {
      const result = calculateVolumeResult(en8SpindlePart, volume180k, en8Rates);
      expect(result.annualValue).toBeCloseTo(result.sellingPricePerPiece * 180000, 0);
    });

    it('GST calculated on selling price', () => {
      const result = calculateVolumeResult(en8SpindlePart, volume180k, en8Rates);
      expect(result.gstPerPiece).toBeCloseTo(result.sellingPricePerPiece * 0.18, 1);
      expect(result.priceWithGSTPerPiece).toBeCloseTo(result.sellingPricePerPiece * 1.18, 1);
    });
  });

  describe('Multi-volume: higher volume gives lower per-piece cost', () => {
    it('setup amortization should make per-piece cost lower at higher volumes', () => {
      const partWithSetup: PartInputs = {
        grossWeightKg: 4.6,
        netWeightKg: 4.0,
        scrapRecoveryPct: 80,
        operations: [
          { sequence: 1, operationName: 'Forging', machineType: 'Hydraulic Press', cycleTimeMin: 11.5, setupTimeMin: 120, hourRateINR: 1450 },
        ],
      };
      const rates: RateInputs = {
        materialPricePerKg: 120,
        factoryOverheadPct: 20,
        adminOverheadPct: 5,
        sellingOverheadPct: 5,
        freightPerPiece: 5,
        gstPct: 18,
      };
      const r24k = calculateVolumeResult(partWithSetup, { annualVolume: 24000, marginPct: 15 }, rates);
      const r48k = calculateVolumeResult(partWithSetup, { annualVolume: 48000, marginPct: 15 }, rates);
      // Higher volume → lower setup cost per piece → lower total cost
      expect(r48k.totalCostPerPiece).toBeLessThan(r24k.totalCostPerPiece);
    });
  });

  describe('Edge Cases', () => {
    it('throws when gross weight is zero', () => {
      const invalid = { ...en8SpindlePart, grossWeightKg: 0 };
      expect(() => calculateAllVolumes(invalid, [volume180k], en8Rates)).toThrow();
    });

    it('throws when net weight > gross weight', () => {
      const invalid = { ...en8SpindlePart, netWeightKg: 1.0 };
      expect(() => calculateAllVolumes(invalid, [volume180k], en8Rates)).toThrow();
    });

    it('throws when margin >= 100', () => {
      const invalid = { annualVolume: 180000, marginPct: 100 };
      expect(() => calculateAllVolumes(en8SpindlePart, [invalid], en8Rates)).toThrow();
    });

    it('throws when margin < 0', () => {
      const invalid = { annualVolume: 180000, marginPct: -5 };
      expect(() => calculateAllVolumes(en8SpindlePart, [invalid], en8Rates)).toThrow();
    });

    it('throws when volume is 0', () => {
      const invalid = { annualVolume: 0, marginPct: 15 };
      expect(() => calculateAllVolumes(en8SpindlePart, [invalid], en8Rates)).toThrow();
    });

    it('handles zero scrap recovery correctly (net = gross)', () => {
      const noScrap = { ...en8SpindlePart, netWeightKg: 0.61, scrapRecoveryPct: 0 };
      const result = calculateVolumeResult(noScrap, volume180k, en8Rates);
      expect(result.scrapWeightKg).toBe(0);
      expect(result.scrapRecoveryPerPiece).toBe(0);
      expect(result.netMaterialCostPerPiece).toBe(result.materialCostPerPiece);
    });

    it('handles zero freight', () => {
      const noFreight = { ...en8Rates, freightPerPiece: 0 };
      const result = calculateVolumeResult(en8SpindlePart, volume180k, noFreight);
      expect(result.freightPerPiece).toBe(0);
    });

    it('calculates correctly with zero overhead', () => {
      const noOH = { ...en8Rates, factoryOverheadPct: 0, adminOverheadPct: 0, sellingOverheadPct: 0 };
      const result = calculateVolumeResult(en8SpindlePart, volume180k, noOH);
      expect(result.totalOverheadPerPiece).toBe(0);
      expect(result.totalCostPerPiece).toBe(result.manufacturingCostPerPiece + result.freightPerPiece);
    });

    it('calculates multiple operations correctly', () => {
      const multiOp: PartInputs = {
        ...en8SpindlePart,
        operations: [
          { sequence: 1, operationName: 'Turning', machineType: 'CNC Turning', cycleTimeMin: 3.2, setupTimeMin: 30, hourRateINR: 850 },
          { sequence: 2, operationName: 'Milling', machineType: 'VMC', cycleTimeMin: 2.0, setupTimeMin: 20, hourRateINR: 950 },
          { sequence: 3, operationName: 'Grinding', machineType: 'Grinder', cycleTimeMin: 1.5, setupTimeMin: 15, hourRateINR: 1100 },
        ],
      };
      const result = calculateVolumeResult(multiOp, volume180k, en8Rates);
      expect(result.operationCosts).toHaveLength(3);
      // Each operation contributes
      result.operationCosts.forEach(op => {
        expect(op.totalCostPerPiece).toBeGreaterThan(0);
      });
    });

    it('does not trigger approval below 25L threshold', () => {
      // Very small part, low volume
      const smallPart: PartInputs = {
        grossWeightKg: 0.1,
        netWeightKg: 0.09,
        scrapRecoveryPct: 85,
        operations: [
          { sequence: 1, operationName: 'Turning', machineType: 'CNC Turning', cycleTimeMin: 1.0, setupTimeMin: 10, hourRateINR: 850 },
        ],
      };
      const smallVolume: VolumeInputs = { annualVolume: 1000, marginPct: 10 };
      const result = calculateVolumeResult(smallPart, smallVolume, en8Rates);
      expect(result.annualValue).toBeLessThan(2_500_000);
      expect(result.needsApproval).toBe(false);
    });
  });

  describe('Validation', () => {
    it('returns errors without throwing', () => {
      const badPart = { ...en8SpindlePart, grossWeightKg: -1 };
      const errors = validateCostingInputs(badPart, [volume180k], en8Rates);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].field).toBe('grossWeightKg');
    });

    it('returns multiple errors', () => {
      const badPart = { ...en8SpindlePart, grossWeightKg: -1, netWeightKg: -1 };
      const errors = validateCostingInputs(badPart, [volume180k], en8Rates);
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
