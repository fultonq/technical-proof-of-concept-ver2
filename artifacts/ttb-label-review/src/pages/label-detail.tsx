import React, { useState } from "react";
import { useRoute, Link } from "wouter";
import { useGetLabelResult, getGetLabelResultQueryKey } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle, Info, CheckCircle2, XCircle, Clock, Loader2, AlertCircle, ChevronDown, ChevronUp, Wrench, Images } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getCorrections } from "@/lib/corrections";

function FlagIcon({ severity }: { severity: string }) {
  if (severity === "ERROR") return <AlertCircle className="w-5 h-5 text-fail shrink-0" />;
  if (severity === "WARNING") return <AlertTriangle className="w-5 h-5 text-review shrink-0" />;
  return <Info className="w-5 h-5 text-blue-500 shrink-0" />;
}

// Human-readable labels for each field key. Used in the field table header column.
const FIELD_LABELS: Record<string, string> = {
  brandName: "Brand Name",
  classType: "Type of Beverage",
  alcoholContent: "Alcohol Content (ABV)",
  netContents: "Bottle / Package Size",
  bottlerProducer: "Bottler / Producer",
  countryOfOrigin: "Country of Origin",
  labelLanguage: "Label Language",
  prohibitedSurface: "Prohibited Content",
  // Wine-specific
  appellationOfOrigin: "Appellation of Origin",
  sulfiteDeclaration: "Sulfite Declaration",
};

// Human-readable beverage type names for the breadcrumb / info line.
const BEVERAGE_TYPE_LABELS: Record<string, string> = {
  SPIRITS: "Distilled Spirits (27 CFR Part 5)",
  WINE: "Wine (27 CFR Part 4)",
  MALT: "Beer / Malt Beverage (27 CFR Part 7)",
  UNKNOWN: "Unknown Beverage Type",
};

