import { LabelAnalysisResult } from "@workspace/api-client-react";
import { type ReviewAction, DECISION_LABELS } from "./review-actions";

// Canonical display order for beverage type sections.
const TYPE_ORDER = ["SPIRITS", "WINE", "MALT", "UNKNOWN"] as const;

const BEVERAGE_META: Record<string, { label: string; cfr: string; accent: string }> = {
  SPIRITS: { label: "Distilled Spirits",     cfr: "27 CFR Part 5",        accent: "#7c3aed" },
  WINE:    { label: "Wine",                  cfr: "27 CFR Part 4",        accent: "#0369a1" },
  MALT:    { label: "Beer / Malt Beverage",  cfr: "27 CFR Part 7",        accent: "#b45309" },
  UNKNOWN: { label: "Unknown Beverage Type", cfr: "Type not determined",  accent: "#6b7280" },
};

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  PASS:   { bg: "#dcfce7", fg: "#15803d" },
  FAIL:   { bg: "#fee2e2", fg: "#b91c1c" },
  REVIEW: { bg: "#fef3c7", fg: "#b45309" },
};

const DECISION_COLORS: Record<string, { bg: string; fg: string }> = {
  APPROVED:          { bg: "#dcfce7", fg: "#15803d" },
  OVERRIDE_APPROVED: { bg: "#fef3c7", fg: "#b45309" },
  CORRECTION_ISSUED: { bg: "#fee2e2", fg: "#b91c1c" },
};

