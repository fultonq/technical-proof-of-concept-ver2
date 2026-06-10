import type {
  BeverageType,
  ClaudeExtractionResult,
  ComplianceFlag,
  FieldResult,
  MatchStatus,
  OverallStatus,
  SameFieldOfVisionResult,
} from "./label-types.js";

const REQUIRED_GOVERNMENT_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

const CONFIDENCE_THRESHOLD = 0.6;

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

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

function normalizeBrandName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFC")
    .replace(/[\u2019\u2018\u201b]/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
