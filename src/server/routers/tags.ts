/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, protectedProcedure } from "@/server/trpc";
import { tags } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export const tagsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(tags).where(eq(tags.ownerId, ctx.userId!));
    return rows;
  })
});

