import React from "react";
import { Link } from "wouter";
import { useQueries } from "@tanstack/react-query";
import { getGetSessionResultsQueryKey } from "@workspace/api-client-react";
import type { BatchAnalysisResult, LabelAnalysisResult } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportSessionToCSV } from "@/lib/csv-export";
import {
  getSessionReviewActions, DECISION_LABELS, DECISION_STYLES,
  type ReviewDecision, type ReviewAction,
} from "@/lib/review-actions";
import {
  Download, Search, Loader2, CheckCircle2, XCircle, Clock,
  FolderOpen, ImageOff, Minus,
} from "lucide-react";
import { getThumbnail, getFullImage } from "@/lib/label-thumbnails";
import { getSessions, type SessionRecord } from "@/lib/session-history";

interface FlatResult extends LabelAnalysisResult {
  sessionId: string;
  sessionType: SessionRecord["type"];
  sessionFileName?: string;
}

async function fetchSession(sessionId: string): Promise<BatchAnalysisResult> {
  const res = await fetch(`/api/v1/labels/session/${sessionId}`);
  if (!res.ok) throw new Error(`Session ${sessionId} unavailable`);
  return res.json();
}

export default function AllResultsPage() {
  const [sessions] = React.useState<SessionRecord[]>(() => getSessions());

  const queries = useQueries({
    queries: sessions.map(s => ({
      queryKey: getGetSessionResultsQueryKey(s.sessionId),
      queryFn: () => fetchSession(s.sessionId),
      retry: false,
    })),
  });

  const isLoading = queries.some(q => q.isLoading);
  const hasAnyData = queries.some(q => !!q.data);

  const flatResults = React.useMemo<FlatResult[]>(() => {
    const out: FlatResult[] = [];
    queries.forEach((q, idx) => {
      if (!q.data) return;
      const session = sessions[idx];
      for (const r of q.data.results) {
        out.push({
          ...r,
          sessionId: session.sessionId,
          sessionType: session.type,
          sessionFileName: session.fileName,
        });
      }
    });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map(q => q.status).join(","), sessions]);

  const passCount   = flatResults.filter(r => r.overallStatus === "PASS").length;
  const failCount   = flatResults.filter(r => r.overallStatus === "FAIL").length;
  const reviewCount = flatResults.filter(r => r.overallStatus === "REVIEW").length;
  const otherCount  = flatResults.length - passCount - failCount - reviewCount;

  const [searchTerm, setSearchTerm]   = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");

  const filteredResults = React.useMemo(() => {
    return flatResults.filter(r => {
      const matchesSearch =
        r.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.brandName.extractedValue ?? "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || r.overallStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [flatResults, searchTerm, statusFilter]);

  const [thumbnails, setThumbnails] = React.useState<Record<string, string>>({});
  const [fullImages, setFullImages]  = React.useState<Record<string, string>>({});
  const flatResultsKey = flatResults.map(r => r.labelId).join(",");
  React.useEffect(() => {
    const thumbMap: Record<string, string> = {};
    const fullMap:  Record<string, string> = {};
    for (const r of flatResults) {
      const t = getThumbnail(r.labelId); if (t) thumbMap[r.labelId] = t;
      const f = getFullImage(r.labelId); if (f) fullMap[r.labelId]  = f;
    }
    setThumbnails(thumbMap);
    setFullImages(fullMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatResultsKey]);

  const [reviewActions, setReviewActions] = React.useState<Record<string, ReviewAction>>({});
  React.useEffect(() => {
    setReviewActions(getSessionReviewActions(flatResults.map(r => r.labelId)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatResultsKey]);

  const [lightbox, setLightbox] = React.useState<{ src: string; alt: string } | null>(null);

  const handleExportAll = () => {
    if (!flatResults.length) return;
    exportSessionToCSV(flatResults, "ttb-all-results.csv");
  };

  const unavailableCount = queries.filter(q => q.isError).length;
  const loadedCount = queries.filter(q => !!q.data).length;

  return (
    <div className="flex-1 flex flex-col">
      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <div className="relative bg-white rounded-2xl shadow-2xl p-3 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-bold shadow">✕</button>
            <img src={lightbox.src} alt={lightbox.alt} className="w-full rounded-lg object-contain max-h-[70vh]" />
            <p className="text-xs text-center text-muted-foreground mt-2 truncate">{lightbox.alt}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-card border-b border-border shadow-sm px-6 py-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground">All Results</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                All analyzed labels across {sessions.length} session{sessions.length !== 1 ? "s" : ""}
                {unavailableCount > 0 && (
                  <span className="ml-2 text-review font-medium">
                    · {unavailableCount} session{unavailableCount !== 1 ? "s" : ""} unavailable (server restarted)
                  </span>
                )}
              </p>
            </div>
            {flatResults.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportAll}>
                <Download className="w-4 h-4 mr-1.5" /> Export All CSV
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 max-w-6xl mx-auto w-full">

        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="bg-muted rounded-full p-5 mb-2"><FolderOpen className="w-10 h-10 text-muted-foreground" /></div>
            <p className="text-xl font-bold">No results yet</p>
            <p className="text-muted-foreground max-w-sm">Check some labels first and your results will appear here.</p>
            <Link href="/"><Button size="lg">Add Labels →</Button></Link>
          </div>
        )}

        {sessions.length > 0 && isLoading && !hasAnyData && (
          <div className="flex items-center justify-center gap-3 py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground font-medium">Loading {sessions.length} session{sessions.length !== 1 ? "s" : ""}…</p>
          </div>
        )}

        {hasAnyData && (
          <>
            {/* Stat tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { icon: <CheckCircle2 className="w-7 h-7 text-pass" />,      count: passCount,   label: "Meets requirements",  cls: "border-pass/30 bg-pass/5",     filter: "PASS"   },
                { icon: <XCircle className="w-7 h-7 text-fail" />,           count: failCount,   label: "Does not meet",        cls: "border-fail/30 bg-fail/5",     filter: "FAIL"   },
                { icon: <Clock className="w-7 h-7 text-review" />,           count: reviewCount, label: "Agent review needed",  cls: "border-review/30 bg-review/5", filter: "REVIEW" },
                { icon: <Minus className="w-7 h-7 text-muted-foreground" />, count: otherCount,  label: "Not alcohol label",    cls: "border-border bg-muted/30",    filter: "OTHER"  },
              ].map(({ icon, count, label, cls, filter }) => (
                <button
                  key={label}
                  onClick={() => setStatusFilter(statusFilter === filter ? "ALL" : filter)}
                  className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 transition-opacity text-left ${cls} ${statusFilter === filter ? "ring-2 ring-primary" : "hover:opacity-80"}`}
                >
                  {icon}
                  <div>
                    <p className="text-2xl font-black tabular-nums leading-none">{count}</p>
                    <p className="text-xs font-bold text-muted-foreground mt-0.5">{label}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Search + filter bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">
                  {filteredResults.length} of {flatResults.length} label{flatResults.length !== 1 ? "s" : ""}
                </span>
                {statusFilter !== "ALL" && (
                  <button onClick={() => setStatusFilter("ALL")} className="text-xs text-primary font-semibold hover:underline">Clear filter</button>
                )}
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by file or brand…"
                  className="pl-9 h-9 text-sm"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Table */}
            <div className="border-2 border-border rounded-xl overflow-hidden shadow-sm bg-card">
              <table className="w-full text-left">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground w-12">Img</th>
                    <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Label / Brand</th>
                    <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Session</th>
                    <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Type</th>
                    <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Result</th>
                    <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-14 text-center text-muted-foreground">
                        No labels match your search or filter.
                      </td>
                    </tr>
                  ) : filteredResults.map((result) => {
                    const action = reviewActions[result.labelId] ?? null;
                    const dStyle = action ? DECISION_STYLES[action.decision as ReviewDecision] : null;
                    const sessionLabel = result.sessionFileName
                      ? result.sessionFileName.replace(/\.csv$/, "")
                      : result.sessionType === "csv"    ? "CSV Import"
                      : result.sessionType === "batch"  ? "Batch"
                      : result.sessionType === "single" ? "Single"
                      : "Generated";
                    return (
                      <tr key={result.labelId} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-3 py-2.5">
                          {thumbnails[result.labelId] ? (
                            <button onClick={() => setLightbox({ src: fullImages[result.labelId] ?? thumbnails[result.labelId], alt: result.fileName })}>
                              <img
                                src={thumbnails[result.labelId]}
                                alt={result.fileName}
                                className="h-12 w-8 object-contain rounded border border-border bg-white shadow-sm hover:shadow-md hover:scale-105 transition-transform cursor-zoom-in"
                              />
                            </button>
                          ) : (
                            <div className="h-12 w-8 flex items-center justify-center rounded border border-border bg-muted text-muted-foreground/40">
                              <ImageOff className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-sm text-foreground truncate max-w-[160px]" title={result.fileName}>{result.fileName}</p>
                          {result.brandName.extractedValue
                            ? <span className="text-xs text-muted-foreground font-mono">{result.brandName.extractedValue}</span>
                            : <span className="text-xs text-muted-foreground italic">Brand not detected</span>}
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          <span className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded font-medium">
                            {sessionLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded font-medium">
                            {result.beverageType || "Unknown"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={result.overallStatus} />
                          {action && dStyle && (
                            <p className={`text-[10px] font-semibold mt-0.5 ${dStyle.text}`}>
                              {(DECISION_LABELS as Record<string, string>)[action.decision]}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Link href={`/results/${result.sessionId}/${result.labelId}`}>
                            <Button size="sm" className="text-xs font-semibold">Review</Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-muted-foreground text-right">
              {flatResults.length} total label{flatResults.length !== 1 ? "s" : ""} across {loadedCount} session{loadedCount !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
