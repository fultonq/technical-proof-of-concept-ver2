import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { ClaudeExtractionResult } from "./label-types.js";

// System prompt for TTB label field extraction.
//
// Design notes:
//   - One or two images may be provided (front label only, or front + back label).
//     When two images are provided, Claude must consider fields across both images.
//   - VERBATIM extraction is required. Claude must NOT paraphrase or correct text.
//     Corrections and normalization happen in compliance-engine.ts.
//   - Only the body TEXT of the Government Warning is checked against 27 CFR 16.21 statutory wording.
//   - beverage-type-specific compliance requirements drive what Claude extracts:
//       SPIRITS (27 CFR Part 5): ABV mandatory; sameFieldOfVision required
//       WINE    (27 CFR Part 4): ABV mandatory (≥7% ABV); country of origin always required;
//                                appellationOfOrigin and sulfiteDeclaration extracted
//       MALT    (27 CFR Part 7): ABV not mandatory; no same-field-of-vision requirement
//   - Confidence < 0.6 → field is occluded, blurry, or ambiguous → NEEDS_REVIEW in engine.
//   - Max tokens 8192 accommodates verbose gov-warning text and long bottler addresses.
const EXTRACTION_PROMPT = `You are a TTB (Alcohol and Tobacco Tax and Trade Bureau) label compliance AI assistant. Analyze the provided alcohol beverage label image(s) and extract all mandatory TTB labeling fields with high precision. If two images are provided, they are the front and back panels of the same label — extract fields from both.

Return ONLY a valid JSON object (no markdown, no code blocks, just raw JSON) with the following exact structure:

{
  "beverageType": "SPIRITS" | "WINE" | "MALT" | "UNKNOWN",
  "brandName": {
    "value": "<exact brand name text or null>",
    "confidence": <0.0-1.0>
  },
  "classType": {
    "value": "<class/type designation — e.g. 'Kentucky Straight Bourbon Whiskey', 'Chardonnay', 'Red Wine', 'Table Wine', 'Ale', 'Beer', 'Lager', or for multi-varietal blends include the percentages verbatim e.g. '60% Chardonnay / 40% Semillon', '70% Cabernet Sauvignon 30% Merlot'; IMPORTANT: if an appellation appears on the same line as varieties (e.g. 'CALIFORNIA 60% CHARDONNAY 40% SEMILLON') extract ONLY the varietal blend as classType — the geographic name is the appellation, not part of the class/type>",
    "confidence": <0.0-1.0>
  },
  "alcoholContent": {
    "value": "<ABV and/or proof text — accept any format: '40% Alc./Vol. (80 Proof)', '13.5% alc/vol', '40% ABV', '38% vol', '6% alcohol by volume', '80 Proof', or null>",
    "confidence": <0.0-1.0>,
    "isMandatory": <true if SPIRITS or WINE ≥7% ABV; false if MALT beverage with standard fermentation>
  },
  "netContents": {
    "value": "<volume with unit e.g. '750 mL', '12 fl oz', '355 mL', or null>",
    "confidence": <0.0-1.0>
  },
  "governmentWarning": {
    "value": "<complete verbatim government warning statement text or null>",
    "confidence": <0.0-1.0>,
    "prefixIsAllCaps": <true if 'GOVERNMENT WARNING:' prefix appears in ALL CAPS, false otherwise — informational only, not used for compliance decisions>,
    "location": "<where on label: 'front label', 'back label', 'side label', 'bottom', 'cap/closure', 'foil capsule', or null>"
  },
  "bottlerProducer": {
    "value": "<name and full address of bottler, brewer, producer, packer, OR importer — accept any of: 'BOTTLED BY X', 'BREWED BY X', 'PRODUCED BY X', 'PACKED BY X', 'IMPORTED BY X', 'DISTRIBUTED BY X', or just the name and address without a prefix; null only if completely absent>",
    "confidence": <0.0-1.0>
  },
  "countryOfOrigin": {
    "value": "<country name — for WINE: required; if no explicit 'Country of Origin' line exists, infer from appellation (e.g. 'American Merlot' → 'United States', 'California Chardonnay' → 'United States', 'Bordeaux' → 'France'); for imported SPIRITS/MALT: extract country name; null only for domestic SPIRITS/MALT with no country stated>",
    "confidence": <0.0-1.0>,
    "isDomestic": <true if product is from the USA, false if imported>
  },
  "sameFieldOfVision": <FOR DISTILLED SPIRITS ONLY — set to null for WINE and MALT> | {
    "allOnSamePanel": <true if Brand Name, ABV, and Class/Type all appear on the same label face without rotating>,
    "confidence": <0.0-1.0>,
    "panelDescription": "<e.g. 'front label', 'back label', or null>",
    "missingFromPanel": [<list of field names NOT on the same panel, e.g. "alcoholContent", "classType">],
    "onlyOneImageFace": <true if only one container face is visible in this image set>
  },
  "labelLanguage": {
    "primaryLanguage": "<primary language detected e.g. 'English', 'Spanish', 'French'>",
    "mandatoryFieldsInEnglish": <true if all mandatory fields appear in English>,
    "confidence": <0.0-1.0>
  },
  "prohibitedSurface": {
    "found": <true if any mandatory information appears ONLY on a prohibited surface (bottom of container, cap/cork/closure, or foil/heat-shrink capsule)>,
    "confidence": <0.0-1.0>,
    "details": "<description of what mandatory info is on prohibited surface, or null>"
  },
  "appellationOfOrigin": <FOR WINE ONLY — null for SPIRITS and MALT> | {
    "value": "<appellation text e.g. 'Napa Valley', 'California', 'American', 'Bordeaux', 'Victoria', 'Marlborough', or null if not stated>",
    "confidence": <0.0-1.0>,
    "isMandatory": <true if EITHER (a) a varietal designation is used (e.g. 'Chardonnay', 'Merlot', 'Cabernet Sauvignon', 'Shiraz') OR (b) a vintage year is stated (e.g. '2007', '2019', any 4-digit year) — both trigger 27 CFR 4.23 mandatory appellation requirement>
  },
  "sulfiteDeclaration": <FOR WINE ONLY — null for SPIRITS and MALT> | {
    "value": "<verbatim sulfite declaration text e.g. 'Contains sulfites', 'Contains (a) sulfiting agent(s)', 'No sulfites added', or null if absent>",
    "confidence": <0.0-1.0>,
    "found": <true if any sulfite-related statement is present on the label>
  },
  "overallConfidence": <0.0-1.0, overall confidence in the extraction quality>
}

IMPORTANT INSTRUCTIONS:
1. Extract text VERBATIM — do not paraphrase or correct the text
2. For the Government Warning, copy the EXACT text including capitalization. NOTE: the body text often appears in ALL CAPS on real labels — copy it exactly as printed. The prefix ("GOVERNMENT WARNING:", "Government Warning:", etc.) may appear in any case; copy it verbatim. Compliance is checked on the body text CONTENTS only, not on prefix casing.
3. Government Warning and sulfite declarations: Labels often print "CONTAINS SULFITES" or "CONTAINS (A) SULFITING AGENT(S)" flush-right or bold INSIDE the same box as the government warning. Extract that as the sulfiteDeclaration.value, NOT as part of the governmentWarning.value. Stop the governmentWarning.value at "...may cause health problems." and do NOT include any trailing sulfite statement.
4. beverageType: SPIRITS = distilled spirits (whiskey, vodka, gin, rum, tequila, brandy, scotch, etc.); WINE = grape wine/fruit wine/mead/sake; MALT = beer/ale/lager/stout/porter/cider/malt beverages
5. Low confidence (<0.6) should be assigned to any field that is partially occluded, blurry, angled, or ambiguous
6. sameFieldOfVision: ONLY for SPIRITS (set null for WINE/MALT). Checks that Brand Name, Class/Type, and ABV are all visible on the same panel without rotating the container
7. appellationOfOrigin and sulfiteDeclaration: ONLY for WINE (set null for SPIRITS/MALT). For multi-varietal blends: when varieties appear with percentages (e.g. "60% CHARDONNAY / 40% SEMILLON"), extract the full blend string verbatim as classType.value — do NOT split it. Any adjacent geographic name (e.g. "CALIFORNIA" on the same strip label) is the appellation, not part of classType.
8. countryOfOrigin for WINE: ALWAYS provide a value. Accepted formats include: explicit "Country of Origin: X", "PRODUCT OF X", "Product of X", "Imported from X", or inferred from the appellation — e.g. "American Merlot" or "California Chardonnay" → value="United States", isDomestic=true; "Bordeaux" or "Victoria" (Australian region) → value="France"/"Australia", isDomestic=false. US appellations (American, California, Napa Valley, Oregon, Washington, New York, etc.) → value="United States", isDomestic=true.
9. ABV formats — all of these are valid: "40% Alc./Vol.", "40% ABV", "ALC. 15.5% BY VOL.", "ALC 40% BY VOL", "13.5% alc/vol", "6% alcohol by volume", "80 Proof". Extract verbatim.
10. Respond with ONLY the JSON object — no additional text, explanation, or formatting`;

