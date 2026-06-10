import React, { useState, useRef } from "react";
import { useLocation } from "wouter";
import { UploadCloud, FileImage, Layers, Loader2, X, Plus, AlertCircle, Tag, CheckCircle, Wand2, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
// Width/height default to 600x900 to match the label generator's output size.
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

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<"single" | "batch" | "generate">("single");

  // ── Single-file mode state ────────────────────────────────────────────────
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [expectedBrandName, setExpectedBrandName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [batchQueue, setBatchQueue] = useState<QueuedFile[]>([]);
  const [batchSessionId, setBatchSessionId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Generate-mode state ───────────────────────────────────────────────────
  const [labelText, setLabelText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null);
  const [isCheckingGenerated, setIsCheckingGenerated] = useState(false);
  const textFileRef = useRef<HTMLInputElement>(null);

  // ── Drag/drop handlers ────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!e.dataTransfer.files?.length) return;
    if (mode === "single") {
      setSingleFile(e.dataTransfer.files[0]);
    } else {
      const newFiles = Array.from(e.dataTransfer.files).map(f => ({
        id: Math.random().toString(36).substring(7),
        file: f,
        status: "pending" as const,
      }));
      setBatchQueue(prev => [...prev, ...newFiles]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (mode === "single") {
      setSingleFile(e.target.files[0]);
    } else {
      const newFiles = Array.from(e.target.files).map(f => ({
        id: Math.random().toString(36).substring(7),
        file: f,
        status: "pending" as const,
      }));
      setBatchQueue(prev => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Upload handlers ───────────────────────────────────────────────────────
  const uploadSingle = async () => {
    if (!singleFile) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", singleFile);
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

  // Reads a .txt file into the textarea
  const handleTextFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setLabelText(text);
      setGeneratedSvg(null);
    };
    reader.readAsText(file);
    if (textFileRef.current) textFileRef.current.value = "";
  };

  // Calls the API to generate an SVG label from the pasted text
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
      toast({ title: "Generation failed", description: err.message || "Could not generate the label image. Please try again.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  // Converts generated SVG → PNG blob, then submits to the compliance checker
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

  return (
    <div className="flex-1 p-6 md:p-12 max-w-3xl mx-auto w-full">

      {/* Page heading */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Check a Label</h2>
        <p className="text-lg text-muted-foreground mt-2">
          Upload a photo of an alcohol beverage label and we will check it against TTB requirements automatically.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex flex-wrap gap-3 mb-8">
        <button
          onClick={() => !isUploading && setMode("single")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 text-base font-semibold transition-all ${mode === "single" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50"}`}
        >
          <FileImage className="w-5 h-5" /> One Label
        </button>
        <button
          onClick={() => !isUploading && setMode("batch")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 text-base font-semibold transition-all ${mode === "batch" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50"}`}
        >
          <Layers className="w-5 h-5" /> Multiple Labels
        </button>
        <button
          onClick={() => !isUploading && setMode("generate")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 text-base font-semibold transition-all ${mode === "generate" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50"}`}
        >
          <Wand2 className="w-5 h-5" /> Generate Label Image
        </button>
      </div>

      {/* ── ONE LABEL ─────────────────────────────────────────────────────── */}
      {mode === "single" && (
        <div className="space-y-6">

          {/* Drop zone */}
          <div
            className={`border-4 border-dashed rounded-2xl transition-colors cursor-pointer ${isDragOver ? "border-primary bg-primary/5" : singleFile ? "border-pass bg-pass/5" : "border-border bg-secondary/20 hover:border-primary/50 hover:bg-secondary/40"}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center justify-center p-16 text-center">
              {singleFile ? (
                <>
                  <CheckCircle className="w-16 h-16 text-pass mb-4" />
                  <p className="text-2xl font-bold text-foreground mb-1">{singleFile.name}</p>
                  <p className="text-base text-muted-foreground">{(singleFile.size / 1024 / 1024).toFixed(2)} MB — ready to check</p>
                  {!isUploading && (
                    <p className="text-sm text-muted-foreground mt-4">Click here to choose a different file</p>
                  )}
                  {isUploading && (
                    <div className="mt-6 flex items-center gap-3 text-primary font-semibold text-lg">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      Reading the label with AI — this takes about 10 seconds...
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="bg-background rounded-full p-5 shadow border mb-6">
                    <UploadCloud className="w-12 h-12 text-muted-foreground" />
                  </div>
                  <p className="text-2xl font-bold mb-2">Click here to select your label photo</p>
                  <p className="text-base text-muted-foreground mb-6">— or drag and drop the image file onto this area —</p>
                  <Button size="lg" variant="secondary" className="text-base px-8 py-3 h-auto" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                    Browse My Files
                  </Button>
                  <p className="text-sm text-muted-foreground mt-4">Accepts photos (JPEG, PNG) up to 10 MB. Make sure the label text is readable.</p>
                </>
              )}
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect} />
          </div>

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

          {/* Drop zone for batch */}
          <div
            className={`border-4 border-dashed rounded-2xl transition-colors cursor-pointer ${isDragOver ? "border-primary bg-primary/5" : "border-border bg-secondary/20 hover:border-primary/50"}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="bg-background rounded-full p-4 shadow border mb-4">
                <Plus className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold mb-1">Add label photos to the list</p>
              <p className="text-base text-muted-foreground">Click here or drag files — you can add multiple at once</p>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFileSelect} />
          </div>

          {/* Queue */}
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

          {/* Submit */}
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

          {/* Explainer */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
            <p className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" />
              How this works
            </p>
            <p className="text-base text-muted-foreground leading-relaxed">
              Paste or type the label text below — or upload a <code className="text-sm bg-secondary px-1 rounded">.txt</code> file.
              AI will generate a label image from your text, then run a full compliance check on it.
            </p>
          </div>

          {/* Text input area */}
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
              <input
                type="file"
                ref={textFileRef}
                className="hidden"
                accept=".txt,text/plain"
                onChange={handleTextFileSelect}
              />
            </div>
            <Textarea
              placeholder={`Paste your label text here. For example:\n\nBrand Name: STONE'S THROW\nType: Kentucky Straight Bourbon Whiskey\nABV: 45% Alc./Vol.\nNet Contents: 750 mL\nBottled by: Stone's Throw Distillery, 123 Barrel St, Louisville, KY 40202\n\nGOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.`}
              value={labelText}
              onChange={(e) => { setLabelText(e.target.value); setGeneratedSvg(null); }}
              disabled={isGenerating}
              className="text-base min-h-64 font-mono leading-relaxed resize-y"
            />
            <p className="text-sm text-muted-foreground">
              Include all label fields: brand name, type, ABV, net contents, bottler address, and the Government Warning statement.
            </p>
          </div>

          {/* Generate button */}
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

          {/* Generated SVG preview + actions */}
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

              {/* SVG preview — rendered inline in an img tag via object URL */}
              <div className="border-2 border-border rounded-xl overflow-hidden bg-secondary/10 flex justify-center p-4">
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(generatedSvg)}`}
                  alt="Generated label preview"
                  className="max-w-full max-h-[500px] object-contain rounded shadow-md"
                />
              </div>

              <p className="text-sm text-muted-foreground">
                Review the label above. When ready, click <strong>Check This Label</strong> to run the full TTB compliance check.
              </p>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  size="lg"
                  disabled={isGenerating || isCheckingGenerated}
                  onClick={() => { setGeneratedSvg(null); }}
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
