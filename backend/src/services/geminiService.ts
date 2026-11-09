/**
 * AI Intake Service — ForgeQuote
 *
 * Two functions:
 * 1. extractRFQFromText: Parse RFQ email/Excel text → structured part data
 * 2. suggestRoutings: Find similar past quotes → suggest routing
 *
 * Constraints:
 * - Gemini Flash (fast, cheap) for extraction
 * - No AI in cost maths — only extraction and routing suggestion
 * - Every extracted value is tagged with its source
 * - All suggestions require estimator acceptance
 * - No data sent to AI services that train on input (Gemini API does not train on API calls by default)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { HistoricalQuote } from '../models/HistoricalQuote';

export interface ExtractedPart {
  partName?: string;
  drawingNumber?: string;
  materialGrade?: string;
  grossWeightKg?: number;
  netWeightKg?: number;
  annualVolume?: number;
  primaryOperation?: string;
  cycleTimeMin?: number;
  deliveryDate?: string;
  customer?: string;
  rfqReference?: string;
  // Source tracking for UI display
  sources: Record<string, string>; // field → "from email" | "from Excel row" etc.
  confidence: number;              // 0–1
  missingFields: string[];
  warnings: string[];
}

export interface RFQExtractionResult {
  parts: ExtractedPart[];
  rfqNumber?: string;
  customer?: string;
  dueDate?: string;
  source: 'ai' | 'fallback';
  warning?: string;
}

export interface RoutingSuggestion {
  sourceRFQNumber: string;
  sourcePartName: string;
  sourceMaterial: string;
  sourceGrossWeightKg: number;
  similarityScore: number;       // 0–1
  suggestedRouting: {
    operationName: string;
    machineType: string;
    cycleTimeMin: number;
    setupTimeMin: number;
    note: string;                // e.g. "from RFQ-2611-014 (similar EN8 part, 0.61 kg)"
  }[];
}

// ── Fallback extraction (keyword-based) ─────────────────────────────────────
function extractMaterialFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  const grades = ['en8', 'en19', 'en31', 'en36', 'en353', '40cr4', '42cr4', '20mncr5', '16mncr5',
    'en19', '17crni6', 'mild steel', 'ms', 'ss304', 'ss316', 'aluminium', 'aluminum', 'cast iron',
    'sgci', 'ci', 'brass', 'copper', 'c45', 'ck45', 'c60'];
  for (const g of grades) {
    if (lower.includes(g)) return g.toUpperCase();
  }
  return undefined;
}

function extractNumberAfter(text: string, patterns: string[]): number | undefined {
  for (const pat of patterns) {
    const re = new RegExp(`${pat}[:\\s]+([\\d.]+)`, 'i');
    const m = text.match(re);
    if (m) return parseFloat(m[1]);
  }
  return undefined;
}

export function fallbackExtract(text: string): RFQExtractionResult {
  const sources: Record<string, string> = {};
  const warnings: string[] = ['AI unavailable — basic keyword extraction used. Please review all fields.'];
  const missingFields: string[] = [];

  const material = extractMaterialFromText(text);
  const volume = extractNumberAfter(text, ['volume', 'qty', 'quantity', 'annual', 'nos', 'pcs', 'pieces']) ||
    extractNumberAfter(text, ['\\d{2,6}(?:,\\d{3})*']);
  const grossWt = extractNumberAfter(text, ['gross wt', 'gross weight', 'raw weight', 'input wt', 'gross', 'wt']);
  const cycleTime = extractNumberAfter(text, ['cycle time', 'ct', 'cycle']);

  if (material) sources.materialGrade = 'keyword match';
  else missingFields.push('materialGrade');
  if (volume) sources.annualVolume = 'keyword match';
  else missingFields.push('annualVolume');
  if (grossWt) sources.grossWeightKg = 'keyword match';
  else missingFields.push('grossWeightKg');
  if (cycleTime) sources.cycleTimeMin = 'keyword match';

  const part: ExtractedPart = {
    materialGrade: material,
    grossWeightKg: grossWt,
    annualVolume: volume,
    cycleTimeMin: cycleTime,
    sources,
    confidence: missingFields.length > 2 ? 0.2 : 0.4,
    missingFields,
    warnings,
  };

  return { parts: [part], source: 'fallback', warning: warnings[0] };
}

// ── AI extraction via Gemini ─────────────────────────────────────────────────
const EXTRACTION_PROMPT = `You are an expert manufacturing estimator at an Indian auto-component company.
Extract part information from the following RFQ text.

Return ONLY valid JSON, no markdown. Schema:
{
  "rfqNumber": "string or null",
  "customer": "string or null",
  "dueDate": "ISO date string or null",
  "parts": [
    {
      "partName": "string",
      "drawingNumber": "string or null",
      "materialGrade": "string (e.g. EN8, 40Cr4, 20MnCr5, MS, SS304)",
      "grossWeightKg": number or null,
      "netWeightKg": number or null,
      "annualVolume": number or null,
      "primaryOperation": "main operation like Turning, Forging, Milling, Grinding or null",
      "cycleTimeMin": number or null,
      "confidence": 0.0 to 1.0,
      "missingFields": ["list of fields that are unclear or missing"],
      "warnings": ["list of ambiguities or concerns"]
    }
  ]
}

RFQ TEXT:
`;

export async function extractRFQFromText(text: string): Promise<RFQExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return fallbackExtract(text);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(EXTRACTION_PROMPT + text);
    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ...fallbackExtract(text), warning: 'AI returned unexpected format — fallback used' };

    const parsed = JSON.parse(jsonMatch[0]);
    const parts: ExtractedPart[] = (parsed.parts || []).map((p: Record<string, unknown>) => ({
      partName: p.partName as string | undefined,
      drawingNumber: p.drawingNumber as string | undefined,
      materialGrade: p.materialGrade as string | undefined,
      grossWeightKg: typeof p.grossWeightKg === 'number' ? p.grossWeightKg : undefined,
      netWeightKg: typeof p.netWeightKg === 'number' ? p.netWeightKg : undefined,
      annualVolume: typeof p.annualVolume === 'number' ? p.annualVolume : undefined,
      primaryOperation: p.primaryOperation as string | undefined,
      cycleTimeMin: typeof p.cycleTimeMin === 'number' ? p.cycleTimeMin : undefined,
      confidence: typeof p.confidence === 'number' ? Math.min(1, Math.max(0, p.confidence)) : 0.5,
      missingFields: Array.isArray(p.missingFields) ? p.missingFields as string[] : [],
      warnings: Array.isArray(p.warnings) ? p.warnings as string[] : [],
      sources: buildSources(p),
    }));

    const overallConfidence = parts.reduce((s, p) => s + p.confidence, 0) / (parts.length || 1);
    const warning = overallConfidence < 0.5
      ? `AI confidence is low (${(overallConfidence * 100).toFixed(0)}%). Review all pre-filled values carefully.`
      : undefined;

    return {
      parts,
      rfqNumber: parsed.rfqNumber || undefined,
      customer: parsed.customer || undefined,
      dueDate: parsed.dueDate || undefined,
      source: 'ai',
      warning,
    };
  } catch (err) {
    console.error('[AI] Extraction error:', err);
    return {
      ...fallbackExtract(text),
      warning: 'AI service error — keyword fallback used. Please review all fields.',
    };
  }
}

function buildSources(p: Record<string, unknown>): Record<string, string> {
  const sources: Record<string, string> = {};
  const fields = ['partName', 'drawingNumber', 'materialGrade', 'grossWeightKg', 'netWeightKg', 'annualVolume', 'primaryOperation', 'cycleTimeMin'];
  fields.forEach(f => {
    if (p[f] != null) sources[f] = 'extracted from RFQ text (AI)';
  });
  return sources;
}

// ── Routing Suggestion from Historical Quotes ────────────────────────────────
/**
 * Find historical quotes similar to the given part and suggest routing.
 * Similarity based on:
 *   1. Material grade match (highest weight)
 *   2. Weight range match (grossWt within ±50%)
 *   3. Operation type match
 */
