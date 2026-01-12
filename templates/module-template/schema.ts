/*
 * Copyright (C) 2025 Christin Löhner
 */

import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const moduleTemplateItems = pgTable("mod_module_template", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
