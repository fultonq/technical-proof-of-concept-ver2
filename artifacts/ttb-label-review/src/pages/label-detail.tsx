import React from "react";
import { useRoute, Link } from "wouter";
import { useGetLabelResult, getGetLabelResultQueryKey } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle, Info, CheckCircle2, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function FlagIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "ERROR": return <AlertCircle className="w-5 h-5 text-fail" />;
    case "WARNING": return <AlertTriangle className="w-5 h-5 text-review" />;
    default: return <Info className="w-5 h-5 text-blue-500" />;
  }
}

export default function LabelDetailPage() {
  const [, params] = useRoute("/results/:sessionId/:labelId");
  const sessionId = params?.sessionId || "";
  const labelId = params?.labelId || "";

  const { data: result, isLoading, isError, error } = useGetLabelResult(labelId, {
    query: {
      enabled: !!labelId,
      queryKey: getGetLabelResultQueryKey(labelId),
    }
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <h2 className="text-xl font-semibold">Loading Analysis Details...</h2>
      </div>
    );
  }

  if (isError || !result) {
    return (
      <div className="flex-1 p-8 max-w-4xl mx-auto w-full">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Could not load label details. {(error as any)?.message || "Unknown error occurred."}
          </AlertDescription>
        </Alert>
        <div className="mt-6">
          <Link href={`/results/${sessionId}`}>
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const renderFieldRow = (label: string, field: any) => {
    if (!field) return null;
    return (
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-4 border-b border-border last:border-0 hover:bg-secondary/10 px-4 -mx-4 rounded-md transition-colors">
        <div className="md:col-span-3">
          <span className="font-semibold text-sm text-foreground">{label}</span>
          {field.isMandatory && <span className="ml-2 text-[10px] uppercase font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Req</span>}
        </div>
        <div className="md:col-span-4 font-mono text-sm break-words">
          {field.extractedValue || <span className="text-muted-foreground italic">Not detected</span>}
        </div>
        <div className="md:col-span-2">
          <StatusBadge status={field.matchStatus} />
        </div>
        <div className="md:col-span-3">
          <ConfidenceBar score={field.confidence} />
          {field.failReason && (
            <p className="text-xs text-fail mt-1.5 flex items-start gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{field.failReason}</span>
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col pb-20">
      {/* Header */}
      <div className="bg-card border-b border-border p-6 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Link href="/" className="hover:text-primary transition-colors flex items-center">
              Upload
            </Link>
            <ChevronRight className="w-3 h-3" />
            <Link href={`/results/${sessionId}`} className="hover:text-primary transition-colors font-mono">
              {sessionId.substring(0, 8)}...
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="font-mono truncate max-w-[200px]">{result.fileName}</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-2 break-all">{result.fileName}</h2>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={result.overallStatus} className="text-sm px-3 py-1" />
                <span className="text-sm font-medium border border-border px-2.5 py-1 rounded bg-background">
                  Type: {result.beverageType}
                </span>
                <span className="text-sm text-muted-foreground">
                  Processed in {(result.processingMs / 1000).toFixed(2)}s
                </span>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-2 bg-background p-3 rounded-lg border border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overall Confidence</span>
              <div className="w-48">
                <ConfidenceBar score={result.confidenceScore} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Details */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Extracted Fields */}
          <Card className="shadow-sm">
            <CardHeader className="border-b border-border bg-secondary/30 pb-4">
              <CardTitle>Extracted Label Data</CardTitle>
              <CardDescription>Verified against CFR Title 27 requirements</CardDescription>
            </CardHeader>
            <CardContent className="pt-2 pb-2">
              <div className="flex flex-col">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-2 border-b border-border/50 text-xs font-bold uppercase tracking-wider text-muted-foreground px-4 -mx-4">
                  <div className="md:col-span-3">Field</div>
                  <div className="md:col-span-4">Value</div>
                  <div className="md:col-span-2">Status</div>
                  <div className="md:col-span-3">Confidence</div>
                </div>
                {renderFieldRow("Brand Name", result.brandName)}
                {renderFieldRow("Class & Type", result.classType)}
                {renderFieldRow("Alcohol Content", result.alcoholContent)}
                {renderFieldRow("Net Contents", result.netContents)}
                {renderFieldRow("Bottler/Producer", result.bottlerProducer)}
                {result.countryOfOrigin && renderFieldRow("Country of Origin", result.countryOfOrigin)}
                {renderFieldRow("Language", result.labelLanguage)}
                {renderFieldRow("Prohibited Content", result.prohibitedSurface)}
              </div>
            </CardContent>
          </Card>

          {/* Government Warning Special Section */}
          <Card className={result.governmentWarning.matchStatus === "FAIL" ? "border-destructive shadow-sm" : "shadow-sm"}>
            <CardHeader className="border-b border-border bg-secondary/30 pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle>Government Warning</CardTitle>
                <CardDescription>Strict verbatim match required</CardDescription>
              </div>
              <StatusBadge status={result.governmentWarning.matchStatus} />
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {result.governmentWarning.failReason && (
                  <Alert variant="destructive" className="bg-destructive/5 border-destructive/20">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Non-compliant Text</AlertTitle>
                    <AlertDescription>{result.governmentWarning.failReason}</AlertDescription>
                  </Alert>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Detected Text</h4>
                    <div className="bg-secondary/30 p-4 rounded border font-mono text-sm min-h-[120px] whitespace-pre-wrap">
                      {result.governmentWarning.extractedValue || <span className="text-muted-foreground italic">No text detected</span>}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Required Verbatim</h4>
                    <div className="bg-primary/5 border border-primary/20 p-4 rounded font-mono text-sm min-h-[120px] whitespace-pre-wrap">
                      {result.governmentWarning.expectedValue || "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SFOV */}
          {result.sameFieldOfVision && (
            <Card className="shadow-sm">
              <CardHeader className="border-b border-border bg-secondary/30 pb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Same Field of Vision</CardTitle>
                  <CardDescription>Mandatory fields must appear together</CardDescription>
                </div>
                <StatusBadge status={result.sameFieldOfVision.compliant ? "PASS" : "FAIL"} />
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Detected on Panel</span>
                    <span className="font-medium">{result.sameFieldOfVision.detectedOnPanel || "Unknown"}</span>
                  </div>
                  {result.sameFieldOfVision.missingFromPanel.length > 0 && (
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wider text-fail mb-1">Missing from Panel</span>
                      <ul className="list-disc pl-4 text-sm font-medium">
                        {result.sameFieldOfVision.missingFromPanel.map(m => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {result.sameFieldOfVision.singleImageWarning && (
                  <Alert className="mt-4 bg-review/5 border-review/20">
                    <Info className="h-4 w-4 text-review" />
                    <AlertTitle className="text-review">Single Image Warning</AlertTitle>
                    <AlertDescription className="text-foreground">
                      Only one image was provided. Cannot definitively verify Same Field of Vision rules across multiple container faces.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

        </div>

        {/* Right Column: Flags & Actions */}
        <div className="space-y-6">
          <Card className="shadow-sm border-t-4 border-t-primary">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="flex items-center justify-between">
                <span>Compliance Flags</span>
                <span className="bg-muted px-2.5 py-0.5 rounded-full text-sm font-bold tabular-nums">
                  {result.flags.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {result.flags.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                  <CheckCircle2 className="w-12 h-12 text-pass/50 mb-3" />
                  <p className="font-medium text-foreground">No flags detected</p>
                  <p className="text-sm mt-1">Label passes all automated compliance checks.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {result.flags.map((flag, i) => (
                    <div key={i} className="p-4 flex gap-3 hover:bg-secondary/20 transition-colors">
                      <div className="mt-0.5">
                        <FlagIcon severity={flag.severity} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{flag.field}</span>
                          <StatusBadge status={flag.severity} className="text-[10px] px-1.5 py-0 scale-90 origin-left" />
                        </div>
                        <p className="text-sm text-muted-foreground leading-snug">{flag.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Evaluator Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full justify-start" variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Session
              </Button>
              <Button className="w-full justify-start bg-pass text-pass-foreground hover:bg-pass/90">
                <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as Approved
              </Button>
              <Button className="w-full justify-start bg-fail text-fail-foreground hover:bg-fail/90">
                <AlertCircle className="w-4 h-4 mr-2" /> Issue Correction Notice
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}