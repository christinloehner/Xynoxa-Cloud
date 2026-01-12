/*
 * Copyright (C) 2025 Christin Löhner
 */

import { db } from "@/server/db";

export const dynamic = "force-dynamic";
import { systemSettings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const [setting] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "registration_disabled"))
    .limit(1);

  const registrationEnabled = !setting || setting.value !== "true";

  return <LoginForm registrationEnabled={registrationEnabled} />;
}
