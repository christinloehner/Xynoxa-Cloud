/*
 * Copyright (C) 2025 Christin Löhner
 */

import { Shell } from "@/components/shell";
import type { ReactNode } from "react";
import { getSession } from "@/server/auth/session";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.userId) {
    redirect("/auth/login");
  }
  const userRole = session.userRole;

  return <Shell userRole={userRole}>{children}</Shell>;
}
