import React from "react";
import { useLocation } from "wouter";
import { useGetSessionResults, getGetSessionResultsQueryKey } from "@workspace/api-client-react";
import { getSessions, clearSessions, type SessionRecord } from "@/lib/session-history";
import { exportSessionToCSV } from "@/lib/csv-export";
import { generatePrintReport } from "@/lib/print-report";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Download, Printer, ClipboardList, FileBarChart2,
  CheckCircle2, XCircle, Clock, Loader2, AlertCircle, Trash2,
  FolderOpen,
} from "lucide-react";

// ── Beverage type display metadata ───────────────────────────────────────────

const TYPE_META: Record<string, { label: string; colorClass: string }> = {
  SPIRITS: { label: "Distilled Spirits",    colorClass: "text-purple-600" },
  WINE:    { label: "Wine",                 colorClass: "text-blue-600" },
  MALT:    { label: "Beer / Malt Beverage", colorClass: "text-amber-600" },
  UNKNOWN: { label: "Unknown",              colorClass: "text-gray-500" },
};

const TYPE_ORDER = ["SPIRITS", "WINE", "MALT", "UNKNOWN"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function Stat({
  label, value, colorClass = "text-foreground",
}: { label: string; value: number; colorClass?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-3xl font-black font-mono leading-none ${colorClass}`}>{value}</span>
      <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{label}</span>
    </div>
  );
}

function SectionCard({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border-2 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <p className="font-bold text-base">{title}</p>
      </div>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ManagePage() {
  const [, setLocation] = useLocation();
  const [sessions, setSessions] = React.useState<SessionRecord[]>(() => getSessions());
  const [selectedId, setSelectedId] = React.useState<string | null>(
    () => getSessions()[0]?.sessionId ?? null,
  );

  const { data: sessionData, isLoading, isError } = useGetSessionResults(selectedId ?? "", {
    query: { enabled: !!selectedId, queryKey: getGetSessionResultsQueryKey(selectedId ?? "") },
  });

  // ── Derived: breakdown by beverage type ──────────────────────────────────
  const byType = React.useMemo(() => {
    if (!sessionData?.results) return {} as Record<string, { total: number; pass: number; fail: number; review: number }>;
    return sessionData.results.reduce(
      (acc, r) => {
        const type = (r.beverageType as string) || "UNKNOWN";
        if (!acc[type]) acc[type] = { total: 0, pass: 0, fail: 0, review: 0 };
        acc[type].total++;
        if (r.overallStatus === "PASS")        acc[type].pass++;
        else if (r.overallStatus === "FAIL")   acc[type].fail++;
        else                                   acc[type].review++;
        return acc;
      },
      {} as Record<string, { total: number; pass: number; fail: number; review: number }>,
    );
  }, [sessionData]);

  const typeEntries = TYPE_ORDER
    .filter(t => byType[t])
    .map(t => ({ type: t, counts: byType[t], meta: TYPE_META[t] ?? { label: t, colorClass: "text-foreground" } }));

  // ── Handlers ──────────────────────────────────────────────────────────────
  const printReport = () => {
    if (!sessionData?.results || !selectedId) return;
    const html = generatePrintReport(sessionData, {}, selectedId, {});
    const win = window.open("", "_blank");
    if (!win) { alert("Pop-up blocked — please allow pop-ups and try again."); return; }
    win.document.write(html);
    win.document.close();
    win.print();
  };

  const handleClear = () => {
    clearSessions();
    setSessions([]);
    setSelectedId(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const isEmpty = sessions.length === 0;

  return (
    <div className="flex-1 p-6 md:p-12 max-w-3xl mx-auto w-full">

      {/* Page header */}
      <div className="flex items-start gap-4 mb-8">
        <button
          onClick={() => setLocation("/")}
          className="mt-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Back to Check a Label"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">My Batches</h2>
          <p className="text-lg text-muted-foreground mt-1">
            Review saved batches, generate reports, and inspect results by beverage type.
          </p>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="bg-muted rounded-full p-5 mb-2">
            <FolderOpen className="w-10 h-10 text-muted-foreground" />
          </div>
          <p className="text-xl font-bold">No sessions yet</p>
          <p className="text-muted-foreground max-w-sm text-base">
            Process labels using CSV Import, Multiple Labels, or One Label —
            sessions are saved here automatically.
          </p>
          <Button size="lg" onClick={() => setLocation("/")}>
            Check Labels →
          </Button>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Session list */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Sessions ({sessions.length})
            </p>
            <div className="border-2 rounded-xl overflow-hidden divide-y bg-card">
              {sessions.map(s => {
                const isSelected = s.sessionId === selectedId;
                const modeLabel =
                  s.type === "csv"      ? "CSV Import" :
                  s.type === "batch"    ? "Multiple Labels" :
                  s.type === "single"   ? "One Label" :
                                         "Generate Label Image";
                const dateStr = new Date(s.createdAt).toLocaleString();
                return (
                  <button
                    key={s.sessionId}
                    onClick={() => setSelectedId(s.sessionId)}
                    className={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors ${
                      isSelected
                        ? "bg-primary/5 border-l-[3px] border-l-primary"
                        : "hover:bg-secondary/30"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{s.fileName || modeLabel}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {modeLabel} · {s.labelCount} label{s.labelCount !== 1 ? "s" : ""} · {dateStr}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="ml-3 shrink-0 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleClear}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" /> Clear history
            </button>
          </div>

          {/* Per-session content */}
          {selectedId && (
            <>
              {isLoading && (
                <div className="flex items-center gap-3 py-10 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm font-medium">Loading session data…</span>
                </div>
              )}

              {isError && (
                <div className="flex items-start gap-3 bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Session data unavailable</p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      The server may have restarted since this session was created.
                      Data is not persisted between server restarts in this PoC.
                    </p>
                  </div>
                </div>
              )}

              {sessionData?.results && (
                <div className="space-y-4">

                  {/* ── Report ─────────────────────────────────────────── */}
                  <SectionCard
                    icon={<FileBarChart2 className="w-5 h-5" />}
                    title="Report"
                  >
                    {/* Summary counts */}
                    <div className="flex items-center gap-8 flex-wrap py-1">
                      <Stat label="Total"  value={sessionData.totalCount} />
                      <Stat label="Pass"   value={sessionData.passCount}   colorClass="text-pass" />
                      <Stat label="Fail"   value={sessionData.failCount}   colorClass="text-fail" />
                      <Stat label="Review" value={sessionData.reviewCount} colorClass="text-review" />
                    </div>

                    {/* Progress bar */}
                    {sessionData.totalCount > 0 && (
                      <div className="h-2 bg-muted rounded-full overflow-hidden flex gap-px">
                        <div
                          className="bg-pass transition-all"
                          style={{ width: `${(sessionData.passCount / sessionData.totalCount) * 100}%` }}
                        />
                        <div
                          className="bg-fail transition-all"
                          style={{ width: `${(sessionData.failCount / sessionData.totalCount) * 100}%` }}
                        />
                        <div
                          className="bg-review transition-all"
                          style={{ width: `${(sessionData.reviewCount / sessionData.totalCount) * 100}%` }}
                        />
                      </div>
                    )}

                    {/* Report actions */}
                    <div className="flex gap-3 flex-wrap">
                      <Button
                        variant="outline"
                        onClick={() =>
                          exportSessionToCSV(
                            sessionData.results,
                            `ttb-report-${selectedId.slice(0, 8)}.csv`,
                          )
                        }
                      >
                        <Download className="w-4 h-4 mr-2" /> Download CSV
                      </Button>
                      <Button variant="outline" onClick={printReport}>
                        <Printer className="w-4 h-4 mr-2" /> Print Report
                      </Button>
                    </div>
                  </SectionCard>

                  {/* ── Report by Type ─────────────────────────────────── */}
                  <SectionCard
                    icon={<ClipboardList className="w-5 h-5" />}
                    title="Report by Type"
                  >
                    {typeEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No beverage type data available.</p>
                    ) : (
                      <div className="border rounded-lg overflow-hidden divide-y text-sm">
                        {/* Header */}
                        <div className="grid grid-cols-[1fr_60px_60px_80px_80px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          <span>Beverage Type</span>
                          <span className="text-right">Total</span>
                          <span className="text-right text-pass">Pass</span>
                          <span className="text-right text-fail">Fail</span>
                          <span className="text-right text-review">Review</span>
                        </div>
                        {typeEntries.map(({ type, counts, meta }) => (
                          <div
                            key={type}
                            className="grid grid-cols-[1fr_60px_60px_80px_80px] gap-2 px-3 py-2.5 hover:bg-secondary/20"
                          >
                            <span className={`font-semibold ${meta.colorClass}`}>{meta.label}</span>
                            <span className="text-right font-mono font-bold">{counts.total}</span>
                            <span className="text-right font-mono font-semibold text-pass">{counts.pass}</span>
                            <span className="text-right font-mono font-semibold text-fail">{counts.fail}</span>
                            <span className="text-right font-mono font-semibold text-review">{counts.review}</span>
                          </div>
                        ))}
                        {/* Totals row */}
                        <div className="grid grid-cols-[1fr_60px_60px_80px_80px] gap-2 px-3 py-2 bg-muted/20 text-sm font-bold border-t-2">
                          <span className="text-muted-foreground">All Types</span>
                          <span className="text-right font-mono">{sessionData.totalCount}</span>
                          <span className="text-right font-mono text-pass">{sessionData.passCount}</span>
                          <span className="text-right font-mono text-fail">{sessionData.failCount}</span>
                          <span className="text-right font-mono text-review">{sessionData.reviewCount}</span>
                        </div>
                      </div>
                    )}
                  </SectionCard>

                  {/* ── Review Labels ───────────────────────────────────── */}
                  <SectionCard
                    icon={<CheckCircle2 className="w-5 h-5" />}
                    title="Review Labels"
                  >
                    <p className="text-sm text-muted-foreground">
                      Open the full review interface to approve, override, or flag individual
                      labels and add reviewer notes. Changes are saved to your browser automatically.
                    </p>
                    <div className="flex items-center gap-4 flex-wrap">
                      <Button onClick={() => setLocation(`/results/${selectedId}`)}>
                        Open Review Interface →
                      </Button>
                      {/* Quick status summary */}
                      <div className="flex items-center gap-3 text-sm">
                        <span className="flex items-center gap-1 text-pass font-semibold">
                          <CheckCircle2 className="w-4 h-4" /> {sessionData.passCount} pass
                        </span>
                        <span className="flex items-center gap-1 text-fail font-semibold">
                          <XCircle className="w-4 h-4" /> {sessionData.failCount} fail
                        </span>
                        <span className="flex items-center gap-1 text-review font-semibold">
                          <Clock className="w-4 h-4" /> {sessionData.reviewCount} review
                        </span>
                      </div>
                    </div>
                  </SectionCard>

                </div>
              )}
            </>
          )}

        </div>
      )}
    </div>
  );
}
