/*
 * Copyright (C) 2025 Christin Löhner
 */

import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://xynoxa:xynoxa@localhost:5432/xynoxa"
  }
});
