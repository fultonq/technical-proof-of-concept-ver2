import React from "react";
import { HelpCircle, Upload, BarChart2, FileText, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";

export default function HelpPage() {
  return (
    <div className="flex-1 p-6 md:p-10 max-w-3xl mx-auto w-full">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <HelpCircle className="w-7 h-7 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight">Help — How to Use This Tool</h2>
        </div>
        <p className="text-lg text-muted-foreground">
          This tool checks alcohol beverage labels against TTB mandatory labeling requirements using AI.
          It is a Proof of Concept — always confirm results with official TTB guidance.
        </p>
      </div>

      <div className="space-y-8">

        <section className="space-y-3">
          <h3 className="text-xl font-bold flex items-center gap-2"><Upload className="w-5 h-5 text-primary" /> Step 1 — Add Labels</h3>
          <div className="space-y-3 text-base text-muted-foreground">
            <p><strong className="text-foreground">Upload One Image</strong> — Drag and drop or select a single label photo (JPG, PNG, or WebP). Optionally enable the front + back toggle to upload both sides of a label.</p>
            <p><strong className="text-foreground">Upload Several Images</strong> — Add multiple label photos to a queue, then submit them all at once for batch checking.</p>
            <p><strong className="text-foreground">Paste Label Text</strong> — Paste the text that should appear on the label, and the AI will generate a visual label image and run a compliance check on it.</p>
            <p><strong className="text-foreground">Upload CSV File</strong> — Import a CSV with one label application per row. The tool generates label images from each row and runs compliance checks in sequence.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xl font-bold flex items-center gap-2"><BarChart2 className="w-5 h-5 text-primary" /> Step 2 — Review Results</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: <CheckCircle2 className="w-5 h-5 text-pass" />, label: "Pass", desc: "All mandatory fields were found and meet TTB requirements." },
              { icon: <XCircle className="w-5 h-5 text-fail" />, label: "Fail", desc: "One or more required fields are missing or non-compliant." },
              { icon: <Clock className="w-5 h-5 text-review" />, label: "Needs Review", desc: "AI confidence was low — a human reviewer should verify the flagged fields." },
              { icon: <AlertCircle className="w-5 h-5 text-muted-foreground" />, label: "Not Applicable", desc: "The image does not appear to be an alcohol beverage label." },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3 bg-secondary/30 border rounded-xl p-4">
                <div className="shrink-0 mt-0.5">{icon}</div>
                <div>
                  <p className="font-bold text-base">{label}</p>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xl font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Step 3 — Take Action</h3>
          <div className="space-y-2 text-base text-muted-foreground">
            <p>Open a label's detail report to see a field-by-field breakdown and the extracted text compared to requirements.</p>
            <p><strong className="text-foreground">Mark as Approved</strong> — For labels that PASS, mark them as approved to record your decision.</p>
            <p><strong className="text-foreground">Approve with Override</strong> — For FAIL or REVIEW labels, provide a written justification to approve despite findings.</p>
            <p><strong className="text-foreground">Issue Correction Notice</strong> — Generate a pre-filled correction notice for the applicant to correct the label.</p>
            <p><strong className="text-foreground">Download Summary / Print Report</strong> — Export results as a CSV or generate a printable PDF-style report.</p>
          </div>
        </section>

        <section className="space-y-3 bg-primary/5 border border-primary/20 rounded-xl p-5">
          <h3 className="text-lg font-bold text-primary">Important Limitations</h3>
          <ul className="space-y-2 text-base text-muted-foreground list-disc pl-5">
            <li>AI extraction may miss text that is very small, low-contrast, or partially obscured. Always review the raw extracted values.</li>
            <li>This tool checks mandatory fields only — it does not check every possible TTB regulation.</li>
            <li>Results are not stored between server restarts (in-memory PoC). Export reports before closing the session.</li>
            <li>For imported labels, country-of-origin verification relies on the AI reading the image correctly.</li>
          </ul>
        </section>

      </div>
    </div>
  );
}
