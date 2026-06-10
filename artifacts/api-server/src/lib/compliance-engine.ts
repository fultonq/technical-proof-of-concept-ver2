import type {
  BeverageType,
  ClaudeExtractionResult,
  ComplianceFlag,
  FieldResult,
  MatchStatus,
  OverallStatus,
  SameFieldOfVisionResult,
} from "./label-types.js";

// Verbatim statutory text from 27 CFR 16.21.
// Word-for-word comparison after whitespace normalization. Any deviation — including
// added/removed words, punctuation changes, or casing differences — results in FAIL.
const REQUIRED_GOVERNMENT_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

// Minimum confidence score (0.0–1.0) from Claude below which a field is escalated to
// NEEDS_REVIEW rather than PASS/FAIL. The sameFieldOfVision check uses a stricter
// threshold of 0.75 because panel layout is harder to assess from a single image.
const CONFIDENCE_THRESHOLD = 0.6;
const SFOV_CONFIDENCE_THRESHOLD = 0.75;

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Standard Levenshtein edit-distance implementation.
// Used for brand name fuzzy matching — see matchBrandName below.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// Normalizes a brand name for comparison:
//   1. Lowercase + NFC normalization
//   2. Replaces 9 apostrophe/quote Unicode variants with plain U+0027
//   3. Strips remaining punctuation/symbols
//   4. Collapses whitespace
function normalizeBrandName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201b\u02bc\u2032\u0060\uff07\u02b9\u02bb]/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Fuzzy brand name match using Levenshtein distance.
// Exact (normalized) → PASS; distance ≤ 3 → NEEDS_REVIEW; > 3 → FAIL.
// When no expected value is supplied, only presence + confidence is checked.
function matchBrandName(
  extracted: string | null,
  expected: string | null,
  confidence: number,
): { matchStatus: MatchStatus; failReason: string | null } {
  if (!extracted) {
    return { matchStatus: "FAIL", failReason: "Brand name not found on label" };
  }
  if (!expected) {
    if (confidence < CONFIDENCE_THRESHOLD) {
      return { matchStatus: "NEEDS_REVIEW", failReason: "Low confidence extraction — agent verification required" };
    }
    return { matchStatus: "PASS", failReason: null };
  }

  const normExtracted = normalizeBrandName(extracted);
  const normExpected = normalizeBrandName(expected);

  if (normExtracted === normExpected) return { matchStatus: "PASS", failReason: null };

  const distance = levenshtein(normExtracted, normExpected);
  if (distance <= 3) {
    return {
      matchStatus: "NEEDS_REVIEW",
      failReason: `Near-match after normalization (edit distance ${distance}): extracted "${extracted}" vs expected "${expected}"`,
    };
  }
  return {
    matchStatus: "FAIL",
    failReason: `Brand name mismatch: extracted "${extracted}" does not match expected "${expected}" (edit distance ${distance})`,
  };
}

