import { db, labelResults } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import type { LabelAnalysisResult } from "./label-types.js";

// PostgreSQL-backed session store using Drizzle ORM.
//
// Each label result is a row in the `label_results` table with columns:
//   label_id  — UUID primary key
//   session_id — groups results that belong to the same review batch
//   result    — JSONB blob of the full LabelAnalysisResult
//   analyzed_at — timestamp (used for ordering within a session)
//
// All four public functions are async to match the DB driver. Callers in
// routes/labels.ts have been updated to await them.

export async function addToSession(
  sessionId: string,
  result: LabelAnalysisResult,
): Promise<void> {
  await db.insert(labelResults).values({
    labelId: result.labelId,
    sessionId,
    result,
  });
}

export async function getSession(
  sessionId: string,
): Promise<LabelAnalysisResult[] | undefined> {
  const rows = await db
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
  const rows = await db
    .select()
    .from(labelResults)
    .where(eq(labelResults.labelId, labelId))
    .limit(1);

  if (rows.length === 0) return undefined;
  return rows[0]!.result as LabelAnalysisResult;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const deleted = await db
    .delete(labelResults)
    .where(eq(labelResults.sessionId, sessionId))
    .returning({ labelId: labelResults.labelId });

  return deleted.length > 0;
}

// Warm-up: verify DB connectivity on startup.
export async function initSessionStore(): Promise<void> {
  try {
    await db.select({ labelId: labelResults.labelId }).from(labelResults).limit(1);
    logger.info("Session store: PostgreSQL backend ready");
  } catch (err) {
    logger.error({ err }, "Session store: DB connectivity check failed");
    throw err;
  }
}
