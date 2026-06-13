import { v4 as uuidv4 } from "uuid";
import { extractLabelFields, type LabelImage } from "./claude-vision.js";
import { runComplianceChecks } from "./compliance-engine.js";
import { addToSession } from "./session-store.js";
import type { LabelAnalysisResult } from "./label-types.js";

export interface AnalyzeOptions {
  sessionId?: string;
  expectedBrandName?: string | null;
  expectedClassType?: string | null;
  expectedAlcoholContent?: string | null;
  expectedNetContents?: string | null;
  // When the reviewer pre-selects a beverage type before upload, this overrides what
  // Claude detects. Valid values: "SPIRITS" | "WINE" | "MALT". Null = auto-detect.
  expectedBeverageType?: string | null;
}

// Orchestrates a single label analysis: AI extraction → compliance checks → session storage.
//
// Accepts one or two images (front label, or front + back label). When two images are
// supplied, both are sent to Claude Vision in a single message so Claude can extract
// fields from across both panels (e.g. government warning on back, brand name on front).
//
// Expected value fields are all optional:
//   - expectedBrandName       — fuzzy-matched against extracted brand name
//   - expectedClassType       — stored for display; NOT compared against label text
//   - expectedAlcoholContent  — loose string match (case-insensitive, whitespace-stripped)
//   - expectedNetContents     — stored for display; NOT compared against label text
//
// If extraction fails a fallback result is returned with every field NEEDS_REVIEW and
// a single ERROR flag. This ensures the session always gets an entry and the UI can
// show a meaningful error state rather than crashing.
//
// MAINTENANCE NOTE: The fallback result below is a manual replica of the full
// LabelAnalysisResult shape. If a new required field is added, update it here too —
// TypeScript will catch omissions at compile time.
export async function analyzeLabel(
  images: LabelImage[],
  fileName: string,
  options: AnalyzeOptions = {},
): Promise<LabelAnalysisResult> {
  const startMs = Date.now();
  const labelId = uuidv4();
  const sessionId = options.sessionId ?? uuidv4();
  const imagesAnalyzed = images.length;

  let extraction;
  try {
    extraction = await extractLabelFields(images);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const fallbackResult: LabelAnalysisResult = {
      labelId,
      sessionId,
      fileName,
      beverageType: "UNKNOWN",
      overallStatus: "REVIEW",
      confidenceScore: 0,
      imagesAnalyzed,
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
      appellationOfOrigin: null,
      sulfiteDeclaration: null,
      flags: [{ field: "extraction", severity: "ERROR", message: `AI extraction failed: ${errorMsg}` }],
      processingMs: Date.now() - startMs,
      analyzedAt: new Date().toISOString(),
    };
    await addToSession(sessionId, fallbackResult);
    return fallbackResult;
  }

  const compliance = runComplianceChecks(
    extraction,
    {
      brandName: options.expectedBrandName,
      classType: options.expectedClassType,
      alcoholContent: options.expectedAlcoholContent,
      netContents: options.expectedNetContents,
    },
    { beverageTypeOverride: options.expectedBeverageType ?? null },
  );

  const result: LabelAnalysisResult = {
    labelId,
    sessionId,
    fileName,
    beverageType: compliance.beverageType,
    overallStatus: compliance.overallStatus,
    confidenceScore: extraction.overallConfidence,
    imagesAnalyzed,
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
    appellationOfOrigin: compliance.appellationOfOrigin,
    sulfiteDeclaration: compliance.sulfiteDeclaration,
    flags: compliance.flags,
    processingMs: Date.now() - startMs,
    analyzedAt: new Date().toISOString(),
  };

  await addToSession(sessionId, result);
  return result;
}

// Aggregates per-label results for a session into a batch summary.
// passCount + failCount + reviewCount always equals totalCount.
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