// Government Warning verbatim check.
// Validates three distinct failure modes:
//   1. MISSING — statement absent entirely → FAIL
//   2. PREFIX CAPITALISATION — "GOVERNMENT WARNING:" not ALL CAPS → FAIL (27 CFR 16.21)
//   3. TEXT MISMATCH — body text differs from exact statutory wording → FAIL
//   4. PROHIBITED LOCATION — warning on bottom/cap/foil → FAIL (27 CFR 7.61)
// Multiple flags can be pushed in one call (e.g. wrong prefix AND wrong location).
function checkGovernmentWarning(
  extraction: ClaudeExtractionResult,
): { matchStatus: MatchStatus; failReason: string | null; flags: ComplianceFlag[] } {
  const flags: ComplianceFlag[] = [];
  const { value, confidence, prefixIsAllCaps, location } = extraction.governmentWarning;

  if (!value) {
    flags.push({
      field: "governmentWarning",
      severity: "ERROR",
      message: "Government Warning Statement is absent from the label. Required for all alcohol beverages ≥0.5% ABV.",
    });
    return { matchStatus: "FAIL", failReason: "Government Warning Statement not found on label", flags };
  }

  if (confidence < CONFIDENCE_THRESHOLD) {
    return {
      matchStatus: "NEEDS_REVIEW",
      failReason: "Government Warning detected but low confidence — agent verification required",
      flags: [{
        field: "governmentWarning",
        severity: "WARNING",
        message: "Low confidence extraction of Government Warning text. Manual review required.",
      }],
    };
  }

  const normalizedExtracted = normalizeWhitespace(value);
  const normalizedRequired = normalizeWhitespace(REQUIRED_GOVERNMENT_WARNING);

  let matchStatus: MatchStatus = "PASS";
  let failReason: string | null = null;

  if (!prefixIsAllCaps) {
    matchStatus = "FAIL";
    failReason = "GOVERNMENT WARNING: prefix must appear in ALL CAPS";
    flags.push({
      field: "governmentWarning",
      severity: "ERROR",
      message: "GOVERNMENT WARNING: prefix is not in all-caps as required by TTB regulation (27 CFR 16.21). Found mixed case.",
    });
  }

  if (normalizedExtracted !== normalizedRequired) {
    const extractedUpper = normalizedExtracted.toUpperCase();
    const requiredUpper = normalizedRequired.toUpperCase();
    if (extractedUpper === requiredUpper) {
      if (matchStatus === "PASS") {
        matchStatus = "FAIL";
        failReason = "Government Warning text capitalization does not match required statutory text";
      }
      flags.push({
        field: "governmentWarning",
        severity: "ERROR",
        message: "Government Warning capitalization differs from required statutory text.",
      });
    } else {
      matchStatus = "FAIL";
      failReason = failReason ?? "Government Warning text does not match required statutory text";
      flags.push({
        field: "governmentWarning",
        severity: "ERROR",
        message: "Government Warning text does not match required statutory text (word-for-word match required).",
      });
    }
  }

  if (location && ["bottom", "cap/closure", "foil capsule"].some((s) => location.toLowerCase().includes(s.split("/")[0]))) {
    matchStatus = "FAIL";
    failReason = failReason ?? `Government Warning on prohibited surface: ${location}`;
    flags.push({
      field: "governmentWarning",
      severity: "ERROR",
      message: `Government Warning found on prohibited surface (${location}). Per 27 CFR 7.61, mandatory info must not appear exclusively on bottom, cap, or foil capsule.`,
    });
  }

  return { matchStatus, failReason, flags };
}

// Alcohol Content (ABV) check.
// Regulatory summary:
//   - SPIRITS (27 CFR 5.37): always mandatory
//   - WINE ≥7% ABV (27 CFR 4.36): mandatory
//   - MALT (27 CFR Part 7): NOT mandatory for standard fermentation malt beverages
//     (isMandatory flag comes from Claude's extraction based on context)
function checkAbv(
  extraction: ClaudeExtractionResult,
  expectedAbv: string | null,
): { matchStatus: MatchStatus; failReason: string | null; flags: ComplianceFlag[] } {
  const flags: ComplianceFlag[] = [];
  const { value, confidence, isMandatory } = extraction.alcoholContent;

  if (!isMandatory) {
    if (!value) return { matchStatus: "NOT_APPLICABLE", failReason: null, flags };
    return { matchStatus: "PASS", failReason: null, flags };
  }

  if (extraction.beverageType === "UNKNOWN") {
    return {
      matchStatus: "NEEDS_REVIEW",
      failReason: "Cannot determine ABV requirement — beverage type unknown",
      flags: [{ field: "alcoholContent", severity: "WARNING", message: "Beverage type unknown; ABV mandatory status cannot be determined." }],
    };
  }

  if (!value) {
    flags.push({
      field: "alcoholContent",
      severity: "ERROR",
      message: `Alcohol Content (ABV) is required for ${extraction.beverageType} but was not found on label.`,
    });
    return { matchStatus: "FAIL", failReason: "Alcohol Content (ABV) is mandatory but not found on label", flags };
  }

  if (confidence < CONFIDENCE_THRESHOLD) {
    return {
      matchStatus: "NEEDS_REVIEW",
      failReason: "ABV detected but low confidence — agent verification required",
      flags: [{ field: "alcoholContent", severity: "WARNING", message: "Low confidence ABV extraction." }],
    };
  }

  if (!expectedAbv) return { matchStatus: "PASS", failReason: null, flags };

  const normExtracted = value.toLowerCase().replace(/\s+/g, "");
  const normExpected = expectedAbv.toLowerCase().replace(/\s+/g, "");
  if (normExtracted !== normExpected) {
    flags.push({
      field: "alcoholContent",
      severity: "WARNING",
      message: `ABV extracted "${value}" differs from expected "${expectedAbv}". Agent review recommended.`,
    });
    return {
      matchStatus: "NEEDS_REVIEW",
      failReason: `ABV mismatch: extracted "${value}" vs expected "${expectedAbv}"`,
      flags,
    };
  }

  return { matchStatus: "PASS", failReason: null, flags };
}

