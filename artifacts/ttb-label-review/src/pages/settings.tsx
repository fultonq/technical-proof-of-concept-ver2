import React, { useEffect, useState } from "react";
import { Settings, Moon, Sun, Shield, Sliders, Info } from "lucide-react";

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("theme") === "dark"; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);
  return [dark, setDark] as const;
}

export default function SettingsPage() {
  const [dark, setDark] = useDarkMode();

  return (
    <div className="flex-1 p-6 md:p-10 max-w-2xl mx-auto w-full">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-7 h-7 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        </div>
        <p className="text-lg text-muted-foreground">
          Preferences and system information for the TTB Label Review tool.
        </p>
      </div>

      <div className="space-y-6">

        {/* Appearance */}
        <section className="border rounded-xl p-5 space-y-4">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Sun className="w-4 h-4 text-primary" />
            Appearance
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Dark mode</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Switch between light and dark colour themes. Your preference is saved in the browser.
              </p>
            </div>
            <button
              onClick={() => setDark(!dark)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${dark ? "bg-primary" : "bg-muted"}`}
              role="switch"
              aria-checked={dark}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${dark ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Sun className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Light</span>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">Dark</span>
            <Moon className="w-4 h-4 text-muted-foreground" />
          </div>
        </section>

        {/* Compliance engine */}
        <section className="border rounded-xl p-5 space-y-4">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" />
            Compliance Engine Thresholds
          </h3>
          <p className="text-xs text-muted-foreground">
            These values are set in the compliance engine and are shown here for reference.
            Contact a developer to adjust them.
          </p>
          {[
            { label: "Global confidence threshold", value: "0.60 (60%)", desc: "Fields extracted below this confidence are escalated to NEEDS REVIEW." },
            { label: "Same-field-of-vision threshold", value: "0.75 (75%)", desc: "Spirits-only. Stricter threshold for panel layout judgements (27 CFR 5.64)." },
            { label: "Brand name fuzzy-match distance", value: "Levenshtein ≤ 3", desc: "Minor OCR noise within 3 edit operations is tolerated as a match." },
          ].map(({ label, value, desc }) => (
            <div key={label} className="flex items-start justify-between gap-4 py-2 border-t first:border-t-0">
              <div className="flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <span className="text-sm font-mono bg-secondary px-2 py-1 rounded shrink-0">{value}</span>
            </div>
          ))}
        </section>

        {/* AI model */}
        <section className="border rounded-xl p-5 space-y-4">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            AI &amp; Compliance
          </h3>
          {[
            { label: "AI extraction model", value: "claude-sonnet-4-6" },
            { label: "Extraction strategy", value: "Claude extracts; engine decides" },
            { label: "Compliance rules", value: "27 CFR Parts 4, 5 &amp; 7" },
            { label: "Session store", value: "PostgreSQL (persistent)" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between gap-4 py-2 border-t first:border-t-0">
              <p className="text-sm font-medium">{label}</p>
              <span
                className="text-sm text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: value }}
              />
            </div>
          ))}
        </section>

        {/* About */}
        <section className="border rounded-xl p-5 space-y-2">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            About
          </h3>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">TTB Label Review</strong> — Proof of Concept
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This tool uses AI to assist with alcohol beverage label compliance screening against TTB mandatory
            labeling requirements. It is a PoC and is not a substitute for official TTB review or legal advice.
            Always confirm findings with the relevant Code of Federal Regulations (27 CFR) provisions.
          </p>
        </section>

      </div>
    </div>
  );
}
