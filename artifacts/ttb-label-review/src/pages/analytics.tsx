import React from "react";
import { Link } from "wouter";
import { useQueries } from "@tanstack/react-query";
import type {
  BatchAnalysisResult, LabelAnalysisResult, FieldResult, SameFieldOfVisionResult,
} from "@workspace/api-client-react";
import { getGetSessionResultsQueryKey } from "@workspace/api-client-react";
import { getSessions, type SessionRecord } from "@/lib/session-history";
import { getSessionReviewActions } from "@/lib/review-actions";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Loader2, FolderOpen, TrendingUp, CheckCircle2,
  BarChart2, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Colour tokens (match Tailwind theme) ──────────────────────────────────────
const C = {
  pass:   "#16a34a",
  fail:   "#dc2626",
  review: "#d97706",
  blue:   "#3b82f6",
  purple: "#8b5cf6",
  muted:  "#6b7280",
};

// ── Typed field accessors ─────────────────────────────────────────────────────
// Each entry: [display label, accessor that returns FieldResult | null | undefined]
// sameFieldOfVision is excluded here — it's SameFieldOfVisionResult (different shape)
const FIELD_ACCESSORS: Array<[string, (r: LabelAnalysisResult) => FieldResult | null | undefined]> = [
  ["Brand Name",        r => r.brandName],
  ["Class / Type",      r => r.classType],
  ["Alcohol Content",   r => r.alcoholContent],
  ["Net Contents",      r => r.netContents],
  ["Gov. Warning",      r => r.governmentWarning],
  ["Bottler / Producer",r => r.bottlerProducer],
  ["Label Language",    r => r.labelLanguage],
  ["Prohibited Surface",r => r.prohibitedSurface],
  ["Country of Origin", r => r.countryOfOrigin],
  ["Appellation",       r => r.appellationOfOrigin],
  ["Sulfite Declaration",r => r.sulfiteDeclaration],
];

// ── Types ──────────────────────────────────────────────────────────────────────
interface FlatResult extends LabelAnalysisResult {
  sessionCreatedAt: string;
}

// ── Fetcher ────────────────────────────────────────────────────────────────────
async function fetchSession(sessionId: string): Promise<BatchAnalysisResult> {
  const res = await fetch(`/api/v1/labels/session/${sessionId}`);
  if (!res.ok) throw new Error("unavailable");
  return res.json();
}

// ── Cross-session data hook ────────────────────────────────────────────────────
function useAnalyticsData() {
  const [sessions] = React.useState<SessionRecord[]>(() => getSessions());

  const queries = useQueries({
    queries: sessions.map(s => ({
      queryKey: getGetSessionResultsQueryKey(s.sessionId),
      queryFn: () => fetchSession(s.sessionId),
      retry: false,
    })),
  });

  const isLoading        = queries.some(q => q.isLoading);
  const hasAnyData       = queries.some(q => !!q.data);
  const unavailableCount = queries.filter(q => q.isError).length;

  const flatResults = React.useMemo<FlatResult[]>(() => {
    const out: FlatResult[] = [];
    queries.forEach((q, idx) => {
      if (!q.data) return;
      for (const r of q.data.results) {
        out.push({ ...r, sessionCreatedAt: sessions[idx].createdAt });
      }
    });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map(q => q.status).join(","), sessions]);

  const reviewActions = React.useMemo(
    () => getSessionReviewActions(flatResults.map(r => r.labelId)),
    [flatResults],
  );

  return { sessions, flatResults, reviewActions, isLoading, hasAnyData, unavailableCount };
}

// ── Aggregation ────────────────────────────────────────────────────────────────
interface FailureEntry { field: string; rate: number; failed: number; counted: number }

