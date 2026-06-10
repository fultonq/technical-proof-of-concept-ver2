export interface CorrectionGuide {
  title: string;
  steps: string[];
}

// Keyed by the same field names used in LabelAnalysisResult / ComplianceResult.
// Each entry is only shown when that field's matchStatus is FAIL or NEEDS_REVIEW.
// NOTE: If a new compliance field is added to the engine, add a matching entry here
// so the "How to Fix This" card on the detail page can surface guidance for it.
export const CORRECTIONS: Record<string, CorrectionGuide> = {
  brandName: {
    title: "Brand Name",
    steps: [
      "Check the spelling on the label against your TTB-approved Certificate of Label Approval (COLA).",
      "Avoid extra punctuation, line breaks, or characters not in the registered name.",
      // Edge case: comparison is case-insensitive and normalizes common apostrophe variants,
      // so 'STONE\'S THROW' and 'Stone\'s Throw' will match. Still verify exact spelling.
      "Re-upload with the expected brand name filled in for a tighter accuracy check.",
    ],
  },
  classType: {
    title: "Type of Beverage",
    steps: [
      "Add the class and type designation to the label (e.g., \"Kentucky Straight Bourbon Whiskey\", \"Cabernet Sauvignon\", \"American Pale Ale\").",
      "The designation must conform to the standards of identity in 27 CFR Part 5 (spirits), Part 4 (wine), or Part 7 (malt beverages).",
      "Make sure the text is clearly legible and not obscured by other design elements.",
      // Note: the compliance check only verifies presence, not content — if an expectedClassType
      // was entered, it is stored for reference but is not compared against the label text.
    ],
  },
  alcoholContent: {
    title: "Alcohol Content (ABV)",
    steps: [
      "Add the alcohol content as a percentage by volume — e.g., \"45% Alc./Vol.\" or \"45% ABV\".",
      "The percent symbol (%) is mandatory and must be visible.",
      "For distilled spirits and wine above 7% ABV, this field is required by law.",
      // Edge case: malt beverages (beer, ale, lager) are exempt from the ABV requirement
      // under standard fermentation unless the label makes a strength claim.
      "Optionally include the proof statement — e.g., \"(90 Proof)\" — immediately after the ABV.",
    ],
  },
  netContents: {
    title: "Bottle Size",
    steps: [
      "Add the net contents to the label — e.g., \"750 mL\", \"1 L\", \"375 mL\".",
      "The unit (mL or L) must be present.",
      "Place it in a clearly visible location on the label.",
    ],
  },
  governmentWarning: {
    title: "Health Warning Statement",
    steps: [
      "The warning must start with the words GOVERNMENT WARNING: printed in ALL CAPITAL LETTERS.",
      // The full statutory text is fixed — no words may be omitted, added, or reordered.
      // The compliance check performs a word-for-word match after whitespace normalization.
      "The complete required text, which must appear word-for-word, is: \"GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.\"",
      "No words may be omitted, added, or changed. Check carefully for typos.",
      "The text must be legible — sufficient font size and contrast against the background.",
      "See 27 CFR Part 16 for full formatting requirements.",
    ],
  },
  bottlerProducer: {
    title: "Bottler / Producer Name and Address",
    steps: [
      "Include the name and complete address of the bottler or producer.",
      "For spirits: \"Bottled by [Name], [City, State ZIP]\" or \"Distilled by [Name]...\"",
      "For wine: \"Bottled by [Name], [City, State]\" or \"Produced and Bottled by [Name]...\"",
      "A post office box is not a substitute for a street address.",
    ],
  },
  countryOfOrigin: {
    title: "Country of Origin",
    steps: [
      "For imported products, clearly state the country of origin on the label.",
      "Accepted formats include \"Product of [Country]\" or \"Imported from [Country]\".",
      "This must appear in a legible location separate from other required information.",
      // Edge case: domestic products do not require a country of origin statement.
      // This correction only appears when the AI detects an imported product (isDomestic = false).
    ],
  },
  labelLanguage: {
    title: "Label Language",
    steps: [
      "All mandatory labeling information must appear in English.",
      "Additional languages are permitted alongside English but may not replace it.",
      "Review all required fields (class/type, net contents, Government Warning, etc.) to ensure they appear in English.",
    ],
  },
  // IMPORTANT: This field name refers to mandatory information appearing on a PROHIBITED SURFACE
  // (bottom of container, cap/cork/closure, or foil/heat-shrink capsule) — NOT prohibited imagery.
  // Prohibited imagery is a separate TTB concern addressed under 27 CFR 5.65 / 4.64 / 7.54.
  prohibitedSurface: {
    title: "Mandatory Information on Prohibited Surface",
    steps: [
      "Mandatory label information must NOT appear exclusively on the bottom of the container, the cap or cork, or the foil/heat-shrink capsule.",
      "Move any required fields (brand name, class/type, Government Warning, net contents, ABV, bottler address) to the label body — front, back, or side label.",
      // Edge case: information may ALSO appear on a cap or foil in addition to the label body,
      // but it must not appear ONLY on those surfaces.
      "Per 27 CFR 7.61 (malt), 27 CFR 4.38 (wine), and 27 CFR 5.38 (spirits), the cap/closure is a prohibited placement for mandatory statements.",
      "Reprint the label so all required information is clearly visible on the main label panel.",
    ],
  },
  // SFOV check is SPIRITS-only (null for WINE and MALT).
  // Regulation: 27 CFR 5.64 — brand name, class/type, and ABV must appear on the same label face.
  // Net contents is NOT part of the same-field-of-vision requirement under 27 CFR 5.64.
  sameFieldOfVision: {
    title: "Same Field of Vision",
    steps: [
      "For distilled spirits, the brand name, class/type designation, and alcohol content (ABV) must all appear on the same label panel (27 CFR 5.64).",
      // Redundancy note: net contents is a mandatory field but is NOT required to appear on the
      // same panel as brand name / ABV / class-type — do not add it to this panel requirement.
      "They should be visible together without rotating the container.",
      "Reorganize the layout so all three fields appear together on the front/main face of the label.",
      // Edge case: if only a single image face was uploaded, the AI cannot definitively confirm
      // same-field-of-vision — upload photos of all label panels for a conclusive check.
    ],
  },
};

export function getCorrections(failingFields: string[]): { key: string; guide: CorrectionGuide }[] {
  return failingFields
    .filter(key => key in CORRECTIONS)
    .map(key => ({ key, guide: CORRECTIONS[key] }));
}
