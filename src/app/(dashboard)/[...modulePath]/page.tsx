/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Generic Module Route
 *
 * Rendert Modul-Routen dynamisch ohne Core-Code pro Modul.
 */

import { renderModuleRoute } from "@/lib/module-route-resolver";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  modulePath: string[];
};

export default async function ModuleRoutePage({ params, searchParams }: { params: RouteParams; searchParams: Record<string, string | string[] | undefined> }) {
  const path = `/${params.modulePath.join("/")}`;
  return renderModuleRoute(path, searchParams);
}