function buildLabelRow(
  r: LabelAnalysisResult,
  rowIndex: number,
  globalSeq: number,
  comment: string,
  reviewAction: ReviewAction | null,
): string {
  const { bg, fg } = STATUS_COLORS[r.overallStatus] ?? { bg: "#f3f4f6", fg: "#374151" };
  const errors   = r.flags.filter(f => f.severity === "ERROR");
  const warnings = r.flags.filter(f => f.severity === "WARNING");
  const issuesHtml =
    r.flags.length === 0
      ? `<span style="color:#15803d;font-weight:600;">&#10003; No issues</span>`
      : [
          ...errors.map(  f => `<div style="color:#b91c1c;margin-bottom:3px;">&#9940; ${esc(f.message)}</div>`),
          ...warnings.map(f => `<div style="color:#b45309;margin-bottom:3px;">&#9888; ${esc(f.message)}</div>`),
        ].join("");
  const rowBg = rowIndex % 2 === 0 ? "#ffffff" : "#f9fafb";

  let decisionHtml = `<span style="color:#d1d5db;font-style:italic;">Pending</span>`;
  if (reviewAction) {
    const dc = DECISION_COLORS[reviewAction.decision] ?? { bg: "#f3f4f6", fg: "#374151" };
    const label = DECISION_LABELS[reviewAction.decision] ?? reviewAction.decision;
    const date  = new Date(reviewAction.actionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    decisionHtml = `
      <div style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:800;font-size:11px;background:${dc.bg};color:${dc.fg};margin-bottom:4px;">
        ${esc(label)}
      </div>
      <div style="color:#6b7280;font-size:10px;">${esc(date)}</div>
      ${reviewAction.note ? `<div style="font-style:italic;font-size:11px;color:#374151;margin-top:3px;white-space:pre-wrap;">${esc(reviewAction.note)}</div>` : ""}`;
  }

  return `
    <tr style="page-break-inside:avoid;background:${rowBg};">
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-weight:700;font-size:11px;">${globalSeq}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;">
        <div style="font-weight:700;font-size:13px;word-break:break-word;">${esc(r.fileName)}</div>
      </td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;font-family:'Courier New',monospace;font-size:13px;">
        ${r.brandName.extractedValue
          ? esc(r.brandName.extractedValue)
          : `<span style="color:#9ca3af;font-style:italic;">Not detected</span>`}
      </td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">
        <span style="display:inline-block;padding:3px 10px;border-radius:4px;font-weight:800;font-size:12px;letter-spacing:0.5px;background:${bg};color:${fg};">
          ${esc(r.overallStatus)}
        </span>
      </td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;max-width:240px;">${issuesHtml}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${decisionHtml}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;min-width:120px;">
        ${comment
          ? `<div style="white-space:pre-wrap;">${esc(comment)}</div>`
          : `<span style="color:#d1d5db;font-style:italic;">&#8212;</span>`}
      </td>
    </tr>`;
}

function miniPill(count: number, label: string, color: string): string {
  if (count === 0) return "";
  return `<span style="display:inline-block;margin-right:10px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${color}20;color:${color};font-family:sans-serif;">${count} ${label}</span>`;
}

export interface SessionData {
  results: LabelAnalysisResult[];
  totalCount: number;
  passCount: number;
  reviewCount: number;
  failCount: number;
}

export function generatePrintReport(
  sessionData: SessionData,
  comments: Record<string, string>,
  sessionId: string,
  reviewActions: Record<string, ReviewAction> = {},
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  // Tally review decisions for the summary line
  const decidedCount   = Object.keys(reviewActions).length;
  const approvedCount  = Object.values(reviewActions).filter(a => a.decision === "APPROVED" || a.decision === "OVERRIDE_APPROVED").length;
  const correctedCount = Object.values(reviewActions).filter(a => a.decision === "CORRECTION_ISSUED").length;

  // Group results by beverage type, preserving canonical order.
  const groups: Record<string, LabelAnalysisResult[]> = {};
  for (const r of sessionData.results) {
    const key = r.beverageType ?? "UNKNOWN";
    (groups[key] ??= []).push(r);
  }

  let globalSeq = 0;
  const sections = TYPE_ORDER
    .filter(type => (groups[type]?.length ?? 0) > 0)
    .map(type => {
      const meta   = BEVERAGE_META[type] ?? BEVERAGE_META["UNKNOWN"];
      const labels = groups[type];
      const pass   = labels.filter(r => r.overallStatus === "PASS").length;
      const fail   = labels.filter(r => r.overallStatus === "FAIL").length;
      const review = labels.filter(r => r.overallStatus === "REVIEW").length;

      const rows = labels.map((r, i) => {
        globalSeq += 1;
        return buildLabelRow(r, i, globalSeq, comments[r.labelId] ?? "", reviewActions[r.labelId] ?? null);
      }).join("");

      return `
      <div style="margin-bottom:28px;page-break-inside:avoid;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;
                    border-left:5px solid ${meta.accent};padding:8px 14px;background:${meta.accent}0d;margin-bottom:8px;">
          <div>
            <span style="font-size:15px;font-weight:900;color:${meta.accent};text-transform:uppercase;letter-spacing:0.5px;font-family:sans-serif;">
              ${esc(meta.label)}
            </span>
            <span style="margin-left:10px;font-size:11px;color:#6b7280;font-family:sans-serif;">${esc(meta.cfr)}</span>
          </div>
          <div style="font-size:12px;">
            <span style="color:#6b7280;font-family:sans-serif;margin-right:6px;">${labels.length} label${labels.length !== 1 ? "s" : ""} &nbsp;&#8212;</span>
            ${miniPill(pass,   "PASS",   "#15803d")}
            ${miniPill(review, "REVIEW", "#b45309")}
            ${miniPill(fail,   "FAIL",   "#b91c1c")}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:28px;">#</th>
              <th style="min-width:120px;">Label File</th>
              <th style="min-width:100px;">Brand Name</th>
              <th style="width:68px;text-align:center;">AI Result</th>
              <th>Compliance Issues</th>
              <th style="min-width:110px;">Agent Decision</th>
              <th style="min-width:110px;">Reviewer Comment</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>TTB Compliance Report &#8212; ${sessionId.slice(0, 8).toUpperCase()}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Times New Roman", Times, serif; color: #111827; background: #fff; font-size: 14px; }
    @media print {
      body { font-size: 11px; }
      .no-print { display: none !important; }
      @page { size: letter landscape; margin: 0.65in 0.5in; }
    }
    .no-print {
      background: #f3f4f6; border-bottom: 2px solid #d1d5db; padding: 14px;
      text-align: center; font-family: sans-serif;
    }
    .print-btn {
      background: #1e3a5f; color: #fff; border: none; padding: 11px 28px;
      font-size: 15px; border-radius: 6px; cursor: pointer; margin-right: 10px;
      font-family: sans-serif; font-weight: 600;
    }
    .print-btn:hover { background: #162d4a; }
    .close-btn {
      background: #fff; color: #374151; border: 2px solid #d1d5db; padding: 9px 20px;
      font-size: 14px; border-radius: 6px; cursor: pointer; font-family: sans-serif;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 28px 36px 40px; }
    .gov-header { text-align: center; border-bottom: 4px double #1e3a5f; padding-bottom: 14px; margin-bottom: 18px; }
    .gov-dept  { font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; color: #6b7280; margin-bottom: 5px; font-family: sans-serif; }
    .gov-title { font-size: 21px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #1e3a5f; }
    .gov-sub   { font-size: 12px; color: #6b7280; margin-top: 5px; font-family: sans-serif; }
    .meta-bar  { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border: 1px solid #e5e7eb; background: #f9fafb; padding: 11px 16px; margin-bottom: 18px; border-radius: 4px; font-family: sans-serif; font-size: 12px; }
    .meta-item label { display: block; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; font-size: 10px; margin-bottom: 2px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 14px; }
    .decision-bar { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin-bottom: 22px; background: #f9fafb; font-family: sans-serif; font-size: 12px; display: flex; gap: 24px; flex-wrap: wrap; }
    .sum-card  { border: 2px solid; border-radius: 8px; padding: 14px 12px; text-align: center; }
    .sum-count { font-size: 38px; font-weight: 900; line-height: 1; }
    .sum-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-top: 5px; font-family: sans-serif; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead { background: #1e3a5f; color: #fff; }
    thead th { padding: 9px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-family: sans-serif; }
    .sig-section { margin-top: 16px; border-top: 2px solid #1e3a5f; padding-top: 18px; page-break-inside: avoid; }
    .sig-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 14px; font-family: sans-serif; }
    .sig-grid  { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 32px; }
    .sig-line  { border-bottom: 1px solid #374151; height: 34px; margin-bottom: 5px; }
    .sig-lbl   { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-family: sans-serif; }
    .report-footer { text-align: center; font-size: 10px; color: #9ca3af; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 10px; font-family: sans-serif; }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="print-btn" onclick="window.print()">&#128438; Print / Save as PDF</button>
    <button class="close-btn" onclick="window.close()">Close</button>
    <span style="margin-left:14px;color:#6b7280;font-size:13px;">Tip: choose &ldquo;Save as PDF&rdquo; in your print dialog to keep a digital copy.</span>
  </div>

  <div class="container">

    <div class="gov-header">
      <div class="gov-dept">U.S. Department of the Treasury</div>
      <div class="gov-title">Alcohol and Tobacco Tax and Trade Bureau (TTB)</div>
      <div class="gov-sub">Label Compliance Review Report &nbsp;&#8212;&nbsp; Alcohol Beverage Labeling Act (27 CFR Parts 4, 5 &amp; 7)</div>
    </div>

    <div class="meta-bar">
      <div class="meta-item">
        <label>Report Date &amp; Time</label>
        ${esc(dateStr)} &nbsp;&#8226;&nbsp; ${esc(timeStr)}
      </div>
      <div class="meta-item" style="text-align:center;">
        <label>Session ID</label>
        <code style="font-size:11px;">${esc(sessionId)}</code>
      </div>
      <div class="meta-item" style="text-align:right;">
        <label>Total Labels Reviewed</label>
        <strong>${sessionData.totalCount}</strong>
      </div>
    </div>

    <div class="summary-grid">
      <div class="sum-card" style="border-color:#16a34a;background:#f0fdf4;">
        <div class="sum-count" style="color:#15803d;">${sessionData.passCount}</div>
        <div class="sum-label" style="color:#15803d;">&#10003; Passed</div>
      </div>
      <div class="sum-card" style="border-color:#d97706;background:#fffbeb;">
        <div class="sum-count" style="color:#b45309;">${sessionData.reviewCount}</div>
        <div class="sum-label" style="color:#b45309;">&#9888; Needs Review</div>
      </div>
      <div class="sum-card" style="border-color:#dc2626;background:#fef2f2;">
        <div class="sum-count" style="color:#b91c1c;">${sessionData.failCount}</div>
        <div class="sum-label" style="color:#b91c1c;">&#10007; Failed</div>
      </div>
    </div>

    <!-- Agent decision summary -->
    <div class="decision-bar">
      <div><label style="display:block;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;font-size:10px;margin-bottom:2px;">Agent Decisions Recorded</label>
        <strong>${decidedCount}</strong> of ${sessionData.totalCount} labels</div>
      <div><label style="display:block;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;font-size:10px;margin-bottom:2px;">Approved (incl. overrides)</label>
        <span style="color:#15803d;font-weight:700;">${approvedCount}</span></div>
      <div><label style="display:block;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;font-size:10px;margin-bottom:2px;">Correction Notices Issued</label>
        <span style="color:#b91c1c;font-weight:700;">${correctedCount}</span></div>
    </div>

    ${sections}

    <div class="sig-section">
      <div class="sig-title">Reviewer Certification</div>
      <div class="sig-grid">
        <div>
          <div class="sig-line"></div>
          <div class="sig-lbl">Reviewing Officer — Printed Name</div>
        </div>
        <div>
          <div class="sig-line"></div>
          <div class="sig-lbl">Title / Badge Number</div>
        </div>
        <div>
          <div class="sig-line"></div>
          <div class="sig-lbl">Signature &amp; Date Signed</div>
        </div>
      </div>
    </div>

    <p class="report-footer">
      Generated by TTB Label Review PoC &nbsp;&#8226;&nbsp; ${esc(dateStr)} at ${esc(timeStr)}
      &nbsp;&#8226;&nbsp; Session ${esc(sessionId.slice(0, 8).toUpperCase())}
      <br/>This document is a computer-generated compliance screening summary. It does not constitute a final agency determination or approval.
    </p>

  </div>
</body>
</html>`;
}
