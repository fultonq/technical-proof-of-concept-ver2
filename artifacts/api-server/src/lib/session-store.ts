import { db, labelResults } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import type { LabelAnalysisResult } from "./label-types.js";

// Dual-mode session store:
//   • PostgreSQL via Drizzle ORM when DATABASE_URL is set
//   • In-memory Map fallback when DATABASE_URL is absent (e.g. Render without a DB add-on)
//
// All public functions are async so callers are identical in both modes.

const memStore = new Map<string, LabelAnalysisResult[]>();

function useMemory(): boolean {
  return db === null;
}

export async function addToSession(
  sessionId: string,
  result: LabelAnalysisResult,
): Promise<void> {
  if (useMemory()) {
    const existing = memStore.get(sessionId) ?? [];
    existing.push(result);
    memStore.set(sessionId, existing);
    return;
  }
  await db!.insert(labelResults).values({
    labelId: result.labelId,
    sessionId,
    result,
  });
}

export async function getSession(
  sessionId: string,
): Promise<LabelAnalysisResult[] | undefined> {
  if (useMemory()) {
    return memStore.get(sessionId);
  }
  const rows = await db!
    .select()
    .from(labelResults)
    .where(eq(labelResults.sessionId, sessionId))
    .orderBy(labelResults.analyzedAt);

  if (rows.length === 0) return undefined;
  return rows.map((r) => r.result as LabelAnalysisResult);
}

export async function getLabelById(
  labelId: string,
): Promise<LabelAnalysisResult | undefined> {
  if (useMemory()) {
    for (const results of memStore.values()) {
      const found = results.find((r) => r.labelId === labelId);
      if (found) return found;
    }
    return undefined;
  }
  const rows = await db!
    .select()
    .from(labelResults)
    .where(eq(labelResults.labelId, labelId))
    .limit(1);

  if (rows.length === 0) return undefined;
  return rows[0]!.result as LabelAnalysisResult;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  if (useMemory()) {
    return memStore.delete(sessionId);
  }
  const deleted = await db!
    .delete(labelResults)
    .where(eq(labelResults.sessionId, sessionId))
    .returning({ labelId: labelResults.labelId });

  return deleted.length > 0;
}

// Warm-up: verify connectivity (or log that we're running in-memory mode).
export async function initSessionStore(): Promise<void> {
  if (useMemory()) {
    logger.warn(
      "DATABASE_URL is not set — session store running in-memory. " +
      "Results will be lost on server restart. Set DATABASE_URL to enable persistence.",
    );
    return;
  }
  try {
    await db!.select({ labelId: labelResults.labelId }).from(labelResults).limit(1);
    logger.info("Session store: PostgreSQL backend ready");
  } catch (err) {
    logger.error({ err }, "Session store: DB connectivity check failed");
    throw err;
  }
}

// Returns all stored results across all sessions (used by /all-results endpoint).
export async function getAllResults(): Promise<LabelAnalysisResult[]> {
  if (useMemory()) {
    return Array.from(memStore.values()).flat();
  }
  const rows = await db!
    .select()
    .from(labelResults)
    .orderBy(labelResults.analyzedAt);
  return rows.map((r) => r.result as LabelAnalysisResult);
}
