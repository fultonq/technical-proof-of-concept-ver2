import React, { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  UploadCloud, FileImage, Layers, Loader2, X, Plus, AlertCircle, Tag,
  CheckCircle, Wand2, FileText, RefreshCw, FlipHorizontal, TableProperties,
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, StopCircle,
  Download, Printer, ExternalLink, FolderOpen, ChevronRight, ImageOff, Minus,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/hooks/use-toast";
import { LabelAnalysisResult } from "@workspace/api-client-react";
import { useGetSessionResults, getGetSessionResultsQueryKey } from "@workspace/api-client-react";
import { parseLabelCSV, rowToLabelText, type CsvLabelRow } from "@/lib/csv-label";
import { exportSessionToCSV } from "@/lib/csv-export";
import { generatePrintReport } from "@/lib/print-report";
import { saveSession, getOrCreateActiveSessionId, resetActiveSessionId } from "@/lib/session-history";
import { saveThumbnail, saveFullImage, fileToResizedDataUrl, svgToThumbnailDataUrl, getThumbnail, getFullImage } from "@/lib/label-thumbnails";
import { getSessionReviewActions, DECISION_LABELS } from "@/lib/review-actions";

// ── Types ──────────────────────────────────────────────────────────────────────

interface QueuedFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "complete" | "error";
  error?: string;
  result?: LabelAnalysisResult;
}

interface CsvRowState extends CsvLabelRow {
  rowId: string;
  status: "pending" | "generating" | "checking" | "complete" | "error";
  error?: string;
  result?: LabelAnalysisResult;
  svgPreview?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function svgToBlob(svg: string, width = 600, height = 900): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas not available")); return; }
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => { URL.revokeObjectURL(url); if (blob) resolve(blob); else reject(new Error("Canvas export failed")); }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG image load failed")); };
    img.src = url;
  });
}

function StatusDot({ status }: { status: CsvRowState["status"] }) {
  if (status === "pending")    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />;
  if (status === "generating") return <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />;
  if (status === "checking")   return <Loader2 className="w-4 h-4 animate-spin text-review shrink-0" />;
  if (status === "complete")   return <CheckCircle2 className="w-4 h-4 text-pass shrink-0" />;
  if (status === "error")      return <AlertCircle className="w-4 h-4 text-fail shrink-0" />;
  return null;
}

function RowStatusLabel({ status }: { status: CsvRowState["status"] }) {
  if (status === "pending")    return <span className="text-xs text-muted-foreground font-semibold">Waiting</span>;
  if (status === "generating") return <span className="text-xs text-primary font-semibold">Generating…</span>;
  if (status === "checking")   return <span className="text-xs text-review font-semibold">Checking…</span>;
  if (status === "error")      return <span className="text-xs text-fail font-semibold">Error</span>;
  return null;
}

function splitFrontBack(text: string): { front: string; back: string | null } {
  const frontRe = /^[^\n]*FRONT\s+LABEL[^:\n]*:?\s*$/im;
  const backRe  = /^[^\n]*BACK\s+LABEL[^:\n]*:?\s*$/im;
  const frontMatch = frontRe.exec(text);
  const backMatch  = backRe.exec(text);
  if (!frontMatch && !backMatch) return { front: text.trim(), back: null };
  const frontLineEnd = frontMatch ? frontMatch.index + frontMatch[0].length : 0;
  const backLineEnd  = backMatch  ? backMatch.index  + backMatch[0].length  : text.length;
  const frontContent = text.slice(frontLineEnd, backMatch ? backMatch.index : text.length).trim();
  const backContent  = backMatch ? text.slice(backLineEnd).trim() : null;
  return { front: frontContent || text.trim(), back: backContent || null };
}

function mapCsvBeverageType(raw: string): string | undefined {
  const l = raw.toLowerCase();
  if (l.includes("wine")) return "WINE";
  if (l.includes("spirit") || l.includes("distilled")) return "SPIRITS";
  if (l.includes("malt") || l.includes("beer") || l.includes("ale") || l.includes("lager")) return "MALT";
  return undefined;
}

function OverallBadge({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "PASS")   return <span className="text-[11px] font-black px-2 py-0.5 rounded bg-pass text-pass-foreground">PASS</span>;
  if (status === "FAIL")   return <span className="text-[11px] font-black px-2 py-0.5 rounded bg-fail text-fail-foreground">FAIL</span>;
  return <span className="text-[11px] font-black px-2 py-0.5 rounded bg-review text-review-foreground">REVIEW</span>;
}

// ── CSV Row Detail Modal ───────────────────────────────────────────────────────

