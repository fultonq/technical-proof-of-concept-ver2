import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { ClaudeExtractionResult } from "./label-types.js";

// System prompt that instructs Claude to extract TTB label fields and return them as
// a single JSON object with a fixed schema.
//
// Design notes:
//   - The prompt requests VERBATIM extraction. Claude must NOT paraphrase or correct
//     the label text. Corrections and normalisation happen in compliance-engine.ts.
//   - "GOVERNMENT WARNING:" capitalisation is explicitly called out because it is a
//     distinct compliance check — the prefix must be ALL CAPS per 27 CFR 16.21.
//   - sameFieldOfVision is requested only for SPIRITS. Claude is instructed to return
//     null for WINE and MALT because the same-panel requirement (27 CFR 5.64) does not
//     apply to those beverage types.
//   - Confidence scores < 0.6 signal fields that are occluded, blurry, or ambiguous.
//     The compliance engine maps low-confidence fields to NEEDS_REVIEW rather than FAIL.
//   - Max tokens is set to 8192 to accommodate verbose government warning text and long
//     bottler addresses. The typical response is ~600-900 tokens.
const EXTRACTION_PROMPT = `You are a TTB (Alcohol and Tobacco Tax and Trade Bureau) label compliance AI assistant. Analyze the provided alcohol beverage label image and extract all mandatory TTB labeling fields with high precision.

Return ONLY a valid JSON object (no markdown, no code blocks, just raw JSON) with the following exact structure:

{
  "beverageType": "SPIRITS" | "WINE" | "MALT" | "UNKNOWN",
  "brandName": {
    "value": "<exact brand name text or null>",
    "confidence": <0.0-1.0>
  },
  "classType": {
    "value": "<class/type designation e.g. 'Kentucky Straight Bourbon Whiskey' or null>",
    "confidence": <0.0-1.0>
  },
  "alcoholContent": {
    "value": "<ABV and/or proof text e.g. '40% Alc./Vol. (80 Proof)' or null>",
    "confidence": <0.0-1.0>,
    "isMandatory": <true if distilled spirits or wine >=7% ABV, false if malt beverage with standard fermentation>
  },
  "netContents": {
    "value": "<volume with unit e.g. '750 mL' or null>",
    "confidence": <0.0-1.0>
  },
  "governmentWarning": {
    "value": "<complete verbatim government warning statement text or null>",
    "confidence": <0.0-1.0>,
    "prefixIsAllCaps": <true if 'GOVERNMENT WARNING:' prefix appears in ALL CAPS, false otherwise>,
    "location": "<where on label: 'front label', 'back label', 'side label', 'bottom', 'cap/closure', 'foil capsule', or null>"
  },
  "bottlerProducer": {
    "value": "<bottler/producer name and address or null>",
    "confidence": <0.0-1.0>
  },
  "countryOfOrigin": {
    "value": "<country name if imported, null if domestic>",
    "confidence": <0.0-1.0>,
    "isDomestic": <true if product appears to be domestic, false if imported>
  },
  "sameFieldOfVision": <FOR DISTILLED SPIRITS ONLY - null for wine/malt> | {
    "allOnSamePanel": <true if Brand Name, ABV, and Class/Type all appear on the same label face without rotating>,
    "confidence": <0.0-1.0>,
    "panelDescription": "<e.g. 'front label', 'back label', or null>",
    "missingFromPanel": [<list of fields NOT on the same panel, e.g. "alcoholContent", "classType">],
    "onlyOneImageFace": <true if only one container face is visible in this image>
  },
  "labelLanguage": {
    "primaryLanguage": "<primary language detected e.g. 'English', 'Spanish', 'French'>",
    "mandatoryFieldsInEnglish": <true if all mandatory fields (except brand name) appear in English>,
    "confidence": <0.0-1.0>
  },
  "prohibitedSurface": {
    "found": <true if any mandatory information appears ONLY on a prohibited surface (bottom of container, cap/cork/closure, or foil/heat-shrink capsule)>,
    "confidence": <0.0-1.0>,
    "details": "<description of what mandatory info is on prohibited surface, or null>"
  },
  "overallConfidence": <0.0-1.0, overall confidence in the extraction quality>
}

IMPORTANT INSTRUCTIONS:
1. Extract text VERBATIM — do not paraphrase or correct the text
2. For the Government Warning, copy the EXACT text character-by-character including capitalization
3. Pay special attention to whether the Government Warning prefix is 'GOVERNMENT WARNING:' (ALL CAPS) vs 'Government Warning:' (title case) — this is a critical compliance check
4. For beverageType: SPIRITS = distilled spirits (whiskey, vodka, gin, rum, tequila, etc.), WINE = grape wine/fruit wine/mead, MALT = beer/ale/lager/cider/malt beverages
5. Low confidence (< 0.6) should be assigned to any field that is partially occluded, blurry, angled, or unclear
6. For sameFieldOfVision: only include this field for distilled spirits (beverageType = SPIRITS); set to null for WINE and MALT
7. Respond with ONLY the JSON object — no additional text, explanation, or formatting`;

// Sends the label image to Claude Vision and parses the structured extraction response.
//
// Edge cases:
//   - Claude occasionally wraps its JSON in markdown code fences despite instruction 7.
//     The regex /\{[\s\S]*\}/ extracts the first JSON object from the response as a
//     safety net, so markdown wrapping does not cause a parse failure.
//   - mimeType is cast to the Anthropic SDK's union type. Upstream validation (multer in
//     labels.ts) already restricts uploads to image/jpeg, image/png, and image/webp, so
//     the cast is safe. If that validation is ever relaxed, this cast must be updated too.
//   - The parsed result is returned as-is without schema validation. If Claude omits a
//     field or returns an unexpected type, downstream code in compliance-engine.ts will
//     encounter null/undefined values and should handle them gracefully (most do via
//     optional-chaining or null-checks).
export async function extractLabelFields(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ClaudeExtractionResult> {
  const base64Image = imageBuffer.toString("base64");

  // Safe cast: mimeType is pre-validated by multer to be one of these three values.
  const mediaType = mimeType as "image/jpeg" | "image/png" | "image/webp";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: "text",
            text: EXTRACTION_PROMPT,
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
  if (jsonMatch) {
    jsonText = jsonMatch[0];
  }

  let parsed: ClaudeExtractionResult;
  try {
    parsed = JSON.parse(jsonText) as ClaudeExtractionResult;
  } catch {
    throw new Error(`Failed to parse Claude JSON response: ${jsonText.slice(0, 200)}`);
  }

  return parsed;
}
