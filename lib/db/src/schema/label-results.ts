import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const labelResults = pgTable(
  "label_results",
  {
    labelId: text("label_id").primaryKey(),
    sessionId: text("session_id").notNull(),
    result: jsonb("result").notNull(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("label_results_session_id_idx").on(t.sessionId)],
);

export type LabelResultRow = typeof labelResults.$inferSelect;