// Country of Origin check.
// Regulatory differences by type:
//   - WINE (27 CFR 4.32(a)(3)): ALWAYS required, even for domestic products.
//     Domestic wines must state "United States" or equivalent.
//   - SPIRITS (27 CFR 5.36(d)): Required only for imported products.
//   - MALT (27 CFR 7.30): Required only for imported products.
function checkCountryOfOrigin(
  extraction: ClaudeExtractionResult,
): { field: FieldResult | null; flags: ComplianceFlag[] } {
  const flags: ComplianceFlag[] = [];
  const { value, confidence, isDomestic } = extraction.countryOfOrigin;
  const isWine = extraction.beverageType === "WINE";

  // For SPIRITS and MALT: omit entirely when domestic AND no value found
  if (!isWine && isDomestic && !value) {
    return { field: null, flags };
  }

  const isMandatory = isWine || !isDomestic;

  if (!value) {
    if (isMandatory) {
      const msg = isWine
        ? "Country of Origin is required on all wine labels (27 CFR 4.32(a)(3)), including domestic wines."
        : "Country of Origin is required for imported products.";
      flags.push({ field: "countryOfOrigin", severity: "ERROR", message: msg });
      return {
        field: {
          extractedValue: null,
          expectedValue: null,
          matchStatus: "FAIL",
          confidence: 0,
          failReason: isWine
            ? "Country of Origin required for all wine labels — not found"
            : "Country of Origin required for imported product — not found",
          isMandatory: true,
        },
        flags,
      };
    }
    return { field: null, flags };
  }

  const matchStatus: MatchStatus = confidence < CONFIDENCE_THRESHOLD ? "NEEDS_REVIEW" : "PASS";
  return {
    field: {
      extractedValue: value,
      expectedValue: null,
      matchStatus,
      confidence,
      failReason: matchStatus === "NEEDS_REVIEW" ? "Low confidence — agent verification required" : null,
      isMandatory,
    },
    flags,
  };
}

