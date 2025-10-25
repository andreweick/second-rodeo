import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const docs = sqliteTable("docs", {
  id: text("id").primaryKey(),                                   // stable id (hash/uuid)
  title: text("title").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export type Doc = typeof docs.$inferSelect;
export type NewDoc = typeof docs.$inferInsert;
