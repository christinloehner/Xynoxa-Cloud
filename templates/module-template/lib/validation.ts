/*
 * Copyright (C) 2025 Christin Löhner
 */

import { z } from "zod";

export const moduleItemSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().optional()
});

export type ModuleItemInput = z.infer<typeof moduleItemSchema>;