function CsvRowDetailModal({ row, sessionId, onClose }: { row: CsvRowState | null; sessionId: string; onClose: () => void }) {
  const [, setLocation] = useLocation();
  if (!row || !row.result) return null;
  const r = row.result;
  const errorCount = r.flags.filter(f => f.severity === "ERROR").length;
  const warnCount  = r.flags.filter(f => f.severity === "WARNING").length;
  const fieldRows = [
    { label: "Brand Name",      extracted: r.brandName.extractedValue,     status: r.brandName.matchStatus },
    { label: "Class / Type",    extracted: r.classType.extractedValue,      status: r.classType.matchStatus },
    { label: "Alcohol Content", extracted: r.alcoholContent.extractedValue, status: r.alcoholContent.matchStatus },
    { label: "Net Contents",    extracted: r.netContents.extractedValue,    status: r.netContents.matchStatus },
    { label: "Govt. Warning",   extracted: r.governmentWarning.extractedValue ? "Present" : null, status: r.governmentWarning.matchStatus },
    { label: "Bottler/Producer",extracted: r.bottlerProducer.extractedValue,status: r.bottlerProducer.matchStatus },
    ...(r.countryOfOrigin      ? [{ label: "Country of Origin",  extracted: r.countryOfOrigin.extractedValue,    status: r.countryOfOrigin.matchStatus }]    : []),
    ...(r.appellationOfOrigin  ? [{ label: "Appellation",        extracted: r.appellationOfOrigin.extractedValue,status: r.appellationOfOrigin.matchStatus }] : []),
    ...(r.sulfiteDeclaration   ? [{ label: "Sulfite Declaration",extracted: r.sulfiteDeclaration.extractedValue, status: r.sulfiteDeclaration.matchStatus }]  : []),
  ];
  const statusColor = r.overallStatus === "PASS" ? "bg-pass/10 border-pass/30 text-pass"
    : r.overallStatus === "FAIL" ? "bg-fail/10 border-fail/30 text-fail"
    : "bg-review/10 border-review/30 text-review";
  const fieldStatusColor = (s: string) => s === "PASS" ? "text-pass" : s === "FAIL" ? "text-fail" : s === "NEEDS_REVIEW" ? "text-review" : "text-muted-foreground";

  return (
    <Dialog open={!!row} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-start justify-between gap-4 pr-6">
            <div>
              <DialogTitle className="text-xl font-bold">{row.brandName || "Label Detail"}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{row.classType || row.beverageType}</p>
            </div>
            <span className={`text-sm font-black px-3 py-1 rounded-full border ${statusColor}`}>{r.overallStatus}</span>
          </div>
        </DialogHeader>
        <div className="flex gap-6 p-6">
          {row.svgPreview && (
            <div className="shrink-0 w-52">
              <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(row.svgPreview)}`} alt={`Generated label`} className="w-full rounded-lg border border-border shadow object-contain bg-white" />
              <p className="text-xs text-muted-foreground text-center mt-1.5">AI-generated label</p>
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-5">
            <div className={`rounded-lg px-4 py-3 flex items-center gap-3 border ${statusColor}`}>
              {r.overallStatus === "PASS"   && <CheckCircle2 className="w-5 h-5 text-pass shrink-0" />}
              {r.overallStatus === "FAIL"   && <XCircle className="w-5 h-5 text-fail shrink-0" />}
              {r.overallStatus === "REVIEW" && <Clock className="w-5 h-5 text-review shrink-0" />}
              <div>
                <p className="font-bold text-sm">
                  {r.overallStatus === "PASS"   && "All mandatory fields pass — label is compliant"}
                  {r.overallStatus === "FAIL"   && `${errorCount} compliance error${errorCount !== 1 ? "s" : ""}${warnCount > 0 ? `, ${warnCount} warning${warnCount !== 1 ? "s" : ""}` : ""}`}
                  {r.overallStatus === "REVIEW" && `Needs human review${warnCount > 0 ? ` — ${warnCount} item${warnCount !== 1 ? "s" : ""} flagged` : ""}`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Confidence: {Math.round(r.confidenceScore * 100)}% · {r.beverageType}</p>
              </div>
            </div>
            {r.flags.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Issues ({r.flags.length})</p>
                <ul className="space-y-1.5">
                  {r.flags.map((f, i) => (
                    <li key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${f.severity === "ERROR" ? "bg-fail/5 border border-fail/20" : "bg-review/5 border border-review/20"}`}>
                      <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${f.severity === "ERROR" ? "text-fail" : "text-review"}`} />
                      <span>{f.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Field Breakdown</p>
              <div className="border rounded-lg overflow-hidden divide-y text-sm">
                {fieldRows.map(({ label, extracted, status }) => (
                  <div key={label} className="grid grid-cols-[152px_1fr_96px] gap-2 px-3 py-2 hover:bg-secondary/20">
                    <span className="text-muted-foreground font-medium truncate">{label}</span>
                    <span className="truncate text-foreground">{extracted ?? <span className="text-muted-foreground italic">Not found</span>}</span>
                    <span className={`text-right text-[11px] font-black ${fieldStatusColor(status)}`}>{status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-between items-center border-t pt-4">
          <button className="text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={onClose}>Close</button>
          <Button onClick={() => { onClose(); setLocation(`/results/${sessionId}/${r.labelId}`); }}>
            <ExternalLink className="w-4 h-4 mr-2" /> Open Full Report
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Image Dropzone ─────────────────────────────────────────────────────────────

function ImageDropzone({ label, sublabel, file, onFile, isUploading, optional = false }: {
  label: string; sublabel: string; file: File | null;
  onFile: (f: File) => void; isUploading: boolean; optional?: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`border-4 border-dashed rounded-2xl transition-colors cursor-pointer ${isDragOver ? "border-primary bg-primary/5" : file ? "border-pass bg-pass/5" : optional ? "border-border/50 bg-secondary/10 hover:border-border hover:bg-secondary/20" : "border-border bg-secondary/20 hover:border-primary/50 hover:bg-secondary/40"}`}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      onClick={() => !isUploading && ref.current?.click()}
    >
      <div className="flex flex-col items-center justify-center p-6 text-center min-h-[160px]">
        {file ? (
          <>
            <CheckCircle className="w-8 h-8 text-pass mb-2" />
            <p className="text-sm font-bold text-foreground mb-0.5 truncate max-w-full px-2">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            {!isUploading && <p className="text-xs text-muted-foreground mt-1.5">Click to change</p>}
          </>
        ) : (
          <>
            <div className={`rounded-full p-2.5 shadow border mb-2 ${optional ? "bg-secondary" : "bg-background"}`}>
              <UploadCloud className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-bold text-sm mb-0.5">{label}</p>
            <p className="text-xs text-muted-foreground">{sublabel}</p>
            {optional && <span className="mt-1.5 text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full font-medium">Optional</span>}
          </>
        )}
      </div>
      <input type="file" ref={ref} className="hidden" accept="image/jpeg,image/png,image/webp"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); if (ref.current) ref.current.value = ""; }} />
    </div>
  );
}

// ── Mode Card Row ──────────────────────────────────────────────────────────────

type Mode = "single" | "batch" | "generate" | "csv";

const MODE_META: Record<Mode, { icon: React.ReactNode; title: string; subtitle: string }> = {
  single:   { icon: <FileImage className="w-5 h-5" />,      title: "Upload One Image",              subtitle: "Single label photo (+ optional back)" },
  batch:    { icon: <Layers className="w-5 h-5" />,         title: "Upload Several Images or ZIP",  subtitle: "Batch queue — all results in one session" },
  generate: { icon: <Wand2 className="w-5 h-5" />,          title: "Paste Label Text",              subtitle: "AI generates an image, then checks it" },
  csv:      { icon: <TableProperties className="w-5 h-5" />, title: "Upload CSV File",              subtitle: "Bulk import from applications.csv" },
};

// ── Recent Results Panel ───────────────────────────────────────────────────────

function RecentResultsPanel({ sessionId }: { sessionId: string }) {
  const { data, isLoading, isError } = useGetSessionResults(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionResultsQueryKey(sessionId) },
  });

  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [fullImages, setFullImages]  = useState<Record<string, string>>({});
  const [lightbox, setLightbox]      = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    const thumbMap: Record<string, string> = {};
    const fullMap: Record<string, string>  = {};
    for (const r of data.results) {
      const t = getThumbnail(r.labelId);  if (t) thumbMap[r.labelId] = t;
      const f = getFullImage(r.labelId);  if (f) fullMap[r.labelId]  = f;
    }
    setThumbnails(thumbMap);
    setFullImages(fullMap);
  }, [data]);

  const [reviewActions, setReviewActions] = useState<Record<string, any>>({});
  useEffect(() => {
    if (!data) return;
    const ids = data.results.map(r => r.labelId);
    setReviewActions(getSessionReviewActions(ids));
  }, [data]);

  const otherCount = data
    ? data.totalCount - data.passCount - data.failCount - data.reviewCount
    : 0;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading results…</p>
      </div>
    );
  }

  if (isError || !data || data.totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-center px-4">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-1">
          <FolderOpen className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="font-semibold text-base">No results yet</p>
        <p className="text-sm text-muted-foreground">Check a label to see your results here.</p>
      </div>
    );
  }

  const createdDate = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="flex flex-col h-full">
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setLightbox(null)}>
          <div className="relative bg-white rounded-xl shadow-2xl p-3 max-w-xs w-full mx-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)} className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-bold">✕</button>
            <img src={lightbox.src} alt={lightbox.alt} className="w-full rounded-lg object-contain max-h-[60vh]" />
          </div>
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {[
          { icon: <CheckCircle2 className="w-5 h-5 text-pass" />, count: data.passCount, label: "Meets requirements", cls: "border-pass/30 bg-pass/5" },
          { icon: <XCircle className="w-5 h-5 text-fail" />,      count: data.failCount, label: "Does not meet",      cls: "border-fail/30 bg-fail/5" },
          { icon: <Clock className="w-5 h-5 text-review" />,     count: data.reviewCount, label: "Agent review needed", cls: "border-review/30 bg-review/5" },
          { icon: <Minus className="w-5 h-5 text-muted-foreground" />, count: otherCount, label: "Not alcohol label", cls: "border-border bg-muted/20" },
        ].map(({ icon, count, label, cls }) => (
          <div key={label} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${cls}`}>
            {icon}
            <div>
              <p className="text-xl font-black tabular-nums leading-none">{count}</p>
              <p className="text-[11px] font-medium text-muted-foreground mt-0.5 leading-tight">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Results table */}
      <div className="flex-1 border border-border rounded-xl overflow-hidden bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="px-2.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-10">Img</th>
              <th className="px-2.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Label</th>
              <th className="px-2.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-2.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Result</th>
              <th className="px-2.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.results.slice(0, 8).map(result => {
              const action = reviewActions[result.labelId] ?? null;
              return (
                <tr key={result.labelId} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-2 py-2">
                    {thumbnails[result.labelId] ? (
                      <button onClick={() => setLightbox({ src: fullImages[result.labelId] ?? thumbnails[result.labelId], alt: result.fileName })}>
                        <img src={thumbnails[result.labelId]} alt="" className="h-10 w-7 object-contain rounded border border-border bg-white shadow-sm hover:scale-105 transition-transform cursor-zoom-in" />
                      </button>
                    ) : (
                      <div className="h-10 w-7 flex items-center justify-center rounded border border-border bg-muted text-muted-foreground/40">
                        <ImageOff className="w-3 h-3" />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 max-w-[120px]">
                    <p className="font-semibold text-foreground truncate text-xs" title={result.fileName}>{result.fileName}</p>
                    {result.brandName.extractedValue
                      ? <span className="text-[11px] text-muted-foreground font-mono truncate block">{result.brandName.extractedValue}</span>
                      : <span className="text-[11px] text-muted-foreground italic">Unknown</span>}
                  </td>
                  <td className="px-2 py-2">
                    <span className="text-[11px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                      {result.beverageType ?? "—"}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge status={result.overallStatus} className="text-[10px] px-1.5 py-0.5" />
                    {action && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{(DECISION_LABELS as Record<string, string>)[action.decision]}</p>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Link href={`/results/${sessionId}/${result.labelId}`}>
                      <Button size="sm" variant="outline" className="text-[11px] h-7 px-2 font-semibold">
                        Review
                      </Button>
                    </Link>
                  </td>
                </tr>
              );
            })}
            {data.results.length > 8 && (
              <tr>
                <td colSpan={5} className="px-3 py-2 text-center text-xs text-muted-foreground">
                  +{data.results.length - 8} more — view all results
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{createdDate} · {data.totalCount} label{data.totalCount !== 1 ? "s" : ""}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5"
            onClick={() => exportSessionToCSV(data.results, `ttb-summary.csv`)}>
            <Download className="w-3 h-3 mr-1" /> Download Summary
          </Button>
          <Link href="/all-results">
            <button className="text-xs text-primary font-semibold hover:underline">View All Results →</button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode | null>(null);

  // ── Single-file mode ──────────────────────────────────────────────────────
  const [singleFile, setSingleFile]               = useState<File | null>(null);
  const [backFile, setBackFile]                   = useState<File | null>(null);
  const [showBackLabel, setShowBackLabel]         = useState(false);
  const [expectedBrandName, setExpectedBrandName] = useState("");
  const [selectedBeverageType, setSelectedBeverageType] = useState("");
  const [isUploading, setIsUploading]             = useState(false);

  // ── Batch image mode ──────────────────────────────────────────────────────
  const [batchQueue, setBatchQueue]   = useState<QueuedFile[]>([]);
  const [activeSessionId, setActiveSessionId] = useState(() => getOrCreateActiveSessionId());
  const [isDragOver, setIsDragOver]   = useState(false);
  const batchFileRef                  = useRef<HTMLInputElement>(null);

  // ── Generate mode ─────────────────────────────────────────────────────────
  const [labelText, setLabelText]             = useState("");
  const [isGenerating, setIsGenerating]       = useState(false);
  const [generatedSvg, setGeneratedSvg]       = useState<string | null>(null);
  const [generatedBackSvg, setGeneratedBackSvg] = useState<string | null>(null);
  const [isCheckingGenerated, setIsCheckingGenerated] = useState(false);
  const textFileRef                           = useRef<HTMLInputElement>(null);

  // ── CSV import mode ───────────────────────────────────────────────────────
  const [csvRows, setCsvRows]               = useState<CsvRowState[]>([]);
  const [csvFileName, setCsvFileName]       = useState<string | null>(null);
  const [isCsvProcessing, setIsCsvProcessing] = useState(false);
  const [expandedRow, setExpandedRow]       = useState<string | null>(null);
  const [modalRow, setModalRow]             = useState<CsvRowState | null>(null);
  const csvFileRef                          = useRef<HTMLInputElement>(null);
  const abortControllerRef                  = useRef<AbortController | null>(null);
  const cancelRef                           = useRef(false);
  const [batchSize, setBatchSize]           = useState<number | null>(5);
  const [processingProgress, setProcessingProgress] = useState<{
    current: number; total: number; phase: "generating" | "checking";
  } | null>(null);

  // ── Single upload ─────────────────────────────────────────────────────────
  const uploadSingle = async () => {
    if (!singleFile) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", singleFile);
      formData.append("sessionId", activeSessionId);
      if (showBackLabel && backFile) formData.append("backFile", backFile);
      if (expectedBrandName.trim()) formData.append("expectedBrandName", expectedBrandName.trim());
      if (selectedBeverageType) formData.append("expectedBeverageType", selectedBeverageType);
      const res = await fetch("/api/v1/labels/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed — please try again.");
      const data: LabelAnalysisResult = await res.json();
      fileToResizedDataUrl(singleFile, 120).then(url => saveThumbnail(data.labelId, url)).catch(() => {});
      fileToResizedDataUrl(singleFile, 600).then(url => saveFullImage(data.labelId, url)).catch(() => {});
      saveSession({ sessionId: activeSessionId, type: "single", labelCount: 1, fileName: singleFile.name });
      setLocation(`/results/${activeSessionId}`);
    } catch (err: any) {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  // ── Batch upload ──────────────────────────────────────────────────────────
  const uploadBatch = async () => {
    const pending = batchQueue.filter(f => f.status === "pending" || f.status === "error");
    if (!pending.length) return;
    setIsUploading(true);
    for (const qf of pending) {
      setBatchQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "uploading" } : f));
      try {
        const formData = new FormData();
        formData.append("file", qf.file);
        formData.append("sessionId", activeSessionId);
        const res = await fetch("/api/v1/labels/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Failed to process " + qf.file.name);
        const data: LabelAnalysisResult = await res.json();
        fileToResizedDataUrl(qf.file, 120).then(url => saveThumbnail(data.labelId, url)).catch(() => {});
        fileToResizedDataUrl(qf.file, 600).then(url => saveFullImage(data.labelId, url)).catch(() => {});
        setBatchQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "complete", result: data } : f));
      } catch (err: any) {
        setBatchQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "error", error: err.message } : f));
      }
    }
    setIsUploading(false);
    const completedCount = batchQueue.filter(f => f.status === "complete").length + pending.filter(f => f.status !== "error").length;
    saveSession({ sessionId: activeSessionId, type: "batch", labelCount: completedCount });
    setLocation(`/results/${activeSessionId}`);
  };

  // ── Generate mode ─────────────────────────────────────────────────────────
  const handleTextFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setLabelText(ev.target?.result as string); setGeneratedSvg(null); setGeneratedBackSvg(null); };
    reader.readAsText(file);
    if (textFileRef.current) textFileRef.current.value = "";
  };

  const generateLabel = async () => {
    if (!labelText.trim()) return;
    setIsGenerating(true);
    setGeneratedSvg(null);
    setGeneratedBackSvg(null);
    try {
      const callGenerate = async (text: string): Promise<string> => {
        const res = await fetch("/api/v1/labels/generate-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ labelText: text }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || "Generation failed"); }
        const data = await res.json();
        return data.svg as string;
      };
      const { front, back } = splitFrontBack(labelText);
      const frontSvg = await callGenerate(front);
      setGeneratedSvg(frontSvg);
      if (back) {
        const backSvg = await callGenerate(back);
        setGeneratedBackSvg(backSvg);
      }
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const checkGeneratedLabel = async () => {
    if (!generatedSvg) return;
    setIsCheckingGenerated(true);
    try {
      const frontBlob = await svgToBlob(generatedSvg);
      const formData  = new FormData();
      formData.append("file", frontBlob, "generated-label-front.png");
      formData.append("sessionId", activeSessionId);
      if (generatedBackSvg) {
        const backBlob = await svgToBlob(generatedBackSvg);
        formData.append("backFile", backBlob, "generated-label-back.png");
      }
      const res = await fetch("/api/v1/labels/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Compliance check failed");
      const data: LabelAnalysisResult = await res.json();
      saveThumbnail(data.labelId, svgToThumbnailDataUrl(generatedSvg));
      saveSession({ sessionId: activeSessionId, type: "generate", labelCount: 1 });
      setLocation(`/results/${activeSessionId}`);
    } catch (err: any) {
      toast({ title: "Check failed", description: err.message, variant: "destructive" });
    } finally {
      setIsCheckingGenerated(false);
    }
  };

  // ── CSV import ────────────────────────────────────────────────────────────
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseLabelCSV(text);
      if (rows.length === 0) {
        toast({ title: "No rows found", description: "The CSV appears to be empty or has an unrecognised format.", variant: "destructive" });
        return;
      }
      setCsvRows(rows.map((r, i) => ({ ...r, rowId: `row-${i}-${Date.now()}`, status: "pending" })));
      setExpandedRow(null);
    };
    reader.readAsText(file);
    if (csvFileRef.current) csvFileRef.current.value = "";
  };

  const processCsvRows = async (limit: number | null = null) => {
    const allPending = csvRows.filter(r => r.status === "pending" || r.status === "error");
    const pending    = limit !== null ? allPending.slice(0, limit) : allPending;
    if (!pending.length) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    cancelRef.current = false;
    setIsCsvProcessing(true);
    for (let i = 0; i < pending.length; i++) {
      const row = pending[i];
      if (cancelRef.current) break;
      setProcessingProgress({ current: i + 1, total: pending.length, phase: "generating" });
      setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "generating" } : r));
      let svg: string;
      try {
        const text = rowToLabelText(row);
        const res = await fetch("/api/v1/labels/generate-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labelText: text }), signal: controller.signal });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || "Image generation failed"); }
        const data = await res.json(); svg = data.svg as string;
        setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, svgPreview: svg } : r));
      } catch (err: any) {
        if (err.name === "AbortError") { setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "pending" } : r)); break; }
        setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "error", error: `Image generation: ${err.message}` } : r));
        continue;
      }
      if (cancelRef.current) { setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "pending", svgPreview: undefined } : r)); break; }
      setProcessingProgress({ current: i + 1, total: pending.length, phase: "checking" });
      setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "checking" } : r));
      try {
        const blob = await svgToBlob(svg);
        const formData = new FormData();
        formData.append("file", blob, `${row.applicationId || row.brandName || "label"}.png`);
        formData.append("sessionId", activeSessionId);
        const apiType = mapCsvBeverageType(row.beverageType);
        if (apiType) formData.append("expectedBeverageType", apiType);
        const res = await fetch("/api/v1/labels/upload", { method: "POST", body: formData, signal: controller.signal });
        if (!res.ok) throw new Error("Compliance check failed");
        const result: LabelAnalysisResult = await res.json();
        saveThumbnail(result.labelId, svgToThumbnailDataUrl(svg));
        setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "complete", result } : r));
      } catch (err: any) {
        if (err.name === "AbortError") { setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "pending", svgPreview: undefined } : r)); break; }
        setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "error", error: `Compliance check: ${err.message}` } : r));
      }
    }
    abortControllerRef.current = null;
    cancelRef.current = false;
    setProcessingProgress(null);
    setIsCsvProcessing(false);
  };

  const allCsvDone        = csvRows.length > 0 && csvRows.every(r => r.status === "complete" || r.status === "error");
  const csvCompleteCount  = csvRows.filter(r => r.status === "complete").length;
  const csvErrorCount     = csvRows.filter(r => r.status === "error").length;
  const csvPendingCount   = csvRows.filter(r => r.status === "pending" || r.status === "error").length;

  const handleCancelImport = () => {
    cancelRef.current = true;
    abortControllerRef.current?.abort();
    if (csvCompleteCount > 0) {
      setLocation(`/results/${activeSessionId}`);
    } else {
      setCsvRows([]); setCsvFileName(null); setLocation("/");
    }
  };

  const pendingBatchCount = batchQueue.filter(f => f.status === "pending" || f.status === "error").length;

  useEffect(() => {
    if (allCsvDone && csvCompleteCount > 0) {
      saveSession({ sessionId: activeSessionId, type: "csv", labelCount: csvCompleteCount, fileName: csvFileName ?? undefined });
    }
  }, [allCsvDone, csvCompleteCount, activeSessionId, csvFileName]);

  const BEVERAGE_TYPE_SHORT: Record<string, string> = {
    "Distilled Spirits": "Spirits", "Malt Beverage": "Malt", "Wine": "Wine",
  };

  // ── Check if we should immediately nav to results ─────────────────────────
  const handleNextCheck = () => {
    if (mode === "single") uploadSingle();
    else if (mode === "batch") uploadBatch();
    else if (mode === "generate" && generatedSvg) checkGeneratedLabel();
    else if (mode === "generate" && !generatedSvg) generateLabel();
    else if (mode === "csv" && allCsvDone) setLocation(`/results/${activeSessionId}`);
    else if (mode === "csv") processCsvRows(batchSize);
  };

  const canProceed = (() => {
    if (!mode) return false;
    if (mode === "single")   return !!singleFile && !isUploading;
    if (mode === "batch")    return pendingBatchCount > 0 && !isUploading;
    if (mode === "generate") return !!labelText.trim() && !isGenerating && !isCheckingGenerated;
    if (mode === "csv")      return (csvPendingCount > 0 || allCsvDone) && !isCsvProcessing;
    return false;
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex">
      <CsvRowDetailModal row={modalRow} sessionId={activeSessionId} onClose={() => setModalRow(null)} />

      {/* ── Left panel: Add Labels ─────────────────────────────────────── */}
      <div className="w-[420px] shrink-0 border-r border-border flex flex-col">

        {/* Panel header */}
        <div className="px-5 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: "hsl(var(--primary))" }}>1</span>
            <h2 className="text-base font-bold text-foreground">Add Labels</h2>
          </div>
          <p className="text-xs text-muted-foreground pl-8">Select how you want to add labels for checking</p>
        </div>

        {/* Mode cards */}
        <div className="flex-1 overflow-y-auto">
          {(["single", "batch", "generate", "csv"] as Mode[]).map((m) => {
            const meta     = MODE_META[m];
            const isActive = mode === m;
            return (
              <div key={m} className="border-b border-border last:border-b-0">
                {/* Card row */}
                <button
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors ${isActive ? "bg-primary/5" : "hover:bg-secondary/40"}`}
                  onClick={() => setMode(isActive ? null : m)}
                  disabled={isUploading || isCsvProcessing}
                >
                  <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${isActive ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}`}>
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${isActive ? "text-primary" : "text-foreground"}`}>{meta.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{meta.subtitle}</p>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isActive ? "rotate-90" : ""}`} />
                </button>

                {/* Expanded form */}
                {isActive && (
                  <div className="px-5 pb-4 pt-2 bg-secondary/20 border-t border-border/50 space-y-3">

                    {/* ── SINGLE ── */}
                    {m === "single" && (
                      <>
                        <div className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <FlipHorizontal className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <p className="font-semibold text-xs">Upload front &amp; back label</p>
                              <p className="text-[11px] text-muted-foreground">Read fields split across both sides</p>
                            </div>
                          </div>
                          <button onClick={() => { setShowBackLabel(v => !v); setBackFile(null); }} disabled={isUploading}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${showBackLabel ? "bg-primary" : "bg-muted"}`}>
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${showBackLabel ? "translate-x-3.5" : "translate-x-0"}`} />
                          </button>
                        </div>
                        {showBackLabel ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Front</p>
                              <ImageDropzone label="Front label" sublabel="JPG, PNG, WebP" file={singleFile} onFile={setSingleFile} isUploading={isUploading} />
                            </div>
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Back</p>
                              <ImageDropzone label="Back label" sublabel="Optional" file={backFile} onFile={setBackFile} isUploading={isUploading} optional />
                            </div>
                          </div>
                        ) : (
                          <ImageDropzone label="Select or drop label photo" sublabel="JPG, PNG, or WebP" file={singleFile} onFile={setSingleFile} isUploading={isUploading} />
                        )}
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs font-semibold flex items-center gap-1.5 mb-1"><Layers className="w-3.5 h-3.5 text-muted-foreground" /> Beverage type</Label>
                            <select value={selectedBeverageType} onChange={e => setSelectedBeverageType(e.target.value)} disabled={isUploading}
                              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                              <option value="">Auto-detect</option>
                              <option value="SPIRITS">Distilled Spirits (27 CFR Part 5)</option>
                              <option value="WINE">Wine (27 CFR Part 4)</option>
                              <option value="MALT">Beer / Malt Beverage (27 CFR Part 7)</option>
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs font-semibold flex items-center gap-1.5 mb-1"><Tag className="w-3.5 h-3.5 text-muted-foreground" /> Expected brand name (optional)</Label>
                            <Input placeholder="e.g. OLD TOM DISTILLERY" value={expectedBrandName} onChange={e => setExpectedBrandName(e.target.value)} disabled={isUploading} className="h-9 text-sm font-mono" />
                          </div>
                        </div>
                        {isUploading && <div className="flex items-center gap-2 text-primary text-sm font-medium"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing with AI…</div>}
                      </>
                    )}

                    {/* ── BATCH ── */}
                    {m === "batch" && (
                      <>
                        <div
                          className={`border-2 border-dashed rounded-xl transition-colors cursor-pointer ${isDragOver ? "border-primary bg-primary/5" : "border-border bg-secondary/20 hover:border-primary/50"}`}
                          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                          onDragLeave={() => setIsDragOver(false)}
                          onDrop={e => { e.preventDefault(); setIsDragOver(false); const files = Array.from(e.dataTransfer.files || []).map(f => ({ id: Math.random().toString(36).slice(7), file: f, status: "pending" as const })); setBatchQueue(prev => [...prev, ...files]); }}
                          onClick={() => !isUploading && batchFileRef.current?.click()}
                        >
                          <div className="flex items-center justify-center gap-2 py-4 text-center">
                            <Plus className="w-5 h-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-semibold">Add label photos</p>
                              <p className="text-xs text-muted-foreground">Click or drag — multiple files OK</p>
                            </div>
                          </div>
                          <input type="file" ref={batchFileRef} className="hidden" accept="image/jpeg,image/png,image/webp" multiple
                            onChange={e => { const files = Array.from(e.target.files || []).map(f => ({ id: Math.random().toString(36).slice(7), file: f, status: "pending" as const })); setBatchQueue(prev => [...prev, ...files]); if (batchFileRef.current) batchFileRef.current.value = ""; }} />
                        </div>
                        {batchQueue.length > 0 && (
                          <div className="border border-border rounded-lg divide-y overflow-hidden bg-card">
                            {batchQueue.map((item, idx) => (
                              <div key={item.id} className="px-3 py-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <span className="text-muted-foreground font-mono text-xs w-5 text-right shrink-0">{idx + 1}.</span>
                                  <FileImage className="w-4 h-4 text-muted-foreground shrink-0" />
                                  <span className="font-medium text-xs truncate">{item.file.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {item.status === "uploading"  && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                                  {item.status === "complete"   && <CheckCircle className="w-3.5 h-3.5 text-pass" />}
                                  {item.status === "error"      && <AlertCircle className="w-3.5 h-3.5 text-fail" />}
                                  {item.status !== "uploading"  && <button onClick={() => setBatchQueue(prev => prev.filter(f => f.id !== item.id))} disabled={isUploading}><X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" /></button>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {isUploading && <div className="flex items-center gap-2 text-primary text-sm font-medium"><Loader2 className="w-4 h-4 animate-spin" /> Checking labels…</div>}
                      </>
                    )}

                    {/* ── GENERATE ── */}
                    {m === "generate" && (
                      <>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold">Label Text</Label>
                          <button onClick={() => textFileRef.current?.click()} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Upload .txt</button>
                          <input type="file" ref={textFileRef} className="hidden" accept=".txt,text/plain" onChange={handleTextFileSelect} />
                        </div>
                        <Textarea placeholder="Paste label text — FRONT LABEL: / BACK LABEL: sections work too…" value={labelText} onChange={e => { setLabelText(e.target.value); setGeneratedSvg(null); setGeneratedBackSvg(null); }} disabled={isGenerating} className="text-xs font-mono min-h-[100px] resize-y" />
                        {generatedSvg && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-pass flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> {generatedBackSvg ? "Front & back generated" : "Label image generated"}</p>
                            <div className="flex gap-2">
                              <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(generatedSvg)}`} alt="Front label" className="max-h-28 object-contain rounded border border-border shadow-sm bg-white" />
                              {generatedBackSvg && <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(generatedBackSvg)}`} alt="Back label" className="max-h-28 object-contain rounded border border-border shadow-sm bg-white" />}
                            </div>
                            <button onClick={() => { setGeneratedSvg(null); setGeneratedBackSvg(null); generateLabel(); }} disabled={isGenerating || isCheckingGenerated} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Regenerate</button>
                          </div>
                        )}
                        {(isGenerating || isCheckingGenerated) && <div className="flex items-center gap-2 text-primary text-sm font-medium"><Loader2 className="w-4 h-4 animate-spin" /> {isGenerating ? "Generating image…" : "Running compliance check…"}</div>}
                      </>
                    )}

                    {/* ── CSV ── */}
                    {m === "csv" && (
                      <>
                        {csvRows.length === 0 && (
                          <div
                            className="border-2 border-dashed border-border rounded-xl transition-colors cursor-pointer hover:border-primary/50"
                            onClick={() => csvFileRef.current?.click()}
                          >
                            <div className="flex items-center justify-center gap-2 py-4 text-center">
                              <TableProperties className="w-5 h-5 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-semibold">Click to upload CSV</p>
                                <p className="text-xs text-muted-foreground">One row per label application</p>
                              </div>
                            </div>
                            <input type="file" ref={csvFileRef} className="hidden" accept=".csv,text/csv" onChange={handleCsvFile} />
                          </div>
                        )}
                        {csvRows.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold">{csvFileName} — {csvRows.length} rows</p>
                              {!isCsvProcessing && <button onClick={() => { setCsvRows([]); setCsvFileName(null); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><X className="w-3 h-3" /> Remove</button>}
                            </div>
                            {(isCsvProcessing || allCsvDone) && (
                              <div className="h-2 bg-muted rounded-full overflow-hidden flex gap-px">
                                <div className="bg-pass transition-all" style={{ width: `${(csvCompleteCount / csvRows.length) * 100}%` }} />
                                <div className="bg-fail transition-all" style={{ width: `${(csvErrorCount / csvRows.length) * 100}%` }} />
                              </div>
                            )}
                            <div className="border border-border rounded-lg divide-y overflow-hidden bg-card max-h-44 overflow-y-auto">
                              {csvRows.map((row, idx) => (
                                <button key={row.rowId} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/20 text-left" onClick={() => setExpandedRow(expandedRow === row.rowId ? null : row.rowId)}>
                                  <StatusDot status={row.status} />
                                  <span className="text-xs font-mono text-muted-foreground w-5">{idx + 1}</span>
                                  <span className="text-xs font-semibold truncate flex-1">{row.brandName || "—"}</span>
                                  {row.status === "complete" && row.result && (
                                    <button className="cursor-pointer" onClick={e => { e.stopPropagation(); setModalRow(row); }}><OverallBadge status={row.result.overallStatus} /></button>
                                  )}
                                  {row.status !== "complete" && <RowStatusLabel status={row.status} />}
                                </button>
                              ))}
                            </div>
                            {isCsvProcessing && (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />{processingProgress ? `${processingProgress.phase === "generating" ? "Generating" : "Checking"} ${processingProgress.current}/${processingProgress.total}` : "Starting…"}</div>
                                <Button size="sm" variant="outline" className="h-7 text-xs border-fail/60 text-fail" onClick={() => { cancelRef.current = true; abortControllerRef.current?.abort(); }}><StopCircle className="w-3.5 h-3.5 mr-1" /> Stop</Button>
                              </div>
                            )}
                            {allCsvDone && !isCsvProcessing && (
                              <p className="text-xs text-muted-foreground">{csvCompleteCount} checked · {csvErrorCount > 0 ? `${csvErrorCount} error${csvErrorCount !== 1 ? "s" : ""}` : "no errors"}</p>
                            )}
                            {!isCsvProcessing && csvPendingCount > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold text-muted-foreground">Batch:</span>
                                {([1, 3, 5, 10, null] as (number | null)[]).map(n => (
                                  <button key={n ?? "all"} onClick={() => setBatchSize(n)}
                                    className={`px-2 py-0.5 rounded border text-xs font-bold ${batchSize === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"}`}>
                                    {n ?? "All"}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                  </div>
                )}
              </div>
            );
          })}

          {/* Tip callout */}
          <div className="mx-4 my-4 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
            <p className="text-xs font-bold text-primary mb-1">💡 Tip</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              For the most accurate results, upload a clear, well-lit photo. Enable front &amp; back for products that split the Government Warning across two panels.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="border-t border-border px-4 py-3 bg-card">
          <Button
            className="w-full font-bold text-sm py-2.5 h-auto"
            disabled={!canProceed}
            onClick={handleNextCheck}
          >
            {isUploading || isGenerating || isCheckingGenerated || isCsvProcessing
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</>
              : mode === "generate" && generatedSvg
              ? "Check This Label →"
              : mode === "csv" && allCsvDone
              ? "View Session Report →"
              : "Next: Check Labels →"}
          </Button>
          <button
            className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
            onClick={() => { const newId = resetActiveSessionId(); setActiveSessionId(newId); setMode(null); setSingleFile(null); setBackFile(null); setBatchQueue([]); setLabelText(""); setGeneratedSvg(null); setCsvRows([]); }}
          >
            <RefreshCw className="w-3 h-3" /> Start new session
          </button>
        </div>
      </div>

      {/* ── Right panel: Your Recent Results ──────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="px-5 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">Your Recent Results</h2>
              <p className="text-xs text-muted-foreground">Current session · <code className="text-[10px] bg-secondary px-1 rounded">{activeSessionId.slice(0, 8)}…</code></p>
            </div>
            <Link href={`/results/${activeSessionId}`}>
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1.5">
                <BarChart2 className="w-3.5 h-3.5" /> Full Report
              </Button>
            </Link>
          </div>
        </div>
        <div className="flex-1 p-5">
          <RecentResultsPanel sessionId={activeSessionId} />
        </div>
      </div>
    </div>
  );
}