function computeMetrics(
  flatResults: FlatResult[],
  reviewActions: ReturnType<typeof getSessionReviewActions>,
) {
  const total       = flatResults.length;
  const passCount   = flatResults.filter(r => r.overallStatus === "PASS").length;
  const failCount   = flatResults.filter(r => r.overallStatus === "FAIL").length;
  const reviewCount = flatResults.filter(r => r.overallStatus === "REVIEW").length;
  const passRate    = total > 0 ? Math.round((passCount / total) * 100) : 0;

  // Status donut
  const statusPieData = [
    { name: `Pass (${passCount})`,           value: passCount,   pct: total ? Math.round(passCount   / total * 100) : 0, color: C.pass   },
    { name: `Fail (${failCount})`,           value: failCount,   pct: total ? Math.round(failCount   / total * 100) : 0, color: C.fail   },
    { name: `Needs Review (${reviewCount})`, value: reviewCount, pct: total ? Math.round(reviewCount / total * 100) : 0, color: C.review },
  ].filter(d => d.value > 0);

  // Review decisions
  const actionValues          = Object.values(reviewActions);
  const approvedCount         = actionValues.filter(a => a.decision === "APPROVED").length;
  const overrideApprovedCount = actionValues.filter(a => a.decision === "OVERRIDE_APPROVED").length;
  const correctionIssuedCount = actionValues.filter(a => a.decision === "CORRECTION_ISSUED").length;
  const pendingCount          = total - Object.keys(reviewActions).length;

  const actionBarData = [
    { name: "Approved",          value: approvedCount,         fill: C.pass   },
    { name: "Override Approved", value: overrideApprovedCount, fill: C.review },
    { name: "Correction Issued", value: correctionIssuedCount, fill: C.fail   },
    { name: "Pending",           value: pendingCount,          fill: C.muted  },
  ].filter(d => d.value > 0);

  // By beverage type — stacked bars
  const byTypeData = (["SPIRITS", "WINE", "MALT", "UNKNOWN"] as const)
    .map(type => {
      const labels = flatResults.filter(r => r.beverageType === type);
      if (!labels.length) return null;
      return {
        name:   type === "UNKNOWN" ? "Unknown" : type.charAt(0) + type.slice(1).toLowerCase(),
        Pass:   labels.filter(r => r.overallStatus === "PASS").length,
        Fail:   labels.filter(r => r.overallStatus === "FAIL").length,
        Review: labels.filter(r => r.overallStatus === "REVIEW").length,
      };
    })
    .filter(Boolean) as Array<{ name: string; Pass: number; Fail: number; Review: number }>;

  // ── Field failure rates ────────────────────────────────────────────────────
  // FieldResult fields: read matchStatus ("PASS" | "FAIL" | "NEEDS_REVIEW" | "NOT_APPLICABLE")
  const fieldFailData: FailureEntry[] = [];

  for (const [label, accessor] of FIELD_ACCESSORS) {
    let failed = 0, counted = 0;
    for (const r of flatResults) {
      const f: FieldResult | null | undefined = accessor(r);
      if (f == null || f.matchStatus === "NOT_APPLICABLE") continue;
      counted++;
      if (f.matchStatus === "FAIL" || f.matchStatus === "NEEDS_REVIEW") failed++;
    }
    if (!counted) continue;
    fieldFailData.push({ field: label, rate: Math.round((failed / counted) * 100), failed, counted });
  }

  // sameFieldOfVision — SameFieldOfVisionResult uses `compliant: boolean`, no matchStatus
  // null means "not applicable" (WINE/MALT); only SPIRITS labels have this set
  {
    let sfovFailed = 0, sfovCounted = 0;
    for (const r of flatResults) {
      const sfov: SameFieldOfVisionResult | null | undefined = r.sameFieldOfVision;
      if (sfov == null) continue; // null/undefined = not applicable for this beverage type
      sfovCounted++;
      if (!sfov.compliant) sfovFailed++;
    }
    if (sfovCounted > 0) {
      fieldFailData.push({
        field:   "Same Field of Vision",
        rate:    Math.round((sfovFailed / sfovCounted) * 100),
        failed:  sfovFailed,
        counted: sfovCounted,
      });
    }
  }

  fieldFailData.sort((a, b) => b.rate - a.rate);

  const topFailedField = fieldFailData[0]?.field ?? "—";

  // Monthly trend (grouped by session createdAt)
  const monthMap = new Map<string, { pass: number; fail: number; review: number; total: number }>();
  for (const r of flatResults) {
    const d   = new Date(r.sessionCreatedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthMap.get(key) ?? { pass: 0, fail: 0, review: 0, total: 0 };
    bucket.total++;
    if (r.overallStatus === "PASS")        bucket.pass++;
    else if (r.overallStatus === "FAIL")   bucket.fail++;
    else                                    bucket.review++;
    monthMap.set(key, bucket);
  }
  const monthlyData = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month,
      Pass:     d.pass,
      Fail:     d.fail,
      Review:   d.review,
      "Pass %": d.total ? Math.round((d.pass / d.total) * 100) : 0,
    }));

  // Most common beverage type
  const typeCount = flatResults.reduce<Record<string, number>>((acc, r) => {
    const t = r.beverageType ?? "UNKNOWN";
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const mostCommonType = Object.entries(typeCount).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "—";
  const mostCommonTypeLabel =
    mostCommonType === "UNKNOWN" ? "Unknown"
    : mostCommonType.charAt(0) + mostCommonType.slice(1).toLowerCase();

  return {
    total, passCount, failCount, reviewCount, passRate,
    statusPieData, actionBarData, byTypeData, fieldFailData, monthlyData,
    topFailedField, mostCommonTypeLabel,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon, color,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <div className="rounded-xl border-2 border-border bg-card p-5 flex items-center gap-4">
      <div
        className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
        style={{ background: `${color}1a` }}
      >
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black leading-none tabular-nums text-foreground">{value}</p>
        <p className="text-sm font-semibold text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate" title={sub}>{sub}</p>}
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border-2 border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ChartTip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
      {label && <p className="font-semibold mb-1 text-foreground">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { sessions, flatResults, reviewActions, isLoading, hasAnyData, unavailableCount } =
    useAnalyticsData();

  const m = React.useMemo(
    () => computeMetrics(flatResults, reviewActions),
    [flatResults, reviewActions],
  );

  return (
    <div className="flex-1 flex flex-col">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="bg-card border-b border-border shadow-sm px-6 py-5 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Analytics</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Compliance trends across {sessions.length} session{sessions.length !== 1 ? "s" : ""}
              {unavailableCount > 0 && (
                <span className="ml-2 text-review font-medium">
                  · {unavailableCount} session{unavailableCount !== 1 ? "s" : ""} unavailable
                  {" "}(server restarted)
                </span>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* Empty state */}
        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="bg-muted rounded-full p-5 mb-2">
              <FolderOpen className="w-10 h-10 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold">No data yet</p>
            <p className="text-muted-foreground max-w-sm">
              Check some labels and come back here to see compliance analytics.
            </p>
            <Link href="/"><Button size="lg">Add Labels →</Button></Link>
          </div>
        )}

        {/* Loading */}
        {sessions.length > 0 && isLoading && !hasAnyData && (
          <div className="flex items-center justify-center gap-3 py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground font-medium">
              Loading {sessions.length} session{sessions.length !== 1 ? "s" : ""}…
            </p>
          </div>
        )}

        {/* ── Analytics content ─────────────────────────────────────────── */}
        {hasAnyData && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Labels Reviewed"
                value={m.total}
                icon={<BarChart2 className="w-6 h-6" />}
                color={C.blue}
              />
              <StatCard
                label="Overall Pass Rate"
                value={`${m.passRate}%`}
                sub={`${m.passCount} passed of ${m.total}`}
                icon={<CheckCircle2 className="w-6 h-6" />}
                color={C.pass}
              />
              <StatCard
                label="Top Failed Field"
                value={m.fieldFailData[0] ? `${m.fieldFailData[0].rate}%` : "—"}
                sub={m.topFailedField}
                icon={<AlertTriangle className="w-6 h-6" />}
                color={C.fail}
              />
              <StatCard
                label="Most Common Type"
                value={m.mostCommonTypeLabel}
                icon={<TrendingUp className="w-6 h-6" />}
                color={C.purple}
              />
            </div>

            {/* Status distribution + Review decisions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              <ChartCard title="Status Distribution">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={m.statusPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {m.statusPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as typeof m.statusPieData[0];
                        return (
                          <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
                            <p className="font-semibold text-foreground">{d.name}</p>
                            <p className="text-muted-foreground">{d.value} label{d.value !== 1 ? "s" : ""} ({d.pct}%)</p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Legend with counts + percentages */}
                <div className="flex justify-center gap-5 mt-2 flex-wrap">
                  {[
                    { label: "Pass",         count: m.passCount,   pct: m.total ? Math.round(m.passCount   / m.total * 100) : 0, color: C.pass   },
                    { label: "Fail",         count: m.failCount,   pct: m.total ? Math.round(m.failCount   / m.total * 100) : 0, color: C.fail   },
                    { label: "Needs Review", count: m.reviewCount, pct: m.total ? Math.round(m.reviewCount / m.total * 100) : 0, color: C.review },
                  ].map(({ label, count, pct, color }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-xs font-semibold text-muted-foreground">
                        {label}:{" "}
                        <strong className="text-foreground">{count}</strong>
                        <span className="text-muted-foreground/70 ml-1">({pct}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </ChartCard>

              <ChartCard
                title="Review Decisions"
                subtitle="Actions taken by reviewers on processed labels"
              >
                {m.actionBarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={m.actionBarData}
                      layout="vertical"
                      margin={{ left: 8, right: 40, top: 4, bottom: 4 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={145} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="value" name="Labels" radius={[0, 4, 4, 0]}>
                        {m.actionBarData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground italic">
                    No review decisions recorded yet
                  </div>
                )}
              </ChartCard>
            </div>

            {/* By beverage type */}
            {m.byTypeData.length > 0 && (
              <ChartCard
                title="Results by Beverage Type"
                subtitle="PASS / FAIL / NEEDS REVIEW breakdown per beverage category"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={m.byTypeData}
                    margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip content={<ChartTip />} />
                    <Legend iconType="circle" iconSize={8} />
                    <Bar dataKey="Pass"   stackId="a" fill={C.pass}   radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Review" stackId="a" fill={C.review} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Fail"   stackId="a" fill={C.fail}   radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Field failure ranking */}
            {m.fieldFailData.length > 0 && (
              <ChartCard
                title="Compliance Field Failure Rate"
                subtitle="% of labels where each field was FAIL or NEEDS REVIEW — top 3 highlighted in red"
              >
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(220, m.fieldFailData.length * 36)}
                >
                  <BarChart
                    data={m.fieldFailData}
                    layout="vertical"
                    margin={{ left: 8, right: 52, top: 4, bottom: 4 }}
                  >
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tickFormatter={v => `${v}%`}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      dataKey="field"
                      type="category"
                      tick={{ fontSize: 11 }}
                      width={152}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = m.fieldFailData.find(f => f.field === label);
                        return (
                          <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
                            <p className="font-semibold mb-1 text-foreground">{label}</p>
                            <p className="text-muted-foreground">{payload[0].value}% failure rate</p>
                            {d && (
                              <p className="text-muted-foreground">
                                {d.failed} of {d.counted} labels checked
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="rate" name="Failure rate %" radius={[0, 4, 4, 0]}>
                      {m.fieldFailData.map((_, i) => (
                        <Cell key={i} fill={i < 3 ? C.fail : i < 6 ? C.review : C.muted} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Monthly trends — only show when ≥2 distinct months of data */}
            {m.monthlyData.length >= 2 && (
              <ChartCard
                title="Trends Over Time"
                subtitle="Label volume and pass/fail counts by month (right axis = pass rate %)"
              >
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart
                    data={m.monthlyData}
                    margin={{ top: 4, right: 32, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left"  tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={v => `${v}%`}
                      tick={{ fontSize: 11 }}
                      domain={[0, 100]}
                    />
                    <Tooltip content={<ChartTip />} />
                    <Legend iconType="circle" iconSize={8} />
                    <Line
                      yAxisId="left"  type="monotone" dataKey="Pass"
                      stroke={C.pass}   strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}
                    />
                    <Line
                      yAxisId="left"  type="monotone" dataKey="Fail"
                      stroke={C.fail}   strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}
                    />
                    <Line
                      yAxisId="left"  type="monotone" dataKey="Review"
                      stroke={C.review} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }}
                    />
                    <Line
                      yAxisId="right" type="monotone" dataKey="Pass %"
                      stroke={C.blue}   strokeWidth={2} strokeDasharray="8 4" dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Single-month notice */}
            {m.monthlyData.length === 1 && (
              <div className="rounded-xl border-2 border-border bg-card p-5 text-sm text-muted-foreground text-center">
                All labels were checked in the same month — trends will appear once you have data across multiple months.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