export default function LabelDetailPage() {
  const [, params] = useRoute("/results/:sessionId/:labelId");
  const sessionId = params?.sessionId || "";
  const labelId = params?.labelId || "";

  const { data: result, isLoading, isError, error } = useGetLabelResult(labelId, {
    query: { enabled: !!labelId, queryKey: getGetLabelResultQueryKey(labelId) }
  });

  const [expandedCorrection, setExpandedCorrection] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-2xl font-semibold">Loading report...</p>
      </div>
    );
  }

  if (isError || !result) {
    return (
      <div className="flex-1 p-8 max-w-3xl mx-auto w-full space-y-6">
        <Alert variant="destructive" className="text-base">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-lg font-bold">Could not load this report</AlertTitle>
          <AlertDescription>{(error as any)?.message || "Something went wrong. Please go back and try again."}</AlertDescription>
        </Alert>
        <Link href={`/results/${sessionId}`}>
          <Button size="lg" variant="outline" className="text-base"><ArrowLeft className="w-5 h-5 mr-2" /> Back to Results</Button>
        </Link>
      </div>
    );
  }

  const status = result.overallStatus;
  const flagCount = result.flags.filter(f => f.severity === "ERROR").length;
  const isWine = result.beverageType === "WINE";

  // Collect every field key that has FAIL or NEEDS_REVIEW status for the corrections panel.
  const failingFieldKeys: string[] = [];
  const coreFieldKeys = ["brandName","classType","alcoholContent","netContents","bottlerProducer","countryOfOrigin","labelLanguage","prohibitedSurface"] as const;
  for (const key of coreFieldKeys) {
    const field = result[key as keyof typeof result] as any;
    if (field && (field.matchStatus === "FAIL" || field.matchStatus === "NEEDS_REVIEW")) {
      failingFieldKeys.push(key);
    }
  }
  if (result.sameFieldOfVision && !result.sameFieldOfVision.compliant) {
    failingFieldKeys.push("sameFieldOfVision");
  }
  if (isWine) {
    if (result.appellationOfOrigin && (result.appellationOfOrigin.matchStatus === "FAIL" || result.appellationOfOrigin.matchStatus === "NEEDS_REVIEW")) {
      failingFieldKeys.push("appellationOfOrigin");
    }
    if (result.sulfiteDeclaration && (result.sulfiteDeclaration.matchStatus === "FAIL" || result.sulfiteDeclaration.matchStatus === "NEEDS_REVIEW")) {
      failingFieldKeys.push("sulfiteDeclaration");
    }
  }
  const corrections = getCorrections(failingFieldKeys);

  // All core field rows to render in the table (wine-specific appended when appropriate)
  const tableFieldKeys: string[] = [
    "brandName","classType","alcoholContent","netContents","bottlerProducer","countryOfOrigin","labelLanguage","prohibitedSurface",
    ...(isWine ? ["appellationOfOrigin","sulfiteDeclaration"] : []),
  ];

  return (
    <div className="flex-1 flex flex-col pb-20">

      {/* ── VERDICT BANNER ─────────────────────────────────── */}
      {status === "PASS" && (
        <div className="bg-pass text-pass-foreground px-6 py-8">
          <div className="max-w-5xl mx-auto flex items-center gap-5">
            <CheckCircle2 className="w-14 h-14 shrink-0" />
            <div>
              <p className="text-3xl font-black tracking-tight">This Label Passed</p>
              <p className="text-lg opacity-90 mt-1">All required TTB fields were found and are compliant. No issues detected.</p>
            </div>
          </div>
        </div>
      )}
      {status === "FAIL" && (
        <div className="bg-fail text-fail-foreground px-6 py-8">
          <div className="max-w-5xl mx-auto flex items-center gap-5">
            <XCircle className="w-14 h-14 shrink-0" />
            <div>
              <p className="text-3xl font-black tracking-tight">This Label Failed</p>
              <p className="text-lg opacity-90 mt-1">
                {flagCount > 0
                  ? `${flagCount} compliance problem${flagCount !== 1 ? "s were" : " was"} found that must be corrected before approval.`
                  : "One or more required fields are missing or do not meet TTB requirements."}
              </p>
            </div>
          </div>
        </div>
      )}
      {status === "REVIEW" && (
        <div className="bg-review text-review-foreground px-6 py-8">
          <div className="max-w-5xl mx-auto flex items-center gap-5">
            <Clock className="w-14 h-14 shrink-0" />
            <div>
              <p className="text-3xl font-black tracking-tight">Needs Human Review</p>
              <p className="text-lg opacity-90 mt-1">The AI was not fully confident on one or more fields. A human reviewer should verify the items marked below.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── BREADCRUMB + FILE NAME ──────────────────────────── */}
      <div className="bg-card border-b border-border px-6 py-5 shadow-sm">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-base text-muted-foreground mb-1">
            <Link href="/" className="hover:text-primary">Upload</Link>
            <span>/</span>
            <Link href={`/results/${sessionId}`} className="hover:text-primary">Results</Link>
            <span>/</span>
            <span className="truncate max-w-[200px] text-foreground font-medium">{result.fileName}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>Beverage type: <strong className="text-foreground">{BEVERAGE_TYPE_LABELS[result.beverageType] ?? result.beverageType}</strong></span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <Images className="w-3.5 h-3.5" />
              {(result.imagesAnalyzed ?? 1) === 2 ? "2 images (front + back)" : "1 image"}
            </span>
            <span className="text-border">·</span>
            <span>Checked in {(result.processingMs / 1000).toFixed(1)}s</span>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ──────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left: field results */}
        <div className="lg:col-span-2 space-y-8">

          {/* Field-by-field table */}
          <Card className="shadow-sm">
            <CardHeader className="border-b border-border bg-secondary/30 pb-4">
              <CardTitle className="text-xl">What We Found on This Label</CardTitle>
              <CardDescription className="text-base">Each required field and whether it passed the check.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-border/50 bg-muted/30">
                <div className="col-span-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Field</div>
                <div className="col-span-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Found on label</div>
                <div className="col-span-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Result</div>
              </div>
              {tableFieldKeys.map((key) => {
                const field = (result as any)[key];
                if (!field || typeof field !== "object" || !("matchStatus" in field)) return null;
                if (field.matchStatus === "NOT_APPLICABLE") return null;
                return (
                  <div key={key} className="grid grid-cols-12 gap-2 px-5 py-4 border-b border-border last:border-0 hover:bg-secondary/10 transition-colors items-start">
                    <div className="col-span-4">
                      <span className="font-semibold text-base text-foreground">{FIELD_LABELS[key] ?? key}</span>
                      {field.isMandatory && <span className="ml-2 text-[10px] uppercase font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Required</span>}
                      {(key === "appellationOfOrigin" || key === "sulfiteDeclaration") && (
                        <span className="ml-1 text-[10px] uppercase font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">Wine</span>
                      )}
                    </div>
                    <div className="col-span-4 font-mono text-sm break-words text-foreground">
                      {field.extractedValue || <span className="text-muted-foreground italic">Not found</span>}
                    </div>
                    <div className="col-span-4 space-y-1.5">
                      <StatusBadge status={field.matchStatus} />
                      {field.failReason && (
                        <p className="text-sm text-fail flex items-start gap-1.5 mt-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          {field.failReason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Government Warning */}
          <Card className={`shadow-sm ${result.governmentWarning.matchStatus === "FAIL" ? "border-destructive border-2" : ""}`}>
            <CardHeader className="border-b border-border bg-secondary/30 pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl">Health Warning Statement</CardTitle>
                <CardDescription className="text-base">The full government warning must appear word-for-word on every label.</CardDescription>
              </div>
              <StatusBadge status={result.governmentWarning.matchStatus} className="text-sm px-3 py-1 shrink-0" />
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {result.governmentWarning.failReason && (
                <Alert variant="destructive" className="bg-destructive/5 border-destructive/20">
                  <AlertCircle className="h-5 w-5" />
                  <AlertTitle className="text-base font-bold">Problem found</AlertTitle>
                  <AlertDescription className="text-base">{result.governmentWarning.failReason}</AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Text found on this label</p>
                  <div className="bg-secondary/30 border rounded-lg p-4 font-mono text-sm min-h-[120px] whitespace-pre-wrap leading-relaxed">
                    {result.governmentWarning.extractedValue || <span className="text-muted-foreground italic">No warning text detected</span>}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Required wording</p>
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 font-mono text-sm min-h-[120px] whitespace-pre-wrap leading-relaxed">
                    {result.governmentWarning.expectedValue || "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Same Field of Vision — SPIRITS ONLY */}
          {result.sameFieldOfVision && (
            <Card className="shadow-sm">
              <CardHeader className="border-b border-border bg-secondary/30 pb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Panel Layout Check</CardTitle>
                  <CardDescription className="text-base">
                    For distilled spirits, the brand name, ABV, and type designation must appear on the same label panel (27 CFR 5.64).
                  </CardDescription>
                </div>
                <StatusBadge status={result.sameFieldOfVision.compliant ? "PASS" : "FAIL"} className="text-sm px-3 py-1 shrink-0" />
              </CardHeader>
              <CardContent className="pt-5 space-y-3">
                {(result.sameFieldOfVision.missingFromPanel ?? []).length > 0 && (
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wider text-fail mb-2">Fields missing from the main panel</p>
                    <ul className="list-disc pl-5 text-base font-medium space-y-1">
                      {(result.sameFieldOfVision.missingFromPanel ?? []).map(m => <li key={m}>{m}</li>)}
                    </ul>
                  </div>
                )}
                {result.sameFieldOfVision.singleImageWarning && (
                  <Alert className="bg-review/5 border-review/20">
                    <Info className="h-5 w-5 text-review" />
                    <AlertTitle className="text-base font-bold text-review">Only one label image provided</AlertTitle>
                    <AlertDescription className="text-base">
                      To fully verify this requirement, upload photos of both the front and back label panels.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Wine-specific notice */}
          {isWine && (
            <Card className="shadow-sm border-primary/20">
              <CardHeader className="border-b border-border bg-primary/5 pb-4">
                <CardTitle className="text-xl text-primary">Wine-Specific Requirements</CardTitle>
                <CardDescription className="text-base">
                  Additional checks that apply under 27 CFR Part 4.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.appellationOfOrigin && result.appellationOfOrigin.matchStatus !== "NOT_APPLICABLE" && (
                    <div className="bg-secondary/20 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-base">Appellation of Origin</p>
                        <StatusBadge status={result.appellationOfOrigin.matchStatus} />
                      </div>
                      <p className="font-mono text-sm text-foreground">
                        {result.appellationOfOrigin.extractedValue || <span className="text-muted-foreground italic">Not found</span>}
                      </p>
                      {result.appellationOfOrigin.failReason && (
                        <p className="text-sm text-fail">{result.appellationOfOrigin.failReason}</p>
                      )}
                    </div>
                  )}
                  {result.sulfiteDeclaration && result.sulfiteDeclaration.matchStatus !== "NOT_APPLICABLE" && (
                    <div className="bg-secondary/20 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-base">Sulfite Declaration</p>
                        <StatusBadge status={result.sulfiteDeclaration.matchStatus} />
                      </div>
                      <p className="font-mono text-sm text-foreground">
                        {result.sulfiteDeclaration.extractedValue || <span className="text-muted-foreground italic">Not found</span>}
                      </p>
                      {result.sulfiteDeclaration.failReason && (
                        <p className="text-sm text-review">{result.sulfiteDeclaration.failReason}</p>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Country of origin is always required for wine labels — even domestic wines must state the country (27 CFR 4.32(a)(3)).
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: flags + actions */}
        <div className="space-y-6">

          {/* Problems found */}
          <Card className="shadow-sm border-t-4 border-t-primary">
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="text-xl flex items-center justify-between">
                Problems Found
                <span className={`text-base font-black px-3 py-1 rounded-full ${result.flags.length > 0 ? "bg-fail/10 text-fail" : "bg-pass/10 text-pass"}`}>
                  {result.flags.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {result.flags.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center gap-3">
                  <CheckCircle2 className="w-14 h-14 text-pass/60" />
                  <p className="text-lg font-bold text-foreground">No problems detected</p>
                  <p className="text-base text-muted-foreground">This label passed all automated compliance checks.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {result.flags.map((flag, i) => (
                    <div key={i} className="p-4 flex gap-3">
                      <FlagIcon severity={flag.severity} />
                      <div>
                        <p className="font-bold text-base text-foreground mb-0.5">{FIELD_LABELS[flag.field] ?? flag.field}</p>
                        <p className="text-base text-muted-foreground leading-snug">{flag.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* How to Fix This */}
          {corrections.length > 0 && (
            <Card className="shadow-sm border-t-4 border-t-review">
              <CardHeader className="border-b border-border pb-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-review" />
                  How to Fix This
                </CardTitle>
                <CardDescription className="text-base">
                  Step-by-step corrections for each problem found.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {corrections.map(({ key, guide }) => {
                    const isOpen = expandedCorrection === key;
                    return (
                      <div key={key}>
                        <button
                          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-secondary/20 transition-colors"
                          onClick={() => setExpandedCorrection(isOpen ? null : key)}
                        >
                          <span className="font-bold text-base text-foreground">{guide.title}</span>
                          {isOpen
                            ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" />
                            : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
                        </button>
                        {isOpen && (
                          <div className="px-5 pb-5 bg-secondary/10">
                            <ol className="space-y-3 list-none">
                              {guide.steps.map((step, i) => (
                                <li key={i} className="flex gap-3 items-start">
                                  <span className="shrink-0 w-7 h-7 rounded-full bg-review/20 text-review font-black text-sm flex items-center justify-center mt-0.5">
                                    {i + 1}
                                  </span>
                                  <p className="text-base text-foreground leading-relaxed">{step}</p>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">What to Do Next</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href={`/results/${sessionId}`}>
                <Button className="w-full justify-start text-base py-3 h-auto" variant="outline">
                  <ArrowLeft className="w-5 h-5 mr-2" /> Back to All Results
                </Button>
              </Link>
              <Button className="w-full justify-start text-base py-3 h-auto bg-pass text-pass-foreground hover:bg-pass/90">
                <CheckCircle2 className="w-5 h-5 mr-2" /> Mark as Approved
              </Button>
              <Button className="w-full justify-start text-base py-3 h-auto bg-fail text-fail-foreground hover:bg-fail/90">
                <XCircle className="w-5 h-5 mr-2" /> Issue Correction Notice
              </Button>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
