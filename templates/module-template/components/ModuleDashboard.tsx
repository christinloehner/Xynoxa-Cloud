/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";

export default function ModuleDashboard() {
  const utils = trpc.useUtils();
  const listQuery = trpc.moduleApi.invokeQuery.useQuery({
    moduleId: "module-template",
    procedure: "list",
    input: { limit: 50 }
  });

  const createMutation = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => utils.moduleApi.invokeQuery.invalidate({ moduleId: "module-template", procedure: "list" })
  });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const createItem = () => {
    if (!title.trim()) return;
    createMutation.mutate({
      moduleId: "module-template",
      procedure: "create",
      input: { title: title.trim(), content: content.trim() || undefined }
    });
    setTitle("");
    setContent("");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="text-lg font-semibold">Module Template</div>
        <p className="text-sm text-slate-500">Beispiel-Dashboard fuer ein Modul.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="text-sm font-semibold">Neues Item</div>
        <div className="mt-3 flex flex-col gap-2">
          <input
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titel"
          />
          <textarea
            className="min-h-[90px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Inhalt"
          />
          <button
            className="self-start rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700"
            onClick={createItem}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Speichere..." : "Erstellen"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="text-sm font-semibold">Items</div>
        {listQuery.isLoading && <div className="text-sm text-slate-500">Laedt...</div>}
        {Array.isArray(listQuery.data) && listQuery.data.length === 0 && (
          <div className="text-sm text-slate-500">Keine Items</div>
        )}
        <ul className="mt-3 space-y-2">
          {(listQuery.data as any[] | undefined)?.map((item) => (
            <li key={item.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <div className="font-medium">{item.title}</div>
              {item.content && <div className="text-xs text-slate-500">{item.content}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
