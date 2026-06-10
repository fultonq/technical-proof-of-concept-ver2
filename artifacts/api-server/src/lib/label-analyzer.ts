import { v4 as uuidv4 } from "uuid";
import { extractLabelFields } from "./claude-vision.js";
import { runComplianceChecks } from "./compliance-engine.js";
import { addToSession } from "./session-store.js";
import type { LabelAnalysisResult } from "./label-types.js";

export interface AnalyzeOptions {
  sessionId?: string;
  expectedBrandName?: string | null;
  expectedClassType?: string | null;
  expectedAlcoholContent?: string | null;
  expectedNetContents?: string | null;
}

export async function analyzeLabel(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  options: AnalyzeOptions = {},
): Promise<LabelAnalysisResult> {
  const startMs = Date.now();
  const labelId = uuidv4();
  const sessionId = options.sessionId ?? uuidv4();

  let extraction;
  try {
    extraction = await extractLabelFields(fileBuffer, mimeType);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const fallbackResult: LabelAnalysisResult = {
      labelId,
      sessionId,
      fileName,
      beverageType: "UNKNOWN",
      overallStatus: "REVIEW",
      confidenceScore: 0,
      brandName: { extractedValue: null, expectedValue: options.expectedBrandName ?? null, matchStatus: "NEEDS_REVIEW", confidence: 0, failReason: "AI extraction failed", isMandatory: true },
      classType: { extractedValue: null, expectedValue: null, matchStatus: "NEEDS_REVIEW", confidence: 0, failReason: "AI extraction failed", isMandatory: true },
      alcoholContent: { extractedValue: null, expectedValue: null, matchStatus: "NEEDS_REVIEW", confidence: 0, failReason: "AI extraction failed", isMandatory: null },
      netContents: { extractedValue: null, expectedValue: null, matchStatus: "NEEDS_REVIEW", confidence: 0, failReason: "AI extraction failed", isMandatory: true },
      governmentWarning: { extractedValue: null, expectedValue: null, matchStatus: "NEEDS_REVIEW", confidence: 0, failReason: "AI extraction failed", isMandatory: true },
      bottlerProducer: { extractedValue: null, expectedValue: null, matchStatus: "NEEDS_REVIEW", confidence: 0, failReason: "AI extraction failed", isMandatory: true },
      countryOfOrigin: null,
      sameFieldOfVision: null,
      labelLanguage: { extractedValue: null, expectedValue: "English", matchStatus: "NEEDS_REVIEW", confidence: 0, failReason: "AI extraction failed", isMandatory: true },
      prohibitedSurface: { extractedValue: null, expectedValue: null, matchStatus: "NEEDS_REVIEW", confidence: 0, failReason: "AI extraction failed", isMandatory: null },
      flags: [{ field: "extraction", severity: "ERROR", message: `AI extraction failed: ${errorMsg}` }],
      processingMs: Date.now() - startMs,
      analyzedAt: new Date().toISOString(),
    };
    addToSession(sessionId, fallbackResult);
    return fallbackResult;
  }

  const compliance = runComplianceChecks(extraction, {
    brandName: options.expectedBrandName,
    classType: options.expectedClassType,
    alcoholContent: options.expectedAlcoholContent,
    netContents: options.expectedNetContents,
  });

  const result: LabelAnalysisResult = {
    labelId,
    sessionId,
    fileName,
    beverageType: compliance.beverageType,
    overallStatus: compliance.overallStatus,
    confidenceScore: extraction.overallConfidence,
    brandName: compliance.brandName,
    classType: compliance.classType,
    alcoholContent: compliance.alcoholContent,
    netContents: compliance.netContents,
    governmentWarning: compliance.governmentWarning,
    bottlerProducer: compliance.bottlerProducer,
    countryOfOrigin: compliance.countryOfOrigin,
    sameFieldOfVision: compliance.sameFieldOfVision,
    labelLanguage: compliance.labelLanguage,
    prohibitedSurface: compliance.prohibitedSurface,
    flags: compliance.flags,
    processingMs: Date.now() - startMs,
    analyzedAt: new Date().toISOString(),
  };

  addToSession(sessionId, result);
  return result;
}

export function buildBatchSummary(
  sessionId: string,
  results: LabelAnalysisResult[],
) {
  return {
    sessionId,
    totalCount: results.length,
    passCount: results.filter((r) => r.overallStatus === "PASS").length,
    failCount: results.filter((r) => r.overallStatus === "FAIL").length,
    reviewCount: results.filter((r) => r.overallStatus === "REVIEW").length,
    results,
  };
}
