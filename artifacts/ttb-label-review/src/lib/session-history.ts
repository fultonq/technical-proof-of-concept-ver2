// Lightweight localStorage-backed history of processed label sessions.
// Survives page refreshes but NOT server restarts (session data lives in the
// server's in-memory store — intentional for the PoC).

const STORAGE_KEY = "ttb_session_history";
const MAX_ENTRIES = 20;

export interface SessionRecord {
  sessionId: string;
  createdAt: string;
  type: "csv" | "batch" | "single" | "generate";
  labelCount: number;
  fileName?: string;
}

/** Upsert a session into the history list (most-recent first, deduped by sessionId). */
export function saveSession(record: Omit<SessionRecord, "createdAt">): void {
  const existing = getSessions().filter(s => s.sessionId !== record.sessionId);
  const next: SessionRecord[] = [
    { ...record, createdAt: new Date().toISOString() },
    ...existing,
  ].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

/** Return all saved sessions, most-recent first. */
export function getSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionRecord[]) : [];
  } catch {
    return [];
  }
}

/** Remove all saved sessions from localStorage. */
export function clearSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