export async function suggestRoutings(
  materialGrade: string,
  grossWeightKg: number,
  primaryOperation?: string,
  topK: number = 3
): Promise<RoutingSuggestion[]> {
  const weightMin = grossWeightKg * 0.4;
  const weightMax = grossWeightKg * 1.6;

  // Find candidates with matching material and similar weight
  const candidates = await HistoricalQuote.find({
    materialGrade: { $regex: new RegExp(materialGrade.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
    grossWeightKg: { $gte: weightMin, $lte: weightMax },
  })
    .limit(20)
    .lean();

  // Score and sort
  const scored = candidates.map(c => {
    let score = 0;
    // Material exact match
    if (c.materialGrade.toLowerCase() === materialGrade.toLowerCase()) score += 0.5;
    else score += 0.3;
    // Weight closeness (0–0.3)
    const wtRatio = 1 - Math.abs(c.grossWeightKg - grossWeightKg) / Math.max(grossWeightKg, 0.01);
    score += wtRatio * 0.3;
    // Operation match
    if (primaryOperation && c.primaryOperation &&
      c.primaryOperation.toLowerCase().includes(primaryOperation.toLowerCase())) {
      score += 0.2;
    }
    return { ...c, similarityScore: Math.min(1, score) };
  })
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, topK);

  return scored.map(c => ({
    sourceRFQNumber: c.rfqNumber,
    sourcePartName: c.partName,
    sourceMaterial: c.materialGrade,
    sourceGrossWeightKg: c.grossWeightKg,
    similarityScore: c.similarityScore,
    suggestedRouting: c.primaryOperation ? [{
      operationName: c.primaryOperation,
      machineType: c.machineType || c.primaryOperation,
      cycleTimeMin: c.cycleTimeMin || 0,
      setupTimeMin: 30,
      note: `Suggested from ${c.rfqNumber} — ${c.partName} (${c.materialGrade}, ${c.grossWeightKg} kg)`,
    }] : [],
  }));
}
