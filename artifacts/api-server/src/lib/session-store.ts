import type { LabelAnalysisResult } from "./label-types.js";

const sessionStore = new Map<string, LabelAnalysisResult[]>();

export function addToSession(sessionId: string, result: LabelAnalysisResult): void {
  const existing = sessionStore.get(sessionId) ?? [];
  existing.push(result);
  sessionStore.set(sessionId, existing);
}

export function getSession(sessionId: string): LabelAnalysisResult[] | undefined {
  return sessionStore.get(sessionId);
}

export function getLabelById(labelId: string): LabelAnalysisResult | undefined {
  for (const results of sessionStore.values()) {
    const found = results.find((r) => r.labelId === labelId);
    if (found) return found;
  }
  return undefined;
}

export function deleteSession(sessionId: string): boolean {
  return sessionStore.delete(sessionId);
}
