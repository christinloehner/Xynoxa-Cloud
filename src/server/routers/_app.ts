/*
 * Copyright (C) 2025 Christin Löhner
 */

import { router } from "@/server/trpc";
import { authRouter } from "./auth";
import { usersRouter } from "./users";
import { tenantsRouter } from "./tenants";
import { groupsRouter } from "./groups";
import { filesRouter } from "./files";
import { foldersRouter } from "./folders";
import { systemRouter } from "./system";
import { searchRouter } from "./search";
import { calendarRouter } from "./calendar";
import { groupFoldersRouter } from "./group-folders";
import { profileRouter } from "./profile";
import { healthRouter } from "./health";
import { twoFaRouter } from "./2fa";
import { vaultRouter } from "./vault";
import { apiTokensRouter } from "./api-tokens";
import { syncRouter } from "./sync";
import { adminRouter } from "./admin";
import { tagsRouter } from "./tags";
import { maintenanceRouter } from "./maintenance";
import { notificationsRouter } from "./notifications";
import { sharesRouter } from "./shares";
import { modulesRouter } from "./modules";
import { moduleApiRouter } from "./module-api";

export const appRouter = router({
  // Core Routers
  tags: tagsRouter,
  admin: adminRouter,
  modules: modulesRouter,
  moduleApi: moduleApiRouter,
  auth: authRouter,
  users: usersRouter,
  tenants: tenantsRouter,
  groups: groupsRouter,
  files: filesRouter,
  folders: foldersRouter,
  system: systemRouter,
  search: searchRouter,
  calendar: calendarRouter,
  groupFolders: groupFoldersRouter,
  profile: profileRouter,
  health: healthRouter,
  twofa: twoFaRouter,
  vault: vaultRouter,
  apiTokens: apiTokensRouter,
  sync: syncRouter,
  maintenance: maintenanceRouter,
  notifications: notificationsRouter,
  shares: sharesRouter
});

export type AppRouter = typeof appRouter;
