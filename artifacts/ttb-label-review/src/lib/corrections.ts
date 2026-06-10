export interface CorrectionGuide {
  title: string;
  steps: string[];
}

// Keyed by the same field names used in LabelAnalysisResult / ComplianceResult.
// Each entry is shown only when that field's matchStatus is FAIL or NEEDS_REVIEW.
// NOTE: If a new compliance field is added to the engine, add a matching entry here
// so the "How to Fix This" card on the detail page can surface guidance for it.
export const CORRECTIONS: Record<string, CorrectionGuide> = {
  brandName: {
    title: "Brand Name",
    steps: [
      "Check the spelling on the label against your TTB-approved Certificate of Label Approval (COLA).",
      "Avoid extra punctuation, line breaks, or characters not in the registered name.",
      "Re-upload with the expected brand name filled in for a tighter accuracy check.",
    ],
  },
  classType: {
    title: "Type of Beverage",
    steps: [
      "Add the class and type designation to the label — e.g., \"Kentucky Straight Bourbon Whiskey\", \"Cabernet Sauvignon\", \"American Pale Ale\".",
      "Spirits must use a class designation from 27 CFR Part 5 (e.g., Whisky, Vodka, Gin, Rum, Brandy, Tequila, or a sub-class like \"Straight Bourbon Whisky\").",
      "Wine must use a class or type from 27 CFR Part 4 (e.g., \"Table Wine\", \"Dessert Wine\", or an approved varietal name like \"Chardonnay\").",
      "Malt beverages must use a class from 27 CFR Part 7 (e.g., \"Beer\", \"Ale\", \"Lager\", \"Porter\", \"Stout\", \"Malt Beverage\").",
      "Make sure the text is clearly legible and not obscured by other design elements.",
    ],
  },
  alcoholContent: {
    title: "Alcohol Content (ABV)",
    steps: [
      "Add the alcohol content as a percentage by volume — e.g., \"45% Alc./Vol.\" or \"13.5% alc/vol\".",
      "The percent symbol (%) is mandatory and must be clearly visible.",
      "For distilled spirits (27 CFR 5.37) and wine ≥7% ABV (27 CFR 4.36), this field is required by law.",
      "Malt beverages (beer, ale, lager) are exempt from the ABV requirement under standard fermentation unless the label makes a strength claim.",
      "Optionally include the proof statement immediately after the ABV — e.g., \"(90 Proof)\".",
    ],
  },
  netContents: {
    title: "Bottle / Package Size",
    steps: [
      "Add the net contents to the label — e.g., \"750 mL\", \"1 L\", \"12 fl oz\", \"355 mL\".",
      "The unit (mL, L, or fl oz) must be present and clearly readable.",
      "Place it in a clearly visible location on the label.",
    ],
  },
  governmentWarning: {
    title: "Health Warning Statement",
    steps: [
      "The warning must start with the words GOVERNMENT WARNING: printed in ALL CAPITAL LETTERS.",
      "The complete required text, which must appear word-for-word, is: \"GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.\"",
      "No words may be omitted, added, or changed. Check carefully for typos.",
      "The text must be legible — sufficient font size and contrast against the background.",
      "See 27 CFR Part 16 for full formatting requirements.",
    ],
  },
  bottlerProducer: {
    title: "Bottler / Producer Name and Address",
    steps: [
      "Include the name and complete address of the bottler, producer, or brewer.",
      "For spirits: \"Bottled by [Name], [City, State ZIP]\" or \"Distilled by [Name]...\"",
      "For wine: \"Bottled by [Name], [City, State]\" or \"Produced and Bottled by [Name]...\"",
      "For malt beverages: \"Brewed and bottled by [Name], [City, State]\" or \"Packed by [Name]...\"",
      "A post office box is not a substitute for a street address.",
    ],
  },
  countryOfOrigin: {
    title: "Country of Origin",
    steps: [
      "For wine, country of origin is required on ALL labels — domestic and imported (27 CFR 4.32(a)(3)).",
      "For imported spirits and malt beverages, clearly state the country of origin.",
      "Accepted formats include \"Product of [Country]\", \"Imported from [Country]\", or \"[Country]\".",
      "For domestic wine, state \"United States\" or \"American\" clearly on the label.",
      "This must appear in a legible location separate from other required information.",
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
  // IMPORTANT: This field refers to mandatory information on a PROHIBITED SURFACE
  // (bottom of container, cap/cork/closure, or foil/heat-shrink capsule) — NOT prohibited imagery.
  prohibitedSurface: {
    title: "Mandatory Information on Prohibited Surface",
    steps: [
      "Mandatory label information must NOT appear exclusively on the bottom of the container, the cap or cork, or the foil/heat-shrink capsule.",
      "Move any required fields (brand name, class/type, Government Warning, net contents, ABV, bottler address) to the label body — front, back, or side label.",
      "Information may also appear on a cap or foil in addition to the label body, but it must not appear ONLY on those surfaces.",
      "Per 27 CFR 7.61 (malt), 27 CFR 4.38 (wine), and 27 CFR 5.38 (spirits), the cap/closure is a prohibited placement for mandatory statements.",
      "Reprint the label so all required information is clearly visible on the main label panel.",
    ],
  },
  // SFOV check is SPIRITS-only (null for WINE and MALT).
  // Regulation: 27 CFR 5.64 — brand name, class/type, and ABV must appear on the same label face.
  sameFieldOfVision: {
    title: "Same Field of Vision (Spirits Only)",
    steps: [
      "For distilled spirits, the brand name, class/type designation, and alcohol content (ABV) must all appear on the same label panel (27 CFR 5.64).",
      "They must be visible together without rotating the container.",
      "Reorganize the layout so all three fields appear together on the front/main face of the label.",
      "Net contents is NOT required to appear on the same panel — only brand name, class/type, and ABV.",
      "If you have photos of only one label face, upload both front and back images for a definitive check.",
    ],
  },
  // Wine-specific: Appellation of Origin (27 CFR 4.23)
  appellationOfOrigin: {
    title: "Appellation of Origin (Wine)",
    steps: [
      "If a wine uses a varietal designation (e.g., \"Chardonnay\", \"Cabernet Sauvignon\") or includes a vintage year, an appellation of origin is required (27 CFR 4.23).",
      "The appellation must be a TTB-approved American Viticultural Area (AVA), state, county, or country — e.g., \"Napa Valley\", \"California\", \"Oregon\", \"France\".",
      "At least 75% of the wine must be from the stated appellation when using a varietal name (or 85% for AVA designations).",
      "Place the appellation near the class/type designation in a clearly legible position.",
      "See 27 CFR 4.25 and 4.25a for qualifying production percentages.",
    ],
  },
  // Wine-specific: Sulfite Declaration (27 CFR 4.32(b)(1))
  sulfiteDeclaration: {
    title: "Sulfite Declaration (Wine)",
    steps: [
      "If the wine contains 10 ppm (parts per million) or more of sulfites, the label must include a sulfite declaration (27 CFR 4.32(b)(1)).",
      "The required statement is: \"Contains sulfites\" or \"Contains (a) sulfiting agent(s)\".",
      "If the wine contains less than 10 ppm sulfites and you wish to make a \"no sulfites\" claim, you must state \"No sulfites added\" (and the wine must be made without sulfite additions and test below 10 ppm).",
      "Have a laboratory test the sulfite content if you are unsure.",
      "Place the declaration clearly on the label, typically near the Government Warning.",
    ],
  },
};

export function getCorrections(failingFields: string[]): { key: string; guide: CorrectionGuide }[] {
  return failingFields
    .filter(key => key in CORRECTIONS)
    .map(key => ({ key, guide: CORRECTIONS[key] }));
}
