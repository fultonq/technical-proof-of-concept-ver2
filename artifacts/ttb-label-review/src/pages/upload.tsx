import React, { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  UploadCloud, FileImage, Layers, Loader2, X, Plus, AlertCircle, Tag,
  CheckCircle, Wand2, FileText, RefreshCw, FlipHorizontal, TableProperties,
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, StopCircle,
  Download, Printer, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { LabelAnalysisResult } from "@workspace/api-client-react";
import { parseLabelCSV, rowToLabelText, type CsvLabelRow } from "@/lib/csv-label";
import { exportSessionToCSV } from "@/lib/csv-export";
import { generatePrintReport } from "@/lib/print-report";

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
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas not available")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob);
        else reject(new Error("Canvas export failed"));
      }, "image/png");
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
  if (status === "generating") return <span className="text-xs text-primary font-semibold">Generating image…</span>;
  if (status === "checking")   return <span className="text-xs text-review font-semibold">Checking compliance…</span>;
  if (status === "complete") {
    return null; // result badge handles this
  }
  if (status === "error")      return <span className="text-xs text-fail font-semibold">Error</span>;
  return null;
}

// Maps the human-readable beverage_type column value from the CSV to the
// internal code the compliance engine expects (SPIRITS / WINE / MALT).
function mapCsvBeverageType(raw: string): string | undefined {
  const l = raw.toLowerCase();
  if (l.includes("wine"))                                            return "WINE";
  if (l.includes("spirit") || l.includes("distilled"))              return "SPIRITS";
  if (l.includes("malt") || l.includes("beer") || l.includes("ale") || l.includes("lager")) return "MALT";
  return undefined;
}

function OverallBadge({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "PASS") return <span className="text-[11px] font-black px-2 py-0.5 rounded bg-pass text-pass-foreground">PASS</span>;
  if (status === "FAIL") return <span className="text-[11px] font-black px-2 py-0.5 rounded bg-fail text-fail-foreground">FAIL</span>;
  return <span className="text-[11px] font-black px-2 py-0.5 rounded bg-review text-review-foreground">REVIEW</span>;
}

// ── CSV Row Detail Modal ───────────────────────────────────────────────────────

