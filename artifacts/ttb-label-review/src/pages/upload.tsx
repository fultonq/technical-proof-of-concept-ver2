import React, { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { UploadCloud, FileImage, Layers, Loader2, X, Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { LabelAnalysisResult } from "@workspace/api-client-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface QueuedFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "processing" | "complete" | "error";
  error?: string;
  result?: LabelAnalysisResult;
}

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"single" | "batch">("single");
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [batchQueue, setBatchQueue] = useState<QueuedFile[]>([]);
  const [batchSessionId, setBatchSessionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (activeTab === "single") {
        setSingleFile(e.dataTransfer.files[0]);
      } else {
        const newFiles = Array.from(e.dataTransfer.files).map(f => ({
          id: Math.random().toString(36).substring(7),
          file: f,
          status: "pending" as const
        }));
        setBatchQueue(prev => [...prev, ...newFiles]);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (activeTab === "single") {
        setSingleFile(e.target.files[0]);
      } else {
        const newFiles = Array.from(e.target.files).map(f => ({
          id: Math.random().toString(36).substring(7),
          file: f,
          status: "pending" as const
        }));
        setBatchQueue(prev => [...prev, ...newFiles]);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeQueuedFile = (id: string) => {
    setBatchQueue(prev => prev.filter(f => f.id !== id));
  };

  const uploadSingle = async () => {
    if (!singleFile) return;
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append("file", singleFile);
      
      const response = await fetch("/api/v1/labels/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) throw new Error("Upload failed");
      
      const data: LabelAnalysisResult = await response.json();
      setLocation(`/results/${data.sessionId}`);
    } catch (err: any) {
      toast({
        title: "Analysis Failed",
        description: err.message || "An error occurred during upload.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const uploadBatch = async () => {
    const pendingFiles = batchQueue.filter(f => f.status === "pending" || f.status === "error");
    if (pendingFiles.length === 0) return;
    
    setIsUploading(true);
    let currentSessionId = batchSessionId;

    for (const qf of pendingFiles) {
      // Update status to uploading
      setBatchQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "uploading" } : f));
      
      try {
        const formData = new FormData();
        formData.append("file", qf.file);
        if (currentSessionId) {
          formData.append("sessionId", currentSessionId);
        }

        const response = await fetch("/api/v1/labels/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) throw new Error("Failed to process " + qf.file.name);
        
        const data: LabelAnalysisResult = await response.json();
        if (!currentSessionId) {
          currentSessionId = data.sessionId;
          setBatchSessionId(data.sessionId);
        }

        setBatchQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "complete", result: data } : f));
      } catch (err: any) {
        setBatchQueue(prev => prev.map(f => f.id === qf.id ? { ...f, status: "error", error: err.message } : f));
      }
    }
    
    setIsUploading(false);
    if (currentSessionId) {
      setLocation(`/results/${currentSessionId}`);
    }
  };

  return (
    <div className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Label Analysis Queue</h2>
        <p className="text-muted-foreground mt-2">Upload beverage label images for automated compliance extraction and verification.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "single" | "batch")} className="w-full">
        <TabsList className="mb-6 w-full max-w-md grid grid-cols-2">
          <TabsTrigger value="single" className="flex items-center gap-2" disabled={isUploading}>
            <FileImage className="w-4 h-4" /> Single Label
          </TabsTrigger>
          <TabsTrigger value="batch" className="flex items-center gap-2" disabled={isUploading}>
            <Layers className="w-4 h-4" /> Batch Processing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-0">
          <Card className="border-dashed border-2 bg-secondary/30">
            <CardContent className="p-0">
              <div 
                className="flex flex-col items-center justify-center p-16 text-center cursor-pointer transition-colors hover:bg-secondary/50"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => !isUploading && fileInputRef.current?.click()}
              >
                {singleFile ? (
                  <div className="flex flex-col items-center">
                    <FileImage className="w-16 h-16 text-primary mb-4" />
                    <p className="font-medium text-lg">{singleFile.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">{(singleFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    {isUploading ? (
                      <div className="mt-6 flex items-center gap-2 text-primary font-medium">
                        <Loader2 className="w-5 h-5 animate-spin" /> Processing with Compliance Engine...
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-6">Click or drag a different file to replace</p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="bg-background p-4 rounded-full shadow-sm mb-6 border">
                      <UploadCloud className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Drag & Drop Label Image</h3>
                    <p className="text-muted-foreground max-w-sm mb-6">Supports JPEG, PNG, or WEBP up to 10MB. Ensure text is clearly legible.</p>
                    <Button variant="secondary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                      Browse Files
                    </Button>
                  </>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/jpeg,image/png,image/webp" 
                  onChange={handleFileSelect}
                />
              </div>
            </CardContent>
          </Card>
          
          <div className="mt-6 flex justify-end">
            <Button size="lg" disabled={!singleFile || isUploading} onClick={uploadSingle} className="px-8 font-semibold">
              {isUploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
              ) : (
                "Analyze Label"
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="batch" className="mt-0 space-y-6">
          <Card className="border-dashed border-2 bg-secondary/30">
            <CardContent className="p-0">
              <div 
                className="flex flex-col items-center justify-center p-12 text-center cursor-pointer transition-colors hover:bg-secondary/50"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => !isUploading && fileInputRef.current?.click()}
              >
                <div className="bg-background p-3 rounded-full shadow-sm mb-4 border">
                  <Plus className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">Add to Queue</h3>
                <p className="text-sm text-muted-foreground">Select multiple files or drag them here</p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/jpeg,image/png,image/webp" 
                  multiple
                  onChange={handleFileSelect}
                />
              </div>
            </CardContent>
          </Card>

          {batchQueue.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Queue ({batchQueue.length} files)</h3>
                <Button variant="ghost" size="sm" onClick={() => setBatchQueue([])} disabled={isUploading}>
                  Clear Queue
                </Button>
              </div>
              
              <div className="border rounded-md divide-y overflow-hidden bg-card">
                {batchQueue.map((item, idx) => (
                  <div key={item.id} className="p-3 flex items-center justify-between hover:bg-secondary/20">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="text-muted-foreground font-mono text-xs w-6 text-right">{idx + 1}.</div>
                      <FileImage className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">{item.file.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.status === "pending" && <span className="text-xs text-muted-foreground uppercase font-semibold">Pending</span>}
                      {item.status === "uploading" && <span className="text-xs text-primary flex items-center gap-1 uppercase font-semibold"><Loader2 className="w-3 h-3 animate-spin"/> Processing</span>}
                      {item.status === "complete" && <span className="text-xs text-pass uppercase font-semibold">Done</span>}
                      {item.status === "error" && <span className="text-xs text-fail uppercase font-semibold flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Error</span>}
                      
                      {item.status !== "uploading" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => removeQueuedFile(item.id)} disabled={isUploading}>
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button 
              size="lg" 
              disabled={batchQueue.filter(f => f.status === "pending" || f.status === "error").length === 0 || isUploading} 
              onClick={uploadBatch}
              className="px-8 font-semibold"
            >
              {isUploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing Batch...</>
              ) : (
                `Analyze ${batchQueue.filter(f => f.status === "pending" || f.status === "error").length} Labels`
              )}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}