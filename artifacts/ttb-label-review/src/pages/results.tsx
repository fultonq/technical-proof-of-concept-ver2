import React from "react";
import { useRoute, useSearch, useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetSessionResults, getGetSessionResultsQueryKey } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { exportSessionToCSV } from "@/lib/csv-export";
import { generatePrintReport } from "@/lib/print-report";
import {
  getSessionReviewActions, DECISION_LABELS, DECISION_STYLES,
} from "@/lib/review-actions";
import {
  ArrowLeft, Download, Plus, Search, Loader2, AlertCircle,
  CheckCircle2, XCircle, Clock, MessageSquare, Printer, ShieldCheck, ShieldX, ShieldAlert,
  UploadCloud, ImageOff, ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import { getThumbnail, getFullImage } from "@/lib/label-thumbnails";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

export default function ResultsPage() {
  const [, params] = useRoute("/results/:sessionId");
  const sessionId = params?.sessionId || "";

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: sessionData, isLoading, isError, error } = useGetSessionResults(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionResultsQueryKey(sessionId) },
  });

  // ── URL-persisted filter & sort state ─────────────────────────────────────
  const search = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(search);

  type SortKey = "fileName" | "brand" | "status" | "issues" | "date";
  const VALID_SORT_KEYS: SortKey[] = ["fileName", "brand", "status", "issues", "date"];

  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>(
    urlParams.get("status") ?? "ALL",
  );
  const [beverageFilter, setBeverageFilter] = React.useState<string>(
    urlParams.get("type") ?? "ALL",
  );
  const rawSort = urlParams.get("sort") as SortKey | null;
  const [sortKey, setSortKey] = React.useState<SortKey | null>(
    rawSort && VALID_SORT_KEYS.includes(rawSort) ? rawSort : null,
  );
  const rawDir = urlParams.get("dir");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">(
    rawDir === "desc" ? "desc" : "asc",
  );

  // Sync filter/sort state back to URL (replace so every pill click doesn't
  // push a new history entry, but the current URL is always bookmarkable).
  React.useEffect(() => {
    const p = new URLSearchParams();
    if (statusFilter !== "ALL") p.set("status", statusFilter);
    if (beverageFilter !== "ALL") p.set("type", beverageFilter);
    if (sortKey) p.set("sort", sortKey);
    if (sortKey && sortDir !== "asc") p.set("dir", sortDir);
    const qs = p.toString();
    navigate(`/results/${sessionId}${qs ? `?${qs}` : ""}`, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, beverageFilter, sortKey, sortDir, sessionId]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3.5 h-3.5 inline ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3.5 h-3.5 inline ml-1" />
      : <ArrowDown className="w-3.5 h-3.5 inline ml-1" />;
  }

  // ── Thumbnails — loaded from sessionStorage (saved by upload.tsx) ──────────
  const [thumbnails, setThumbnails] = React.useState<Record<string, string>>({});
  const [fullImages, setFullImages] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (!sessionData) return;
    const thumbMap: Record<string, string> = {};
    const fullMap: Record<string, string> = {};
    for (const r of sessionData.results) {
      const thumb = getThumbnail(r.labelId);
      if (thumb) thumbMap[r.labelId] = thumb;
      const full = getFullImage(r.labelId);
      if (full) fullMap[r.labelId] = full;
    }
    setThumbnails(thumbMap);
    setFullImages(fullMap);
  }, [sessionData]);

  // ── Lightbox — clicking a thumbnail shows a medium popup ──────────────────
  const [lightbox, setLightbox] = React.useState<{ src: string; alt: string } | null>(null);

  // ── Add label to existing session ─────────────────────────────────────────
  const addFileRef = React.useRef<HTMLInputElement>(null);
  const [isAdding, setIsAdding] = React.useState(false);
  const [addingFileName, setAddingFileName] = React.useState<string | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleAddLabel = async (file: File) => {
    setIsAdding(true);
    setAddingFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionId", sessionId);
      const res = await fetch("/api/v1/labels/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed — please try again.");
      // Refresh the session results so the new label appears in the table
      await queryClient.invalidateQueries({
        queryKey: getGetSessionResultsQueryKey(sessionId),
      });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsAdding(false);
      setAddingFileName(null);
      if (addFileRef.current) addFileRef.current.value = "";
    }
  };

  // ── Per-label review decisions, loaded from localStorage ──────────────────
  const [reviewActions, setReviewActions] = React.useState<Record<string, ReturnType<typeof getSessionReviewActions>[string]>>({});
  React.useEffect(() => {
    if (!sessionData) return;
    const ids = sessionData.results.map(r => r.labelId);
    setReviewActions(getSessionReviewActions(ids));
    // Refresh when the tab becomes visible again (agent may have made decisions on detail page)
    const onFocus = () => setReviewActions(getSessionReviewActions(ids));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [sessionData]);

  // ── Per-label reviewer comments, persisted to localStorage ────────────────
  const [comments, setComments] = React.useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem(`ttb-comments-${sessionId}`);
      return stored ? (JSON.parse(stored) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });
  const [openCommentId, setOpenCommentId] = React.useState<string | null>(null);

  const updateComment = (labelId: string, text: string) => {
    const next = { ...comments, [labelId]: text };
    setComments(next);
    try {
      localStorage.setItem(`ttb-comments-${sessionId}`, JSON.stringify(next));
    } catch { /* ignore quota errors */ }
  };

  // ── Print report ───────────────────────────────────────────────────────────
  const printReport = () => {
    if (!sessionData) return;
    const html = generatePrintReport(sessionData, comments, sessionId, reviewActions);
    const win = window.open("", "_blank");
    if (!win) {
      alert("Pop-up blocked — please allow pop-ups for this site and try again.");
      return;
    }
    win.document.write(html);
    win.document.close();
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-2xl font-semibold text-foreground">Loading results...</p>
        <p className="text-base text-muted-foreground">This will only take a moment.</p>
      </div>
    );
  }

  if (isError || !sessionData) {
    return (
      <div className="flex-1 p-8 max-w-3xl mx-auto w-full space-y-6">
        <Alert variant="destructive" className="text-base">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-lg font-bold">Could not load results</AlertTitle>
          <AlertDescription>
            {(error as any)?.message || "Something went wrong. Please go back and try again."}
          </AlertDescription>
        </Alert>
        <Link href="/">
          <Button size="lg" variant="outline" className="text-base">
            <ArrowLeft className="w-5 h-5 mr-2" /> Go Back
          </Button>
        </Link>
      </div>
    );
  }

  let filteredResults = sessionData.results.filter(r =>
    r.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.brandName.extractedValue ?? "").toLowerCase().includes(searchTerm.toLowerCase()),
  );
  if (statusFilter !== "ALL") filteredResults = filteredResults.filter(r => r.overallStatus === statusFilter);
  if (beverageFilter !== "ALL") filteredResults = filteredResults.filter(r => r.beverageType === beverageFilter);
  if (sortKey) {
    filteredResults = [...filteredResults].sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      if (sortKey === "fileName")  { av = a.fileName.toLowerCase(); bv = b.fileName.toLowerCase(); }
      if (sortKey === "brand")     { av = (a.brandName.extractedValue ?? "").toLowerCase(); bv = (b.brandName.extractedValue ?? "").toLowerCase(); }
      if (sortKey === "status")    { av = a.overallStatus; bv = b.overallStatus; }
      if (sortKey === "issues")    { av = a.flags.length; bv = b.flags.length; }
      if (sortKey === "date")      { av = (a as any).analyzedAt ?? ""; bv = (b as any).analyzedAt ?? ""; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  return (
    <div className="flex-1 flex flex-col">

      {/* ── Lightbox modal ───────────────────────────────────────────────── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl p-3 max-w-sm w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-bold shadow hover:bg-foreground/80 transition-colors"
              aria-label="Close preview"
            >
              ✕
            </button>
            <img
              src={lightbox.src}
              alt={lightbox.alt}
              className="w-full rounded-lg object-contain max-h-[70vh]"
            />
            <p className="text-xs text-center text-muted-foreground mt-2 truncate px-1">{lightbox.alt}</p>
          </div>
        </div>
      )}

      {/* ── Summary bar ─────────────────────────────────────────────────── */}
      <div className="bg-card border-b border-border shadow-sm">
        <div className="max-w-6xl mx-auto w-full p-6">

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <Link href="/" className="inline-flex items-center gap-1 text-base text-muted-foreground hover:text-primary mb-2">
                <ArrowLeft className="w-4 h-4" /> Back to Dashboard
              </Link>
              <h2 className="text-3xl font-bold text-foreground">Review Results</h2>
              <p className="text-base text-muted-foreground mt-1">
                {sessionData.totalCount} label{sessionData.totalCount !== 1 ? "s" : ""} checked in this session
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {(() => {
                const isFiltered = statusFilter !== "ALL" || beverageFilter !== "ALL" || searchTerm.trim() !== "";
                const exportLabel = isFiltered
                  ? `Export ${filteredResults.length} filtered label${filteredResults.length !== 1 ? "s" : ""}`
                  : "Download CSV";
                return (
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-base font-semibold"
                    onClick={() => exportSessionToCSV(filteredResults, `ttb-report-${sessionId}.csv`)}
                  >
                    <Download className="w-5 h-5 mr-2" /> {exportLabel}
                  </Button>
                );
              })()}
              <Button
                size="lg"
                className="text-base font-semibold"
                onClick={printReport}
              >
                <Printer className="w-5 h-5 mr-2" /> Print Report
              </Button>
            </div>
          </div>

          {/* Big summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col items-center justify-center border-2 border-pass/40 rounded-2xl p-6 bg-pass/5 gap-2">
              <CheckCircle2 className="w-10 h-10 text-pass" />
              <p className="text-5xl font-black tabular-nums text-pass">{sessionData.passCount}</p>
              <p className="text-base font-bold text-pass uppercase tracking-wide">Passed</p>
            </div>
            <div className="flex flex-col items-center justify-center border-2 border-review/40 rounded-2xl p-6 bg-review/5 gap-2">
              <Clock className="w-10 h-10 text-review" />
              <p className="text-5xl font-black tabular-nums text-review">{sessionData.reviewCount}</p>
              <p className="text-base font-bold text-review uppercase tracking-wide">Needs Review</p>
            </div>
            <div className="flex flex-col items-center justify-center border-2 border-fail/40 rounded-2xl p-6 bg-fail/5 gap-2">
              <XCircle className="w-10 h-10 text-fail" />
              <p className="text-5xl font-black tabular-nums text-fail">{sessionData.failCount}</p>
              <p className="text-base font-bold text-fail uppercase tracking-wide">Failed</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Label table ─────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 max-w-6xl mx-auto w-full">

        {/* ── Add label to this session ────────────────────────────────── */}
        <div className="mb-5">
          <input
            ref={addFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleAddLabel(f); }}
          />
          {isAdding ? (
            <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-2 border-dashed border-primary/30 rounded-xl text-sm text-primary font-medium">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Checking <strong className="mx-1">{addingFileName}</strong> — adding to this session…
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => addFileRef.current?.click()}
              onKeyDown={e => e.key === "Enter" && addFileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setIsDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) handleAddLabel(f);
              }}
              className={`flex items-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors text-sm font-medium select-none ${
                isDragOver
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <UploadCloud className="w-4 h-4 shrink-0" />
              <span>
                Drop a label image here or{" "}
                <span className="underline underline-offset-2">browse</span>
                {" "}— adds to this session
              </span>
              <span className="ml-auto text-xs text-muted-foreground/60">JPG · PNG · WebP</span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-xl font-bold text-foreground">All Labels</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Click <MessageSquare className="inline w-3.5 h-3.5" /> to add a reviewer note — notes are saved automatically and included in the printed report.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by file name or brand..."
              className="pl-10 h-11 text-base"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* ── Filter pills ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["ALL", "PASS", "FAIL", "REVIEW"] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? "ALL" : s)}
                className={`px-3 py-1 rounded-full text-sm font-semibold border transition-colors ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {s === "ALL" ? "All" : s === "PASS" ? "Pass" : s === "FAIL" ? "Fail" : "Needs Review"}
              </button>
            ))}
          </div>
          <span className="w-px self-stretch bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["ALL", "SPIRITS", "WINE", "MALT"] as const).map(t => (
              <button
                key={t}
                onClick={() => setBeverageFilter(beverageFilter === t ? "ALL" : t)}
                className={`px-3 py-1 rounded-full text-sm font-semibold border transition-colors ${
                  beverageFilter === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {t === "ALL" ? "All Types" : t === "SPIRITS" ? "Spirits" : t === "WINE" ? "Wine" : "Malt"}
              </button>
            ))}
          </div>
          {(statusFilter !== "ALL" || beverageFilter !== "ALL") && (
            <button
              onClick={() => { setStatusFilter("ALL"); setBeverageFilter("ALL"); }}
              className="ml-auto text-xs text-primary font-semibold hover:underline"
            >
              Clear filters
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto sm:ml-0">
            {filteredResults.length} of {sessionData.totalCount} label{sessionData.totalCount !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="border-2 border-border rounded-2xl overflow-hidden shadow-sm bg-card">
          <table className="w-full text-left">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th
                  className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort("fileName")}
                >
                  Label File <SortIcon col="fileName" />
                </th>
                <th className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Preview</th>
                <th
                  className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort("brand")}
                >
                  Brand Found <SortIcon col="brand" />
                </th>
                <th
                  className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort("status")}
                >
                  AI Result <SortIcon col="status" />
                </th>
                <th
                  className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort("issues")}
                >
                  Issues <SortIcon col="issues" />
                </th>
                <th className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Decision</th>
                <th className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-lg text-muted-foreground">
                    No labels match your search.
                  </td>
                </tr>
              ) : (
                filteredResults.map((result) => {
                  const hasComment = !!comments[result.labelId]?.trim();
                  const isCommentOpen = openCommentId === result.labelId;
                  const action = reviewActions[result.labelId] ?? null;
                  const dStyle = action ? DECISION_STYLES[action.decision] : null;

                  return (
                    <React.Fragment key={result.labelId}>
                      <tr className="hover:bg-secondary/20 transition-colors">
                        <td className="px-5 py-4 font-medium text-base text-foreground max-w-[220px] truncate" title={result.fileName}>
                          {result.fileName}
                        </td>
                        <td className="px-3 py-2">
                          {thumbnails[result.labelId] ? (
                            <button
                              onClick={() => setLightbox({ src: fullImages[result.labelId] ?? thumbnails[result.labelId], alt: result.fileName })}
                              className="block focus:outline-none focus:ring-2 focus:ring-ring rounded"
                              title="Click to enlarge"
                            >
                              <img
                                src={thumbnails[result.labelId]}
                                alt={`Preview of ${result.fileName}`}
                                className="h-14 w-10 object-contain rounded border border-border bg-white shadow-sm hover:shadow-md hover:scale-105 transition-transform cursor-zoom-in"
                              />
                            </button>
                          ) : (
                            <div className="h-14 w-10 flex items-center justify-center rounded border border-border bg-muted text-muted-foreground/40">
                              <ImageOff className="w-4 h-4" />
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-base text-foreground">
                          {result.brandName.extractedValue
                            ? <span className="font-mono">{result.brandName.extractedValue}</span>
                            : <span className="text-muted-foreground italic">Not detected</span>}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={result.overallStatus} className="text-sm px-3 py-1" />
                        </td>
                        <td className="px-5 py-4 text-base">
                          {result.flags.length > 0
                            ? <span className="inline-flex items-center gap-1.5 text-fail font-bold">
                                <AlertCircle className="w-4 h-4" /> {result.flags.length} issue{result.flags.length !== 1 ? "s" : ""}
                              </span>
                            : <span className="text-pass font-semibold flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" /> None
                              </span>}
                        </td>
                        {/* ── Decision column ─────────────────────────── */}
                        <td className="px-5 py-4">
                          {action && dStyle ? (
                            <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-2.5 py-1 rounded-full border ${dStyle.bg} ${dStyle.text} ${dStyle.border}`}>
                              {action.decision === "APPROVED" || action.decision === "OVERRIDE_APPROVED"
                                ? <ShieldCheck className="w-3.5 h-3.5" />
                                : <ShieldX className="w-3.5 h-3.5" />}
                              {DECISION_LABELS[action.decision]}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground italic">Pending</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {/* Comment toggle button */}
                            <button
                              onClick={() => setOpenCommentId(isCommentOpen ? null : result.labelId)}
                              title={hasComment ? "Edit reviewer comment" : "Add reviewer comment"}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
                                hasComment
                                  ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                                  : isCommentOpen
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                              }`}
                            >
                              <MessageSquare className="w-4 h-4" />
                              {hasComment ? "Note" : "Add note"}
                            </button>
                            <Link href={`/results/${sessionId}/${result.labelId}`}>
                              <Button size="lg" className="text-base font-bold px-6">
                                See Report
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable comment row */}
                      {isCommentOpen && (
                        <tr>
                          <td colSpan={7} className="px-5 py-4 bg-secondary/10 border-b border-primary/10">
                            <div className="flex items-start gap-3 max-w-2xl">
                              <MessageSquare className="w-4 h-4 text-primary mt-2.5 shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-foreground mb-1">
                                  Reviewer Note
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    Included in printed report
                                  </span>
                                </p>
                                <textarea
                                  rows={3}
                                  autoFocus
                                  placeholder={
                                    result.overallStatus === "PASS"
                                      ? "e.g. Approved — label conforms to all mandatory requirements."
                                      : result.overallStatus === "FAIL"
                                        ? "e.g. Rejected — missing government warning. Returned to applicant for correction."
                                        : "e.g. Flagged for secondary review — ABV confidence low, physical label inspection required."
                                  }
                                  value={comments[result.labelId] ?? ""}
                                  onChange={(e) => updateComment(result.labelId, e.target.value)}
                                  className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  Saved automatically · {(comments[result.labelId] ?? "").length} character{(comments[result.labelId] ?? "").length !== 1 ? "s" : ""}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Link href="/">
            <Button size="lg" variant="outline" className="text-base font-semibold px-8">
              <Plus className="w-5 h-5 mr-2" /> Check Another Label
            </Button>
          </Link>
          <Button
            size="lg"
            variant="outline"
            className="text-base font-semibold"
            onClick={printReport}
          >
            <Printer className="w-5 h-5 mr-2" /> Print Report
          </Button>
        </div>
      </div>
    </div>
  );
}
