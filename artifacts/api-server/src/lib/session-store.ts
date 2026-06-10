import type { LabelAnalysisResult } from "./label-types.js";

// In-memory session store keyed by sessionId → ordered list of label results.
//
// Design choice (PoC): pure in-memory Map — no database, no persistence.
// All sessions and results are lost on server restart. This is intentional for
// the proof-of-concept phase; a production deployment would replace this with a
// database-backed store (e.g. PostgreSQL via Drizzle, or Redis).
//
// There is no TTL or eviction policy — sessions accumulate for the lifetime of the
// process. For a PoC with low traffic this is acceptable; long-running production
// deployments would need periodic cleanup.
const sessionStore = new Map<string, LabelAnalysisResult[]>();

// Appends a label result to the session's result list, creating the list if needed.
export function addToSession(sessionId: string, result: LabelAnalysisResult): void {
  const existing = sessionStore.get(sessionId) ?? [];
  existing.push(result);
  sessionStore.set(sessionId, existing);
}

// Returns the ordered list of results for a session, or undefined if the sessionId
// is unknown (e.g. after a server restart or a typo in the ID).
export function getSession(sessionId: string): LabelAnalysisResult[] | undefined {
  return sessionStore.get(sessionId);
}

// Scans all sessions to find a single label by its labelId.
// O(n) across all stored results — acceptable for PoC volumes.
// Edge case: labelIds are UUIDs so collisions are astronomically unlikely, but this
// returns the first match found if two sessions somehow share a labelId.
export function getLabelById(labelId: string): LabelAnalysisResult | undefined {
  for (const results of sessionStore.values()) {
    const found = results.find((r) => r.labelId === labelId);
    if (found) return found;
  }
  return undefined;
}

// Removes a session and all its results. Returns true if the session existed.
export function deleteSession(sessionId: string): boolean {
  return sessionStore.delete(sessionId);
}
