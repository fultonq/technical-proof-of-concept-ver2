import { anthropic } from "@workspace/integrations-anthropic-ai";

// Two-phase SVG generation prompt.
//
// Phase 1 — IDENTIFY: Claude first locates each TTB mandatory field in the
// input text regardless of its format (free-form, structured "Field: Value",
// CSV column dump, or mixed). Explicitly listing what each field looks like
// prevents Claude from mis-assigning lines to the wrong slot (e.g. putting
// the ABV in the brand-name position when a free-form label lists it first).
//
// Phase 2 — RENDER: Claude then lays out the identified fields in proper
// TTB visual order to produce a readable SVG image for the vision extractor.
//
// Legibility > polish: the SVG is fed to Claude Vision for compliance
// extraction, so every field must appear clearly on screen.
const SVG_PROMPT = `You are an alcohol beverage label design tool that produces SVG label images for TTB (Alcohol and Tobacco Tax and Trade Bureau) compliance review.

=== PHASE 1: IDENTIFY TTB FIELDS ===
From the input text (which may be in ANY format — free-form, "Field: Value" pairs, sentence form, CSV dump, or mixed order) silently identify each of the following TTB mandatory label fields:

• BRAND NAME — The brand or product name. The most prominent identity element (e.g. "OLD TOM DISTILLERY", "Maker's Mark", "Napa Valley Reserve"). NOT the producer address, NOT the class/type.
• CLASS/TYPE — The product category designation (e.g. "Kentucky Straight Bourbon Whiskey", "Chardonnay", "American Lager", "Blended Scotch Whisky", "Table Wine", "Vodka").
• ALCOHOL CONTENT — ABV percentage with unit and/or proof (e.g. "45% Alc./Vol.", "40% alc./vol. (80 Proof)", "13.5% alc/vol", "6% alcohol by volume").
• NET CONTENTS — Volume with units (e.g. "750 mL", "12 fl oz", "1.75 L", "500ml").
• BOTTLER/PRODUCER — Name and full address of bottler, brewer, producer, or packer (e.g. "Bottled by Jack Daniel Distillery, Lynchburg, TN 37352").
• COUNTRY OF ORIGIN — Country name if present (e.g. "Product of Scotland", "Imported from France", "United States").
• GOVERNMENT WARNING — The full statutory warning text starting with "GOVERNMENT WARNING:" (required on all US-sold labels).
• WINE-SPECIFIC — Appellation of origin (e.g. "Napa Valley", "California"), sulfite/sulfiting declaration (e.g. "Contains sulfites").

If a field is not present in the input text, omit it from the SVG entirely.

=== PHASE 2: RENDER THE SVG LABEL ===
Using ONLY the fields you identified above, produce a valid SVG label:

SVG SPECIFICATIONS:
- Root: <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
- Background: cream/off-white fill (#fdf8f0)
- A decorative double border (outer rect + inner rect, dark stroke)
- Layout top-to-bottom inside the border:
    1. BRAND NAME — largest text (≈48px), bold, centered near top
    2. CLASS/TYPE — medium (≈22px), centered, italic
    3. Decorative horizontal rule
    4. ALCOHOL CONTENT and NET CONTENTS — side by side (≈20px), centered
    5. BOTTLER/PRODUCER — small (≈14px), centered, multi-line if needed
    6. COUNTRY OF ORIGIN — small (≈13px), centered (only if present)
    7. WINE-SPECIFIC fields — appellation, sulfite (≈13px), centered (only if present)
    8. GOVERNMENT WARNING — very small (≈11px), left-aligned, near bottom, FULL verbatim text wrapped across multiple lines
- Fonts: use only Arial, Helvetica, Georgia, or generic serif/sans-serif
- ALL text must be HIGH CONTRAST dark color (e.g. #1a1a1a or #2c1810) on the light background
- Wrap ALL long text using multiple <tspan dy="1.2em"> elements — absolutely no text may overflow outside the SVG boundary
- GOVERNMENT WARNING must be fully visible — split into as many tspan lines as needed
- Return ONLY the raw SVG XML starting with <svg — no markdown fences, no explanation, no surrounding text

=== INPUT LABEL TEXT (any format accepted) ===
`;

export async function generateLabelSvg(labelText: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: SVG_PROMPT + "\n\n" + labelText.trim(),
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no content for label generation");
  }

  let svg = textBlock.text.trim();

  // Strip any markdown code fencing Claude may have added despite instructions
  const fenceMatch = svg.match(/```(?:svg|xml)?\s*([\s\S]*?)```/i);
  if (fenceMatch) svg = fenceMatch[1].trim();

  // Extract just the <svg>...</svg> block if anything else leaked in
  const svgMatch = svg.match(/<svg[\s\S]*<\/svg>/i);
  if (svgMatch) svg = svgMatch[0];

  if (!svg.startsWith("<svg")) {
    throw new Error("Claude did not return valid SVG content");
  }

  return svg;
}
