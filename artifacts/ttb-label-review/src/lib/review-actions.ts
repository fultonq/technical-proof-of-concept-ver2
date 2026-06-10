// Per-label review decisions made by the agent.
// Stored in localStorage per labelId (labelIds are globally-unique UUIDs).
// Key: `ttb-review-${labelId}`
//
// Decision states:
//   APPROVED          — agent approved a PASS label (clean approval)
//   OVERRIDE_APPROVED — agent approved a FAIL/REVIEW label with a justification note
//   CORRECTION_ISSUED — agent issued a correction notice to the applicant
//   PENDING           — no decision recorded yet

export type ReviewDecision =
  | "APPROVED"
  | "OVERRIDE_APPROVED"
  | "CORRECTION_ISSUED";

export interface ReviewAction {
  decision: ReviewDecision;
  note: string;              // Justification note (mandatory for OVERRIDE_APPROVED)
  correctionNotice: string;  // Full text of issued correction notice
  actionDate: string;        // ISO date string
}

const key = (labelId: string) => `ttb-review-${labelId}`;

export function getReviewAction(labelId: string): ReviewAction | null {
  try {
    const raw = localStorage.getItem(key(labelId));
    return raw ? (JSON.parse(raw) as ReviewAction) : null;
  } catch {
    return null;
  }
}

export function setReviewAction(labelId: string, action: ReviewAction): void {
  try {
    localStorage.setItem(key(labelId), JSON.stringify(action));
  } catch { /* ignore quota */ }
}

export function getSessionReviewActions(
  labelIds: string[],
): Record<string, ReviewAction> {
  const result: Record<string, ReviewAction> = {};
  for (const id of labelIds) {
    const a = getReviewAction(id);
    if (a) result[id] = a;
  }
  return result;
}

// ── Correction notice template ─────────────────────────────────────────────

export function buildCorrectionTemplate(
  fileName: string,
  sessionId: string,
  beverageType: string,
  flags: Array<{ field: string; severity: string; message: string }>,
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const beverageCfr: Record<string, string> = {
    SPIRITS: "27 CFR Part 5",
    WINE:    "27 CFR Part 4",
    MALT:    "27 CFR Part 7",
  };
  const cfr = beverageCfr[beverageType] ?? "27 CFR Parts 4 / 5 / 7";

  const errors   = flags.filter(f => f.severity === "ERROR");
  const warnings = flags.filter(f => f.severity === "WARNING");

  const errList = errors.length > 0
    ? errors.map((f, i) => `  ${i + 1}. ${f.message}`).join("\n")
    : "  (none)";
  const warnList = warnings.length > 0
    ? warnings.map((f, i) => `  ${i + 1}. ${f.message}`).join("\n")
    : "  (none)";

  return `CORRECTION NOTICE — TTB Label Compliance Review
Date: ${date}
Label File: ${fileName}
Regulation: ${cfr}
Session ID: ${sessionId.slice(0, 8).toUpperCase()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This label application does not comply with applicable TTB mandatory labeling
requirements under the Alcohol Beverage Labeling Act. The deficiencies listed
below must be corrected before this label may be approved.

ERRORS — must be corrected before resubmission:
${errList}

ITEMS REQUIRING VERIFICATION OR ADDITIONAL DOCUMENTATION:
${warnList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REQUIRED ACTIONS:
  1. Correct all errors listed above in the label artwork.
  2. Provide documentation supporting any corrections made.
  3. Resubmit the revised label for a new compliance review.

ADDITIONAL REVIEWER NOTES:
[Enter any additional comments or instructions here]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This notice does not constitute a final agency determination.
The applicant has 30 days from the date of this notice to submit corrections.`;
}

// ── Display helpers ────────────────────────────────────────────────────────

export const DECISION_LABELS: Record<ReviewDecision, string> = {
  APPROVED:          "Approved",
  OVERRIDE_APPROVED: "Override Approved",
  CORRECTION_ISSUED: "Correction Issued",
};

export const DECISION_STYLES: Record<ReviewDecision, { bg: string; text: string; border: string }> = {
  APPROVED:          { bg: "bg-pass/10",    text: "text-pass",    border: "border-pass/30" },
  OVERRIDE_APPROVED: { bg: "bg-review/10",  text: "text-review",  border: "border-review/30" },
  CORRECTION_ISSUED: { bg: "bg-fail/10",    text: "text-fail",    border: "border-fail/30" },
};
