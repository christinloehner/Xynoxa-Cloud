/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { ApiTokensCard } from "@/app/(dashboard)/settings/api-tokens-card";

export default function UserTokensPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-xynoxa-cyan">User</p>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">API Tokens</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Verwalte deine persönlichen API Tokens für Desktop-Client und Integrationen.
        </p>
      </div>

      <ApiTokensCard />
    </div>
  );
}
