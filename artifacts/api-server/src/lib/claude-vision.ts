import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { ClaudeExtractionResult } from "./label-types.js";

// System prompt for TTB label field extraction.
//
// Design notes:
//   - One or two images may be provided (front label only, or front + back label).
//     When two images are provided, Claude must consider fields across both images.
//   - VERBATIM extraction is required. Claude must NOT paraphrase or correct text.
//     Corrections and normalization happen in compliance-engine.ts.
//   - "GOVERNMENT WARNING:" capitalisation check is critical (27 CFR 16.21 requires ALL CAPS prefix).
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
    "value": "<class/type designation — e.g. 'Kentucky Straight Bourbon Whiskey', 'Chardonnay', 'Table Wine', 'Ale', 'Beer', 'Lager', or null>",
    "confidence": <0.0-1.0>
  },
  "alcoholContent": {
    "value": "<ABV and/or proof text e.g. '40% Alc./Vol. (80 Proof)', '13.5% alc/vol', or null>",
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
    "prefixIsAllCaps": <true if 'GOVERNMENT WARNING:' prefix appears in ALL CAPS, false otherwise>,
    "location": "<where on label: 'front label', 'back label', 'side label', 'bottom', 'cap/closure', 'foil capsule', or null>"
  },
  "bottlerProducer": {
    "value": "<bottler/brewer/producer/packer name and full address, or null>",
    "confidence": <0.0-1.0>
  },
  "countryOfOrigin": {
    "value": "<country name — required for ALL WINE even if domestic; required for imported SPIRITS/MALT; null only for domestic SPIRITS/MALT>",
    "confidence": <0.0-1.0>,
    "isDomestic": <true if product appears to be domestic USA product, false if imported>
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
    "value": "<appellation text e.g. 'Napa Valley', 'California', 'Bordeaux', or null if not stated>",
    "confidence": <0.0-1.0>,
    "isMandatory": <true if the wine uses a varietal designation (e.g. 'Chardonnay', 'Cabernet Sauvignon') or a vintage year, which require an appellation per 27 CFR 4.23>
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
2. For the Government Warning, copy the EXACT text character-by-character including capitalization
3. Pay special attention to whether the Government Warning prefix is 'GOVERNMENT WARNING:' (ALL CAPS) vs 'Government Warning:' (title case) — this is a critical compliance check
4. beverageType: SPIRITS = distilled spirits (whiskey, vodka, gin, rum, tequila, brandy, etc.); WINE = grape wine/fruit wine/mead/sake; MALT = beer/ale/lager/stout/porter/cider/malt beverages
5. Low confidence (<0.6) should be assigned to any field that is partially occluded, blurry, angled, or ambiguous
6. sameFieldOfVision: ONLY for SPIRITS (set null for WINE/MALT). Checks that Brand Name, Class/Type, and ABV are all visible on the same panel without rotating the container
7. appellationOfOrigin and sulfiteDeclaration: ONLY for WINE (set null for SPIRITS/MALT)
8. countryOfOrigin: For WINE it is ALWAYS required — include the value even for domestic USA wines (value should be "United States" or "USA" for domestic wine)
9. Respond with ONLY the JSON object — no additional text, explanation, or formatting`;

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
