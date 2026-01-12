/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router, publicProcedure } from "@/server/trpc";

export const healthRouter = router({
  ping: publicProcedure.query(() => ({
    ok: true,
    timestamp: new Date().toISOString()
  }))
});
