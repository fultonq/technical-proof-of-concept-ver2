import React, { useState, useRef } from "react";
import { useLocation } from "wouter";
import { UploadCloud, FileImage, Layers, Loader2, X, Plus, AlertCircle, Tag, CheckCircle, Wand2, FileText, RefreshCw, FlipHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { LabelAnalysisResult } from "@workspace/api-client-react";

interface QueuedFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "complete" | "error";
  error?: string;
  result?: LabelAnalysisResult;
}

// Converts an SVG string to a PNG Blob via an off-screen canvas.
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

// Small reusable dropzone for a single image file
function ImageDropzone({
  label,
  sublabel,
  file,
  onFile,
  isUploading,
  accept = "image/jpeg,image/png,image/webp",
  optional = false,
}: {
  label: string;
  sublabel: string;
  file: File | null;
  onFile: (f: File) => void;
  isUploading: boolean;
  accept?: string;
  optional?: boolean;
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
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
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
      <input type="file" ref={ref} className="hidden" accept={accept} onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        if (ref.current) ref.current.value = "";
      }} />
    </div>
  );
}

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<"single" | "batch" | "generate">("single");

  // ── Single-file mode state ────────────────────────────────────────────────
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [showBackLabel, setShowBackLabel] = useState(false);
  const [expectedBrandName, setExpectedBrandName] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // ── Batch mode state ──────────────────────────────────────────────────────
  const [batchQueue, setBatchQueue] = useState<QueuedFile[]>([]);
  const [batchSessionId, setBatchSessionId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const batchFileRef = useRef<HTMLInputElement>(null);

  // ── Generate-mode state ───────────────────────────────────────────────────
  const [labelText, setLabelText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null);
  const [isCheckingGenerated, setIsCheckingGenerated] = useState(false);
  const textFileRef = useRef<HTMLInputElement>(null);

  // ── Upload handlers ───────────────────────────────────────────────────────
  const uploadSingle = async () => {
    if (!singleFile) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", singleFile);
      if (showBackLabel && backFile) formData.append("backFile", backFile);
      if (expectedBrandName.trim()) formData.append("expectedBrandName", expectedBrandName.trim());
      const response = await fetch("/api/v1/labels/upload", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Upload failed — please try again.");
      const data: LabelAnalysisResult = await response.json();
      setLocation(`/results/${data.sessionId}`);
    } catch (err: any) {
      toast({ title: "Something went wrong", description: err.message || "Could not process the label. Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

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
        const response = await fetch("/api/v1/labels/upload", { method: "POST", body: formData });
        if (!response.ok) throw new Error("Failed to process " + qf.file.name);
        const data: LabelAnalysisResult = await response.json();
        if (!currentSessionId) { currentSessionId = data.sessionId; setBatchSessionId(data.sessionId); }
        setBatchQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "complete", result: data } : f));
      } catch (err: any) {
        setBatchQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "error", error: err.message } : f));
      }
    }
    setIsUploading(false);
    if (currentSessionId) setLocation(`/results/${currentSessionId}`);
  };

  // ── Generate mode handlers ────────────────────────────────────────────────
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
      const response = await fetch("/api/v1/labels/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelText: labelText.trim() }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).error || "Generation failed — please try again.");
      }
      const { svg } = await response.json();
      setGeneratedSvg(svg);
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message || "Could not generate the label image.", variant: "destructive" });
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
      const response = await fetch("/api/v1/labels/upload", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Compliance check failed — please try again.");
      const data: LabelAnalysisResult = await response.json();
      setLocation(`/results/${data.sessionId}`);
    } catch (err: any) {
      toast({ title: "Something went wrong", description: err.message || "Could not check the generated label.", variant: "destructive" });
    } finally {
      setIsCheckingGenerated(false);
    }
  };

  const pendingCount = batchQueue.filter(f => f.status === "pending" || f.status === "error").length;
  const switchMode = (m: "single" | "batch" | "generate") => {
    if (!isUploading) setMode(m);
  };

  return (
    <div className="flex-1 p-6 md:p-12 max-w-3xl mx-auto w-full">

      {/* Page heading */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Check a Label</h2>
        <p className="text-lg text-muted-foreground mt-2">
          Upload a photo of an alcohol beverage label and we will check it against TTB requirements automatically.
          Handles beer, wine, and distilled spirits.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex flex-wrap gap-3 mb-8">
        <button
          onClick={() => switchMode("single")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 text-base font-semibold transition-all ${mode === "single" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50"}`}
        >
          <FileImage className="w-5 h-5" /> One Label
        </button>
        <button
          onClick={() => switchMode("batch")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 text-base font-semibold transition-all ${mode === "batch" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50"}`}
        >
          <Layers className="w-5 h-5" /> Multiple Labels
        </button>
        <button
          onClick={() => switchMode("generate")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 text-base font-semibold transition-all ${mode === "generate" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50"}`}
        >
          <Wand2 className="w-5 h-5" /> Generate Label Image
        </button>
      </div>

      {/* ── ONE LABEL ─────────────────────────────────────────────────────── */}
      {mode === "single" && (
        <div className="space-y-6">

          {/* Front + Back toggle */}
          <div className="flex items-center justify-between bg-secondary/30 border border-border rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <FlipHorizontal className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-semibold text-base">Upload front &amp; back label</p>
                <p className="text-sm text-muted-foreground">Enables AI to read fields split across both sides (e.g. gov warning on back)</p>
              </div>
            </div>
            <button
              onClick={() => { setShowBackLabel(v => !v); setBackFile(null); }}
              disabled={isUploading}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${showBackLabel ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${showBackLabel ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Drop zone(s) */}
          {showBackLabel ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Front Label</p>
                <ImageDropzone
                  label="Select front label photo"
                  sublabel="JPEG, PNG, or WebP"
                  file={singleFile}
                  onFile={setSingleFile}
                  isUploading={isUploading}
                />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Back Label</p>
                <ImageDropzone
                  label="Select back label photo"
                  sublabel="JPEG, PNG, or WebP"
                  file={backFile}
                  onFile={setBackFile}
                  isUploading={isUploading}
                  optional
                />
              </div>
            </div>
          ) : (
            <ImageDropzone
              label="Click here to select your label photo"
              sublabel="— or drag and drop the image file onto this area —"
              file={singleFile}
              onFile={setSingleFile}
              isUploading={isUploading}
            />
          )}

          {isUploading && (
            <div className="flex items-center justify-center gap-3 text-primary font-semibold text-base py-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              Reading the label with AI — this takes about 10–15 seconds...
            </div>
          )}

          {/* Brand name field */}
          <div className="bg-secondary/30 border border-border rounded-xl p-5">
            <Label htmlFor="expectedBrandName" className="flex items-center gap-2 text-base font-semibold mb-1">
              <Tag className="w-4 h-4 text-muted-foreground" />
              What is the brand name on this label?
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Filling this in improves accuracy. Leave blank if you do not know it.
            </p>
            <Input
              id="expectedBrandName"
              placeholder="e.g. OLD TOM DISTILLERY"
              value={expectedBrandName}
              onChange={(e) => setExpectedBrandName(e.target.value)}
              disabled={isUploading}
              className="text-base h-12 font-mono max-w-sm"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <Button
              size="lg"
              disabled={!singleFile || isUploading}
              onClick={uploadSingle}
              className="text-lg px-10 py-4 h-auto font-bold"
            >
              {isUploading
                ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Checking...</>
                : "Check This Label"}
            </Button>
          </div>
        </div>
      )}

      {/* ── MULTIPLE LABELS ───────────────────────────────────────────────── */}
      {mode === "batch" && (
        <div className="space-y-6">

          <div
            className={`border-4 border-dashed rounded-2xl transition-colors cursor-pointer ${isDragOver ? "border-primary bg-primary/5" : "border-border bg-secondary/20 hover:border-primary/50"}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const newFiles = Array.from(e.dataTransfer.files || []).map(f => ({
                id: Math.random().toString(36).substring(7),
                file: f,
                status: "pending" as const,
              }));
              setBatchQueue(prev => [...prev, ...newFiles]);
            }}
            onClick={() => !isUploading && batchFileRef.current?.click()}
          >
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="bg-background rounded-full p-4 shadow border mb-4">
                <Plus className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold mb-1">Add label photos to the list</p>
              <p className="text-base text-muted-foreground">Click here or drag files — you can add multiple at once</p>
            </div>
            <input type="file" ref={batchFileRef} className="hidden" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => {
              const newFiles = Array.from(e.target.files || []).map(f => ({
                id: Math.random().toString(36).substring(7),
                file: f,
                status: "pending" as const,
              }));
              setBatchQueue(prev => [...prev, ...newFiles]);
              if (batchFileRef.current) batchFileRef.current.value = "";
            }} />
          </div>

          {batchQueue.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold">{batchQueue.length} label{batchQueue.length !== 1 ? "s" : ""} in the list</p>
                <Button variant="ghost" onClick={() => setBatchQueue([])} disabled={isUploading} className="text-base text-muted-foreground">
                  Clear all
                </Button>
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
                      {item.status === "uploading" && <span className="text-sm text-primary flex items-center gap-1 font-semibold"><Loader2 className="w-4 h-4 animate-spin" /> Checking...</span>}
                      {item.status === "complete" && <span className="text-sm text-pass font-bold flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Done</span>}
                      {item.status === "error" && <span className="text-sm text-fail font-bold flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Error</span>}
                      {item.status !== "uploading" && (
                        <button onClick={() => setBatchQueue(prev => prev.filter(f => f.id !== item.id))} disabled={isUploading} className="text-muted-foreground hover:text-foreground p-1 rounded">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              size="lg"
              disabled={pendingCount === 0 || isUploading}
              onClick={uploadBatch}
              className="text-lg px-10 py-4 h-auto font-bold"
            >
              {isUploading
                ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Checking labels...</>
                : `Check ${pendingCount} Label${pendingCount !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      )}

      {/* ── GENERATE LABEL IMAGE ──────────────────────────────────────────── */}
      {mode === "generate" && (
        <div className="space-y-6">

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
            <p className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" />
              How this works
            </p>
            <p className="text-base text-muted-foreground leading-relaxed">
              Paste or type the label text below — or upload a <code className="text-sm bg-secondary px-1 rounded">.txt</code> file.
              AI will generate a label image from your text, then run a full compliance check on it.
              Works for beer, wine, and spirits labels.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Label Text</Label>
              <button
                onClick={() => textFileRef.current?.click()}
                className="flex items-center gap-1.5 text-sm text-primary font-semibold hover:underline"
                disabled={isGenerating}
              >
                <FileText className="w-4 h-4" /> Upload .txt file
              </button>
              <input type="file" ref={textFileRef} className="hidden" accept=".txt,text/plain" onChange={handleTextFileSelect} />
            </div>
            <Textarea
              placeholder={`Paste your label text here. For example:\n\nBrand Name: STONE'S THROW\nType: Kentucky Straight Bourbon Whiskey\nABV: 45% Alc./Vol.\nNet Contents: 750 mL\nBottled by: Stone's Throw Distillery, 123 Barrel St, Louisville, KY 40202\n\nGOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.`}
              value={labelText}
              onChange={(e) => { setLabelText(e.target.value); setGeneratedSvg(null); }}
              disabled={isGenerating}
              className="text-base min-h-64 font-mono leading-relaxed resize-y"
            />
            <p className="text-sm text-muted-foreground">
              Include all label fields: brand name, type, ABV (spirits/wine), net contents, bottler address, and the Government Warning statement.
              For wine, also include appellation of origin and sulfite declaration.
            </p>
          </div>

          {!generatedSvg && (
            <div className="flex justify-end">
              <Button
                size="lg"
                disabled={!labelText.trim() || isGenerating}
                onClick={generateLabel}
                className="text-lg px-10 py-4 h-auto font-bold"
              >
                {isGenerating
                  ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Generating label image...</>
                  : <><Wand2 className="w-5 h-5 mr-3" /> Generate AI Label Image</>}
              </Button>
            </div>
          )}

          {generatedSvg && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-foreground flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-pass" />
                  Label image generated
                </p>
                <button
                  onClick={() => { setGeneratedSvg(null); generateLabel(); }}
                  disabled={isGenerating || isCheckingGenerated}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-semibold transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> Regenerate
                </button>
              </div>

              <div className="border-2 border-border rounded-xl overflow-hidden bg-secondary/10 flex justify-center p-4">
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(generatedSvg)}`}
                  alt="Generated label preview"
                  className="max-w-full max-h-[500px] object-contain rounded shadow-md"
                />
              </div>

              <p className="text-sm text-muted-foreground">
                Review the label above. Click <strong>Check This Label</strong> to run the full TTB compliance check.
              </p>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  size="lg"
                  disabled={isGenerating || isCheckingGenerated}
                  onClick={() => setGeneratedSvg(null)}
                  className="text-base px-6 py-3 h-auto"
                >
                  Edit Text &amp; Regenerate
                </Button>
                <Button
                  size="lg"
                  disabled={isCheckingGenerated}
                  onClick={checkGeneratedLabel}
                  className="text-lg px-10 py-4 h-auto font-bold"
                >
                  {isCheckingGenerated
                    ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Running compliance check...</>
                    : "Check This Label"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
