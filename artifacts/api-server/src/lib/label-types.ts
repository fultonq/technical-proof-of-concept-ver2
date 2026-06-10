export type BeverageType = "SPIRITS" | "WINE" | "MALT" | "UNKNOWN";
export type OverallStatus = "PASS" | "FAIL" | "REVIEW";
export type MatchStatus = "PASS" | "FAIL" | "NEEDS_REVIEW" | "NOT_APPLICABLE";
export type FlagSeverity = "ERROR" | "WARNING" | "INFO";

export interface FieldResult {
  extractedValue: string | null;
  expectedValue: string | null;
  matchStatus: MatchStatus;
  confidence: number;
  failReason: string | null;
  isMandatory: boolean | null;
}

export interface ComplianceFlag {
  field: string;
  severity: FlagSeverity;
  message: string;
}

export interface SameFieldOfVisionResult {
  compliant: boolean;
  confidence: number;
  detectedOnPanel: string | null;
  missingFromPanel: string[];
  singleImageWarning: boolean;
}

export interface LabelAnalysisResult {
  labelId: string;
  sessionId: string;
  fileName: string;
  beverageType: BeverageType;
  overallStatus: OverallStatus;
  confidenceScore: number;
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
  processingMs: number;
  analyzedAt: string;
}

export interface ClaudeFieldExtraction {
  value: string | null;
  confidence: number;
}

export interface ClaudeGovernmentWarningExtraction {
  value: string | null;
  confidence: number;
  prefixIsAllCaps: boolean;
  location: string | null;
}

export interface ClaudeSameFieldOfVision {
  allOnSamePanel: boolean;
  confidence: number;
  panelDescription: string | null;
  missingFromPanel: string[];
  onlyOneImageFace: boolean;
}

export interface ClaudeExtractionResult {
  beverageType: BeverageType;
  brandName: ClaudeFieldExtraction;
  classType: ClaudeFieldExtraction;
  alcoholContent: ClaudeFieldExtraction & { isMandatory: boolean };
  netContents: ClaudeFieldExtraction;
  governmentWarning: ClaudeGovernmentWarningExtraction;
  bottlerProducer: ClaudeFieldExtraction;
  countryOfOrigin: ClaudeFieldExtraction & { isDomestic: boolean };
  sameFieldOfVision: ClaudeSameFieldOfVision | null;
  labelLanguage: {
    primaryLanguage: string;
    mandatoryFieldsInEnglish: boolean;
    confidence: number;
  };
  prohibitedSurface: {
    found: boolean;
    confidence: number;
    details: string | null;
  };
  overallConfidence: number;
}
