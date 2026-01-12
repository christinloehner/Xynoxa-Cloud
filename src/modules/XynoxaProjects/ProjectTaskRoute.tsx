/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";

export default function ProjectTaskRoute({ taskId }: { taskId: string }) {
  const router = useRouter();
  const taskQuery = trpc.moduleApi.invokeQuery.useQuery({
    moduleId: "projects",
    procedure: "getTask",
    input: { taskId }
  });

  useEffect(() => {
    if (taskQuery.data) {
      const task = taskQuery.data as any;
      router.replace(`/projects/${task.projectId}?task=${taskId}`);
    }
  }, [taskQuery.data, router, taskId]);

  if (taskQuery.isLoading) {
    return <div className="text-sm text-slate-500">Task wird geladen...</div>;
  }

  if (taskQuery.error) {
    return <div className="text-sm text-rose-500">Task nicht gefunden oder kein Zugriff.</div>;
  }

  return <div className="text-sm text-slate-500">Weiterleitung...</div>;
}
