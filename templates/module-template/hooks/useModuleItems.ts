/*
 * Copyright (C) 2025 Christin Löhner
 */

"use client";

import { trpc } from "@/lib/trpc-client";

export function useModuleItems() {
  const utils = trpc.useUtils();
  const listInput = { moduleId: "module-template", procedure: "list", input: { limit: 50 } } as const;
  const listQuery = trpc.moduleApi.invokeQuery.useQuery(listInput);

  const createMutation = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => utils.moduleApi.invokeQuery.invalidate(listInput)
  });

  const deleteMutation = trpc.moduleApi.invoke.useMutation({
    onSuccess: () => utils.moduleApi.invokeQuery.invalidate(listInput)
  });

  return {
    items: (listQuery.data as any[]) ?? [],
    isLoading: listQuery.isLoading,
    create: (input: { title: string; content?: string }) =>
      createMutation.mutate({ moduleId: "module-template", procedure: "create", input }),
    remove: (id: string) =>
      deleteMutation.mutate({ moduleId: "module-template", procedure: "delete", input: { id } })
  };
}
