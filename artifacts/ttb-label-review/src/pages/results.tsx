import React from "react";
import { useRoute, Link } from "wouter";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ResultsPage() {
  const [, params] = useRoute("/results/:sessionId");
  const sessionId = params?.sessionId || "";

  const { data: sessionData, isLoading, isError, error } = useGetSessionResults(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionResultsQueryKey(sessionId) },
  });

  const [searchTerm, setSearchTerm] = React.useState("");

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

  const filteredResults = sessionData.results.filter(
    (r) =>
      r.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.brandName.extractedValue?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="flex-1 flex flex-col">

      {/* ── Summary bar ─────────────────────────────────────────────────── */}
      <div className="bg-card border-b border-border shadow-sm">
        <div className="max-w-6xl mx-auto w-full p-6">

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <Link href="/" className="inline-flex items-center gap-1 text-base text-muted-foreground hover:text-primary mb-2">
                <ArrowLeft className="w-4 h-4" /> Upload another label
              </Link>
              <h2 className="text-3xl font-bold text-foreground">Review Results</h2>
              <p className="text-base text-muted-foreground mt-1">
                {sessionData.totalCount} label{sessionData.totalCount !== 1 ? "s" : ""} checked in this session
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                variant="outline"
                className="text-base font-semibold"
                onClick={() => exportSessionToCSV(sessionData.results, `ttb-report-${sessionId}.csv`)}
              >
                <Download className="w-5 h-5 mr-2" /> Download CSV
              </Button>
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

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
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

        <div className="border-2 border-border rounded-2xl overflow-hidden shadow-sm bg-card">
          <table className="w-full text-left">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Label File</th>
                <th className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Brand Found</th>
                <th className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">AI Result</th>
                <th className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Issues</th>
                <th className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Decision</th>
                <th className="px-5 py-4 text-sm font-bold uppercase tracking-wider text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-lg text-muted-foreground">
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
                          <td colSpan={6} className="px-5 py-4 bg-secondary/10 border-b border-primary/10">
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
