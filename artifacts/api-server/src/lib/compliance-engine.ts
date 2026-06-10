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
// The government warning check performs a word-for-word comparison against this string
// (after whitespace normalization). Any deviation — including added/removed words,
// punctuation changes, or capitalisation differences — results in a FAIL.
const REQUIRED_GOVERNMENT_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

// Minimum confidence score (0.0–1.0) from the AI extraction below which a field is
// considered insufficiently certain for automated PASS/FAIL and is escalated to NEEDS_REVIEW.
// Exception: the sameFieldOfVision check uses a stricter threshold of 0.75 (see below) because
// panel layout is harder to assess from a single image and false positives are more harmful.
const CONFIDENCE_THRESHOLD = 0.6;

// Collapses any sequence of whitespace (tabs, newlines, multiple spaces) to a single space.
// Used only for the government warning verbatim comparison, which is sensitive to whitespace.
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

// Prepares a brand name string for comparison by:
//   1. Lowercasing — so 'STONE'S THROW' and 'Stone's Throw' are treated as equal.
//   2. Unicode NFC normalization — ensures composed characters are in canonical form.
//   3. Replacing 9 apostrophe/quote Unicode variants (curly singles, modifier letter,
//      prime, grave, backtick, half-width) with a plain straight apostrophe U+0027.
//      This handles the common case where AI vision returns a curly apostrophe from the
//      image while the agent typed a straight apostrophe in the expected-value field.
//   4. Stripping all remaining punctuation/symbols (replaced with spaces).
//   5. Collapsing multiple spaces.
function normalizeBrandName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFC")
    // Normalize every apostrophe/quote variant to a straight apostrophe:
    // curly singles (U+2018/2019/201B), modifier letter (U+02BC),
    // prime (U+2032), grave (U+0060), backtick variants, half-width forms
    .replace(/[\u2018\u2019\u201b\u02bc\u2032\u0060\uff07\u02b9\u02bb]/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Compares the AI-extracted brand name against the agent-supplied expected value.
//
// Matching rules (applied after normalizeBrandName on both sides):
//   - Exact match after normalization → PASS
//   - Levenshtein distance ≤ 3 → NEEDS_REVIEW (near-match, agent confirms)
//   - Distance > 3 → FAIL
//
// Edge cases:
//   - No extracted value → FAIL (brand name not found on label at all)
//   - No expected value supplied → PASS if confidence ≥ CONFIDENCE_THRESHOLD,
//     NEEDS_REVIEW otherwise. NOTE: when no expected value is provided, ONLY
//     presence is verified — the brand name content is not validated against any
//     COLA registration. A completely wrong brand name will PASS with high confidence.
//   - The Levenshtein threshold of 3 is intentionally permissive for long names
//     (e.g. "Old Fitzgerald" has plenty of budget for OCR noise) but is very generous
//     for short names — e.g. a 3-char brand name could match any other with distance ≤ 3.
//     Agents should pay close attention to NEEDS_REVIEW results on short brand names.
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

  if (normExtracted === normExpected) {
    return { matchStatus: "PASS", failReason: null };
  }

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

// Validates the Government Warning statement against three distinct failure modes:
//   1. MISSING — statement is absent entirely → FAIL
//   2. PREFIX CAPITALISATION — "GOVERNMENT WARNING:" prefix is not ALL CAPS → FAIL
//      (27 CFR 16.21 explicitly requires the prefix in all-capital letters)
//   3. TEXT MISMATCH — body text differs from the exact statutory wording → FAIL
//      The comparison is case-sensitive at the character level (after whitespace
//      normalisation) because the statute specifies the exact wording including casing.
//      Upper-casing both sides first catches a capitalisation-only mismatch separately
//      from a word/spelling mismatch, so each gets its own distinct flag message.
//   4. PROHIBITED LOCATION — warning found on bottom, cap/closure, or foil capsule → FAIL
//      This check is additive: a warning can fail both text AND location simultaneously.
//
// Note: multiple flags can be pushed in one call (e.g. wrong prefix AND wrong location).
// The matchStatus is downgraded to FAIL on the first error encountered and stays there.
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
      flags: [
        {
          field: "governmentWarning",
          severity: "WARNING",
          message: "Low confidence extraction of Government Warning text. Manual review required.",
        },
      ],
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
      // Text matches when both sides are uppercased → pure capitalisation mismatch.
      // This is a separate, less severe error than a word/spelling mismatch.
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
      // Texts differ even when uppercased → word or spelling mismatch.
      matchStatus = "FAIL";
      failReason = failReason ?? "Government Warning text does not match required statutory text";
      flags.push({
        field: "governmentWarning",
        severity: "ERROR",
        message: "Government Warning text does not match required statutory text (word-for-word match required).",
      });
    }
  }

  // Prohibited surface check for the government warning location.
  // Uses .split("/")[0] so "cap/closure" matches on "cap" — also correctly matches
  // the standalone "foil capsule" string. "bottom" is checked as a substring so
  // "bottom of container" also triggers this flag.
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

