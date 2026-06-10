import { LabelAnalysisResult } from "@workspace/api-client-react";

const BEVERAGE_LABELS: Record<string, string> = {
  SPIRITS: "Distilled Spirits (27 CFR Part 5)",
  WINE: "Wine (27 CFR Part 4)",
  MALT: "Beer / Malt Beverage (27 CFR Part 7)",
  UNKNOWN: "Unknown",
};

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const labelRows = sessionData.results
    .map((r, i) => {
      const statusColors: Record<string, { bg: string; fg: string }> = {
        PASS:   { bg: "#dcfce7", fg: "#15803d" },
        FAIL:   { bg: "#fee2e2", fg: "#b91c1c" },
        REVIEW: { bg: "#fef3c7", fg: "#b45309" },
      };
      const { bg, fg } = statusColors[r.overallStatus] ?? { bg: "#f3f4f6", fg: "#374151" };

      const errors   = r.flags.filter(f => f.severity === "ERROR");
      const warnings = r.flags.filter(f => f.severity === "WARNING");
      const issuesHtml =
        r.flags.length === 0
          ? `<span style="color:#15803d;font-weight:600;">&#10003; No issues</span>`
          : [
              ...errors.map(
                f => `<div style="color:#b91c1c;margin-bottom:3px;">&#9940; ${esc(f.message)}</div>`,
              ),
              ...warnings.map(
                f => `<div style="color:#b45309;margin-bottom:3px;">&#9888; ${esc(f.message)}</div>`,
              ),
            ].join("");

      const comment = comments[r.labelId] ?? "";
      const rowBg = i % 2 === 0 ? "#ffffff" : "#f9fafb";

      return `
      <tr style="page-break-inside:avoid;background:${rowBg};">
        <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-weight:700;font-size:12px;">${i + 1}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;">
          <div style="font-weight:700;font-size:13px;word-break:break-word;">${esc(r.fileName)}</div>
          <div style="color:#6b7280;font-size:11px;margin-top:2px;">${esc(BEVERAGE_LABELS[r.beverageType] ?? r.beverageType)}</div>
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
        <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;max-width:260px;">${issuesHtml}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;min-width:140px;">
          ${comment
            ? `<div style="white-space:pre-wrap;">${esc(comment)}</div>`
            : `<span style="color:#d1d5db;font-style:italic;">&#8212;</span>`}
        </td>
      </tr>`;
    })
    .join("");

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
    .container { max-width: 1160px; margin: 0 auto; padding: 28px 36px 40px; }
    .gov-header { text-align: center; border-bottom: 4px double #1e3a5f; padding-bottom: 14px; margin-bottom: 18px; }
    .gov-dept { font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; color: #6b7280; margin-bottom: 5px; font-family: sans-serif; }
    .gov-title { font-size: 21px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #1e3a5f; }
    .gov-sub { font-size: 12px; color: #6b7280; margin-top: 5px; font-family: sans-serif; }
    .meta-bar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border: 1px solid #e5e7eb; background: #f9fafb; padding: 11px 16px; margin-bottom: 18px; border-radius: 4px; font-family: sans-serif; font-size: 12px; }
    .meta-item label { display: block; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; font-size: 10px; margin-bottom: 2px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 22px; }
    .sum-card { border: 2px solid; border-radius: 8px; padding: 14px 12px; text-align: center; }
    .sum-count { font-size: 38px; font-weight: 900; line-height: 1; }
    .sum-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-top: 5px; font-family: sans-serif; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 13px; }
    thead { background: #1e3a5f; color: #fff; }
    thead th { padding: 9px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-family: sans-serif; }
    .sig-section { margin-top: 10px; border-top: 2px solid #1e3a5f; padding-top: 18px; }
    .sig-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 14px; font-family: sans-serif; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 32px; }
    .sig-line { border-bottom: 1px solid #374151; height: 34px; margin-bottom: 5px; }
    .sig-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-family: sans-serif; }
    .report-footer { text-align: center; font-size: 10px; color: #9ca3af; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 10px; font-family: sans-serif; }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="print-btn" onclick="window.print()">&#128438; Print / Save as PDF</button>
    <button class="close-btn" onclick="window.close()">Close</button>
    <span style="margin-left:14px;color:#6b7280;font-size:13px;">Tip: Choose &ldquo;Save as PDF&rdquo; in your print dialog to keep a digital copy.</span>
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

    <table>
      <thead>
        <tr>
          <th style="width:32px;">#</th>
          <th style="min-width:140px;">Label File / Beverage Type</th>
          <th style="min-width:110px;">Brand Name</th>
          <th style="width:72px;text-align:center;">Result</th>
          <th>Compliance Issues</th>
          <th style="min-width:140px;">Reviewer Comment</th>
        </tr>
      </thead>
      <tbody>
        ${labelRows}
      </tbody>
    </table>

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