// Appellation of Origin check — WINE ONLY (27 CFR 4.23 / 4.25).
// Required when the wine uses a varietal designation (e.g. "Chardonnay", "Cabernet Sauvignon")
// or a vintage date.  Claude determines isMandatory based on the label context.
function checkAppellationOfOrigin(
  extraction: ClaudeExtractionResult,
): { field: FieldResult | null; flags: ComplianceFlag[] } {
  const flags: ComplianceFlag[] = [];

  if (extraction.beverageType !== "WINE" || !extraction.appellationOfOrigin) {
    return { field: null, flags };
  }

  const { value, confidence, isMandatory } = extraction.appellationOfOrigin;

  if (!isMandatory) {
    if (!value) return { field: null, flags };
    return {
      field: {
        extractedValue: value,
        expectedValue: null,
        matchStatus: "PASS",
        confidence,
        failReason: null,
        isMandatory: false,
      },
      flags,
    };
  }

  if (!value) {
    flags.push({
      field: "appellationOfOrigin",
      severity: "ERROR",
      message: "Appellation of Origin is required when a wine uses a varietal designation or vintage year (27 CFR 4.23).",
    });
    return {
      field: {
        extractedValue: null,
        expectedValue: null,
        matchStatus: "FAIL",
        confidence: 0,
        failReason: "Appellation of Origin required for varietal/vintage wine — not found",
        isMandatory: true,
      },
      flags,
    };
  }

  const matchStatus: MatchStatus = confidence < CONFIDENCE_THRESHOLD ? "NEEDS_REVIEW" : "PASS";
  return {
    field: {
      extractedValue: value,
      expectedValue: null,
      matchStatus,
      confidence,
      failReason: matchStatus === "NEEDS_REVIEW" ? "Low confidence — agent verification required" : null,
      isMandatory: true,
    },
    flags,
  };
}

// Sulfite Declaration check — WINE ONLY (27 CFR 4.32(b)(1)).
// Wines containing ≥10 ppm sulfites must declare "Contains sulfites" or equivalent.
// Claude determines whether a declaration is present (found flag).
// If the declaration is absent and Claude cannot confirm it is sulfite-free, the result
// is NEEDS_REVIEW (we cannot fail it automatically — only lab analysis confirms sulfite levels).
function checkSulfiteDeclaration(
  extraction: ClaudeExtractionResult,
): { field: FieldResult | null; flags: ComplianceFlag[] } {
  const flags: ComplianceFlag[] = [];

  if (extraction.beverageType !== "WINE" || !extraction.sulfiteDeclaration) {
    return { field: null, flags };
  }

  const { value, confidence, found } = extraction.sulfiteDeclaration;

  if (!found) {
    // Absence alone doesn't constitute a FAIL — sulfite levels require lab verification.
    // Flag as WARNING for agent to confirm the wine is genuinely sulfite-free.
    flags.push({
      field: "sulfiteDeclaration",
      severity: "WARNING",
      message: "No sulfite declaration found. If sulfite content is ≥10 ppm, 'Contains sulfites' is required (27 CFR 4.32(b)(1)). Verify lab analysis.",
    });
    return {
      field: {
        extractedValue: null,
        expectedValue: null,
        matchStatus: "NEEDS_REVIEW",
        confidence: confidence ?? 0,
        failReason: "Sulfite declaration absent — lab verification required to confirm requirement",
        isMandatory: null,
      },
      flags,
    };
  }

  const matchStatus: MatchStatus = confidence < CONFIDENCE_THRESHOLD ? "NEEDS_REVIEW" : "PASS";
  return {
    field: {
      extractedValue: value,
      expectedValue: null,
      matchStatus,
      confidence,
      failReason: matchStatus === "NEEDS_REVIEW" ? "Low confidence — agent verification required" : null,
      isMandatory: null,
    },
    flags,
  };
}

// Thin constructor for FieldResult — ensures consistent shape and property order.
function buildFieldResult(
  extractedValue: string | null,
  expectedValue: string | null,
  matchStatus: MatchStatus,
  confidence: number,
  failReason: string | null,
  isMandatory: boolean | null = null,
): FieldResult {
  return { extractedValue, expectedValue, matchStatus, confidence, failReason, isMandatory };
}

// Simple presence + confidence check.
// Pushes flags into a caller-supplied array. Does NOT compare against expectedValue.
function simplePresenceCheck(
  fieldName: string,
  value: string | null,
  confidence: number,
  mandatory: boolean,
  flags: ComplianceFlag[],
): MatchStatus {
  if (!value) {
    if (mandatory) {
      flags.push({ field: fieldName, severity: "ERROR", message: `${fieldName} is required but not found on label.` });
      return "FAIL";
    }
    return "NEEDS_REVIEW";
  }
  if (confidence < CONFIDENCE_THRESHOLD) {
    flags.push({ field: fieldName, severity: "WARNING", message: `${fieldName} detected with low confidence. Agent review recommended.` });
    return "NEEDS_REVIEW";
  }
  return "PASS";
}

