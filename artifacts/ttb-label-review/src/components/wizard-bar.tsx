import React from "react";
import { useLocation } from "wouter";
import { HelpCircle, RefreshCw } from "lucide-react";
import { resetActiveSessionId } from "@/lib/session-history";
import { Link } from "wouter";

const STEPS = [
  { number: 1, label: "Add Labels",     desc: "Upload or import" },
  { number: 2, label: "Check Details",  desc: "Review AI findings" },
  { number: 3, label: "Review Results", desc: "Approve or flag" },
];

function getActiveStep(location: string): number {
  // /results/:sessionId/:labelId — individual label detail: step 3 (Review Results)
  const parts = location.split("/").filter(Boolean);
  if (parts[0] === "results" && parts.length >= 3) return 3;
  // /all-results — aggregated view: step 3
  if (location.startsWith("/all-results")) return 3;
  // /results/:sessionId — session overview: step 2 (Check Details)
  if (parts[0] === "results" && parts.length === 2) return 2;
  // / — home / add labels: step 1
  return 1;
}

export function WizardBar() {
  const [location, setLocation] = useLocation();
  const activeStep = getActiveStep(location);

  const handleStartOver = () => {
    const newId = resetActiveSessionId();
    setLocation("/");
  };

  return (
    <div
      className="flex items-center justify-between px-6 py-3 border-b shrink-0"
      style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
    >
      {/* Steps */}
      <div className="flex items-center gap-1">
        {STEPS.map((step, idx) => {
          const isActive   = step.number === activeStep;
          const isComplete = step.number < activeStep;
          const isLast     = idx === STEPS.length - 1;

          return (
            <React.Fragment key={step.number}>
              <div className="flex items-center gap-2">
                {/* Circle */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all ${
                    isActive   ? "text-white shadow-md"      :
                    isComplete ? "text-white"                :
                                 "border-2 text-muted-foreground border-border"
                  }`}
                  style={
                    isActive   ? { background: "hsl(var(--primary))" }  :
                    isComplete ? { background: "hsl(var(--pass))" }      :
                                 {}
                  }
                >
                  {isComplete ? "✓" : step.number}
                </div>
                {/* Label */}
                <div className="hidden sm:block">
                  <p className={`text-sm leading-tight font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{step.desc}</p>
                </div>
              </div>
              {!isLast && (
                <div
                  className="w-8 h-px mx-1 shrink-0"
                  style={{ background: isComplete ? "hsl(var(--pass))" : "hsl(var(--border))" }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Link href="/help">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors">
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Need help?</span>
          </button>
        </Link>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          onClick={handleStartOver}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Start Over</span>
        </button>
      </div>
    </div>
  );
}
