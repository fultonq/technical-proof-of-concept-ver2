// Lightweight localStorage-backed history of processed label sessions.
// Survives page refreshes but NOT server restarts (session data lives in the
// server's in-memory store — intentional for the PoC).

const STORAGE_KEY = "ttb_session_history";

// ── Active session ID ─────────────────────────────────────────────────────────
// A single "current session" accumulates all labels uploaded in this browser
// session, regardless of upload mode (single / batch / generate / CSV).
// Creating a new session starts a fresh accumulator.

const ACTIVE_SESSION_KEY = "ttb_active_session_id";

/** Returns the current active session ID, creating one if none exists yet. */
export function getOrCreateActiveSessionId(): string {
  try {
    let id = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ACTIVE_SESSION_KEY, id);
    }
    return id;
  } catch {
    // Storage unavailable — return an ephemeral ID (labels will still work,
    // just won't persist across refreshes).
    return crypto.randomUUID();
  }
}

/** Mints a new active session ID and persists it, discarding the old one. */
export function resetActiveSessionId(): string {
  try {
    const id = crypto.randomUUID();
    localStorage.setItem(ACTIVE_SESSION_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
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
