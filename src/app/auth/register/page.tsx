/*
 * Copyright (C) 2025 Christin Löhner
 */

import { db } from "@/server/db";

export const dynamic = "force-dynamic";
import { systemSettings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { RegisterForm } from "./register-form";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default async function RegisterPage() {
  const [setting] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "registration_disabled"))
    .limit(1);

  const registrationEnabled = !setting || setting.value !== "true";

  if (!registrationEnabled) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
        <div className="rounded-full bg-slate-900 p-4 ring-1 ring-slate-800">
          <ShieldAlert className="h-12 w-12 text-slate-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-100">Registrierung geschlossen</h1>
          <p className="text-slate-400">
            Neue Registrierungen sind derzeit vom Administrator deaktiviert. Bitte wende dich an den Systemverwalter.
          </p>
        </div>
        <Link href="/auth/login" className="text-aurora-mint hover:underline hover:text-aurora-mint/80">
          <span className="text-sm">Zurück zum Login</span>
        </Link>
      </div>
    );
  }

  return <RegisterForm />;
}
