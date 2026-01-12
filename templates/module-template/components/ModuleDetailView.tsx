/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { trpc } from "@/lib/trpc-client";

export default function ModuleDetailView({ id }: { id: string }) {
  const detail = trpc.moduleApi.invokeQuery.useQuery({
    moduleId: "module-template",
    procedure: "list",
    input: { limit: 100 }
  });

  const item = Array.isArray(detail.data) ? detail.data.find((row: any) => row.id === id) : null;

  if (detail.isLoading) {
    return <div className="text-sm text-slate-500">Laedt...</div>;
  }

  if (!item) {
    return <div className="text-sm text-slate-500">Item nicht gefunden</div>;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-lg font-semibold">{item.title}</div>
      {item.content && <div className="mt-2 text-sm text-slate-500">{item.content}</div>}
    </div>
  );
}
