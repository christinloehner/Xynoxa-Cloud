/*
 * Copyright (C) 2025 Christin Löhner
 */

import { getSession } from "@/server/auth/session";
import { logDebug, logError } from "@/server/services/logger";
import { ModuleService } from "@/server/services/module-service";
import { ROUTE_MODULES } from "@/lib/module-registry.route";
import { redirect } from "next/navigation";

const roleAllows = (userRole: string | undefined, required?: "admin" | "owner" | "user") => {
  if (!required) return true;
  if (!userRole) return false;
  if (userRole === "owner") return true;
  if (userRole === "admin" && (required === "admin" || required === "user")) return true;
  if (userRole === "user" && required === "user") return true;
  return required === userRole;
};

function matchRoute(pattern: string, path: string) {
  const patternParts = pattern.replace(/^\//, "").split("/");
  const pathParts = path.replace(/^\//, "").split("/");
  const params: Record<string, string | string[]> = {};

  let i = 0;
  let j = 0;
  for (; i < patternParts.length; i += 1, j += 1) {
    const part = patternParts[i];
    if (part.startsWith("[...") && part.endsWith("]")) {
      const key = part.slice(4, -1);
      params[key] = pathParts.slice(j);
      return { match: true, params };
    }
    if (part.startsWith("[") && part.endsWith("]")) {
      if (j >= pathParts.length) return { match: false, params: {} };
      const key = part.slice(1, -1);
      params[key] = pathParts[j];
      continue;
    }
    if (part !== pathParts[j]) return { match: false, params: {} };
  }

  if (j !== pathParts.length) return { match: false, params: {} };
  return { match: true, params };
}

const isNextRedirect = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: string }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
};

const isNextNotFound = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: string }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_NOT_FOUND");
};

function renderModuleError(title: string, details: string, path?: string) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
      <div className="text-base font-semibold">{title}</div>
      {path ? <div className="mt-2">Pfad: {path}</div> : null}
      <div className="mt-2 opacity-80">{details}</div>
    </div>
  );
}

export async function renderModuleRoute(
  path: string,
  searchParams: Record<string, string | string[] | undefined>,
  params: Record<string, string | string[]> = {}
) {
  try {
    const session = await getSession();
    logDebug("[ModuleRoute] Incoming request", { path, userId: session?.userId, role: session?.userRole });
    if (!session?.userId) {
      redirect("/auth/login");
    }

    const activeModuleIds = await ModuleService.getActiveModules();
    const modules = ROUTE_MODULES.filter((m) => activeModuleIds.includes(m.metadata.id));
    logDebug("[ModuleRoute] Loaded modules", { path, count: modules.length, moduleIds: modules.map((m) => m.metadata.id) });

    for (const module of modules) {
      const routes = module.routes ?? [];
      for (const route of routes) {
        const { match, params: matchedParams } = matchRoute(route.path, path);
        if (!match) continue;

        if (!roleAllows(session.userRole, route.requiredRole)) {
          logDebug("[ModuleRoute] Role denied", { path, moduleId: module.metadata.id, requiredRole: route.requiredRole, userRole: session.userRole });
          redirect("/dashboard");
        }

        if (!route.component) {
          logError("[ModuleRoute] Missing component for route", undefined, { path, moduleId: module.metadata.id, route: route.path });
          return renderModuleError("Modul-Route ist unvollständig", "Kein Component registriert.", path);
        }

        const Component = route.component;
        const mergedParams = { ...params, ...matchedParams };
        const props = route.getProps ? route.getProps(mergedParams, searchParams) : {};
        logDebug("[ModuleRoute] Route matched", { path, moduleId: module.metadata.id, route: route.path });
        return <Component {...props} />;
      }
    }

    logDebug("[ModuleRoute] No route matched, redirecting", { path });
    redirect("/dashboard");
  } catch (error) {
    if (isNextRedirect(error) || isNextNotFound(error)) throw error;
    console.error("[ModuleRoute] Failed to resolve module route", { path, error });
    logError("[ModuleRoute] Failed to resolve module route", error, { path });
    return renderModuleError("Modul konnte nicht geladen werden", String(error), path);
  }
}

export async function renderModulePage(
  moduleId: string,
  routePath: string,
  params: Record<string, string | string[]>,
  searchParams: Record<string, string | string[] | undefined>
) {
  try {
    const session = await getSession();
    logDebug("[ModulePage] Incoming request", { moduleId, routePath, userId: session?.userId, role: session?.userRole });
    if (!session?.userId) {
      redirect("/auth/login");
    }

    const activeModuleIds = await ModuleService.getActiveModules();
    if (!activeModuleIds.includes(moduleId)) {
      logDebug("[ModulePage] Module inactive", { moduleId, routePath });
      redirect("/dashboard");
    }

    const module = ROUTE_MODULES.find((m) => m.metadata.id === moduleId);
    if (!module) {
      logError("[ModulePage] Module not found in registry", undefined, { moduleId, routePath });
      return renderModuleError("Modul nicht gefunden", `Kein registriertes Modul mit ID "${moduleId}".`, routePath);
    }

    const route = (module.routes ?? []).find((r) => r.path === routePath);
    if (!route) {
      logError("[ModulePage] Route not found in module", undefined, { moduleId, routePath });
      return renderModuleError("Route nicht gefunden", `Kein Route-Definition für "${routePath}".`, routePath);
    }

    if (!roleAllows(session.userRole, route.requiredRole)) {
      logDebug("[ModulePage] Role denied", { moduleId, routePath, requiredRole: route.requiredRole, userRole: session.userRole });
      redirect("/dashboard");
    }

    if (!route.component) {
      logError("[ModulePage] Missing component for route", undefined, { moduleId, routePath });
      return renderModuleError("Modul-Route ist unvollständig", "Kein Component registriert.", routePath);
    }

    const props = route.getProps ? route.getProps(params, searchParams) : {};
    const Component = route.component;
    return <Component {...props} />;
  } catch (error) {
    if (isNextRedirect(error) || isNextNotFound(error)) throw error;
    console.error("[ModulePage] Failed to resolve module page", { moduleId, routePath, error });
    logError("[ModulePage] Failed to resolve module page", error, { moduleId, routePath });
    return renderModuleError("Modul konnte nicht geladen werden", String(error), routePath);
  }
}