function CsvRowDetailModal({
  row,
  onClose,
}: {
  row: CsvRowState | null;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  if (!row || !row.result) return null;
  const r = row.result;

  const errorCount = r.flags.filter(f => f.severity === "ERROR").length;
  const warnCount  = r.flags.filter(f => f.severity === "WARNING").length;

  const fieldRows: Array<{ label: string; extracted: string | null | undefined; status: string }> = [
    { label: "Brand Name",        extracted: r.brandName.extractedValue,       status: r.brandName.matchStatus },
    { label: "Class / Type",      extracted: r.classType.extractedValue,        status: r.classType.matchStatus },
    { label: "Alcohol Content",   extracted: r.alcoholContent.extractedValue,   status: r.alcoholContent.matchStatus },
    { label: "Net Contents",      extracted: r.netContents.extractedValue,      status: r.netContents.matchStatus },
    { label: "Govt. Warning",     extracted: r.governmentWarning.extractedValue ? "Present" : null, status: r.governmentWarning.matchStatus },
    { label: "Bottler / Producer",extracted: r.bottlerProducer.extractedValue,  status: r.bottlerProducer.matchStatus },
    ...(r.countryOfOrigin   ? [{ label: "Country of Origin",    extracted: r.countryOfOrigin.extractedValue,    status: r.countryOfOrigin.matchStatus }]   : []),
    ...(r.appellationOfOrigin ? [{ label: "Appellation",        extracted: r.appellationOfOrigin.extractedValue,status: r.appellationOfOrigin.matchStatus }] : []),
    ...(r.sulfiteDeclaration  ? [{ label: "Sulfite Declaration", extracted: r.sulfiteDeclaration.extractedValue, status: r.sulfiteDeclaration.matchStatus }]  : []),
    ...(r.labelLanguage       ? [{ label: "Label Language",      extracted: r.labelLanguage.extractedValue,      status: r.labelLanguage.matchStatus }]        : []),
  ];

  const statusColor = r.overallStatus === "PASS" ? "bg-pass/10 border-pass/30 text-pass"
    : r.overallStatus === "FAIL" ? "bg-fail/10 border-fail/30 text-fail"
    : "bg-review/10 border-review/30 text-review";

  const fieldStatusColor = (s: string) => s === "PASS" ? "text-pass" : s === "FAIL" ? "text-fail" : s === "NEEDS_REVIEW" ? "text-review" : "text-muted-foreground";

  return (
    <Dialog open={!!row} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">

        {/* Sticky header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-start justify-between gap-4 pr-6">
            <div>
              <DialogTitle className="text-xl font-bold">{row.brandName || "Label Detail"}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{row.classType || row.beverageType}</p>
            </div>
            <span className={`text-sm font-black px-3 py-1 rounded-full border ${statusColor}`}>
              {r.overallStatus}
            </span>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex gap-6 p-6">

          {/* Left: label image */}
          {row.svgPreview && (
            <div className="shrink-0 w-52">
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(row.svgPreview)}`}
                alt={`Generated label for ${row.brandName}`}
                className="w-full rounded-lg border border-border shadow object-contain bg-white"
              />
              <p className="text-xs text-muted-foreground text-center mt-1.5">AI-generated label</p>
            </div>
          )}

          {/* Right: compliance detail */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Status summary card */}
            <div className={`rounded-lg px-4 py-3 flex items-center gap-3 border ${statusColor.replace("text-pass","").replace("text-fail","").replace("text-review","")}`}>
              {r.overallStatus === "PASS" && <CheckCircle2 className="w-5 h-5 text-pass shrink-0" />}
              {r.overallStatus === "FAIL" && <XCircle className="w-5 h-5 text-fail shrink-0" />}
              {r.overallStatus === "REVIEW" && <Clock className="w-5 h-5 text-review shrink-0" />}
              <div>
                <p className="font-bold text-sm">
                  {r.overallStatus === "PASS" && "All mandatory fields pass — label is compliant"}
                  {r.overallStatus === "FAIL" && `${errorCount} compliance error${errorCount !== 1 ? "s" : ""}${warnCount > 0 ? `, ${warnCount} warning${warnCount !== 1 ? "s" : ""}` : ""}`}
                  {r.overallStatus === "REVIEW" && `Needs human review${warnCount > 0 ? ` — ${warnCount} item${warnCount !== 1 ? "s" : ""} flagged` : ""}`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Confidence: {Math.round(r.confidenceScore * 100)}% · {r.beverageType}
                </p>
              </div>
            </div>

            {/* Flags */}
            {r.flags.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Issues ({r.flags.length})</p>
                <ul className="space-y-1.5">
                  {r.flags.map((f, i) => (
                    <li key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                      f.severity === "ERROR" ? "bg-fail/5 border border-fail/20" : "bg-review/5 border border-review/20"
                    }`}>
                      <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${f.severity === "ERROR" ? "text-fail" : "text-review"}`} />
                      <span>{f.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Field breakdown */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Field Breakdown</p>
              <div className="border rounded-lg overflow-hidden divide-y text-sm">
                {fieldRows.map(({ label, extracted, status }) => (
                  <div key={label} className="grid grid-cols-[152px_1fr_96px] gap-2 px-3 py-2 hover:bg-secondary/20">
                    <span className="text-muted-foreground font-medium truncate">{label}</span>
                    <span className="truncate text-foreground">
                      {extracted ?? <span className="text-muted-foreground italic">Not found</span>}
                    </span>
                    <span className={`text-right text-[11px] font-black ${fieldStatusColor(status)}`}>{status}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex justify-between items-center border-t pt-4">
          <button className="text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={onClose}>
            Close
          </button>
          <Button onClick={() => { onClose(); setLocation(`/labels/${r.labelId}`); }}>
            <ExternalLink className="w-4 h-4 mr-2" /> Open Full Report
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ImageDropzone({
  label, sublabel, file, onFile, isUploading, optional = false,
}: {
  label: string; sublabel: string; file: File | null;
  onFile: (f: File) => void; isUploading: boolean; optional?: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`border-4 border-dashed rounded-2xl transition-colors cursor-pointer ${
        isDragOver ? "border-primary bg-primary/5" :
        file ? "border-pass bg-pass/5" :
        optional ? "border-border/50 bg-secondary/10 hover:border-border hover:bg-secondary/20" :
        "border-border bg-secondary/20 hover:border-primary/50 hover:bg-secondary/40"
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      onClick={() => !isUploading && ref.current?.click()}
    >
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[180px]">
        {file ? (
          <>
            <CheckCircle className="w-10 h-10 text-pass mb-3" />
            <p className="text-base font-bold text-foreground mb-0.5 truncate max-w-full px-2">{file.name}</p>
            <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            {!isUploading && <p className="text-xs text-muted-foreground mt-2">Click to change</p>}
          </>
        ) : (
          <>
            <div className={`rounded-full p-3 shadow border mb-3 ${optional ? "bg-secondary" : "bg-background"}`}>
              <UploadCloud className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-bold text-base mb-0.5">{label}</p>
            <p className="text-sm text-muted-foreground">{sublabel}</p>
            {optional && <span className="mt-2 text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full font-medium">Optional</span>}
          </>
        )}
      </div>
      <input type="file" ref={ref} className="hidden" accept="image/jpeg,image/png,image/webp"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); if (ref.current) ref.current.value = ""; }} />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type Mode = "single" | "batch" | "generate" | "csv";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("single");

  // ── Single-file mode ────────────────────────────────────────────────────
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [showBackLabel, setShowBackLabel] = useState(false);
  const [expectedBrandName, setExpectedBrandName] = useState("");
  const [selectedBeverageType, setSelectedBeverageType] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // ── Batch image mode ────────────────────────────────────────────────────
  const [batchQueue, setBatchQueue] = useState<QueuedFile[]>([]);
  const [batchSessionId, setBatchSessionId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const batchFileRef = useRef<HTMLInputElement>(null);

  // ── Generate mode ───────────────────────────────────────────────────────
  const [labelText, setLabelText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null);
  const [isCheckingGenerated, setIsCheckingGenerated] = useState(false);
  const textFileRef = useRef<HTMLInputElement>(null);

  // ── CSV import mode ─────────────────────────────────────────────────────
  const [csvRows, setCsvRows] = useState<CsvRowState[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [isCsvProcessing, setIsCsvProcessing] = useState(false);
  const [csvSessionId] = useState(() => crypto.randomUUID());
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [modalRow, setModalRow] = useState<CsvRowState | null>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
  // Abort controller for the currently in-flight fetch — aborted immediately on Stop.
  const abortControllerRef = useRef<AbortController | null>(null);
  // Fallback cancel flag checked between rows (in case abort isn't enough).
  const cancelRef = useRef(false);
  // How many rows to process per "Generate" click. null = process all pending.
  const [batchSize, setBatchSize] = useState<number | null>(5);
  // Live progress within the current batch: current index (1-based) + total + phase.
  const [processingProgress, setProcessingProgress] = useState<{
    current: number; total: number; phase: "generating" | "checking";
  } | null>(null);

  // ── Single upload ───────────────────────────────────────────────────────
  const uploadSingle = async () => {
    if (!singleFile) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", singleFile);
      if (showBackLabel && backFile) formData.append("backFile", backFile);
      if (expectedBrandName.trim()) formData.append("expectedBrandName", expectedBrandName.trim());
      if (selectedBeverageType) formData.append("expectedBeverageType", selectedBeverageType);
      const res = await fetch("/api/v1/labels/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed — please try again.");
      const data: LabelAnalysisResult = await res.json();
      setLocation(`/results/${data.sessionId}`);
    } catch (err: any) {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  // ── Batch upload ────────────────────────────────────────────────────────
  const uploadBatch = async () => {
    const pending = batchQueue.filter(f => f.status === "pending" || f.status === "error");
    if (!pending.length) return;
    setIsUploading(true);
    let currentSessionId = batchSessionId;
    for (const qf of pending) {
      setBatchQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "uploading" } : f));
      try {
        const formData = new FormData();
        formData.append("file", qf.file);
        if (currentSessionId) formData.append("sessionId", currentSessionId);
        const res = await fetch("/api/v1/labels/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Failed to process " + qf.file.name);
        const data: LabelAnalysisResult = await res.json();
        if (!currentSessionId) { currentSessionId = data.sessionId; setBatchSessionId(data.sessionId); }
        setBatchQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "complete", result: data } : f));
      } catch (err: any) {
        setBatchQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "error", error: err.message } : f));
      }
    }
    setIsUploading(false);
    if (currentSessionId) setLocation(`/results/${currentSessionId}`);
  };

  // ── Generate mode ───────────────────────────────────────────────────────
  const handleTextFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setLabelText(ev.target?.result as string); setGeneratedSvg(null); };
    reader.readAsText(file);
    if (textFileRef.current) textFileRef.current.value = "";
  };

  const generateLabel = async () => {
    if (!labelText.trim()) return;
    setIsGenerating(true);
    setGeneratedSvg(null);
    try {
      const res = await fetch("/api/v1/labels/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelText: labelText.trim() }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || "Generation failed."); }
      const { svg } = await res.json();
      setGeneratedSvg(svg);
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
      const blob = await svgToBlob(generatedSvg);
      const formData = new FormData();
      formData.append("file", blob, "generated-label.png");
      const res = await fetch("/api/v1/labels/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Compliance check failed.");
      const data: LabelAnalysisResult = await res.json();
      setLocation(`/results/${data.sessionId}`);
    } catch (err: any) {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    } finally {
      setIsCheckingGenerated(false);
    }
  };

  // ── CSV import ──────────────────────────────────────────────────────────
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
      setCsvRows(rows.map((r, i) => ({
        ...r,
        rowId: `row-${i}-${Date.now()}`,
        status: "pending",
      })));
      setExpandedRow(null);
    };
    reader.readAsText(file);
    if (csvFileRef.current) csvFileRef.current.value = "";
  };

  // Process CSV rows sequentially: generate SVG → convert to PNG → compliance check.
  // limit: max number of pending rows to process in this call (null = all pending).
  const processCsvRows = async (limit: number | null = null) => {
    const allPending = csvRows.filter(r => r.status === "pending" || r.status === "error");
    const pending = limit !== null ? allPending.slice(0, limit) : allPending;
    if (!pending.length) return;

    // Fresh abort controller for this batch run — Stop clicks abort() it immediately.
    const controller = new AbortController();
    abortControllerRef.current = controller;
    cancelRef.current = false;
    setIsCsvProcessing(true);

    for (let i = 0; i < pending.length; i++) {
      const row = pending[i];

      // Honour a stop request signalled between rows
      if (cancelRef.current) break;

      // Step 1 — generate SVG label image
      setProcessingProgress({ current: i + 1, total: pending.length, phase: "generating" });
      setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "generating" } : r));
      let svg: string;
      try {
        const labelText = rowToLabelText(row);
        const res = await fetch("/api/v1/labels/generate-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ labelText }),
          signal: controller.signal,
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || "Image generation failed"); }
        const data = await res.json();
        svg = data.svg as string;
        setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, svgPreview: svg } : r));
      } catch (err: any) {
        // AbortError means the user hit Stop — reset row to pending so it can be retried.
        if (err.name === "AbortError") {
          setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "pending" } : r));
          break;
        }
        setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "error", error: `Image generation: ${err.message}` } : r));
        continue;
      }

      // Check cancel again after the slow generation step
      if (cancelRef.current) {
        setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "pending", svgPreview: undefined } : r));
        break;
      }

      // Step 2 — convert SVG → PNG then run compliance
      setProcessingProgress({ current: i + 1, total: pending.length, phase: "checking" });
      setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "checking" } : r));
      try {
        const blob = await svgToBlob(svg);
        const formData = new FormData();
        formData.append("file", blob, `${row.applicationId || row.brandName || "label"}.png`);
        formData.append("sessionId", csvSessionId);
        // NOTE: We intentionally do NOT send expectedBrandName here.
        // For AI-generated labels the brand name is provably correct (we wrote it),
        // so the Levenshtein cross-check only introduces false failures when Claude
        // Vision reads the rendered brand name with slight styling differences.
        // expectedBrandName is reserved for real label photos uploaded from the field.
        //
        // Pass the beverage type from the CSV so the compliance engine doesn't have
        // to guess from the generated image (fixes all-fail issue with CSV imports).
        const apiType = mapCsvBeverageType(row.beverageType);
        if (apiType) formData.append("expectedBeverageType", apiType);
        const res = await fetch("/api/v1/labels/upload", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Compliance check failed");
        const result: LabelAnalysisResult = await res.json();
        setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "complete", result } : r));
      } catch (err: any) {
        if (err.name === "AbortError") {
          setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "pending", svgPreview: undefined } : r));
          break;
        }
        setCsvRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, status: "error", error: `Compliance check: ${err.message}` } : r));
      }
    }

    abortControllerRef.current = null;
    cancelRef.current = false;
    setProcessingProgress(null);
    setIsCsvProcessing(false);
  };

  const allCsvDone = csvRows.length > 0 && csvRows.every(r => r.status === "complete" || r.status === "error");
  const csvCompleteCount = csvRows.filter(r => r.status === "complete").length;
  const csvErrorCount = csvRows.filter(r => r.status === "error").length;
  const csvPendingCount = csvRows.filter(r => r.status === "pending" || r.status === "error").length;
  const pendingBatchCount = batchQueue.filter(f => f.status === "pending" || f.status === "error").length;

  const BEVERAGE_TYPE_SHORT: Record<string, string> = {
    "Distilled Spirits": "Spirits",
    "Malt Beverage": "Malt",
    "Wine": "Wine",
  };

  return (
    <div className="flex-1 p-6 md:p-12 max-w-3xl mx-auto w-full">

      {/* Page heading */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Check a Label</h2>
        <p className="text-lg text-muted-foreground mt-2">
          Upload label photos or import a CSV of applications to generate and check labels automatically.
          Handles beer, wine, and distilled spirits.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex flex-wrap gap-3 mb-8">
        {(["single","batch","generate","csv"] as Mode[]).map((m) => {
          const icons: Record<Mode, React.ReactNode> = {
            single: <FileImage className="w-5 h-5" />,
            batch: <Layers className="w-5 h-5" />,
            generate: <Wand2 className="w-5 h-5" />,
            csv: <TableProperties className="w-5 h-5" />,
          };
          const labels: Record<Mode, string> = {
            single: "One Label",
            batch: "Multiple Labels",
            generate: "Generate Label Image",
            csv: "CSV Import",
          };
          return (
            <button key={m}
              onClick={() => !isUploading && !isCsvProcessing && setMode(m)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 text-base font-semibold transition-all ${mode === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50"}`}
            >
              {icons[m]}{labels[m]}
            </button>
          );
        })}
      </div>

      {/* ── ONE LABEL ──────────────────────────────────────────────────── */}
      {mode === "single" && (
        <div className="space-y-6">
          {/* Front + Back toggle */}
          <div className="flex items-center justify-between bg-secondary/30 border border-border rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <FlipHorizontal className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-semibold text-base">Upload front &amp; back label</p>
                <p className="text-sm text-muted-foreground">Enables AI to read fields split across both sides</p>
              </div>
            </div>
            <button onClick={() => { setShowBackLabel(v => !v); setBackFile(null); }} disabled={isUploading}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${showBackLabel ? "bg-primary" : "bg-muted"}`}>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${showBackLabel ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {showBackLabel ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Front Label</p>
                <ImageDropzone label="Select front label photo" sublabel="JPEG, PNG, or WebP" file={singleFile} onFile={setSingleFile} isUploading={isUploading} />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Back Label</p>
                <ImageDropzone label="Select back label photo" sublabel="JPEG, PNG, or WebP" file={backFile} onFile={setBackFile} isUploading={isUploading} optional />
              </div>
            </div>
          ) : (
            <ImageDropzone label="Click here to select your label photo" sublabel="— or drag and drop the image file onto this area —" file={singleFile} onFile={setSingleFile} isUploading={isUploading} />
          )}

          {isUploading && (
            <div className="flex items-center justify-center gap-3 text-primary font-semibold text-base py-3">
              <Loader2 className="w-5 h-5 animate-spin" /> Reading the label with AI — this takes about 10–15 seconds…
            </div>
          )}

          <div className="bg-secondary/30 border border-border rounded-xl p-5 space-y-5">
            {/* Beverage type selector */}
            <div>
              <Label htmlFor="beverageType" className="flex items-center gap-2 text-base font-semibold mb-1">
                <Layers className="w-4 h-4 text-muted-foreground" /> Beverage type
              </Label>
              <p className="text-sm text-muted-foreground mb-3">
                Select the type to ensure the correct compliance rules are applied. When in doubt, leave on Auto-detect.
              </p>
              <select
                id="beverageType"
                value={selectedBeverageType}
                onChange={(e) => setSelectedBeverageType(e.target.value)}
                disabled={isUploading}
                className="h-12 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-base font-medium ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Auto-detect</option>
                <option value="SPIRITS">Distilled Spirits (27 CFR Part 5)</option>
                <option value="WINE">Wine (27 CFR Part 4)</option>
                <option value="MALT">Beer / Malt Beverage (27 CFR Part 7)</option>
              </select>
            </div>

            {/* Brand name */}
            <div>
              <Label htmlFor="expectedBrandName" className="flex items-center gap-2 text-base font-semibold mb-1">
                <Tag className="w-4 h-4 text-muted-foreground" /> What is the brand name on this label?
              </Label>
              <p className="text-sm text-muted-foreground mb-3">Filling this in improves accuracy. Leave blank if you do not know it.</p>
              <Input id="expectedBrandName" placeholder="e.g. OLD TOM DISTILLERY" value={expectedBrandName}
                onChange={(e) => setExpectedBrandName(e.target.value)} disabled={isUploading}
                className="text-base h-12 font-mono max-w-sm" />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button size="lg" disabled={!singleFile || isUploading} onClick={uploadSingle}
              className="text-lg px-10 py-4 h-auto font-bold">
              {isUploading ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Checking…</> : "Check This Label"}
            </Button>
          </div>
        </div>
      )}

      {/* ── MULTIPLE LABELS ─────────────────────────────────────────────── */}
      {mode === "batch" && (
        <div className="space-y-6">
          <div
            className={`border-4 border-dashed rounded-2xl transition-colors cursor-pointer ${isDragOver ? "border-primary bg-primary/5" : "border-border bg-secondary/20 hover:border-primary/50"}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setIsDragOver(false);
              const newFiles = Array.from(e.dataTransfer.files || []).map(f => ({ id: Math.random().toString(36).substring(7), file: f, status: "pending" as const }));
              setBatchQueue(prev => [...prev, ...newFiles]);
            }}
            onClick={() => !isUploading && batchFileRef.current?.click()}
          >
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="bg-background rounded-full p-4 shadow border mb-4"><Plus className="w-8 h-8 text-muted-foreground" /></div>
              <p className="text-xl font-bold mb-1">Add label photos to the list</p>
              <p className="text-base text-muted-foreground">Click here or drag files — you can add multiple at once</p>
            </div>
            <input type="file" ref={batchFileRef} className="hidden" accept="image/jpeg,image/png,image/webp" multiple
              onChange={(e) => {
                const newFiles = Array.from(e.target.files || []).map(f => ({ id: Math.random().toString(36).substring(7), file: f, status: "pending" as const }));
                setBatchQueue(prev => [...prev, ...newFiles]);
                if (batchFileRef.current) batchFileRef.current.value = "";
              }} />
          </div>

          {batchQueue.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold">{batchQueue.length} label{batchQueue.length !== 1 ? "s" : ""} in the list</p>
                <Button variant="ghost" onClick={() => setBatchQueue([])} disabled={isUploading} className="text-base text-muted-foreground">Clear all</Button>
              </div>
              <div className="border-2 rounded-xl divide-y overflow-hidden bg-card">
                {batchQueue.map((item, idx) => (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="text-muted-foreground font-mono text-sm w-7 text-right shrink-0">{idx + 1}.</span>
                      <FileImage className="w-5 h-5 text-muted-foreground shrink-0" />
                      <span className="font-medium text-base truncate">{item.file.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      {item.status === "pending" && <span className="text-sm text-muted-foreground font-semibold">Waiting</span>}
                      {item.status === "uploading" && <span className="text-sm text-primary flex items-center gap-1 font-semibold"><Loader2 className="w-4 h-4 animate-spin" /> Checking…</span>}
                      {item.status === "complete" && <span className="text-sm text-pass font-bold flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Done</span>}
                      {item.status === "error" && <span className="text-sm text-fail font-bold flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Error</span>}
                      {item.status !== "uploading" && (
                        <button onClick={() => setBatchQueue(prev => prev.filter(f => f.id !== item.id))} disabled={isUploading} className="text-muted-foreground hover:text-foreground p-1 rounded"><X className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button size="lg" disabled={pendingBatchCount === 0 || isUploading} onClick={uploadBatch} className="text-lg px-10 py-4 h-auto font-bold">
              {isUploading ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Checking labels…</> : `Check ${pendingBatchCount} Label${pendingBatchCount !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}

      {/* ── GENERATE LABEL IMAGE ────────────────────────────────────────── */}
      {mode === "generate" && (
        <div className="space-y-6">
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
            <p className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" /> How this works
            </p>
            <p className="text-base text-muted-foreground leading-relaxed">
              Paste or type the label text below — or upload a <code className="text-sm bg-secondary px-1 rounded">.txt</code> file.
              AI will generate a label image from your text, then run a full compliance check on it.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Label Text</Label>
              <button onClick={() => textFileRef.current?.click()} className="flex items-center gap-1.5 text-sm text-primary font-semibold hover:underline" disabled={isGenerating}>
                <FileText className="w-4 h-4" /> Upload .txt file
              </button>
              <input type="file" ref={textFileRef} className="hidden" accept=".txt,text/plain" onChange={handleTextFileSelect} />
            </div>
            <Textarea
              placeholder={`Brand Name: OLD TOM DISTILLERY\nType: Kentucky Straight Bourbon Whiskey\nABV: 45% Alc./Vol.\nNet Contents: 750 mL\nBottled by: Old Tom Distillery, 123 Barrel St, Louisville, KY 40202\n\nGOVERNMENT WARNING: (1) According to the Surgeon General…`}
              value={labelText}
              onChange={(e) => { setLabelText(e.target.value); setGeneratedSvg(null); }}
              disabled={isGenerating}
              className="text-base min-h-64 font-mono leading-relaxed resize-y"
            />
          </div>

          {!generatedSvg && (
            <div className="flex justify-end">
              <Button size="lg" disabled={!labelText.trim() || isGenerating} onClick={generateLabel} className="text-lg px-10 py-4 h-auto font-bold">
                {isGenerating ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Generating label image…</> : <><Wand2 className="w-5 h-5 mr-3" /> Generate AI Label Image</>}
              </Button>
            </div>
          )}

          {generatedSvg && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-foreground flex items-center gap-2"><CheckCircle className="w-5 h-5 text-pass" /> Label image generated</p>
                <button onClick={() => { setGeneratedSvg(null); generateLabel(); }} disabled={isGenerating || isCheckingGenerated}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-semibold transition-colors">
                  <RefreshCw className="w-4 h-4" /> Regenerate
                </button>
              </div>
              <div className="border-2 border-border rounded-xl overflow-hidden bg-secondary/10 flex justify-center p-4">
                <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(generatedSvg)}`} alt="Generated label preview"
                  className="max-w-full max-h-[500px] object-contain rounded shadow-md" />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" size="lg" disabled={isGenerating || isCheckingGenerated} onClick={() => setGeneratedSvg(null)} className="text-base px-6 py-3 h-auto">
                  Edit Text &amp; Regenerate
                </Button>
                <Button size="lg" disabled={isCheckingGenerated} onClick={checkGeneratedLabel} className="text-lg px-10 py-4 h-auto font-bold">
                  {isCheckingGenerated ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Running compliance check…</> : "Check This Label"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CSV IMPORT ──────────────────────────────────────────────────── */}
      {mode === "csv" && (
        <div className="space-y-6">

          {/* Explainer */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
            <p className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
              <TableProperties className="w-5 h-5 text-primary" /> How CSV import works
            </p>
            <ol className="space-y-1.5 text-base text-muted-foreground list-none">
              {["Upload a CSV with one row per label application.", "We convert each row into a label layout and generate an AI image.", "The generated image is sent through the full TTB compliance engine.", "All results appear together in a single session report."].map((s, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary font-black text-sm flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-primary/10">
              Expected columns: <code className="bg-secondary px-1 rounded text-xs">application_id, brand_name, class_type, alcohol_content, net_contents, address, is_imported, country_of_origin, beverage_type, age_statement, color_ingredients, commodity_statement, sulfite_aspartame, appellation, foreign_wine_pct</code>
            </p>
          </div>

          {/* CSV file picker */}
          {csvRows.length === 0 && (
            <div
              className="border-4 border-dashed border-border bg-secondary/20 hover:border-primary/50 hover:bg-secondary/40 rounded-2xl transition-colors cursor-pointer"
              onClick={() => csvFileRef.current?.click()}
            >
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="bg-background rounded-full p-4 shadow border mb-4">
                  <TableProperties className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-xl font-bold mb-1">Click to upload your CSV file</p>
                <p className="text-base text-muted-foreground">One row per label application, header row required</p>
              </div>
              <input type="file" ref={csvFileRef} className="hidden" accept=".csv,text/csv" onChange={handleCsvFile} />
            </div>
          )}

          {/* Row preview & progress table */}
          {csvRows.length > 0 && (
            <div className="space-y-4">
              {/* Header bar */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {csvFileName} — {csvRows.length} application{csvRows.length !== 1 ? "s" : ""}
                  </p>
                  {isCsvProcessing && processingProgress && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {processingProgress.phase === "generating" ? "Generating image" : "Checking compliance"}{" "}
                      <span className="font-bold text-foreground">
                        {processingProgress.current} of {processingProgress.total}
                      </span>
                      …
                    </p>
                  )}
                  {allCsvDone && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {csvCompleteCount} checked · {csvErrorCount > 0 ? `${csvErrorCount} error${csvErrorCount !== 1 ? "s" : ""}` : "no errors"}
                    </p>
                  )}
                </div>
                {!isCsvProcessing && (
                  <button onClick={() => { setCsvRows([]); setCsvFileName(null); }}
                    className="text-sm text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1.5 transition-colors">
                    <X className="w-4 h-4" /> Remove file
                  </button>
                )}
              </div>

              {/* Progress summary bar (once processing starts) */}
              {(isCsvProcessing || allCsvDone) && csvRows.length > 0 && (
                <div className="h-2.5 bg-muted rounded-full overflow-hidden flex gap-px">
                  <div className="bg-pass transition-all duration-500" style={{ width: `${(csvCompleteCount / csvRows.length) * 100}%` }} />
                  <div className="bg-fail transition-all duration-500" style={{ width: `${(csvErrorCount / csvRows.length) * 100}%` }} />
                </div>
              )}

              {/* Row list */}
              <div className="border-2 rounded-xl divide-y overflow-hidden bg-card">
                {/* Table header */}
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/40 border-b">
                  <div className="col-span-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">#</div>
                  <div className="col-span-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Brand Name</div>
                  <div className="col-span-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Type</div>
                  <div className="col-span-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</div>
                  <div className="col-span-2 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Status</div>
                </div>

                {csvRows.map((row, idx) => {
                  const isExpanded = expandedRow === row.rowId;
                  const typeShort = BEVERAGE_TYPE_SHORT[row.beverageType] ?? row.beverageType;
                  return (
                    <div key={row.rowId}>
                      <button
                        className="w-full grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-secondary/20 transition-colors text-left"
                        onClick={() => setExpandedRow(isExpanded ? null : row.rowId)}
                        disabled={isCsvProcessing && row.status === "generating"}
                      >
                        <div className="col-span-1 flex items-center gap-1.5">
                          <StatusDot status={row.status} />
                          <span className="text-xs text-muted-foreground font-mono">{idx + 1}</span>
                        </div>
                        <div className="col-span-4 font-semibold text-sm text-foreground truncate">{row.brandName || "—"}</div>
                        <div className="col-span-3 text-sm text-muted-foreground truncate">{row.classType || "—"}</div>
                        <div className="col-span-2">
                          <span className="text-xs bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-medium">{typeShort}</span>
                        </div>
                        <div className="col-span-2 flex items-center justify-end gap-2">
                          {row.status === "complete" && row.result && (
                            <button
                              className="cursor-pointer hover:opacity-75 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); setModalRow(row); }}
                              title="Click to open compliance detail"
                            >
                              <OverallBadge status={row.result.overallStatus} />
                            </button>
                          )}
                          {row.status !== "complete" && <RowStatusLabel status={row.status} />}
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                        </div>
                      </button>

                      {/* Expanded row detail */}
                      {isExpanded && (
                        <div className="px-4 pb-4 bg-secondary/10 border-t border-border/50 space-y-3">
                          {/* Field summary */}
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 pt-3 text-sm">
                            {[
                              ["Application ID", row.applicationId],
                              ["Alcohol Content", row.alcoholContent],
                              ["Net Contents", row.netContents],
                              ["Address", row.address],
                              ["Country of Origin", row.isImported ? row.countryOfOrigin : (row.beverageType?.toLowerCase().includes("wine") ? row.countryOfOrigin || "United States" : "Domestic")],
                              ["Appellation", row.appellation],
                              ["Sulfite / Aspartame", row.sulfiteAspartame],
                              ["Age Statement", row.ageStatement],
                            ].filter(([, v]) => v).map(([k, v]) => (
                              <div key={k} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0 w-36">{k}:</span>
                                <span className="font-medium text-foreground">{v}</span>
                              </div>
                            ))}
                          </div>

                          {/* SVG preview (shown once generated) — click to open detail modal */}
                          {row.svgPreview && (
                            <div className="mt-2">
                              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Generated Label Preview</p>
                              <button
                                className="group relative block rounded border border-border shadow-sm overflow-hidden bg-white hover:border-primary/50 transition-colors cursor-zoom-in"
                                onClick={() => row.result && setModalRow(row)}
                                title={row.result ? "Click to view full compliance detail" : undefined}
                                disabled={!row.result}
                              >
                                <img
                                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(row.svgPreview)}`}
                                  alt={`Generated label for ${row.brandName}`}
                                  className="max-h-48 object-contain"
                                />
                                {row.result && (
                                  <span className="absolute bottom-1.5 right-1.5 bg-background/80 text-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    View detail
                                  </span>
                                )}
                              </button>
                            </div>
                          )}

                          {/* Error detail */}
                          {row.status === "error" && row.error && (
                            <div className="flex items-start gap-2 text-sm text-fail bg-fail/5 border border-fail/20 rounded-lg px-3 py-2">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              {row.error}
                            </div>
                          )}

                          {/* Compliance result summary */}
                          {row.status === "complete" && row.result && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                {row.result.overallStatus === "PASS" && <CheckCircle2 className="w-5 h-5 text-pass" />}
                                {row.result.overallStatus === "FAIL" && <XCircle className="w-5 h-5 text-fail" />}
                                {row.result.overallStatus === "REVIEW" && <Clock className="w-5 h-5 text-review" />}
                                <span className="font-bold text-base">
                                  {row.result.overallStatus === "PASS" && "All compliance checks passed"}
                                  {row.result.overallStatus === "FAIL" && `${row.result.flags.filter(f => f.severity === "ERROR").length} compliance problem(s) found`}
                                  {row.result.overallStatus === "REVIEW" && "Needs human review"}
                                </span>
                              </div>
                              {row.result.flags.length > 0 && (
                                <ul className="space-y-1 pl-8">
                                  {row.result.flags.slice(0, 4).map((f, i) => (
                                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                                      {f.severity === "ERROR" ? <AlertCircle className="w-3.5 h-3.5 text-fail shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 text-review shrink-0 mt-0.5" />}
                                      {f.message}
                                    </li>
                                  ))}
                                  {row.result.flags.length > 4 && <li className="text-sm text-muted-foreground pl-5">+{row.result.flags.length - 4} more — see full report</li>}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Actions ─────────────────────────────────────────────── */}
              <div className="space-y-3 pt-2">

                {/* While processing: live progress + immediate Stop */}
                {isCsvProcessing && (
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2.5 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                      <span className="text-sm font-semibold">
                        {processingProgress ? (
                          <>
                            {processingProgress.phase === "generating" ? "Generating image" : "Checking compliance"}{" "}
                            <span className="text-foreground font-black">
                              {processingProgress.current} of {processingProgress.total}
                            </span>
                            …
                          </>
                        ) : "Starting…"}
                      </span>
                    </div>
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-fail/60 text-fail hover:bg-fail/5 font-bold"
                      onClick={() => {
                        cancelRef.current = true;
                        abortControllerRef.current?.abort();
                      }}
                    >
                      <StopCircle className="w-5 h-5 mr-2" /> Stop
                    </Button>
                  </div>
                )}

                {/* View report once all done */}
                {allCsvDone && !isCsvProcessing && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="lg" onClick={() => setLocation(`/results/${csvSessionId}`)}
                      className="text-lg px-10 py-4 h-auto font-bold">
                      View Full Session Report →
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-base px-6 py-3 h-auto"
                      onClick={() => {
                        const results = csvRows.filter(r => r.status === "complete" && r.result).map(r => r.result!);
                        exportSessionToCSV(results, `ttb-report-${csvSessionId.slice(0, 8)}.csv`);
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" /> Download CSV
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-base px-6 py-3 h-auto"
                      onClick={() => {
                        const results = csvRows.filter(r => r.status === "complete" && r.result).map(r => r.result!);
                        const sessionData = {
                          sessionId: csvSessionId,
                          totalCount: results.length,
                          passCount:  results.filter(r => r.overallStatus === "PASS").length,
                          failCount:  results.filter(r => r.overallStatus === "FAIL").length,
                          reviewCount:results.filter(r => r.overallStatus === "REVIEW").length,
                          results,
                        };
                        const html = generatePrintReport(sessionData, {}, csvSessionId, {});
                        const win = window.open("", "_blank");
                        if (win) { win.document.write(html); win.document.close(); win.print(); }
                      }}
                    >
                      <Printer className="w-4 h-4 mr-2" /> Print Report
                    </Button>
                    {csvErrorCount > 0 && (
                      <button
                        onClick={() => setCsvRows(prev => prev.map(r => r.status === "error" ? { ...r, status: "pending", error: undefined } : r))}
                        className="text-sm font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
                        <RefreshCw className="w-4 h-4" /> Retry {csvErrorCount} error{csvErrorCount !== 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                )}

                {/* Batch size control + Generate button when rows are pending */}
                {!isCsvProcessing && csvPendingCount > 0 && (
                  <div className="space-y-3">
                    {/* Batch size selector */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-muted-foreground">Generate:</span>
                      {([1, 3, 5, 10, null] as (number | null)[]).map((n) => (
                        <button
                          key={n ?? "all"}
                          onClick={() => setBatchSize(n)}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-bold transition-all ${
                            batchSize === n
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-foreground hover:border-primary/50"
                          }`}
                        >
                          {n === null ? "All" : n}
                        </button>
                      ))}
                      <span className="text-sm text-muted-foreground">label{batchSize !== 1 ? "s" : ""} at a time</span>
                    </div>

                    {/* Generate button */}
                    <Button
                      size="lg"
                      onClick={() => processCsvRows(batchSize)}
                      className="text-lg px-10 py-4 h-auto font-bold"
                    >
                      <Wand2 className="w-5 h-5 mr-3" />
                      {batchSize === null
                        ? `Generate & Check All ${csvPendingCount} Remaining`
                        : `Generate ${Math.min(batchSize, csvPendingCount)} Label${Math.min(batchSize, csvPendingCount) !== 1 ? "s" : ""}`}
                    </Button>
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      )}

      {/* CSV row detail modal — opened by clicking a row's status badge or label image */}
      <CsvRowDetailModal row={modalRow} onClose={() => setModalRow(null)} />

    </div>
  );
}
