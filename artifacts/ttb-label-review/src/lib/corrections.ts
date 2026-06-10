export interface CorrectionGuide {
  title: string;
  steps: string[];
}

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
      "Add the class and type designation to the label (e.g., \"Kentucky Straight Bourbon Whiskey\", \"Cabernet Sauvignon\", \"American Pale Ale\").",
      "The designation must conform to the standards of identity in 27 CFR Part 5 (spirits), Part 4 (wine), or Part 7 (malt beverages).",
      "Make sure the text is clearly legible and not obscured by other design elements.",
    ],
  },
  alcoholContent: {
    title: "Alcohol Content (ABV)",
    steps: [
      "Add the alcohol content as a percentage by volume — e.g., \"45% Alc./Vol.\" or \"45% ABV\".",
      "The percent symbol (%) is mandatory and must be visible.",
      "For distilled spirits and wine above 7% ABV, this field is required by law.",
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
  prohibitedSurface: {
    title: "Prohibited Imagery or Statements",
    steps: [
      "Remove any images or depictions of people consuming alcoholic beverages.",
      "Remove any imagery involving children or content that could appeal to minors.",
      "Remove images of Santa Claus or other figures associated with minors.",
      "Remove any curative, therapeutic, or health-benefit claims.",
      "Refer to 27 CFR Part 5.65 (spirits), Part 4.64 (wine), or Part 7.54 (malt) for the full list of prohibited content.",
    ],
  },
  sameFieldOfVision: {
    title: "Same Field of Vision",
    steps: [
      "The brand name, class/type, alcohol content, and net contents must all appear on the same principal display panel.",
      "They should be visible without rotating the container.",
      "Reorganize the layout so all four mandatory fields appear together on the front/main face of the label.",
    ],
  },
};

export function getCorrections(failingFields: string[]): { key: string; guide: CorrectionGuide }[] {
  return failingFields
    .filter(key => key in CORRECTIONS)
    .map(key => ({ key, guide: CORRECTIONS[key] }));
}