export interface LabelImage {
  buffer: Buffer;
  mimeType: string;
}

// Sends one or more label images to Claude Vision and returns a structured extraction result.
//
// Multi-image support: when a front + back label are both provided, both images are included in
// one Claude message. Claude is instructed to extract fields from across all provided images.
// This correctly handles the common pattern where the government warning is on the back label
// while the brand name and ABV are on the front.
//
// Edge cases:
//   - Claude may wrap its JSON in markdown code fences despite instructions. The regex
//     /\{[\s\S]*\}/ strips any surrounding markup as a safety net.
//   - mimeType is cast to the Anthropic SDK union type — upstream multer validation already
//     restricts uploads to jpeg/png/webp, so the cast is safe.
//   - The parsed result is returned as-is. Downstream code in compliance-engine.ts handles
//     null/undefined fields via optional-chaining and null-checks.
export async function extractLabelFields(
  images: LabelImage[],
): Promise<ClaudeExtractionResult> {
  if (images.length === 0) throw new Error("At least one image is required");

  const imageContent = images.map(({ buffer, mimeType }) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: mimeType as "image/jpeg" | "image/png" | "image/webp",
      data: buffer.toString("base64"),
    },
  }));

  const prefixText =
    images.length > 1
      ? `Analyzing ${images.length} label images (front and back panels of the same product). Extract fields across all images.\n\n`
      : "";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: prefixText + EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  });

  const textContent = message.content.find((b) => b.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  // Strip any markdown fencing Claude may have added despite instructions.
  let jsonText = textContent.text.trim();
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonText = jsonMatch[0];

  let parsed: ClaudeExtractionResult;
  try {
    parsed = JSON.parse(jsonText) as ClaudeExtractionResult;
  } catch {
    throw new Error(`Failed to parse Claude JSON response: ${jsonText.slice(0, 200)}`);
  }

  return parsed;
}
