import React from "react";
import { useRoute, Link } from "wouter";
import { useGetSessionResults } from "@workspace/api-client-react";
import { getGetSessionResultsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { Button } from "@/components/ui/button";
import { exportSessionToCSV } from "@/lib/csv-export";
import { ArrowLeft, Download, Plus, Search, Filter, Loader2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ResultsPage() {
  const [, params] = useRoute("/results/:sessionId");
  const sessionId = params?.sessionId || "";
  
  const { data: sessionData, isLoading, isError, error, refetch } = useGetSessionResults(sessionId, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetSessionResultsQueryKey(sessionId),
    }
  });

  const [searchTerm, setSearchTerm] = React.useState("");

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <h2 className="text-xl font-semibold">Loading Session Data...</h2>
        <p className="text-muted-foreground mt-2">Retrieving compliance results for {sessionId}</p>
      </div>
    );
  }

  if (isError || !sessionData) {
    return (
      <div className="flex-1 p-8 max-w-4xl mx-auto w-full">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Could not load session results. {(error as any)?.message || "Unknown error occurred."}
          </AlertDescription>
        </Alert>
        <div className="mt-6">
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Upload
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const filteredResults = sessionData.results.filter(r => 
    r.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.brandName.extractedValue?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-card border-b border-border p-6 shadow-sm">
        <div className="max-w-7xl mx-auto w-full">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Link href="/" className="hover:text-primary transition-colors flex items-center">
                  <ArrowLeft className="w-3 h-3 mr-1" /> Upload
                </Link>
                <span>/</span>
                <span className="font-mono">{sessionId.substring(0, 8)}...</span>
              </div>
              <h2 className="text-2xl font-bold">Session Overview</h2>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => exportSessionToCSV(sessionData.results, `ttb-report-${sessionId}.csv`)}>
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </Button>
              <Link href="/">
                <Button>
                  <Plus className="w-4 h-4 mr-2" /> Upload More
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border border-border rounded-md p-4 bg-background">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Total Analyzed</p>
              <p className="text-3xl font-bold tabular-nums">{sessionData.totalCount}</p>
            </div>
            <div className="border border-pass/30 rounded-md p-4 bg-pass/5">
              <p className="text-sm font-medium text-pass uppercase tracking-wider mb-1">Pass</p>
              <p className="text-3xl font-bold tabular-nums text-pass">{sessionData.passCount}</p>
            </div>
            <div className="border border-review/30 rounded-md p-4 bg-review/5">
              <p className="text-sm font-medium text-review uppercase tracking-wider mb-1">Needs Review</p>
              <p className="text-3xl font-bold tabular-nums text-review">{sessionData.reviewCount}</p>
            </div>
            <div className="border border-fail/30 rounded-md p-4 bg-fail/5">
              <p className="text-sm font-medium text-fail uppercase tracking-wider mb-1">Fail</p>
              <p className="text-3xl font-bold tabular-nums text-fail">{sessionData.failCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Analyzed Labels</h3>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Search by file or brand..." 
                className="pl-9 h-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground font-medium border-b border-border uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Brand (Extracted)</th>
                  <th className="px-4 py-3">Beverage Type</th>
                  <th className="px-4 py-3">Overall Status</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Flags</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      No labels found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((result) => (
                    <tr key={result.labelId} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground truncate max-w-[200px]" title={result.fileName}>
                        {result.fileName}
                      </td>
                      <td className="px-4 py-3 truncate max-w-[200px]">
                        {result.brandName.extractedValue || <span className="text-muted-foreground italic">None detected</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {result.beverageType}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={result.overallStatus} />
                      </td>
                      <td className="px-4 py-3 w-40">
                        <ConfidenceBar score={result.confidenceScore} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {result.flags.length > 0 ? (
                          <span className="inline-flex items-center justify-center bg-muted px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums">
                            {result.flags.length}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/results/${sessionId}/${result.labelId}`}>
                          <Button variant="secondary" size="sm" className="font-semibold text-xs h-8">
                            View Detail
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}