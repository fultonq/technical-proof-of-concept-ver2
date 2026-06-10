import { anthropic } from "@workspace/integrations-anthropic-ai";

// Prompts Claude to produce a clean, readable SVG beverage label from free-form label text.
// The SVG is used as input to the compliance checker — so legibility of text is more
// important than visual polish. All mandatory TTB fields must be clearly readable.
const SVG_PROMPT = `You are an alcohol beverage label design tool. Given label text content pasted by a user, produce a valid SVG representing a realistic bottle label.

REQUIREMENTS:
- SVG element: <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" ...>
- Cream or off-white background (#fdf8f0 or similar)
- A decorative border (double border recommended)
- Lay out the fields in this order top-to-bottom:
    1. Brand Name — large bold text at top (~48px), centered
    2. Class / Type designation — medium text (~22px), centered, italicized
    3. Decorative rule or ornament divider
    4. Any tagline or subtitle in the middle
    5. ABV (Alcohol Content) and Net Contents side by side, ~20px
    6. Bottler / Producer name and address — small text (~14px), centered
    7. Country of Origin (if provided) — small text
    8. Government Warning Statement — very small (~11px), left-aligned, near bottom, full verbatim text
- Use only system-safe fonts: Arial, Helvetica, Georgia, serif, or sans-serif
- ALL text must be HIGH CONTRAST against the background (dark text on light bg)
- Wrap long text using multiple <text> or <tspan> elements — do NOT let text overflow outside the SVG
- Return ONLY the raw SVG XML — no markdown fences, no explanation, just the <svg>...</svg>

LABEL TEXT TO RENDER:
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