export interface ComplianceResult {
  overallStatus: OverallStatus;
  brandName: FieldResult;
  classType: FieldResult;
  alcoholContent: FieldResult;
  netContents: FieldResult;
  governmentWarning: FieldResult;
  bottlerProducer: FieldResult;
  countryOfOrigin: FieldResult | null;
  sameFieldOfVision: SameFieldOfVisionResult | null;
  labelLanguage: FieldResult;
  prohibitedSurface: FieldResult;
  appellationOfOrigin: FieldResult | null;
  sulfiteDeclaration: FieldResult | null;
  flags: ComplianceFlag[];
  beverageType: BeverageType;
}

// Orchestrates all per-field compliance checks and produces a single ComplianceResult.
//
// Overall status (priority order):
//   FAIL   — any flag with severity ERROR
//   REVIEW — any flag with severity WARNING, or any field with NEEDS_REVIEW, or SFOV issues
//   PASS   — none of the above
//
// Type-specific behavior:
//   SPIRITS — ABV mandatory; SFOV required; country of origin import-only
//   WINE    — ABV mandatory; SFOV not applicable; country of origin ALWAYS required;
//             appellation check; sulfite declaration check
//   MALT    — ABV not mandatory; SFOV not applicable; country of origin import-only
export function runComplianceChecks(
  extraction: ClaudeExtractionResult,
  expectedValues: {
    brandName?: string | null;
    classType?: string | null;
    alcoholContent?: string | null;
    netContents?: string | null;
  } = {},
  options: {
    // When the reviewer pre-selects a beverage type, it overrides what Claude detected.
    // This is the authoritative value used for all type-specific compliance checks.
    beverageTypeOverride?: string | null;
  } = {},
): ComplianceResult {
  // Apply the reviewer's beverage type selection (if any) before running any checks.
  // All sub-functions receive `eff` so they use the corrected type throughout.
  const eff: ClaudeExtractionResult = options.beverageTypeOverride
    ? { ...extraction, beverageType: options.beverageTypeOverride as ClaudeExtractionResult["beverageType"] }
    : extraction;

  const allFlags: ComplianceFlag[] = [];

  // ── Brand Name ─────────────────────────────────────────────────────────────
  const brandResult = matchBrandName(
    extraction.brandName.value,
    expectedValues.brandName ?? null,
    extraction.brandName.confidence,
  );
  const brandField = buildFieldResult(
    extraction.brandName.value,
    expectedValues.brandName ?? null,
    brandResult.matchStatus,
    extraction.brandName.confidence,
    brandResult.failReason,
    true,
  );

  // ── Class / Type ────────────────────────────────────────────────────────────
  const classFlags: ComplianceFlag[] = [];
  const classStatus = simplePresenceCheck(
    "classType",
    extraction.classType.value,
    extraction.classType.confidence,
    true,
    classFlags,
  );
  allFlags.push(...classFlags);
  const classField = buildFieldResult(
    extraction.classType.value,
    expectedValues.classType ?? null,
    classStatus,
    extraction.classType.confidence,
    classStatus === "FAIL" ? "Class/Type designation not found on label" : classStatus === "NEEDS_REVIEW" ? "Low confidence extraction" : null,
    true,
  );

  // ── Alcohol Content (ABV) ───────────────────────────────────────────────────
  const abvCheck = checkAbv(eff, expectedValues.alcoholContent ?? null);
  allFlags.push(...abvCheck.flags);
  const abvField = buildFieldResult(
    extraction.alcoholContent.value,
    expectedValues.alcoholContent ?? null,
    abvCheck.matchStatus,
    extraction.alcoholContent.confidence,
    abvCheck.failReason,
    extraction.alcoholContent.isMandatory,
  );

  // ── Net Contents ────────────────────────────────────────────────────────────
  const netFlags: ComplianceFlag[] = [];
  const netStatus = simplePresenceCheck(
    "netContents",
    extraction.netContents.value,
    extraction.netContents.confidence,
    true,
    netFlags,
  );
  allFlags.push(...netFlags);
  const netField = buildFieldResult(
    extraction.netContents.value,
    expectedValues.netContents ?? null,
    netStatus,
    extraction.netContents.confidence,
    netStatus === "FAIL" ? "Net Contents not found on label" : netStatus === "NEEDS_REVIEW" ? "Low confidence extraction" : null,
    true,
  );

  // ── Government Warning ──────────────────────────────────────────────────────
  const gwCheck = checkGovernmentWarning(extraction);
  allFlags.push(...gwCheck.flags);
  const gwField = buildFieldResult(
    extraction.governmentWarning.value,
    REQUIRED_GOVERNMENT_WARNING,
    gwCheck.matchStatus,
    extraction.governmentWarning.confidence,
    gwCheck.failReason,
    true,
  );

  // ── Bottler / Producer ──────────────────────────────────────────────────────
  const bottlerFlags: ComplianceFlag[] = [];
  const bottlerStatus = simplePresenceCheck(
    "bottlerProducer",
    extraction.bottlerProducer.value,
    extraction.bottlerProducer.confidence,
    true,
    bottlerFlags,
  );
  allFlags.push(...bottlerFlags);
  const bottlerField = buildFieldResult(
    extraction.bottlerProducer.value,
    null,
    bottlerStatus,
    extraction.bottlerProducer.confidence,
    bottlerStatus === "FAIL" ? "Bottler/Producer name and address not found on label" : null,
    true,
  );

  // ── Country of Origin ───────────────────────────────────────────────────────
  const countryCheck = checkCountryOfOrigin(eff);
  allFlags.push(...countryCheck.flags);
  const countryOfOriginField = countryCheck.field;

  // ── Same Field of Vision — SPIRITS ONLY (27 CFR 5.64) ──────────────────────
  let sameFieldOfVisionResult: SameFieldOfVisionResult | null = null;
  if (eff.beverageType === "SPIRITS" && extraction.sameFieldOfVision) {
    const sfov = extraction.sameFieldOfVision;
    sameFieldOfVisionResult = {
      compliant: sfov.allOnSamePanel,
      confidence: sfov.confidence,
      detectedOnPanel: sfov.panelDescription,
      missingFromPanel: sfov.missingFromPanel,
      singleImageWarning: sfov.onlyOneImageFace,
    };
    if (!sfov.allOnSamePanel && sfov.confidence >= SFOV_CONFIDENCE_THRESHOLD) {
      allFlags.push({
        field: "sameFieldOfVision",
        severity: "ERROR",
        message: `Brand Name, ABV, and Class/Type must appear on the same label panel (27 CFR 5.64). Missing: ${sfov.missingFromPanel.join(", ")}.`,
      });
    } else if (!sfov.allOnSamePanel || sfov.confidence < SFOV_CONFIDENCE_THRESHOLD) {
      allFlags.push({
        field: "sameFieldOfVision",
        severity: "WARNING",
        message:
          sfov.confidence < SFOV_CONFIDENCE_THRESHOLD
            ? "Same-field-of-vision check requires multi-angle images to be definitive. Agent review recommended."
            : "Brand Name, ABV, and Class/Type may not be on the same panel. Agent review recommended.",
      });
    }
  }

  // ── Label Language ──────────────────────────────────────────────────────────
  const langStatus: MatchStatus =
    !extraction.labelLanguage.mandatoryFieldsInEnglish
      ? "FAIL"
      : extraction.labelLanguage.confidence < CONFIDENCE_THRESHOLD
        ? "NEEDS_REVIEW"
        : "PASS";
  if (langStatus === "FAIL") {
    allFlags.push({
      field: "labelLanguage",
      severity: "ERROR",
      message: "All mandatory label fields must appear in English. Additional languages are permitted alongside English.",
    });
  }
  const langField = buildFieldResult(
    extraction.labelLanguage.primaryLanguage,
    "English",
    langStatus,
    extraction.labelLanguage.confidence,
    langStatus === "FAIL" ? "Mandatory label fields must appear in English (27 CFR 7.55 / 4.38 / 5.36)" : null,
    true,
  );

  // ── Prohibited Surface ──────────────────────────────────────────────────────
  const prohibitedStatus: MatchStatus = extraction.prohibitedSurface.found
    ? "FAIL"
    : extraction.prohibitedSurface.confidence < CONFIDENCE_THRESHOLD
      ? "NEEDS_REVIEW"
      : "PASS";
  if (extraction.prohibitedSurface.found) {
    allFlags.push({
      field: "prohibitedSurface",
      severity: "ERROR",
      message: `Mandatory label information found exclusively on a prohibited surface. ${extraction.prohibitedSurface.details ?? ""}`,
    });
  }
  const prohibitedField = buildFieldResult(
    extraction.prohibitedSurface.found ? extraction.prohibitedSurface.details ?? "Mandatory info on prohibited surface" : null,
    null,
    prohibitedStatus,
    extraction.prohibitedSurface.confidence,
    prohibitedStatus === "FAIL" ? "Mandatory info must not appear exclusively on bottom, cap, or foil capsule (27 CFR 7.61)" : null,
    null,
  );

  // ── Appellation of Origin — WINE ONLY ───────────────────────────────────────
  const appellationCheck = checkAppellationOfOrigin(eff);
  allFlags.push(...appellationCheck.flags);

  // ── Sulfite Declaration — WINE ONLY ─────────────────────────────────────────
  const sulfiteCheck = checkSulfiteDeclaration(eff);
  allFlags.push(...sulfiteCheck.flags);

  // ── Brand name flags aggregation ────────────────────────────────────────────
  if (brandField.matchStatus === "FAIL") {
    allFlags.push({ field: "brandName", severity: "ERROR", message: brandField.failReason ?? "Brand name check failed." });
  } else if (brandField.matchStatus === "NEEDS_REVIEW") {
    allFlags.push({ field: "brandName", severity: "WARNING", message: brandField.failReason ?? "Brand name requires review." });
  }

  // ── Overall status determination ─────────────────────────────────────────────
  const hasError = allFlags.some((f) => f.severity === "ERROR");
  const hasWarning = allFlags.some((f) => f.severity === "WARNING");
  const allFields: Array<FieldResult | null> = [
    brandField, classField, abvField, netField, gwField, bottlerField,
    countryOfOriginField, langField, prohibitedField, appellationCheck.field, sulfiteCheck.field,
  ];
  const hasNeedsReview = allFields.some((f) => f?.matchStatus === "NEEDS_REVIEW");
  const sfovIssue = sameFieldOfVisionResult && (!sameFieldOfVisionResult.compliant || sameFieldOfVisionResult.confidence < SFOV_CONFIDENCE_THRESHOLD);

  const overallStatus: OverallStatus = hasError
    ? "FAIL"
    : hasWarning || hasNeedsReview || sfovIssue
      ? "REVIEW"
      : "PASS";

  return {
    overallStatus,
    brandName: brandField,
    classType: classField,
    alcoholContent: abvField,
    netContents: netField,
    governmentWarning: gwField,
    bottlerProducer: bottlerField,
    countryOfOrigin: countryOfOriginField,
    sameFieldOfVision: sameFieldOfVisionResult,
    labelLanguage: langField,
    prohibitedSurface: prohibitedField,
    appellationOfOrigin: appellationCheck.field,
    sulfiteDeclaration: sulfiteCheck.field,
    flags: allFlags,
    beverageType: eff.beverageType,
  };
}