// Validates Alcohol Content (ABV).
//
// Mandatory status is determined by Claude during extraction (isMandatory field):
//   - SPIRITS and WINE ≥7% ABV → mandatory
//   - MALT beverages under standard fermentation → not mandatory (isMandatory = false)
//
// Edge cases:
//   - beverageType = UNKNOWN → cannot determine mandatory status → NEEDS_REVIEW.
//     This prevents false FAILs when Claude cannot classify the beverage.
//   - isMandatory = false AND value present → PASS (bonus info, not a violation).
//   - isMandatory = false AND value absent → NOT_APPLICABLE (no check needed).
//   - When expectedAbv is provided, comparison is case-insensitive and strips all
//     whitespace before comparing ("40%Alc./Vol." == "40% Alc./Vol."). This is a
//     loose match — it does not parse numeric values, so "40%" ≠ "40.0%".
function checkAbv(
  extraction: ClaudeExtractionResult,
  expectedAbv: string | null,
): { matchStatus: MatchStatus; failReason: string | null; flags: ComplianceFlag[] } {
  const flags: ComplianceFlag[] = [];
  const { value, confidence, isMandatory } = extraction.alcoholContent;

  if (!isMandatory) {
    if (!value) {
      return { matchStatus: "NOT_APPLICABLE", failReason: null, flags };
    }
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

  // Loose string comparison: case-insensitive, whitespace stripped.
  // Does NOT parse numeric ABV values, so "40%" and "40.0%" are treated as different strings.
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

// Thin constructor for FieldResult — exists so every call site has the same shape
// and property order. No logic; callers supply all values.
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

// Checks a single field for presence and confidence.
// Returns the MatchStatus and pushes any generated flags into the caller-supplied array.
//
// NOTE ON PATTERN: checkGovernmentWarning and checkAbv return their flags in the result
// object. This function mutates a caller-supplied array instead — an inconsistency left
// intentional because those two checks have more complex multi-flag logic that doesn't
// fit the presence-only pattern. Both patterns are correct; do not merge them.
//
// IMPORTANT: This function only checks whether the field is present with sufficient
// confidence. It does NOT compare against an expected value even when one is provided.
// The expectedValue is stored on FieldResult for UI display only (e.g. classType,
// netContents). If content comparison is needed for a field, use a dedicated checker
// function like matchBrandName or checkAbv.
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
  flags: ComplianceFlag[];
  beverageType: BeverageType;
}

// Orchestrates all per-field compliance checks and aggregates them into a single result.
//
// Overall status logic (in priority order):
//   FAIL   — any flag with severity ERROR
//   REVIEW — any flag with severity WARNING, or any field with matchStatus NEEDS_REVIEW,
//             or sameFieldOfVision non-compliant / low-confidence
//   PASS   — none of the above
//
// Field coverage:
//   brandName        — fuzzy match (Levenshtein) if expected value supplied, else presence
//   classType        — presence only (expected value stored but not compared)
//   alcoholContent   — mandatory for SPIRITS and WINE ≥7%; conditional for MALT
//   netContents      — presence only (expected value stored but not compared)
//   governmentWarning — verbatim statutory text match + ALL CAPS prefix + location
//   bottlerProducer  — presence only
//   countryOfOrigin  — presence only; null result when product is domestic + no value extracted
//   sameFieldOfVision — SPIRITS ONLY (null for WINE/MALT); requires brand+class+ABV on one panel
//   labelLanguage    — mandatory fields must be in English (27 CFR 7.55)
//   prohibitedSurface — mandatory info must not appear ONLY on bottom/cap/foil (27 CFR 7.61)
export function runComplianceChecks(
  extraction: ClaudeExtractionResult,
  expectedValues: {
    brandName?: string | null;
    classType?: string | null;
    alcoholContent?: string | null;
    netContents?: string | null;
  } = {},
): ComplianceResult {
  const allFlags: ComplianceFlag[] = [];

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
    // Redundancy note: "Low confidence extraction" is also used verbatim for netContents below.
    // Extracted into a local string if a third field needs it; left inline for now (only 2 uses).
    classStatus === "FAIL" ? "Class/Type designation not found on label" : classStatus === "NEEDS_REVIEW" ? "Low confidence extraction" : null,
    true,
  );

  const abvCheck = checkAbv(extraction, expectedValues.alcoholContent ?? null);
  allFlags.push(...abvCheck.flags);
  const abvField = buildFieldResult(
    extraction.alcoholContent.value,
    expectedValues.alcoholContent ?? null,
    abvCheck.matchStatus,
    extraction.alcoholContent.confidence,
    abvCheck.failReason,
    extraction.alcoholContent.isMandatory,
  );

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

  // Country of origin is only relevant for imported products.
  // Result is null (omitted from output) when the product is domestic AND Claude found no value.
  // isMandatory is set to true for non-domestic products, false/null for domestic.
  let countryOfOriginField: FieldResult | null = null;
  if (!extraction.countryOfOrigin.isDomestic || extraction.countryOfOrigin.value) {
    const countryStatus: MatchStatus =
      extraction.countryOfOrigin.confidence < CONFIDENCE_THRESHOLD
        ? "NEEDS_REVIEW"
        : "PASS";
    countryOfOriginField = buildFieldResult(
      extraction.countryOfOrigin.value,
      null,
      countryStatus,
      extraction.countryOfOrigin.confidence,
      null,
      !extraction.countryOfOrigin.isDomestic,
    );
  }

  // Same-field-of-vision check — SPIRITS ONLY (27 CFR 5.64).
  // Wine and malt beverages do not have a same-panel requirement; result is null for them.
  //
  // Two-tier flagging with a stricter confidence threshold (0.75 vs the global 0.6):
  //   - Non-compliant AND confidence ≥ 0.75 → ERROR (high confidence failure)
  //   - Non-compliant OR confidence < 0.75   → WARNING (uncertain; agent should verify)
  //     This includes the "passed but low confidence" case — passing with <0.75 confidence
  //     still warrants review because a single image cannot show all label panels.
  let sameFieldOfVisionResult: SameFieldOfVisionResult | null = null;
  if (extraction.beverageType === "SPIRITS" && extraction.sameFieldOfVision) {
    const sfov = extraction.sameFieldOfVision;
    sameFieldOfVisionResult = {
      compliant: sfov.allOnSamePanel,
      confidence: sfov.confidence,
      detectedOnPanel: sfov.panelDescription,
      missingFromPanel: sfov.missingFromPanel,
      singleImageWarning: sfov.onlyOneImageFace,
    };
    if (!sfov.allOnSamePanel && sfov.confidence >= 0.75) {
      allFlags.push({
        field: "sameFieldOfVision",
        severity: "ERROR",
        message: `Brand Name, ABV, and Class/Type must appear on the same label panel (27 CFR 5.64). Missing: ${sfov.missingFromPanel.join(", ")}.`,
      });
    } else if (!sfov.allOnSamePanel || sfov.confidence < 0.75) {
      allFlags.push({
        field: "sameFieldOfVision",
        severity: "WARNING",
        message:
          sfov.confidence < 0.75
            ? "Same-field-of-vision check requires multi-angle images to be definitive. Agent review recommended."
            : `Brand Name, ABV, and Class/Type may not be on the same panel. Agent review recommended.`,
      });
    }
  }

  // Label language: all mandatory fields must appear in English (27 CFR 7.55 / 4.38 / 5.36).
  // Additional languages alongside English are permitted but do not satisfy the requirement alone.
  const langStatus: MatchStatus =
    !extraction.labelLanguage.mandatoryFieldsInEnglish
      ? "FAIL"
      : extraction.labelLanguage.confidence < CONFIDENCE_THRESHOLD
        ? "NEEDS_REVIEW"
        : "PASS";
  if (!extraction.labelLanguage.mandatoryFieldsInEnglish) {
    allFlags.push({
      field: "labelLanguage",
      severity: "ERROR",
      message: "Mandatory label fields must appear in English per 27 CFR 7.55. Non-English mandatory text detected.",
    });
  }
  const langField = buildFieldResult(
    extraction.labelLanguage.primaryLanguage,
    "English",
    langStatus,
    extraction.labelLanguage.confidence,
    !extraction.labelLanguage.mandatoryFieldsInEnglish ? "Mandatory fields must be in English per 27 CFR 7.55" : null,
    true,
  );

  // Prohibited surface check (27 CFR 7.61 / 4.38 / 5.38).
  // IMPORTANT: This checks whether mandatory information appears ONLY on a prohibited surface
  // (bottom of container, cap/cork/closure, foil/heat-shrink capsule).
  // This is NOT a check for prohibited imagery or prohibited statements — those are separate
  // regulatory concerns addressed in 27 CFR 5.65 / 4.64 / 7.54.
  const prohibitedStatus: MatchStatus = extraction.prohibitedSurface.found
    ? "FAIL"
    : extraction.prohibitedSurface.confidence < CONFIDENCE_THRESHOLD
      ? "NEEDS_REVIEW"
      : "PASS";
  if (extraction.prohibitedSurface.found) {
    allFlags.push({
      field: "prohibitedSurface",
      severity: "ERROR",
      message: `Mandatory information found on prohibited surface (27 CFR 7.61): ${extraction.prohibitedSurface.details ?? "prohibited surface detected"}`,
    });
  }
  const prohibitedField = buildFieldResult(
    extraction.prohibitedSurface.details,
    null,
    prohibitedStatus,
    extraction.prohibitedSurface.confidence,
    extraction.prohibitedSurface.found ? extraction.prohibitedSurface.details : null,
    null,
  );

  // Overall status is determined by the worst outcome across all fields and flags.
  // FAIL takes priority over REVIEW; a single ERROR flag → FAIL regardless of other fields.
  const hasErrors = allFlags.some((f) => f.severity === "ERROR");
  const hasReview =
    allFlags.some((f) => f.severity === "WARNING") ||
    [brandField, classField, abvField, netField, gwField, bottlerField, langField, prohibitedField].some(
      (f) => f.matchStatus === "NEEDS_REVIEW",
    ) ||
    (sameFieldOfVisionResult && (!sameFieldOfVisionResult.compliant || sameFieldOfVisionResult.confidence < 0.75));

  let overallStatus: OverallStatus;
  if (hasErrors) {
    overallStatus = "FAIL";
  } else if (hasReview) {
    overallStatus = "REVIEW";
  } else {
    overallStatus = "PASS";
  }

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
    flags: allFlags,
    beverageType: extraction.beverageType,
  };
}
